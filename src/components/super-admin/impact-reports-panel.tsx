import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { API_BASE_URL } from "@/lib/api-config";
import { getAuthToken } from "@/lib/auth-utils";
import { useToast } from "@/hooks/use-toast";
import { DashboardScrollPanel } from "@/components/layout/DashboardScrollPanel";
import {
  Download,
  FileText,
  Loader2,
  RefreshCw,
  School,
  Users,
  GraduationCap,
  Activity,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
} from "lucide-react";
import { cn } from "@/lib/utils";
import "react-day-picker/dist/style.css";

type SchoolSnap = {
  _id?: string;
  adminId: string;
  schoolName?: string;
  schoolEmail?: string;
  location?: string;
  periodLabel?: string;
  teachersIssued?: number;
  teachersLoggedIn?: number;
  teachersActive?: number;
  teachersOccasional?: number;
  teachersInactive?: number;
  studentsIssued?: number;
  studentsAccessed?: number;
  studentsActive3Plus?: number;
  totalLearningSessions?: number;
  totalMinutesSpent?: number;
  aiExplanationsCount?: number;
  practiceAttempts?: number;
  videosWatchedCount?: number;
  studentsWatchedVideos?: number;
  examAttemptsCount?: number;
  studentsTookExams?: number;
  homeworkSubmissions?: number;
  iqQuizAttempts?: number;
  repeatPracticeStudentPct?: number;
  avgSessionsPerActiveStudent?: number;
  keyObservation?: string;
  topSubjects?: Array<{ subject: string; sessions: number; pct: number }>;
  teachers?: Array<{ name: string; status: string; generationsCreated: number }>;
  studentReports?: StudentReportRow[];
  dayBreakdown?: DayBreakdownRow[];
  activeStudentCount?: number;
  totalStudents?: number;
};

type StudentReportRow = {
  studentId: string;
  name: string;
  email?: string;
  classNumber?: string;
  accessed?: boolean;
  sessions?: number;
  minutes?: number;
  videosWatched?: number;
  examAttempts?: number;
  avgExamPct?: number;
  examTitles?: string[];
  aiDoubts?: number;
  practiceAttempts?: number;
  homeworkSubmissions?: number;
  iqAttempts?: number;
  summary?: string;
};

type DayBreakdownRow = {
  date?: string;
  sessions?: number;
  minutes?: number;
  students?: number;
};

type Mode = "weekly" | "custom";

function toInputDate(d: Date) {
  // Prefer Asia/Kolkata calendar day so "today" matches school activity windows.
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/** Parse YYYY-MM-DD as a local calendar date (noon avoids DST edge cases). */
function parseYmd(ymd: string): Date | undefined {
  const m = String(ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return undefined;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function formatDisplayDate(ymd: string) {
  const d = parseYmd(ymd);
  if (!d) return ymd || "Pick date";
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function ImpactDatePicker({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (ymd: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = parseYmd(value);

  return (
    <div className="flex min-w-0 w-full flex-col gap-1.5">
      <Label htmlFor={id} className="text-sm font-medium text-slate-600">
        {label}
      </Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            className={cn(
              "h-10 w-full justify-start gap-2 rounded-xl border-slate-200 bg-white px-3 text-left font-normal shadow-none",
              !value && "text-slate-400",
            )}
          >
            <CalendarDays className="h-4 w-4 shrink-0 text-orange-600" />
            <span className="min-w-0 truncate">{formatDisplayDate(value)}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected}
            onSelect={(day) => {
              if (!day) return;
              onChange(toInputDate(day));
              setOpen(false);
            }}
            initialFocus
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

function startOfIsoWeekLocal(d: Date) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  return date;
}

function authHeaders() {
  const token = getAuthToken() || "";
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export function ImpactReportsPanel() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [periodLabel, setPeriodLabel] = useState("");
  const [weekStart, setWeekStart] = useState(() => toInputDate(startOfIsoWeekLocal(new Date())));
  const [mode, setMode] = useState<Mode>("custom");
  const [fromDate, setFromDate] = useState(() => toInputDate(new Date()));
  const [toDate, setToDate] = useState(() => toInputDate(new Date()));
  const [schools, setSchools] = useState<SchoolSnap[]>([]);
  const [selected, setSelected] = useState<SchoolSnap | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [studentReports, setStudentReports] = useState<StudentReportRow[]>([]);
  const [dayBreakdown, setDayBreakdown] = useState<DayBreakdownRow[]>([]);
  const [studentFilter, setStudentFilter] = useState<"active" | "all">("active");
  // "Open school report" on the dashboard pre-fills the school search.
  const [schoolQuery, setSchoolQuery] = useState(() => {
    try {
      const q = window.sessionStorage.getItem("superAdmin.impactSchoolQuery") || "";
      window.sessionStorage.removeItem("superAdmin.impactSchoolQuery");
      return q;
    } catch {
      return "";
    }
  });
  const visibleSchools = useMemo(() => {
    const q = schoolQuery.trim().toLowerCase();
    return q ? schools.filter((sc) => String(sc.schoolName || "").toLowerCase().includes(q)) : schools;
  }, [schools, schoolQuery]);
  const detailRef = useRef<HTMLDivElement | null>(null);

  const periodQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (mode === "custom") {
      params.set("from", fromDate);
      params.set("to", toDate);
    } else {
      params.set("weekStart", weekStart);
    }
    return params;
  }, [mode, fromDate, toDate, weekStart]);

  const load = useCallback(
    async (build = false) => {
      setLoading(true);
      try {
        const params = new URLSearchParams(periodQuery);
        if (build) params.set("build", "1");
        let res: Response;
        try {
          res = await fetch(`${API_BASE_URL}/api/super-admin/impact-reports?${params}`, {
            headers: authHeaders(),
          });
          if (!res.ok && build) throw new Error(`HTTP ${res.status}`);
        } catch (buildError) {
          // Rebuilding every school live can outlast the connection ("Failed to
          // fetch" on mobile). Show the saved snapshots instead of an error.
          if (!build) throw buildError;
          params.delete("build");
          res = await fetch(`${API_BASE_URL}/api/super-admin/impact-reports?${params}`, {
            headers: authHeaders(),
          });
        }
        const json = await res.json();
        if (!res.ok) throw new Error(json.message || "Failed to load");
        setPeriodLabel(json.data?.periodLabel || "");
        if (json.data?.weekStart && mode === "weekly") {
          setWeekStart(toInputDate(new Date(json.data.weekStart)));
        }
        setSchools(Array.isArray(json.data?.schools) ? json.data.schools : []);
      } catch (e: unknown) {
        toast({
          title: "Impact reports",
          description: e instanceof Error ? e.message : "Could not load",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    },
    [toast, periodQuery, mode],
  );

  useEffect(() => {
    // Always rebuild from live usage on open / period change so zeros don't stick.
    void load(true);
  }, [load]);

  const shiftWeek = (delta: number) => {
    const d = new Date(`${weekStart}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + delta * 7);
    setWeekStart(toInputDate(startOfIsoWeekLocal(d)));
  };

  const runPeriod = async () => {
    setRunning(true);
    try {
      const body =
        mode === "custom"
          ? { force: true, from: fromDate, to: toDate }
          : { force: true, weekStart };
      const res = await fetch(`${API_BASE_URL}/api/super-admin/impact-reports/run`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Run failed");
      toast({
        title: "Reports generated",
        description: `${json.data?.periodLabel || periodLabel || "Period"} — schools processed. Active schools appear at the top.`,
      });
      await load(true);
    } catch (e: unknown) {
      toast({
        title: "Generate failed",
        description: e instanceof Error ? e.message : "Failed",
        variant: "destructive",
      });
    } finally {
      setRunning(false);
    }
  };

  const downloadPdf = async (adminId: string, name: string) => {
    try {
      toast({
        title: "Preparing detailed PDF",
        description: "Building student-wise report (may take a moment)…",
      });
      const params = new URLSearchParams(periodQuery);
      const res = await fetch(
        `${API_BASE_URL}/api/super-admin/impact-reports/${adminId}/pdf?${params}`,
        { headers: { Authorization: authHeaders().Authorization } },
      );
      if (!res.ok) throw new Error("PDF download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `school-impact-${name.replace(/\s+/g, "-").slice(0, 40)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      toast({
        title: "PDF",
        description: e instanceof Error ? e.message : "Failed",
        variant: "destructive",
      });
    }
  };

  const openSchoolDetail = async (school: SchoolSnap) => {
    setSelected(school);
    setDetailLoading(true);
    setStudentReports([]);
    setDayBreakdown([]);
    setStudentFilter("active");
    // Bring the report into view immediately (under filters) — no manual scroll.
    requestAnimationFrame(() => {
      detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    try {
      const params = new URLSearchParams(periodQuery);
      params.set("detail", "1");
      const res = await fetch(
        `${API_BASE_URL}/api/super-admin/impact-reports/${school.adminId}?${params}`,
        { headers: authHeaders() },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to load detail");
      const data = json.data || {};
      setSelected({ ...school, ...data });
      setStudentReports(Array.isArray(data.studentReports) ? data.studentReports : []);
      setDayBreakdown(Array.isArray(data.dayBreakdown) ? data.dayBreakdown : []);
    } catch (e: unknown) {
      toast({
        title: "School detail",
        description: e instanceof Error ? e.message : "Could not load student reports",
        variant: "destructive",
      });
    } finally {
      setDetailLoading(false);
    }
  };

  const visibleStudents = useMemo(() => {
    if (studentFilter === "all") return studentReports;
    return studentReports.filter((s) => s.accessed);
  }, [studentReports, studentFilter]);

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      active: "bg-emerald-100 text-emerald-800",
      occasional: "bg-amber-100 text-amber-800",
      inactive: "bg-slate-100 text-slate-600",
    };
    return map[s] || map.inactive;
  };

  return (
    <Card className="border-orange-100 shadow-sm min-w-0 overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <FileText className="h-5 w-5 shrink-0 text-orange-600" />
              Weekly School Impact Reports
            </CardTitle>
            <p className="text-sm text-slate-600 mt-1">
              Pick a week or a custom date range, generate, then download PDF.
              {periodLabel ? (
                <>
                  {" "}
                  Showing: <strong>{periodLabel}</strong>
                </>
              ) : null}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => void load(true)} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh
            </Button>
            <Button size="sm" onClick={() => void runPeriod()} disabled={running}>
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
              Generate for period
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="min-w-0 space-y-4 overflow-x-hidden">
        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 space-y-3 min-w-0">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={mode === "weekly" ? "default" : "outline"}
              onClick={() => setMode("weekly")}
            >
              Weekly
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === "custom" ? "default" : "outline"}
              onClick={() => setMode("custom")}
            >
              Day to day
            </Button>
          </div>

          {mode === "weekly" ? (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
                <ImpactDatePicker
                  id="impact-week"
                  label="Week of (any day in that week)"
                  value={weekStart}
                  onChange={setWeekStart}
                />
                <div className="flex flex-wrap gap-1">
                  <Button type="button" size="sm" variant="outline" onClick={() => shiftWeek(-1)}>
                    <ChevronLeft className="h-4 w-4" />
                    Prev week
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => shiftWeek(1)}>
                    Next week
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
                <Button type="button" size="sm" className="w-full sm:w-auto" onClick={() => void load(true)} disabled={loading}>
                  Apply week
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
                <ImpactDatePicker
                  id="impact-from"
                  label="From"
                  value={fromDate}
                  onChange={setFromDate}
                />
                <ImpactDatePicker
                  id="impact-to"
                  label="To"
                  value={toDate}
                  onChange={setToDate}
                />
                <Button
                  type="button"
                  size="sm"
                  className="w-full sm:col-span-2 lg:col-span-1 lg:w-auto"
                  onClick={() => void load(true)}
                  disabled={loading}
                >
                  Apply range
                </Button>
              </div>
              <p className="text-xs text-slate-500">
                Click the calendar to pick dates (IST). Apply rebuilds live usage; active schools rise to the top.
              </p>
            </div>
          )}
        </div>

        {selected ? (
          <div
            ref={detailRef}
            className="scroll-mt-4 rounded-xl border border-orange-200 bg-orange-50/40 p-4 space-y-3 shadow-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                  <School className="h-4 w-4 text-orange-600" />
                  {selected.schoolName}
                </h3>
                <p className="text-xs text-slate-500">
                  {selected.periodLabel || periodLabel} · student-wise{" "}
                  {mode === "custom" ? "day/range" : "weekly"} report
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    void downloadPdf(String(selected.adminId), selected.schoolName || "school")
                  }
                >
                  <Download className="mr-1 h-3.5 w-3.5" />
                  Detailed PDF
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setSelected(null);
                    setStudentReports([]);
                    setDayBreakdown([]);
                  }}
                >
                  Close
                </Button>
              </div>
            </div>
            <p className="text-sm text-slate-700">{selected.keyObservation}</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Stat label="Teachers logged in" value={selected.teachersLoggedIn} icon={GraduationCap} />
              <Stat label="Students accessed" value={selected.studentsAccessed} icon={Users} />
              <Stat label="Sessions" value={selected.totalLearningSessions} icon={Activity} />
              <Stat label="Videos watched" value={selected.videosWatchedCount} icon={FileText} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Stat label="Exams written" value={selected.examAttemptsCount} icon={FileText} />
              <Stat label="AI / doubts" value={selected.aiExplanationsCount} icon={Activity} />
              <Stat label="Practice" value={selected.practiceAttempts} icon={Users} />
              <Stat label="Homework" value={selected.homeworkSubmissions} icon={GraduationCap} />
            </div>

            {dayBreakdown.length ? (
              <div>
                <p className="text-xs font-semibold uppercase text-slate-500 mb-1">Day-wise activity</p>
                <div className="flex flex-wrap gap-1.5">
                  {dayBreakdown.map((d) => (
                    <Badge key={String(d.date)} variant="secondary">
                      {d.date}: {d.sessions} sess · {d.students} students
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}

            {selected.topSubjects?.length ? (
              <div>
                <p className="text-xs font-semibold uppercase text-slate-500 mb-1">Top subjects</p>
                <div className="flex flex-wrap gap-1.5">
                  {selected.topSubjects.map((row) => (
                    <Badge key={row.subject} variant="secondary">
                      {row.subject}: {row.pct}%
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase text-slate-500">
                  Student reports ({visibleStudents.length}
                  {studentFilter === "active"
                    ? ` active / ${studentReports.length}`
                    : ""}
                  )
                </p>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant={studentFilter === "active" ? "default" : "outline"}
                    onClick={() => setStudentFilter("active")}
                  >
                    Active only
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={studentFilter === "all" ? "default" : "outline"}
                    onClick={() => setStudentFilter("all")}
                  >
                    All students
                  </Button>
                </div>
              </div>

              {detailLoading ? (
                <p className="text-sm text-slate-500 flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading student-wise activity…
                </p>
              ) : (
                <DashboardScrollPanel className="max-h-[420px] rounded-xl border border-slate-200 bg-white">
                  <table className="min-w-full text-xs sm:text-sm">
                    <thead className="sticky top-0 bg-slate-50 text-left text-[10px] uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="bg-slate-50 px-2 py-2">Student</th>
                        <th className="bg-slate-50 px-2 py-2">Sessions</th>
                        <th className="bg-slate-50 px-2 py-2">Videos</th>
                        <th className="bg-slate-50 px-2 py-2">Exams</th>
                        <th className="bg-slate-50 px-2 py-2">AI</th>
                        <th className="bg-slate-50 px-2 py-2">Report</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleStudents.map((st) => (
                        <tr key={st.studentId} className="border-t border-slate-100 align-top">
                          <td className="px-2 py-2">
                            <div className="font-medium text-slate-900">{st.name}</div>
                            <div className="text-[11px] text-slate-500">
                              {st.classNumber ? `Class ${st.classNumber}` : ""}
                              {st.email ? ` · ${st.email}` : ""}
                            </div>
                          </td>
                          <td className="px-2 py-2 tabular-nums">
                            {st.sessions ?? 0}
                            <span className="text-slate-400"> · {st.minutes ?? 0}m</span>
                          </td>
                          <td className="px-2 py-2 tabular-nums">{st.videosWatched ?? 0}</td>
                          <td className="px-2 py-2 tabular-nums">
                            {st.examAttempts ?? 0}
                            {(st.examAttempts || 0) > 0 ? (
                              <div className="text-[10px] text-slate-500">avg {st.avgExamPct ?? 0}%</div>
                            ) : null}
                          </td>
                          <td className="px-2 py-2 tabular-nums">{st.aiDoubts ?? 0}</td>
                          <td className="px-2 py-2 text-slate-600 max-w-[220px]">
                            {st.summary || "—"}
                            {st.examTitles?.length ? (
                              <div className="mt-0.5 text-[10px] text-slate-400 line-clamp-2">
                                {st.examTitles.join("; ")}
                              </div>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                      {!visibleStudents.length ? (
                        <tr>
                          <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                            No students match this filter for the selected period.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </DashboardScrollPanel>
              )}
            </div>

            {selected.teachers?.length ? (
              <div>
                <p className="text-xs font-semibold uppercase text-slate-500 mb-1">Teachers</p>
                <div className="flex flex-wrap gap-1.5">
                  {selected.teachers.map((t) => (
                    <Badge
                      key={`${t.name}-${t.status}`}
                      className={cn(statusBadge(t.status))}
                    >
                      {t.name || "Teacher"} · {t.status} · {t.generationsCreated} gens
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {loading && !schools.length ? (
          <p className="text-sm text-slate-500">Loading school snapshots…</p>
        ) : !schools.length ? (
          <p className="text-sm text-slate-500">
            No school activity found for this period yet. Confirm the date range includes today
            (IST), then click <strong>Apply range</strong> or <strong>Generate for period</strong>.
            Schools with logins, sessions, exams, or AI use appear at the top.
          </p>
        ) : (
          <>
          <input
            type="search"
            value={schoolQuery}
            onChange={(e) => setSchoolQuery(e.target.value)}
            placeholder="Find a school…"
            aria-label="Find a school"
            className="mb-2 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm sm:max-w-xs"
          />
          <DashboardScrollPanel className="rounded-xl border border-slate-200 max-h-[360px]">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="bg-slate-50 px-3 py-2">School</th>
                  <th className="bg-slate-50 px-3 py-2">Teachers logged in</th>
                  <th className="bg-slate-50 px-3 py-2">Students accessed</th>
                  <th className="bg-slate-50 px-3 py-2">Sessions</th>
                  <th className="bg-slate-50 px-3 py-2">AI / Practice</th>
                  <th className="bg-slate-50 px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleSchools.map((s) => {
                  const hasActivity =
                    (s.studentsAccessed || 0) > 0 ||
                    (s.teachersLoggedIn || 0) > 0 ||
                    (s.totalLearningSessions || 0) > 0 ||
                    (s.aiExplanationsCount || 0) > 0 ||
                    (s.practiceAttempts || 0) > 0;
                  const isSelected = selected?.adminId === s.adminId;
                  return (
                    <tr
                      key={String(s.adminId)}
                      className={cn(
                        "border-t border-slate-100",
                        hasActivity && "bg-emerald-50/50",
                        isSelected && "bg-orange-100/80 ring-1 ring-inset ring-orange-200",
                      )}
                    >
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-900">{s.schoolName || "School"}</div>
                        <div className="text-xs text-slate-500">{s.location || s.schoolEmail}</div>
                      </td>
                      <td className="px-3 py-2">
                        {s.teachersLoggedIn ?? 0}
                        <span className="text-slate-400"> / {s.teachersIssued ?? 0}</span>
                        {(s.teachersActive || 0) > 0 ? (
                          <div className="text-[10px] text-emerald-700">
                            {s.teachersActive} active (3+ days)
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        {s.studentsAccessed ?? 0}
                        <span className="text-slate-400"> / {s.studentsIssued ?? 0}</span>
                      </td>
                      <td className="px-3 py-2">{s.totalLearningSessions ?? 0}</td>
                      <td className="px-3 py-2">
                        {s.aiExplanationsCount ?? 0} / {s.practiceAttempts ?? 0}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          <Button size="sm" variant="outline" onClick={() => void openSchoolDetail(s)}>
                            View
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void downloadPdf(String(s.adminId), s.schoolName || "school")}
                          >
                            <Download className="h-3.5 w-3.5" />
                            PDF
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </DashboardScrollPanel>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value?: number;
  icon: typeof Users;
}) {
  return (
    <div className="rounded-lg border border-white bg-white/90 px-3 py-2">
      <div className="flex items-center gap-1.5 text-xs text-slate-500">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className="text-lg font-semibold text-slate-900">{value ?? 0}</p>
    </div>
  );
}

export default ImpactReportsPanel;
