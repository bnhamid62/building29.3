import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Building2, Home, HardHat, Users, Wallet, DoorClosed, Settings, LogOut, Languages, Moon, Sun, Bell, FileText, ScrollText, PieChart, MessageSquareWarning, Vote, CalendarDays, CalendarClock, Cctv, Megaphone } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { notificationsApi } from "@/api/endpoints";
import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n } from "@/i18n";
import { DEMO_MODE } from "@/lib/config";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ChangePasswordDialog } from "./ChangePasswordDialog";
import { OfflineBanner } from "./OfflineBanner";
import { registerServiceWorker } from "@/lib/pwa";
import { startQueryPersistence, stopQueryPersistence } from "@/lib/query-persist";

const NAV = [
  { to: "/", key: "dashboard", icon: Home, manager: false },
  { to: "/projects", key: "projects", icon: HardHat, manager: false },
  { to: "/apartments", key: "apartments", icon: DoorClosed, manager: false },
  { to: "/payments", key: "payments", icon: Wallet, manager: false },
  { to: "/notifications", key: "notifications", icon: Bell, manager: false },
  { to: "/notices", key: "notices", icon: Megaphone, manager: false },

  { to: "/documents", key: "documents", icon: FileText, manager: false },
  { to: "/complaints", key: "complaints", icon: MessageSquareWarning, manager: false },
  { to: "/votes", key: "votes", icon: Vote, manager: false },
  { to: "/meetings", key: "meetings", icon: CalendarDays, manager: false },
  { to: "/bookings", key: "bookings", icon: CalendarClock, manager: false },
  { to: "/cameras", key: "cameras", icon: Cctv, manager: false },
  { to: "/residents", key: "residents", icon: Users, manager: true },
  { to: "/reports", key: "reports", icon: PieChart, manager: true },
  { to: "/audit", key: "audit", icon: ScrollText, manager: true },
  { to: "/settings", key: "settings", icon: Settings, manager: false },
] as const;

function NotificationBell() {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const unread = useQuery({
    queryKey: ["notifications", "unread"],
    queryFn: notificationsApi.unreadCount,
    refetchInterval: 60_000,
  });
  const list = useQuery({
    queryKey: ["notifications"],
    queryFn: notificationsApi.list,
    enabled: open,
  });
  const count = unread.data?.unread ?? 0;
  const items = (list.data ?? []).slice(0, 6);

  const markAll = async () => {
    await notificationsApi.markAllRead().catch(() => undefined);
    await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    await queryClient.invalidateQueries({ queryKey: ["notifications", "unread"] });
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={t("notifications")} className="hover:bg-accent relative grid size-9 place-items-center rounded-md">
          <Bell className="size-4" />
          {count > 0 && (
            <span className="bg-destructive text-destructive-foreground absolute end-1 top-1 grid min-w-4 place-items-center rounded-full px-1 text-[10px] leading-4 font-bold">
              {count > 9 ? "9+" : count}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center gap-2 px-2 py-1.5">
          <span className="text-sm font-semibold">{t("notifications")}</span>
          {count > 0 && (
            <button type="button" className="text-primary ms-auto text-xs hover:underline" onClick={() => void markAll()}>
              {t("mark_all_read")}
            </button>
          )}
        </div>
        <DropdownMenuSeparator />
        {list.isPending && <p className="text-muted-foreground px-2 py-3 text-xs">{t("loading")}</p>}
        {!list.isPending && items.length === 0 && (
          <p className="text-muted-foreground px-2 py-3 text-xs">{t("no_notifications")}</p>
        )}
        {items.map((item) => (
          <DropdownMenuItem key={item.id} asChild className="cursor-pointer items-start gap-2">
            <Link to="/notifications">
              <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", item.read ? "bg-transparent" : "bg-primary")} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{locale === "ar" ? item.title_ar : item.title_fr}</span>
                {(locale === "ar" ? item.body_ar : item.body_fr) && (
                  <span className="text-muted-foreground line-clamp-2 block text-xs">
                    {locale === "ar" ? item.body_ar : item.body_fr}
                  </span>
                )}
              </span>
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="cursor-pointer justify-center text-sm font-medium">
          <Link to="/notifications">{t("view_all")}</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function useTheme() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const stored = window.localStorage.getItem("b29_theme");
    const isDark = stored ? stored === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);
  const toggle = () => {
    setDark((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle("dark", next);
      window.localStorage.setItem("b29_theme", next ? "dark" : "light");
      return next;
    });
  };
  return { dark, toggle };
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, ready, isManager, logout } = useAuth();
  const { t, locale, setLocale } = useI18n();
  const navigate = useNavigate();
  const { dark, toggle } = useTheme();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const queryClient = useQueryClient();

  useEffect(() => {
    if (ready && !user) void navigate({ to: "/login" });
  }, [ready, user, navigate]);

  // Offline app shell (guarded: never registers in dev or the Lovable preview).
  useEffect(() => {
    void registerServiceWorker();
  }, []);

  // Read-only cache, namespaced per signed-in user so residents never read another apartment's data.
  useEffect(() => {
    if (!user) {
      stopQueryPersistence();
      return;
    }
    startQueryPersistence(queryClient, {
      userId: user.id,
      role: user.roles.includes("manager") ? "manager" : "resident",
      apartmentId: user.apartment_id,
    });
    return () => stopQueryPersistence();
  }, [user, queryClient]);

  if (!ready || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">{t("loading")}</div>
    );
  }

  // Mandatory first-login password change: nothing else in the app is reachable until it is done.
  if (user.must_change_password) {
    return (
      <div className="grid min-h-screen place-items-center bg-background p-4">
        <ChangePasswordDialog forced />
      </div>
    );
  }

  const items = NAV.filter((item) => !item.manager || isManager);
  const mobileItems = items.filter((item) => ["/", "/projects", "/payments", "/notifications", "/settings"].includes(item.to));

  return (
    <div className="min-h-screen bg-background lg:flex">
      <aside className="hidden w-64 shrink-0 flex-col bg-sidebar px-4 py-6 text-sidebar-foreground lg:flex">
        <div className="mb-8 flex items-center gap-3 px-2">
          <span className="grid size-10 place-items-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
            <Building2 className="size-5" />
          </span>
          <div>
            <p className="font-display text-lg leading-tight font-bold">{t("app_name")}</p>
            <p className="text-xs opacity-70">{t("tagline")}</p>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {items.map((item) => {
            const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  active ? "bg-sidebar-primary text-sidebar-primary-foreground" : "hover:bg-sidebar-accent",
                )}
              >
                <item.icon className="size-4" />
                {t(item.key)}
              </Link>
            );
          })}
        </nav>
        <div className="mt-6 rounded-lg bg-sidebar-accent p-3 text-xs">
          <p className="font-semibold">{user.full_name}</p>
          <p className="opacity-70">{isManager ? t("manager") : t("resident")}</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-20 flex items-center gap-2 border-b bg-background/90 px-4 py-3 backdrop-blur">
          <span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground lg:hidden">
            <Building2 className="size-4" />
          </span>
          <p className="font-display truncate font-bold lg:hidden">{t("app_name")}</p>
          <div className="ms-auto flex items-center gap-1">
            <NotificationBell />
            <Button variant="ghost" size="sm" onClick={() => setLocale(locale === "ar" ? "fr" : "ar")}>
              <Languages className="size-4" />
              {locale === "ar" ? "FR" : "ع"}
            </Button>
            <Button variant="ghost" size="icon" onClick={toggle} aria-label={t("theme")}>
              {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => void logout()} aria-label={t("logout")}>
              <LogOut className="size-4" />
            </Button>
          </div>
        </header>

        <OfflineBanner />

        {DEMO_MODE && (
          <p className="no-print bg-warning px-4 py-2 text-center text-xs font-medium text-warning-foreground">
            {t("demo_banner")}
          </p>
        )}

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-5 pb-24 lg:pb-10">{children}</main>

        <nav className="no-print fixed inset-x-0 bottom-0 z-20 grid grid-flow-col border-t bg-background/95 backdrop-blur lg:hidden">
          {mobileItems.map((item) => {
            const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <item.icon className="size-5" />
                {t(item.key)}
              </Link>
            );
          })}
        </nav>
      </div>

    </div>
  );
}
