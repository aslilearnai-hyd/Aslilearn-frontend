import {
  BarChart3,
  BookOpen,
  CalendarDays,
  ClipboardList,
  FileText,
  GraduationCap,
  LayoutDashboard,
  MonitorPlay,
  ScanLine,
  Settings,
  Sparkles,
  Trophy,
  User,
  Users,
  Users2,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  href: string;
  /** Shown as a small pill on the right of the row (e.g. an unread count). */
  badge?: number;
}

/**
 * Teacher portal navigation.
 *
 * The first five ids intentionally mirror the existing `?tab=` values used by
 * `pages/teacher/dashboard.tsx` so the shell can drive that page without it
 * being rewritten first.
 */
export const teacherNav: NavItem[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, href: "/teacher/dashboard?tab=overview" },
  { id: "classes", label: "My Classes", icon: GraduationCap, href: "/teacher/dashboard?tab=classes" },
  { id: "students", label: "Students", icon: Users2, href: "/teacher/dashboard?tab=students" },
  { id: "edu-ott", label: "EduOTT", icon: MonitorPlay, href: "/edu-ott" },
  { id: "learning-paths", label: "Learning Paths", icon: BookOpen, href: "/learning-paths" },
  { id: "vidya-ai", label: "Vidya AI", icon: Sparkles, href: "/teacher/dashboard?tab=vidya-ai" },
  // NOTE: /teacher/timetable is currently a redirect back to the dashboard,
  // so Calendar points at a tab until a real calendar page exists.
  { id: "calendar", label: "Calendar", icon: CalendarDays, href: "/teacher/dashboard?tab=calendar" },
  { id: "results", label: "Offline Results", icon: ScanLine, href: "/teacher/results" },
  { id: "settings", label: "Settings", icon: Settings, href: "/teacher/dashboard?tab=settings" },
  // Last item — mirrors student Profile: dedicated reports / student analysis
  { id: "reports", label: "Reports", icon: BarChart3, href: "/teacher/dashboard?tab=reports" },
];

/**
 * Student portal navigation.
 *
 * Paths mirror the ones already wired in `components/navigation.tsx` so the
 * shell is a drop-in replacement for the old top nav.
 */
export const studentNav: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
  { id: "learning-paths", label: "Learning Paths", icon: BookOpen, href: "/learning-paths" },
  { id: "edu-ott", label: "EduOTT", icon: MonitorPlay, href: "/edu-ott" },
  { id: "exams", label: "Exams", icon: FileText, href: "/student-exams" },
  { id: "quiz", label: "Quiz", icon: Trophy, href: "/iq-rank-boost-subjects" },
  { id: "results", label: "Offline Results", icon: ScanLine, href: "/student/results" },
  { id: "timetable", label: "Timetable", icon: CalendarDays, href: "/student/timetable" },
  // Flashcards / Practice / Mock Tests intentionally live inside Vidya AI
  // rather than the sidebar — the AI tools are the core of the platform and
  // belong in one place.
  { id: "ai-tutor", label: "Vidya AI", icon: Sparkles, href: "/ai-tutor" },
  { id: "profile", label: "Profile", icon: User, href: "/profile" },
];

/**
 * School admin portal navigation — `?tab=` values match `pages/admin/dashboard.tsx`.
 */
export const adminNav: NavItem[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, href: "/admin/dashboard?tab=overview" },
  { id: "students", label: "Students", icon: Users2, href: "/admin/dashboard?tab=students" },
  { id: "classes", label: "Classes", icon: GraduationCap, href: "/admin/dashboard?tab=classes" },
  { id: "teachers", label: "Teachers", icon: Users, href: "/admin/dashboard?tab=teachers" },
  { id: "subjects", label: "Subjects", icon: BookOpen, href: "/admin/dashboard?tab=subjects" },
  { id: "exams", label: "Exams", icon: FileText, href: "/admin/dashboard?tab=exams" },
  { id: "results", label: "Offline Results", icon: ScanLine, href: "/admin/dashboard?tab=results" },
  { id: "learning-paths", label: "Learning Paths", icon: ClipboardList, href: "/admin/dashboard?tab=learning-paths" },
  { id: "eduott", label: "EduOTT", icon: MonitorPlay, href: "/admin/dashboard?tab=eduott" },
  { id: "timetable", label: "Timetable", icon: CalendarDays, href: "/admin/dashboard?tab=timetable" },
  { id: "calendar", label: "Calendar", icon: CalendarDays, href: "/admin/dashboard?tab=calendar" },
  { id: "vidya-ai", label: "Vidya AI", icon: Sparkles, href: "/admin/dashboard?tab=vidya-ai" },
  { id: "settings", label: "Settings", icon: Settings, href: "/admin/dashboard?tab=settings" },
];

/** Maps legacy / internal dashboard tab values onto sidebar nav ids. */
const TAB_ALIASES: Record<string, string> = {
  overview: "overview",
  "ai-classes": "overview",
  classes: "classes",
  students: "students",
  "edu-ott": "edu-ott",
  eduott: "eduott",
  "learning-paths": "learning-paths",
  "vidya-ai": "vidya-ai",
  calendar: "calendar",
  timetable: "timetable",
  settings: "settings",
  reports: "reports",
  teachers: "teachers",
  subjects: "subjects",
  exams: "exams",
  results: "results",
};

/** Extra path prefixes → nav id (for nested routes that are not the nav href). */
const PATH_PREFIX_ALIASES: Array<{ prefix: string; id: string }> = [
  { prefix: "/iq-rank-boost", id: "quiz" },
  { prefix: "/quiz/", id: "quiz" },
  { prefix: "/quiz", id: "quiz" },
  { prefix: "/student-exams", id: "exams" },
  { prefix: "/exam/", id: "exams" },
  { prefix: "/student/results", id: "results" },
  { prefix: "/student/timetable", id: "timetable" },
  { prefix: "/student/tools", id: "ai-tutor" },
  { prefix: "/ai-tutor", id: "ai-tutor" },
  { prefix: "/learning-paths", id: "learning-paths" },
  { prefix: "/edu-ott", id: "edu-ott" },
  { prefix: "/profile", id: "profile" },
];

function pathMatchesBase(pathname: string, base: string): boolean {
  if (!base || base === "/") return false;
  return pathname === base || pathname.startsWith(`${base}/`);
}

/** Resolves the active nav id from a wouter location + search string. */
export function resolveActiveNavId(pathname: string, search: string, items: NavItem[]): string {
  const tab = new URLSearchParams(search).get("tab");
  if (tab) {
    const normalized = TAB_ALIASES[tab] || tab;
    const byTab = items.find((i) => i.id === normalized || i.id === tab);
    if (byTab) return byTab.id;
  }

  // Nested route aliases (e.g. /iq-rank-boost/quiz/:id → Quiz)
  const alias = PATH_PREFIX_ALIASES.find(({ prefix }) => pathMatchesBase(pathname, prefix));
  if (alias && items.some((i) => i.id === alias.id)) {
    return alias.id;
  }

  // Longest matching base wins, so /student/tools/mock-test-builder beats a
  // shorter sibling rather than whichever happens to be listed first.
  const byPath = items
    .filter((i) => !i.href.includes("?"))
    .map((i) => ({ id: i.id, base: i.href.split("?")[0] }))
    .filter(({ base }) => pathMatchesBase(pathname, base))
    .sort((a, b) => b.base.length - a.base.length)[0];

  if (byPath) return byPath.id;

  // Admin/teacher dashboard base path with no tab → first item
  if (pathname.includes("/admin/dashboard") || pathname.includes("/teacher/dashboard")) {
    return items[0]?.id ?? "";
  }

  // Exact dashboard home only — never fall back to Dashboard for unrelated pages
  if (pathname === "/dashboard" && items.some((i) => i.id === "dashboard")) {
    return "dashboard";
  }

  return "";
}
