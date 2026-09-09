import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n";
import { disablePush, enablePush, isPushEnabled, pushSupported } from "@/lib/push";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

/**
 * Shared push-alerts switch: fetches the VAPID key, asks for browser
 * permission, and hands the subscription to the PHP API (or removes it).
 */
export function PushToggle({ withCard = true }: { withCard?: boolean }) {
  const { t } = useI18n();
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const operation = useRef(0);
  const supported = pushSupported();

  useEffect(() => {
    const currentOperation = operation.current;
    let mounted = true;
    void isPushEnabled()
      .then((isEnabled) => {
        if (mounted && operation.current === currentOperation) setEnabled(isEnabled);
      })
      .finally(() => {
        if (mounted && operation.current === currentOperation) setBusy(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const toggle = async (next: boolean) => {
    const operationId = operation.current + 1;
    operation.current = operationId;
    const previous = enabled;
    setBusy(true);
    setMessage(null);
    try {
      if (next) await enablePush();
      else await disablePush();
      if (operation.current === operationId) {
        setEnabled(next);
        if (next) setMessage(t("push_enabled"));
      }
    } catch (err) {
      const code = err instanceof Error ? err.message : "push_failed";
      const known = ["push_unsupported", "push_denied", "push_no_worker"] as const;
      if (operation.current === operationId) {
        setMessage(
          t((known as readonly string[]).includes(code) ? (code as "push_denied") : "push_failed"),
        );
        setEnabled(previous);
      }
    } finally {
      if (operation.current === operationId) setBusy(false);
    }
  };

  const control = (
    <div className="flex flex-wrap items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{t("push_alerts")}</p>
        <p className="text-muted-foreground text-sm">
          {supported ? t("push_alerts_hint") : t("push_unsupported")}
        </p>
        {message && <p className="text-muted-foreground mt-1 text-xs">{message}</p>}
      </div>
      <Switch
        checked={enabled}
        disabled={!supported || busy}
        aria-label={enabled ? t("push_disable") : t("push_enable")}
        onCheckedChange={(next) => void toggle(next)}
      />
    </div>
  );

  if (!withCard) return control;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("push_alerts")}</CardTitle>
      </CardHeader>
      <CardContent>{control}</CardContent>
    </Card>
  );
}
