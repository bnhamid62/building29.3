import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Wallet, TrendingUp, AlertCircle, DoorClosed, Home } from "lucide-react";
import { buildingApi } from "@/api/endpoints";
import { AppShell } from "@/components/app/AppShell";
import { StatCard } from "@/components/app/StatCard";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n } from "@/i18n";
import { formatDate, formatMoney, percent } from "@/lib/format";
import { equipmentKey, statusKey } from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "لوحة القيادة | Immeuble 29 — Tableau de bord" },
      { name: "description", content: "Suivi des projets, des contributions et des paiements de l'Immeuble 29." },
      { property: "og:title", content: "Immeuble 29 — Tableau de bord" },
      { property: "og:description", content: "Suivi des projets, des contributions et des paiements de l'Immeuble 29." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <AppShell>
      <DashboardPage />
    </AppShell>
  ),
});

function DashboardPage() {
  const { t, locale, bi } = useI18n();
  const { isManager, user } = useAuth();
  const { data, isPending } = useQuery({ queryKey: ["dashboard"], queryFn: buildingApi.dashboard });

  if (isPending || !data) return <p className="text-sm text-muted-foreground">{t("loading")}</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">{t("dashboard")}</h1>
        <p className="text-sm text-muted-foreground">{user?.full_name}</p>
      </div>

      {isManager ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={TrendingUp} tone="primary" label={t("expected_total")} value={formatMoney(data.expected_total, locale)} />
          <StatCard icon={Wallet} tone="success" label={t("collected_total")} value={formatMoney(data.collected_total, locale)} />
          <StatCard icon={AlertCircle} tone="warning" label={t("remaining_total")} value={formatMoney(data.remaining_total, locale)} />
          <StatCard
            icon={DoorClosed}
            label={t("apartments_settled")}
            value={`${data.apartments_settled}/${data.apartments_total}`}
            hint={`${data.apartments_unpaid} ${t("apartments_unpaid")}`}
          />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard icon={Home} tone="primary" label={t("my_apartment")} value={data.my_apartment?.apartment_number ?? "—"} />
          <StatCard icon={Wallet} tone="success" label={t("paid")} value={formatMoney(data.my_apartment?.paid ?? 0, locale)} />
          <StatCard
            icon={AlertCircle}
            tone={(data.my_apartment?.balance ?? 0) > 0 ? "warning" : "success"}
            label={t("balance")}
            value={formatMoney(data.my_apartment?.balance ?? 0, locale)}
          />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("transparency")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Progress value={percent(data.collected_total, data.expected_total)} />
          <p className="mt-2 text-xs text-muted-foreground">
            {formatMoney(data.collected_total, locale)} / {formatMoney(data.expected_total, locale)}
          </p>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">{t("active_projects")}</h2>
          <Link to="/projects" className="text-sm text-primary underline-offset-4 hover:underline">
            {t("all_projects")}
          </Link>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {data.active_projects.map((project) => (
            <Link key={project.id} to="/projects/$id" params={{ id: String(project.id) }}>
              <Card className="h-full transition-shadow hover:shadow-md">
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium">{bi(project.name_ar, project.name_fr)}</p>
                    <Badge variant="secondary">{t(statusKey(project.status))}</Badge>
                  </div>
                  <Progress value={percent(project.collected_total, project.expected_total)} />
                  <p className="text-xs text-muted-foreground">
                    {formatMoney(project.collected_total, locale)} / {formatMoney(project.expected_total, locale)} ·{" "}
                    {project.paid_apartments}/{data.apartments_total} {t("apartments")}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
          {data.active_projects.length === 0 && <p className="text-sm text-muted-foreground">{t("no_data")}</p>}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("recent_payments")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.recent_payments.map((payment) => (
              <div key={payment.id} className="flex items-center justify-between gap-2 border-b pb-2 text-sm last:border-0">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {t("apartment")} {payment.apartment_number} · {bi(payment.project_name_ar, payment.project_name_fr)}
                  </p>
                  <p className="text-xs text-muted-foreground">{formatDate(payment.paid_at, locale)}</p>
                </div>
                <span className="font-semibold whitespace-nowrap">{formatMoney(payment.amount, locale)}</span>
              </div>
            ))}
            {data.recent_payments.length === 0 && <p className="text-sm text-muted-foreground">{t("no_data")}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("equipment")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.equipment.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-2 border-b pb-2 text-sm last:border-0">
                <span>{bi(item.name_ar, item.name_fr)}</span>
                <Badge variant={item.status === "ok" ? "secondary" : "outline"}>{t(equipmentKey(item.status))}</Badge>
              </div>
            ))}
            {data.equipment.length === 0 && <p className="text-sm text-muted-foreground">{t("no_data")}</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
