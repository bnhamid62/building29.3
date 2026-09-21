import type { Locale } from "@/i18n/messages";

export function formatMoney(amount: number, locale: Locale, currency = "DZD"): string {
  const value = new Intl.NumberFormat(locale === "ar" ? "ar-DZ" : "fr-DZ", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(amount);
  return locale === "ar" ? `${value} دج` : `${value} ${currency}`;
}

export function formatDate(value: string | null, locale: Locale): string {
  if (!value) return "—";
  const date = new Date(value.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-DZ" : "fr-DZ", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function percent(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((part / total) * 100));
}
