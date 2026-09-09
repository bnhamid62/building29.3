<?php
/**
 * Building 29 — financial immutability verification.
 *
 * Read-only for your data: every destructive attempt below runs inside a
 * transaction that is ALWAYS rolled back, so nothing is changed. It proves the
 * protections at the DATABASE level (triggers), not only in PHP.
 *
 *   php backend/tools/verify_security.php
 *
 * Exit code 0 = all protections active, 1 = something is missing.
 */
require_once __DIR__ . '/../src/Support/Config.php';
require_once __DIR__ . '/../src/Support/Db.php';

use App\Support\Db;

$failures = 0;
$skipped  = 0;

function line(string $label, string $state): void
{
    printf("%-46s %s\n", $label, $state);
}

function ok(string $label): void { line($label, 'OK'); }

function bad(string $label, string $why = ''): void
{
    global $failures;
    $failures++;
    line($label, 'FAILED' . ($why !== '' ? ' — ' . $why : ''));
}

function skip(string $label, string $why): void
{
    global $skipped;
    $skipped++;
    line($label, 'SKIPPED — ' . $why);
}

/** The statement MUST be rejected by the database. */
function mustReject(string $label, string $sql, array $params = []): void
{
    try {
        Db::exec($sql, $params);
        bad($label, 'the database accepted the change');
    } catch (\Throwable $e) {
        ok($label);
    }
}

echo "Building 29 — database-level financial protections\n";
echo str_repeat('-', 62) . "\n\n";

echo "1. Structure\n";
$triggers = array_column(
    Db::all('SELECT TRIGGER_NAME AS n FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE()'),
    'n'
);
foreach ([
    'trg_payments_no_update'    => 'payments cannot be updated',
    'trg_payments_no_delete'    => 'payments cannot be deleted',
    'trg_receipts_no_update'    => 'receipts cannot be updated',
    'trg_receipts_no_delete'    => 'receipts cannot be deleted',
    'trg_audit_no_update'       => 'audit log cannot be updated',
    'trg_audit_no_delete'       => 'audit log cannot be deleted',
    'trg_contrib_locked_update' => 'locked contributions cannot change',
    'trg_contrib_locked_delete' => 'locked contributions cannot be removed',
    'trg_projects_locked_update' => 'financial lock cannot be reversed',
] as $trigger => $what) {
    in_array($trigger, $triggers, true) ? ok("$trigger ($what)") : bad("$trigger ($what)", 'trigger missing');
}
foreach ([['projects', 'financial_locked_at'], ['projects', 'financial_locked_by'], ['users', 'token_version']] as [$table, $col]) {
    $present = (bool) Db::one(
        'SELECT 1 AS x FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
        [$table, $col]
    );
    $present ? ok("$table.$col") : bad("$table.$col", 'column missing');
}
$present = (bool) Db::one(
    'SELECT 1 AS x FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
    ['rate_limits']
);
$present ? ok('rate_limits table') : bad('rate_limits table', 'table missing');

echo "\n2. Live rejection tests (all rolled back, nothing is modified)\n";
$pdo = Db::conn();
$pdo->beginTransaction();
try {
    // --- payments: append-only -------------------------------------------
    $payment = Db::one('SELECT id FROM payments ORDER BY id LIMIT 1');
    if ($payment) {
        mustReject('payment UPDATE is rejected', 'UPDATE payments SET amount = amount + 1 WHERE id = ?', [$payment['id']]);
        mustReject('payment DELETE is rejected', 'DELETE FROM payments WHERE id = ?', [$payment['id']]);
    } else {
        skip('payment UPDATE / DELETE', 'no payment rows to test against');
    }

    // --- reversal / correction rows are payments too ----------------------
    $reversal = Db::one('SELECT id FROM payments WHERE amount < 0 ORDER BY id LIMIT 1');
    if ($reversal) {
        mustReject('reversal row UPDATE is rejected', 'UPDATE payments SET amount = 0 WHERE id = ?', [$reversal['id']]);
        mustReject('reversal row DELETE is rejected', 'DELETE FROM payments WHERE id = ?', [$reversal['id']]);
    } else {
        skip('reversal row UPDATE / DELETE', 'no reversal rows yet (same trigger as payments)');
    }

    // --- receipts ---------------------------------------------------------
    $receipt = Db::one('SELECT id FROM receipts ORDER BY id LIMIT 1');
    if ($receipt) {
        mustReject('receipt UPDATE is rejected', 'UPDATE receipts SET payment_id = payment_id WHERE id = ?', [$receipt['id']]);
        mustReject('receipt DELETE is rejected', 'DELETE FROM receipts WHERE id = ?', [$receipt['id']]);
    } else {
        skip('receipt UPDATE / DELETE', 'no receipt rows to test against');
    }

    // --- audit log --------------------------------------------------------
    $audit = Db::one('SELECT id FROM audit_logs ORDER BY id LIMIT 1');
    if ($audit) {
        mustReject('audit entry UPDATE is rejected', 'UPDATE audit_logs SET action = ? WHERE id = ?', ['tampered', $audit['id']]);
        mustReject('audit entry DELETE is rejected', 'DELETE FROM audit_logs WHERE id = ?', [$audit['id']]);
    } else {
        skip('audit entry UPDATE / DELETE', 'no audit rows to test against');
    }

    // --- project lock + approved contributions ----------------------------
    $contrib = Db::one(
        'SELECT pc.project_id, pc.apartment_id FROM project_contributions pc
         JOIN projects p ON p.id = pc.project_id ORDER BY pc.id LIMIT 1'
    );
    if ($contrib) {
        $pid = (int) $contrib['project_id'];
        $locked = Db::one('SELECT financial_locked_at FROM projects WHERE id = ?', [$pid]);
        if (($locked['financial_locked_at'] ?? null) === null) {
            // Lock it inside this transaction only; the rollback undoes it.
            Db::exec('UPDATE projects SET financial_locked_at = NOW() WHERE id = ?', [$pid]);
        }
        mustReject(
            'approved contribution UPDATE is rejected',
            'UPDATE project_contributions SET required_amount = required_amount + 1 WHERE project_id = ? AND apartment_id = ?',
            [$pid, $contrib['apartment_id']]
        );
        mustReject(
            'approved contribution DELETE is rejected',
            'DELETE FROM project_contributions WHERE project_id = ? AND apartment_id = ?',
            [$pid, $contrib['apartment_id']]
        );
        mustReject(
            'locked required amount UPDATE is rejected',
            'UPDATE projects SET contribution_per_apartment = contribution_per_apartment + 1 WHERE id = ?',
            [$pid]
        );
        mustReject(
            'project lock cannot be reversed',
            'UPDATE projects SET financial_locked_at = NULL WHERE id = ?',
            [$pid]
        );
    } else {
        skip('contribution / project lock tests', 'no project contribution rows to test against');
    }
} finally {
    $pdo->rollBack();   // nothing above is ever kept
}

echo "\n" . str_repeat('-', 62) . "\n";
if ($failures === 0) {
    echo "All financial protections are active" . ($skipped ? " ($skipped test(s) skipped: no data)" : '') . ".\n";
    echo "No data was modified — every test ran inside a rolled-back transaction.\n";
    exit(0);
}
echo "$failures protection(s) NOT active.\n";
echo "Apply: mysql -u root -p building29 < backend/sql/migrations/2026_09_08_financial_immutability.sql\n";
exit(1);
