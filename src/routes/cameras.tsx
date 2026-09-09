import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Cctv, Plus } from "lucide-react";
import { camerasApi } from "@/api/endpoints";
import { AppShell } from "@/components/app/AppShell";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n } from "@/i18n";
import { ErrorState } from "@/components/app/ApiState";
import { formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/cameras")({
  head: () => ({
    meta: [
      { title: "الكاميرات | Immeuble 29 — Caméras" },
      { name: "description", content: "Registre des caméras de sécurité de l'immeuble 29 : zones couvertes, état et dernier contrôle technique." },
      { property: "og:title", content: "Immeuble 29 — Caméras" },
      { property: "og:description", content: "Registre d'information des caméras de sécurité." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <AppShell>
      <CamerasPage />
    </AppShell>
  ),
});

function CamerasPage() {
  const { t, locale, bi } = useI18n();
  const { isManager } = useAuth();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", location: "", coverage_ar: "", coverage_fr: "" });

  const list = useQuery({ queryKey: ["cameras"], queryFn: camerasApi.list });

  const create = useMutation({
    mutationFn: () => camerasApi.create(form),
    onSuccess: async () => {
      setError(null);
      setForm({ name: "", location: "", coverage_ar: "", coverage_fr: "" });
      await qc.invalidateQueries({ queryKey: ["cameras"] });
    },
    onError: (err: unknown) => setError(err instanceof Error ? err.message : t("error_generic")),
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold">{t("camera_register")}</h1>
        <p className="text-muted-foreground text-sm">{t("camera_privacy_note")}</p>
      </div>

      {isManager && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("save")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cam-name">{t("name")}</Label>
                <Input id="cam-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cam-loc">{t("location")}</Label>
                <Input id="cam-loc" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
              </div>
              <Input placeholder={`${t("coverage")} (ع)`} value={form.coverage_ar} onChange={(e) => setForm({ ...form, coverage_ar: e.target.value })} />
              <Input placeholder={`${t("coverage")} (FR)`} value={form.coverage_fr} onChange={(e) => setForm({ ...form, coverage_fr: e.target.value })} />
            </div>
            {error && <p className="text-destructive text-sm">{error}</p>}
            <Button disabled={create.isPending || form.name.trim().length < 2} onClick={() => create.mutate()}>
              <Plus className="size-4" />
              {t("save")}
            </Button>
          </CardContent>
        </Card>
      )}

      {list.isPending && <p className="text-muted-foreground text-sm">{t("loading")}</p>}
      {list.isError && <ErrorState error={list.error} onRetry={() => void list.refetch()} />}
      {list.data?.length === 0 && <p className="text-muted-foreground text-sm">{t("no_cameras")}</p>}

      <div className="grid gap-2 sm:grid-cols-2">
        {(list.data ?? []).map((c) => (
          <Card key={c.id}>
            <CardContent className="space-y-1 py-3 text-sm">
              <div className="flex items-center gap-2">
                <Cctv className="text-primary size-4" />
                <span className="font-medium">{c.name}</span>
                <Badge className="ms-auto" variant={c.status === "online" ? "default" : "outline"}>
                  {c.status}
                </Badge>
              </div>
              <p className="text-muted-foreground text-xs">{c.location}</p>
              <p className="text-xs">{bi(c.coverage_ar, c.coverage_fr)}</p>
              <p className="text-muted-foreground text-xs">
                {t("last_inspection")}: {formatDate(c.last_inspection, locale)}
              </p>
              {isManager && c.technician_name && (
                <p className="text-muted-foreground text-xs">
                  {c.technician_name} · {c.technician_phone ?? "—"}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
