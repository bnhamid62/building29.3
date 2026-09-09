<?php
namespace App\Support;

/**
 * Minimal TrueType reader: enough to embed a font in a PDF as a CIDFontType2
 * (Identity-H) and to measure text. No external dependency, no Composer.
 */
final class TrueTypeFont
{
    public string $data;
    public int $unitsPerEm = 1000;
    /** @var array<int,int> unicode => glyph id */
    private array $cmap = [];
    /** @var array<int,int> glyph id => advance width (font units) */
    private array $hmtx = [];
    public int $ascent = 800;
    public int $descent = -200;
    public array $bbox = [0, -200, 1000, 900];
    public string $postscriptName = 'EmbeddedFont';

    public function __construct(string $path)
    {
        $raw = @file_get_contents($path);
        if ($raw === false) throw new ApiError(500, 'font_missing', 'PDF font not found');
        $this->data = $raw;
        $this->parse();
    }

    private function u16(int $o): int { return unpack('n', substr($this->data, $o, 2))[1]; }
    private function s16(int $o): int { $v = $this->u16($o); return $v >= 0x8000 ? $v - 0x10000 : $v; }
    private function u32(int $o): int { return unpack('N', substr($this->data, $o, 4))[1]; }

    private function parse(): void
    {
        $numTables = $this->u16(4);
        $tables = [];
        for ($i = 0; $i < $numTables; $i++) {
            $rec = 12 + $i * 16;
            $tag = substr($this->data, $rec, 4);
            $tables[$tag] = ['off' => $this->u32($rec + 8), 'len' => $this->u32($rec + 12)];
        }
        $head = $tables['head']['off'];
        $this->unitsPerEm = $this->u16($head + 18);
        $this->bbox = [
            $this->s16($head + 36), $this->s16($head + 38),
            $this->s16($head + 40), $this->s16($head + 42),
        ];
        $hhea = $tables['hhea']['off'];
        $this->ascent = $this->s16($hhea + 4);
        $this->descent = $this->s16($hhea + 6);
        $numHMetrics = $this->u16($hhea + 34);
        $hmtx = $tables['hmtx']['off'];
        $last = 0;
        for ($g = 0; $g < $numHMetrics; $g++) {
            $last = $this->u16($hmtx + $g * 4);
            $this->hmtx[$g] = $last;
        }
        $this->defaultWidth = $last;
        $this->parseCmap($tables['cmap']['off']);
        $this->postscriptName = 'B29Font';
    }

    public int $defaultWidth = 500;

    private function parseCmap(int $off): void
    {
        $n = $this->u16($off + 2);
        $best = null;
        for ($i = 0; $i < $n; $i++) {
            $rec = $off + 4 + $i * 8;
            $pid = $this->u16($rec);
            $eid = $this->u16($rec + 2);
            $sub = $off + $this->u32($rec + 4);
            $fmt = $this->u16($sub);
            if ($fmt === 4 && ($pid === 3 && ($eid === 1 || $eid === 0))) $best = $sub;
            if ($fmt === 12 && $pid === 3 && $eid === 10) { $best = $sub; break; }
        }
        if ($best === null) throw new ApiError(500, 'font_unsupported', 'Font has no usable cmap');
        $fmt = $this->u16($best);
        if ($fmt === 12) {
            $groups = $this->u32($best + 12);
            for ($i = 0; $i < $groups; $i++) {
                $g = $best + 16 + $i * 12;
                $start = $this->u32($g); $end = $this->u32($g + 4); $gid = $this->u32($g + 8);
                if ($end - $start > 0xFFFF) continue;
                for ($c = $start; $c <= $end; $c++) $this->cmap[$c] = $gid + ($c - $start);
            }
            return;
        }
        $segX2 = $this->u16($best + 6);
        $seg = intdiv($segX2, 2);
        $endO = $best + 14;
        $startO = $endO + $segX2 + 2;
        $deltaO = $startO + $segX2;
        $rangeO = $deltaO + $segX2;
        for ($i = 0; $i < $seg; $i++) {
            $end = $this->u16($endO + $i * 2);
            $start = $this->u16($startO + $i * 2);
            $delta = $this->s16($deltaO + $i * 2);
            $rangeOffset = $this->u16($rangeO + $i * 2);
            if ($start > $end) continue;
            for ($c = $start; $c <= $end && $c !== 0x10000; $c++) {
                if ($rangeOffset === 0) {
                    $gid = ($c + $delta) & 0xFFFF;
                } else {
                    $gi = $rangeO + $i * 2 + $rangeOffset + ($c - $start) * 2;
                    if ($gi + 1 >= strlen($this->data)) continue;
                    $gid = $this->u16($gi);
                    if ($gid !== 0) $gid = ($gid + $delta) & 0xFFFF;
                }
                if ($gid !== 0) $this->cmap[$c] = $gid;
            }
        }
    }

    public function gid(int $codepoint): int
    {
        return $this->cmap[$codepoint] ?? 0;
    }

    /** Advance width in 1/1000 em. */
    public function width(int $gid): int
    {
        $w = $this->hmtx[$gid] ?? $this->defaultWidth;
        return (int) round($w * 1000 / $this->unitsPerEm);
    }

    public function scale(int $fontUnits): int
    {
        return (int) round($fontUnits * 1000 / $this->unitsPerEm);
    }
}
