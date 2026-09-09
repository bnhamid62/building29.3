import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
import { projectsApi } from "@/api/endpoints";
import type { ProjectCategory, ProjectStatus } from "@/api/types";
import { AppShell } from "@/components/app/AppShell";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n } from "@/i18n";
import { formatMoney, percent } from "@/lib/format";
import { categoryKey, priorityKey, statusKey } from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/projects/")({
  head: () => ({
    meta: [
      { title: "المشاريع | Immeuble 29 — Projets" },
      { name: "description", content: "Projets de l'immeuble : coûts, quote-part par appartement et avancement." },
      { property: "og:title", content: "Immeuble 29 — Projets" },
      { property: "og:description", content: "Projets de l'immeuble : coûts, quote-part par appartement et avancement." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <AppShell>
      <ProjectsPage />
    </AppShell>
  ),
});

const CATEGORIES: ProjectCategory[] = [
  "cleaning",
  "elevator",
  "lighting",
  "electricity",
  "cameras",
  "basement",
  "water_leak",
  "repair",
  "emergency",
  "custom",
];
const STATUSES: ProjectStatus[] = [
  "proposed",
  "awaiting_approval",
  "fundraising",
  "scheduled",
  "in_progress",
  "paused",
  "completed",
  "cancelled",
];

function ProjectsPage() {
  const { t, locale, bi } = useI18n();
  const { isManager } = useAuth();
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery({ queryKey: ["projects"], queryFn: projectsApi.list });
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | ProjectStatus>("all");

  const create = useMutation({
    mutationFn: (input: Record<string, unknown>) => projectsApi.create(input),
    onSuccess: async () => {
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    create.mutate({
      name_ar: form.get("name_ar"),
      name_fr: form.get("name_fr"),
      category: form.get("category"),
      status: form.get("status"),
      priority: form.get("priority"),
      estimated_cost: Number(form.get("estimated_cost")),
      contribution_per_apartment: Number(form.get("contribution_per_apartment")),
      contractor_name: form.get("contractor_name"),
      contractor_phone: form.get("contractor_phone"),
      progress: 0,
    });
  };

  const projects = (data ?? []).filter((p) => filter === "all" || p.status === filter);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold">{t("projects")}</h1>
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={(value) => setFilter(value as typeof filter)}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("all_projects")}</SelectItem>
              {STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {t(statusKey(status))}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isManager && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="size-4" />
                  {t("new_project")}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>{t("new_project")}</DialogTitle>
                </DialogHeader>
                <form className="grid gap-3 sm:grid-cols-2" onSubmit={submit}>
                  <Field label={`${t("name")} (AR)`} name="name_ar" required />
                  <Field label={`${t("name")} (FR)`} name="name_fr" required />
                  <div className="space-y-1.5">
                    <Label>{t("category")}</Label>
                    <Select name="category" defaultValue="repair">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map((category) => (
                          <SelectItem key={category} value={category}>
                            {t(categoryKey(category))}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("status")}</Label>
                    <Select name="status" defaultValue="proposed">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUSES.map((status) => (
                          <SelectItem key={status} value={status}>
                            {t(statusKey(status))}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("priority")}</Label>
                    <Select name="priority" defaultValue="normal">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {["low", "normal", "high", "urgent"].map((priority) => (
                          <SelectItem key={priority} value={priority}>
                            {t(priorityKey(priority))}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Field label={t("estimated_cost")} name="estimated_cost" type="number" required />
                  <Field label={t("contribution")} name="contribution_per_apartment" type="number" required />
                  <Field label={t("contractor")} name="contractor_name" />
                  <Field label={t("phone")} name="contractor_phone" />
                  <div className="sm:col-span-2">
                    <Button type="submit" className="w-full" disabled={create.isPending}>
                      {t("save")}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {isPending && <p className="text-sm text-muted-foreground">{t("loading")}</p>}

      <div className="grid gap-3 md:grid-cols-2">
        {projects.map((project) => (
          <Link key={project.id} to="/projects/$id" params={{ id: String(project.id) }}>
            <Card className="h-full transition-shadow hover:shadow-md">
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{bi(project.name_ar, project.name_fr)}</p>
                    <p className="text-xs text-muted-foreground">{t(categoryKey(project.category))}</p>
                  </div>
                  <Badge variant="secondary">{t(statusKey(project.status))}</Badge>
                </div>
                <Progress value={percent(project.collected_total, project.expected_total)} />
                <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                  <span>
                    {t("contribution")}: {formatMoney(project.contribution_per_apartment, locale)}
                  </span>
                  <span>
                    {formatMoney(project.collected_total, locale)} / {formatMoney(project.expected_total, locale)}
                  </span>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
      {!isPending && projects.length === 0 && <p className="text-sm text-muted-foreground">{t("no_data")}</p>}
    </div>
  );
}

function Field({ label, name, type = "text", required }: { label: string; name: string; type?: string; required?: boolean }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} required={required} />
    </div>
  );
}
