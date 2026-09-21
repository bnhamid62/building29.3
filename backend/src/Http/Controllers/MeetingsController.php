<?php
namespace App\Http\Controllers;

use App\Support\{ApiError, Audit, Auth, Db, Http, Validator};

/**
 * General-assembly meetings: agenda, attendance, minutes and documents.
 * Residents read meetings and answer for their own apartment only.
 */
final class MeetingsController
{
    private static function shape(array $r): array
    {
        return [
            'id'         => (int) $r['id'],
            'title_ar'   => $r['title_ar'],
            'title_fr'   => $r['title_fr'],
            'starts_at'  => $r['starts_at'],
            'location'   => $r['location'],
            'agenda_ar'  => $r['agenda_ar'],
            'agenda_fr'  => $r['agenda_fr'],
            'minutes_ar' => $r['minutes_ar'],
            'minutes_fr' => $r['minutes_fr'],
            'decisions'  => $r['decisions'],
            'status'     => $r['status'],
        ];
    }

    /** GET /meetings */
    public static function index(): void
    {
        Auth::require();
        $rows = Db::all('SELECT * FROM meetings ORDER BY starts_at DESC LIMIT 200');
        Http::json(array_map(self::shape(...), $rows));
    }

    /** GET /meetings/{id} */
    public static function show(array $p): void
    {
        $u   = Auth::require();
        $row = Db::one('SELECT * FROM meetings WHERE id = ?', [(int) $p['id']]);
        if (!$row) throw new ApiError(404, 'not_found', 'Meeting not found');
        $manager = Auth::isManager($u);

        $attendance = $manager
            ? Db::all('SELECT ma.apartment_id, a.number AS apartment_number, ma.attended, ma.response
                       FROM meeting_attendance ma JOIN apartments a ON a.id = ma.apartment_id
                       WHERE ma.meeting_id = ? ORDER BY a.number', [$row['id']])
            : Db::all('SELECT ma.apartment_id, a.number AS apartment_number, ma.attended, ma.response
                       FROM meeting_attendance ma JOIN apartments a ON a.id = ma.apartment_id
                       WHERE ma.meeting_id = ? AND ma.apartment_id = ?', [$row['id'], $u['apartment_id']]);

        $docs = Db::all(
            'SELECT md.file_id, md.title, f.original_name, f.mime, f.size_bytes, f.visibility
             FROM meeting_documents md JOIN files f ON f.id = md.file_id WHERE md.meeting_id = ?',
            [$row['id']]
        );
        $docs = array_values(array_filter($docs, static fn ($d) => $manager || $d['visibility'] !== 'manager'));

        Http::json([
            'meeting'    => self::shape($row),
            'attendance' => array_map(static fn ($a) => [
                'apartment_id' => (int) $a['apartment_id'], 'apartment_number' => $a['apartment_number'],
                'attended' => (bool) $a['attended'], 'response' => $a['response'],
            ], $attendance),
            'documents'  => array_map(static fn ($d) => [
                'file_id' => (int) $d['file_id'], 'title' => $d['title'],
                'original_name' => $d['original_name'], 'mime' => $d['mime'], 'size_bytes' => (int) $d['size_bytes'],
            ], $docs),
        ]);
    }

    /** POST /meetings — manager only. */
    public static function store(): void
    {
        $m    = Auth::requireManager();
        $body = Http::body();
        $startsAt = Validator::str($body, 'starts_at', true, 32);
        if (strtotime($startsAt) === false) throw new ApiError(422, 'validation_failed', 'Invalid date', ['starts_at' => 'datetime']);
        $id = Db::insert(
            'INSERT INTO meetings (title_ar, title_fr, starts_at, location, agenda_ar, agenda_fr, status) VALUES (?,?,?,?,?,?,"scheduled")',
            [
                Validator::str($body, 'title_ar', true, 190),
                Validator::str($body, 'title_fr', true, 190),
                date('Y-m-d H:i:s', strtotime($startsAt)),
                Validator::str($body, 'location', false, 190),
                Validator::str($body, 'agenda_ar', false, 4000),
                Validator::str($body, 'agenda_fr', false, 4000),
            ]
        );
        Audit::log((int) $m['id'], 'meeting.create', 'meeting', (string) $id, null, ['starts_at' => $startsAt]);
        foreach (Db::all('SELECT id FROM apartments') as $a) {
            NotificationsController::notifyApartment((int) $a['id'], 'meeting', 'اجتماع جديد', 'Nouvelle réunion',
                (string) $body['title_ar'], (string) $body['title_fr'], '/meetings/' . $id);
        }
        Http::json(['id' => $id], 201);
    }

    /** PATCH /meetings/{id} — manager only. */
    public static function update(array $p): void
    {
        $m   = Auth::requireManager();
        $id  = (int) $p['id'];
        $row = Db::one('SELECT * FROM meetings WHERE id = ?', [$id]);
        if (!$row) throw new ApiError(404, 'not_found', 'Meeting not found');
        $body = Http::body();

        $fields = []; $args = [];
        foreach (['title_ar', 'title_fr', 'location', 'agenda_ar', 'agenda_fr', 'minutes_ar', 'minutes_fr', 'decisions'] as $key) {
            if (array_key_exists($key, $body)) { $fields[] = "$key = ?"; $args[] = Validator::str($body, $key, false, 8000); }
        }
        if (!empty($body['starts_at'])) {
            $ts = strtotime((string) $body['starts_at']);
            if ($ts === false) throw new ApiError(422, 'validation_failed', 'Invalid date', ['starts_at' => 'datetime']);
            $fields[] = 'starts_at = ?'; $args[] = date('Y-m-d H:i:s', $ts);
        }
        if (isset($body['status'])) { $fields[] = 'status = ?'; $args[] = Validator::enum($body, 'status', ['scheduled', 'held', 'cancelled']); }
        if (!$fields) throw new ApiError(422, 'validation_failed', 'Nothing to update');
        $args[] = $id;
        Db::exec('UPDATE meetings SET ' . implode(', ', $fields) . ' WHERE id = ?', $args);
        Audit::log((int) $m['id'], 'meeting.update', 'meeting', (string) $id, ['status' => $row['status']], ['status' => $body['status'] ?? $row['status']]);
        Http::json(['ok' => true]);
    }

    /** POST /meetings/{id}/attendance — manager marks presence, resident answers. */
    public static function attendance(array $p): void
    {
        $u    = Auth::require();
        $id   = (int) $p['id'];
        if (!Db::one('SELECT id FROM meetings WHERE id = ?', [$id])) throw new ApiError(404, 'not_found', 'Meeting not found');
        $body = Http::body();

        if (Auth::isManager($u)) {
            $apartmentId = Validator::int($body, 'apartment_id', true);
            $attended    = !empty($body['attended']) ? 1 : 0;
            Db::exec(
                'INSERT INTO meeting_attendance (meeting_id, apartment_id, attended) VALUES (?,?,?)
                 ON DUPLICATE KEY UPDATE attended = VALUES(attended)',
                [$id, $apartmentId, $attended]
            );
            Audit::log((int) $u['id'], 'meeting.attendance', 'meeting', (string) $id, null, ['apartment_id' => $apartmentId, 'attended' => $attended]);
        } else {
            $response = Validator::enum($body, 'response', ['yes', 'no', 'maybe']);
            Db::exec(
                'INSERT INTO meeting_attendance (meeting_id, apartment_id, response, responded_at) VALUES (?,?,?,NOW())
                 ON DUPLICATE KEY UPDATE response = VALUES(response), responded_at = NOW()',
                [$id, (int) $u['apartment_id'], $response]
            );
        }
        Http::json(['ok' => true]);
    }

    /** POST /meetings/{id}/documents — manager uploads minutes / agenda files. */
    public static function addDocument(array $p): void
    {
        $m  = Auth::requireManager();
        $id = (int) $p['id'];
        if (!Db::one('SELECT id FROM meetings WHERE id = ?', [$id])) throw new ApiError(404, 'not_found', 'Meeting not found');
        $file = $_FILES['file'] ?? null;
        if (!is_array($file)) throw new ApiError(422, 'validation_failed', 'No file received', ['file' => 'required']);
        $visibility = ($_POST['visibility'] ?? 'all_residents') === 'manager' ? 'manager' : 'all_residents';
        $title = mb_substr((string) ($_POST['title'] ?? 'Document'), 0, 190);

        $saved = FilesController::saveUpload($file, (int) $m['id'], $visibility, null);
        Db::exec('INSERT INTO meeting_documents (meeting_id, file_id, title) VALUES (?,?,?)', [$id, $saved['id'], $title]);
        Audit::log((int) $m['id'], 'meeting.document', 'meeting', (string) $id, null, ['file_id' => $saved['id'], 'visibility' => $visibility]);
        Http::json(['file_id' => $saved['id']], 201);
    }

    /** GET /meetings/{id}/documents/{fileId}/download */
    public static function downloadDocument(array $p): void
    {
        $u = Auth::require();
        $row = Db::one(
            'SELECT f.* FROM meeting_documents md JOIN files f ON f.id = md.file_id WHERE md.meeting_id = ? AND f.id = ?',
            [(int) $p['id'], (int) $p['fileId']]
        );
        if (!$row) throw new ApiError(404, 'not_found', 'Document not found');
        if ($row['visibility'] === 'manager' && !Auth::isManager($u)) throw new ApiError(403, 'forbidden', 'Not allowed');
        Audit::log((int) $u['id'], 'meeting.document_download', 'meeting', (string) (int) $p['id'], null, ['file_id' => (int) $row['id']]);
        FilesController::streamFile($row);
    }
}
