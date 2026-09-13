import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, ReceiptText, Undo2 } from "lucide-react";
import { useState } from "react";
import { apartmentsApi, paymentsApi, projectsApi } from "@/api/endpoints";
import { AppShell } from "@/components/app/AppShell";
import { useAuth } from "@/auth/AuthProvider";
import { OfflineWriteNotice } from "@/components/app/OfflineBanner";
import { assertOnline, useOnline } from "@/lib/offline";
import { useI18n } from "@/i18n";
import { ErrorState } from "@/components/app/ApiState";
import { firstIssue, paymentSchema } from "@/lib/validation";
import { formatDate, formatMoney } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/payments")({
  head: () => ({
    meta: [
      { title: "المدفوعات | Immeuble 29 — Paiements" },
      { name: "description", content: "Enregistrement des paiements en espèces, reçus numérotés et historique." },
      { property: "og:title", content: "Immeuble 29 — Paiements" },
      { property: "og:description", content: "Enregistrement des paiements en espèces, reçus numérotés et historique." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <AppShell>
      <PaymentsPage />
    </AppShell>
  ),
});

function PaymentsPage() {
  const { t, locale, bi } = useI18n();
  const online = useOnline();
  const { isManager } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const payments = useQuery({
    queryKey: ["payments", isManager],
    queryFn: () => (isManager ? paymentsApi.list() : paymentsApi.mine()),
  });
  const projects = useQuery({ queryKey: ["projects"], queryFn: projectsApi.list, enabled: isManager });
  const apartments = useQuery({ queryKey: ["apartments"], queryFn: apartmentsApi.list, enabled: isManager });

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["payments"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      queryClient.invalidateQueries({ queryKey: ["projects"] }),
      queryClient.invalidateQueries({ queryKey: ["apartments"] }),
    ]);
  };

  const create = useMutation({
    mutationFn: (input: Record<string, unknown>) => {
      assertOnline();
      return paymentsApi.create(input);
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
      return paymentsApi.reverse(id, reason);
    },
    onSuccess: invalidate,
  });

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = paymentSchema.safeParse({
      project_id: Number(form.get("project_id")),
      apartment_id: Number(form.get("apartment_id")),
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
        <h1 className="font-display text-2xl font-bold">{isManager ? t("payments") : t("my_payments")}</h1>
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
              <form className="space-y-3" onSubmit={submit}>
                <div className="space-y-1.5">
                  <Label>{t("projects")}</Label>
                  <Select name="project_id" required>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(projects.data ?? []).map((project) => (
                        <SelectItem key={project.id} value={String(project.id)}>
                          {bi(project.name_ar, project.name_fr)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                          {apartment.number} — {apartment.primary_name ?? ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="amount">{t("amount")}</Label>
                  <Input id="amount" name="amount" type="number" min="1" step="0.01" required />
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
          <CardContent className="p-0">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
              <h2 className="font-display text-base font-semibold">{t("payment_board")}</h2>
              <p className="text-muted-foreground text-xs">
                {t("results_count")}: {(apartments.data ?? []).length}
              </p>
            </div>
            {apartments.isPending && <p className="text-muted-foreground p-4 text-sm">{t("loading")}</p>}
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
                  {(apartments.data ?? []).map((apartment) => {
                    const settled = apartment.balance <= 0;
                    return (
                      <TableRow key={apartment.id}>
                        <TableCell className="font-medium">{apartment.number}</TableCell>
                       <TableCell className="hidden sm:table-cell">
  {apartment.floor === 0 ? t("ground_floor") : `${t("floor")} ${apartment.floor}`}
</TableCell>
                        <TableCell>{formatMoney(apartment.required_total, locale)}</TableCell>
                        <TableCell>{formatMoney(apartment.paid_total, locale)}</TableCell>
                        <TableCell className="hidden sm:table-cell">{formatMoney(apartment.balance, locale)}</TableCell>
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


      {payments.isPending && <p className="text-sm text-muted-foreground">{t("loading")}</p>}
      {payments.isError && <ErrorState error={payments.error} onRetry={() => void payments.refetch()} />}

      <div className="space-y-2">
        {(payments.data ?? []).map((payment) => (
          <Card key={payment.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {t("apartment")} {payment.apartment_number} · {bi(payment.project_name_ar, payment.project_name_fr)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(payment.paid_at, locale)} · {payment.receipt_no ?? t("reversal")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {payment.is_reversal && <Badge variant="destructive">{t("reversal")}</Badge>}
                <span className="font-display font-bold">{formatMoney(payment.amount, locale)}</span>
                {payment.receipt_no && (
                  <Button asChild size="icon" variant="ghost">
                    <Link to="/receipts/$no" params={{ no: payment.receipt_no }}>
                      <ReceiptText className="size-4" />
                    </Link>
                  </Button>
                )}
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
        {!payments.isPending && (payments.data ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">{t("no_data")}</p>
        )}
      </div>
    </div>
  );
}
