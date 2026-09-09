import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { MessageSquareWarning, Plus } from "lucide-react";
import { complaintsApi } from "@/api/endpoints";
import { AppShell } from "@/components/app/AppShell";
import { useAuth } from "@/auth/AuthProvider";
import { OfflineWriteNotice } from "@/components/app/OfflineBanner";
import { assertOnline, useOnline } from "@/lib/offline";
import { useI18n } from "@/i18n";
import { formatDate } from "@/lib/format";
import { EmptyState, ErrorState, useApiMessage } from "@/components/app/ApiState";
import { categoryKey, priorityKey, statusKey } from "@/lib/labels";
import { COMPLAINT_CATEGORIES, COMPLAINT_STATUSES, URGENCIES, complaintSchema, firstIssue } from "@/lib/validation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/complaints")({
  head: () => ({
    meta: [
      { title: "الشكاوى | Immeuble 29 — Réclamations" },
      { name: "description", content: "Déclarez et suivez les réclamations de l'immeuble 29 : fuite, ascenseur, propreté, sécurité." },
      { property: "og:title", content: "Immeuble 29 — Réclamations" },
      { property: "og:description", content: "Déclaration et suivi des réclamations des résidents." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <AppShell>
      <ComplaintsPage />
    </AppShell>
  ),
});

const STATUS_TONE: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  submitted: "destructive",
  under_review: "outline",
  approved: "outline",
  in_progress: "default",
  resolved: "secondary",
  rejected: "outline",
};

function ComplaintsPage() {
  const { t, locale } = useI18n();
  const online = useOnline();
  const { isManager } = useAuth();
  const qc = useQueryClient();
  const [openId, setOpenId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const [form, setForm] = useState({ title: "", category: "other", urgency: "normal", location: "", description: "" });
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const apiMessage = useApiMessage();
  const attachRef = useRef<HTMLInputElement>(null);
  const [attachError, setAttachError] = useState<string | null>(null);

  const list = useQuery({ queryKey: ["complaints"], queryFn: complaintsApi.list });
  const detail = useQuery({
    queryKey: ["complaint", openId],
    queryFn: () => complaintsApi.detail(openId!),
    enabled: openId !== null,
  });

  const term = search.trim().toLowerCase();
  const filtered = (list.data ?? []).filter(
    (c) =>
      (statusFilter === "all" || c.status === statusFilter) &&
      (categoryFilter === "all" || c.category === categoryFilter) &&
      (term === "" ||
        c.title.toLowerCase().includes(term) ||
        (c.apartment_number ?? "").toLowerCase().includes(term)),
  );



  const create = useMutation({
    mutationFn: () => {
      assertOnline();
      const parsed = complaintSchema.safeParse({ ...form, location: form.location.trim() || undefined });
      if (!parsed.success) return Promise.reject(new Error(`${t("err_validation")} (${firstIssue(parsed)})`));
      return complaintsApi.create(parsed.data);
    },
    onSuccess: async () => {
      setError(null);
      setFeedback(t("saved"));
      setForm({ title: "", category: "other", urgency: "normal", location: "", description: "" });
      await qc.invalidateQueries({ queryKey: ["complaints"] });
    },
    onError: (err: unknown) => {
      setFeedback(null);
      setError(apiMessage(err));
    },
  });

  const update = useMutation({
    mutationFn: (input: Record<string, unknown>) => {
      assertOnline();
      return complaintsApi.update(openId!, input);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["complaints"] });
      await qc.invalidateQueries({ queryKey: ["complaint", openId] });
    },
  });

  const addAttachment = useMutation({
    mutationFn: (fd: FormData) => {
      assertOnline();
      return complaintsApi.addAttachment(openId!, fd);
    },
    onSuccess: async () => {
      setAttachError(null);
      if (attachRef.current) attachRef.current.value = "";
      await qc.invalidateQueries({ queryKey: ["complaint", openId] });
    },
    onError: (err: unknown) => setAttachError(apiMessage(err)),
  });

  const addNote = useMutation({
    mutationFn: () => {
      assertOnline();
      return complaintsApi.addNote(openId!, note.trim());
    },
    onSuccess: async () => {
      setNote("");
      await qc.invalidateQueries({ queryKey: ["complaint", openId] });
    },
  });

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-bold">{t("complaints")}</h1>

      {!isManager && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("new_complaint")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="c-title">{t("title")}</Label>
                <Input id="c-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={150} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("category")}</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COMPLAINT_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {t(categoryKey(c))}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("urgency")}</Label>
                <Select value={form.urgency} onValueChange={(v) => setForm({ ...form, urgency: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {URGENCIES.map((u) => (
                      <SelectItem key={u} value={u}>
                        {t(priorityKey(u))}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-loc">{t("location")}</Label>
                <Input id="c-loc" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} maxLength={120} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-desc">{t("description")}</Label>
              <Textarea id="c-desc" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={2000} />
            </div>
            {error && <p className="text-destructive text-sm">{error}</p>}
            {feedback && <p className="text-sm text-emerald-600">{feedback}</p>}
            <OfflineWriteNotice />
            <Button disabled={!online || create.isPending || form.title.trim().length < 3 || form.description.trim().length < 5} onClick={() => create.mutate()}>
              <Plus className="size-4" />
              {t("send")}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="grid gap-2 py-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input placeholder={t("search")} value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("all_statuses")}</SelectItem>
              {COMPLAINT_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {t(statusKey(s))}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("all_categories")}</SelectItem>
              {COMPLAINT_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {t(categoryKey(c))}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setSearch("");
                setStatusFilter("all");
                setCategoryFilter("all");
              }}
            >
              {t("reset")}
            </Button>
            <span className="text-muted-foreground text-xs">
              {t("results_count")}: {filtered.length}
            </span>
          </div>
        </CardContent>
      </Card>

      {list.isPending && <p className="text-muted-foreground text-sm">{t("loading")}</p>}
      {list.isError && <ErrorState error={list.error} onRetry={() => void list.refetch()} />}
      {!list.isPending && filtered.length === 0 && <EmptyState label={t("no_complaints")} />}

      <div className="space-y-2">
        {filtered.map((c) => (

          <Card key={c.id}>
            <CardContent className="space-y-2 py-3">
              <button className="flex w-full items-center gap-3 text-start" onClick={() => setOpenId(openId === c.id ? null : c.id)}>
                <MessageSquareWarning className="text-primary size-4 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{c.title}</span>
                  <span className="text-muted-foreground block text-xs">
                    {t("apartment")} {c.apartment_number ?? "—"} · {formatDate(c.created_at, locale)} · {t(categoryKey(c.category))}
                  </span>
                </span>
                <Badge variant={STATUS_TONE[c.status] ?? "outline"}>{t(statusKey(c.status))}</Badge>
              </button>

              {openId === c.id && (
                <div className="space-y-3 border-t pt-3 text-sm">
                  {detail.isPending && <p className="text-muted-foreground">{t("loading")}</p>}
                  {detail.isError && <ErrorState error={detail.error} />}
                  {detail.data && (
                    <>
                      <p>{detail.data.complaint.description}</p>
                      <p className="text-muted-foreground text-xs">
                        {t("reported_by")}: {detail.data.complaint.reporter_name ?? "—"}
                      </p>
                      {detail.data.complaint.manager_response && (
                        <p className="bg-muted rounded-md p-2">
                          <span className="font-medium">{t("manager_response")}: </span>
                          {detail.data.complaint.manager_response}
                        </p>
                      )}

                      <div className="space-y-1">
                        <p className="font-medium">{t("timeline")}</p>
                        {detail.data.updates.length === 0 && <p className="text-muted-foreground text-xs">—</p>}
                        {detail.data.updates.map((u) => (
                          <p key={u.id} className="text-xs">
                            <span className="text-muted-foreground">{formatDate(u.created_at, locale)} · {u.author_name ?? "—"}: </span>
                            {u.note}
                          </p>
                        ))}
                        <div className="flex gap-2 pt-1">
                          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("add_note")} maxLength={1000} />
                          <Button size="sm" variant="outline" disabled={!online || addNote.isPending || note.trim().length < 2} onClick={() => addNote.mutate()}>
                            {t("send")}
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-1 border-t pt-3">
                        <p className="font-medium">{t("attachments")}</p>
                        {detail.data.attachments.length === 0 && <p className="text-muted-foreground text-xs">—</p>}
                        {detail.data.attachments.map((a) => (
                          <Button
                            key={a.file_id}
                            size="sm"
                            variant="outline"
                            className="me-2"
                            onClick={() => {
                              setAttachError(null);
                              void complaintsApi
                                .downloadAttachment(c.id, a.file_id, a.original_name)
                                .catch((err: unknown) => setAttachError(apiMessage(err)));
                            }}
                          >
                            {a.original_name}
                          </Button>
                        ))}
                        <div className="flex flex-wrap items-center gap-2 pt-2">
                          <Input type="file" ref={attachRef} accept="image/jpeg,image/png,image/webp,application/pdf" className="max-w-xs" />
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!online || addAttachment.isPending}
                            onClick={() => {
                              const file = attachRef.current?.files?.[0];
                              if (!file) return;
                              const fd = new FormData();
                              fd.append("file", file);
                              addAttachment.mutate(fd);
                            }}
                          >
                            {t("add_attachment")}
                          </Button>
                        </div>
                        {attachError && <p className="text-destructive text-xs">{attachError}</p>}
                      </div>

                      {isManager && (
                        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                          <Select value={detail.data.complaint.status} onValueChange={(v) => update.mutate({ status: v })}>
                            <SelectTrigger className="w-40">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {COMPLAINT_STATUSES.map((s) => (
                                <SelectItem key={s} value={s}>
                                  {t(statusKey(s))}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            className="max-w-sm"
                            placeholder={t("manager_response")}
                            defaultValue={detail.data.complaint.manager_response ?? ""}
                            onBlur={(e) => {
                              const value = e.target.value.trim();
                              if (value && value !== (detail.data?.complaint.manager_response ?? "")) update.mutate({ manager_response: value });
                            }}
                          />
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
