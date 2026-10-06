import {
  type SchoolAnalysisExamResult,
  type SubjectAgg,
  buildSchoolPerformanceAnalysisReport,
  displaySubject,
  formatCompletedAtLabel,
  normalizeSubjectKey,
  prepareResultsForAnalysisExport,
  toNum,
} from './school-performance-analysis-data';

export type HandoffStudentRow = {
  rank: number;
  resultId?: string;
  userId?: string;
  name: string;
  classNumber: string;
  attemptLabel: string;
  completedAt: string;
  completedAtRaw?: string;
  total: number;
  correct: number;
  wrong: number;
  left: number;
  attempted: number;
  accuracy: number;
  attemptRate: number;
  precision: number;
  wrongBurden: number;
  leftRate: number;
  avgTimeSec: number;
  correctPerActiveMin: number;
  accuracyGap: number;
  timeGap: number;
  subjectSpread: number;
  percentile: number;
  strongestSubject: string;
  weakestSubject: string;
  paceAccuracyProfile: string;
  cohortBand: string;
  subjectAcc: Map<string, number>;
  subjectMarks: Map<string, number>;
};

export type HandoffQuestionRow = {
  questionNumber: number;
  questionId: string;
  status: 'correct' | 'wrong' | 'not_answered';
  questionText: string;
  subject?: string;
  chapter?: string;
  difficulty?: string;
  timeTaken?: number;
};

function stripHtmlPreview(text: string) {
  return String(text || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Per-question rows for on-screen individual analysis (mirrors attempt detail). */
export function buildHandoffQuestionRows(
  result: SchoolAnalysisExamResult | null | undefined,
): HandoffQuestionRow[] {
  if (!result) return [];
  const qa = Array.isArray(result.questionAnalytics) ? result.questionAnalytics : [];
  const snapshot = Array.isArray(result.questionSnapshot) ? result.questionSnapshot : [];
  const total = Math.max(
    qa.length,
    snapshot.length,
    toNum(result.totalQuestions, 0),
    toNum(result.correctAnswers, 0) + toNum(result.wrongAnswers, 0) + toNum(result.unattempted, 0),
  );

  const rows: HandoffQuestionRow[] = [];
  for (let i = 0; i < total; i += 1) {
    const row =
      qa.find((r) => Number(r?.index) === i) ||
      qa[i] ||
      null;
    const snap = snapshot[i] || null;
    const statusRaw = String(row?.status || '').toLowerCase();
    let status: HandoffQuestionRow['status'] = 'not_answered';
    if (statusRaw === 'correct' || row?.isCorrect === true) status = 'correct';
    else if (statusRaw === 'wrong' || statusRaw === 'incorrect') status = 'wrong';
    else if (row?.isAnswered === true) status = row.isCorrect ? 'correct' : 'wrong';

    const questionText =
      stripHtmlPreview(snap?.questionText || snap?.assertionText || '') ||
      `Question ${i + 1}`;

    rows.push({
      questionNumber: i + 1,
      questionId: String(row?.questionId || snap?._id || `q-${i}`),
      status,
      questionText: questionText.slice(0, 280),
      subject: row?.subject || snap?.subject || '',
      chapter: row?.chapter || snap?.chapter || '',
      difficulty: row?.difficulty || snap?.difficulty || '',
      timeTaken: Number(row?.timeTaken) > 0 ? Number(row?.timeTaken) : undefined,
    });
  }
  return rows;
}

/** Class-level correct / wrong / blank counts per question (best attempt per student). */
export type ClassQuestionStat = {
  questionNumber: number;
  index: number;
  questionId: string;
  questionText: string;
  subject?: string;
  chapter?: string;
  totalStudents: number;
  correct: number;
  wrong: number;
  unattempted: number;
  attempted: number;
  accuracyPct: number;
  classCorrectPct: number;
};

export function buildClassQuestionBreakdown(
  results: SchoolAnalysisExamResult[],
): ClassQuestionStat[] {
  const prepared = prepareResultsForAnalysisExport(results);
  const bestByStudent = new Map<string, SchoolAnalysisExamResult>();
  for (const result of prepared) {
    const id = String(
      result.userId?._id || result.userId?.email || result.userId?.fullName || '',
    ).trim();
    if (!id) continue;
    const prev = bestByStudent.get(id);
    if (!prev || toNum(result.percentage, 0) > toNum(prev.percentage, 0)) {
      bestByStudent.set(id, result);
    }
  }

  const bestList = [...bestByStudent.values()];
  const totalStudents = bestList.length;
  if (!totalStudents) return [];

  const rowsByStudent = bestList.map((result) => buildHandoffQuestionRows(result));
  let maxQ = 0;
  for (const rows of rowsByStudent) maxQ = Math.max(maxQ, rows.length);
  if (maxQ === 0) return [];

  const stats: ClassQuestionStat[] = [];
  for (let i = 0; i < maxQ; i += 1) {
    let correct = 0;
    let wrong = 0;
    let unattempted = 0;
    let questionId = `q-${i}`;
    let questionText = `Question ${i + 1}`;
    let subject = '';
    let chapter = '';

    for (const rows of rowsByStudent) {
      const q = rows[i];
      if (!q) {
        unattempted += 1;
        continue;
      }
      if (q.questionId) questionId = q.questionId;
      if (q.questionText && !/^Question \d+$/i.test(q.questionText)) {
        questionText = q.questionText;
      } else if (!questionText || /^Question \d+$/i.test(questionText)) {
        questionText = q.questionText || questionText;
      }
      if (q.subject) subject = q.subject;
      if (q.chapter) chapter = q.chapter;

      if (q.status === 'correct') correct += 1;
      else if (q.status === 'wrong') wrong += 1;
      else unattempted += 1;
    }

    const attempted = correct + wrong;
    stats.push({
      questionNumber: i + 1,
      index: i,
      questionId,
      questionText: questionText.slice(0, 280),
      subject,
      chapter,
      totalStudents,
      correct,
      wrong,
      unattempted,
      attempted,
      accuracyPct: attempted > 0 ? Math.round((correct / attempted) * 1000) / 10 : 0,
      classCorrectPct:
        totalStudents > 0 ? Math.round((correct / totalStudents) * 1000) / 10 : 0,
    });
  }

  return stats;
}

export type HandoffSubjectRow = {
  subjectKey: string;
  label: string;
  total: number;
  correct: number;
  wrong: number;
  left: number;
  accuracy: number;
  attemptRate: number;
  precision: number;
  wrongBurden: number;
  leftRate: number;
  avgTimeSec: number;
  correctPerActiveMin: number;
  zeroCorrectStudents: number;
  studentsAtLeast50: number;
  keyReading: string;
};

export type HandoffShowcaseRow = {
  dimension: string;
  signal: string;
  interpretation: string;
  use: string;
};

export type HandoffSubjectDiagnostic = {
  subjectKey: string;
  label: string;
  studentAccuracy: number;
  classAccuracy: number;
  gap: number;
  subjectRank: number;
  position: 'Above cohort' | 'Below cohort' | 'At cohort';
};

export type HandoffBehaviourRow = {
  metric: string;
  student: string | number;
  classValue: string | number;
  reading: string;
};

export type HandoffActionRow = {
  priority: number;
  focus: string;
  action: string;
};

export type HandoffIndividualReport = {
  student: HandoffStudentRow;
  subjectDiagnostics: HandoffSubjectDiagnostic[];
  behaviour: HandoffBehaviourRow[];
  actions: HandoffActionRow[];
  questions: HandoffQuestionRow[];
};

export type ExamAnalyticsHandoffReport = {
  examTitle: string;
  classLabel: string;
  examDateLabel: string;
  studentCount: number;
  totalAttempts: number;
  questionsPerStudent: number;
  questionRecords: number;
  subjectCount: number;
  subjects: string[];
  subjectLabels: string[];
  classAccuracy: number;
  classAttemptRate: number;
  classPrecision: number;
  classLeftRate: number;
  classAvgTimeSec: number;
  medianAccuracy: number;
  accuracyTimeCorr: number;
  studentsAtLeast50: number;
  highestAccuracy: number;
  lowestAccuracy: number;
  classCorrectPerActiveMin: number;
  showcase: HandoffShowcaseRow[];
  subjectRows: HandoffSubjectRow[];
  students: HandoffStudentRow[];
  individuals: HandoffIndividualReport[];
  interpretationNote: string;
};

const ratio = (num: number, den: number) => (den > 0 ? num / den : 0);

const median = (values: number[]) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
};

const pearson = (xs: number[], ys: number[]) => {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 0;
  let sumX = 0;
  let sumY = 0;
  let sumXX = 0;
  let sumYY = 0;
  let sumXY = 0;
  for (let i = 0; i < n; i += 1) {
    sumX += xs[i];
    sumY += ys[i];
    sumXX += xs[i] * xs[i];
    sumYY += ys[i] * ys[i];
    sumXY += xs[i] * ys[i];
  }
  const num = n * sumXY - sumX * sumY;
  const den = Math.sqrt((n * sumXX - sumX * sumX) * (n * sumYY - sumY * sumY));
  return den > 0 ? num / den : 0;
};

const pctLabel = (value01: number) => `${(value01 * 100).toFixed(1)}%`;

const cohortBandForRank = (rank: number, n: number): string => {
  if (n <= 1) return 'Top quartile';
  const pct = (rank - 1) / (n - 1);
  if (pct <= 0.25) return 'Top quartile';
  if (pct <= 0.5) return 'Upper-middle';
  if (pct <= 0.75) return 'Lower-middle';
  return 'Bottom quartile';
};

const paceAccuracyProfile = (
  accuracy: number,
  avgTimeSec: number,
  classAccuracy: number,
  classAvgTimeSec: number,
): string => {
  const faster = avgTimeSec < classAvgTimeSec;
  const stronger = accuracy >= classAccuracy;
  if (faster && stronger) return 'Fast + stronger accuracy';
  if (!faster && stronger) return 'Careful + stronger accuracy';
  if (faster && !stronger) return 'Fast + lower accuracy';
  return 'Slow + lower accuracy';
};

const subjectKeyReading = (row: Omit<HandoffSubjectRow, 'keyReading'>, classAccuracy: number): string => {
  if (row.accuracy === classAccuracy && row.leftRate > 0.3) {
    return 'High recorded left rate; review optional-question rules.';
  }
  if (row.accuracy >= classAccuracy + 0.1) {
    return 'Highest accuracy and strongest answer precision.';
  }
  if (row.leftRate >= 0.4) {
    return 'High recorded left rate; attempted precision is comparatively stronger.';
  }
  if (row.attemptRate >= 0.99 && row.avgTimeSec > 0) {
    return 'Fully recorded as attempted; slowest average pace.';
  }
  if (row.accuracy <= classAccuracy - 0.05) {
    return 'Lowest accuracy; high recorded left rate.';
  }
  return 'Subject needs targeted remediation.';
};

function buildStudentSubjectAcc(result: SchoolAnalysisExamResult): Map<string, number> {
  const subjectAcc = new Map<string, number>();
  const subjectEntries = result.subjectWiseScore ? Object.entries(result.subjectWiseScore) : [];
  if (subjectEntries.length > 0) {
    for (const [subject, stats] of subjectEntries) {
      const key = normalizeSubjectKey(subject);
      const sTotal = toNum(stats?.total, 0);
      const sCorrect = toNum(stats?.correct, 0);
      subjectAcc.set(key, sTotal > 0 ? sCorrect / sTotal : 0);
    }
    return subjectAcc;
  }
  if (Array.isArray(result.questionAnalytics) && result.questionAnalytics.length > 0) {
    const tallies = new Map<string, { correct: number; total: number }>();
    for (const row of result.questionAnalytics) {
      const key = normalizeSubjectKey(row.subject || '');
      const tally = tallies.get(key) || { correct: 0, total: 0 };
      tally.total += 1;
      if (row.status === 'correct') tally.correct += 1;
      tallies.set(key, tally);
    }
    for (const [key, tally] of tallies.entries()) {
      subjectAcc.set(key, tally.total > 0 ? tally.correct / tally.total : 0);
    }
  }
  return subjectAcc;
}

function buildStudentSubjectMarks(result: SchoolAnalysisExamResult): Map<string, number> {
  const subjectMarks = new Map<string, number>();
  const subjectEntries = result.subjectWiseScore ? Object.entries(result.subjectWiseScore) : [];
  if (subjectEntries.length > 0) {
    for (const [subject, stats] of subjectEntries) {
      const key = normalizeSubjectKey(subject);
      const rawMarksValue: unknown = stats?.marks;
      const rawMarks =
        rawMarksValue === null || rawMarksValue === undefined || rawMarksValue === ''
          ? Number.NaN
          : Number(rawMarksValue);
      subjectMarks.set(
        key,
        Number.isFinite(rawMarks) ? rawMarks : toNum(stats?.correct, 0),
      );
    }
    return subjectMarks;
  }
  if (Array.isArray(result.questionAnalytics)) {
    for (const row of result.questionAnalytics) {
      const key = normalizeSubjectKey(row.subject || '');
      const earned = row.status === 'correct' || row.isCorrect === true ? 1 : 0;
      subjectMarks.set(key, (subjectMarks.get(key) || 0) + earned);
    }
  }
  return subjectMarks;
}

function strongestWeakest(subjectAcc: Map<string, number>): {
  strongest: string;
  weakest: string;
  spread: number;
} {
  let strongest = '—';
  let weakest = '—';
  let max = -1;
  let min = Number.POSITIVE_INFINITY;
  for (const [key, acc] of subjectAcc.entries()) {
    if (acc > max) {
      max = acc;
      strongest = displaySubject(key);
    }
    if (acc < min) {
      min = acc;
      weakest = displaySubject(key);
    }
  }
  if (!Number.isFinite(min) || max < 0) return { strongest: '—', weakest: '—', spread: 0 };
  return { strongest, weakest, spread: max - min };
}

function buildActions(student: HandoffStudentRow): HandoffActionRow[] {
  const actions: HandoffActionRow[] = [];
  if (student.weakestSubject && student.weakestSubject !== '—') {
    actions.push({
      priority: 1,
      focus: student.weakestSubject,
      action: `Rebuild ${student.weakestSubject} using concept-level error review before timed practice.`,
    });
  }
  if (
    student.strongestSubject &&
    student.weakestSubject &&
    student.strongestSubject !== student.weakestSubject
  ) {
    actions.push({
      priority: actions.length + 1,
      focus: 'Subject balance',
      action: `Preserve ${student.strongestSubject} while closing the gap in ${student.weakestSubject}.`,
    });
  }
  if (student.paceAccuracyProfile.startsWith('Fast')) {
    actions.push({
      priority: actions.length + 1,
      focus: student.paceAccuracyProfile.includes('stronger')
        ? 'Review discipline'
        : 'Pace control',
      action: student.paceAccuracyProfile.includes('stronger')
        ? 'Use saved time for a final check of flagged and low-confidence answers.'
        : 'Slow down on weak subjects; accuracy is trailing the class at this pace.',
    });
  } else {
    actions.push({
      priority: actions.length + 1,
      focus: 'Time efficiency',
      action: 'Keep careful checking, but set a soft time budget so later questions are not rushed.',
    });
  }
  return actions.slice(0, 3);
}

function buildBehaviour(
  student: HandoffStudentRow,
  classAccuracy: number,
  classAttemptRate: number,
  classPrecision: number,
  classAvgTimeSec: number,
  classCorrectPerActiveMin: number,
): HandoffBehaviourRow[] {
  const accDelta = (student.accuracy - classAccuracy) * 100;
  const precDelta = (student.precision - classPrecision) * 100;
  const timeDelta = student.avgTimeSec - classAvgTimeSec;
  const thruDelta = student.correctPerActiveMin - classCorrectPerActiveMin;

  return [
    {
      metric: 'Accuracy',
      student: student.accuracy,
      classValue: classAccuracy,
      reading:
        Math.abs(accDelta) < 0.5
          ? 'Matches class average.'
          : `${Math.abs(accDelta).toFixed(1)}% ${accDelta >= 0 ? 'above' : 'below'} class average.`,
    },
    {
      metric: 'Recorded attempt rate',
      student: student.attemptRate,
      classValue: classAttemptRate,
      reading:
        Math.abs(student.attemptRate - classAttemptRate) < 0.02
          ? 'Matches the class recording pattern.'
          : `${pctLabel(Math.abs(student.attemptRate - classAttemptRate))} ${
              student.attemptRate >= classAttemptRate ? 'above' : 'below'
            } class attempt rate.`,
    },
    {
      metric: 'Attempted precision',
      student: student.precision,
      classValue: classPrecision,
      reading:
        Math.abs(precDelta) < 0.5
          ? 'Matches class attempted precision.'
          : `${Math.abs(precDelta).toFixed(1)}% ${precDelta >= 0 ? 'above' : 'below'} class attempted precision.`,
    },
    {
      metric: 'Avg time/Q',
      student: student.avgTimeSec,
      classValue: classAvgTimeSec,
      reading:
        Math.abs(timeDelta) < 0.5
          ? 'Matches class average pace.'
          : `${Math.abs(timeDelta).toFixed(1)}s ${timeDelta >= 0 ? 'slower' : 'faster'} than class average.`,
    },
    {
      metric: 'Correct / est. active min',
      student: student.correctPerActiveMin,
      classValue: classCorrectPerActiveMin,
      reading: `${Math.abs(thruDelta).toFixed(2)} ${thruDelta >= 0 ? 'above' : 'below'} class throughput proxy.`,
    },
    {
      metric: 'Subject spread',
      student: student.subjectSpread,
      classValue: '',
      reading:
        student.subjectSpread >= 0.5
          ? 'Highly uneven subject profile.'
          : student.subjectSpread >= 0.25
            ? 'Moderate subject imbalance.'
            : 'Relatively even subject profile.',
    },
    {
      metric: 'Pace-accuracy profile',
      student: student.paceAccuracyProfile,
      classValue: 'Cohort-relative',
      reading: 'Combines accuracy and pace relative to class means.',
    },
  ];
}

function subjectDiagnosticsForStudent(
  student: HandoffStudentRow,
  subjectRows: HandoffSubjectRow[],
  allStudents: HandoffStudentRow[],
): HandoffSubjectDiagnostic[] {
  return subjectRows.map((subj) => {
    const studentAccuracy = student.subjectAcc.get(subj.subjectKey) ?? 0;
    const ranked = [...allStudents]
      .map((s) => ({
        name: s.name,
        acc: s.subjectAcc.get(subj.subjectKey) ?? 0,
      }))
      .sort((a, b) => b.acc - a.acc);
    const subjectRank = Math.max(
      1,
      ranked.findIndex((r) => r.name === student.name && Math.abs(r.acc - studentAccuracy) < 1e-9) + 1,
    );
    const gap = studentAccuracy - subj.accuracy;
    return {
      subjectKey: subj.subjectKey,
      label: subj.label,
      studentAccuracy,
      classAccuracy: subj.accuracy,
      gap,
      subjectRank,
      position: gap > 0.01 ? 'Above cohort' : gap < -0.01 ? 'Below cohort' : 'At cohort',
    };
  });
}

export function buildExamAnalyticsHandoffReport(
  examTitle: string,
  results: SchoolAnalysisExamResult[],
): ExamAnalyticsHandoffReport | null {
  const prepared = prepareResultsForAnalysisExport(results);
  if (!prepared.length) return null;

  const base = buildSchoolPerformanceAnalysisReport(examTitle, prepared);
  if (!base) return null;

  const classLabel =
    [...new Set(prepared.map((r) => String(r.userId?.classNumber || '').trim()).filter(Boolean))]
      .join(', ') || '—';

  const dates = prepared
    .map((r) => (r.completedAt ? new Date(r.completedAt).getTime() : NaN))
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);
  const examDateLabel =
    dates.length > 0
      ? new Date(dates[0]).toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        })
      : '—';

  const draftStudents = prepared.map((result) => {
    const correct = toNum(result.correctAnswers, 0);
    const wrong = toNum(result.wrongAnswers, 0);
    const left = toNum(result.unattempted, 0);
    const total = toNum(result.totalQuestions, correct + wrong + left);
    const attempted = correct + wrong;
    const accuracy = ratio(correct, total);
    const avgTimeSec = total > 0 ? Math.max(0, toNum(result.timeTaken, 0)) / total : 0;
    const activeMin = Math.max(0, toNum(result.timeTaken, 0)) / 60;
    const subjectAcc = buildStudentSubjectAcc(result);
    const subjectMarks = buildStudentSubjectMarks(result);
    const { strongest, weakest, spread } = strongestWeakest(subjectAcc);
    const attemptNumber = Number(result.attemptNumber) >= 1 ? Number(result.attemptNumber) : 1;

    return {
      resultId: String(result._id || '').trim() || undefined,
      userId: String(result.userId?._id || '').trim() || undefined,
      name: result.userId?.fullName || 'Unknown',
      classNumber: String(result.userId?.classNumber || '').trim() || '—',
      attemptLabel: `Attempt ${Math.round(attemptNumber)}`,
      completedAt: formatCompletedAtLabel(result.completedAt),
      completedAtRaw: result.completedAt,
      total,
      correct,
      wrong,
      left,
      attempted,
      accuracy,
      attemptRate: ratio(attempted, total),
      precision: ratio(correct, attempted),
      wrongBurden: ratio(wrong, attempted),
      leftRate: ratio(left, total),
      avgTimeSec,
      correctPerActiveMin: activeMin > 0 ? correct / activeMin : 0,
      subjectAcc,
      subjectMarks,
      strongestSubject: strongest,
      weakestSubject: weakest,
      subjectSpread: spread,
    };
  });

  draftStudents.sort((a, b) => b.accuracy - a.accuracy || b.correct - a.correct);

  const classAccuracy = ratio(
    draftStudents.reduce((s, r) => s + r.correct, 0),
    draftStudents.reduce((s, r) => s + r.total, 0),
  );
  const classAttemptRate = ratio(
    draftStudents.reduce((s, r) => s + r.attempted, 0),
    draftStudents.reduce((s, r) => s + r.total, 0),
  );
  const classPrecision = ratio(
    draftStudents.reduce((s, r) => s + r.correct, 0),
    draftStudents.reduce((s, r) => s + r.attempted, 0),
  );
  const classLeftRate = ratio(
    draftStudents.reduce((s, r) => s + r.left, 0),
    draftStudents.reduce((s, r) => s + r.total, 0),
  );
  const classAvgTimeSec = ratio(
    draftStudents.reduce((s, r) => s + r.avgTimeSec, 0),
    draftStudents.length,
  );
  const classCorrectPerActiveMin = ratio(
    draftStudents.reduce((s, r) => s + r.correctPerActiveMin, 0),
    draftStudents.length,
  );
  const medianAccuracy = median(draftStudents.map((s) => s.accuracy));
  const accuracyTimeCorr = pearson(
    draftStudents.map((s) => s.avgTimeSec),
    draftStudents.map((s) => s.accuracy),
  );
  const studentsAtLeast50 = draftStudents.filter((s) => s.accuracy >= 0.5).length;
  const highestAccuracy = draftStudents[0]?.accuracy ?? 0;
  const lowestAccuracy = draftStudents[draftStudents.length - 1]?.accuracy ?? 0;
  const n = draftStudents.length;

  const students: HandoffStudentRow[] = draftStudents.map((s, idx) => {
    const rank = idx + 1;
    return {
      ...s,
      rank,
      percentile: n <= 1 ? 1 : (n - rank) / (n - 1),
      accuracyGap: s.accuracy - classAccuracy,
      timeGap: s.avgTimeSec - classAvgTimeSec,
      paceAccuracyProfile: paceAccuracyProfile(
        s.accuracy,
        s.avgTimeSec,
        classAccuracy,
        classAvgTimeSec,
      ),
      cohortBand: cohortBandForRank(rank, n),
    };
  });

  const subjectRows: HandoffSubjectRow[] = base.subjects.map((subjectKey) => {
    const agg: SubjectAgg = base.bySubject.get(subjectKey) || {
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
      chapters: new Map(),
    };
    const attempted = agg.correct + agg.wrong;
    const accuracy = ratio(agg.correct, agg.total);
    const avgTimeSec = agg.total > 0 ? agg.totalTime / agg.total : 0;
    const activeMin = agg.totalTime / 60;
    const studentAccs = students.map((st) => st.subjectAcc.get(subjectKey) ?? 0);
    const zeroCorrectStudents = studentAccs.filter((a) => a <= 0).length;
    const studentsGe50 = studentAccs.filter((a) => a >= 0.5).length;
    const draft = {
      subjectKey,
      label: displaySubject(subjectKey),
      total: agg.total,
      correct: agg.correct,
      wrong: agg.wrong,
      left: agg.left,
      accuracy,
      attemptRate: ratio(attempted, agg.total),
      precision: ratio(agg.correct, attempted),
      wrongBurden: ratio(agg.wrong, attempted),
      leftRate: ratio(agg.left, agg.total),
      avgTimeSec,
      correctPerActiveMin: activeMin > 0 ? agg.correct / activeMin : 0,
      zeroCorrectStudents,
      studentsAtLeast50: studentsGe50,
    };
    return { ...draft, keyReading: subjectKeyReading(draft, classAccuracy) };
  });

  const strongestSubject = [...subjectRows].sort((a, b) => b.accuracy - a.accuracy)[0];
  const weakestSubject = [...subjectRows].sort((a, b) => a.accuracy - b.accuracy)[0];

  const questionsPerStudent =
    students.length > 0
      ? Math.round(
          students.reduce((s, r) => s + r.total, 0) / students.length,
        )
      : 0;

  const showcase: HandoffShowcaseRow[] = [
    {
      dimension: 'Overall mastery',
      signal: `${pctLabel(classAccuracy)} class accuracy; median ${pctLabel(medianAccuracy)}; ${studentsAtLeast50} of ${n} students reached 50%.`,
      interpretation:
        studentsAtLeast50 === 0
          ? 'Performance is concentrated below the 50% mark.'
          : 'Class has a mixed mastery distribution around the 50% mark.',
      use: 'Use as the baseline for remediation and retest comparison.',
    },
    {
      dimension: 'Answer precision',
      signal: `${pctLabel(classPrecision)} correct among attempted; ${pctLabel(1 - classPrecision)} wrong among attempted.`,
      interpretation:
        classPrecision < 0.5
          ? 'Wrong answers exceed correct answers among attempted responses.'
          : 'Students are more often correct than wrong when they attempt.',
      use: 'Track precision separately from completion.',
    },
    {
      dimension: 'Recorded completion',
      signal: `${pctLabel(classAttemptRate)} recorded attempt rate; left rate ${pctLabel(classLeftRate)}.`,
      interpretation: 'Verify optional-question rules before treating Left as a deficit.',
      use: 'Confirm optional-question rules before treating Left as a deficit.',
    },
    {
      dimension: 'Pace relationship',
      signal: `Average ${classAvgTimeSec.toFixed(1)}s/question; accuracy-time correlation ${accuracyTimeCorr >= 0 ? '+' : ''}${accuracyTimeCorr.toFixed(2)}.`,
      interpretation:
        accuracyTimeCorr > 0.3
          ? 'Within this cohort, higher time is associated with higher accuracy.'
          : accuracyTimeCorr < -0.3
            ? 'Within this cohort, faster pace is associated with higher accuracy.'
            : 'Pace and accuracy are weakly related in this cohort.',
      use: 'Use pace with accuracy; do not reward speed alone.',
    },
    {
      dimension: 'Subject contrast',
      signal: subjectRows
        .map((s) => `${s.label} ${pctLabel(s.accuracy)}`)
        .join('; '),
      interpretation:
        strongestSubject && weakestSubject
          ? `${strongestSubject.label} is the strongest subject; ${weakestSubject.label} is the weakest by accuracy.`
          : 'Subject spread is limited.',
      use: 'Prioritise subject-specific remediation rather than one class-wide strategy.',
    },
    {
      dimension: 'Cohort spread',
      signal: `Highest ${pctLabel(highestAccuracy)}; median ${pctLabel(medianAccuracy)}; lowest ${pctLabel(lowestAccuracy)}.`,
      interpretation: 'The class has a measurable performance spread.',
      use: 'Differentiate support by cohort band and student profile.',
    },
  ];

  const resultById = new Map(
    prepared.map((r) => [String(r._id || '').trim(), r] as const).filter(([id]) => Boolean(id)),
  );

  const individuals: HandoffIndividualReport[] = students.map((student) => {
    const attempt =
      (student.resultId && resultById.get(student.resultId)) ||
      prepared.find(
        (r) =>
          String(r.userId?._id || '') === String(student.userId || '') &&
          `Attempt ${Math.round(Number(r.attemptNumber) >= 1 ? Number(r.attemptNumber) : 1)}` ===
            student.attemptLabel,
      ) ||
      null;
    return {
      student,
      subjectDiagnostics: subjectDiagnosticsForStudent(student, subjectRows, students),
      behaviour: buildBehaviour(
        student,
        classAccuracy,
        classAttemptRate,
        classPrecision,
        classAvgTimeSec,
        classCorrectPerActiveMin,
      ),
      actions: buildActions(student),
      questions: buildHandoffQuestionRows(attempt),
    };
  });

  return {
    examTitle: base.examTitle,
    classLabel,
    examDateLabel,
    studentCount: n,
    totalAttempts: base.totalAttempts,
    questionsPerStudent,
    questionRecords: draftStudents.reduce((s, r) => s + r.total, 0),
    subjectCount: subjectRows.length,
    subjects: base.subjects,
    subjectLabels: base.subjectLabels,
    classAccuracy,
    classAttemptRate,
    classPrecision,
    classLeftRate,
    classAvgTimeSec,
    medianAccuracy,
    accuracyTimeCorr,
    studentsAtLeast50,
    highestAccuracy,
    lowestAccuracy,
    classCorrectPerActiveMin,
    showcase,
    subjectRows,
    students,
    individuals,
    interpretationNote:
      "Data interpretation rule: verify the assessment's optional-question policy before treating recorded Left as incompletion.",
  };
}

export function formatHandoffPct(value01: number): string {
  return pctLabel(value01);
}

export function formatHandoffNumber(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '—';
  return value.toFixed(digits);
}
