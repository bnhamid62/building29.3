<?php
namespace App\Http\Controllers;

use App\Support\{ApiError, Audit, Auth, Db, Http, Validator};

final class ResidentsController
{
    public static function index(): void
    {
        Auth::requireManager();
        $rows = Db::all(
            'SELECT u.id, u.identifier, u.full_name, u.phone, u.person_rank, u.occupancy, u.status,
                    u.must_change_password, u.last_login_at, u.created_at, a.number AS apartment_number, u.apartment_id
             FROM users u LEFT JOIN apartments a ON a.id = u.apartment_id
             ORDER BY a.floor, a.number, u.person_rank'
        );
        Http::json($rows);
    }

    public static function store(): void
    {
        $m = Auth::requireManager();
        $b = Http::body();
        $name  = Validator::str($b, 'full_name');
        $phone = Validator::str($b, 'phone', true, 32);
        $ident = Validator::str($b, 'identifier', true, 64);
        $apt   = Validator::int($b, 'apartment_id');
        $rank  = Validator::enum($b, 'person_rank', ['primary', 'secondary'], false, 'primary');
        $occ   = Validator::enum($b, 'occupancy', ['owner', 'resident_owner'], false, 'owner');
        $pwd   = Validator::str($b, 'password', true, 200);
        if (mb_strlen($pwd) < 8) throw new ApiError(422, 'validation_failed', 'Password too short', ['password' => 'min8']);

        if (!Db::one('SELECT id FROM apartments WHERE id = ?', [$apt])) {
            throw new ApiError(404, 'not_found', 'Apartment not found');
        }
        if (Db::one('SELECT id FROM users WHERE apartment_id = ? AND person_rank = ? AND status <> "archived"', [$apt, $rank])) {
            throw new ApiError(409, 'slot_taken', 'This apartment already has a ' . $rank . ' person');
        }
        if (Db::one('SELECT id FROM users WHERE identifier = ? OR phone = ?', [$ident, $phone])) {
            throw new ApiError(409, 'duplicate', 'Identifier or phone already used');
        }
        $id = Db::insert(
            'INSERT INTO users (identifier, phone, full_name, password_hash, apartment_id, occupancy, person_rank, must_change_password)
             VALUES (?,?,?,?,?,?,?,1)',
            [$ident, $phone, $name, password_hash($pwd, PASSWORD_BCRYPT), $apt, $occ, $rank]
        );
        Db::exec('INSERT INTO user_roles (user_id, role) VALUES (?, "resident")', [$id]);
        Audit::log((int) $m['id'], 'resident_create', 'user', (string) $id, null, ['identifier' => $ident, 'apartment_id' => $apt]);
        Http::json(['id' => $id], 201);
    }

    public static function update(array $p): void
    {
        $m  = Auth::requireManager();
        $id = (int) $p['id'];
        $before = Db::one('SELECT * FROM users WHERE id = ?', [$id]);
        if (!$before) throw new ApiError(404, 'not_found', 'Resident not found');
        $b = Http::body();
        $name   = Validator::str($b, 'full_name', false) ?? $before['full_name'];
        $phone  = Validator::str($b, 'phone', false, 32) ?? $before['phone'];
        $status = Validator::enum($b, 'status', ['active', 'suspended', 'archived'], false, $before['status']);
        $occ    = Validator::enum($b, 'occupancy', ['owner', 'resident_owner'], false, $before['occupancy']);
        $bumpToken = $status !== $before['status'] ? ', token_version = token_version + 1' : '';
        Db::exec('UPDATE users SET full_name = ?, phone = ?, status = ?, occupancy = ?' . $bumpToken . ' WHERE id = ?', [$name, $phone, $status, $occ, $id]);
        if ($status !== 'active') {
            Db::exec('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ?', [$id]);
        }
        Audit::log((int) $m['id'], 'resident_update', 'user', (string) $id, $before, ['full_name' => $name, 'phone' => $phone, 'status' => $status]);
        Http::json(['ok' => true]);
    }

    public static function resetPassword(array $p): void
    {
        $m  = Auth::requireManager();
        \App\Support\RateLimit::hit('password_reset', 10, 900, (string) $m['id']);
        $id = (int) $p['id'];
        $pwd = Validator::str(Http::body(), 'password', true, 200);
        if (mb_strlen($pwd) < 8) throw new ApiError(422, 'validation_failed', 'Password too short', ['password' => 'min8']);
        if (!Db::one('SELECT id FROM users WHERE id = ?', [$id])) throw new ApiError(404, 'not_found', 'Resident not found');
        Db::exec('UPDATE users SET password_hash = ?, must_change_password = 1, failed_attempts = 0, locked_until = NULL, token_version = token_version + 1 WHERE id = ?', [password_hash($pwd, PASSWORD_BCRYPT), $id]);
        Db::exec('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ?', [$id]);
        Audit::log((int) $m['id'], 'password_reset', 'user', (string) $id);
        Http::json(['ok' => true]);
    }
}
