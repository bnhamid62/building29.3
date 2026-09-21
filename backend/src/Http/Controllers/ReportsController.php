<?php
namespace App\Http\Controllers;

use App\Support\{Auth, Db, Http};

/**
 * Financial report data. Every figure is a SQL aggregate over the payment and
 * contribution rows — the client can never supply or alter a total.
 */
final class ReportsController
{
    /** GET /reports/financial — manager only. */
    public static function financial(): void
    {
        Auth::requireManager();

        $projects = Db::all(
            'SELECT p.id, p.name_ar, p.name_fr, p.status, p.estimated_cost, p.final_cost,
                    COALESCE((SELECT SUM(pc.required_amount) FROM project_contributions pc WHERE pc.project_id = p.id AND pc.exempt = 0), 0) AS expected_total,
                    COALESCE((SELECT SUM(pa.amount) FROM payments pa WHERE pa.project_id = p.id), 0) AS collected_total,
                    (SELECT COUNT(DISTINCT pa.apartment_id) FROM payments pa WHERE pa.project_id = p.id AND pa.amount > 0) AS paying_apartments
             FROM projects p WHERE p.status <> "cancelled" ORDER BY p.id'
        );

        $apartments = Db::all(
            'SELECT a.id, a.number, a.floor,
                    COALESCE((SELECT SUM(pc.required_amount) FROM project_contributions pc JOIN projects pr ON pr.id = pc.project_id
                              WHERE pc.apartment_id = a.id AND pc.exempt = 0 AND pr.status <> "cancelled"), 0) AS required_total,
                    COALESCE((SELECT SUM(pa.amount) FROM payments pa WHERE pa.apartment_id = a.id), 0) AS paid_total
             FROM apartments a ORDER BY a.floor, a.number'
        );

        $expected  = 0.0;
        $collected = 0.0;
        $projectRows = array_map(static function ($r) use (&$expected, &$collected) {
            $exp = (float) $r['expected_total'];
            $col = (float) $r['collected_total'];
            $expected  += $exp;
            $collected += $col;
            return [
                'id'                => (int) $r['id'],
                'name_ar'           => $r['name_ar'],
                'name_fr'           => $r['name_fr'],
                'status'            => $r['status'],
                'estimated_cost'    => (float) $r['estimated_cost'],
                'final_cost'        => $r['final_cost'] !== null ? (float) $r['final_cost'] : null,
                'expected_total'    => $exp,
                'collected_total'   => $col,
                'remaining_total'   => max(0.0, $exp - $col),
                'paying_apartments' => (int) $r['paying_apartments'],
            ];
        }, $projects);

        $apartmentRows = array_map(static fn ($r) => [
            'id'             => (int) $r['id'],
            'number'         => $r['number'],
            'floor'          => (int) $r['floor'],
            'required_total' => (float) $r['required_total'],
            'paid_total'     => (float) $r['paid_total'],
            'balance'        => (float) $r['required_total'] - (float) $r['paid_total'],
        ], $apartments);

        $settled = count(array_filter($apartmentRows, static fn ($a) => $a['balance'] <= 0));
        $settings = Db::one('SELECT name_ar, name_fr, address_ar, address_fr, currency FROM building_settings WHERE id = 1') ?? [];

        Http::json([
            'generated_at' => date('c'),
            'building'     => [
                'name_ar'    => $settings['name_ar'] ?? '',
                'name_fr'    => $settings['name_fr'] ?? '',
                'address_ar' => $settings['address_ar'] ?? null,
                'address_fr' => $settings['address_fr'] ?? null,
                'currency'   => $settings['currency'] ?? 'DZD',
            ],
            'totals'       => [
                'expected_total'     => $expected,
                'collected_total'    => $collected,
                'remaining_total'    => max(0.0, $expected - $collected),
                'apartments_total'   => count($apartmentRows),
                'apartments_settled' => $settled,
                'apartments_unpaid'  => count($apartmentRows) - $settled,
                'payments_count'     => (int) (Db::one('SELECT COUNT(*) AS c FROM payments')['c'] ?? 0),
                'reversals_count'    => (int) (Db::one('SELECT COUNT(*) AS c FROM payments WHERE reverses_payment_id IS NOT NULL')['c'] ?? 0),
            ],
            'projects'     => $projectRows,
            'apartments'   => $apartmentRows,
        ]);
    }
}
