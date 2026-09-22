<?php

namespace App\Http\Controllers;

use App\Support\ApiError;
use App\Support\Audit;
use App\Support\Auth;
use App\Support\Db;
use App\Support\Http;
use App\Support\RateLimit;
use App\Support\Validator;

final class SubscriptionsController
{
    public static function settings(): void
    {
        Auth::require();
        $row = Db::one('SELECT monthly_amount, start_period FROM subscription_settings WHERE id = 1');
        Http::json([
            'monthly_amount' => (float) ($row['monthly_amount'] ?? 0),
            'start_period'   => $row['start_period'] ?? date('Y-m-01'),
        ]);
    }

    public static function updateSettings(): void
    {
        $m = Auth::requireManager();
        $b = Http::body();
        $amount = Validator::moneyString($b, 'monthly_amount');
        $start  = Validator::str($b, 'start_period', false, 10);
        if ($start !== null && !preg_match('/^\d{4}-\d{2}-01$/', $start)) {
            throw new ApiError(422, 'validation_failed', 'start_period must be the first day of a month (YYYY-MM-01)', ['start_period' => 'format']);
        }

        $before = Db::one('SELECT * FROM subscription_settings WHERE id = 1');
        if ($start !== null) {
            Db::exec('UPDATE subscription_settings SET monthly_amount = ?, start_period = ? WHERE id = 1', [$amount, $start]);
        } else {
            Db::exec('UPDATE subscription_settings SET monthly_amount = ? WHERE id = 1', [$amount]);
        }
        Audit::log((int) $m['id'], 'subscription_settings_update', 'subscription_settings', '1', $before, [
            'monthly_amount' => (float) $amount,
            'start_period'   => $start,
        ]);
        Http::json(['ok' => true]);
    }

    /** @return string[] list of 'Y-m-01' periods, inclusive, ascending */
    private static function monthsBetween(string $start, string $end): array
    {
        $out  = [];
        $cur  = new \DateTimeImmutable($start);
        $stop = new \DateTimeImmutable($end);
        // Safety cap: never enumerate more than 10 years of months.
        $guard = 0;
        while ($cur <= $stop && $guard < 120) {
            $out[] = $cur->format('Y-m-01');
            $cur = $cur->modify('+1 month');
            $guard++;
        }
        return $out;
    }

    private static function currentSettings(): array
    {
        $row = Db::one('SELECT monthly_amount, start_period FROM subscription_settings WHERE id = 1');
        return [
            'monthly_amount' => (float) ($row['monthly_amount'] ?? 0),
            'start_period'   => $row['start_period'] ?? date('Y-m-01'),
        ];
    }

    public static function board(): void
    {
        Auth::requireManager();
        $settings      = self::currentSettings();
        $monthlyAmount = $settings['monthly_amount'];
        $monthsCount   = count(self::monthsBetween($settings['start_period'], date('Y-m-01')));

        $rows = Db::all(
            'SELECT a.id, a.number, a.floor,
                    (SELECT full_name FROM users u WHERE u.apartment_id = a.id AND u.person_rank = "primary" AND u.status <> "archived" LIMIT 1) AS primary_name,
                    COALESCE((SELECT SUM(sp.amount) FROM subscription_payments sp WHERE sp.apartment_id = a.id), 0) AS paid_total
             FROM apartments a ORDER BY a.floor, a.number'
        );

        Http::json(array_map(static function (array $r) use ($monthlyAmount, $monthsCount): array {
            $required = round($monthlyAmount * $monthsCount, 2);
            $paid     = round((float) $r['paid_total'], 2);
            return [
                'id'             => (int) $r['id'],
                'number'         => $r['number'],
                'floor'          => (int) $r['floor'],
                'primary_name'   => $r['primary_name'],
                'months_elapsed' => $monthsCount,
                'required_total' => $required,
                'paid_total'     => $paid,
                'balance'        => round($required - $paid, 2),
            ];
        }, $rows));
    }

    public static function mine(): void
    {
        $u             = Auth::require();
        $aptId         = (int) ($u['apartment_id'] ?? 0);
        $settings      = self::currentSettings();
        $monthlyAmount = $settings['monthly_amount'];

        if (!$aptId) {
            Http::json(['settings' => $settings, 'months' => [], 'required_total' => 0, 'paid_total' => 0, 'balance' => 0]);
            return;
        }

        $months  = self::monthsBetween($settings['start_period'], date('Y-m-01'));
        $paidRows = Db::all('SELECT period, SUM(amount) AS paid FROM subscription_payments WHERE apartment_id = ? GROUP BY period', [$aptId]);
        $paidMap = [];
        foreach ($paidRows as $row) $paidMap[$row['period']] = (float) $row['paid'];

        $out = [];
        $requiredTotal = 0.0;
        $paidTotal     = 0.0;
        foreach ($months as $period) {
            $paid = round($paidMap[$period] ?? 0, 2);
            $out[] = [
                'period'   => $period,
                'required' => $monthlyAmount,
                'paid'     => $paid,
                'status'   => $paid >= $monthlyAmount && $monthlyAmount > 0 ? 'paid' : 'unpaid',
            ];
            $requiredTotal += $monthlyAmount;
            $paidTotal     += $paid;
        }

        Http::json([
            'settings'       => $settings,
            'months'         => $out,
            'required_total' => round($requiredTotal, 2),
            'paid_total'     => round($paidTotal, 2),
            'balance'        => round($requiredTotal - $paidTotal, 2),
        ]);
    }

    public static function index(): void
    {
        Auth::require();
        $apartmentId = isset($_GET['apartment_id']) ? (int) $_GET['apartment_id'] : null;

        $sql = 'SELECT sp.*, a.number AS apartment_number, u.full_name AS recorded_by_name
                FROM subscription_payments sp
                JOIN apartments a ON a.id = sp.apartment_id
                LEFT JOIN users u ON u.id = sp.recorded_by
                WHERE 1=1';
        $args = [];
        if ($apartmentId) {
            $sql .= ' AND sp.apartment_id = ?';
            $args[] = $apartmentId;
        }
        $sql .= ' ORDER BY sp.period DESC, sp.paid_at DESC LIMIT 500';

        Http::json(array_map([self::class, 'shape'], Db::all($sql, $args)));
    }

    public static function store(): void
    {
        $m = Auth::requireManager();
        RateLimit::hit('subscription_payment_create', 60, 60, (string) $m['id']);

        $b           = Http::body();
        $apartmentId = Validator::int($b, 'apartment_id');
        $period      = Validator::str($b, 'period', true, 10);
        $amount      = Validator::moneyString($b, 'amount');
        $method      = Validator::enum($b, 'method', ['cash', 'transfer', 'online'], false, 'cash');
        $notes       = Validator::str($b, 'notes', false, 255);
        $idem        = Validator::str($b, 'idempotency_key', true, 80);

        if (!preg_match('/^\d{4}-\d{2}-01$/', (string) $period)) {
            throw new ApiError(422, 'validation_failed', 'period must be the first day of a month (YYYY-MM-01)', ['period' => 'format']);
        }
        if ((float) $amount <= 0) {
            throw new ApiError(422, 'validation_failed', 'Amount must be positive', ['amount' => 'positive']);
        }

        $pdo = Db::conn();
        $pdo->beginTransaction();
        try {
            if (Db::one('SELECT id FROM subscription_payments WHERE idempotency_key = ?', [$idem])) {
                $pdo->rollBack();
                throw new ApiError(409, 'duplicate_payment', 'This payment was already recorded');
            }
            if (!Db::one('SELECT id FROM apartments WHERE id = ?', [$apartmentId])) {
                throw new ApiError(404, 'not_found', 'Apartment not found');
            }

            $paymentId = Db::insert(
                'INSERT INTO subscription_payments (apartment_id, period, amount, method, paid_at, recorded_by, notes, idempotency_key)
                 VALUES (?,?,?,?,NOW(),?,?,?)',
                [$apartmentId, $period, $amount, $method, $m['id'], $notes, $idem]
            );

            NotificationsController::notifyApartment(
                $apartmentId,
                'payment',
                'تم تسجيل اشتراك شهري',
                'Cotisation mensuelle enregistrée',
                'تم تسجيل دفعة اشتراك عن شهر ' . $period,
                'Paiement de cotisation enregistré pour ' . $period,
                '/subscriptions'
            );

            Audit::log((int) $m['id'], 'subscription_payment_create', 'subscription_payment', (string) $paymentId, null, [
                'apartment_id' => $apartmentId,
                'period'       => $period,
                'amount'       => (float) $amount,
            ]);

            $pdo->commit();
            Http::json(['id' => $paymentId], 201);
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $e;
        }
    }

    public static function reverse(array $p): void
    {
        $m  = Auth::requireManager();
        RateLimit::hit('subscription_payment_reverse', 20, 300, (string) $m['id']);

        $id = (int) $p['id'];
        $original = Db::one('SELECT * FROM subscription_payments WHERE id = ?', [$id]);
        if (!$original) throw new ApiError(404, 'not_found', 'Payment not found');
        if ($original['reverses_payment_id'] !== null) {
            throw new ApiError(409, 'already_reversal', 'Cannot reverse a reversal');
        }
        if (Db::one('SELECT id FROM subscription_payments WHERE reverses_payment_id = ?', [$id])) {
            throw new ApiError(409, 'already_reversed', 'Payment already reversed');
        }

        $reason = Validator::str(Http::body(), 'reason', true, 255);

        $pdo = Db::conn();
        $pdo->beginTransaction();
        try {
            $newId = Db::insert(
                'INSERT INTO subscription_payments (apartment_id, period, amount, method, paid_at, recorded_by, notes, idempotency_key, reverses_payment_id)
                 VALUES (?,?,?,?,NOW(),?,?,?,?)',
                [
                    $original['apartment_id'],
                    $original['period'],
                    (string) (-1 * (float) $original['amount']),
                    $original['method'],
                    $m['id'],
                    $reason,
                    'rev-' . $id . '-' . bin2hex(random_bytes(8)),
                    $id,
                ]
            );
            Audit::log((int) $m['id'], 'subscription_payment_reverse', 'subscription_payment', (string) $id, $original, [
                'reversal_id' => $newId,
                'reason'      => $reason,
            ]);
            $pdo->commit();
            Http::json(['id' => $newId], 201);
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $e;
        }
    }

    private static function mayReadNotes(array $r): bool
    {
        $u = Auth::user();
        if ($u === null) return false;
        if (Auth::isManager($u)) return true;
        return (int) ($u['apartment_id'] ?? 0) === (int) $r['apartment_id'];
    }

    public static function shape(array $r): array
    {
        return [
            'id'               => (int) $r['id'],
            'apartment_id'     => (int) $r['apartment_id'],
            'apartment_number' => $r['apartment_number'] ?? null,
            'period'           => $r['period'],
            'amount'           => (float) $r['amount'],
            'method'           => $r['method'],
            'paid_at'          => $r['paid_at'],
            'notes'            => self::mayReadNotes($r) ? $r['notes'] : null,
            'recorded_by_name' => $r['recorded_by_name'] ?? null,
            'is_reversal'      => $r['reverses_payment_id'] !== null,
        ];
    }
}
