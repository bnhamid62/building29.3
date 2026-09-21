<?php
namespace App\Support;

/**
 * Dependency-free Web Push sender (RFC 8291 aes128gcm + RFC 8292 VAPID).
 *
 * Runs on plain PHP 8 with the openssl and curl extensions only — no Node.js,
 * no Composer package, no third-party service. This is what lets push work on
 * a shared PHP host (AppServ locally, InfinityFree/cPanel in production).
 *
 * Keys live in config.php:
 *   'vapid' => ['subject' => 'mailto:...', 'public_key' => '...', 'private_key' => '...']
 * Generate them once with: php backend/tools/generate_vapid_keys.php
 */
final class WebPush
{
    private const CURVE = 'prime256v1';

    public static function publicKey(): ?string
    {
        $v = Config::get('vapid', []);
        $k = is_array($v) ? (string) ($v['public_key'] ?? '') : '';
        return $k !== '' ? $k : null;
    }

    public static function configured(): bool
    {
        $v = Config::get('vapid', []);
        return is_array($v)
            && !empty($v['public_key'])
            && !empty($v['private_key'])
            && function_exists('openssl_pkey_new')
            && function_exists('curl_init');
    }

    /**
     * Sends one payload to one subscription.
     * Returns the HTTP status code, or 0 when the request could not be made.
     */
    public static function send(string $endpoint, string $p256dh, string $auth, array $payload, int $ttl = 86400): int
    {
        if (!self::configured()) return 0;

        try {
            $body    = self::encrypt(json_encode($payload, JSON_UNESCAPED_UNICODE) ?: '{}', $p256dh, $auth);
            $headers = [
                'Content-Encoding: aes128gcm',
                'Content-Type: application/octet-stream',
                'TTL: ' . $ttl,
                'Urgency: normal',
                'Authorization: ' . self::vapidHeader($endpoint),
            ];
        } catch (\Throwable $e) {
            error_log('WebPush encrypt failed: ' . $e->getMessage());
            return 0;
        }

        $ch = curl_init($endpoint);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $body,
            CURLOPT_HTTPHEADER     => $headers,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 10,
        ]);
        curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        return $status;
    }

    /** Authorization: vapid t=<jwt>,k=<public key> */
    private static function vapidHeader(string $endpoint): string
    {
        $vapid   = Config::get('vapid', []);
        $subject = (string) ($vapid['subject'] ?? 'mailto:admin@example.com');
        $parts   = parse_url($endpoint);
        $aud     = ($parts['scheme'] ?? 'https') . '://' . ($parts['host'] ?? '');

        $header  = self::b64(json_encode(['typ' => 'JWT', 'alg' => 'ES256']) ?: '');
        $claims  = self::b64(json_encode([
            'aud' => $aud,
            'exp' => time() + 12 * 3600,
            'sub' => $subject,
        ], JSON_UNESCAPED_SLASHES) ?: '');
        $signed  = $header . '.' . $claims;

        $pem = self::privatePem();
        $der = '';
        if (!openssl_sign($signed, $der, $pem, OPENSSL_ALGO_SHA256)) {
            throw new \RuntimeException('VAPID signature failed');
        }

        return 'vapid t=' . $signed . '.' . self::b64(self::derToRaw($der))
            . ',k=' . (string) ($vapid['public_key'] ?? '');
    }

    /** RFC 8291 payload encryption (aes128gcm single record). */
    private static function encrypt(string $plaintext, string $p256dh, string $authSecret): string
    {
        $uaPublic = self::unb64($p256dh);           // 65 bytes, uncompressed point
        $auth     = self::unb64($authSecret);       // 16 bytes
        if (strlen($uaPublic) !== 65 || strlen($auth) < 16) {
            throw new \RuntimeException('Invalid subscription keys');
        }

        $ephemeral = openssl_pkey_new(['curve_name' => self::CURVE, 'private_key_type' => OPENSSL_KEYTYPE_EC]);
        if ($ephemeral === false) throw new \RuntimeException('EC key generation failed');
        $details  = openssl_pkey_get_details($ephemeral);
        $asPublic = "\x04" . str_pad($details['ec']['x'], 32, "\0", STR_PAD_LEFT)
                           . str_pad($details['ec']['y'], 32, "\0", STR_PAD_LEFT);

        $shared = openssl_pkey_derive(self::publicPem($uaPublic), $ephemeral, 32);
        if ($shared === false) throw new \RuntimeException('ECDH failed');

        $ikm   = hash_hkdf('sha256', $shared, 32, "WebPush: info\0" . $uaPublic . $asPublic, $auth);
        $salt  = random_bytes(16);
        $cek   = hash_hkdf('sha256', $ikm, 16, "Content-Encoding: aes128gcm\0", $salt);
        $nonce = hash_hkdf('sha256', $ikm, 12, "Content-Encoding: nonce\0", $salt);

        $tag    = '';
        $cipher = openssl_encrypt($plaintext . "\x02", 'aes-128-gcm', $cek, OPENSSL_RAW_DATA, $nonce, $tag);
        if ($cipher === false) throw new \RuntimeException('AES-GCM failed');

        // header = salt(16) | record size(4) | key id length(1) | key id(65)
        return $salt . pack('N', 4096) . chr(65) . $asPublic . $cipher . $tag;
    }

    /** Builds a PEM public key from a raw uncompressed P-256 point. */
    private static function publicPem(string $point): string
    {
        $der = hex2bin('3059301306072a8648ce3d020106082a8648ce3d030107034200') . $point;
        return "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($der), 64, "\n") . "-----END PUBLIC KEY-----\n";
    }

    /** Builds a PEM private key (SEC1) from the configured raw scalar + point. */
    private static function privatePem(): string
    {
        $vapid   = Config::get('vapid', []);
        $private = str_pad(self::unb64((string) ($vapid['private_key'] ?? '')), 32, "\0", STR_PAD_LEFT);
        $public  = self::unb64((string) ($vapid['public_key'] ?? ''));
        if (strlen($private) !== 32 || strlen($public) !== 65) {
            throw new \RuntimeException('Invalid VAPID key pair');
        }

        $der = hex2bin('30770201010420') . $private
             . hex2bin('a00a06082a8648ce3d030107a144034200') . $public;
        return "-----BEGIN EC PRIVATE KEY-----\n" . chunk_split(base64_encode($der), 64, "\n") . "-----END EC PRIVATE KEY-----\n";
    }

    /** ECDSA DER signature -> raw r||s (64 bytes). */
    private static function derToRaw(string $der): string
    {
        $offset = 2;
        if (ord($der[1]) > 0x80) $offset += ord($der[1]) - 0x80;

        $read = static function (string $der, int &$offset): string {
            $offset++; // 0x02
            $len = ord($der[$offset++]);
            $val = substr($der, $offset, $len);
            $offset += $len;
            return str_pad(ltrim($val, "\0"), 32, "\0", STR_PAD_LEFT);
        };

        return $read($der, $offset) . $read($der, $offset);
    }

    public static function b64(string $raw): string
    {
        return rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
    }

    public static function unb64(string $value): string
    {
        $value = strtr($value, '-_', '+/');
        return (string) base64_decode(str_pad($value, (int) (ceil(strlen($value) / 4) * 4), '=', STR_PAD_RIGHT), true);
    }
}
