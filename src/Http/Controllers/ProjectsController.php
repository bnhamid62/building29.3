<?php
namespace App\Http\Controllers;

use App\Support\{ApiError, Audit, Auth, Db, Http, Validator};

final class ProjectsController
{
    private const CATEGORIES = ['cleaning','elevator','lighting','electricity','cameras','basement','water_leak','repair','emergency','custom'];
    private const STATUSES   = ['proposed','awaiting_approval','fundraising','scheduled','in_progress','paused','completed','cancelled'];
    private const PRIORITIES = ['low','normal','high','urgent'];

    public static function index(): void
    {
        Auth::require();
        $rows = Db::all(
            'SELECT p.*,
                    COALESCE((SELECT SUM(pc.required_amount) FROM project_contributions pc WHERE pc.project_id = p.id AND pc.exempt = 0), 0) AS expected_total,
                    COALESCE((SELECT SUM(pa.amount) FROM payments pa WHERE pa.project_id = p.id), 0) AS collected_total,
                    (SELECT COUNT(DISTINCT pa.apartment_id) FROM payments pa WHERE pa.project_id = p.id) AS paid_apartments
             FROM projects p ORDER BY p.created_at DESC'
        );
        Http::json(array_map([self::class, 'shape'], $rows));
    }

    public static function show(array $p): void
    {
        Auth::require();
        $id  = (int) $p['id'];
        $row = Db::one(
            'SELECT p.*,
                    COALESCE((SELECT SUM(pc.required_amount) FROM project_contributions pc WHERE pc.project_id = p.id AND pc.exempt = 0), 0) AS expected_total,
                    COALESCE((SELECT SUM(pa.amount) FROM payments pa WHERE pa.project_id = p.id), 0) AS collected_total,
                    (SELECT COUNT(DISTINCT pa.apartment_id) FROM payments pa WHERE pa.project_id = p.id) AS paid_apartments
             FROM projects p WHERE p.id = ?',
            [$id]
        );
        if (!$row) throw new ApiError(404, 'not_found', 'Project not found');

        $apartments = Db::all(
            'SELECT a.id, a.number, a.floor, pc.required_amount,
                    COALESCE((SELECT SUM(pa.amount) FROM payments pa WHERE pa.project_id = pc.project_id AND pa.apartment_id = a.id), 0) AS paid
             FROM project_contributions pc JOIN apartments a ON a.id = pc.apartment_id
             WHERE pc.project_id = ? AND pc.exempt = 0 ORDER BY a.floor, a.number',
            [$id]
        );
        $stages = Db::all('SELECT * FROM project_stages WHERE project_id = ? ORDER BY position', [$id]);
        Http::json([
            'project'    => self::shape($row),
            'apartments' => array_map(static fn ($a) => [
                'id'       => (int) $a['id'],
                'number'   => $a['number'],
                'floor'    => (int) $a['floor'],
                'required' => (float) $a['required_amount'],
                'paid'     => (float) $a['paid'],
                'settled'  => (float) $a['paid'] >= (float) $a['required_amount'],
            ], $apartments),
            'stages'     => $stages,
        ]);
    }

    public static function store(): void
    {
        $m = Auth::requireManager();
        $b = Http::body();
        $data = self::validate($b);
        $id = Db::insert(
            'INSERT INTO projects (name_ar, name_fr, description_ar, description_fr, category, custom_category, status, priority,
                planned_start, planned_end, estimated_cost, contribution_per_apartment, contractor_name, contractor_phone, progress, notes, created_by)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
            [$data['name_ar'], $data['name_fr'], $data['description_ar'], $data['description_fr'], $data['category'], $data['custom_category'],
             $data['status'], $data['priority'], $data['planned_start'], $data['planned_end'], $data['estimated_cost'],
             $data['contribution'], $data['contractor_name'], $data['contractor_phone'], $data['progress'], $data['notes'], $m['id']]
        );
        Db::exec(
            'INSERT INTO project_contributions (project_id, apartment_id, required_amount) SELECT ?, id, ? FROM apartments',
            [$id, $data['contribution']]
        );
        Audit::log((int) $m['id'], 'project_create', 'project', (string) $id, null, $data);
        Http::json(['id' => $id], 201);
    }

    public static function update(array $p): void
    {
        $m  = Auth::requireManager();
        $id = (int) $p['id'];
        $before = Db::one('SELECT * FROM projects WHERE id = ?', [$id]);
        if (!$before) throw new ApiError(404, 'not_found', 'Project not found');
        $locked = ($before['financial_locked_at'] ?? null) !== null;
        $data = self::validate(Http::body(), $before);
        if ($locked && (float) $data['contribution'] !== (float) $before['contribution_per_apartment']) {
            // Required amounts are frozen once the financial data is approved.
            throw new ApiError(409, 'financially_locked', 'This project is financially locked; the required amount can no longer be changed');
        }
        Db::exec(
            'UPDATE projects SET name_ar=?, name_fr=?, description_ar=?, description_fr=?, category=?, custom_category=?, status=?, priority=?,
                planned_start=?, planned_end=?, estimated_cost=?, contribution_per_apartment=?, contractor_name=?, contractor_phone=?, progress=?, notes=?,
                final_cost=?, actual_start=?, actual_end=? WHERE id=?',
            [$data['name_ar'], $data['name_fr'], $data['description_ar'], $data['description_fr'], $data['category'], $data['custom_category'],
             $data['status'], $data['priority'], $data['planned_start'], $data['planned_end'], $data['estimated_cost'], $data['contribution'],
             $data['contractor_name'], $data['contractor_phone'], $data['progress'], $data['notes'], $data['final_cost'], $data['actual_start'], $data['actual_end'], $id]
        );
        if (!$locked && (float) $data['contribution'] !== (float) $before['contribution_per_apartment']) {
            Db::exec('UPDATE project_contributions SET required_amount = ? WHERE project_id = ? AND exempt = 0', [$data['contribution'], $id]);
        }
        Audit::log((int) $m['id'], 'project_update', 'project', (string) $id, $before, $data);
        Http::json(['ok' => true]);
    }

    /**
     * POST /projects/{id}/lock — approve and freeze the project's financial data.
     * Irreversible by design: after this point no manager, resident or direct API
     * call can change the required amount. Enforced again by a database trigger.
     */
    public static function lock(array $p): void
    {
        $m  = Auth::requireManager();
        $id = (int) $p['id'];
        $before = Db::one('SELECT * FROM projects WHERE id = ?', [$id]);
        if (!$before) throw new ApiError(404, 'not_found', 'Project not found');
        if (($before['financial_locked_at'] ?? null) !== null) {
            throw new ApiError(409, 'financially_locked', 'This project is already financially locked');
        }
        Db::exec('UPDATE projects SET financial_locked_at = NOW(), financial_locked_by = ? WHERE id = ?', [$m['id'], $id]);
        Audit::log((int) $m['id'], 'project_financial_lock', 'project', (string) $id, [
            'contribution_per_apartment' => (float) $before['contribution_per_apartment'],
        ], ['financial_locked_by' => (int) $m['id']]);
        Http::json(['ok' => true, 'financially_locked' => true]);
    }

    private static function validate(array $b, ?array $before = null): array
    {
        return [
            'name_ar'         => Validator::str($b, 'name_ar', $before === null) ?? $before['name_ar'],
            'name_fr'         => Validator::str($b, 'name_fr', $before === null) ?? $before['name_fr'],
            'description_ar'  => Validator::str($b, 'description_ar', false, 5000) ?? ($before['description_ar'] ?? null),
            'description_fr'  => Validator::str($b, 'description_fr', false, 5000) ?? ($before['description_fr'] ?? null),
            'category'        => Validator::enum($b, 'category', self::CATEGORIES, false, $before['category'] ?? 'custom'),
            'custom_category' => Validator::str($b, 'custom_category', false, 120) ?? ($before['custom_category'] ?? null),
            'status'          => Validator::enum($b, 'status', self::STATUSES, false, $before['status'] ?? 'proposed'),
            'priority'        => Validator::enum($b, 'priority', self::PRIORITIES, false, $before['priority'] ?? 'normal'),
            'planned_start'   => Validator::str($b, 'planned_start', false, 10) ?? ($before['planned_start'] ?? null),
            'planned_end'     => Validator::str($b, 'planned_end', false, 10) ?? ($before['planned_end'] ?? null),
            'actual_start'    => Validator::str($b, 'actual_start', false, 10) ?? ($before['actual_start'] ?? null),
            'actual_end'      => Validator::str($b, 'actual_end', false, 10) ?? ($before['actual_end'] ?? null),
            'estimated_cost'  => Validator::money($b, 'estimated_cost', false) ?? (float) ($before['estimated_cost'] ?? 0),
            'final_cost'      => Validator::money($b, 'final_cost', false) ?? ($before['final_cost'] ?? null),
            'contribution'    => Validator::money($b, 'contribution_per_apartment', false) ?? (float) ($before['contribution_per_apartment'] ?? 0),
            'contractor_name' => Validator::str($b, 'contractor_name', false) ?? ($before['contractor_name'] ?? null),
            'contractor_phone'=> Validator::str($b, 'contractor_phone', false, 32) ?? ($before['contractor_phone'] ?? null),
            'progress'        => max(0, min(100, Validator::int($b, 'progress', false) ?? (int) ($before['progress'] ?? 0))),
            'notes'           => Validator::str($b, 'notes', false, 5000) ?? ($before['notes'] ?? null),
        ];
    }

    public static function shape(array $r): array
    {
        $expected  = (float) ($r['expected_total'] ?? 0);
        $collected = (float) ($r['collected_total'] ?? 0);
        return [
            'id'                        => (int) $r['id'],
            'name_ar'                   => $r['name_ar'],
            'name_fr'                   => $r['name_fr'],
            'description_ar'            => $r['description_ar'],
            'description_fr'            => $r['description_fr'],
            'category'                  => $r['category'],
            'custom_category'           => $r['custom_category'],
            'status'                    => $r['status'],
            'priority'                  => $r['priority'],
            'planned_start'             => $r['planned_start'],
            'planned_end'               => $r['planned_end'],
            'actual_start'              => $r['actual_start'],
            'actual_end'                => $r['actual_end'],
            'estimated_cost'            => (float) $r['estimated_cost'],
            'final_cost'                => $r['final_cost'] !== null ? (float) $r['final_cost'] : null,
            'contribution_per_apartment'=> (float) $r['contribution_per_apartment'],
            'contractor_name'           => $r['contractor_name'],
            'contractor_phone'          => $r['contractor_phone'],
            'progress'                  => (int) $r['progress'],
            'notes'                     => $r['notes'],
            'expected_total'            => $expected,
            'collected_total'           => $collected,
            'remaining_total'           => max(0, $expected - $collected),
            'paid_apartments'           => (int) ($r['paid_apartments'] ?? 0),
            'financial_locked_at'       => $r['financial_locked_at'] ?? null,
            'financially_locked'        => ($r['financial_locked_at'] ?? null) !== null,
            'created_at'                => $r['created_at'],
        ];
    }
}
