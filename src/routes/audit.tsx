import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { auditApi } from "@/api/endpoints";
import { AppShell } from "@/components/app/AppShell";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n } from "@/i18n";
import { ErrorState } from "@/components/app/ApiState";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/audit")({
  head: () => ({
    meta: [
      { title: "سجل العمليات | Immeuble 29 — Journal" },
      { name: "description", content: "Journal des opérations du gestionnaire : paiements, quotes-parts, paramètres et documents de l'immeuble 29." },
      { property: "og:title", content: "Immeuble 29 — Journal des opérations" },
      { property: "og:description", content: "Journal des opérations sensibles réservé au gestionnaire." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <AppShell>
      <AuditPage />
    </AppShell>
  ),
});

const EMPTY = { entity: "", action: "", from: "", to: "" };

function AuditPage() {
  const { t, locale } = useI18n();
  const { isManager } = useAuth();
  const [draft, setDraft] = useState(EMPTY);
  const [filters, setFilters] = useState(EMPTY);

  const logs = useQuery({
    queryKey: ["audit", filters],
    queryFn: () => auditApi.list({ ...filters, limit: 200 }),
    enabled: isManager,
  });

  if (!isManager) return <p className="text-muted-foreground text-sm">{t("unauthorized")}</p>;

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-bold">{t("audit_log")}</h1>

      <Card>
        <CardContent className="grid gap-3 py-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1.5">
            <Label htmlFor="entity">{t("entity")}</Label>
            <Input id="entity" value={draft.entity} onChange={(e) => setDraft({ ...draft, entity: e.target.value })} placeholder="payment" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="action">{t("action")}</Label>
            <Input id="action" value={draft.action} onChange={(e) => setDraft({ ...draft, action: e.target.value })} placeholder="payment_create" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="from">{t("from_date")}</Label>
            <Input id="from" type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="to">{t("to_date")}</Label>
            <Input id="to" type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
          </div>
          <div className="flex items-end gap-2">
            <Button onClick={() => setFilters(draft)}>{t("apply")}</Button>
            <Button
              variant="outline"
              onClick={() => {
                setDraft(EMPTY);
                setFilters(EMPTY);
              }}
            >
              {t("reset")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {logs.isPending && <p className="text-muted-foreground text-sm">{t("loading")}</p>}
      {logs.isError && <ErrorState error={logs.error} onRetry={() => void logs.refetch()} />}
      {logs.data?.length === 0 && <p className="text-muted-foreground text-sm">{t("no_data")}</p>}

      <div className="space-y-2">
        {(logs.data ?? []).map((entry) => (
          <Card key={entry.id}>
            <CardContent className="space-y-1 py-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="bg-secondary rounded px-2 py-0.5 font-mono text-xs">{entry.action}</span>
                <span className="text-muted-foreground">
                  {entry.entity}
                  {entry.entity_id ? ` #${entry.entity_id}` : ""}
                </span>
                <span className="ms-auto text-muted-foreground text-xs">
                  {new Intl.DateTimeFormat(locale === "ar" ? "ar-DZ" : "fr-DZ", {
                    dateStyle: "short",
                    timeStyle: "short",
                  }).format(new Date(entry.created_at.replace(" ", "T")))}
                </span>
              </div>
              <p className="text-muted-foreground">
                {t("actor")}: {entry.actor_name ?? "—"}
              </p>
              {(entry.before || entry.after) && (
                <pre className="bg-muted overflow-x-auto rounded p-2 text-[11px]" dir="ltr">
                  {JSON.stringify({ before: entry.before, after: entry.after }, null, 1)}
                </pre>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
