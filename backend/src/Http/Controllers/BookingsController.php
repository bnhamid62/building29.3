<?php
namespace App\Http\Controllers;

use App\Support\{ApiError, Audit, Auth, Db, Http, Validator};

/**
 * Shared-facility booking.
 *
 * The database is the source of truth: overlap detection runs inside a
 * transaction that locks the facility row, so two simultaneous requests can
 * never both be accepted for the same slot.
 */
final class BookingsController
{
    private static function facility(array $r): array
    {
        return [
            'id'                => (int) $r['id'],
            'name_ar'           => $r['name_ar'],
            'name_fr'           => $r['name_fr'],
            'description_ar'    => $r['description_ar'],
            'description_fr'    => $r['description_fr'],
            'requires_approval' => (bool) $r['requires_approval'],
            'open_from'         => substr((string) $r['open_from'], 0, 5),
            'open_to'           => substr((string) $r['open_to'], 0, 5),
            'max_hours'         => (int) $r['max_hours'],
            'active'            => (bool) $r['active'],
        ];
    }

    private static function booking(array $r): array
    {
        return [
            'id'               => (int) $r['id'],
            'facility_id'      => (int) $r['facility_id'],
            'facility_name_ar' => $r['name_ar'] ?? null,
            'facility_name_fr' => $r['name_fr'] ?? null,
            'apartment_id'     => (int) $r['apartment_id'],
            'apartment_number' => $r['apartment_number'] ?? null,
            'starts_at'        => $r['starts_at'],
            'ends_at'          => $r['ends_at'],
            'status'           => $r['status'],
            'purpose'          => $r['purpose'],
            'decision_note'    => $r['decision_note'],
            'created_at'       => $r['created_at'],
        ];
    }

    /** GET /facilities */
    public static function facilities(): void
    {
        $u = Auth::require();
        $sql = 'SELECT * FROM facilities' . (Auth::isManager($u) ? '' : ' WHERE active = 1') . ' ORDER BY name_fr';
        Http::json(array_map(self::facility(...), Db::all($sql)));
    }

    /** POST /facilities — manager only. */
    public static function storeFacility(): void
    {
        $m    = Auth::requireManager();
        $body = Http::body();
        $id = Db::insert(
            'INSERT INTO facilities (name_ar, name_fr, description_ar, description_fr, requires_approval, open_from, open_to, max_hours, active)
             VALUES (?,?,?,?,?,?,?,?,?)',
            [
                Validator::str($body, 'name_ar', true, 190),
                Validator::str($body, 'name_fr', true, 190),
                Validator::str($body, 'description_ar', false, 255),
                Validator::str($body, 'description_fr', false, 255),
                array_key_exists('requires_approval', $body) ? (!empty($body['requires_approval']) ? 1 : 0) : 1,
                self::time($body['open_from'] ?? '08:00'),
                self::time($body['open_to'] ?? '22:00'),
                max(1, min(24, (int) ($body['max_hours'] ?? 4))),
                array_key_exists('active', $body) ? (!empty($body['active']) ? 1 : 0) : 1,
            ]
        );
        Audit::log((int) $m['id'], 'facility.create', 'facility', (string) $id, null, ['name_fr' => $body['name_fr'] ?? null]);
        Http::json(['id' => $id], 201);
    }

    /** PATCH /facilities/{id} — manager only. */
    public static function updateFacility(array $p): void
    {
        $m   = Auth::requireManager();
        $id  = (int) $p['id'];
        if (!Db::one('SELECT id FROM facilities WHERE id = ?', [$id])) throw new ApiError(404, 'not_found', 'Facility not found');
        $body = Http::body();
        $fields = []; $args = [];
        foreach (['name_ar', 'name_fr', 'description_ar', 'description_fr'] as $key) {
            if (array_key_exists($key, $body)) { $fields[] = "$key = ?"; $args[] = Validator::str($body, $key, false, 255); }
        }
        foreach (['open_from', 'open_to'] as $key) {
            if (!empty($body[$key])) { $fields[] = "$key = ?"; $args[] = self::time($body[$key]); }
        }
        if (isset($body['max_hours']))         { $fields[] = 'max_hours = ?';         $args[] = max(1, min(24, (int) $body['max_hours'])); }
        if (isset($body['requires_approval'])) { $fields[] = 'requires_approval = ?'; $args[] = !empty($body['requires_approval']) ? 1 : 0; }
        if (isset($body['active']))            { $fields[] = 'active = ?';            $args[] = !empty($body['active']) ? 1 : 0; }
        if (!$fields) throw new ApiError(422, 'validation_failed', 'Nothing to update');
        $args[] = $id;
        Db::exec('UPDATE facilities SET ' . implode(', ', $fields) . ' WHERE id = ?', $args);
        Audit::log((int) $m['id'], 'facility.update', 'facility', (string) $id, null, null);
        Http::json(['ok' => true]);
    }

    private static function time(mixed $v): string
    {
        $s = is_string($v) ? trim($v) : '';
        if (!preg_match('/^([01]\d|2[0-3]):([0-5]\d)$/', $s)) {
            throw new ApiError(422, 'validation_failed', 'Invalid time', ['time' => 'format']);
        }
        return $s . ':00';
    }

    /** GET /bookings — residents see their apartment only. */
    public static function index(): void
    {
        $u = Auth::require();
        $where = []; $args = [];
        if (!Auth::isManager($u)) { $where[] = 'b.apartment_id = ?'; $args[] = $u['apartment_id']; }
        if (!empty($_GET['facility_id'])) { $where[] = 'b.facility_id = ?'; $args[] = (int) $_GET['facility_id']; }
        if (!empty($_GET['status']))      { $where[] = 'b.status = ?';      $args[] = (string) $_GET['status']; }
        $sql = 'SELECT b.*, f.name_ar, f.name_fr, a.number AS apartment_number
                FROM facility_bookings b JOIN facilities f ON f.id = b.facility_id JOIN apartments a ON a.id = b.apartment_id'
             . ($where ? ' WHERE ' . implode(' AND ', $where) : '')
             . ' ORDER BY b.starts_at DESC LIMIT 300';
        Http::json(array_map(self::booking(...), Db::all($sql, $args)));
    }

    /** GET /facilities/{id}/availability?from=&to= — busy slots only, no PII for residents. */
    public static function availability(array $p): void
    {
        $u    = Auth::require();
        $id   = (int) $p['id'];
        $from = substr((string) ($_GET['from'] ?? date('Y-m-d')), 0, 10) . ' 00:00:00';
        $to   = substr((string) ($_GET['to'] ?? date('Y-m-d', strtotime('+14 days'))), 0, 10) . ' 23:59:59';
        $rows = Db::all(
            'SELECT b.id, b.starts_at, b.ends_at, b.status, b.apartment_id, a.number AS apartment_number
             FROM facility_bookings b JOIN apartments a ON a.id = b.apartment_id
             WHERE b.facility_id = ? AND b.status IN ("pending","approved") AND b.ends_at >= ? AND b.starts_at <= ?
             ORDER BY b.starts_at',
            [$id, $from, $to]
        );
        $manager = Auth::isManager($u);
        Http::json(array_map(static fn ($r) => [
            'id'        => (int) $r['id'],
            'starts_at' => $r['starts_at'],
            'ends_at'   => $r['ends_at'],
            'status'    => $r['status'],
            'mine'      => (int) $r['apartment_id'] === (int) ($u['apartment_id'] ?? -1),
            'apartment_number' => $manager ? $r['apartment_number'] : null,
        ], $rows));
    }

    /** POST /bookings — resident request, overlap-safe. */
    public static function store(): void
    {
        $u    = Auth::require();
        $body = Http::body();
        $facilityId = Validator::int($body, 'facility_id', true);
        $startsAt   = strtotime((string) ($body['starts_at'] ?? ''));
        $endsAt     = strtotime((string) ($body['ends_at'] ?? ''));
        if (!$startsAt || !$endsAt) throw new ApiError(422, 'validation_failed', 'Invalid dates', ['starts_at' => 'datetime']);
        if ($endsAt <= $startsAt)   throw new ApiError(422, 'validation_failed', 'End must be after start', ['ends_at' => 'after_start']);
        if ($startsAt < time() - 300) throw new ApiError(422, 'validation_failed', 'Cannot book in the past', ['starts_at' => 'past']);

        $apartmentId = Auth::isManager($u)
            ? (Validator::int($body, 'apartment_id', false) ?? ($u['apartment_id'] !== null ? (int) $u['apartment_id'] : null))
            : (int) $u['apartment_id'];
        if (!$apartmentId) throw new ApiError(422, 'validation_failed', 'Apartment required', ['apartment_id' => 'required']);

        $start = date('Y-m-d H:i:s', $startsAt);
        $end   = date('Y-m-d H:i:s', $endsAt);

        $pdo = Db::conn();
        $pdo->beginTransaction();
        try {
            $facility = Db::one('SELECT * FROM facilities WHERE id = ? FOR UPDATE', [$facilityId]);
            if (!$facility) throw new ApiError(404, 'not_found', 'Facility not found');
            if (!$facility['active']) throw new ApiError(409, 'facility_inactive', 'This facility is not bookable');

            $hours = ($endsAt - $startsAt) / 3600;
            if ($hours > (int) $facility['max_hours']) {
                throw new ApiError(422, 'validation_failed', 'Slot longer than allowed', ['ends_at' => 'max_hours']);
            }
            if (date('H:i:s', $startsAt) < $facility['open_from'] || date('H:i:s', $endsAt) > $facility['open_to']) {
                throw new ApiError(422, 'validation_failed', 'Outside opening hours', ['starts_at' => 'opening_hours']);
            }

            $clash = Db::one(
                'SELECT id FROM facility_bookings
                 WHERE facility_id = ? AND status IN ("pending","approved") AND starts_at < ? AND ends_at > ? FOR UPDATE',
                [$facilityId, $end, $start]
            );
            if ($clash) throw new ApiError(409, 'slot_taken', 'This slot is already booked');

            $status = $facility['requires_approval'] ? 'pending' : 'approved';
            $id = Db::insert(
                'INSERT INTO facility_bookings (facility_id, apartment_id, requested_by, starts_at, ends_at, status, purpose)
                 VALUES (?,?,?,?,?,?,?)',
                [$facilityId, $apartmentId, $u['id'], $start, $end, $status, Validator::str($body, 'purpose', false, 190)]
            );
            Audit::log((int) $u['id'], 'booking.create', 'booking', (string) $id, null,
                ['facility_id' => $facilityId, 'apartment_id' => $apartmentId, 'starts_at' => $start, 'status' => $status]);
            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $e;
        }

        NotificationsController::notifyApartment($apartmentId, 'booking',
            $status === 'approved' ? 'تم تأكيد الحجز' : 'طلب حجز قيد المراجعة',
            $status === 'approved' ? 'Réservation confirmée' : 'Demande de réservation en attente',
            $start, $start, '/bookings');
        Http::json(['id' => $id, 'status' => $status], 201);
    }

    /** PATCH /bookings/{id} — manager decides, resident cancels their own. */
    public static function update(array $p): void
    {
        $u   = Auth::require();
        $id  = (int) $p['id'];
        $row = Db::one('SELECT * FROM facility_bookings WHERE id = ?', [$id]);
        if (!$row) throw new ApiError(404, 'not_found', 'Booking not found');
        $body   = Http::body();
        $status = Validator::enum($body, 'status', ['approved', 'rejected', 'cancelled']);

        if (!Auth::isManager($u)) {
            if ((int) $row['apartment_id'] !== (int) ($u['apartment_id'] ?? -1)) throw new ApiError(403, 'forbidden', 'Not your booking');
            if ($status !== 'cancelled') throw new ApiError(403, 'forbidden', 'Residents may only cancel');
        }
        if (in_array($row['status'], ['cancelled', 'rejected'], true)) {
            throw new ApiError(409, 'booking_closed', 'This booking is already closed');
        }

        $pdo = Db::conn();
        $pdo->beginTransaction();
        try {
            if ($status === 'approved') {
                $clash = Db::one(
                    'SELECT id FROM facility_bookings
                     WHERE facility_id = ? AND id <> ? AND status = "approved" AND starts_at < ? AND ends_at > ? FOR UPDATE',
                    [$row['facility_id'], $id, $row['ends_at'], $row['starts_at']]
                );
                if ($clash) throw new ApiError(409, 'slot_taken', 'Another approved booking overlaps this slot');
            }
            Db::exec('UPDATE facility_bookings SET status = ?, decision_note = ?, decided_by = ?, decided_at = NOW() WHERE id = ?',
                [$status, Validator::str($body, 'decision_note', false, 255), $u['id'], $id]);
            Audit::log((int) $u['id'], 'booking.' . $status, 'booking', (string) $id, ['status' => $row['status']], ['status' => $status]);
            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $e;
        }

        NotificationsController::notifyApartment((int) $row['apartment_id'], 'booking',
            'تحديث حالة الحجز', 'Statut de réservation mis à jour', $status, $status, '/bookings');
        Http::json(['ok' => true]);
    }
}
