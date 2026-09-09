<?php
namespace App\Http\Controllers;

use App\Support\{Auth, Db, Http};

/** Read-only audit trail. Manager only. */
final class AuditController
{
    public static function index(): void
    {
        Auth::requireManager();
        $entity = isset($_GET['entity']) && $_GET['entity'] !== '' ? (string) $_GET['entity'] : null;
        $action = isset($_GET['action']) && $_GET['action'] !== '' ? (string) $_GET['action'] : null;
        $actor  = isset($_GET['actor_id']) && $_GET['actor_id'] !== '' ? (int) $_GET['actor_id'] : null;
        $from   = isset($_GET['from']) && $_GET['from'] !== '' ? (string) $_GET['from'] : null;
        $to     = isset($_GET['to']) && $_GET['to'] !== '' ? (string) $_GET['to'] : null;
        $limit  = isset($_GET['limit']) ? max(1, min(500, (int) $_GET['limit'])) : 100;
        $sql  = 'SELECT l.id, l.actor_id, u.full_name AS actor_name, l.action, l.entity, l.entity_id,
                        l.before_json, l.after_json, l.ip, l.created_at
                 FROM audit_logs l LEFT JOIN users u ON u.id = l.actor_id WHERE 1=1';
        $args = [];
        if ($entity) { $sql .= ' AND l.entity = ?'; $args[] = $entity; }
        if ($action) { $sql .= ' AND l.action = ?'; $args[] = $action; }
        if ($actor)  { $sql .= ' AND l.actor_id = ?'; $args[] = $actor; }
        if ($from && preg_match('/^\d{4}-\d{2}-\d{2}$/', $from)) { $sql .= ' AND l.created_at >= ?'; $args[] = $from . ' 00:00:00'; }
        if ($to && preg_match('/^\d{4}-\d{2}-\d{2}$/', $to))     { $sql .= ' AND l.created_at <= ?'; $args[] = $to . ' 23:59:59'; }
        $sql .= ' ORDER BY l.id DESC LIMIT ' . $limit;

        $rows = Db::all($sql, $args);
        Http::json(array_map(static fn ($r) => [
            'id'         => (int) $r['id'],
            'actor_id'   => $r['actor_id'] !== null ? (int) $r['actor_id'] : null,
            'actor_name' => $r['actor_name'],
            'action'     => $r['action'],
            'entity'     => $r['entity'],
            'entity_id'  => $r['entity_id'],
            'before'     => $r['before_json'] !== null ? json_decode((string) $r['before_json'], true) : null,
            'after'      => $r['after_json'] !== null ? json_decode((string) $r['after_json'], true) : null,
            'ip'         => $r['ip'],
            'created_at' => $r['created_at'],
        ], $rows));
    }
}
