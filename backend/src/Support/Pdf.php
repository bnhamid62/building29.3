<?php
namespace App\Support;

/**
 * Small dependency-free PDF writer.
 *
 * Embeds one TrueType font as a CIDFontType2 (Identity-H) so Arabic and French
 * render from the same file, and draws text/lines/boxes. Arabic strings are
 * shaped and reordered by ArabicText before glyph lookup, which gives correct
 * right-to-left output; French keeps its natural left-to-right order.
 */
final class Pdf
{
    public const A4_W = 595.28;
    public const A4_H = 841.89;

    private TrueTypeFont $font;
    /** @var string[] page content streams */
    private array $pages = [];
    private string $buffer = '';
    /** @var array<int,bool> glyph ids used */
    private array $used = [];

    public function __construct(?string $fontPath = null)
    {
        $this->font = new TrueTypeFont($fontPath ?? (dirname(__DIR__, 2) . '/assets/fonts/Amiri-Regular.ttf'));
    }

    public function addPage(): void
    {
        if ($this->buffer !== '') $this->pages[] = $this->buffer;
        $this->buffer = '';
    }

    /** @return array{0:string,1:float} hex glyph string and width in points */
    private function encode(string $text, float $size): array
    {
        $hex = '';
        $w = 0;
        foreach (ArabicText::visual($text) as $cp) {
            $gid = $this->font->gid($cp);
            if ($gid === 0 && $cp !== 0x20) $gid = $this->font->gid(0x20);
            $this->used[$gid] = true;
            $hex .= sprintf('%04X', $gid);
            $w += $this->font->width($gid);
        }
        return [$hex, $w * $size / 1000];
    }

    public function widthOf(string $text, float $size): float
    {
        return $this->encode($text, $size)[1];
    }

    /** Draw text. $y is measured from the top of the page. */
    public function text(string $text, float $x, float $y, float $size = 11, string $align = 'left', array $rgb = [0.1, 0.13, 0.15]): void
    {
        if ($text === '') return;
        [$hex, $w] = $this->encode($text, $size);
        $tx = match ($align) {
            'right'  => $x - $w,
            'center' => $x - $w / 2,
            default  => $x,
        };
        $ty = self::A4_H - $y;
        $this->buffer .= sprintf(
            "BT %.3f %.3f %.3f rg /F1 %.2f Tf %.2f %.2f Td <%s> Tj ET\n",
            $rgb[0], $rgb[1], $rgb[2], $size, $tx, $ty, $hex
        );
    }

    public function line(float $x1, float $y1, float $x2, float $y2, float $width = 0.6, array $rgb = [0.75, 0.78, 0.8]): void
    {
        $this->buffer .= sprintf(
            "%.3f %.3f %.3f RG %.2f w %.2f %.2f m %.2f %.2f l S\n",
            $rgb[0], $rgb[1], $rgb[2], $width, $x1, self::A4_H - $y1, $x2, self::A4_H - $y2
        );
    }

    public function rect(float $x, float $y, float $w, float $h, array $rgb = [0.94, 0.96, 0.96]): void
    {
        $this->buffer .= sprintf(
            "%.3f %.3f %.3f rg %.2f %.2f %.2f %.2f re f\n",
            $rgb[0], $rgb[1], $rgb[2], $x, self::A4_H - $y - $h, $w, $h
        );
    }

    private static function obj(array &$objects, string $body): int
    {
        $objects[] = $body;
        return count($objects);
    }

    public function output(): string
    {
        if ($this->buffer !== '') { $this->pages[] = $this->buffer; $this->buffer = ''; }
        if (!$this->pages) $this->pages[] = '';

        $objects = [];
        $catalog = self::obj($objects, ''); // 1 placeholder
        $pagesObj = self::obj($objects, ''); // 2 placeholder

        // font objects
        $raw = $this->font->data;
        $compressed = gzcompress($raw, 6);
        $fileObj = self::obj($objects, "<< /Length " . strlen($compressed) . " /Filter /FlateDecode /Length1 " . strlen($raw) . " >>\nstream\n" . $compressed . "\nendstream");
        $descObj = self::obj($objects, sprintf(
            "<< /Type /FontDescriptor /FontName /%s /Flags 4 /FontBBox [%d %d %d %d] /ItalicAngle 0 /Ascent %d /Descent %d /CapHeight %d /StemV 80 /FontFile2 %d 0 R >>",
            $this->font->postscriptName,
            $this->font->scale($this->font->bbox[0]), $this->font->scale($this->font->bbox[1]),
            $this->font->scale($this->font->bbox[2]), $this->font->scale($this->font->bbox[3]),
            $this->font->scale($this->font->ascent), $this->font->scale($this->font->descent),
            $this->font->scale($this->font->ascent), $fileObj
        ));

        $gids = array_keys($this->used);
        sort($gids);
        $w = '';
        foreach ($gids as $gid) $w .= $gid . ' [' . $this->font->width($gid) . '] ';
        $cidObj = self::obj($objects, sprintf(
            "<< /Type /Font /Subtype /CIDFontType2 /BaseFont /%s /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor %d 0 R /DW %d /W [%s] /CIDToGIDMap /Identity >>",
            $this->font->postscriptName, $descObj, $this->font->defaultWidth, trim($w)
        ));
        $fontObj = self::obj($objects, sprintf(
            "<< /Type /Font /Subtype /Type0 /BaseFont /%s /Encoding /Identity-H /DescendantFonts [%d 0 R] >>",
            $this->font->postscriptName, $cidObj
        ));

        $pageRefs = [];
        foreach ($this->pages as $content) {
            $stream = gzcompress($content, 6);
            $contentObj = self::obj($objects, "<< /Length " . strlen($stream) . " /Filter /FlateDecode >>\nstream\n" . $stream . "\nendstream");
            $pageObj = self::obj($objects, sprintf(
                "<< /Type /Page /Parent %d 0 R /MediaBox [0 0 %.2f %.2f] /Resources << /Font << /F1 %d 0 R >> >> /Contents %d 0 R >>",
                $pagesObj, self::A4_W, self::A4_H, $fontObj, $contentObj
            ));
            $pageRefs[] = $pageObj;
        }

        $kids = implode(' ', array_map(static fn ($r) => $r . ' 0 R', $pageRefs));
        $objects[$pagesObj - 1] = sprintf('<< /Type /Pages /Kids [%s] /Count %d >>', $kids, count($pageRefs));
        $objects[$catalog - 1] = sprintf('<< /Type /Catalog /Pages %d 0 R >>', $pagesObj);

        $pdf = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
        $offsets = [];
        foreach ($objects as $i => $body) {
            $offsets[$i + 1] = strlen($pdf);
            $pdf .= ($i + 1) . " 0 obj\n" . $body . "\nendobj\n";
        }
        $xref = strlen($pdf);
        $count = count($objects) + 1;
        $pdf .= "xref\n0 {$count}\n0000000000 65535 f \n";
        for ($i = 1; $i < $count; $i++) $pdf .= sprintf("%010d 00000 n \n", $offsets[$i]);
        $pdf .= sprintf("trailer\n<< /Size %d /Root %d 0 R >>\nstartxref\n%d\n%%%%EOF", $count, $catalog, $xref);
        return $pdf;
    }
}
