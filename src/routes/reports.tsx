import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Printer, Download } from "lucide-react";
import { reportsApi } from "@/api/endpoints";
import { AppShell } from "@/components/app/AppShell";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n } from "@/i18n";
import { ErrorState } from "@/components/app/ApiState";
import { formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { pdfApi } from "@/api/endpoints";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "التقرير المالي | Immeuble 29 — Rapport financier" },
      { name: "description", content: "Rapport financier de l'immeuble 29 : montants attendus, encaissés et restants par projet et par appartement." },
      { property: "og:title", content: "Immeuble 29 — Rapport financier" },
      { property: "og:description", content: "Montants attendus, encaissés et restants par projet et par appartement." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <AppShell>
      <ReportsPage />
    </AppShell>
  ),
});

function ReportsPage() {
  const { t, locale } = useI18n();
  const { isManager } = useAuth();
  const report = useQuery({ queryKey: ["reports", "financial"], queryFn: reportsApi.financial, enabled: isManager });

  if (!isManager) return <p className="text-muted-foreground text-sm">{t("unauthorized")}</p>;
  if (report.isPending) return <p className="text-muted-foreground text-sm">{t("loading")}</p>;
  if (report.isError || !report.data) return <ErrorState error={report.error} onRetry={() => void report.refetch()} />;

  const data = report.data;
  const currency = data.building.currency;
  const money = (value: number) => formatMoney(value, locale, currency);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">{t("financial_report")}</h1>
          <p className="text-muted-foreground text-sm">
            {locale === "ar" ? data.building.name_ar : data.building.name_fr} · {t("generated_at")}{" "}
            {new Intl.DateTimeFormat(locale === "ar" ? "ar-DZ" : "fr-DZ", { dateStyle: "medium", timeStyle: "short" }).format(
              new Date(data.generated_at),
            )}
          </p>
        </div>
        <div className="no-print ms-auto flex gap-2">
          <Button variant="outline" onClick={() => void pdfApi.financialReport()}>
            <Download className="size-4" />
            {t("download_pdf")}
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="size-4" />
            {t("print")}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: t("expected_total"), value: money(data.totals.expected_total) },
          { label: t("collected_total"), value: money(data.totals.collected_total) },
          { label: t("remaining_total"), value: money(data.totals.remaining_total) },
          { label: t("apartments_settled"), value: `${data.totals.apartments_settled} / ${data.totals.apartments_total}` },
        ].map((item) => (
          <Card key={item.label}>
            <CardContent className="py-4">
              <p className="text-muted-foreground text-xs">{item.label}</p>
              <p className="font-display text-xl font-bold">{item.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="overflow-x-auto py-4">
          <h2 className="mb-3 font-semibold">{t("projects")}</h2>
          <table className="w-full text-sm">
            <thead className="text-muted-foreground text-start text-xs">
              <tr>
                <th className="py-1 text-start">{t("name")}</th>
                <th className="py-1 text-start">{t("expected_total")}</th>
                <th className="py-1 text-start">{t("collected_total")}</th>
                <th className="py-1 text-start">{t("remaining_total")}</th>
              </tr>
            </thead>
            <tbody>
              {data.projects.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="py-2">{locale === "ar" ? p.name_ar : p.name_fr}</td>
                  <td className="py-2">{money(p.expected_total)}</td>
                  <td className="py-2">{money(p.collected_total)}</td>
                  <td className="py-2">{money(p.remaining_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="overflow-x-auto py-4">
          <h2 className="mb-3 font-semibold">{t("apartments")}</h2>
          <table className="w-full text-sm">
            <thead className="text-muted-foreground text-xs">
              <tr>
                <th className="py-1 text-start">{t("apartment")}</th>
                <th className="py-1 text-start">{t("required")}</th>
                <th className="py-1 text-start">{t("paid")}</th>
                <th className="py-1 text-start">{t("balance")}</th>
              </tr>
            </thead>
            <tbody>
              {data.apartments.map((a) => (
                <tr key={a.id} className="border-t">
                  <td className="py-2">{a.number}</td>
                  <td className="py-2">{money(a.required_total)}</td>
                  <td className="py-2">{money(a.paid_total)}</td>
                  <td className={a.balance > 0 ? "text-destructive py-2" : "py-2 text-emerald-600"}>{money(a.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
