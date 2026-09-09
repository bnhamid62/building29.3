import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CalendarDays, Plus } from "lucide-react";
import { meetingsApi } from "@/api/endpoints";
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
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/meetings")({
  head: () => ({
    meta: [
      { title: "الاجتماعات | Immeuble 29 — Réunions" },
      { name: "description", content: "Réunions de l'immeuble 29 : ordre du jour, présences, procès-verbaux et décisions." },
      { property: "og:title", content: "Immeuble 29 — Réunions" },
      { property: "og:description", content: "Ordre du jour, présences et procès-verbaux." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <AppShell>
      <MeetingsPage />
    </AppShell>
  ),
});

const RESPONSES: Array<{ value: string; key: "attending" | "not_attending" | "maybe" }> = [
  { value: "yes", key: "attending" },
  { value: "no", key: "not_attending" },
  { value: "maybe", key: "maybe" },
];

function MeetingsPage() {
  const { t, locale, bi } = useI18n();
  const { isManager } = useAuth();
  const qc = useQueryClient();
  const [openId, setOpenId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ title_ar: "", title_fr: "", starts_at: "", location: "", agenda_ar: "", agenda_fr: "" });

  const list = useQuery({ queryKey: ["meetings"], queryFn: meetingsApi.list });
  const detail = useQuery({ queryKey: ["meeting", openId], queryFn: () => meetingsApi.detail(openId!), enabled: openId !== null });

  const create = useMutation({
    mutationFn: () => meetingsApi.create({ ...form, starts_at: form.starts_at.replace("T", " ") }),
    onSuccess: async () => {
      setError(null);
      setForm({ title_ar: "", title_fr: "", starts_at: "", location: "", agenda_ar: "", agenda_fr: "" });
      await qc.invalidateQueries({ queryKey: ["meetings"] });
    },
    onError: (err: unknown) => setError(err instanceof Error ? err.message : t("error_generic")),
  });

  const respond = useMutation({
    mutationFn: (response: string) => meetingsApi.respond(openId!, { response }),
    onSuccess: async () => qc.invalidateQueries({ queryKey: ["meeting", openId] }),
  });

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-bold">{t("meetings")}</h1>

      {isManager && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("new_meeting")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="m-ar">{t("title")} (ع)</Label>
                <Input id="m-ar" value={form.title_ar} onChange={(e) => setForm({ ...form, title_ar: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="m-fr">{t("title")} (FR)</Label>
                <Input id="m-fr" value={form.title_fr} onChange={(e) => setForm({ ...form, title_fr: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="m-when">{t("starts_at")}</Label>
                <Input id="m-when" type="datetime-local" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="m-loc">{t("location")}</Label>
                <Input id="m-loc" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Textarea rows={2} placeholder={`${t("agenda")} (ع)`} value={form.agenda_ar} onChange={(e) => setForm({ ...form, agenda_ar: e.target.value })} />
              <Textarea rows={2} placeholder={`${t("agenda")} (FR)`} value={form.agenda_fr} onChange={(e) => setForm({ ...form, agenda_fr: e.target.value })} />
            </div>
            {error && <p className="text-destructive text-sm">{error}</p>}
            <Button disabled={create.isPending || !form.title_ar.trim() || !form.title_fr.trim() || !form.starts_at} onClick={() => create.mutate()}>
              <Plus className="size-4" />
              {t("save")}
            </Button>
          </CardContent>
        </Card>
      )}

      {list.isPending && <p className="text-muted-foreground text-sm">{t("loading")}</p>}
      {list.isError && <ErrorState error={list.error} onRetry={() => void list.refetch()} />}
      {list.data?.length === 0 && <p className="text-muted-foreground text-sm">{t("no_meetings")}</p>}

      <div className="space-y-2">
        {(list.data ?? []).map((m) => (
          <Card key={m.id}>
            <CardContent className="space-y-3 py-3">
              <button className="flex w-full items-center gap-3 text-start" onClick={() => setOpenId(openId === m.id ? null : m.id)}>
                <CalendarDays className="text-primary size-4 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{bi(m.title_ar, m.title_fr)}</span>
                  <span className="text-muted-foreground block text-xs">
                    {formatDate(m.starts_at, locale)} · {m.location ?? "—"}
                  </span>
                </span>
                <Badge variant={m.status === "scheduled" ? "default" : "outline"}>{m.status}</Badge>
              </button>

              {openId === m.id && (
                <div className="space-y-3 border-t pt-3 text-sm">
                  {detail.isPending && <p className="text-muted-foreground">{t("loading")}</p>}
                  {detail.isError && <ErrorState error={detail.error} />}
                  {detail.data && (
                    <>
                      {bi(detail.data.meeting.agenda_ar, detail.data.meeting.agenda_fr) && (
                        <p>
                          <span className="font-medium">{t("agenda")}: </span>
                          {bi(detail.data.meeting.agenda_ar, detail.data.meeting.agenda_fr)}
                        </p>
                      )}
                      {bi(detail.data.meeting.minutes_ar, detail.data.meeting.minutes_fr) && (
                        <p className="bg-muted rounded-md p-2">
                          <span className="font-medium">{t("minutes")}: </span>
                          {bi(detail.data.meeting.minutes_ar, detail.data.meeting.minutes_fr)}
                        </p>
                      )}
                      {detail.data.meeting.decisions && (
                        <p>
                          <span className="font-medium">{t("decisions")}: </span>
                          {detail.data.meeting.decisions}
                        </p>
                      )}

                      {!isManager && detail.data.meeting.status === "scheduled" && (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-muted-foreground text-xs">{t("respond")}:</span>
                          {RESPONSES.map((r) => (
                            <Button
                              key={r.value}
                              size="sm"
                              variant={detail.data!.attendance[0]?.response === r.value ? "default" : "outline"}
                              disabled={respond.isPending}
                              onClick={() => respond.mutate(r.value)}
                            >
                              {t(r.key)}
                            </Button>
                          ))}
                        </div>
                      )}

                      {isManager && (
                        <div>
                          <p className="font-medium">
                            {t("attendance")} ({detail.data.attendance.length})
                          </p>
                          <p className="text-muted-foreground text-xs">
                            {detail.data.attendance.map((a) => `${a.apartment_number ?? a.apartment_id}: ${a.response}`).join(" · ") || "—"}
                          </p>
                        </div>
                      )}

                      {detail.data.documents.length > 0 && (
                        <div className="space-y-1">
                          <p className="font-medium">{t("attachments")}</p>
                          {detail.data.documents.map((doc) => (
                            <Button
                              key={doc.file_id}
                              size="sm"
                              variant="outline"
                              onClick={() => void meetingsApi.downloadDocument(m.id, doc.file_id, doc.original_name)}
                            >
                              {doc.title ?? doc.original_name}
                            </Button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
