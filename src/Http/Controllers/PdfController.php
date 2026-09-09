<?php
namespace App\Http\Controllers;

use App\Support\{ApiError, ArabicText, Audit, Auth, Db, Pdf};

/**
 * Server-generated PDFs.
 *
 * Every figure printed here is read from MySQL inside this request — the client
 * only passes an identifier (receipt number) and a locale. Receipt numbers come
 * from the immutable `receipts` table and are never recomputed.
 * Both endpoints require authentication; residents are limited to their own
 * apartment, and generation is written to the audit log.
 */
final class PdfController
{
    private static function locale(): string
    {
        $l = strtolower((string) ($_GET['locale'] ?? 'ar'));
        return $l === 'fr' ? 'fr' : 'ar';
    }

    private static function t(string $locale, string $ar, string $fr): string
    {
        return $locale === 'fr' ? $fr : $ar;
    }

    private static function money(float $v, string $currency, string $locale): string
    {
        $n = number_format($v, 2, ',', ' ');
        return $locale === 'fr' ? $n . ' ' . $currency : $n . ' ' . $currency;
    }

    private static function stream(Pdf $pdf, string $filename): void
    {
        $bytes = $pdf->output();
        header('Content-Type: application/pdf');
        header('Content-Length: ' . strlen($bytes));
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        header('Cache-Control: no-store');
        echo $bytes;
    }

    /** Header block shared by every document. */
    private static function header(Pdf $pdf, array $b, string $locale, string $title): float
    {
        $rtl  = $locale === 'ar';
        $name = self::t($locale, (string) ($b['name_ar'] ?? ''), (string) ($b['name_fr'] ?? ''));
        $addr = self::t($locale, (string) ($b['address_ar'] ?? ''), (string) ($b['address_fr'] ?? ''));
        $anchor = $rtl ? Pdf::A4_W - 48 : 48;
        $align  = $rtl ? 'right' : 'left';

        $pdf->rect(0, 0, Pdf::A4_W, 96, [0.06, 0.28, 0.29]);
        $pdf->text($name, $anchor, 40, 20, $align, [1, 1, 1]);
        if ($addr !== '') $pdf->text($addr, $anchor, 62, 10, $align, [0.85, 0.93, 0.92]);
        $pdf->text($title, $rtl ? 48 : Pdf::A4_W - 48, 62, 13, $rtl ? 'left' : 'right', [0.95, 0.98, 0.97]);
        return 130;
    }

    private static function footer(Pdf $pdf, string $locale, string $note): void
    {
        $pdf->line(48, Pdf::A4_H - 60, Pdf::A4_W - 48, Pdf::A4_H - 60);
        $pdf->text($note, Pdf::A4_W / 2, Pdf::A4_H - 44, 8.5, 'center', [0.45, 0.5, 0.5]);
    }

    /** GET /receipts/{no}/pdf */
    public static function receipt(array $p): void
    {
        $u  = Auth::require();
        $no = (string) $p['no'];
        $row = Db::one(
            'SELECT pay.*, r.receipt_no, r.issued_at, a.number AS apartment_number, a.floor AS apartment_floor,
                    pr.name_ar AS project_name_ar, pr.name_fr AS project_name_fr,
                    rec.full_name AS recorded_by_name,
                    (SELECT full_name FROM users x WHERE x.apartment_id = pay.apartment_id AND x.person_rank = "primary" LIMIT 1) AS resident_name
             FROM receipts r
             JOIN payments pay ON pay.id = r.payment_id
             JOIN apartments a ON a.id = pay.apartment_id
             JOIN projects pr ON pr.id = pay.project_id
             LEFT JOIN users rec ON rec.id = pay.recorded_by
             WHERE r.receipt_no = ?',
            [$no]
        );
        if (!$row) throw new ApiError(404, 'not_found', 'Receipt not found');
        Auth::requireApartment($u, (int) $row['apartment_id']);

        $b = Db::one('SELECT * FROM building_settings WHERE id = 1') ?? [];
        $currency = (string) ($b['currency'] ?? 'DZD');
        $locale = self::locale();
        $rtl = $locale === 'ar';

        $pdf = new Pdf();
        $pdf->addPage();
        $y = self::header($pdf, $b, $locale, self::t($locale, 'وصل دفع', 'Reçu de paiement'));

        $labelX = $rtl ? Pdf::A4_W - 48 : 48;
        $valueX = $rtl ? 48 : Pdf::A4_W - 48;
        $labelAlign = $rtl ? 'right' : 'left';
        $valueAlign = $rtl ? 'left' : 'right';

        $pdf->rect(48, $y - 18, Pdf::A4_W - 96, 34, [0.93, 0.96, 0.95]);
        $pdf->text(self::t($locale, 'رقم الوصل', 'N° de reçu'), $labelX - ($rtl ? 12 : -12), $y + 4, 12, $labelAlign);
        $pdf->text((string) $row['receipt_no'], $valueX + ($rtl ? 12 : -12), $y + 4, 13, $valueAlign, [0.06, 0.28, 0.29]);
        $y += 46;

        $rows = [
            [self::t($locale, 'الشقة', 'Appartement'), (string) $row['apartment_number']],
            [self::t($locale, 'الطابق', 'Étage'), (string) $row['apartment_floor']],
            [self::t($locale, 'الساكن', 'Résident'), (string) ($row['resident_name'] ?? '-')],
            [self::t($locale, 'المشروع', 'Projet'), self::t($locale, (string) $row['project_name_ar'], (string) $row['project_name_fr'])],
            [self::t($locale, 'المبلغ', 'Montant'), self::money((float) $row['amount'], $currency, $locale)],
            [self::t($locale, 'طريقة الدفع', 'Mode de paiement'), self::t($locale,
                ['cash' => 'نقدا', 'transfer' => 'تحويل', 'online' => 'عبر الإنترنت'][$row['method']] ?? (string) $row['method'],
                ['cash' => 'Espèces', 'transfer' => 'Virement', 'online' => 'En ligne'][$row['method']] ?? (string) $row['method'])],
            [self::t($locale, 'تاريخ الدفع', 'Date de paiement'), (string) $row['paid_at']],
            [self::t($locale, 'تاريخ إصدار الوصل', 'Date d\'émission'), (string) $row['issued_at']],
            [self::t($locale, 'سجّله', 'Enregistré par'), (string) ($row['recorded_by_name'] ?? '-')],
        ];
        if ($row['notes']) $rows[] = [self::t($locale, 'ملاحظات', 'Notes'), (string) $row['notes']];
        if ($row['reverses_payment_id'] !== null) {
            $rows[] = [self::t($locale, 'نوع العملية', 'Type d\'opération'), self::t($locale, 'عملية عكسية (تصحيح)', 'Opération d\'annulation (correction)')];
        }

        foreach ($rows as $i => [$label, $value]) {
            if ($i % 2 === 0) $pdf->rect(48, $y - 13, Pdf::A4_W - 96, 24, [0.97, 0.98, 0.98]);
            $pdf->text($label, $labelX - ($rtl ? 12 : -12), $y + 3, 10.5, $labelAlign, [0.35, 0.4, 0.42]);
            $pdf->text($value, $valueX + ($rtl ? 12 : -12), $y + 3, 11, $valueAlign);
            $y += 24;
        }

        $y += 18;
        $pdf->rect(48, $y - 14, Pdf::A4_W - 96, 40, [0.06, 0.28, 0.29]);
        $pdf->text(self::t($locale, 'المبلغ المدفوع', 'Montant payé'), $labelX - ($rtl ? 12 : -12), $y + 10, 12, $labelAlign, [0.85, 0.93, 0.92]);
        $pdf->text(self::money((float) $row['amount'], $currency, $locale), $valueX + ($rtl ? 12 : -12), $y + 10, 16, $valueAlign, [1, 1, 1]);

        self::footer($pdf, $locale, self::t(
            $locale,
            'وثيقة صادرة عن نظام العمارة 29 — رقم الوصل غير قابل للتعديل. تاريخ الإصدار: ' . date('Y-m-d H:i'),
            'Document généré par le système Immeuble 29 — numéro de reçu immuable. Généré le ' . date('Y-m-d H:i')
        ));

        Audit::log($u['id'] ?? null, 'pdf.generate', 'receipt', (string) $row['receipt_no'], null, ['locale' => $locale]);
        self::stream($pdf, 'receipt-' . preg_replace('/[^A-Za-z0-9_-]/', '', (string) $row['receipt_no']) . '.pdf');
    }

    /** GET /reports/financial.pdf — manager only. */
    public static function financialReport(): void
    {
        $m = Auth::requireManager();
        $locale = self::locale();
        $rtl = $locale === 'ar';

        $b = Db::one('SELECT * FROM building_settings WHERE id = 1') ?? [];
        $currency = (string) ($b['currency'] ?? 'DZD');

        $projects = Db::all(
            'SELECT p.id, p.name_ar, p.name_fr, p.status,
                    COALESCE((SELECT SUM(pc.required_amount) FROM project_contributions pc WHERE pc.project_id = p.id AND pc.exempt = 0), 0) AS expected_total,
                    COALESCE((SELECT SUM(pa.amount) FROM payments pa WHERE pa.project_id = p.id), 0) AS collected_total
             FROM projects p WHERE p.status <> "cancelled" ORDER BY p.id'
        );
        $apartments = Db::all(
            'SELECT a.id, a.number, a.floor,
                    COALESCE((SELECT SUM(pc.required_amount) FROM project_contributions pc JOIN projects pr ON pr.id = pc.project_id
                              WHERE pc.apartment_id = a.id AND pc.exempt = 0 AND pr.status <> "cancelled"), 0) AS required_total,
                    COALESCE((SELECT SUM(pa.amount) FROM payments pa WHERE pa.apartment_id = a.id), 0) AS paid_total
             FROM apartments a ORDER BY a.floor, a.number'
        );
        $paymentsCount  = (int) (Db::one('SELECT COUNT(*) AS c FROM payments')['c'] ?? 0);
        $reversalsCount = (int) (Db::one('SELECT COUNT(*) AS c FROM payments WHERE reverses_payment_id IS NOT NULL')['c'] ?? 0);

        $expected = 0.0; $collected = 0.0;
        foreach ($projects as $p) { $expected += (float) $p['expected_total']; $collected += (float) $p['collected_total']; }
        $settled = 0;
        foreach ($apartments as $a) if ((float) $a['required_total'] - (float) $a['paid_total'] <= 0) $settled++;

        $pdf = new Pdf();
        $pdf->addPage();
        $y = self::header($pdf, $b, $locale, self::t($locale, 'التقرير المالي', 'Rapport financier'));

        $left = 48; $right = Pdf::A4_W - 48;
        $anchor = $rtl ? $right : $left;
        $align  = $rtl ? 'right' : 'left';
        $opposite = $rtl ? $left : $right;
        $oppositeAlign = $rtl ? 'left' : 'right';

        $summary = [
            [self::t($locale, 'المبلغ المطلوب', 'Total attendu'), self::money($expected, $currency, $locale)],
            [self::t($locale, 'المبلغ المحصّل', 'Total collecté'), self::money($collected, $currency, $locale)],
            [self::t($locale, 'المتبقي', 'Reste à collecter'), self::money(max(0.0, $expected - $collected), $currency, $locale)],
            [self::t($locale, 'الشقق المسددة', 'Appartements soldés'), $settled . ' / ' . count($apartments)],
            [self::t($locale, 'عدد الدفعات', 'Nombre de paiements'), (string) $paymentsCount],
            [self::t($locale, 'عمليات التصحيح', 'Opérations d\'annulation'), (string) $reversalsCount],
        ];
        foreach ($summary as $i => [$label, $value]) {
            if ($i % 2 === 0) $pdf->rect($left, $y - 13, $right - $left, 24, [0.96, 0.97, 0.97]);
            $pdf->text($label, $anchor - ($rtl ? 10 : -10), $y + 3, 10.5, $align, [0.35, 0.4, 0.42]);
            $pdf->text($value, $opposite + ($rtl ? 10 : -10), $y + 3, 11, $oppositeAlign);
            $y += 24;
        }

        $y += 20;
        $pdf->text(self::t($locale, 'المشاريع', 'Projets'), $anchor, $y, 13, $align, [0.06, 0.28, 0.29]);
        $y += 16;
        $pdf->line($left, $y, $right, $y);
        $y += 16;
        foreach ($projects as $p) {
            if ($y > Pdf::A4_H - 90) { $pdf->addPage(); $y = 70; }
            $name = self::t($locale, (string) $p['name_ar'], (string) $p['name_fr']);
            $pdf->text($name, $anchor, $y, 10.5, $align);
            $pdf->text(
                self::money((float) $p['collected_total'], $currency, $locale) . ' / ' . self::money((float) $p['expected_total'], $currency, $locale),
                $opposite, $y, 10, $oppositeAlign, [0.35, 0.4, 0.42]
            );
            $y += 20;
        }

        $y += 16;
        if ($y > Pdf::A4_H - 140) { $pdf->addPage(); $y = 70; }
        $pdf->text(self::t($locale, 'أرصدة الشقق', 'Soldes par appartement'), $anchor, $y, 13, $align, [0.06, 0.28, 0.29]);
        $y += 16;
        $pdf->line($left, $y, $right, $y);
        $y += 16;
        foreach ($apartments as $a) {
            if ($y > Pdf::A4_H - 80) { $pdf->addPage(); $y = 70; }
            $balance = (float) $a['required_total'] - (float) $a['paid_total'];
            $pdf->text(self::t($locale, 'شقة ', 'Apt ') . $a['number'], $anchor, $y, 10, $align);
            $pdf->text(
                self::money((float) $a['paid_total'], $currency, $locale) . '  •  ' .
                self::t($locale, 'الرصيد: ', 'Solde : ') . self::money($balance, $currency, $locale),
                $opposite, $y, 9.5, $oppositeAlign, $balance > 0 ? [0.65, 0.2, 0.18] : [0.15, 0.45, 0.3]
            );
            $y += 17;
        }

        self::footer($pdf, $locale, self::t(
            $locale,
            'أرقام محسوبة مباشرة من قاعدة البيانات — العمارة 29 — ' . date('Y-m-d H:i'),
            'Chiffres calculés directement depuis la base de données — Immeuble 29 — ' . date('Y-m-d H:i')
        ));

        Audit::log($m['id'], 'pdf.generate', 'financial_report', null, null, ['locale' => $locale, 'expected' => $expected, 'collected' => $collected]);
        self::stream($pdf, 'financial-report-' . date('Ymd-Hi') . '.pdf');
    }
}
