import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Printer, Download } from "lucide-react";
import { paymentsApi } from "@/api/endpoints";
import { AppShell } from "@/components/app/AppShell";
import { useI18n } from "@/i18n";
import { ErrorState } from "@/components/app/ApiState";
import { formatDate, formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { pdfApi } from "@/api/endpoints";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/receipts/$no")({
  head: () => ({
    meta: [
      { title: "الوصل | Immeuble 29 — Reçu de paiement" },
      { name: "description", content: "Reçu de paiement numéroté, imprimable ou exportable en PDF." },
      { property: "og:title", content: "Immeuble 29 — Reçu de paiement" },
      { property: "og:description", content: "Reçu de paiement numéroté, imprimable ou exportable en PDF." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <AppShell>
      <ReceiptPage />
    </AppShell>
  ),
});

function ReceiptPage() {
  const { no } = Route.useParams();
  const { t, locale, bi } = useI18n();
  const { data, isPending, isError, error, refetch } = useQuery({ queryKey: ["receipt", no], queryFn: () => paymentsApi.receipt(no) });

  if (isPending) return <p className="text-sm text-muted-foreground">{t("loading")}</p>;
  if (isError || !data) return <ErrorState error={error} onRetry={() => void refetch()} />;

  const { receipt, building } = data;

  return (
    <div className="space-y-4">
      <div className="no-print flex items-center justify-between gap-2">
        <Link to="/payments" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4 rtl:rotate-180" />
          {t("back")}
        </Link>
        <div className="flex gap-2">
          <Button variant="outline" disabled={!receipt.receipt_no} onClick={() => void pdfApi.receipt(receipt.receipt_no ?? "")}>
            <Download className="size-4" />
            {t("download_pdf")}
          </Button>
          <Button onClick={() => window.print()}>
            <Printer className="size-4" />
            {t("print")}
          </Button>
        </div>
      </div>

      <Card className="mx-auto max-w-xl">
        <CardContent className="space-y-5 p-6">
          <div className="border-b pb-4 text-center">
            <h1 className="font-display text-xl font-bold">{bi(building.name_ar, building.name_fr)}</h1>
            <p className="text-xs text-muted-foreground">{bi(building.address_ar, building.address_fr)}</p>
            <p className="mt-3 font-display text-lg font-semibold">{t("receipt")}</p>
            <p className="text-sm">{receipt.receipt_no}</p>
          </div>

          <dl className="space-y-2 text-sm">
            <Row label={t("apartment")} value={receipt.apartment_number ?? "—"} />
            <Row label={t("name")} value={receipt.resident_name ?? "—"} />
            <Row label={t("projects")} value={bi(receipt.project_name_ar, receipt.project_name_fr)} />
            <Row label={t("method")} value={t(receipt.method)} />
            <Row label={t("date")} value={formatDate(receipt.paid_at, locale)} />
            {receipt.notes && <Row label={t("notes")} value={receipt.notes} />}
          </dl>

          <div className="flex items-center justify-between border-t pt-4">
            <span className="font-medium">{t("amount")}</span>
            <span className="font-display text-2xl font-bold">{formatMoney(receipt.amount, locale)}</span>
          </div>

          <p className="text-center text-xs text-muted-foreground">
            {t("manager")}: {receipt.recorded_by_name ?? "—"}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b pb-1.5 last:border-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-end font-medium">{value}</dd>
    </div>
  );
}
