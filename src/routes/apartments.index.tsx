import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { apartmentsApi } from "@/api/endpoints";
import { AppShell } from "@/components/app/AppShell";
import { useI18n } from "@/i18n";
import { formatMoney } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/apartments/")({
  head: () => ({
    meta: [
      { title: "الشقق | Immeuble 29 — Appartements" },
      { name: "description", content: "Les 40 appartements de l'immeuble avec leur solde de contributions." },
      { property: "og:title", content: "Immeuble 29 — Appartements" },
      { property: "og:description", content: "Les 40 appartements de l'immeuble avec leur solde de contributions." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <AppShell>
      <ApartmentsPage />
    </AppShell>
  ),
});

function ApartmentsPage() {
  const { t, locale } = useI18n();
  const { data, isPending } = useQuery({ queryKey: ["apartments"], queryFn: apartmentsApi.list });
  const [term, setTerm] = useState("");

  const rows = (data ?? []).filter(
    (row) =>
      row.number.toLowerCase().includes(term.toLowerCase()) ||
      (row.primary_name ?? "").toLowerCase().includes(term.toLowerCase()),
  );

  const floors = Array.from(new Set(rows.map((row) => row.floor))).sort((a, b) => a - b);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold">{t("apartments")}</h1>
        <Input className="w-56" placeholder={t("search")} value={term} onChange={(e) => setTerm(e.target.value)} />
      </div>

      {isPending && <p className="text-sm text-muted-foreground">{t("loading")}</p>}

      {floors.map((floor) => (
        <section key={floor} className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">
            {floor === 0 ? t("ground_floor") : `${t("floor")} ${floor}`}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {rows
              .filter((row) => row.floor === floor)
              .map((row) => (
                <Link key={row.id} to="/apartments/$id" params={{ id: String(row.id) }}>
                  <Card className="h-full transition-shadow hover:shadow-md">
                    <CardContent className="space-y-1 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-display font-bold">{row.number}</p>
                        <Badge variant={row.balance > 0 ? "outline" : "secondary"}>
                          {row.balance > 0 ? t("unpaid") : t("settled")}
                        </Badge>
                      </div>
                      <p className="truncate text-sm text-muted-foreground">{row.primary_name ?? "—"}</p>
                      <p className="text-xs">
                        {t("paid")}: {formatMoney(row.paid_total, locale)} · {t("balance")}: {formatMoney(row.balance, locale)}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}
