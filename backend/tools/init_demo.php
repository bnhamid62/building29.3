<?php
// Sets demo passwords after importing sql/seed_demo.sql.
// Run from the backend folder:  php tools/init_demo.php
require_once __DIR__ . '/../src/Support/Config.php';
require_once __DIR__ . '/../src/Support/Db.php';

use App\Support\Config;
use App\Support\Db;

// Never plant predictable demo credentials in a production database by mistake.
$forced = in_array('--force', $argv ?? [], true) || getenv('B29_ALLOW_DEMO_INIT') === '1';
if (Config::isProduction() && !$forced) {
    fwrite(STDERR, "Refusing to run: this configuration is production (env=production).\n");
    fwrite(STDERR, "If you really mean it, re-run with --force or B29_ALLOW_DEMO_INIT=1.\n");
    exit(1);
}


$managerPassword  = 'Manager@2026';
$residentPassword = 'Resident@2026';

Db::exec('UPDATE users SET password_hash = ? WHERE id IN (SELECT user_id FROM user_roles WHERE role = "manager")', [password_hash($managerPassword, PASSWORD_BCRYPT)]);
Db::exec('UPDATE users SET password_hash = ? WHERE id NOT IN (SELECT user_id FROM user_roles WHERE role = "manager")', [password_hash($residentPassword, PASSWORD_BCRYPT)]);

echo "Demo passwords set.\n";
echo "  Manager  -> identifier: manager   password: {$managerPassword}\n";
echo "  Resident -> identifier: res02      password: {$residentPassword}\n";
