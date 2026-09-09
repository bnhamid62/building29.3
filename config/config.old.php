<?php
// Copy to config/config.php and adjust. config.php is git-ignored.
return [
    'db' => [
        'host' => '127.0.0.1',
        'port' => 3306,
        'name' => 'building29',
        'user' => 'root',
        'pass' => 'BatimaT@2026',        // AppServ default root password you chose at install
    ],
    'jwt_secret'     => 'B29-2026-X9mK7pQ2vN8rT4wL6sF3cH1jA5zE0uY',
    'access_ttl'     => 900,              // 15 minutes
    'refresh_ttl'    => 60 * 60 * 24 * 30,
    'cors_origins'   => ['http://localhost:8080', 'http://localhost:5173'],
    'uploads_dir'    => __DIR__ . '/../storage/uploads',  // outside public/
    'secure_cookies' => false,            // true in production (HTTPS)
    'debug'          => true,

    'vapid' => [
        'public_key'  => 'BFQlOz84clCG9lwz5HB8Y5LJ4WwRzjZeQsbaSmxdWTkrOcru_aIYoljoX2mZ1KCl87DOqsmowMn-Tz3EoY-KnOA',
        'private_key' => 'YBPtyIJ-8WMfRc0j8SzGr5JKBHrtIoqli1zxCgYmDfk',
        'subject'     => 'mailto:admin@building29.local',
    ],
];