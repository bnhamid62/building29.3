<?php
namespace App\Support;

/**
 * HS256 tokens with full claim validation (signature, exp, nbf, iat, iss, aud).
 * `tv` carries the user's token version so password changes / account
 * suspension invalidate access tokens that were already issued.
 */
final class Jwt
{
    private const ISS = 'building29-api';
    private const AUD = 'building29-app';
    private const LEEWAY = 30; // seconds of clock skew tolerated

    private static function b64(string $s): string { return rtrim(strtr(base64_encode($s), '+/', '-_'), '='); }
    private static function unb64(string $s): string { return base64_decode(strtr($s, '-_', '+/')) ?: ''; }

    private static function secret(): string
    {
        $s = (string) Config::get('jwt_secret');
        if ($s === '' || $s === 'change-me-to-a-long-random-string' || strlen($s) < 32) {
            // Never sign or verify with a weak/default secret.
            throw new ApiError(500, 'server_error', 'Server misconfiguration');
        }
        return $s;
    }

    public static function sign(array $claims, int $ttl): string
    {
        $now = time();
        $payload = $claims + [
            'iss' => self::ISS,
            'aud' => self::AUD,
            'iat' => $now,
            'nbf' => $now,
            'exp' => $now + $ttl,
        ];
        $head = self::b64((string) json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
        $body = self::b64((string) json_encode($payload, JSON_UNESCAPED_UNICODE));
        $sig  = self::b64(hash_hmac('sha256', "$head.$body", self::secret(), true));
        return "$head.$body.$sig";
    }

    public static function verify(string $token): ?array
    {
        $parts = explode('.', $token);
        if (count($parts) !== 3) return null;
        [$head, $body, $sig] = $parts;

        $header = json_decode(self::unb64($head), true);
        if (!is_array($header) || ($header['alg'] ?? '') !== 'HS256') return null; // reject alg=none / alg confusion

        $expected = self::b64(hash_hmac('sha256', "$head.$body", self::secret(), true));
        if (!hash_equals($expected, $sig)) return null;

        $claims = json_decode(self::unb64($body), true);
        if (!is_array($claims)) return null;

        $now = time();
        if (($claims['iss'] ?? null) !== self::ISS) return null;
        if (($claims['aud'] ?? null) !== self::AUD) return null;
        if (!isset($claims['exp']) || (int) $claims['exp'] + self::LEEWAY < $now) return null;
        if (isset($claims['nbf']) && (int) $claims['nbf'] - self::LEEWAY > $now) return null;
        if (isset($claims['iat']) && (int) $claims['iat'] - self::LEEWAY > $now) return null;
        if (!isset($claims['sub'])) return null;

        return $claims;
    }
}
