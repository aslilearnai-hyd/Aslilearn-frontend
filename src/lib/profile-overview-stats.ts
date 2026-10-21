/** Local calendar date YYYY-MM-DD */
export function toLocalDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getExamIdFromResult(result: any): string | null {
  const raw = result?.examId ?? result?.exam?._id ?? result?.exam;
  if (raw == null || String(raw).trim() === '') return null;
  return String(raw);
}

export type WeeklyDayStat = {
  day: string;
  hours: number;
  completed: boolean;
  dateKey: string;
};

export type ProfileOverviewStats = {
  streak: number;
  questionsAnswered: number;
  accuracyRate: number;
  rank: number;
};

const WEEK_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

/** Monday → Sunday of the current calendar week (local time). */
export function buildWeeklyActivityStats(
  examResults: any[],
  progressRecords: any[] = [],
  /** Logged-in minutes per day (YYYY-MM-DD) from /api/student/session-time. */
  sessionMinutesByDate: Record<string, number> = {}
): WeeklyDayStat[] {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(now.getDate() + mondayOffset);

  const secondsByDate = new Map<string, number>();

  for (const result of examResults) {
    if (!result?.completedAt) continue;
    const key = toLocalDateKey(new Date(result.completedAt));
    const prev = secondsByDate.get(key) || 0;
    secondsByDate.set(key, prev + (Number(result.timeTaken) || 0));
  }

  for (const row of progressRecords) {
    if (!row?.lastAccessed) continue;
    const key = toLocalDateKey(new Date(row.lastAccessed));
    const prev = secondsByDate.get(key) || 0;
    secondsByDate.set(key, prev + (Number(row.timeSpent) || 0));
  }

  return WEEK_LABELS.map((label, index) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + index);
    const dateKey = toLocalDateKey(d);
    // A student who studies without finishing an exam still shows their time:
    // take whichever is larger, study activity or time logged in that day.
    const seconds = Math.max(secondsByDate.get(dateKey) || 0, (Number(sessionMinutesByDate[dateKey]) || 0) * 60);
    const hours = Math.round((seconds / 3600) * 10) / 10;
    return {
      day: label,
      hours,
      completed: hours > 0,
      dateKey,
    };
  });
}

export function computeProfileOverviewStats(
  examResults: any[],
  rankings: any[],
  streakCount: number
): ProfileOverviewStats {
  let questionsAnswered = 0;
  let correct = 0;
  let attempted = 0;

  for (const r of examResults) {
    const correctN = Number(r.correctAnswers) || 0;
    const wrongN = Number(r.wrongAnswers) || 0;
    const unattempted = Number(r.unattempted) || 0;
    const totalQ = Number(r.totalQuestions) || correctN + wrongN + unattempted;

    questionsAnswered += totalQ > 0 ? totalQ : correctN + wrongN;
    correct += correctN;
    attempted += correctN + wrongN;
  }

  const accuracyRate =
    attempted > 0 ? Math.round((correct / attempted) * 1000) / 10 : 0;

  const rankValues = rankings
    .map((r) => Number(r.rank))
    .filter((n) => Number.isFinite(n) && n > 0);
  const rank =
    rankValues.length > 0
      ? Math.round(rankValues.reduce((a, b) => a + b, 0) / rankValues.length)
      : 0;

  return {
    streak: Math.max(0, Number(streakCount) || 0),
    questionsAnswered,
    accuracyRate,
    rank,
  };
}
