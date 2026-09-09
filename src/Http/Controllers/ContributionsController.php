<?php
namespace App\Http\Controllers;

use App\Support\{ApiError, Audit, Auth, Db, Http, Validator};

/**
 * Per-apartment shares of a project.
 *
 * Before the project's financial data is locked, a manager may adjust a single
 * apartment's required amount or exempt it. AFTER the lock, the required amount
 * is frozen for everyone — the API rejects it here, and a database trigger
 * rejects it again even for a direct SQL UPDATE.
 */
final class ContributionsController
{
    public static function index(array $p): void
    {
        Auth::require();
        $projectId = (int) $p['id'];
        if (!Db::one('SELECT id FROM projects WHERE id = ?', [$projectId])) {
            throw new ApiError(404, 'not_found', 'Project not found');
        }
        $rows = Db::all(
            'SELECT pc.id, pc.project_id, pc.apartment_id, pc.required_amount, pc.exempt,
                    a.number, a.floor,
                    COALESCE((SELECT SUM(pa.amount) FROM payments pa WHERE pa.project_id = pc.project_id AND pa.apartment_id = pc.apartment_id), 0) AS paid
             FROM project_contributions pc JOIN apartments a ON a.id = pc.apartment_id
             WHERE pc.project_id = ? ORDER BY a.floor, a.number',
            [$projectId]
        );
        Http::json(array_map(static function ($r) {
            $required = round((float) $r['required_amount'], 2);
            $paid     = round((float) $r['paid'], 2);
            $exempt   = (int) $r['exempt'] === 1;
            return [
                'id'           => (int) $r['id'],
                'project_id'   => (int) $r['project_id'],
                'apartment_id' => (int) $r['apartment_id'],
                'number'       => $r['number'],
                'floor'        => (int) $r['floor'],
                'required'     => $required,
                'paid'         => $paid,
                'balance'      => $exempt ? 0.0 : round($required - $paid, 2),
                'exempt'       => $exempt,
                'settled'      => $exempt || $paid >= $required,
            ];
        }, $rows));
    }

    /** PATCH /projects/{id}/contributions/{apartmentId} — manager only, refused after locking. */
    public static function update(array $p): void
    {
        $m   = Auth::requireManager();
        $pid = (int) $p['id'];
        $aid = (int) $p['apartmentId'];

        $project = Db::one('SELECT id, financial_locked_at FROM projects WHERE id = ?', [$pid]);
        if (!$project) throw new ApiError(404, 'not_found', 'Project not found');
        if (($project['financial_locked_at'] ?? null) !== null) {
            throw new ApiError(409, 'financially_locked', 'This project is financially locked; required amounts can no longer be changed');
        }

        $before = Db::one('SELECT * FROM project_contributions WHERE project_id = ? AND apartment_id = ?', [$pid, $aid]);
        if (!$before) throw new ApiError(404, 'not_found', 'Contribution not found');

        $b        = Http::body();
        $amount   = Validator::money($b, 'required_amount', false) ?? (float) $before['required_amount'];
        $exemptIn = $b['exempt'] ?? null;
        $exempt   = $exemptIn === null ? (int) $before['exempt'] : (int) (bool) $exemptIn;
        if ($amount < 0) throw new ApiError(422, 'validation_failed', 'Amount cannot be negative', ['required_amount' => 'positive']);

        Db::exec(
            'UPDATE project_contributions SET required_amount = ?, exempt = ? WHERE project_id = ? AND apartment_id = ?',
            [$amount, $exempt, $pid, $aid]
        );
        Audit::log((int) $m['id'], 'contribution_update', 'project_contribution', $pid . ':' . $aid, $before, [
            'required_amount' => $amount, 'exempt' => $exempt,
        ]);
        Http::json(['ok' => true]);
    }
}
