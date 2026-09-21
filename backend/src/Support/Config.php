<?php
namespace App\Support;

final class Config
{
    private static ?array $data = null;

    public static function all(): array
    {
        if (self::$data === null) {
            $file = __DIR__ . '/../../config/config.php';
            if (!is_file($file)) {
                $file = __DIR__ . '/../../config/config.sample.php';
            }
            $data = require $file;

            // Secrets may come from the environment instead of the file.
            foreach ([
                'B29_JWT_SECRET' => 'jwt_secret',
                'B29_DB_HOST'    => null,
                'B29_ENV'        => 'env',
            ] as $env => $key) {
                $v = getenv($env);
                if ($v !== false && $v !== '' && $key !== null) $data[$key] = $v;
            }
            foreach (['B29_DB_HOST' => 'host', 'B29_DB_NAME' => 'name', 'B29_DB_USER' => 'user', 'B29_DB_PASS' => 'pass'] as $env => $k) {
                $v = getenv($env);
                if ($v !== false && $v !== '') $data['db'][$k] = $v;
            }
            self::$data = $data;
        }
        return self::$data;
    }

    public static function get(string $key, mixed $default = null): mixed
    {
        return self::all()[$key] ?? $default;
    }

    public static function isProduction(): bool
    {
        return (string) self::get('env', 'development') === 'production';
    }

    /**
     * Refuse to serve a production deployment with insecure configuration.
     * Called once per request from public/index.php — it is cheap and it makes
     * an unsafe deploy fail loudly instead of silently exposing the building.
     */
    public static function assertSafeStartup(): void
    {
        if (!self::isProduction()) return;
        $problems = [];
        $secret = (string) self::get('jwt_secret', '');
        if ($secret === '' || $secret === 'change-me-to-a-long-random-string' || strlen($secret) < 32) {
            $problems[] = 'jwt_secret';
        }
        if (self::get('debug')) $problems[] = 'debug';
        if (!self::get('secure_cookies')) $problems[] = 'secure_cookies';
        foreach ((array) self::get('cors_origins', []) as $origin) {
            if (str_starts_with((string) $origin, 'http://') && !str_contains((string) $origin, 'localhost')) {
                $problems[] = 'cors_origins';
                break;
            }
        }
        foreach (self::missingDatabaseProtections() as $missing) {
            $problems[] = 'db:' . $missing;
        }
        if ($problems) {
            error_log('B29 refused to start in production, insecure config: ' . implode(', ', $problems));
            http_response_code(500);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(['error' => ['code' => 'server_error', 'message' => 'Service unavailable', 'fields' => []]]);
            exit;
        }
    }

    /**
     * Same structural checks as backend/tools/verify_security.php: a production
     * deploy that skipped the immutability migration must fail loudly instead of
     * silently running without an append-only ledger or token revocation.
     *
     * @return string[] names of the missing protections (empty when all present)
     */
    private static function missingDatabaseProtections(): array
    {
        $required = [
            'trg_payments_no_update', 'trg_payments_no_delete',
            'trg_receipts_no_update', 'trg_receipts_no_delete',
            'trg_audit_no_update',    'trg_audit_no_delete',
            'trg_contrib_locked_update', 'trg_contrib_locked_delete',
            'trg_projects_locked_update',
        ];
        try {
            $missing = [];
            $triggers = array_column(
                Db::all('SELECT TRIGGER_NAME AS n FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE()'),
                'n'
            );
            foreach ($required as $trigger) {
                if (!in_array($trigger, $triggers, true)) $missing[] = $trigger;
            }
            foreach ([['users', 'token_version'], ['projects', 'financial_locked_at'], ['projects', 'financial_locked_by']] as [$table, $col]) {
                $present = (bool) Db::one(
                    'SELECT 1 AS x FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
                    [$table, $col]
                );
                if (!$present) $missing[] = "$table.$col";
            }
            $present = (bool) Db::one(
                'SELECT 1 AS x FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
                ['rate_limits']
            );
            if (!$present) $missing[] = 'rate_limits';
            return $missing;
        } catch (\Throwable $e) {
            // The database itself is unreachable; the normal error path reports it.
            error_log('B29 could not verify database protections: ' . $e->getMessage());
            return [];
        }
    }
}

