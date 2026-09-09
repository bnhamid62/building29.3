<?php
namespace App\Support;

/**
 * Shared rate limiter.
 *
 * Counters live in MySQL (table `rate_limits`) so the limit still holds when
 * Apache serves requests from several processes/workers, which the previous
 * temp-file implementation could not guarantee. If the table is missing the
 * limiter degrades to the local file store instead of breaking the request.
 */
final class RateLimit
{
    public static function hit(string $bucket, int $max, int $windowSeconds, ?string $subject = null): void
    {
        $key = sha1($bucket . '|' . ($subject ?? Http::ip()));
        try {
            $pdo = Db::conn();
            $pdo->prepare(
                'INSERT INTO rate_limits (bucket, window_start, hits) VALUES (?, NOW(), 1)
                 ON DUPLICATE KEY UPDATE
                   hits = IF(window_start < (NOW() - INTERVAL ? SECOND), 1, hits + 1),
                   window_start = IF(window_start < (NOW() - INTERVAL ? SECOND), NOW(), window_start)'
            )->execute([$key, $windowSeconds, $windowSeconds]);
            $row = Db::one('SELECT hits FROM rate_limits WHERE bucket = ?', [$key]);
            $count = (int) ($row['hits'] ?? 0);
        } catch (\Throwable) {
            $count = self::fileFallback($key, $windowSeconds);
        }
        if ($count > $max) {
            throw new ApiError(429, 'rate_limited', 'Too many requests, try again later');
        }
    }

    private static function fileFallback(string $key, int $windowSeconds): int
    {
        $dir = sys_get_temp_dir() . '/b29-rate';
        if (!is_dir($dir)) @mkdir($dir, 0700, true);
        $file = $dir . '/' . $key . '.json';
        $now  = time();
        $data = is_file($file) ? json_decode((string) file_get_contents($file), true) : null;
        if (!is_array($data) || ($data['start'] ?? 0) < $now - $windowSeconds) {
            $data = ['start' => $now, 'count' => 0];
        }
        $data['count']++;
        file_put_contents($file, json_encode($data), LOCK_EX);
        return (int) $data['count'];
    }
}
