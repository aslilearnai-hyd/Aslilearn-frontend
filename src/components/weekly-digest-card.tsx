import { formatMarks, formatMarksPair } from '@/lib/format-marks';
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { API_BASE_URL } from "@/lib/api-config";
import {
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  RefreshCw,
  LogIn,
  Clock,
  BookOpen,
  Brain,
  ClipboardList,
  Flame,
  Target,
  ScanLine,
  Sparkles,
  Users,
  ChevronDown,
} from "lucide-react";
import { getAuthToken, getStudentDisplayName, getUser } from "@/lib/auth-utils";
import { downloadWeeklyReportPdf } from "@/lib/weekly-report-pdf";
import {
  studentPreviewTiles,
  teacherActivityTiles,
  teacherAiTiles,
  teacherPreviewTiles,
  teacherSchoolTiles,
} from "@/lib/weekly-report-metrics";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type ExamRow = {
  title?: string;
  percentage?: number;
  obtainedMarks?: number;
  totalMarks?: number;
  completedAt?: string | null;
};

type OmrRow = {
  title?: string;
  percentage?: number;
  totalMarks?: number;
  /** Paper maximum (OMR totalMarks is the score). */
  maxMarks?: number | null;
  correct?: number;
  wrong?: number;
  left?: number;
  rank?: number | null;
  completedAt?: string | null;
};

type DigestMetrics = {
  role?: string;
  activationDate?: string | null;
  loginCount?: number;
  loginDays?: number;
  lastActiveDate?: string | null;
  lifetimeLoginDays?: number;
  sessions?: number;
  minutes?: number;
  totalTimeLabel?: string;
  avgSessionMinutes?: number;
  daysActive?: number;
  topicsPractised?: number;
  topicsRepeated?: number;
  repeatPracticePct?: number;
  aiDoubts?: number;
  aiToolUses?: number;
  aiExplanations?: number;
  practiceAttempts?: number;
  practiceAccuracy?: number;
  iqAttempts?: number;
  homeworkSubmissions?: number;
  topSubjects?: string[];
  topSubjectsDetailed?: Array<{ subject?: string; sessions?: number; pct?: number }>;
  mostUsedSubject?: { subject?: string; sessions?: number; pct?: number } | null;
  toolsUsed?: Array<{ name?: string; count?: number; subjects?: string[] }>;
  videosWatched?: number;
  chaptersCompleted?: number;
  streak?: number;
  masteryPct?: number;
  examAttempts?: number;
  avgExamPct?: number;
  bestExamPct?: number;
  examMarks?: { avg?: { obtained?: number; total?: number }; best?: { obtained?: number; total?: number } } | null;
  omrMarks?: { avg?: { obtained?: number; total?: number }; best?: { obtained?: number; total?: number } } | null;
  examQuestionAccuracy?: number;
  exams?: ExamRow[];
  omrAttempts?: number;
  omrAvgPct?: number;
  omrBestPct?: number;
  omrBestRank?: number | null;
  omrResults?: OmrRow[];
  generationsCreated?: number;
  status?: string;
  activeDays?: number;
  classesAssigned?: number;
  studentsInClasses?: number;
  schoolStudentsAccessed?: number;
  schoolSessions?: number;
  schoolTeachersActive?: number;
};

type Digest = {
  title?: string;
  summary?: string;
  highlights?: string[];
  metrics?: DigestMetrics;
  weekStart?: string;
  weekEnd?: string;
};

function MetricTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="flex h-full min-h-[6.25rem] flex-col rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5">
      <p className="min-h-[2.25rem] text-[11px] font-semibold leading-tight text-slate-500 line-clamp-2">
        {label}
      </p>
      <p className="mt-1 truncate text-lg font-bold tabular-nums leading-none text-slate-900">{value}</p>
      <p className="mt-auto min-h-[1rem] pt-1 text-[11px] leading-tight text-slate-500 line-clamp-1">
        {hint || "\u00a0"}
      </p>
    </div>
  );
}

function PreviewStatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex h-full min-h-[4.75rem] flex-col rounded-xl border border-slate-100 bg-slate-50/90 px-3 py-2.5">
      <p className="min-h-[2.25rem] text-[11px] font-semibold leading-tight text-slate-500 line-clamp-2">
        {label}
      </p>
      <p className="mt-auto truncate text-base font-bold tabular-nums leading-none text-slate-900">
        {value}
      </p>
    </div>
  );
}

function SectionTitle({
  icon: Icon,
  title,
}: {
  icon: typeof LogIn;
  title: string;
}) {
  return (
    <div className="flex items-center gap-1.5 pt-1">
      <Icon className="h-3.5 w-3.5 text-sky-600" />
      <p className="text-xs font-bold uppercase tracking-wide text-slate-600">{title}</p>
    </div>
  );
}

function n(v: unknown, fallback = 0) {
  const num = Number(v);
  return Number.isFinite(num) ? num : fallback;
}

/**
 * In-app weekly digest for teacher or student dashboards.
 * @param apiBase either `/api/teacher` or `/api/student`
 */
export function WeeklyDigestCard({ apiBase }: { apiBase: "/api/teacher" | "/api/student" }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [digest, setDigest] = useState<Digest | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadDone, setDownloadDone] = useState(false);
  const [showAllMetrics, setShowAllMetrics] = useState(false);
  const isStudent = apiBase === "/api/student";
  const isTeacher = apiBase === "/api/teacher";

  const studentName = useMemo(() => {
    try {
      return getStudentDisplayName(getUser()) || "";
    } catch {
      return "";
    }
  }, []);

  const teacherName = useMemo(() => {
    try {
      const u = getUser();
      return String(u?.fullName || u?.name || "").trim();
    } catch {
      return "";
    }
  }, []);

  const schoolName = useMemo(() => {
    try {
      const u = getUser();
      return String(u?.schoolName || u?.collegeName || u?.institutionName || "").trim();
    } catch {
      return "";
    }
  }, []);

  const load = async (build = false) => {
    setLoading(true);
    try {
      const q = build ? "?build=1" : "";
      const res = await fetch(`${API_BASE_URL}${apiBase}/weekly-digest${q}`, {
        headers: { Authorization: `Bearer ${getAuthToken() || ""}` },
      });
      const json = await res.json();
      if (res.ok) setDigest(json.data || null);
      else setDigest(null);
    } catch {
      setDigest(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(true);
  }, [apiBase]);

  const m = digest?.metrics || {};
  const exams = Array.isArray(m.exams) ? m.exams : [];
  const omrResults = Array.isArray(m.omrResults) ? m.omrResults : [];

  const hasRichStudentMetrics = useMemo(() => {
    if (!isStudent || !digest?.metrics) return false;
    return (
      "loginCount" in digest.metrics ||
      "examAttempts" in digest.metrics ||
      "aiExplanations" in digest.metrics ||
      "topicsPractised" in digest.metrics
    );
  }, [digest, isStudent]);

  const hasRichTeacherMetrics = useMemo(() => {
    if (!isTeacher || !digest?.metrics) return false;
    return (
      "generationsCreated" in digest.metrics ||
      "status" in digest.metrics ||
      "loginCount" in digest.metrics ||
      digest.metrics.role === "teacher"
    );
  }, [digest, isTeacher]);

  const canDownload = Boolean(digest);

  const handleDownloadPdf = async () => {
    if (!digest || downloading) return;
    setDownloading(true);
    setDownloadDone(false);
    try {
      const filename = await downloadWeeklyReportPdf({
        title: digest.title,
        summary: digest.summary,
        highlights: digest.highlights || [],
        studentName: (isStudent ? studentName : teacherName) || undefined,
        schoolName: schoolName || undefined,
        role: isTeacher ? "teacher" : "student",
        metrics: (digest.metrics || {}) as Record<string, unknown>,
      });
      setDownloadDone(true);
      toast({
        title: "PDF ready",
        description: `${filename} saved to your downloads.`,
      });
      window.setTimeout(() => setDownloadDone(false), 2500);
    } catch (err) {
      console.error(err);
      toast({
        title: "Could not create PDF",
        description: "Please try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setDownloading(false);
    }
  };

  const previewStats = isTeacher
    ? teacherPreviewTiles(m as Record<string, unknown>)
    : studentPreviewTiles(m as Record<string, unknown>);
  const teacherActivity = teacherActivityTiles(m as Record<string, unknown>);
  const teacherAi = teacherAiTiles(m as Record<string, unknown>);
  const teacherSchool = teacherSchoolTiles(m as Record<string, unknown>);

  return (
    <Card className="border-sky-100 shadow-sm overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4 text-sky-600" />
            {isTeacher ? "Weekly teacher report" : "Weekly report"}
          </CardTitle>
          <div className="flex items-center gap-1">
            {canDownload ? (
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 border-sky-200 bg-sky-50/80 text-sky-800 hover:bg-sky-100 hover:text-sky-900"
                onClick={() => {
                  setPreviewOpen(true);
                  setDownloadDone(false);
                }}
                disabled={loading}
              >
                <Download className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Download PDF</span>
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" onClick={() => void load(true)} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading && !digest ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : !digest ? (
          <p className="text-sm text-slate-500">
            Your weekly digest will appear here every Monday. Tap refresh to build one for this week.
          </p>
        ) : hasRichTeacherMetrics ? (
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium text-slate-900">{digest.title}</p>
              <p className="text-xs text-slate-500">{digest.summary}</p>
            </div>

            <SectionTitle icon={LogIn} title="Your activity" />
            <div className="grid grid-cols-2 items-stretch gap-2 sm:grid-cols-3">
              {teacherActivity.map((tile) => (
                <MetricTile key={tile.label} label={tile.label} value={tile.value} hint={tile.hint} />
              ))}
            </div>

            <SectionTitle icon={Sparkles} title="Teaching with AI" />
            <div className="grid grid-cols-2 items-stretch gap-2 sm:grid-cols-3">
              {teacherAi.map((tile) => (
                <MetricTile key={tile.label} label={tile.label} value={tile.value} hint={tile.hint} />
              ))}
            </div>
            {(Array.isArray(m.toolsUsed) ? m.toolsUsed : []).length > 0 ? (
              <ul className="space-y-1.5 rounded-xl border border-slate-100 bg-white px-3 py-2">
                {(m.toolsUsed || []).slice(0, 8).map((tool, idx) => (
                  <li
                    key={`${tool.name}-${idx}`}
                    className="flex items-start justify-between gap-2 text-sm"
                  >
                    <span className="min-w-0 flex-1 text-slate-700">
                      <span className="font-medium line-clamp-1">{tool.name || "Tool"}</span>
                      {Array.isArray(tool.subjects) && tool.subjects.length > 0 ? (
                        <span className="block text-[11px] text-slate-500 line-clamp-1">
                          {tool.subjects.slice(0, 3).join(" · ")}
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums text-slate-900">
                      {n(tool.count)}×
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-500">No AI tools used this week yet.</p>
            )}

            <SectionTitle icon={Users} title="Your school this week" />
            <div className="grid grid-cols-2 items-stretch gap-2 sm:grid-cols-3">
              {teacherSchool.map((tile) => (
                <MetricTile key={tile.label} label={tile.label} value={tile.value} hint={tile.hint} />
              ))}
            </div>

            {(digest.highlights || []).length > 0 ? (
              <div className="rounded-xl bg-sky-50/80 border border-sky-100 px-3 py-2">
                <p className="text-xs font-bold text-sky-800 mb-1 flex items-center gap-1">
                  <Flame className="h-3.5 w-3.5" />
                  This week at a glance
                </p>
                <ul className="list-disc pl-4 text-sm text-slate-700 space-y-1">
                  {(digest.highlights || []).map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl border border-teal-100 bg-gradient-to-r from-sky-50 via-white to-teal-50 p-3"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4 text-teal-600" />
                    Save your week as a PDF
                  </p>
                  <p className="text-xs text-slate-500">
                    Keep a record of your teaching activity for this week.
                  </p>
                </div>
                <Button
                  size="sm"
                  className="shrink-0 bg-sky-600 hover:bg-sky-700 text-white"
                  onClick={() => {
                    setPreviewOpen(true);
                    setDownloadDone(false);
                  }}
                >
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                  Download PDF
                </Button>
              </div>
            </motion.div>
          </div>
        ) : hasRichStudentMetrics ? (
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium text-slate-900">{digest.title}</p>
              <p className="text-xs text-slate-500">{digest.summary}</p>
            </div>

            <SectionTitle icon={LogIn} title="Adoption" />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <MetricTile label="Logins this week" value={n(m.loginCount)} hint="Days you opened the app" />
              <MetricTile label="Last active" value={m.lastActiveDate || "—"} hint="Your most recent visit" />
              <MetricTile label="First activation" value={m.activationDate || "—"} hint="When you started learning" />
            </div>

            <SectionTitle icon={Clock} title="Engagement" />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <MetricTile label="Learning sessions" value={n(m.sessions)} hint="Times you started studying" />
              <MetricTile
                label="Total time"
                value={m.totalTimeLabel || `${n(m.minutes)} min`}
                hint="Time spent learning this week"
              />
              <MetricTile
                label="Avg session"
                value={n(m.avgSessionMinutes) > 0 ? `${n(m.avgSessionMinutes)} min` : "—"}
                hint="Typical length of a session"
              />
            </div>

            {!showAllMetrics ? (
              <div className="pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full rounded-xl border-sky-200 bg-sky-50/70 text-sky-800 hover:bg-sky-100"
                  onClick={() => setShowAllMetrics(true)}
                >
                  <ChevronDown className="mr-1.5 h-4 w-4" />
                  Load more
                </Button>
              </div>
            ) : (
              <>
            <SectionTitle icon={BookOpen} title="Learning behaviour" />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <MetricTile label="Topics practised" value={n(m.topicsPractised)} hint="Different topics you studied" />
              <MetricTile label="Repeated topics" value={n(m.topicsRepeated)} hint="Topics you revised again" />
              <MetricTile
                label="Repeat practice"
                value={`${n(m.repeatPracticePct)}%`}
                hint="Share of study spent revising"
              />
            </div>

            <SectionTitle icon={Brain} title="AI usage" />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <MetricTile
                label="AI uses"
                value={n(m.aiExplanations)}
                hint={`Vidya ${n(m.aiDoubts)} · Tools ${n(m.aiToolUses)}`}
              />
              <MetricTile
                label="Practice / quizzes"
                value={n(m.practiceAttempts) + n(m.iqAttempts)}
                hint="Practice sets & quizzes attempted"
              />
              <MetricTile
                label="Accuracy"
                value={n(m.practiceAttempts) > 0 ? `${n(m.practiceAccuracy)}%` : "—"}
                hint="Correct answers in practice"
              />
            </div>

            <SectionTitle icon={Sparkles} title="Tools you used" />
            {(Array.isArray(m.toolsUsed) ? m.toolsUsed : []).length > 0 ? (
              <ul className="space-y-1.5 rounded-xl border border-slate-100 bg-white px-3 py-2">
                {(m.toolsUsed || []).slice(0, 8).map((tool, idx) => (
                  <li
                    key={`${tool.name}-${idx}`}
                    className="flex items-start justify-between gap-2 text-sm"
                  >
                    <span className="min-w-0 flex-1 text-slate-700">
                      <span className="font-medium line-clamp-1">{tool.name || "Tool"}</span>
                      {Array.isArray(tool.subjects) && tool.subjects.length > 0 ? (
                        <span className="block text-[11px] text-slate-500 line-clamp-1">
                          {tool.subjects.slice(0, 3).join(" · ")}
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums text-slate-900">
                      {n(tool.count)}×
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-500">No AI tools used this week yet.</p>
            )}

            <SectionTitle icon={BookOpen} title="Subjects you used most" />
            {(Array.isArray(m.topSubjectsDetailed) ? m.topSubjectsDetailed : []).length > 0 ? (
              <ul className="space-y-1.5 rounded-xl border border-slate-100 bg-white px-3 py-2">
                {(m.topSubjectsDetailed || []).slice(0, 5).map((row, idx) => (
                  <li
                    key={`${row.subject}-${idx}`}
                    className="flex items-start justify-between gap-2 text-sm"
                  >
                    <span className="min-w-0 flex-1 text-slate-700 line-clamp-2">
                      {idx === 0 ? (
                        <span className="mr-1.5 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-700">
                          Most
                        </span>
                      ) : null}
                      {row.subject || "Subject"}
                    </span>
                    <span className="shrink-0 text-right font-semibold tabular-nums text-slate-900">
                      {n(row.sessions)}
                      {n(row.pct) > 0 ? (
                        <span className="block text-[10px] font-medium text-slate-500">{n(row.pct)}%</span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            ) : m.topSubjects?.length ? (
              <p className="text-sm text-slate-700">{m.topSubjects.slice(0, 5).join(", ")}</p>
            ) : (
              <p className="text-xs text-slate-500">No subject activity this week yet.</p>
            )}

            <SectionTitle icon={ClipboardList} title="Exams" />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <MetricTile label="Exams written" value={n(m.examAttempts)} hint="Exams you took this week" />
              <MetricTile
                label="Average score"
                value={n(m.examAttempts) > 0 ? formatMarksPair(m.examMarks?.avg) ?? `${n(m.avgExamPct)}%` : "—"}
                hint="Mean across all your exams"
              />
              <MetricTile
                label="Best score"
                value={n(m.examAttempts) > 0 ? formatMarksPair(m.examMarks?.best) ?? `${n(m.bestExamPct)}%` : "—"}
                hint="Your top exam result"
              />
            </div>
            {exams.length > 0 ? (
              <ul className="space-y-1.5 rounded-xl border border-slate-100 bg-white px-3 py-2">
                {exams.slice(0, 6).map((exam, idx) => (
                  <li
                    key={`${exam.title}-${idx}`}
                    className="flex items-start justify-between gap-2 text-sm"
                  >
                    <span className="min-w-0 flex-1 text-slate-700 line-clamp-2">{exam.title}</span>
                    <span className="shrink-0 font-semibold tabular-nums text-slate-900">
                      {formatMarks(exam.obtainedMarks ?? 0, exam.totalMarks) ?? `${n(exam.percentage)}%`}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-500">No exams written this week yet.</p>
            )}

            <SectionTitle icon={ScanLine} title="Offline Results" />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <MetricTile label="Offline Tests" value={n(m.omrAttempts)} hint="OMR tests scored this week" />
              <MetricTile
                label="Average score"
                value={n(m.omrAttempts) > 0 ? formatMarksPair(m.omrMarks?.avg) ?? `${n(m.omrAvgPct)}%` : "—"}
                hint="Mean across offline tests"
              />
              <MetricTile
                label="Best score"
                value={n(m.omrAttempts) > 0 ? formatMarksPair(m.omrMarks?.best) ?? `${n(m.omrBestPct)}%` : "—"}
                hint="Your top offline result"
              />
            </div>
            {n(m.omrBestRank) > 0 ? (
              <p className="text-xs text-slate-500">Best rank this week: #{n(m.omrBestRank)}</p>
            ) : null}
            {omrResults.length > 0 ? (
              <ul className="space-y-1.5 rounded-xl border border-slate-100 bg-white px-3 py-2">
                {omrResults.slice(0, 6).map((row, idx) => (
                  <li
                    key={`${row.title}-${idx}`}
                    className="flex items-start justify-between gap-2 text-sm"
                  >
                    <span className="min-w-0 flex-1 text-slate-700 line-clamp-2">
                      {row.title}
                      {row.rank != null && Number(row.rank) > 0 ? (
                        <span className="text-slate-400"> · Rank #{row.rank}</span>
                      ) : null}
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums text-slate-900">
                      {formatMarks(row.totalMarks, row.maxMarks) ?? `${n(row.percentage)}%`}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-500">No Offline Results Assigned This Week Yet.</p>
            )}

            <SectionTitle icon={Target} title="Content & progress" />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <MetricTile
                label="Most used subject"
                value={
                  m.mostUsedSubject?.subject ||
                  (m.topSubjects?.length ? m.topSubjects[0] : "—")
                }
                hint={
                  m.mostUsedSubject?.sessions
                    ? `${n(m.mostUsedSubject.sessions)} activities`
                    : undefined
                }
              />
              <MetricTile label="Videos watched" value={n(m.videosWatched)} hint="Lesson videos you viewed" />
              <MetricTile label="Chapters updated" value={n(m.chaptersCompleted)} hint="Chapters you progressed in" />
              <MetricTile
                label="Current streak"
                value={n(m.streak) > 0 ? `${n(m.streak)} days` : "0"}
                hint="Days in a row you studied"
              />
              <MetricTile label="Mastery" value={`${n(m.masteryPct)}%`} hint="How well you've grasped topics" />
              <MetricTile
                label="Homework submitted"
                value={n(m.homeworkSubmissions)}
                hint="Assignments you turned in"
              />
            </div>

            {(digest.highlights || []).length > 0 ? (
              <div className="rounded-xl bg-sky-50/80 border border-sky-100 px-3 py-2">
                <p className="text-xs font-bold text-sky-800 mb-1 flex items-center gap-1">
                  <Flame className="h-3.5 w-3.5" />
                  This week at a glance
                </p>
                <ul className="list-disc pl-4 text-sm text-slate-700 space-y-1">
                  {(digest.highlights || []).map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full text-slate-500"
              onClick={() => setShowAllMetrics(false)}
            >
              Show less
            </Button>
              </>
            )}

            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl border border-teal-100 bg-gradient-to-r from-sky-50 via-white to-teal-50 p-3"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4 text-teal-600" />
                    Save your week as a PDF
                  </p>
                  <p className="text-xs text-slate-500">
                    Share with parents or keep for your records — styled report with all sections.
                  </p>
                </div>
                <Button
                  size="sm"
                  className="shrink-0 bg-sky-600 hover:bg-sky-700 text-white"
                  onClick={() => {
                    setPreviewOpen(true);
                    setDownloadDone(false);
                  }}
                >
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                  Download PDF
                </Button>
              </div>
            </motion.div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-900">{digest.title}</p>
              <p className="text-xs text-slate-500">{digest.summary}</p>
              <ul className="list-disc pl-5 text-sm text-slate-700 space-y-1">
                {(digest.highlights || []).map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="border-sky-200 text-sky-800"
              onClick={() => {
                setPreviewOpen(true);
                setDownloadDone(false);
              }}
            >
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Download PDF
            </Button>
          </div>
        )}
      </CardContent>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-xl gap-0 overflow-hidden p-0 sm:rounded-2xl">
          <div className="relative overflow-hidden bg-gradient-to-br from-sky-500 via-sky-600 to-teal-700 px-5 pb-5 pt-6 text-white">
            <div
              aria-hidden
              className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-white/10"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -bottom-10 left-10 h-28 w-28 rounded-full bg-teal-300/20"
            />
            <DialogHeader className="relative space-y-1 text-left">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-sky-100">
                AsliLearn · Weekly report
              </p>
              <DialogTitle className="text-xl font-bold text-white leading-snug">
                {digest?.title || "Your weekly learning report"}
              </DialogTitle>
              <DialogDescription className="text-sky-50/90">
                {digest?.summary || "Preview your report, then download a polished PDF."}
              </DialogDescription>
            </DialogHeader>
            {(studentName || teacherName || schoolName) && (
              <div className="relative mt-3 flex flex-wrap gap-2">
                {(isStudent ? studentName : teacherName) ? (
                  <span className="rounded-full border border-white/25 bg-white/15 px-2.5 py-0.5 text-xs font-semibold">
                    {isStudent ? studentName : teacherName}
                  </span>
                ) : null}
                {schoolName ? (
                  <span className="rounded-full border border-white/25 bg-white/15 px-2.5 py-0.5 text-xs font-semibold">
                    {schoolName}
                  </span>
                ) : null}
              </div>
            )}
          </div>

          <div className="space-y-4 px-5 py-4">
            {hasRichStudentMetrics || hasRichTeacherMetrics ? (
              <div className="grid grid-cols-2 items-stretch gap-2 sm:grid-cols-4">
                {previewStats.map((stat) => (
                  <PreviewStatTile key={stat.label} label={stat.label} value={stat.value} />
                ))}
              </div>
            ) : (
              <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
                {(digest?.highlights || []).slice(0, 6).map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            )}

            {(digest?.highlights || []).length > 0 && hasRichStudentMetrics ? (
              <div className="rounded-xl border border-sky-100 bg-sky-50/70 px-3 py-2">
                <p className="mb-1 text-xs font-bold text-sky-800">Highlights in your PDF</p>
                <ul className="space-y-1 text-sm text-slate-700">
                  {(digest?.highlights || []).slice(0, 4).map((h) => (
                    <li key={h} className="flex gap-2">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" />
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <AnimatePresence mode="wait">
              {downloadDone ? (
                <motion.div
                  key="done"
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-900"
                >
                  <CheckCircle2 className="h-4 w-4 text-teal-600" />
                  PDF downloaded — check your Downloads folder.
                </motion.div>
              ) : downloading ? (
                <motion.div
                  key="busy"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-2"
                >
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <Loader2 className="h-4 w-4 animate-spin text-sky-600" />
                    Designing your report…
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-sky-500 to-teal-500"
                      initial={{ width: "8%" }}
                      animate={{ width: ["12%", "72%", "88%"] }}
                      transition={{ duration: 1.8, ease: "easeInOut", repeat: Infinity }}
                    />
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          <DialogFooter className="border-t border-slate-100 bg-slate-50/80 px-5 py-3 sm:justify-between">
            <Button variant="ghost" size="sm" onClick={() => setPreviewOpen(false)}>
              Close
            </Button>
            <Button
              size="sm"
              className={cn(
                "min-w-[140px] text-white",
                downloadDone ? "bg-teal-600 hover:bg-teal-700" : "bg-sky-600 hover:bg-sky-700",
              )}
              disabled={downloading || !digest}
              onClick={() => void handleDownloadPdf()}
            >
              {downloading ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Creating…
                </>
              ) : downloadDone ? (
                <>
                  <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                  Downloaded
                </>
              ) : (
                <>
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  Download PDF
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default WeeklyDigestCard;
