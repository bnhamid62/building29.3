<?php
declare(strict_types=1);

/**
 * Generates a VAPID key pair for Web Push and prints the config block to paste
 * into backend/config/config.php. Run once:
 *
 *   php backend/tools/generate_vapid_keys.php
 *
 * Keep the private key secret (config/ is denied by .htaccess and git-ignored).
 */

require_once __DIR__ . '/../src/Support/Config.php';
require_once __DIR__ . '/../src/Support/WebPush.php';

use App\Support\WebPush;

$key = openssl_pkey_new(['curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC]);
if ($key === false) {
    fwrite(STDERR, "openssl EC support is required.\n");
    exit(1);
}

$d = openssl_pkey_get_details($key);
$public = "\x04" . str_pad($d['ec']['x'], 32, "\0", STR_PAD_LEFT) . str_pad($d['ec']['y'], 32, "\0", STR_PAD_LEFT);
$private = str_pad($d['ec']['d'], 32, "\0", STR_PAD_LEFT);

echo "Add this to backend/config/config.php:\n\n";
echo "    'vapid' => [\n";
echo "        'subject'     => 'mailto:syndic@immeuble29.dz',\n";
echo "        'public_key'  => '" . WebPush::b64($public) . "',\n";
echo "        'private_key' => '" . WebPush::b64($private) . "',\n";
echo "    ],\n";
