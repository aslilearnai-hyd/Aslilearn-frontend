import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import Navigation from "@/components/navigation";
import {
  filterContentsBySchoolProgram,
  resolveIsAsliPrepExclusive,
} from "@/lib/school-program";
import { isVidyaEnabledForUser } from "@/lib/vidya-access";
import {
  buildTodaysTasksContentList,
  capTodaysTasksForDay,
  getContentSubjectId,
  getVideoDisplayTitle,
  isHomeworkContentType,
  isVideoContentType,
  nextChapterCompletedDates,
  type ChapterCompletedDates,
} from "@/lib/video-chapter-schedule";
import { DashboardNavCard } from '@/components/student/DashboardNavCard';
import { WeeklyDigestCard } from "@/components/weekly-digest-card";
import { 
  CheckCircle, 
  TrendingUp, 
  Play, 
  FileText, 
  Zap,
  Calendar,
  Download,
  Users,
  Backpack,
  Star,
  Clock,
  Award,
  Target,
  BookOpen,
  Video,
  BookOpen as BookIcon,
  MessageSquare,
  ThumbsUp,
  AlertCircle,
  Gamepad2,
  Calculator,
  Atom,
  FlaskConical,
  Microscope,
  FileText as FileTextIcon,
  Video as VideoIcon,
  Image as ImageIcon,
  File,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  ClipboardList,
  Headphones,
  GraduationCap,
  Sparkles,
  BookMarked,
  Brain,
  HelpCircle,
  FileText as FileTextIcon2,
  Key,
  ClipboardList as ClipboardListIcon,
  Layout,
  Target as TargetIcon,
  AlertTriangle,
  Lightbulb,
  TrendingDown,
  ArrowRightCircle,
  BookCheck,
  Globe,
  Flame,
  Monitor,
  Lock,
  CalendarDays,
  type LucideIcon,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { useIsMobile } from "@/hooks/use-mobile";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import YouTubePlayer from '@/components/youtube-player';
import DriveViewer from '@/components/drive-viewer';
import VideoModal from '@/components/video-modal';
import { API_BASE_URL, apiFetch, isPdfPreviewContent } from '@/lib/api-config';
import PdfPreviewPanel from '@/components/shared/PdfPreviewPanel';
import { buildExamCalendarEntries, buildSchoolEventCalendarEntries } from '@/lib/exam-calendar-entries';
import { buildTimetableCalendarEntries } from '@/lib/timetable-calendar-entries';
import { useTimetableEntries } from '@/hooks/useTimetable';
import { format, startOfMonth, endOfMonth, startOfWeek, addDays, parseISO } from 'date-fns';
import { getUser as getStoredUser, getStudentDisplayName, getAuthToken } from '@/lib/auth-utils';
import { isIndividualAccount } from '@/lib/individual-signup';
import { showTrialUpgrade } from '@/lib/individual-subscription';
import { TrialUpgradeBanner } from '@/components/b2c/TrialUpgradeBanner';
import StudentShell from '@/components/layout/StudentShell';
import StatCard from '@/components/dashboard/StatCard';
import { fetchAuthUser, peekCachedAuthUser } from '@/lib/auth-session';
import VidyaAIFloatingAssistant from '@/components/student/VidyaAIFloatingAssistant';
import { fetchDashboardBootstrap } from '@/lib/dashboard-bootstrap';
import { consecutiveDailyStreak, streakCheer } from '@/lib/quiz-play-stats';
import {
  getTodayStudyTime,
  getWeeklyStudyTime,
  updateStudyTime,
  startSession,
  endSession,
  getWeeklyStudyData,
  getLocalIsoDateKey,
} from '@/utils/studyTimeTracker';
import '@/utils/debugStudyTime'; // Load debug helper
import {
  readDashboardStatsCache,
  writeDashboardStatsCache,
} from '@/utils/dashboard-stats-cache';
import AdaptiveRecommendations from "@/components/dashboard/AdaptiveRecommendations";

// Mock user ID - in a real app, this would come from authentication
const MOCK_USER_ID = "user-1";
const initialStoredUser = getStoredUser();
const initialDashboardStatsCache = readDashboardStatsCache();

const MAX_STUDY_MINUTES_PER_DAY = 12 * 60;
const MAX_STUDY_MINUTES_PER_WEEK = MAX_STUDY_MINUTES_PER_DAY * 7;

function capStudyMinutes(minutes: number, max: number) {
  return Math.min(max, Math.max(0, Math.round(minutes)));
}

/** Backend week total already includes today â€” replace today's slice with live capped today. */
function mergeDisplayedStudyTime(
  baseline: {
    useBackend: boolean;
    backendToday: number;
    backendWeek: number;
    localTodayAtLoad: number;
  },
  localTimes: { today: number; thisWeek: number },
) {
  if (!baseline.useBackend) {
    return {
      today: capStudyMinutes(localTimes.today, MAX_STUDY_MINUTES_PER_DAY),
      thisWeek: capStudyMinutes(localTimes.thisWeek, MAX_STUDY_MINUTES_PER_WEEK),
    };
  }
  const deltaToday = Math.max(0, localTimes.today - baseline.localTodayAtLoad);
  const mergedToday = capStudyMinutes(
    Math.max(baseline.backendToday + deltaToday, localTimes.today),
    MAX_STUDY_MINUTES_PER_DAY,
  );
  const weekWithoutToday = Math.max(0, baseline.backendWeek - baseline.backendToday);
  const thisWeek = capStudyMinutes(
    Math.max(weekWithoutToday + mergedToday, localTimes.thisWeek),
    MAX_STUDY_MINUTES_PER_WEEK,
  );
  return { today: mergedToday, thisWeek };
}

function collectCompletedContentIds(): Set<string> {
  const completedContentIds = new Set<string>();
  try {
    Object.keys(localStorage).forEach((key) => {
      if (!key.startsWith('completed_content_')) return;
      const completed = JSON.parse(localStorage.getItem(key) || '[]');
      if (Array.isArray(completed)) {
        completed.forEach((id: string) => completedContentIds.add(String(id)));
      }
    });
    collectScheduleCompletedIdsOnly().forEach((id) => completedContentIds.add(id));
  } catch {
    // ignore
  }
  return completedContentIds;
}

/** Today's Tasks checkbox only — do not use subject library completion for non-video. */
function collectScheduleCompletedIdsOnly(): Set<string> {
  const ids = new Set<string>();
  try {
    const storedSchedule = localStorage.getItem('completed_schedule_items');
    if (!storedSchedule) return ids;
    const data = JSON.parse(storedSchedule);
    const today = new Date().toDateString();
    if (data.date === today && Array.isArray(data.completedIds)) {
      data.completedIds.forEach((id: string) => ids.add(String(id)));
    }
  } catch {
    // ignore
  }
  return ids;
}

function buildScheduleCompletionStats(allContent: any[], allQuizzes: any[]) {
  const completedContentIds = collectCompletedContentIds();
  const trackableContent = allContent.filter(
    (content: any) => String(content.type || '').toLowerCase() !== 'homework',
  );
  const completedContent = trackableContent.filter((content: any) =>
    completedContentIds.has(String(content._id || content.id)),
  ).length;
  const completedQuizzes = allQuizzes.filter(
    (quiz: any) => quiz.hasAttempted || quiz.completedAt,
  ).length;
  const totalContent = trackableContent.length;
  const totalQuizzes = allQuizzes.length;
  const total = totalContent + totalQuizzes;
  const completed = completedContent + completedQuizzes;
  const completionPercent = total > 0 ? Math.round((completed / total) * 100) : 0;
  return {
    totalContent,
    completedContent,
    totalQuizzes,
    completedQuizzes,
    total,
    completed,
    completionPercent,
  };
}

function getSubjectProgressIconMeta(name: string): {
  Icon: LucideIcon;
  iconClass: string;
  bgClass: string;
} {
  const subjectName = (name || '').toLowerCase();
  if (subjectName.includes('math') || subjectName.includes('mathematics')) {
    return { Icon: Calculator, iconClass: 'text-orange-600', bgClass: 'bg-orange-50' };
  }
  if (subjectName.includes('physics')) {
    return { Icon: Atom, iconClass: 'text-blue-600', bgClass: 'bg-blue-50' };
  }
  if (subjectName.includes('chem')) {
    return { Icon: FlaskConical, iconClass: 'text-teal-600', bgClass: 'bg-teal-50' };
  }
  if (subjectName.includes('bio') || subjectName.includes('science')) {
    return { Icon: Microscope, iconClass: 'text-emerald-600', bgClass: 'bg-emerald-50' };
  }
  if (subjectName.includes('english')) {
    return { Icon: BookIcon, iconClass: 'text-indigo-600', bgClass: 'bg-indigo-50' };
  }
  if (subjectName.includes('hindi') || subjectName.includes('language')) {
    return { Icon: BookOpen, iconClass: 'text-violet-600', bgClass: 'bg-violet-50' };
  }
  if (subjectName.includes('social') || subjectName.includes('history') || subjectName.includes('geo')) {
    return { Icon: Globe, iconClass: 'text-amber-700', bgClass: 'bg-amber-50' };
  }
  if (subjectName.includes('computer') || subjectName.includes('cs')) {
    return { Icon: Monitor, iconClass: 'text-sky-600', bgClass: 'bg-sky-50' };
  }
  return { Icon: BookOpen, iconClass: 'text-slate-600', bgClass: 'bg-slate-50' };
}

function SubjectProgressIcon({ name }: { name: string }) {
  const { Icon, iconClass, bgClass } = getSubjectProgressIconMeta(name);
  return (
    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${bgClass}`}>
      <Icon className={`h-4 w-4 ${iconClass}`} strokeWidth={2} aria-hidden />
    </div>
  );
}

function buildSessionTimeBaselineFromCache() {
  if (!initialDashboardStatsCache) {
    return {
      useBackend: false,
      backendToday: 0,
      backendWeek: 0,
      localTodayAtLoad: 0,
      localWeekAtLoad: 0,
    };
  }
  const local = updateStudyTime();
  return {
    useBackend: true,
    backendToday: initialDashboardStatsCache.backendToday,
    backendWeek: initialDashboardStatsCache.backendWeek,
    localTodayAtLoad: local.today,
    localWeekAtLoad: local.thisWeek,
  };
}

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const isMobile = useIsMobile();
  const [user, setUser] = useState<any>(() => initialStoredUser || null);
  const [isLoadingUser, setIsLoadingUser] = useState(() => !initialStoredUser);
  const [videos, setVideos] = useState<any[]>([]);
  const [isLoadingContent, setIsLoadingContent] = useState(true);
  const [selectedVideo, setSelectedVideo] = useState<any>(null);
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  const [remarks, setRemarks] = useState<any[]>([]);
  const [isLoadingRemarks, setIsLoadingRemarks] = useState(false);
  const [homeworkSubmissions, setHomeworkSubmissions] = useState<any[]>([]);
  const [isLoadingSubmissions, setIsLoadingSubmissions] = useState(false);
  const [isHomeworkSubmitOpen, setIsHomeworkSubmitOpen] = useState(false);
  const [selectedHomeworkForSubmit, setSelectedHomeworkForSubmit] = useState<any | null>(null);
  const [homeworkSubmissionLink, setHomeworkSubmissionLink] = useState('');
  const [homeworkSubmissionFile, setHomeworkSubmissionFile] = useState<File | null>(null);
  const [homeworkSubmissionDescription, setHomeworkSubmissionDescription] = useState('');
  const [isSubmittingHomework, setIsSubmittingHomework] = useState(false);
  const [homeworkSubmitError, setHomeworkSubmitError] = useState<string>('');
  const [riskAnalysisReports, setRiskAnalysisReports] = useState<any[]>([]);
  const [isLoadingReports, setIsLoadingReports] = useState(false);
  const [studyStreak, setStudyStreak] = useState<{ count: number; message?: string } | null>(null);
  const bootstrapAppliedRef = useRef(false);

  // Preview videos fallback (bootstrap supplies these in the same request)
  useEffect(() => {
    const timer = window.setTimeout(async () => {
      if (bootstrapAppliedRef.current) return;
      try {
        const videosRes = await fetch(`${API_BASE_URL}/api/student/videos`, {
          headers: {
            Authorization: `Bearer ${getAuthToken()}`,
            'Content-Type': 'application/json',
          },
        });

        if (videosRes.ok) {
          const videosData = await videosRes.json();
          setVideos((videosData.data || videosData).slice(0, 3));
        }
      } catch (error) {
        console.error('Failed to fetch content:', error);
        setVideos([]);
      } finally {
        setIsLoadingContent(false);
      }
    }, 500);
    return () => window.clearTimeout(timer);
  }, []);

  // Fetch real dashboard data
  // exam/quiz aggregates for learning progress live in subjectProgress / overallProgress
  const [exams, setExams] = useState<any[]>([]);
  const [examResults, setExamResults] = useState<any[]>([]);
  const [subjectProgress, setSubjectProgress] = useState<any[]>([]);
  const [overallProgress, setOverallProgress] = useState(0);
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(true);
  const [subjects, setSubjects] = useState<any[]>([]);
  
  // Save overall progress to database
  const saveOverallProgressToDB = async (progress: number) => {
    try {
      const token = getAuthToken();
      
      const response = await fetch(`${API_BASE_URL}/api/student/overall-progress`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          overallProgress: progress
        })
      });

      if (response.ok) {
        console.log('âœ… Overall progress saved to database:', progress);
      } else {
        console.error('Failed to save overall progress to database');
      }
    } catch (error) {
      console.error('Error saving overall progress:', error);
    }
  };
  
  // Load overall progress from database
  const loadOverallProgressFromDB = async () => {
    try {
      const authUser = await fetchAuthUser();
      const u = authUser as { overallProgress?: number } | null;
      if (u && u.overallProgress !== undefined && u.overallProgress !== null) {
        setOverallProgress(u.overallProgress);
      }
    } catch (error) {
      console.error('Error loading overall progress:', error);
    }
  };
  const [allContent, setAllContent] = useState<any[]>([]);

  // Single bootstrap: auth + subjects + content counts + quizzes (replaces 15+ separate calls)
  useEffect(() => {
    let cancelled = false;

    const applyBootstrap = async () => {
      const token = getAuthToken();

      const cached = peekCachedAuthUser();
      if (cached && !cancelled) {
        setUser(cached);
        setIsLoadingUser(false);
      }

      try {
        const [authUser, bootstrap] = await Promise.all([
          fetchAuthUser(),
          fetchDashboardBootstrap(),
        ]);
        if (cancelled) return;

        if (authUser) setUser(authUser);
        setIsLoadingUser(false);

        if (!bootstrap) return;

        bootstrapAppliedRef.current = true;

        if (bootstrap.user) {
          // Bootstrap intentionally contains a compact user payload. Merge it
          // with /auth/me so B2C/account-access flags are never discarded.
          setUser((current: any) => ({
            ...(current || {}),
            ...(authUser || {}),
            ...bootstrap.user,
          }));
          const op = (bootstrap.user as { overallProgress?: number }).overallProgress;
          if (op !== undefined && op !== null) setOverallProgress(Number(op));
        }

        setSubjects(bootstrap.subjects || []);

        const preview = Array.isArray(bootstrap.previewVideos) ? bootstrap.previewVideos : [];
        if (preview.length) {
          setVideos(preview.slice(0, 3));
        }
        setIsLoadingContent(false);

        const filtered = filterContentsBySchoolProgram(
          bootstrap.contents || [],
          resolveIsAsliPrepExclusive(bootstrap.user),
        );
        setAllContent(filtered);

        if (bootstrap.studyStreak) setStudyStreak(bootstrap.studyStreak);
      } catch (error) {
        console.error('Dashboard bootstrap failed:', error);
        if (!cancelled) setIsLoadingUser(false);
      }
    };

    applyBootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  const adaptiveVideosList = useMemo(
    () => subjects.flatMap((s: any) => s.videos || []),
    [subjects]
  );
  const assignedHomework = useMemo(() => {
    return allContent
      .filter((content: any) => String(content.type || '').toLowerCase() === 'homework')
      .sort((a: any, b: any) => {
        const aTime = a.deadline ? new Date(a.deadline).getTime() : 0;
        const bTime = b.deadline ? new Date(b.deadline).getTime() : 0;
        return aTime - bTime;
      });
  }, [allContent]);
  const homeworkSubmissionByHomeworkId = useMemo(() => {
    const map = new Map<string, any>();
    homeworkSubmissions.forEach((submission: any) => {
      const homeworkId =
        typeof submission.homeworkId === 'object'
          ? submission.homeworkId?._id
          : submission.homeworkId;
      if (homeworkId) {
        map.set(String(homeworkId), submission);
      }
    });
    return map;
  }, [homeworkSubmissions]);
  const [studyTimeToday, setStudyTimeToday] = useState<number>(() => {
    const cached = initialDashboardStatsCache?.studyTimeToday ?? 0;
    return Math.max(cached >= MAX_STUDY_MINUTES_PER_DAY ? 0 : cached, getTodayStudyTime());
  });
  const [studyTimeThisWeek, setStudyTimeThisWeek] = useState<number>(() => {
    const cached = initialDashboardStatsCache?.studyTimeThisWeek ?? 0;
    const cachedToday = initialDashboardStatsCache?.studyTimeToday ?? 0;
    return Math.max(cachedToday >= MAX_STUDY_MINUTES_PER_DAY ? 0 : cached, getWeeklyStudyTime());
  });
  const [weeklyStudyData, setWeeklyStudyData] = useState<{ [key: string]: number }>({}); // Daily study time in minutes
  const sessionTimeBaselineRef = useRef(buildSessionTimeBaselineFromCache());
  const dashboardStatsCacheRef = useRef(initialDashboardStatsCache);
  const [incompleteContent, setIncompleteContent] = useState<any[]>([]);
  const [scheduleAllContent, setScheduleAllContent] = useState<any[]>([]);
  const [videoChapterProgressBySubject, setVideoChapterProgressBySubject] = useState<
    Record<string, ChapterCompletedDates>
  >({});
  const [incompleteQuizzes, setIncompleteQuizzes] = useState<any[]>([]);
  const [studentQuizzes, setStudentQuizzes] = useState<any[]>([]);
  const [dailyQuizStatus, setDailyQuizStatus] = useState<{
    today: {
      dateKey: string;
      completed: boolean;
      score: number | null;
      correctCount: number;
      totalQuestions: number;
    };
    history: Array<{
      dateKey: string;
      score: number | null;
      correctCount: number;
      totalQuestions: number;
      completedAt?: string;
    }>;
    nextUnlockDateKey: string;
    lockedUntilTomorrow: boolean;
  } | null>(null);
  const [scheduleCompletionStats, setScheduleCompletionStats] = useState({
    total: 0,
    completed: 0,
    completionPercent: 0,
    totalContent: 0,
    completedContent: 0,
    totalQuizzes: 0,
    completedQuizzes: 0,
  });
  const [isLoadingSchedule, setIsLoadingSchedule] = useState(false);
  const [selectedScheduleItem, setSelectedScheduleItem] = useState<any | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [completedScheduleIds, setCompletedScheduleIds] = useState<Set<string>>(new Set());

  const dailyTasks = useMemo(
    () => capTodaysTasksForDay(incompleteQuizzes, incompleteContent),
    [incompleteQuizzes, incompleteContent]
  );

  useEffect(() => {
    const liveTotal = dailyTasks.content.length + dailyTasks.quizzes.length;
    if (liveTotal === 0) return;
    const completedTodos =
      dailyTasks.content.filter((c: any) => completedScheduleIds.has(c._id)).length +
      dailyTasks.quizzes.filter((q: any) => completedScheduleIds.has(q._id)).length;
    const patch = { totalTodos: liveTotal, completedTodos };
    writeDashboardStatsCache(patch);
    dashboardStatsCacheRef.current = {
      ...(dashboardStatsCacheRef.current || {
        studyTimeToday: 0,
        studyTimeThisWeek: 0,
        backendToday: 0,
        backendWeek: 0,
      }),
      ...patch,
    };
  }, [dailyTasks, completedScheduleIds]);

  const [calendarMonth, setCalendarMonth] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<Date>(new Date());
  const [openCalendarDayKey, setOpenCalendarDayKey] = useState<string | null>(null);
  const [calendarJumpDate, setCalendarJumpDate] = useState<string>(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  });

  const calendarMonthStart = format(startOfMonth(calendarMonth), 'yyyy-MM-dd');
  const calendarMonthEnd = format(endOfMonth(calendarMonth), 'yyyy-MM-dd');
  const { data: monthTimetableEntries = [] } = useTimetableEntries({
    startDate: calendarMonthStart,
    endDate: calendarMonthEnd,
  });
  const calendarMonthKey = format(calendarMonth, 'yyyy-MM');
  const [schoolCalendarEvents, setSchoolCalendarEvents] = useState<any[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = getAuthToken();
        const response = await fetch(
          `${API_BASE_URL}/api/student/calendar/events?month=${calendarMonthKey}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          }
        );
        if (!response.ok || cancelled) return;
        const payload = await response.json();
        if (!cancelled) {
          setSchoolCalendarEvents(Array.isArray(payload?.data) ? payload.data : []);
        }
      } catch {
        if (!cancelled) setSchoolCalendarEvents([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [calendarMonthKey]);

  const schoolDisplayName = useMemo(
    () => String(user?.assignedAdmin?.schoolName || user?.schoolName || '').trim(),
    [user?.assignedAdmin?.schoolName, user?.schoolName],
  );
  const vidyaEnabled = isVidyaEnabledForUser(user);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const token = getAuthToken();

        // Fetch exam results to calculate learning progress
        const [examsRes, resultsRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/student/exams`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          }),
          fetch(`${API_BASE_URL}/api/student/exam-results`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          }),
        ]);

        let examsData = [];
        if (examsRes.ok) {
          const examsJson = await examsRes.json();
          examsData = examsJson.data || [];
          setExams(examsData);
        }

        let resultsData = [];
        if (resultsRes.ok) {
          const resultsJson = await resultsRes.json();
          resultsData = resultsJson.data || [];
          setExamResults(resultsData);
        }

        // Fetch actual subject names from API FIRST to map exam subject keys to real names
        let subjectNameMap = new Map<string, string>(); // Maps subject keys (maths, physics, etc.) to actual names
        let subjectsList: any[] = [];
        try {
          const token = getAuthToken();
          if (token) {
            const subjectsResponse = await fetch(`${API_BASE_URL}/api/student/subjects`, {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              }
            });
            
            if (subjectsResponse.ok) {
              const subjectsData = await subjectsResponse.json();
              subjectsList = subjectsData.subjects || subjectsData.data || [];
              
              // Create a map from subject keys to actual names
              // Map common exam subject keys to actual subject names
              subjectsList.forEach((subject: any) => {
                const subjectName = subject.name || '';
                const subjectNameLower = subjectName.toLowerCase();
                
                // Map common variations
                if (subjectNameLower.includes('math') || subjectNameLower.includes('mathematics')) {
                  subjectNameMap.set('maths', subjectName);
                  subjectNameMap.set('mathematics', subjectName);
                }
                if (subjectNameLower.includes('physics')) {
                  subjectNameMap.set('physics', subjectName);
                }
                if (subjectNameLower.includes('chemistry')) {
                  subjectNameMap.set('chemistry', subjectName);
                }
                
                // Also map by exact name match (case-insensitive)
                subjectNameMap.set(subjectNameLower, subjectName);
              });
            }
          }
        } catch (error) {
          console.error('Failed to fetch subjects for name mapping:', error);
        }

        // Calculate subject-wise progress from exam results
        const subjectMap = new Map<string, { total: number; correct: number; exams: number }>();
        
        resultsData.forEach((result: any) => {
          if (result.subjectWiseScore && typeof result.subjectWiseScore === 'object') {
            Object.entries(result.subjectWiseScore).forEach(([subject, score]: [string, any]) => {
              if (!subjectMap.has(subject)) {
                subjectMap.set(subject, { total: 0, correct: 0, exams: 0 });
              }
              const subj = subjectMap.get(subject)!;
              subj.total += score.total || 0;
              subj.correct += score.correct || 0;
              subj.exams += 1;
            });
          }
        });

        // Convert subject map to progress array with actual subject names
        const progressArray = Array.from(subjectMap.entries()).map(([key, data]) => {
          const progress = data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0;
          // Get actual subject name from map, or capitalize the key as fallback
          const actualName = subjectNameMap.get(key.toLowerCase()) || 
                           subjectNameMap.get(key) || 
                           key.charAt(0).toUpperCase() + key.slice(1);
          const colors = [
            'bg-orange-100 text-orange-600',
            'bg-sky-100 text-sky-600',
            'bg-teal-100 text-teal-600',
            'bg-orange-100 text-orange-600',
            'bg-sky-100 text-sky-600'
          ];
          return {
            id: key.toLowerCase(),
            name: actualName,
            progress: progress,
            trend: progress >= 70 ? 'up' as const : progress >= 50 ? 'neutral' as const : 'down' as const,
            currentTopic: `${actualName} - Recent Exams`,
            color: colors[Math.min(subjectMap.size - 1, Math.floor(Math.random() * colors.length))]
          };
        });

        // Fetch subject progress from learning paths (localStorage)
        // Get all subjects assigned to the student
        let learningPathProgress: Map<string, number> = new Map();
        try {
          const token = getAuthToken();
          if (token && subjectsList.length > 0) {
            // Get progress for each subject from localStorage and content count
            for (const subject of subjectsList) {
              const subjectId = subject._id || subject.id;
              try {
                const stored = localStorage.getItem(`completed_content_${subjectId}`);
                if (stored) {
                  const completedIds = JSON.parse(stored);
                  
                  // Use contentCount from bootstrap/subjects API (avoids N per-subject fetches)
                  try {
                    const totalContent =
                      Number(subject.contentCount) > 0
                        ? Number(subject.contentCount)
                        : 0;

                    if (totalContent > 0) {
                      const progress = Math.round((completedIds.length / totalContent) * 100);
                      learningPathProgress.set(subjectId, progress);
                    } else if (completedIds.length > 0) {
                      learningPathProgress.set(subjectId, 0);
                    }
                  } catch (contentError) {
                    console.error('Error fetching content for subject:', subjectId, contentError);
                    // Fallback: use completed count as rough estimate
                    if (completedIds.length > 0) {
                      const progress = Math.min(100, (completedIds.length * 10));
                      learningPathProgress.set(subjectId, progress);
                    }
                  }
                }
              } catch (e) {
                console.error('Error reading progress for subject:', subjectId, e);
              }
            }
          }
        } catch (error) {
          console.error('Failed to fetch learning path progress:', error);
        }

        // Merge exam progress with learning path progress
        // If a subject has both, take the average or use the higher value
        const mergedProgress = new Map<string, { progress: number; name: string; color: string; currentTopic: string }>();
        
        // Add exam-based progress
        progressArray.forEach(subj => {
          mergedProgress.set(subj.id, {
            progress: subj.progress,
            name: subj.name,
            color: subj.color,
            currentTopic: subj.currentTopic
          });
        });

        // Merge with learning path progress
        learningPathProgress.forEach((progress, subjectId) => {
          // Find the subject name from the subjects list
          const subject = subjectsList.find(s => (s._id || s.id) === subjectId);
          const subjectName = subject?.name || 'Subject';
          
          // Try to match by subject ID or find existing entry
          let existing = null;
          // Check if this subject matches any exam-based subject by name
          Array.from(mergedProgress.entries()).forEach(([key, value]) => {
            if (value.name === subjectName) {
              existing = value;
              // Update the existing entry with averaged progress
              mergedProgress.set(key, {
                ...value,
                progress: Math.round((value.progress + progress) / 2)
              });
            }
          });
          
          // If we found a match, skip adding new entry
          if (existing) {
            return;
          }
          
          // If no match found, add as new entry
          if (!existing) {
            const colors = [
              'bg-orange-100 text-orange-600',
              'bg-green-100 text-green-600',
              'bg-orange-100 text-orange-600',
              'bg-orange-100 text-orange-600',
              'bg-orange-100 text-orange-600'
            ];
            // Use subject ID as key, but display actual name
            mergedProgress.set(subjectId, {
              progress: progress,
              name: subjectName,
              color: colors[Math.floor(Math.random() * colors.length)],
              currentTopic: `${subjectName} - Learning Path`
            });
          }
        });

        // Convert to array (include id from map key for React keys)
        const finalProgressArray = Array.from(mergedProgress.entries()).map(([id, value]) => ({ ...value, id }));

        // Calculate overall progress as average of all subject progress
        const calculatedOverallProgress = finalProgressArray.length > 0
          ? Math.round(finalProgressArray.reduce((sum, s) => sum + s.progress, 0) / finalProgressArray.length)
          : 0;

        // If no subject progress from exams, set default empty
        if (finalProgressArray.length === 0) {
          setSubjectProgress([]);
          // Try to load saved overall progress from database
          loadOverallProgressFromDB();
        } else {
          setSubjectProgress(finalProgressArray);
          setOverallProgress(calculatedOverallProgress);
          
          // Save overall progress to database
          saveOverallProgressToDB(calculatedOverallProgress);
        }

      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      } finally {
        setIsLoadingDashboard(false);
      }
    };

    fetchDashboardData();
  }, []);

  // Exams can be published while a student's dashboard is already open.
  // Keep this small list fresh without re-running the heavier progress bootstrap.
  useEffect(() => {
    let cancelled = false;

    const refreshExams = async () => {
      try {
        const response = await apiFetch('/api/student/exams');
        if (!response.ok || cancelled) return;
        const payload = await response.json();
        if (!cancelled) setExams(Array.isArray(payload?.data) ? payload.data : []);
      } catch (error) {
        console.warn('Could not refresh dashboard exams:', error);
      }
    };

    const refreshWhenVisible = () => {
      if (!document.hidden) void refreshExams();
    };

    const interval = window.setInterval(refreshWhenVisible, 60_000);
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, []);

  // Fetch library content for homework/todos (fallback if bootstrap missed)
  useEffect(() => {
    const timer = window.setTimeout(async () => {
      if (bootstrapAppliedRef.current) return;
      try {
        const token = getAuthToken();

        const response = await fetch(`${API_BASE_URL}/api/student/asli-prep-content`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) return;

        const data = await response.json();
        const fetchedContent = data.data || data || [];

        const homeworkResponse = await fetch(`${API_BASE_URL}/api/student/asli-prep-content?type=Homework`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        let homeworkContent: any[] = [];
        if (homeworkResponse.ok) {
          const homeworkData = await homeworkResponse.json();
          homeworkContent = homeworkData.data || homeworkData || [];
        }

        const contentMap = new Map();
        fetchedContent.forEach((content: any) => {
          contentMap.set(content._id || content.id, content);
        });
        homeworkContent.forEach((content: any) => {
          if (!contentMap.has(content._id || content.id)) {
            contentMap.set(content._id || content.id, content);
          }
        });

        setAllContent(
          filterContentsBySchoolProgram(
            Array.from(contentMap.values()),
            resolveIsAsliPrepExclusive(user),
          ),
        );
      } catch (error) {
        console.error('Failed to fetch library content:', error);
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [user?.isAsliPrepExclusive, user?.assignedAdmin?.isAsliPrepExclusive]);

  // Track study time using timestamp module (ignores background time)
  useEffect(() => {
    let cancelled = false;
    let trackingStarted = false;
    let displayInterval: ReturnType<typeof setInterval> | undefined;
    let saveSessionInterval: ReturnType<typeof setInterval> | undefined;

    const getDisplayedStudyTime = () => {
      const times = updateStudyTime();
      return mergeDisplayedStudyTime(sessionTimeBaselineRef.current, times);
    };

    const persistStudyTimeCache = () => {
      const { today, thisWeek } = getDisplayedStudyTime();
      const baseline = sessionTimeBaselineRef.current;
      writeDashboardStatsCache({
        studyTimeToday: today,
        studyTimeThisWeek: thisWeek,
        backendToday: baseline.useBackend ? baseline.backendToday : today,
        backendWeek: baseline.useBackend ? baseline.backendWeek : thisWeek,
      });
      dashboardStatsCacheRef.current = {
        ...(dashboardStatsCacheRef.current || {
          totalTodos: 0,
          completedTodos: 0,
          backendToday: 0,
          backendWeek: 0,
        }),
        studyTimeToday: today,
        studyTimeThisWeek: thisWeek,
        backendToday: baseline.useBackend ? baseline.backendToday : today,
        backendWeek: baseline.useBackend ? baseline.backendWeek : thisWeek,
      };
    };

    const applyStudyTimeFromTracker = () => {
      if (cancelled) return;
      const { today, thisWeek } = getDisplayedStudyTime();
      setStudyTimeToday(today);
      setStudyTimeThisWeek(thisWeek);
      if (!sessionTimeBaselineRef.current.useBackend) {
        setWeeklyStudyData(getWeeklyStudyData());
      }
    };

    const startTracking = () => {
      if (trackingStarted || cancelled) return;
      trackingStarted = true;
      startSession();
      applyStudyTimeFromTracker();
      persistStudyTimeCache();

      saveSessionInterval = setInterval(async () => {
        try {
          const { today } = getDisplayedStudyTime();
          const dateKey = getLocalIsoDateKey();
          const token = getAuthToken();
          if (token && today > 0) {
            await fetch(`${API_BASE_URL}/api/student/session-time`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                date: dateKey,
                totalMinutes: today,
              }),
            }).catch((err) => console.error('Failed to save session time:', err));
          }
        } catch (error) {
          console.error('Error saving session time:', error);
        }
      }, 5 * 60 * 1000);

      displayInterval = setInterval(() => {
        try {
          applyStudyTimeFromTracker();
        } catch (error) {
          console.error('Error updating study time:', error);
        }
      }, 1000);
    };

    const refreshSessionTime = async () => {
      try {
        const token = getAuthToken();
        if (token) {
          const response = await fetch(`${API_BASE_URL}/api/student/session-time`, {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          });

          if (response.ok) {
            const data = await response.json();
            if (data.success && data.data) {
              const localAtLoad = updateStudyTime();
              const localTodayKey = getLocalIsoDateKey();
              const weekly = data.data.weeklyData || {};
              const todayFromWeekly = Number(weekly[localTodayKey]) || 0;
              const cachedStats = dashboardStatsCacheRef.current;
              const backendToday = Math.max(
                Number(data.data.today) || 0,
                todayFromWeekly,
                Number(cachedStats?.backendToday) || 0,
                Number(cachedStats?.studyTimeToday) || 0,
                localAtLoad.today,
              );
              const backendWeek = Math.max(
                Number(data.data.thisWeek) || 0,
                Number(cachedStats?.backendWeek) || 0,
                Number(cachedStats?.studyTimeThisWeek) || 0,
                localAtLoad.thisWeek,
                backendToday,
              );
              sessionTimeBaselineRef.current = {
                useBackend: true,
                backendToday,
                backendWeek,
                localTodayAtLoad: localAtLoad.today,
                localWeekAtLoad: localAtLoad.thisWeek,
              };

              // If the browser has a newer cumulative value than the API, repair
              // today's server row immediately instead of waiting for the 5-minute sync.
              const apiToday = Math.max(Number(data.data.today) || 0, todayFromWeekly);
              if (backendToday > apiToday) {
                void fetch(`${API_BASE_URL}/api/student/session-time`, {
                  method: 'POST',
                  headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({ date: localTodayKey, totalMinutes: backendToday }),
                  keepalive: true,
                }).catch(() => null);
              }

              if (data.data.weeklyData) {
                const convertedWeeklyData: { [key: string]: number } = {};
                Object.keys(data.data.weeklyData).forEach((dateKey) => {
                  const [y, m, d] = dateKey.split('-').map(Number);
                  const date = new Date(y, m - 1, d);
                  convertedWeeklyData[date.toDateString()] = data.data.weeklyData[dateKey];
                });
                if (!cancelled) setWeeklyStudyData(convertedWeeklyData);
              }
            }
          }
        }
      } catch (error) {
        console.error('Failed to fetch session time from backend:', error);
      }

      if (!sessionTimeBaselineRef.current.useBackend) {
        sessionTimeBaselineRef.current = {
          useBackend: false,
          backendToday: 0,
          backendWeek: 0,
          localTodayAtLoad: 0,
          localWeekAtLoad: 0,
        };
      }

      if (!cancelled) {
        startTracking();
        applyStudyTimeFromTracker();
        persistStudyTimeCache();
      }
    };

    if (sessionTimeBaselineRef.current.useBackend) {
      startTracking();
    }
    void refreshSessionTime();

    // Handle page visibility changes
    const handleVisibilityChange = () => {
      if (document.hidden) {
        endSession();
      } else {
        startSession();
      }
      applyStudyTimeFromTracker();
    };

    const handleFocus = () => {
      if (!document.hidden) {
        startSession();
        applyStudyTimeFromTracker();
      }
    };

    const handleBlur = () => {
      endSession();
      applyStudyTimeFromTracker();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);

    // Cleanup on unmount
    return () => {
      cancelled = true;
      if (displayInterval) clearInterval(displayInterval);
      if (saveSessionInterval) clearInterval(saveSessionInterval);
      endSession(); // End session when component unmounts
      
      // Save final session time before unmounting
      const finalTimes = trackingStarted ? getDisplayedStudyTime() : updateStudyTime();
      const dateKey = getLocalIsoDateKey();
      const token = getAuthToken();
      if (token && finalTimes.today > 0) {
        fetch(`${API_BASE_URL}/api/student/session-time`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            date: dateKey,
            totalMinutes: finalTimes.today,
          }),
        }).catch(err => console.error('Failed to save final session time:', err));
      }
      
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);
  
  // Fetch incomplete content and quizzes for To-Dos
  useEffect(() => {
    const fetchScheduleItems = async () => {
      try {
        setIsLoadingSchedule(true);
        const token = getAuthToken();

        // Fetch all content
        const contentResponse = await fetch(`${API_BASE_URL}/api/student/asli-prep-content`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          }
        });

        // Fetch learning-path quizzes + IQ Rank / Daily quizzes (Quiz menu)
        const [quizzesResponse, iqQuizzesResponse, dailyStatusResponse] = await Promise.all([
          fetch(`${API_BASE_URL}/api/student/quizzes`, {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          }),
          fetch(`${API_BASE_URL}/api/student/iq-rank-quizzes`, {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          }),
          fetch(`${API_BASE_URL}/api/student/daily-quiz-status`, {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          }),
        ]);

        if (dailyStatusResponse.ok) {
          const dailyJson = await dailyStatusResponse.json().catch(() => null);
          if (dailyJson?.data) setDailyQuizStatus(dailyJson.data);
          else setDailyQuizStatus(null);
        } else {
          setDailyQuizStatus(null);
        }

        let allContent: any[] = [];
        let allQuizzes: any[] = [];

        if (contentResponse.ok) {
          const contentData = await contentResponse.json();
          const rawContent = contentData.data || contentData || [];
          
          // Process content to ensure fileUrl is properly formatted
          allContent = rawContent.map((content: any) => {
            // Ensure fileUrl is a full URL if it's a relative path
            if (content.fileUrl) {
              let fileUrl = content.fileUrl;
              // If it's not already a full URL (http/https), construct it
              if (!fileUrl.startsWith('http') && !fileUrl.startsWith('//')) {
                if (fileUrl.startsWith('/')) {
                  fileUrl = `${API_BASE_URL}${fileUrl}`;
                } else {
                  fileUrl = `${API_BASE_URL}/${fileUrl}`;
                }
              }
              return { ...content, fileUrl };
            }
            return content;
          });
        }

        if (quizzesResponse.ok) {
          const quizzesData = await quizzesResponse.json();
          const learning = quizzesData.data || quizzesData || [];
          allQuizzes = (Array.isArray(learning) ? learning : []).map((q: any) => ({
            ...q,
            quizModule: 'learning',
          }));
        }

        if (iqQuizzesResponse.ok) {
          const iqData = await iqQuizzesResponse.json();
          const iqList = Array.isArray(iqData.data) ? iqData.data : [];
          const mappedIq = iqList.map((q: any) => {
            const isDaily =
              q?.questionBankSource === 'daily-quiz-xlsx' || q?.activityType === 'daily';
            return {
              ...q,
              quizModule: 'iq-rank',
              title: q.title || (isDaily ? 'Daily Quiz' : 'Quiz'),
              totalQuestions: isDaily
                ? Number(q.dailyPickCount) || Number(q.totalQuestions) || 5
                : Number(q.totalQuestions) || 0,
              _isDailyQuiz: isDaily,
            };
          });
          // Daily first, then other IQ quizzes, then learning-path quizzes
          mappedIq.sort((a: any, b: any) => Number(b._isDailyQuiz) - Number(a._isDailyQuiz));
          allQuizzes = [...mappedIq, ...allQuizzes];
        }

        setStudentQuizzes(allQuizzes);

        let chapterProgressBySubject: Record<string, ChapterCompletedDates> = {};
        try {
          const progressRes = await fetch(`${API_BASE_URL}/api/student/video-chapter-progress`, {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          });
          if (progressRes.ok) {
            const progressJson = await progressRes.json();
            if (progressJson.success && progressJson.data) {
              chapterProgressBySubject = progressJson.data;
            }
          }
        } catch {
          // use local progress only
        }

        setVideoChapterProgressBySubject(chapterProgressBySubject);

        const programFiltered = filterContentsBySchoolProgram(
          allContent,
          resolveIsAsliPrepExclusive(user)
        );
        setScheduleAllContent(programFiltered);

        const completedContentIds = collectCompletedContentIds();
        const completionStats = buildScheduleCompletionStats(programFiltered, allQuizzes);
        setScheduleCompletionStats(completionStats);

        // Non-video: Today's Tasks completion only. Video: chapter progress uses full completion set.
        const slicedContent = buildTodaysTasksContentList(
          programFiltered,
          completedContentIds,
          chapterProgressBySubject,
          { includeHomework: true }
        );

        // Filter incomplete quizzes (not attempted or not completed)
        const incompleteQuiz = allQuizzes.filter((quiz: any) => {
          return !quiz.hasAttempted || !quiz.completedAt;
        });

        incompleteQuiz.sort((a: any, b: any) => {
          const dateA = new Date(a.createdAt || 0).getTime();
          const dateB = new Date(b.createdAt || 0).getTime();
          return dateB - dateA;
        });
        const slicedQuizzes = incompleteQuiz.slice(0, 10);
        setIncompleteContent(slicedContent);
        setIncompleteQuizzes(slicedQuizzes);

        const completedTodos =
          slicedContent.filter((c: any) => completedScheduleIds.has(c._id)).length +
          slicedQuizzes.filter((q: any) => completedScheduleIds.has(q._id)).length;
        const totalTodos = slicedContent.length + slicedQuizzes.length;
        const todoPatch = { totalTodos, completedTodos };
        writeDashboardStatsCache(todoPatch);
        dashboardStatsCacheRef.current = {
          ...(dashboardStatsCacheRef.current || {
            studyTimeToday: 0,
            studyTimeThisWeek: 0,
            backendToday: 0,
            backendWeek: 0,
          }),
          ...todoPatch,
        };
      } catch (error) {
        console.error('Failed to fetch schedule items:', error);
        setIncompleteContent([]);
        setIncompleteQuizzes([]);
        setStudentQuizzes([]);
      } finally {
        setIsLoadingSchedule(false);
      }
    };

    fetchScheduleItems();
  }, [user?.isAsliPrepExclusive, user?.assignedAdmin?.isAsliPrepExclusive, user?._id]);

  // When library content loads, refresh Today's Tasks so non-video types appear
  useEffect(() => {
    if (!user) return;
    const raw = allContent.length > 0 ? allContent : scheduleAllContent;
    if (!raw.length) return;

    const programFiltered = filterContentsBySchoolProgram(
      raw,
      resolveIsAsliPrepExclusive(user)
    );
    setScheduleAllContent(programFiltered);

    const videoCompletedIds = collectCompletedContentIds();
    setIncompleteContent(
      buildTodaysTasksContentList(programFiltered, videoCompletedIds, videoChapterProgressBySubject, {
        includeHomework: true,
      })
    );
  }, [allContent, user, videoChapterProgressBySubject]);

  // Load completed schedule items from localStorage (only for today)
  useEffect(() => {
    const loadCompletedSchedule = () => {
      const TODAY_KEY = new Date().toDateString();
      const stored = localStorage.getItem('completed_schedule_items');
      
      if (stored) {
        try {
          const data = JSON.parse(stored);
          
          // Check if data structure includes dates (new format) or is just an array (old format)
          if (data.date && data.completedIds) {
            // New format with dates
            if (data.date === TODAY_KEY) {
              // Same day, use the completed IDs
              setCompletedScheduleIds(new Set(data.completedIds));
            } else {
              // Different day, clear the data
              localStorage.setItem('completed_schedule_items', JSON.stringify({
                date: TODAY_KEY,
                completedIds: []
              }));
              setCompletedScheduleIds(new Set());
            }
          } else if (Array.isArray(data)) {
            // Old format (just array), migrate to new format
            localStorage.setItem('completed_schedule_items', JSON.stringify({
              date: TODAY_KEY,
              completedIds: []
            }));
            setCompletedScheduleIds(new Set());
          } else {
            setCompletedScheduleIds(new Set());
          }
        } catch (e) {
          setCompletedScheduleIds(new Set());
        }
      } else {
        // Initialize with today's date
        localStorage.setItem('completed_schedule_items', JSON.stringify({
          date: TODAY_KEY,
          completedIds: []
        }));
        setCompletedScheduleIds(new Set());
      }
    };
    
    loadCompletedSchedule();
    
    // Check for date changes periodically (every minute)
    const dateCheckInterval = setInterval(() => {
      const TODAY_KEY = new Date().toDateString();
      const stored = localStorage.getItem('completed_schedule_items');
      
      if (stored) {
        try {
          const data = JSON.parse(stored);
          if (data.date && data.date !== TODAY_KEY) {
            // Date changed, clear completed items
            localStorage.setItem('completed_schedule_items', JSON.stringify({
              date: TODAY_KEY,
              completedIds: []
            }));
            setCompletedScheduleIds(new Set());
          }
        } catch (e) {
          // Ignore errors
        }
      }
    }, 60000); // Check every minute
    
    return () => clearInterval(dateCheckInterval);
  }, []);

  const persistVideoChapterProgress = async (
    subjectId: string,
    dates: ChapterCompletedDates
  ) => {
    const token = getAuthToken();
    if (!token || !subjectId) return;
    try {
      await fetch(`${API_BASE_URL}/api/student/video-chapter-progress`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ subjectId, chapterCompletedAt: dates }),
      });
    } catch (err) {
      console.error('Failed to save video chapter progress:', err);
    }
  };

  // Handle completion toggle (mark done / undo)
  const handleToggleScheduleComplete = (item: any, isQuiz: boolean = false) => {
    const TODAY_KEY = new Date().toDateString();
    const itemId = String(item._id || item.id);
    const newCompleted = new Set(completedScheduleIds);
    const isCurrentlyCompleted = newCompleted.has(itemId);

    if (isCurrentlyCompleted) {
      newCompleted.delete(itemId);
    } else {
      newCompleted.add(itemId);
    }

    setCompletedScheduleIds(newCompleted);

    // Save to localStorage with today's date
    localStorage.setItem(
      'completed_schedule_items',
      JSON.stringify({
        date: TODAY_KEY,
        completedIds: Array.from(newCompleted),
      })
    );

    const subjectId = !isQuiz ? getContentSubjectId(item) : '';

    // If it's content, keep subject progress storage in sync as well.
    if (!isQuiz && subjectId) {
      const subjectKey = `completed_content_${subjectId}`;
      const stored = localStorage.getItem(subjectKey);
      let completed = stored ? JSON.parse(stored) : [];

      if (isCurrentlyCompleted) {
        completed = completed.filter((id: string) => String(id) !== itemId);
        localStorage.setItem(subjectKey, JSON.stringify(completed));
      } else if (!completed.includes(itemId)) {
        completed.push(itemId);
        localStorage.setItem(subjectKey, JSON.stringify(completed));
      }
    }

    if (!isQuiz && isVideoContentType(item.type)) {
      const token = getAuthToken();
      if (token) {
        fetch(`${API_BASE_URL}/api/student/content-progress`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contentId: itemId,
            completed: !isCurrentlyCompleted,
            progress: !isCurrentlyCompleted ? 100 : 0,
          }),
        }).catch((err) => console.error('content-progress save failed:', err));
      }
    }

    const mergedCompleted = new Set(collectCompletedContentIds());
    newCompleted.forEach((id) => mergedCompleted.add(id));

    let chapterProgressForRebuild = videoChapterProgressBySubject;
    if (!isQuiz && item.type === 'Video' && subjectId && scheduleAllContent.length > 0 && !isCurrentlyCompleted) {
      const currentDates = videoChapterProgressBySubject[subjectId] || {};
      const updatedDates = nextChapterCompletedDates(
        subjectId,
        scheduleAllContent,
        mergedCompleted,
        currentDates
      );
      if (updatedDates) {
        chapterProgressForRebuild = {
          ...videoChapterProgressBySubject,
          [subjectId]: updatedDates,
        };
        setVideoChapterProgressBySubject(chapterProgressForRebuild);
        void persistVideoChapterProgress(subjectId, updatedDates);
      }
    }

    // Close preview
    setIsPreviewOpen(false);
    setSelectedScheduleItem(null);
  };

  // Handle opening preview
  const handleOpenPreview = (item: any, isQuiz: boolean = false) => {
    setSelectedScheduleItem({ ...item, isQuiz });
    setIsPreviewOpen(true);
  };

  const handleOpenHomeworkSubmit = (homework: any) => {
    const homeworkId = String(homework?._id || homework?.id || '');
    const existingSubmission = homeworkSubmissionByHomeworkId.get(homeworkId);
    setSelectedHomeworkForSubmit(homework);
    setHomeworkSubmissionLink(existingSubmission?.submissionLink || '');
    setHomeworkSubmissionFile(null);
    setHomeworkSubmissionDescription(existingSubmission?.description || '');
    setHomeworkSubmitError('');
    setIsHomeworkSubmitOpen(true);
  };

  const handleSubmitHomeworkFromDashboard = async () => {
    if (!selectedHomeworkForSubmit) return;
    if (!homeworkSubmissionFile) {
      setHomeworkSubmitError('Please upload a submission file.');
      return;
    }

    try {
      setIsSubmittingHomework(true);
      setHomeworkSubmitError('');
      const token = getAuthToken();
      if (!token) {
        setHomeworkSubmitError('Please login again and retry.');
        return;
      }

      const formData = new FormData();
      formData.append('file', homeworkSubmissionFile);

      const uploadResponse = await fetch(`${API_BASE_URL}/api/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      const uploadData = await uploadResponse.json().catch(() => ({}));
      if (!uploadResponse.ok || !uploadData?.url) {
        setHomeworkSubmitError(uploadData?.message || 'Failed to upload file.');
        return;
      }
      const submissionLinkToSave = String(uploadData.url).startsWith('http')
        ? String(uploadData.url)
        : `${API_BASE_URL}${String(uploadData.url).startsWith('/') ? '' : '/'}${uploadData.url}`;

      const response = await fetch(`${API_BASE_URL}/api/student/homework-submission`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          homeworkId: selectedHomeworkForSubmit._id || selectedHomeworkForSubmit.id,
          submissionLink: submissionLinkToSave,
          description: homeworkSubmissionDescription.trim()
        })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.success) {
        setHomeworkSubmitError(data?.message || 'Failed to submit homework.');
        return;
      }

      const savedSubmission = data.data;
      setHomeworkSubmissionLink(savedSubmission?.submissionLink || submissionLinkToSave);
      setHomeworkSubmissionFile(null);
      setHomeworkSubmissions((prev) => {
        const savedHomeworkId =
          typeof savedSubmission?.homeworkId === 'object'
            ? savedSubmission.homeworkId?._id
            : savedSubmission?.homeworkId;
        const savedHomeworkIdStr = String(savedHomeworkId || '');
        const next = prev.filter((submission: any) => {
          const currentId =
            typeof submission.homeworkId === 'object'
              ? submission.homeworkId?._id
              : submission.homeworkId;
          return String(currentId || '') !== savedHomeworkIdStr;
        });
        return [savedSubmission, ...next];
      });

      setIsHomeworkSubmitOpen(false);
      setSelectedHomeworkForSubmit(null);
    } catch (error) {
      console.error('Homework submit failed:', error);
      setHomeworkSubmitError('An unexpected error occurred while submitting.');
    } finally {
      setIsSubmittingHomework(false);
    }
  };

  // Helper function for content type label (used in modal)
  const getContentTypeLabel = (type: string) => {
    if (type === 'Video') return 'Watch';
    if (type === 'TextBook' || type === 'Workbook') return 'Read';
    if (type === 'Material') return 'Review';
    return 'Complete';
  };

  // Helper function for priority color (used in modal)
  const getPriorityColor = (difficulty?: string) => {
    if (difficulty === 'Hard' || difficulty === 'Expert') return 'bg-red-100 text-red-700';
    if (difficulty === 'Medium') return 'bg-orange-100 text-orange-700';
    return 'bg-blue-100 text-blue-700';
  };

  // Helper function for subject name (used in modal)
  const getSubjectName = (contentItem: any): string => {
    if (typeof contentItem.subjectId === 'object' && contentItem.subjectId?.name) {
      return contentItem.subjectId.name;
    }
    if (typeof contentItem.subject === 'string') {
      return contentItem.subject;
    }
    if (typeof contentItem.subject === 'object' && contentItem.subject?.name) {
      return contentItem.subject.name;
    }
    return 'Unknown Subject';
  };

  const extractDirectFileUrl = (rawUrl: string) => {
    try {
      const parsed = new URL(rawUrl);
      if (parsed.hostname.includes('docs.google.com') && parsed.pathname.includes('/gview')) {
        const target = parsed.searchParams.get('url');
        if (target) return target;
      }
    } catch {
      return rawUrl;
    }
    return rawUrl;
  };

  // Fetch student remarks
  useEffect(() => {
    const fetchRemarks = async () => {
      try {
        setIsLoadingRemarks(true);
        const token = getAuthToken();

        const response = await fetch(`${API_BASE_URL}/api/student/remarks`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            setRemarks(data.data || []);
          }
        }
      } catch (error) {
        console.error('Failed to fetch remarks:', error);
      } finally {
        setIsLoadingRemarks(false);
      }
    };

    fetchRemarks();

    // Fetch homework submissions
    const fetchHomeworkSubmissions = async () => {
      try {
        setIsLoadingSubmissions(true);
        const token = getAuthToken();

        const response = await fetch(`${API_BASE_URL}/api/student/homework-submissions`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            setHomeworkSubmissions(data.data || []);
          }
        }
      } catch (error) {
        console.error('Failed to fetch homework submissions:', error);
      } finally {
        setIsLoadingSubmissions(false);
      }
    };

    fetchHomeworkSubmissions();

    // Fetch risk analysis reports
    const fetchRiskAnalysisReports = async () => {
      try {
        setIsLoadingReports(true);
        const token = getAuthToken();

        const response = await fetch(`${API_BASE_URL}/api/student/risk-analysis-reports`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            setRiskAnalysisReports(data.data || []);
          }
        }
      } catch (error) {
        console.error('Failed to fetch risk analysis reports:', error);
      } finally {
        setIsLoadingReports(false);
      }
    };

    fetchRiskAnalysisReports();
  }, []);

  const handleWatchVideo = (video: any) => {
    setSelectedVideo(video);
    setIsVideoModalOpen(true);
  };

  const handleCloseVideoModal = () => {
    setIsVideoModalOpen(false);
    setSelectedVideo(null);
  };

  // Dashboard data is now handled by other queries (userData, contentData)
  // Removed problematic mock query that was causing 404 errors

  // Memoize sliced arrays to avoid recalculating on every render
  // IMPORTANT: All hooks must be called before any early returns
  const availableTests = useMemo(() => {
    return exams.slice(0, 2); // Show first 2 exams as available tests
  }, [exams]);

  const topIncompleteContent = useMemo(() => dailyTasks.content, [dailyTasks]);

  const topIncompleteQuizzes = useMemo(() => dailyTasks.quizzes, [dailyTasks]);

  const getTaskTimeLabel = (item: any, isQuiz: boolean) => {
    const candidate =
      item?.startTime ||
      item?.scheduledTime ||
      item?.startDate ||
      item?.deadline ||
      item?.dueDate ||
      item?.scheduledDate;
    if (candidate) {
      const dt = new Date(candidate);
      if (!Number.isNaN(dt.getTime())) {
        const itemDay = formatDateKey(dt);
        const todayDay = formatDateKey(new Date());
        if (itemDay !== todayDay) {
          return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }
        return dt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      }
    }
    if (isQuiz && item?.duration) return `${item.duration} min`;
    return 'Anytime';
  };

  const formatDateKey = (date: Date) => {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const handleJumpToDate = (value: string = calendarJumpDate) => {
    if (!value) return;
    const [yearStr, monthStr, dayStr] = value.split("-");
    const year = Number(yearStr);
    const month = Number(monthStr);
    const day = Number(dayStr);
    if (!year || !month || !day) return;

    const targetDate = new Date(year, month - 1, day);
    setSelectedCalendarDate(targetDate);
    setCalendarMonth(new Date(targetDate.getFullYear(), targetDate.getMonth(), 1));
    setOpenCalendarDayKey(formatDateKey(targetDate));
  };

  const parseDate = (value: any): Date | null => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  const calendarEntries = useMemo(() => {
    const quizEntries = incompleteQuizzes
      .map((quiz: any) => {
        const date =
          parseDate(quiz.startDate) ||
          parseDate(quiz.scheduledDate) ||
          parseDate(quiz.deadline);
        if (!date) return null;
        return {
          id: quiz._id || quiz.id,
          type: 'quiz' as const,
          title: quiz.title || 'Quiz',
          subject:
            typeof quiz.subject === 'string'
              ? quiz.subject
              : quiz.subject?.name || 'General',
          date,
          source: quiz,
        };
      })
      .filter(Boolean) as any[];

    const examEntries = buildExamCalendarEntries(exams);
    const timetableCalendarEntries = buildTimetableCalendarEntries(monthTimetableEntries);
    const schoolEventEntries = buildSchoolEventCalendarEntries(schoolCalendarEvents);

    return [...quizEntries, ...examEntries, ...timetableCalendarEntries, ...schoolEventEntries];
  }, [incompleteQuizzes, exams, monthTimetableEntries, schoolCalendarEvents]);

  const entriesByDate = useMemo(() => {
    return calendarEntries.reduce((acc: Record<string, any[]>, entry: any) => {
      const key = formatDateKey(entry.date);
      if (!acc[key]) acc[key] = [];
      acc[key].push(entry);
      return acc;
    }, {});
  }, [calendarEntries]);

  const quizPanelItems = useMemo(() => {
    const dayKey = formatDateKey(selectedCalendarDate);
    const dayQuizzes = (entriesByDate[dayKey] || [])
      .filter((e: { type?: string }) => e.type === 'quiz')
      .sort((a: any, b: any) => a.date.getTime() - b.date.getTime());

    if (dayQuizzes.length > 0) return dayQuizzes;

    return studentQuizzes.slice(0, 8).map((quiz: any) => {
      const isDaily = Boolean(quiz._isDailyQuiz);
      const subjectName =
        typeof quiz.subject === 'string'
          ? quiz.subject
          : quiz.subject?.name || (isDaily ? 'Daily' : 'General');
      return {
        id: quiz._id || quiz.id,
        type: 'quiz' as const,
        title: quiz.title || (isDaily ? 'Daily Quiz' : 'Quiz'),
        subject: subjectName,
        date: parseDate(quiz.deadline) || parseDate(quiz.startDate) || new Date(),
        source: quiz,
        quizModule: quiz.quizModule || 'learning',
        isDaily,
      };
    });
  }, [selectedCalendarDate, entriesByDate, studentQuizzes]);

  const getQuizPanelPrevPercent = (entry: any): number | null => {
    const quiz = entry?.source || {};
    const best = Number(quiz.bestScore ?? quiz.latestScore ?? quiz.score);
    const total = Number(quiz.totalPoints);
    if (Number.isFinite(best) && Number.isFinite(total) && total > 0) {
      return Math.round((best / total) * 100);
    }
    if (Number.isFinite(best) && best >= 0 && best <= 100 && (quiz.hasAttempted || quiz.isCompleted)) {
      return Math.round(best);
    }
    return null;
  };

  const openQuizFromPanel = (entry: any) => {
    const quizId = String(entry.id || entry.source?._id || '');
    const module = entry.quizModule || entry.source?.quizModule;
    const isDaily = Boolean(entry.isDaily || entry.source?._isDailyQuiz);
    if (isDaily && dailyQuizStatus?.lockedUntilTomorrow) {
      const key = dailyQuizStatus.today?.dateKey;
      if (key) {
        setLocation(`/iq-rank-boost-subjects?review=${encodeURIComponent(key)}`);
        return;
      }
      setLocation('/iq-rank-boost-subjects');
      return;
    }
    if (module === 'iq-rank' && quizId) {
      setLocation(`/iq-rank-boost/quiz/${encodeURIComponent(quizId)}`);
      return;
    }
    if (quizId) {
      setLocation(`/quiz/${encodeURIComponent(quizId)}`);
      return;
    }
    setLocation('/iq-rank-boost-subjects');
  };

  const formatDailyDateLabel = (dateKey: string) => {
    try {
      return new Date(`${dateKey}T12:00:00`).toLocaleDateString(undefined, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      });
    } catch {
      return dateKey;
    }
  };

  const calendarDays = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const offset = (firstDay.getDay() + 6) % 7; // Monday-first
    const cells: (Date | null)[] = [];

    for (let i = 0; i < offset; i += 1) cells.push(null);
    for (let d = 1; d <= daysInMonth; d += 1) cells.push(new Date(year, month, d));
    return cells;
  }, [calendarMonth]);

  useEffect(() => {
    setCalendarJumpDate(formatDateKey(selectedCalendarDate));
  }, [selectedCalendarDate]);

  if (isLoadingUser) {
    return (
      <>
        <Navigation />
        <div className="min-h-screen bg-sky-50 flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-blue-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl">
              <div className="w-6 h-6 sm:w-7 sm:h-7 lg:w-8 lg:h-8 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-blue-600 to-blue-700 bg-clip-text text-transparent mb-2">Loading...</h2>
            <p className="text-gray-600">Preparing your dashboard</p>
          </div>
        </div>
      </>
    );
  }

  const recommendedVideos = [];

  return (
    <StudentShell>
      <div>
        <div className="relative w-full">

        {showTrialUpgrade(user) ? (
          <div className="relative z-10 mb-6">
            <TrialUpgradeBanner
              daysLeft={user?.trialDaysLeft}
              trialEndsAt={user?.trialEndsAt}
            />
          </div>
        ) : null}

        {/* Welcome Section */}
        <div className="relative z-10 mb-6">
        {studyStreak && studyStreak.count > 0 && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-4 py-2.5">
            <Flame className="h-5 w-5 shrink-0 text-orange-500" aria-hidden />
            <div>
              <p className="text-xs sm:text-sm font-semibold text-orange-700">{studyStreak.count}-day study streak!</p>
              <p className="text-xs text-orange-600">{studyStreak.message || 'Keep it up!'}</p>
            </div>
          </div>
        )}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-teal-700 via-sky-600 to-cyan-600 p-5 shadow-glow-lg sm:p-8 lg:p-10">
        <div className="pointer-events-none absolute -right-16 -top-28 h-72 w-72 rounded-full bg-white/15 blur-3xl"></div>
        <div className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-amber-200/25 blur-3xl"></div>
            <div className="relative z-10 flex items-start gap-3 sm:items-center sm:gap-6">
              {/* Left — welcome copy */}
              <div className="min-w-0 flex-1">
                <h1 className="mb-2 font-display text-2xl font-extrabold leading-tight !text-white sm:mb-3 sm:text-4xl lg:text-5xl">
                  Welcome, {getStudentDisplayName(user)}!
                </h1>
                <p className="mb-4 max-w-xl text-sm font-medium leading-snug text-white/85 sm:mb-6 sm:text-lg sm:leading-relaxed">
                  {vidyaEnabled
                    ? `Continue your ${user?.educationStream || 'JEE'} prep — Vidya AI has picks ready.`
                    : `Continue your ${user?.educationStream || 'JEE'} prep. Pick up where you left off.`}
                </p>

                <div className="flex flex-row flex-wrap gap-2 sm:gap-3">
                  <Button
                    className="h-11 whitespace-nowrap !bg-white px-5 text-sm font-bold !text-teal-800 shadow-lg hover:!bg-white/90 sm:h-12 sm:px-6 sm:text-base"
                    onClick={() => setLocation('/learning-paths')}
                  >
                    Continue Learning
                  </Button>
                  {vidyaEnabled ? (
                  <Button
                    variant="outline"
                    className="h-11 whitespace-nowrap border-white/40 !bg-white/10 px-5 text-sm font-bold !text-white backdrop-blur hover:!bg-white/20 sm:h-12 sm:px-6 sm:text-base"
                    onClick={() => setLocation('/ai-tutor')}
                  >
                    Ask Vidya AI
                  </Button>
                  ) : null}
                </div>
              </div>
              
              {/* Right — Vidya robot, aligned to top of the banner */}
              {vidyaEnabled ? (
              <div className="shrink-0 self-start sm:self-center">
                <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-white/95 p-1 shadow-lg ring-1 ring-white/60 sm:h-28 sm:w-36 sm:rounded-3xl sm:p-2 lg:h-32 lg:w-40">
                  <img 
                    src="/ROBOT.gif" 
                    alt="Vidya AI" 
                    draggable={false}
                    className="h-full w-full object-contain"
                  />
                </div>
              </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* Summary Statistics Cards — single row, no duplicate below */}
        <div className="mb-8 relative z-10">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Study Time"
              value={
                studyTimeToday >= 60
                  ? `${(studyTimeToday / 60).toFixed(1)} hrs`
                  : studyTimeToday < 1 && studyTimeToday > 0
                    ? '<1m'
                    : `${Math.round(studyTimeToday)}m`
              }
              caption="Logged in today"
              icon={Clock}
              tone="blue"
              motif="wave"
            />

            <StatCard
              label="This Week"
              value={
                studyTimeThisWeek >= 60
                  ? `${(studyTimeThisWeek / 60).toFixed(1)} hrs`
                  : studyTimeThisWeek < 1 && studyTimeThisWeek > 0
                    ? '<1m'
                    : `${Math.round(studyTimeThisWeek)}m`
              }
              caption="Study time this week"
              icon={Calendar}
              tone="teal"
              motif="bars"
            />

            {(() => {
              const efficiency =
                scheduleCompletionStats.total > 0
                  ? scheduleCompletionStats.completionPercent
                  : overallProgress > 0
                    ? Math.round(overallProgress)
                    : 0;
              return (
                <StatCard
                  label="Efficiency"
                  value={`${efficiency}%`}
                  caption="Completion rate"
                  icon={TrendingUp}
                  tone="violet"
                  motif="ring"
                />
              );
            })()}

            <StatCard
              label="Overall Progress"
              value={`${Math.round(overallProgress)}%`}
              caption="Across all subjects"
              icon={Target}
              tone="amber"
              progress={Math.round(overallProgress)}
            />
          </div>
        </div>

        {/* Student Calendar + Quiz panel */}
        <div className="mb-6 relative z-10 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2 bg-white rounded-xl shadow-md">
              <CardHeader className="pb-3">
                <div className="flex flex-col gap-3">
                  <div className="min-w-0">
                    <CardTitle className="text-lg sm:text-xl font-bold text-gray-900">Study Calendar</CardTitle>
                    <p className="text-xs sm:text-sm text-gray-600 mt-1 break-words">
                      Click a date to see quizzes and exams
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setCalendarMonth(
                            prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1)
                          )
                        }
                      >
                        <ChevronLeft className="w-3 h-3 sm:w-4 sm:h-4" />
                      </Button>
                      <p className="text-xs sm:text-sm font-semibold text-gray-800 min-w-[120px] text-center">
                        {calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setCalendarMonth(
                            prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1)
                          )
                        }
                      >
                        <ChevronRight className="w-3 h-3 sm:w-4 sm:h-4" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="date"
                        value={calendarJumpDate}
                        onChange={(e) => {
                          setCalendarJumpDate(e.target.value);
                          // Picking a day jumps there; Go stays for typed dates.
                          if (e.target.value) handleJumpToDate(e.target.value);
                        }}
                        aria-label="Jump to date"
                        className="h-9 w-[9.5rem] min-w-0 rounded-md border border-gray-200 bg-white py-1.5 pl-3 pr-2 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-200 sm:text-sm"
                      />
                      <Button size="sm" className="whitespace-nowrap" onClick={() => handleJumpToDate()}>
                        Go
                      </Button>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-7 gap-2 mb-2">
                  {[
                    { day: 'Mon', cls: 'bg-sky-50 text-sky-600' },
                    { day: 'Tue', cls: 'bg-violet-50 text-violet-600' },
                    { day: 'Wed', cls: 'bg-amber-50 text-amber-600' },
                    { day: 'Thu', cls: 'bg-rose-50 text-rose-600' },
                    { day: 'Fri', cls: 'bg-emerald-50 text-emerald-600' },
                    { day: 'Sat', cls: 'bg-orange-50 text-orange-600' },
                    { day: 'Sun', cls: 'bg-fuchsia-50 text-fuchsia-600' },
                  ].map(({ day, cls }) => (
                    <div
                      key={day}
                      className={`rounded-full py-1 text-center text-[11px] font-bold sm:text-xs ${cls}`}
                    >
                      {day}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-2">
                  {calendarDays.map((day, idx) => {
                    if (!day) return <div key={`empty-${idx}`} className="h-12" />;
                    const dayKey = formatDateKey(day);
                    const isSelected = formatDateKey(selectedCalendarDate) === dayKey;
                    const dayEntries = (entriesByDate[dayKey] || []).filter(
                      (entry: { type?: string }) =>
                        entry.type !== 'timetable' && entry.type !== 'content'
                    );
                    const itemCount = dayEntries.length;
                    const isToday = formatDateKey(new Date()) === dayKey;
                    const isPopoverOpen = openCalendarDayKey === dayKey;
                    const weekday = day.getDay();
                    const weekendClass =
                      weekday === 6
                        ? 'text-sky-600'
                        : weekday === 0
                        ? 'text-fuchsia-600'
                        : 'text-gray-700';

                    return (
                      <Popover
                        key={dayKey}
                        open={isPopoverOpen}
                        onOpenChange={(open) => {
                          if (open) {
                            setSelectedCalendarDate(day);
                            setOpenCalendarDayKey(dayKey);
                          } else if (openCalendarDayKey === dayKey) {
                            setOpenCalendarDayKey(null);
                          }
                        }}
                      >
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedCalendarDate(day);
                              setOpenCalendarDayKey(dayKey);
                            }}
                            className={`h-12 w-full rounded-lg border text-xs font-semibold sm:text-sm transition-colors relative ${
                              isSelected
                                ? 'bg-indigo-600 text-white border-indigo-600'
                                : isToday
                                ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                : `bg-white border-gray-200 hover:bg-gray-50 ${weekendClass}`
                            }`}
                          >
                            {day.getDate()}
                            {itemCount > 0 && (
                              <span
                                className={`absolute bottom-1 right-1 text-micro px-1.5 py-0.5 rounded-full ${
                                  isSelected ? 'bg-white text-indigo-700' : 'bg-orange-100 text-orange-700'
                                }`}
                              >
                                {itemCount}
                              </span>
                            )}
                          </button>
                        </PopoverTrigger>
                        <PopoverContent
                          side="right"
                          align="start"
                          sideOffset={10}
                          collisionPadding={16}
                          className="z-[60] w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-sky-100 bg-white p-0 shadow-xl shadow-sky-200/40"
                        >
                          <div className="border-b border-sky-100 bg-gradient-to-r from-sky-50 via-white to-indigo-50 px-3.5 py-3">
                            <p className="text-sm font-bold text-slate-900">
                              {day.toLocaleDateString('en-US', {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {itemCount === 0
                                ? 'No scheduled items'
                                : `${itemCount} scheduled item${itemCount === 1 ? '' : 's'}`}
                            </p>
                          </div>

                          <div className="max-h-64 space-y-2 overflow-y-auto p-2.5">
                            {itemCount === 0 ? (
                              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-3 py-5 text-center">
                                <Calendar className="mx-auto mb-1.5 h-5 w-5 text-slate-300" />
                                <p className="text-xs font-medium text-slate-600">Nothing on this day</p>
                                <p className="mt-0.5 text-[11px] text-slate-400">
                                  Quizzes, exams, and school events will show here.
                                </p>
                              </div>
                            ) : (
                              dayEntries
                                .slice()
                                .sort(
                                  (a: any, b: any) =>
                                    (a.date?.getTime?.() || 0) - (b.date?.getTime?.() || 0)
                                )
                                .map((entry: any) => {
                                  const type = String(entry.type || 'event');
                                  const typeLabel =
                                    type === 'exam'
                                      ? 'Exam'
                                      : type === 'quiz'
                                        ? 'Quiz'
                                        : type === 'event'
                                          ? 'Event'
                                          : type;
                                  const typeClass =
                                    type === 'exam'
                                      ? 'bg-rose-100 text-rose-700'
                                      : type === 'quiz'
                                        ? 'bg-teal-100 text-teal-700'
                                        : 'bg-indigo-100 text-indigo-700';
                                  return (
                                    <button
                                      key={`${type}-${entry.id}`}
                                      type="button"
                                      className="flex w-full items-start gap-2.5 rounded-xl border border-slate-100 bg-white px-3 py-2.5 text-left shadow-sm transition hover:border-sky-200 hover:bg-sky-50/60"
                                      onClick={() => {
                                        setOpenCalendarDayKey(null);
                                        if (type === 'exam') {
                                          const examId = String(entry.id || entry.source?._id || '');
                                          setLocation(
                                            examId
                                              ? `/student-exams?examId=${encodeURIComponent(examId)}`
                                              : '/student-exams'
                                          );
                                          return;
                                        }
                                        if (type === 'quiz') {
                                          const quizId = String(entry.id || entry.source?._id || '');
                                          if (quizId) setLocation(`/quiz/${encodeURIComponent(quizId)}`);
                                          else setLocation('/learning-paths');
                                          return;
                                        }
                                      }}
                                    >
                                      <span
                                        className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${typeClass}`}
                                      >
                                        {typeLabel}
                                      </span>
                                      <span className="min-w-0 flex-1">
                                        <span className="block truncate text-sm font-semibold text-slate-800">
                                          {entry.title || 'Scheduled item'}
                                        </span>
                                        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
                                          {entry.subject ? <span>{entry.subject}</span> : null}
                                          {entry.date ? (
                                            <span className="inline-flex items-center gap-1">
                                              <Clock className="h-3 w-3 text-sky-500" />
                                              {entry.date.toLocaleTimeString([], {
                                                hour: '2-digit',
                                                minute: '2-digit',
                                              })}
                                            </span>
                                          ) : null}
                                        </span>
                                      </span>
                                    </button>
                                  );
                                })
                            )}
                          </div>
                        </PopoverContent>
                      </Popover>
                    );
                  })}
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-gray-100 pt-3 text-xs font-medium text-gray-600">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-sky-500" />
                    Quiz
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-orange-500" />
                    Exam
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full ring-2 ring-indigo-500 ring-offset-1" />
                    Today
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card className="quiz-panel-shell overflow-hidden rounded-2xl border-indigo-100">
              <CardHeader className="border-b border-indigo-100/80 bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-500 pb-3 text-white">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 text-white shadow-sm ring-1 ring-white/20">
                      <Flame className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-base font-semibold text-white sm:text-lg">
                        Quiz
                      </CardTitle>
                      <p className="text-xs text-white/80 sm:text-sm">
                        {dailyQuizStatus
                          ? `${consecutiveDailyStreak(dailyQuizStatus)}-day streak · ${streakCheer(consecutiveDailyStreak(dailyQuizStatus))}`
                          : 'Play daily · keep your streak'}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 shrink-0 rounded-lg px-2 text-xs font-semibold text-white hover:bg-white/15"
                    onClick={() => setLocation('/iq-rank-boost-subjects')}
                  >
                    View all
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pt-4">
                {isLoadingSchedule ? (
                  <div className="h-24 animate-pulse rounded-xl bg-gradient-to-r from-sky-50 via-teal-50 to-sky-50" />
                ) : quizPanelItems.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-sky-200 bg-sky-50/50 px-3 py-6 text-center">
                    <TargetIcon className="mx-auto mb-2 h-7 w-7 text-sky-300" />
                    <p className="text-xs font-medium text-slate-600 sm:text-sm">No quizzes yet</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Assigned quizzes will show up here. Exams stay under Exams.
                    </p>
                  </div>
                ) : (
                  quizPanelItems.map((entry: any, index: number) => {
                    const isDaily = Boolean(entry.isDaily || entry.source?._isDailyQuiz);
                    const dailyLocked = isDaily && Boolean(dailyQuizStatus?.lockedUntilTomorrow);
                    const prevPercent = isDaily && dailyQuizStatus?.today?.completed
                      ? dailyQuizStatus.today.score
                      : getQuizPanelPrevPercent(entry);
                    return (
                      <div
                        key={`${entry.type}-${entry.id}`}
                        className="quiz-panel-item group relative overflow-hidden rounded-xl border border-sky-100/90 bg-gradient-to-br from-white via-sky-50/40 to-teal-50/50 p-3.5"
                        style={{ animationDelay: `${Math.min(index, 6) * 60}ms` }}
                      >
                        <div className="relative flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-2 text-xs font-semibold text-slate-800 sm:text-sm">
                              {entry.title}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {isDaily ? 'Daily · Class bank' : entry.subject}
                            </p>
                          </div>
                          <Badge
                            className={`text-micro shrink-0 border-0 shadow-sm ${
                              isDaily
                                ? 'bg-teal-100 text-teal-700'
                                : 'bg-sky-100 text-sky-700'
                            }`}
                          >
                            {isDaily ? 'DAILY' : 'QUIZ'}
                          </Badge>
                        </div>

                        <div className="relative mt-2.5 flex items-center justify-between gap-2 text-xs text-slate-500">
                          <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2 py-0.5 ring-1 ring-sky-100">
                            <Clock className="h-3 w-3 text-sky-500" />
                            {entry.source?.totalQuestions
                              ? `${entry.source.totalQuestions} Q`
                              : entry.date
                                ? entry.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                : 'Open'}
                          </span>
                          {prevPercent != null ? (
                            <span className="font-semibold tabular-nums text-teal-700">{prevPercent}%</span>
                          ) : (
                            <span className="text-slate-400">Not attempted</span>
                          )}
                        </div>

                        <div className="quiz-panel-item-actions relative mt-3 space-y-2">
                          {dailyLocked ? (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="w-full rounded-lg border-sky-200 bg-white text-sky-700 hover:bg-sky-50"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const key = dailyQuizStatus?.today?.dateKey;
                                  if (key) {
                                    setLocation(
                                      `/iq-rank-boost-subjects?review=${encodeURIComponent(key)}`,
                                    );
                                  } else {
                                    setLocation('/iq-rank-boost-subjects');
                                  }
                                }}
                              >
                                View today’s result
                              </Button>
                              <Button
                                size="sm"
                                disabled
                                className="w-full cursor-not-allowed rounded-lg bg-slate-200 text-slate-500"
                              >
                                <Lock className="mr-1.5 h-3 w-3" />
                                Locked until tomorrow
                              </Button>
                            </>
                          ) : (
                            <Button
                              size="sm"
                              className="quiz-start-btn w-full rounded-lg bg-indigo-600 text-white shadow-sm transition-transform duration-200 hover:scale-[1.02] hover:bg-indigo-700 active:scale-[0.98]"
                              onClick={(e) => {
                                e.stopPropagation();
                                openQuizFromPanel(entry);
                              }}
                            >
                              <Play className="mr-1.5 h-3 w-3" />
                              Start Quiz
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}

                {/* Next unlock + previous daily results */}
                {dailyQuizStatus ? (
                  <div className="space-y-2 border-t border-sky-100 pt-3">
                    <div className="rounded-xl border border-dashed border-sky-200 bg-sky-50/50 px-3 py-2.5">
                      <div className="mb-1 flex items-center gap-1.5 text-sky-700">
                        <Lock className="h-3.5 w-3.5" />
                        <p className="text-xs font-semibold">Next unlock</p>
                      </div>
                      <p className="text-xs text-slate-600">
                        {dailyQuizStatus.lockedUntilTomorrow
                          ? 'Tomorrow’s daily quiz unlocks at midnight (IST).'
                          : 'Finish today’s daily quiz to keep your streak.'}
                      </p>
                      <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-sky-100">
                        <CalendarDays className="h-3 w-3 text-sky-600" />
                        Unlocks{' '}
                        {dailyQuizStatus.nextUnlockDateKey
                          ? formatDailyDateLabel(dailyQuizStatus.nextUnlockDateKey)
                          : 'tomorrow'}
                      </div>
                    </div>

                    <div className="rounded-xl border border-sky-100 bg-white px-3 py-2.5">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-teal-700">
                          <TargetIcon className="h-3.5 w-3.5" />
                          <p className="text-xs font-semibold">Previous results</p>
                        </div>
                        <button
                          type="button"
                          className="text-[11px] font-semibold text-sky-700 hover:underline"
                          onClick={() => setLocation('/iq-rank-boost-subjects')}
                        >
                          See all
                        </button>
                      </div>
                      {dailyQuizStatus.history?.length ? (
                        <ul className="max-h-36 space-y-1.5 overflow-y-auto pr-0.5">
                          {dailyQuizStatus.history.slice(0, 5).map((row) => (
                            <li key={row.dateKey}>
                              <button
                                type="button"
                                className="flex w-full items-center justify-between rounded-lg bg-slate-50 px-2.5 py-2 text-left text-xs transition hover:bg-sky-50 hover:ring-1 hover:ring-sky-200"
                                onClick={() =>
                                  setLocation(
                                    `/iq-rank-boost-subjects?review=${encodeURIComponent(row.dateKey)}`,
                                  )
                                }
                              >
                                <span className="font-medium text-slate-700">
                                  {formatDailyDateLabel(row.dateKey)}
                                </span>
                                <span className="inline-flex items-center gap-1 font-bold tabular-nums text-teal-700">
                                  {row.score != null ? `${row.score}%` : '—'}
                                  <ChevronRight className="h-3.5 w-3.5 text-sky-500" />
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-[11px] text-slate-500">
                          No saved daily scores yet. Complete today’s quiz to start your record.
                        </p>
                      )}
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>

          </div>
        </div>

        {/* Practice exams for B2C; school students keep Teachers report + Homework */}
        {isIndividualAccount(user) ? (
          <div className="mb-responsive relative z-10 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <DashboardNavCard
              href="/student-exams"
              title="Practice Exams"
              description="Class-wise practice papers on your Board or Asli Prep Alpha / Beta / Gamma track."
              tone="orange"
              icon={<FileText className="h-7 w-7 sm:h-8 sm:w-8" />}
            />
            <DashboardNavCard
              href="/pricing"
              title="Your IIT book"
              description="Confirm Alpha, Beta or Gamma so quizzes and Vidya stay tied to that material."
              tone="purple"
              icon={<Target className="h-7 w-7 sm:h-8 sm:w-8" />}
            />
          </div>
        ) : (
          <div className="mb-responsive relative z-10 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <DashboardNavCard
              href="/student/teachers-report"
              title="Teachers Report"
              description="Daily class updates from teachers."
              tone="purple"
              icon={<Users className="h-7 w-7 sm:h-8 sm:w-8" />}
            />
            <DashboardNavCard
              href="/student/homework"
              title="My Homework"
              description="View and manage your assignments."
              tone="orange"
              icon={<Backpack className="h-7 w-7 sm:h-8 sm:w-8" />}
            />
          </div>
        )}

        {/* Teacher Remarks Section */}
        {remarks.length > 0 && (
          <div className="mb-responsive relative z-10">
            <Card className="bg-white/60 backdrop-blur-xl border-white/20 shadow-xl">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-sky-400 to-teal-500 rounded-lg flex items-center justify-center">
                    <MessageSquare className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                  </div>
                  <CardTitle className="bg-gradient-to-r from-orange-600 via-orange-400 to-teal-500 bg-clip-text text-transparent">
                    Teacher Remarks
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {remarks.slice(0, 5).map((remark: any) => (
                    <div
                      key={remark._id}
                      className={`p-4 rounded-lg border-l-4 ${
                        remark.isPositive
                          ? 'bg-green-50 border-green-500'
                          : 'bg-orange-50 border-orange-500'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {remark.isPositive ? (
                            <ThumbsUp className="w-3 h-3 sm:w-4 sm:h-4 text-green-600" />
                          ) : (
                            <AlertCircle className="w-3 h-3 sm:w-4 sm:h-4 text-orange-600" />
                          )}
                          <span className="font-semibold text-gray-900">
                            {remark.teacherId?.fullName || 'Teacher'}
                          </span>
                          {remark.subject && (
                            <Badge variant="outline" className="text-xs">
                              {remark.subject.name}
                            </Badge>
                          )}
                        </div>
                        <span className="text-xs text-gray-500">
                          {new Date(remark.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-gray-700 text-xs sm:text-sm">{remark.remark}</p>
                    </div>
                  ))}
                  {remarks.length > 5 && (
                    <p className="text-xs sm:text-sm text-gray-500 text-center">
                      Showing 5 of {remarks.length} remarks
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* AI Risk Analysis Reports Section */}
        {riskAnalysisReports.length > 0 && (
          <div className="mb-responsive relative z-10">
            <Card className="bg-white/60 backdrop-blur-xl border-white/20 shadow-xl">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-orange-400 to-red-500 rounded-lg flex items-center justify-center">
                    <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                  </div>
                  <CardTitle className="bg-gradient-to-r from-orange-600 via-orange-400 to-red-500 bg-clip-text text-transparent">
                    AI Risk Analysis Reports
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {riskAnalysisReports.map((report: any) => (
                    <div
                      key={report._id}
                      className={`p-4 rounded-lg border-l-4 ${
                        report.isRead
                          ? 'bg-gray-50 border-gray-300'
                          : 'bg-orange-50 border-orange-500'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Brain className="w-3 h-3 sm:w-4 sm:h-4 text-orange-600" />
                            <h5 className="font-semibold text-gray-900">
                              Performance Risk Analysis Report
                            </h5>
                            {!report.isRead && (
                              <Badge className="bg-orange-500 text-white text-xs">New</Badge>
                            )}
                          </div>
                          <p className="text-xs sm:text-sm text-gray-600 mb-2">
                            Sent by {report.adminId?.fullName || 'Administrator'} on{' '}
                            {new Date(report.sentAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            try {
                              const token = getAuthToken();
                              const response = await fetch(
                                `${API_BASE_URL}/api/student/risk-analysis-reports/${report._id}/download`,
                                {
                                  headers: {
                                    'Authorization': `Bearer ${token}`
                                  }
                                }
                              );

                              if (response.ok) {
                                const blob = await response.blob();
                                const url = window.URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = report.pdfFilename || 'risk-analysis-report.pdf';
                                document.body.appendChild(a);
                                a.click();
                                window.URL.revokeObjectURL(url);
                                document.body.removeChild(a);

                                // Refresh reports to update read status
                                const refreshResponse = await fetch(`${API_BASE_URL}/api/student/risk-analysis-reports`, {
                                  headers: {
                                    'Authorization': `Bearer ${token}`,
                                    'Content-Type': 'application/json'
                                  }
                                });
                                if (refreshResponse.ok) {
                                  const refreshData = await refreshResponse.json();
                                  if (refreshData.success) {
                                    setRiskAnalysisReports(refreshData.data || []);
                                  }
                                }
                              }
                            } catch (error) {
                              console.error('Failed to download report:', error);
                            }
                          }}
                          className="text-orange-600 border-orange-300 hover:bg-orange-50"
                        >
                          <Download className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
                          Download PDF
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Main Content */}
        <div className="relative z-10 space-y-3 sm:space-y-4 sm:p-6 lg:space-y-6 lg:p-8">
          <div className="min-w-0 space-y-3 sm:space-y-4 lg:space-y-6">
            
            {/* Learning Progress */}
            <Card className="bg-white/60 backdrop-blur-xl border-white/20 shadow-xl">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="bg-gradient-to-r from-orange-600 via-orange-400 to-teal-500 bg-clip-text text-transparent">Your Learning Progress</CardTitle>
                  <Badge className="bg-gradient-to-r from-orange-400 to-teal-500 text-white shadow-lg">
                    Asli Learn
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 sm:space-y-4 lg:space-y-6">
                {/* Progress Overview */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-responsive-xs font-medium text-gray-700">Overall Progress</span>
                    <span className="text-responsive-xs font-medium text-primary">{overallProgress}%</span>
                  </div>
                  <Progress value={overallProgress} className="h-3 [&>div]:bg-gradient-to-r [&>div]:from-orange-400 [&>div]:via-blue-500 [&>div]:to-teal-500" />
                </div>

                {/* Subject Progress — boxes (all subjects on one row on desktop) */}
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  {subjectProgress.length > 0 ? subjectProgress.map((subject, idx) => {
                    const meta = getSubjectProgressIconMeta(subject.name || '');
                    return (
                      <div
                        key={subject.id || subject.name || `subject-${idx}`}
                        className={`flex flex-col rounded-2xl border border-white/80 p-4 shadow-sm ${meta.bgClass}`}
                      >
                        <div className="mb-3 flex items-start justify-between gap-2">
                          <SubjectProgressIcon name={subject.name || ''} />
                          <p className="text-xl font-extrabold tabular-nums text-slate-900">
                            {subject.progress}%
                          </p>
                        </div>
                        <h3 className="truncate text-base font-bold capitalize text-slate-900">
                          {subject.name}
                        </h3>
                        <p className="mt-0.5 line-clamp-2 min-h-[2rem] text-xs text-slate-500">
                          {subject.currentTopic}
                        </p>
                        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/80">
                          <div
                            className="h-2 rounded-full bg-gradient-to-r from-orange-400 via-blue-500 to-teal-500"
                            style={{ width: `${Math.min(100, Math.max(0, Number(subject.progress) || 0))}%` }}
                          />
                        </div>
                      </div>
                    );
                  }) : (
                    <div className="col-span-full py-4 text-center text-gray-500">
                      Complete exams to see your subject-wise progress
                    </div>
                  )}
                </div>

              </CardContent>
            </Card>

            {/* Adaptive Learning - Recommendation Engine */}
            <AdaptiveRecommendations />

            <div className="mt-4">
              <WeeklyDigestCard apiBase="/api/student" />
            </div>

                  </div>
        </div>


      </div>
      </div>

      {/* Content Preview Modal */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="flex h-[min(96dvh,1120px)] max-h-[96dvh] w-[min(96vw,860px)] max-w-[860px] flex-col overflow-hidden rounded-2xl bg-white">
          {selectedScheduleItem && (
            <>
              <DialogHeader className="shrink-0">
                <DialogTitle>
                  {selectedScheduleItem.isQuiz 
                    ? `Quiz: ${selectedScheduleItem.title || 'Untitled Quiz'}`
                    : `${getContentTypeLabel(selectedScheduleItem.type || 'Material')}: ${selectedScheduleItem.title || 'Untitled Content'}`}
                </DialogTitle>
                <DialogDescription>
                  {selectedScheduleItem.isQuiz 
                    ? selectedScheduleItem.description || 'Complete this quiz to test your knowledge'
                    : selectedScheduleItem.description || 'Review this content to enhance your learning'}
                </DialogDescription>
              </DialogHeader>
              
              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden py-4">
                {selectedScheduleItem.isQuiz ? (
                  <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <p className="text-xs sm:text-sm font-medium text-gray-700">Subject</p>
                        <p className="text-xs sm:text-sm text-gray-900">
                          {typeof selectedScheduleItem.subject === 'string' 
                            ? selectedScheduleItem.subject 
                            : (typeof selectedScheduleItem.subject === 'object' && selectedScheduleItem.subject?.name 
                              ? selectedScheduleItem.subject.name 
                              : 'Unknown Subject')}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs sm:text-sm font-medium text-gray-700">Difficulty</p>
                        <Badge className={`${getPriorityColor(selectedScheduleItem.difficulty || 'Easy')} text-xs`}>
                          {selectedScheduleItem.difficulty || 'Easy'}
                        </Badge>
                      </div>
                      <div>
                        <p className="text-xs sm:text-sm font-medium text-gray-700">Duration</p>
                        <p className="text-xs sm:text-sm text-gray-900 flex items-center space-x-1">
                          <Clock className="w-3 h-3" />
                          <span>{selectedScheduleItem.duration || 30} minutes</span>
                        </p>
                      </div>
                      <div>
                        <p className="text-xs sm:text-sm font-medium text-gray-700">Questions</p>
                        <p className="text-xs sm:text-sm text-gray-900">{selectedScheduleItem.questionCount || 0} questions</p>
                      </div>
                    </div>
                    {selectedScheduleItem.totalPoints && (
                      <div>
                        <p className="text-xs sm:text-sm font-medium text-gray-700">Total Points</p>
                        <p className="text-xs sm:text-sm text-gray-900">{selectedScheduleItem.totalPoints} points</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="grid shrink-0 grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <p className="text-xs sm:text-sm font-medium text-gray-700">Subject</p>
                        <p className="text-xs sm:text-sm text-gray-900">
                          {getSubjectName(selectedScheduleItem)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs sm:text-sm font-medium text-gray-700">Type</p>
                        <Badge className="text-xs bg-gray-100 text-gray-700">
                          {selectedScheduleItem.type || 'Material'}
                        </Badge>
                      </div>
                    </div>
                    {selectedScheduleItem.fileUrl && (
                      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
                        <p className="shrink-0 text-xs sm:text-sm font-medium text-gray-700">
                          Content Preview
                        </p>

                        <div className="flex min-h-[min(48dvh,520px)] flex-1 flex-col overflow-hidden rounded-lg bg-[#d6d3d1]">
                        {(() => {
                          // Ensure fileUrl is properly formatted
                          let fileUrl = selectedScheduleItem.fileUrl || '';
                          if (fileUrl && !fileUrl.startsWith('http') && !fileUrl.startsWith('//')) {
                            if (fileUrl.startsWith('/')) {
                              fileUrl = `${API_BASE_URL}${fileUrl}`;
                            } else {
                              fileUrl = `${API_BASE_URL}/${fileUrl}`;
                            }
                          }
                          fileUrl = extractDirectFileUrl(fileUrl);
                          
                          const fileUrlLower = fileUrl.toLowerCase();
                          const isVideo = selectedScheduleItem.type === 'Video' || 
                                         fileUrlLower.match(/\.(mp4|webm|ogg|mov|avi|mkv)$/) ||
                                         fileUrlLower.includes('youtube.com') || 
                                         fileUrlLower.includes('youtu.be');
                          const isPDF = isPdfPreviewContent(
                            fileUrl,
                            selectedScheduleItem.type,
                          );
                          const isAudio = selectedScheduleItem.type === 'Audio' || 
                                         fileUrlLower.match(/\.(mp3|wav|ogg|m4a|aac|flac)$/);
                          const isImage = fileUrlLower.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp)$/);
                          const isGoogleDrive = fileUrlLower.includes('drive.google.com');
                          
                          if (isVideo) {
                            if (fileUrlLower.includes('youtube.com') || fileUrlLower.includes('youtu.be')) {
                              // YouTube video
                              const getYouTubeId = (url: string) => {
                                const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
                                const match = url.match(regExp);
                                return (match && match[2].length === 11) ? match[2] : null;
                              };
                              const videoId = getYouTubeId(fileUrl);
                              return videoId ? (
                                <div className="w-full aspect-video bg-gray-100 rounded-lg overflow-hidden">
                                  <iframe
                                    className="w-full h-full"
                                    src={`https://www.youtube.com/embed/${videoId}`}
                                    title={selectedScheduleItem.title}
                                    frameBorder="0"
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                    allowFullScreen
                                  />
                                </div>
                              ) : (
                                <div className="w-full aspect-video bg-gray-100 rounded-lg flex items-center justify-center">
                                  <VideoIcon className="w-12 h-12 text-gray-400" />
                                  <p className="ml-2 text-gray-600">Video preview not available</p>
                                </div>
                              );
                            } else {
                              // Regular video
                              return (
                                <div className="w-full aspect-video bg-gray-100 rounded-lg overflow-hidden">
                                  <video
                                    src={fileUrl}
                                    controls
                                    className="w-full h-full"
                                  >
                                    Your browser does not support the video tag.
                                  </video>
                                </div>
                              );
                            }
                          }
                          
                          if (isPDF) {
                            return (
                              <PdfPreviewPanel
                                fileUrl={fileUrl}
                                title={selectedScheduleItem.title}
                                className="h-full min-h-[min(48dvh,520px)] w-full flex-1"
                                variant="book"
                              />
                            );
                          }
                          
                          if (isAudio) {
                            return (
                              <div className="w-full bg-gray-100 rounded-lg p-4 sm:p-6 lg:p-8">
                                <div className="text-center space-y-4">
                                  <div className="w-24 h-24 mx-auto bg-blue-100 rounded-full flex items-center justify-center">
                                    <File className="w-12 h-12 text-orange-600" />
                                  </div>
                                  <audio 
                                    src={fileUrl} 
                                    controls 
                                    className="w-full max-w-md mx-auto"
                                  >
                                    Your browser does not support the audio tag.
                                  </audio>
                                </div>
                              </div>
                            );
                          }
                          
                          if (isImage) {
                            return (
                              <div className="w-full bg-gray-100 rounded-lg overflow-hidden">
                                <img
                                  src={fileUrl}
                                  alt={selectedScheduleItem.title || 'Content preview'}
                                  draggable={false}
                                  className="w-full h-auto max-h-[60vh] object-contain mx-auto"
                                  onError={(e) => {
                                    console.error('Image load error:', e);
                                    e.currentTarget.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2VlZSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5JbWFnZSBub3QgYXZhaWxhYmxlPC90ZXh0Pjwvc3ZnPg==';
                                  }}
                                />
                              </div>
                            );
                          }
                          
                          if (isGoogleDrive) {
                            return (
                              <div className="w-full">
                                <DriveViewer 
                                  driveUrl={fileUrl}
                                  title={selectedScheduleItem.title}
                                />
                              </div>
                            );
                          }
                          
                          // Default: show file info
                          return (
                            <div className="w-full bg-gray-100 rounded-lg p-4 sm:p-6 lg:p-8">
                              <div className="text-center space-y-4">
                                <div className="w-24 h-24 mx-auto bg-blue-100 rounded-full flex items-center justify-center">
                                  <File className="w-12 h-12 text-orange-600" />
                                </div>
                                <p className="text-gray-600">Preview not available for this file type</p>
                                <p className="text-xs sm:text-sm text-gray-500">
                                  This file can only be viewed in this preview window.
                                </p>
                              </div>
                            </div>
                          );
                        })()}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              <DialogFooter className="shrink-0 flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={() => {
                    setIsPreviewOpen(false);
                    setSelectedScheduleItem(null);
                  }}
                >
                  Close
                </Button>
                <Button
                  className="w-full sm:w-auto bg-gradient-to-r from-orange-400 to-orange-600 hover:from-orange-500 hover:to-orange-700 text-white"
                  onClick={() => handleToggleScheduleComplete(selectedScheduleItem, selectedScheduleItem.isQuiz)}
                >
                  <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
                  {completedScheduleIds.has(selectedScheduleItem._id || selectedScheduleItem.id)
                    ? 'Undo Complete'
                    : 'Mark as Complete'}
                </Button>
                {selectedScheduleItem.isQuiz && (
                  <Button
                    className="bg-gradient-to-r from-orange-400 to-orange-600 hover:from-orange-500 hover:to-orange-700 text-white"
                    onClick={() => {
                      setIsPreviewOpen(false);
                      setLocation('/learning-paths');
                    }}
                  >
                    Start Quiz
                  </Button>
                )}
                {!selectedScheduleItem.isQuiz &&
                  selectedScheduleItem.type === 'Homework' &&
                  !isIndividualAccount(user) && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setIsPreviewOpen(false);
                        setLocation('/student/homework');
                      }}
                    >
                      Submit Homework
                    </Button>
                  )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isHomeworkSubmitOpen} onOpenChange={setIsHomeworkSubmitOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Submit Homework</DialogTitle>
            <DialogDescription>
              Review the assigned homework and submit your solution link.
            </DialogDescription>
          </DialogHeader>

          {selectedHomeworkForSubmit && (
            <div className="space-y-4">
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p className="text-xs sm:text-sm font-semibold text-gray-900">
                  {selectedHomeworkForSubmit.title || 'Untitled Homework'}
                </p>
                <p className="text-xs text-gray-600 mt-1">
                  Subject: {getSubjectName(selectedHomeworkForSubmit)}
                  {selectedHomeworkForSubmit.deadline
                    ? ` â€¢ Due ${new Date(selectedHomeworkForSubmit.deadline).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })}`
                    : ''}
                </p>
                {selectedHomeworkForSubmit.fileUrl && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => {
                      setSelectedScheduleItem(selectedHomeworkForSubmit);
                      setIsPreviewOpen(true);
                    }}
                  >
                    <ExternalLink className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
                    View Teacher Homework
                  </Button>
                )}
              </div>

              <div>
                <label className="text-xs sm:text-sm font-medium text-gray-700">Upload Submission File</label>
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.jpg,.jpeg,.png,.gif"
                  onChange={(e) => setHomeworkSubmissionFile(e.target.files?.[0] || null)}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-xs sm:text-sm file:mr-3 file:rounded file:border-0 file:bg-orange-100 file:px-3 file:py-1 file:text-orange-700"
                />
                {homeworkSubmissionFile && (
                  <p className="mt-1 text-xs text-gray-600">Selected: {homeworkSubmissionFile.name}</p>
                )}
                {!homeworkSubmissionFile && homeworkSubmissionLink && (
                  <p className="mt-1 text-xs text-gray-600">
                    Current file already submitted. Upload a new file to replace it.
                  </p>
                )}
              </div>

              <div>
                <label className="text-xs sm:text-sm font-medium text-gray-700">Description (optional)</label>
                <textarea
                  value={homeworkSubmissionDescription}
                  onChange={(e) => setHomeworkSubmissionDescription(e.target.value)}
                  rows={3}
                  placeholder="Add short notes about your submission..."
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                />
              </div>

              {homeworkSubmitError && (
                <p className="text-xs sm:text-sm text-red-600">{homeworkSubmitError}</p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsHomeworkSubmitOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-gradient-to-r from-orange-400 to-orange-600 hover:from-orange-500 hover:to-orange-700 text-white"
              onClick={handleSubmitHomeworkFromDashboard}
              disabled={isSubmittingHomework}
            >
              {isSubmittingHomework ? 'Submitting...' : 'Submit Homework'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Video Modal */}
      <VideoModal
        isOpen={isVideoModalOpen}
        onClose={handleCloseVideoModal}
        video={selectedVideo}
      />
      {vidyaEnabled && !isMobile ? <VidyaAIFloatingAssistant /> : null}
    </StudentShell>
  );
}
