import { CloudOff } from "lucide-react";
import { useI18n } from "@/i18n";
import { useOnline } from "@/lib/offline";

/** Subtle, always-visible reminder that the screen is showing cached data. */
export function OfflineBanner() {
  const { t } = useI18n();
  const online = useOnline();
  if (online) return null;
  return (
    <p className="no-print bg-warning text-warning-foreground flex items-center justify-center gap-2 px-4 py-2 text-center text-xs font-medium">
      <CloudOff className="size-3.5" />
      {t("offline_banner")}
    </p>
  );
}

/** Inline notice placed next to any disabled write action while offline. */
export function OfflineWriteNotice({ className }: { className?: string }) {
  const { t } = useI18n();
  const online = useOnline();
  if (online) return null;
  return <p className={`text-warning-foreground bg-warning/60 rounded-md px-3 py-2 text-xs ${className ?? ""}`}>{t("offline_mutation_blocked")}</p>;
}
