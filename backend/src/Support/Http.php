<?php
namespace App\Support;

final class ApiError extends \RuntimeException
{
    public function __construct(public int $status, public string $errorCode, string $message, public array $fields = [])
    {
        parent::__construct($message);
    }
}

final class Http
{
    public static function json(mixed $data, int $status = 200, array $meta = []): void
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['data' => $data, 'meta' => $meta], JSON_UNESCAPED_UNICODE);
    }

    public static function error(int $status, string $code, string $message, array $fields = []): void
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['error' => compact('code', 'message', 'fields')], JSON_UNESCAPED_UNICODE);
    }

    public static function body(): array
    {
        $raw = file_get_contents('php://input') ?: '';
        if ($raw === '') return [];
        if (strlen($raw) > 2_000_000) throw new ApiError(413, 'payload_too_large', 'Request too large');
        $parsed = json_decode($raw, true);
        return is_array($parsed) ? $parsed : [];
    }

    public static function ip(): string
    {
        return (string) ($_SERVER['REMOTE_ADDR'] ?? '');
    }

    public static function cors(): void
    {
        $origin  = $_SERVER['HTTP_ORIGIN'] ?? '';
        $allowed = Config::get('cors_origins', []);
        if ($origin !== '' && in_array($origin, $allowed, true)) {
            header('Access-Control-Allow-Origin: ' . $origin);
            header('Vary: Origin');
            header('Access-Control-Allow-Credentials: true');
            header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Idempotency-Key');
            header('Access-Control-Allow-Methods: GET, POST, PATCH, PUT, DELETE, OPTIONS');
            header('Access-Control-Max-Age: 600');
        }
        self::securityHeaders();
        if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
            http_response_code(204);
            exit;
        }
    }

    /**
     * The API only ever returns JSON or a downloadable attachment, so it can
     * ship a maximally strict CSP. The React app served by Apache/Vite gets its
     * own (looser) policy from the web-server config documented in README.
     */
    public static function securityHeaders(): void
    {
        header('X-Content-Type-Options: nosniff');
        header('X-Frame-Options: DENY');
        header('Referrer-Policy: no-referrer');
        header('Permissions-Policy: geolocation=(), microphone=(), camera=(), payment=()');
        header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
        header('Cache-Control: no-store');
        if (Config::isProduction()) {
            header('Strict-Transport-Security: max-age=31536000; includeSubDomains');
        }
    }
}
