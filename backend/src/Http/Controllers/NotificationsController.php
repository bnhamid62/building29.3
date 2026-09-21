<?php
namespace App\Http\Controllers;

use App\Support\{ApiError, Audit, Auth, Db, Http, Validator, WebPush};

final class NotificationsController
{
    private const KINDS = ['payment', 'project', 'complaint', 'announcement', 'meeting', 'vote', 'system'];

    /** Notifications addressed to the signed-in user (newest first). */
    public static function index(): void
    {
        $u = Auth::require();
        $rows = Db::all(
            'SELECT id, user_id, kind, title_ar, title_fr, body_ar, body_fr, link, read_at, created_at
             FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100',
            [$u['id']]
        );
        Http::json(array_map([self::class, 'shape'], $rows));
    }

    public static function unreadCount(): void
    {
        $u = Auth::require();
        $row = Db::one('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read_at IS NULL', [$u['id']]);
        Http::json(['unread' => (int) ($row['c'] ?? 0)]);
    }

    public static function markRead(array $p): void
    {
        $u  = Auth::require();
        $id = (int) $p['id'];
        $row = Db::one('SELECT id, user_id FROM notifications WHERE id = ?', [$id]);
        if (!$row) throw new ApiError(404, 'not_found', 'Notification not found');
        if ((int) $row['user_id'] !== (int) $u['id']) throw new ApiError(403, 'forbidden', 'Not your notification');
        Db::exec('UPDATE notifications SET read_at = NOW() WHERE id = ? AND read_at IS NULL', [$id]);
        Http::json(['ok' => true]);
    }

    public static function markAllRead(): void
    {
        $u = Auth::require();
        Db::exec('UPDATE notifications SET read_at = NOW() WHERE user_id = ? AND read_at IS NULL', [$u['id']]);
        Http::json(['ok' => true]);
    }

    /** Manager broadcast: all active residents, one apartment, or one user. */
    public static function store(): void
    {
        $m = Auth::requireManager();
        $b = Http::body();
        $kind    = Validator::enum($b, 'kind', self::KINDS, false, 'system');
        $titleAr = Validator::str($b, 'title_ar', true, 200);
        $titleFr = Validator::str($b, 'title_fr', true, 200);
        $bodyAr  = Validator::str($b, 'body_ar', false, 2000);
        $bodyFr  = Validator::str($b, 'body_fr', false, 2000);
        $link    = Validator::str($b, 'link', false, 255);
        $userId  = Validator::int($b, 'user_id', false);
        $aptId   = Validator::int($b, 'apartment_id', false);

        if ($userId) {
            $targets = Db::all('SELECT id FROM users WHERE id = ? AND status = "active"', [$userId]);
        } elseif ($aptId) {
            $targets = Db::all('SELECT id FROM users WHERE apartment_id = ? AND status = "active"', [$aptId]);
        } else {
            $targets = Db::all('SELECT id FROM users WHERE status = "active"');
        }
        if (!$targets) throw new ApiError(404, 'not_found', 'No recipient found');

        $pdo = Db::conn();
        $pdo->beginTransaction();
        try {
            foreach ($targets as $t) {
                Db::exec(
                    'INSERT INTO notifications (user_id, kind, title_ar, title_fr, body_ar, body_fr, link) VALUES (?,?,?,?,?,?,?)',
                    [$t['id'], $kind, $titleAr, $titleFr, $bodyAr, $bodyFr, $link]
                );
            }
            Audit::log((int) $m['id'], 'notification_broadcast', 'notification', null, null, [
                'kind' => $kind, 'title_ar' => $titleAr, 'recipients' => count($targets),
            ]);
            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $e;
        }
        self::pushTo(array_map(static fn ($t) => (int) $t['id'], $targets), [
            'title' => $titleFr ?: $titleAr,
            'body'  => $bodyFr ?: ($bodyAr ?? ''),
            'url'   => $link ?: '/notifications',
        ]);

        Http::json(['sent' => count($targets)], 201);
    }

    /** Used by the payment flow to inform an apartment that a payment was recorded. */
    public static function notifyApartment(int $apartmentId, string $kind, string $titleAr, string $titleFr, ?string $bodyAr = null, ?string $bodyFr = null, ?string $link = null): void
    {
        $users = Db::all('SELECT id FROM users WHERE apartment_id = ? AND status = "active"', [$apartmentId]);
        foreach ($users as $u) {
            Db::exec(
                'INSERT INTO notifications (user_id, kind, title_ar, title_fr, body_ar, body_fr, link) VALUES (?,?,?,?,?,?,?)',
                [$u['id'], $kind, $titleAr, $titleFr, $bodyAr, $bodyFr, $link]
            );
        }
        self::pushTo(array_map(static fn ($x) => (int) $x['id'], $users), [
            'title' => $titleFr,
            'body'  => $bodyFr ?? '',
            'url'   => $link ?: '/notifications',
        ]);
    }

    /* ------------------------------------------------------------------
     * Web Push (standard Push API). Sending is done by plain PHP through
     * App\Support\WebPush — openssl + curl only, no Node.js service.
     * ------------------------------------------------------------------ */

    /** GET /notifications/vapid-public-key — the browser needs it to subscribe. */
    public static function vapidKey(): void
    {
        Auth::require();
        Http::json(['public_key' => WebPush::publicKey()]);
    }

    /** POST /notifications/subscribe — stores this browser's push endpoint. */
    public static function subscribe(): void
    {
        $u = Auth::require();
        $b = Http::body();
        $endpoint = Validator::str($b, 'endpoint', true, 512);
        $p256dh   = Validator::str($b, 'p256dh', true, 255);
        $auth     = Validator::str($b, 'auth', true, 255);
        $agent    = Validator::str($b, 'user_agent', false, 190);
        if (!preg_match('#^https://#', (string) $endpoint)) {
            throw new ApiError(422, 'validation_error', 'Invalid push endpoint', ['endpoint' => 'https required']);
        }

        Db::exec(
            'INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth_key, user_agent)
             VALUES (?,?,?,?,?)
             ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), p256dh = VALUES(p256dh),
                                     auth_key = VALUES(auth_key), user_agent = VALUES(user_agent)',
            [$u['id'], $endpoint, $p256dh, $auth, $agent]
        );
        Http::json(['ok' => true], 201);
    }

    /** POST /notifications/unsubscribe — removes this browser's endpoint. */
    public static function unsubscribe(): void
    {
        $u = Auth::require();
        $b = Http::body();
        $endpoint = Validator::str($b, 'endpoint', true, 512);
        Db::exec('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?', [$endpoint, $u['id']]);
        Http::json(['ok' => true]);
    }

    /**
     * Best-effort push fan-out. Never breaks the surrounding request: a failing
     * push provider must not prevent the in-app notification from being stored.
     * Endpoints rejected with 404/410 are pruned (browser uninstalled the app).
     *
     * @param int[] $userIds
     */
    private static function pushTo(array $userIds, array $payload): void
    {
        if (!$userIds || !WebPush::configured()) return;
        try {
            $in   = implode(',', array_fill(0, count($userIds), '?'));
            $subs = Db::all("SELECT id, endpoint, p256dh, auth_key FROM push_subscriptions WHERE user_id IN ($in)", $userIds);
            foreach ($subs as $s) {
                $status = WebPush::send($s['endpoint'], $s['p256dh'], $s['auth_key'], $payload);
                if ($status === 404 || $status === 410) {
                    Db::exec('DELETE FROM push_subscriptions WHERE id = ?', [$s['id']]);
                } elseif ($status >= 200 && $status < 300) {
                    Db::exec('UPDATE push_subscriptions SET last_used_at = NOW() WHERE id = ?', [$s['id']]);
                }
            }
        } catch (\Throwable $e) {
            error_log('Push fan-out failed: ' . $e->getMessage());
        }
    }

    private static function shape(array $r): array
    {
        return [
            'id'         => (int) $r['id'],
            'kind'       => $r['kind'],
            'title_ar'   => $r['title_ar'],
            'title_fr'   => $r['title_fr'],
            'body_ar'    => $r['body_ar'],
            'body_fr'    => $r['body_fr'],
            'link'       => $r['link'],
            'read'       => $r['read_at'] !== null,
            'read_at'    => $r['read_at'],
            'created_at' => $r['created_at'],
        ];
    }
}
