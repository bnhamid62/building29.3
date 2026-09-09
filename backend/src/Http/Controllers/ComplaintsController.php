<?php
namespace App\Http\Controllers;

use App\Support\{ApiError, Audit, Auth, Db, Http, Validator};

/**
 * Complaints / maintenance requests.
 *
 * Residents may only see and act on complaints reported from their own
 * apartment; every read query is filtered in SQL, never in the client.
 * Evidence files reuse the secure upload pipeline (random name, storage outside
 * the web root, real MIME check) and are downloaded through an authorized
 * streaming endpoint.
 */
final class ComplaintsController
{
    private const STATUSES  = ['submitted', 'under_review', 'approved', 'in_progress', 'resolved', 'rejected'];
    private const CATEGORIES = ['elevator', 'lighting', 'cleaning', 'water_leak', 'cameras', 'basement', 'electricity', 'security', 'other'];

    private static function shape(array $r): array
    {
        return [
            'id'               => (int) $r['id'],
            'title'            => $r['title'],
            'category'         => $r['category'],
            'description'      => $r['description'],
            'status'           => $r['status'],
            'urgency'          => $r['urgency'],
            'location'         => $r['location'],
            'apartment_id'     => $r['apartment_id'] !== null ? (int) $r['apartment_id'] : null,
            'apartment_number' => $r['apartment_number'] ?? null,
            'reporter_id'      => $r['reporter_id'] !== null ? (int) $r['reporter_id'] : null,
            'reporter_name'    => $r['reporter_name'] ?? null,
            'assigned_to'      => $r['assigned_to'] !== null ? (int) $r['assigned_to'] : null,
            'assignee_name'    => $r['assignee_name'] ?? null,
            'manager_response' => $r['manager_response'],
            'resolved_at'      => $r['resolved_at'],
            'created_at'       => $r['created_at'],
            'attachments_count'=> isset($r['attachments_count']) ? (int) $r['attachments_count'] : 0,
        ];
    }

    private static function base(): string
    {
        return 'SELECT c.*, a.number AS apartment_number, u.full_name AS reporter_name, m.full_name AS assignee_name,
                       (SELECT COUNT(*) FROM complaint_files cf WHERE cf.complaint_id = c.id) AS attachments_count
                FROM complaints c
                LEFT JOIN apartments a ON a.id = c.apartment_id
                LEFT JOIN users u ON u.id = c.reporter_id
                LEFT JOIN users m ON m.id = c.assigned_to';
    }

    /** GET /complaints */
    public static function index(): void
    {
        $u = Auth::require();
        $where = [];
        $args  = [];
        if (!Auth::isManager($u)) {
            $where[] = 'c.apartment_id = ?';
            $args[]  = $u['apartment_id'];
        } else {
            if (!empty($_GET['apartment_id'])) { $where[] = 'c.apartment_id = ?'; $args[] = (int) $_GET['apartment_id']; }
        }
        if (!empty($_GET['status'])   && in_array($_GET['status'], self::STATUSES, true))    { $where[] = 'c.status = ?';   $args[] = $_GET['status']; }
        if (!empty($_GET['category']) && in_array($_GET['category'], self::CATEGORIES, true)) { $where[] = 'c.category = ?'; $args[] = $_GET['category']; }
        if (!empty($_GET['from'])) { $where[] = 'c.created_at >= ?'; $args[] = substr((string) $_GET['from'], 0, 10) . ' 00:00:00'; }
        if (!empty($_GET['to']))   { $where[] = 'c.created_at <= ?'; $args[] = substr((string) $_GET['to'], 0, 10) . ' 23:59:59'; }

        $sql = self::base() . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . ' ORDER BY c.id DESC LIMIT 300';
        Http::json(array_map(self::shape(...), Db::all($sql, $args)));
    }

    private static function load(int $id, array $u): array
    {
        $row = Db::one(self::base() . ' WHERE c.id = ?', [$id]);
        if (!$row) throw new ApiError(404, 'not_found', 'Complaint not found');
        if (!Auth::isManager($u) && (int) $row['apartment_id'] !== (int) ($u['apartment_id'] ?? -1)) {
            throw new ApiError(403, 'forbidden', 'Not your complaint');
        }
        return $row;
    }

    /** GET /complaints/{id} */
    public static function show(array $p): void
    {
        $u   = Auth::require();
        $row = self::load((int) $p['id'], $u);
        $updates = Db::all(
            'SELECT cu.id, cu.status, cu.note, cu.created_at, us.full_name AS author_name
             FROM complaint_updates cu LEFT JOIN users us ON us.id = cu.author_id
             WHERE cu.complaint_id = ? ORDER BY cu.id',
            [$row['id']]
        );
        $files = Db::all(
            'SELECT f.id, f.original_name, f.mime, f.size_bytes, f.created_at
             FROM complaint_files cf JOIN files f ON f.id = cf.file_id WHERE cf.complaint_id = ?',
            [$row['id']]
        );
        Http::json([
            'complaint'   => self::shape($row),
            'updates'     => array_map(static fn ($r) => [
                'id' => (int) $r['id'], 'status' => $r['status'], 'note' => $r['note'],
                'author_name' => $r['author_name'], 'created_at' => $r['created_at'],
            ], $updates),
            'attachments' => array_map(static fn ($r) => [
                'file_id' => (int) $r['id'], 'original_name' => $r['original_name'],
                'mime' => $r['mime'], 'size_bytes' => (int) $r['size_bytes'], 'created_at' => $r['created_at'],
            ], $files),
        ]);
    }

    /** POST /complaints — residents report for their own apartment. */
    public static function store(): void
    {
        $u    = Auth::require();
        $body = Http::body();
        $title    = Validator::str($body, 'title', true, 190);
        $category = Validator::enum($body, 'category', self::CATEGORIES, false, 'other');
        $urgency  = Validator::enum($body, 'urgency', ['low', 'normal', 'high', 'critical'], false, 'normal');
        $desc     = Validator::str($body, 'description', false, 4000);
        $location = Validator::str($body, 'location', false, 190);

        $apartmentId = Auth::isManager($u)
            ? (Validator::int($body, 'apartment_id', false) ?? ($u['apartment_id'] !== null ? (int) $u['apartment_id'] : null))
            : (int) $u['apartment_id'];
        if ($apartmentId === null) throw new ApiError(422, 'validation_failed', 'Apartment required', ['apartment_id' => 'required']);

        $id = Db::insert(
            'INSERT INTO complaints (title, category, description, reporter_id, apartment_id, location, urgency, status)
             VALUES (?,?,?,?,?,?,?,"submitted")',
            [$title, $category, $desc, $u['id'], $apartmentId, $location, $urgency]
        );
        Db::exec('INSERT INTO complaint_updates (complaint_id, status, note, author_id) VALUES (?,?,?,?)',
            [$id, 'submitted', $desc, $u['id']]);
        Audit::log((int) $u['id'], 'complaint.create', 'complaint', (string) $id, null, ['title' => $title, 'category' => $category, 'urgency' => $urgency]);

        // let every manager know
        foreach (Db::all('SELECT user_id FROM user_roles WHERE role = "manager"') as $m) {
            Db::exec(
                'INSERT INTO notifications (user_id, kind, title_ar, title_fr, body_ar, body_fr, link, priority) VALUES (?,?,?,?,?,?,?,?)',
                [$m['user_id'], 'complaint', 'شكوى جديدة', 'Nouvelle réclamation', $title, $title, '/complaints/' . $id,
                 $urgency === 'critical' ? 'high' : 'normal']
            );
        }
        Http::json(['id' => $id], 201);
    }

    /** PATCH /complaints/{id} — manager only: status, assignment, response. */
    public static function update(array $p): void
    {
        $m    = Auth::requireManager();
        $id   = (int) $p['id'];
        $row  = Db::one('SELECT * FROM complaints WHERE id = ?', [$id]);
        if (!$row) throw new ApiError(404, 'not_found', 'Complaint not found');
        $body = Http::body();

        $fields = [];
        $args   = [];
        $status = isset($body['status']) ? Validator::enum($body, 'status', self::STATUSES) : null;
        if ($status !== null)                 { $fields[] = 'status = ?';           $args[] = $status; }
        if (array_key_exists('manager_response', $body)) {
            $fields[] = 'manager_response = ?'; $args[] = Validator::str($body, 'manager_response', false, 4000);
        }
        if (array_key_exists('assigned_to', $body)) {
            $assignee = Validator::int($body, 'assigned_to', false);
            if ($assignee !== null && !Db::one('SELECT id FROM users WHERE id = ?', [$assignee])) {
                throw new ApiError(422, 'validation_failed', 'Unknown assignee', ['assigned_to' => 'unknown']);
            }
            $fields[] = 'assigned_to = ?'; $args[] = $assignee;
        }
        if ($status === 'resolved') { $fields[] = 'resolved_at = NOW()'; }
        if (!$fields) throw new ApiError(422, 'validation_failed', 'Nothing to update');

        $pdo = Db::conn();
        $pdo->beginTransaction();
        try {
            $args[] = $id;
            Db::exec('UPDATE complaints SET ' . implode(', ', $fields) . ' WHERE id = ?', $args);
            if ($status !== null) {
                Db::exec('INSERT INTO complaint_updates (complaint_id, status, note, author_id) VALUES (?,?,?,?)',
                    [$id, $status, $body['note'] ?? null, $m['id']]);
                if ($row['apartment_id']) {
                    NotificationsController::notifyApartment(
                        (int) $row['apartment_id'], 'complaint',
                        'تحديث حالة الشكوى', 'Mise à jour de votre réclamation',
                        (string) $row['title'], (string) $row['title'], '/complaints/' . $id
                    );
                }
            }
            Audit::log((int) $m['id'], 'complaint.update', 'complaint', (string) $id,
                ['status' => $row['status'], 'assigned_to' => $row['assigned_to']],
                ['status' => $status ?? $row['status']]);
            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $e;
        }
        Http::json(['ok' => true]);
    }

    /** POST /complaints/{id}/notes — manager note or resident follow-up. */
    public static function addNote(array $p): void
    {
        $u    = Auth::require();
        $row  = self::load((int) $p['id'], $u);
        $note = Validator::str(Http::body(), 'note', true, 2000);
        Db::exec('INSERT INTO complaint_updates (complaint_id, status, note, author_id) VALUES (?,?,?,?)',
            [$row['id'], $row['status'], $note, $u['id']]);
        Audit::log((int) $u['id'], 'complaint.note', 'complaint', (string) $row['id'], null, null);
        if (Auth::isManager($u) && $row['apartment_id']) {
            NotificationsController::notifyApartment((int) $row['apartment_id'], 'complaint',
                'رد جديد على الشكوى', 'Nouvelle réponse à votre réclamation',
                (string) $row['title'], (string) $row['title'], '/complaints/' . $row['id']);
        }
        Http::json(['ok' => true], 201);
    }

    /** POST /complaints/{id}/attachments — multipart evidence upload. */
    public static function addAttachment(array $p): void
    {
        $u   = Auth::require();
        $row = self::load((int) $p['id'], $u);
        $file = $_FILES['file'] ?? null;
        if (!is_array($file)) throw new ApiError(422, 'validation_failed', 'No file received', ['file' => 'required']);

        $pdo = Db::conn();
        $pdo->beginTransaction();
        $saved = null;
        try {
            $saved = FilesController::saveUpload($file, (int) $u['id'], 'apartment', (int) $row['apartment_id']);
            Db::exec('INSERT INTO complaint_files (complaint_id, file_id) VALUES (?,?)', [$row['id'], $saved['id']]);
            Audit::log((int) $u['id'], 'complaint.attachment', 'complaint', (string) $row['id'], null,
                ['file_id' => $saved['id'], 'mime' => $saved['mime'], 'size_bytes' => $saved['size_bytes']]);
            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            if ($saved) @unlink($saved['path']);
            throw $e;
        }
        Http::json(['file_id' => $saved['id']], 201);
    }

    /** GET /complaints/{id}/attachments/{fileId}/download */
    public static function downloadAttachment(array $p): void
    {
        $u   = Auth::require();
        $row = self::load((int) $p['id'], $u);
        $file = Db::one(
            'SELECT f.* FROM complaint_files cf JOIN files f ON f.id = cf.file_id WHERE cf.complaint_id = ? AND f.id = ?',
            [$row['id'], (int) $p['fileId']]
        );
        if (!$file) throw new ApiError(404, 'not_found', 'Attachment not found');
        Audit::log((int) $u['id'], 'complaint.attachment_download', 'complaint', (string) $row['id'], null, ['file_id' => (int) $file['id']]);
        FilesController::streamFile($file);
    }
}
