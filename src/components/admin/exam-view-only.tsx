import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Eye, BarChart3, Filter, Download, TrendingUp, Users, Clock, Calendar, BookOpen } from 'lucide-react';
import { API_BASE_URL } from '@/lib/api-config';
import { useToast } from '@/hooks/use-toast';
import { getAuthToken } from '@/lib/auth-utils';
import {
  CLASS_FILTER_OPTIONS,
  examIncludesClass,
  expandExamsByClass,
  getExamClassStrings,
  type ExamClassCard,
} from '@/lib/exam-classes';
import { downloadSchoolPerformanceAnalysisExcel } from '@/lib/school-performance-analysis-excel';
import { Trophy } from 'lucide-react';
import { AdminPageHero, AdminFooterBanner } from '@/components/admin/ui/AdminUiKit';
import {
  buildClassQuestionBreakdown,
  buildExamAnalyticsHandoffReport,
} from '@/lib/exam-analytics-handoff';
import StudentExamHandoffModal from '@/components/admin/StudentExamHandoffModal';
import AdminExamQuestionBreakdown from '@/components/admin/AdminExamQuestionBreakdown';
import type { HandoffIndividualReport } from '@/lib/exam-analytics-handoff';
import type { SchoolAnalysisExamResult } from '@/lib/school-performance-analysis-data';
import { enrichExamResultsWithAttempts } from '@/lib/school-performance-analysis-data';

interface Exam {
  _id: string;
  title: string;
  description?: string;
  examType: string;
  classNumber?: string;
  assignedClasses?: string[];
  duration: number;
  totalQuestions: number;
  totalMarks: number;
  startDate: string;
  endDate: string;
  isActive: boolean;
  createdBy?: {
    fullName: string;
    email: string;
  };
  questions?: any[];
  createdAt?: string;
  updatedAt?: string;
}

interface ExamResult {
  _id: string;
  examId: string;
  examTitle: string;
  userId: {
    _id: string;
    fullName: string;
    email: string;
    classNumber: string;
  };
  percentage: number;
  obtainedMarks: number;
  totalMarks: number;
  totalQuestions?: number;
  correctAnswers?: number;
  wrongAnswers?: number;
  unattempted?: number;
  timeTaken?: number;
  attemptNumber?: number;
  subjectWiseScore?: Record<string, { correct?: number; total?: number; marks?: number }>;
  questionAnalytics?: Array<{
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
  }>;
  questionSnapshot?: Array<{
    _id?: string;
    questionText?: string;
    assertionText?: string;
    subject?: string;
    chapter?: string;
    questionType?: string;
    difficulty?: string;
  }>;
  completedAt: string;
}

const normalizeClassNumberForDisplay = (value: unknown): string => {
  const raw = String(value ?? '').trim();
  if (!raw) return 'N/A';
  return raw
    .replace(/^class\s*-\s*(\d+)/i, 'Class $1')
    .replace(/^-([0-9]+)([A-Za-z]?)$/, '$1$2');
};

const derivePercentageFromMarks = (obtainedMarks: unknown, totalMarks: unknown): number | null => {
  const obtained = Number(obtainedMarks);
  const total = Number(totalMarks);
  if (!Number.isFinite(obtained) || !Number.isFinite(total) || total <= 0) return null;
  return Math.round((obtained / total) * 10000) / 100;
};

const getResultPercentage = (result: ExamResult): number => {
  const fromMarks = derivePercentageFromMarks(result.obtainedMarks, result.totalMarks);
  if (fromMarks !== null) return fromMarks;
  const stored = Number(result.percentage);
  return Number.isFinite(stored) ? stored : 0;
};

const parsePerformerMarks = (marks: unknown): { obtained: number; total: number } | null => {
  const text = String(marks ?? '').trim();
  const match = text.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (!match) return null;
  return { obtained: Number(match[1]), total: Number(match[2]) };
};

const getPerformerPercentage = (performer: any): number => {
  const parsedMarks = parsePerformerMarks(performer?.marks);
  if (parsedMarks) {
    const fromMarks = derivePercentageFromMarks(parsedMarks.obtained, parsedMarks.total);
    if (fromMarks !== null) return fromMarks;
  }
  const stored = Number(performer?.percentage);
  return Number.isFinite(stored) ? stored : 0;
};

const formatTimeTaken = (seconds: unknown): string => {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
};

const getAttemptedCount = (result: ExamResult): number =>
  Math.max(0, Number(result.correctAnswers) || 0) + Math.max(0, Number(result.wrongAnswers) || 0);

const getQuestionAccuracy = (result: ExamResult): number => {
  const attempted = getAttemptedCount(result);
  if (attempted <= 0) return 0;
  return Math.round((Math.max(0, Number(result.correctAnswers) || 0) / attempted) * 100);
};

const formatCompletedAt = (value: string) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return { date: '—', time: '' };
  return {
    date: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
    time: d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
  };
};

const subjectWiseEntries = (result: ExamResult) => {
  const raw = result.subjectWiseScore;
  if (!raw || typeof raw !== 'object') return [];
  return Object.entries(raw).map(([subject, stats]) => ({
    subject,
    correct: Number(stats?.correct) || 0,
    total: Number(stats?.total) || 0,
    marks: Number(stats?.marks) || 0,
  }));
};

const marksBadgeClass = (pct: number) =>
  pct >= 70 ? 'bg-green-100 text-green-800 border-green-200' :
  pct >= 50 ? 'bg-amber-100 text-amber-800 border-amber-200' :
  'bg-red-100 text-red-800 border-red-200';

export default function ExamViewOnly() {
  const { toast } = useToast();
  const notify = (message: string, variant: 'default' | 'destructive' = 'default') => {
    toast({
      title: variant === 'destructive' ? 'Error' : 'Notice',
      description: message,
      variant,
    });
  };
  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedExam, setSelectedExam] = useState<(Exam & { viewClassNumber?: string }) | null>(null);
  const [examResults, setExamResults] = useState<ExamResult[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingResults, setIsLoadingResults] = useState(false);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(false);
  const [filters, setFilters] = useState({
    classNumber: '',
    subject: '',
    startDate: '',
    endDate: ''
  });
  const [listClassFilter, setListClassFilter] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [showAllPerformers, setShowAllPerformers] = useState(false);
  /** Per-student selected result id for the attempt dropdown. */
  const [selectedAttemptByStudent, setSelectedAttemptByStudent] = useState<Record<string, string>>(
    {},
  );
  const [attemptView, setAttemptView] = useState<string>('all');

  const enrichedExamResults = useMemo(
    () => enrichExamResultsWithAttempts(examResults),
    [examResults],
  );

  const availableAttemptNumbers = useMemo(
    () =>
      [...new Set(
        enrichedExamResults.map((result) =>
          Number(result.attemptNumber) >= 1 ? Math.round(Number(result.attemptNumber)) : 1,
        ),
      )].sort((a, b) => a - b),
    [enrichedExamResults],
  );

  /** One table row per student; attempts available via dropdown. */
  const studentAttemptRows = useMemo(() => {
    const byStudent = new Map<string, ExamResult[]>();
    for (const result of enrichedExamResults) {
      const sid = String(result.userId?._id || result.userId?.email || result._id);
      const list = byStudent.get(sid) || [];
      list.push(result);
      byStudent.set(sid, list);
    }

    const rows = Array.from(byStudent.entries()).flatMap(([studentId, attempts]) => {
      const sorted = [...attempts].sort(
        (a, b) =>
          (Number(a.attemptNumber) || 0) - (Number(b.attemptNumber) || 0) ||
          new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime(),
      );
      const preferredId = selectedAttemptByStudent[studentId];
      const selected = attemptView === 'all'
        ? sorted.find((r) => String(r._id) === preferredId) ||
          [...sorted].sort(
            (a, b) =>
              getResultPercentage(b) - getResultPercentage(a) ||
              (b.obtainedMarks || 0) - (a.obtainedMarks || 0),
          )[0] ||
          sorted[sorted.length - 1]
        : sorted.find(
            (result) =>
              Math.round(Number(result.attemptNumber) >= 1 ? Number(result.attemptNumber) : 1) ===
              Number(attemptView),
          );
      if (!selected) return [];
      return [{
        studentId,
        attempts: sorted,
        result: selected,
        marksPct: getResultPercentage(selected),
        questionAcc: getQuestionAccuracy(selected),
      }];
    });

    rows.sort(
      (a, b) => b.marksPct - a.marksPct || b.result.obtainedMarks - a.result.obtainedMarks,
    );
    return rows;
  }, [attemptView, enrichedExamResults, selectedAttemptByStudent]);

  const getExamSortTime = (exam: Exam) => {
    const candidates = [exam.updatedAt, exam.createdAt, exam.startDate, exam.endDate];
    for (const value of candidates) {
      if (!value) continue;
      const ts = new Date(value).getTime();
      if (!Number.isNaN(ts)) return ts;
    }
    return 0;
  };

  const filteredExams = useMemo(() => {
    const expanded = expandExamsByClass(exams);
    const list =
      listClassFilter === 'all'
        ? expanded
        : expanded.filter(
            (e) =>
              e.viewClassNumber === listClassFilter ||
              (!e.viewClassNumber && examIncludesClass(e, listClassFilter)),
          );
    list.sort((a, b) => {
      const timeDiff = getExamSortTime(b) - getExamSortTime(a);
      if (timeDiff !== 0) return timeDiff;
      const classDiff = String(a.viewClassNumber || '').localeCompare(
        String(b.viewClassNumber || ''),
        undefined,
        { numeric: true },
      );
      if (classDiff !== 0) return classDiff;
      return (a.title || '').localeCompare(b.title || '');
    });
    return list;
  }, [exams, listClassFilter]);

  useEffect(() => {
    fetchExams();
  }, []);

  const fetchExams = async () => {
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE_URL}/api/admin/exams/viewable`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setExams(data.data || []);
        }
      }
    } catch (error) {
      console.error('Failed to fetch exams:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchExamResults = async (examId: string) => {
    setIsLoadingResults(true);
    try {
      const token = getAuthToken();
      const queryParams = new URLSearchParams();
      queryParams.append('examId', String(examId));
      if (filters.classNumber) queryParams.append('classNumber', filters.classNumber);
      if (filters.subject) queryParams.append('subject', filters.subject);
      if (filters.startDate) queryParams.append('startDate', filters.startDate);
      if (filters.endDate) queryParams.append('endDate', filters.endDate);

      const response = await fetch(`${API_BASE_URL}/api/admin/exam-results?${queryParams}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setExamResults(enrichExamResultsWithAttempts(data.data || []));
          setSelectedAttemptByStudent({});
          setAttemptView('all');
        }
      }
    } catch (error) {
      console.error('Failed to fetch exam results:', error);
    } finally {
      setIsLoadingResults(false);
    }
  };

  const emptyAnalytics = () => ({
    totalStudents: 0,
    attemptedCount: 0,
    notAttemptedCount: 0,
    averageScore: '0.00',
    examClasses: [] as string[],
    topPerformers: [] as any[],
    rankedStudents: [] as any[],
    classPerformance: [] as any[],
  });

  const fetchAnalytics = async (examId: string) => {
    setIsLoadingAnalytics(true);
    try {
      const token = getAuthToken();
      const qs = new URLSearchParams();
      if (filters.classNumber) qs.set('classNumber', filters.classNumber);
      const suffix = qs.toString() ? `?${qs.toString()}` : '';
      const response = await fetch(
        `${API_BASE_URL}/api/admin/exams/${encodeURIComponent(examId)}/analytics${suffix}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const data = await response.json().catch(() => ({}));
      if (response.ok && data.success && data.data) {
        setAnalytics(data.data);
      } else {
        setAnalytics(emptyAnalytics());
        toast({
          title: 'Could not load exam analytics',
          description: data?.message || `Request failed (${response.status})`,
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
      setAnalytics(emptyAnalytics());
      toast({
        title: 'Could not load exam analytics',
        description: error instanceof Error ? error.message : 'Network error',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingAnalytics(false);
    }
  };

  const handleViewExam = async (exam: ExamClassCard<Exam>) => {
    const examId = String(exam._id ?? '');
    const focusClass = String(exam.viewClassNumber || '').trim();
    setSelectedExam({ ...exam, viewClassNumber: focusClass });
    setAnalytics(null);
    setShowAllPerformers(false);
    setShowFilters(false);
    const examClasses = getExamClassStrings(exam);
    const nextFilters = {
      // Always scope to the card's class when present so Class 6 never shows Class 7 results
      classNumber: focusClass || (examClasses.length === 1 ? examClasses[0] : ''),
      subject: '',
      startDate: '',
      endDate: '',
    };
    setFilters(nextFilters);
    // fetch with next filters — pass via temporary override
    setIsLoadingResults(true);
    setIsLoadingAnalytics(true);
    try {
      const token = getAuthToken();
      const resultQs = new URLSearchParams({ examId });
      if (nextFilters.classNumber) resultQs.set('classNumber', nextFilters.classNumber);
      const analQs = new URLSearchParams();
      if (nextFilters.classNumber) analQs.set('classNumber', nextFilters.classNumber);
      const analSuffix = analQs.toString() ? `?${analQs.toString()}` : '';

      const [resultsRes, analyticsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/admin/exam-results?${resultQs}`, {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          credentials: 'include',
        }),
        fetch(
          `${API_BASE_URL}/api/admin/exams/${encodeURIComponent(examId)}/analytics${analSuffix}`,
          {
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            credentials: 'include',
          }
        ),
      ]);
      const resultsData = await resultsRes.json().catch(() => ({}));
      const analyticsData = await analyticsRes.json().catch(() => ({}));
      if (resultsRes.ok && resultsData.success) {
        setExamResults(enrichExamResultsWithAttempts(resultsData.data || []));
        setSelectedAttemptByStudent({});
        setAttemptView('all');
      } else {
        setExamResults([]);
        setSelectedAttemptByStudent({});
        setAttemptView('all');
      }
      if (analyticsRes.ok && analyticsData.success && analyticsData.data) {
        setAnalytics(analyticsData.data);
      } else {
        setAnalytics(emptyAnalytics());
      }
    } catch (error) {
      console.error('Failed to load exam detail:', error);
      setExamResults([]);
      setAnalytics(emptyAnalytics());
    } finally {
      setIsLoadingResults(false);
      setIsLoadingAnalytics(false);
    }
  };

  const getExamTypeColor = (type: string) => {
    switch (type) {
      case 'mains': return 'bg-blue-100 text-blue-700';
      case 'advanced': return 'bg-purple-100 text-purple-700';
      case 'weekend': return 'bg-green-100 text-green-700';
      case 'practice': return 'bg-orange-100 text-orange-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getExamStatus = (exam: Exam) => {
    const now = new Date();
    const startDate = new Date(exam.startDate);
    const endDate = new Date(exam.endDate);

    if (now < startDate) return { status: 'Upcoming', color: 'bg-yellow-100 text-yellow-700' };
    if (now > endDate) return { status: 'Ended', color: 'bg-red-100 text-red-700' };
    return { status: 'Active', color: 'bg-green-100 text-green-700' };
  };

  const [isExporting, setIsExporting] = useState(false);
  const [studentReport, setStudentReport] = useState<HandoffIndividualReport | null>(null);
  const [selectedAttemptResult, setSelectedAttemptResult] =
    useState<SchoolAnalysisExamResult | null>(null);

  const handoffReport = useMemo(() => {
    if (!selectedExam || enrichedExamResults.length === 0) return null;
    return buildExamAnalyticsHandoffReport(selectedExam.title, enrichedExamResults);
  }, [selectedExam, enrichedExamResults]);

  const classQuestionStats = useMemo(
    () => buildClassQuestionBreakdown(enrichedExamResults),
    [enrichedExamResults],
  );

  const openStudentReport = (result: ExamResult) => {
    if (!handoffReport) return;
    const resultId = String(result._id || '').trim();
    const userId = String(result.userId?._id || '').trim();
    const name = String(result.userId?.fullName || '').trim().toLowerCase();
    const attemptLabel = `Attempt ${Math.round(Number(result.attemptNumber) >= 1 ? Number(result.attemptNumber) : 1)}`;

    const match =
      handoffReport.individuals.find((row) => row.student.resultId && row.student.resultId === resultId) ||
      handoffReport.individuals.find(
        (row) =>
          row.student.userId &&
          row.student.userId === userId &&
          row.student.attemptLabel === attemptLabel,
      ) ||
      handoffReport.individuals.find(
        (row) => row.student.name.trim().toLowerCase() === name,
      ) ||
      null;

    setStudentReport(match);
    setSelectedAttemptResult(result as SchoolAnalysisExamResult);
  };

  const exportToExcel = async () => {
    const exportResults = studentAttemptRows.map(({ result }) => result);
    if (!selectedExam || exportResults.length === 0) {
      notify('No results to export');
      return;
    }

    setIsExporting(true);
    try {
      // Export exactly the attempt view currently selected above the table.
      const ok = await downloadSchoolPerformanceAnalysisExcel(
        selectedExam.title,
        exportResults,
      );
      if (!ok) notify('No results to export');
    } catch (error) {
      console.error('Excel export failed:', error);
      toast({
        title: 'Export failed',
        description: error instanceof Error ? error.message : 'Could not generate Excel file',
        variant: 'destructive',
      });
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading) {
    return <div className="p-3 sm:p-4 lg:p-6">Loading exams...</div>;
  }

  if (selectedExam) {
    return (
      <div className="space-y-3 sm:space-y-4 lg:space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Button variant="outline" onClick={() => setSelectedExam(null)}>
              ← Back to Exams
            </Button>
            <h2 className="text-xl sm:text-2xl font-bold mt-4">
              {selectedExam.title}
              {selectedExam.viewClassNumber
                ? ` · Class ${normalizeClassNumberForDisplay(selectedExam.viewClassNumber)}`
                : ''}
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {(() => {
                const focus = selectedExam.viewClassNumber || filters.classNumber;
                const classes = focus
                  ? [focus]
                  : analytics?.examClasses?.length > 0
                    ? analytics.examClasses
                    : getExamClassStrings(selectedExam);
                const classLabel =
                  classes.length > 0
                    ? classes.map((c: string) => normalizeClassNumberForDisplay(c)).join(', ')
                    : 'All';
                return `Class ${classLabel} · ${analytics?.attemptedCount ?? 0} of ${analytics?.totalStudents ?? 0} students attempted`;
              })()}
            </p>
          </div>
        </div>

        {/* Filters (collapsed by default) */}
        <Card>
          <CardHeader className="cursor-pointer" onClick={() => setShowFilters((v) => !v)}>
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center">
                <Filter className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
                Filters (optional)
              </span>
              <span className="text-xs font-normal text-gray-500">
                {showFilters ? 'Hide' : 'Show'}
              </span>
            </CardTitle>
          </CardHeader>
          {showFilters ? (
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label>Class</Label>
                <Select
                  value={filters.classNumber || 'all'}
                  onValueChange={(v) =>
                    setFilters({ ...filters, classNumber: v === 'all' ? '' : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All classes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All classes</SelectItem>
                    {CLASS_FILTER_OPTIONS.map((c) => (
                      <SelectItem key={c} value={c}>
                        Class {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Subject</Label>
                <Input
                  placeholder="Subject"
                  value={filters.subject}
                  onChange={(e) => setFilters({ ...filters, subject: e.target.value })}
                />
              </div>
              <div>
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={filters.startDate}
                  onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                />
              </div>
              <div>
                <Label>End Date</Label>
                <Input
                  type="date"
                  value={filters.endDate}
                  onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                />
              </div>
            </div>
            <Button
              className="mt-4"
              onClick={() => {
                const id = String(selectedExam._id ?? '');
                void Promise.all([fetchExamResults(id), fetchAnalytics(id)]);
              }}
            >
              Apply Filters
            </Button>
          </CardContent>
          ) : null}
        </Card>

        {/* Analytics */}
        {isLoadingAnalytics && !analytics ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="p-3 sm:p-4 lg:p-6 animate-pulse">
                  <div className="h-4 w-24 bg-gray-200 rounded mb-3" />
                  <div className="h-8 w-16 bg-gray-200 rounded" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : analytics ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-3 sm:p-4 lg:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs sm:text-sm text-gray-600">
                      {analytics?.examClasses?.length === 1
                        ? `Class ${normalizeClassNumberForDisplay(analytics.examClasses[0])} students`
                        : 'Eligible students'}
                    </p>
                    <p className="text-xl sm:text-2xl font-bold">{analytics.totalStudents}</p>
                  </div>
                  <Users className="h-6 w-6 sm:h-7 sm:w-7 lg:h-8 lg:w-8 text-blue-500" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 sm:p-4 lg:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs sm:text-sm text-gray-600">Attempted</p>
                    <p className="text-xl sm:text-2xl font-bold">{analytics.attemptedCount}</p>
                  </div>
                  <TrendingUp className="h-6 w-6 sm:h-7 sm:w-7 lg:h-8 lg:w-8 text-green-500" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 sm:p-4 lg:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs sm:text-sm text-gray-600">Not Attempted</p>
                    <p className="text-xl sm:text-2xl font-bold">{analytics.notAttemptedCount}</p>
                  </div>
                  <Clock className="h-6 w-6 sm:h-7 sm:w-7 lg:h-8 lg:w-8 text-orange-500" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 sm:p-4 lg:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs sm:text-sm text-gray-600">Average Score</p>
                    <p className="text-xl sm:text-2xl font-bold">{analytics.averageScore}%</p>
                  </div>
                  <BarChart3 className="h-6 w-6 sm:h-7 sm:w-7 lg:h-8 lg:w-8 text-purple-500" />
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}

        {/* Student ranking — full list with Show more */}
        {(() => {
          const allRanked =
            Array.isArray(analytics?.rankedStudents) && analytics.rankedStudents.length > 0
              ? analytics.rankedStudents
              : analytics?.topPerformers || [];
          if (!allRanked.length) return null;
          const visible = showAllPerformers ? allRanked : allRanked.slice(0, 10);
          return (
          <Card>
            <CardHeader>
              <CardTitle>Student ranking ({allRanked.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {visible.map((performer: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                    <div className="flex items-center space-x-4">
                      <div className={`w-6 h-6 sm:w-7 sm:h-7 lg:w-8 lg:h-8 rounded-full flex items-center justify-center font-bold ${
                        idx === 0 ? 'bg-yellow-500 text-white' :
                        idx === 1 ? 'bg-gray-400 text-white' :
                        idx === 2 ? 'bg-orange-500 text-white' :
                        'bg-gray-200 text-gray-700'
                      }`}>
                        {performer.rank}
                      </div>
                      <div>
                        <p className="font-medium">{performer.studentName}</p>
                        <p className="text-xs sm:text-sm text-gray-600">
                          {performer.studentEmail} • Class {normalizeClassNumberForDisplay(performer.classNumber)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-green-600">{getPerformerPercentage(performer)}%</p>
                      <p className="text-xs sm:text-sm text-gray-600">{performer.marks}</p>
                    </div>
                  </div>
                ))}
              </div>
              {allRanked.length > 10 ? (
                <Button
                  variant="outline"
                  className="mt-4 w-full"
                  onClick={() => setShowAllPerformers((v) => !v)}
                >
                  {showAllPerformers
                    ? 'Show less'
                    : `Show more (${allRanked.length - 10} more)`}
                </Button>
              ) : null}
            </CardContent>
          </Card>
          );
        })()}

        {handoffReport ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Executive analytics</CardTitle>
              <p className="text-xs text-slate-500 font-normal">
                Class accuracy {Math.round(handoffReport.classAccuracy * 1000) / 10}% · precision{' '}
                {Math.round(handoffReport.classPrecision * 1000) / 10}% · avg{' '}
                {handoffReport.classAvgTimeSec.toFixed(1)}s/Q · {handoffReport.studentsAtLeast50}/
                {handoffReport.studentCount} students ≥50%
              </p>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {handoffReport.subjectRows.slice(0, 4).map((subj) => (
                <div key={subj.subjectKey} className="rounded-xl border bg-slate-50/80 px-3 py-2">
                  <p className="text-sm font-semibold text-slate-900">{subj.label}</p>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Accuracy {(subj.accuracy * 100).toFixed(1)}% · precision{' '}
                    {(subj.precision * 100).toFixed(1)}% · left {(subj.leftRate * 100).toFixed(1)}%
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">{subj.keyReading}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}

        <AdminExamQuestionBreakdown
          questions={classQuestionStats}
          examTitle={selectedExam?.title}
        />

        {/* All Results */}
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="break-words">Attempt details</span>
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                  <div className="flex items-center gap-2">
                    <Label className="shrink-0 text-xs font-medium text-slate-600">Show</Label>
                    <Select
                      value={attemptView}
                      onValueChange={(value) => {
                        setAttemptView(value);
                        setSelectedAttemptByStudent({});
                      }}
                    >
                      <SelectTrigger className="h-9 w-full bg-white text-xs sm:w-[170px]">
                        <SelectValue placeholder="Select attempt" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Best attempt / student</SelectItem>
                        {availableAttemptNumbers.map((attempt) => (
                          <SelectItem key={attempt} value={String(attempt)}>
                            Attempt {attempt}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full shrink-0 sm:w-auto"
                    disabled={isExporting || studentAttemptRows.length === 0}
                    onClick={() => void exportToExcel()}
                  >
                    <Download className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
                    {isExporting ? 'Exporting…' : 'Export analytics Excel'}
                  </Button>
                </div>
            </CardTitle>
            {handoffReport ? (
              <p className="text-xs text-slate-500 font-normal mt-1">
                Use <span className="font-semibold text-slate-700">Show</span> to compare one
                attempt across students. The Excel export follows the same selection.
              </p>
            ) : null}
          </CardHeader>
          <CardContent>
            {isLoadingResults ? (
              <div>Loading results...</div>
            ) : studentAttemptRows.length > 0 ? (
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full min-w-[960px] text-sm">
                  <thead className="bg-slate-50">
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-3 font-semibold text-slate-700">#</th>
                      <th className="text-left py-3 px-3 font-semibold text-slate-700">Student</th>
                      <th className="text-left py-3 px-3 font-semibold text-slate-700">Class</th>
                      <th className="text-left py-3 px-3 font-semibold text-slate-700">Questions</th>
                      <th className="text-left py-3 px-3 font-semibold text-slate-700">Marks</th>
                      <th className="text-left py-3 px-3 font-semibold text-slate-700">Accuracy</th>
                      <th className="text-left py-3 px-3 font-semibold text-slate-700">Time</th>
                      <th className="text-left py-3 px-3 font-semibold text-slate-700">Completed</th>
                      <th className="text-left py-3 px-3 font-semibold text-slate-700">Report</th>
                    </tr>
                  </thead>
                  <tbody>
                    {studentAttemptRows.map(({ studentId, attempts, result, marksPct, questionAcc }, idx) => {
                      const completed = formatCompletedAt(result.completedAt);
                      const subjects = subjectWiseEntries(result);
                      const totalQ =
                        Number(result.totalQuestions) ||
                        Math.max(
                          0,
                          (Number(result.correctAnswers) || 0) +
                            (Number(result.wrongAnswers) || 0) +
                            (Number(result.unattempted) || 0)
                        );
                      return (
                        <tr key={studentId} className="border-b border-gray-100 hover:bg-slate-50/80 align-top">
                          <td className="py-3 px-3">
                            <span
                              className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                                idx === 0
                                  ? 'bg-amber-100 text-amber-800'
                                  : idx === 1
                                    ? 'bg-slate-200 text-slate-700'
                                    : idx === 2
                                      ? 'bg-orange-100 text-orange-800'
                                      : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {idx + 1}
                            </span>
                          </td>
                          <td className="py-3 px-3 min-w-[180px]">
                            <p className="font-semibold text-slate-900">{result.userId.fullName}</p>
                            <p className="text-xs text-slate-500 mt-0.5">{result.userId.email}</p>
                            {subjects.length > 0 ? (
                              <p className="text-mini text-slate-500 mt-1.5 leading-snug">
                                {subjects
                                  .map(
                                    (s) =>
                                      `${s.subject}: ${s.marks}m (${s.correct}/${s.total})`
                                  )
                                  .join(' · ')}
                              </p>
                            ) : null}
                            {attemptView === 'all' && attempts.length > 1 ? (
                              <p className="text-mini text-indigo-600 mt-1 font-medium">
                                {attempts.length} attempts recorded
                              </p>
                            ) : null}
                          </td>
                          <td className="py-3 px-3 text-slate-800">
                            {normalizeClassNumberForDisplay(result.userId.classNumber)}
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex flex-wrap gap-1.5 text-xs">
                              <span className="rounded-md bg-green-50 px-2 py-0.5 font-medium text-green-700 border border-green-100">
                                ✓ {result.correctAnswers ?? 0}
                              </span>
                              <span className="rounded-md bg-orange-50 px-2 py-0.5 font-medium text-orange-700 border border-orange-100">
                                ✗ {result.wrongAnswers ?? 0}
                              </span>
                              <span className="rounded-md bg-blue-50 px-2 py-0.5 font-medium text-blue-700 border border-blue-100">
                                ○ {result.unattempted ?? 0}
                              </span>
                            </div>
                            <p className="text-mini text-slate-500 mt-1">
                              {totalQ} questions · {getAttemptedCount(result)} attempted
                            </p>
                          </td>
                          <td className="py-3 px-3">
                            <p className="text-base font-bold text-slate-900">
                              {result.obtainedMarks}
                              <span className="text-slate-400 font-medium"> / {result.totalMarks}</span>
                            </p>
                            <p className="text-mini text-slate-500">marks obtained</p>
                          </td>
                          <td className="py-3 px-3">
                            <div className="space-y-1">
                              <Badge className={`border ${marksBadgeClass(marksPct)}`}>
                                {marksPct}% marks
                              </Badge>
                              <p className="text-mini text-slate-500">
                                {questionAcc}% on attempted ({result.correctAnswers ?? 0}/
                                {getAttemptedCount(result) || '—'})
                              </p>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-slate-700 whitespace-nowrap">
                            {formatTimeTaken(result.timeTaken)}
                          </td>
                          <td className="py-3 px-3 text-slate-600 whitespace-nowrap">
                            <p className="font-medium text-slate-800">{completed.date}</p>
                            <p className="text-xs text-slate-500">{completed.time}</p>
                          </td>
                          <td className="py-3 px-3">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="whitespace-nowrap"
                              onClick={() => openStudentReport(result)}
                            >
                              View analysis
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-4 sm:py-6 lg:py-8 text-gray-500">
                No results found for this exam.
              </div>
            )}
          </CardContent>
        </Card>

        <StudentExamHandoffModal
          open={Boolean(studentReport)}
          onOpenChange={(open) => {
            if (!open) {
              setStudentReport(null);
              setSelectedAttemptResult(null);
            }
          }}
          individual={studentReport}
          examTitle={selectedExam?.title}
          attemptResult={selectedAttemptResult}
          classQuestionStats={classQuestionStats}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4 lg:space-y-5">
      <AdminPageHero
        title="Exams"
        highlight="(View Only)"
        subtitle="View exams Super Admin assigned to your school. Each class is shown as its own card."
        icon={<Eye className="h-10 w-10 lg:h-11 lg:w-11" />}
      />

      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <p className="text-sm font-semibold text-slate-700">
          {filteredExams.length} exam{filteredExams.length === 1 ? '' : 's'} shown
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Label className="text-xs sm:text-sm text-gray-600 whitespace-nowrap">Class</Label>
          <Select value={listClassFilter} onValueChange={setListClassFilter}>
            <SelectTrigger className="w-[200px] bg-white">
              <SelectValue placeholder="All classes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All classes</SelectItem>
              {CLASS_FILTER_OPTIONS.map((c) => (
                <SelectItem key={c} value={c}>
                  Class {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {exams.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Eye className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">No exams available. Exams are created by Super Admin.</p>
          </CardContent>
        </Card>
      ) : filteredExams.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Filter className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">
              No exams for this class. Choose another class or &quot;All classes&quot;.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:p-4 lg:p-6">
          {filteredExams.map((exam, index) => {
            const status = getExamStatus(exam);
            const classLabels = exam.viewClassNumber
              ? [exam.viewClassNumber]
              : getExamClassStrings(exam);
            // Cycle through orange, sky blue, and teal gradients
            const colorSchemes = [
              { bg: 'from-orange-300 to-orange-400', text: 'text-gray-900', badge: 'bg-orange-500/20 text-gray-900' },
              { bg: 'from-sky-300 to-sky-400', text: 'text-gray-900', badge: 'bg-sky-500/20 text-gray-900' },
              { bg: 'from-teal-400 to-teal-500', text: 'text-gray-900', badge: 'bg-teal-500/20 text-gray-900' }
            ];
            const colorScheme = colorSchemes[index % 3];
            
            return (
              <Card
                key={exam.cardKey}
                className={`bg-gradient-to-br ${colorScheme.bg} border-0 hover:shadow-xl transition-all duration-300 h-full flex flex-col`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base sm:text-lg mb-2 text-gray-900 break-words leading-tight">
                        {exam.title}
                      </CardTitle>
                      <div className="flex flex-wrap items-center gap-2 mt-2 min-h-[2.25rem]">
                        <Badge className={`${colorScheme.badge} inline-flex items-center justify-center border-0 leading-none`}>
                          {exam.examType.toUpperCase()}
                        </Badge>
                        <Badge className={
                          status.status === 'Ended' 
                            ? 'inline-flex items-center justify-center bg-red-600 text-white border-2 border-white/50 shadow-lg font-semibold leading-none'
                            : status.status === 'Active'
                            ? 'inline-flex items-center justify-center bg-teal-600 text-white border-2 border-white/50 shadow-lg font-semibold leading-none'
                            : 'inline-flex items-center justify-center bg-yellow-600 text-white border-2 border-white/50 shadow-lg font-semibold leading-none'
                        }>
                          {status.status}
                        </Badge>
                        {classLabels.map((cl) => (
                          <Badge key={cl} className="inline-flex items-center justify-center bg-white/90 text-gray-900 border-0 font-medium whitespace-nowrap leading-none">
                            Class {cl}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                  {exam.description && (
                    <p className={`text-xs sm:text-sm text-white/90 mt-2 line-clamp-2`}>{exam.description}</p>
                  )}
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-4 pt-0">
                  <div className="space-y-2 text-xs sm:text-sm text-white">
                    <div className="flex items-center">
                      <Calendar className="h-3 w-3 sm:h-4 sm:w-4 mr-2 shrink-0 text-white" />
                      <span className="leading-none text-white">{exam.duration} minutes</span>
                    </div>
                    <div className="flex items-center">
                      <BookOpen className="h-3 w-3 sm:h-4 sm:w-4 mr-2 shrink-0 text-white" />
                      <span className="leading-none text-white">{exam.totalQuestions} questions • {exam.totalMarks} marks</span>
                    </div>
                    <div className="flex items-center">
                      <Calendar className="h-3 w-3 sm:h-4 sm:w-4 mr-2 shrink-0 text-white" />
                      <span className="text-xs leading-none text-white">
                        {new Date(exam.startDate).toLocaleDateString()} - {new Date(exam.endDate).toLocaleDateString()}
                      </span>
                    </div>
                    {exam.createdBy && (
                      <div className="border-t border-white/30 pt-2 text-xs leading-none text-white/90">
                        Created by: {exam.createdBy.fullName}
                      </div>
                    )}
                  </div>
                  <Button 
                    className="mt-auto inline-flex h-12 min-h-12 w-full items-center justify-center gap-2 py-0 leading-none bg-white/90 text-gray-900 border-white/30 hover:bg-white hover:text-gray-900" 
                    onClick={() => handleViewExam(exam)}
                  >
                    <Eye className="h-4 w-4 shrink-0" />
                    View Results & Analytics
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AdminFooterBanner
        title="Great preparation leads to great performance!"
        subtitle="Keep learning. Keep growing. Keep shining."
        icon={<Trophy className="h-6 w-6" />}
      />
    </div>
  );
}

