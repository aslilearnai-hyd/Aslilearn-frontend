import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getAuthToken } from "@/lib/auth-utils";
import { API_BASE_URL } from "@/lib/api-config";
import { ChevronDown, ChevronUp, Loader2, Search } from "lucide-react";

type ToolUse = { tool: string; uses: number; subjects: { subject: string; uses: number }[] };
type Person = {
  id: string;
  role: "student" | "teacher";
  name: string;
  email: string;
  classNumber?: string;
  lastLogin: string | null;
  active: boolean;
  minutes: number;
  timeLabel: string;
  sessions: number;
  activeDays: number;
  aiToolUses: number;
  tools: ToolUse[];
  topTool: string;
  topSubject: string;
  vidyaQuestions: number;
  practiceQuestions?: number;
  videoMinutes?: number;
  videosWatched?: number;
  contentOpens?: number;
  chaptersCompleted?: number;
  examAttempts?: number;
  avgExamPct?: number | null;
  homeworkSubmitted?: number;
  plan?: "paid" | "trial" | "exceeded";
  joinedAt?: string | null;
  trialEndsAt?: string | null;
  paidAmount?: number;
  phone?: string;
};
type Summary = {
  total: number;
  active: number;
  inactive: number;
  activePct: number;
  totalTimeLabel: string;
  avgMinutesPerActive: number;
  aiToolUses: number;
  vidyaQuestions: number;
  chaptersCompleted: number;
  videoMinutes: number;
  videoTimeLabel: string;
  videosWatched: number;
  contentOpens: number;
  examAttempts: number;
  homeworkSubmitted: number;
  topTools: { tool: string; uses: number; users: number; topSubjects: { subject: string; uses: number }[] }[];
  topSubjects: { subject: string; uses: number }[];
};
type PlanStats = { total: number; active: number; inactive: number; totalTimeLabel: string; aiToolUses: number; revenueInr: number };
type Analysis = {
  scope: "school" | "individual";
  school?: { name: string };
  window: { days: number };
  plans?: { students: Record<string, PlanStats>; teachers: Record<string, PlanStats> };
  students: { summary: Summary; people: Person[] };
  teachers: { summary: Summary; people: Person[] };
  notes?: string[];
};

const PLAN_LABEL: Record<string, string> = { paid: "Paid", trial: "On trial", exceeded: "Trial exceeded" };
const PLAN_CLASS: Record<string, string> = {
  paid: "bg-teal-600 text-white",
  trial: "bg-sky-500 text-white",
  exceeded: "bg-amber-500 text-white",
};

function formatDate(value?: string | null) {
  if (!value) return "Never";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function Tile({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-900">{value}</p>
      {hint ? <p className="text-[11px] text-slate-500">{hint}</p> : null}
    </div>
  );
}

/**
 * Who uses the platform and how: students and teachers separately, active vs
 * inactive, time, AI tools by subject, Vidya, chapters, exams. For individual
 * (B2C) accounts it also splits paid / on trial / trial exceeded.
 */
export default function UsageAnalysisPanel({ scope, adminId }: { scope: "school" | "individual"; adminId?: string }) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [role, setRole] = useState<"students" | "teachers">("students");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [plan, setPlan] = useState<"all" | "paid" | "trial" | "exceeded">("all");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ scope, days: String(days) });
    if (adminId) params.set("adminId", adminId);
    fetch(`${API_BASE_URL}/api/super-admin/usage-analysis?${params}`, {
      headers: { Authorization: `Bearer ${getAuthToken()}`, "Content-Type": "application/json" },
    })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok || body?.success === false) throw new Error(body?.message || `Request failed (${res.status})`);
        if (!cancelled) setData(body.data);
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [scope, adminId, days]);

  const group = data?.[role];
  const people = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (group?.people || []).filter(
      (p) =>
        (status === "all" || (status === "active") === p.active) &&
        (plan === "all" || p.plan === plan) &&
        (!q || p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q)),
    );
  }, [group, status, plan, search]);

  const s = group?.summary;
  const isStudents = role === "students";
  const planStats = data?.plans?.[role];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1">
          {(["students", "teachers"] as const).map((r) => (
            <Button key={r} size="sm" variant={role === r ? "default" : "outline"} onClick={() => setRole(r)}>
              {r === "students" ? "Students" : "Teachers"}
              {data ? ` (${data[r].summary.total})` : ""}
            </Button>
          ))}
        </div>
        <div className="flex gap-1">
          {[7, 30, 90].map((d) => (
            <Button key={d} size="sm" variant={days === d ? "default" : "outline"} className="h-8 px-2.5 text-xs" onClick={() => setDays(d)}>
              {d} days
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading usage…
        </div>
      ) : error ? (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>
      ) : s ? (
        <>
          {planStats ? (
            <div className="grid gap-2 sm:grid-cols-3">
              {(["paid", "trial", "exceeded"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setPlan(plan === k ? "all" : k)}
                  className={`rounded-lg border p-3 text-left transition ${plan === k ? "border-orange-400 ring-1 ring-orange-300" : "border-slate-200"} bg-white`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-900">{PLAN_LABEL[k]}</span>
                    <span className="text-lg font-semibold">{planStats[k].total}</span>
                  </div>
                  <p className="text-xs text-slate-600">
                    {planStats[k].active} active · {planStats[k].inactive} inactive · {planStats[k].totalTimeLabel}
                  </p>
                  <p className="text-xs text-slate-500">
                    {planStats[k].aiToolUses} AI tool uses{k === "paid" ? ` · ₹${planStats[k].revenueInr.toLocaleString()} recorded` : ""}
                  </p>
                </button>
              ))}
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Tile label="Active" value={`${s.active} / ${s.total}`} hint={`${s.activePct}% · ${s.inactive} inactive`} />
            <Tile label="Time on platform" value={s.totalTimeLabel} hint={`avg ${s.avgMinutesPerActive} min per active user`} />
            <Tile label="AI tool uses" value={s.aiToolUses} hint={`${s.vidyaQuestions} Vidya questions`} />
            <Tile
              label="Video watch time"
              value={s.videoTimeLabel}
              hint={
                isStudents
                  ? `${s.videosWatched} videos · ${s.chaptersCompleted} chapters · ${s.contentOpens} content opens`
                  : `${s.videosWatched} videos`
              }
            />
            {isStudents ? (
              <>
                <Tile label="Exam attempts" value={s.examAttempts} />
                <Tile label="Homework submitted" value={s.homeworkSubmitted} />
              </>
            ) : null}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardContent className="p-4">
                <p className="mb-2 font-semibold text-slate-900">Most used AI tools</p>
                {s.topTools.length ? (
                  <ul className="space-y-2 text-sm">
                    {s.topTools.map((t) => (
                      <li key={t.tool} className="flex items-start justify-between gap-2">
                        <span>
                          <span className="font-medium text-slate-800">{t.tool}</span>
                          <span className="block text-xs text-slate-500">
                            {t.topSubjects.map((x) => `${x.subject} (${x.uses})`).join(", ")}
                          </span>
                        </span>
                        <span className="shrink-0 text-right text-xs text-slate-600">
                          <b className="text-sm text-slate-800">{t.uses}</b> uses
                          <br />
                          {t.users} {isStudents ? "students" : "teachers"}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-500">No AI tool use in this period.</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="mb-2 font-semibold text-slate-900">Most used subjects</p>
                {s.topSubjects.length ? (
                  <ul className="space-y-2 text-sm">
                    {s.topSubjects.map((x) => {
                      const max = s.topSubjects[0]?.uses || 1;
                      return (
                        <li key={x.subject}>
                          <div className="flex justify-between">
                            <span className="text-slate-800">{x.subject}</span>
                            <span className="text-xs text-slate-500">{x.uses}</span>
                          </div>
                          <div className="mt-1 h-1.5 rounded-full bg-slate-100">
                            <div className="h-1.5 rounded-full bg-orange-400" style={{ width: `${(x.uses / max) * 100}%` }} />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-500">No subject activity in this period.</p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="space-y-3 p-3 sm:p-4">
              <div className="flex flex-wrap items-center gap-2">
                {(["all", "active", "inactive"] as const).map((k) => (
                  <Button key={k} size="sm" variant={status === k ? "default" : "outline"} className="h-8 text-xs" onClick={() => setStatus(k)}>
                    {k === "all" ? `All (${s.total})` : k === "active" ? `Active (${s.active})` : `Inactive (${s.inactive})`}
                  </Button>
                ))}
                <div className="relative min-w-[180px] flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or email" className="h-8 pl-9" />
                </div>
              </div>
              <ul className="divide-y divide-slate-100">
                {people.slice(0, 300).map((p) => (
                  <li key={p.id} className="py-2">
                    <button type="button" className="w-full text-left" onClick={() => setOpenId(openId === p.id ? null : p.id)}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className={`h-2 w-2 shrink-0 rounded-full ${p.active ? "bg-teal-500" : "bg-slate-300"}`} />
                          <span className="truncate font-medium text-slate-900">{p.name}</span>
                          {p.plan ? <Badge className={`shrink-0 text-[10px] ${PLAN_CLASS[p.plan]}`}>{PLAN_LABEL[p.plan]}</Badge> : null}
                        </span>
                        <span className="flex shrink-0 items-center gap-1 text-xs text-slate-600">
                          {p.timeLabel}
                          {openId === p.id ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </span>
                      </div>
                      <p className="truncate pl-4 text-xs text-slate-500">
                        {[
                          p.classNumber ? `Class ${p.classNumber}` : "",
                          `last login ${formatDate(p.lastLogin)}`,
                          p.aiToolUses ? `${p.aiToolUses} AI uses` : "",
                          p.videoMinutes ? `${p.videoMinutes} min video` : "",
                          p.topTool ? `top: ${p.topTool}` : "",
                          p.topSubject ? p.topSubject : "",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </button>
                    {openId === p.id ? (
                      <div className="mt-2 space-y-2 rounded-md bg-slate-50 p-3 text-xs text-slate-700">
                        <p>
                          {p.email}
                          {p.phone ? ` · ${p.phone}` : ""}
                          {p.joinedAt ? ` · joined ${formatDate(p.joinedAt)}` : ""}
                          {p.trialEndsAt ? ` · trial ends ${formatDate(p.trialEndsAt)}` : ""}
                          {p.paidAmount ? ` · paid ₹${p.paidAmount}` : ""}
                        </p>
                        <p>
                          {p.sessions} sessions over {p.activeDays} days · {p.vidyaQuestions} Vidya questions ·{" "}
                          {p.videoMinutes || 0} min video ({p.videosWatched || 0} videos)
                          {p.role === "student"
                            ? ` · ${p.chaptersCompleted || 0} chapters · ${p.practiceQuestions || 0} practice questions · ${p.examAttempts || 0} exams${
                                p.avgExamPct != null ? ` (avg ${p.avgExamPct}%)` : ""
                              } · ${p.homeworkSubmitted || 0} homework`
                            : ""}
                        </p>
                        {p.tools.length ? (
                          <ul className="space-y-0.5">
                            {p.tools.map((t) => (
                              <li key={t.tool}>
                                <b>{t.tool}</b> — {t.uses}× ({t.subjects.map((x) => x.subject).join(", ")})
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p>No AI tool use in this period.</p>
                        )}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
              {!people.length ? <p className="py-4 text-center text-sm text-slate-500">Nobody matches these filters.</p> : null}
              {people.length > 300 ? <p className="text-center text-xs text-slate-500">Showing 300 of {people.length}. Use search to narrow.</p> : null}
            </CardContent>
          </Card>

          {data?.notes?.map((n) => (
            <p key={n} className="text-xs text-slate-500">
              {n}
            </p>
          ))}
        </>
      ) : null}
    </div>
  );
}
