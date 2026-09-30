import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useLocation } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { API_BASE_URL } from '@/lib/api-config';
import { resolveAnswerAgainstOptions } from '@/lib/exam-answer-resolve';
import { normalizeAndFormatExamDisplayText } from '@/lib/exam-text-normalize';
import AdvancedPerformanceDashboard from '@/components/analytics/AdvancedPerformanceDashboard';
import AiReportTab from '@/components/exam-analysis/AiReportTab';
import { getAuthToken } from '@/lib/auth-utils';
import { AuthenticatedUploadImage } from '@/components/AuthenticatedUploadImage';
import {
  type WeakSubjectContentMap,
} from '@/components/weak-subject-resources-card';
import { 
  Trophy, 
  Target, 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  BookOpen,
  Calculator,
  TrendingUp,
  TrendingDown,
  Award,
  BarChart3,
  PieChart,
  LineChart,
  Brain,
  Zap,
  Star,
  ArrowUp,
  ArrowDown,
  Minus,
  Flame,
  Crown,
  Sparkles,
  Eye,
  Play,
  FlaskConical,
  Atom,
  ChevronRight,
  RefreshCw,
  Timer,
  Gem,
  ExternalLink,
} from 'lucide-react';

type QuestionOption = string | { text: string; isCorrect?: boolean; _id?: string };

interface Question {
  _id: string;
  questionText: string;
  questionImage?: string;
  questionType: 'mcq' | 'multiple' | 'integer';
  options?: QuestionOption[];
  correctAnswer: string | string[] | QuestionOption | QuestionOption[];
  marks: number;
  negativeMarks: number;
  explanation?: string;
  subject: string;
  chapter?: string;
  topic?: string;
  sectionHeading?: string;
}

interface ExamResult {
  _id?: string;
  resultId?: string;
  examId: string;
  examTitle?: string;
  attemptNumber?: number;
  totalQuestions: number;
  correctAnswers: number;
  wrongAnswers: number;
  unattempted: number;
  totalMarks: number;
  obtainedMarks: number;
  percentage: number;
  timeTaken: number;
  subjectWiseScore: {
    maths: { correct: number; total: number; marks: number };
    physics: { correct: number; total: number; marks: number };
    chemistry: { correct: number; total: number; marks: number };
    biology?: { correct: number; total: number; marks: number };
  };
  answers?: Record<string, any>;
  questions?: Question[];
  questionAnalytics?: Array<{
    questionId?: string;
    index?: number;
    timeTaken?: number;
    timeBucket?: string;
    difficulty?: string;
    status?: string;
  }>;
}

type QuestionFilterId =
  | 'all'
  | 'correct'
  | 'wrong'
  | 'skipped'
  | 'wrong-quick'
  | 'hard-wrong'
  | 'time-pressure';

interface DetailedAnalysisProps {
  result: ExamResult;
  examTitle: string;
  onBack: () => void;
}

type WeakTopicRow = { subject: string; topic: string };

type AnalysisMeta = {
  weakTopics?: WeakTopicRow[];
  weakSubjects?: string[];
};

interface AiExamAnalysis {
  riskLevel?: 'high' | 'medium' | 'low' | string;
  riskScore?: number;
  summary?: string;
  strengths?: string[];
  rootCauses?: string[];
  predictions?: {
    nextExamPrediction?: number;
    confidence?: number;
    trend?: 'declining' | 'stable' | 'improving' | string;
  };
  interventions?: Array<{
    priority?: 'high' | 'medium' | 'low' | string;
    action?: string;
    reasoning?: string;
    expectedImpact?: string;
  }>;
  focusAreas?: Array<{
    subject: string;
    issue: string;
    whatToDo: string;
    priority: 'high' | 'medium' | 'low' | string;
  }>;
  actionPlan?: {
    today?: string[];
    thisWeek?: string[];
    beforeNextExam?: string[];
  };
  recommendedAiTools?: Array<{
    toolType: string;
    why: string;
    howToUse: string;
  }>;
  videoRecommendations?: Array<{
    title: string;
    subject?: string;
    subjectId?: string;
    topic?: string;
    url?: string;
    why?: string;
  }>;
  questionInsights?: Array<{
    index?: number;
    questionId?: string;
    subject?: string;
    topic?: string;
    questionType?: string;
    status?: 'correct' | 'wrong' | 'unattempted' | string;
    conceptGap?: string;
    fixStrategy?: string;
    practiceTask?: string;
    geminiExplanation?: string;
    insight?: string;
    priority?: 'high' | 'medium' | 'low' | string;
  }>;
  motivation?: string;
}

type ErrorType = 'careless' | 'conceptual' | 'time-pressure' | 'reading' | null;

type PlanTopic = {
  topicNum: number;
  title: string;
  subtitle: string;
  duration: string;
  subject?: string;
  pct?: number;
  wrongCount?: number;
};

function getAnswerTimeSeconds(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as { timeTaken?: number; time?: number; duration?: number };
    if (typeof o.timeTaken === 'number') return o.timeTaken;
    if (typeof o.time === 'number') return o.time;
    if (typeof o.duration === 'number') return o.duration;
  }
  return null;
}

function getQuestionDifficulty(q: Question): 'easy' | 'medium' | 'hard' {
  const marks = q.marks ?? 4;
  if (marks <= 2) return 'easy';
  if (marks <= 3) return 'medium';
  return 'hard';
}

function resolveQuestionDifficulty(q: Question): 'easy' | 'medium' | 'hard' {
  const raw = String((q as { difficulty?: string }).difficulty || '').trim().toLowerCase();
  if (raw.includes('high') || raw.includes('difficult') || raw === 'hard') return 'hard';
  if (raw.includes('moderate') || raw === 'medium') return 'medium';
  if (raw.includes('easy')) return 'easy';
  return getQuestionDifficulty(q);
}

function getIdealTimeSeconds(difficulty: 'easy' | 'medium' | 'hard'): number {
  if (difficulty === 'easy') return 30;
  if (difficulty === 'medium') return 60;
  return 90;
}

function isTimePressureWrong(
  timeSeconds: number | null,
  avgTime: number,
  difficulty: 'easy' | 'medium' | 'hard',
  timeBucket?: string
): boolean {
  if (timeBucket === 'over_time') return true;
  if (timeSeconds == null) return false;
  const ideal = getIdealTimeSeconds(difficulty);
  return timeSeconds > ideal * 1.25 || (avgTime > 0 && timeSeconds >= avgTime * 1.2);
}

function matchesQuestionFilter(
  filter: QuestionFilterId,
  status: {
    attempted: boolean;
    correct: boolean;
    isWrongQuick: boolean;
    isHardWrong: boolean;
    isTimePressure: boolean;
  }
): boolean {
  if (filter === 'all') return true;
  if (filter === 'correct') return status.correct;
  if (filter === 'wrong') return status.attempted && !status.correct;
  if (filter === 'skipped') return !status.attempted;
  if (filter === 'wrong-quick') return status.isWrongQuick;
  if (filter === 'hard-wrong') return status.isHardWrong;
  if (filter === 'time-pressure') return status.isTimePressure;
  return true;
}

function isReadingErrorInsight(insight?: string): boolean {
  const s = String(insight || '');
  if (!s.trim()) return false;
  // Must be intentional reading/misread language — never bare "not" / "except"
  // (those match almost every wrong-answer explanation and falsely tag READING).
  return /\b(misread|mis-read|incorrectly read|reading error|did not read|didn't read|option trap|stem misread)\b/i.test(
    s
  );
}

function classifyErrorType(
  question: Question,
  userAnswer: unknown,
  timeTaken: number | null,
  opts: {
    isCorrect: boolean;
    isAttempted: boolean;
    avgTime: number;
    totalExamTime: number;
    aiInsight?: string;
  }
): ErrorType {
  if (!opts.isAttempted || opts.isCorrect) return null;
  if (isReadingErrorInsight(opts.aiInsight)) return 'reading';
  if (
    timeTaken != null &&
    opts.avgTime > 0 &&
    timeTaken >= opts.avgTime * 1.2
  ) {
    return 'time-pressure';
  }
  if (timeTaken != null && timeTaken < 30) return 'careless';
  const diff = getQuestionDifficulty(question);
  if (timeTaken != null && timeTaken >= opts.avgTime && diff === 'hard') return 'conceptual';
  if (timeTaken != null && timeTaken >= opts.avgTime * 1.2) return 'conceptual';
  return 'careless';
}

/** Reject labels that are really question stems, not chapter/topic names. */
const SUBJECT_NAME_ALIASES: Record<string, string> = {
  maths: 'maths',
  math: 'maths',
  mathematics: 'maths',
  physics: 'physics',
  phy: 'physics',
  chemistry: 'chemistry',
  chem: 'chemistry',
  biology: 'biology',
  bio: 'biology',
  science: 'science',
  general: 'general',
};

function normalizeSubjectKey(raw: unknown): string {
  const plain = String(raw || '')
    .toLowerCase()
    .trim()
    .split('__deleted__')[0]
    .replace(/_\d+$/, '')
    .trim();
  return SUBJECT_NAME_ALIASES[plain] || plain || 'general';
}

function subjectDisplayName(raw: unknown): string {
  const key = normalizeSubjectKey(raw);
  const labels: Record<string, string> = {
    maths: 'Mathematics',
    physics: 'Physics',
    chemistry: 'Chemistry',
    biology: 'Biology',
    science: 'Science',
    general: 'General',
  };
  return labels[key] || String(raw || 'Subject').replace(/\b\w/g, (c) => c.toUpperCase());
}

function isSubjectOnlyLabel(raw: string): boolean {
  const lower = String(raw || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  if (!lower) return true;
  if (SUBJECT_NAME_ALIASES[lower]) return true;
  if (/^(maths?|mathematics|physics|chemistry|biology|science)\s+fundamentals$/i.test(lower)) {
    return true;
  }
  return false;
}

function isUsableTopicLabel(raw: string): boolean {
  const s = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!s || s.length < 2 || s.length > 48) return false;
  if (isSubjectOnlyLabel(s)) return false;
  const lower = s.toLowerCase();
  if (
    /^(general|unknown|n\/a|na|misc|miscellaneous|chapter|unit|default|other|none|core concepts)$/i.test(
      lower
    )
  ) {
    return false;
  }
  if (/^\d+(\s+\d+)*$/.test(lower)) return false;
  if ((lower.match(/\d/g) || []).length >= (lower.match(/[a-z]/g) || []).length) return false;
  if (/\?/.test(s)) return false;
  // Exam paper instruction boilerplate (often mistaken for topics)
  if (
    /\b(directions?|instruction|read the following|each of the following|four choices|choose the correct|select the correct option|fill in the blanks?|answer the following)\b/i.test(
      lower
    )
  ) {
    return false;
  }
  if (
    /\b(which of the following|what is the|how many|find the|calculate|for the given|select the correct|greatest among|least among)\b/i.test(
      lower
    )
  ) {
    return false;
  }
  if (/^(following|among|greatest|least|given|below|above|correct|option|choose|select|which|what|find)\b/i.test(lower)) {
    return false;
  }
  if (s.split(/\s+/).length > 8) return false;
  return true;
}

const TOPIC_INFER_PATTERNS: Array<{ topic: string; regex: RegExp }> = [
  { topic: 'Rational Numbers', regex: /\brational numbers?\b|\bterminating decimals?\b|\bnon[- ]terminating\b|\badditive inverse\b/i },
  { topic: 'Comparing Numbers', regex: /\bgreatest among\b|\bleast among\b|\bwhich is (?:the )?(?:greatest|least|largest|smallest)\b/i },
  { topic: 'Fractions and Decimals', regex: /\bfractions?\b|\bdecimals?\b|\bnumerator\b|\bdenominator\b/i },
  { topic: 'Arithmetic Progression', regex: /\barithmetic progression\b|\ba\.?p\.?\b/i },
  { topic: 'Quadrilateral Properties', regex: /\bquadrilateral\b|\bparallelogram\b|\brhombus\b|\btrapez/i },
  { topic: 'Polygon Angles', regex: /\bpolygon\b|\binterior angles?\b|\bexterior angles?\b/i },
  { topic: 'Ratio and Proportion', regex: /\bratios?\b|\bproportions?\b/i },
  { topic: 'Linear Equations', regex: /\blinear equations?\b|\bsolve for\b/i },
  { topic: 'Probability', regex: /\bprobability\b|\bchance\b|\boutcomes?\b/i },
  { topic: 'Force and Laws of Motion', regex: /\bnet force\b|\bnewton\b|\baccelerat/i },
  { topic: 'Motion and Kinematics', regex: /\bmotion\b|\bvelocity\b|\bacceleration\b|\bdisplacement\b/i },
  { topic: 'Pressure and Hydraulics', regex: /\bhydraulic\b|\bpiston\b|\bpascal\b|\bpressure\b/i },
  { topic: 'Atomic Structure', regex: /\batomic numbers?\b|\bmass numbers?\b|\bneutrons?\b|\bprotons?\b|\belectrons?\b/i },
  { topic: 'Electricity and Circuits', regex: /\bohm\b|\bcurrent\b|\bvoltage\b|\bresistance\b|\bcircuits?\b/i },
  { topic: 'Hybridization', regex: /\bhybridization\b|\bhybrid orbital\b|\bsp\s*3\b|\bsp\s*2\b/i },
  { topic: 'Oxidation States', regex: /\boxidation states?\b|\boxidation numbers?\b/i },
  { topic: 'Molar Mass and Stoichiometry', regex: /\bmolar mass\b|\bmolecular mass\b|\bmolarity\b|\bmoles?\b/i },
  { topic: 'Acids, Bases and Salts', regex: /\bacids?\b|\bbases?\b|\bsalts?\b|\bph\b/i },
  { topic: 'Carbon Compounds', regex: /\bcarbon\b|\bhydrocarbons?\b|\borganic\b/i },
  { topic: 'Cell Structure', regex: /\bcell membrane\b|\bcytoplasm\b|\bnucleus\b|\borganelles?\b/i },
  { topic: 'Life Processes', regex: /\bphotosynthesis\b|\brespiration\b|\bexcretion\b|\bnutrition\b/i },
  { topic: 'Heredity and Evolution', regex: /\bheredity\b|\bevolution\b|\bgenes?\b|\bdna\b/i },
];

function inferTopicFromQuestionText(q: Question): string {
  const text = String(q.questionText || '')
    .replace(/^directions?\s*[:.\-–—]?\s*/i, '')
    .replace(/^each of the following[^.!?]{0,120}[.!?]\s*/i, '')
    .replace(/^read the following[^.!?]{0,120}[.!?]\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '';
  const matched = TOPIC_INFER_PATTERNS.find((item) => item.regex.test(text));
  return matched?.topic || '';
}

function resolveQuestionTopicLabel(
  q: Question,
  insight?: { conceptGap?: string; subject?: string; topic?: string } | null
): string {
  const candidates = [
    q.chapter,
    q.topic,
    (q as { subTopic?: string }).subTopic,
    q.sectionHeading,
    insight?.topic,
  ];
  for (const c of candidates) {
    if (isUsableTopicLabel(String(c || ''))) return String(c).trim();
  }

  // Prefer explicit Topic: "…" from analysis text — not the stem quote.
  const gap = String(insight?.conceptGap || '');
  const topicTagged =
    gap.match(/\bTopic:\s*[“"]([^”"]{2,48})[”"]/i) ||
    gap.match(/\([“"]([^”"]{2,48})[”"]\s*,\s*(?:maths|physics|chemistry|biology)\b/i);
  if (topicTagged?.[1] && isUsableTopicLabel(topicTagged[1])) {
    return topicTagged[1].trim();
  }

  const inferred = inferTopicFromQuestionText(q);
  if (inferred && isUsableTopicLabel(inferred)) return inferred;

  return 'Core concepts';
}

/** Typical school-exam budget per MCQ (seconds). Never use the student's own average as the bar. */
const IDEAL_SECONDS_PER_QUESTION = 60;

/**
 * Fast vs slow must be meaningful in exam terms:
 * - Under ~30s / half of ideal → Fast (rushed or sharp)
 * - Over ~1.25× ideal → Slow (stuck / effortful)
 * When per-question times are missing, use overall paper pace (e.g. 3s/q ⇒ all Fast).
 */
function isFastQuestionPace(
  timeSec: number | null,
  overallAvgSec: number,
  idealSec: number = IDEAL_SECONDS_PER_QUESTION
): boolean {
  const fastCut = Math.max(25, idealSec * 0.5);
  if (timeSec != null && timeSec > 0) {
    return timeSec < fastCut;
  }
  // No per-question clock — whole-paper pace decides
  if (overallAvgSec <= 0) return false;
  if (overallAvgSec <= fastCut) return true;
  if (overallAvgSec >= idealSec * 1.25) return false;
  return overallAvgSec < idealSec;
}

function isSlowQuestionPace(
  timeSec: number | null,
  overallAvgSec: number,
  idealSec: number = IDEAL_SECONDS_PER_QUESTION
): boolean {
  const slowCut = idealSec * 1.25;
  if (timeSec != null && timeSec > 0) {
    return timeSec >= slowCut;
  }
  if (overallAvgSec <= 0) return false;
  return overallAvgSec >= slowCut;
}

function getTimeXAccuracyQuadrant(
  questions: Question[],
  getUserAnswer: (q: Question, i: number) => unknown,
  compare: (q: Question, ua: unknown, ca: unknown) => boolean,
  totalTime: number,
  getTimeSec?: (q: Question, i: number, ua: unknown) => number | null
): { fastWrong: number; fastRight: number; slowWrong: number; slowRight: number } {
  const out = { fastWrong: 0, fastRight: 0, slowWrong: 0, slowRight: 0 };
  if (!questions.length) return out;
  const overallAvg = totalTime / Math.max(questions.length, 1);
  const ideal = IDEAL_SECONDS_PER_QUESTION;

  let timedCount = 0;
  questions.forEach((q, i) => {
    const ua = getUserAnswer(q, i);
    const attempted = ua !== undefined && ua !== null && ua !== '';
    if (!attempted) return;
    const t =
      getTimeSec?.(q, i, ua) ??
      getAnswerTimeSeconds(ua);
    if (t != null && t > 0) timedCount += 1;
    const right = compare(q, ua, q.correctAnswer);

    // Prefer explicit fast/slow; mid-pace uses overall paper bias so 3s/q never becomes "Slow"
    let fast: boolean;
    if (t != null && t > 0) {
      if (isFastQuestionPace(t, overallAvg, ideal)) fast = true;
      else if (isSlowQuestionPace(t, overallAvg, ideal)) fast = false;
      else fast = overallAvg <= ideal; // mid band → follow paper pace
    } else {
      fast = isFastQuestionPace(null, overallAvg, ideal);
    }

    if (fast && right) out.fastRight += 1;
    else if (fast && !right) out.fastWrong += 1;
    else if (!fast && right) out.slowRight += 1;
    else out.slowWrong += 1;
  });

  // If nothing was attempted, leave zeros
  void timedCount;
  return out;
}

function getDNAScores(
  result: ExamResult,
  aiAnalysis: AiExamAnalysis | null
): { accuracy: number; speed: number; concept: number; difficulty: number; consistency: number } {
  const attempted = (result.correctAnswers || 0) + (result.wrongAnswers || 0);
  const total = result.totalQuestions || attempted + (result.unattempted || 0);
  const accuracy = total > 0 ? (result.correctAnswers / total) * 100 : 0;
  const avgTime = total > 0 ? result.timeTaken / total : 120;
  const speed = Math.max(0, Math.min(100, 100 - (avgTime / 180) * 100));
  const concept =
    aiAnalysis?.strengths?.length && aiAnalysis.strengths.length > 0
      ? Math.min(100, 40 + aiAnalysis.strengths.length * 15)
      : accuracy * 0.6;
  const difficulty = Math.min(
    100,
    ((result.obtainedMarks || 0) / Math.max(result.totalMarks || 1, 1)) * 100 + 20
  );
  const completion = total > 0 ? (attempted / total) * 100 : 0;
  const consistency = Math.min(100, (accuracy + completion) / 2);
  return { accuracy, speed, concept, difficulty, consistency };
}

function getDNAProfileLabel(
  dna: ReturnType<typeof getDNAScores>,
  accuracyPct: number,
  avgTimePerQ: number
): string {
  // 3s/q with weak accuracy is rushed guessing — not "balanced"
  if (avgTimePerQ > 0 && avgTimePerQ < 45 && accuracyPct < 55) return '⚡ Rushed Reader';
  if (accuracyPct < 30 && avgTimePerQ < 60) return '⚡ Rushed Reader';
  if (dna.accuracy >= 70) return '🎯 Precision Player';
  if (dna.speed < 40) return '🐢 Deep Thinker';
  if (dna.concept < 40) return '🧩 Concept Builder';
  return '📊 Balanced Learner';
}

function sanitizePlanTopicTitle(raw: string, fallbackSubject?: string): string {
  const cleaned = String(raw || '')
    .replace(/^low accuracy\/?confidence in\s+/i, '')
    .replace(/\s*\(skips detected\)\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (isUsableTopicLabel(cleaned)) return cleaned;
  const subj = String(fallbackSubject || '').trim();
  if (subj) return `Mixed ${subjectDisplayName(subj)} revision`;
  return 'Mixed revision';
}

function generatePlanTopics(
  result: ExamResult,
  aiAnalysis: AiExamAnalysis | null,
  chapterHeatmap?: Record<string, Array<{ name: string; pct: number; wrong?: number; total?: number }>>
): PlanTopic[] {
  const collected: Array<{ title: string; subject: string; pct: number; wrong: number }> = [];

  if (chapterHeatmap) {
    Object.entries(chapterHeatmap).forEach(([subj, rows]) => {
      rows.forEach((row) => {
        if (row.pct < 70 && isUsableTopicLabel(row.name)) {
          collected.push({
            title: row.name,
            subject: subj,
            pct: row.pct,
            wrong: row.wrong || 0,
          });
        }
      });
    });
  }

  (aiAnalysis?.focusAreas || []).forEach((f) => {
    const fromTopicField = (f as { topic?: string }).topic;
    const fromIssue = String(f.issue || '').match(/in\s+(.+?)(?:\s*\(|$)/i)?.[1];
    const title = sanitizePlanTopicTitle(fromTopicField || fromIssue || '', f.subject);
    if (!isUsableTopicLabel(title)) return;
    if (collected.some((c) => c.title.toLowerCase() === title.toLowerCase())) return;
    collected.push({
      title,
      subject: normalizeSubjectKey(f.subject),
      pct: 40,
      wrong: 0,
    });
  });

  collected.sort((a, b) => a.pct - b.pct || b.wrong - a.wrong);

  const unique = collected.filter(
    (t, i, arr) => arr.findIndex((x) => x.title.toLowerCase() === t.title.toLowerCase()) === i
  );

  if (unique.length === 0) {
    const weakSubs = Object.entries(result.subjectWiseScore || {})
      .filter(([, score]) => score && score.total > 0 && score.correct / score.total < 0.7)
      .sort((a, b) => a[1].correct / a[1].total - b[1].correct / b[1].total);
    if (weakSubs.length > 0) {
      return weakSubs.slice(0, 3).map(([subj, score], i) => {
        const pct = score.total > 0 ? (score.correct / score.total) * 100 : 0;
        const wrong = Math.max(0, score.total - score.correct);
        return {
          topicNum: i + 1,
          title: `Mixed ${subjectDisplayName(subj)} revision`,
          subtitle: `${wrong} to review · ${Math.round(pct)}% accuracy`,
          duration: `${Math.min(35, 15 + wrong)} min`,
          subject: normalizeSubjectKey(subj),
          pct,
          wrongCount: wrong,
        };
      });
    }
    return [
      {
        topicNum: 1,
        title: 'Review wrong answers',
        subtitle: 'Go through every incorrect question from this paper',
        duration: '20 min',
        pct: 0,
        wrongCount: result.wrongAnswers || 0,
      },
    ];
  }

  return unique.slice(0, 5).map((t, i) => ({
    topicNum: i + 1,
    title: t.title,
    subtitle:
      t.wrong > 0
        ? `${t.wrong} wrong on this paper · ${Math.round(t.pct)}% accuracy`
        : `${Math.round(t.pct)}% accuracy · priority drill`,
    duration: `${Math.min(40, 12 + Math.max(t.wrong, 2) * 3)} min`,
    subject: t.subject,
    pct: t.pct,
    wrongCount: t.wrong,
  }));
}

function topicLabelMatches(a: string, b: string): boolean {
  const x = String(a || '')
    .toLowerCase()
    .trim();
  const y = String(b || '')
    .toLowerCase()
    .trim();
  if (!x || !y) return false;
  if (x === y) return true;
  if (x.includes(y) || y.includes(x)) return true;
  return false;
}

function getGradeRingColor(gradeLetter: string): string {
  if (gradeLetter.startsWith('A')) return '#10b981';
  if (gradeLetter.startsWith('B')) return '#10b981';
  if (gradeLetter.startsWith('C')) return '#f59e0b';
  return '#ef4444';
}

function getGradePillClass(gradeLetter: string): string {
  if (gradeLetter.startsWith('A') || gradeLetter.startsWith('B')) {
    return 'bg-emerald-100 text-emerald-800';
  }
  if (gradeLetter.startsWith('C')) return 'bg-amber-100 text-amber-800';
  return 'bg-red-100 text-red-800';
}

function PerformanceDNARadar({ scores }: { scores: ReturnType<typeof getDNAScores> }) {
  const axes = [
    { key: 'accuracy', label: 'Accuracy' },
    { key: 'speed', label: 'Speed' },
    { key: 'concept', label: 'Concept' },
    { key: 'difficulty', label: 'Difficulty' },
    { key: 'consistency', label: 'Consistency' },
  ] as const;
  const cx = 120;
  const cy = 120;
  const r = 80;
  const n = axes.length;
  const angleStep = (2 * Math.PI) / n;
  const valueAt = (i: number) => {
    const k = axes[i].key;
    return (scores[k] / 100) * r;
  };
  const point = (i: number, radius: number) => {
    const a = -Math.PI / 2 + i * angleStep;
    return { x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) };
  };
  const dataPoints = axes.map((_, i) => point(i, valueAt(i)));
  const poly = dataPoints.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <svg viewBox="0 0 240 240" className="w-full max-w-[240px] mx-auto">
      {[0.25, 0.5, 0.75, 1].map((level) => (
        <polygon
          key={level}
          points={axes.map((_, i) => {
            const p = point(i, r * level);
            return `${p.x},${p.y}`;
          }).join(' ')}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth="1"
        />
      ))}
      {axes.map((ax, i) => {
        const p = point(i, r);
        const lp = point(i, r + 18);
        return (
          <g key={ax.key}>
            <line x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="#e5e7eb" strokeWidth="1" />
            <text x={lp.x} y={lp.y} textAnchor="middle" fontSize="9" fill="#6b7280">
              {ax.label}
            </text>
          </g>
        );
      })}
      <polygon points={poly} fill="rgba(124,58,237,0.25)" stroke="#7C3AED" strokeWidth="2" />
    </svg>
  );
}

function getStudentDisplayName(): string {
  if (typeof window === 'undefined') return 'Student';
  try {
    const raw = localStorage.getItem('user');
    if (!raw) return 'Student';
    const u = JSON.parse(raw);
    return u?.fullName || u?.name || u?.email?.split('@')[0] || 'Student';
  } catch {
    return 'Student';
  }
}

type WeakArea = {
  subject: string;
  percentage: number;
  correct: number;
  total: number;
  color: string;
  bgColor: string;
};

/** Handles string ids and populated / extended JSON shapes so /review URLs stay valid. */
function normalizeMongoId(value: unknown): string {
  if (value == null || value === '') return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  if (typeof value === 'object' && value !== null) {
    const o = value as { _id?: unknown; $oid?: unknown };
    if (typeof o.$oid === 'string') return o.$oid.trim();
    if (o.$oid != null) return String(o.$oid).trim();
    if (typeof o._id === 'string') return o._id.trim();
    if (o._id != null) return normalizeMongoId(o._id);
  }
  return '';
}

export default function DetailedAnalysis({ result, examTitle, onBack }: DetailedAnalysisProps) {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState('ai');
  const [questionFilter, setQuestionFilter] = useState<QuestionFilterId>('all');
  const [expandedQuestionIndex, setExpandedQuestionIndex] = useState<number | null>(null);
  const [showAllQuestionsList, setShowAllQuestionsList] = useState(false);
  const [selectedPlanDayIndex, setSelectedPlanDayIndex] = useState(0);
  const planQueueRef = useRef<HTMLDivElement>(null);
  const [mobileQuestionIndex, setMobileQuestionIndex] = useState(0);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const [animDirection, setAnimDirection] = useState<'up' | 'down'>('up');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiAnalysis, setAiAnalysis] = useState<AiExamAnalysis | null>(null);
  const [analysisMeta, setAnalysisMeta] = useState<AnalysisMeta | null>(null);
  /** Merges in questions/answers from /review when the parent result has no question list (e.g. right after submit). */
  const [displayResult, setDisplayResult] = useState<ExamResult>(result);

  useEffect(() => {
    setDisplayResult((prev) => ({
      ...prev,
      ...result,
      answers:
        result.answers && typeof result.answers === 'object' && Object.keys(result.answers).length > 0
          ? result.answers
          : prev.answers,
      questions:
        Array.isArray(result.questions) && result.questions.length > 0
          ? result.questions
          : prev.questions,
    }));
  }, [result]);

  const normalizeLegacyExamText = (value: unknown, subject?: string): string =>
    normalizeAndFormatExamDisplayText(value, subject);
  const normalizeExamText = (value: unknown, subject?: string): string =>
    normalizeLegacyExamText(value, subject);
  const [animatedValues, setAnimatedValues] = useState({
    percentage: 0,
    correctAnswers: 0,
    wrongAnswers: 0,
    unattempted: 0,
    obtainedMarks: 0
  });

  // Helper function to extract text from option objects
  const getOptionText = (option: any, subject?: string): string => {
    console.log('getOptionText called with:', option, 'type:', typeof option);
    
    if (option === null || option === undefined) {
      console.log('Option is null/undefined, returning empty string');
      return '';
    }
    
    if (typeof option === 'string') {
      console.log('Option is string:', option);
      return normalizeLegacyExamText(option, subject);
    }
    
    if (typeof option === 'number') {
      console.log('Option is number:', option);
      return normalizeLegacyExamText(String(option), subject);
    }
    
    if (typeof option === 'boolean') {
      console.log('Option is boolean:', option);
      return normalizeLegacyExamText(String(option), subject);
    }
    
    if (typeof option === 'object' && option !== null) {
      console.log('Option is object:', option);
      
      // Try different possible text properties
      if (option.text !== undefined && option.text !== null) {
        console.log('Found text property:', option.text);
        return normalizeLegacyExamText(String(option.text), subject);
      }
      if (option.label !== undefined && option.label !== null) {
        console.log('Found label property:', option.label);
        return normalizeLegacyExamText(String(option.label), subject);
      }
      if (option.value !== undefined && option.value !== null) {
        console.log('Found value property:', option.value);
        return normalizeLegacyExamText(String(option.value), subject);
      }
      if (option.answer !== undefined && option.answer !== null) {
        console.log('Found answer property:', option.answer);
        return normalizeLegacyExamText(String(option.answer), subject);
      }
      if (option._id !== undefined && option._id !== null) {
        console.log('Found _id property:', option._id);
        return normalizeLegacyExamText(String(option._id), subject);
      }
      
      // If it's an array, join the elements
      if (Array.isArray(option)) {
        console.log('Option is array:', option);
        return option.map((o) => getOptionText(o, subject)).join(', ');
      }
      
      // Last resort: stringify the object
      console.log('Using JSON.stringify as last resort:', JSON.stringify(option));
      return normalizeLegacyExamText(JSON.stringify(option), subject);
    }
    
    console.log('Fallback to String():', String(option));
    return normalizeLegacyExamText(String(option), subject);
  };

  // Helper function to check if an option is correct
  const isOptionCorrect = (option: any): boolean => {
    if (typeof option === 'object' && option !== null) {
      return option.isCorrect === true;
    }
    return false;
  };

  // Helper function to compare answers properly
  const getQuestionOptions = (question?: Question) => {
    if (!question?.options || !Array.isArray(question.options)) return [];
    const subj = question?.subject;
    return question.options.map((option, index) => {
      if (typeof option === 'string') {
        return {
          text: normalizeExamText(option, subj),
          rawText: String(option),
          id: '',
          index,
          letter: String.fromCharCode(65 + index),
        };
      }
      return {
        text: normalizeExamText(option?.text || option?._id || '', subj),
        rawText: String(option?.text || ''),
        id: String(option?._id || ''),
        index,
        letter: String.fromCharCode(65 + index),
      };
    });
  };

  const resolveSingleAnswerText = (question: Question, rawAnswer: any): string => {
    if (rawAnswer === undefined || rawAnswer === null || rawAnswer === '') return '';

    const options = getQuestionOptions(question);
    const rawText = String(rawAnswer).trim();
    const normalizedRaw = normalizeExamText(rawText, question.subject);

    if (!options.length || question.questionType === 'integer') {
      return normalizedRaw;
    }

    const optionTexts = options.map((o) => o.rawText || o.text).filter(Boolean);
    const resolved = resolveAnswerAgainstOptions(rawText, optionTexts);
    if (resolved) {
      const match = options.find(
        (o) =>
          o.rawText === resolved ||
          o.text === resolved ||
          o.rawText.toLowerCase() === resolved.toLowerCase(),
      );
      return match?.text || normalizedRaw;
    }

    return normalizedRaw;
  };

  const resolveAnswerTexts = (question: Question, rawAnswer: any): string[] => {
    const list = Array.isArray(rawAnswer) ? rawAnswer : [rawAnswer];
    return list
      .map((item) => resolveSingleAnswerText(question, item))
      .filter((text) => !!text);
  };

  const compareAnswers = (question: Question, userAnswer: any, correctAnswer: any): boolean => {
    const userTexts = resolveAnswerTexts(question, userAnswer).sort((a, b) => a.localeCompare(b));
    const correctTexts = resolveAnswerTexts(question, correctAnswer).sort((a, b) => a.localeCompare(b));
    if (userTexts.length === 0 || correctTexts.length === 0) return false;
    if (userTexts.length !== correctTexts.length) return false;
    return JSON.stringify(userTexts) === JSON.stringify(correctTexts);
  };

  const normalizeAnswerKey = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string' || typeof value === 'number') return String(value).trim().toLowerCase();
    if (typeof value === 'object') {
      const obj = value as any;
      if (obj.$oid) return String(obj.$oid).trim().toLowerCase();
      if (obj._id) return String(obj._id).trim().toLowerCase();
      if (obj.id) return String(obj.id).trim().toLowerCase();
    }
    return String(value).trim().toLowerCase();
  };

  const getUserAnswerForQuestion = (question: Question, questionIndex: number): any => {
    const baseAnswers = result.answers && typeof result.answers === 'object' && !Array.isArray(result.answers) ? result.answers : {};
    const extraAnswers =
      displayResult.answers && typeof displayResult.answers === 'object' && !Array.isArray(displayResult.answers)
        ? displayResult.answers
        : {};
    const answerMap = { ...baseAnswers, ...extraAnswers };
    const questionId = normalizeAnswerKey((question as any)?._id);
    const candidateKeys = [
      (question as any)?._id,
      (question as any)?.id,
      (question as any)?.questionId,
      questionId,
      String(questionIndex),
      String(questionIndex + 1),
    ]
      .map((k) => normalizeAnswerKey(k))
      .filter(Boolean);

    for (const key of candidateKeys) {
      const direct = (answerMap as any)[key];
      if (direct !== undefined) return direct;
    }

    if (!questionId) return undefined;

    for (const [rawKey, rawValue] of Object.entries(answerMap)) {
      if (normalizeAnswerKey(rawKey) === questionId) {
        return rawValue;
      }
    }

    return undefined;
  };

  const getAnalyticsForQuestion = useCallback(
    (question: Question, questionIndex: number) => {
      const rows =
        (displayResult as ExamResult).questionAnalytics ??
        result.questionAnalytics;
      if (!Array.isArray(rows) || !rows.length) return undefined;
      const qid = normalizeAnswerKey((question as { _id?: string })._id);
      return rows.find(
        (row) =>
          row.index === questionIndex ||
          row.index === questionIndex + 1 ||
          (row.questionId && normalizeAnswerKey(row.questionId) === qid)
      );
    },
    [displayResult, result.questionAnalytics]
  );

  const getQuestionTimeForIndex = useCallback(
    (question: Question, questionIndex: number, userAnswer: unknown) => {
      const fromAnswer = getAnswerTimeSeconds(userAnswer);
      if (fromAnswer != null) return fromAnswer;
      const row = getAnalyticsForQuestion(question, questionIndex);
      if (row?.timeTaken != null && row.timeTaken > 0) return row.timeTaken;
      return null;
    },
    [getAnalyticsForQuestion]
  );

  // Animate values on mount
  useEffect(() => {
    const duration = 2000;
    const steps = 60;
    const stepDuration = duration / steps;
    
    const animateValue = (start: number, end: number, callback: (value: number) => void) => {
      let current = start;
      const increment = (end - start) / steps;
      
      const timer = setInterval(() => {
        current += increment;
        if (current >= end) {
          current = end;
          clearInterval(timer);
        }
        callback(Math.round(current));
      }, stepDuration);
    };

    const animateFloatValue = (start: number, end: number, callback: (value: number) => void) => {
      let current = start;
      const increment = (end - start) / steps;

      const timer = setInterval(() => {
        current += increment;
        if ((increment >= 0 && current >= end) || (increment < 0 && current <= end)) {
          current = end;
          clearInterval(timer);
        }
        callback(Number(current.toFixed(1)));
      }, stepDuration);
    };

    // Add a small delay before starting animations
    setTimeout(() => {
      const attempted = (result.correctAnswers || 0) + (result.wrongAnswers || 0);
      const totalQuestionCount = Number(result.totalQuestions || 0)
        || (attempted + (result.unattempted || 0));
      const derivedPercentage = totalQuestionCount > 0
        ? (result.correctAnswers / totalQuestionCount) * 100
        : 0;
      animateFloatValue(0, derivedPercentage, (value) => setAnimatedValues(prev => ({ ...prev, percentage: value })));
      animateValue(0, result.correctAnswers, (value) => setAnimatedValues(prev => ({ ...prev, correctAnswers: value })));
      animateValue(0, result.wrongAnswers, (value) => setAnimatedValues(prev => ({ ...prev, wrongAnswers: value })));
      animateValue(0, result.unattempted, (value) => setAnimatedValues(prev => ({ ...prev, unattempted: value })));
      animateValue(0, result.obtainedMarks, (value) => setAnimatedValues(prev => ({ ...prev, obtainedMarks: value })));
    }, 300);
  }, [result]);

  // Merge parent `result` updates without wiping questions we loaded via /review (parent often passes a new object each render).
  useEffect(() => {
    setDisplayResult((dr) => {
      const parentHasQuestions = Array.isArray(result.questions) && result.questions.length > 0;
      if (parentHasQuestions) {
        return { ...result, questions: result.questions };
      }
      const mergedAnswers = (() => {
        const fromParent =
          result.answers && typeof result.answers === 'object' && !Array.isArray(result.answers)
            ? (result.answers as Record<string, unknown>)
            : {};
        const fromDisplay =
          dr.answers && typeof dr.answers === 'object' && !Array.isArray(dr.answers)
            ? (dr.answers as Record<string, unknown>)
            : {};
        return { ...fromDisplay, ...fromParent };
      })();
      return {
        ...result,
        questions: dr.questions?.length ? dr.questions : result.questions,
        answers: mergedAnswers,
      };
    });
  }, [
    normalizeMongoId((result as ExamResult & { _id?: unknown })._id),
    normalizeMongoId(result.examId),
    result.attemptNumber,
    result.correctAnswers,
    result.wrongAnswers,
    result.unattempted,
    result.totalQuestions,
    result.obtainedMarks,
    result.totalMarks,
    result.percentage,
    result.timeTaken,
    result.examTitle,
    result.questions?.length,
  ]);

  const [reviewHydrated, setReviewHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const hydrateFromReview = async () => {
      const examIdStr = normalizeMongoId(result.examId);
      if (!examIdStr) {
        setReviewHydrated(true);
        return;
      }

      try {
        const token = getAuthToken();
        const resultRowId = normalizeMongoId((result as ExamResult & { _id?: unknown })._id);
        const rid =
          resultRowId !== '' ? `?resultId=${encodeURIComponent(resultRowId)}` : '';
        const res = await fetch(`${API_BASE_URL}/api/student/exam-results/${examIdStr}/review${rid}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
        if (!res.ok || cancelled) {
          if (!cancelled) setReviewHydrated(true);
          return;
        }
        const json = await res.json().catch(() => ({}));
        const qs = json?.data?.questions;
        const srv = json?.data?.result as ExamResult | undefined;
        if (!srv || cancelled) {
          if (!cancelled) setReviewHydrated(true);
          return;
        }

        setDisplayResult((prev) => {
          const prevAnswers =
            prev.answers && typeof prev.answers === 'object' && !Array.isArray(prev.answers)
              ? (prev.answers as Record<string, unknown>)
              : {};
          const serverAnswers =
            srv.answers && typeof srv.answers === 'object' && !Array.isArray(srv.answers)
              ? srv.answers
              : {};
          return {
            ...prev,
            ...srv,
            _id: srv._id != null ? String(srv._id) : prev._id,
            examId: String(srv.examId || prev.examId || examIdStr),
            questions:
              Array.isArray(qs) && qs.length > 0
                ? (qs as ExamResult['questions'])
                : prev.questions?.length
                  ? prev.questions
                  : (srv.questions as ExamResult['questions']),
            answers:
              Object.keys(serverAnswers).length > 0
                ? { ...prevAnswers, ...serverAnswers }
                : prev.answers,
          };
        });
      } catch {
        /* non-fatal */
      } finally {
        if (!cancelled) setReviewHydrated(true);
      }
    };

    setReviewHydrated(false);
    void hydrateFromReview();
    return () => {
      cancelled = true;
    };
  }, [normalizeMongoId(result.examId), normalizeMongoId((result as ExamResult & { _id?: unknown })._id), result.attemptNumber]);

  useEffect(() => {
    if (!reviewHydrated) return;
    let cancelled = false;
    const fetchAiReport = async () => {
      setAiLoading(true);
      setAiError('');
      const controller = new AbortController();
      const timeoutMs = 120_000;
      const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
      try {
        const token = getAuthToken();
        const response = await fetch(`${API_BASE_URL}/api/student/exam-results/ai-analysis`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ result: displayResult, examTitle }),
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload?.success) {
          throw new Error(payload?.message || 'Failed to generate AI report');
        }
        if (!cancelled) {
          setAiAnalysis(payload?.data?.analysis || null);
          setAnalysisMeta((payload?.data?.meta as AnalysisMeta) || null);
        }
      } catch (error: any) {
        if (!cancelled) {
          const aborted = error?.name === 'AbortError';
          setAiError(
            aborted
              ? 'AI report is taking longer than expected. Refresh the page in a moment or try again.'
              : error?.message || 'AI report unavailable',
          );
        }
      } finally {
        window.clearTimeout(timeoutId);
        if (!cancelled) {
          setAiLoading(false);
        }
      }
    };

    fetchAiReport();
    return () => {
      cancelled = true;
    };
  }, [
    displayResult.examId,
    displayResult.correctAnswers,
    displayResult.wrongAnswers,
    displayResult.unattempted,
    displayResult.obtainedMarks,
    displayResult.percentage,
    displayResult.attemptNumber,
    displayResult._id,
    examTitle,
    reviewHydrated,
  ]);

  const getGrade = (percentage: number) => {
    if (percentage >= 95) return { grade: 'A+', color: 'text-purple-600', bgColor: 'bg-gradient-to-r from-purple-100 to-pink-100', icon: Crown };
    if (percentage >= 90) return { grade: 'A+', color: 'text-green-600', bgColor: 'bg-gradient-to-r from-green-100 to-emerald-100', icon: Trophy };
    if (percentage >= 80) return { grade: 'A', color: 'text-green-600', bgColor: 'bg-gradient-to-r from-green-100 to-emerald-100', icon: Award };
    if (percentage >= 70) return { grade: 'B+', color: 'text-blue-600', bgColor: 'bg-gradient-to-r from-blue-100 to-cyan-100', icon: Star };
    if (percentage >= 60) return { grade: 'B', color: 'text-blue-600', bgColor: 'bg-gradient-to-r from-blue-100 to-cyan-100', icon: Target };
    if (percentage >= 50) return { grade: 'C+', color: 'text-yellow-600', bgColor: 'bg-gradient-to-r from-yellow-100 to-orange-100', icon: TrendingUp };
    if (percentage >= 40) return { grade: 'C', color: 'text-yellow-600', bgColor: 'bg-gradient-to-r from-yellow-100 to-orange-100', icon: AlertCircle };
    return { grade: 'D', color: 'text-red-600', bgColor: 'bg-gradient-to-r from-red-100 to-pink-100', icon: Flame };
  };

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours > 0 ? `${hours}h ` : ''}${minutes}m ${secs}s`;
  };

  const attemptedCount = (result.correctAnswers || 0) + (result.wrongAnswers || 0);
  const totalQuestionCount = Number(result.totalQuestions || 0)
    || (attemptedCount + (result.unattempted || 0));
  const displayPercentage = totalQuestionCount > 0
    ? (result.correctAnswers / totalQuestionCount) * 100
    : 0;
  const accuracyRate = attemptedCount > 0
    ? (result.correctAnswers / attemptedCount) * 100
    : 0;
  const completionRate = totalQuestionCount > 0
    ? ((result.correctAnswers + result.wrongAnswers) / totalQuestionCount) * 100
    : 0;

  const marksPercentForGrade =
    (result.totalMarks || 0) > 0
      ? ((result.obtainedMarks || 0) / (result.totalMarks || 1)) * 100
      : displayPercentage;
  const grade = getGrade(marksPercentForGrade);
  const GradeIcon = grade.icon;
  const marksPercent =
    (result.totalMarks || 0) > 0
      ? ((result.obtainedMarks || 0) / (result.totalMarks || 1)) * 100
      : displayPercentage;

  const normalizedRiskLevel = String(aiAnalysis?.riskLevel || '').toLowerCase();
  const riskBadgeClass =
    normalizedRiskLevel === 'high'
      ? 'bg-red-100 text-red-800 border-red-200'
      : normalizedRiskLevel === 'medium'
      ? 'bg-yellow-100 text-yellow-800 border-yellow-200'
      : 'bg-green-100 text-green-800 border-green-200';

  const getPerformanceInsights = () => {
    const insights = [];
    
    if (displayPercentage >= 90) {
      insights.push({
        icon: Crown,
        title: "Outstanding Performance!",
        description: "You've achieved exceptional results. You're among the top performers!",
        color: "text-purple-600",
        bgColor: "bg-gradient-to-r from-purple-50 to-pink-50 border-purple-200"
      });
    }
    
    if (result.correctAnswers / result.totalQuestions >= 0.8) {
      insights.push({
        icon: Zap,
        title: "High Accuracy",
        description: "Your accuracy rate is excellent! Keep up the precision.",
        color: "text-green-600",
        bgColor: "bg-gradient-to-r from-green-50 to-emerald-50 border-green-200"
      });
    }
    
    if (result.timeTaken < result.totalQuestions * 60) {
      insights.push({
        icon: Clock,
        title: "Speed Master",
        description: "You completed the exam efficiently. Great time management!",
        color: "text-blue-600",
        bgColor: "bg-gradient-to-r from-blue-50 to-cyan-50 border-blue-200"
      });
    }
    
    if (result.unattempted === 0) {
      insights.push({
        icon: Target,
        title: "Complete Attempt",
        description: "You attempted all questions. Excellent completion rate!",
        color: "text-indigo-600",
        bgColor: "bg-gradient-to-r from-indigo-50 to-purple-50 border-indigo-200 border-l-4"
      });
    }

    const attemptRate = totalQuestionCount > 0 ? attemptedCount / totalQuestionCount : 0;
    if (attemptRate > 0.9) {
      insights.push({
        icon: CheckCircle,
        title: 'High Attempt Rate',
        description: `You attempted ${(attemptRate * 100).toFixed(0)}% of questions — strong completion discipline.`,
        color: 'text-indigo-600',
        bgColor: 'bg-indigo-50 border-indigo-200 border-l-4',
      });
    }

    const subjects = Object.entries(result.subjectWiseScore);
    if (subjects.length > 0) {
      const best = subjects.slice(1).reduce((a, b) => {
        const pa = a[1].total > 0 ? a[1].correct / a[1].total : 0;
        const pb = b[1].total > 0 ? b[1].correct / b[1].total : 0;
        return pb > pa ? b : a;
      }, subjects[0]);
      const bestPct = best[1].total > 0 ? (best[1].correct / best[1].total) * 100 : 0;
      if (bestPct >= 50) {
        insights.push({
          icon: Crown,
          title: 'Anchor Subject',
          description: `${best[0].charAt(0).toUpperCase() + best[0].slice(1)} is your anchor at ${bestPct.toFixed(0)}% mastery.`,
          color: 'text-teal-600',
          bgColor: 'bg-teal-50 border-teal-200 border-l-4',
        });
      }
    }

    const trend = String(aiAnalysis?.predictions?.trend || '').toLowerCase();
    if (trend === 'improving') {
      insights.push({
        icon: TrendingUp,
        title: 'Trend Improvement',
        description: 'Your marks trend is improving versus recent attempts — momentum is building.',
        color: 'text-green-600',
        bgColor: 'bg-green-50 border-green-200 border-l-4',
      });
    }
    
    return insights;
  };

  const getWeakAreas = () => {
    const weakAreas: WeakArea[] = [];
    const subjects = Object.entries(result.subjectWiseScore || {});
    
    subjects.forEach(([subject, score]) => {
      if (!score || Number(score.total) <= 0) return;
      const percentage = score.total > 0 ? (score.correct / score.total) * 100 : 0;
      if (percentage < 70) {
        weakAreas.push({
          subject: subjectDisplayName(subject),
          percentage: percentage,
          correct: score.correct,
          total: score.total,
          color: percentage < 40 ? 'text-red-600' : 'text-yellow-600',
          bgColor: percentage < 40 ? 'bg-red-50 border-red-200' : 'bg-yellow-50 border-yellow-200'
        });
      }
    });
    
    return weakAreas;
  };

  const insights = getPerformanceInsights();
  const weakAreas = useMemo(() => getWeakAreas(), [result.subjectWiseScore]);
  const [weakSubjectContent, setWeakSubjectContent] = useState<WeakSubjectContentMap | null>(null);
  const [loadingWeakContent, setLoadingWeakContent] = useState(false);

  useEffect(() => {
    if (weakAreas.length === 0) {
      setWeakSubjectContent(null);
      return;
    }
    const token = typeof window !== 'undefined' ? getAuthToken() : null;
    const controller = new AbortController();

    async function fetchWeakContent() {
      setLoadingWeakContent(true);
      try {
        let topicRows: WeakTopicRow[] = Array.isArray(analysisMeta?.weakTopics)
          ? analysisMeta.weakTopics.filter((r) => r?.topic)
          : [];

        if (topicRows.length === 0 && aiAnalysis) {
          const fallback: WeakTopicRow[] = [];
          if (Array.isArray(aiAnalysis.focusAreas)) {
            aiAnalysis.focusAreas.forEach((fa) => {
              const issue = String(fa?.issue || '');
              const match = issue.match(/in\s+(.+?)(?:\s*\(|$)/i);
              const subject = String(fa?.subject || '').toLowerCase().trim();
              if (match?.[1]) {
                fallback.push({ subject, topic: match[1].trim() });
              }
            });
          }
          if (Array.isArray(aiAnalysis.questionInsights)) {
            aiAnalysis.questionInsights
              .filter((q) => q?.status === 'wrong' || q?.status === 'unattempted')
              .forEach((q) => {
                const gap = String(q?.conceptGap || '');
                const topicMatch =
                  gap.match(/[“"]([^”"]+)[”"]/) ||
                  gap.match(/\(\s*[“"]?([^"”)]+)[”"]?\s*,/);
                const subject = String(q?.subject || '').toLowerCase().trim();
                if (topicMatch?.[1]) {
                  fallback.push({ subject, topic: topicMatch[1].trim() });
                }
              });
          }
          topicRows = fallback;
        }

        const subjectsFromTopics = Array.from(
          new Set(topicRows.map((r) => r.subject).filter(Boolean))
        );
        const subjectNames =
          subjectsFromTopics.length > 0
            ? subjectsFromTopics.join(',')
            : weakAreas.map((w) => w.subject.toLowerCase()).join(',');

        const topicRowsParam = topicRows
          .slice(0, 10)
          .map((r) => `${r.subject || ''}|${r.topic}`)
          .join(',');

        const url = topicRowsParam
          ? `${API_BASE_URL}/api/student/weak-subject-content?subjects=${encodeURIComponent(subjectNames)}&topicRows=${encodeURIComponent(topicRowsParam)}`
          : `${API_BASE_URL}/api/student/weak-subject-content?subjects=${encodeURIComponent(subjectNames)}`;

        const res = await fetch(
          url,
          {
            signal: controller.signal,
            headers: {
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
              'Content-Type': 'application/json',
            },
          }
        );
        const data = await res.json().catch(() => ({}));
        if (data?.success && data.data && !controller.signal.aborted) {
          setWeakSubjectContent(data.data as WeakSubjectContentMap);
        }
      } catch (e) {
        if ((e as Error)?.name !== 'AbortError') {
          console.error(e);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoadingWeakContent(false);
        }
      }
    }

    void fetchWeakContent();
    return () => controller.abort();
  }, [weakAreas, aiAnalysis, analysisMeta]);

  const advancedExamId = normalizeMongoId(result.examId);

  const analysisQuestions =
    displayResult.questions && displayResult.questions.length > 0
      ? displayResult.questions
      : result.questions && result.questions.length > 0
        ? result.questions
        : [];

  const studentName = getStudentDisplayName();
  const examDateLabel = new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const avgTimePerQuestion =
    totalQuestionCount > 0 ? Math.floor(result.timeTaken / totalQuestionCount) : 0;
  const attemptedAccuracyPct =
    attemptedCount > 0 ? (result.correctAnswers / attemptedCount) * 100 : displayPercentage;
  const speedRatingLabel =
    avgTimePerQuestion > 0 && avgTimePerQuestion <= 25
      ? attemptedAccuracyPct < 55
        ? 'Rushed'
        : 'Sharp'
      : result.timeTaken < totalQuestionCount * 60
        ? 'Sharp'
        : avgTimePerQuestion < 90
          ? 'Balanced'
          : 'Slow';

  const dnaScores = useMemo(() => getDNAScores(result, aiAnalysis), [result, aiAnalysis]);
  const dnaProfileLabel = useMemo(
    () => getDNAProfileLabel(dnaScores, attemptedAccuracyPct, avgTimePerQuestion),
    [dnaScores, attemptedAccuracyPct, avgTimePerQuestion]
  );
  const timeQuadrant = useMemo(
    () =>
      getTimeXAccuracyQuadrant(
        analysisQuestions,
        getUserAnswerForQuestion,
        compareAnswers,
        result.timeTaken,
        (q, i, ua) => getQuestionTimeForIndex(q, i, ua)
      ),
    [analysisQuestions, result.timeTaken, displayResult.answers, result.answers, getQuestionTimeForIndex]
  );
  const carelessMistakeCount = useMemo(() => {
    let n = 0;
    let timedWrong = 0;
    analysisQuestions.forEach((q, i) => {
      const ua = getUserAnswerForQuestion(q, i);
      const attempted = ua !== undefined && ua !== null && ua !== '';
      if (!attempted || compareAnswers(q, ua, q.correctAnswer)) return;
      const t = getQuestionTimeForIndex(q, i, ua);
      if (t != null && t > 0) {
        timedWrong += 1;
        if (t < 30) n += 1;
      }
    });
    // No per-question clocks but paper averaged under 30s → treat wrongs as careless/rushed
    if (timedWrong === 0 && result.wrongAnswers > 0 && avgTimePerQuestion > 0 && avgTimePerQuestion < 30) {
      return result.wrongAnswers;
    }
    if (n === 0 && result.wrongAnswers > 0 && avgTimePerQuestion > 0 && avgTimePerQuestion < 45) {
      n = Math.max(1, Math.round(result.wrongAnswers * 0.7));
    } else if (n === 0 && result.wrongAnswers > 0) {
      n = Math.max(1, Math.round(result.wrongAnswers * 0.35));
    }
    return n;
  }, [
    analysisQuestions,
    result.wrongAnswers,
    avgTimePerQuestion,
    displayResult.answers,
    result.answers,
    getQuestionTimeForIndex,
  ]);

  const mistakeTaxonomy = useMemo(() => {
    const counts = { careless: 0, conceptual: 0, procedural: 0, time: 0, reading: 0 };
    analysisQuestions.forEach((q, i) => {
      const ua = getUserAnswerForQuestion(q, i);
      const attempted = ua !== undefined && ua !== null && ua !== '';
      const correct = compareAnswers(q, ua, q.correctAnswer);
      if (!attempted || correct) return;
      const tRaw = getQuestionTimeForIndex(q, i, ua);
      const t =
        tRaw != null && tRaw > 0
          ? tRaw
          : avgTimePerQuestion > 0 && avgTimePerQuestion < 30
            ? avgTimePerQuestion
            : null;
      const qi = aiAnalysis?.questionInsights?.find(
        (x) => x.index === i + 1 || x.index === i
      );
      const err = classifyErrorType(q, ua, t, {
        isCorrect: correct,
        isAttempted: attempted,
        avgTime: IDEAL_SECONDS_PER_QUESTION,
        totalExamTime: result.timeTaken,
        aiInsight: qi?.insight,
      });
      if (err === 'careless') counts.careless += 1;
      else if (err === 'conceptual') counts.conceptual += 1;
      else if (err === 'time-pressure') counts.time += 1;
      else if (err === 'reading') counts.reading += 1;
      else counts.procedural += 1;
    });
    if (result.wrongAnswers > 0 && counts.careless + counts.conceptual + counts.procedural + counts.time + counts.reading === 0) {
      counts.careless = Math.round(result.wrongAnswers * 0.45);
      counts.conceptual = Math.round(result.wrongAnswers * 0.3);
      counts.procedural = Math.round(result.wrongAnswers * 0.15);
      counts.time = Math.round(result.wrongAnswers * 0.1);
      counts.reading = 0;
      const assigned = counts.careless + counts.conceptual + counts.procedural + counts.time;
      counts.careless += Math.max(0, result.wrongAnswers - assigned);
    }
    return counts;
  }, [analysisQuestions, result.wrongAnswers, result.timeTaken, avgTimePerQuestion, aiAnalysis, displayResult.answers, result.answers, getQuestionTimeForIndex]);

  const marksPerWrong = useMemo(() => {
    const wrong = result.wrongAnswers || 1;
    const lost = Math.max(0, (result.totalMarks || 0) - (result.obtainedMarks || 0));
    return lost / wrong;
  }, [result]);

  const scoreReconciliation = useMemo(() => {
    let marksEarned = 0;
    let negativePenalty = 0;
    let marksNotEarnedOnWrong = 0;
    const wrongN = result.wrongAnswers || 0;
    const net = Math.round(Number(result.obtainedMarks) || 0);
    const examHasNegativeMarking = analysisQuestions.some(
      (q) => Number(q.negativeMarks) > 0
    );

    analysisQuestions.forEach((q, i) => {
      const ua = getUserAnswerForQuestion(q, i);
      const attempted = ua !== undefined && ua !== null && ua !== '';
      const qMarks = Number(q.marks) > 0 ? Number(q.marks) : 1;
      // Never invent negative marking — only use the question's configured value.
      const qNeg = Math.max(0, Number(q.negativeMarks) || 0);
      if (!attempted) return;
      if (compareAnswers(q, ua, q.correctAnswer)) {
        marksEarned += qMarks;
      } else {
        if (examHasNegativeMarking && qNeg > 0) negativePenalty += qNeg;
        marksNotEarnedOnWrong += qMarks;
      }
    });

    if (analysisQuestions.length === 0 && wrongN > 0) {
      const avgQMarks = (result.totalMarks || 0) / Math.max(totalQuestionCount, 1);
      marksNotEarnedOnWrong = Math.round(wrongN * avgQMarks);
      // Without per-question data, do not invent a negative penalty.
      negativePenalty = 0;
      marksEarned = net;
    }

    if (!examHasNegativeMarking) {
      negativePenalty = 0;
    }

    marksEarned = Math.round(marksEarned);
    negativePenalty = Math.round(negativePenalty);
    marksNotEarnedOnWrong = Math.round(marksNotEarnedOnWrong);
    const totalImpact = marksNotEarnedOnWrong + negativePenalty;
    const costPerWrong =
      wrongN > 0 ? Math.round(totalImpact / wrongN) : Math.round(marksPerWrong);

    return {
      marksEarned,
      negativePenalty,
      net,
      marksNotEarnedOnWrong,
      costPerWrong,
      examHasNegativeMarking,
    };
  }, [
    analysisQuestions,
    result.obtainedMarks,
    result.wrongAnswers,
    result.totalMarks,
    totalQuestionCount,
    marksPerWrong,
    displayResult.answers,
    result.answers,
  ]);

  const chapterHeatmap = useMemo(() => {
    const bySubject: Record<string, Array<{ name: string; pct: number; wrong: number; total: number }>> = {
      physics: [],
      maths: [],
      chemistry: [],
      biology: [],
    };
    const topicAcc = new Map<
      string,
      { correct: number; total: number; wrong: number; subject: string; name: string }
    >();

    analysisQuestions.forEach((q, i) => {
      const ua = getUserAnswerForQuestion(q, i);
      const attempted = ua !== undefined && ua !== null && ua !== '';
      const correct = attempted && compareAnswers(q, ua, q.correctAnswer);
      const subj = normalizeSubjectKey(q.subject);
      const heatmapSubj = subj in bySubject ? subj : 'maths';
      const qi = aiAnalysis?.questionInsights?.find((x) => x.index === i + 1 || x.index === i);
      const topic = resolveQuestionTopicLabel(q, qi);
      const key = `${heatmapSubj}::${topic.toLowerCase()}`;
      const cur = topicAcc.get(key) || {
        correct: 0,
        total: 0,
        wrong: 0,
        subject: heatmapSubj,
        name: topic,
      };
      cur.total += 1;
      if (correct) cur.correct += 1;
      else if (attempted) cur.wrong += 1;
      topicAcc.set(key, cur);
    });

    topicAcc.forEach((v) => {
      // Weak chapters = topics with mistakes / skips, not every question stem.
      if (v.wrong === 0 && v.correct === v.total) return;
      if (!isUsableTopicLabel(v.name)) return;
      const pct = v.total > 0 ? (v.correct / v.total) * 100 : 0;
      const subj = v.subject in bySubject ? v.subject : 'maths';
      bySubject[subj].push({ name: v.name, pct, wrong: v.wrong, total: v.total });
    });

    Object.keys(bySubject).forEach((subj) => {
      bySubject[subj].sort((a, b) => a.pct - b.pct || b.wrong - a.wrong);
      bySubject[subj] = bySubject[subj].slice(0, 5);
    });

    return bySubject;
  }, [analysisQuestions, aiAnalysis, result.subjectWiseScore, displayResult.answers, result.answers]);

  const planTopics = useMemo(
    () => generatePlanTopics(result, aiAnalysis, chapterHeatmap),
    [result, aiAnalysis, chapterHeatmap]
  );
  const activePlanTopic = planTopics[selectedPlanDayIndex] ?? planTopics[0];

  useEffect(() => {
    if (selectedPlanDayIndex >= planTopics.length) {
      setSelectedPlanDayIndex(0);
    }
  }, [planTopics.length, selectedPlanDayIndex]);

  const planTopicWrongQuestions = useMemo(() => {
    const topicTitle = activePlanTopic?.title || '';
    const topicSubj = normalizeSubjectKey(activePlanTopic?.subject || '');
    const rows: Array<{ index: number; preview: string; subject: string }> = [];

    analysisQuestions.forEach((q, i) => {
      const ua = getUserAnswerForQuestion(q, i);
      const attempted = ua !== undefined && ua !== null && ua !== '';
      const correct = attempted && compareAnswers(q, ua, q.correctAnswer);
      if (!attempted || correct) return;

      const qi = aiAnalysis?.questionInsights?.find((x) => x.index === i + 1 || x.index === i);
      const label = resolveQuestionTopicLabel(q, qi);
      const qSubj = normalizeSubjectKey(q.subject);
      const matchesTopic = topicLabelMatches(label, topicTitle);
      const matchesSubjectOnly =
        !matchesTopic &&
        topicSubj &&
        qSubj === topicSubj &&
        /mixed .+ revision|review wrong answers/i.test(topicTitle);

      if (!matchesTopic && !matchesSubjectOnly) return;

      const preview = normalizeAndFormatExamDisplayText(q.questionText || '', q.subject)
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 90);
      rows.push({
        index: i,
        preview: preview || `Question ${i + 1}`,
        subject: subjectDisplayName(q.subject),
      });
    });

    // If topic matching found nothing, fall back to all wrong answers for the subject
    if (rows.length === 0 && topicSubj) {
      analysisQuestions.forEach((q, i) => {
        const ua = getUserAnswerForQuestion(q, i);
        const attempted = ua !== undefined && ua !== null && ua !== '';
        const correct = attempted && compareAnswers(q, ua, q.correctAnswer);
        if (!attempted || correct) return;
        if (normalizeSubjectKey(q.subject) !== topicSubj) return;
        const preview = normalizeAndFormatExamDisplayText(q.questionText || '', q.subject)
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 90);
        rows.push({
          index: i,
          preview: preview || `Question ${i + 1}`,
          subject: subjectDisplayName(q.subject),
        });
      });
    }

    return rows.slice(0, 8);
  }, [
    activePlanTopic?.title,
    activePlanTopic?.subject,
    analysisQuestions,
    aiAnalysis,
    displayResult.answers,
    result.answers,
  ]);

  const openQuestionInReview = useCallback((index: number) => {
    setQuestionFilter('wrong');
    // Stay on the answer panel — do not open the long list-only view.
    setShowAllQuestionsList(false);
    setMobileQuestionIndex(index);
    setExpandedQuestionIndex(index);
    setActiveTab('questions');
    window.setTimeout(() => {
      document
        .getElementById('exam-review-answer-panel')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
  }, []);

  const openAllWrongInReview = useCallback(() => {
    setQuestionFilter('wrong');
    setShowAllQuestionsList(false);
    const first = planTopicWrongQuestions[0]?.index;
    if (typeof first === 'number') {
      setMobileQuestionIndex(first);
      setExpandedQuestionIndex(first);
    }
    setActiveTab('questions');
    window.setTimeout(() => {
      document
        .getElementById('exam-review-answer-panel')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
  }, [planTopicWrongQuestions]);

  const focusChapters = useMemo(() => {
    const collected: Array<{
      chapter: string;
      subject: string;
      pct: number;
      wrong: number;
      total: number;
      subjectId?: string;
    }> = [];

    Object.entries(chapterHeatmap || {}).forEach(([subj, rows]) => {
      rows.forEach((row) => {
        if (row.pct >= 70 || !isUsableTopicLabel(row.name)) return;
        collected.push({
          chapter: row.name,
          subject: subj,
          pct: row.pct,
          wrong: row.wrong || 0,
          total: row.total || 0,
        });
      });
    });

    (aiAnalysis?.focusAreas || []).forEach((f) => {
      const chapter = sanitizePlanTopicTitle(
        (f as { topic?: string }).topic || f.issue || '',
        f.subject,
      );
      if (!isUsableTopicLabel(chapter)) return;
      if (collected.some((c) => c.chapter.toLowerCase() === chapter.toLowerCase())) return;
      collected.push({
        chapter,
        subject: normalizeSubjectKey(f.subject),
        pct: 35,
        wrong: 0,
        total: 0,
      });
    });

    collected.sort((a, b) => a.pct - b.pct || b.wrong - a.wrong);

    const subjectIdByName = new Map<string, string>();
    for (const item of [
      ...(weakSubjectContent?.Video || []),
      ...(weakSubjectContent?.TextBook || []),
    ]) {
      const id = item.subject?._id;
      const name = item.subject?.name;
      if (id && name) subjectIdByName.set(normalizeSubjectKey(name), id);
    }

    return collected.slice(0, 8).map((row) => ({
      ...row,
      subjectId: subjectIdByName.get(normalizeSubjectKey(row.subject)),
    }));
  }, [chapterHeatmap, aiAnalysis, weakSubjectContent]);

  const planVideoCards = useMemo(() => {
    const bgFor = (subj: string) => {
      const k = normalizeSubjectKey(subj);
      if (k === 'physics') return 'bg-orange-50';
      if (k === 'maths') return 'bg-purple-50';
      if (k === 'chemistry') return 'bg-yellow-50';
      if (k === 'biology') return 'bg-emerald-50';
      return 'bg-slate-50';
    };

    // Always lead with exam-derived chapters / subtopics — not generic book titles.
    const fromChapters = focusChapters.slice(0, 6).map((c) => ({
      subj: subjectDisplayName(c.subject).toUpperCase(),
      bg: bgFor(c.subject),
      title: c.chapter,
      min: 10 + Math.min(8, Math.floor((100 - c.pct) / 12)),
      mastery: c.pct,
      subjectId: c.subjectId,
      focusChapter: c.chapter,
      why:
        c.wrong > 0
          ? `${c.wrong} miss${c.wrong === 1 ? '' : 'es'} · ${Math.round(c.pct)}% on this chapter — study this next`
          : `${Math.round(c.pct)}% on this paper — focus this chapter / subtopic`,
    }));
    if (fromChapters.length > 0) return fromChapters;

    const subjectIdByName = new Map<string, string>();
    for (const item of weakSubjectContent?.Video || []) {
      const id = item.subject?._id;
      const name = item.subject?.name;
      if (id && name) subjectIdByName.set(normalizeSubjectKey(name), id);
    }

    const resolveSubjectId = (name?: string, fallbackId?: string) => {
      if (fallbackId) return fallbackId;
      if (!name) return undefined;
      return subjectIdByName.get(normalizeSubjectKey(name));
    };

    const fromAi = (aiAnalysis?.videoRecommendations || [])
      .filter((v) => v?.title && (isUsableTopicLabel(v.title) || isUsableTopicLabel(String(v.topic || ''))))
      .slice(0, 3)
      .map((v) => {
        const subjectName = v.subject || activePlanTopic?.subject || 'Focus';
        const chapter = isUsableTopicLabel(String(v.topic || ''))
          ? String(v.topic)
          : isUsableTopicLabel(v.title)
            ? v.title
            : activePlanTopic?.title || v.title;
        return {
          subj: subjectDisplayName(subjectName).toUpperCase(),
          bg: bgFor(subjectName),
          title: chapter,
          min: 8,
          mastery: activePlanTopic?.pct ?? 0,
          subjectId: resolveSubjectId(subjectName, v.subjectId),
          focusChapter: chapter,
          why: v.why || 'Open Learning Paths for this chapter',
        };
      });
    if (fromAi.length > 0) return fromAi;

    return (planTopics || []).slice(0, 3).map((t) => ({
      subj: subjectDisplayName(t.subject || 'Focus').toUpperCase(),
      bg: bgFor(t.subject || ''),
      title: t.title,
      min: 12,
      mastery: t.pct ?? 0,
      subjectId: resolveSubjectId(t.subject),
      focusChapter: t.title,
      why: t.subtitle || 'Focus this topic in Learning Paths',
    }));
  }, [focusChapters, aiAnalysis, weakSubjectContent, activePlanTopic, planTopics]);

  const questionRowStatuses = useMemo(() => {
    const avgT = avgTimePerQuestion || 60;
    return analysisQuestions.map((q, i) => {
      const ua = getUserAnswerForQuestion(q, i);
      const attempted = ua !== undefined && ua !== null && ua !== '';
      const correct = attempted && compareAnswers(q, ua, q.correctAnswer);
      const analyticsRow = getAnalyticsForQuestion(q, i);
      const timeSeconds = getQuestionTimeForIndex(q, i, ua);
      const difficulty = resolveQuestionDifficulty(q);
      const isWrongQuick = attempted && !correct && timeSeconds != null && timeSeconds < 30;
      const isHardWrong = attempted && !correct && difficulty === 'hard';
      const isTimePressure =
          attempted &&
          !correct &&
        isTimePressureWrong(timeSeconds, avgT, difficulty, analyticsRow?.timeBucket);
      return { attempted, correct, isWrongQuick, isHardWrong, isTimePressure };
    });
  }, [
    analysisQuestions,
    avgTimePerQuestion,
    displayResult.answers,
    result.answers,
    getAnalyticsForQuestion,
    getQuestionTimeForIndex,
  ]);

  const questionFilterCounts = useMemo(() => {
    const counts = {
      all: analysisQuestions.length,
      correct: 0,
      wrong: 0,
      skipped: 0,
      wrongQuick: 0,
      hardWrong: 0,
      timePressure: 0,
    };
    questionRowStatuses.forEach((s) => {
      if (s.correct) counts.correct += 1;
      if (s.attempted && !s.correct) counts.wrong += 1;
      if (!s.attempted) counts.skipped += 1;
      if (s.isWrongQuick) counts.wrongQuick += 1;
      if (s.isHardWrong) counts.hardWrong += 1;
      if (s.isTimePressure) counts.timePressure += 1;
    });
    return counts;
  }, [analysisQuestions.length, questionRowStatuses]);

  const filteredQuestionIndices = useMemo(
    () =>
      analysisQuestions
        .map((_, i) => i)
        .filter((i) => matchesQuestionFilter(questionFilter, questionRowStatuses[i])),
    [analysisQuestions, questionFilter, questionRowStatuses]
  );

  const navigableIndices = useMemo(
    () =>
      questionFilter === 'all'
        ? analysisQuestions.map((_, i) => i)
        : filteredQuestionIndices,
    [questionFilter, filteredQuestionIndices, analysisQuestions.length]
  );

  const filteredPosition =
    navigableIndices.indexOf(mobileQuestionIndex) >= 0
      ? navigableIndices.indexOf(mobileQuestionIndex) + 1
      : navigableIndices.length > 0
        ? 1
        : 0;

  const tabBtnClass = (tab: string) =>
    `px-4 py-3 text-xs sm:text-sm font-medium transition-colors border-b-2 -mb-px ${
      activeTab === tab
        ? 'text-[#7C3AED] border-[#7C3AED]'
        : 'text-gray-500 border-transparent hover:text-gray-700'
    }`;

  const goToPrev = () => {
    if (!navigableIndices.length) return;
    const pos = navigableIndices.indexOf(mobileQuestionIndex);
    if (pos <= 0) return;
    setAnimDirection('down');
    setMobileQuestionIndex(navigableIndices[pos - 1]);
  };

  const goToNext = () => {
    if (!navigableIndices.length) return;
    const pos = navigableIndices.indexOf(mobileQuestionIndex);
    if (pos < 0 || pos >= navigableIndices.length - 1) return;
    setAnimDirection('up');
    setMobileQuestionIndex(navigableIndices[pos + 1]);
  };

  useEffect(() => {
    const n = analysisQuestions.length;
    if (n === 0) return;
    setMobileQuestionIndex((idx) => Math.min(idx, n - 1));
  }, [analysisQuestions.length]);

  useEffect(() => {
    if (!analysisQuestions.length) return;
    setMobileQuestionIndex((idx) => {
      if (!navigableIndices.length) return 0;
      return navigableIndices.includes(idx) ? idx : navigableIndices[0];
    });
  }, [questionFilter, navigableIndices.join(',')]);

  const handleWheel: React.WheelEventHandler<HTMLDivElement> = (e) => {
    if (e.deltaY > 10) {
      goToNext();
    } else if (e.deltaY < -10) {
      goToPrev();
    }
  };

  const handleTouchStart: React.TouchEventHandler<HTMLDivElement> = (e) => {
    setTouchStartY(e.touches[0].clientY);
  };

  const handleTouchEnd: React.TouchEventHandler<HTMLDivElement> = (e) => {
    if (touchStartY === null) return;
    const delta = e.changedTouches[0].clientY - touchStartY;
    if (delta < -30) {
      goToNext();
    } else if (delta > 30) {
      goToPrev();
    }
    setTouchStartY(null);
  };

  const questionDistributionBars = (
    <Card className="rounded-2xl shadow-sm border border-gray-100 bg-white">
      <CardHeader>
        <CardTitle className="flex items-center text-lg sm:text-xl">
          <PieChart className="w-4 h-4 sm:w-5 sm:h-5 mr-2 text-[#7C3AED]" />
          Question Distribution
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {[
          { label: 'Correct Answers', count: result.correctAnswers, color: 'bg-emerald-500', bar: 'bg-emerald-500' },
          { label: 'Wrong Answers', count: result.wrongAnswers, color: 'bg-red-500', bar: 'bg-red-500' },
          { label: 'Unattempted', count: result.unattempted, color: 'bg-gray-400', bar: 'bg-gray-400' },
        ].map((row) => {
          const pct = totalQuestionCount > 0 ? (row.count / totalQuestionCount) * 100 : 0;
          return (
            <div key={row.label} className="flex items-center gap-3">
              <span className={`w-2 h-2 rounded-full shrink-0 ${row.color}`} />
              <span className="text-xs sm:text-sm font-medium text-gray-700 w-32 shrink-0">{row.label}</span>
              <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden min-w-[60px]">
                <div className={`h-full rounded-full ${row.bar}`} style={{ width: `${pct}%` }} />
              </div>
              <span className="text-xs sm:text-sm font-bold text-gray-900 w-8 text-right">{row.count}</span>
              <span className="text-xs sm:text-sm text-gray-500 w-12 text-right">{pct.toFixed(1)}%</span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );

  const performanceAnalyticsSection = (
    <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:p-4 lg:p-6">
              <Card className="rounded-2xl shadow-sm border border-gray-100">
                <CardHeader>
                  <CardTitle className="flex items-center text-lg sm:text-xl">
                    <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5 mr-2 text-[#7C3AED]" />
                    Performance DNA
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <PerformanceDNARadar scores={dnaScores} />
                  <Badge className="mt-4 bg-amber-100 text-amber-800 border-amber-200">{dnaProfileLabel}</Badge>
                  <p className="text-xs sm:text-sm text-gray-600 mt-3">
                    {avgTimePerQuestion > 0 && avgTimePerQuestion <= 25 && attemptedAccuracyPct < 55
                      ? `Avg ${avgTimePerQuestion}s per question is rushed — most misses look careless. Slow down to ~45–60s, eliminate options, then lock.`
                      : avgTimePerQuestion >= 90 && attemptedAccuracyPct < 55
                        ? 'You spent time but accuracy stayed low — rebuild concepts on weak chapters before the next mock.'
                        : 'Your DNA says: protect accuracy under time pressure — fewer careless slips unlock more marks.'}
                  </p>
                </CardContent>
              </Card>
              <Card className="rounded-2xl shadow-sm border border-gray-100">
                <CardHeader>
                  <CardTitle className="flex items-center text-lg sm:text-xl">
                    <Clock className="w-4 h-4 sm:w-5 sm:h-5 mr-2 text-[#7C3AED]" />
                    Time Intelligence
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="text-center p-4 rounded-xl bg-purple-50 border border-purple-100">
                    <Clock className="w-6 h-6 sm:w-7 sm:h-7 lg:w-8 lg:h-8 text-[#7C3AED] mx-auto mb-2" />
                    <p className="text-xl sm:text-2xl font-bold text-gray-900">{formatTime(result.timeTaken)}</p>
                    <p className="text-xs sm:text-sm text-gray-600">Total Time Taken</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-center">
                    <div className="p-3 rounded-xl border bg-gray-50">
                      <p className="text-base sm:text-lg font-bold">{formatTime(avgTimePerQuestion)}</p>
                      <p className="text-xs text-gray-500">Avg per Question</p>
                    </div>
                    <div className="p-3 rounded-xl border bg-gray-50">
                      <p className="text-base sm:text-lg font-bold">{speedRatingLabel}</p>
                      <p className="text-xs text-gray-500">Speed Rating</p>
                    </div>
                  </div>
                  <p className="text-[11px] text-gray-500 leading-snug">
                    Fast = under ~30s (ideal exam pace is ~60s/Q). Slow = over ~75s. Your {avgTimePerQuestion}s average means this paper was paced as Fast overall.
                  </p>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Time × Accuracy Quadrant</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-center text-xs sm:text-sm">
                    <div className="p-3 rounded-lg bg-red-50 border border-red-100">
                      <p className="font-bold text-red-700">{timeQuadrant.fastWrong}</p>
                      <p className="text-xs text-gray-600">Fast + Wrong · Careless</p>
                    </div>
                    <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-100">
                      <p className="font-bold text-emerald-700">{timeQuadrant.fastRight}</p>
                      <p className="text-xs text-gray-600">Fast + Right · Sharp</p>
                    </div>
                    <div className="p-3 rounded-lg bg-orange-50 border border-orange-100">
                      <p className="font-bold text-orange-700">{timeQuadrant.slowWrong}</p>
                      <p className="text-xs text-gray-600">Slow + Wrong · Stuck</p>
                    </div>
                    <div className="p-3 rounded-lg bg-blue-50 border border-blue-100">
                      <p className="font-bold text-blue-700">{timeQuadrant.slowRight}</p>
                      <p className="text-xs text-gray-600">Slow + Right · Effortful</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
            {questionDistributionBars}
    </>
  );

  const subjectWisePerformanceCards = (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 lg:gap-6 items-stretch">
      {Object.entries(result.subjectWiseScore || {})
        .filter(([, score]) => Number(score?.total || 0) > 0)
        .map(([subject, score]) => {
        const percentage = score.total > 0 ? (score.correct / score.total) * 100 : 0;
        const subjectKey = normalizeSubjectKey(subject);
        const subjectColors = {
          maths: { bg: 'from-blue-50 to-cyan-50', border: 'border-blue-200', text: 'text-blue-600', icon: 'text-blue-500' },
          physics: { bg: 'from-green-50 to-emerald-50', border: 'border-green-200', text: 'text-green-600', icon: 'text-green-500' },
          chemistry: { bg: 'from-purple-50 to-pink-50', border: 'border-purple-200', text: 'text-purple-600', icon: 'text-purple-500' },
          biology: { bg: 'from-emerald-50 to-lime-50', border: 'border-emerald-200', text: 'text-emerald-600', icon: 'text-emerald-500' },
        };

        const colors = subjectColors[subjectKey as keyof typeof subjectColors] || {
          bg: 'from-gray-50 to-slate-50',
          border: 'border-gray-200',
          text: 'text-gray-600',
          icon: 'text-gray-500',
        };

        const weakChapters = (chapterHeatmap[subjectKey] || [])
          .filter((c) => c.pct < 70 && isUsableTopicLabel(c.name))
          .slice(0, 4);

        return (
          <Card
            key={subject}
            className={`overflow-visible border shadow-xl bg-gradient-to-br ${colors.bg} ${colors.border}`}
          >
            <CardContent className="!p-4 sm:!p-5 lg:!p-6">
              <div className="text-center">
                <div
                  className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4 bg-gradient-to-br ${colors.bg} ${colors.border} border-2`}
                >
                  {subjectKey === 'maths' && <Calculator className={`w-8 h-8 sm:w-10 sm:h-10 ${colors.icon}`} />}
                  {subjectKey === 'physics' && <Atom className={`w-8 h-8 sm:w-10 sm:h-10 ${colors.icon}`} />}
                  {subjectKey === 'chemistry' && <FlaskConical className={`w-8 h-8 sm:w-10 sm:h-10 ${colors.icon}`} />}
                  {subjectKey !== 'maths' && subjectKey !== 'physics' && subjectKey !== 'chemistry' && (
                    <BookOpen className={`w-8 h-8 sm:w-10 sm:h-10 ${colors.icon}`} />
                  )}
                </div>
                <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
                  {subjectDisplayName(subject)}
                </h3>
                <div className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-2 text-gray-900">
                  {percentage.toFixed(1)}%
                </div>
                <div className="text-base sm:text-lg text-gray-600 mb-2">
                  {score.correct}/{score.total} correct
                </div>
                <div className="text-lg sm:text-xl font-semibold text-gray-700 mb-4">{score.marks} marks</div>

                <div className="space-y-2">
                  <div className="flex justify-between text-xs sm:text-sm">
                    <span className="text-gray-600">Accuracy</span>
                    <span className={`font-semibold ${colors.text}`}>{percentage.toFixed(1)}%</span>
                  </div>
                  <Progress value={percentage} className="h-2 bg-gray-200" />
                </div>
                <div className="mt-4 pt-4 border-t border-gray-200/80 text-left text-xs">
                  {percentage >= 70 ? (
                    <p className="font-semibold text-teal-700">✓ STRONGEST · ANCHOR</p>
                  ) : (
                    <>
                      <p className="font-bold text-red-600 uppercase tracking-wide">Needs improvement</p>
                      {weakChapters.length > 0 ? (
                        <ul className="mt-2 space-y-1.5">
                          {weakChapters.map((c) => (
                            <li
                              key={c.name}
                              className="flex items-start justify-between gap-2 rounded-lg bg-white/70 border border-red-100 px-2.5 py-1.5"
                            >
                              <span className="font-medium text-red-800 leading-snug">{c.name}</span>
                              <span className="shrink-0 tabular-nums text-red-600 font-semibold">
                                {Math.round(c.pct)}%
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-1.5 text-red-700 leading-snug">
                          Mixed chapter drills needed — chapter tags were missing on this paper, so review wrong answers by topic in the Questions tab.
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );

  const getQuestionInsightByIndex = (questionIndex: number) => {
    const insights = aiAnalysis?.questionInsights;
    if (!insights?.length) return undefined;
    const question = analysisQuestions[questionIndex];
    const qid = normalizeMongoId((question as { _id?: unknown })?._id);
    if (qid) {
      const byId = insights.find((x) => normalizeMongoId(x.questionId) === qid);
      if (byId) return byId;
    }
    return insights.find((x) => Number(x.index) === questionIndex + 1);
  };

  const resolveQuestionAnalysisStatus = (questionIndex: number) => {
    const question = analysisQuestions[questionIndex];
    if (question) {
      const ua = getUserAnswerForQuestion(question, questionIndex);
      const attempted = ua !== undefined && ua !== null && ua !== '';
      if (!attempted) return 'unattempted';
      return compareAnswers(question, ua, question.correctAnswer) ? 'correct' : 'wrong';
    }

    const item = getQuestionInsightByIndex(questionIndex);
    const fromInsight = String(item?.status || '').toLowerCase();
    if (fromInsight === 'correct' || fromInsight === 'wrong' || fromInsight === 'unattempted') {
      return fromInsight;
    }
    return 'unattempted';
  };

  const getQuestionAnalysisBlocks = (questionIndex: number) => {
    const item = getQuestionInsightByIndex(questionIndex);
    const question = analysisQuestions[questionIndex];
    const actualStatus = resolveQuestionAnalysisStatus(questionIndex);
    const insightStatus = String(item?.status || '').toLowerCase();
    const alignedInsight =
      !!insightStatus &&
      (actualStatus === 'unattempted'
        ? insightStatus === 'unattempted'
        : insightStatus === actualStatus);
    const blocks: string[] = [];
    const gap = String(item?.conceptGap || '').trim();
    const fix = String(item?.fixStrategy || '').trim();

    if (actualStatus === 'correct') {
      if (alignedInsight) {
        if (gap) blocks.push(gap);
        if (fix) blocks.push(fix);
      } else {
        blocks.push('You answered this question correctly.');
      }
    } else if (actualStatus === 'wrong') {
      if (gap) blocks.push(gap);
      if (fix) blocks.push(fix);
    } else if (alignedInsight || !item) {
      if (gap) blocks.push(gap);
      if (fix) blocks.push(fix);
    } else {
      blocks.push('This question was not attempted.');
    }

    const solution = String(question?.explanation || item?.geminiExplanation || '').trim();
    if (solution) blocks.push(`Solution: ${solution}`);
    return blocks;
  };

  const renderQuestionAnalysisSection = (questionIndex: number) => {
    const item = getQuestionInsightByIndex(questionIndex);
    const analysisBlocks = getQuestionAnalysisBlocks(questionIndex);
    const status = resolveQuestionAnalysisStatus(questionIndex);
    const isCorrect = status === 'correct';
    const isWrong = status === 'wrong';

    const shellClass = isCorrect
      ? 'mt-4 rounded-lg border-2 border-emerald-300 bg-gradient-to-br from-emerald-50 to-teal-50 p-4'
      : isWrong
        ? 'mt-4 rounded-lg border-2 border-red-300 bg-gradient-to-br from-red-50 to-rose-50 p-4'
        : 'mt-4 rounded-lg border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4';

    const headingClass = isCorrect
      ? 'text-sm font-semibold text-emerald-900 mb-3'
      : isWrong
        ? 'text-sm font-semibold text-red-900 mb-3'
        : 'text-sm font-semibold text-gray-900 mb-3';

    const bodyTextClass = isCorrect
      ? 'text-xs sm:text-sm text-emerald-900 leading-relaxed'
      : isWrong
        ? 'text-xs sm:text-sm text-red-900 leading-relaxed'
        : 'text-xs sm:text-sm text-gray-700 leading-relaxed';

    const statusBadgeClass = isCorrect
      ? 'uppercase text-micro border-emerald-400 bg-emerald-100 text-emerald-800'
      : isWrong
        ? 'uppercase text-micro border-red-400 bg-red-100 text-red-800'
        : 'uppercase text-micro';

    return (
      <div className={shellClass}>
        <h4 className={headingClass}>Question Analysis</h4>
        {item ? (
          <>
            <div className="flex items-center justify-between gap-2 mb-2">
              <span
                className={
                  isCorrect
                    ? 'text-xs sm:text-sm font-semibold text-emerald-900'
                    : isWrong
                      ? 'text-xs sm:text-sm font-semibold text-red-900'
                      : 'text-xs sm:text-sm font-semibold text-gray-900'
                }
              >
                Q{questionIndex + 1}
              </span>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={statusBadgeClass}>
                  {status}
                </Badge>
                <Badge variant="outline" className="uppercase text-micro">
                  {String(item.priority || 'medium')}
                </Badge>
              </div>
            </div>
            {aiLoading && analysisBlocks.length === 0 ? (
              <div className="mt-2 space-y-2 animate-pulse" aria-busy="true" aria-label="Loading explanation">
                <div
                  className={`h-3 rounded w-full ${isCorrect ? 'bg-emerald-200' : isWrong ? 'bg-red-200' : 'bg-slate-200'}`}
                />
                <div
                  className={`h-3 rounded w-[92%] ${isCorrect ? 'bg-emerald-200' : isWrong ? 'bg-red-200' : 'bg-slate-200'}`}
                />
                <div
                  className={`h-3 rounded w-[78%] ${isCorrect ? 'bg-emerald-200' : isWrong ? 'bg-red-200' : 'bg-slate-200'}`}
                />
              </div>
            ) : analysisBlocks.length > 0 ? (
              <div className="mt-2 space-y-2.5">
                {analysisBlocks.map((block, bi) => (
                  <p key={bi} className={bodyTextClass}>
                    {block}
                  </p>
                ))}
              </div>
            ) : (
              <p className={`${bodyTextClass} mt-2 opacity-80`}>
                No explanation available for this question.
              </p>
            )}
          </>
        ) : aiLoading ? (
          <div className="space-y-2 animate-pulse" aria-busy="true" aria-label="Loading question analysis">
            <div className="h-3 bg-slate-200 rounded w-2/3" />
            <div className="h-3 bg-slate-200 rounded w-full" />
          </div>
        ) : (
          <p className="text-gray-500 text-xs sm:text-sm">
            Open this question after the report finishes loading.
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-3">
        <Button
          variant="outline"
          onClick={onBack}
          className="px-4 sm:px-6 py-2 bg-white text-gray-800 hover:text-gray-900 hover:bg-gray-50 border-2 border-gray-300 hover:border-gray-400 shadow-sm font-semibold"
        >
          <ArrowUp className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
          Back to Dashboard
        </Button>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-0 overflow-x-auto">
        <div className="flex gap-1 sm:gap-4 min-w-max">
          <button type="button" onClick={() => setActiveTab('ai')} className={tabBtnClass('ai')}>AI Report</button>
          <button type="button" onClick={() => setActiveTab('questions')} className={tabBtnClass('questions')}>Questions</button>
          <button type="button" onClick={() => setActiveTab('advanced')} className={tabBtnClass('advanced')}>Advanced</button>
          <button type="button" onClick={() => setActiveTab('insights')} className={tabBtnClass('insights')}>Insights</button>
          <button type="button" onClick={() => setActiveTab('plan')} className={tabBtnClass('plan')}>
            Plan
          </button>
        </div>
      </div>

      <div className="w-full max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
        {/* Tab Content */}

        {/* AI Report Tab */}
        {activeTab === 'ai' && (
            <AiReportTab
              result={result}
              examTitle={examTitle}
              studentName={studentName}
              examDateLabel={examDateLabel}
              aiAnalysis={aiAnalysis}
              aiLoading={aiLoading}
              aiError={aiError}
              animatedMarks={animatedValues.obtainedMarks}
              animatedCorrect={animatedValues.correctAnswers}
              animatedWrong={animatedValues.wrongAnswers}
              animatedSkipped={animatedValues.unattempted}
              gradeLetter={grade.grade}
              marksPercent={marksPercent}
              accuracyRate={accuracyRate}
              completionRate={completionRate}
              attemptedCount={attemptedCount}
              totalQuestionCount={totalQuestionCount}
              mistakeTaxonomy={mistakeTaxonomy}
              wrongQuickCount={questionFilterCounts.wrongQuick}
              marksPerWrong={marksPerWrong}
              scoreReconciliation={scoreReconciliation}
            />
        )}

        {/* Questions Tab */}
        {activeTab === 'questions' && (
          <motion.div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-4">
            <div className="flex flex-wrap gap-2">
              {[
                { id: 'all' as const, label: `All · ${questionFilterCounts.all}` },
                { id: 'correct' as const, label: `Correct · ${questionFilterCounts.correct}` },
                { id: 'wrong' as const, label: `Wrong · ${questionFilterCounts.wrong}` },
                { id: 'skipped' as const, label: `Skipped · ${questionFilterCounts.skipped}` },
                { id: 'wrong-quick' as const, label: `⚡ Wrong-quick · ${questionFilterCounts.wrongQuick}` },
                { id: 'hard-wrong' as const, label: `Hard + Wrong · ${questionFilterCounts.hardWrong}` },
                { id: 'time-pressure' as const, label: `⏱ Time-pressure · ${questionFilterCounts.timePressure}` },
              ].map((pill) => (
                <button
                  key={pill.id}
                  type="button"
                  onClick={() => {
                    setQuestionFilter(pill.id);
                    setShowAllQuestionsList(false);
                  }}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium border transition-colors ${
                    questionFilter === pill.id
                      ? 'bg-[#7C3AED] text-white border-[#7C3AED]'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-[#7C3AED]'
                  }`}
                >
                  {pill.label}
                </button>
              ))}
            </div>
            {analysisQuestions.length > 0 && (
              <div className="space-y-2 lg:hidden">
                {(showAllQuestionsList ? filteredQuestionIndices : filteredQuestionIndices.slice(0, 5)).map((index) => {
                  const question = analysisQuestions[index];
                  const userAnswer = getUserAnswerForQuestion(question, index);
                  const isCorrect = compareAnswers(question, userAnswer, question.correctAnswer);
                  const isAttempted = userAnswer !== undefined && userAnswer !== null && userAnswer !== '';
                  const t = getQuestionTimeForIndex(question, index, userAnswer);
                  const qi = aiAnalysis?.questionInsights?.find((x) => x.index === index + 1 || x.index === index);
                  const err = classifyErrorType(question, userAnswer, t, {
                    isCorrect,
                    isAttempted,
                    avgTime: avgTimePerQuestion || 60,
                    totalExamTime: result.timeTaken,
                    aiInsight: qi?.insight,
                  });
                  const border = isCorrect ? 'border-l-emerald-500' : isAttempted ? 'border-l-red-500' : 'border-l-gray-400';
                  return (
                    <button
                      key={index}
                      type="button"
                      onClick={() => {
                        setExpandedQuestionIndex(expandedQuestionIndex === index ? null : index);
                        setMobileQuestionIndex(index);
                        window.setTimeout(() => {
                          document
                            .getElementById('exam-review-answer-panel')
                            ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }, 80);
                      }}
                      className={`w-full text-left rounded-xl border border-gray-100 bg-white shadow-sm p-3 border-l-4 ${border}`}
                    >
                      <div className="flex gap-2 items-start min-w-0">
                        <span className="font-bold text-xs shrink-0">Q{index + 1}</span>
                        {isCorrect ? (
                          <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                        ) : isAttempted ? (
                          <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                        ) : (
                          <Minus className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                        )}
                        <span className="min-w-0 flex-1 text-xs text-gray-800 break-words leading-snug line-clamp-3">
                          {normalizeExamText(question.questionText, question.subject)}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Badge variant="outline" className="text-micro capitalize">
                          {question.subject}
                        </Badge>
                        <Badge variant="secondary" className="text-micro uppercase">
                          {getQuestionDifficulty(question)}
                        </Badge>
                        {err === 'careless' && (
                          <Badge className="text-micro bg-amber-100 text-amber-800">
                            ⚡ CARELESS{t != null ? ` · ${t}s` : ''}
                          </Badge>
                        )}
                        {err === 'conceptual' && (
                          <Badge className="text-micro bg-purple-100 text-purple-800">💎 CONCEPTUAL</Badge>
                        )}
                        {err === 'time-pressure' && (
                          <Badge className="text-micro bg-blue-100 text-blue-800">⏱ TIME-PRESSURE</Badge>
                        )}
                        {err === 'reading' && (
                          <Badge className="text-micro bg-indigo-100 text-indigo-800">👁 READING</Badge>
                        )}
                      </div>
                    </button>
                  );
                })}
                {filteredQuestionIndices.length > 5 && !showAllQuestionsList && (
                  <Button type="button" variant="outline" className="w-full" onClick={() => setShowAllQuestionsList(true)}>
                    Show all {filteredQuestionIndices.length} questions
                  </Button>
                )}
              </div>
            )}
              {analysisQuestions.length > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 sm:p-4 lg:p-6">
                
                {/* Question Navigation Sidebar - Modern Grid Layout */}
                <div className="lg:col-span-1">
                  <Card className="sticky top-24">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm sm:text-base font-semibold flex items-center gap-2">
                        <BookOpen className="w-3 h-3 sm:w-4 sm:h-4 text-purple-600" />
                        Questions
                      </CardTitle>
                      <p className="text-xs text-gray-500 mt-1">
                        {questionFilter === 'all'
                          ? `${analysisQuestions.length} questions`
                          : `${navigableIndices.length} of ${analysisQuestions.length} shown`}
                      </p>
                    </CardHeader>
                    <CardContent className="pt-0">
                      {/* Question Numbers Grid - 5 columns, 5-6 rows */}
                      <div className="bg-gradient-to-br from-gray-50 to-purple-50/30 rounded-xl p-4 border border-gray-200">
                        {navigableIndices.length === 0 ? (
                          <p className="text-xs text-gray-500 text-center py-6">
                            No questions match this filter.
                          </p>
                        ) : (
                        <div className="grid grid-cols-5 sm:grid-cols-6 lg:grid-cols-5 gap-2">
                          {navigableIndices.map((index) => {
                            const question = analysisQuestions[index];
                            const userAnswer = getUserAnswerForQuestion(question, index);
                            const isCorrect = compareAnswers(question, userAnswer, question.correctAnswer);
                            const isAttempted = userAnswer !== undefined && userAnswer !== null && userAnswer !== '';
                            const isCurrent = index === mobileQuestionIndex;
                            
                            return (
                              <button
                                key={index}
                                onClick={() => setMobileQuestionIndex(index)}
                                className={`
                                  group relative
                                  aspect-square w-full max-h-11 rounded-xl font-bold text-xs sm:text-sm
                                  transition-all duration-300 ease-out
                                  flex items-center justify-center
                                  border-2
                                  ${
                                    isCurrent
                                      ? 'bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 text-white border-purple-400 shadow-xl shadow-purple-500/50 scale-110 z-10 ring-2 ring-purple-300'
                                      : isCorrect
                                      ? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white border-emerald-400 shadow-lg shadow-emerald-400/30 hover:scale-105'
                                      : isAttempted && !isCorrect
                                      ? 'bg-gradient-to-br from-red-500 to-red-600 text-white border-red-400 shadow-lg shadow-red-400/30 hover:scale-105'
                                      : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-700 hover:shadow-md'
                                  }
                                `}
                                title={`Question ${index + 1}${isCorrect ? ' ✓ Correct' : isAttempted ? ' ✗ Incorrect' : ' ○ Not attempted'}`}
                              >
                                <span className="relative z-10">{index + 1}</span>
                                {isCorrect && (
                                  <CheckCircle className="absolute -bottom-0.5 -right-0.5 w-3 h-3 text-white bg-emerald-600 rounded-full" />
                                )}
                                {isAttempted && !isCorrect && (
                                  <XCircle className="absolute -bottom-0.5 -right-0.5 w-3 h-3 text-white bg-red-600 rounded-full" />
                                )}
                                {isCurrent && (
                                  <div className="absolute inset-0 rounded-xl bg-white/20 animate-pulse"></div>
                                )}
                              </button>
                            );
                          })}
                        </div>
                        )}
                      </div>
                      
                      {/* Legend */}
                      <div className="mt-4 pt-4 border-t border-gray-200">
                        <p className="text-xs font-semibold text-gray-700 mb-3">Status Legend</p>
                        <div className="space-y-2.5">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 sm:w-4 sm:h-4 rounded-lg bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 border-2 border-purple-400 ring-2 ring-purple-300"></div>
                            <span className="text-xs text-gray-600">Current</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 sm:w-4 sm:h-4 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 border-2 border-emerald-400 relative">
                              <CheckCircle className="absolute -bottom-0.5 -right-0.5 w-2 h-2 text-white" />
                            </div>
                            <span className="text-xs text-gray-600">Correct</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 sm:w-4 sm:h-4 rounded-lg bg-gradient-to-br from-red-500 to-red-600 border-2 border-red-400 relative">
                              <XCircle className="absolute -bottom-0.5 -right-0.5 w-2 h-2 text-white" />
                            </div>
                            <span className="text-xs text-gray-600">Incorrect</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 sm:w-4 sm:h-4 rounded-lg bg-white border-2 border-gray-300"></div>
                            <span className="text-xs text-gray-600">Not Attempted</span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Main Question Area */}
                <div id="exam-review-answer-panel" className="lg:col-span-3 scroll-mt-24">
                {/* Question Container */}
                <Card className="shadow-lg border-0 bg-white">
                  <CardContent className="p-3 sm:p-4 lg:p-6">
                    {analysisQuestions.length > 0 && navigableIndices.length === 0 && (
                      <div className="py-16 text-center text-gray-500">
                        <p className="text-sm font-medium">No questions match this filter.</p>
                        <p className="text-xs mt-1">Try another category above.</p>
                      </div>
                    )}
                    {analysisQuestions.length > 0 && navigableIndices.length > 0 && (
                      <>
                        {/* Question Header */}
                        <div className="flex items-center justify-between mb-6">
                          <div className="flex items-center space-x-4">
                            <Badge variant="outline" className="capitalize">
                              {analysisQuestions[mobileQuestionIndex]?.subject || 'Unknown'}
                            </Badge>
                            <Badge variant="secondary">
                              {analysisQuestions[mobileQuestionIndex]?.marks || 0} marks
                            </Badge>
                          </div>
                        </div>

                        {/* Question Content */}
                        <div className="mb-8">
                          <div className="flex items-start space-x-3 mb-4">
                            <span className="text-base sm:text-lg font-semibold text-gray-900">
                              Q{mobileQuestionIndex + 1}.
                            </span>
                            <div className="flex-1">
                              {analysisQuestions[mobileQuestionIndex]?.questionText && (
                                <p className="text-base sm:text-lg text-gray-900 mb-4">
                                  {normalizeExamText(
                                    analysisQuestions[mobileQuestionIndex].questionText,
                                    analysisQuestions[mobileQuestionIndex]?.subject
                                  )}
                                </p>
                              )}
                              
                              {analysisQuestions[mobileQuestionIndex]?.questionImage && (
                                <AuthenticatedUploadImage
                                  src={analysisQuestions[mobileQuestionIndex].questionImage}
                                  alt="Question figure"
                                  wrapperClassName="mb-4"
                                />
                              )}
                            </div>
                          </div>

                          {/* Answer Options */}
                          {analysisQuestions[mobileQuestionIndex]?.questionType === 'mcq' && analysisQuestions[mobileQuestionIndex]?.options && (
                            <div className="space-y-3">
                              {analysisQuestions[mobileQuestionIndex].options.map((option: any, index: number) => {
                                const activeQuestion = analysisQuestions[mobileQuestionIndex];
                                const optionText = getOptionText(option, activeQuestion.subject);
                                const userAnswer = getUserAnswerForQuestion(activeQuestion, mobileQuestionIndex);
                                const userAnswerTexts = resolveAnswerTexts(activeQuestion, userAnswer);
                                const correctAnswerTexts = resolveAnswerTexts(activeQuestion, activeQuestion.correctAnswer);
                                const isUser = userAnswerTexts.includes(optionText);
                                const isRight = correctAnswerTexts.includes(optionText);
                                const isCorrectSelection = isUser && isRight;
                                
                                return (
                                  <div 
                                    key={index} 
                                    className={`flex items-center space-x-3 p-4 rounded-lg border-2 ${
                                      isCorrectSelection
                                        ? 'border-emerald-400 bg-emerald-50 ring-2 ring-purple-200'
                                        : isRight
                                        ? 'border-emerald-400 bg-emerald-50'
                                        : isUser
                                        ? 'border-red-400 bg-red-50'
                                        : 'border-gray-200 bg-gray-50'
                                    }`}
                                  >
                                    <span className="text-xs sm:text-sm font-medium text-gray-600 w-6">{String.fromCharCode(65 + index)}.</span>
                                    <span className={`flex-1 ${
                                      isCorrectSelection || isRight
                                        ? 'text-emerald-800 font-medium'
                                        : isUser
                                        ? 'text-red-800 font-medium'
                                        : 'text-gray-700'
                                    }`}>
                                      {optionText}
                                    </span>
                                    {isCorrectSelection && (
                                      <span className="text-micro font-semibold uppercase tracking-wide text-purple-700 bg-purple-100 px-2 py-0.5 rounded">
                                        Your answer
                                      </span>
                                    )}
                                    {(isRight || isCorrectSelection) && <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600" />}
                                    {isUser && !isRight && <XCircle className="w-4 h-4 sm:w-5 sm:h-5 text-red-600" />}
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* Answer Status */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
                            <div className="rounded-lg border border-purple-200 bg-purple-50 p-4">
                              <div className="text-xs font-semibold text-purple-800 mb-2">Your Answer</div>
                              <div className="text-xs sm:text-sm text-purple-900">
                                {(() => {
                                  const activeQuestion = analysisQuestions[mobileQuestionIndex];
                                  const userAnswer = getUserAnswerForQuestion(activeQuestion, mobileQuestionIndex);
                                  const userAnswerTexts = resolveAnswerTexts(activeQuestion, userAnswer);
                                  const isAttempted = userAnswerTexts.length > 0;
                                  return isAttempted 
                                    ? userAnswerTexts.join(', ')
                                    : 'Not attempted';
                                })()}
                              </div>
                            </div>
                            <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                              <div className="text-xs font-semibold text-green-800 mb-2">Correct Answer</div>
                              <div className="text-xs sm:text-sm text-green-900">
                                {(() => {
                                  const activeQuestion = analysisQuestions[mobileQuestionIndex];
                                  const correctAnswerTexts = resolveAnswerTexts(activeQuestion, activeQuestion.correctAnswer);
                                  return correctAnswerTexts.length > 0 ? correctAnswerTexts.join(', ') : 'N/A';
                                })()}
                              </div>
                            </div>
                          </div>

                          {/* Full Solution */}
                          <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
                            <div className="text-xs font-semibold text-blue-800 mb-2">Solution</div>
                            <div className="text-xs sm:text-sm text-blue-900 whitespace-pre-wrap">
                              {normalizeExamText(
                                analysisQuestions[mobileQuestionIndex]?.explanation,
                                analysisQuestions[mobileQuestionIndex]?.subject
                              ) || 'Solution not provided for this question.'}
                            </div>
                          </div>

                          {renderQuestionAnalysisSection(mobileQuestionIndex)}
                        </div>

                        {/* Navigation Buttons */}
                        <div className="flex items-center justify-between mt-6 pt-6 border-t">
                          <Button
                            variant="outline"
                            onClick={goToPrev}
                            disabled={
                              navigableIndices.length === 0 ||
                              navigableIndices.indexOf(mobileQuestionIndex) <= 0
                            }
                          >
                            Previous
                          </Button>
                          <span className="text-xs sm:text-sm text-gray-600">
                            {questionFilter === 'all'
                              ? `Question ${mobileQuestionIndex + 1} of ${analysisQuestions.length}`
                              : `Question ${filteredPosition} of ${navigableIndices.length} (Q${mobileQuestionIndex + 1})`}
                          </span>
                          <Button
                            variant="outline"
                            onClick={goToNext}
                            disabled={
                              navigableIndices.length === 0 ||
                              navigableIndices.indexOf(mobileQuestionIndex) >=
                                navigableIndices.length - 1
                            }
                          >
                            Next
                          </Button>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
                </div>
                </div>
              ) : (
                <Card className="border-0 shadow-xl bg-gradient-to-br from-gray-50 to-slate-50">
                  <CardContent className="p-16 text-center">
                    <div className="w-24 h-24 bg-gradient-to-r from-gray-200 to-gray-300 rounded-full flex items-center justify-center mx-auto mb-6">
                      <Eye className="w-12 h-12 text-gray-500" />
                    </div>
                    <h3 className="text-xl sm:text-2xl font-semibold text-gray-700 mb-3">No Question Details Available</h3>
                    <p className="text-gray-500 text-base sm:text-lg">Question details are not available for this exam result.</p>
                  </CardContent>
                </Card>
              )}
          </motion.div>
        )}

        {activeTab === 'advanced' && (
          <div className="space-y-3 sm:space-y-4 lg:space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-gray-900">Mistake Taxonomy</h2>
                <p className="text-xs sm:text-sm text-gray-500">how the {result.wrongAnswers} wrong answers break down</p>
              </div>
              <div className="flex gap-2 flex-wrap items-center">
                <Badge className={riskBadgeClass}>Risk: {(aiAnalysis?.riskLevel || 'medium').toString()}</Badge>
                <Badge variant="outline" className="capitalize">Trend: {String(aiAnalysis?.predictions?.trend || 'stable')}</Badge>
                <span className="text-xs sm:text-sm font-bold text-red-600">{Math.max(0, (result.totalMarks || 0) - (result.obtainedMarks || 0))} MARKS LOST</span>
              </div>
            </div>
            <div className="flex h-4 rounded-full overflow-hidden bg-gray-100">
              {[
                { c: mistakeTaxonomy.careless, color: 'bg-red-500' },
                { c: mistakeTaxonomy.conceptual, color: 'bg-orange-500' },
                { c: mistakeTaxonomy.procedural, color: 'bg-yellow-500' },
                { c: mistakeTaxonomy.time, color: 'bg-purple-500' },
                { c: mistakeTaxonomy.reading, color: 'bg-blue-500' },
              ].map((seg, i) => {
                const total = mistakeTaxonomy.careless + mistakeTaxonomy.conceptual + mistakeTaxonomy.procedural + mistakeTaxonomy.time + mistakeTaxonomy.reading || 1;
                return <div key={i} className={seg.color} style={{ width: `${(seg.c / total) * 100}%` }} />;
              })}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
              {[
                { label: 'Careless', count: mistakeTaxonomy.careless, icon: Zap },
                { label: 'Conceptual', count: mistakeTaxonomy.conceptual, icon: Brain },
                { label: 'Procedural', count: mistakeTaxonomy.procedural, icon: Target },
                { label: 'Time', count: mistakeTaxonomy.time, icon: Timer },
                { label: 'Reading', count: mistakeTaxonomy.reading, icon: Eye },
              ].map((m) => {
                const Icon = m.icon;
                return (
                  <Card key={m.label} className="rounded-xl border shadow-sm p-3 text-center">
                    <Icon className="w-4 h-4 sm:w-5 sm:h-5 mx-auto text-gray-500 mb-1" />
                    <p className="text-xl sm:text-2xl font-bold">{m.count}</p>
                    <p className="text-xs text-gray-600">{m.label}</p>
                    <p className="text-xs text-red-600 font-semibold mt-1">{Math.round(m.count * marksPerWrong)} lost</p>
                  </Card>
                );
              })}
            </div>
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-xs sm:text-sm text-amber-900">
              Pattern detected — Careless errors have appeared in consecutive mocks. Slow-mode drills recommended daily.
            </div>
            <AdvancedPerformanceDashboard examId={advancedExamId} />
          </div>
        )}

        {/* Insights Tab */}
        {activeTab === 'insights' && (
          <div className="space-y-3 sm:space-y-4 lg:space-y-6">
            <div>
              <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-4 scroll-mt-24">
                Subject-wise performance
              </h3>
              {subjectWisePerformanceCards}
            </div>
            {performanceAnalyticsSection}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:p-4 lg:p-6">
              
              {/* Performance Insights */}
              <Card className="border-0 shadow-xl bg-gradient-to-br from-white to-green-50">
                <CardHeader>
                  <CardTitle className="flex items-center text-lg sm:text-xl">
                    <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 mr-2 text-green-600" />
                    Performance Highlights
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {insights.length > 0 ? insights.map((insight, index) => {
                      const Icon = insight.icon;
                      return (
                        <div key={index} className={`p-4 rounded-xl border ${insight.bgColor}`}>
                          <div className="flex items-start space-x-3">
                            <Icon className={`w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 ${insight.color} mt-0.5`} />
                            <div>
                              <h4 className={`font-semibold ${insight.color}`}>{insight.title}</h4>
                              <p className="text-gray-700 text-xs sm:text-sm mt-1">{insight.description}</p>
                            </div>
                          </div>
                        </div>
                      );
                    }) : (
                      <div className="text-center py-4 sm:py-6 lg:py-8 text-gray-500">
                        <Brain className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                        <p>Complete more exams to unlock insights!</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Weak Areas */}
              <Card className="border-0 shadow-xl bg-gradient-to-br from-white to-red-50">
                <CardHeader>
                  <CardTitle className="flex items-center text-lg sm:text-xl">
                    <Target className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 mr-2 text-red-600" />
                    Areas for Improvement
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {weakAreas.length > 0 ? weakAreas.map((area, index) => {
                      const subjKey = normalizeSubjectKey(area.subject);
                      const chapters = (chapterHeatmap[subjKey] || [])
                        .filter((c) => c.pct < 70 && isUsableTopicLabel(c.name))
                        .slice(0, 3);
                      return (
                      <div key={index} className={`p-4 rounded-xl border ${area.bgColor}`}>
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-semibold text-gray-900">{subjectDisplayName(area.subject)}</h4>
                          <span className={`font-bold ${area.color}`}>{area.percentage.toFixed(1)}%</span>
                        </div>
                        <div className="text-xs sm:text-sm text-gray-600 mb-2">
                          {area.correct}/{area.total} questions correct
                        </div>
                        <Progress value={area.percentage} className="h-2 bg-gray-200" />
                        {chapters.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {chapters.map((c) => (
                              <span
                                key={c.name}
                                className="inline-flex items-center gap-1 rounded-full bg-white/80 border border-red-200 px-2 py-0.5 text-[11px] font-medium text-red-800"
                              >
                                {c.name}
                                <span className="tabular-nums text-red-600">{Math.round(c.pct)}%</span>
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      );
                    }) : (
                      <div className="text-center py-4 sm:py-6 lg:py-8 text-gray-500">
                        <Trophy className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                        <p>Excellent! No weak areas identified.</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
            <div className="mt-8">
              <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <RefreshCw className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600" />
                Pattern Alerts · what&apos;s repeating across attempts
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { icon: '⚡', title: 'Careless errors · 3 attempts in a row', desc: `${mistakeTaxonomy.careless} this time — fast wrong answers climbing.`, fix: '10 min slow-mode drill daily' },
                  { icon: '🧠', title: 'Weak chapter · red zone', desc: (aiAnalysis?.focusAreas?.[0]?.issue || 'Stuck below target accuracy.').slice(0, 80), fix: '8-min concept video + 10 Qs' },
                  { icon: '📉', title: 'Confidence trend declining', desc: `Trend: ${String(aiAnalysis?.predictions?.trend || 'stable')}.`, fix: 'Start mocks with your anchor subject' },
                  { icon: '⏱', title: 'Stamina drops in last 25%', desc: 'Accuracy often falls when time pressure peaks.', fix: 'Practice longer test stamina' },
                ].map((alert, i) => (
                  <div key={i} className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
                    <p className="font-bold text-gray-900">{alert.icon} {alert.title}</p>
                    <p className="text-xs sm:text-sm text-gray-600 mt-2">{alert.desc}</p>
                    <p className="text-xs sm:text-sm font-medium text-[#7C3AED] mt-2">→ Fix: {alert.fix}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}


        {activeTab === 'plan' && (
          <div className="space-y-3 sm:space-y-4 lg:space-y-6">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-gradient-to-r from-purple-600 to-pink-500 text-white p-3 sm:p-4 lg:p-6 sm:p-8 rounded-2xl">
              <h2 className="text-xl sm:text-2xl font-bold">YOUR TOPIC PLAN</h2>
              <p className="text-white/80 text-xs sm:text-sm mt-1">Built from wrong answers on this paper — tap a topic, then review or practice</p>
              <p className="text-white/70 text-xs mt-2">
                {planTopics.length} focus topic{planTopics.length === 1 ? '' : 's'} · not filler drills
              </p>
            </motion.div>
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 flex gap-3">
              <div className="w-10 h-10 rounded-full bg-[#7C3AED] text-white font-bold flex items-center justify-center shrink-0">V</div>
              <div>
                <p className="font-semibold text-gray-900">What to do next</p>
                <p className="text-xs sm:text-sm text-gray-700 mt-2">
                  {studentName}, pick a weak topic below, open the wrong questions from this exam, then use Asli Prep or AI Tutor for extra practice.
                  {(aiAnalysis?.actionPlan?.thisWeek || [])[0]
                    ? ` ${(aiAnalysis?.actionPlan?.thisWeek || [])[0]}`
                    : ''}
                </p>
              </div>
            </div>
            <div className="overflow-x-auto pb-2">
              <div className="flex gap-3 min-w-max">
                {planTopics.map((topic, topicIndex) => {
                  const isSelected = selectedPlanDayIndex === topicIndex;
                  return (
                    <button
                      key={topic.topicNum}
                      type="button"
                      onClick={() => {
                        setSelectedPlanDayIndex(topicIndex);
                        requestAnimationFrame(() => {
                          planQueueRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        });
                      }}
                      className={`rounded-xl p-4 min-w-[160px] max-w-[220px] border text-left transition-shadow ${isSelected ? 'bg-white border-[#7C3AED] shadow-md ring-2 ring-[#7C3AED]/30' : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300'}`}
                    >
                      {isSelected && (
                        <span className="text-micro font-bold text-[#7C3AED]">ACTIVE</span>
                      )}
                      <p className={`font-bold mt-1 line-clamp-2 ${isSelected ? 'text-gray-900' : 'text-gray-800'}`}>
                        {topic.title}
                      </p>
                      <p className="text-xs mt-1 text-gray-600 line-clamp-2">{topic.subtitle}</p>
                      <p className="text-xs mt-2 font-medium">{topic.duration}</p>
                    </button>
                  );
                })}
              </div>
            </div>
            <div ref={planQueueRef} className="scroll-mt-24">
            <Card className="rounded-2xl shadow-sm border overflow-visible">
              <CardHeader className="flex flex-row items-start justify-between gap-3 !pb-2">
                <div className="min-w-0">
                  <CardTitle className="line-clamp-2 text-lg sm:text-xl">
                    {activePlanTopic?.title || 'Focus topic'}
                  </CardTitle>
                  <p className="text-xs sm:text-sm text-gray-600 mt-1">
                    {activePlanTopic?.subtitle || 'Practice'} · {activePlanTopic?.duration || '20 min'}
                  </p>
                </div>
                <Badge className="shrink-0">Do this next</Badge>
              </CardHeader>
              <CardContent className="space-y-4 !pt-2">
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button
                    type="button"
                    className="bg-[#7C3AED] hover:bg-[#6d28d9] text-white"
                    onClick={openAllWrongInReview}
                  >
                    Review wrong questions
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setLocation('/ai-tutor')}
                  >
                    Ask AI Tutor
                    <ExternalLink className="w-3.5 h-3.5 ml-1.5" />
                  </Button>
                </div>

                <div>
                  <p className="text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">
                    Your misses on this topic · tap to see answer below
                  </p>
                  {planTopicWrongQuestions.length > 0 ? (
                    <div className="space-y-2">
                      {planTopicWrongQuestions.map((row) => (
                        <button
                          key={row.index}
                          type="button"
                          onClick={() => openQuestionInReview(row.index)}
                          className="w-full text-left rounded-xl border border-red-100 bg-red-50/60 hover:bg-red-50 px-3 py-2.5 transition-colors"
                        >
                          <div className="flex items-start gap-2">
                            <span className="shrink-0 font-bold text-red-700 text-xs">Q{row.index + 1}</span>
                            <span className="min-w-0 flex-1 text-xs sm:text-sm text-gray-800 leading-snug line-clamp-2">
                              {row.preview}
                            </span>
                            <ChevronRight className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-xs sm:text-sm text-gray-600">
                      No tagged misses for this topic yet. Use <button type="button" className="text-[#7C3AED] font-semibold underline" onClick={() => { setQuestionFilter('wrong'); setActiveTab('questions'); }}>Questions → Wrong</button> to review every incorrect answer from this paper.
                    </div>
                  )}
                </div>

                <div className="rounded-xl bg-violet-50 border border-violet-100 p-3 text-xs sm:text-sm text-violet-900">
                  <p className="font-semibold">Session checklist</p>
                  <ol className="mt-2 list-decimal pl-4 space-y-1 text-violet-800">
                    <li>Re-attempt each wrong question above without looking at the answer.</li>
                    <li>Write a 1-line reason you missed it (concept / careless / time).</li>
                    <li>Ask AI Tutor about any concept that still feels unclear.</li>
                  </ol>
                </div>
              </CardContent>
            </Card>
            </div>
            <div>
              <div className="flex justify-between items-center mb-3 gap-2">
                <h3 className="font-bold text-base sm:text-lg">Chapters &amp; subtopics to focus on</h3>
                <span className="text-xs text-gray-500 shrink-0">From this exam</span>
              </div>
              {(() => {
                const cards =
                  focusChapters.length > 0
                    ? focusChapters.slice(0, 6).map((c) => ({
                        subjectLabel: subjectDisplayName(c.subject).toUpperCase(),
                        chapter: c.chapter,
                        pct: c.pct,
                        why:
                          c.wrong > 0
                            ? `${c.wrong} miss${c.wrong === 1 ? '' : 'es'} · ${Math.round(c.pct)}% accuracy`
                            : `${Math.round(c.pct)}% on this paper`,
                        subjectId: c.subjectId,
                        bg: (() => {
                          const k = normalizeSubjectKey(c.subject);
                          if (k === 'physics') return 'bg-orange-50';
                          if (k === 'maths') return 'bg-purple-50';
                          if (k === 'chemistry') return 'bg-yellow-50';
                          if (k === 'biology') return 'bg-emerald-50';
                          return 'bg-slate-50';
                        })(),
                      }))
                    : planVideoCards.map((v) => ({
                        subjectLabel: v.subj,
                        chapter: v.focusChapter || v.title,
                        pct: v.mastery,
                        why: v.why || 'Focus this chapter / subtopic',
                        subjectId: v.subjectId,
                        bg: v.bg,
                      }));

                if (cards.length === 0) {
                  return (
                    <div className="rounded-xl border bg-white p-4">
                      <p className="text-sm text-gray-600">
                        Chapter tags were thin on this paper. Review wrong answers, then open Learning Paths by subject.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-3"
                        onClick={() => setLocation('/learning-paths')}
                      >
                        Go to Learning Paths
                      </Button>
                    </div>
                  );
                }

                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {cards.map((card, i) => {
                      const open = () => {
                        const focusQ = card.chapter
                          ? `?focus=${encodeURIComponent(card.chapter)}`
                          : '';
                        if (card.subjectId) {
                          setLocation(`/subject/${card.subjectId}${focusQ}`);
                        } else {
                          setLocation(`/learning-paths${focusQ}`);
                        }
                      };
                      return (
                        <button
                          key={`${card.subjectLabel}-${card.chapter}-${i}`}
                          type="button"
                          onClick={open}
                          className={`rounded-xl p-4 ${card.bg} border relative min-h-[140px] text-left hover:shadow-md transition-shadow`}
                        >
                          <p className="text-micro font-bold text-gray-500">
                            {card.subjectLabel}
                            {card.pct != null ? ` · ${Math.round(Number(card.pct))}%` : ''}
                          </p>
                          <BookOpen className="w-6 h-6 sm:w-7 sm:h-7 text-[#7C3AED] mx-auto my-3" />
                          <p className="text-xs sm:text-sm font-semibold text-center leading-snug">
                            {card.chapter}
                          </p>
                          <p className="text-[11px] text-center text-[#7C3AED] font-medium mt-1">
                            Focus chapter / subtopic
                          </p>
                          <p className="text-xs text-center text-gray-600 mt-2">{card.why}</p>
                        </button>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
