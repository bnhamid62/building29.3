import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, CheckCheck, Send, Siren, MessageCircle } from "lucide-react";
import { useState } from "react";
import { apartmentsApi, notificationsApi } from "@/api/endpoints";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { OfflineWriteNotice } from "@/components/app/OfflineBanner";
import { PushToggle } from "@/components/app/PushToggle";
import { useOnline } from "@/lib/offline";

/** Predefined bilingual urgent-alert templates for Building 29. */
const ALERT_TEMPLATES = [
  {
    id: "elevator",
    labelKey: "alert_elevator",
    kind: "system",
    title_ar: "عطل أو صيانة المصعد",
    title_fr: "Panne ou entretien de l'ascenseur",
    body_ar: "نعلم السادة السكان بتوقف المصعد مؤقتًا. سيتم إعلامكم فور استئناف الخدمة.",
    body_fr:
      "L'ascenseur est temporairement à l'arrêt. Vous serez informés dès la reprise du service.",
  },
  {
    id: "assembly",
    labelKey: "alert_assembly",
    kind: "meeting",
    title_ar: "الجمعية العامة للمقيمين",
    title_fr: "Assemblée générale des résidents",
    body_ar: "تدعوكم إدارة العمارة 29 لحضور الجمعية العامة. يُرجى تأكيد الحضور.",
    body_fr:
      "La gestion de l'Immeuble 29 vous convie à l'assemblée générale. Merci de confirmer votre présence.",
  },
  {
    id: "utility",
    labelKey: "alert_utility",
    kind: "system",
    title_ar: "انقطاع الماء أو الكهرباء",
    title_fr: "Coupure d'eau ou d'électricité",
    body_ar: "سيتم قطع الخدمة مؤقتًا عن العمارة. نعتذر عن الإزعاج.",
    body_fr:
      "Le service sera temporairement interrompu dans l'immeuble. Merci de votre compréhension.",
  },
  {
    id: "admin",
    labelKey: "alert_admin",
    kind: "announcement",
    title_ar: "إعلان إداري عام",
    title_fr: "Avis administratif général",
    body_ar: "إعلان إداري موجّه لجميع سكان العمارة 29.",
    body_fr: "Avis administratif à l'attention de tous les résidents de l'Immeuble 29.",
  },
] as const;

function whatsappLink(titleAr: string, titleFr: string, bodyAr: string, bodyFr: string): string {
  const text = [`*${titleAr}*`, bodyAr, "", `*${titleFr}*`, bodyFr].filter(Boolean).join("\n");
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export const Route = createFileRoute("/notifications")({
  head: () => ({
    meta: [
      { title: "الإشعارات | Immeuble 29 — Notifications" },
      {
        name: "description",
        content:
          "Centre de notifications bilingue : annonces, paiements et suivi des projets de l'immeuble 29.",
      },
      { property: "og:title", content: "Immeuble 29 — Notifications" },
      {
        property: "og:description",
        content: "Centre de notifications bilingue : annonces, paiements et suivi des projets.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <AppShell>
      <NotificationsPage />
    </AppShell>
  ),
});

function NotificationsPage() {
  const { t, locale } = useI18n();
  const { isManager } = useAuth();
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title_ar: "",
    title_fr: "",
    body_ar: "",
    body_fr: "",
    apartment_id: "all",
    kind: "announcement" as string,
  });
  const online = useOnline();

  const applyTemplate = (id: string) => {
    const tpl = ALERT_TEMPLATES.find((item) => item.id === id);
    if (!tpl) return;
    setForm((prev) => ({
      ...prev,
      kind: tpl.kind,
      title_ar: tpl.title_ar,
      title_fr: tpl.title_fr,
      body_ar: tpl.body_ar,
      body_fr: tpl.body_fr,
    }));
  };

  const list = useQuery({ queryKey: ["notifications"], queryFn: notificationsApi.list });
  const apartments = useQuery({
    queryKey: ["apartments"],
    queryFn: apartmentsApi.list,
    enabled: isManager,
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    await queryClient.invalidateQueries({ queryKey: ["notifications", "unread"] });
  };

  const markRead = useMutation({
    mutationFn: (id: number) => notificationsApi.markRead(id),
    onSuccess: refresh,
  });
  const markAll = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: refresh,
  });
  const broadcast = useMutation({
    mutationFn: () =>
      notificationsApi.broadcast({
        title_ar: form.title_ar,
        title_fr: form.title_fr,
        body_ar: form.body_ar || null,
        body_fr: form.body_fr || null,
        kind: form.kind,
        ...(form.apartment_id !== "all" ? { apartment_id: Number(form.apartment_id) } : {}),
      }),
    onSuccess: async (result) => {
      setError(null);
      setFeedback(`${t("sent_to")} ${result.sent} ${t("recipients")}`);
      setForm({
        title_ar: "",
        title_fr: "",
        body_ar: "",
        body_fr: "",
        apartment_id: "all",
        kind: "announcement",
      });
      await refresh();
    },
    onError: (err: unknown) => {
      setFeedback(null);
      setError(err instanceof Error ? err.message : t("error_generic"));
    },
  });

  const unread = (list.data ?? []).filter((n) => !n.read).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-bold">{t("notification_center")}</h1>
        {unread > 0 && (
          <Badge variant="secondary">
            {unread} {t("unread")}
          </Badge>
        )}
        <Button
          className="ms-auto"
          variant="outline"
          size="sm"
          disabled={unread === 0 || markAll.isPending}
          onClick={() => markAll.mutate()}
        >
          <CheckCheck className="size-4" />
          {t("mark_all_read")}
        </Button>
      </div>

      <PushToggle />

      {isManager && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("send_notification")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-2">
                <Siren className="text-destructive size-4" />
                {t("alert_template")}
              </Label>
              <div className="flex flex-wrap gap-2">
                {ALERT_TEMPLATES.map((tpl) => (
                  <Button
                    key={tpl.id}
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => applyTemplate(tpl.id)}
                  >
                    {t(tpl.labelKey)}
                  </Button>
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="title_ar">{t("title_ar")}</Label>
                <Input
                  id="title_ar"
                  dir="rtl"
                  value={form.title_ar}
                  onChange={(e) => setForm({ ...form, title_ar: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="title_fr">{t("title_fr")}</Label>
                <Input
                  id="title_fr"
                  dir="ltr"
                  value={form.title_fr}
                  onChange={(e) => setForm({ ...form, title_fr: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="body_ar">{t("body_ar")}</Label>
                <Textarea
                  id="body_ar"
                  dir="rtl"
                  rows={3}
                  value={form.body_ar}
                  onChange={(e) => setForm({ ...form, body_ar: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="body_fr">{t("body_fr")}</Label>
                <Textarea
                  id="body_fr"
                  dir="ltr"
                  rows={3}
                  value={form.body_fr}
                  onChange={(e) => setForm({ ...form, body_fr: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5 sm:max-w-xs">
              <Label>{t("apartment")}</Label>
              <Select
                value={form.apartment_id}
                onValueChange={(value) => setForm({ ...form, apartment_id: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("vis_all")}</SelectItem>
                  {(apartments.data ?? []).map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>
                      {t("apartment")} {a.number}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {error && <p className="text-destructive text-sm">{error}</p>}
            {feedback && <p className="text-sm text-emerald-600">{feedback}</p>}
            <OfflineWriteNotice />
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={
                  !online || broadcast.isPending || !form.title_ar.trim() || !form.title_fr.trim()
                }
                onClick={() => broadcast.mutate()}
              >
                <Send className="size-4" />
                {broadcast.isPending ? t("sending") : t("send")}
              </Button>
              <Button
                asChild
                variant="outline"
                disabled={!form.title_ar.trim() && !form.title_fr.trim()}
              >
                <a
                  href={whatsappLink(form.title_ar, form.title_fr, form.body_ar, form.body_fr)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageCircle className="size-4" />
                  {t("share_whatsapp")}
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {list.isPending && <p className="text-muted-foreground text-sm">{t("loading")}</p>}
      {list.isError && <ErrorState error={list.error} onRetry={() => void list.refetch()} />}
      {list.data?.length === 0 && (
        <p className="text-muted-foreground text-sm">{t("no_notifications")}</p>
      )}

      <div className="space-y-2">
        {(list.data ?? []).map((item) => (
          <Card key={item.id} className={item.read ? "opacity-70" : "border-primary/40"}>
            <CardContent className="flex items-start gap-3 py-4">
              <span className="text-primary mt-0.5">
                <BellRing className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{locale === "ar" ? item.title_ar : item.title_fr}</p>
                {(locale === "ar" ? item.body_ar : item.body_fr) && (
                  <p className="text-muted-foreground text-sm">
                    {locale === "ar" ? item.body_ar : item.body_fr}
                  </p>
                )}
                <p className="text-muted-foreground mt-1 text-xs">
                  {formatDate(item.created_at, locale)}
                </p>
              </div>
              {!item.read && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={markRead.isPending}
                  onClick={() => markRead.mutate(item.id)}
                >
                  {t("mark_read")}
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
