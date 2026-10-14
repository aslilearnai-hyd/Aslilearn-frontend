import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2,
  XCircle,
  CircleDashed,
  Loader2,
  RefreshCw,
  FileQuestion,
  Presentation,
  Eye,
  ChevronLeft,
  ChevronRight,
  X,
  Users,
  UserRound,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { API_BASE_URL } from '@/lib/api-config';
import { getAuthToken } from '@/lib/auth-utils';
import { renderMarkdown } from '@/lib/render-teacher-markdown';
import {
  examOptionsAsText,
  resolveAnswerListForQuestion,
} from '@/lib/exam-answer-resolve';

export interface ExamListItem {
  _id: string;
  title: string;
  subject?: string;
  classNumber?: string;
  assignedClasses?: string[];
  totalQuestions?: number;
  studentsAttempted?: number;
  totalAttempts?: number;
  startDate?: string;
}

type StudentRef = { id: string; name: string };

type QuestionStatus = 'correct' | 'wrong' | 'not_answered';

interface QuestionStat {
  questionNumber: number;
  index: number;
  questionId: string;
  questionText: string;
  assertionText?: string;
  reasonText?: string;
  subject?: string;
  chapter?: string;
  difficulty?: string;
  questionType?: string;
  options?: string[];
  correctAnswer?: unknown;
  totalStudents: number;
  correct: number;
  wrong: number;
  unattempted: number;
  attempted: number;
  accuracyPct: number;
  classCorrectPct: number;
  studentsCorrect?: StudentRef[];
  studentsWrong?: StudentRef[];
  studentsUnattempted?: StudentRef[];
}

interface StudentReport {
  studentId: string;
  name: string;
  attempted: boolean;
  percentage: number | null;
  score: number | null;
  totalMarks: number | null;
  correctAnswers: number;
  wrongAnswers: number;
  unattempted: number;
  totalQuestions: number;
  completedAt: string | null;
  attemptNumber: number | null;
  resultId: string | null;
  questionBreakdown: Array<{
    questionNumber: number;
    index: number;
    questionId: string;
    questionText: string;
    subject?: string;
    status: QuestionStatus;
    timeTaken?: number;
  }>;
}

interface QuestionAnalyticsPayload {
  examId: string;
  examTitle: string;
  subject?: string;
  totalQuestions: number;
  totalStudents: number;
  studentsAttempted: number;
  studentsNotAttempted: number;
  questions: QuestionStat[];
  studentReports?: StudentReport[];
}

interface TeacherExamQuestionAnalyticsProps {
  classNumber?: string;
}

type ReviewMode = 'idle' | 'inline' | 'discuss';

function formatMarkValue(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

function studentMarksLabel(report: StudentReport): string {
  const totalMarks = report.totalMarks == null ? Number.NaN : Number(report.totalMarks);
  let obtainedMarks = report.score == null ? Number.NaN : Number(report.score);
  if (!Number.isFinite(obtainedMarks) && Number.isFinite(totalMarks) && report.percentage != null) {
    obtainedMarks = (Number(report.percentage) / 100) * totalMarks;
  }
  if (!Number.isFinite(obtainedMarks) || !Number.isFinite(totalMarks)) return 'Marks unavailable';
  return `${formatMarkValue(obtainedMarks)} / ${formatMarkValue(totalMarks)} marks`;
}

function authHeaders(): HeadersInit {
  const token = getAuthToken();
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    'Content-Type': 'application/json',
  };
}

function classQuery(classNumber?: string) {
  if (!classNumber || classNumber === 'all') return '';
  return `?classNumber=${encodeURIComponent(classNumber)}`;
}

function optionLabel(index: number) {
  return String.fromCharCode(65 + index);
}

function isOptionCorrect(question: QuestionStat, optionText: string): boolean {
  const correctTokens = resolveAnswerListForQuestion(
    { questionType: question.questionType, options: question.options },
    question.correctAnswer,
  );
  const optNorm = optionText.trim().toLowerCase();
  return correctTokens.some((t) => t === optNorm);
}

function StudentNameLists({ question }: { question: QuestionStat }) {
  const groups = [
    {
      key: 'correct',
      title: 'Attempted & correct',
      color: 'text-emerald-800 border-emerald-200 bg-emerald-50/80',
      Icon: CheckCircle2,
      iconClass: 'text-emerald-600',
      students: question.studentsCorrect || [],
    },
    {
      key: 'wrong',
      title: 'Attempted but wrong',
      color: 'text-rose-800 border-rose-200 bg-rose-50/80',
      Icon: XCircle,
      iconClass: 'text-rose-600',
      students: question.studentsWrong || [],
    },
    {
      key: 'blank',
      title: 'Unattempted',
      color: 'text-slate-700 border-slate-200 bg-slate-50',
      Icon: CircleDashed,
      iconClass: 'text-slate-500',
      students: question.studentsUnattempted || [],
    },
  ] as const;

  return (
    <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
      {groups.map((g) => (
        <div key={g.key} className={`rounded-xl border px-3 py-2.5 ${g.color}`}>
          <div className="flex items-center gap-1.5 text-xs font-semibold mb-1.5">
            <g.Icon className={`h-3.5 w-3.5 ${g.iconClass}`} />
            {g.title}
            <span className="ml-auto opacity-70 font-medium">({g.students.length})</span>
          </div>
          {g.students.length === 0 ? (
            <p className="text-[11px] opacity-60">None</p>
          ) : (
            <ul className="max-h-28 overflow-y-auto space-y-0.5 pr-0.5">
              {g.students.map((s) => (
                <li key={s.id} className="text-[11px] sm:text-xs font-medium truncate">
                  {s.name}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

function QuestionPaperCard({
  question,
  revealAnswers,
  selectedOption,
  onSelectOption,
}: {
  question: QuestionStat;
  revealAnswers: boolean;
  selectedOption: string | null;
  onSelectOption: (optionText: string) => void;
}) {
  const options = examOptionsAsText(question.options);
  const qType = String(question.questionType || 'mcq').toLowerCase();
  const correctTokens = resolveAnswerListForQuestion(
    { questionType: question.questionType, options: question.options },
    question.correctAnswer,
  );
  const matchedOptions = options.filter((o) =>
    correctTokens.includes(o.trim().toLowerCase()),
  );
  const correctDisplay =
    matchedOptions.length > 0
      ? matchedOptions.join(', ')
      : String(question.correctAnswer ?? '').trim() || '—';

  return (
    <div className="rounded-2xl border border-gray-100 bg-white px-4 py-4 sm:px-5 shadow-sm">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-lg bg-indigo-50 text-indigo-700 text-xs font-bold px-2.5 py-1">
            Q{question.questionNumber}
          </span>
          {question.subject ? (
            <Badge variant="outline" className="text-[10px] rounded-md capitalize">
              {question.subject}
            </Badge>
          ) : null}
          {question.chapter ? (
            <span className="text-[10px] text-gray-500 truncate max-w-[180px]">{question.chapter}</span>
          ) : null}
        </div>
        <div className="text-right shrink-0 text-[11px] text-gray-500">
          <p className="font-semibold text-gray-800">{question.classCorrectPct}% class correct</p>
          <p>
            {question.correct} correct · {question.wrong} incorrect · {question.unattempted} blank
          </p>
        </div>
      </div>

      <div
        className="prose prose-sm max-w-none text-sm sm:text-base text-gray-900 leading-relaxed mb-4"
        dangerouslySetInnerHTML={{
          __html: renderMarkdown(question.questionText || `Question ${question.questionNumber}`),
        }}
      />

      {qType === 'assertion-reason' || question.assertionText ? (
        <div className="mb-4 space-y-2 text-sm text-gray-800">
          {question.assertionText ? (
            <p>
              <span className="font-semibold text-gray-600">Assertion: </span>
              {question.assertionText}
            </p>
          ) : null}
          {question.reasonText ? (
            <p>
              <span className="font-semibold text-gray-600">Reason: </span>
              {question.reasonText}
            </p>
          ) : null}
        </div>
      ) : null}

      {options.length > 0 ? (
        <div className="space-y-2.5">
          {options.map((optionText, index) => {
            const isSelected = selectedOption === optionText;
            const isRight = isOptionCorrect(question, optionText);
            const showResult = revealAnswers || Boolean(selectedOption);
            let border = 'border-gray-200 bg-gray-50 hover:border-indigo-200';
            let text = 'text-gray-700';
            if (showResult && isRight) {
              border = 'border-emerald-400 bg-emerald-50';
              text = 'text-emerald-800 font-medium';
            } else if (showResult && isSelected && !isRight) {
              border = 'border-red-400 bg-red-50';
              text = 'text-red-800 font-medium';
            } else if (isSelected) {
              border = 'border-indigo-400 bg-indigo-50 ring-1 ring-indigo-200';
              text = 'text-indigo-900 font-medium';
            }

            return (
              <button
                key={`${question.questionId}-${index}`}
                type="button"
                onClick={() => onSelectOption(optionText)}
                className={`w-full flex items-center gap-3 p-3 sm:p-3.5 rounded-xl border-2 text-left transition ${border}`}
              >
                <span className="text-xs font-semibold text-gray-500 w-5 shrink-0">
                  {optionLabel(index)}.
                </span>
                <span className={`flex-1 text-sm ${text}`}>{optionText}</span>
                {showResult && isRight ? <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" /> : null}
                {showResult && isSelected && !isRight ? (
                  <XCircle className="h-4 w-4 text-red-600 shrink-0" />
                ) : null}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-600">
          {qType === 'integer' || qType === 'numerical' ? (
            <>
              <span className="font-medium text-gray-800">Correct answer: </span>
              {revealAnswers || selectedOption ? correctDisplay : 'Select “Show answers” or tap below to check'}
              {!revealAnswers ? (
                <button
                  type="button"
                  className="mt-2 block text-xs font-semibold text-indigo-600"
                  onClick={() => onSelectOption(correctDisplay)}
                >
                  Reveal correct answer
                </button>
              ) : null}
            </>
          ) : (
            <span>No options stored for this question.</span>
          )}
        </div>
      )}

      {(revealAnswers || selectedOption) && options.length > 0 ? (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg border border-indigo-100 bg-indigo-50/70 px-3 py-2">
            <p className="font-semibold text-indigo-800 mb-0.5">Your pick</p>
            <p className="text-indigo-900">{selectedOption || 'Not selected yet'}</p>
          </div>
          <div className="rounded-lg border border-emerald-100 bg-emerald-50/70 px-3 py-2">
            <p className="font-semibold text-emerald-800 mb-0.5">Correct answer</p>
            <p className="text-emerald-900">{correctDisplay}</p>
          </div>
        </div>
      ) : null}

      <StudentNameLists question={question} />
    </div>
  );
}

function StudentReportDialog({
  open,
  onOpenChange,
  report,
  examTitle,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  report: StudentReport | null;
  examTitle?: string;
}) {
  if (!report) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-lg">{report.name}</DialogTitle>
          <DialogDescription>
            {examTitle || 'Exam'} — individual question analysis
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2 text-xs mb-3">
          {report.attempted ? (
            <>
              <Badge className="rounded-lg bg-indigo-600">
                {studentMarksLabel(report)}
              </Badge>
              <Badge variant="secondary" className="rounded-lg">
                {report.correctAnswers} correct
              </Badge>
              <Badge variant="secondary" className="rounded-lg">
                {report.wrongAnswers} wrong
              </Badge>
              <Badge variant="secondary" className="rounded-lg">
                {report.unattempted} blank
              </Badge>
            </>
          ) : (
            <Badge variant="outline" className="rounded-lg">
              Did not attempt this paper
            </Badge>
          )}
        </div>

        <ul className="space-y-2">
          {report.questionBreakdown.map((row) => {
            const meta =
              row.status === 'correct'
                ? { label: 'Correct', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200', Icon: CheckCircle2 }
                : row.status === 'wrong'
                  ? { label: 'Wrong', cls: 'bg-rose-50 text-rose-800 border-rose-200', Icon: XCircle }
                  : { label: 'Unattempted', cls: 'bg-slate-50 text-slate-700 border-slate-200', Icon: CircleDashed };
            return (
              <li
                key={`${row.questionId}-${row.index}`}
                className={`rounded-xl border px-3 py-2.5 ${meta.cls}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold">Q{row.questionNumber}</span>
                  <meta.Icon className="h-3.5 w-3.5" />
                  <span className="text-[11px] font-semibold uppercase tracking-wide">{meta.label}</span>
                  {row.subject ? (
                    <span className="ml-auto text-[10px] opacity-70 capitalize">{row.subject}</span>
                  ) : null}
                </div>
                <p className="text-xs sm:text-sm line-clamp-3">{row.questionText}</p>
              </li>
            );
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

export function TeacherExamQuestionAnalytics({
  classNumber = 'all',
}: TeacherExamQuestionAnalyticsProps) {
  const [exams, setExams] = useState<ExamListItem[]>([]);
  const [studentCount, setStudentCount] = useState(0);
  const [selectedExamId, setSelectedExamId] = useState('');
  const [analytics, setAnalytics] = useState<QuestionAnalyticsPayload | null>(null);
  const [isLoadingExams, setIsLoadingExams] = useState(false);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ReviewMode>('idle');
  const [discussIndex, setDiscussIndex] = useState(0);
  const [selectedByQuestion, setSelectedByQuestion] = useState<Record<string, string>>({});
  const [reportStudent, setReportStudent] = useState<StudentReport | null>(null);

  const loadExams = useCallback(async () => {
    setIsLoadingExams(true);
    setError(null);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/teacher/exams${classQuery(classNumber)}`,
        { headers: authHeaders() },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Could not load exams');
      }
      const list: ExamListItem[] = Array.isArray(json.data?.exams) ? json.data.exams : [];
      setExams(list);
      setStudentCount(Number(json.data?.studentCount) || 0);
      setSelectedExamId((prev) => {
        if (prev && list.some((e) => e._id === prev)) return prev;
        const withAttempts = list.find((e) => (e.studentsAttempted || 0) > 0);
        return withAttempts?._id || list[0]?._id || '';
      });
    } catch (e) {
      setExams([]);
      setError(e instanceof Error ? e.message : 'Could not load exams');
    } finally {
      setIsLoadingExams(false);
    }
  }, [classNumber]);

  const loadAnalytics = useCallback(
    async (examId: string) => {
      if (!examId) {
        setAnalytics(null);
        return;
      }
      setIsLoadingAnalytics(true);
      setError(null);
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/teacher/exams/${encodeURIComponent(examId)}/question-analytics${classQuery(classNumber)}`,
          { headers: authHeaders() },
        );
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.success) {
          throw new Error(json.message || 'Could not load question analytics');
        }
        setAnalytics(json.data as QuestionAnalyticsPayload);
        setSelectedByQuestion({});
        setMode('idle');
        setDiscussIndex(0);
      } catch (e) {
        setAnalytics(null);
        setError(e instanceof Error ? e.message : 'Could not load question analytics');
      } finally {
        setIsLoadingAnalytics(false);
      }
    },
    [classNumber],
  );

  useEffect(() => {
    loadExams();
  }, [loadExams]);

  useEffect(() => {
    if (selectedExamId) loadAnalytics(selectedExamId);
  }, [selectedExamId, loadAnalytics]);

  useEffect(() => {
    if (mode !== 'discuss') return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [mode]);

  const questions = analytics?.questions || [];
  const studentReports = analytics?.studentReports || [];
  const activeDiscuss = questions[discussIndex] || null;

  const selectOption = useCallback((questionKey: string, optionText: string) => {
    setSelectedByQuestion((prev) => ({ ...prev, [questionKey]: optionText }));
  }, []);

  const questionKey = (q: QuestionStat) => `${q.questionId}-${q.index}`;

  const discussPortal =
    mode === 'discuss' && analytics && typeof document !== 'undefined'
      ? createPortal(
          <AnimatePresence>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[200] bg-slate-950/40 backdrop-blur-sm"
            >
              <motion.div
                initial={{ y: 24, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="absolute inset-0 sm:inset-3 md:inset-6 bg-[#f7f8fc] sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-white/40"
              >
                <header className="shrink-0 flex items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b border-gray-200 bg-white/90">
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-wide text-indigo-600 font-semibold">
                      Discuss paper
                    </p>
                    <h2 className="text-base sm:text-lg font-bold text-gray-900 truncate">
                      {analytics.examTitle}
                    </h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="rounded-lg hidden sm:inline-flex">
                      Q{discussIndex + 1} / {questions.length}
                    </Badge>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-xl"
                      onClick={() => setMode('idle')}
                    >
                      <X className="h-4 w-4 mr-1" />
                      Close
                    </Button>
                  </div>
                </header>

                <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
                  {activeDiscuss ? (
                    <QuestionPaperCard
                      question={activeDiscuss}
                      revealAnswers={false}
                      selectedOption={selectedByQuestion[questionKey(activeDiscuss)] || null}
                      onSelectOption={(opt) => selectOption(questionKey(activeDiscuss), opt)}
                    />
                  ) : null}

                  <section className="mt-6 mb-4">
                    <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2 mb-3">
                      <Users className="h-4 w-4 text-indigo-600" />
                      Individual student reports
                    </h3>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {studentReports.map((s) => (
                        <button
                          key={s.studentId}
                          type="button"
                          onClick={() => setReportStudent(s)}
                          className="text-left rounded-xl border border-gray-200 bg-white px-3 py-2.5 hover:border-indigo-300 hover:shadow-sm transition"
                        >
                          <div className="flex items-center gap-2">
                            <UserRound className="h-4 w-4 text-gray-400" />
                            <span className="text-sm font-semibold text-gray-900 truncate">{s.name}</span>
                          </div>
                          <p className="text-[11px] text-gray-500 mt-1 pl-6">
                            {s.attempted
                              ? `${studentMarksLabel(s)} · ${s.correctAnswers} correct ${s.wrongAnswers} incorrect`
                              : 'Not attempted'}
                          </p>
                        </button>
                      ))}
                    </div>
                  </section>
                </div>

                <footer className="shrink-0 flex items-center justify-between gap-3 px-4 sm:px-6 py-3 border-t border-gray-200 bg-white/90">
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-xl"
                    disabled={discussIndex <= 0}
                    onClick={() => setDiscussIndex((i) => Math.max(0, i - 1))}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Prev
                  </Button>
                  <div className="flex flex-wrap justify-center gap-1.5 max-w-[50vw] overflow-x-auto">
                    {questions.map((q, i) => (
                      <button
                        key={questionKey(q)}
                        type="button"
                        onClick={() => setDiscussIndex(i)}
                        className={`h-8 min-w-8 px-2 rounded-lg text-xs font-bold border ${
                          i === discussIndex
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white text-gray-700 border-gray-200 hover:border-indigo-300'
                        }`}
                      >
                        {q.questionNumber}
                      </button>
                    ))}
                  </div>
                  <Button
                    type="button"
                    className="rounded-xl bg-indigo-600 hover:bg-indigo-700"
                    disabled={discussIndex >= questions.length - 1}
                    onClick={() => setDiscussIndex((i) => Math.min(questions.length - 1, i + 1))}
                  >
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </footer>
              </motion.div>
            </motion.div>
          </AnimatePresence>,
          document.body,
        )
      : null;

  return (
    <>
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white/60 backdrop-blur-xl rounded-2xl p-4 sm:p-5 shadow-xl border border-white/20"
      >
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-gray-900 flex items-center gap-2">
              <FileQuestion className="w-5 h-5 text-indigo-600" />
              Exam paper review
            </h3>
            <p className="text-xs sm:text-sm text-gray-600 mt-1">
              Discuss the paper full-page, or show answers inline — tap any option to see correct / wrong, with student names under each question.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-xl shrink-0"
            onClick={() => {
              loadExams();
              if (selectedExamId) loadAnalytics(selectedExamId);
            }}
            disabled={isLoadingExams || isLoadingAnalytics}
          >
            <RefreshCw
              className={`mr-1.5 h-3.5 w-3.5 ${isLoadingExams || isLoadingAnalytics ? 'animate-spin' : ''}`}
            />
            Refresh
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-end gap-3 mb-4">
          <div className="flex-1 min-w-0 space-y-1.5">
            <Label className="text-xs font-medium text-gray-700">Exam paper</Label>
            <Select
              value={selectedExamId || undefined}
              onValueChange={setSelectedExamId}
              disabled={isLoadingExams || exams.length === 0}
            >
              <SelectTrigger className="w-full rounded-xl bg-white/80 border-gray-200">
                <SelectValue placeholder={isLoadingExams ? 'Loading exams…' : 'Select an exam'} />
              </SelectTrigger>
              <SelectContent>
                {exams.map((exam) => (
                  <SelectItem key={exam._id} value={exam._id}>
                    {exam.title}
                    {(exam.studentsAttempted || 0) > 0
                      ? ` · ${exam.studentsAttempted} attempted`
                      : ' · no attempts yet'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {analytics ? (
            <div className="flex flex-wrap gap-2 text-xs text-gray-600 pb-1">
              <Badge variant="secondary" className="rounded-lg font-normal">
                {analytics.totalStudents} students
              </Badge>
              <Badge variant="secondary" className="rounded-lg font-normal">
                {analytics.studentsAttempted} took exam
              </Badge>
              <Badge variant="secondary" className="rounded-lg font-normal">
                {analytics.totalQuestions} questions
              </Badge>
            </div>
          ) : studentCount > 0 ? (
            <p className="text-xs text-gray-500 pb-1">{studentCount} students in current class filter</p>
          ) : null}
        </div>

        {error ? <p className="text-sm text-rose-600 mb-3">{error}</p> : null}

        {isLoadingAnalytics ? (
          <div className="flex items-center justify-center gap-2 py-10 text-gray-500 text-sm">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading paper…
          </div>
        ) : !selectedExamId || exams.length === 0 ? (
          <p className="text-sm text-gray-500 py-6 text-center">No exams found for this class filter yet.</p>
        ) : !questions.length ? (
          <p className="text-sm text-gray-500 py-6 text-center">
            No question-level data for this paper yet. Students need to submit the exam first.
          </p>
        ) : (
          <>
            <div className="flex flex-col sm:flex-row gap-2 mb-4">
              <Button
                type="button"
                className="rounded-xl bg-indigo-600 hover:bg-indigo-700 flex-1 sm:flex-none"
                onClick={() => {
                  setDiscussIndex(0);
                  setMode('discuss');
                }}
              >
                <Presentation className="h-4 w-4 mr-2" />
                Discuss paper
              </Button>
              <Button
                type="button"
                variant={mode === 'inline' ? 'default' : 'outline'}
                className={`rounded-xl flex-1 sm:flex-none ${mode === 'inline' ? 'bg-violet-600 hover:bg-violet-700' : ''}`}
                onClick={() => setMode((m) => (m === 'inline' ? 'idle' : 'inline'))}
              >
                <Eye className="h-4 w-4 mr-2" />
                {mode === 'inline' ? 'Hide answers' : 'Show answers'}
              </Button>
            </div>

            {mode === 'inline' ? (
              <div className="space-y-4 max-h-[640px] overflow-y-auto pr-1">
                {questions.map((q) => (
                  <QuestionPaperCard
                    key={questionKey(q)}
                    question={q}
                    revealAnswers
                    selectedOption={selectedByQuestion[questionKey(q)] || null}
                    onSelectOption={(opt) => selectOption(questionKey(q), opt)}
                  />
                ))}
              </div>
            ) : mode === 'idle' ? (
              <div className="rounded-xl border border-dashed border-indigo-200 bg-indigo-50/40 px-4 py-8 text-center">
                <p className="text-sm text-indigo-900 font-medium">
                  Choose <span className="font-bold">Discuss paper</span> for a full-page walkthrough, or{' '}
                  <span className="font-bold">Show answers</span> to review every question here.
                </p>
              </div>
            ) : null}

            <section className="mt-6">
              <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2 mb-3">
                <Users className="h-4 w-4 text-indigo-600" />
                Individual student reports
              </h4>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 max-h-64 overflow-y-auto pr-1">
                {studentReports.map((s) => (
                  <button
                    key={s.studentId}
                    type="button"
                    onClick={() => setReportStudent(s)}
                    className="text-left rounded-xl border border-gray-100 bg-white/90 px-3 py-2.5 hover:border-indigo-300 transition"
                  >
                    <div className="flex items-center gap-2">
                      <UserRound className="h-4 w-4 text-gray-400 shrink-0" />
                      <span className="text-sm font-semibold text-gray-900 truncate">{s.name}</span>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-1 pl-6">
                      {s.attempted
                        ? `${studentMarksLabel(s)} · ${s.correctAnswers} correct · ${s.wrongAnswers} wrong`
                        : 'Not attempted'}
                    </p>
                  </button>
                ))}
              </div>
            </section>
          </>
        )}
      </motion.section>

      {discussPortal}

      <StudentReportDialog
        open={Boolean(reportStudent)}
        onOpenChange={(open) => {
          if (!open) setReportStudent(null);
        }}
        report={reportStudent}
        examTitle={analytics?.examTitle}
      />
    </>
  );
}
