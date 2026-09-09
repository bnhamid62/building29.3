<?php
namespace App\Http\Controllers;

use App\Support\{ApiError, Auth, Db, Http};

/**
 * Financial transparency is intentional: every signed-in resident may see each
 * apartment's required / paid / remaining amounts.
 *
 * Privacy is NOT transparency: private account fields (phone when the privacy
 * setting forbids it, last_login_at, identifier, password hash, internal flags)
 * are never serialized for residents. Responses are explicit DTOs, never a raw
 * `SELECT *` row.
 */
final class ApartmentsController
{
    public static function index(): void
    {
        Auth::require();
        $rows = Db::all(
            'SELECT a.id, a.number, a.floor, a.block, a.notes,
                    (SELECT full_name FROM users u WHERE u.apartment_id = a.id AND u.person_rank = "primary" AND u.status <> "archived" LIMIT 1) AS primary_name,
                    (SELECT full_name FROM users u WHERE u.apartment_id = a.id AND u.person_rank = "secondary" AND u.status <> "archived" LIMIT 1) AS secondary_name,
                    COALESCE((SELECT SUM(pc.required_amount) FROM project_contributions pc WHERE pc.apartment_id = a.id AND pc.exempt = 0), 0) AS required_total,
                    COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.apartment_id = a.id), 0) AS paid_total
             FROM apartments a ORDER BY a.floor, a.number'
        );
        Http::json(array_map(static function ($r) {
            // Authoritative server-side arithmetic; the client never supplies totals.
            $required = round((float) $r['required_total'], 2);
            $paid     = round((float) $r['paid_total'], 2);
            return [
                'id'             => (int) $r['id'],
                'number'         => $r['number'],
                'floor'          => (int) $r['floor'],
                'block'          => $r['block'],
                'notes'          => $r['notes'],
                'primary_name'   => $r['primary_name'],
                'secondary_name' => $r['secondary_name'],
                'required_total' => $required,
                'paid_total'     => $paid,
                'balance'        => round($required - $paid, 2),
            ];
        }, $rows));
    }

    public static function show(array $p): void
    {
        $u  = Auth::require();
        $id = (int) $p['id'];
        $apt = Db::one('SELECT id, number, floor, block, notes FROM apartments WHERE id = ?', [$id]);
        if (!$apt) throw new ApiError(404, 'not_found', 'Apartment not found');

        $showPhone = Auth::canSeePhone($u, $id);
        $isManager = Auth::isManager($u);

        $residentRows = Db::all(
            'SELECT id, full_name, phone, person_rank, occupancy, status, last_login_at
             FROM users WHERE apartment_id = ? AND status <> "archived" ORDER BY person_rank',
            [$id]
        );
        $residents = array_map(static function ($r) use ($showPhone, $isManager) {
            $out = [
                'id'          => (int) $r['id'],
                'full_name'   => $r['full_name'],
                'person_rank' => $r['person_rank'],
                'occupancy'   => $r['occupancy'],
                'status'      => $r['status'],
                'phone'       => $showPhone ? $r['phone'] : null,
            ];
            // Account activity is administrative data, managers only.
            if ($isManager) $out['last_login_at'] = $r['last_login_at'];
            return $out;
        }, $residentRows);

        // Transparency data: amounts and receipt numbers are public to residents.
        // Free-text `notes` on a payment can contain private context, so it is
        // only serialized for the manager or the apartment's own residents.
        $ownApartment = $isManager || (int) ($u['apartment_id'] ?? 0) === $id;
        $paymentRows = Db::all(
            'SELECT p.id, p.amount, p.paid_at, p.method, p.notes, p.reverses_payment_id,
                    pr.name_ar, pr.name_fr, r.receipt_no
             FROM payments p JOIN projects pr ON pr.id = p.project_id
             LEFT JOIN receipts r ON r.payment_id = p.id
             WHERE p.apartment_id = ? ORDER BY p.paid_at DESC',
            [$id]
        );
        $payments = array_map(static fn ($r) => [
            'id'          => (int) $r['id'],
            'amount'      => round((float) $r['amount'], 2),
            'paid_at'     => $r['paid_at'],
            'method'      => $r['method'],
            'notes'       => $ownApartment ? $r['notes'] : null,
            'name_ar'     => $r['name_ar'],
            'name_fr'     => $r['name_fr'],
            'receipt_no'  => $r['receipt_no'],
            'is_reversal' => $r['reverses_payment_id'] !== null,
        ], $paymentRows);

        $contribRows = Db::all(
            'SELECT pc.project_id, pc.required_amount, pr.name_ar, pr.name_fr, pr.status,
                    COALESCE((SELECT SUM(amount) FROM payments p WHERE p.project_id = pc.project_id AND p.apartment_id = pc.apartment_id), 0) AS paid
             FROM project_contributions pc JOIN projects pr ON pr.id = pc.project_id
             WHERE pc.apartment_id = ? AND pc.exempt = 0',
            [$id]
        );
        $contrib = array_map(static fn ($r) => [
            'project_id'      => (int) $r['project_id'],
            'required_amount' => round((float) $r['required_amount'], 2),
            'paid'            => round((float) $r['paid'], 2),
            'name_ar'         => $r['name_ar'],
            'name_fr'         => $r['name_fr'],
            'status'          => $r['status'],
        ], $contribRows);

        Http::json([
            'apartment'     => [
                'id'     => (int) $apt['id'],
                'number' => $apt['number'],
                'floor'  => (int) $apt['floor'],
                'block'  => $apt['block'],
                'notes'  => $apt['notes'],
            ],
            'residents'     => $residents,
            'payments'      => $payments,
            'contributions' => $contrib,
        ]);
    }
}
