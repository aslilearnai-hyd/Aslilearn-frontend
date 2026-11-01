import { useEffect, useState, type ReactNode } from "react";
import { CreditCard } from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import {
  FloatingParticles,
  InteractiveBackground,
} from "@/components/background/InteractiveBackground";
import { studentNav, type NavItem } from "@/lib/app-nav";
import {
  STUDENT_FEATURE_TO_NAV,
  STUDENT_PORTAL_FEATURE_IDS,
  filterNavByFeatures,
} from "@/lib/school-role-access";
import { getSchoolBranding } from "@/lib/school-branding";
import { isIndividualAccount } from "@/lib/individual-signup";
import { API_BASE_URL } from "@/lib/api-config";
import {
  clearAuthData,
  getAuthToken,
  getUser as getStoredUser,
  getStudentDisplayName,
  setUser as persistUser,
} from "@/lib/auth-utils";
import { cn } from "@/lib/utils";
import { startStudentPlatformSessionSync } from "@/lib/student-session-sync";

/**
 * Student-portal chrome.
 *
 * Wraps `AppShell` with the student nav plus the user/branding/logout wiring so
 * individual pages don't each re-implement it. Replaces the old `<Navigation />`
 * top bar — drop this around a page's existing content and delete the
 * `<Navigation />` import.
 */
export function StudentShell({
  children,
  contentClassName = "app-shell-content",
}: {
  children: ReactNode;
  /** Override when a page needs to manage its own padding (e.g. full-bleed players). */
  contentClassName?: string;
}) {
  const [user, setUser] = useState<any>(() => getStoredUser());

  // Storage is read once on mount; refresh if another tab logs in/out.
  useEffect(() => {
    const sync = () => setUser(getStoredUser());
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  // Record time in the app on every student page (was only tracked on /dashboard,
  // so the profile week view and teacher reports showed 0 for most usage).
  useEffect(() => startStudentPlatformSessionSync(), []);

  // Refresh school name/logo from /api/auth/me — login cache is often missing schoolLogo.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = getAuthToken();
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (token) headers.Authorization = `Bearer ${token}`;
        const res = await fetch(`${API_BASE_URL}/api/auth/me`, {
          headers,
          credentials: "include",
        });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const me = data?.user;
        if (!me || cancelled) return;

        setUser((prev: any) => {
          const next = {
            ...(prev || {}),
            ...me,
            schoolName:
              me.schoolName || me.assignedAdmin?.schoolName || prev?.schoolName || "",
            schoolLogo:
              me.schoolLogo || me.assignedAdmin?.schoolLogo || prev?.schoolLogo || "",
            assignedAdmin: me.assignedAdmin || prev?.assignedAdmin,
          };
          persistUser(next);
          return next;
        });
      } catch {
        /* keep cached branding if refresh fails */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const branding = getSchoolBranding(user);
  const individualStudent = isIndividualAccount(user);
  const studentDisplayName = getStudentDisplayName(user) || "Student";

  // B2C / individual students have no school, so hide school-only features
  // (Offline Results + Timetable) from the sidebar.
  const nav: NavItem[] = individualStudent
    ? [
        ...studentNav
          .filter((item) => item.id !== "results" && item.id !== "timetable")
          .map((item) => (item.id === "exams" ? { ...item, label: "Practice Exams" } : item)),
        { id: "subscription", label: "Subscription", icon: CreditCard, href: "/auth/subscribe" },
      ]
    : filterNavByFeatures(
        studentNav,
        user?.portalFeatures,
        STUDENT_PORTAL_FEATURE_IDS,
        STUDENT_FEATURE_TO_NAV
      );

  const handleLogout = async () => {
    try {
      const token = getAuthToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      await fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: "POST",
        headers,
        credentials: "include",
      }).catch(() => {
        /* still clear local state if the API call fails */
      });
    } finally {
      clearAuthData();
      // Hard replace, not client-side navigation: a pushed entry leaves the
      // dashboard sitting in history for the Back button to reopen.
      window.location.replace("/signin");
    }
  };

  return (
    <AppShell
      nav={nav}
      orgName={individualStudent ? studentDisplayName : branding?.schoolName || "AsliLearn AI"}
      orgSubtitle={individualStudent ? "Individual Student · AsliLearn AI" : "Student Portal"}
      orgLogoUrl={individualStudent ? undefined : branding?.schoolLogo || undefined}
      homeHref="/dashboard"
      user={{ name: studentDisplayName, role: "Student" }}
      onLogout={handleLogout}
    >
      <div className="student-school-surface relative isolate min-h-full">
        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
          <InteractiveBackground />
          <FloatingParticles />
        </div>
        <div className={cn("relative z-10", contentClassName)}>
          {children}
        </div>
      </div>
    </AppShell>
  );
}

export default StudentShell;
