export type QuestionAnalyticsRow = {
  questionId?: string;
  index?: number;
  subject?: string;
  chapter?: string;
  difficulty?: string;
  questionType?: string;
  timeTaken?: number;
  status?: 'correct' | 'wrong' | 'not_answered';
  isCorrect?: boolean;
  isAnswered?: boolean;
};

export type QuestionSnapshotRow = {
  _id?: string;
  questionText?: string;
  assertionText?: string;
  subject?: string;
  chapter?: string;
  questionType?: string;
  difficulty?: string;
};

export type SchoolAnalysisExamResult = {
  _id?: string;
  examId?: string | { _id?: string };
  userId: {
    _id?: string;
    fullName?: string;
    email?: string;
    classNumber?: string;
  };
  totalQuestions?: number;
  correctAnswers?: number;
  wrongAnswers?: number;
  unattempted?: number;
  obtainedMarks?: number;
  totalMarks?: number;
  percentage?: number;
  timeTaken?: number;
  attemptNumber?: number;
  completedAt?: string;
  subjectWiseScore?: Record<string, { correct?: number; total?: number; marks?: number }>;
  questionAnalytics?: QuestionAnalyticsRow[];
  questionSnapshot?: QuestionSnapshotRow[];
};

function studentKeyFromResult(result: SchoolAnalysisExamResult): string {
  return String(result.userId?._id || result.userId?.email || result.userId?.fullName || '').trim();
}

function examKeyFromResult(result: SchoolAnalysisExamResult): string {
  const raw = result.examId;
  if (raw && typeof raw === 'object' && raw._id != null) return String(raw._id);
  return String(raw || '').trim();
}

/**
 * Assign Attempt 1/2/3 chronologically per student (+ exam).
 * If stored attemptNumbers are already unique and complete, keep them; otherwise recompute.
 */
export function enrichExamResultsWithAttempts<T extends SchoolAnalysisExamResult>(rows: T[]): T[] {
  if (!Array.isArray(rows) || rows.length === 0) return rows;

  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = `${studentKeyFromResult(row)}::${examKeyFromResult(row)}`;
    const list = groups.get(key) || [];
    list.push(row);
    groups.set(key, list);
  }

  const enriched: T[] = [];
  for (const list of groups.values()) {
    const sorted = [...list].sort(
      (a, b) =>
        new Date(a.completedAt || 0).getTime() - new Date(b.completedAt || 0).getTime() ||
        String(a._id || '').localeCompare(String(b._id || '')),
    );
    const storedNums = sorted.map((r) => Number(r.attemptNumber)).filter((n) => n >= 1);
    const useStored =
      storedNums.length === sorted.length && new Set(storedNums).size === sorted.length;

    sorted.forEach((row, idx) => {
      enriched.push({
        ...row,
        attemptNumber: useStored ? Number(row.attemptNumber) : idx + 1,
      });
    });
  }

  return enriched;
}

/** Keep every attempt; only remove exact duplicate rows from the API. */
export function prepareResultsForAnalysisExport(
  results: SchoolAnalysisExamResult[],
): SchoolAnalysisExamResult[] {
  const seen = new Set<string>();
  const out: SchoolAnalysisExamResult[] = [];

  for (const raw of enrichExamResultsWithAttempts(results)) {
    const normalized = normalizeResultCounts(raw);
    const resultId = String(normalized._id || '').trim();
    const studentId = studentKeyFromResult(normalized);
    const attempt = Number(normalized.attemptNumber) >= 1 ? Number(normalized.attemptNumber) : 1;
    const completedAt = String(normalized.completedAt || '');

    const key =
      resultId ||
      `${studentId}::${attempt}::${completedAt}` ||
      `${studentId}::${attempt}::${out.length}`;

    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }

  return out.sort(
    (a, b) => new Date(b.completedAt || 0).getTime() - new Date(a.completedAt || 0).getTime(),
  );
}

export function countUniqueStudents(results: SchoolAnalysisExamResult[]): number {
  const ids = new Set<string>();
  for (const result of results) {
    const id = String(
      result.userId?._id || result.userId?.email || result.userId?.fullName || '',
    ).trim();
    if (id) ids.add(id);
  }
  return ids.size;
}

/** Keep correct + wrong + left aligned with total question count. */
function normalizeResultCounts(result: SchoolAnalysisExamResult): SchoolAnalysisExamResult {
  const correct = Math.max(0, toNum(result.correctAnswers, 0));
  const wrong = Math.max(0, toNum(result.wrongAnswers, 0));
  const left = Math.max(0, toNum(result.unattempted, 0));
  const explicitTotal = toNum(result.totalQuestions, 0);
  const derivedTotal = correct + wrong + left;
  const total = explicitTotal > 0 ? explicitTotal : derivedTotal;

  if (derivedTotal > 0 && total !== derivedTotal) {
    const scale = total / derivedTotal;
    return {
      ...result,
      totalQuestions: total,
      correctAnswers: Math.round(correct * scale),
      wrongAnswers: Math.round(wrong * scale),
      unattempted: Math.max(0, total - Math.round(correct * scale) - Math.round(wrong * scale)),
    };
  }

  return {
    ...result,
    totalQuestions: total,
    correctAnswers: correct,
    wrongAnswers: wrong,
    unattempted: left || Math.max(0, total - correct - wrong),
  };
}

export const DIFFICULTY_BUCKETS = ['easy', 'moderate', 'difficult', 'highly_difficult'] as const;
export type DifficultyBucket = (typeof DIFFICULTY_BUCKETS)[number];

const SUBJECT_ORDER = ['maths', 'physics', 'chemistry', 'biology'] as const;

export const SUBJECT_DISPLAY: Record<string, string> = {
  maths: 'Mathematics',
  math: 'Mathematics',
  mathematics: 'Mathematics',
  physics: 'Physics',
  chemistry: 'Chemistry',
  biology: 'Biology',
  bio: 'Biology',
};

export const SUBJECT_SHORT: Record<string, string> = {
  maths: 'Math',
  math: 'Math',
  mathematics: 'Math',
  physics: 'Physics',
  chemistry: 'Chem',
  biology: 'Bio',
  bio: 'Bio',
};

export const COMPLEXITY_DISPLAY: Record<DifficultyBucket, string> = {
  easy: 'Easy',
  moderate: 'Medium',
  difficult: 'Hard',
  highly_difficult: 'Very Hard',
};

export type SubjectAgg = {
  total: number;
  correct: number;
  wrong: number;
  left: number;
  totalTime: number;
  easy: number;
  moderate: number;
  difficult: number;
  highly_difficult: number;
  numerical: number;
  formula: number;
  chapters: Map<string, { correct: number; total: number }>;
};

export type RankedStudent = {
  rank: number;
  name: string;
  classNumber: string;
  attemptNumber: number;
  attemptLabel: string;
  completedAt: string;
  total: number;
  correct: number;
  wrong: number;
  left: number;
  accuracy: number;
  accuracyLabel: string;
  avgTime: string;
  subjectAcc: Map<string, number>;
  topSubject: string;
  performance: string;
};

export type SchoolPerformanceReport = {
  examTitle: string;
  studentCount: number;
  totalAttempts: number;
  subjects: string[];
  subjectLabels: string[];
  attemptNote: string;
  overall: SubjectAgg & { avgQPerStudent: number; avgQPerAttempt: number };
  bySubject: Map<string, SubjectAgg>;
  byDifficulty: Map<DifficultyBucket, SubjectAgg>;
  hasQuestionAnalytics: boolean;
  rankedStudents: RankedStudent[];
};

export const emptyAgg = (): SubjectAgg => ({
  total: 0,
  correct: 0,
  wrong: 0,
  left: 0,
  totalTime: 0,
  easy: 0,
  moderate: 0,
  difficult: 0,
  highly_difficult: 0,
  numerical: 0,
  formula: 0,
  chapters: new Map<string, { correct: number; total: number }>(),
});

export const toNum = (value: unknown, fallback = 0): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

export const formatPct = (num: number, den: number): string =>
  den > 0 ? `${((num / den) * 100).toFixed(1)}%` : '0.0%';

export const formatAvgTime = (totalTime: number, count: number): string =>
  count > 0 ? `${(totalTime / count).toFixed(1)}s` : '0.0s';

export const formatCompletedAtLabel = (value?: string): string => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const formatAttemptLabel = (attemptNumber?: number): string => {
  const n = Number(attemptNumber);
  if (!Number.isFinite(n) || n < 1) return 'Attempt 1';
  return `Attempt ${Math.round(n)}`;
};

export const normalizeClassNumberForDisplay = (value: unknown): string => {
  const raw = String(value ?? '').trim();
  if (!raw) return '—';
  return raw
    .replace(/^class\s*-\s*(\d+)/i, 'Class $1')
    .replace(/^-([0-9]+)([A-Za-z]?)$/, '$1$2');
};

export const normalizeSubjectKey = (raw: string): string => {
  const key = String(raw || '').trim().toLowerCase();
  if (!key) return 'unknown';
  if (key.includes('math')) return 'maths';
  if (key.includes('phys')) return 'physics';
  if (key.includes('chem')) return 'chemistry';
  if (key.includes('bio')) return 'biology';
  return key;
};

export const normalizeDifficulty = (raw: string): DifficultyBucket => {
  const t = String(raw || '').trim().toLowerCase();
  if ((DIFFICULTY_BUCKETS as readonly string[]).includes(t)) return t as DifficultyBucket;
  if (t.includes('very') && (t.includes('hard') || t.includes('difficult'))) return 'highly_difficult';
  if (t.includes('highly')) return 'highly_difficult';
  if (t === 'medium' || t.includes('moderate')) return 'moderate';
  if (t === 'easy' || t.includes('easy')) return 'easy';
  if (t === 'hard' || t.includes('difficult')) return 'difficult';
  return 'moderate';
};

export const displaySubject = (key: string): string =>
  SUBJECT_DISPLAY[key] || key.charAt(0).toUpperCase() + key.slice(1);

export const shortSubject = (key: string): string =>
  SUBJECT_SHORT[key] || displaySubject(key).slice(0, 6);

export const performanceLabel = (accuracyPct: number): string => {
  if (accuracyPct >= 70) return 'Excellent';
  if (accuracyPct >= 55) return 'Good';
  if (accuracyPct >= 40) return 'Average';
  return 'Needs Improvement';
};

const bumpQuestion = (
  agg: SubjectAgg,
  row: {
    status: 'correct' | 'wrong' | 'not_answered';
    difficulty: DifficultyBucket;
    questionType: string;
    chapter: string;
    timeTaken: number;
  },
) => {
  agg.total += 1;
  if (row.status === 'correct') agg.correct += 1;
  else if (row.status === 'wrong') agg.wrong += 1;
  else agg.left += 1;
  agg.totalTime += row.timeTaken;
  agg[row.difficulty] += 1;

  const qt = String(row.questionType || '').toLowerCase();
  if (qt.includes('numerical') || qt.includes('integer')) agg.numerical += 1;
  if (qt.includes('formula') || qt.includes('equation')) agg.formula += 1;

  const chapter = String(row.chapter || 'General').trim() || 'General';
  const chapterRow = agg.chapters.get(chapter) || { correct: 0, total: 0 };
  chapterRow.total += 1;
  if (row.status === 'correct') chapterRow.correct += 1;
  agg.chapters.set(chapter, chapterRow);
};

export const topChapter = (agg: SubjectAgg): string => {
  let best = '';
  let bestScore = -1;
  for (const [chapter, stats] of agg.chapters.entries()) {
    const score = stats.total > 0 ? stats.correct / stats.total : 0;
    if (score > bestScore || (score === bestScore && stats.total > 0)) {
      bestScore = score;
      best = chapter;
    }
  }
  return best || '—';
};

const sumOverallFromStudentResults = (results: SchoolAnalysisExamResult[]): SubjectAgg => {
  const overall = emptyAgg();
  for (const result of results) {
    const correct = toNum(result.correctAnswers, 0);
    const wrong = toNum(result.wrongAnswers, 0);
    const left = toNum(result.unattempted, 0);
    const total = toNum(result.totalQuestions, correct + wrong + left);
    overall.total += total;
    overall.correct += correct;
    overall.wrong += wrong;
    overall.left += left;
    overall.totalTime += Math.max(0, toNum(result.timeTaken, 0));
  }
  return overall;
};

const collectAnalyticsRows = (results: SchoolAnalysisExamResult[]) => {
  const overall = sumOverallFromStudentResults(results);
  const bySubject = new Map<string, SubjectAgg>();
  const byDifficulty = new Map<DifficultyBucket, SubjectAgg>(
    DIFFICULTY_BUCKETS.map((d) => [d, emptyAgg()]),
  );
  let hasQuestionAnalytics = false;

  for (const result of results) {
    const rows = Array.isArray(result.questionAnalytics) ? result.questionAnalytics : [];
    if (rows.length > 0) {
      hasQuestionAnalytics = true;
      for (const row of rows) {
        const subjectKey = normalizeSubjectKey(row.subject || '');
        const difficulty = normalizeDifficulty(row.difficulty || '');
        const status =
          row.status === 'correct' || row.status === 'wrong' || row.status === 'not_answered'
            ? row.status
            : 'not_answered';
        const payload = {
          status,
          difficulty,
          questionType: String(row.questionType || ''),
          chapter: String(row.chapter || 'General'),
          timeTaken: Math.max(0, toNum(row.timeTaken, 0)),
        };

        if (!bySubject.has(subjectKey)) bySubject.set(subjectKey, emptyAgg());
        bumpQuestion(bySubject.get(subjectKey)!, payload);
        bumpQuestion(byDifficulty.get(difficulty)!, payload);
      }
      continue;
    }

    const correct = toNum(result.correctAnswers, 0);
    const wrong = toNum(result.wrongAnswers, 0);
    const left = toNum(result.unattempted, 0);
    const total = toNum(result.totalQuestions, correct + wrong + left);
    const timeTaken = Math.max(0, toNum(result.timeTaken, 0));

    const subjectEntries = result.subjectWiseScore ? Object.entries(result.subjectWiseScore) : [];
    for (const [subject, stats] of subjectEntries) {
      const subjectKey = normalizeSubjectKey(subject);
      const sCorrect = toNum(stats?.correct, 0);
      const sTotal = toNum(stats?.total, 0);
      const sWrong = Math.max(0, sTotal - sCorrect);
      if (!bySubject.has(subjectKey)) bySubject.set(subjectKey, emptyAgg());
      const agg = bySubject.get(subjectKey)!;
      agg.total += sTotal;
      agg.correct += sCorrect;
      agg.wrong += sWrong;
      agg.left += Math.max(0, sTotal - sCorrect - sWrong);
      agg.totalTime += total > 0 ? (timeTaken * sTotal) / total : 0;
    }
  }

  return { overall, bySubject, byDifficulty, hasQuestionAnalytics };
};

const orderedSubjects = (bySubject: Map<string, SubjectAgg>): string[] => {
  const keys = Array.from(bySubject.keys()).filter((k) => k !== 'unknown');
  const ordered = SUBJECT_ORDER.filter((s) => keys.includes(s));
  const rest = keys
    .filter((k) => !SUBJECT_ORDER.includes(k as (typeof SUBJECT_ORDER)[number]))
    .sort((a, b) => a.localeCompare(b));
  return [...ordered, ...rest];
};

const buildRankedStudents = (
  results: SchoolAnalysisExamResult[],
): RankedStudent[] => {
  const ranked = [...results]
    .map((result) => {
      const correct = toNum(result.correctAnswers, 0);
      const wrong = toNum(result.wrongAnswers, 0);
      const left = toNum(result.unattempted, 0);
      const total = toNum(result.totalQuestions, correct + wrong + left);
      const accuracy = total > 0 ? (correct / total) * 100 : 0;
      const avgTime = formatAvgTime(Math.max(0, toNum(result.timeTaken, 0)), Math.max(1, total));

      const subjectAcc = new Map<string, number>();
      const subjectEntries = result.subjectWiseScore ? Object.entries(result.subjectWiseScore) : [];

      if (subjectEntries.length > 0) {
        for (const [subject, stats] of subjectEntries) {
          const key = normalizeSubjectKey(subject);
          const sTotal = toNum(stats?.total, 0);
          const sCorrect = toNum(stats?.correct, 0);
          subjectAcc.set(key, sTotal > 0 ? (sCorrect / sTotal) * 100 : 0);
        }
      } else if (Array.isArray(result.questionAnalytics) && result.questionAnalytics.length > 0) {
        const tallies = new Map<string, { correct: number; total: number }>();
        for (const row of result.questionAnalytics) {
          const key = normalizeSubjectKey(row.subject || '');
          const tally = tallies.get(key) || { correct: 0, total: 0 };
          tally.total += 1;
          if (row.status === 'correct') tally.correct += 1;
          tallies.set(key, tally);
        }
        for (const [key, tally] of tallies.entries()) {
          subjectAcc.set(key, tally.total > 0 ? (tally.correct / tally.total) * 100 : 0);
        }
      }

      let topSubject = '—';
      let topAcc = -1;
      for (const [key, acc] of subjectAcc.entries()) {
        if (acc > topAcc) {
          topAcc = acc;
          topSubject = displaySubject(key);
        }
      }

      const attemptNumber = Number(result.attemptNumber) >= 1 ? Number(result.attemptNumber) : 1;

      return {
        rank: 0,
        name: result.userId?.fullName || 'Unknown',
        classNumber: normalizeClassNumberForDisplay(result.userId?.classNumber),
        attemptNumber,
        attemptLabel: formatAttemptLabel(attemptNumber),
        completedAt: formatCompletedAtLabel(result.completedAt),
        total,
        correct,
        wrong,
        left,
        accuracy,
        accuracyLabel: `${accuracy.toFixed(1)}%`,
        avgTime,
        subjectAcc,
        topSubject,
        performance: performanceLabel(accuracy),
      };
    })
    .sort((a, b) => b.accuracy - a.accuracy || b.correct - a.correct);

  ranked.forEach((student, idx) => {
    student.rank = idx + 1;
  });
  return ranked;
};

export function buildSchoolPerformanceAnalysisReport(
  examTitle: string,
  results: SchoolAnalysisExamResult[],
): SchoolPerformanceReport | null {
  const prepared = prepareResultsForAnalysisExport(results);
  if (!prepared.length) return null;

  const studentCount = countUniqueStudents(prepared);
  const totalAttempts = prepared.length;
  const { overall, bySubject, byDifficulty, hasQuestionAnalytics } = collectAnalyticsRows(prepared);
  const subjects = orderedSubjects(bySubject);
  const avgQPerStudent =
    studentCount > 0 ? Math.round((overall.total / studentCount) * 10) / 10 : 0;
  const avgQPerAttempt =
    totalAttempts > 0 ? Math.round((overall.total / totalAttempts) * 10) / 10 : 0;

  return {
    examTitle: String(examTitle || 'Untitled Exam').trim() || 'Untitled Exam',
    studentCount,
    totalAttempts,
    subjects,
    subjectLabels: subjects.map(displaySubject),
    attemptNote: 'All attempts are included — Section D shows every submission (Attempt 1, 2, 3…).',
    overall: { ...overall, avgQPerStudent, avgQPerAttempt },
    bySubject,
    byDifficulty,
    hasQuestionAnalytics,
    rankedStudents: buildRankedStudents(prepared),
  };
}
