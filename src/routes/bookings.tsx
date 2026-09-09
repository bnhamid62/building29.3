import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CalendarClock } from "lucide-react";
import { bookingsApi } from "@/api/endpoints";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/bookings")({
  head: () => ({
    meta: [
      { title: "الحجوزات | Immeuble 29 — Espaces communs" },
      { name: "description", content: "Réservez les espaces communs de l'immeuble 29 : disponibilité, horaires et validation du gestionnaire." },
      { property: "og:title", content: "Immeuble 29 — Réservations" },
      { property: "og:description", content: "Réservation des espaces communs avec validation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <AppShell>
      <BookingsPage />
    </AppShell>
  ),
});

const STATUS_TONE: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  pending: "default",
  approved: "secondary",
  rejected: "destructive",
  cancelled: "outline",
};

function BookingsPage() {
  const { t, locale, bi } = useI18n();
  const { isManager } = useAuth();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [form, setForm] = useState({ facility_id: "", date: "", from: "10:00", to: "12:00", purpose: "" });

  const facilities = useQuery({ queryKey: ["facilities"], queryFn: bookingsApi.facilities });
  const bookings = useQuery({ queryKey: ["bookings"], queryFn: bookingsApi.list });

  const create = useMutation({
    mutationFn: () =>
      bookingsApi.create({
        facility_id: Number(form.facility_id),
        starts_at: `${form.date} ${form.from}:00`,
        ends_at: `${form.date} ${form.to}:00`,
        purpose: form.purpose,
      }),
    onSuccess: async () => {
      setError(null);
      setFeedback(t("saved"));
      await qc.invalidateQueries({ queryKey: ["bookings"] });
    },
    onError: (err: unknown) => {
      setFeedback(null);
      const message = err instanceof Error ? err.message : t("error_generic");
      setError(message.includes("slot") ? t("slot_taken") : message);
    },
  });

  const decide = useMutation({
    mutationFn: (input: { id: number; status: string }) => bookingsApi.update(input.id, { status: input.status }),
    onSuccess: async () => qc.invalidateQueries({ queryKey: ["bookings"] }),
  });

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-bold">{t("bookings")}</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("facilities")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {facilities.isPending && <p className="text-muted-foreground">{t("loading")}</p>}
          {(facilities.data ?? []).map((f) => (
            <div key={f.id} className="flex flex-wrap items-center gap-2 border-b pb-2 last:border-0 last:pb-0">
              <span className="font-medium">{bi(f.name_ar, f.name_fr)}</span>
              <span className="text-muted-foreground text-xs">
                {t("opening_hours")}: {f.open_from?.slice(0, 5) ?? "—"}–{f.open_to?.slice(0, 5) ?? "—"} · {t("max_duration")}: {f.max_hours}h
              </span>
              {f.requires_approval && <Badge variant="outline">{t("pending")}</Badge>}
            </div>
          ))}
        </CardContent>
      </Card>

      {!isManager && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("book")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t("facilities")}</Label>
                <Select value={form.facility_id} onValueChange={(v) => setForm({ ...form, facility_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    {(facilities.data ?? []).map((f) => (
                      <SelectItem key={f.id} value={String(f.id)}>
                        {bi(f.name_ar, f.name_fr)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="b-date">{t("date")}</Label>
                <Input id="b-date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="b-from">{t("from_time")}</Label>
                <Input id="b-from" type="time" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="b-to">{t("to_time")}</Label>
                <Input id="b-to" type="time" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="b-purpose">{t("purpose")}</Label>
              <Input id="b-purpose" value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} maxLength={200} />
            </div>
            {error && <p className="text-destructive text-sm">{error}</p>}
            {feedback && <p className="text-sm text-emerald-600">{feedback}</p>}
            <Button disabled={create.isPending || !form.facility_id || !form.date} onClick={() => create.mutate()}>
              {t("book")}
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        <h2 className="font-semibold">{isManager ? t("bookings") : t("my_bookings")}</h2>
        {bookings.isPending && <p className="text-muted-foreground text-sm">{t("loading")}</p>}
        {bookings.isError && <ErrorState error={bookings.error} onRetry={() => void bookings.refetch()} />}
        {bookings.data?.length === 0 && <p className="text-muted-foreground text-sm">{t("no_bookings")}</p>}
        {(bookings.data ?? []).map((b) => (
          <Card key={b.id}>
            <CardContent className="flex flex-wrap items-center gap-3 py-3 text-sm">
              <CalendarClock className="text-primary size-4" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{bi(b.facility_name_ar, b.facility_name_fr)}</span>
                <span className="text-muted-foreground block text-xs">
                  {formatDate(b.starts_at, locale)} · {b.starts_at.slice(11, 16)}–{b.ends_at.slice(11, 16)} · {t("apartment")} {b.apartment_number ?? "—"}
                </span>
              </span>
              <Badge variant={STATUS_TONE[b.status] ?? "outline"}>{t((b.status as "pending") ?? "pending")}</Badge>
              {isManager && b.status === "pending" && (
                <span className="flex gap-2">
                  <Button size="sm" disabled={decide.isPending} onClick={() => decide.mutate({ id: b.id, status: "approved" })}>
                    {t("approve")}
                  </Button>
                  <Button size="sm" variant="outline" disabled={decide.isPending} onClick={() => decide.mutate({ id: b.id, status: "rejected" })}>
                    {t("reject")}
                  </Button>
                </span>
              )}
              {!isManager && (b.status === "pending" || b.status === "approved") && (
                <Button size="sm" variant="outline" disabled={decide.isPending} onClick={() => decide.mutate({ id: b.id, status: "cancelled" })}>
                  {t("cancel_booking")}
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
