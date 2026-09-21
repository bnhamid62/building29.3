<?php
namespace App\Http\Controllers;

use App\Support\{ApiError, Audit, Auth, Db, Http, Validator};

/**
 * Votes / elections.
 *
 * One ballot per apartment, enforced by a UNIQUE key plus a locking
 * transaction — the frontend restriction is only cosmetic. Draft votes are
 * invisible to residents, and results are hidden until the vote allows them.
 */
final class VotesController
{
    private static function shape(array $r, bool $manager, bool $hasVoted, ?int $myOption): array
    {
        $open = $r['status'] === 'open'
            && strtotime((string) $r['starts_at']) <= time()
            && strtotime((string) $r['ends_at']) >= time();
        return [
            'id'             => (int) $r['id'],
            'title_ar'       => $r['title_ar'],
            'title_fr'       => $r['title_fr'],
            'description_ar' => $r['description_ar'],
            'description_fr' => $r['description_fr'],
            'status'         => $r['status'],
            'anonymous'      => (bool) $r['anonymous'],
            'live_results'   => (bool) $r['live_results'],
            'starts_at'      => $r['starts_at'],
            'ends_at'        => $r['ends_at'],
            'final_decision' => $r['final_decision'],
            'is_open'        => $open,
            'can_vote'       => $open && !$manager && !$hasVoted,
            'has_voted'      => $hasVoted,
            'my_option_id'   => $myOption,
            'ballots_count'  => (int) ($r['ballots_count'] ?? 0),
        ];
    }

    private static function context(array $u, array $row): array
    {
        $manager = Auth::isManager($u);
        $mine = null;
        if (!$manager && $u['apartment_id'] !== null) {
            $mine = Db::one('SELECT option_id FROM vote_responses WHERE vote_id = ? AND apartment_id = ?', [$row['id'], $u['apartment_id']]);
        }
        return [$manager, $mine !== null, $mine ? (int) $mine['option_id'] : null];
    }

    /** GET /votes */
    public static function index(): void
    {
        $u = Auth::require();
        $manager = Auth::isManager($u);
        $sql = 'SELECT v.*, (SELECT COUNT(*) FROM vote_responses r WHERE r.vote_id = v.id) AS ballots_count FROM votes v';
        if (!$manager) $sql .= ' WHERE v.status <> "draft"';
        $sql .= ' ORDER BY v.starts_at DESC, v.id DESC LIMIT 200';
        $rows = Db::all($sql);
        $out = [];
        foreach ($rows as $r) {
            [$isManager, $voted, $option] = self::context($u, $r);
            $out[] = self::shape($r, $isManager, $voted, $option);
        }
        Http::json($out);
    }

    /** GET /votes/{id} — includes options and, when permitted, results. */
    public static function show(array $p): void
    {
        $u   = Auth::require();
        $row = Db::one('SELECT v.*, (SELECT COUNT(*) FROM vote_responses r WHERE r.vote_id = v.id) AS ballots_count FROM votes v WHERE v.id = ?', [(int) $p['id']]);
        if (!$row) throw new ApiError(404, 'not_found', 'Vote not found');
        [$manager, $voted, $option] = self::context($u, $row);
        if (!$manager && $row['status'] === 'draft') throw new ApiError(403, 'forbidden', 'Vote not published');

        $showResults = $manager || (bool) $row['live_results'] || $row['status'] === 'closed';
        $options = Db::all(
            'SELECT o.id, o.label_ar, o.label_fr, (SELECT COUNT(*) FROM vote_responses r WHERE r.option_id = o.id) AS tally
             FROM vote_options o WHERE o.vote_id = ? ORDER BY o.id',
            [$row['id']]
        );
        $eligible = (int) (Db::one('SELECT COUNT(*) AS c FROM apartments')['c'] ?? 0);
        Http::json([
            'vote'    => self::shape($row, $manager, $voted, $option) + ['results_visible' => $showResults, 'eligible_apartments' => $eligible],
            'options' => array_map(static fn ($o) => [
                'id'       => (int) $o['id'],
                'label_ar' => $o['label_ar'],
                'label_fr' => $o['label_fr'],
                'tally'    => $showResults ? (int) $o['tally'] : null,
            ], $options),
        ]);
    }

    /** POST /votes — manager only. */
    public static function store(): void
    {
        $m    = Auth::requireManager();
        $body = Http::body();
        $titleAr = Validator::str($body, 'title_ar', true, 190);
        $titleFr = Validator::str($body, 'title_fr', true, 190);
        $startsAt = Validator::str($body, 'starts_at', true, 32);
        $endsAt   = Validator::str($body, 'ends_at', true, 32);
        if (strtotime($startsAt) === false || strtotime($endsAt) === false) {
            throw new ApiError(422, 'validation_failed', 'Invalid dates', ['starts_at' => 'datetime']);
        }
        if (strtotime($endsAt) <= strtotime($startsAt)) {
            throw new ApiError(422, 'validation_failed', 'End must be after start', ['ends_at' => 'after_start']);
        }
        $options = is_array($body['options'] ?? null) ? $body['options'] : [];
        if (count($options) < 2) throw new ApiError(422, 'validation_failed', 'At least two options', ['options' => 'min']);
        if (count($options) > 10) throw new ApiError(422, 'validation_failed', 'Too many options', ['options' => 'max']);

        $pdo = Db::conn();
        $pdo->beginTransaction();
        try {
            $id = Db::insert(
                'INSERT INTO votes (title_ar, title_fr, description_ar, description_fr, anonymous, live_results, starts_at, ends_at, status, created_by)
                 VALUES (?,?,?,?,?,?,?,?,?,?)',
                [
                    $titleAr, $titleFr,
                    Validator::str($body, 'description_ar', false, 4000),
                    Validator::str($body, 'description_fr', false, 4000),
                    !empty($body['anonymous']) ? 1 : 0,
                    !empty($body['live_results']) ? 1 : 0,
                    date('Y-m-d H:i:s', strtotime($startsAt)),
                    date('Y-m-d H:i:s', strtotime($endsAt)),
                    ($body['status'] ?? 'draft') === 'open' ? 'open' : 'draft',
                    $m['id'],
                ]
            );
            foreach ($options as $o) {
                $ar = Validator::str(['v' => $o['label_ar'] ?? ''], 'v', true, 190);
                $fr = Validator::str(['v' => $o['label_fr'] ?? ($o['label_ar'] ?? '')], 'v', true, 190);
                Db::exec('INSERT INTO vote_options (vote_id, label_ar, label_fr) VALUES (?,?,?)', [$id, $ar, $fr]);
            }
            Audit::log((int) $m['id'], 'vote.create', 'vote', (string) $id, null, ['title_fr' => $titleFr, 'options' => count($options)]);
            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $e;
        }
        Http::json(['id' => $id], 201);
    }

    /** PATCH /votes/{id} — manager: publish, close, record the final decision. */
    public static function update(array $p): void
    {
        $m   = Auth::requireManager();
        $id  = (int) $p['id'];
        $row = Db::one('SELECT * FROM votes WHERE id = ?', [$id]);
        if (!$row) throw new ApiError(404, 'not_found', 'Vote not found');
        $body = Http::body();

        $fields = []; $args = [];
        if (isset($body['status'])) {
            $status = Validator::enum($body, 'status', ['draft', 'open', 'closed']);
            if ($row['status'] === 'closed' && $status !== 'closed') {
                throw new ApiError(409, 'vote_closed', 'A closed vote cannot be reopened');
            }
            $fields[] = 'status = ?'; $args[] = $status;
        }
        foreach (['title_ar', 'title_fr', 'description_ar', 'description_fr', 'final_decision'] as $key) {
            if (array_key_exists($key, $body)) { $fields[] = "$key = ?"; $args[] = Validator::str($body, $key, false, 4000); }
        }
        foreach (['starts_at', 'ends_at'] as $key) {
            if (!empty($body[$key])) {
                $ts = strtotime((string) $body[$key]);
                if ($ts === false) throw new ApiError(422, 'validation_failed', 'Invalid date', [$key => 'datetime']);
                $fields[] = "$key = ?"; $args[] = date('Y-m-d H:i:s', $ts);
            }
        }
        if (isset($body['live_results'])) { $fields[] = 'live_results = ?'; $args[] = !empty($body['live_results']) ? 1 : 0; }
        if (!$fields) throw new ApiError(422, 'validation_failed', 'Nothing to update');

        $args[] = $id;
        Db::exec('UPDATE votes SET ' . implode(', ', $fields) . ' WHERE id = ?', $args);
        Audit::log((int) $m['id'], 'vote.update', 'vote', (string) $id, ['status' => $row['status']], ['status' => $body['status'] ?? $row['status']]);

        if (($body['status'] ?? null) === 'open' && $row['status'] !== 'open') {
            foreach (Db::all('SELECT id FROM apartments') as $a) {
                NotificationsController::notifyApartment((int) $a['id'], 'vote', 'تصويت جديد', 'Nouveau vote',
                    (string) $row['title_ar'], (string) $row['title_fr'], '/votes/' . $id);
            }
        }
        Http::json(['ok' => true]);
    }

    /** POST /votes/{id}/ballot — one ballot per apartment, enforced in SQL. */
    public static function ballot(array $p): void
    {
        $u = Auth::require();
        if (Auth::isManager($u) && $u['apartment_id'] === null) {
            throw new ApiError(403, 'forbidden', 'Only apartment residents may vote');
        }
        $apartmentId = (int) $u['apartment_id'];
        $id = (int) $p['id'];
        $optionId = Validator::int(Http::body(), 'option_id', true);

        $pdo = Db::conn();
        $pdo->beginTransaction();
        try {
            $vote = Db::one('SELECT * FROM votes WHERE id = ? FOR UPDATE', [$id]);
            if (!$vote) throw new ApiError(404, 'not_found', 'Vote not found');
            if ($vote['status'] !== 'open') throw new ApiError(409, 'vote_not_open', 'This vote is not open');
            $now = time();
            if (strtotime((string) $vote['starts_at']) > $now) throw new ApiError(409, 'vote_not_started', 'Voting has not started');
            if (strtotime((string) $vote['ends_at']) < $now)   throw new ApiError(409, 'vote_ended', 'Voting has ended');

            $option = Db::one('SELECT id FROM vote_options WHERE id = ? AND vote_id = ?', [$optionId, $id]);
            if (!$option) throw new ApiError(422, 'validation_failed', 'Unknown option', ['option_id' => 'unknown']);

            $existing = Db::one('SELECT id FROM vote_responses WHERE vote_id = ? AND apartment_id = ? FOR UPDATE', [$id, $apartmentId]);
            if ($existing) throw new ApiError(409, 'already_voted', 'This apartment has already voted');

            Db::exec('INSERT INTO vote_responses (vote_id, apartment_id, option_id, user_id) VALUES (?,?,?,?)',
                [$id, $apartmentId, $optionId, $vote['anonymous'] ? null : $u['id']]);
            // Anonymity covers the CHOICE, not participation: the audit trail
            // intentionally records who cast a ballot (needed to investigate
            // disputes and double voting) and never which option they chose —
            // vote_responses.user_id is NULL for anonymous votes.
            Audit::log((int) $u['id'], 'vote.ballot', 'vote', (string) $id, null, ['apartment_id' => $apartmentId]);

            $pdo->commit();
        } catch (\PDOException $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            if (($e->errorInfo[1] ?? 0) === 1062) throw new ApiError(409, 'already_voted', 'This apartment has already voted');
            throw $e;
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $e;
        }
        Http::json(['ok' => true], 201);
    }
}
