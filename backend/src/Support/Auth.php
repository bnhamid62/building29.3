<?php
namespace App\Support;

final class Auth
{
    private static ?array $user = null;
    private static bool $resolved = false;

    /** Authenticated user or null. Roles come from the database, never from the token. */
    public static function user(): ?array
    {
        if (self::$resolved) return self::$user;
        self::$resolved = true;

        $header = $_SERVER['HTTP_AUTHORIZATION'] ?? ($_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
        if (!preg_match('/Bearer\s+(\S+)/i', (string) $header, $m)) return null;
        $claims = Jwt::verify($m[1]);
        if (!$claims) return null;

        $sub = filter_var($claims['sub'] ?? null, FILTER_VALIDATE_INT);
        if ($sub === false) return null;

        $user = Db::one(
            'SELECT u.*, (SELECT GROUP_CONCAT(role) FROM user_roles r WHERE r.user_id = u.id) AS roles
             FROM users u WHERE u.id = ?',
            [$sub]
        );
        // The account must still exist and still be active on every request.
        if (!$user || $user['status'] !== 'active') return null;
        // Token/session version: sensitive account changes invalidate old tokens.
        if (array_key_exists('token_version', $user) && (int) ($claims['tv'] ?? 0) !== (int) $user['token_version']) {
            return null;
        }
        $user['roles'] = array_values(array_filter(explode(',', (string) ($user['roles'] ?? ''))));
        return self::$user = $user;
    }

    public static function require(): array
    {
        $u = self::user();
        if (!$u) throw new ApiError(401, 'unauthorized', 'Authentication required');
        return $u;
    }

    public static function requireManager(): array
    {
        $u = self::require();
        if (!in_array('manager', $u['roles'], true)) {
            throw new ApiError(403, 'forbidden', 'Manager role required');
        }
        return $u;
    }

    public static function isManager(?array $u): bool
    {
        return $u !== null && in_array('manager', $u['roles'] ?? [], true);
    }

    /** Residents may only touch their own apartment. */
    public static function requireApartment(array $u, int $apartmentId): void
    {
        if (self::isManager($u)) return;
        if ((int) ($u['apartment_id'] ?? 0) !== $apartmentId) {
            throw new ApiError(403, 'forbidden', 'Not your apartment');
        }
    }

    /**
     * Phone visibility policy: managers always see it; residents see it only
     * when the building setting allows it, plus always for their own apartment.
     */
    public static function canSeePhone(array $viewer, ?int $subjectApartmentId = null): bool
    {
        if (self::isManager($viewer)) return true;
        if ($subjectApartmentId !== null && (int) ($viewer['apartment_id'] ?? 0) === $subjectApartmentId) return true;
        $row = Db::one('SELECT privacy_show_phone FROM building_settings WHERE id = 1');
        return (int) ($row['privacy_show_phone'] ?? 0) === 1;
    }
}
