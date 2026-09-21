<?php
namespace App\Http\Controllers;

use App\Support\{ApiError, Audit, Auth, Config, Db, Http, Jwt, RateLimit, Validator};

final class AuthController
{
    public static function login(): void
    {
        $b   = Http::body();
        $id  = Validator::str($b, 'identifier');
        // Limit per IP and per targeted account, so brute force cannot be
        // spread across accounts from one host or across hosts on one account.
        RateLimit::hit('login', 10, 300);
        RateLimit::hit('login_id', 10, 300, mb_strtolower($id));
        $pwd = Validator::str($b, 'password', true, 200);

        $user = Db::one(
            'SELECT * FROM users WHERE identifier = ? OR phone = ? LIMIT 1',
            [$id, $id]
        );
        $generic = new ApiError(401, 'invalid_credentials', 'Identifier or password is incorrect');
        if (!$user) throw $generic;
        if ($user['locked_until'] !== null && strtotime($user['locked_until']) > time()) {
            throw new ApiError(423, 'account_locked', 'Account temporarily locked');
        }
        if (!password_verify($pwd, $user['password_hash'])) {
            $attempts = (int) $user['failed_attempts'] + 1;
            Db::exec(
                'UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?',
                [$attempts, $attempts >= 5 ? date('Y-m-d H:i:s', time() + 900) : null, $user['id']]
            );
            throw $generic;
        }
        if ($user['status'] !== 'active') {
            throw new ApiError(403, 'account_' . $user['status'], 'Account is ' . $user['status']);
        }
        Db::exec('UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = NOW() WHERE id = ?', [$user['id']]);
        Audit::log((int) $user['id'], 'login', 'user', (string) $user['id']);
        self::issue($user);
    }

    public static function refresh(): void
    {
        // Defence in depth: refresh tokens are 256-bit random, but the whole
        // auth surface stays rate-limited per IP like login does.
        RateLimit::hit('refresh', 60, 300, Http::ip());
        $token = $_COOKIE['b29_refresh'] ?? (Http::body()['refresh_token'] ?? '');
        if (!$token) throw new ApiError(401, 'unauthorized', 'No refresh token');

        $hash = hash('sha256', $token);
        $row  = Db::one('SELECT * FROM refresh_tokens WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > NOW()', [$hash]);
        if (!$row) throw new ApiError(401, 'unauthorized', 'Invalid refresh token');
        Db::exec('UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = ?', [$row['id']]);
        $user = Db::one('SELECT * FROM users WHERE id = ?', [$row['user_id']]);
        if (!$user || $user['status'] !== 'active') throw new ApiError(403, 'forbidden', 'Account not active');
        self::issue($user);
    }

    public static function logout(): void
    {
        $token = $_COOKIE['b29_refresh'] ?? '';
        if ($token) {
            Db::exec('UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = ?', [hash('sha256', $token)]);
        }
        self::setRefreshCookie('', -1);
        Http::json(['ok' => true]);
    }

    public static function me(): void
    {
        $u = Auth::require();
        Http::json(self::publicUser($u));
    }

    public static function changePassword(): void
    {
        $u = Auth::require();
        RateLimit::hit('password_change', 5, 900, (string) $u['id']);
        $b = Http::body();
        $current = Validator::str($b, 'current_password', true, 200);
        $next    = Validator::str($b, 'new_password', true, 200);
        if (mb_strlen($next) < 8) {
            throw new ApiError(422, 'validation_failed', 'Password too short', ['new_password' => 'min8']);
        }
        if (!password_verify($current, $u['password_hash'])) {
            throw new ApiError(403, 'invalid_credentials', 'Current password is incorrect');
        }
        Db::exec(
            'UPDATE users SET password_hash = ?, must_change_password = 0, token_version = token_version + 1 WHERE id = ?',
            [password_hash($next, PASSWORD_BCRYPT), $u['id']]
        );
        Db::exec('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ?', [$u['id']]);
        Audit::log((int) $u['id'], 'password_change', 'user', (string) $u['id']);
        Http::json(['ok' => true]);
    }

    private static function issue(array $user): void
    {
        $roles = array_column(Db::all('SELECT role FROM user_roles WHERE user_id = ?', [$user['id']]), 'role');
        // Roles are re-read from the database on every request; the claim is
        // informational only. `tv` binds the token to the account's version.
        $access = Jwt::sign([
            'sub'   => (int) $user['id'],
            'roles' => $roles,
            'tv'    => (int) ($user['token_version'] ?? 1),
        ], (int) Config::get('access_ttl', 900));
        $refresh = bin2hex(random_bytes(32));
        Db::exec(
            'INSERT INTO refresh_tokens (user_id, token_hash, user_agent, ip, expires_at) VALUES (?,?,?,?, DATE_ADD(NOW(), INTERVAL ? SECOND))',
            [$user['id'], hash('sha256', $refresh), substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 250), Http::ip(), (int) Config::get('refresh_ttl')]
        );
        self::setRefreshCookie($refresh, (int) Config::get('refresh_ttl'));
        $user['roles'] = $roles;
        Http::json([
            'access_token' => $access,
            'expires_in'   => (int) Config::get('access_ttl', 900),
            'user'         => self::publicUser($user),
        ]);
    }

    private static function setRefreshCookie(string $value, int $ttl): void
    {
        $secure = (bool) Config::get('secure_cookies', false);
        setcookie('b29_refresh', $value, [
            'expires'  => $ttl > 0 ? time() + $ttl : time() - 3600,
            'path'     => '/',
            'httponly' => true,
            'secure'   => $secure,
            'samesite' => $secure ? 'None' : 'Lax',
        ]);
    }

    public static function publicUser(array $u): array
    {
        $roles = $u['roles'] ?? [];
        if (is_string($roles)) $roles = explode(',', $roles);
        return [
            'id'                   => (int) $u['id'],
            'identifier'           => $u['identifier'],
            'full_name'            => $u['full_name'],
            'phone'                => $u['phone'],
            'apartment_id'         => $u['apartment_id'] !== null ? (int) $u['apartment_id'] : null,
            'person_rank'          => $u['person_rank'],
            'occupancy'            => $u['occupancy'],
            'status'               => $u['status'],
            'must_change_password' => (bool) $u['must_change_password'],
            'photo_path'           => $u['photo_path'],
            'last_login_at'        => $u['last_login_at'] ?? null,
            'roles'                => array_values(array_filter($roles)),
        ];
    }
}
