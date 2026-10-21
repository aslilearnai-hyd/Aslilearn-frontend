import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { API_BASE_URL } from "@/lib/api-config";
import { getAuthToken } from "@/lib/auth-utils";
import { useToast } from "@/hooks/use-toast";
import {
  Download,
  FileText,
  Loader2,
  RefreshCw,
  Users,
  GraduationCap,
  Activity,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

type SchoolSnap = {
  schoolName?: string;
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
  repeatPracticeStudentPct?: number;
  avgSessionsPerActiveStudent?: number;
  practiceCorrectRate?: number;
  videosWatchedCount?: number;
  studentsWatchedVideos?: number;
  examAttemptsCount?: number;
  studentsTookExams?: number;
  homeworkSubmissions?: number;
  iqQuizAttempts?: number;
  contentProgressTouches?: number;
  keyObservation?: string;
  topSubjects?: Array<{ subject: string; sessions: number; pct: number }>;
  teachers?: Array<{ name: string; status: string; generationsCreated: number; email?: string }>;
  studentReports?: Array<{
    name?: string;
    classNumber?: string;
    accessed?: boolean;
    sessions?: number;
    minutes?: number;
    examAttempts?: number;
    aiDoubts?: number;
    summary?: string;
  }>;
  activeStudentCount?: number;
  totalStudents?: number;
};

type Mode = "weekly" | "custom";

function toInputDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfIsoWeekLocal(d: Date) {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date;
}

function yesterdayLocal() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d;
}

function authToken() {
  return getAuthToken() || "";
}

export function SchoolImpactReportCard() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [snap, setSnap] = useState<SchoolSnap | null>(null);
  const [mode, setMode] = useState<Mode>("weekly");
  const [weekStart, setWeekStart] = useState(() => toInputDate(startOfIsoWeekLocal(new Date())));
  const [fromDate, setFromDate] = useState(() => toInputDate(yesterdayLocal()));
  const [toDate, setToDate] = useState(() => toInputDate(yesterdayLocal()));

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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/impact-report?${periodQuery}`, {
        headers: { Authorization: `Bearer ${authToken()}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to load");
      setSnap(json.data || null);
    } catch (e: unknown) {
      toast({
        title: "School impact report",
        description: e instanceof Error ? e.message : "Could not load",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast, periodQuery]);

  useEffect(() => {
    void load();
  }, [load]);

  const shiftWeek = (delta: number) => {
    const d = new Date(`${weekStart}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + delta * 7);
    setWeekStart(toInputDate(startOfIsoWeekLocal(d)));
  };

  const downloadPdf = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/impact-report/pdf?${periodQuery}`, {
        headers: { Authorization: `Bearer ${authToken()}` },
      });
      if (!res.ok) throw new Error("PDF failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `school-impact-${(snap?.schoolName || "school").replace(/\s+/g, "-").slice(0, 40)}.pdf`;
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

  return (
    <Card className="border-orange-100 shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <FileText className="h-5 w-5 text-orange-600" />
              Weekly School Impact Report
            </CardTitle>
            <p className="text-sm text-slate-600 mt-1">
              {snap?.periodLabel || "Select a period"} · teachers, students & PDF for your school
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
            <Button size="sm" onClick={() => void downloadPdf()} disabled={!snap}>
              <Download className="h-4 w-4" />
              PDF
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 space-y-3">
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
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label htmlFor="admin-impact-week">Week of</Label>
                <Input
                  id="admin-impact-week"
                  type="date"
                  value={weekStart}
                  onChange={(e) => setWeekStart(e.target.value)}
                  className="asli-date-input h-10 w-[12.5rem] min-w-[12.5rem] bg-white py-2 pl-3 pr-10"
                />
              </div>
              <Button type="button" size="sm" variant="outline" onClick={() => shiftWeek(-1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => shiftWeek(1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button type="button" size="sm" onClick={() => void load()} disabled={loading}>
                Apply
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1 min-w-0 flex-1 sm:flex-none">
                <Label htmlFor="admin-impact-from">From</Label>
                <Input
                  id="admin-impact-from"
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="asli-date-input h-10 min-w-[12.5rem] w-full sm:w-[12.5rem] bg-white py-2 pl-3 pr-10"
                />
              </div>
              <div className="space-y-1 min-w-0 flex-1 sm:flex-none">
                <Label htmlFor="admin-impact-to">To</Label>
                <Input
                  id="admin-impact-to"
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="asli-date-input h-10 min-w-[12.5rem] w-full sm:w-[12.5rem] bg-white py-2 pl-3 pr-10"
                />
              </div>
              <Button type="button" size="sm" onClick={() => void load()} disabled={loading}>
                Apply
              </Button>
            </div>
          )}
        </div>

        {loading && !snap ? (
          <p className="text-sm text-slate-500">Building snapshot from live usage…</p>
        ) : !snap ? (
          <p className="text-sm text-slate-500">No data yet for this period.</p>
        ) : (
          <>
            <p className="text-sm text-slate-700">{snap.keyObservation}</p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              <Mini label="Teachers active" value={`${snap.teachersActive ?? 0}/${snap.teachersIssued ?? 0}`} icon={GraduationCap} />
              <Mini label="Students accessed" value={`${snap.studentsAccessed ?? 0}/${snap.studentsIssued ?? 0}`} icon={Users} />
              <Mini label="Sessions" value={String(snap.totalLearningSessions ?? 0)} icon={Activity} />
              <Mini label="Repeat practice" value={`${snap.repeatPracticeStudentPct ?? 0}%`} icon={FileText} />
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              <Mini
                label="Videos watched"
                value={`${snap.studentsWatchedVideos ?? 0} stu · ${snap.videosWatchedCount ?? 0}`}
                icon={Activity}
              />
              <Mini
                label="Exam attempts"
                value={`${snap.studentsTookExams ?? 0} stu · ${snap.examAttemptsCount ?? 0}`}
                icon={FileText}
              />
              <Mini label="Practice / IQ" value={String(snap.practiceAttempts ?? 0)} icon={GraduationCap} />
              <Mini label="Homework" value={String(snap.homeworkSubmissions ?? 0)} icon={Users} />
            </div>
            {snap.topSubjects?.length ? (
              <div className="flex flex-wrap gap-1.5">
                {snap.topSubjects.map((row) => (
                  <Badge key={row.subject} variant="secondary">
                    {row.subject}: {row.pct}%
                  </Badge>
                ))}
              </div>
            ) : null}

            {Array.isArray(snap.teachers) && snap.teachers.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                  Teachers ({snap.teachers.length})
                </p>
                <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-300 bg-white shadow-sm divide-y">
                  {snap.teachers.map((t, idx) => (
                    <div
                      key={`${t.email || t.name}-${idx}`}
                      className="flex items-center justify-between gap-3 px-3.5 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-slate-900">
                          {t.name || "Teacher"}
                        </p>
                        {t.email ? (
                          <p className="truncate text-sm text-slate-500">{t.email}</p>
                        ) : null}
                      </div>
                      <div className="shrink-0 text-right">
                        <Badge
                          variant="outline"
                          className={
                            t.status === "active"
                              ? "border-emerald-200 text-emerald-700 bg-emerald-50 text-sm"
                              : t.status === "occasional"
                                ? "border-amber-200 text-amber-700 bg-amber-50 text-sm"
                                : "border-slate-200 text-slate-600 text-sm"
                          }
                        >
                          {t.status || "—"}
                        </Badge>
                        <p className="mt-0.5 text-sm text-slate-500">
                          {t.generationsCreated || 0} AI resource
                          {(t.generationsCreated || 0) === 1 ? "" : "s"}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {Array.isArray(snap.studentReports) && snap.studentReports.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                  Students ({snap.activeStudentCount ?? snap.studentReports.filter((s) => s.accessed).length}
                  {" / "}
                  {snap.totalStudents ?? snap.studentReports.length} active)
                </p>
                <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-300 bg-white shadow-sm divide-y">
                  {snap.studentReports.slice(0, 40).map((s, idx) => (
                    <div
                      key={`${s.name}-${idx}`}
                      className="flex items-start justify-between gap-3 px-3.5 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-slate-900">
                          {s.name || "Student"}
                          {s.classNumber ? (
                            <span className="ml-1.5 text-sm font-normal text-slate-500">
                              Class {s.classNumber}
                            </span>
                          ) : null}
                        </p>
                        <p className="line-clamp-2 text-sm text-slate-500">
                          {s.summary ||
                            (s.accessed
                              ? `${s.sessions || 0} sessions · ${s.minutes || 0} min`
                              : "No activity this period")}
                        </p>
                      </div>
                      <div className="shrink-0 text-right text-sm text-slate-600">
                        <p className="font-medium">{s.accessed ? "Active" : "Inactive"}</p>
                        <p>{s.examAttempts || 0} exams</p>
                        <p>{s.aiDoubts || 0} AI</p>
                      </div>
                    </div>
                  ))}
                </div>
                {snap.studentReports.length > 40 ? (
                  <p className="text-sm text-slate-500">
                    Showing first 40 — download PDF for the full school report.
                  </p>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Mini({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Users;
}) {
  return (
    <div className="rounded-lg border border-orange-50 bg-orange-50/40 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-sm text-slate-500">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <p className="text-lg font-semibold text-slate-900">{value}</p>
    </div>
  );
}

export default SchoolImpactReportCard;
