import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ReceiptText } from "lucide-react";
import { apartmentsApi } from "@/api/endpoints";
import { AppShell } from "@/components/app/AppShell";
import { useI18n } from "@/i18n";
import { formatDate, formatMoney } from "@/lib/format";
import { statusKey } from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/apartments/$id")({
  head: () => ({
    meta: [
      { title: "تفاصيل الشقة | Immeuble 29 — Détail de l'appartement" },
      { name: "description", content: "Résidents, contributions dues et paiements enregistrés pour un appartement." },
      { property: "og:title", content: "Immeuble 29 — Détail de l'appartement" },
      { property: "og:description", content: "Résidents, contributions dues et paiements enregistrés pour un appartement." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <AppShell>
      <ApartmentDetailPage />
    </AppShell>
  ),
});

function ApartmentDetailPage() {
  const { id } = Route.useParams();
  const { t, locale, bi } = useI18n();
  const { data, isPending } = useQuery({ queryKey: ["apartment", id], queryFn: () => apartmentsApi.detail(Number(id)) });

  if (isPending || !data) return <p className="text-sm text-muted-foreground">{t("loading")}</p>;

  return (
    <div className="space-y-5">
      <Link to="/apartments" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4 rtl:rotate-180" />
        {t("back")}
      </Link>

      <div>
        <h1 className="font-display text-2xl font-bold">
          {t("apartment")} {data.apartment.number}
        </h1>
        <p className="text-sm text-muted-foreground">
          {data.apartment.floor === 0 ? t("ground_floor") : `${t("floor")} ${data.apartment.floor}`}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("residents")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.residents.map((resident) => (
            <div key={resident.id} className="flex items-center justify-between gap-2 border-b pb-2 text-sm last:border-0">
              <div>
                <p className="font-medium">{resident.full_name}</p>
                <p className="text-xs text-muted-foreground">{resident.phone}</p>
              </div>
              <Badge variant="outline">{resident.person_rank === "primary" ? t("primary") : t("secondary")}</Badge>
            </div>
          ))}
          {data.residents.length === 0 && <p className="text-sm text-muted-foreground">{t("no_data")}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("contribution")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.contributions.map((contribution) => (
            <div key={contribution.project_id} className="flex items-center justify-between gap-2 border-b pb-2 text-sm last:border-0">
              <div className="min-w-0">
                <p className="truncate font-medium">{bi(contribution.name_ar, contribution.name_fr)}</p>
                <p className="text-xs text-muted-foreground">{t(statusKey(contribution.status))}</p>
              </div>
              <span className="whitespace-nowrap">
                {formatMoney(contribution.paid, locale)} / {formatMoney(contribution.required_amount, locale)}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("payments_history")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.payments.map((payment) => (
            <div key={payment.id} className="flex items-center justify-between gap-2 border-b pb-2 text-sm last:border-0">
              <div className="min-w-0">
                <p className="truncate font-medium">{bi(payment.name_ar, payment.name_fr)}</p>
                <p className="text-xs text-muted-foreground">{formatDate(payment.paid_at, locale)}</p>
              </div>
              <div className="flex items-center gap-2 whitespace-nowrap">
                <span className="font-semibold">{formatMoney(payment.amount, locale)}</span>
                {payment.receipt_no && (
                  <Link to="/receipts/$no" params={{ no: payment.receipt_no }} className="text-primary">
                    <ReceiptText className="size-4" />
                  </Link>
                )}
              </div>
            </div>
          ))}
          {data.payments.length === 0 && <p className="text-sm text-muted-foreground">{t("no_data")}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
