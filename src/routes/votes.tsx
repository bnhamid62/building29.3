import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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
      <h1 className="font-display text-2xl font-bold">{t("votes")}</h1>

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
