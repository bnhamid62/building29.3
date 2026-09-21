import { API_UNREACHABLE, ApiError } from "@/api/http";
import { useI18n } from "@/i18n";
import type { MessageKey } from "@/i18n/messages";

/** Maps an API failure to a clear, translated message key. */
export function errorKey(error: unknown): MessageKey {
  if (error instanceof ApiError) {
    if (error.code === API_UNREACHABLE) return "api_unreachable";
    if (error.status === 401) return "err_auth";
    if (error.status === 403) return "unauthorized";
    if (error.status === 422 || error.code === "validation_error") return "err_validation";
    if (error.status === 409) return "err_conflict";
    if (error.status >= 500) return "err_server";
  }
  return "error_generic";
}

/** Human message for inline form errors: prefers the server text, falls back to a translated key. */
export function useApiMessage() {
  const { t } = useI18n();
  return (error: unknown) => {
    if (error instanceof ApiError && error.code !== API_UNREACHABLE && error.message) return error.message;
    return t(errorKey(error));
  };
}

/** Full-width state block distinguishing connection / auth / permission / validation / server errors. */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useI18n();
  const key = errorKey(error);
  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
      <p className="font-medium text-destructive">{t(key)}</p>
      {key === "api_unreachable" && <p className="mt-1 text-muted-foreground">{t("api_unreachable_hint")}</p>}
      {onRetry && (
        <button type="button" className="mt-2 text-xs font-medium underline underline-offset-4" onClick={onRetry}>
          {t("retry")}
        </button>
      )}
    </div>
  );
}

export function EmptyState({ label }: { label: string }) {
  return <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">{label}</p>;
}
