import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";
import { apartmentsApi, subscriptionsApi } from "@/api/endpoints";
import { AppShell } from "@/components/app/AppShell";
import { useAuth } from "@/auth/AuthProvider";
import { OfflineWriteNotice } from "@/components/app/OfflineBanner";
import { assertOnline, useOnline } from "@/lib/offline";
import { useI18n } from "@/i18n";
import { ErrorState } from "@/components/app/ApiState";
import { firstIssue, subscriptionPaymentSchema, subscriptionSettingsSchema } from "@/lib/validation";
import { formatDate, formatMoney } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/subscriptions")({
  head: () => ({
    meta: [
      { title: "الاشتراكات الشهرية | Immeuble 29 — Cotisations mensuelles" },
      { name: "description", content: "Caisse séparée pour l'entretien courant et les futurs équipements." },
    ],
  }),
  component: () => (
    <AppShell>
      <SubscriptionsPage />
    </AppShell>
  ),
});

function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function formatMonth(period: string, locale: "ar" | "fr"): string {
  const date = new Date(`${period}T00:00:00`);
  if (Number.isNaN(date.getTime())) return period;
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-DZ" : "fr-DZ", { year: "numeric", month: "long" }).format(date);
}

function SubscriptionsPage() {
  const { t, locale } = useI18n();
  const online = useOnline();
  const { isManager } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [amountDraft, setAmountDraft] = useState("");

  const settings = useQuery({ queryKey: ["subscriptions", "settings"], queryFn: subscriptionsApi.settings });
  useEffect(() => {
    if (settings.data && amountDraft === "") setAmountDraft(String(settings.data.monthly_amount));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.data]);
  const board = useQuery({ queryKey: ["subscriptions", "board"], queryFn: subscriptionsApi.board, enabled: isManager });
  const mine = useQuery({ queryKey: ["subscriptions", "mine"], queryFn: subscriptionsApi.mine, enabled: !isManager });
  const history = useQuery({ queryKey: ["subscriptions", "history"], queryFn: () => subscriptionsApi.list(), enabled: isManager });
  const apartments = useQuery({ queryKey: ["apartments"], queryFn: apartmentsApi.list, enabled: isManager });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
  };

  const updateSettings = useMutation({
    mutationFn: (input: Record<string, unknown>) => {
      assertOnline();
      return subscriptionsApi.updateSettings(input);
    },
    onSuccess: invalidate,
  });

  const create = useMutation({
    mutationFn: (input: Record<string, unknown>) => {
      assertOnline();
      return subscriptionsApi.create(input);
    },
    onSuccess: async () => {
      setOpen(false);
      setError(null);
      await invalidate();
    },
    onError: (err: unknown) => setError(err instanceof Error ? err.message : t("error_generic")),
  });

  const reverse = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => {
      assertOnline();
      return subscriptionsApi.reverse(id, reason);
    },
    onSuccess: invalidate,
  });

  const submitSettings = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = subscriptionSettingsSchema.safeParse({ monthly_amount: Number(amountDraft) });
    if (!parsed.success) {
      setError(`${t("err_validation")} (${firstIssue(parsed)})`);
      return;
    }
    updateSettings.mutate(parsed.data);
  };

  const submitPayment = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const periodMonth = String(form.get("period_month") ?? "");
    const parsed = subscriptionPaymentSchema.safeParse({
      apartment_id: Number(form.get("apartment_id")),
      period: periodMonth ? `${periodMonth}-01` : "",
      amount: Number(form.get("amount")),
      method: "cash",
      notes: String(form.get("notes") ?? "") || undefined,
    });
    if (!parsed.success) {
      setError(`${t("err_validation")} (${firstIssue(parsed)})`);
      return;
    }
    create.mutate({ ...parsed.data, idempotency_key: crypto.randomUUID() });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">{isManager ? t("subscriptions") : t("my_subscriptions")}</h1>
          <p className="text-muted-foreground text-sm">{t("subscriptions_description")}</p>
        </div>
        {isManager && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="size-4" />
                {t("record_payment")}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{t("record_payment")}</DialogTitle>
              </DialogHeader>
              <form className="space-y-3" onSubmit={submitPayment}>
                <div className="space-y-1.5">
                  <Label>{t("apartment")}</Label>
                  <Select name="apartment_id" required>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(apartments.data ?? []).map((apartment) => (
                        <SelectItem key={apartment.id} value={String(apartment.id)}>
                          {apartment.number} — {apartment.primary_name ?? ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="period_month">{t("month")}</Label>
                  <Input id="period_month" name="period_month" type="month" defaultValue={currentPeriod().slice(0, 7)} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="amount">{t("amount")}</Label>
                  <Input
                    id="amount"
                    name="amount"
                    type="number"
                    min="1"
                    step="0.01"
                    defaultValue={settings.data?.monthly_amount || undefined}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("method")}</Label>
                  <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                    {t("cash")} — <span className="text-muted-foreground">{t("cash_only_note")}</span>
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="notes">{t("notes")}</Label>
                  <Input id="notes" name="notes" />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <OfflineWriteNotice />
                <Button type="submit" className="w-full" disabled={!online || create.isPending}>
                  {t("save")}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {isManager && (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-3 p-4">
            <form className="flex flex-wrap items-end gap-3" onSubmit={submitSettings}>
              <div className="space-y-1.5">
                <Label htmlFor="monthly_amount">{t("monthly_amount")}</Label>
                <Input
                  id="monthly_amount"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder={String(settings.data?.monthly_amount ?? 0)}
                  value={amountDraft}
                  onChange={(e) => setAmountDraft(e.target.value)}
                  className="w-40"
                />
              </div>
              <Button type="submit" variant="outline" disabled={!online || updateSettings.isPending || !amountDraft}>
                {t("save")}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {isManager && (
        <Card>
          <CardContent className="p-0">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
              <h2 className="font-display text-base font-semibold">{t("subscriptions")}</h2>
              <p className="text-muted-foreground text-xs">
                {t("results_count")}: {(board.data ?? []).length}
              </p>
            </div>
            {board.isPending && <p className="text-muted-foreground p-4 text-sm">{t("loading")}</p>}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("apartment")}</TableHead>
                    <TableHead className="hidden sm:table-cell">{t("floor")}</TableHead>
                    <TableHead>{t("required")}</TableHead>
                    <TableHead>{t("paid")}</TableHead>
                    <TableHead className="hidden sm:table-cell">{t("balance")}</TableHead>
                    <TableHead className="text-end">{t("status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(board.data ?? []).map((row) => {
                    const settled = row.balance <= 0;
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">{row.number}</TableCell>
                        <TableCell className="hidden sm:table-cell">{row.floor}</TableCell>
                        <TableCell>{formatMoney(row.required_total, locale)}</TableCell>
                        <TableCell>{formatMoney(row.paid_total, locale)}</TableCell>
                        <TableCell className="hidden sm:table-cell">{formatMoney(row.balance, locale)}</TableCell>
                        <TableCell className="text-end">
                          <span
                            className={
                              settled
                                ? "inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400"
                                : "inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400"
                            }
                          >
                            {settled ? t("paid") : t("unpaid")}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {!isManager && (
        <>
          {mine.isPending && <p className="text-sm text-muted-foreground">{t("loading")}</p>}
          {mine.isError && <ErrorState error={mine.error} onRetry={() => void mine.refetch()} />}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label={t("monthly_amount")} value={formatMoney(mine.data?.settings.monthly_amount ?? 0, locale)} />
            <StatCard label={t("required")} value={formatMoney(mine.data?.required_total ?? 0, locale)} />
            <StatCard label={t("paid")} value={formatMoney(mine.data?.paid_total ?? 0, locale)} />
            <StatCard label={t("balance")} value={formatMoney(mine.data?.balance ?? 0, locale)} />
          </div>
          <div className="space-y-2">
            {(mine.data?.months ?? [])
              .slice()
              .reverse()
              .map((m) => (
                <Card key={m.period}>
                  <CardContent className="flex items-center justify-between gap-3 p-4">
                    <p className="font-medium">{formatMonth(m.period, locale)}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">{formatMoney(m.paid, locale)} / {formatMoney(m.required, locale)}</span>
                      <span
                        className={
                          m.status === "paid"
                            ? "inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400"
                            : "inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400"
                        }
                      >
                        {m.status === "paid" ? t("paid") : t("unpaid")}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            {!mine.isPending && (mine.data?.months ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">{t("no_data")}</p>
            )}
          </div>
        </>
      )}

      {isManager && (
        <div className="space-y-2">
          {history.isPending && <p className="text-sm text-muted-foreground">{t("loading")}</p>}
          {(history.data ?? []).map((payment) => (
            <Card key={payment.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {t("apartment")} {payment.apartment_number} · {formatMonth(payment.period, locale)}
                  </p>
                  <p className="text-xs text-muted-foreground">{formatDate(payment.paid_at, locale)}</p>
                </div>
                <div className="flex items-center gap-2">
                  {payment.is_reversal && <Badge variant="destructive">{t("reversal")}</Badge>}
                  <span className="font-display font-bold">{formatMoney(payment.amount, locale)}</span>
                  {isManager && !payment.is_reversal && (
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={t("reverse")}
                      onClick={() => {
                        const reason = window.prompt(t("reverse_reason"));
                        if (reason) reverse.mutate({ id: payment.id, reason });
                      }}
                    >
                      <Undo2 className="size-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className="font-display text-lg font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}
