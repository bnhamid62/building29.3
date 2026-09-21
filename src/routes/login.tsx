import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Building2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n } from "@/i18n";
import { API_BASE_URL, DEMO_MODE } from "@/lib/config";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "تسجيل الدخول | Immeuble 29 — Connexion" },
      { name: "description", content: "Espace sécurisé des résidents et du gestionnaire de l'Immeuble 29." },
      { property: "og:title", content: "Immeuble 29 — Connexion" },
      { property: "og:description", content: "Espace sécurisé des résidents et du gestionnaire de l'Immeuble 29." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { t, locale, setLocale } = useI18n();
  const { login, user, ready, apiDown } = useAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (ready && user) void navigate({ to: "/" });
  }, [ready, user, navigate]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(identifier, password);
      await navigate({ to: "/" });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("error"));
    } finally {
      setBusy(false);
    }
  };

  const fill = (id: string, pwd: string) => {
    setIdentifier(id);
    setPassword(pwd);
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
            <Building2 className="size-6" />
          </span>
          <p className="font-display text-xl font-bold">{t("app_name")}</p>
        </div>
        <div>
          <h1 className="font-display text-4xl leading-tight font-bold">{t("tagline")}</h1>
          <p className="mt-4 max-w-sm text-sm opacity-80">
            1500 مسكن، القطب 4، سيدي عبد الله — 40 شقة، 10 طوابق.
          </p>
        </div>
        <p className="text-xs opacity-60">© 2026</p>
      </div>

      <div className="flex flex-col justify-center px-5 py-10">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="font-display text-2xl font-bold">{t("login")}</h2>
            <Button variant="outline" size="sm" onClick={() => setLocale(locale === "ar" ? "fr" : "ar")}>
              {locale === "ar" ? "Français" : "العربية"}
            </Button>
          </div>
          {apiDown && (
            <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
              <p className="font-semibold text-destructive">{t("api_unreachable")}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("api_unreachable_hint")}</p>
              <p className="mt-1 font-mono text-[11px] break-all text-muted-foreground">{API_BASE_URL}</p>
            </div>
          )}
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-1.5">
              <Label htmlFor="identifier">{t("identifier")}</Label>
              <Input id="identifier" value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">{t("password")}</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? t("signing_in") : t("sign_in")}
            </Button>
          </form>

          {DEMO_MODE && (
            <Card className="mt-6">
              <CardContent className="space-y-2 p-4 text-sm">
                <p className="font-semibold">{t("demo_accounts")}</p>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="secondary" size="sm" onClick={() => fill("manager", "Manager@2026")}>
                    {t("manager")}
                  </Button>
                  <Button type="button" variant="secondary" size="sm" onClick={() => fill("res02", "Resident@2026")}>
                    {t("resident")}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">{t("demo_banner")}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
