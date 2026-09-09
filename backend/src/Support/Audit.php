<?php
namespace App\Support;

final class Audit
{
    /** Keys that must never reach the audit trail (or the manager audit screen). */
    private const SECRET_KEYS = ['password', 'password_hash', 'new_password', 'current_password', 'token', 'refresh_token', 'token_hash', 'jwt_secret', 'secret', 'idempotency_key'];

    private static function redact(?array $data): ?array
    {
        if ($data === null) return null;
        $out = [];
        foreach ($data as $k => $v) {
            $out[$k] = in_array(strtolower((string) $k), self::SECRET_KEYS, true) ? '[redacted]' : (is_array($v) ? self::redact($v) : $v);
        }
        return $out;
    }

    public static function log(?int $actorId, string $action, string $entity, ?string $entityId, ?array $before = null, ?array $after = null): void
    {
        $before = self::redact($before);
        $after  = self::redact($after);
        Db::exec(
            'INSERT INTO audit_logs (actor_id, action, entity, entity_id, before_json, after_json, ip) VALUES (?,?,?,?,?,?,?)',
            [
                $actorId, $action, $entity, $entityId,
                $before !== null ? json_encode($before, JSON_UNESCAPED_UNICODE) : null,
                $after !== null ? json_encode($after, JSON_UNESCAPED_UNICODE) : null,
                Http::ip(),
            ]
        );
    }
}

