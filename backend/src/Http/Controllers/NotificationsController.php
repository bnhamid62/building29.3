<?php
namespace App\Http\Controllers;

use App\Support\{ApiError, Audit, Auth, Db, Http, Validator};

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
