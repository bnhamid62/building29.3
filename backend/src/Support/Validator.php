<?php
namespace App\Support;

final class Validator
{
    public static function str(array $src, string $key, bool $required = true, int $max = 190): ?string
    {
        $v = isset($src[$key]) && is_scalar($src[$key]) ? trim((string) $src[$key]) : '';
        if ($v === '') {
            if ($required) throw new ApiError(422, 'validation_failed', 'Missing field', [$key => 'required']);
            return null;
        }
        if (mb_strlen($v) > $max) throw new ApiError(422, 'validation_failed', 'Field too long', [$key => 'max']);
        return $v;
    }

    /**
     * Money is validated as an exact decimal string: no scientific notation, no
     * hidden rounding of a third decimal, no NaN/INF. The value is returned as a
     * canonical "0.00" string so it reaches DECIMAL(12,2) columns unchanged.
     */
    public static function moneyString(array $src, string $key, bool $required = true): ?string
    {
        if (!isset($src[$key]) || $src[$key] === '' || is_array($src[$key]) || is_bool($src[$key])) {
            if ($required) throw new ApiError(422, 'validation_failed', 'Missing amount', [$key => 'required']);
            return null;
        }
        $raw = trim((string) $src[$key]);
        if (!preg_match('/^-?\d{1,10}(\.\d{1,2})?$/', $raw)) {
            throw new ApiError(422, 'validation_failed', 'Invalid amount', [$key => 'decimal']);
        }
        $v = (float) $raw;
        if ($v < 0 || $v > 99999999.99) {
            throw new ApiError(422, 'validation_failed', 'Amount out of range', [$key => 'range']);
        }
        return number_format($v, 2, '.', '');
    }

    public static function money(array $src, string $key, bool $required = true): ?float
    {
        $v = self::moneyString($src, $key, $required);
        return $v === null ? null : (float) $v;
    }

    public static function int(array $src, string $key, bool $required = true): ?int
    {
        if (!isset($src[$key]) || $src[$key] === '' || is_array($src[$key]) || is_bool($src[$key])) {
            if ($required) throw new ApiError(422, 'validation_failed', 'Missing field', [$key => 'required']);
            return null;
        }
        $raw = trim((string) $src[$key]);
        if (!preg_match('/^-?\d{1,18}$/', $raw)) {
            throw new ApiError(422, 'validation_failed', 'Invalid number', [$key => 'numeric']);
        }
        return (int) $raw;
    }

    public static function enum(array $src, string $key, array $allowed, bool $required = true, ?string $default = null): ?string
    {
        $v = $src[$key] ?? null;
        if ($v === null || $v === '') {
            if ($required) throw new ApiError(422, 'validation_failed', 'Missing field', [$key => 'required']);
            return $default;
        }
        if (!in_array($v, $allowed, true)) throw new ApiError(422, 'validation_failed', 'Invalid value', [$key => 'enum']);
        return (string) $v;
    }
}
