<?php
namespace App\Http\Controllers;

use App\Support\{ApiError, Audit, Auth, Config, Db, Http, Validator};

/**
 * Secure file storage.
 *
 * - Uploads are stored OUTSIDE the web root (config uploads_dir) under a random
 *   name; the original name is only kept as metadata in the `files` table.
 * - MIME type and size are validated server-side from the real file contents,
 *   never from the client-supplied Content-Type.
 * - Downloads are streamed by the API after an authorization check; the
 *   filesystem path is never exposed to the client.
 */
final class FilesController
{
    /** mime => extension */
    private const ALLOWED = [
        'image/jpeg'       => 'jpg',
        'image/png'        => 'png',
        'image/webp'       => 'webp',
        'application/pdf'  => 'pdf',
    ];

    private const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

    private static function dir(): string
    {
        $dir = (string) Config::get('uploads_dir');
        if (!is_dir($dir)) @mkdir($dir, 0770, true);
        return rtrim($dir, '/\\');
    }

    /** GET /files — documents the caller is allowed to see. */
    public static function index(): void
    {
        $u = Auth::require();
        $sql = 'SELECT d.id AS document_id, d.title, d.category, f.id AS file_id, f.original_name, f.mime,
                       f.size_bytes, f.visibility, f.apartment_id, f.created_at, u.full_name AS uploaded_by,
                       a.number AS apartment_number
                FROM documents d
                JOIN files f ON f.id = d.file_id
                LEFT JOIN users u ON u.id = f.owner_id
                LEFT JOIN apartments a ON a.id = f.apartment_id';
        $args = [];
        if (!Auth::isManager($u)) {
            $sql .= ' WHERE (f.visibility = "all_residents" OR (f.visibility = "apartment" AND f.apartment_id = ?))';
            $args[] = $u['apartment_id'];
        }
        $sql .= ' ORDER BY d.id DESC LIMIT 200';
        $rows = Db::all($sql, $args);
        Http::json(array_map(static fn ($r) => [
            'id'               => (int) $r['document_id'],
            'file_id'          => (int) $r['file_id'],
            'title'            => $r['title'],
            'category'         => $r['category'],
            'original_name'    => $r['original_name'],
            'mime'             => $r['mime'],
            'size_bytes'       => (int) $r['size_bytes'],
            'visibility'       => $r['visibility'],
            'apartment_id'     => $r['apartment_id'] !== null ? (int) $r['apartment_id'] : null,
            'apartment_number' => $r['apartment_number'] ?? null,
            'uploaded_by'      => $r['uploaded_by'],
            'created_at'       => $r['created_at'],
        ], $rows));

    }

    /** POST /files — multipart upload, manager only. */
    public static function store(): void
    {
        $m = Auth::requireManager();

        $file = $_FILES['file'] ?? null;
        if (!$file || !is_array($file) || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            throw new ApiError(422, 'validation_failed', 'No file received', ['file' => 'required']);
        }
        $tmp = (string) $file['tmp_name'];
        if (!is_uploaded_file($tmp)) throw new ApiError(400, 'bad_request', 'Invalid upload');

        $size = (int) ($file['size'] ?? 0);
        if ($size <= 0) throw new ApiError(422, 'validation_failed', 'Empty file', ['file' => 'empty']);
        if ($size > self::MAX_BYTES) {
            throw new ApiError(413, 'file_too_large', 'Maximum file size is 8 MB', ['file' => 'max_size']);
        }

        // Detect the real MIME from the contents, ignoring the client header.
        $finfo = new \finfo(FILEINFO_MIME_TYPE);
        $mime  = (string) $finfo->file($tmp);
        if (!isset(self::ALLOWED[$mime])) {
            throw new ApiError(415, 'unsupported_type', 'Only JPEG, PNG, WebP and PDF files are allowed', ['file' => 'mime']);
        }

        $title      = Validator::str(['title' => $_POST['title'] ?? ''], 'title', true, 190);
        $category   = Validator::str(['category' => $_POST['category'] ?? ''], 'category', false, 64);
        $visibility = Validator::enum(['visibility' => $_POST['visibility'] ?? ''], 'visibility', ['manager', 'all_residents', 'apartment'], false, 'all_residents');

        $apartmentId = null;
        if ($visibility === 'apartment') {
            $apartmentId = (int) ($_POST['apartment_id'] ?? 0);
            $exists = $apartmentId > 0 ? Db::one('SELECT id FROM apartments WHERE id = ?', [$apartmentId]) : null;
            if (!$exists) {
                throw new ApiError(422, 'validation_error', 'A valid apartment is required', ['apartment_id' => 'required']);
            }
        }

        $original = mb_substr(basename((string) ($file['name'] ?? 'file')), 0, 190);
        $stored   = bin2hex(random_bytes(16)) . '.' . self::ALLOWED[$mime];
        $target   = self::dir() . DIRECTORY_SEPARATOR . $stored;
        if (!move_uploaded_file($tmp, $target)) {
            throw new ApiError(500, 'server_error', 'Could not store the file');
        }
        @chmod($target, 0640);

        $pdo = Db::conn();
        $pdo->beginTransaction();
        try {
            $fileId = Db::insert(
                'INSERT INTO files (stored_name, original_name, mime, size_bytes, owner_id, visibility, apartment_id) VALUES (?,?,?,?,?,?,?)',
                [$stored, $original, $mime, $size, $m['id'], $visibility, $apartmentId]
            );
            $docId = Db::insert('INSERT INTO documents (title, file_id, category) VALUES (?,?,?)', [$title, $fileId, $category]);
            Audit::log((int) $m['id'], 'file_upload', 'document', (string) $docId, null, [
                'title' => $title, 'mime' => $mime, 'size_bytes' => $size, 'visibility' => $visibility, 'apartment_id' => $apartmentId,
            ]);

            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            @unlink($target);
            throw $e;
        }
        Http::json(['id' => $docId, 'file_id' => $fileId], 201);
    }

    /** GET /files/{id}/download — streams the file after an authorization check. */
    public static function download(array $p): void
    {
        $u   = Auth::require();
        $id  = (int) $p['id'];
        $row = Db::one(
            'SELECT f.* FROM documents d JOIN files f ON f.id = d.file_id WHERE d.id = ?',
            [$id]
        );
        if (!$row) throw new ApiError(404, 'not_found', 'Document not found');
        if (!Auth::isManager($u)) {
            $allowed = $row['visibility'] === 'all_residents'
                || ($row['visibility'] === 'apartment' && (int) ($row['apartment_id'] ?? 0) === (int) ($u['apartment_id'] ?? -1));
            if (!$allowed) throw new ApiError(403, 'forbidden', 'Not allowed to read this document');
        }

        $path = self::dir() . DIRECTORY_SEPARATOR . basename((string) $row['stored_name']);
        if (!is_file($path)) throw new ApiError(404, 'not_found', 'File missing on server');

        header('Content-Type: ' . $row['mime']);
        header('Content-Length: ' . (string) filesize($path));
        header('Content-Disposition: attachment; filename="' . preg_replace('/[^\w.\- ]/u', '_', (string) $row['original_name']) . '"');
        header('X-Content-Type-Options: nosniff');
        header('Cache-Control: private, no-store');
        readfile($path);
        exit;
    }

    /** DELETE /files/{id} — manager only; removes metadata and the stored file. */
    public static function destroy(array $p): void
    {
        $m   = Auth::requireManager();
        $id  = (int) $p['id'];
        $row = Db::one('SELECT d.id AS document_id, d.title, f.id AS file_id, f.stored_name FROM documents d JOIN files f ON f.id = d.file_id WHERE d.id = ?', [$id]);
        if (!$row) throw new ApiError(404, 'not_found', 'Document not found');
        Db::exec('DELETE FROM documents WHERE id = ?', [$id]);
        Db::exec('DELETE FROM files WHERE id = ?', [$row['file_id']]);
        @unlink(self::dir() . DIRECTORY_SEPARATOR . basename((string) $row['stored_name']));
        Audit::log((int) $m['id'], 'file_delete', 'document', (string) $id, ['title' => $row['title']], null);
        Http::json(['ok' => true]);
    }

    /**
     * Shared secure upload used by other modules (complaint evidence, meeting
     * minutes...). Validates size and real MIME type, stores the bytes outside
     * the web root under a random name and returns the new `files` row id.
     */
    public static function saveUpload(array $file, ?int $ownerId, string $visibility, ?int $apartmentId = null): array
    {
        if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            throw new ApiError(422, 'validation_failed', 'No file received', ['file' => 'required']);
        }
        $tmp = (string) $file['tmp_name'];
        if (!is_uploaded_file($tmp)) throw new ApiError(400, 'bad_request', 'Invalid upload');
        $size = (int) ($file['size'] ?? 0);
        if ($size <= 0) throw new ApiError(422, 'validation_failed', 'Empty file', ['file' => 'empty']);
        if ($size > self::MAX_BYTES) throw new ApiError(413, 'file_too_large', 'Maximum file size is 8 MB', ['file' => 'max_size']);

        $finfo = new \finfo(FILEINFO_MIME_TYPE);
        $mime  = (string) $finfo->file($tmp);
        if (!isset(self::ALLOWED[$mime])) {
            throw new ApiError(415, 'unsupported_type', 'Only JPEG, PNG, WebP and PDF files are allowed', ['file' => 'mime']);
        }
        $original = mb_substr(basename((string) ($file['name'] ?? 'file')), 0, 190);
        $stored   = bin2hex(random_bytes(16)) . '.' . self::ALLOWED[$mime];
        $target   = self::dir() . DIRECTORY_SEPARATOR . $stored;
        if (!move_uploaded_file($tmp, $target)) throw new ApiError(500, 'server_error', 'Could not store the file');
        @chmod($target, 0640);

        $fileId = Db::insert(
            'INSERT INTO files (stored_name, original_name, mime, size_bytes, owner_id, visibility, apartment_id) VALUES (?,?,?,?,?,?,?)',
            [$stored, $original, $mime, $size, $ownerId, $visibility, $apartmentId]
        );
        return ['id' => $fileId, 'stored_name' => $stored, 'original_name' => $original, 'mime' => $mime, 'size_bytes' => $size, 'path' => $target];
    }

    /** Streams a raw `files` row after the caller has already been authorized. */
    public static function streamFile(array $file): void
    {
        $path = self::dir() . DIRECTORY_SEPARATOR . basename((string) $file['stored_name']);
        if (!is_file($path)) throw new ApiError(404, 'not_found', 'File missing on server');
        header('Content-Type: ' . $file['mime']);
        header('Content-Length: ' . (string) filesize($path));
        header('Content-Disposition: attachment; filename="' . preg_replace('/[^\w.\- ]/u', '_', (string) $file['original_name']) . '"');
        header('X-Content-Type-Options: nosniff');
        header('Cache-Control: private, no-store');
        readfile($path);
        exit;
    }

    public static function deleteFile(int $fileId): void
    {
        $row = Db::one('SELECT stored_name FROM files WHERE id = ?', [$fileId]);
        if (!$row) return;
        Db::exec('DELETE FROM files WHERE id = ?', [$fileId]);
        @unlink(self::dir() . DIRECTORY_SEPARATOR . basename((string) $row['stored_name']));
    }
}

