import {
  isSuperAdminView,
  type SuperAdminView,
} from "@/lib/super-admin-views";

const RESTORE_VIEW_KEY = "superAdminRestoreView";
const PERSISTED_VIEW_KEY = "superAdminCurrentView";

function isSuperAdminDashboardPath(path: string): boolean {
  return (
    path === "/super-admin/dashboard" ||
    path.endsWith("/super-admin/dashboard") ||
    path === "/super_admin/dashboard" ||
    path.endsWith("/super_admin/dashboard")
  );
}

/**
 * Mirror the current view into the URL hash. "push" adds a browser history entry so
 * Back/Forward move between super-admin pages instead of leaving the dashboard.
 */
export function persistSuperAdminView(view: SuperAdminView, mode: "push" | "replace" = "replace") {
  if (typeof window === "undefined") return;
  if (!isSuperAdminView(view)) return;
  sessionStorage.setItem(PERSISTED_VIEW_KEY, view);
  if (!isSuperAdminDashboardPath(window.location.pathname)) return;
  const base = `${window.location.pathname}${window.location.search}`;
  const next = view === "dashboard" ? base : `${base}#${view}`;
  if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== next) {
    if (mode === "push") window.history.pushState({ superAdminView: view }, "", next);
    else window.history.replaceState({ superAdminView: view }, "", next);
  }
}

/** View encoded in the current URL hash (no hash = dashboard home). */
export function readSuperAdminViewFromHash(): SuperAdminView {
  if (typeof window === "undefined") return "dashboard";
  const hashView = window.location.hash.replace(/^#/, "").trim();
  return hashView && isSuperAdminView(hashView) ? hashView : "dashboard";
}

export function readPersistedSuperAdminView(): SuperAdminView | null {
  if (typeof window === "undefined") return null;
  const hashView = window.location.hash.replace(/^#/, "").trim();
  if (hashView && isSuperAdminView(hashView)) return hashView;
  const raw = sessionStorage.getItem(PERSISTED_VIEW_KEY);
  if (!raw || !isSuperAdminView(raw)) return null;
  return raw;
}

/** One-time restore when returning from school detail (takes priority over persisted view). */
export function queueSuperAdminViewRestore(view: SuperAdminView) {
  if (typeof window === "undefined") return;
  if (!isSuperAdminView(view)) return;
  sessionStorage.setItem(RESTORE_VIEW_KEY, view);
}

export function consumeSuperAdminViewRestore(): SuperAdminView | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(RESTORE_VIEW_KEY);
  sessionStorage.removeItem(RESTORE_VIEW_KEY);
  if (!raw || !isSuperAdminView(raw)) return null;
  return raw;
}

/** Remove legacy ?view= from the address bar (was persisting School Management across browser restarts). */
export function clearSuperAdminDashboardQueryFromUrl() {
  if (typeof window === "undefined") return;
  const path = window.location.pathname;
  if (!isSuperAdminDashboardPath(path)) return;
  if (!window.location.search) return;
  window.history.replaceState(window.history.state, "", path + window.location.hash);
}
