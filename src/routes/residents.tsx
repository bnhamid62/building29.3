import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { apartmentsApi, residentsApi } from "@/api/endpoints";
import { AppShell } from "@/components/app/AppShell";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n } from "@/i18n";
import { formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/residents")({
  head: () => ({
    meta: [
      { title: "السكان | Immeuble 29 — Résidents" },
      { name: "description", content: "Gestion des comptes résidents : création, suspension et réinitialisation des accès." },
      { property: "og:title", content: "Immeuble 29 — Résidents" },
      { property: "og:description", content: "Gestion des comptes résidents : création, suspension et réinitialisation des accès." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <AppShell>
      <ResidentsPage />
    </AppShell>
  ),
});

function ResidentsPage() {
  const { t, locale } = useI18n();
  const { isManager } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [term, setTerm] = useState("");
  const [editingRow, setEditingRow] = useState<{ id: number; full_name: string; phone: string } | null>(null);

  const residents = useQuery({ queryKey: ["residents"], queryFn: residentsApi.list, enabled: isManager });
  const apartments = useQuery({ queryKey: ["apartments"], queryFn: apartmentsApi.list, enabled: isManager });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["residents"] });

  const create = useMutation({
    mutationFn: (input: Record<string, unknown>) => residentsApi.create(input),
    onSuccess: async () => {
      setOpen(false);
      setError(null);
      await invalidate();
    },
    onError: (err: unknown) => setError(err instanceof Error ? err.message : t("error")),
  });

  const update = useMutation({
    mutationFn: ({ id, input }: { id: number; input: Record<string, unknown> }) => residentsApi.update(id, input),
    onSuccess: invalidate,
  });

  const resetPassword = useMutation({
    mutationFn: ({ id, password }: { id: number; password: string }) => residentsApi.resetPassword(id, password),
    onSuccess: invalidate,
  });

  if (!isManager) return <p className="text-sm text-muted-foreground">{t("unauthorized")}</p>;

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    create.mutate({
      identifier: form.get("identifier"),
      full_name: form.get("full_name"),
      phone: form.get("phone"),
      apartment_id: Number(form.get("apartment_id")),
      person_rank: form.get("person_rank"),
      occupancy: form.get("occupancy"),
      password: form.get("password"),
    });
  };

  const rows = (residents.data ?? []).filter(
    (row) =>
      row.full_name.toLowerCase().includes(term.toLowerCase()) ||
      row.identifier.toLowerCase().includes(term.toLowerCase()) ||
      (row.apartment_number ?? "").toLowerCase().includes(term.toLowerCase()),
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold">{t("residents")}</h1>
        <div className="flex items-center gap-2">
          <Input className="w-48" placeholder={t("search")} value={term} onChange={(e) => setTerm(e.target.value)} />
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="size-4" />
                {t("add_resident")}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{t("add_resident")}</DialogTitle>
              </DialogHeader>
              <form className="space-y-3" onSubmit={submit}>
                <div className="space-y-1.5">
                  <Label htmlFor="full_name">{t("name")}</Label>
                  <Input id="full_name" name="full_name" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="identifier">{t("identifier")}</Label>
                  <Input id="identifier" name="identifier" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone">{t("phone")}</Label>
                  <Input id="phone" name="phone" required />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("apartment")}</Label>
                  <Select name="apartment_id" required>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(apartments.data ?? []).map((apartment) => (
                        <SelectItem key={apartment.id} value={String(apartment.id)}>
                          {apartment.number}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>{t("primary")}</Label>
                    <Select name="person_rank" defaultValue="primary">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="primary">{t("primary")}</SelectItem>
                        <SelectItem value="secondary">{t("secondary")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("owner")}</Label>
                    <Select name="occupancy" defaultValue="owner">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="owner">{t("owner")}</SelectItem>
                        <SelectItem value="resident_owner">{t("resident_owner")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">{t("password")}</Label>
                  <Input id="password" name="password" type="text" minLength={8} required />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" className="w-full" disabled={create.isPending}>
                  {t("save")}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {residents.isPending && <p className="text-sm text-muted-foreground">{t("loading")}</p>}

      <div className="space-y-2">
        {rows.map((row) => (
          <Card key={row.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="truncate font-medium">{row.full_name}</p>
                <p className="text-xs text-muted-foreground">
                  {row.identifier} · {row.phone} · {t("apartment")} {row.apartment_number ?? "—"} ·{" "}
                  {row.last_login_at ? formatDate(row.last_login_at, locale) : "—"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={row.status === "active" ? "secondary" : "outline"}>{t(row.status)}</Badge>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    update.mutate({ id: row.id, input: { status: row.status === "active" ? "suspended" : "active" } })
                  }
                >
                  {row.status === "active" ? t("suspend") : t("activate")}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={t("edit")}
                  onClick={() => setEditingRow({ id: row.id, full_name: row.full_name, phone: row.phone })}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={t("reset_password")}
                  onClick={() => {
                    const password = window.prompt(t("new_password"));
                    if (password && password.length >= 8) resetPassword.mutate({ id: row.id, password });
                  }}
                >
                  <KeyRound className="size-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!editingRow} onOpenChange={(o) => !o && setEditingRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("edit")}</DialogTitle>
          </DialogHeader>
          {editingRow && (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                update.mutate(
                  {
                    id: editingRow.id,
                    input: { full_name: form.get("full_name"), phone: form.get("phone") },
                  },
                  { onSuccess: () => setEditingRow(null) },
                );
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="edit_full_name">{t("name")}</Label>
                <Input id="edit_full_name" name="full_name" defaultValue={editingRow.full_name} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit_phone">{t("phone")}</Label>
                <Input id="edit_phone" name="phone" defaultValue={editingRow.phone} required />
              </div>
              <Button type="submit" className="w-full" disabled={update.isPending}>
                {t("save")}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
