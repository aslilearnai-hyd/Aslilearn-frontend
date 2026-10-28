import { useState, useEffect, useRef } from 'react';
import { API_BASE_URL } from '@/lib/api-config';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { getAuthToken, getUser, getUserIdFromAuthToken } from '@/lib/auth-utils';
import { AuthenticatedUploadImage } from '@/components/AuthenticatedUploadImage';
import { MatchColumnsTable } from '@/components/exam/MatchColumnsTable';
import ExamMathText from '@/components/exam/ExamMathText';
import {
  Clock, 
  CheckCircle, 
  XCircle, 
  ArrowLeft, 
  ArrowRight, 
  Flag,
  AlertTriangle,
  BookOpen,
  Calculator,
  ChevronUp,
  ChevronDown,
  Star,
  Trophy,
  FileText,
  TrendingUp,
  Info,
  ShieldCheck,
  Lock,
  Bookmark
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import {
  resolveAnswerListForQuestion,
  resolveAnswerTokenForQuestion,
} from '@/lib/exam-answer-resolve';
import { normalizeAndFormatExamDisplayText, resolveAssertionReasonDisplay } from '@/lib/exam-text-normalize';
import {
  clearLocalExamDraft,
  pickResumeDraft,
  readLocalExamDraft,
  writeLocalExamDraft,
  normalizeDraftAnswers,
  type ExamDraftLocal,
} from '@/lib/exam-attempt-draft';

interface Question {
  _id: string;
  questionText: string;
  questionImage?: string;
  questionType: 'mcq' | 'multiple' | 'integer' | 'assertion_reason' | 'match_following' | string;
  options?: (string | { text: string; isCorrect?: boolean; _id?: string })[];
  correctAnswer: string | string[] | { text: string; isCorrect?: boolean; _id?: string } | { text: string; isCorrect?: boolean; _id?: string }[];
  marks: number;
  negativeMarks: number;
  explanation?: string;
  subject: string;
  displayOrder?: number;
  sectionHeading?: string;
  sharedMatterKind?: string;
  sharedMatterText?: string;
  assertionText?: string;
  reasonText?: string;
}

const SUBJECT_SECTION_LABELS: Record<string, string> = {
  maths: 'Maths',
  physics: 'Physics',
  chemistry: 'Chemistry',
  biology: 'Biology',
};

function resolveAttemptSectionHeading(q?: {
  sectionHeading?: string;
  subject?: string;
} | null) {
  if (!q) return '';
  const custom = String(q.sectionHeading || '').trim();
  if (custom) return custom;
  const key = String(q.subject || '').trim().toLowerCase();
  return SUBJECT_SECTION_LABELS[key] || (key ? key.charAt(0).toUpperCase() + key.slice(1) : '');
}

const SECTION_HEADING_THEMES: Record<string, string> = {
  maths: 'border-sky-200 bg-sky-50 text-sky-800',
  math: 'border-sky-200 bg-sky-50 text-sky-800',
  mathematics: 'border-sky-200 bg-sky-50 text-sky-800',
  physics: 'border-violet-200 bg-violet-50 text-violet-800',
  chemistry: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  biology: 'border-rose-200 bg-rose-50 text-rose-800',
};

function sectionHeadingTheme(heading: string, subject?: string) {
  const keys = [subject, heading].map((v) => String(v || '').trim().toLowerCase());
  for (const key of keys) {
    if (key && SECTION_HEADING_THEMES[key]) return SECTION_HEADING_THEMES[key];
  }
  return 'border-indigo-200 bg-indigo-50 text-indigo-800';
}

interface Exam {
  _id: string;
  title: string;
  description: string;
  examType: 'weekend' | 'mains' | 'advanced' | 'practice';
  duration: number;
  totalQuestions: number;
  totalMarks: number;
  instructions: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  questions: Question[];
  classNumber?: string | number;
  negativeMarking?: boolean;
}

interface ExamResult {
  attemptNumber?: number;
  examId: string;
  examTitle: string;
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
  };
  answers: Record<string, any>;
  questions?: Question[];
  questionTimings?: Record<string, number>;
}

interface AnimatedExamProps {
  examId: string;
  onComplete: (result: ExamResult) => void;
  onExit: () => void;
}

/** Normalize question id so answer map keys always match (fixes clear / submit with mixed id shapes). */
function answerKey(questionOrId: Question | string | null | undefined): string {
  if (questionOrId == null) return '';
  if (typeof questionOrId === 'string') return questionOrId;
  return String(questionOrId._id ?? (questionOrId as any).id ?? '');
}

/** True only when the student has a non-empty response for this question type. */
function isAnswerProvidedForQuestion(question: Question, raw: any): boolean {
  if (raw === undefined || raw === null) return false;
  const t = String(question.questionType || 'mcq').toLowerCase().trim();
  if (t === 'multiple' || t === 'multi' || t === 'msq') {
    return Array.isArray(raw) && raw.length > 0;
  }
  // mcq, assertion_reason, match_following, integer, and unknown single-value types
  if (Array.isArray(raw)) return raw.length > 0;
  return String(raw).trim() !== '';
}

export default function AnimatedExam({ examId, onComplete, onExit }: AnimatedExamProps) {
  const { toast } = useToast();
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const navigatorGridRef = useRef<HTMLDivElement | null>(null);
  // Keep the current question number visible in the navigator (Q61 of 80 was
  // off-screen). Scroll only the grid, never the page.
  useEffect(() => {
    const grid = navigatorGridRef.current;
    const btn = grid?.querySelector<HTMLElement>(`[data-qnav="${currentQuestionIndex}"]`);
    if (!grid || !btn) return;
    const top = btn.offsetTop; // grid is the offsetParent (relative)
    if (top < grid.scrollTop || top + btn.offsetHeight > grid.scrollTop + grid.clientHeight) {
      grid.scrollTo({ top: Math.max(0, top - grid.clientHeight / 2 + btn.offsetHeight / 2), behavior: 'smooth' });
    }
  }, [currentQuestionIndex]);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [flaggedQuestions, setFlaggedQuestions] = useState<Set<number>>(new Set());
  const [timeLeft, setTimeLeft] = useState(0);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [animationDirection, setAnimationDirection] = useState<'up' | 'down'>('up');
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [showAnswerFeedback, setShowAnswerFeedback] = useState(false);
  /** Bumps when MCQ is cleared so Radix RadioGroup remounts and truly deselects. */
  const [mcqRadioNonce, setMcqRadioNonce] = useState(0);
  const [isAnswerCorrect, setIsAnswerCorrect] = useState<boolean | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [exitAttempts, setExitAttempts] = useState(0);
  const [showExitWarning, setShowExitWarning] = useState(false);
  const [showReenterPrompt, setShowReenterPrompt] = useState(false);
  const [timerInitialized, setTimerInitialized] = useState(false);
  const [questionTimings, setQuestionTimings] = useState<Record<string, number>>({});
  const [resumeNotice, setResumeNotice] = useState<string | null>(null);
  const [pendingForceSubmit, setPendingForceSubmit] = useState(false);
  const MAX_EXIT_ATTEMPTS = 5;
  const submissionInProgressRef = useRef(false);
  const autoSubmitTriggeredRef = useRef(false);
  const autoSubmitTimeoutRef = useRef<number | null>(null);
  const handleSubmitRef = useRef<() => Promise<void>>(async () => {});
  const questionScrollAnchorRef = useRef<HTMLDivElement | null>(null);
  const questionEnterTimestampRef = useRef<number>(Date.now());
  const lastTrackedQuestionIdRef = useRef<string | null>(null);
  const initializedExamIdRef = useRef<string | null>(null);
  const answersRef = useRef(answers);
  const timeLeftRef = useRef(timeLeft);
  const flaggedRef = useRef(flaggedQuestions);
  const questionTimingsRef = useRef(questionTimings);
  const currentIndexRef = useRef(currentQuestionIndex);
  const isSubmittedRef = useRef(isSubmitted);
  const draftHydratedRef = useRef(false);

  answersRef.current = answers;
  timeLeftRef.current = timeLeft;
  flaggedRef.current = flaggedQuestions;
  questionTimingsRef.current = questionTimings;
  currentIndexRef.current = currentQuestionIndex;
  isSubmittedRef.current = isSubmitted;

  const resolveDraftUserId = () => {
    const u = getUser();
    return String(u?._id || u?.id || getUserIdFromAuthToken() || '');
  };

  const persistDraftNow = async (opts?: {
    keepalive?: boolean;
    remainingSeconds?: number;
    answers?: Record<string, unknown>;
    flaggedQuestions?: number[];
    questionTimings?: Record<string, number>;
    currentQuestionIndex?: number;
  }) => {
    if (!exam || isSubmittedRef.current || submissionInProgressRef.current) return;
    const durationSeconds = Math.max(
      60,
      Math.round((Number(exam.duration) > 0 ? Number(exam.duration) : 30) * 60),
    );
    const remainingSeconds = Math.max(
      0,
      Number.isFinite(Number(opts?.remainingSeconds))
        ? Number(opts?.remainingSeconds)
        : timeLeftRef.current || 0,
    );
    const payload = {
      answers: normalizeDraftAnswers(
        (opts?.answers as Record<string, unknown> | undefined) ??
          (answersRef.current as Record<string, unknown>) ??
          {},
      ),
      flaggedQuestions: Array.isArray(opts?.flaggedQuestions)
        ? opts.flaggedQuestions
        : Array.from(flaggedRef.current || []),
      questionTimings:
        opts?.questionTimings && typeof opts.questionTimings === 'object'
          ? opts.questionTimings
          : questionTimingsRef.current || {},
      currentQuestionIndex: Number.isFinite(Number(opts?.currentQuestionIndex))
        ? Math.max(0, Number(opts?.currentQuestionIndex))
        : currentIndexRef.current || 0,
      remainingSeconds,
      durationSeconds,
    };
    writeLocalExamDraft(examId, payload, resolveDraftUserId());
    try {
      await fetch(`${API_BASE_URL}/api/student/exams/${examId}/attempt-draft`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(payload),
        keepalive: opts?.keepalive === true,
      });
    } catch (err) {
      console.warn('Exam autosave failed (local backup kept):', err);
    }
  };

  // Fetch exam data
  const { data: exam, isLoading, isFetching, isError, error, refetch: refetchExam } = useQuery({
    queryKey: ['/api/student/exams', examId],
    queryFn: async () => {
      const headers = {
        'Authorization': `Bearer ${getAuthToken()}`,
        'Content-Type': 'application/json'
      };

      const response = await fetch(`${API_BASE_URL}/api/student/exams/${examId}`, {
        headers,
        credentials: 'include'
      });
      
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.message || 'Failed to fetch exam');
      }
      
      const examData = await response.json();
      console.log('Fetched exam data:', examData);
      
      // Handle API response structure - check if data is nested
      const actualExamData = examData.data || examData;
      console.log('Actual exam data:', actualExamData);
      console.log('Questions:', actualExamData.questions);
      
      // Check if the response indicates success
      if (examData.success === false) {
        throw new Error(examData.message || 'Failed to fetch exam');
      }

      // Safety fallback: if direct exam endpoint returns empty questions, re-check
      // using exams list payload (which may already have hydrated questions).
      const hasQuestions = Array.isArray(actualExamData.questions) && actualExamData.questions.length > 0;
      if (!hasQuestions) {
        const listResponse = await fetch(`${API_BASE_URL}/api/student/exams`, {
          headers,
          credentials: 'include'
        });

        if (listResponse.ok) {
          const listPayload = await listResponse.json().catch(() => ({}));
          const listExams = Array.isArray(listPayload)
            ? listPayload
            : Array.isArray(listPayload?.data)
            ? listPayload.data
            : [];
          const matchedExam = listExams.find((e: any) => String(e?._id) === String(examId));
          const matchedQuestions = Array.isArray(matchedExam?.questions) ? matchedExam.questions : [];
          if (matchedQuestions.length > 0) {
            return {
              ...actualExamData,
              ...matchedExam,
              questions: matchedQuestions,
              totalQuestions: matchedQuestions.length,
            };
          }
        }
      }

      if (actualExamData.questions && actualExamData.questions.length > 0) {
        console.log('First question details:', {
          id: actualExamData.questions[0]._id,
          type: actualExamData.questions[0].questionType,
          options: actualExamData.questions[0].options,
          correctAnswer: actualExamData.questions[0].correctAnswer
        });
      } else {
        console.warn('No questions found in exam:', {
          examId: actualExamData._id,
          examTitle: actualExamData.title,
          questions: actualExamData.questions
        });
      }
      
      return actualExamData;
    },
    retry: 2,
    retryDelay: (attempt) => Math.min(750 * 2 ** attempt, 3000),
    // During an active exam, refetch on focus can re-run exam data and
    // accidentally reset timer state while switching fullscreen.
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // Initialize timer + restore autosaved answers (timer freezes at last save while offline)
  useEffect(() => {
    if (!exam) {
      setTimeLeft(0);
      setTimerInitialized(false);
      initializedExamIdRef.current = null;
      draftHydratedRef.current = false;
      return;
    }

    const incomingExamId = String(exam._id || examId || '');
    const alreadyInitializedForSameExam = initializedExamIdRef.current === incomingExamId;
    if (alreadyInitializedForSameExam && timerInitialized) {
      return;
    }

    let cancelled = false;
    const rawDuration = Number(exam.duration);
    const safeDurationMinutes =
      Number.isFinite(rawDuration) && rawDuration > 0 ? rawDuration : 30;
    const fullSeconds = Math.round(safeDurationMinutes * 60);

    (async () => {
      let serverDraft: ExamDraftLocal | null = null;
      let draftMeta: {
        forceSubmit?: boolean;
        resumeLimitReached?: boolean;
        examEnded?: boolean;
        message?: string;
        resumeCount?: number;
        maxResumes?: number;
      } = {};
      try {
        const res = await fetch(`${API_BASE_URL}/api/student/exams/${examId}/attempt-draft`, {
          headers: {
            Authorization: `Bearer ${getAuthToken()}`,
            'Content-Type': 'application/json',
          },
          credentials: 'include',
        });
        if (res.ok) {
          const json = await res.json();
          draftMeta = {
            forceSubmit: Boolean(json?.forceSubmit || (exam as any)?.forceSubmitExam),
            resumeLimitReached: Boolean(json?.resumeLimitReached),
            examEnded: Boolean(json?.examEnded || (exam as any)?.forceSubmitExam),
            message: json?.message || (exam as any)?.examWindowMessage || undefined,
            resumeCount: Number(json?.data?.resumeCount) || 0,
            maxResumes: Number(json?.data?.maxResumes) || Number(json?.maxResumes) || 5,
          };
          if (json?.data) {
            serverDraft = {
              examId: String(json.data.examId || examId),
              answers: json.data.answers || {},
              flaggedQuestions: Array.isArray(json.data.flaggedQuestions)
                ? json.data.flaggedQuestions
                : [],
              questionTimings: json.data.questionTimings || {},
              currentQuestionIndex: Number(json.data.currentQuestionIndex) || 0,
              remainingSeconds: Math.max(0, Number(json.data.remainingSeconds) || 0),
              durationSeconds: Math.max(1, Number(json.data.durationSeconds) || fullSeconds),
              lastSavedAt: String(json.data.lastSavedAt || new Date().toISOString()),
            };
          }
        }
      } catch (err) {
        console.warn('Failed to load exam draft from server:', err);
      }

      if (cancelled) return;

      const localDraft = readLocalExamDraft(examId, resolveDraftUserId());
      const draft = pickResumeDraft(serverDraft, localDraft);
      const mustForceSubmit = Boolean(draftMeta.forceSubmit && draft);

      if (draft) {
        const restoredAnswers = normalizeDraftAnswers(draft.answers as Record<string, unknown>);
        const restoredFlags = Array.isArray(draft.flaggedQuestions) ? draft.flaggedQuestions : [];
        const restoredTimings =
          draft.questionTimings && typeof draft.questionTimings === 'object'
            ? draft.questionTimings
            : {};
        const maxIdx = Math.max(0, (exam.questions?.length || 1) - 1);
        const restoredIndex = Math.min(maxIdx, Math.max(0, draft.currentQuestionIndex || 0));
        const resumeSeconds = Math.min(fullSeconds, Math.max(0, Number(draft.remainingSeconds) || 0));

        answersRef.current = restoredAnswers;
        flaggedRef.current = new Set(restoredFlags);
        questionTimingsRef.current = restoredTimings;
        currentIndexRef.current = restoredIndex;
        timeLeftRef.current = resumeSeconds;

        setAnswers(restoredAnswers);
        setFlaggedQuestions(new Set(restoredFlags));
        setQuestionTimings(restoredTimings);
        setCurrentQuestionIndex(restoredIndex);
        setTimeLeft(resumeSeconds);

        const answered = Object.keys(restoredAnswers).length;
        const mm = Math.floor(resumeSeconds / 60);
        const ss = resumeSeconds % 60;
        const resumeUsed = Math.max(0, Number(draftMeta.resumeCount) || 0);
        const resumeMax = Math.max(1, Number(draftMeta.maxResumes) || 5);

        if (mustForceSubmit) {
          setResumeNotice(
            draftMeta.message ||
              (draftMeta.examEnded
                ? 'Exam window has ended — submitting your saved answers.'
                : `Resume limit (${resumeMax}) reached — submitting your saved answers.`),
          );
          setPendingForceSubmit(true);
        } else {
          setResumeNotice(
            answered > 0 || resumeSeconds < fullSeconds - 5
              ? `Resumed (${resumeUsed}/${resumeMax}) — ${answered} answer(s) restored · ${mm}:${String(ss).padStart(2, '0')} left`
              : `Resuming (${resumeUsed}/${resumeMax}) — ${mm}:${String(ss).padStart(2, '0')} left`,
          );
          if (!cancelled) {
            void persistDraftNow({
              remainingSeconds: resumeSeconds,
              answers: restoredAnswers,
              flaggedQuestions: restoredFlags,
              questionTimings: restoredTimings,
              currentQuestionIndex: restoredIndex,
            });
          }
        }
      } else if ((exam as any)?.forceSubmitExam) {
        setResumeNotice(
          (exam as any)?.examWindowMessage ||
            'Exam window has ended. No saved progress to submit.',
        );
        timeLeftRef.current = 0;
        setTimeLeft(0);
      } else {
        timeLeftRef.current = fullSeconds;
        setTimeLeft(fullSeconds);
        if (!cancelled) {
          void persistDraftNow({
            remainingSeconds: fullSeconds,
            answers: {},
            flaggedQuestions: [],
            questionTimings: {},
            currentQuestionIndex: 0,
          });
        }
      }

      setTimerInitialized(true);
      initializedExamIdRef.current = incomingExamId;
      draftHydratedRef.current = true;
    })();

    return () => {
      cancelled = true;
    };
  }, [exam, examId, timerInitialized]);

  // Periodic autosave + save on tab hide / page close (freezes remaining time on server)
  useEffect(() => {
    if (!exam || !timerInitialized || isSubmitted || pendingForceSubmit) return;

    const interval = window.setInterval(() => {
      void persistDraftNow();
    }, 15000);

    const onHide = () => {
      if (document.visibilityState === 'hidden') {
        void persistDraftNow({ keepalive: true });
      }
    };
    const onUnload = () => {
      void persistDraftNow({ keepalive: true });
    };

    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onUnload);
    window.addEventListener('beforeunload', onUnload);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onUnload);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, [exam, examId, timerInitialized, isSubmitted, pendingForceSubmit]);

  // Debounced autosave when answers change
  useEffect(() => {
    if (!exam || !timerInitialized || isSubmitted || pendingForceSubmit || !draftHydratedRef.current) return;
    const t = window.setTimeout(() => {
      void persistDraftNow();
    }, 1200);
    return () => window.clearTimeout(t);
  }, [answers, flaggedQuestions, currentQuestionIndex, exam, timerInitialized, isSubmitted, pendingForceSubmit]);

  // Function to enter/re-enter fullscreen
  const enterFullscreen = async () => {
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
        setIsFullscreen(true);
        setShowReenterPrompt(false);
      } else if ((document.documentElement as any).webkitRequestFullscreen) {
        await (document.documentElement as any).webkitRequestFullscreen();
        setIsFullscreen(true);
        setShowReenterPrompt(false);
      } else if ((document.documentElement as any).mozRequestFullScreen) {
        await (document.documentElement as any).mozRequestFullScreen();
        setIsFullscreen(true);
        setShowReenterPrompt(false);
      } else if ((document.documentElement as any).msRequestFullscreen) {
        await (document.documentElement as any).msRequestFullscreen();
        setIsFullscreen(true);
        setShowReenterPrompt(false);
      }
    } catch (error) {
      console.log('Fullscreen not available:', error);
    }
  };

  // Enter fullscreen on mount
  useEffect(() => {
    enterFullscreen();

    // Listen for fullscreen changes
    const handleFullscreenChange = () => {
      if (submissionInProgressRef.current) {
        return;
      }

      const isCurrentlyFullscreen = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );
      
      setIsFullscreen(isCurrentlyFullscreen);
      
      // If exited fullscreen and not submitted, show warning and prompt
      if (!isCurrentlyFullscreen && !isSubmitted) {
        setExitAttempts(prev => Math.min(prev + 1, MAX_EXIT_ATTEMPTS));
        setShowExitWarning(true);
        setShowReenterPrompt(true);
      } else if (isCurrentlyFullscreen) {
        // If back in fullscreen, hide warnings
        setShowExitWarning(false);
        setShowReenterPrompt(false);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    // Prevent context menu and other shortcuts
    const preventDefaults = (e: Event) => {
      e.preventDefault();
      return false;
    };

    document.addEventListener('contextmenu', preventDefaults);
    document.addEventListener('keydown', (e) => {
      // Prevent F11, Alt+Tab, etc.
      if (e.key === 'F11' || (e.altKey && e.key === 'Tab')) {
        e.preventDefault();
      }
    });

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
      document.removeEventListener('contextmenu', preventDefaults);
    };
  }, [isSubmitted]);

  // Trigger auto-submit once when max fullscreen exits are reached.
  useEffect(() => {
    if (
      isSubmitted ||
      exitAttempts < MAX_EXIT_ATTEMPTS ||
      autoSubmitTriggeredRef.current ||
      submissionInProgressRef.current
    ) {
      return;
    }

    console.log('⚠️ Maximum exit attempts reached. Auto-submitting exam...');
    setShowExitWarning(true);
    setShowReenterPrompt(false);

    autoSubmitTriggeredRef.current = true;
    if (autoSubmitTimeoutRef.current !== null) {
      window.clearTimeout(autoSubmitTimeoutRef.current);
    }
    // Keep warning visible briefly, then force submit once.
    autoSubmitTimeoutRef.current = window.setTimeout(() => {
      void handleSubmit();
    }, 1200);
  }, [exitAttempts, isSubmitted]);

  useEffect(() => {
    return () => {
      if (autoSubmitTimeoutRef.current !== null) {
        window.clearTimeout(autoSubmitTimeoutRef.current);
      }
    };
  }, []);

  // Timer countdown
  useEffect(() => {
    if (!exam || !timerInitialized || isSubmitted) return;

    if (timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
      return () => clearTimeout(timer);
    } else if (timeLeft === 0) {
      handleSubmit();
    }
  }, [timeLeft, isSubmitted, exam, timerInitialized]);

  useEffect(() => {
    if (!exam?.questions?.length) return;
    if (lastTrackedQuestionIdRef.current) return;
    const currentQuestion = exam.questions[currentQuestionIndex];
    if (!currentQuestion?._id) return;
    lastTrackedQuestionIdRef.current = String(currentQuestion._id);
    questionEnterTimestampRef.current = Date.now();
  }, [exam, currentQuestionIndex]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    questionScrollAnchorRef.current?.scrollIntoView({ block: 'start', behavior: 'auto' });
  }, [currentQuestionIndex]);

  const recordCurrentQuestionDuration = (baseTimings: Record<string, number> = questionTimings) => {
    if (!exam?.questions?.length) return;
    const now = Date.now();
    const current = exam.questions[currentQuestionIndex];
    const currentId = current?._id ? String(current._id) : null;
    if (!currentId) return;

    if (!lastTrackedQuestionIdRef.current) {
      lastTrackedQuestionIdRef.current = currentId;
      questionEnterTimestampRef.current = now;
      return;
    }

    const elapsedSec = Math.max(0, Math.round((now - questionEnterTimestampRef.current) / 1000));
    const trackedId = lastTrackedQuestionIdRef.current;
    let updatedTimings = baseTimings;
    if (elapsedSec > 0) {
      updatedTimings = {
        ...baseTimings,
        [trackedId]: (baseTimings[trackedId] || 0) + elapsedSec,
      };
      setQuestionTimings(updatedTimings);
    }
    lastTrackedQuestionIdRef.current = currentId;
    questionEnterTimestampRef.current = now;
    return updatedTimings;
  };

  const handleAnswerChange = (questionId: string, value: any) => {
    const k = answerKey(questionId);
    if (!k) return;
    setAnswers(prev => {
      const next = {
        ...prev,
        [k]: value
      };
      answersRef.current = next;
      return next;
    });
    
    // Add interactive feedback
    setSelectedAnswer(value);
    setShowAnswerFeedback(true);
    
    // Show brief feedback animation
    setTimeout(() => {
      setShowAnswerFeedback(false);
      setSelectedAnswer(null);
    }, 1000);
  };

  const handleFlagQuestion = (questionIndex: number) => {
    setFlaggedQuestions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(questionIndex)) {
        newSet.delete(questionIndex);
      } else {
        newSet.add(questionIndex);
      }
      flaggedRef.current = newSet;
      return newSet;
    });
  };

  const handleClearCurrentAnswer = () => {
    if (!exam?.questions?.[currentQuestionIndex]) return;
    const q = exam.questions[currentQuestionIndex];
    const k = answerKey(q);
    if (!k) return;
    setAnswers((prev) => {
      const next = { ...prev };
      delete next[k];
      answersRef.current = next;
      return next;
    });
    setSelectedAnswer(null);
    setShowAnswerFeedback(false);
    if (q.questionType === 'mcq' || q.questionType === 'assertion_reason' || q.questionType === 'match_following') {
      setMcqRadioNonce((n) => n + 1);
    }
  };

  const animateToQuestion = (newIndex: number) => {
    if (isAnimating || newIndex === currentQuestionIndex) return;
    try {
      recordCurrentQuestionDuration(questionTimings);
    } catch (timingError) {
      console.warn('Failed to record final question timing:', timingError);
    }
    
    setIsAnimating(true);
    setAnimationDirection(newIndex > currentQuestionIndex ? 'up' : 'down');
    
    // Add a slight delay for smoother animation
    setTimeout(() => {
      setCurrentQuestionIndex(newIndex);
      // Long questions leave the viewport mid-page — always reset to the top of the new stem.
      requestAnimationFrame(() => {
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
        questionScrollAnchorRef.current?.scrollIntoView({ block: 'start', behavior: 'auto' });
      });
      setTimeout(() => {
        setIsAnimating(false);
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      }, 300);
    }, 300);
  };

  const handleNext = () => {
    if (exam?.questions && currentQuestionIndex < exam.questions.length - 1) {
      animateToQuestion(currentQuestionIndex + 1);
    }
  };

  const handlePrevious = () => {
    if (currentQuestionIndex > 0) {
      animateToQuestion(currentQuestionIndex - 1);
    }
  };

  const handleSubmit = async () => {
    if (!exam || isSubmitted || submissionInProgressRef.current) return;

    submissionInProgressRef.current = true;
    let finalQuestionTimings = questionTimings;
    let fallbackResult: ExamResult | null = null;
    try {
      finalQuestionTimings = recordCurrentQuestionDuration(questionTimings) || questionTimings;
    } catch (timingError) {
      console.warn('Failed to record final question timing during submit:', timingError);
    }

    try {
      setIsSubmitted(true);
      setShowWarning(false);
      if (exitAttempts < MAX_EXIT_ATTEMPTS) {
        setShowExitWarning(false);
      }
      setShowReenterPrompt(false);
      
      let correctAnswers = 0;
      let wrongAnswers = 0;
      let totalMarks = 0;
      let obtainedMarks = 0;
      const subjectWiseScore = {
        maths: { correct: 0, total: 0, marks: 0 },
        physics: { correct: 0, total: 0, marks: 0 },
        chemistry: { correct: 0, total: 0, marks: 0 }
      };

      if (!exam.questions || !Array.isArray(exam.questions)) {
        console.error('Exam questions are not available:', exam.questions);
        setIsSubmitted(false);
        submissionInProgressRef.current = false;
        toast({
          title: 'Error',
          description: 'No questions found in this exam. Please try again.',
          variant: 'destructive',
        });
        return;
      }

      exam.questions.forEach((question: Question) => {
        try {
          const userAnswer = answers[answerKey(question)];
          const isCorrect = checkAnswer(question, userAnswer);
          const normalizedSubject = String(question.subject || '').toLowerCase();
          const hasTrackedSubject =
            normalizedSubject === 'maths' ||
            normalizedSubject === 'physics' ||
            normalizedSubject === 'chemistry';

          if (hasTrackedSubject) {
            const subjectKey = normalizedSubject as keyof typeof subjectWiseScore;
            subjectWiseScore[subjectKey].total++;
          }

          totalMarks += Number(question.marks) || 0;

          if (isCorrect) {
            correctAnswers++;
            obtainedMarks += Number(question.marks) || 0;
            if (hasTrackedSubject) {
              const subjectKey = normalizedSubject as keyof typeof subjectWiseScore;
              subjectWiseScore[subjectKey].correct++;
              subjectWiseScore[subjectKey].marks += Number(question.marks) || 0;
            }
          } else if (userAnswer !== undefined && userAnswer !== null && userAnswer !== '') {
            wrongAnswers++;
            obtainedMarks -= Number(question.negativeMarks) || 0;
          }
        } catch (questionError) {
          console.warn('Question grading failed; marking as unattempted-safe fallback:', {
            questionId: question?._id,
            error: questionError,
          });
          totalMarks += Number(question?.marks) || 0;
        }
      });

      const unattempted = exam.questions.length - correctAnswers - wrongAnswers;
      // Keep immediate UI aligned with server grading display metric:
      // percentage = correct / total questions (including unattempted).
      const totalQuestionCount = exam.questions.length;
      const percentage = totalQuestionCount > 0 ? (correctAnswers / totalQuestionCount) * 100 : 0;

      const result: ExamResult = {
        examId: exam._id,
        examTitle: exam.title,
        totalQuestions: exam.questions.length,
        correctAnswers,
        wrongAnswers,
        unattempted,
        totalMarks,
        obtainedMarks,
        percentage,
        timeTaken: (exam.duration * 60) - timeLeft,
        subjectWiseScore,
        answers: answers,
        questions: exam.questions,
        questionTimings: finalQuestionTimings
      };
      fallbackResult = result;

      // Stay on the exam screen until the server confirms the save.
      // Calling onComplete first made failed saves look like a successful attempt.
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45000);

      try {
        const response = await fetch(`${API_BASE_URL}/api/student/exam-results`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getAuthToken()}`
          },
          credentials: 'include',
          body: JSON.stringify({
            ...result,
            // Avoid sending full question bank back to server; answers are sufficient.
            questions: undefined
          }),
          signal: controller.signal
        });
        if (!response.ok) {
          let errorData: any = null;
          try {
            errorData = await response.json();
          } catch (parseError) {
            console.warn('Failed to parse error response JSON:', parseError);
          }

          console.error('❌ Exam result submission failed:', {
            status: response.status,
            statusText: response.statusText,
            error: errorData
          });
          const msg = errorData?.message || response.statusText;
          toast({
            title: 'Error',
            description:
              msg ||
              'Could not save your attempt. Check your connection and tap Submit again — your answers are still on this screen.',
            variant: 'destructive',
          });
          setIsSubmitted(false);
          submissionInProgressRef.current = false;
          return;
        }

        let responseData: any = null;
        try {
          responseData = await response.json();
        } catch (parseError) {
          console.warn('Response was not JSON, continuing exam completion:', parseError);
        }

        console.log('✅ Exam result saved successfully:', responseData);
        clearLocalExamDraft(examId, resolveDraftUserId());

        // Server is the source of truth for grading.
        let authoritativeResult: ExamResult = result;
        if (responseData?.data && typeof responseData.data === 'object') {
          const serverResult = responseData.data;
          const localAnswerCount = result.answers ? Object.keys(result.answers).length : 0;
          const serverAnswersRaw = serverResult.answers;
          const normalizedServerAnswers =
            serverAnswersRaw &&
            typeof serverAnswersRaw === 'object' &&
            !Array.isArray(serverAnswersRaw)
              ? Object.fromEntries(
                  Object.entries(serverAnswersRaw).map(([k, v]) => [String(k), v])
                )
              : {};
          const serverAnswerCount = Object.keys(normalizedServerAnswers).length;
          authoritativeResult = {
            attemptNumber:
              Number(serverResult.attemptNumber) >= 1
                ? Number(serverResult.attemptNumber)
                : undefined,
            examId: String(serverResult.examId || result.examId),
            examTitle: String(serverResult.examTitle || result.examTitle),
            totalQuestions: Number(serverResult.totalQuestions ?? result.totalQuestions),
            correctAnswers: Number(serverResult.correctAnswers ?? result.correctAnswers),
            wrongAnswers: Number(serverResult.wrongAnswers ?? result.wrongAnswers),
            unattempted: Number(serverResult.unattempted ?? result.unattempted),
            totalMarks: Number(serverResult.totalMarks ?? result.totalMarks),
            obtainedMarks: Number(serverResult.obtainedMarks ?? result.obtainedMarks),
            percentage: Number(serverResult.percentage ?? result.percentage),
            timeTaken: Number(serverResult.timeTaken ?? result.timeTaken),
            subjectWiseScore: serverResult.subjectWiseScore || result.subjectWiseScore,
            answers: serverAnswerCount > 0 || localAnswerCount === 0
              ? normalizedServerAnswers
              : result.answers,
            questionTimings: result.questionTimings,
            questions: Array.isArray(serverResult.questions) && serverResult.questions.length > 0
              ? serverResult.questions
              : result.questions
          };
        }

        try {
          onComplete(authoritativeResult);
        } catch (completeError) {
          console.error('Completion transition failed:', completeError);
        }
      } catch (error) {
        console.error('❌ Failed to save result:', error);
        const aborted = error instanceof Error && error.name === 'AbortError';
        toast({
          title: aborted ? 'Timed out' : 'Error',
          description: aborted
            ? 'Saving timed out. Tap Submit again — your answers are still here.'
            : 'Could not save your attempt. Check your connection and tap Submit again — your answers are still on this screen.',
          variant: 'destructive',
        });
        setIsSubmitted(false);
      } finally {
        clearTimeout(timeout);
        submissionInProgressRef.current = false;
      }
      return;
    } catch (error) {
      console.error('❌ Submit crashed before completion:', error);
      const errorText =
        error instanceof Error
          ? `${error.name}: ${error.message}`
          : String(error || 'Unknown error');

      setIsSubmitted(false);
      submissionInProgressRef.current = false;
      autoSubmitTriggeredRef.current = false;
      if (autoSubmitTimeoutRef.current !== null) {
        window.clearTimeout(autoSubmitTimeoutRef.current);
        autoSubmitTimeoutRef.current = null;
      }
      toast({
        title: 'Error',
        description: `Submit failed (${errorText}). Your answers are still on this screen — please try Submit again.`,
        variant: 'destructive',
      });
    }
  };

  handleSubmitRef.current = handleSubmit;

  useEffect(() => {
    if (!pendingForceSubmit || !timerInitialized || isSubmitted) return;
    setPendingForceSubmit(false);
    const t = window.setTimeout(() => {
      void handleSubmitRef.current();
    }, 500);
    return () => window.clearTimeout(t);
  }, [pendingForceSubmit, timerInitialized, isSubmitted]);

  const checkAnswer = (question: Question, userAnswer: any): boolean => {
    if (userAnswer === undefined || userAnswer === null || userAnswer === '') {
      return false;
    }

    if (question.questionType === 'integer') {
      if (question.correctAnswer === undefined || question.correctAnswer === null) {
        return false;
      }
      const userResolved = resolveAnswerTokenForQuestion(question, userAnswer);
      const correctResolved = resolveAnswerTokenForQuestion(question, question.correctAnswer);
      const userNum = Number(userResolved);
      const correctNum = Number(correctResolved);
      if (Number.isFinite(userNum) && Number.isFinite(correctNum)) {
        return userNum === correctNum;
      }
      return userResolved === correctResolved;
    }

    if (
      question.questionType === 'mcq' ||
      question.questionType === 'assertion_reason' ||
      question.questionType === 'match_following'
    ) {
      const correctAnswer = Array.isArray(question.correctAnswer)
        ? resolveAnswerTokenForQuestion(question, question.correctAnswer[0])
        : resolveAnswerTokenForQuestion(question, question.correctAnswer);
      return resolveAnswerTokenForQuestion(question, userAnswer) === correctAnswer;
    }

    if (question.questionType === 'multiple') {
      const correctAnswerStrings = resolveAnswerListForQuestion(question, question.correctAnswer);
      const userAnswerStrings = resolveAnswerListForQuestion(question, userAnswer);

      if (userAnswerStrings.length !== correctAnswerStrings.length) {
        return false;
      }

      return correctAnswerStrings.every((answer) => userAnswerStrings.includes(answer));
    }

    return false;
  };

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const DEFAULT_ASSERTION_REASON_DIRECTIONS = `Directions: Each question below consists of an Assertion (A) and a Reason (R). Choose the correct option:
(a) Both A and R are true, and R is the correct explanation of A.
(b) Both A and R are true, but R is not the correct explanation of A.
(c) A is true, but R is false.
(d) A is false, but R is true.`;

  const normalizeExamText = (value: unknown, subject?: string): string =>
    normalizeAndFormatExamDisplayText(value, subject);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600">Loading exam...</p>
        </div>
      </div>
    );
  }

  if (isError) {
    const errorMessage = (error as any)?.message || 'Exam not available';
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <p className="text-gray-600">{errorMessage}</p>
          <div className="mt-4 flex justify-center gap-3">
            <Button onClick={() => void refetchExam()} disabled={isFetching}>
              {isFetching ? 'Trying…' : 'Try Again'}
            </Button>
            <Button onClick={onExit} variant="outline">Go Back</Button>
          </div>
        </div>
      </div>
    );
  }

  if (!exam) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <p className="text-gray-600">Exam not found</p>
          <Button onClick={onExit} className="mt-4">Go Back</Button>
        </div>
      </div>
    );
  }

  if (!exam.questions || exam.questions.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <p className="text-gray-600">No questions found in this exam</p>
          <p className="text-xs sm:text-sm text-gray-500 mt-2">
            Exam ID: {exam._id}<br/>
            Questions: {exam.questions?.length || 0}
          </p>
          <Button onClick={onExit} className="mt-4">Go Back</Button>
        </div>
      </div>
    );
  }

  const safeQuestionIndex = Math.min(
    Math.max(0, currentQuestionIndex),
    exam.questions.length - 1,
  );
  const currentQuestion = exam.questions[safeQuestionIndex];
  if (!currentQuestion) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <p className="text-gray-600">Question not found</p>
          <Button onClick={onExit} className="mt-4">Go Back</Button>
        </div>
      </div>
    );
  }

  const arMatterText = (() => {
    const isAr =
      currentQuestion.questionType === 'assertion_reason' ||
      Boolean(currentQuestion.assertionText || currentQuestion.reasonText) ||
      (/\bA\s*[:：]/.test(String(currentQuestion.questionText || '')) &&
        /\bR\s*[:：]/.test(String(currentQuestion.questionText || ''))) ||
      (() => {
        const blob = (currentQuestion.options || [])
          .map((o: any) => (typeof o === 'string' ? o : o?.text || ''))
          .join('\n');
        return /Both A and R are true/i.test(blob) && /correct explanation of A/i.test(blob);
      })();
    if (!isAr) {
      return String(currentQuestion.sharedMatterText || currentQuestion.passageText || '').trim();
    }
    const raw = String(currentQuestion.sharedMatterText || '').trim();
    const ok =
      /correct explanation of A/i.test(raw) ||
      (/Both A and R are true/i.test(raw) && /A is false,\s*but R is true/i.test(raw));
    return ok ? raw : DEFAULT_ASSERTION_REASON_DIRECTIONS;
  })();
  const showQuestionImage = Boolean(currentQuestion.questionImage);
  const arDisplay = resolveAssertionReasonDisplay(currentQuestion);

  const progress = ((safeQuestionIndex + 1) / exam.questions.length) * 100;
  const currentQid = answerKey(currentQuestion);
  const currentAnswerRaw = answers[currentQid];
  const currentQuestionHasAnswer = isAnswerProvidedForQuestion(currentQuestion, currentAnswerRaw);
  const answeredQuestionCount = exam.questions.filter((q: Question) =>
    isAnswerProvidedForQuestion(q, answers[answerKey(q)])
  ).length;
  const isLastQuestion = safeQuestionIndex === exam.questions.length - 1;

  return (
    <div className="min-h-screen bg-slate-50/80">
      {isSubmitted && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
          <Card className="mx-4 max-w-sm w-full">
            <CardContent className="flex flex-col items-center gap-3 py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
              <p className="text-sm font-medium text-gray-900">Saving your attempt…</p>
              <p className="text-center text-xs text-gray-500">
                Please wait — do not close this tab until saving finishes.
              </p>
            </CardContent>
          </Card>
        </div>
      )}
      {/* Exit Warning Modal */}
      {showExitWarning && (
        <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50">
          <Card className="max-w-md w-full mx-4 border-2 border-red-500">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2 text-red-600">
                <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6" />
                <span>Warning: Fullscreen Exit Detected</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="text-base sm:text-lg font-bold text-red-700 text-center mb-2">
                    Attempt {exitAttempts} of {MAX_EXIT_ATTEMPTS}
                  </p>
                  <p className="text-xs sm:text-sm text-red-600 text-center">
                    {exitAttempts >= MAX_EXIT_ATTEMPTS 
                      ? 'Maximum exit attempts reached. Exam will be auto-submitted.'
                      : `You have ${MAX_EXIT_ATTEMPTS - exitAttempts} attempt(s) remaining before auto-submission.`
                    }
                  </p>
                </div>
                <p className="text-gray-600 text-xs sm:text-sm">
                  Please stay in fullscreen mode during the exam. Exiting fullscreen multiple times will result in automatic submission.
                </p>
                {exitAttempts >= MAX_EXIT_ATTEMPTS ? (
                  <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-red-600" />
                      <p className="text-xs sm:text-sm text-red-800 font-bold">
                        Maximum Exit Attempts Reached
                      </p>
                    </div>
                    <p className="text-xs sm:text-sm text-red-700 font-semibold">
                      ⚠️ Your exam is being automatically submitted now...
                    </p>
                    <div className="mt-3 flex items-center gap-2">
                      <div className="animate-spin rounded-full h-3 w-3 sm:h-4 sm:w-4 border-b-2 border-red-600"></div>
                      <span className="text-xs text-red-600">Submitting...</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    <Button
                      onClick={enterFullscreen}
                      className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3"
                    >
                      Return to Fullscreen Mode
                    </Button>
                    <p className="text-xs text-gray-500 text-center">
                      Click the button above to continue your exam in fullscreen mode
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Re-enter Fullscreen Prompt (Non-blocking) */}
      {showReenterPrompt && !showExitWarning && (
        <div className="fixed bottom-3 sm:m-4 lg:m-6 left-1/2 transform -translate-x-1/2 z-40">
          <Card className="border-2 border-yellow-400 shadow-2xl">
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <p className="text-xs sm:text-sm font-semibold text-gray-800">
                    Exit Attempt: {exitAttempts}/{MAX_EXIT_ATTEMPTS}
                  </p>
                  <p className="text-xs text-gray-600">
                    Return to fullscreen to continue your exam
                  </p>
                </div>
                <Button
                  onClick={enterFullscreen}
                  className="bg-green-600 hover:bg-green-700 text-white"
                  size="sm"
                >
                  Re-enter Fullscreen
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Exam top bar */}
      <div className="sticky top-0 z-20 border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3 px-4 py-2.5 sm:gap-4 sm:px-6">
          {/* Exam title */}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-sm font-extrabold text-indigo-600 sm:text-base">
                {exam.title}
              </p>
              {exam.classNumber ? (
                <span className="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                  Class {exam.classNumber}
                </span>
              ) : null}
            </div>
          </div>

          {/* Question stepper */}
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={handlePrevious}
              disabled={currentQuestionIndex === 0 || isAnimating}
              aria-label="Previous question"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-40"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <p className="whitespace-nowrap text-xs font-semibold text-slate-700 sm:text-sm">
              Question{' '}
              <span className="font-extrabold text-slate-900">
                {String(currentQuestionIndex + 1).padStart(2, '0')}
              </span>{' '}
              of {exam.questions.length}
            </p>
            <button
              type="button"
              onClick={handleNext}
              disabled={isLastQuestion || isAnimating}
              aria-label="Next question"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-40"
            >
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>

          <div className="hidden h-9 w-px bg-slate-200 lg:block" />

          {/* Timer */}
          <div className="flex shrink-0 items-center gap-2">
            <Clock
              className={`h-5 w-5 ${timeLeft < 300 ? 'animate-pulse text-red-500' : 'text-indigo-500'}`}
            />
            <div className="leading-tight">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Time Left
              </p>
              <p
                className={`font-mono text-base font-extrabold tabular-nums ${
                  timeLeft < 300 ? 'animate-pulse text-red-600' : 'text-indigo-600'
                }`}
              >
                {formatTime(timeLeft)}
              </p>
            </div>
          </div>

          {/* Submit */}
          <Button
            onClick={() => setShowWarning(true)}
            className="h-10 shrink-0 rounded-xl bg-red-500 px-4 font-bold text-white shadow-sm hover:bg-red-600"
          >
            <CheckCircle className="mr-2 h-4 w-4" />
            Submit Exam
          </Button>
        </div>

        {resumeNotice ? (
          <div className="mx-auto max-w-[1600px] px-4 pb-2 sm:px-6">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
              {resumeNotice}
              <button
                type="button"
                className="ml-2 underline"
                onClick={() => setResumeNotice(null)}
              >
                Dismiss
              </button>
            </div>
          </div>
        ) : null}

        {exitAttempts > 0 && (
          <div className="mx-auto max-w-[1600px] px-4 pb-2 text-xs sm:px-6">
            <span
              className={`font-semibold ${exitAttempts >= MAX_EXIT_ATTEMPTS ? 'text-red-600' : 'text-yellow-600'}`}
            >
              Exit Attempts: {exitAttempts}/{MAX_EXIT_ATTEMPTS}
            </span>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="mx-auto max-w-[1600px] px-3 py-4 sm:px-5 lg:px-6">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)_260px]">

          {/* Question Navigator */}
          <div className="order-2 lg:order-1">
            <div className="space-y-4 lg:sticky lg:top-24">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="mb-3 text-sm font-extrabold text-slate-900">Question Navigator</p>

                {/* Compact legend */}
                <div className="mb-4 grid grid-cols-2 gap-x-2 gap-y-2">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                    <span className="text-[11px] text-slate-600">Answered</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
                    <span className="text-[11px] text-slate-600">Not Answered</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full border-2 border-indigo-600" />
                    <span className="text-[11px] text-slate-600">Current</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                    <span className="text-[11px] text-slate-600">Marked</span>
                  </div>
                </div>

                {/* Number grid — scrolls on its own so the current number stays in view */}
                <div ref={navigatorGridRef} className="relative grid max-h-[50vh] grid-cols-5 gap-2 overflow-y-auto p-0.5 lg:max-h-[calc(100vh-22rem)]">
                  {exam.questions.map((_: Question, index: number) => {
                    const q = exam.questions[index];
                    const isAnswered = isAnswerProvidedForQuestion(q, answers[answerKey(q)]);
                    const isFlagged = flaggedQuestions.has(index);
                    const isCurrent = index === currentQuestionIndex;

                    return (
                      <button
                        key={index}
                        data-qnav={index}
                        onClick={() => animateToQuestion(index)}
                        disabled={isAnimating}
                        title={`Question ${index + 1}${isFlagged ? ' · Marked for review' : ''}${
                          isAnswered ? ' · Answered' : ' · Not answered'
                        }`}
                        className={`relative flex aspect-square items-center justify-center rounded-lg border text-xs font-bold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 ${
                          isCurrent
                            ? 'border-indigo-600 bg-indigo-600 text-white shadow-md shadow-indigo-300/50'
                            : isAnswered
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-400'
                              : 'border-slate-200 bg-white text-slate-500 hover:border-indigo-300 hover:bg-indigo-50'
                        }`}
                      >
                        {index + 1}
                        {isFlagged && (
                          <Star className="absolute -right-1 -top-1 h-3 w-3 fill-amber-400 text-amber-400 drop-shadow-sm" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Summary */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="mb-3 text-sm font-extrabold text-slate-900">Summary</p>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="mb-1 flex items-center justify-center gap-1">
                      <CheckCircle className="h-4 w-4 text-emerald-500" />
                      <span className="text-base font-extrabold text-slate-900">
                        {answeredQuestionCount}
                      </span>
                    </div>
                    <p className="text-[10px] font-medium text-slate-500">Answered</p>
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-center gap-1">
                      <span className="h-3.5 w-3.5 rounded-full bg-slate-200" />
                      <span className="text-base font-extrabold text-slate-900">
                        {exam.questions.length - answeredQuestionCount}
                      </span>
                    </div>
                    <p className="text-[10px] font-medium text-slate-500">Remaining</p>
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-center gap-1">
                      <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                      <span className="text-base font-extrabold text-slate-900">
                        {flaggedQuestions.size}
                      </span>
                    </div>
                    <p className="text-[10px] font-medium text-slate-500">Review</p>
                  </div>
                </div>
              </div>

              {/* Focus card */}
              <div className="rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50 to-indigo-50 p-4 shadow-sm">
                <p className="text-sm font-extrabold text-violet-900">Stay Focused! 💪</p>
                <p className="mt-1 text-xs text-violet-700">
                  You&apos;re doing great. Keep going and ace it!
                </p>
                <div className="mt-2 flex justify-end">
                  <Trophy className="h-10 w-10 text-amber-400" />
                </div>
              </div>
            </div>
          </div>

          {/* Main Question Area */}
          <div className="order-1 lg:order-2" ref={questionScrollAnchorRef}>
        {/* Animated Question Container */}
        <div className="relative overflow-hidden">
          <div 
            className={`transition-all duration-500 ease-in-out ${
              isAnimating 
                ? animationDirection === 'up' 
                  ? 'transform translate-y-full opacity-0 scale-95' 
                  : 'transform -translate-y-full opacity-0 scale-95'
                : 'transform translate-y-0 opacity-100 scale-100'
            }`}
          >
            <Card className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <CardContent className="p-4 sm:p-6 lg:p-7">
                {/* Section heading (Maths / Physics / custom) — same as Super Admin paper order */}
                {(() => {
                  const heading = resolveAttemptSectionHeading(currentQuestion);
                  const prevHeading = resolveAttemptSectionHeading(
                    exam.questions[currentQuestionIndex - 1]
                  );
                  if (!heading || heading === prevHeading) return null;
                  return (
                    <div
                      className={`mb-4 flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-sm font-bold ${sectionHeadingTheme(
                        heading,
                        currentQuestion.subject,
                      )}`}
                    >
                      <span className="h-2 w-2 rounded-full bg-current opacity-70" />
                      {heading}
                    </div>
                  );
                })()}
                {/* Question Header */}
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-lg font-extrabold text-indigo-600 sm:text-xl">
                      Question {String(currentQuestionIndex + 1).padStart(2, '0')}
                    </span>
                    <Badge
                      variant="secondary"
                      className="rounded-full bg-indigo-50 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
                    >
                      {currentQuestion.marks || 0} Mark{(currentQuestion.marks || 0) === 1 ? '' : 's'}
                    </Badge>
                    {['multiple', 'multi', 'msq'].includes(String(currentQuestion.questionType || '').toLowerCase()) ? (
                      <Badge className="rounded-full border border-amber-300 bg-amber-50 text-xs font-semibold text-amber-800 hover:bg-amber-50">
                        Multiple answers · select all that apply
                      </Badge>
                    ) : null}
                    {currentQuestion.subject ? (
                      <Badge
                        variant="outline"
                        className="rounded-full text-xs capitalize text-slate-600"
                      >
                        {currentQuestion.subject}
                      </Badge>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleFlagQuestion(currentQuestionIndex)}
                    className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition ${
                      flaggedQuestions.has(currentQuestionIndex)
                        ? 'border-amber-300 bg-amber-50 text-amber-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-amber-300 hover:text-amber-600'
                    }`}
                  >
                    <Bookmark
                      className="h-4 w-4"
                      fill={flaggedQuestions.has(currentQuestionIndex) ? 'currentColor' : 'none'}
                    />
                    Mark for Review
                  </button>
                </div>

                {/* Question Content */}
                <div className="mb-6">
                  <div className="flex items-start space-x-3">
                    <div className="flex-1">
                      {arMatterText ? (
                        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                            {currentQuestion.questionType === 'assertion_reason' ||
                            currentQuestion.sharedMatterKind === 'assertion_reason' ||
                            /Both A and R are true/i.test(arMatterText)
                              ? 'Assertion–Reason directions'
                              : currentQuestion.sharedMatterKind === 'match_following'
                                ? 'Match the Following'
                                : currentQuestion.sharedMatterKind === 'case'
                                  ? 'Case / Passage'
                                  : 'Shared matter'}
                          </div>
                          <p className="whitespace-pre-wrap leading-relaxed">
                            {normalizeExamText(arMatterText, currentQuestion.subject)}
                          </p>
                        </div>
                      ) : null}

                      {(arDisplay.assertion || arDisplay.reason) && (
                        <div className="mb-4 space-y-2 rounded-lg border border-violet-100 bg-violet-50/70 p-3 text-sm text-gray-900">
                          {arDisplay.assertion ? (
                            <p>
                              <span className="font-semibold">A:</span>{' '}
                              {normalizeExamText(arDisplay.assertion, currentQuestion.subject)}
                            </p>
                          ) : null}
                          {arDisplay.reason ? (
                            <p>
                              <span className="font-semibold">R:</span>{' '}
                              {normalizeExamText(arDisplay.reason, currentQuestion.subject)}
                            </p>
                          ) : null}
                        </div>
                      )}

                      {((Array.isArray(currentQuestion.matchColumnI) && currentQuestion.matchColumnI.length > 0) ||
                        (Array.isArray(currentQuestion.matchColumnII) && currentQuestion.matchColumnII.length > 0)) &&
                        !showQuestionImage && (
                        <MatchColumnsTable
                          columnI={currentQuestion.matchColumnI}
                          columnII={currentQuestion.matchColumnII}
                          formatText={(t) => normalizeExamText(t, currentQuestion.subject)}
                        />
                      )}

                      {showQuestionImage && (
                        <AuthenticatedUploadImage
                          src={currentQuestion.questionImage}
                          alt={
                            currentQuestion.questionType === 'match_following'
                              ? 'Match the Following table'
                              : 'Question figure'
                          }
                          wrapperClassName="mb-4 bg-gray-50 p-2"
                          className="rounded-lg"
                        />
                      )}

                      {arDisplay.showQuestionText && arDisplay.questionText ? (
                        <p className="text-sm sm:text-base text-gray-900 mb-4 leading-relaxed">
                          <ExamMathText text={normalizeExamText(arDisplay.questionText, currentQuestion.subject)} />
                        </p>
                      ) : null}
                      </div>
                  </div>

                  {/* Answer Options */}
                  {(currentQuestion.questionType === 'mcq' ||
                    currentQuestion.questionType === 'assertion_reason' ||
                    currentQuestion.questionType === 'match_following') && currentQuestion.options && (
                    <RadioGroup
                      key={`mcq-${currentQid}-${mcqRadioNonce}`}
                      value={
                        currentAnswerRaw !== undefined && String(currentAnswerRaw).trim() !== ''
                          ? String(currentAnswerRaw)
                          : undefined
                      }
                      onValueChange={(value) => handleAnswerChange(currentQid, value)}
                      className="space-y-3 mt-4"
                    >
                      {currentQuestion.options.map((option: string | { text: string; isCorrect?: boolean; _id?: string }, index: number) => {
                        const optionTextRaw = typeof option === 'string' ? option : option.text || option._id || JSON.stringify(option);
                        const optionText = normalizeExamText(optionTextRaw, currentQuestion.subject);
                        const optionValue = typeof option === 'string' ? option : option.text || option._id || '';
                        const optionValueStr = String(optionValue ?? '');
                        const isSelected =
                          currentAnswerRaw !== undefined &&
                          String(currentAnswerRaw).trim() !== '' &&
                          String(currentAnswerRaw) === optionValueStr;
                        const optionLetter = String.fromCharCode(65 + index);

                        return (
                          <div
                            key={index}
                            role="button"
                            tabIndex={0}
                            onClick={() => handleAnswerChange(currentQid, optionValueStr)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                handleAnswerChange(currentQid, optionValueStr);
                              }
                            }}
                            className={`flex cursor-pointer items-center gap-3 rounded-2xl border-2 p-4 transition-all duration-200 ${
                              isSelected
                                ? 'border-emerald-400 bg-emerald-50/60 shadow-sm'
                                : 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/40'
                            }`}
                          >
                            <span
                              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${
                                isSelected
                                  ? 'bg-emerald-500 text-white'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {optionLetter}
                            </span>
                            <RadioGroupItem
                              value={optionValueStr}
                              id={`mcq-${currentQid}-opt-${index}`}
                              className="sr-only"
                            />
                            <Label
                              htmlFor={`mcq-${currentQid}-opt-${index}`}
                              className={`flex-1 cursor-pointer text-sm leading-relaxed ${
                                isSelected ? 'font-semibold text-slate-900' : 'text-slate-700'
                              }`}
                            >
                              <ExamMathText text={optionText} />
                            </Label>
                            {isSelected ? (
                              <CheckCircle className="h-5 w-5 shrink-0 text-emerald-500" />
                            ) : null}
                          </div>
                        );
                      })}
                    </RadioGroup>
                  )}

                  {currentQuestion.questionType === 'multiple' && currentQuestion.options && (
                    <div className="space-y-3 mt-4">
                      {currentQuestion.options.map((option: string | { text: string; isCorrect?: boolean; _id?: string }, index: number) => {
                        const optionTextRaw = typeof option === 'string' ? option : option.text || option._id || JSON.stringify(option);
                        const optionText = normalizeExamText(optionTextRaw, currentQuestion.subject);
                        const optionValue = typeof option === 'string' ? option : option.text || option._id || '';
                        const userAnswers = answers[currentQid] || [];
                        const isChecked = Array.isArray(userAnswers) && userAnswers.includes(optionValue);
                        
                        return (
                          <div 
                            key={index} 
                            className={`flex items-center space-x-3 p-3 rounded-lg border transition-all duration-300 transform hover:scale-[1.02] hover:shadow-md ${
                              isChecked
                                ? 'border-green-400 bg-green-50 ring-2 ring-green-200'
                                : 'border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                            }`}
                          >
                            <Checkbox
                              id={`option-${index}`}
                              checked={isChecked}
                              onCheckedChange={(checked) => {
                                const currentAnswers = answers[currentQid] || [];
                                const newAnswers = checked
                                  ? [...currentAnswers, optionValue]
                                  : currentAnswers.filter((ans: any) => ans !== optionValue);
                                if (newAnswers.length === 0) {
                                  setAnswers((prev) => {
                                    const next = { ...prev };
                                    delete next[currentQid];
                                    answersRef.current = next;
                                    return next;
                                  });
                                } else {
                                  handleAnswerChange(currentQid, newAnswers);
                                }
                              }}
                              className="transition-all duration-200 hover:scale-110"
                            />
                            <Label 
                              htmlFor={`option-${index}`} 
                              className={`text-xs sm:text-sm cursor-pointer flex-1 transition-all duration-200 ${
                                isChecked
                                  ? 'text-green-700 font-medium'
                                  : 'text-gray-700 hover:text-gray-900'
                              }`}
                            >
                              <ExamMathText text={optionText} />
                            </Label>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {currentQuestion.questionType === 'integer' && (
                    <div className="mt-4">
                      <Label htmlFor="integer-answer" className="text-xs sm:text-sm font-medium text-gray-700 mb-2 block">
                        Enter your answer:
                      </Label>
                      <Input
                        id="integer-answer"
                        type="number"
                        value={
                          answers[currentQid] !== undefined &&
                          answers[currentQid] !== null &&
                          String(answers[currentQid]).trim() !== ''
                            ? String(answers[currentQid])
                            : ''
                        }
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === '' || String(v).trim() === '') {
                            setAnswers((prev) => {
                              const next = { ...prev };
                              delete next[currentQid];
                              return next;
                            });
                            return;
                          }
                          handleAnswerChange(currentQid, v);
                        }}
                        placeholder="Enter numerical answer"
                        className="w-full"
                      />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Navigation Buttons */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <Button
            variant="outline"
            onClick={handlePrevious}
            disabled={currentQuestionIndex === 0 || isAnimating}
            className="h-11 rounded-full border-indigo-200 px-5 font-bold text-indigo-700 hover:bg-indigo-50 disabled:opacity-40"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Previous
          </Button>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={handleClearCurrentAnswer}
              disabled={!currentQuestionHasAnswer || isAnimating}
              className="h-11 rounded-full px-4 font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-40"
            >
              Clear
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleFlagQuestion(currentQuestionIndex)}
              className={`h-11 rounded-full px-4 font-bold ${
                flaggedQuestions.has(currentQuestionIndex)
                  ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Bookmark
                className="mr-2 h-4 w-4"
                fill={flaggedQuestions.has(currentQuestionIndex) ? 'currentColor' : 'none'}
              />
              Mark for Review
            </Button>

            {isLastQuestion ? (
              <Button
                onClick={() => setShowWarning(true)}
                disabled={isAnimating}
                className="h-11 rounded-full bg-red-500 px-6 font-bold text-white shadow-md hover:bg-red-600 disabled:opacity-50"
              >
                Submit Exam
                <CheckCircle className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button
                onClick={handleNext}
                disabled={isAnimating}
                className="h-11 rounded-full bg-gradient-to-r from-[#7c3aed] to-[#6366f1] px-6 font-bold text-white shadow-md shadow-indigo-300/50 hover:opacity-95 disabled:opacity-50"
              >
                Save &amp; Next
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
          </div>

          {/* Exam Overview sidebar */}
          <div className="order-3">
            <div className="space-y-4 xl:sticky xl:top-24">
              {/* Overview */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
                  <FileText className="h-4 w-4 text-indigo-500" />
                  Exam Overview
                </p>
                {exam.description ? (
                  <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
                    {exam.description}
                  </p>
                ) : null}
                <dl className="mt-3 space-y-2.5 text-xs">
                  {[
                    ...(exam.classNumber
                      ? [{ label: 'Class', value: String(exam.classNumber) }]
                      : []),
                    { label: 'Total Questions', value: String(exam.questions.length) },
                    {
                      label: 'Total Marks',
                      value: String(
                        exam.totalMarks ||
                          exam.questions.reduce(
                            (sum: number, q: Question) => sum + (Number(q.marks) || 0),
                            0,
                          ),
                      ),
                    },
                    {
                      label: 'Duration',
                      value: exam.duration ? `${exam.duration} Minutes` : '—',
                    },
                    {
                      label: 'Negative Marking',
                      value: exam.questions.some((q: Question) => Number(q.negativeMarks) > 0)
                        ? 'Yes'
                        : 'No',
                    },
                  ].map((row) => (
                    <div
                      key={row.label}
                      className="flex items-center justify-between border-b border-slate-100 pb-2 last:border-0 last:pb-0"
                    >
                      <dt className="text-slate-500">{row.label}</dt>
                      <dd className="font-extrabold text-slate-900">{row.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              {/* Progress */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-2 flex items-center justify-between">
                  <p className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
                    <TrendingUp className="h-4 w-4 text-emerald-500" />
                    Progress
                  </p>
                  <span className="text-[11px] font-semibold text-slate-500">
                    {Math.round((answeredQuestionCount / exam.questions.length) * 100)}% Completed
                  </span>
                </div>
                <Progress
                  value={(answeredQuestionCount / exam.questions.length) * 100}
                  className="h-2"
                />
                <p className="mt-2 text-[11px] text-slate-500">
                  {answeredQuestionCount} of {exam.questions.length} Questions Answered
                </p>
              </div>

              {/* Legend */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="mb-3 text-sm font-extrabold text-slate-900">Legend</p>
                <div className="space-y-2.5 text-xs text-slate-600">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                    Answered
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-4 w-4 rounded-full bg-slate-200" />
                    Not Answered
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-4 w-4 rounded-full border-2 border-indigo-600" />
                    Current Question
                  </div>
                  <div className="flex items-center gap-2">
                    <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                    Marked for Review
                  </div>
                </div>
              </div>

              {/* Instructions */}
              <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4 shadow-sm">
                <p className="mb-2 flex items-center gap-2 text-sm font-extrabold text-indigo-900">
                  <Info className="h-4 w-4 text-indigo-500" />
                  Instructions
                </p>
                <ul className="list-disc space-y-1.5 pl-4 text-[11px] leading-relaxed text-slate-600">
                  <li>Answer all questions to the best of your ability.</li>
                  <li>You can review and change answers anytime before submitting.</li>
                  <li>Once submitted, you cannot change your answers.</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Auto-save status bar */}
      <div className="mx-auto max-w-[1600px] px-3 pb-6 sm:px-5 lg:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-100 bg-amber-50/70 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="h-5 w-5 shrink-0 text-amber-500" />
            <div className="leading-tight">
              <p className="text-xs font-bold text-slate-800">Auto-save enabled</p>
              <p className="text-[11px] text-slate-500">
                Your answers are being saved automatically.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[11px] font-medium text-slate-600">
            <Lock className="h-4 w-4 shrink-0 text-amber-500" />
            Your exam will be auto-submitted when time runs out.
          </div>
        </div>
      </div>

      {/* Floating Action Button */}
      <div className="fixed bottom-3 right-6 z-30 sm:m-4 lg:m-6 xl:hidden">
        <div className="flex flex-col space-y-3">
          {/* Flag Button */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleFlagQuestion(currentQuestionIndex)}
            className={`rounded-full w-12 h-12 shadow-lg transition-all duration-300 hover:scale-110 ${
              flaggedQuestions.has(currentQuestionIndex) 
                ? 'bg-yellow-100 border-yellow-400 text-yellow-700 hover:bg-yellow-200' 
                : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Flag className="w-4 h-4 sm:w-5 sm:h-5" />
          </Button>
          
          {/* Quick Submit Button */}
          <Button
            size="sm"
            onClick={() => setShowWarning(true)}
            className="rounded-full w-12 h-12 bg-red-500 hover:bg-red-600 text-white shadow-lg transition-all duration-300 hover:scale-110"
          >
            <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5" />
          </Button>
        </div>
      </div>

      {/* Submit Warning Modal */}
      {showWarning && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-500" />
                <span>Submit Exam?</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 mb-4">
                Are you sure you want to submit your exam? This action cannot be undone.
              </p>
              <div className="flex space-x-3">
                <Button
                  variant="outline"
                  onClick={() => setShowWarning(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    setShowWarning(false);
                    handleSubmit();
                  }}
                  className="flex-1 bg-red-600 hover:bg-red-700"
                >
                  Submit
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
