<?php
namespace App\Http\Controllers;

use App\Support\{ApiError, Audit, Auth, Db, Http, RateLimit, Validator};

final class PaymentsController
{
    /**
     * DELIBERATE TRANSPARENCY POLICY — do not "fix" this as an access-control bug.
     * Every signed-in resident may see all apartments' payment amounts, dates and
     * receipt numbers; the building's finances are public to its residents, exactly
     * as documented in ApartmentsController. Privacy still applies to free-text
     * `notes`, which stay visible only to the owning apartment and the manager.
     */
    public static function index(): void
    {
        Auth::require();

        $projectId   = isset($_GET['project_id']) ? (int) $_GET['project_id'] : null;
        $apartmentId = isset($_GET['apartment_id']) ? (int) $_GET['apartment_id'] : null;
        $sql = 'SELECT p.*, a.number AS apartment_number, pr.name_ar AS project_name_ar, pr.name_fr AS project_name_fr,
                       r.receipt_no, u.full_name AS recorded_by_name
                FROM payments p
                JOIN apartments a ON a.id = p.apartment_id
                JOIN projects pr ON pr.id = p.project_id
                LEFT JOIN receipts r ON r.payment_id = p.id
                LEFT JOIN users u ON u.id = p.recorded_by WHERE 1=1';
        $args = [];
        if ($projectId) { $sql .= ' AND p.project_id = ?'; $args[] = $projectId; }
        if ($apartmentId) { $sql .= ' AND p.apartment_id = ?'; $args[] = $apartmentId; }
        $sql .= ' ORDER BY p.paid_at DESC LIMIT 500';
        Http::json(array_map([self::class, 'shape'], Db::all($sql, $args)));
    }

    /** Manager-only, transactional, idempotent, audited. */
    public static function store(): void
    {
        $m = Auth::requireManager();
        RateLimit::hit('payment_create', 60, 60, (string) $m['id']);
        $b = Http::body();
        $projectId   = Validator::int($b, 'project_id');
        $apartmentId = Validator::int($b, 'apartment_id');
        $amount      = Validator::moneyString($b, 'amount');
        $method      = Validator::enum($b, 'method', ['cash', 'transfer', 'online'], false, 'cash');
        $notes       = Validator::str($b, 'notes', false, 255);
        $paidAt      = Validator::str($b, 'paid_at', false, 25) ?? date('Y-m-d H:i:s');
        $idem        = Validator::str($b, 'idempotency_key', true, 64);
        if ((float) $amount <= 0) throw new ApiError(422, 'validation_failed', 'Amount must be positive', ['amount' => 'positive']);
        // The date is stored, never trusted as free text.
        if (!preg_match('/^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?$/', $paidAt)) {
            throw new ApiError(422, 'validation_failed', 'Invalid payment date', ['paid_at' => 'format']);
        }
        $ts = strtotime($paidAt);
        if ($ts === false || $ts > time() + 86400) {
            throw new ApiError(422, 'validation_failed', 'Payment date cannot be in the future', ['paid_at' => 'range']);
        }
        $paidAt = date('Y-m-d H:i:s', $ts);

        $pdo = Db::conn();
        $pdo->beginTransaction();
        try {
            $existing = Db::one('SELECT id FROM payments WHERE idempotency_key = ?', [$idem]);
            if ($existing) {
                $pdo->rollBack();
                throw new ApiError(409, 'duplicate_payment', 'This payment was already recorded');
            }
            if (!Db::one('SELECT id FROM projects WHERE id = ?', [$projectId])) {
                throw new ApiError(404, 'not_found', 'Project not found');
            }
            if (!Db::one('SELECT id FROM apartments WHERE id = ?', [$apartmentId])) {
                throw new ApiError(404, 'not_found', 'Apartment not found');
            }
            $paymentId = Db::insert(
                'INSERT INTO payments (project_id, apartment_id, amount, method, paid_at, recorded_by, notes, idempotency_key)
                 VALUES (?,?,?,?,?,?,?,?)',
                [$projectId, $apartmentId, $amount, $method, $paidAt, $m['id'], $notes, $idem]
            );
            // Lock the counter row so receipt numbers stay unique and sequential.
            $year = date('Y', strtotime($paidAt));
            $name = 'receipt_' . $year;
            Db::exec('INSERT IGNORE INTO counters (name, value) VALUES (?, 0)', [$name]);
            $cur = Db::one('SELECT value FROM counters WHERE name = ? FOR UPDATE', [$name]);
            $next = (int) $cur['value'] + 1;
            Db::exec('UPDATE counters SET value = ? WHERE name = ?', [$next, $name]);
            $receiptNo = sprintf('B29-%s-%05d', $year, $next);
            Db::exec('INSERT INTO receipts (payment_id, receipt_no) VALUES (?,?)', [$paymentId, $receiptNo]);

            NotificationsController::notifyApartment(
                $apartmentId,
                'payment',
                'تم تسجيل دفعة',
                'Paiement enregistré',
                'وصل رقم ' . $receiptNo,
                'Reçu n° ' . $receiptNo,
                '/receipts/' . $receiptNo
            );
            Audit::log((int) $m['id'], 'payment_create', 'payment', (string) $paymentId, null, [
                'project_id' => $projectId, 'apartment_id' => $apartmentId, 'amount' => (float) $amount, 'receipt_no' => $receiptNo,
            ]);
            $pdo->commit();
            Http::json(['id' => $paymentId, 'receipt_no' => $receiptNo], 201);
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $e;
        }
    }

    /** Confirmed payments are never deleted — a reversal record is written instead. */
    public static function reverse(array $p): void
    {
        $m  = Auth::requireManager();
        RateLimit::hit('payment_reverse', 20, 300, (string) $m['id']);
        $id = (int) $p['id'];
        $original = Db::one('SELECT * FROM payments WHERE id = ?', [$id]);
        if (!$original) throw new ApiError(404, 'not_found', 'Payment not found');
        if ($original['reverses_payment_id'] !== null) throw new ApiError(409, 'already_reversal', 'Cannot reverse a reversal');
        if (Db::one('SELECT id FROM payments WHERE reverses_payment_id = ?', [$id])) {
            throw new ApiError(409, 'already_reversed', 'Payment already reversed');
        }
        $reason = Validator::str(Http::body(), 'reason', true, 255);
        $pdo = Db::conn();
        $pdo->beginTransaction();
        try {
            $newId = Db::insert(
                'INSERT INTO payments (project_id, apartment_id, amount, method, paid_at, recorded_by, notes, idempotency_key, reverses_payment_id)
                 VALUES (?,?,?,?,NOW(),?,?,?,?)',
                [$original['project_id'], $original['apartment_id'], (string) (-1 * (float) $original['amount']), $original['method'], $m['id'], $reason, 'rev-' . $id . '-' . bin2hex(random_bytes(8)), $id]
            );
            Audit::log((int) $m['id'], 'payment_reverse', 'payment', (string) $id, $original, ['reversal_id' => $newId, 'reason' => $reason]);
            $pdo->commit();
            Http::json(['id' => $newId], 201);
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $e;
        }
    }

    public static function mine(): void
    {
        $u = Auth::require();
        $aptId = (int) ($u['apartment_id'] ?? 0);
        if (!$aptId) { Http::json([]); return; }
        $rows = Db::all(
            'SELECT p.*, a.number AS apartment_number, pr.name_ar AS project_name_ar, pr.name_fr AS project_name_fr,
                    r.receipt_no, u.full_name AS recorded_by_name
             FROM payments p JOIN apartments a ON a.id = p.apartment_id JOIN projects pr ON pr.id = p.project_id
             LEFT JOIN receipts r ON r.payment_id = p.id LEFT JOIN users u ON u.id = p.recorded_by
             WHERE p.apartment_id = ? ORDER BY p.paid_at DESC',
            [$aptId]
        );
        Http::json(array_map([self::class, 'shape'], $rows));
    }

    public static function receipt(array $p): void
    {
        $u  = Auth::require();
        $no = $p['no'];
        $row = Db::one(
            'SELECT p.*, r.receipt_no, r.issued_at, a.number AS apartment_number, pr.name_ar AS project_name_ar, pr.name_fr AS project_name_fr,
                    u.full_name AS recorded_by_name,
                    (SELECT full_name FROM users x WHERE x.apartment_id = p.apartment_id AND x.person_rank = "primary" LIMIT 1) AS resident_name
             FROM receipts r JOIN payments p ON p.id = r.payment_id
             JOIN apartments a ON a.id = p.apartment_id JOIN projects pr ON pr.id = p.project_id
             LEFT JOIN users u ON u.id = p.recorded_by WHERE r.receipt_no = ?',
            [$no]
        );
        if (!$row) throw new ApiError(404, 'not_found', 'Receipt not found');
        Auth::requireApartment($u, (int) $row['apartment_id']);
        $settings = Db::one('SELECT * FROM building_settings WHERE id = 1');
        Http::json(['receipt' => self::shape($row) + ['issued_at' => $row['issued_at'], 'resident_name' => $row['resident_name']], 'building' => $settings]);
    }

    /** Payment amounts are public (transparency); free-text notes are not. */
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
            'project_id'       => (int) $r['project_id'],
            'apartment_id'     => (int) $r['apartment_id'],
            'apartment_number' => $r['apartment_number'] ?? null,
            'project_name_ar'  => $r['project_name_ar'] ?? null,
            'project_name_fr'  => $r['project_name_fr'] ?? null,
            'amount'           => (float) $r['amount'],
            'method'           => $r['method'],
            'paid_at'          => $r['paid_at'],
            'notes'            => self::mayReadNotes($r) ? $r['notes'] : null,
            'receipt_no'       => $r['receipt_no'] ?? null,
            'recorded_by_name' => $r['recorded_by_name'] ?? null,
            'is_reversal'      => $r['reverses_payment_id'] !== null,
        ];
    }
}
