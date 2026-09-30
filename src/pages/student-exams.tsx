import { useState, useEffect, useMemo, useRef, useCallback, type ComponentProps } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import StudentShell from "@/components/layout/StudentShell";
import { 
  Clock, 
  BookOpen, 
  Trophy, 
  Calendar,
  Play,
  CheckCircle,
  AlertCircle,
  Target,
  Award,
  TrendingUp,
  Eye,
  Sparkles,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import AnimatedExam from '@/components/animated-exam';
import ExamInstructionsScreen, {
  type ExamInstructionsExam,
} from '@/components/exam/ExamInstructionsScreen';
import ExamResults from '@/components/exam-results';
import StudentRanking from '@/components/student/student-ranking';
import VidyaAIFloatingAssistant from '@/components/student/VidyaAIFloatingAssistant';
import { API_BASE_URL, apiFetch } from '@/lib/api-config';
import {
  examMatchesStudentAssignedClass,
  getExamClassLabelsForStudent,
  normalizeClassNumber,
} from '@/lib/exam-classes';
import { useIsMobile } from '@/hooks/use-mobile';
import { useToast } from '@/hooks/use-toast';
import { dedupeStudentExamResults } from '@/lib/dedupe-exam-results';
import { getUserIdFromAuthToken, getAuthToken } from '@/lib/auth-utils';
import { isIndividualAccount } from '@/lib/individual-signup';
import { readLocalExamDraft } from '@/lib/exam-attempt-draft';
import { useCurriculumCascade } from '@/hooks/use-curriculum-cascade';

/** Accent schemes for exam cards — full colored border + tinted meta icons */
const EXAM_CARD_SCHEMES = [
  {
    bg: 'bg-card',
    text: 'text-ink-soft',
    badge: 'bg-amber-50 text-amber-700',
    accent: 'bg-gradient-to-r from-amber-400 to-orange-500',
    border: 'border-2 border-amber-400',
    iconClock: 'text-amber-500',
    iconBook: 'text-orange-500',
    iconCalendar: 'text-sky-500',
    iconTarget: 'text-teal-600',
  },
  {
    bg: 'bg-card',
    text: 'text-ink-soft',
    badge: 'bg-sky-50 text-sky-700',
    accent: 'bg-gradient-to-r from-sky-400 to-blue-500',
    border: 'border-2 border-sky-400',
    iconClock: 'text-sky-500',
    iconBook: 'text-blue-500',
    iconCalendar: 'text-indigo-500',
    iconTarget: 'text-violet-500',
  },
  {
    bg: 'bg-card',
    text: 'text-ink-soft',
    badge: 'bg-teal-50 text-teal-700',
    accent: 'bg-gradient-to-r from-teal-400 to-emerald-500',
    border: 'border-2 border-teal-400',
    iconClock: 'text-teal-500',
    iconBook: 'text-emerald-500',
    iconCalendar: 'text-cyan-500',
    iconTarget: 'text-amber-500',
  },
] as const;

type QuestionOption = string | { text: string; isCorrect?: boolean; _id?: string };

interface Question {
  _id: string;
  questionText: string;
  questionImage?: string;
  questionType: string;
  options?: QuestionOption[];
  correctAnswer: string | string[] | QuestionOption | QuestionOption[];
  marks: number;
  negativeMarks: number;
  explanation?: string;
  subject: string;
}

interface Exam {
  _id: string;
  title: string;
  description: string;
  examType: 'weekend' | 'mains' | 'advanced' | 'practice';
  b2cPastPractice?: boolean;
  classNumber?: string;
  assignedClasses?: string[];
  duration: number;
  totalQuestions: number;
  totalMarks: number;
  instructions: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  questions: Question[];
  subject?: 'maths' | 'physics' | 'chemistry' | 'biology';
  subjects?: Array<'maths' | 'physics' | 'chemistry' | 'biology'>;
  maxAttempts?: number;
  hideAvailabilityDates?: boolean;
  hasInProgressDraft?: boolean;
  canResumeExam?: boolean;
  forceSubmitDraft?: boolean;
  draftRemainingSeconds?: number;
  resumeCount?: number;
  maxResumes?: number;
  resumesRemaining?: number;
}

function removeInternalAccountLabels(value: unknown): string {
  return String(value || '')
    .replace(/\bB2C\b\s*/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

interface ExamResult {
  _id?: string;
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
  completedAt?: string;
  subjectWiseScore: {
    maths: { correct: number; total: number; marks: number };
    physics: { correct: number; total: number; marks: number };
    chemistry: { correct: number; total: number; marks: number };
    biology?: { correct: number; total: number; marks: number };
  };
  answers?: Record<string, unknown>;
  questions?: Question[];
  questionTimings?: Record<string, number>;
}

type ExamResultsResultProp = ComponentProps<typeof ExamResults>['result'];

function getExamResultRowId(result: any): string {
  const id = result?._id ?? result?.id;
  if (id != null && String(id).trim() !== '') return String(id);
  const att = Number(result?.attemptNumber) >= 1 ? Number(result.attemptNumber) : 1;
  const eid = result?.examId != null ? String(result.examId) : '';
  return `${eid || 'exam'}-attempt-${att}`;
}

function formatAttemptHistoryLabel(result: any, totalMarks: number): string {
  const att = Number(result?.attemptNumber) >= 1 ? Number(result.attemptNumber) : 1;
  const obtained = result?.obtainedMarks ?? 0;
  const total = result?.totalMarks || totalMarks || 0;
  const when = result?.completedAt
    ? new Date(result.completedAt).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '';
  return `Attempt ${att} — ${obtained}/${total} marks${when ? ` (${when})` : ''}`;
}

export default function StudentExams() {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const [currentExam, setCurrentExam] = useState<Exam | null>(null);
  const [examResult, setExamResult] = useState<ExamResult | null>(null);
  const [isTakingExam, setIsTakingExam] = useState(false);
  const [pendingInstructionsExam, setPendingInstructionsExam] = useState<
    (Exam & { questions?: any[] }) | null
  >(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<string>('available');
  const [examSubjectFilter, setExamSubjectFilter] = useState<string>('all');
  const [startingExamId, setStartingExamId] = useState<string | null>(null);
  const [postExamVidyaPrompt, setPostExamVidyaPrompt] = useState('');
  const [postExamPromptId, setPostExamPromptId] = useState<string | null>(null);
  const [showGenerateExam, setShowGenerateExam] = useState(false);
  const [generateBoard, setGenerateBoard] = useState('CBSE');
  const [generateSubject, setGenerateSubject] = useState('');
  const [generateTopic, setGenerateTopic] = useState('');
  const [generateQuestionCount, setGenerateQuestionCount] = useState('10');
  const [isGeneratingExam, setIsGeneratingExam] = useState(false);
  const [showAllAvailableExams, setShowAllAvailableExams] = useState(false);
  /** Per-exam selected attempt row id on Attempted Exams cards */
  const [selectedAttemptByExam, setSelectedAttemptByExam] = useState<Record<string, string>>({});
  const pendingOpenExamIdRef = useRef<string | null>(null);
  const [calendarFocusExam, setCalendarFocusExam] = useState<{
    examId: string;
    mode: 'upcoming' | 'ended';
    title: string;
    startDate: string;
    endDate: string;
  } | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const searchParams = new URLSearchParams(window.location.search);
    const examId = searchParams.get('examId');
    if (examId?.trim()) {
      pendingOpenExamIdRef.current = examId.trim();
    }
    if (searchParams.get('generate') === '1') setShowGenerateExam(true);
  }, []);

  const preserveScrollOnFilterChange = (setter: (value: string) => void, value: string) => {
    setter(value);
  };

  const studentClassNumber = normalizeClassNumber(
    user?.classNumber ||
      (typeof user?.assignedClass === 'object' ? user?.assignedClass?.classNumber : '') ||
      ''
  );
  const isB2cStudent = isIndividualAccount(user);
  const examGeneratorCascade = useCurriculumCascade(
    studentClassNumber ? `Class ${studentClassNumber}` : undefined,
    generateSubject || undefined,
    generateTopic || undefined,
    generateBoard,
  );

  const generatePersonalExam = async () => {
    setIsGeneratingExam(true);
    try {
      const response = await apiFetch('/api/student/exams/generate-personal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          board: generateBoard,
          subject: generateSubject,
          topic: generateTopic,
          questionCount: Number(generateQuestionCount),
          classNumber: studentClassNumber,
        }),
      });
      const json = await response.json();
      if (!response.ok || !json?.data?.examId) throw new Error(json?.message || 'Could not generate exam');
      toast({ title: 'Exam ready', description: `${json.data.questionCount} saved questions collected.` });
      window.location.assign(`/student-exams?examId=${json.data.examId}`);
    } catch (error) {
      toast({ title: 'Could not generate exam', description: error instanceof Error ? error.message : 'Please try again.', variant: 'destructive' });
    } finally {
      setIsGeneratingExam(false);
    }
  };

  /** Stable id for React Query keys so another user's cached exam/results never flash after login switch. */
  const studentId =
    user?._id != null
      ? String(user._id)
      : user?.id != null
        ? String(user.id)
        : null;

  /** Prefer /me id; fall back to JWT so queries run even if `user` omits `_id` */
  const effectiveStudentId = studentId ?? getUserIdFromAuthToken() ?? null;

  // Helper function to extract examId from result (handles populated doc, string, ObjectId)
  const getExamIdFromResult = useCallback((result: any): string | null => {
    if (!result) return null;
    const resolveRef = (raw: any): string | null => {
      if (raw == null || raw === '') return null;
      if (typeof raw === 'string') return raw;
      if (typeof raw === 'object') {
        const nested = raw._id ?? raw.$oid;
        if (nested != null) return String(nested);
        try {
          const s = String(raw);
          if (s && s !== '[object Object]') return s;
        } catch {
          return null;
        }
        return null;
      }
      try {
        return String(raw);
      } catch {
        return null;
      }
    };
    const fromExamId = resolveRef(result.examId);
    if (fromExamId) return fromExamId;
    if (result.exam != null) {
      const ex = result.exam;
      if (typeof ex === 'object') return resolveRef(ex._id ?? ex);
    }
    return null;
  }, []);

  const buildFallbackExamFromResult = (examIdStr: string, result: any): Exam => {
    const title =
      (result?.examTitle && String(result.examTitle).trim()) ||
      (typeof result?.examId === 'object' && result.examId?.title && String(result.examId.title).trim()) ||
      'Exam';
    return {
      _id: examIdStr,
      title,
      description: '',
      examType: 'practice',
      duration: 0,
      totalQuestions: Number(result?.totalQuestions) || 0,
      totalMarks: Number(result?.totalMarks) || 0,
      instructions: '',
      startDate: new Date(0).toISOString(),
      endDate: new Date().toISOString(),
      isActive: true,
      questions: [],
      maxAttempts: 1,
    };
  };

  const getDisplayPercentage = (result: any): number => {
    if (!result) return 0;
    const correct = Number(result.correctAnswers || 0);
    const wrong = Number(result.wrongAnswers || 0);
    const unattempted = Number(result.unattempted || 0);
    const total = Number(result.totalQuestions || 0) || (correct + wrong + unattempted);
    return total > 0 ? (correct / total) * 100 : 0;
  };

  const getMaxAttemptsForExam = (exam: Exam): number =>
    exam.hideAvailabilityDates
      ? Math.min(5, Math.max(1, Number(exam.maxAttempts) || 5))
      : Math.max(1, Number(exam.maxAttempts) || 1);

  // Reset states when component mounts
  useEffect(() => {
    console.log('🚀 Student Exams: Component mounted, resetting states');
    setCurrentExam(null);
    setExamResult(null);
    setIsTakingExam(false);
  }, []);

  // Check authentication
  useEffect(() => {
    const checkAuth = async () => {
      try {
        console.log('🔍 Student Exams: Starting authentication check...');
        const token = getAuthToken();
        console.log('🔍 Student Exams: Memory token:', !!token, '(cookies may still authenticate)');

        console.log('🔍 Student Exams: Making auth request to backend...');
        const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            'Content-Type': 'application/json',
          }
        });
        
        console.log('🔍 Student Exams: Auth response status:', response.status);
        console.log('🔍 Student Exams: Auth response ok:', response.ok);
        
        if (response.ok) {
          const contentType = response.headers.get('content-type');
          console.log('🔍 Student Exams: Content-Type:', contentType);
          if (contentType && contentType.includes('application/json')) {
            const userData = await response.json();
            console.log('✅ Student Exams: User authenticated successfully:', userData.user?.email);
            setUser(userData.user);
            setIsAuthenticated(true);
          } else {
            console.log('❌ Student Exams: Invalid content type - redirecting to login');
            console.log('⏳ Student Exams: Waiting 3 seconds before redirect to see debug messages...');
            setTimeout(() => {
              setLocation('/signin');
            }, 3000);
          }
        } else {
          console.log('❌ Student Exams: Auth failed with status', response.status, '- redirecting to login');
          console.log('⏳ Student Exams: Waiting 3 seconds before redirect to see debug messages...');
          setTimeout(() => {
            setLocation('/signin');
          }, 3000);
        }
      } catch (error) {
        console.error('Auth check failed:', error);
        setIsAuthenticated(false);
      } finally {
        setIsLoadingAuth(false);
      }
    };

    checkAuth();
  }, [setLocation]);

  // Fetch available exams (query key includes student id to avoid showing another user's cached list)
  const { data: examsData, isLoading, isFetching, error, refetch: refetchExams } = useQuery({
    queryKey: ['/api/student/exams', effectiveStudentId],
    queryFn: async () => {
      console.log('🔍 Student Exams: Fetching student exams...');
      console.log('🔍 Student Exams: Token for exams API:', !!getAuthToken());
      const response = await apiFetch('/api/student/exams');
      console.log('🔍 Student Exams: Exams API response status:', response.status);
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to fetch exams:', errorText);
        throw new Error(errorText || `Failed to load exams (${response.status})`);
      }
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const data = await response.json();
        console.log('Fetched exams:', data);
        // Handle different response formats
        if (Array.isArray(data)) {
          return data;
        } else if (data.data && Array.isArray(data.data)) {
          return data.data;
        } else if (data.exams && Array.isArray(data.exams)) {
          return data.exams;
        } else {
          console.warn('Unexpected exams response format:', data);
          return [];
        }
      } else {
        console.warn('Exams response is not JSON, using fallback data');
        return [];
      }
    },
    enabled: isAuthenticated && !!effectiveStudentId,
    retry: 2,
    retryDelay: (attempt) => Math.min(750 * 2 ** attempt, 3000),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  // Ensure exams is always an array
  const exams = Array.isArray(examsData)
    ? examsData.map((exam: Exam) => ({
        ...exam,
        title: removeInternalAccountLabels(exam.title) || 'Exam',
        description: removeInternalAccountLabels(exam.description),
      }))
    : [];

  /** Deep-link from Adaptive Learning recommendations */
  useEffect(() => {
    if (!exams.length || isLoading) return;
    try {
      const raw = sessionStorage.getItem('adaptiveJumpExamId');
      if (!raw) return;
      sessionStorage.removeItem('adaptiveJumpExamId');
      setActiveTab('available');
      const el = document.getElementById(`adaptive-exam-${raw}`);
      if (el) {
        window.requestAnimationFrame(() =>
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        );
      }
    } catch {
      /* ignore storage / DOM quirks */
    }
  }, [exams, isLoading]);

  const classFilteredExams = useMemo(
    () => exams.filter((e: Exam) => examMatchesStudentAssignedClass(e, studentClassNumber)),
    [exams, studentClassNumber]
  );

  const getExamSubjects = (exam: Exam): string[] => {
    const qSubjects = Array.isArray(exam.questions)
      ? exam.questions
          .map((q) => String(q?.subject || '').trim().toLowerCase())
          .filter(Boolean)
      : [];
    const merged = [
      ...qSubjects,
      ...(Array.isArray(exam.subjects) ? exam.subjects : []),
      exam.subject,
    ]
      .map((s) => String(s || '').trim().toLowerCase())
      .filter(Boolean);
    return Array.from(new Set(merged));
  };

  const availableSubjectOptions = useMemo(() => {
    const set = new Set<string>();
    classFilteredExams.forEach((exam: Exam) => {
      getExamSubjects(exam).forEach((s) => set.add(s));
    });
    return Array.from(set.values()).sort();
  }, [classFilteredExams]);

  const subjectFilteredExams = useMemo(
    () =>
      classFilteredExams.filter((exam: Exam) => {
        if (examSubjectFilter === 'all') return true;
        return getExamSubjects(exam).includes(String(examSubjectFilter).toLowerCase());
      }),
    [classFilteredExams, examSubjectFilter]
  );

  // Fetch assessments
  const { data: assessments, isLoading: isLoadingAssessments, error: assessmentsError } = useQuery({
    queryKey: ['/api/assessments', effectiveStudentId],
    queryFn: async () => {
      console.log('🔍 Student Exams: Fetching assessments...');
      const token = getAuthToken();
      console.log('🔍 Student Exams: Token for assessments API:', !!token);
      const response = await fetch(`${API_BASE_URL}/api/assessments`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        }
      });
      console.log('🔍 Student Exams: Assessments API response status:', response.status);
      if (!response.ok) {
        console.warn('Assessments API failed, using fallback data');
        return { assessments: [] };
      }
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const data = await response.json();
        console.log('Fetched assessments:', data);
        return data;
      } else {
        console.warn('Assessments response is not JSON, using fallback data');
        return { assessments: [] };
      }
    },
    enabled: isAuthenticated && !!effectiveStudentId,
  });

  // Fetch exam results (must be keyed by student — shared key caused other users' attempts to appear)
  const { data: results, refetch: refetchResults } = useQuery({
    queryKey: ['/api/student/exam-results', effectiveStudentId],
    queryFn: async () => {
      console.log('🔍 Student Exams: Fetching exam results...');
      const token = getAuthToken();
      console.log('🔍 Student Exams: Token for results API:', !!token);
      const response = await fetch(`${API_BASE_URL}/api/student/exam-results`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        }
      });
      console.log('🔍 Student Exams: Results API response status:', response.status);
      if (!response.ok) {
        console.log('❌ Student Exams: Results API failed with status:', response.status);
        throw new Error('Failed to fetch results');
      }
      const data = await response.json();
      const list = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
      const payload = Array.isArray(data?.data) ? data : { success: data?.success ?? true, data: list };
      console.log('✅ Student Exams: Fetched exam results:', {
        count: list.length,
        results: list.slice(0, 5).map((r: any) => ({
          examId: getExamIdFromResult(r),
          examTitle: r.examTitle || r.examId?.title,
          percentage: r.percentage
        }))
      });
      return payload;
    },
    enabled: isAuthenticated && !!effectiveStudentId,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });

  /** One row per real attempt — API/DB can return duplicate ExamResult docs */
  const dedupedExamResults = useMemo(
    () =>
      dedupeStudentExamResults(
        Array.isArray(results?.data) ? results.data : [],
        getExamIdFromResult
      ),
    [results?.data, getExamIdFromResult]
  );

  const attemptCountByExamId = useMemo(() => {
    // Use raw API rows for attempt limits (match backend countDocuments).
    // Display dedupe can collapse near-duplicate rows and undercount vs the server.
    const m = new Map<string, number>();
    const rows = Array.isArray(results?.data) ? results.data : [];
    for (const result of rows) {
      const id = getExamIdFromResult(result);
      if (!id) continue;
      const k = String(id);
      m.set(k, (m.get(k) || 0) + 1);
    }
    return m;
  }, [results?.data, getExamIdFromResult]);

  const availableActiveExams = useMemo(
    () =>
      subjectFilteredExams
        .filter((exam: Exam) => {
          const examId = String(exam._id || '');
          if (!examId) return false;
          const used = attemptCountByExamId.get(examId) || 0;
          if (used >= getMaxAttemptsForExam(exam)) return false;
          const hydratedQuestionCount = Array.isArray(exam.questions) ? exam.questions.length : 0;
          if (hydratedQuestionCount <= 0) return false;
          if (exam.isActive === false) return false;
          if (exam.hasInProgressDraft || exam.forceSubmitDraft) return true;
          const now = new Date();
          const startDate = new Date(exam.startDate);
          const endDate = new Date(exam.endDate);
          return exam.b2cPastPractice === true || (now >= startDate && now <= endDate);
        })
        .sort((a, b) => {
          if (a.examType === 'practice' && b.examType !== 'practice') return -1;
          if (a.examType !== 'practice' && b.examType === 'practice') return 1;
          return 0;
        }),
    [subjectFilteredExams, attemptCountByExamId]
  );
  const visibleAvailableExams = useMemo(
    () => (showAllAvailableExams ? availableActiveExams : availableActiveExams.slice(0, 3)),
    [availableActiveExams, showAllAvailableExams]
  );

  // One card per exam — keep only the latest attempt for the Attempted Exams grid.
  const attemptedResultRows = useMemo(() => {
    const filtered = dedupedExamResults.filter((result: any) => {
      const examIdStr = getExamIdFromResult(result);
      if (!examIdStr) return false;
      if (examSubjectFilter === 'all') return true;
      const catalogExam = exams.find((e: Exam) => String(e._id) === String(examIdStr));
      if (!catalogExam) return true;
      if (!examMatchesStudentAssignedClass(catalogExam, studentClassNumber)) return false;
      return getExamSubjects(catalogExam).includes(String(examSubjectFilter).toLowerCase());
    });

    const latestByExam = new Map<string, any>();
    for (const result of filtered) {
      const examIdStr = getExamIdFromResult(result);
      if (!examIdStr) continue;
      const key = String(examIdStr);
      const existing = latestByExam.get(key);
      if (!existing) {
        latestByExam.set(key, result);
        continue;
      }
      const attNew = Number(result.attemptNumber) >= 1 ? Number(result.attemptNumber) : 1;
      const attOld = Number(existing.attemptNumber) >= 1 ? Number(existing.attemptNumber) : 1;
      const dateNew = new Date(result.completedAt || 0).getTime();
      const dateOld = new Date(existing.completedAt || 0).getTime();
      if (attNew > attOld || (attNew === attOld && dateNew > dateOld)) {
        latestByExam.set(key, result);
      }
    }

    return Array.from(latestByExam.values()).sort(
      (a, b) => new Date(b.completedAt || 0).getTime() - new Date(a.completedAt || 0).getTime()
    );
  }, [dedupedExamResults, exams, examSubjectFilter, getExamIdFromResult]);

  /** All attempts per exam (newest attempt first) for the history dropdown */
  const attemptHistoryByExamId = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const result of dedupedExamResults) {
      const examIdStr = getExamIdFromResult(result);
      if (!examIdStr) continue;
      if (examSubjectFilter !== 'all') {
        const catalogExam = exams.find((e: Exam) => String(e._id) === String(examIdStr));
        if (catalogExam && !getExamSubjects(catalogExam).includes(String(examSubjectFilter).toLowerCase())) {
          continue;
        }
      }
      const key = String(examIdStr);
      const list = map.get(key) || [];
      list.push(result);
      map.set(key, list);
    }
    Array.from(map.entries()).forEach(([key, list]) => {
      list.sort((a: { attemptNumber?: number; completedAt?: string }, b: { attemptNumber?: number; completedAt?: string }) => {
        const attA = Number(a.attemptNumber) >= 1 ? Number(a.attemptNumber) : 1;
        const attB = Number(b.attemptNumber) >= 1 ? Number(b.attemptNumber) : 1;
        if (attB !== attA) return attB - attA;
        return new Date(b.completedAt || 0).getTime() - new Date(a.completedAt || 0).getTime();
      });
      map.set(key, list);
    });
    return map;
  }, [dedupedExamResults, exams, examSubjectFilter, getExamIdFromResult]);

  const canResumeExam = useCallback(
    (exam: Exam) => {
      if (exam?.forceSubmitDraft) return false;
      if (exam?.canResumeExam === false) return false;
      if (exam?.hasInProgressDraft) return true;
      return Boolean(readLocalExamDraft(String(exam._id), effectiveStudentId));
    },
    [effectiveStudentId],
  );

  const needsForceSubmitDraft = useCallback(
    (exam: Exam) =>
      Boolean(
        exam?.forceSubmitDraft ||
          (exam?.hasInProgressDraft && exam?.canResumeExam === false),
      ),
    [],
  );

  const handleStartExam = async (exam: Exam) => {
    console.log('Starting exam:', exam);
    console.log('Current exam result state:', examResult);
    console.log('Current taking exam state:', isTakingExam);
    
    const maxA = getMaxAttemptsForExam(exam);
    const used = attemptCountByExamId.get(String(exam._id)) || 0;
    if (used >= maxA) {
      toast({
        title: 'No attempts left',
        description: `You have used all ${maxA} attempt(s) for this exam. Open "Attempted Exams" to review your results.`,
        variant: 'destructive',
      });
      return;
    }

    let hydratedQuestionsForInstructions: any[] = [];

    try {
      setStartingExamId(exam._id);
      const token = getAuthToken();
      const response = await fetch(`${API_BASE_URL}/api/student/exams/${exam._id}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const message = payload?.message || 'This exam is not available yet. Questions are not uploaded.';
        toast({
          title: 'Unavailable',
          description: message,
          variant: 'destructive',
        });
        await queryClient.invalidateQueries({ queryKey: ['/api/student/exams'] });
        await queryClient.refetchQueries({ queryKey: ['/api/student/exams', effectiveStudentId] });
        return;
      }

      const payload = await response.json().catch(() => ({}));
      const hydratedQuestions = Array.isArray(payload?.data?.questions) ? payload.data.questions : [];
      if (hydratedQuestions.length === 0) {
        toast({
          title: 'Unavailable',
          description: 'This exam is not available yet. Questions are not uploaded.',
          variant: 'destructive',
        });
        await queryClient.invalidateQueries({ queryKey: ['/api/student/exams'] });
        await queryClient.refetchQueries({ queryKey: ['/api/student/exams', effectiveStudentId] });
        return;
      }
      hydratedQuestionsForInstructions = hydratedQuestions;
    } catch (error) {
      console.error('Failed to validate exam before start:', error);
      toast({
        title: 'Error',
        description: 'Unable to start exam right now. Please try again.',
        variant: 'destructive',
      });
      return;
    } finally {
      setStartingExamId(null);
    }
    
    setExamResult(null);
    setCurrentExam(exam);

    const skipInstructions = canResumeExam(exam) || needsForceSubmitDraft(exam);
    if (skipInstructions) {
      setPendingInstructionsExam(null);
      setIsTakingExam(true);
      return;
    }

    setPendingInstructionsExam({ ...exam, questions: hydratedQuestionsForInstructions });
    setIsTakingExam(false);
  };

  /** Called from the instructions screen — enters fullscreen then starts the attempt. */
  const handleBeginExamFromInstructions = async () => {
    try {
      const el = document.documentElement as HTMLElement & {
        webkitRequestFullscreen?: () => Promise<void>;
        mozRequestFullScreen?: () => Promise<void>;
        msRequestFullscreen?: () => Promise<void>;
      };
      if (el.requestFullscreen) await el.requestFullscreen();
      else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
      else if (el.mozRequestFullScreen) await el.mozRequestFullScreen();
      else if (el.msRequestFullscreen) await el.msRequestFullscreen();
    } catch {
      // Fullscreen can be blocked; the exam still runs.
    }
    setPendingInstructionsExam(null);
    setIsTakingExam(true);
  };

  const handleCancelInstructions = () => {
    setPendingInstructionsExam(null);
    setCurrentExam(null);
  };

  const scrollToExamCard = (examId: string) => {
    window.requestAnimationFrame(() => {
      document.getElementById(`calendar-exam-${examId}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });
  };

  /** Open a specific exam when arriving from dashboard calendar (/?examId=...) */
  useEffect(() => {
    const targetId = pendingOpenExamIdRef.current;
    if (!targetId || !exams.length || isLoading) return;

    const exam = exams.find((e) => String(e._id) === String(targetId));
    pendingOpenExamIdRef.current = null;

    if (!exam) {
      setActiveTab('available');
      return;
    }

    const now = new Date();
    const start = new Date(exam.startDate);
    const end = new Date(exam.endDate);
    const scheduleLabel = {
      title: exam.title || 'Exam',
      startDate: start.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
      endDate: end.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
    };

    if (now < start) {
      setCalendarFocusExam({ examId: targetId, mode: 'upcoming', ...scheduleLabel });
      setActiveTab('upcoming');
      scrollToExamCard(targetId);
      return;
    }

    if (now > end) {
      setCalendarFocusExam({ examId: targetId, mode: 'ended', ...scheduleLabel });
      setActiveTab('attempted');
      scrollToExamCard(targetId);
      return;
    }

    setCalendarFocusExam(null);
    setActiveTab('available');
    void handleStartExam(exam);
  }, [exams, isLoading]);

  const exitFullscreenIfActive = async () => {
    try {
      if (document.fullscreenElement && document.exitFullscreen) {
        await document.exitFullscreen();
        return;
      }
      const doc = document as Document & {
        webkitExitFullscreen?: () => Promise<void> | void;
      };
      if (doc.webkitExitFullscreen) {
        await doc.webkitExitFullscreen();
      }
    } catch (error) {
      console.warn('Failed to exit fullscreen mode:', error);
    }
  };

  const finishExamAfterSubmit = async (result: ExamResult) => {
    await exitFullscreenIfActive();
    setExamResult(result);
    setPendingInstructionsExam(null);
    setIsTakingExam(false);
    setActiveTab('attempted');

    await Promise.allSettled([
      queryClient.invalidateQueries({ queryKey: ['/api/student/exam-results'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/student/exams'] }),
      refetchResults(),
      queryClient.refetchQueries({ queryKey: ['/api/student/exams', effectiveStudentId] }),
    ]);
  };

  const handleExamComplete = (result: ExamResult) => {
    void finishExamAfterSubmit(result);
  };

  const handleExitExam = () => {
    exitFullscreenIfActive();
    setCurrentExam(null);
    setPendingInstructionsExam(null);
    setIsTakingExam(false);
    void queryClient.invalidateQueries({ queryKey: ['/api/student/exams'] });
  };

  const handleRetakeExam = () => {
    if (!currentExam) return;
    const maxA = getMaxAttemptsForExam(currentExam);
    const counted = attemptCountByExamId.get(String(currentExam._id)) || 0;
    const fromResult =
      examResult &&
      String(getExamIdFromResult(examResult as any) || '') === String(currentExam._id) &&
      Number((examResult as ExamResult).attemptNumber) >= 1
        ? Number((examResult as ExamResult).attemptNumber)
        : 0;
    const used = Math.max(counted, fromResult);
    if (used >= maxA) {
      toast({
        title: 'No attempts left',
        description: 'No attempts remaining for this exam.',
        variant: 'destructive',
      });
      return;
    }
    const status = getExamStatus(currentExam);
    if (status.status === 'ended') {
      toast({
        title: 'Exam ended',
        description: 'This exam window has ended. Retakes are not available.',
        variant: 'destructive',
      });
      return;
    }
    setExamResult(null);
    setPendingInstructionsExam(currentExam);
    setIsTakingExam(false);
  };

  const handleBackToExams = () => {
    setCurrentExam(null);
    setExamResult(null);
    setPendingInstructionsExam(null);
    setIsTakingExam(false);
    
    // Refresh exam results to show the newly completed exam
    queryClient.invalidateQueries({ queryKey: ['/api/student/exam-results'] });
    queryClient.refetchQueries({ queryKey: ['/api/student/exam-results', effectiveStudentId] });
  };

  useEffect(() => {
    if (!examResult) return;
    apiFetch('/api/vidya/student/focus-card')
      .then((r) => r.json())
      .then((data) => {
        if (data?.proactivePrompt && !data.proactivePrompt?.delivered) {
          setPostExamVidyaPrompt(String(data.proactivePrompt.promptText || ''));
          setPostExamPromptId(String(data.proactivePrompt._id || ''));
        }
      })
      .catch(() => null);
  }, [examResult]);

  const getExamTypeColor = (type: string) => {
    switch (type) {
      case 'mains': return 'bg-blue-100 text-blue-700';
      case 'advanced': return 'bg-blue-100 text-blue-700';
      case 'weekend': return 'bg-green-100 text-green-700';
      case 'practice': return 'bg-orange-100 text-orange-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getExamStatus = (exam: Exam) => {
    if (exam.b2cPastPractice === true) {
      return { status: 'active', color: 'bg-green-100 text-green-700' };
    }
    const now = new Date();
    const startDate = new Date(exam.startDate);
    const endDate = new Date(exam.endDate);
    const startMs = startDate.getTime();
    const endMs = endDate.getTime();

    // Invalid / inverted windows: treat as upcoming until start, then ended after the later bound.
    if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs < startMs) {
      if (now.getTime() < startMs) return { status: 'upcoming', color: 'bg-yellow-100 text-yellow-700' };
      return { status: 'ended', color: 'bg-red-100 text-red-700' };
    }

    if (now < startDate) return { status: 'upcoming', color: 'bg-yellow-100 text-yellow-700' };
    if (now > endDate) return { status: 'ended', color: 'bg-red-100 text-red-700' };
    return { status: 'active', color: 'bg-green-100 text-green-700' };
  };

  // Debug state
  console.log('Render state:', {
    isTakingExam,
    currentExam: currentExam ? currentExam._id : null,
    examResult: examResult ? 'exists' : null,
    isLoadingAuth,
    isAuthenticated
  });

  if (pendingInstructionsExam && !isTakingExam) {
    return (
      <ExamInstructionsScreen
        exam={pendingInstructionsExam as ExamInstructionsExam}
        questionCount={
          pendingInstructionsExam.questions?.length ||
          pendingInstructionsExam.totalQuestions ||
          0
        }
        onStart={() => void handleBeginExamFromInstructions()}
        onBack={handleCancelInstructions}
      />
    );
  }

  if (isTakingExam && currentExam) {
    console.log('Rendering AnimatedExam component');
    return (
      <AnimatedExam 
        examId={currentExam._id}
        onComplete={handleExamComplete}
        onExit={handleExitExam}
      />
    );
  }

  if (examResult && currentExam) {
    console.log('Rendering ExamResults component');
    const maxA = getMaxAttemptsForExam(currentExam);
    const counted = attemptCountByExamId.get(String(currentExam._id)) || 0;
    const fromThisResult = Number(examResult.attemptNumber) >= 1 ? Number(examResult.attemptNumber) : 0;
    const used = Math.max(counted, fromThisResult);
    const attemptsRemaining = Math.max(0, maxA - used);
    return (
      <div className="min-h-screen bg-sky-50 px-4 py-3 sm:py-4 lg:py-6">
        {postExamVidyaPrompt && (
          <div className="mx-auto mt-4 max-w-5xl rounded-xl border border-sky-300 bg-sky-50 p-4">
            <div className="flex items-start gap-3">
              <img src="/Vidya-ai.jpg" className="h-9 w-9 rounded-full object-cover" alt="Vidya" />
              <div className="flex-1">
                <p className="text-xs sm:text-sm font-medium text-sky-800">{postExamVidyaPrompt}</p>
                <button
                  onClick={() => {
                    apiFetch('/api/vidya/student/proactive/delivered', {
                      method: 'POST',
                      body: JSON.stringify({ promptId: postExamPromptId }),
                    }).catch(() => null);
                    setLocation(`/ai-tutor?prompt=${encodeURIComponent(postExamVidyaPrompt)}`);
                  }}
                  className="mt-2 rounded-lg bg-sky-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-sky-700"
                >
                  Review with Vidya →
                </button>
              </div>
            </div>
          </div>
        )}
        <ExamResults
          result={examResult as ExamResultsResultProp}
          examTitle={currentExam.title}
          onRetake={handleRetakeExam}
          onViewAnalysis={() => {}}
          onBack={handleBackToExams}
          openDetailedByDefault
          attemptsRemaining={attemptsRemaining}
        />
      </div>
    );
  }

  if (isLoadingAuth) {
    return (
      <div className="min-h-screen bg-sky-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-blue-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl">
            <div className="w-6 h-6 sm:w-7 sm:h-7 lg:w-8 lg:h-8 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-blue-600 to-blue-600 bg-clip-text text-transparent mb-2">Loading...</h2>
          <p className="text-gray-600">Checking authentication...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-sky-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-500 mb-4">
            <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-3 sm:m-4 lg:m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 19.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-2">Authentication Required</h3>
          <p className="text-gray-600 mb-4">Please log in to access exams</p>
          <button 
            onClick={() => setLocation('/signin')} 
            className="bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/90"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-sky-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-blue-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl">
            <div className="w-6 h-6 sm:w-7 sm:h-7 lg:w-8 lg:h-8 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-blue-600 to-blue-600 bg-clip-text text-transparent mb-2">Loading...</h2>
          <p className="text-gray-600">Loading exams...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-sky-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-500 mb-4">
            <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-3 sm:m-4 lg:m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 19.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-2">Error Loading Exams</h3>
          <p className="text-gray-600 mb-4">{error.message}</p>
          <button
            onClick={() => void refetchExams()}
            disabled={isFetching}
            className="bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/90"
          >
            {isFetching ? 'Trying…' : 'Try Again'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <StudentShell contentClassName="app-shell-content">
      <div className="relative w-full pb-8">
        
        {!isMobile && <VidyaAIFloatingAssistant />}
        
        {/* Hero */}
        <div className="relative mb-6 overflow-hidden rounded-3xl bg-gradient-to-br from-amber-100 via-orange-50 to-rose-100 p-6 sm:p-8 lg:p-10">
          <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-white/50 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 left-1/3 h-64 w-64 rounded-full bg-orange-200/40 blur-3xl" />
          <div className="relative z-[1] max-w-2xl">
            <p className="inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-sm font-bold uppercase tracking-[0.12em] text-orange-700">
              <Trophy className="h-4 w-4" aria-hidden="true" />
              {isB2cStudent ? 'Practice exams' : 'Exams'}
            </p>
            <h1 className="mt-4 font-display text-3xl font-extrabold leading-tight tracking-tight text-ink sm:text-4xl lg:text-[2.75rem]">
              {isB2cStudent ? 'Keep practising.' : 'Test yourself.'}
              <br />
              <span className="text-orange-600">Track every step.</span>
            </h1>
            <p className="mt-3 max-w-xl text-lg leading-relaxed text-ink-soft">
              {isB2cStudent
                ? 'Take class-wise practice exams tied to your Board or Asli Prep Alpha / Beta / Gamma track. Attempt, review, and come back — this is how you stay on the platform.'
                : 'Take practice exams, review your attempts and see where you rank.'}
            </p>
            {isB2cStudent ? (
              <Button className="mt-5 bg-orange-600 text-white hover:bg-orange-700" onClick={() => setShowGenerateExam(true)}>
                <Sparkles className="h-4 w-4" />
                Generate Exam
              </Button>
            ) : null}
            <div className="mt-6 flex flex-wrap gap-3">
              {[
                { value: availableActiveExams.length, label: availableActiveExams.length === 1 ? 'Available exam' : 'Available exams', Icon: Target },
                { value: attemptedResultRows.length, label: 'Attempted', Icon: CheckCircle },
              ].map(({ value, label, Icon }) => (
                <div key={label} className="flex items-center gap-3 rounded-2xl border border-white/80 bg-white/85 px-4 py-3 shadow-sm backdrop-blur">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
                    <Icon className="h-[1.15rem] w-[1.15rem]" aria-hidden="true" />
                  </span>
                  <span className="leading-tight">
                    <span className="block font-display text-xl font-bold text-ink">{value}</span>
                    <span className="block text-sm text-muted-foreground">{label}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <Dialog open={showGenerateExam} onOpenChange={setShowGenerateExam}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Generate your exam</DialogTitle>
              <DialogDescription>Build a scored exam from questions already available for your class and topic.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid gap-1.5"><Label>Board / Track</Label><Select value={generateBoard} onValueChange={(value) => { setGenerateBoard(value); setGenerateSubject(''); setGenerateTopic(''); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="CBSE">CBSE</SelectItem><SelectItem value="IIT">IIT</SelectItem></SelectContent></Select></div>
              <div className="grid gap-1.5"><Label>Subject</Label><Select value={generateSubject} onValueChange={(value) => { setGenerateSubject(value); setGenerateTopic(''); }}><SelectTrigger><SelectValue placeholder={examGeneratorCascade.loadingSubjects ? 'Loading subjects...' : 'Select subject'} /></SelectTrigger><SelectContent>{examGeneratorCascade.subjects.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div>
              <div className="grid gap-1.5"><Label>Topic</Label><Select value={generateTopic} onValueChange={setGenerateTopic} disabled={!generateSubject || examGeneratorCascade.loadingTopics}><SelectTrigger className="overflow-hidden [&>span]:truncate"><SelectValue placeholder={examGeneratorCascade.loadingTopics ? 'Loading topics...' : 'Select topic'} /></SelectTrigger><SelectContent>{examGeneratorCascade.topics.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div>
              <div className="grid gap-1.5"><Label>Number of questions</Label><Select value={generateQuestionCount} onValueChange={setGenerateQuestionCount}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['10','15','20'].map((item) => <SelectItem key={item} value={item}>{item} questions</SelectItem>)}</SelectContent></Select></div>
              <Button onClick={generatePersonalExam} disabled={!generateSubject || !generateTopic || isGeneratingExam}>{isGeneratingExam ? 'Collecting saved questions...' : 'Generate and start exam'}</Button>
            </div>
          </DialogContent>
        </Dialog>

        <div className="mb-8">
          <div className="flex flex-wrap items-center gap-2">
            {studentClassNumber ? (
              <div className="flex items-center gap-2">
                <span className="text-xs sm:text-sm text-gray-600 whitespace-nowrap">Class</span>
                <Badge className="bg-indigo-100 text-indigo-800 border-indigo-200 font-medium">
                  Class {studentClassNumber}
                </Badge>
              </div>
            ) : null}
            <Label htmlFor="exam-subject-filter" className="text-xs sm:text-sm text-gray-600 whitespace-nowrap sm:ml-2">
              Subject
            </Label>
            <Select
              value={examSubjectFilter}
              onValueChange={(value) => preserveScrollOnFilterChange(setExamSubjectFilter, value)}
            >
              <SelectTrigger id="exam-subject-filter" className="w-full sm:w-[220px] bg-white">
                <SelectValue placeholder="All subjects" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All subjects</SelectItem>
                {availableSubjectOptions.map((subject) => (
                  <SelectItem key={subject} value={subject}>
                    {subject.charAt(0).toUpperCase() + subject.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {calendarFocusExam && (
          <div
            className={`mb-4 rounded-xl border px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${
              calendarFocusExam.mode === 'upcoming'
                ? 'border-amber-200 bg-amber-50'
                : 'border-slate-200 bg-slate-50'
            }`}
          >
            <div>
              <p className="text-sm font-semibold text-gray-900">
                {calendarFocusExam.mode === 'upcoming' ? 'Upcoming exam' : 'Past exam'} —{' '}
                {calendarFocusExam.title}
              </p>
              <p className="text-xs sm:text-sm text-gray-600 mt-1">
                {calendarFocusExam.mode === 'upcoming' ? (
                  <>
                    Opens <strong>{calendarFocusExam.startDate}</strong> · Closes{' '}
                    <strong>{calendarFocusExam.endDate}</strong>. You can start it once the exam window begins.
                  </>
                ) : (
                  <>
                    Ran <strong>{calendarFocusExam.startDate}</strong> – <strong>{calendarFocusExam.endDate}</strong>.
                    Check your attempts below if you already took it.
                  </>
                )}
              </p>
            </div>
            <Button variant="outline" size="sm" className="shrink-0" onClick={() => setCalendarFocusExam(null)}>
              Dismiss
            </Button>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-3 sm:space-y-4 lg:space-y-6">
          <TabsList className="grid w-full grid-cols-1 sm:grid-cols-2 md:grid-cols-4">
            <TabsTrigger value="available">{isB2cStudent ? 'Practice papers' : 'Available Exams'}</TabsTrigger>
            <TabsTrigger value="attempted">Attempted Exams</TabsTrigger>
            <TabsTrigger value="ranking">My Rankings</TabsTrigger>
            <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
          </TabsList>

          {/* Available Exams */}
          <TabsContent value="available" className="space-y-3 overflow-visible sm:space-y-4 lg:space-y-6">
            <div className="grid grid-cols-1 items-stretch gap-4 overflow-visible p-1 sm:grid-cols-2 sm:gap-5 sm:p-2 md:grid-cols-2 lg:grid-cols-3 lg:gap-6">
              {visibleAvailableExams.map((exam: Exam, index: number) => {
                const status = getExamStatus(exam);
                const colorScheme = EXAM_CARD_SCHEMES[index % EXAM_CARD_SCHEMES.length];
                const classLabels = getExamClassLabelsForStudent(exam, studentClassNumber);
                const hydratedQuestionCount = Array.isArray(exam.questions) ? exam.questions.length : Number(exam.totalQuestions || 0);
                
                return (
                  <Card
                    key={exam._id}
                    id={`adaptive-exam-${exam._id}`}
                    className={`relative flex h-full min-h-0 flex-col overflow-visible scroll-mt-6 ${colorScheme.bg} ${colorScheme.border} shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-elevated`}
                  >
                    <CardHeader className="shrink-0 space-y-2 p-4 sm:p-5 lg:p-5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <CardTitle className="mb-2 break-words text-base font-bold leading-snug text-gray-900 sm:text-lg">
                            {exam.title}
                          </CardTitle>
                          {exam.description && (
                            <p className={`mb-3 line-clamp-2 text-base font-medium ${colorScheme.text}`}>{exam.description}</p>
                          )}
                          <div className="flex flex-wrap gap-2 mt-2">
                            <Badge className={`${colorScheme.badge} border-0`}>
                              {exam.examType.toUpperCase()}
                            </Badge>
                            {classLabels.map((cl) => (
                              <Badge
                                key={cl}
                                className="bg-white/90 text-gray-900 border-0 font-medium"
                              >
                                Class {cl}
                              </Badge>
                            ))}
                            {status.status === 'ended' ? (
                              <Badge className="bg-red-600 text-white border-2 border-white/50 shadow-lg font-semibold">ENDED</Badge>
                            ) : status.status === 'active' ? (
                              <Badge className="bg-teal-600 text-white border-2 border-white/50 shadow-lg font-semibold">ACTIVE</Badge>
                            ) : (
                              <Badge className="bg-yellow-600 text-white border-2 border-white/50 shadow-lg font-semibold">UPCOMING</Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="flex flex-1 flex-col p-4 pt-0 sm:p-5 sm:pt-0 lg:p-5 lg:pt-0">
                      <div className={`mb-5 space-y-2.5 text-base font-medium ${colorScheme.text}`}>
                        <div className="flex items-center">
                          <Clock className={`h-3.5 w-3.5 sm:h-4 sm:w-4 mr-2 shrink-0 ${colorScheme.iconClock}`} />
                          <span>{exam.duration} minutes</span>
                        </div>
                        <div className="flex items-center">
                          <BookOpen className={`h-3.5 w-3.5 sm:h-4 sm:w-4 mr-2 shrink-0 ${colorScheme.iconBook}`} />
                          <span>{hydratedQuestionCount} questions • {exam.totalMarks} marks</span>
                        </div>
                        {!exam.hideAvailabilityDates && (
                          <div className="flex items-center">
                            <Calendar className={`h-3.5 w-3.5 sm:h-4 sm:w-4 mr-2 shrink-0 ${colorScheme.iconCalendar}`} />
                            <span className="text-xs">
                              {new Date(exam.startDate).toLocaleDateString()} - {new Date(exam.endDate).toLocaleDateString()}
                            </span>
                          </div>
                        )}
                        <div className="flex items-center text-xs font-medium">
                          <Target className={`h-3.5 w-3.5 sm:h-4 sm:w-4 mr-2 shrink-0 ${colorScheme.iconTarget}`} />
                          <span>
                            Attempts: {attemptCountByExamId.get(String(exam._id)) || 0} /{' '}
                            {getMaxAttemptsForExam(exam)}
                          </span>
                        </div>
                      </div>

                      {/* Action Button */}
                      <Button 
                        onClick={() => handleStartExam(exam)}
                        className="mt-auto h-12 w-full !bg-primary text-base font-bold !text-primary-foreground shadow-sm transition-colors hover:!bg-indigo-blue-700 disabled:!bg-muted disabled:!text-muted-foreground"
                        disabled={
                          (status.status === 'ended' && !needsForceSubmitDraft(exam) && !canResumeExam(exam)) ||
                          startingExamId === exam._id
                        }
                      >
                        <Play className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
                        {startingExamId === exam._id
                          ? 'Checking...'
                          : needsForceSubmitDraft(exam)
                          ? 'Submit saved exam'
                          : canResumeExam(exam)
                          ? 'Resume Exam'
                          : status.status === 'upcoming'
                          ? 'Start Exam (Upcoming)'
                          : 'Start Exam'}
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {availableActiveExams.length > 3 && (
              <div className="flex justify-center px-1">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full max-w-sm gap-2"
                  onClick={() => setShowAllAvailableExams((value) => !value)}
                  aria-expanded={showAllAvailableExams}
                >
                  {showAllAvailableExams ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  {showAllAvailableExams
                    ? 'Show fewer tests'
                    : `Show ${availableActiveExams.length - 3} more tests`}
                </Button>
              </div>
            )}

            {availableActiveExams.length === 0 && (
              <div className="text-center py-12">
                <BookOpen className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-2">
                  {isB2cStudent ? 'No practice exams open right now' : 'No Available Exams'}
                </h3>
                <p className="text-gray-600">
                  {isB2cStudent
                    ? `Practice papers for${studentClassNumber ? ` Class ${studentClassNumber}` : ' your class'} appear here when they are available for your Board or IIT track.`
                    : `No active exams for${studentClassNumber ? ` Class ${studentClassNumber}` : ' your class'} are open right now${
                        subjectFilteredExams.some((e) => getExamStatus(e).status === 'upcoming')
                          ? '. Check the Upcoming tab for scheduled exams.'
                          : '. Scheduled exams appear here when they match your school, board, and class, and questions are available.'
                      }`}
                </p>
              </div>
            )}
          </TabsContent>

          {/* Attempted Exams */}
          <TabsContent value="attempted" className="space-y-3 overflow-visible sm:space-y-4 lg:space-y-6">
            <div className="grid grid-cols-1 items-stretch gap-4 overflow-visible p-1 sm:grid-cols-2 sm:gap-5 sm:p-2 md:grid-cols-2 lg:grid-cols-3 lg:gap-6">
              {attemptedResultRows.map((result: any, index: number) => {
                const examIdStr = getExamIdFromResult(result);
                if (!examIdStr) return null;

                const catalogExam =
                  exams.find((e: Exam) => String(e._id) === String(examIdStr)) ||
                  classFilteredExams.find((e) => String(e._id) === String(examIdStr)) ||
                  subjectFilteredExams.find((e) => String(e._id) === String(examIdStr));
                const exam = catalogExam || buildFallbackExamFromResult(examIdStr, result);

                const colorScheme = EXAM_CARD_SCHEMES[index % EXAM_CARD_SCHEMES.length];
                const classLabelsAttempted = getExamClassLabelsForStudent(exam, studentClassNumber);
                const attemptHistory = attemptHistoryByExamId.get(examIdStr) || [result];
                const totalAttempts = attemptHistory.length;
                const selectedRowId = selectedAttemptByExam[examIdStr];
                const displayResult =
                  (selectedRowId &&
                    attemptHistory.find((r) => getExamResultRowId(r) === selectedRowId)) ||
                  attemptHistory[0] ||
                  result;
                const displayPercentage = getDisplayPercentage(displayResult);
                const attemptNum =
                  Number(displayResult.attemptNumber) >= 1 ? Number(displayResult.attemptNumber) : 1;
                const displayRowId = getExamResultRowId(displayResult);
                const totalMarksDisplay = displayResult.totalMarks || exam.totalMarks;
                const performanceBadge =
                  displayPercentage >= 70
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : displayPercentage >= 50
                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                      : 'bg-rose-50 text-rose-700 border border-rose-200';

                return (
                  <Card
                    key={examIdStr}
                    id={`calendar-exam-${examIdStr}`}
                    className={`relative flex h-full min-h-0 flex-col overflow-visible scroll-mt-6 ${colorScheme.bg} ${colorScheme.border} shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-elevated ${
                      calendarFocusExam?.examId === examIdStr && calendarFocusExam.mode === 'ended'
                        ? 'ring-4 ring-slate-300 ring-offset-2'
                        : ''
                    }`}
                  >
                    <CardHeader className="shrink-0 space-y-2 p-4 sm:p-5 lg:p-5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <CardTitle className="mb-2 break-words text-base font-bold leading-snug text-gray-900 sm:text-lg">
                            {exam.title}
                          </CardTitle>
                          {exam.description && (
                            <p className={`mb-3 line-clamp-2 text-xs sm:text-sm ${colorScheme.text}/90`}>{exam.description}</p>
                          )}
                          <div className="flex flex-wrap gap-2 mt-2">
                            <Badge className={`${colorScheme.badge} border-0`}>
                              {exam.examType.toUpperCase()}
                            </Badge>
                            {classLabelsAttempted.map((cl) => (
                              <Badge
                                key={cl}
                                className="bg-slate-50 text-slate-700 border border-slate-200 font-medium"
                              >
                                Class {cl}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="flex flex-1 flex-col space-y-4 p-4 pt-0 sm:p-5 sm:pt-0 lg:p-5 lg:pt-0">
                      <div className="flex flex-1 flex-col space-y-4">
                        {totalAttempts > 1 && (
                          <div className="space-y-1.5 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                            <Label className="text-xs font-semibold text-slate-600">
                              View attempt
                            </Label>
                            <Select
                              value={displayRowId}
                              onValueChange={(value) =>
                                setSelectedAttemptByExam((prev) => ({ ...prev, [examIdStr]: value }))
                              }
                            >
                              <SelectTrigger className="h-auto min-h-11 items-center border-slate-200 bg-white py-2 text-xs text-slate-800 shadow-none [&>span]:whitespace-normal [&>svg]:mt-0">
                                <SelectValue placeholder="Choose attempt" />
                              </SelectTrigger>
                              <SelectContent>
                                {attemptHistory.map((attemptRow) => (
                                  <SelectItem
                                    key={getExamResultRowId(attemptRow)}
                                    value={getExamResultRowId(attemptRow)}
                                  >
                                    {formatAttemptHistoryLabel(attemptRow, exam.totalMarks)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}

                        {/* Score Display */}
                        <div className="rounded-xl border border-slate-100 bg-slate-50/90 p-4 text-center">
                          <div className="text-2xl sm:text-3xl font-bold text-slate-800">
                            {displayResult.obtainedMarks || 0}
                            <span className="text-lg sm:text-xl font-semibold text-slate-500">
                              /{totalMarksDisplay}
                            </span>
                          </div>
                          <div className="mt-1 text-xs font-medium text-slate-500 sm:text-sm">marks</div>
                        </div>

                        {/* Performance Breakdown */}
                        <div className="space-y-2 text-xs sm:text-sm">
                          <div className="flex items-center justify-between rounded-lg bg-emerald-50/70 px-2.5 py-1.5 text-emerald-800">
                            <span>Correct Answers</span>
                            <span className="font-semibold">{displayResult.correctAnswers || 0}</span>
                          </div>
                          <div className="flex items-center justify-between rounded-lg bg-rose-50/70 px-2.5 py-1.5 text-rose-800">
                            <span>Wrong Answers</span>
                            <span className="font-semibold">{displayResult.wrongAnswers || 0}</span>
                          </div>
                          <div className="flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-1.5 text-slate-700">
                            <span>Unattempted</span>
                            <span className="font-semibold">{displayResult.unattempted || 0}</span>
                          </div>
                          <div className="flex items-center justify-between rounded-lg bg-sky-50/70 px-2.5 py-1.5 text-sky-800">
                            <span>Time Taken</span>
                            <span className="font-semibold">
                              {displayResult.timeTaken
                                ? `${Math.floor(displayResult.timeTaken / 60)}m ${displayResult.timeTaken % 60}s`
                                : 'N/A'}
                            </span>
                          </div>
                        </div>

                        {/* Grade Badge — soft tint, not solid bright pills */}
                        <div className="text-center">
                          <Badge className={`${performanceBadge} px-3 py-1 font-medium shadow-none`}>
                            {displayPercentage >= 70 ? 'Excellent' :
                             displayPercentage >= 50 ? 'Good' : 'Needs Improvement'}
                          </Badge>
                        </div>

                        {/* View Details Button */}
                        <Button 
                          variant="outline" 
                          className="mt-auto h-11 w-full border-slate-200 bg-slate-50 text-base font-semibold text-slate-700 shadow-none hover:bg-slate-100 hover:text-slate-900"
                          onClick={async () => {
                            console.log('📋 Viewing details for exam:', exam.title);
                            console.log('📋 Exam result:', displayResult);
                            
                            // Load review payload with correct answers for attempted exams.
                            let examWithQuestions = exam;
                            let reviewResult = displayResult;
                            let reviewedQuestions: any[] = [];
                            try {
                              const token = getAuthToken();
                              const reviewQs =
                                displayResult._id != null && String(displayResult._id).trim() !== ''
                                  ? `?resultId=${encodeURIComponent(String(displayResult._id))}`
                                  : '';
                              const reviewResponse = await fetch(
                                `${API_BASE_URL}/api/student/exam-results/${exam._id}/review${reviewQs}`,
                                {
                                  headers: {
                                    'Authorization': `Bearer ${token}`,
                                    'Content-Type': 'application/json',
                                  },
                                }
                              );
                              if (reviewResponse.ok) {
                                const reviewJson = await reviewResponse.json();
                                reviewResult = reviewJson?.data?.result || displayResult;
                                reviewedQuestions = reviewJson?.data?.questions || [];
                                examWithQuestions = {
                                  ...examWithQuestions,
                                  questions: reviewedQuestions,
                                  totalQuestions: reviewJson?.data?.exam?.totalQuestions || examWithQuestions.totalQuestions,
                                  totalMarks: reviewJson?.data?.exam?.totalMarks || examWithQuestions.totalMarks,
                                  title: reviewJson?.data?.exam?.title || examWithQuestions.title,
                                };
                                console.log('✅ Loaded review payload with questions:', reviewedQuestions.length);
                              } else {
                                // Fallback to student exam endpoint (answer key hidden there).
                                const response = await fetch(`${API_BASE_URL}/api/student/exams/${exam._id}`, {
                                  headers: {
                                    'Authorization': `Bearer ${token}`,
                                    'Content-Type': 'application/json',
                                  }
                                });
                                if (response.ok) {
                                  const data = await response.json();
                                  examWithQuestions = data.data || exam;
                                  console.log('✅ Fallback loaded exam questions:', examWithQuestions.questions?.length || 0);
                                }
                              }
                            } catch (error) {
                              console.error('❌ Failed to load exam review/questions:', error);
                            }
                            
                            // Format the result to match ExamResult interface
                            const formattedResult: ExamResult = {
                              _id: reviewResult._id
                                ? String(reviewResult._id)
                                : displayResult._id
                                  ? String(displayResult._id)
                                  : undefined,
                              attemptNumber:
                                Number(reviewResult.attemptNumber) >= 1
                                  ? Number(reviewResult.attemptNumber)
                                  : attemptNum,
                              examId: getExamIdFromResult(reviewResult) || exam._id,
                              examTitle: reviewResult.examTitle || examWithQuestions.title || exam.title,
                              totalQuestions: reviewResult.totalQuestions || examWithQuestions.totalQuestions || exam.totalQuestions || 0,
                              correctAnswers: reviewResult.correctAnswers || 0,
                              wrongAnswers: reviewResult.wrongAnswers || 0,
                              unattempted: reviewResult.unattempted || 0,
                              totalMarks: reviewResult.totalMarks || examWithQuestions.totalMarks || exam.totalMarks || 0,
                              obtainedMarks: reviewResult.obtainedMarks || 0,
                              percentage: Number.isFinite(Number(reviewResult.percentage))
                                ? Number(reviewResult.percentage)
                                : getDisplayPercentage(reviewResult),
                              timeTaken: reviewResult.timeTaken || 0,
                              subjectWiseScore: reviewResult.subjectWiseScore || {
                                maths: { correct: 0, total: 0, marks: 0 },
                                physics: { correct: 0, total: 0, marks: 0 },
                                chemistry: { correct: 0, total: 0, marks: 0 }
                              },
                              answers: reviewResult.answers || {},
                              questions: examWithQuestions.questions || []
                            };
                            
                            // Set the exam and result to show the detailed view
                            setCurrentExam(examWithQuestions);
                            setExamResult(formattedResult);
                            setIsTakingExam(false);
                            
                            // Scroll to top to show the results
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                        >
                          <Eye className="mr-2 h-4 w-4 text-slate-500" />
                          View Details
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {attemptedResultRows.length === 0 && (
              <div className="text-center py-12">
                <CheckCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-2">No Attempted Exams</h3>
                <p className="text-gray-600">Start taking exams to see your results here</p>
              </div>
            )}
          </TabsContent>



          {/* Student Rankings */}
          <TabsContent value="ranking" className="space-y-3 sm:space-y-4 lg:space-y-6">
            <StudentRanking />
          </TabsContent>

          {/* Upcoming Exams */}
          <TabsContent value="upcoming" className="space-y-3 overflow-visible sm:space-y-4 lg:space-y-6">
            <div className="grid grid-cols-1 items-stretch gap-4 overflow-visible p-1 sm:grid-cols-2 sm:gap-5 sm:p-2 md:grid-cols-2 lg:grid-cols-3 lg:gap-6">
              {subjectFilteredExams.filter((exam: Exam) => getExamStatus(exam).status === 'upcoming').map((exam: Exam, index: number) => {
                const colorScheme = EXAM_CARD_SCHEMES[index % EXAM_CARD_SCHEMES.length];
                const classLabelsUpcoming = getExamClassLabelsForStudent(exam, studentClassNumber);
                const isCalendarFocus =
                  calendarFocusExam?.examId === String(exam._id) && calendarFocusExam.mode === 'upcoming';
                
                return (
                  <Card
                    key={exam._id}
                    id={`calendar-exam-${exam._id}`}
                    className={`relative flex h-full min-h-0 flex-col overflow-visible scroll-mt-6 ${colorScheme.bg} ${colorScheme.border} shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-elevated ${
                      isCalendarFocus ? 'ring-4 ring-amber-400 ring-offset-2' : ''
                    }`}
                  >
                    <CardHeader className="shrink-0 space-y-2 p-4 sm:p-5 lg:p-5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <CardTitle className="mb-2 break-words text-base font-bold leading-snug text-gray-900 sm:text-lg">
                            {exam.title}
                          </CardTitle>
                          {exam.description && (
                            <p className={`mb-3 line-clamp-2 text-xs sm:text-sm ${colorScheme.text}/90`}>{exam.description}</p>
                          )}
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Badge className={`${colorScheme.badge} border-0`}>
                              {exam.examType.toUpperCase()}
                            </Badge>
                            {classLabelsUpcoming.map((cl) => (
                              <Badge
                                key={cl}
                                className="border-0 bg-white/90 font-medium text-gray-900"
                              >
                                Class {cl}
                              </Badge>
                            ))}
                            <Badge className="border-2 border-white/50 bg-yellow-600 font-semibold text-white shadow-lg">
                              UPCOMING
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="flex flex-1 flex-col p-4 pt-0 sm:p-5 sm:pt-0 lg:p-5 lg:pt-0">
                      <div className={`mb-4 space-y-2 text-xs sm:text-sm ${colorScheme.text}`}>
                        <div className="flex items-center">
                          <Clock className={`mr-2 h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4 ${colorScheme.iconClock}`} />
                          <span>{exam.duration} minutes</span>
                        </div>
                        <div className="flex items-center">
                          <BookOpen className={`mr-2 h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4 ${colorScheme.iconBook}`} />
                          <span>{exam.totalQuestions} questions • {exam.totalMarks} marks</span>
                        </div>
                        <div className="flex items-center">
                          <Calendar className={`mr-2 h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4 ${colorScheme.iconCalendar}`} />
                          <span className="text-xs">
                            Starts: {new Date(exam.startDate).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="flex items-center">
                          <Calendar className={`mr-2 h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4 ${colorScheme.iconCalendar}`} />
                          <span className="text-xs">
                            Ends: {new Date(exam.endDate).toLocaleDateString()}
                          </span>
                        </div>
                      </div>

                      <Button 
                        variant="outline" 
                        className="mt-auto h-12 w-full !bg-primary text-base font-bold !text-primary-foreground shadow-sm transition-colors hover:!bg-indigo-blue-700 disabled:!bg-muted disabled:!text-muted-foreground"
                        disabled
                      >
                        <Calendar className="mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                        Not Yet Available
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {subjectFilteredExams.filter((exam: Exam) => getExamStatus(exam).status === 'upcoming').length === 0 && (
              <div className="text-center py-12">
                <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-2">No Upcoming Exams</h3>
                <p className="text-gray-600">Check back later for scheduled exams</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </StudentShell>
  );
}
