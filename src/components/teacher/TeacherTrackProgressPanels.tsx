import { useState, useMemo, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Target,
  TrendingUp,
  Clock,
  MessageSquare,
  Lightbulb,
  ThumbsUp,
  AlertCircle,
  ClipboardCheck,
  RefreshCw,
  Eye,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

export interface TrackProgressStudent {
  id: string;
  name?: string;
  fullName?: string;
  email?: string;
  classNumber?: string;
  assignedClass?: { classNumber?: string; section?: string };
  performance?: {
    totalExams?: number;
    averagePercentage?: number | null;
    overallProgress?: number;
    learningProgress?: number;
    dailyAverageWatchTime?: number;
    recentExamTitle?: string | null;
    recentPercentage?: number | null;
  };
  lastLogin?: string | null;
  isActive?: boolean;
}

export interface TrackProgressRemark {
  _id: string;
  remark: string;
  isPositive?: boolean;
  createdAt: string;
  studentId?: { _id?: string; fullName?: string; email?: string } | string;
  subject?: { name?: string } | null;
  teacherId?: { fullName?: string };
}

interface TeacherTrackProgressPanelsProps {
  students: TrackProgressStudent[];
  remarks: TrackProgressRemark[];
  aiInsights: string;
  isLoadingAi: boolean;
  onRefreshAi: () => void;
  onFetchStudentInsights: (student: TrackProgressStudent) => Promise<string>;
  getStudentHomeworkStats?: (studentId: string) => { assigned: number; submitted: number };
  /** Class filter from dashboard ("all" or class number) for exam question analytics. */
  classNumberFilter?: string;
  /** "Filter by student" selection; the class-wide exam paper review is hidden for one student. */
  studentFilter?: string;
  /** Open View dialog for this student id (e.g. from a parent action). */
  openStudentId?: string | null;
  onOpenStudentConsumed?: () => void;
}

function studentDisplayName(s: TrackProgressStudent) {
  return s.name || s.fullName || s.email || 'Student';
}

function normalizeMongoId(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    const obj = value as { _id?: unknown; id?: unknown };
    if (obj._id != null) return String(obj._id);
    if (obj.id != null) return String(obj.id);
  }
  return String(value);
}

function studentIdStr(s: TrackProgressStudent) {
  return normalizeMongoId((s as { id?: string; _id?: string }).id ?? (s as { _id?: string })._id);
}

function remarkStudentId(remark: TrackProgressRemark): string {
  return normalizeMongoId(remark.studentId);
}

function classLabel(s: TrackProgressStudent) {
  const n = s.classNumber || s.assignedClass?.classNumber;
  const sec = s.assignedClass?.section;
  if (!n) return '—';
  return sec ? `Class ${n}-${sec}` : `Class ${n}`;
}

export function TeacherTrackProgressPanels({
  students,
  remarks,
  aiInsights,
  isLoadingAi,
  onRefreshAi,
  onFetchStudentInsights,
  getStudentHomeworkStats,
  classNumberFilter = 'all',
  studentFilter = 'all',
  openStudentId = null,
  onOpenStudentConsumed,
}: TeacherTrackProgressPanelsProps) {
  const [detailStudent, setDetailStudent] = useState<TrackProgressStudent | null>(null);
  const [improvementText, setImprovementText] = useState('');
  const [isLoadingImprovement, setIsLoadingImprovement] = useState(false);

  const studentIds = new Set(students.map(studentIdStr).filter(Boolean));
  const filteredRemarks =
    studentIds.size > 0
      ? remarks.filter((r) => {
          const sid = remarkStudentId(r);
          return sid && studentIds.has(sid);
        })
      : remarks;

  const remarksByStudentId = useMemo(() => {
    const map = new Map<string, TrackProgressRemark[]>();
    filteredRemarks.forEach((r) => {
      const sid = remarkStudentId(r);
      if (!sid) return;
      if (!map.has(sid)) map.set(sid, []);
      map.get(sid)!.push(r);
    });
    return map;
  }, [filteredRemarks]);

  const openStudentView = useCallback(
    async (student: TrackProgressStudent) => {
      setDetailStudent(student);
      setImprovementText('');
      setIsLoadingImprovement(true);
      try {
        const text = await onFetchStudentInsights(student);
        setImprovementText(text);
      } catch {
        setImprovementText('Could not load improvement analysis for this student.');
      } finally {
        setIsLoadingImprovement(false);
      }
    },
    [onFetchStudentInsights]
  );

  useEffect(() => {
    if (!openStudentId) return;
    const match = students.find((s) => studentIdStr(s) === String(openStudentId));
    if (!match) return;
    void openStudentView(match);
    onOpenStudentConsumed?.();
  }, [openStudentId, students, openStudentView, onOpenStudentConsumed]);

  const refreshImprovement = useCallback(async () => {
    if (!detailStudent) return;
    setIsLoadingImprovement(true);
    try {
      const text = await onFetchStudentInsights(detailStudent);
      setImprovementText(text);
    } finally {
      setIsLoadingImprovement(false);
    }
  }, [detailStudent, onFetchStudentInsights]);

  const detailRemarks = detailStudent
    ? remarksByStudentId.get(studentIdStr(detailStudent)) || []
    : [];

  const withExams = students.filter((s) => (s.performance?.totalExams || 0) > 0);
  const examScores = withExams
    .map((s) => s.performance?.averagePercentage)
    .filter((p): p is number => p != null);
  const avgExam =
    examScores.length > 0 ? examScores.reduce((a, b) => a + b, 0) / examScores.length : 0;

  const avgOverall =
    students.length > 0
      ? students.reduce((sum, s) => sum + (s.performance?.overallProgress ?? 0), 0) / students.length
      : 0;

  const withUsage = students.filter((s) => (s.performance?.dailyAverageWatchTime ?? 0) > 0);
  const avgWatch =
    withUsage.length > 0
      ? withUsage.reduce((sum, s) => sum + (s.performance?.dailyAverageWatchTime ?? 0), 0) /
        withUsage.length
      : 0;

  const impPerf = detailStudent?.performance || {};
  const impHw = detailStudent
    ? getStudentHomeworkStats?.(studentIdStr(detailStudent)) || {
        assigned: 0,
        submitted: 0,
      }
    : { assigned: 0, submitted: 0 };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Compact class summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white/60 backdrop-blur-xl rounded-2xl p-4 shadow-sm border border-white/20">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-blue-400 to-blue-600 rounded-xl">
              <Target className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{avgExam.toFixed(1)}%</p>
              <p className="text-xs text-gray-600">Avg exam score</p>
            </div>
          </div>
        </div>
        <div className="bg-white/60 backdrop-blur-xl rounded-2xl p-4 shadow-sm border border-white/20">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{avgOverall.toFixed(1)}%</p>
              <p className="text-xs text-gray-600">Avg overall progress</p>
            </div>
          </div>
        </div>
        <div className="bg-white/60 backdrop-blur-xl rounded-2xl p-4 shadow-sm border border-white/20">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-purple-400 to-pink-400 rounded-xl">
              <Clock className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{avgWatch.toFixed(1)} min</p>
              <p className="text-xs text-gray-600">Avg daily usage</p>
            </div>
          </div>
        </div>
      </div>


      {/* Single student list — View opens full detail */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white/60 backdrop-blur-xl rounded-2xl p-4 sm:p-5 shadow-sm border border-white/20"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-gray-900 flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-600" />
              Students
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Open View for exams, usage, remarks, and areas for improvement
            </p>
          </div>
          {students.length > 1 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-lg"
              onClick={onRefreshAi}
              disabled={isLoadingAi}
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1 ${isLoadingAi ? 'animate-spin' : ''}`} />
              Refresh class tips
            </Button>
          ) : null}
        </div>

        {aiInsights && students.length > 1 ? (
          <p className="text-xs text-gray-700 mb-4 leading-relaxed rounded-xl bg-amber-50/80 border border-amber-100 px-3 py-2">
            <span className="font-semibold text-amber-900">Class tip: </span>
            {aiInsights}
          </p>
        ) : null}

        {students.length === 0 ? (
          <p className="text-sm text-gray-500 py-8 text-center">No students match the current filters.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {students.map((s) => {
              const sid = studentIdStr(s);
              const perf = s.performance || {};
              const overall = perf.overallProgress ?? 0;
              const examPct = perf.averagePercentage;
              const remarkCount = remarksByStudentId.get(sid)?.length || 0;
              return (
                <li
                  key={sid}
                  className="flex flex-col sm:flex-row sm:items-center gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900 text-sm truncate">
                      {studentDisplayName(s)}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {classLabel(s)}
                      {examPct != null && (perf.totalExams || 0) > 0
                        ? ` · ${examPct.toFixed(0)}% exam avg`
                        : ' · No exams yet'}
                      {` · ${overall.toFixed(0)}% progress`}
                      {remarkCount > 0 ? ` · ${remarkCount} remark${remarkCount !== 1 ? 's' : ''}` : ''}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 shrink-0 rounded-lg border-indigo-200 bg-white text-xs font-semibold text-indigo-700 hover:bg-indigo-50 self-start sm:self-center"
                    onClick={() => openStudentView(s)}
                  >
                    <Eye className="mr-1 h-3.5 w-3.5" aria-hidden />
                    View
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </motion.section>

      {/* Unified student detail */}
      <Dialog
        open={!!detailStudent}
        onOpenChange={(open) => {
          if (!open) {
            setDetailStudent(null);
            setImprovementText('');
          }
        }}
      >
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {detailStudent ? studentDisplayName(detailStudent) : 'Student'}
            </DialogTitle>
            <DialogDescription>
              {detailStudent ? classLabel(detailStudent) : ''} — exams, usage, remarks &amp; improvement
            </DialogDescription>
          </DialogHeader>

          {detailStudent && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-blue-50 p-2.5 border border-blue-100">
                  <p className="text-gray-500 flex items-center gap-1">
                    <ClipboardCheck className="w-3 h-3" /> Exams
                  </p>
                  <p className="font-semibold text-gray-900 mt-0.5">
                    {impPerf.totalExams || 0} taken
                    {impPerf.averagePercentage != null
                      ? ` · ${impPerf.averagePercentage.toFixed(1)}% avg`
                      : ''}
                  </p>
                  {impPerf.recentExamTitle ? (
                    <p className="text-gray-500 mt-1 truncate">
                      Recent: {impPerf.recentExamTitle} (
                      {(impPerf.recentPercentage ?? 0).toFixed(0)}%)
                    </p>
                  ) : null}
                </div>
                <div className="rounded-lg bg-emerald-50 p-2.5 border border-emerald-100">
                  <p className="text-gray-500 flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" /> Progress
                  </p>
                  <p className="font-semibold text-gray-900 mt-0.5">
                    {(impPerf.overallProgress ?? 0).toFixed(1)}% overall
                  </p>
                  {(impPerf.learningProgress ?? 0) > 0 ? (
                    <p className="text-gray-500 mt-1">
                      Content: {(impPerf.learningProgress ?? 0).toFixed(1)}%
                    </p>
                  ) : null}
                </div>
                <div className="rounded-lg bg-purple-50 p-2.5 border border-purple-100">
                  <p className="text-gray-500 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Usage
                  </p>
                  <p className="font-semibold text-gray-900 mt-0.5">
                    {(impPerf.dailyAverageWatchTime ?? 0).toFixed(1)} min/day
                  </p>
                </div>
                <div className="rounded-lg bg-amber-50 p-2.5 border border-amber-100">
                  <p className="text-gray-500">Homework</p>
                  <p className="font-semibold text-gray-900 mt-0.5">
                    {impHw.submitted}/{impHw.assigned} submitted
                  </p>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-600">Overall progress</span>
                  <span className="font-medium text-emerald-700">
                    {(impPerf.overallProgress ?? 0).toFixed(1)}%
                  </span>
                </div>
                <Progress value={Math.min(impPerf.overallProgress ?? 0, 100)} className="h-2" />
              </div>

              <div>
                <h4 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-1.5">
                  <MessageSquare className="w-4 h-4 text-sky-600" />
                  Remarks
                </h4>
                {detailRemarks.length === 0 ? (
                  <p className="text-sm text-gray-500">No remarks yet for this student.</p>
                ) : (
                  <ul className="space-y-2">
                    {detailRemarks.map((remark) => (
                      <li
                        key={remark._id}
                        className={`p-2.5 rounded-lg border-l-4 text-sm ${
                          remark.isPositive
                            ? 'bg-green-50 border-green-500'
                            : 'bg-orange-50 border-orange-500'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {remark.isPositive ? (
                              <ThumbsUp className="w-3.5 h-3.5 text-green-600 shrink-0" />
                            ) : (
                              <AlertCircle className="w-3.5 h-3.5 text-orange-600 shrink-0" />
                            )}
                            {remark.subject?.name && (
                              <Badge variant="outline" className="text-[10px]">
                                {remark.subject.name}
                              </Badge>
                            )}
                          </div>
                          <span className="text-[10px] text-gray-500 shrink-0">
                            {new Date(remark.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-gray-700 text-xs leading-relaxed">{remark.remark}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-xl bg-amber-50/80 border border-amber-200 p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-sm font-semibold text-amber-900 flex items-center gap-1">
                    <Lightbulb className="w-4 h-4" />
                    Areas for improvement
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs border-amber-300"
                    onClick={refreshImprovement}
                    disabled={isLoadingImprovement}
                  >
                    <RefreshCw
                      className={`w-3 h-3 mr-1 ${isLoadingImprovement ? 'animate-spin' : ''}`}
                    />
                    Refresh
                  </Button>
                </div>
                {isLoadingImprovement ? (
                  <p className="text-sm text-gray-600 italic">Preparing summary…</p>
                ) : (
                  <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
                    {improvementText}
                  </p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
