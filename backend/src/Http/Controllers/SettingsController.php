<?php
namespace App\Http\Controllers;

use App\Support\{Audit, Auth, Db, Http, Validator};

final class SettingsController
{
    public static function show(): void
    {
        Auth::require();
        Http::json(self::shape(Db::one('SELECT * FROM building_settings WHERE id = 1') ?? []));
    }

    /** PATCH /settings — manager only, audited. */
    public static function update(): void
    {
        $m = Auth::requireManager();
        $before = Db::one('SELECT * FROM building_settings WHERE id = 1') ?? [];
        $b = Http::body();
        $data = [
            'name_ar'            => Validator::str($b, 'name_ar', false, 190) ?? $before['name_ar'],
            'name_fr'            => Validator::str($b, 'name_fr', false, 190) ?? $before['name_fr'],
            'address_ar'         => Validator::str($b, 'address_ar', false, 255) ?? $before['address_ar'],
            'address_fr'         => Validator::str($b, 'address_fr', false, 255) ?? $before['address_fr'],
            'currency'           => Validator::str($b, 'currency', false, 8) ?? $before['currency'],
            'default_locale'     => Validator::enum($b, 'default_locale', ['ar', 'fr'], false, $before['default_locale']),
            'privacy_show_phone' => isset($b['privacy_show_phone']) ? (int) (bool) $b['privacy_show_phone'] : (int) $before['privacy_show_phone'],
            'module_facilities'  => isset($b['module_facilities']) ? (int) (bool) $b['module_facilities'] : (int) $before['module_facilities'],
            'module_cameras'     => isset($b['module_cameras']) ? (int) (bool) $b['module_cameras'] : (int) $before['module_cameras'],
        ];
        Db::exec(
            'UPDATE building_settings SET name_ar=?, name_fr=?, address_ar=?, address_fr=?, currency=?, default_locale=?,
                privacy_show_phone=?, module_facilities=?, module_cameras=? WHERE id = 1',
            array_values($data)
        );
        Audit::log((int) $m['id'], 'settings_update', 'building_settings', '1', $before, $data);
        Http::json(self::shape(Db::one('SELECT * FROM building_settings WHERE id = 1') ?? []));
    }

    private static function shape(array $r): array
    {
        return [
            'name_ar'            => $r['name_ar'] ?? '',
            'name_fr'            => $r['name_fr'] ?? '',
            'address_ar'         => $r['address_ar'] ?? null,
            'address_fr'         => $r['address_fr'] ?? null,
            'currency'           => $r['currency'] ?? 'DZD',
            'floors'             => (int) ($r['floors'] ?? 0),
            'apartments_count'   => (int) ($r['apartments_count'] ?? 0),
            'default_locale'     => $r['default_locale'] ?? 'ar',
            'privacy_show_phone' => (bool) ($r['privacy_show_phone'] ?? false),
            'module_facilities'  => (bool) ($r['module_facilities'] ?? true),
            'module_cameras'     => (bool) ($r['module_cameras'] ?? true),
            'is_demo'            => (int) ($r['is_demo'] ?? 0),
        ];
    }
}
