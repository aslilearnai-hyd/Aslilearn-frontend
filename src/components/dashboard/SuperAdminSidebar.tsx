import {
  BookOpen,
  BarChart3 as BarChart3Icon,
  BarChartIcon,
  Calendar,
  CircleDot,
  CrownIcon,
  FileTextIcon,
  ClipboardList,
  FolderTree,
  Copy,
  LayoutList,
  Layers,
  LogOut,
  Menu,
  SettingsIcon,
  Shield,
  Sparkles,
  TrophyIcon,
  Users2,
  CreditCardIcon,
  Radio,
  Timer,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useSuperAdminDrawerNav } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import type { SuperAdminView } from "@/lib/super-admin-views";
import { ContactSupportLink } from "@/components/ContactSupportLink";

export type { SuperAdminView };

interface SuperAdminSidebarProps {
  currentView: SuperAdminView;
  onViewChange: (view: SuperAdminView) => void;
  user: any;
  onLogout: () => void;
}

const ANALYTICS_VIEWS = new Set(["analytics", "ai-analytics", "audit-logs", "impact-reports"]);

type SidebarMenuItem = {
  id: SuperAdminView;
  label: string;
  icon: typeof BarChart3Icon;
};

type SidebarNavSection = {
  title: string;
  items: SidebarMenuItem[];
};

/** Grouped nav — matches mobile Super Admin drawer sections. */
const NAV_SECTIONS: SidebarNavSection[] = [
  {
    title: "Platform",
    items: [
      { id: "dashboard", label: "Dashboard", icon: BarChart3Icon },
      { id: "board", label: "Board Management", icon: Users2 },
      { id: "admins", label: "School Management", icon: Shield },
      { id: "products", label: "Products", icon: Layers },
      { id: "trial-members", label: "Trial Members", icon: Timer },
    ],
  },
  {
    title: "Content & Exams",
    items: [
      { id: "subjects-and-content", label: "Subject & Content", icon: LayoutList },
      { id: "edu-ott-live", label: "Edu OTT Live", icon: Radio },
      { id: "exams", label: "Exam Management", icon: FileTextIcon },
      { id: "offline-results", label: "Offline Results", icon: ClipboardList },
      { id: "iq-rank-boost", label: "Quiz", icon: TrophyIcon },
      { id: "calendar", label: "School Calendar", icon: Calendar },
    ],
  },
  {
    title: "AI Engine",
    items: [
      { id: "vidya-ai", label: "Vidya AI", icon: Sparkles },
      { id: "ai-tool-generations", label: "AI Tool Data", icon: FolderTree },
      { id: "ai-tool-duplicates", label: "Duplicates", icon: Copy },
      { id: "ai-tool-topics", label: "AI Tool Topics", icon: CircleDot },
      { id: "ai-generator", label: "AI Generator", icon: Zap },
      { id: "book-knowledge-base", label: "Book Knowledge Base", icon: BookOpen },
      { id: "book-based-generator", label: "Book-Based Generator", icon: BookOpen },
    ],
  },
  {
    title: "Insights & Billing",
    items: [
      { id: "analytics", label: "Analytics", icon: BarChartIcon },
      { id: "subscriptions", label: "Subscriptions", icon: CreditCardIcon },
      { id: "settings", label: "Settings", icon: SettingsIcon },
    ],
  },
];

/** Same accent rotation as student/teacher AppShell. */
const NAV_ACCENTS = [
  {
    active: "from-orange-500 via-amber-400 to-yellow-300",
    glow: "shadow-[0_8px_28px_-6px_rgba(249,115,22,0.55)]",
    idle: "group-hover:text-orange-600 group-hover:ring-orange-200",
  },
  {
    active: "from-sky-500 via-cyan-400 to-teal-300",
    glow: "shadow-[0_8px_28px_-6px_rgba(14,165,233,0.5)]",
    idle: "group-hover:text-sky-600 group-hover:ring-sky-200",
  },
  {
    active: "from-violet-500 via-purple-400 to-fuchsia-300",
    glow: "shadow-[0_8px_28px_-6px_rgba(139,92,246,0.5)]",
    idle: "group-hover:text-violet-600 group-hover:ring-violet-200",
  },
  {
    active: "from-rose-500 via-pink-400 to-orange-300",
    glow: "shadow-[0_8px_28px_-6px_rgba(244,63,94,0.45)]",
    idle: "group-hover:text-rose-600 group-hover:ring-rose-200",
  },
  {
    active: "from-emerald-500 via-green-400 to-lime-300",
    glow: "shadow-[0_8px_28px_-6px_rgba(16,185,129,0.45)]",
    idle: "group-hover:text-emerald-600 group-hover:ring-emerald-200",
  },
  {
    active: "from-indigo-500 via-blue-400 to-cyan-300",
    glow: "shadow-[0_8px_28px_-6px_rgba(99,102,241,0.45)]",
    idle: "group-hover:text-indigo-600 group-hover:ring-indigo-200",
  },
  {
    active: "from-teal-500 via-emerald-400 to-sky-300",
    glow: "shadow-[0_8px_28px_-6px_rgba(20,184,166,0.45)]",
    idle: "group-hover:text-teal-600 group-hover:ring-teal-200",
  },
  {
    active: "from-fuchsia-500 via-pink-500 to-violet-400",
    glow: "shadow-[0_8px_28px_-6px_rgba(217,70,239,0.5)]",
    idle: "group-hover:text-fuchsia-600 group-hover:ring-fuchsia-200",
  },
] as const;

export function SuperAdminSidebar({ currentView, onViewChange, user, onLogout }: SuperAdminSidebarProps) {
  const useDrawerNav = useSuperAdminDrawerNav();
  const [mobileOpen, setMobileOpen] = useState(false);
  // The menu opened scrolled to the top, so the highlighted current page
  // (e.g. Exam Management, Subscriptions) was off screen. Bring it into view.
  useEffect(() => {
    if (!useDrawerNav || !mobileOpen) return;
    const t = window.setTimeout(() => {
      document
        .querySelectorAll<HTMLElement>('[data-super-admin-nav-active="true"]')
        .forEach((el) => el.scrollIntoView({ block: "center", behavior: "auto" }));
    }, 120);
    return () => window.clearTimeout(t);
  }, [mobileOpen, currentView, useDrawerNav]);
  const menuItems = NAV_SECTIONS.flatMap((section) => section.items);
  const mobileNavItems = menuItems.slice(0, 5);

  const accentForIndex = (index: number) => NAV_ACCENTS[index % NAV_ACCENTS.length];

  const renderNavButton = (item: SidebarMenuItem, accentIndex: number, compact = false) => {
    const Icon = item.icon;
    const isActive =
      currentView === item.id ||
      (item.id === "analytics" && ANALYTICS_VIEWS.has(currentView));
    const accent = accentForIndex(accentIndex);

    return (
      <button
        key={item.id}
        type="button"
        data-super-admin-nav-active={isActive ? "true" : undefined}
        aria-current={isActive ? "page" : undefined}
        onClick={() => {
          onViewChange(item.id as SuperAdminView);
          setMobileOpen(false);
        }}
        title={item.label}
        className={cn(
          "group relative w-full flex items-center gap-2 lg:gap-3 overflow-hidden rounded-2xl transition-all duration-200 text-left",
          compact
            ? "justify-center px-2 py-2 lg:justify-start lg:px-3 lg:py-2.5 mx-1 lg:mx-2"
            : "px-3 py-2.5",
          "text-xs sm:text-sm font-bold",
          isActive
            ? cn("bg-gradient-to-r text-white", accent.active, accent.glow)
            : "text-slate-600 hover:bg-white/85 hover:text-slate-900 hover:shadow-md hover:shadow-sky-100/80",
        )}
      >
        {isActive ? (
          <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_50%,rgba(255,255,255,0.35),transparent_58%)]" />
        ) : null}
        <span
          className={cn(
            "relative flex shrink-0 items-center justify-center rounded-xl ring-1 transition-all",
            compact ? "h-8 w-8 lg:h-9 lg:w-9" : "h-9 w-9",
            isActive
              ? "bg-white/30 text-white ring-white/20"
              : cn("bg-white/80 text-slate-500 ring-sky-100/90", accent.idle),
          )}
        >
          <Icon className={cn(compact ? "w-4 h-4 lg:w-[1.125rem] lg:h-[1.125rem]" : "h-[1.125rem] w-[1.125rem]")} />
        </span>
        <span
          className={cn(
            "relative min-w-0 leading-snug whitespace-normal break-words",
            compact ? "hidden lg:block flex-1" : "flex-1",
          )}
        >
          {item.label}
        </span>
        {isActive && !compact ? (
          <Sparkles className="relative h-3.5 w-3.5 shrink-0 text-white/90" aria-hidden />
        ) : null}
      </button>
    );
  };

  let navAccentCursor = 0;

  const sidebarContent = (
    <div className="app-shell-sidebar-crazy relative flex h-full min-h-0 flex-col overflow-hidden border-r border-white/60 text-slate-800 shadow-[6px_0_32px_-10px_rgba(99,102,241,0.18)]">
      {/* Soft light atmosphere (same language as student/teacher) */}
      <div className="app-shell-sidebar-atmosphere pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="sidebar-aurora absolute inset-0" />
        <div className="sidebar-aurora sidebar-aurora--alt absolute inset-0" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.55)_0%,rgba(255,255,255,0.15)_45%,rgba(255,255,255,0.35)_100%)]" />
        <div className="absolute -right-10 top-12 h-44 w-44 rounded-full bg-gradient-to-br from-sky-400/35 to-cyan-300/20 blur-3xl" />
        <div className="absolute -left-12 bottom-16 h-48 w-48 rounded-full bg-gradient-to-tr from-orange-400/30 to-rose-300/15 blur-3xl" />
      </div>

      <div className="relative z-10 flex h-full min-h-0 flex-col">
        <div className="shrink-0 px-3 pt-3 pb-1 lg:px-3 lg:pt-3">
          <button
            type="button"
            onClick={() => {
              onViewChange("dashboard");
              setMobileOpen(false);
            }}
            className={cn(
              "sidebar-brand-card flex w-full items-center gap-3 rounded-2xl border border-white/90 bg-white/80 px-3 py-3 text-left shadow-lg shadow-sky-200/40 backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-sky-200 hover:bg-white hover:shadow-xl hover:shadow-orange-200/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/50",
              !useDrawerNav && "justify-center lg:justify-start",
            )}
            aria-label="Go to Super Admin home"
            title="Home"
          >
            <div className="relative shrink-0">
              <span className="sidebar-logo-orbit absolute inset-[-6px] rounded-2xl" aria-hidden="true" />
              <img
                src="/logo-transparent.png"
                alt="AsliLearn"
                className="relative h-10 w-10 rounded-xl bg-white object-contain p-0.5 ring-2 ring-white/80"
              />
            </div>
            <div className={cn("min-w-0", !useDrawerNav && "hidden lg:block")}>
              <p className="font-display text-base font-extrabold leading-tight tracking-tight">
                <span className="sidebar-brand-gradient bg-clip-text text-transparent">AsliLearn</span>{" "}
                <span className="text-orange-500">AI</span>
              </p>
              <p className="truncate text-[11px] font-semibold text-sky-700/90">Super Admin</p>
            </div>
          </button>
        </div>

        <nav className="super-admin-sidebar-nav app-shell-sidebar-nav min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 pb-2 lg:px-3">
          {NAV_SECTIONS.map((section) => (
            <div key={section.title} className="pt-1 first:pt-0">
              <p
                title={section.title}
                className={cn(
                  "px-3 pb-1.5 pt-3 text-[10px] font-black uppercase tracking-wide text-slate-500/90 whitespace-normal break-words",
                  !useDrawerNav && "hidden lg:block",
                )}
              >
                {section.title}
              </p>
              <div className="space-y-1">
                {section.items.map((item) => {
                  const accentIndex = navAccentCursor++;
                  return renderNavButton(item, accentIndex, !useDrawerNav);
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="shrink-0 mt-auto space-y-2 border-t border-white/70 bg-white/75 px-3 py-3 backdrop-blur-xl">
          <div
            className={cn(
              "flex items-center gap-3 rounded-xl border border-white/90 bg-white/90 px-2.5 py-2 shadow-sm",
              !useDrawerNav && "justify-center lg:justify-start",
            )}
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-100 to-orange-100 ring-1 ring-orange-200/80">
              <CrownIcon className="h-4 w-4 text-amber-600" />
            </div>
            <div className={cn(!useDrawerNav && "hidden lg:block min-w-0")}>
              <p className="text-xs sm:text-sm font-bold text-slate-800 truncate">
                {user?.fullName || "Super Admin"}
              </p>
              <p className="text-[11px] font-medium text-slate-500">Super Administrator</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              onLogout();
              setMobileOpen(false);
            }}
            className={cn(
              "w-full flex items-center rounded-xl transition-colors text-slate-700 border border-sky-100/80 bg-white/95 hover:bg-rose-50 hover:border-rose-200 hover:text-rose-700 shadow-sm",
              "px-3 py-2.5 text-xs sm:text-sm font-bold",
              !useDrawerNav && "justify-center lg:justify-start",
            )}
          >
            <LogOut className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0 lg:mr-3" />
            <span className={cn(!useDrawerNav && "hidden lg:inline")}>Logout</span>
          </button>
          <ContactSupportLink
            className={cn(
              "w-full justify-center rounded-xl border-sky-100/80 bg-white/95 px-3 py-2.5 text-xs font-bold text-slate-700 shadow-sm hover:bg-gradient-to-r hover:from-sky-50 hover:to-orange-50 hover:text-slate-900 sm:text-sm lg:justify-start",
              !useDrawerNav && "px-2 lg:px-3",
            )}
            labelClassName={cn(!useDrawerNav && "hidden lg:inline")}
          />
        </div>
      </div>
    </div>
  );

  if (useDrawerNav) {
    return (
      <>
        <div className="fixed left-0 right-0 top-0 z-30 border-b border-sky-100/80 bg-white/90 pt-[env(safe-area-inset-top,0px)] backdrop-blur-xl">
          <div className="h-14 px-4 flex items-center justify-between min-h-[3.5rem] gap-2">
            <button
              type="button"
              onClick={() => {
                onViewChange("dashboard");
                setMobileOpen(false);
              }}
              className="flex items-center space-x-2 min-w-0 rounded-xl px-1 py-1 text-left hover:bg-sky-50"
              aria-label="Go to Super Admin home"
            >
              <img
                src="/logo-transparent.png"
                alt="AsliLearn"
                className="h-8 w-8 shrink-0 rounded-xl bg-white object-contain p-0.5 ring-1 ring-sky-100 shadow-sm"
              />
              <div className="min-w-0">
                <h2 className="text-xs sm:text-sm font-extrabold text-slate-900 leading-none truncate">
                  AsliLearn <span className="text-orange-500">AI</span>
                </h2>
                <p className="text-micro font-semibold text-sky-700">Super Admin</p>
              </div>
            </button>
            <div className="flex items-center gap-1 shrink-0">
              <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                <SheetTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-slate-700 hover:bg-sky-50 hover:text-slate-900"
                    aria-label="Open menu"
                  >
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent
                  side="left"
                  className="w-[min(20rem,92vw)] overflow-hidden border-none bg-white p-0 sm:w-80"
                >
                  {sidebarContent}
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>

        <div className="sm:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-sky-100/80 bg-white/95 flex justify-around py-2 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur-xl">
          {mobileNavItems.map((item, index) => {
            const Icon = item.icon;
            const isActive =
              currentView === item.id ||
              (item.id === "analytics" && ANALYTICS_VIEWS.has(currentView));
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onViewChange(item.id as SuperAdminView)}
                className={cn(
                  "flex flex-col items-center gap-0.5 px-2 py-1 min-w-0",
                  isActive ? "text-sky-600" : "text-slate-400",
                )}
              >
                <span
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-xl",
                    isActive
                      ? cn("bg-gradient-to-r text-white", accentForIndex(index).active)
                      : "bg-slate-50",
                  )}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                </span>
                <span className="text-micro truncate max-w-[4.5rem] font-semibold">
                  {item.label.split(" ")[0]}
                </span>
              </button>
            );
          })}
        </div>
      </>
    );
  }

  return (
    <aside
      className={cn(
        "super-admin-sidebar hidden sm:flex flex-col transition-all duration-300",
        "sm:w-[60px] lg:w-72 sm:min-w-[60px] lg:min-w-[18rem] lg:max-w-[18rem]",
        "h-screen fixed top-0 left-0 overflow-hidden z-20",
      )}
    >
      {sidebarContent}
    </aside>
  );
}

export default SuperAdminSidebar;
