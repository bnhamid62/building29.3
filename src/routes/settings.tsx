import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { authApi, buildingApi } from "@/api/endpoints";
import { AppShell } from "@/components/app/AppShell";
import { useAuth } from "@/auth/AuthProvider";
import { OfflineWriteNotice } from "@/components/app/OfflineBanner";
import { PushToggle } from "@/components/app/PushToggle";
import { assertOnline, useOnline } from "@/lib/offline";
import { useI18n } from "@/i18n";
import { ErrorState } from "@/components/app/ApiState";
import { API_BASE_URL, DEMO_MODE } from "@/lib/config";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "الإعدادات | Immeuble 29 — Paramètres" },
      { name: "description", content: "Langue, thème, informations de l'immeuble et état de la connexion au serveur." },
      { property: "og:title", content: "Immeuble 29 — Paramètres" },
      { property: "og:description", content: "Langue, thème, informations de l'immeuble et état de la connexion au serveur." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <AppShell>
      <SettingsPage />
    </AppShell>
  ),
});

function SettingsPage() {
  const { t, locale, setLocale, bi } = useI18n();
  const online = useOnline();
  const { user, logout, refreshUser, isManager } = useAuth();
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: ["settings"], queryFn: buildingApi.settings });
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);
    try {
      await authApi.changePassword(current, next);
      await refreshUser();
      setCurrent("");
      setNext("");
      setMessage(t("saved"));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t("error"));
    }
  };

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-bold">{t("settings")}</h1>

      {isManager && (
        <BuildingSettingsForm onSaved={() => queryClient.invalidateQueries({ queryKey: ["settings"] })} />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("building_info")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p className="font-medium">{bi(settings.data?.name_ar, settings.data?.name_fr)}</p>
          <p className="text-muted-foreground">{bi(settings.data?.address_ar, settings.data?.address_fr)}</p>
          <p className="text-muted-foreground">
            {settings.data?.apartments_count ?? 40} {t("apartments")} · {settings.data?.floors ?? 10} {t("floor")}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("language")}</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button variant={locale === "ar" ? "default" : "outline"} onClick={() => setLocale("ar")}>
            العربية
          </Button>
          <Button variant={locale === "fr" ? "default" : "outline"} onClick={() => setLocale("fr")}>
            Français
          </Button>
        </CardContent>
      </Card>

      <PushToggle />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("api_status")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Badge variant={DEMO_MODE ? "outline" : "secondary"}>{DEMO_MODE ? t("api_demo") : t("api_live")}</Badge>
          <p className="text-muted-foreground">
            {DEMO_MODE ? "VITE_DEMO_MODE=true" : API_BASE_URL}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("change_password")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="max-w-sm space-y-3" onSubmit={submit}>
            <div className="space-y-1.5">
              <Label htmlFor="sp-current">{t("current_password")}</Label>
              <Input id="sp-current" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sp-next">{t("new_password")}</Label>
              <Input id="sp-next" type="password" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} required />
            </div>
            {message && <p className="text-sm text-muted-foreground">{message}</p>}
            <Button type="submit">{t("save")}</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("account")}</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-3 text-sm">
          <span>{user?.full_name}</span>
          <Button variant="outline" onClick={() => void logout()}>
            {t("logout")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function BuildingSettingsForm({ onSaved }: { onSaved: () => void }) {
  const { t } = useI18n();
  const online = useOnline();
  const settings = useQuery({ queryKey: ["settings"], queryFn: buildingApi.settings });
  const [form, setForm] = useState({ name_ar: "", name_fr: "", address_ar: "", address_fr: "", currency: "DZD" });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Fill the fields from the server once; later refetches must not wipe what the manager is typing.
  const initialised = useRef(false);

  useEffect(() => {
    if (settings.data && !initialised.current) {
      initialised.current = true;
      setForm({
        name_ar: settings.data.name_ar,
        name_fr: settings.data.name_fr,
        address_ar: settings.data.address_ar ?? "",
        address_fr: settings.data.address_fr ?? "",
        currency: settings.data.currency,
      });
    }
  }, [settings.data]);

  const save = useMutation({
    mutationFn: () => {
      assertOnline();
      return buildingApi.updateSettings(form);
    },
    onSuccess: () => {
      setError(null);
      setMessage(t("saved"));
      onSaved();
    },
    onError: (err: unknown) => {
      setMessage(null);
      setError(err instanceof Error ? err.message : t("error_generic"));
    },
  });

  if (settings.isPending) return <p className="text-muted-foreground text-sm">{t("loading")}</p>;
  if (settings.isError) return <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("building_info")} — {t("edit")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="s-name-ar">{t("title_ar")}</Label>
            <Input id="s-name-ar" dir="rtl" value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s-name-fr">{t("title_fr")}</Label>
            <Input id="s-name-fr" dir="ltr" value={form.name_fr} onChange={(e) => setForm({ ...form, name_fr: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s-addr-ar">{t("address")} (ع)</Label>
            <Input id="s-addr-ar" dir="rtl" value={form.address_ar} onChange={(e) => setForm({ ...form, address_ar: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s-addr-fr">{t("address")} (FR)</Label>
            <Input id="s-addr-fr" dir="ltr" value={form.address_fr} onChange={(e) => setForm({ ...form, address_fr: e.target.value })} />
          </div>
        </div>
        {error && <p className="text-destructive text-sm">{error}</p>}
        {message && <p className="text-sm text-emerald-600">{message}</p>}
        <OfflineWriteNotice />
        <Button disabled={!online || save.isPending} onClick={() => save.mutate()}>
          {t("save")}
        </Button>
      </CardContent>
    </Card>
  );
}
