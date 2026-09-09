<?php
// Copy to config/config.php and adjust. config.php is git-ignored.
//
// SECURITY: when 'env' is 'production' the API refuses to start unless
//   - jwt_secret is a real 32+ character random string
//   - debug is false
//   - secure_cookies is true (HTTPS)
//   - cors_origins contains no plain-http non-localhost origin
// Generate a secret with:  php -r "echo bin2hex(random_bytes(32));"
// Secrets may also be supplied via environment variables:
//   B29_JWT_SECRET, B29_ENV, B29_DB_HOST, B29_DB_NAME, B29_DB_USER, B29_DB_PASS
return [
    'env' => 'development',        // 'production' on the public HTTPS server
    'db' => [
        'host' => '127.0.0.1',
        'port' => 3306,
        'name' => 'building29',
        'user' => 'root',
        'pass' => '',        // AppServ default root password you chose at install
    ],
    // Development-only placeholder. MUST be replaced before going to production.
    'jwt_secret'      => 'dev-only-secret-please-replace-with-64-hex-chars-0000000000',
    'access_ttl'      => 900,          // 15 minutes
    'refresh_ttl'     => 60 * 60 * 24 * 30,
    'cors_origins'    => ['http://localhost:8080', 'http://localhost:5173'],
    'uploads_dir'     => __DIR__ . '/../storage/uploads',   // outside public/
    'secure_cookies'  => false,        // true in production (HTTPS)
    'debug'           => true,         // false in production
];
