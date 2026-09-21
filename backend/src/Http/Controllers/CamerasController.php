<?php
namespace App\Http\Controllers;

use App\Support\{ApiError, Audit, Auth, Db, Http, Validator};

/**
 * Camera / security equipment register.
 *
 * Information module only: there is no live stream and no credential, private
 * URL, token or internal network detail is stored or returned. Residents see
 * only the records explicitly marked resident_visible, with maintenance and
 * technician contact fields stripped.
 */
final class CamerasController
{
    private static function shape(array $r, bool $manager): array
    {
        $base = [
            'id'          => (int) $r['id'],
            'name'        => $r['name'],
            'location'    => $r['location'],
            'status'      => $r['status'],
            'coverage_ar' => $r['coverage_ar'],
            'coverage_fr' => $r['coverage_fr'],
        ];
        if (!$manager) return $base + ['resident_visible' => true];
        return $base + [
            'last_inspection'  => $r['last_inspection'] ?? null,
            'technician_name'  => $r['technician_name'] ?? null,
            'technician_phone' => $r['technician_phone'] ?? null,
            'notes'            => $r['notes'] ?? null,
            'resident_visible' => (bool) $r['resident_visible'],
        ];
    }

    /** GET /cameras */
    public static function index(): void
    {
        $u = Auth::require();
        $manager = Auth::isManager($u);
        $sql = 'SELECT * FROM cameras' . ($manager ? '' : ' WHERE resident_visible = 1') . ' ORDER BY location, name';
        Http::json(array_map(static fn ($r) => self::shape($r, $manager), Db::all($sql)));
    }

    /** GET /cameras/{id} */
    public static function show(array $p): void
    {
        $u = Auth::require();
        $manager = Auth::isManager($u);
        $row = Db::one('SELECT * FROM cameras WHERE id = ?', [(int) $p['id']]);
        if (!$row || (!$manager && !$row['resident_visible'])) throw new ApiError(404, 'not_found', 'Camera not found');
        Http::json(self::shape($row, $manager));
    }

    /** POST /cameras — manager only. */
    public static function store(): void
    {
        $m    = Auth::requireManager();
        $body = Http::body();
        $id = Db::insert(
            'INSERT INTO cameras (name, location, status, last_inspection, technician_name, technician_phone, coverage_ar, coverage_fr, resident_visible, notes)
             VALUES (?,?,?,?,?,?,?,?,?,?)',
            [
                Validator::str($body, 'name', true, 120),
                Validator::str($body, 'location', true, 190),
                Validator::enum($body, 'status', ['online', 'offline', 'maintenance'], false, 'online'),
                self::date($body['last_inspection'] ?? null),
                Validator::str($body, 'technician_name', false, 120),
                Validator::str($body, 'technician_phone', false, 32),
                Validator::str($body, 'coverage_ar', false, 255),
                Validator::str($body, 'coverage_fr', false, 255),
                !empty($body['resident_visible']) ? 1 : 0,
                Validator::str($body, 'notes', false, 2000),
            ]
        );
        Audit::log((int) $m['id'], 'camera.create', 'camera', (string) $id, null, ['name' => $body['name'] ?? null]);
        Http::json(['id' => $id], 201);
    }

    /** PATCH /cameras/{id} — manager only. */
    public static function update(array $p): void
    {
        $m   = Auth::requireManager();
        $id  = (int) $p['id'];
        $row = Db::one('SELECT * FROM cameras WHERE id = ?', [$id]);
        if (!$row) throw new ApiError(404, 'not_found', 'Camera not found');
        $body = Http::body();
        $fields = []; $args = [];
        foreach (['name', 'location', 'technician_name', 'technician_phone', 'coverage_ar', 'coverage_fr', 'notes'] as $key) {
            if (array_key_exists($key, $body)) { $fields[] = "$key = ?"; $args[] = Validator::str($body, $key, false, 2000); }
        }
        if (isset($body['status']))           { $fields[] = 'status = ?';           $args[] = Validator::enum($body, 'status', ['online', 'offline', 'maintenance']); }
        if (isset($body['resident_visible'])) { $fields[] = 'resident_visible = ?'; $args[] = !empty($body['resident_visible']) ? 1 : 0; }
        if (array_key_exists('last_inspection', $body)) { $fields[] = 'last_inspection = ?'; $args[] = self::date($body['last_inspection']); }
        if (!$fields) throw new ApiError(422, 'validation_failed', 'Nothing to update');
        $args[] = $id;
        Db::exec('UPDATE cameras SET ' . implode(', ', $fields) . ' WHERE id = ?', $args);
        Audit::log((int) $m['id'], 'camera.update', 'camera', (string) $id, ['status' => $row['status']], ['status' => $body['status'] ?? $row['status']]);
        Http::json(['ok' => true]);
    }

    /** DELETE /cameras/{id} — manager only. */
    public static function destroy(array $p): void
    {
        $m  = Auth::requireManager();
        $id = (int) $p['id'];
        Db::exec('DELETE FROM cameras WHERE id = ?', [$id]);
        Audit::log((int) $m['id'], 'camera.delete', 'camera', (string) $id, null, null);
        Http::json(['ok' => true]);
    }

    private static function date(mixed $v): ?string
    {
        if ($v === null || $v === '') return null;
        $ts = strtotime((string) $v);
        if ($ts === false) throw new ApiError(422, 'validation_failed', 'Invalid date', ['last_inspection' => 'date']);
        return date('Y-m-d', $ts);
    }
}
