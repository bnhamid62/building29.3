import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { CheckCircle2, Vote as VoteIcon } from "lucide-react";
import { votesApi } from "@/api/endpoints";
import { AppShell } from "@/components/app/AppShell";
import { useAuth } from "@/auth/AuthProvider";
import { OfflineWriteNotice } from "@/components/app/OfflineBanner";
import { assertOnline, useOnline } from "@/lib/offline";
import { useI18n } from "@/i18n";
import { ErrorState } from "@/components/app/ApiState";
import { formatDate, percent } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, X } from "lucide-react";
import { firstIssue, voteSchema } from "@/lib/validation";
export const Route = createFileRoute("/votes")({
  head: () => ({
    meta: [
      { title: "التصويت | Immeuble 29 — Votes" },
      { name: "description", content: "Votes des copropriétaires de l'immeuble 29 : un bulletin par appartement, résultats transparents." },
      { property: "og:title", content: "Immeuble 29 — Votes" },
      { property: "og:description", content: "Un bulletin par appartement, résultats transparents." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <AppShell>
      <VotesPage />
    </AppShell>
  ),
});

function VotesPage() {
  const { t, locale, bi } = useI18n();
  const online = useOnline();
  const { isManager } = useAuth();
  const qc = useQueryClient();
  const [openId, setOpenId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const list = useQuery({ queryKey: ["votes"], queryFn: votesApi.list });
  const detail = useQuery({ queryKey: ["vote", openId], queryFn: () => votesApi.detail(openId!), enabled: openId !== null });

  const ballot = useMutation({
    mutationFn: (optionId: number) => {
      assertOnline();
      return votesApi.ballot(openId!, optionId);
    },
    onSuccess: async () => {
      setError(null);
      await qc.invalidateQueries({ queryKey: ["votes"] });
      await qc.invalidateQueries({ queryKey: ["vote", openId] });
    },
    onError: (err: unknown) => setError(err instanceof Error ? err.message : t("error_generic")),
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [optionIds, setOptionIds] = useState<number[]>([1, 2]);
  const nextOptionId = useRef(3);

  const createVote = useMutation({
    mutationFn: (input: Record<string, unknown>) => {
      assertOnline();
      return votesApi.create(input);
    },
    onSuccess: async () => {
      setCreateOpen(false);
      setCreateError(null);
      setOptionIds([1, 2]);
      nextOptionId.current = 3;
      await qc.invalidateQueries({ queryKey: ["votes"] });
    },
    onError: (err: unknown) => setCreateError(err instanceof Error ? err.message : t("error_generic")),
  });

  const submitCreate = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const options = form
      .getAll("option_label_ar")
      .map((v) => String(v).trim())
      .filter(Boolean)
      .map((label_ar) => ({ label_ar }));
    const parsed = voteSchema.safeParse({
      title_ar: String(form.get("title_ar") ?? ""),
      title_fr: String(form.get("title_fr") ?? ""),
      description_ar: String(form.get("description_ar") ?? "") || undefined,
      description_fr: String(form.get("description_fr") ?? "") || undefined,
      starts_at: String(form.get("starts_at") ?? ""),
      ends_at: String(form.get("ends_at") ?? ""),
      status: form.get("open_now") ? "open" : "draft",
      options,
    });
    if (!parsed.success) {
      setCreateError(`${t("err_validation")} (${firstIssue(parsed)})`);
      return;
    }
    createVote.mutate({ ...parsed.data, anonymous: false, live_results: true });
  };
  const close = useMutation({
    mutationFn: () => {
      assertOnline();
      return votesApi.update(openId!, { status: "closed" });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["votes"] });
      await qc.invalidateQueries({ queryKey: ["vote", openId] });
    },
  });

  return (
    <div className="space-y-5">
           <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold">{t("votes")}</h1>
        {isManager && (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="size-4" />
                {t("new_vote")}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{t("new_vote")}</DialogTitle>
              </DialogHeader>
              <form className="space-y-3" onSubmit={submitCreate}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="title_ar">{t("title_ar")}</Label>
                    <Input id="title_ar" name="title_ar" dir="rtl" required />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="title_fr">{t("title_fr")}</Label>
                    <Input id="title_fr" name="title_fr" dir="ltr" required />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="description_ar">{t("description")} (ع)</Label>
                  <Textarea id="description_ar" name="description_ar" dir="rtl" rows={2} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="starts_at">{t("starts_at")}</Label>
                    <Input id="starts_at" name="starts_at" type="datetime-local" required />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ends_at">{t("closes_at")}</Label>
                    <Input id="ends_at" name="ends_at" type="datetime-local" required />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t("options")}</Label>
                  {optionIds.map((optId, index) => (
                    <div key={optId} className="flex items-center gap-2">
                      <Input
                        name="option_label_ar"
                        dir="rtl"
                        placeholder={`${t("option")} ${index + 1}`}
                        required
                      />
                      {optionIds.length > 2 && (
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => setOptionIds((ids) => ids.filter((x) => x !== optId))}
                        >
                          <X className="size-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                  {optionIds.length < 10 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setOptionIds((ids) => [...ids, nextOptionId.current]);
                        nextOptionId.current += 1;
                      }}
                    >
                      <Plus className="size-4" />
                      {t("add_option")}
                    </Button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox id="open_now" name="open_now" />
                  <Label htmlFor="open_now" className="font-normal">
                    {t("open_now")}
                  </Label>
                </div>
                {createError && <p className="text-destructive text-sm">{createError}</p>}
                <OfflineWriteNotice />
                <Button type="submit" className="w-full" disabled={!online || createVote.isPending}>
                  {t("save")}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {list.isPending && <p className="text-muted-foreground text-sm">{t("loading")}</p>}
      {list.isError && <ErrorState error={list.error} onRetry={() => void list.refetch()} />}
      {list.data?.length === 0 && <p className="text-muted-foreground text-sm">{t("no_votes")}</p>}

      <div className="space-y-2">
        {(list.data ?? []).map((v) => (
          <Card key={v.id}>
            <CardContent className="space-y-3 py-3">
              <button className="flex w-full items-center gap-3 text-start" onClick={() => setOpenId(openId === v.id ? null : v.id)}>
                <VoteIcon className="text-primary size-4 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{bi(v.title_ar, v.title_fr)}</span>
                  <span className="text-muted-foreground block text-xs">
                    {t("closes_at")} {formatDate(v.ends_at, locale)} · {v.ballots_count} {t("ballots")}
                  </span>
                </span>
                {v.has_voted && <CheckCircle2 className="size-4 text-emerald-600" />}
                <Badge variant={v.is_open ? "default" : "outline"}>{v.status}</Badge>
              </button>

              {openId === v.id && (
                <div className="space-y-3 border-t pt-3 text-sm">
                  {detail.isPending && <p className="text-muted-foreground">{t("loading")}</p>}
                  {detail.isError && <ErrorState error={detail.error} />}
                  {detail.data && (
                    <>
                      {bi(detail.data.vote.description_ar, detail.data.vote.description_fr) && (
                        <p>{bi(detail.data.vote.description_ar, detail.data.vote.description_fr)}</p>
                      )}
                      {error && <p className="text-destructive">{error}</p>}
                      {detail.data.vote.has_voted && <p className="text-emerald-600">{t("voted")}</p>}
                      <OfflineWriteNotice />

                      <div className="space-y-2">
                        {detail.data.options.map((o) => {
                          const total = detail.data!.options.reduce((sum, x) => sum + x.tally, 0);
                          const chosen = detail.data!.vote.my_option_id === o.id;
                          return (
                            <div key={o.id} className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className={chosen ? "font-semibold" : ""}>{bi(o.label_ar, o.label_fr)}</span>
                                {detail.data!.vote.results_visible && (
                                  <span className="text-muted-foreground ms-auto text-xs">
                                    {o.tally} ({percent(o.tally, total)}%)
                                  </span>
                                )}
                                {!isManager && detail.data!.vote.can_vote && !detail.data!.vote.has_voted && detail.data!.vote.is_open && (
                                  <Button
                                    size="sm"
                                    className="ms-auto"
                                    disabled={!online || ballot.isPending}
                                    onClick={() => ballot.mutate(o.id)}
                                  >
                                    {t("vote_now")}
                                  </Button>
                                )}

                              </div>
                              {detail.data!.vote.results_visible && <Progress value={percent(o.tally, total)} />}
                            </div>
                          );
                        })}
                      </div>

                      {detail.data.vote.final_decision && (
                        <p className="bg-muted rounded-md p-2">{detail.data.vote.final_decision}</p>
                      )}

                      {isManager && detail.data.vote.is_open && (
                        <Button size="sm" variant="outline" disabled={!online || close.isPending} onClick={() => close.mutate()}>
                          {t("close_vote")}
                        </Button>
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
