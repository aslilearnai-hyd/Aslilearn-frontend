import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getAuthToken } from "@/lib/auth-utils";
import { API_BASE_URL } from "@/lib/api-config";
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, Search } from "lucide-react";

type StudentRow = {
  id: string;
  fullName: string;
  email: string;
  classNumber: string;
  section: string;
  schoolName: string;
  isActive: boolean;
  lastLogin: string | null;
};

type ToolUse = { name: string; count: number; subjects?: string[] };
type SubjectUse = { subject: string; sessions: number; pct?: number };
type ExamRow = { title: string; obtainedMarks?: number; totalMarks?: number; percentage?: number; completedAt?: string | null };

type Activity = {
  loginDays: number;
  lastActiveDate: string | null;
  lifetimeLoginDays: number;
  sessions: number;
  minutes: number;
  totalTimeLabel: string;
  avgSessionMinutes: number;
  daysActive: number;
  topicsPractised: number;
  aiDoubts: number;
  aiToolUses: number;
  toolsUsed: ToolUse[];
  practiceAttempts: number;
  practiceCorrect: number;
  iqAttempts: number;
  homeworkSubmissions: number;
  topSubjectsDetailed: SubjectUse[];
  videosWatched: number;
  chaptersCompleted: number;
  streak: number;
  examAttempts: number;
  exams: ExamRow[];
  omrAttempts: number;
};

type Detail = {
  profile: {
    id: string;
    fullName: string;
    email: string;
    classNumber: string;
    section: string;
    board: string;
    schoolName: string;
    isActive: boolean;
    lastLogin: string | null;
    joinedAt: string | null;
  };
  window: { days: number };
  activity: Activity;
};

const DAY_OPTIONS = [7, 30, 90, 365];

async function getJson(path: string) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${getAuthToken()}`, "Content-Type": "application/json" },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.success === false) throw new Error(body?.message || `Request failed (${res.status})`);
  return body;
}

function formatDate(value?: string | null) {
  if (!value) return "Never";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function classLabel(s: { classNumber?: string; section?: string }) {
  return s.classNumber ? `Class ${s.classNumber}${s.section ? ` ${s.section}` : ""}` : "";
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-900">{value}</p>
      {hint ? <p className="text-[11px] text-slate-500">{hint}</p> : null}
    </div>
  );
}

/** Super admin: find any student and see what they do on the platform. */
export default function StudentDetailsPanel() {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState("");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    setListLoading(true);
    setListError("");
    const params = new URLSearchParams({ page: String(page), limit: "25" });
    if (query) params.set("search", query);
    getJson(`/api/super-admin/students?${params}`)
      .then((body) => {
        if (cancelled) return;
        setRows(body.data || []);
        setPages(body.pagination?.pages || 1);
        setTotal(body.pagination?.total || 0);
      })
      .catch((err) => !cancelled && setListError(err.message))
      .finally(() => !cancelled && setListLoading(false));
    return () => {
      cancelled = true;
    };
  }, [query, page]);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setDetailLoading(true);
    setDetailError("");
    getJson(`/api/super-admin/students/${selectedId}/activity?days=${days}`)
      .then((body) => !cancelled && setDetail(body.data))
      .catch((err) => !cancelled && setDetailError(err.message))
      .finally(() => !cancelled && setDetailLoading(false));
    return () => {
      cancelled = true;
    };
  }, [selectedId, days]);

  const list = (
    <Card className={selectedId ? "hidden lg:block" : ""}>
      <CardContent className="space-y-3 p-3 sm:p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email or school"
            className="pl-9"
          />
        </div>
        <p className="text-xs text-slate-500">{listLoading ? "Loading…" : `${total.toLocaleString()} students`}</p>
        {listError ? <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">{listError}</p> : null}
        <ul className="divide-y divide-slate-100">
          {rows.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => setSelectedId(s.id)}
                className={`w-full rounded-md px-2 py-2.5 text-left transition hover:bg-orange-50 ${
                  selectedId === s.id ? "bg-orange-50 ring-1 ring-orange-200" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium text-slate-900">{s.fullName}</span>
                  {!s.isActive ? <Badge variant="outline" className="shrink-0 text-[10px]">Inactive</Badge> : null}
                </div>
                <p className="truncate text-xs text-slate-500">
                  {[classLabel(s), s.schoolName].filter(Boolean).join(" · ") || s.email}
                </p>
                <p className="text-[11px] text-slate-400">Last login: {formatDate(s.lastLogin)}</p>
              </button>
            </li>
          ))}
        </ul>
        {!listLoading && !rows.length && !listError ? (
          <p className="py-6 text-center text-sm text-slate-500">No students match.</p>
        ) : null}
        {pages > 1 ? (
          <div className="flex items-center justify-between pt-1">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs text-slate-500">
              Page {page} of {pages}
            </span>
            <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );

  const a = detail?.activity;
  const detailView = selectedId ? (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" className="lg:hidden" onClick={() => setSelectedId(null)}>
          <ArrowLeft className="mr-1 h-4 w-4" /> All students
        </Button>
        <div className="flex gap-1">
          {DAY_OPTIONS.map((d) => (
            <Button
              key={d}
              size="sm"
              variant={days === d ? "default" : "outline"}
              className="h-8 px-2.5 text-xs"
              onClick={() => setDays(d)}
            >
              {d === 365 ? "1 year" : `${d} days`}
            </Button>
          ))}
        </div>
      </div>

      {detailLoading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading activity…
        </div>
      ) : detailError ? (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{detailError}</p>
      ) : detail && a ? (
        <>
          <Card>
            <CardContent className="space-y-1 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-semibold text-slate-900">{detail.profile.fullName}</h3>
                <Badge className={detail.profile.isActive ? "bg-teal-600 text-white" : "bg-slate-500 text-white"}>
                  {detail.profile.isActive ? "Active" : "Inactive"}
                </Badge>
              </div>
              <p className="text-sm text-slate-600">
                {[classLabel(detail.profile), detail.profile.board, detail.profile.schoolName].filter(Boolean).join(" · ")}
              </p>
              <p className="text-xs text-slate-500">
                {detail.profile.email} · Joined {formatDate(detail.profile.joinedAt)} · Last login{" "}
                {formatDate(detail.profile.lastLogin)}
              </p>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Study time" value={a.totalTimeLabel} hint={`${a.sessions} sessions · avg ${a.avgSessionMinutes} min`} />
            <Stat label="Active days" value={a.daysActive} hint={`${a.lifetimeLoginDays} days all-time`} />
            <Stat label="Videos watched" value={a.videosWatched} hint={`${a.chaptersCompleted} chapters completed`} />
            <Stat label="Study streak" value={`${a.streak} days`} />
            <Stat label="AI tool uses" value={a.aiToolUses} />
            <Stat label="Vidya questions" value={a.aiDoubts} />
            <Stat
              label="Practice questions"
              value={a.practiceAttempts}
              hint={a.practiceAttempts ? `${a.practiceCorrect} correct · ${a.topicsPractised} topics` : undefined}
            />
            <Stat label="Homework submitted" value={a.homeworkSubmissions} hint={a.iqAttempts ? `${a.iqAttempts} IQ quizzes` : undefined} />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardContent className="p-4">
                <p className="mb-2 font-semibold text-slate-900">Tools used</p>
                {a.toolsUsed.length ? (
                  <ul className="space-y-2">
                    {a.toolsUsed.map((t) => (
                      <li key={t.name} className="flex items-start justify-between gap-2 text-sm">
                        <span>
                          <span className="font-medium text-slate-800">{t.name}</span>
                          {t.subjects?.length ? <span className="block text-xs text-slate-500">{t.subjects.join(", ")}</span> : null}
                        </span>
                        <span className="shrink-0 font-semibold text-slate-700">{t.count}×</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-500">No tool use in this period.</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="mb-2 font-semibold text-slate-900">Subjects used</p>
                {a.topSubjectsDetailed.length ? (
                  <ul className="space-y-2">
                    {a.topSubjectsDetailed.map((s) => (
                      <li key={s.subject} className="text-sm">
                        <div className="flex justify-between">
                          <span className="text-slate-800">{s.subject}</span>
                          <span className="text-xs text-slate-500">{s.pct ?? 0}%</span>
                        </div>
                        <div className="mt-1 h-1.5 rounded-full bg-slate-100">
                          <div className="h-1.5 rounded-full bg-orange-400" style={{ width: `${Math.min(100, s.pct ?? 0)}%` }} />
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-500">No subject activity in this period.</p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="p-4">
              <p className="mb-2 font-semibold text-slate-900">
                Exams ({a.examAttempts}){a.omrAttempts ? ` · OMR tests ${a.omrAttempts}` : ""}
              </p>
              {a.exams.length ? (
                <ul className="divide-y divide-slate-100 text-sm">
                  {a.exams.map((e, i) => (
                    <li key={`${e.title}-${i}`} className="flex justify-between gap-2 py-1.5">
                      <span className="truncate text-slate-800">{e.title}</span>
                      <span className="shrink-0 text-slate-600">
                        {Number(e.totalMarks) > 0 ? `${e.obtainedMarks ?? 0}/${e.totalMarks}` : `${e.percentage ?? 0}%`}
                        <span className="ml-2 text-xs text-slate-400">{formatDate(e.completedAt)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">No exams in this period.</p>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  ) : (
    <Card className="hidden lg:block">
      <CardContent className="py-16 text-center text-sm text-slate-500">
        Select a student to see their time, tools, subjects, videos and exams.
      </CardContent>
    </Card>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(260px,340px)_1fr]">
      {list}
      {detailView}
    </div>
  );
}
