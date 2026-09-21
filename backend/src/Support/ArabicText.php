<?php
namespace App\Support;

/**
 * Arabic contextual shaping + light bidi reordering.
 *
 * PDF has no text engine, so the server converts logical Arabic text into the
 * visual sequence of Unicode presentation forms (FE70..FEFC) that the embedded
 * font can render, and reverses right-to-left runs. Latin words and numbers
 * inside an Arabic line keep their own left-to-right order.
 */
final class ArabicText
{
    /** char => [isolated, final, initial, medial]; 0 = form does not exist. */
    private const FORMS = [
        0x0621 => [0xFE80, 0, 0, 0],
        0x0622 => [0xFE81, 0xFE82, 0, 0],
        0x0623 => [0xFE83, 0xFE84, 0, 0],
        0x0624 => [0xFE85, 0xFE86, 0, 0],
        0x0625 => [0xFE87, 0xFE88, 0, 0],
        0x0626 => [0xFE89, 0xFE8A, 0xFE8B, 0xFE8C],
        0x0627 => [0xFE8D, 0xFE8E, 0, 0],
        0x0628 => [0xFE8F, 0xFE90, 0xFE91, 0xFE92],
        0x0629 => [0xFE93, 0xFE94, 0, 0],
        0x062A => [0xFE95, 0xFE96, 0xFE97, 0xFE98],
        0x062B => [0xFE99, 0xFE9A, 0xFE9B, 0xFE9C],
        0x062C => [0xFE9D, 0xFE9E, 0xFE9F, 0xFEA0],
        0x062D => [0xFEA1, 0xFEA2, 0xFEA3, 0xFEA4],
        0x062E => [0xFEA5, 0xFEA6, 0xFEA7, 0xFEA8],
        0x062F => [0xFEA9, 0xFEAA, 0, 0],
        0x0630 => [0xFEAB, 0xFEAC, 0, 0],
        0x0631 => [0xFEAD, 0xFEAE, 0, 0],
        0x0632 => [0xFEAF, 0xFEB0, 0, 0],
        0x0633 => [0xFEB1, 0xFEB2, 0xFEB3, 0xFEB4],
        0x0634 => [0xFEB5, 0xFEB6, 0xFEB7, 0xFEB8],
        0x0635 => [0xFEB9, 0xFEBA, 0xFEBB, 0xFEBC],
        0x0636 => [0xFEBD, 0xFEBE, 0xFEBF, 0xFEC0],
        0x0637 => [0xFEC1, 0xFEC2, 0xFEC3, 0xFEC4],
        0x0638 => [0xFEC5, 0xFEC6, 0xFEC7, 0xFEC8],
        0x0639 => [0xFEC9, 0xFECA, 0xFECB, 0xFECC],
        0x063A => [0xFECD, 0xFECE, 0xFECF, 0xFED0],
        0x0640 => [0x0640, 0x0640, 0x0640, 0x0640],
        0x0641 => [0xFED1, 0xFED2, 0xFED3, 0xFED4],
        0x0642 => [0xFED5, 0xFED6, 0xFED7, 0xFED8],
        0x0643 => [0xFED9, 0xFEDA, 0xFEDB, 0xFEDC],
        0x0644 => [0xFEDD, 0xFEDE, 0xFEDF, 0xFEE0],
        0x0645 => [0xFEE1, 0xFEE2, 0xFEE3, 0xFEE4],
        0x0646 => [0xFEE5, 0xFEE6, 0xFEE7, 0xFEE8],
        0x0647 => [0xFEE9, 0xFEEA, 0xFEEB, 0xFEEC],
        0x0648 => [0xFEED, 0xFEEE, 0, 0],
        0x0649 => [0xFEEF, 0xFEF0, 0, 0],
        0x064A => [0xFEF1, 0xFEF2, 0xFEF3, 0xFEF4],
        0x0671 => [0xFB50, 0xFB51, 0, 0],
        0x067E => [0xFB56, 0xFB59, 0xFB58, 0xFB57],
        0x06A4 => [0xFB6A, 0xFB6D, 0xFB6C, 0xFB6B],
        0x06AF => [0xFB92, 0xFB95, 0xFB94, 0xFB93],
    ];

    /** lam + alef ligatures: alef => [isolated, final]. */
    private const LAM_ALEF = [
        0x0622 => [0xFEF5, 0xFEF6],
        0x0623 => [0xFEF7, 0xFEF8],
        0x0625 => [0xFEF9, 0xFEFA],
        0x0627 => [0xFEFB, 0xFEFC],
    ];

    private const MIRROR = [0x28 => 0x29, 0x29 => 0x28, 0x5B => 0x5D, 0x5D => 0x5B, 0x7B => 0x7D, 0x7D => 0x7B, 0x3C => 0x3E, 0x3E => 0x3C];

    /** @return int[] codepoints */
    public static function codepoints(string $utf8): array
    {
        $out = [];
        $len = mb_strlen($utf8, 'UTF-8');
        for ($i = 0; $i < $len; $i++) {
            $ch = mb_substr($utf8, $i, 1, 'UTF-8');
            $out[] = (int) hexdec(bin2hex(mb_convert_encoding($ch, 'UTF-32BE', 'UTF-8')));
        }
        return $out;
    }

    public static function isArabic(int $cp): bool
    {
        return ($cp >= 0x0600 && $cp <= 0x06FF) || ($cp >= 0xFB50 && $cp <= 0xFEFC);
    }

    public static function containsArabic(string $text): bool
    {
        foreach (self::codepoints($text) as $cp) if (self::isArabic($cp)) return true;
        return false;
    }

    private static function isMark(int $cp): bool
    {
        return ($cp >= 0x064B && $cp <= 0x065F) || $cp === 0x0670 || ($cp >= 0x06D6 && $cp <= 0x06ED);
    }

    private static function joinsRight(int $cp): bool // can connect to the previous letter
    {
        return isset(self::FORMS[$cp]);
    }

    private static function joinsLeft(int $cp): bool // dual-joining
    {
        return isset(self::FORMS[$cp]) && self::FORMS[$cp][2] !== 0;
    }

    /**
     * Logical UTF-8 text => visual codepoint sequence ready for glyph lookup.
     * @return int[]
     */
    public static function visual(string $text): array
    {
        $cps = self::codepoints($text);
        $rtl = false;
        foreach ($cps as $cp) { if (self::isArabic($cp)) { $rtl = true; break; } }
        if (!$rtl) return $cps;

        // 1. contextual shaping (marks are transparent to joining)
        $shaped = [];
        $count = count($cps);
        for ($i = 0; $i < $count; $i++) {
            $cp = $cps[$i];
            if (self::isMark($cp)) { $shaped[] = $cp; continue; }
            // previous / next non-mark
            $prev = 0; for ($p = $i - 1; $p >= 0; $p--) { if (!self::isMark($cps[$p])) { $prev = $cps[$p]; break; } }
            $next = 0; for ($n = $i + 1; $n < $count; $n++) { if (!self::isMark($cps[$n])) { $next = $cps[$n]; break; } }

            if ($cp === 0x0644 && isset(self::LAM_ALEF[$next])) {
                $joined = self::LAM_ALEF[$next][self::joinsLeft($prev) ? 1 : 0];
                $shaped[] = $joined;
                // skip the alef
                for ($n = $i + 1; $n < $count; $n++) { if (!self::isMark($cps[$n])) { $i = $n; break; } $shaped[] = $cps[$n]; }
                continue;
            }
            if (!isset(self::FORMS[$cp])) { $shaped[] = $cp; continue; }
            $connectPrev = self::joinsLeft($prev);
            $connectNext = self::joinsRight($next) && self::FORMS[$cp][2] !== 0;
            $form = match (true) {
                $connectPrev && $connectNext => 3,
                $connectPrev                 => 1,
                $connectNext                 => 2,
                default                      => 0,
            };
            $glyph = self::FORMS[$cp][$form] ?: self::FORMS[$cp][0];
            $shaped[] = $glyph;
        }

        // 2. reverse the line, then restore left-to-right runs (latin + digits)
        $visual = array_reverse($shaped);
        $out = [];
        $buffer = [];
        $flush = static function () use (&$buffer, &$out) {
            if ($buffer) { foreach (array_reverse($buffer) as $c) $out[] = $c; $buffer = []; }
        };
        $isLtr = static fn (int $cp): bool => ($cp >= 0x30 && $cp <= 0x39) || ($cp >= 0x41 && $cp <= 0x5A) || ($cp >= 0x61 && $cp <= 0x7A)
            || ($cp >= 0xC0 && $cp <= 0x24F) || $cp === 0x2E || $cp === 0x2C || $cp === 0x2F || $cp === 0x2D || $cp === 0x27;
        $total = count($visual);
        for ($i = 0; $i < $total; $i++) {
            $cp = $visual[$i];
            if ($isLtr($cp)) { $buffer[] = $cp; continue; }
            // a space, thin separator or colon between two latin/number characters stays inside the run
            if (($cp === 0x20 || $cp === 0xA0 || $cp === 0x202F || $cp === 0x3A) && $buffer && $i + 1 < $total && $isLtr($visual[$i + 1])) {
                $buffer[] = $cp === 0x3A ? 0x3A : 0x20;
                continue;
            }
            $flush();
            $out[] = self::MIRROR[$cp] ?? $cp;
        }

        $flush();
        // trailing spaces of the logical string end up leading — trim them
        while ($out && $out[0] === 0x20) array_shift($out);
        return $out;
    }
}
