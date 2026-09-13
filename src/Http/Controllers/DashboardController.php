<?php
namespace App\Http\Controllers;

use App\Support\{Auth, Db, Http};

final class DashboardController
{
    public static function summary(): void
    {
        $u = Auth::require();
        $totals = Db::one(
            'SELECT COALESCE((SELECT SUM(required_amount) FROM project_contributions pc JOIN projects p ON p.id = pc.project_id
                              WHERE pc.exempt = 0 AND p.status NOT IN ("cancelled")), 0) AS expected,
                    COALESCE((SELECT SUM(amount) FROM payments), 0) AS collected'
        );
        $expected  = (float) $totals['expected'];
        $collected = (float) $totals['collected'];
        $apartments = (int) (Db::one('SELECT COUNT(*) c FROM apartments')['c'] ?? 0);
        $settledRow = Db::one(
            'SELECT COUNT(*) AS c FROM (
                SELECT pc.apartment_id, SUM(pc.required_amount) AS req,
                       COALESCE((SELECT SUM(pa.amount) FROM payments pa WHERE pa.apartment_id = pc.apartment_id), 0) AS paid
                FROM project_contributions pc JOIN projects p ON p.id = pc.project_id
                WHERE pc.exempt = 0 AND p.status <> "cancelled"
                GROUP BY pc.apartment_id HAVING paid >= req
             ) t'
        );
        $activeProjects = Db::all(
            'SELECT p.*,
                    COALESCE((SELECT SUM(pc.required_amount) FROM project_contributions pc WHERE pc.project_id = p.id AND pc.exempt = 0), 0) AS expected_total,
                    COALESCE((SELECT SUM(pa.amount) FROM payments pa WHERE pa.project_id = p.id), 0) AS collected_total,
                    (SELECT COUNT(DISTINCT pa.apartment_id) FROM payments pa WHERE pa.project_id = p.id) AS paid_apartments
             FROM projects p WHERE p.status IN ("fundraising","scheduled","in_progress","paused") ORDER BY p.priority DESC, p.created_at DESC LIMIT 5'
        );
        $recent = Db::all(
            'SELECT p.*, a.number AS apartment_number, pr.name_ar AS project_name_ar, pr.name_fr AS project_name_fr, r.receipt_no,
                    NULL AS recorded_by_name
             FROM payments p JOIN apartments a ON a.id = p.apartment_id JOIN projects pr ON pr.id = p.project_id
             LEFT JOIN receipts r ON r.payment_id = p.id ORDER BY p.paid_at DESC LIMIT 8'
        );
        $mine = null;
        if (!empty($u['apartment_id'])) {
            $row = Db::one(
                'SELECT COALESCE(SUM(pc.required_amount),0) AS required,
                        COALESCE((SELECT SUM(pa.amount) FROM payments pa WHERE pa.apartment_id = ?),0) AS paid
                 FROM project_contributions pc JOIN projects p ON p.id = pc.project_id
                 WHERE pc.apartment_id = ? AND pc.exempt = 0 AND p.status <> "cancelled"',
                [$u['apartment_id'], $u['apartment_id']]
            );
            $apt = Db::one('SELECT number, floor FROM apartments WHERE id = ?', [$u['apartment_id']]);
            $mine = [
                'apartment_number' => $apt['number'] ?? null,
                'floor'            => isset($apt['floor']) ? (int) $apt['floor'] : null,
                'required'         => (float) $row['required'],
                'paid'             => (float) $row['paid'],
                'balance'          => (float) $row['required'] - (float) $row['paid'],
            ];
        }
        $subscriptions = Db::one(
    'SELECT COUNT(*) AS configured, COALESCE(SUM(monthly_amount), 0) AS monthly_expected
     FROM apartment_subscriptions WHERE is_active = 1'
);
        $equipment = Db::all('SELECT id, name_ar, name_fr, kind, status, last_check FROM equipment');
        Http::json([
            'expected_total'      => $expected,
            'collected_total'     => $collected,
            'remaining_total'     => max(0, $expected - $collected),
            'apartments_total'    => $apartments,
            'apartments_settled'  => (int) ($settledRow['c'] ?? 0),
            'apartments_unpaid'   => $apartments - (int) ($settledRow['c'] ?? 0),
            'subscriptions'       => [
            'apartments_configured'  => (int) ($subscriptions['configured'] ?? 0),
            'monthly_expected_total' => (float) ($subscriptions['monthly_expected'] ?? 0),
],
            'active_projects'     => array_map([ProjectsController::class, 'shape'], $activeProjects),
            'recent_payments'     => array_map([PaymentsController::class, 'shape'], $recent),
            'my_apartment'        => $mine,
            'equipment'           => $equipment,
        ]);
    }

    public static function settings(): void
    {
        Auth::require();
        Http::json(Db::one('SELECT * FROM building_settings WHERE id = 1'));
    }
}
