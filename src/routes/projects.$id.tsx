import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Circle, Lock } from "lucide-react";
import { useState } from "react";
import { contributionsApi, projectsApi } from "@/api/endpoints";
import type { ProjectDetail } from "@/api/types";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppShell } from "@/components/app/AppShell";
import { useI18n } from "@/i18n";
import { ErrorState } from "@/components/app/ApiState";
import { formatDate, formatMoney, percent } from "@/lib/format";
import { categoryKey, priorityKey, statusKey } from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export const Route = createFileRoute("/projects/$id")({
  head: () => ({
    meta: [
      { title: "تفاصيل المشروع | Immeuble 29 — Détail du projet" },
      {
        name: "description",
        content:
          "Détail d'un projet de l'immeuble : coût, avancement et appartements ayant contribué.",
      },
      { property: "og:title", content: "Immeuble 29 — Détail du projet" },
      {
        property: "og:description",
        content:
          "Détail d'un projet de l'immeuble : coût, avancement et appartements ayant contribué.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <AppShell>
      <ProjectDetailPage />
    </AppShell>
  ),
});

function ProjectDetailPage() {
  const { id } = Route.useParams();
  const { t, locale, bi } = useI18n();
  const { data, isPending } = useQuery({
    queryKey: ["project", id],
    queryFn: () => projectsApi.detail(Number(id)),
  });

  if (isPending || !data) return <p className="text-sm text-muted-foreground">{t("loading")}</p>;
  const { project, apartments } = data;

  return (
    <div className="space-y-5">
      <Link
        to="/projects"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4 rtl:rotate-180" />
        {t("back")}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">
            {bi(project.name_ar, project.name_fr)}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t(categoryKey(project.category))} · {t(priorityKey(project.priority))}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{t(statusKey(project.status))}</Badge>
          {project.financially_locked && (
            <Badge variant="outline" className="gap-1">
              <Lock className="size-3" />
              {t("financially_locked")}
            </Badge>
          )}
        </div>
      </div>

      <FinancialLockBar project={project} projectId={Number(id)} />

      <Card>
        <CardContent className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Info label={t("estimated_cost")} value={formatMoney(project.estimated_cost, locale)} />
          <Info
            label={t("contribution")}
            value={formatMoney(project.contribution_per_apartment, locale)}
          />
          <Info label={t("collected_total")} value={formatMoney(project.collected_total, locale)} />
          <Info label={t("remaining_total")} value={formatMoney(project.remaining_total, locale)} />
          <div className="sm:col-span-2 lg:col-span-4">
            <Progress value={percent(project.collected_total, project.expected_total)} />
            <p className="mt-2 text-xs text-muted-foreground">
              {project.paid_apartments}/{apartments.length} {t("apartments")} · {t("progress")}{" "}
              {project.progress}%
            </p>
          </div>
          {project.contractor_name && (
            <Info
              label={t("contractor")}
              value={`${project.contractor_name} · ${project.contractor_phone ?? ""}`}
            />
          )}
          {project.final_cost !== null && (
            <Info label={t("final_cost")} value={formatMoney(project.final_cost, locale)} />
          )}
          {project.planned_end && (
            <Info label={t("date")} value={formatDate(project.planned_end, locale)} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("apartments")}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
          {apartments.map((apartment) => (
            <Link
              key={apartment.id}
              to="/apartments/$id"
              params={{ id: String(apartment.id) }}
              className="flex items-center gap-2 rounded-lg border p-2 text-sm transition-colors hover:bg-muted"
            >
              {apartment.settled ? (
                <CheckCircle2 className="size-4 text-success" />
              ) : (
                <Circle className="size-4 text-muted-foreground" />
              )}
              <span className="truncate">{apartment.number}</span>
            </Link>
          ))}
        </CardContent>
      </Card>

      <ContributionsCard projectId={Number(id)} locked={project.financially_locked} />
    </div>
  );
}

/**
 * Approving the amounts is a one-way door. The button only hides the control:
 * the API and a database trigger are what actually make the amounts immutable.
 */
function FinancialLockBar({
  project,
  projectId,
}: {
  project: ProjectDetail["project"];
  projectId: number;
}) {
  const { t } = useI18n();
  const { isManager } = useAuth();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const lock = useMutation({
    mutationFn: () => projectsApi.lock(projectId),
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["project", String(projectId)] });
      await queryClient.invalidateQueries({ queryKey: ["contributions", projectId] });
    },
    onError: (err: unknown) => setError(err instanceof Error ? err.message : t("error_generic")),
  });

  if (project.financially_locked) {
    return (
      <p className="flex items-start gap-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
        <Lock className="mt-0.5 size-3.5 shrink-0" />
        {t("financial_lock_hint")}
      </p>
    );
  }
  if (!isManager) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-dashed p-3">
      <p className="text-xs text-muted-foreground">{t("financial_lock_hint")}</p>
      <Button
        size="sm"
        variant="outline"
        className="ms-auto gap-2"
        disabled={lock.isPending}
        onClick={() => {
          if (window.confirm(t("financial_lock_confirm"))) lock.mutate();
        }}
      >
        <Lock className="size-4" />
        {t("financial_lock")}
      </Button>
      {error && <p className="w-full text-sm text-destructive">{error}</p>}
    </div>
  );
}

function ContributionsCard({ projectId, locked }: { projectId: number; locked: boolean }) {
  const { t, locale } = useI18n();
  const { isManager } = useAuth();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  const rows = useQuery({
    queryKey: ["contributions", projectId],
    queryFn: () => contributionsApi.list(projectId),
  });

  const save = useMutation({
    mutationFn: ({ apartmentId, input }: { apartmentId: number; input: Record<string, unknown> }) =>
      contributionsApi.update(projectId, apartmentId, input),
    onSuccess: async () => {
      setEditing(null);
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["contributions", projectId] });
      await queryClient.invalidateQueries({ queryKey: ["project", String(projectId)] });
    },
    onError: (err: unknown) => setError(err instanceof Error ? err.message : t("error_generic")),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("contributions")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.isPending && <p className="text-muted-foreground text-sm">{t("loading")}</p>}
        {rows.isError && <ErrorState error={rows.error} onRetry={() => void rows.refetch()} />}
        {rows.data?.length === 0 && <p className="text-muted-foreground text-sm">{t("no_data")}</p>}
        {error && <p className="text-destructive text-sm">{error}</p>}
        {(rows.data ?? []).map((row) => (
          <div
            key={row.apartment_id}
            className="flex flex-wrap items-center gap-2 border-b py-2 text-sm last:border-0"
          >
            <span className="w-16 font-medium">{row.number}</span>
            <span className="text-muted-foreground">
              {t("required")}: {formatMoney(row.required, locale)}
            </span>
            <span className="text-muted-foreground">
              {t("paid")}: {formatMoney(row.paid, locale)}
            </span>
            <Badge variant={row.exempt ? "outline" : row.settled ? "secondary" : "destructive"}>
              {row.exempt
                ? t("exempt")
                : row.settled
                  ? t("settled")
                  : formatMoney(row.balance, locale)}
            </Badge>
            {isManager && !locked && (
              <div className="ms-auto flex items-center gap-2">
                {editing === row.apartment_id ? (
                  <>
                    <Input
                      className="h-8 w-28"
                      type="number"
                      min={0}
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                    />
                    <Button
                      size="sm"
                      disabled={save.isPending}
                      onClick={() =>
                        save.mutate({
                          apartmentId: row.apartment_id,
                          input: { required_amount: Number(amount) },
                        })
                      }
                    >
                      {t("save")}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                      {t("cancel")}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditing(row.apartment_id);
                        setAmount(String(row.required));
                      }}
                    >
                      {t("edit")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={save.isPending}
                      onClick={() =>
                        save.mutate({
                          apartmentId: row.apartment_id,
                          input: { exempt: !row.exempt },
                        })
                      }
                    >
                      {t("exempt")}
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
