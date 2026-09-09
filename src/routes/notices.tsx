import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertTriangle, Megaphone, Plus, User2 } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n } from "@/i18n";
import { formatDate } from "@/lib/format";
import { MOCK_NOTICES, type Notice, type NoticeUrgency } from "@/mock/notices";
import { EmptyState } from "@/components/app/ApiState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/notices")({
  head: () => ({
    meta: [
      { title: "لوحة الإعلانات | Immeuble 29 — Annonces" },
      {
        name: "description",
        content: "Annonces de l'immeuble 29 : assemblées générales, coupures, maintenance et avis administratifs.",
      },
      { property: "og:title", content: "Immeuble 29 — Tableau d'affichage" },
      { property: "og:description", content: "Annonces et alertes de l'immeuble 29, en arabe et en français." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <AppShell>
      <NoticesPage />
    </AppShell>
  ),
});

const URGENCY_STYLE: Record<NoticeUrgency, string> = {
  normal: "border-s-4 border-s-sky-400/70",
  high: "border-s-4 border-s-amber-500",
};

function NoticesPage() {
  const { t, locale, bi } = useI18n();
  const { isManager } = useAuth();
  const [notices, setNotices] = useState<Notice[]>(MOCK_NOTICES);
  const [filter, setFilter] = useState<"all" | NoticeUrgency>("all");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ title: "", body: "", urgency: "normal" as NoticeUrgency });

  const visible = useMemo(
    () =>
      notices
        .filter((n) => filter === "all" || n.urgency === filter)
        .slice()
        .sort((a, b) => b.published_at.localeCompare(a.published_at)),
    [notices, filter],
  );

  const publish = () => {
    const title = draft.title.trim();
    const body = draft.body.trim();
    if (title.length < 3 || body.length < 5) return;
    setNotices((prev) => [
      {
        id: Date.now(),
        title_ar: title,
        title_fr: title,
        body_ar: body,
        body_fr: body,
        urgency: draft.urgency,
        published_at: new Date().toISOString().slice(0, 19).replace("T", " "),
        author_name: "—",
      },
      ...prev,
    ]);
    setDraft({ title: "", body: "", urgency: "normal" });
    setOpen(false);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">{t("notices")}</h1>
          <p className="text-muted-foreground text-sm">
            {t("results_count")}: {visible.length}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("all_statuses")}</SelectItem>
              <SelectItem value="normal">{t("pr_normal")}</SelectItem>
              <SelectItem value="high">{t("pr_high")}</SelectItem>
            </SelectContent>
          </Select>
          {isManager && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="size-4" />
                  {t("new_notice")}
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>{t("new_notice")}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="n-title">{t("title")}</Label>
                    <Input
                      id="n-title"
                      value={draft.title}
                      maxLength={150}
                      onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="n-body">{t("notice_content")}</Label>
                    <Textarea
                      id="n-body"
                      rows={4}
                      value={draft.body}
                      maxLength={2000}
                      onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("urgency")}</Label>
                    <Select
                      value={draft.urgency}
                      onValueChange={(v) => setDraft({ ...draft, urgency: v as NoticeUrgency })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="normal">{t("pr_normal")}</SelectItem>
                        <SelectItem value="high">{t("pr_high")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    className="w-full"
                    onClick={publish}
                    disabled={draft.title.trim().length < 3 || draft.body.trim().length < 5}
                  >
                    {t("publish")}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {visible.length === 0 && <EmptyState label={t("no_notices")} />}

      <div className="grid gap-3 md:grid-cols-2">
        {visible.map((notice) => (
          <Card key={notice.id} className={cn("overflow-hidden", URGENCY_STYLE[notice.urgency])}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-3">
                <CardTitle className="flex min-w-0 items-center gap-2 text-base">
                  {notice.urgency === "high" ? (
                    <AlertTriangle className="size-4 shrink-0 text-amber-500" />
                  ) : (
                    <Megaphone className="text-primary size-4 shrink-0" />
                  )}
                  <span className="truncate">{bi(notice.title_ar, notice.title_fr)}</span>
                </CardTitle>
                <Badge variant={notice.urgency === "high" ? "destructive" : "secondary"}>
                  {notice.urgency === "high" ? t("pr_high") : t("pr_normal")}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm leading-relaxed">{bi(notice.body_ar, notice.body_fr)}</p>
              <div className="text-muted-foreground flex flex-wrap items-center gap-3 text-xs">
                <span>{formatDate(notice.published_at, locale)}</span>
                <span className="flex items-center gap-1">
                  <User2 className="size-3" />
                  {notice.author_name}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
