// @ts-nocheck
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { API_BASE_URL, openProtectedFile } from '@/lib/api-config';
import { getAuthToken, getUser as getStoredUser, getTeacherDisplayName, setUser as persistUser } from '@/lib/auth-utils';
import TeacherShell from '@/components/layout/TeacherShell';
import PortalPageHero from '@/components/layout/PortalPageHero';
import { DashboardScrollPanel } from '@/components/layout/DashboardScrollPanel';
import StatCard from '@/components/dashboard/StatCard';
import { WeeklyDigestCard } from '@/components/weekly-digest-card';
import { startTeacherPlatformSessionSync } from '@/lib/teacher-session-sync';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useLocation, useSearch } from 'wouter';
import { useIsMobile } from '@/hooks/use-mobile';
import { useConfirm } from '@/hooks/use-confirm';
import { 
  GraduationCap, 
  Users, 
  BookOpen, 
  Play, 
  Target, 
  TrendingUp,
  Calendar,
  Clock,
  Star,
  BarChart3,
  Plus,
  Eye,
  Edit,
  Trash2,
  Sparkles,
  Wrench,
  Menu,
  Search,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ArrowRight,
  RefreshCw,
  FileText,
  Zap,
  MessageCircle,
  ClipboardCheck,
  UserCheck,
  FileText as FileTextIcon,
  X,
  Filter,
  Radio,
  MessageSquare,
  AlertCircle,
  Lightbulb,
  FileQuestion,
  CheckSquare,
  Rocket,
  Layers,
  CreditCard,
  FileCheck,
  CheckCircle2,
  BookMarked
} from 'lucide-react';
import AIChat from '@/components/ai-chat';
import { TeacherTrackProgressPanels } from '@/components/teacher/TeacherTrackProgressPanels';
import { EduOTTVideoCard, EduOTTSubjectBadges } from '@/components/eduott/EduOTTVideoCard';
import type { EduOTTVideoCardItem } from '@/components/eduott/EduOTTVideoCard';
import { EduOTTVideoPlayerDialog } from '@/components/eduott/EduOTTVideoPlayerDialog';
import { EduOTTLiveSessionDialog } from '@/components/eduott/EduOTTLiveSessionDialog';
import { EduOTTJoinSessionButton } from '@/components/eduott/EduOTTJoinSessionButton';
import { EduOTTTabsList, eduOttTabTriggerClass } from '@/components/eduott/EduOTTTabsList';
import { EduOTTFeaturedHero, EduOTTStage } from '@/components/eduott/EduOTTStage';
import { getEduOTTThumbnailUrl, resolveContentDurationSeconds } from '@/lib/eduott-video-utils';
import { Skeleton } from '@/components/ui/skeleton';
import { InteractiveBackground, FloatingParticles } from "@/components/background/InteractiveBackground";
import { isVidyaEnabledForUser } from '@/lib/vidya-access';
import { TeacherVidyaToolsGrid } from '@/components/teacher/TeacherVidyaToolsGrid';
import { isAiToolVisibleForSubjects } from '@/lib/ai-tool-subject-rules';
import { TEACHER_AI_TOOLS_SUBTITLE } from '@/lib/teacher-ai-tools';
import { TeacherDashboardSchedule } from '@/components/teacher/TeacherDashboardSchedule';
import TeacherTimetableDashboard from '@/components/teacher/TeacherTimetableDashboard';
import { ClassCard } from '@/components/teacher/ClassCard';
import { TeacherWorkDiaryPanel } from '@/components/teacher/TeacherWorkDiaryPanel';
import { TeacherSettingsPanel } from '@/components/teacher/TeacherSettingsPanel';
import { useToast } from '@/hooks/use-toast';
import {
  buildTeacherVidyaSubjectSelectOptions,
  extractPlainSubjectName,
  getSubjectClassLabel,
  subjectCatalogGroupKey,
} from '@/lib/subject-names';
import { loadLearningPathCatalog } from '@/lib/learning-path-catalog';
import {
  countLearningPathDisplayStats,
  learningPathStatsTotal,
} from '@/lib/learning-path-stats';
import { resolveIsAsliPrepExclusive } from '@/lib/school-program';
import { getVideoDisplayTitle } from '@/lib/video-chapter-schedule';

// PDF Upload removed - AI tools now use Gemini API only

interface TeacherStats {
  totalStudents: number;
  totalClasses: number;
  totalVideos: number;
  learningPathVideos?: number;
  iitVideos?: number;
  averagePerformance: number;
  recentActivity: any[];
}

interface Student {
  id: string;
  name: string;
  email: string;
  classNumber: string;
  phone?: string;
  isActive?: boolean;
  createdAt?: string;
  lastLogin?: string;
  assignedClass?: {
    name?: string;
    classNumber?: string;
    section?: string;
  };
  performance?: {
    recentExamTitle?: string;
    recentMarks?: number;
    recentPercentage?: number;
    totalExams?: number;
    averageMarks?: number;
    averagePercentage?: number;
    overallProgress?: number;
    learningProgress?: number; // Content completion progress
    dailyAverageWatchTime?: number;
  };
}

function getStudentClassAndSection(student: Student) {
  const rawClass =
    student.assignedClass?.classNumber?.trim() ||
    student.classNumber?.trim() ||
    '';
  let section = student.assignedClass?.section?.trim() || '';
  let classNumber = rawClass.replace(/^Class\s*/i, '').trim();

  if (!section && classNumber && /^\d+[A-Za-z]+$/i.test(classNumber)) {
    const match = classNumber.match(/^(\d+)([A-Za-z]+)$/i);
    if (match) {
      classNumber = match[1];
      section = match[2].toUpperCase();
    }
  }

  return {
    classNumber: classNumber || null,
    section: section || null,
  };
}

function buildSubmissionClassSectionMap(
  studentList: Student[],
  assignedClassList: { classNumber?: string; section?: string }[]
) {
  const map = new Map<string, Set<string>>();

  assignedClassList.forEach((c) => {
    const classNumber = String(c.classNumber || '')
      .replace(/^Class\s*/i, '')
      .trim();
    const section = String(c.section || '').trim().toUpperCase();
    if (!classNumber) return;
    if (!map.has(classNumber)) map.set(classNumber, new Set());
    if (section) map.get(classNumber)!.add(section);
  });

  studentList.forEach((student) => {
    const { classNumber, section } = getStudentClassAndSection(student);
    if (!classNumber) return;
    if (!map.has(classNumber)) map.set(classNumber, new Set());
    if (section) map.get(classNumber)!.add(section);
  });

  return map;
}

function sortClassNumbers(a: string, b: string) {
  const na = parseInt(a, 10);
  const nb = parseInt(b, 10);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  return a.localeCompare(b);
}

function getStudentsInClassSection(
  studentList: Student[],
  classNumber: string,
  section: string
) {
  return studentList.filter((student) => {
    const parsed = getStudentClassAndSection(student);
    return parsed.classNumber === classNumber && parsed.section === section;
  });
}

interface Video {
  id: string;
  title: string;
  subject: string;
  duration: string;
  views: number;
  createdAt: string;
}

interface Assessment {
  id: string;
  title: string;
  subject: string;
  questions: number;
  attempts: number;
  averageScore: number;
  createdAt: string;
  createdBy?: {
    name: string;
    email: string;
  };
}


const TeacherDashboard = () => {
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const notify = (message, variant = 'default') => {
    toast({
      title: variant === 'destructive' ? 'Error' : 'Notice',
      description: message,
      variant,
    });
  };
  const [dashboardSubTab, setDashboardSubTab] = useState<
    | 'ai-classes'
    | 'classes'
    | 'students'
    | 'eduott'
    | 'vidya-ai'
    | 'learning-paths'
    | 'calendar'
    | 'settings'
    | 'reports'
  >('ai-classes');
  const [stats, setStats] = useState<TeacherStats>({
    totalStudents: 0,
    totalClasses: 0,
    totalVideos: 0,
    learningPathVideos: 0,
    iitVideos: 0,
    totalAssessments: 0,
    averagePerformance: 0,
    recentActivity: []
  });
  const [students, setStudents] = useState<Student[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [videos, setVideos] = useState<Video[]>([]);
  const [eduottVideos, setEduottVideos] = useState<Video[]>([]);
  const [eduottSearchTerm, setEduottSearchTerm] = useState('');
  const [eduottClassFilter, setEduottClassFilter] = useState<string>('all');
  const [eduottSubjectFilter, setEduottSubjectFilter] = useState<string>('all');
  const [isLoadingEduott, setIsLoadingEduott] = useState(false);
  const [selectedEduottVideo, setSelectedEduottVideo] = useState<EduOTTVideoCardItem | null>(null);
  const [selectedLiveSession, setSelectedLiveSession] = useState<any | null>(null);
  const [eduottActiveTab, setEduottActiveTab] = useState<'videos' | 'live-sessions'>('videos');
  const [liveSessions, setLiveSessions] = useState<any[]>([]);
  const [isLoadingLiveSessions, setIsLoadingLiveSessions] = useState(false);
  const [sessionSearchTerm, setSessionSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [sessionClassFilter, setSessionClassFilter] = useState<string>('all');
  const [sessionSubjectFilter, setSessionSubjectFilter] = useState<string>('all');
  const [assignedClasses, setAssignedClasses] = useState<any[]>([]);
  const [teacherSubjects, setTeacherSubjects] = useState<any[]>([]);
  const [availableClasses, setAvailableClasses] = useState<{classNumber: string, subjects: any[]}[]>([]);
  const [selectedClassSubjects, setSelectedClassSubjects] = useState<any[]>([]);
  const [isLoadingSubjects, setIsLoadingSubjects] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [teacherEmail, setTeacherEmail] = useState<string>(localStorage.getItem('userEmail') || '');
  const [teacherUser, setTeacherUser] = useState<any>(() => getStoredUser());
  const [expandedClasses, setExpandedClasses] = useState<Set<string>>(new Set());
  const [, setLocation] = useLocation();
  const search = useSearch();
  const isMobile = useIsMobile();

  type DashboardSubTab =
    | 'ai-classes'
    | 'classes'
    | 'students'
    | 'eduott'
    | 'vidya-ai'
    | 'learning-paths'
    | 'calendar'
    | 'settings'
    | 'reports';

  const tabToUrl = (tab: DashboardSubTab): string => {
    switch (tab) {
      case 'ai-classes':
        return 'overview';
      case 'eduott':
        return 'edu-ott';
      default:
        return tab;
    }
  };

  const selectDashboardSubTab = useCallback((tab: DashboardSubTab) => {
    if (tab === 'eduott') {
      setLocation('/edu-ott');
      return;
    }
    if (tab === 'learning-paths') {
      setLocation('/learning-paths');
      return;
    }
    if (tab === 'reports') {
      setStudentsSubTab('track-progress');
    }
    setDashboardSubTab(tab);
    if (tab === 'vidya-ai') {
      localStorage.removeItem('teacherDashboardTab');
    }
    // Replace so browser Back does not walk through every sidebar tab.
    setLocation(`/teacher/dashboard?tab=${tabToUrl(tab)}`, { replace: true });
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [setLocation]);

  const vidyaChatEnabled = isVidyaEnabledForUser(teacherUser);
  const isIndividualTeacher = Boolean(teacherUser) &&
    !teacherUser?.schoolId &&
    !teacherUser?.assignedAdmin &&
    !String(teacherUser?.schoolName || '').trim();

  useEffect(() => {
    if (!isIndividualTeacher) return;
    setDashboardSubTab('vidya-ai');
    setVidyaAiTab('teacher-tools');
  }, [isIndividualTeacher]);

  const teacherSubjectNames = useMemo(
    () =>
      (teacherSubjects || [])
        .map((s: any) => String(s?.name || s?.displayName || '').trim())
        .filter(Boolean),
    [teacherSubjects],
  );

  const teacherVidyaSubjectSelectOptions = useMemo(
    () => buildTeacherVidyaSubjectSelectOptions(teacherSubjects || []),
    [teacherSubjects],
  );

  const teacherVidyaSubjectValues = useMemo(
    () => teacherVidyaSubjectSelectOptions.map((row) => row.value),
    [teacherVidyaSubjectSelectOptions],
  );

  useEffect(() => {
    const raw = search || '';
    const q = raw.startsWith('?') ? raw.slice(1) : raw;
    const tab = new URLSearchParams(q).get('tab');
    if (!tab) return;
    // Brand logo / home uses ?tab=overview
    if (tab === 'overview' || tab === 'ai-classes') {
      setDashboardSubTab('ai-classes');
      return;
    }
    if (tab === 'classes') {
      setDashboardSubTab('classes');
      return;
    }
    if (tab === 'edu-ott' || tab === 'eduott') {
      setLocation('/edu-ott', { replace: true });
      return;
    }
    if (tab === 'learning-paths') {
      setLocation('/learning-paths', { replace: true });
      return;
    }
    if (tab === 'calendar' || tab === 'timetable') {
      setDashboardSubTab('calendar');
      return;
    }
    if (tab === 'reports') {
      setDashboardSubTab('reports');
      setStudentsSubTab('track-progress');
      return;
    }
    if (
      tab === 'students' ||
      tab === 'vidya-ai' ||
      tab === 'settings'
    ) {
      setDashboardSubTab(tab);
    }
  }, [search, setLocation]);

  const [subjectsWithContent, setSubjectsWithContent] = useState<any[]>([]);
  const [isAsliPrepExclusive, setIsAsliPrepExclusive] = useState(false);
  
  // Remark states
  const [isRemarkDialogOpen, setIsRemarkDialogOpen] = useState(false);
  const [selectedStudentForRemark, setSelectedStudentForRemark] = useState<Student | null>(null);
  const [remarkText, setRemarkText] = useState('');
  const [isSubmittingRemark, setIsSubmittingRemark] = useState(false);
  const [selectedSubjectForRemark, setSelectedSubjectForRemark] = useState<string>('general');
  const [isPositiveRemark, setIsPositiveRemark] = useState(true);
  const [studentsSubTab, setStudentsSubTab] = useState<
    'list' | 'track-progress' | 'submissions' | 'daily'
  >('list');
  const [isLoadingProgress, setIsLoadingProgress] = useState(false);
  const [trackProgressRemarks, setTrackProgressRemarks] = useState<any[]>([]);
  const [aiProgressInsights, setAiProgressInsights] = useState('');
  const [isLoadingAiInsights, setIsLoadingAiInsights] = useState(false);
  const aiRefreshSeedRef = useRef(0);
  const [filterByClass, setFilterByClass] = useState<string>('all');
  const [filterByStudent, setFilterByStudent] = useState<string>('all');
  const [progressDetailStudentId, setProgressDetailStudentId] = useState<string | null>(null);
  useEffect(() => {
    setEduottSubjectFilter('all');
  }, [eduottClassFilter]);

  useEffect(() => {
    setSessionSubjectFilter('all');
  }, [sessionClassFilter]);
  const [homeworkSubmissions, setHomeworkSubmissions] = useState<{
    homeworks?: any[];
    students?: any[];
  }>({ homeworks: [], students: [] });
  const [isLoadingSubmissions, setIsLoadingSubmissions] = useState(false);
  const [deletingHomeworkId, setDeletingHomeworkId] = useState<string | null>(null);
  const [expandedHomework, setExpandedHomework] = useState<Set<string>>(new Set());
  const [expandedStudent, setExpandedStudent] = useState<Set<string>>(new Set());
  const [expandedSubmissionClasses, setExpandedSubmissionClasses] = useState<Set<string>>(
    new Set()
  );
  const [expandedSubmissionSections, setExpandedSubmissionSections] = useState<Set<string>>(
    new Set()
  );

  const preserveScrollOnFilterChange = (setter: (value: string) => void, value: string) => {
    const currentY = window.scrollY;
    setter(value);
    requestAnimationFrame(() => {
      window.scrollTo({ top: currentY, behavior: 'auto' });
    });
  };

  // Modal states
  const [isAddVideoModalOpen, setIsAddVideoModalOpen] = useState(false);
  const [isVideoViewerOpen, setIsVideoViewerOpen] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<any>(null);
  const [isCreatingVideo, setIsCreatingVideo] = useState(false);

  // Form states
  const [videoForm, setVideoForm] = useState({
    title: '',
    description: '',
    videoUrl: '',
    subject: '',
    duration: '',
    difficulty: 'beginner' // Changed from 'medium' to 'beginner'
  });


  // Lesson Plan form state
  const [lessonPlanForm, setLessonPlanForm] = useState({
    subject: '',
    topic: '',
    gradeLevel: '',
    duration: '90' // Default to 90 minutes for JEE coaching
  });

  const [isGeneratingLessonPlan, setIsGeneratingLessonPlan] = useState(false);
  const [generatedLessonPlan, setGeneratedLessonPlan] = useState('');
  const [vidyaAiTab, setVidyaAiTab] = useState<'teacher-tools' | 'chat'>('teacher-tools');
  const [teacherChatFocusTab, setTeacherChatFocusTab] = useState<'lesson-planning' | 'assessments' | 'classroom-help'>('lesson-planning');

  useEffect(() => {
    if (!vidyaChatEnabled && dashboardSubTab === 'vidya-ai' && vidyaAiTab === 'chat') {
      setVidyaAiTab('teacher-tools');
    }
  }, [vidyaChatEnabled, dashboardSubTab, vidyaAiTab]);

  useEffect(() => {
    return startTeacherPlatformSessionSync();
  }, []);

  const [teacherId, setTeacherId] = useState<string>('');
  
  // Quiz Generator form state
  const [quizForm, setQuizForm] = useState({
    subject: '',
    topic: '',
    gradeLevel: '',
    questionCount: '10',
    difficulty: 'medium',
    assignedClasses: [] as string[]
  });
  const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false);
  const [generatedQuiz, setGeneratedQuiz] = useState<any>(null);
  const [isSavingQuiz, setIsSavingQuiz] = useState(false);
  
  // Grading form state
  const [gradingForm, setGradingForm] = useState({
    rubric: '',
    studentWork: '',
    uploadedFile: null as File | null
  });
  const [isGrading, setIsGrading] = useState(false);
  const [gradingResult, setGradingResult] = useState<string>('');

  // Homework creation form state
  const [isHomeworkModalOpen, setIsHomeworkModalOpen] = useState(false);
  const [isCreatingHomework, setIsCreatingHomework] = useState(false);
  const localYmd = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const [homeworkForm, setHomeworkForm] = useState({
    title: '',
    description: '',
    subject: '',
    classNumber: '',
    topic: '',
    date: (() => {
      const d = new Date();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    })(),
    deadline: '',
    fileUrl: ''
  });
  const [selectedHomeworkFile, setSelectedHomeworkFile] = useState<File | null>(null);
  const [isUploadingHomeworkFile, setIsUploadingHomeworkFile] = useState(false);

  useEffect(() => {
    // Check for saved tab preference from tool pages first
    const savedTab = localStorage.getItem('teacherDashboardTab');
    const allowed = [
      'ai-classes',
      'classes',
      'students',
      'eduott',
      'vidya-ai',
      'learning-paths',
      'calendar',
      'settings',
    ];
    if (savedTab && allowed.includes(savedTab)) {
      setDashboardSubTab(savedTab as typeof dashboardSubTab);
      localStorage.removeItem('teacherDashboardTab');
    }
    
    // Fetch data after state is set
    fetchTeacherData();
    fetchTeacherUser();
  }, []);

  // Fetch teacher user data for chat
  const fetchTeacherUser = async () => {
    try {
      const token = getAuthToken();

      const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const userData = await response.json();
        const me = userData.user || userData;
        if (me) {
          setTeacherUser((prev: any) => {
            const next = { ...(prev || {}), ...me };
            persistUser(next);
            return next;
          });
          if (me._id || me.id) {
            setTeacherId(me._id || me.id);
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch teacher user:', error);
    }
  };

  const fetchTeacherSubjectsFallback = async (token: string) => {
    try {
      const subjectsRes = await fetch(`${API_BASE_URL}/api/teacher/subjects`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      if (subjectsRes.ok) {
        const subjectsJson = await subjectsRes.json();
        const subjectRows = Array.isArray(subjectsJson?.data)
          ? subjectsJson.data
          : Array.isArray(subjectsJson?.subjects)
            ? subjectsJson.subjects
            : [];
        if (subjectRows.length > 0) {
          return subjectRows;
        }
      }
    } catch (error) {
      console.warn('[Mobile Debug] /api/teacher/subjects fallback failed:', error);
    }

    try {
      const meRes = await fetch(`${API_BASE_URL}/api/auth/me`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      if (meRes.ok) {
        const meJson = await meRes.json();
        const meSubjects = Array.isArray(meJson?.user?.subjects) ? meJson.user.subjects : [];
        return meSubjects;
      }
    } catch (error) {
      console.warn('[Mobile Debug] /api/auth/me fallback failed:', error);
    }

    return [];
  };

  const trackProgressFilteredStudents = useMemo(() => {
    let list = students;
    if (filterByClass !== 'all') {
      list = list.filter((s) => {
        const studentClass = s.classNumber || s.assignedClass?.classNumber;
        return studentClass === filterByClass;
      });
    }
    if (filterByStudent !== 'all') {
      list = list.filter(
        (s) =>
          String(s.id || (s as { _id?: string })._id) === String(filterByStudent)
      );
    }
    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      list = list.filter((s) => {
        const name = (s.name || s.email || '').toLowerCase();
        const email = (s.email || '').toLowerCase();
        const phone = (s.phone || '').toLowerCase();
        return (
          name.includes(lowerSearch) ||
          email.includes(lowerSearch) ||
          phone.includes(lowerSearch)
        );
      });
    }
    return list;
  }, [students, filterByClass, filterByStudent, searchTerm]);

  // Fetch student performance data when Track Progress / Reports is active
  useEffect(() => {
    if (
      dashboardSubTab === 'reports' ||
      (dashboardSubTab === 'students' && studentsSubTab === 'track-progress')
    ) {
      setIsLoadingProgress(true);
      fetchStudentPerformance()
        .then(() => Promise.all([fetchTrackProgressRemarks(), fetchHomeworkSubmissions()]))
        .finally(() => {
          setIsLoadingProgress(false);
        });
    }
  }, [dashboardSubTab, studentsSubTab]);

  // Fetch homework submissions when Submissions tab is active
  useEffect(() => {
    if (dashboardSubTab === 'students' && studentsSubTab === 'submissions') {
      fetchHomeworkSubmissions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboardSubTab, studentsSubTab]);

  // Fetch homework submissions
  const fetchHomeworkSubmissions = async () => {
    setIsLoadingSubmissions(true);
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE_URL}/api/teacher/homework-submissions`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data) {
          setHomeworkSubmissions(data.data);
        } else {
          setHomeworkSubmissions({ homeworks: [], students: [] });
        }
      } else {
        setHomeworkSubmissions({ homeworks: [], students: [] });
      }
    } catch (error) {
      console.error('Failed to fetch homework submissions:', error);
    } finally {
      setIsLoadingSubmissions(false);
    }
  };

  // Fetch EduOTT videos when tab is active
  useEffect(() => {
    const fetchEduottVideos = async () => {
      if (dashboardSubTab !== 'eduott' || eduottActiveTab !== 'videos') return;
      
      // Don't fetch if teacher has no assigned subjects
      if (!teacherSubjects || teacherSubjects.length === 0) {
        setEduottVideos([]);
        setIsLoadingEduott(false);
        return;
      }
      
      try {
        setIsLoadingEduott(true);
        const token = getAuthToken();

        // Fetch video content from Content model (filtered by teacher's assigned subjects and type=Video)
        const response = await fetch(`${API_BASE_URL}/api/teacher/asli-prep-content?type=Video&surface=eduott`, {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            'Content-Type': 'application/json',
          }
        });

        if (response.ok) {
          const data = await response.json();
          const videosList = data.data || data || [];
          
          console.log('📹 Fetched videos from database for teacher:', videosList.length, 'videos');
          if (videosList.length > 0) {
            console.log('📹 Sample video from database:', {
              _id: videosList[0]._id,
              title: videosList[0].title,
              fileUrl: videosList[0].fileUrl,
              subject: videosList[0].subject
            });
          }
          
          // Map Content model data to match UI expectations
          const videosWithSubjects = videosList.map((content: any) => {
            // Content model has subject populated with { _id, name }
            const subjectName = content.subject?.name || content.subject || 'Unknown Subject';
            const subjectId = content.subject?._id || content.subject;
            
            const durationInSeconds = resolveContentDurationSeconds({
              duration: content.duration,
              durationSeconds: content.durationSeconds,
            });
            const durationInMinutes =
              durationInSeconds > 0 ? Math.max(1, Math.round(durationInSeconds / 60)) : 0;
            
            // Ensure fileUrl is properly formatted (handle relative/absolute URLs from database)
            let videoFileUrl = content.fileUrl;
            if (videoFileUrl && !videoFileUrl.startsWith('http') && !videoFileUrl.startsWith('//')) {
              // If it's a relative URL, prepend API base URL
              if (videoFileUrl.startsWith('/')) {
                videoFileUrl = `${API_BASE_URL}${videoFileUrl}`;
              } else {
                videoFileUrl = `${API_BASE_URL}/${videoFileUrl}`;
              }
            }
            
            return {
              _id: content._id,
              id: content._id,
              title: getVideoDisplayTitle({ ...content, type: 'Video' }),
              description: content.description || '',
              fileUrl: videoFileUrl, // Use properly formatted fileUrl from database
              videoUrl: videoFileUrl, // Map fileUrl to videoUrl for compatibility
              thumbnailUrl: content.thumbnailUrl, // Thumbnail from database
              duration: durationInMinutes,
              durationSeconds: durationInSeconds,
              views: content.views || 0,
              createdAt: content.createdAt,
              subject: subjectName,
              subjectName: subjectName,
              subjectId: subjectId,
              board: content.board,
              topic: content.topic,
              classNumber: content.classNumber,
              // Check if it's a YouTube URL
              isYouTubeVideo: content.fileUrl && (
                content.fileUrl.includes('youtube.com') || 
                content.fileUrl.includes('youtu.be')
              ),
              youtubeUrl: (content.fileUrl && (
                content.fileUrl.includes('youtube.com') || 
                content.fileUrl.includes('youtu.be')
              )) ? content.fileUrl : null
            };
          });
          
          setEduottVideos(videosWithSubjects);
        } else {
          console.error('Failed to fetch videos:', response.status);
          setEduottVideos([]);
        }
      } catch (error) {
        console.error('Failed to fetch EduOTT videos:', error);
        setEduottVideos([]);
      } finally {
        setIsLoadingEduott(false);
      }
    };

    if (dashboardSubTab === 'eduott' && eduottActiveTab === 'videos') {
      fetchEduottVideos();
    }
  }, [dashboardSubTab, teacherSubjects, eduottActiveTab]);

  useEffect(() => {
    const fetchLiveSessions = async () => {
      if (dashboardSubTab !== 'eduott' || eduottActiveTab !== 'live-sessions') return;

      try {
        setIsLoadingLiveSessions(true);
        const token = getAuthToken();

        const response = await fetch(`${API_BASE_URL}/api/teacher/streams`, {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const data = await response.json();
          setLiveSessions(data.data || data || []);
        } else {
          setLiveSessions([]);
        }
      } catch (error) {
        console.error('Failed to fetch live sessions:', error);
        setLiveSessions([]);
      } finally {
        setIsLoadingLiveSessions(false);
      }
    };

    if (dashboardSubTab === 'eduott' && eduottActiveTab === 'live-sessions') {
      fetchLiveSessions();
    }
  }, [dashboardSubTab, eduottActiveTab]);

  useEffect(() => {
    const loadProgram = async () => {
      try {
        const token = getAuthToken();
        const res = await fetch(`${API_BASE_URL}/api/auth/me`, {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            'Content-Type': 'application/json',
          },
        });
        if (res.ok) {
          const data = await res.json();
          setIsAsliPrepExclusive(resolveIsAsliPrepExclusive(data?.user));
        }
      } catch {
        /* ignore */
      }
    };
    void loadProgram();
  }, []);

  useEffect(() => {
    const loadLearningPaths = async () => {
      if (dashboardSubTab !== 'learning-paths') return;
      setIsLoadingSubjects(true);
      try {
        const rows = await loadLearningPathCatalog('teacher', isAsliPrepExclusive);
        setSubjectsWithContent(rows);
      } catch (error) {
        console.error('Failed to fetch learning path catalog:', error);
        setSubjectsWithContent([]);
      } finally {
        setIsLoadingSubjects(false);
      }
    };
    void loadLearningPaths();
  }, [dashboardSubTab, isAsliPrepExclusive]);

  const handleViewVideo = (video: any) => {
    setSelectedVideo(video);
    setIsVideoViewerOpen(true);
  };

  const handleDeleteVideo = async (video: any) => {
    const ok = await confirm({
      title: 'Delete this video?',
      description: `Are you sure you want to delete "${video.title}"?`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;

    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE_URL}/api/videos/${video.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        setVideos(prev => prev.filter(v => v.id !== video.id));
        notify('Video deleted successfully!');
      } else {
        const error = await response.json().catch(() => ({ message: 'Failed to delete video' }));
        notify(`Failed to delete video: ${error.message}`);
      }
    } catch (error) {
      console.error('Delete video error:', error);
      notify('Failed to delete video. Please try again.');
    }
  };


  const handleCreateVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreatingVideo(true);

    try {
      const token = getAuthToken();
      console.log('Creating video with data:', videoForm);
      console.log('Using token:', token ? 'Token present' : 'No token');
      
      // Convert YouTube watch/short URL to embeddable URL
      const toEmbedUrl = (url: string) => {
        try {
          if (!url) return '';
          const u = new URL(url);
          // youtu.be/<id>
          if (u.hostname.includes('youtu.be')) {
            const id = u.pathname.split('/').filter(Boolean).pop();
            return id ? `https://www.youtube.com/embed/${id}` : url;
          }
          // www.youtube.com/watch?v=<id>
          const id = u.searchParams.get('v');
          if (id) return `https://www.youtube.com/embed/${id}`;
          return url;
        } catch {
          return url;
        }
      };

      const payload = {
        ...videoForm,
        videoUrl: toEmbedUrl(videoForm.videoUrl),
        difficulty: videoForm.difficulty === 'medium' ? 'intermediate' : videoForm.difficulty
      };

      // Use teacher endpoint with auth so createdBy/adminId are set to the teacher
      let response = await fetch(`${API_BASE_URL}/api/teacher/videos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      console.log('Response status:', response.status);
      console.log('Response ok:', response.ok);

      if (response && response.ok) {
        const result = await response.json();
        const created: any = result && (result.data || result);
        const normalized = {
          id: created._id || created.id || `tmp-${Date.now()}`,
          title: created.title || payload.title,
          subject: created.subject || created.subjectId || payload.subject,
          duration: created.duration || payload.duration,
          views: created.views || 0,
          createdAt: created.createdAt || new Date().toISOString(),
          videoUrl: created.videoUrl || payload.videoUrl,
          difficulty: created.difficulty || payload.difficulty
        };
        setVideos(prev => [normalized, ...prev]);

        // Show success message first
        notify('Video created successfully!');

        // Close modal and reset form without re-fetching to avoid disappearance
        setIsAddVideoModalOpen(false);
        setVideoForm({ title: '', description: '', videoUrl: '', subject: '', duration: '', difficulty: 'beginner' });
      } else {
        const error = await response.json().catch(() => ({ message: 'Unknown error' }));
        console.log('Video creation error details:', error);
        notify(`Failed to create video: ${error.message || error.error || 'Server error'}`);
      }
    } catch (error) {
      console.error('Failed to create video:', error);
      notify(`Failed to create video: ${error.message || 'Please check your internet connection and try again.'}`);
    } finally {
      setIsCreatingVideo(false);
    }
  };

  const handleGenerateLessonPlan = async () => {
    if (!lessonPlanForm.subject || !lessonPlanForm.topic || !lessonPlanForm.gradeLevel) {
      notify('Please fill in all required fields');
      return;
    }

    setIsGeneratingLessonPlan(true);
    setGeneratedLessonPlan('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/lesson-plan/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAuthToken()}`
        },
        body: JSON.stringify(lessonPlanForm)
      });

      if (response.ok) {
        const result = await response.json();
        setGeneratedLessonPlan(result.lessonPlan);
      } else {
        const error = await response.json();
        notify(`Failed to generate lesson plan: ${error.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to generate lesson plan:', error);
      notify('Failed to generate lesson plan. Please try again.');
    } finally {
      setIsGeneratingLessonPlan(false);
    }
  };

  const handleGenerateQuiz = async () => {
    if (!quizForm.subject || !quizForm.topic || !quizForm.gradeLevel || !quizForm.questionCount) {
      notify('Please fill in all required fields');
      return;
    }

    setIsGeneratingQuiz(true);
    setGeneratedQuiz(null);

    try {
      const token = getAuthToken();
      
      // Step 1: Generate quiz using Gemini API
      const generateResponse = await fetch(`${API_BASE_URL}/api/teacher/ai/test-questions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          subject: quizForm.subject,
          topic: quizForm.topic,
          gradeLevel: quizForm.gradeLevel,
          questionCount: parseInt(quizForm.questionCount),
          difficulty: quizForm.difficulty
        })
      });

      if (!generateResponse.ok) {
        const error = await generateResponse.json();
        notify(`Failed to generate quiz: ${error.message || 'Unknown error'}`);
        setIsGeneratingQuiz(false);
        return;
      }

      const result = await generateResponse.json();
      
      // Parse the generated questions
      let questionsData;
      try {
        let rawText = typeof result.data.testQuestions === 'string' 
          ? result.data.testQuestions 
          : JSON.stringify(result.data.testQuestions);
        
        // Clean up markdown code blocks if present
        rawText = rawText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
        
        // Try to extract JSON if it's wrapped in other text
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          rawText = jsonMatch[0];
        }
        
        questionsData = JSON.parse(rawText);
      } catch (parseError) {
        console.error('Failed to parse quiz questions:', parseError);
        console.error('Raw response:', result.data.testQuestions);
        notify('Failed to parse generated quiz. The AI response may be malformed. Please try again.');
        setIsGeneratingQuiz(false);
        return;
      }

      const generatedQuizData = {
        ...result.data,
        parsedQuestions: questionsData
      };
      setGeneratedQuiz(generatedQuizData);

      // Step 2: Save quiz to database immediately
      // Find the subject ID from teacherSubjects
      const selectedSubject = teacherSubjects.find((s: any) => 
        s.name?.toLowerCase() === quizForm.subject.toLowerCase()
      );
      
      if (!selectedSubject) {
        notify('Subject not found. Please select a valid subject.');
        setIsGeneratingQuiz(false);
        return;
      }

      // Format questions for the API (matching Assessment model schema)
      const formattedQuestions = questionsData.questions?.map((q: any) => {
        // Extract options as strings (Assessment model expects array of strings)
        const options = q.options?.map((opt: string | { text: string; isCorrect?: boolean }) => {
          if (typeof opt === 'string') {
            return opt;
          }
          return opt.text || String(opt);
        }) || [];

        return {
          question: q.question || q.questionText || '',
          type: q.type === 'multiple-choice' ? 'multiple-choice' : (q.type || 'multiple-choice'),
          options: options,
          correctAnswer: q.correctAnswer || options[0] || '',
          explanation: q.explanation || '',
          points: 1
        };
      }) || [];

      // Convert subject ID to string
      const subjectId = selectedSubject._id 
        ? (typeof selectedSubject._id === 'string' ? selectedSubject._id : String(selectedSubject._id))
        : String(selectedSubject.id || selectedSubject._id);
      
      // Convert assigned classes to strings (they'll be converted to ObjectIds in backend)
      const assignedClassesIds = quizForm.assignedClasses.map((classId: any) => 
        typeof classId === 'string' ? classId : String(classId)
      );

      const quizData = {
        title: `Quiz: ${quizForm.topic} - ${quizForm.subject}`,
        description: `AI-generated quiz for ${quizForm.subject} - ${quizForm.topic} (${quizForm.gradeLevel})`,
        subject: subjectId,
        duration: 60,
        difficulty: quizForm.difficulty,
        questions: formattedQuestions,
        assignedClasses: assignedClassesIds
      };
      
      console.log('Saving quiz with data:', {
        title: quizData.title,
        subject: quizData.subject,
        questionsCount: quizData.questions.length,
        assignedClasses: quizData.assignedClasses
      });

      const saveResponse = await fetch(`${API_BASE_URL}/api/teacher/quizzes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(quizData)
      });

      if (saveResponse.ok) {
        const savedQuiz = await saveResponse.json();
        
        // If classes are assigned, assign the quiz to those classes
        if (quizForm.assignedClasses.length > 0 && savedQuiz.data?._id) {
          try {
            const assignResponse = await fetch(`${API_BASE_URL}/api/teacher/quizzes/${savedQuiz.data._id}/assign`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({
                classIds: quizForm.assignedClasses
              })
            });

            if (assignResponse.ok) {
              notify(`Quiz generated and assigned to ${quizForm.assignedClasses.length} class(es) successfully!`);
            } else {
              notify('Quiz generated and saved but failed to assign to classes. You can assign it later.');
            }
          } catch (assignError) {
            console.error('Failed to assign quiz:', assignError);
            notify('Quiz generated and saved but failed to assign to classes. You can assign it later.');
          }
        } else {
          notify('Quiz generated and saved successfully!');
        }
        
        // Don't clear the generated quiz - keep it visible so user can see it
        // Only reset the form inputs, but keep the quiz displayed
        setQuizForm({
          subject: '',
          topic: '',
          gradeLevel: '',
          questionCount: '10',
          difficulty: 'medium',
          assignedClasses: []
        });
        
        // Optionally, you can scroll to show the saved quiz
        setTimeout(() => {
          const quizSection = document.getElementById('generated-quiz-section');
          if (quizSection) {
            quizSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 100);
      } else {
        let errorMessage = 'Unknown error';
        try {
          const errorData = await saveResponse.json();
          errorMessage = errorData.error || errorData.message || errorData.details || 'Unknown error';
          console.error('Failed to save quiz - Full error:', errorData);
          console.error('Response status:', saveResponse.status);
        } catch (parseError) {
          const errorText = await saveResponse.text();
          errorMessage = errorText || 'Failed to parse error response';
          console.error('Failed to parse error response:', errorText);
        }
        notify(`Quiz generated but failed to save: ${errorMessage}`);
      }
    } catch (error) {
      console.error('Failed to generate quiz:', error);
      notify('Failed to generate quiz. Please try again.');
    } finally {
      setIsGeneratingQuiz(false);
    }
  };

  // Handle homework file upload
  const handleHomeworkFileUpload = async (file: File): Promise<string> => {
    setIsUploadingHomeworkFile(true);
    try {
      const maxBytes = 25 * 1024 * 1024;
      if (file.size > maxBytes) {
        throw new Error('File is too large. Maximum size is 25MB.');
      }

      const formData = new FormData();
      formData.append('file', file);
      
      const token = getAuthToken();
      if (!token) {
        throw new Error('Please sign in again, then retry creating homework.');
      }

      const response = await fetch(`${API_BASE_URL}/api/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      const data = await response.json().catch(() => ({} as { message?: string; url?: string; fileUrl?: string }));
      if (!response.ok) {
        throw new Error(
          data.message ||
            (response.status === 404
              ? 'File upload service is unavailable. Please try again later or paste a file URL instead.'
              : `File upload failed (${response.status}).`)
        );
      }

      const uploadedUrl = data.url || data.fileUrl;
      if (!uploadedUrl) {
        throw new Error('Upload succeeded but no file link was returned. Please try again or use a URL.');
      }
      return uploadedUrl;
    } catch (error) {
      console.error('File upload error:', error);
      throw error;
    } finally {
      setIsUploadingHomeworkFile(false);
    }
  };

  // Handle homework creation
  const handleCreateHomework = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!homeworkForm.title || !homeworkForm.subject || !homeworkForm.date || !homeworkForm.deadline) {
      notify('Please fill in all required fields (title, subject, date, and deadline).');
      return;
    }

    if (homeworkForm.deadline < homeworkForm.date) {
      notify('Deadline must be on or after the homework date');
      return;
    }

    if (!homeworkForm.fileUrl && !selectedHomeworkFile) {
      notify('Please upload a file or paste a file URL.');
      return;
    }

    setIsCreatingHomework(true);
    try {
      let fileUrl = homeworkForm.fileUrl.trim();
      
      // Upload file if selected
      if (selectedHomeworkFile && !fileUrl) {
        fileUrl = await handleHomeworkFileUpload(selectedHomeworkFile);
      }

      if (!fileUrl) {
        notify('A homework file or URL is required.');
        return;
      }

      const token = getAuthToken();
      if (!token) {
        notify('Please sign in again, then retry creating homework.');
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/teacher/homework`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: homeworkForm.title,
          description: homeworkForm.description,
          subject: homeworkForm.subject,
          classNumber: homeworkForm.classNumber || undefined,
          topic: homeworkForm.topic || undefined,
          date: homeworkForm.date,
          deadline: homeworkForm.deadline,
          fileUrl: fileUrl
        })
      });

      const data = await response.json().catch(() => ({} as { success?: boolean; message?: string; error?: string }));
      if (response.ok && data.success) {
        notify('Homework created successfully!');
        setIsHomeworkModalOpen(false);
        setHomeworkForm({
          title: '',
          description: '',
          subject: '',
          classNumber: '',
          topic: '',
          date: localYmd(),
          deadline: '',
          fileUrl: ''
        });
        setSelectedHomeworkFile(null);
        // Refresh homework submissions
        fetchHomeworkSubmissions();
      } else {
        const detail = [data.message, data.error].filter(Boolean).join(' — ');
        notify(detail || `Failed to create homework (${response.status}).`);
      }
    } catch (error) {
      console.error('Create homework error:', error);
      const message =
        error instanceof Error && error.message
          ? error.message
          : 'Failed to create homework. Please try again.';
      notify(message);
    } finally {
      setIsCreatingHomework(false);
    }
  };

  const handleDeleteHomework = async (homework: any) => {
    const homeworkId = String(homework?._id || homework?.id || '').trim();
    if (!homeworkId) {
      notify('Could not delete this homework — missing id. Refresh and try again.');
      return;
    }
    const ok = await confirm({
      title: 'Delete this homework?',
      description: `Are you sure you want to delete "${homework.title || 'this homework'}"? Students will no longer see it.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;

    setDeletingHomeworkId(homeworkId);
    try {
      const token = getAuthToken();
      const headers = { Authorization: `Bearer ${token}` };
      let response = await fetch(`${API_BASE_URL}/api/teacher/homework/${encodeURIComponent(homeworkId)}`, {
        method: 'DELETE',
        headers,
      });
      if (response.status === 404 || response.status === 405) {
        response = await fetch(`${API_BASE_URL}/api/teacher/homework/${encodeURIComponent(homeworkId)}/delete`, {
          method: 'POST',
          headers,
        });
      }
      const data = await response.json().catch(() => ({} as { success?: boolean; message?: string }));
      if (response.ok && data.success) {
        const removedId = String(data?.data?.id || homeworkId);
        setHomeworkSubmissions((prev) => ({
          ...prev,
          homeworks: (prev.homeworks || []).filter((item: any) => {
            const id = item?.homework?._id || item?.homework?.id || item?._id;
            return String(id) !== removedId;
          }),
        }));
        notify('Homework deleted successfully.');
        void fetchHomeworkSubmissions();
      } else {
        notify(data.message || 'Failed to delete homework.');
      }
    } catch (error) {
      console.error('Delete homework error:', error);
      notify('Failed to delete homework. Please try again.');
    } finally {
      setDeletingHomeworkId(null);
    }
  };

  const handleSaveQuiz = async () => {
    if (!generatedQuiz || !generatedQuiz.parsedQuestions) {
      notify('No quiz to save. Please generate a quiz first.');
      return;
    }

    setIsSavingQuiz(true);
    try {
      const token = getAuthToken();
      
      // Find the subject ID from teacherSubjects
      const selectedSubject = teacherSubjects.find((s: any) => 
        s.name?.toLowerCase() === quizForm.subject.toLowerCase()
      );
      
      if (!selectedSubject) {
        notify('Subject not found. Please select a valid subject.');
        setIsSavingQuiz(false);
        return;
      }

      // Format questions for the API
      const formattedQuestions = generatedQuiz.parsedQuestions.questions?.map((q: any) => ({
        questionText: q.question || q.questionText,
        questionType: q.type === 'multiple-choice' ? 'mcq' : 'mcq',
        options: q.options?.map((opt: string | { text: string; isCorrect?: boolean }) => {
          if (typeof opt === 'string') {
            return { text: opt, isCorrect: opt === q.correctAnswer };
          }
          return { text: opt.text, isCorrect: opt.isCorrect || false };
        }) || [],
        correctAnswer: q.correctAnswer,
        explanation: q.explanation || '',
        marks: 1,
        negativeMarks: 0,
        subject: quizForm.subject.toLowerCase()
      })) || [];

      const quizData = {
        title: `Quiz: ${quizForm.topic} - ${quizForm.subject}`,
        description: `AI-generated quiz for ${quizForm.subject} - ${quizForm.topic} (${quizForm.gradeLevel})`,
        subject: selectedSubject._id || selectedSubject.id,
        duration: 60,
        difficulty: quizForm.difficulty,
        questions: formattedQuestions,
        assignedClasses: quizForm.assignedClasses
      };

      const response = await fetch(`${API_BASE_URL}/api/teacher/quizzes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(quizData)
      });

      if (response.ok) {
        const savedQuiz = await response.json();
        
        // If classes are assigned, assign the quiz to those classes
        if (quizForm.assignedClasses.length > 0 && savedQuiz._id) {
          try {
            const assignResponse = await fetch(`${API_BASE_URL}/api/teacher/quizzes/${savedQuiz._id}/assign`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({
                classIds: quizForm.assignedClasses
              })
            });

            if (assignResponse.ok) {
              notify(`Quiz saved and assigned to ${quizForm.assignedClasses.length} class(es) successfully!`);
            } else {
              notify('Quiz saved but failed to assign to classes. You can assign it later.');
            }
          } catch (assignError) {
            console.error('Failed to assign quiz:', assignError);
            notify('Quiz saved but failed to assign to classes. You can assign it later.');
          }
        } else {
          notify('Quiz saved successfully!');
        }
        
        setGeneratedQuiz(null);
        setQuizForm({
          subject: '',
          topic: '',
          gradeLevel: '',
          questionCount: '10',
          difficulty: 'medium',
          assignedClasses: []
        });
      } else {
        const error = await response.json();
        notify(`Failed to save quiz: ${error.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to save quiz:', error);
      notify('Failed to save quiz. Please try again.');
    } finally {
      setIsSavingQuiz(false);
    }
  };

  const handleGradeWork = async () => {
    if (!gradingForm.studentWork && !gradingForm.uploadedFile) {
      notify('Please provide student work or upload a file');
      return;
    }

    setIsGrading(true);
    setGradingResult('');

    try {
      const formData = new FormData();
      formData.append('rubric', gradingForm.rubric || '');
      formData.append('studentWork', gradingForm.studentWork || '');
      
      if (gradingForm.uploadedFile) {
        formData.append('file', gradingForm.uploadedFile);
      }

      const response = await fetch(`${API_BASE_URL}/api/teacher/grade-work`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`
        },
        body: formData
      });

      if (response.ok) {
        const result = await response.json();
        setGradingResult(result.grading || result.result || 'Grading completed successfully');
      } else {
        const error = await response.json();
        notify(`Failed to grade work: ${error.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to grade work:', error);
      notify('Failed to grade work. Please try again.');
    } finally {
      setIsGrading(false);
    }
  };


  const fetchTrackProgressRemarks = async () => {
    try {
      const token = getAuthToken();
      const headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      };
      const [classRemarksRes, teacherRemarksRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/teacher/students/remarks`, { headers }),
        fetch(`${API_BASE_URL}/api/teacher/remarks`, { headers }),
      ]);

      const merged: any[] = [];
      const seen = new Set<string>();

      const addRemarks = (list: any[]) => {
        for (const r of list || []) {
          const key = String(r._id || '');
          if (!key || seen.has(key)) continue;
          seen.add(key);
          merged.push(r);
        }
      };

      if (classRemarksRes.ok) {
        const data = await classRemarksRes.json();
        addRemarks(data.data || []);
      }
      if (teacherRemarksRes.ok) {
        const data = await teacherRemarksRes.json();
        addRemarks(data.data || []);
      }

      merged.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setTrackProgressRemarks(merged);
    } catch (error) {
      console.error('Failed to fetch track progress remarks:', error);
      setTrackProgressRemarks([]);
    }
  };

  const getHomeworkStatsByStudentId = useCallback(() => {
    const totalAssigned = homeworkSubmissions?.homeworks?.length || 0;
    const map = new Map<string, { assigned: number; submitted: number }>();
    (homeworkSubmissions?.students || []).forEach((item: any) => {
      const sid = String(item.student?._id || item.student?.id || '');
      if (!sid) return;
      const submittedIds = new Set(
        (item.submissions || []).map((sub: any) =>
          String(sub.homeworkId?._id || sub.homeworkId || '')
        )
      );
      map.set(sid, {
        assigned: totalAssigned,
        submitted: submittedIds.size,
      });
    });
    return { totalAssigned, map };
  }, [homeworkSubmissions]);

  const submissionClassSectionMap = useMemo(
    () => buildSubmissionClassSectionMap(students, assignedClasses),
    [students, assignedClasses]
  );

  const submissionClassList = useMemo(
    () => Array.from(submissionClassSectionMap.keys()).sort(sortClassNumbers),
    [submissionClassSectionMap]
  );

  const getStudentHomeworkStatsForPanel = useCallback(
    (studentId: string) => {
      const { totalAssigned, map } = getHomeworkStatsByStudentId();
      return map.get(studentId) || { assigned: totalAssigned, submitted: 0 };
    },
    [getHomeworkStatsByStudentId]
  );

  const fetchAiProgressInsights = useCallback(
    async (filtered: Student[], options?: { updateGlobal?: boolean; refreshSeed?: number }) => {
      const updateGlobal = options?.updateGlobal !== false;
      if (!filtered.length) {
        if (updateGlobal) setAiProgressInsights('');
        return '';
      }
      if (updateGlobal) setIsLoadingAiInsights(true);
      try {
        const studentIds = new Set(
          filtered.map((s) => String(s.id || (s as { _id?: string })._id || '')).filter(Boolean)
        );
        const relevantRemarks = trackProgressRemarks.filter((r) => {
          const sid =
            typeof r.studentId === 'string'
              ? r.studentId
              : String(r.studentId?._id || r.studentId?.id || '');
          return sid && studentIds.has(sid);
        });

        const { totalAssigned, map: homeworkMap } = getHomeworkStatsByStudentId();

        const studentDetails = filtered.map((s) => {
          const sid = String(s.id || (s as { _id?: string })._id || '');
          const perf = s.performance || {};
          const hw = homeworkMap.get(sid) || {
            assigned: totalAssigned,
            submitted: 0,
          };
          return {
            name: s.name || (s as { fullName?: string }).fullName || s.email,
            totalExams: perf.totalExams ?? 0,
            averagePercentage: perf.averagePercentage ?? null,
            overallProgress: perf.overallProgress ?? 0,
            learningProgress: perf.learningProgress ?? 0,
            dailyAverageWatchTime: perf.dailyAverageWatchTime ?? 0,
            homeworkAssigned: hw.assigned,
            homeworkSubmitted: hw.submitted,
          };
        });

        const withExams = filtered.filter((s) => (s.performance?.totalExams || 0) > 0);
        const examScores = withExams
          .map((s) => s.performance?.averagePercentage)
          .filter((p): p is number => p != null);
        const avgExam =
          examScores.length > 0
            ? examScores.reduce((a, b) => a + b, 0) / examScores.length
            : 0;

        const avgOverall =
          filtered.reduce((sum, s) => sum + (s.performance?.overallProgress ?? 0), 0) /
          filtered.length;
        const withLearning = filtered.filter((s) => (s.performance?.learningProgress ?? 0) > 0);
        const avgLearning =
          withLearning.length > 0
            ? withLearning.reduce((sum, s) => sum + (s.performance?.learningProgress ?? 0), 0) /
              withLearning.length
            : 0;
        const withUsage = filtered.filter((s) => (s.performance?.dailyAverageWatchTime ?? 0) > 0);
        const avgWatch =
          withUsage.length > 0
            ? withUsage.reduce(
                (sum, s) => sum + (s.performance?.dailyAverageWatchTime ?? 0),
                0
              ) / withUsage.length
            : 0;

        const scopeLabel =
          filtered.length === 1
            ? `Student: ${filtered[0]?.name || filtered[0]?.email || 'selected'}`
            : filterByClass !== 'all'
              ? `Class ${filterByClass}`
              : 'All assigned students';

        const summary = {
          scopeLabel,
          studentCount: filtered.length,
          avgExamScore: avgExam,
          studentsWithExams: withExams.length,
          avgOverallProgress: avgOverall,
          avgLearningProgress: avgLearning,
          avgDailyUsageMinutes: avgWatch,
          studentsWithUsage: withUsage.length,
          students: studentDetails,
          remarksSample: relevantRemarks.slice(0, 8).map((r) => ({
            studentName:
              typeof r.studentId === 'object'
                ? r.studentId?.fullName || 'Student'
                : filtered.find(
                    (s) =>
                      String(s.id || (s as { _id?: string })._id) ===
                      String(
                        typeof r.studentId === 'string'
                          ? r.studentId
                          : r.studentId?._id
                      )
                  )?.name || 'Student',
            text: r.remark,
            isPositive: r.isPositive,
          })),
          refreshSeed: options?.refreshSeed || 0,
        };

        const token = getAuthToken();
        const response = await fetch(`${API_BASE_URL}/api/teacher/students/progress-ai-insights`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ summary }),
        });
        let insights = '';
        if (response.ok) {
          const data = await response.json();
          insights = data.data?.insights || '';
        }
        if (updateGlobal) setAiProgressInsights(insights);
        return insights;
      } catch (error) {
        console.error('Failed to fetch progress insights:', error);
        if (updateGlobal) setAiProgressInsights('');
        return '';
      } finally {
        if (updateGlobal) setIsLoadingAiInsights(false);
      }
    },
    [trackProgressRemarks, filterByClass, filterByStudent, getHomeworkStatsByStudentId]
  );

  useEffect(() => {
    if (
      !(
        dashboardSubTab === 'reports' ||
        (dashboardSubTab === 'students' && studentsSubTab === 'track-progress')
      )
    ) {
      return;
    }
    if (isLoadingProgress) return;
    const timer = setTimeout(() => {
      fetchAiProgressInsights(trackProgressFilteredStudents);
    }, 500);
    return () => clearTimeout(timer);
  }, [
    dashboardSubTab,
    studentsSubTab,
    trackProgressFilteredStudents,
    isLoadingProgress,
    homeworkSubmissions,
    fetchAiProgressInsights,
  ]);

  // Fetch student performance data
  const fetchStudentPerformance = async () => {
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE_URL}/api/teacher/students/performance`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data) {
          // Update students with performance data from database
          const studentsWithPerformance = data.data.map((student: any) => {
            const perf = student.performance || {};
            // Extract all metrics from database response
            return {
              id: student._id || student.id,
              name: student.fullName || student.name,
              email: student.email,
              classNumber: student.classNumber,
              phone: student.phone,
              isActive: student.isActive,
              createdAt: student.createdAt,
              lastLogin: student.lastLogin,
              assignedClass: student.assignedClass,
              performance: {
                recentExamTitle: perf.recentExamTitle || null,
                recentMarks: perf.recentMarks || null,
                recentPercentage: perf.recentPercentage || null,
                // All metrics from database:
                // - totalExams: Count from ExamResult collection
                totalExams: perf.totalExams !== null && perf.totalExams !== undefined ? perf.totalExams : 0,
                // - averageMarks: Average of obtained marks from ExamResult
                averageMarks: perf.averageMarks || 0,
                // - averagePercentage: Average of all exam percentages from ExamResult
                averagePercentage: perf.averagePercentage !== null && perf.averagePercentage !== undefined ? perf.averagePercentage : null,
                // - overallProgress: Calculated from exam progress + learning path progress
                overallProgress: perf.overallProgress !== null && perf.overallProgress !== undefined ? perf.overallProgress : 0,
                // - learningProgress: Content completion progress from database
                learningProgress: perf.learningProgress !== null && perf.learningProgress !== undefined ? perf.learningProgress : 0,
                // - dailyAverageWatchTime: Calculated from UserProgress records (video watch time)
                dailyAverageWatchTime: perf.dailyAverageWatchTime !== null && perf.dailyAverageWatchTime !== undefined ? perf.dailyAverageWatchTime : 0
              }
            };
          });
          
          console.log('📊 Student performance data loaded from database:', {
            totalStudents: studentsWithPerformance.length,
            sampleStudent: studentsWithPerformance[0] ? {
              name: studentsWithPerformance[0].name,
              performance: studentsWithPerformance[0].performance,
              watchTime: studentsWithPerformance[0].performance?.dailyAverageWatchTime
            } : null
          });
          
          // Debug: Log all watch times
          studentsWithPerformance.forEach((s: any) => {
            const wt = s.performance?.dailyAverageWatchTime;
            console.log(`⏱️ Watch time for ${s.name}: ${wt !== null && wt !== undefined ? wt + ' min' : 'null/undefined'}`);
          });
          
          setStudents(studentsWithPerformance);
        }
      }
    } catch (error) {
      console.error('Failed to fetch student performance:', error);
    }
  };

  const fetchTeacherData = async (retryCount = 0) => {
    const maxRetries = 2;
    try {
      const token = getAuthToken();

      console.log(`[Mobile Debug] Fetching teacher data (attempt ${retryCount + 1}/${maxRetries + 1})...`);
      console.log(`[Mobile Debug] API URL: ${API_BASE_URL}/api/teacher/dashboard`);
      console.log(`[Mobile Debug] Token present: ${token ? 'Yes' : 'No (cookie session)'}`);
      
      const response = await fetch(`${API_BASE_URL}/api/teacher/dashboard`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'Content-Type': 'application/json'
        }
      });

      console.log(`[Mobile Debug] Response status: ${response.status}`);
      console.log(`[Mobile Debug] Response ok: ${response.ok}`);

      if (response.ok) {
        const data = await response.json();
        console.log('[Mobile Debug] Teacher dashboard data received:', data);
        console.log('[Mobile Debug] Data structure:', {
          hasSuccess: 'success' in data,
          hasData: 'data' in data,
          dataKeys: data.data ? Object.keys(data.data) : 'no data object'
        });
        
        if (data.success && data.data) {
          // Ensure stats object has all required fields
          // Handle both nested stats object and flat stats in data
          const statsData = data.data.stats || data.data;
          const studentsData = data.data.students || [];
          const videosData = data.data.videos || [];
          const assignedClassesData = data.data.assignedClasses || [];
          let teacherSubjectsData = Array.isArray(data.data.teacherSubjects)
            ? data.data.teacherSubjects
            : [];
          
          // Calculate stats from actual data if not provided
          const calculatedStats = {
            totalStudents: statsData.totalStudents ?? studentsData.length ?? 0,
            totalClasses: statsData.totalClasses ?? assignedClassesData.length ?? 0,
            totalVideos: statsData.totalVideos ?? videosData.length ?? 0,
            learningPathVideos: statsData.learningPathVideos ?? 0,
            iitVideos: statsData.iitVideos ?? 0,
            totalAssessments: statsData.totalAssessments ?? 0,
            averagePerformance: statsData.averagePerformance ?? 0,
            recentActivity: data.data.recentActivity || []
          };
          
          setStats(calculatedStats);
          
          console.log('[Mobile Debug] Stats set:', calculatedStats);
          console.log('[Mobile Debug] Raw data structure:', {
            hasStats: !!data.data.stats,
            hasStudents: Array.isArray(studentsData),
            hasVideos: Array.isArray(videosData),
            hasAssignedClasses: Array.isArray(assignedClassesData),
            hasTeacherSubjects: Array.isArray(teacherSubjectsData)
          });
          
          setStudents(studentsData);
          console.log('[Mobile Debug] Students set:', studentsData.length);
          
          // Fetch performance data for students
          fetchStudentPerformance();
          setVideos(videosData);
          console.log('[Mobile Debug] Videos set:', videosData.length);

          if (teacherSubjectsData.length === 0) {
            teacherSubjectsData = await fetchTeacherSubjectsFallback(token);
          }

          setTeacherEmail(data.data.teacherEmail || localStorage.getItem('userEmail') || '');
          setAssignedClasses(assignedClassesData);
          setTeacherSubjects(teacherSubjectsData);
          console.log('[Mobile Debug] Assigned classes set:', assignedClassesData.length);
          console.log('[Mobile Debug] Teacher subjects set:', teacherSubjectsData.length);
          
          // Process assigned classes to get unique classNumbers and their subjects
          const classesMap = new Map<string, Set<string>>();
          const classesData = data.data.assignedClasses || [];
          
          console.log('Processing assigned classes:', classesData);
          
          classesData.forEach((classItem: any) => {
            const classNumber = classItem.classNumber;
            console.log('Processing class:', classNumber, 'with data:', classItem);
            
            if (classNumber) {
              // Always add the class, even if it has no subjects
              if (!classesMap.has(classNumber)) {
                classesMap.set(classNumber, new Set());
              }
              
              // Check if assignedSubjects exists and is populated
              if (classItem.assignedSubjects && Array.isArray(classItem.assignedSubjects) && classItem.assignedSubjects.length > 0) {
                // Add all subjects from this class
                classItem.assignedSubjects.forEach((subject: any) => {
                  const subjectId = subject._id || subject;
                  if (subjectId) {
                    classesMap.get(classNumber)?.add(subjectId);
                  }
                });
              }
            }
          });
          
          console.log('Classes map after processing:', Array.from(classesMap.entries()));
          
          // Convert to array format with unique subjects
          const availableClassesList = Array.from(classesMap.entries()).map(([classNumber, subjectIds]) => {
            // Get subject details from assignedClasses
            const subjectsMap = new Map<string, any>();
            
            classesData.forEach((classItem: any) => {
              if (classItem.classNumber === classNumber && classItem.assignedSubjects && Array.isArray(classItem.assignedSubjects)) {
                classItem.assignedSubjects.forEach((subject: any) => {
                  const subjectId = subject._id || subject;
                  if (subjectIds.has(subjectId) && !subjectsMap.has(subjectId)) {
                    subjectsMap.set(subjectId, {
                      _id: subject._id || subject,
                      name: subject.name || subject
                    });
                  }
                });
              }
            });
            
            // Validate and clean classNumber
            let cleanClassNumber = classNumber;
            if (classNumber && typeof classNumber === 'string') {
              // Remove "Class " prefix if present
              cleanClassNumber = classNumber.replace(/^Class\s*/i, '').trim();
              // Remove any leading dashes or invalid characters
              cleanClassNumber = cleanClassNumber.replace(/^-+/, '').trim();
            }
            
            // Skip invalid classNumbers
            if (!cleanClassNumber || cleanClassNumber === '' || cleanClassNumber === '-9' || cleanClassNumber.startsWith('-')) {
              console.warn('Skipping invalid classNumber:', classNumber, '->', cleanClassNumber);
              return null;
            }
            
            return {
              classNumber: cleanClassNumber,
              subjects: Array.from(subjectsMap.values())
            };
          })
          .filter(item => item !== null); // Remove null entries
          
          console.log('Available classes list:', availableClassesList);
          setAvailableClasses(availableClassesList);
          
          // Get teacher ID from response or extract from token
          if (data.data.teacherId) {
            setTeacherId(data.data.teacherId);
          } else {
            // Try to extract from token
            try {
              const token = getAuthToken();
              if (token) {
                const payload = JSON.parse(atob(token.split('.')[1]));
                setTeacherId(payload.userId || payload.id || '');
              }
            } catch (e) {
              console.error('Failed to extract teacher ID from token:', e);
            }
          }
          console.log('[Mobile Debug] Teacher subjects received:', data.data.teacherSubjects);
        } else {
          console.error('[Mobile Debug] API returned success: false:', data.message || 'Unknown error');
          // Retry if we haven't exceeded max retries
          if (retryCount < maxRetries) {
            console.log(`[Mobile Debug] Retrying... (${retryCount + 1}/${maxRetries})`);
            setTimeout(() => fetchTeacherData(retryCount + 1), 1000 * (retryCount + 1));
            return;
          }
        }
      } else {
        const errorText = await response.text();
        console.error(`[Mobile Debug] Failed to fetch teacher data: ${response.status}`, errorText);
        
        // Retry on network/server errors if we haven't exceeded max retries
        if ((response.status >= 500 || response.status === 0) && retryCount < maxRetries) {
          console.log(`[Mobile Debug] Retrying due to server error... (${retryCount + 1}/${maxRetries})`);
          setTimeout(() => fetchTeacherData(retryCount + 1), 1000 * (retryCount + 1));
          return;
        }
        
        // Show fallback data when API fails
        setStats({
          totalStudents: 0,
          totalClasses: 0,
          totalVideos: 0,
          totalAssessments: 0,
          averagePerformance: 0,
          recentActivity: []
        });
        setStudents([]);
        setVideos([]);
        setAssignedClasses([]);
        setTeacherSubjects([]);
        setAvailableClasses([]);
        setSelectedClassSubjects([]);
      }
    } catch (error: any) {
      console.error('[Mobile Debug] Failed to fetch teacher data (catch block):', error);
      console.error('[Mobile Debug] Error details:', {
        message: error?.message,
        stack: error?.stack,
        name: error?.name
      });
      
      // Retry on network errors if we haven't exceeded max retries
      if (retryCount < maxRetries && (error?.message?.includes('fetch') || error?.message?.includes('network'))) {
        console.log(`[Mobile Debug] Retrying due to network error... (${retryCount + 1}/${maxRetries})`);
        setTimeout(() => fetchTeacherData(retryCount + 1), 1000 * (retryCount + 1));
        return;
      }
      
      // Show fallback data when API fails
      setStats({
        totalStudents: 0,
        totalClasses: 0,
        totalVideos: 0,
        totalAssessments: 0,
        averagePerformance: 0,
        recentActivity: []
      });
      setStudents([]);
      setVideos([]);
      setAssignedClasses([]);
      setTeacherSubjects([]);
      setAvailableClasses([]);
      setSelectedClassSubjects([]);
    } finally {
      setIsLoading(false);
      console.log('[Mobile Debug] Loading state set to false');
    }
  };

  const eduottClassOptions = useMemo(() => {
    const set = new Set<string>();
    eduottVideos.forEach((video: any) => {
      const l = getSubjectClassLabel({
        name: video.subjectName,
        classNumber: video.classNumber,
      });
      if (l) set.add(l);
    });
    return Array.from(set).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  }, [eduottVideos]);

  const eduottSubjectOptions = useMemo(() => {
    const names = new Set<string>();
    eduottVideos.forEach((video: any) => {
      const l = getSubjectClassLabel({
        name: video.subjectName,
        classNumber: video.classNumber,
      });
      if (eduottClassFilter !== 'all' && l !== eduottClassFilter) return;
      names.add(extractPlainSubjectName(video.subjectName || '').trim());
    });
    return Array.from(names).filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [eduottVideos, eduottClassFilter]);

  // Memoize filtered videos to avoid recalculating on every render
  const filteredEduottVideos = useMemo(() => {
    if (!eduottVideos.length) return [];
    return eduottVideos.filter((video: any) => {
      const matchesSearch = video.title.toLowerCase().includes(eduottSearchTerm.toLowerCase()) ||
                           (video.description || '').toLowerCase().includes(eduottSearchTerm.toLowerCase());
      const classL = getSubjectClassLabel({
        name: video.subjectName,
        classNumber: video.classNumber,
      });
      const matchesClass = eduottClassFilter === 'all' || classL === eduottClassFilter;
      const plain = extractPlainSubjectName(video.subjectName || '').toLowerCase();
      const matchesSubject =
        eduottSubjectFilter === 'all' || plain === eduottSubjectFilter.toLowerCase();
      return matchesSearch && matchesClass && matchesSubject;
    });
  }, [eduottVideos, eduottSearchTerm, eduottClassFilter, eduottSubjectFilter]);

  // Memoize filtered students
  const filteredStudents = useMemo(() => {
    if (!searchTerm) return students;
    const lowerSearch = searchTerm.toLowerCase();
    return students.filter(student => 
      student.name.toLowerCase().includes(lowerSearch) ||
      student.email.toLowerCase().includes(lowerSearch) ||
      student.classNumber?.toLowerCase().includes(lowerSearch)
    );
  }, [students, searchTerm]);

  const liveSessionClassOptions = useMemo(() => {
    const set = new Set<string>();
    liveSessions.forEach((session: any) => {
      const l = getSubjectClassLabel({
        name: session.subject?.name,
        classNumber: session.classNumber,
      });
      if (l) set.add(l);
    });
    return Array.from(set).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  }, [liveSessions]);

  const liveSessionSubjectOptions = useMemo(() => {
    const names = new Set<string>();
    liveSessions.forEach((session: any) => {
      const l = getSubjectClassLabel({
        name: session.subject?.name,
        classNumber: session.classNumber,
      });
      if (sessionClassFilter !== 'all' && l !== sessionClassFilter) return;
      names.add(extractPlainSubjectName(session.subject?.name || '').trim());
    });
    return Array.from(names).filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [liveSessions, sessionClassFilter]);

  // Memoize filtered live sessions
  const filteredLiveSessions = useMemo(() => {
    return liveSessions.filter((session: any) => {
      const matchesSearch = session.title?.toLowerCase().includes(sessionSearchTerm.toLowerCase()) ||
        session.description?.toLowerCase().includes(sessionSearchTerm.toLowerCase());
      const matchesStatus = filterStatus === 'all' || session.status === filterStatus;
      const classL = getSubjectClassLabel({
        name: session.subject?.name,
        classNumber: session.classNumber,
      });
      const matchesClass = sessionClassFilter === 'all' || classL === sessionClassFilter;
      const plain = extractPlainSubjectName(session.subject?.name || '').toLowerCase();
      const matchesSubject =
        sessionSubjectFilter === 'all' || plain === sessionSubjectFilter.toLowerCase();
      return matchesSearch && matchesStatus && matchesClass && matchesSubject;
    });
  }, [liveSessions, sessionSearchTerm, filterStatus, sessionClassFilter, sessionSubjectFilter]);

  // Memoize helper functions
  if (isLoading) {
    return (
      <TeacherShell contentClassName="app-shell-content teacher-playful-dashboard">
        <div className="mx-auto flex min-h-[50vh] w-full items-center justify-center py-16">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-blue-600 text-white">
              <RefreshCw className="h-5 w-5 animate-spin" aria-hidden="true" />
            </div>
            <h2 className="font-display text-xl font-bold text-slate-900">Loading workspace</h2>
            <p className="mt-1 text-sm text-slate-600">Fetching your classes and students…</p>
          </div>
        </div>
      </TeacherShell>
    );
  }

  return (
    <TeacherShell contentClassName="app-shell-content teacher-playful-dashboard">
      {ConfirmDialog}
      {/* Main Content */}
      <div className="relative z-10 w-full space-y-4 pb-4 sm:space-y-6 sm:pb-6 lg:space-y-8 lg:pb-8">
        {(() => {
          const pageMeta: Record<string, { title: string; subtitle: string }> = {
            'ai-classes': {
              title: 'Overview',
              subtitle: 'Your classes, students, and teaching pulse at a glance.',
            },
            classes: {
              title: 'My Classes',
              subtitle: 'Open a class to see students and jump into progress tracking.',
            },
            students: {
              title: 'Students',
              subtitle: 'Roster, progress, homework submissions, and daily diary.',
            },
            eduott: {
              title: 'EduOTT · IIT Exclusive',
              subtitle:
                'IIT track videos and live sessions for your classes. Board curriculum videos stay in Learning Paths.',
            },
            'learning-paths': {
              title: 'Learning Paths',
              subtitle: 'Curriculum paths and prep content for your subjects.',
            },
            'vidya-ai': {
              title: isIndividualTeacher ? 'AI Studio' : 'Vidya AI',
              subtitle: 'Generate lesson materials, worksheets, and teaching aids.',
            },
            calendar: {
              title: 'Calendar',
              subtitle: 'Your timetable photo and day-by-day schedule.',
            },
            settings: {
              title: 'Settings',
              subtitle: 'Update your teacher details and reset your password.',
            },
            reports: {
              title: 'Reports',
              subtitle: 'Student analysis — exam results, usage, homework, and improvement insights.',
            },
          };
          const meta = pageMeta[dashboardSubTab] || pageMeta['ai-classes'];
          const showRefresh =
            dashboardSubTab === 'ai-classes' ||
            dashboardSubTab === 'classes' ||
            dashboardSubTab === 'students' ||
            dashboardSubTab === 'reports';
          // Overview and Vidya AI already render their own hero cards.
          if (dashboardSubTab === 'ai-classes' || dashboardSubTab === 'vidya-ai') return null;
          return (
            <PortalPageHero
              portal="teacher"
              title={meta.title}
              subtitle={meta.subtitle}
              actions={showRefresh ? (
                <Button
                  onClick={() => {
                    fetchTeacherData();
                  }}
                  variant="outline"
                  size="sm"
                  className="shrink-0 border-white/25 bg-white/15 text-white backdrop-blur-sm hover:bg-white/25 hover:text-white"
                  disabled={isLoading}
                >
                  <RefreshCw className={'mr-2 h-4 w-4' + (isLoading ? ' animate-spin' : '')} />
                  Refresh
                </Button>
              ) : undefined}
            />
          );
        })()}

        {/* Dashboard Content — sidebar / hamburger drawer drives sections */}
        <div className="space-y-4 sm:space-y-6 lg:space-y-8">
              {/* Overview — welcome + stats + shortcuts */}
              {dashboardSubTab === 'ai-classes' && (
                <>
              <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-teal-700 via-sky-600 to-cyan-600 p-5 shadow-glow-lg sm:p-8">
                <div className="pointer-events-none absolute -right-16 -top-28 h-72 w-72 rounded-full bg-white/15 blur-3xl" />
                <div className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-amber-200/25 blur-3xl" />
                <div className="relative z-10 min-w-0">
                  <h2 className="mb-2 font-display text-2xl font-extrabold leading-tight !text-white sm:text-3xl lg:text-4xl">
                    Welcome, {getTeacherDisplayName(teacherUser || getStoredUser())}!
                  </h2>
                  <p className="max-w-xl text-sm font-medium leading-snug text-white/85 sm:text-base sm:leading-relaxed">
                    Your classes, students, and teaching tools are ready — pick up where you left off.
                  </p>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <StatCard
                  label="Total Students"
                  value={String(stats.totalStudents)}
                  caption="Across all your classes"
                  icon={Users}
                  tone="amber"
                  motif="wave"
                  onClick={() => selectDashboardSubTab('students')}
                />
                <StatCard
                  label="Active Classes"
                  value={String(stats.totalClasses)}
                  caption="Currently running"
                  icon={GraduationCap}
                  tone="violet"
                  motif="bars"
                  onClick={() => selectDashboardSubTab('classes')}
                />
                <StatCard
                  label="Videos"
                  value={String(stats.totalVideos)}
                  caption={
                    (stats.learningPathVideos || 0) + (stats.iitVideos || 0) > 0
                      ? `Learning paths ${stats.learningPathVideos ?? 0} + IIT ${stats.iitVideos ?? 0}`
                      : 'Learning paths + IIT videos'
                  }
                  icon={Play}
                  tone="teal"
                  motif="play"
                  onClick={() => selectDashboardSubTab('learning-paths')}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { tab: 'classes', label: 'My Classes', hint: 'Class roster cards', Icon: GraduationCap },
                  { tab: 'students', label: 'Students', hint: 'Progress & submissions', Icon: Users },
                  { tab: 'calendar', label: 'Calendar', hint: 'Timetable & schedule', Icon: Calendar },
                  { tab: 'vidya-ai', label: 'Vidya AI', hint: 'Generate teaching aids', Icon: Sparkles },
                ].map(({ tab, label, hint, Icon }) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => selectDashboardSubTab(tab as DashboardSubTab)}
                    className="min-h-[5.5rem] rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-indigo-blue-200 hover:bg-indigo-blue-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-blue-500"
                  >
                    <Icon className="mb-2 h-5 w-5 shrink-0 text-indigo-blue-600" aria-hidden="true" />
                    <p className="text-sm font-semibold text-slate-900">{label}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{hint}</p>
                  </button>
                ))}
              </div>

              <WeeklyDigestCard apiBase="/api/teacher" />
                </>
              )}

              {/* My Classes page */}
              {dashboardSubTab === 'classes' && (
                <>
              {/* My Classes — dedicated card grid */}
              <motion.div
                id="teacher-my-classes"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                className="font-inter rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 lg:p-6"
              >
                <div className="mb-5 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-blue-600 text-white shadow-sm">
                      <GraduationCap className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
                        Assigned classes
                      </h3>
                      <p className="text-sm text-slate-500">
                        {assignedClasses.length} active
                        {assignedClasses.length === 1 ? ' class' : ' classes'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 sm:gap-5">
                  {assignedClasses.length > 0 ? (
                    assignedClasses.map((classItem, index) => {
                      const classKey = [
                        classItem.id || 'class',
                        classItem.classNumber || '',
                        classItem.section || '',
                        index,
                      ].join(':');
                      const displayName =
                        String(classItem.name || '').trim() ||
                        `${String(classItem.classNumber || '').trim()}${String(classItem.section || '').trim()}` ||
                        String(classItem.room || '')
                          .replace(/^Room\s*/i, '')
                          .trim() ||
                        `Class ${index + 1}`;
                      return (
                        <ClassCard
                          key={classKey}
                          name={displayName}
                          subject={classItem.subject}
                          studentCount={classItem.studentCount}
                          schedule={classItem.schedule}
                          room={classItem.room}
                          expanded={expandedClasses.has(classKey)}
                          students={classItem.students}
                          onToggleStudents={() => {
                            setExpandedClasses((prev) => {
                              const next = new Set(prev);
                              if (next.has(classKey)) next.delete(classKey);
                              else next.add(classKey);
                              return next;
                            });
                          }}
                          onViewStudentAnalysis={(studentId) => {
                            selectDashboardSubTab('students');
                            setStudentsSubTab('track-progress');
                            if (classItem.classNumber != null && classItem.classNumber !== '') {
                              setFilterByClass(String(classItem.classNumber));
                            } else {
                              setFilterByClass('all');
                            }
                            setFilterByStudent(studentId);
                            setProgressDetailStudentId(studentId);
                          }}
                        />
                      );
                    })
                  ) : (
                    <div className="col-span-full rounded-2xl border border-dashed border-gray-200 bg-white p-4 sm:p-6 lg:p-8 text-center shadow-sm">
                      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 text-gray-400">
                        <Users className="h-6 w-6 sm:h-7 sm:w-7 lg:h-8 lg:w-8" />
                      </div>
                      <h3 className="mb-2 text-lg sm:text-xl font-semibold text-gray-900">
                        No classes assigned
                      </h3>
                      <p className="mb-4 text-gray-600">
                        You haven&apos;t been assigned to any classes yet. Contact your administrator.
                      </p>
                      <Button className="w-full rounded-xl bg-indigo-600 font-semibold text-white shadow-sm hover:bg-indigo-700 sm:w-auto">
                        Request class assignment
                      </Button>
                    </div>
                  )}
                </div>
              </motion.div>

                </>
              )}

              {/* Calendar page */}
              {dashboardSubTab === 'calendar' && (
                <>
              {/* Weekly timetable — Mon–Sat grid from admin Timetable Management */}
              <motion.div
                id="teacher-weekly-timetable"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.62 }}
                className="mb-6"
              >
                <TeacherTimetableDashboard />
              </motion.div>

              {/* Schedule & calendar — separate grid section */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.65 }}
                className="font-inter mb-8 rounded-2xl border border-gray-200/80 bg-white p-4 sm:p-5 lg:p-6 shadow-[0_4px_24px_rgba(15,23,42,0.06)]"
              >
                <div className="mb-5 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500 shadow-sm ring-4 ring-orange-500/10">
                      <Calendar className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg sm:text-xl font-bold tracking-tight text-gray-900 sm:text-2xl">
                        Schedule &amp; Calendar
                      </h3>
                      <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
                        Pick a date and manage your daily class slots
                      </p>
                    </div>
                  </div>
                </div>

                <TeacherDashboardSchedule
                  storageKey={teacherEmail || localStorage.getItem('userEmail') || 'teacher'}
                />
              </motion.div>
                </>
              )}

              {/* Settings — teacher details + password */}
              {dashboardSubTab === 'settings' && <TeacherSettingsPanel />}

              {/* Learning Paths opens /learning-paths (same UI as student) */}

              {/* Vidya AI Tab — single unified hero + tools */}
              {dashboardSubTab === 'vidya-ai' && (
                <>
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="overflow-hidden rounded-3xl border border-violet-300/30 bg-gradient-to-br from-[#4f46e5] via-[#6550df] to-[#7c3aed] p-5 text-white shadow-[0_18px_42px_-26px_rgba(79,70,229,0.65)] sm:p-7 lg:p-8"
              >
                <div className="flex items-center gap-3 sm:gap-5">
                  <div className="min-w-0 flex-1">
                    <p className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-white ring-1 ring-white/20">
                      {isIndividualTeacher ? 'AI Studio' : 'Vidya AI'}
                    </p>
                    <h1 className="mt-3 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
                      {isIndividualTeacher ? 'AI Studio' : 'Vidya'}{' '}
                      <span className="text-violet-200">AI</span>
                    </h1>
                    <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/80 sm:text-base">
                      Generate lesson materials, worksheets, and teaching aids — curriculum-ready
                      classroom support in one place.
                    </p>
                  </div>
                  <img
                    src="/ROBOT.gif"
                    alt=""
                    aria-hidden="true"
                    className="h-20 w-20 shrink-0 object-contain drop-shadow-md sm:h-28 sm:w-28"
                  />
                </div>

                {/* Tabs for Teacher Tools and Chat */}
                <div className="mt-5">
                  <div className="inline-flex min-h-12 w-full gap-1 overflow-x-auto rounded-xl border border-white/70 bg-white/90 p-1 backdrop-blur-sm sm:w-auto">
                    <button
                      onClick={() => setVidyaAiTab('teacher-tools')}
                      className={`min-h-10 flex-1 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
                        vidyaAiTab === 'teacher-tools'
                          ? 'bg-violet-600 text-white shadow-md'
                          : 'text-slate-600 hover:bg-violet-50 hover:text-violet-800'
                      }`}
                    >
                      <Wrench className="mr-2 inline h-5 w-5" />
                      AI Tools
                    </button>
                    {vidyaChatEnabled ? (
                    <button
                      onClick={() => setVidyaAiTab('chat')}
                      className={`min-h-10 flex-1 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
                        vidyaAiTab === 'chat'
                          ? 'bg-violet-600 text-white shadow-md'
                          : 'text-slate-600 hover:bg-violet-50 hover:text-violet-800'
                      }`}
                    >
                      <MessageCircle className="mr-2 inline h-5 w-5" />
                      Ask Vidya
                    </button>
                    ) : null}
                  </div>
                </div>

                {/* Teacher Tools Content — light surface so the dark tool copy stays readable
                    against the violet hero gradient. */}
                {vidyaAiTab === 'teacher-tools' && (
                  <div className="mt-6 space-y-8 rounded-2xl border border-white/60 bg-slate-50/95 p-4 shadow-inner sm:mt-7 sm:p-6">
                    {isIndividualTeacher ? (
                      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                        {[
                          { label: 'Lesson Planner', icon: BookMarked, route: '/teacher/tools/lesson-planner' },
                          { label: 'Worksheets', icon: ClipboardCheck, route: '/teacher/tools/worksheet-mcq-generator' },
                          { label: 'Question Papers', icon: FileQuestion, route: '/teacher/tools/exam-question-paper-generator' },
                          { label: 'Profile & Subscription', icon: CreditCard, route: '/profile' },
                        ].map(({ label, icon: Icon, route }) => (
                          <button
                            key={label}
                            type="button"
                            onClick={() => setLocation(route)}
                            className="group flex min-h-28 items-center gap-4 rounded-2xl border border-sky-100 bg-white/90 p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-elevated"
                          >
                            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700 transition group-hover:bg-sky-600 group-hover:text-white">
                              <Icon className="h-6 w-6" />
                            </span>
                            <span className="text-lg font-bold text-slate-800">{label}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {/* Available Tools Section */}
                      <div>
                      <h3 className="mb-2 font-display text-2xl font-bold text-slate-900 sm:text-3xl">Create With AI</h3>
                      <p className="mb-7 text-base leading-relaxed text-slate-600 sm:text-lg">{TEACHER_AI_TOOLS_SUBTITLE}</p>

                      <TeacherVidyaToolsGrid
                        subjectNames={teacherSubjectNames}
                        onOpenTool={(route) => setLocation(route)}
                      />
                            </div>
                  </div>
                )}

                {/* Chat Content */}
                {vidyaAiTab === 'chat' && vidyaChatEnabled && (
                  <div className="mx-auto mt-6 max-w-4xl space-y-4 rounded-2xl border border-white/60 bg-slate-50/95 p-4 shadow-inner sm:mt-7 sm:p-6">
                    <div className={`rounded-2xl p-5 shadow-md border border-white/40 ${
                      teacherChatFocusTab === 'lesson-planning'
                        ? 'bg-gradient-to-r from-sky-300 via-sky-400 to-blue-400'
                        : teacherChatFocusTab === 'assessments'
                          ? 'bg-gradient-to-r from-emerald-300 via-teal-400 to-green-400'
                          : 'bg-gradient-to-r from-orange-300 via-amber-400 to-orange-400'
                    }`}>
                      <h2 className="text-xl sm:text-2xl font-bold text-white">
                        {teacherChatFocusTab === 'lesson-planning'
                          ? 'Lesson Planning Assistant'
                          : teacherChatFocusTab === 'assessments'
                            ? 'Assessment Assistant'
                            : 'Classroom Help Assistant'}
                      </h2>
                      <p className="text-white/90 mt-1">
                        {teacherChatFocusTab === 'lesson-planning'
                          ? 'Build structured lesson plans and in-class activities.'
                          : teacherChatFocusTab === 'assessments'
                            ? 'Design quizzes, worksheets, and evaluation tasks.'
                            : 'Get practical support for classroom management and teaching decisions.'}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => setTeacherChatFocusTab('lesson-planning')}
                        className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                          teacherChatFocusTab === 'lesson-planning'
                            ? 'bg-sky-600 text-white shadow-sm ring-2 ring-sky-200'
                            : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        Lesson Planning
                      </button>
                      <button
                        onClick={() => setTeacherChatFocusTab('assessments')}
                        className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                          teacherChatFocusTab === 'assessments'
                            ? 'bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-200'
                            : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        Assessments
                      </button>
                      <button
                        onClick={() => setTeacherChatFocusTab('classroom-help')}
                        className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                          teacherChatFocusTab === 'classroom-help'
                            ? 'bg-orange-600 text-white shadow-sm ring-2 ring-orange-200'
                            : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        Classroom Help
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <Badge className="bg-sky-100 text-sky-700 hover:bg-sky-100 border border-sky-200">
                        {(teacherSubjects?.[0]?.name || 'General') + ' - ' + (availableClasses?.[0]?.classNumber || assignedClasses?.[0]?.classNumber || 'Grade 7')}
                      </Badge>
                      <Badge
                        className={
                          teacherChatFocusTab === 'lesson-planning'
                            ? 'bg-sky-100 text-sky-700 border border-sky-200'
                            : teacherChatFocusTab === 'assessments'
                              ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                              : 'bg-orange-100 text-orange-700 border border-orange-200'
                        }
                      >
                        {teacherChatFocusTab === 'lesson-planning'
                          ? 'Mode: Lesson Planning'
                          : teacherChatFocusTab === 'assessments'
                            ? 'Mode: Assessments'
                            : 'Mode: Classroom Help'}
                      </Badge>
                      <div className="flex flex-wrap gap-2">
                        {isAiToolVisibleForSubjects('worksheet-mcq-generator', teacherSubjectNames) ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-sky-200 text-sky-700 hover:bg-sky-50"
                          onClick={() => setLocation('/teacher/tools/worksheet-mcq-generator')}
                        >
                          Generate Worksheet
                        </Button>
                        ) : null}
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-teal-200 text-teal-700 hover:bg-teal-50"
                          onClick={() => setLocation('/teacher/tools/exam-question-paper-generator')}
                        >
                          Create Quiz
                        </Button>
                        {isAiToolVisibleForSubjects('concept-mastery-helper', teacherSubjectNames) ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-violet-200 text-violet-700 hover:bg-violet-50"
                          onClick={() => setLocation('/teacher/tools/concept-mastery-helper')}
                        >
                          Explain Concept
                        </Button>
                        ) : null}
                      </div>
                    </div>

                    <div className="bg-white rounded-2xl shadow-lg border border-gray-200 text-slate-900" style={{ minHeight: '600px' }}>
                      {teacherId ? (
                        <AIChat
                          userId={teacherId}
                          className="flex-1 h-full"
                          promptVariant="teacher"
                          context={{
                            studentName: teacherUser?.fullName || teacherUser?.email?.split('@')[0] || "Teacher",
                            currentSubject:
                              teacherVidyaSubjectValues[0] ||
                              (teacherSubjects.length > 0 ? teacherSubjects[0].name : "General"),
                            currentTopic: undefined,
                            teacherMode: teacherChatFocusTab,
                            subjectOptions:
                              teacherVidyaSubjectValues.length > 0
                                ? teacherVidyaSubjectValues
                                : teacherSubjects
                                    .map((s: any) => s.name || s.subjectName || '')
                                    .filter(Boolean),
                            subjectSelectOptions: teacherVidyaSubjectSelectOptions,
                          }}
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full min-h-[600px]">
                          <div className="text-center">
                            <MessageCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                            <p className="text-gray-600">Loading chat...</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </motion.div>
                </>
              )}

              {/* My Students / Reports (student analysis) */}
              {(dashboardSubTab === 'students' || dashboardSubTab === 'reports') && (
                <div className="relative overflow-hidden rounded-3xl border border-indigo-blue-100/70 bg-gradient-to-br from-sky-100 via-indigo-blue-50 to-violet-100 p-4 shadow-sm sm:p-5 lg:p-6">
                  <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/50 blur-3xl" aria-hidden="true" />
                  <div className="pointer-events-none absolute -bottom-20 left-1/4 h-48 w-48 rounded-full bg-violet-200/35 blur-3xl" aria-hidden="true" />

                  <div className="relative z-[1] space-y-4 sm:space-y-6">
                    {/* Heading intentionally omitted — the page hero above already
                        carries the section title and description. */}

                  {/* Students Sub-Tabs — hidden on dedicated Reports view */}
                  {dashboardSubTab === 'students' ? (
                  <div className="rounded-2xl border border-white/80 bg-white/90 p-2 shadow-sm backdrop-blur-sm">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button
                        variant={studentsSubTab === 'list' ? 'default' : 'ghost'}
                        className={
                          studentsSubTab === 'list'
                            ? 'bg-indigo-blue-600 text-white hover:bg-indigo-blue-700'
                            : 'text-slate-600 hover:bg-white hover:text-slate-900'
                        }
                        onClick={() => setStudentsSubTab('list')}
                      >
                        <Users className="mr-2 h-4 w-4" />
                        Student List
                      </Button>
                      <Button
                        variant={studentsSubTab === 'track-progress' ? 'default' : 'ghost'}
                        className={
                          studentsSubTab === 'track-progress'
                            ? 'bg-indigo-blue-600 text-white hover:bg-indigo-blue-700'
                            : 'text-slate-600 hover:bg-white hover:text-slate-900'
                        }
                        onClick={() => setStudentsSubTab('track-progress')}
                      >
                        <BarChart3 className="mr-2 h-4 w-4" />
                        Track Progress
                      </Button>
                      <Button
                        variant={studentsSubTab === 'submissions' ? 'default' : 'ghost'}
                        className={
                          studentsSubTab === 'submissions'
                            ? 'bg-indigo-blue-600 text-white hover:bg-indigo-blue-700'
                            : 'text-slate-600 hover:bg-white hover:text-slate-900'
                        }
                        onClick={() => setStudentsSubTab('submissions')}
                      >
                        <FileText className="mr-2 h-4 w-4" />
                        H.W Submissions
                      </Button>
                      <Button
                        variant={studentsSubTab === 'daily' ? 'default' : 'ghost'}
                        className={
                          studentsSubTab === 'daily'
                            ? 'bg-indigo-blue-600 text-white hover:bg-indigo-blue-700'
                            : 'text-slate-600 hover:bg-white hover:text-slate-900'
                        }
                        onClick={() => setStudentsSubTab('daily')}
                      >
                        <BookMarked className="mr-2 h-4 w-4" />
                        Diary
                      </Button>
                    </div>
                  </div>
                  ) : null}

                  {/* Student List Sub-Tab */}
                  {dashboardSubTab === 'students' && studentsSubTab === 'list' && (
                    <>
                      {/* Search Bar */}
                      <div className="rounded-2xl border border-white/80 bg-white/90 p-4 shadow-sm backdrop-blur-sm">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-indigo-blue-500" />
                          <Input
                            placeholder="Search students by name, email, or phone..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full rounded-xl border-indigo-blue-100 bg-white pl-10 text-slate-900"
                          />
                        </div>
                      </div>

                  <div className="rounded-2xl border border-white/80 bg-white/90 p-4 shadow-sm backdrop-blur-sm sm:p-6">
                    <DashboardScrollPanel>
                      <table className="w-full min-w-[960px]">
                        <thead className="sticky top-0 z-10 bg-white">
                          <tr className="border-b border-gray-200">
                            <th className="bg-white text-left py-3 px-4 font-medium text-gray-900">Student</th>
                            <th className="bg-white text-left py-3 px-4 font-medium text-gray-900">Contact</th>
                            <th className="bg-white text-left py-3 px-4 font-medium text-gray-900">Class</th>
                            <th className="bg-white text-left py-3 px-4 font-medium text-gray-900">Status</th>
                            <th className="bg-white text-left py-3 px-4 font-medium text-gray-900">Overall Progress</th>
                            <th className="bg-white text-left py-3 px-4 font-medium text-gray-900">Average</th>
                            <th className="bg-white text-left py-3 px-4 font-medium text-gray-900">Last Login</th>
                            <th className="bg-white text-left py-3 px-4 font-medium text-gray-900">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredStudents.map((student) => {
                              const perf = student.performance || {};
                              const classDisplay = student.assignedClass 
                                ? `${student.assignedClass.classNumber || student.classNumber}${student.assignedClass.section || ''}`
                                : student.classNumber;
                              
                              return (
                                <tr key={student.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                                  <td className="py-3 px-4">
                                    <div>
                                      <p className="font-medium text-gray-900">{student.name || student.fullName}</p>
                                      <p className="text-xs sm:text-sm text-gray-600">{student.email}</p>
                                    </div>
                                  </td>
                                  <td className="py-3 px-4">
                                    <div>
                                      {student.phone ? (
                                        <p className="text-xs sm:text-sm text-gray-900">{student.phone}</p>
                                      ) : (
                                        <p className="text-xs sm:text-sm text-gray-400">No phone</p>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-3 px-4">
                                    <Badge className="bg-blue-100 text-blue-800">{classDisplay}</Badge>
                                  </td>
                                  <td className="py-3 px-4">
                                    <Badge className={student.isActive !== false ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                                      {student.isActive !== false ? 'Active' : 'Inactive'}
                                    </Badge>
                                  </td>
                                  <td className="py-3 px-4">
                                    {perf.overallProgress !== null && perf.overallProgress !== undefined && perf.overallProgress > 0 ? (
                                      <div>
                                        <div className="flex items-center space-x-2 mb-2">
                                          <span className="text-xs sm:text-sm font-medium text-gray-900">Overall Progress:</span>
                                          <Badge className={perf.overallProgress >= 70 ? 'bg-green-100 text-green-800' : 
                                                           perf.overallProgress >= 50 ? 'bg-yellow-100 text-yellow-800' : 
                                                           'bg-red-100 text-red-800'}>
                                            {perf.overallProgress.toFixed(1)}%
                                          </Badge>
                                        </div>
                                        <div className="w-full bg-gray-200 rounded-full h-2">
                                          <div 
                                            className={`h-2 rounded-full ${
                                              perf.overallProgress >= 70 ? 'bg-green-500' : 
                                              perf.overallProgress >= 50 ? 'bg-yellow-500' : 
                                              'bg-red-500'
                                            }`}
                                            style={{ width: `${perf.overallProgress}%` }}
                                          />
                                        </div>
                                        {perf.totalExams > 0 && (
                                          <p className="text-xs text-gray-500 mt-1">{perf.totalExams} exam{perf.totalExams !== 1 ? 's' : ''} completed</p>
                                        )}
                                        {perf.learningProgress !== null && perf.learningProgress !== undefined && perf.learningProgress > 0 && (
                                          <div className="mt-2 pt-2 border-t border-gray-200">
                                            <div className="flex items-center justify-between mb-1">
                                              <span className="text-xs text-gray-600">Learning Progress:</span>
                                              <Badge className={
                                                perf.learningProgress >= 70 ? 'bg-blue-100 text-blue-800' : 
                                                perf.learningProgress >= 50 ? 'bg-yellow-100 text-yellow-800' : 
                                                'bg-red-100 text-red-800'
                                              }>
                                                {perf.learningProgress.toFixed(0)}%
                                              </Badge>
                                            </div>
                                            <div className="w-full bg-gray-200 rounded-full h-1.5">
                                              <div 
                                                className={`h-1.5 rounded-full ${
                                                  perf.learningProgress >= 70 ? 'bg-blue-500' : 
                                                  perf.learningProgress >= 50 ? 'bg-yellow-500' : 
                                                  'bg-red-500'
                                                }`}
                                                style={{ width: `${Math.min(perf.learningProgress, 100)}%` }}
                                              />
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    ) : (
                                      <div className="max-w-[14rem] rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-violet-50/80 px-3 py-2.5">
                                        <p className="text-xs font-semibold text-indigo-700">No progress yet</p>
                                        <p className="mt-0.5 text-xs text-slate-500">No exams taken</p>
                                        <p className="text-xs text-slate-500">No content completed</p>
                                      </div>
                                    )}
                                  </td>
                                  <td className="py-3 px-4">
                                    {perf.totalExams > 0 ? (
                                      <div>
                                        <span className="text-xs sm:text-sm font-medium text-gray-900">
                                          {perf.averageMarks?.toFixed(1) || '0'}
                                        </span>
                                        <p className="text-xs text-gray-500">{perf.totalExams} exam{perf.totalExams !== 1 ? 's' : ''}</p>
                                      </div>
                                    ) : (
                                      <span className="text-xs sm:text-sm text-gray-400">-</span>
                                    )}
                                  </td>
                                  <td className="py-3 px-4">
                                    {student.lastLogin ? (
                                      <div>
                                        <p className="text-xs sm:text-sm text-gray-900">
                                          {new Date(student.lastLogin).toLocaleDateString()}
                                        </p>
                                        <p className="text-xs text-gray-500">
                                          {new Date(student.lastLogin).toLocaleTimeString()}
                                        </p>
                                      </div>
                                    ) : (
                                      <span className="text-xs sm:text-sm text-gray-400">Never</span>
                                    )}
                                  </td>
                                  <td className="py-3 px-4">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600 border-0"
                                      onClick={() => {
                                        setSelectedStudentForRemark(student);
                                        setIsRemarkDialogOpen(true);
                                      }}
                                    >
                                      <MessageSquare className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                                      Add Remark
                                    </Button>
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </DashboardScrollPanel>
                  </div>

                  {/* Add Remark Dialog */}
                  <Dialog open={isRemarkDialogOpen} onOpenChange={setIsRemarkDialogOpen}>
                    <DialogContent className="sm:max-w-[500px]">
                      <DialogHeader>
                        <DialogTitle className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                          Add Remark for {selectedStudentForRemark?.name || selectedStudentForRemark?.fullName}
                        </DialogTitle>
                        <DialogDescription>
                          Add a remark that will be visible to the student on their dashboard.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 mt-4">
                        <div className="space-y-2">
                          <Label htmlFor="remark-type">Remark Type</Label>
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant={isPositiveRemark ? "default" : "outline"}
                              className={isPositiveRemark ? "bg-green-500 hover:bg-green-600" : ""}
                              onClick={() => setIsPositiveRemark(true)}
                            >
                              Positive
                            </Button>
                            <Button
                              type="button"
                              variant={!isPositiveRemark ? "default" : "outline"}
                              className={!isPositiveRemark ? "bg-orange-500 hover:bg-orange-600" : ""}
                              onClick={() => setIsPositiveRemark(false)}
                            >
                              Needs Improvement
                            </Button>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="subject">Subject (Optional)</Label>
                          <Select value={selectedSubjectForRemark} onValueChange={setSelectedSubjectForRemark}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select subject (optional)" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="general">General Remark</SelectItem>
                              {teacherSubjects.map((subject) => (
                                <SelectItem key={subject._id || subject.id} value={subject._id || subject.id}>
                                  {subject.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="remark">
                            Remark <span className="text-red-500" aria-hidden="true">*</span>
                          </Label>
                          <Textarea
                            id="remark"
                            placeholder="Enter your remark here..."
                            value={remarkText}
                            onChange={(e) => setRemarkText(e.target.value)}
                            className="min-h-[120px]"
                            required
                            aria-required="true"
                          />
                          {!remarkText.trim() ? (
                            <p className="text-xs text-muted-foreground">Remark text is required before you can add it.</p>
                          ) : null}
                        </div>
                        <div className="flex justify-end gap-2 pt-4">
                          <Button
                            variant="outline"
                            onClick={() => {
                              setIsRemarkDialogOpen(false);
                              setRemarkText('');
                              setSelectedSubjectForRemark('general');
                              setSelectedStudentForRemark(null);
                              setIsPositiveRemark(true);
                            }}
                          >
                            Cancel
                          </Button>
                          <Button
                            className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white"
                            onClick={async () => {
                              if (!selectedStudentForRemark) {
                                notify('Please select a student first.');
                                return;
                              }
                              if (!remarkText.trim()) {
                                notify('Remark is required. Please enter a remark before submitting.');
                                return;
                              }
                              
                              setIsSubmittingRemark(true);
                              try {
                                const token = getAuthToken();
                                const response = await fetch(
                                  `${API_BASE_URL}/api/teacher/students/${selectedStudentForRemark.id || selectedStudentForRemark._id}/remarks`,
                                  {
                                    method: 'POST',
                                    headers: {
                                      'Content-Type': 'application/json',
                                      'Authorization': `Bearer ${token}`
                                    },
                                    body: JSON.stringify({
                                      remark: remarkText.trim(),
                                      subject: selectedSubjectForRemark && selectedSubjectForRemark !== 'general' ? selectedSubjectForRemark : null,
                                      isPositive: isPositiveRemark
                                    })
                                  }
                                );

                                const data = await response.json();
                                if (response.ok && data.success) {
                                  // Success - close dialog and reset
                                  setIsRemarkDialogOpen(false);
                                  setRemarkText('');
                                  setSelectedSubjectForRemark('general');
                                  setSelectedStudentForRemark(null);
                                  setIsPositiveRemark(true);
                                  await fetchTrackProgressRemarks();
                                  if (studentsSubTab === 'track-progress') {
                                    fetchAiProgressInsights(trackProgressFilteredStudents);
                                  }
                                  notify('Remark added successfully!');
                                } else {
                                  notify(data.message || 'Failed to add remark');
                                }
                              } catch (error) {
                                console.error('Error adding remark:', error);
                                notify('Failed to add remark. Please try again.');
                              } finally {
                                setIsSubmittingRemark(false);
                              }
                            }}
                            disabled={!remarkText.trim() || isSubmittingRemark}
                          >
                            {isSubmittingRemark ? 'Adding...' : 'Add Remark'}
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                    </>
                  )}

                  {/* Track Progress / Reports — student analysis */}
                  {(dashboardSubTab === 'reports' || studentsSubTab === 'track-progress') && (
                    <div id="teacher-student-progress" className="space-y-4 sm:space-y-6">
                      {/* Header — hidden on the dedicated Reports tab, which already
                          shows this title/description in the page hero above. */}
                      {dashboardSubTab !== 'reports' ? (
                      <div className="bg-white/60 backdrop-blur-xl rounded-2xl p-4 sm:p-5 shadow-sm border border-white/20">
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-11 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center shrink-0">
                            <BarChart3 className="w-5 h-5 text-white" />
                          </div>
                          <div>
                            <h2 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">Track Student Progress</h2>
                            <p className="text-sm text-gray-600">Open View on a student for exams, usage, remarks, and areas for improvement</p>
                          </div>
                        </div>
                      </div>
                      ) : null}

                      {/* Search Bar and Filters */}
                      <div className="bg-white/60 backdrop-blur-xl rounded-3xl p-3 sm:p-4 lg:p-6 shadow-xl border border-white/20">
                        <div className="space-y-4">
                          {/* Search Bar */}
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 w-3 h-3 sm:w-4 sm:h-4" />
                            <Input
                              placeholder="Search students by name, email, or phone..."
                              value={searchTerm}
                              onChange={(e) => setSearchTerm(e.target.value)}
                              className="px-0 pl-10 sm:pl-11 w-full rounded-xl bg-white/70 border-gray-200 text-gray-900 backdrop-blur-sm"
                            />
                          </div>
                          
                          {/* Filter Row */}
                          <div className="flex flex-wrap items-center gap-4">
                            {/* Filter by Class */}
                            <div className="flex items-center gap-2">
                              <Label className="text-xs sm:text-sm font-medium text-gray-700 whitespace-nowrap">Filter by Class:</Label>
                              <Select
                                value={filterByClass}
                                onValueChange={(value) => {
                                  setFilterByClass(value);
                                  setFilterByStudent('all');
                                }}
                              >
                                <SelectTrigger className="w-[180px] rounded-xl bg-white/70 border-gray-200">
                                  <SelectValue placeholder="All Classes" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="all">All Classes</SelectItem>
                                  {(() => {
                                    const uniqueClasses = Array.from(new Set(
                                      students.map(s => s.classNumber || s.assignedClass?.classNumber).filter(Boolean)
                                    )).sort((a, b) => {
                                      const numA = parseInt(a || '0');
                                      const numB = parseInt(b || '0');
                                      return numA - numB;
                                    });
                                    return uniqueClasses.map(classNum => (
                                      <SelectItem key={classNum} value={classNum || ''}>
                                        Class {classNum}
                                      </SelectItem>
                                    ));
                                  })()}
                                </SelectContent>
                              </Select>
                            </div>

                            {/* Filter by Student */}
                            <div className="flex items-center gap-2">
                              <Label className="text-xs sm:text-sm font-medium text-gray-700 whitespace-nowrap">Filter by Student:</Label>
                              <Select value={filterByStudent} onValueChange={setFilterByStudent}>
                                <SelectTrigger className="w-[200px] rounded-xl bg-white/70 border-gray-200">
                                  <SelectValue placeholder="All Students" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="all">All Students</SelectItem>
                                  {students
                                    .filter(s => {
                                      if (filterByClass !== 'all') {
                                        const studentClass = s.classNumber || s.assignedClass?.classNumber;
                                        return studentClass === filterByClass;
                                      }
                                      return true;
                                    })
                                    .map(student => {
                                      const sid = String(student.id || (student as { _id?: string })._id || '');
                                      return (
                                        <SelectItem key={sid} value={sid}>
                                          {student.name || student.email}
                                        </SelectItem>
                                      );
                                    })}
                                </SelectContent>
                              </Select>
                            </div>

                            {/* Clear Filters Button */}
                            {(filterByClass !== 'all' || filterByStudent !== 'all') && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setFilterByClass('all');
                                  setFilterByStudent('all');
                                }}
                                className="rounded-xl border-gray-300 text-gray-700 hover:bg-gray-50"
                              >
                                <X className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                                Clear Filters
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>

                      {isLoadingProgress ? (
                        <div className="bg-white/60 backdrop-blur-xl rounded-2xl px-4 py-8 shadow-sm border border-white/20 text-center">
                          <div className="flex flex-col items-center justify-center">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600 mb-3" />
                            <p className="text-sm text-gray-600">Loading student progress…</p>
                          </div>
                        </div>
                      ) : (
                        <TeacherTrackProgressPanels
                          students={trackProgressFilteredStudents}
                          remarks={trackProgressRemarks}
                          aiInsights={aiProgressInsights}
                          isLoadingAi={isLoadingAiInsights}
                          onRefreshAi={() =>
                            fetchAiProgressInsights(trackProgressFilteredStudents, {
                              refreshSeed: ++aiRefreshSeedRef.current,
                            })
                          }
                          onFetchStudentInsights={(student) =>
                            fetchAiProgressInsights([student], { updateGlobal: false })
                          }
                          getStudentHomeworkStats={getStudentHomeworkStatsForPanel}
                          classNumberFilter={filterByClass}
                          openStudentId={progressDetailStudentId}
                          onOpenStudentConsumed={() => setProgressDetailStudentId(null)}
                        />
                      )}
                    </div>
                  )}

                  {/* Submissions Sub-Tab */}
                  {dashboardSubTab === 'students' && studentsSubTab === 'submissions' && (
                    <div className="space-y-4 sm:space-y-6 lg:space-y-8">
                      {/* Header */}
                      <div className="bg-white/60 backdrop-blur-xl rounded-3xl p-3 sm:p-4 lg:p-6 shadow-xl border border-white/20">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
                          <div className="flex items-start gap-3 min-w-0">
                            <div className="w-12 h-12 shrink-0 bg-gradient-to-br from-purple-500 to-blue-600 rounded-lg flex items-center justify-center">
                              <FileText className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-white" />
                            </div>
                            <div className="min-w-0">
                              <h2 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent break-words">H.W Submissions</h2>
                              <p className="text-gray-600 text-sm break-words">View and manage student homework submissions</p>
                            </div>
                          </div>
                          <Button
                            onClick={() => setIsHomeworkModalOpen(true)}
                            className="w-full sm:w-auto shrink-0 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white shadow-lg"
                          >
                            <Plus className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
                            Create Homework
                          </Button>
                        </div>
                      </div>

                      {isLoadingSubmissions ? (
                        <div className="bg-white/60 backdrop-blur-xl rounded-3xl p-12 shadow-xl border border-white/20 text-center">
                          <div className="flex flex-col items-center justify-center">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mb-4"></div>
                            <p className="text-gray-600">Loading submissions...</p>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4 sm:space-y-6 lg:space-y-8">
                          {/* Homework Submissions Section */}
                          <div className="bg-white/60 backdrop-blur-xl rounded-3xl p-3 sm:p-4 lg:p-6 shadow-xl border border-white/20">
                            <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                              <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600" />
                              H.W Submissions
                            </h3>
                            <div className="space-y-4">
                              {homeworkSubmissions.homeworks && homeworkSubmissions.homeworks.length > 0 ? (
                                homeworkSubmissions.homeworks
                                  .sort((a: any, b: any) => {
                                    // Sort by deadline (most recent first), then by creation date
                                    const deadlineA = a.homework?.deadline ? new Date(a.homework.deadline).getTime() : 0;
                                    const deadlineB = b.homework?.deadline ? new Date(b.homework.deadline).getTime() : 0;
                                    if (deadlineB !== deadlineA) return deadlineB - deadlineA;
                                    const createdA = a.homework?.createdAt ? new Date(a.homework.createdAt).getTime() : 0;
                                    const createdB = b.homework?.createdAt ? new Date(b.homework.createdAt).getTime() : 0;
                                    return createdB - createdA;
                                  })
                                  .map((item: any) => {
                                    const homework = item.homework || {};
                                    const submissions = item.submissions || [];
                                    const homeworkId = homework._id || homework.id;
                                    const isExpanded = expandedHomework.has(homeworkId);
                                    const deadline = homework.deadline ? new Date(homework.deadline) : null;
                                    const isOverdue = deadline && deadline < new Date() && submissions.length === 0;
                                    
                                    return (
                                      <div key={homeworkId} className="border border-gray-200 rounded-xl overflow-hidden">
                                        <div
                                          className={`p-4 bg-gradient-to-r from-purple-50 to-blue-50 hover:from-purple-100 hover:to-blue-100 cursor-pointer transition-all ${isOverdue ? 'border-l-4 border-l-red-500' : ''}`}
                                          onClick={() => {
                                            const newExpanded = new Set(expandedHomework);
                                            if (isExpanded) {
                                              newExpanded.delete(homeworkId);
                                            } else {
                                              newExpanded.add(homeworkId);
                                            }
                                            setExpandedHomework(newExpanded);
                                          }}
                                        >
                                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                            <div className="flex-1 min-w-0">
                                              <h4 className="font-semibold text-gray-900 truncate">{homework.title || 'Untitled Homework'}</h4>
                                              <div
                                                className="mt-1.5 flex items-center gap-3 overflow-x-auto whitespace-nowrap text-xs sm:text-sm text-gray-600 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                                                data-no-title-case
                                              >
                                                <span className="inline-flex items-center gap-1.5 shrink-0">
                                                  <BookOpen className="h-3.5 w-3.5 text-violet-600" />
                                                  <span className="font-medium text-gray-800">{homework.subject?.name || homework.subject || 'N/A'}</span>
                                                </span>
                                                {homework.classNumber ? (
                                                  <span className="inline-flex items-center gap-1.5 shrink-0">
                                                    <GraduationCap className="h-3.5 w-3.5 text-blue-600" />
                                                    <span>Class {homework.classNumber}</span>
                                                  </span>
                                                ) : null}
                                                {homework.topic ? (
                                                  <span className="inline-flex items-center gap-1.5 shrink-0">
                                                    <Layers className="h-3.5 w-3.5 text-amber-600" />
                                                    <span>{homework.topic}</span>
                                                  </span>
                                                ) : null}
                                                {deadline ? (
                                                  <span className={`inline-flex items-center gap-1.5 shrink-0 ${isOverdue ? 'font-medium text-red-600' : 'text-gray-700'}`}>
                                                    <Clock className={`h-3.5 w-3.5 ${isOverdue ? 'text-red-600' : 'text-emerald-600'}`} />
                                                    <span>
                                                      {deadline.toLocaleDateString()} {deadline.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                  </span>
                                                ) : null}
                                              </div>
                                              {homework.description && (
                                                <p className="text-xs sm:text-sm text-gray-600 mt-2 italic">{homework.description}</p>
                                              )}
                                              <div
                                                className="mt-2 flex flex-wrap items-center gap-2"
                                                onClick={(e) => e.stopPropagation()}
                                                onPointerDown={(e) => e.stopPropagation()}
                                              >
                                                {homework.fileUrl ? (
                                                  <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    className="bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200"
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      openProtectedFile(homework.fileUrl, homework.title || 'Homework');
                                                    }}
                                                  >
                                                    <FileText className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                                                    View Homework File
                                                  </Button>
                                                ) : null}
                                                <Button
                                                  type="button"
                                                  size="sm"
                                                  variant="outline"
                                                  className="bg-red-50 text-red-700 hover:bg-red-100 border-red-200"
                                                  disabled={deletingHomeworkId === String(homeworkId)}
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    void handleDeleteHomework(homework);
                                                  }}
                                                >
                                                  <Trash2 className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                                                  {deletingHomeworkId === String(homeworkId) ? 'Deleting…' : 'Delete'}
                                                </Button>
                                              </div>
                                            </div>
                                            <ChevronDown
                                              className={`w-4 h-4 sm:w-5 sm:h-5 text-gray-500 transition-transform ${isExpanded ? 'transform rotate-180' : ''}`}
                                            />
                                          </div>
                                        </div>
                                        {isExpanded && (
                                          <div className="p-4 bg-white border-t border-gray-200">
                                            {submissions.length > 0 ? (
                                              <div className="space-y-3">
                                                {submissions.map((submission: any) => (
                                                  <div key={submission._id} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                                                    <div className="flex items-start justify-between">
                                                      <div className="flex-1">
                                                        <div className="flex items-center gap-3 mb-2">
                                                          <p className="font-medium text-gray-900">
                                                            {submission.studentId?.fullName || submission.studentId?.name || 'Unknown Student'}
                                                          </p>
                                                          <Badge className="bg-green-100 text-green-800">Submitted</Badge>
                                                          {submission.grade !== null && submission.grade !== undefined && (
                                                            <Badge className="bg-blue-100 text-blue-800">
                                                              Grade: {submission.grade}%
                                                            </Badge>
                                                          )}
                                                        </div>
                                                        <p className="text-xs sm:text-sm text-gray-600 mb-2">
                                                          {submission.studentId?.email || ''}
                                                        </p>
                                                        {submission.description && (
                                                          <p className="text-xs sm:text-sm text-gray-700 mb-2">{submission.description}</p>
                                                        )}
                                                        <div className="flex items-center gap-4 text-xs text-gray-500">
                                                          <span>Submitted: {new Date(submission.submittedAt).toLocaleString()}</span>
                                                          {submission.feedback && (
                                                            <span className="text-gray-600">Feedback: {submission.feedback}</span>
                                                          )}
                                                        </div>
                                                      </div>
                                                      <div className="ml-4">
                                                        {submission.submissionLink ? (
                                                        <Button
                                                          type="button"
                                                          size="sm"
                                                          variant="outline"
                                                          className="bg-purple-50 text-purple-700 hover:bg-purple-100 border-purple-200"
                                                          onClick={(e) => {
                                                            e.stopPropagation();
                                                            openProtectedFile(
                                                              submission.submissionLink,
                                                              `${submission.studentId?.fullName || submission.studentId?.name || 'Student'} submission`,
                                                            );
                                                          }}
                                                        >
                                                          <Eye className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                                                          View Submission
                                                        </Button>
                                                        ) : null}
                                                      </div>
                                                    </div>
                                                  </div>
                                                ))}
                                              </div>
                                            ) : (
                                              <div className="text-center py-4 sm:py-6 lg:py-8 text-gray-500">
                                                <FileText className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                                                <p>No submissions yet for this homework</p>
                                                {deadline && deadline < new Date() && (
                                                  <p className="text-xs sm:text-sm text-red-600 mt-2">This homework is overdue</p>
                                                )}
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })
                              ) : (
                                <div className="text-center py-12 text-gray-500">
                                  <FileText className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                                  <p>No homework assignments found for your assigned subjects</p>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Submissions by Students Section */}
                          <div className="bg-white/60 backdrop-blur-xl rounded-3xl p-3 sm:p-4 lg:p-6 shadow-xl border border-white/20">
                            <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                              <Users className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600" />
                              H.W Submissions by Students
                            </h3>

                            <div className="space-y-1">
                              {submissionClassList.length === 0 ? (
                                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/80 px-4 py-10 text-center text-sm text-gray-500">
                                  No classes assigned yet.
                                </div>
                              ) : (
                                submissionClassList.map((classNum) => {
                                  const classOpen = expandedSubmissionClasses.has(classNum);
                                  const sections = submissionClassSectionMap.get(classNum);
                                  const sectionList = sections
                                    ? Array.from(sections).sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }))
                                    : [];

                                  return (
                                    <div key={classNum} className="border-b border-gray-100 last:border-0">
                                      <button
                                        type="button"
                                        className="flex w-full items-center gap-2 py-3 text-left text-lg font-semibold text-indigo-950 hover:text-indigo-700"
                                        onClick={() => {
                                          setExpandedSubmissionClasses((prev) => {
                                            const next = new Set(prev);
                                            if (next.has(classNum)) next.delete(classNum);
                                            else next.add(classNum);
                                            return next;
                                          });
                                        }}
                                      >
                                        <ChevronDown
                                          className={cn(
                                            'h-4 w-4 shrink-0 text-indigo-900 transition-transform duration-200',
                                            !classOpen && '-rotate-90'
                                          )}
                                          aria-hidden
                                        />
                                        <span>{classNum}</span>
                                      </button>

                                      {classOpen && (
                                        <div className="ml-5 space-y-2 pb-3">
                                          {sectionList.length === 0 ? (
                                            <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-xs text-gray-500">
                                              No sections for this class.
                                            </p>
                                          ) : (
                                            sectionList.map((section) => {
                                              const sectionKey = `${classNum}-${section}`;
                                              const sectionOpen =
                                                expandedSubmissionSections.has(sectionKey);
                                              const sectionStudents = getStudentsInClassSection(
                                                students,
                                                classNum,
                                                section
                                              ).filter((student) => {
                                                const studentId = String(
                                                  student.id || (student as { _id?: string })._id || ''
                                                );
                                                const submissionGroup = homeworkSubmissions.students?.find(
                                                  (item: any) =>
                                                    String(item.student?._id || item.student?.id || '') === studentId
                                                );
                                                return Array.isArray(submissionGroup?.submissions) &&
                                                  submissionGroup.submissions.length > 0;
                                              });

                                              return (
                                                <div
                                                  key={sectionKey}
                                                  className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm"
                                                >
                                                  <button
                                                    type="button"
                                                    className="flex w-full items-center gap-2 px-4 py-3 text-left font-medium text-indigo-950 hover:bg-gray-50/80"
                                                    onClick={() => {
                                                      setExpandedSubmissionSections((prev) => {
                                                        const next = new Set(prev);
                                                        if (next.has(sectionKey)) next.delete(sectionKey);
                                                        else next.add(sectionKey);
                                                        return next;
                                                      });
                                                    }}
                                                  >
                                                    <ChevronRight
                                                      className={cn(
                                                        'h-4 w-4 shrink-0 text-indigo-900 transition-transform duration-200',
                                                        sectionOpen && 'rotate-90'
                                                      )}
                                                      aria-hidden
                                                    />
                                                    <span>Section {section}</span>
                                                    <span className="ml-auto text-xs font-normal text-gray-500">
                                                      {sectionStudents.length} student
                                                      {sectionStudents.length !== 1 ? 's' : ''}
                                                    </span>
                                                  </button>

                                                  {sectionOpen && (
                                                    <div className="space-y-2 border-t border-gray-100 bg-gray-50/50 p-2">
                                                      {sectionStudents.length > 0 ? (
                                                        sectionStudents.map((student) => {
                                  const studentId = student.id || (student as { _id?: string })._id;
                                  const isExpanded = expandedStudent.has(String(studentId));

                                  const studentSubmissions = homeworkSubmissions.students?.find(
                                    (item: any) =>
                                      String(item.student?._id || item.student?.id || '') === String(studentId || '')
                                  )?.submissions || [];
                                  
                                  return (
                                    <div key={studentId} className="border border-gray-200 rounded-xl overflow-hidden">
                                      <div
                                        className="p-4 bg-gradient-to-r from-blue-50 to-purple-50 hover:from-blue-100 hover:to-purple-100 cursor-pointer transition-all"
                                        onClick={() => {
                                          const newExpanded = new Set(expandedStudent);
                                          const sid = String(studentId);
                                          if (isExpanded) {
                                            newExpanded.delete(sid);
                                          } else {
                                            newExpanded.add(sid);
                                          }
                                          setExpandedStudent(newExpanded);
                                        }}
                                      >
                                        <div className="flex items-start justify-between gap-3">
                                          <div className="min-w-0 flex-1">
                                            <h4 className="font-semibold text-gray-900">
                                              {student.name || (student as { fullName?: string }).fullName || 'Unknown Student'}
                                            </h4>
                                            <p className="mt-1 text-xs sm:text-sm text-gray-600">{student.email || ''}</p>
                                            <Badge className={`mt-2 ${studentSubmissions.length > 0 ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'}`}>
                                              {studentSubmissions.length} homework{studentSubmissions.length !== 1 ? 's' : ''} submitted
                                            </Badge>
                                          </div>
                                          <ChevronDown
                                            className={`mt-1 w-4 h-4 sm:w-5 sm:h-5 shrink-0 text-gray-500 transition-transform ${isExpanded ? 'transform rotate-180' : ''}`}
                                          />
                                        </div>
                                      </div>
                                      {isExpanded && (
                                        <div className="p-4 bg-white border-t border-gray-200">
                                          {studentSubmissions.length > 0 ? (
                                            <div className="space-y-3">
                                              {studentSubmissions.map((submission: any) => (
                                                <div key={submission._id} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                                                  <div className="flex items-start justify-between">
                                                    <div className="flex-1">
                                                      <h5 className="font-medium text-gray-900 mb-2">
                                                        {submission.homeworkId?.title || 'Untitled Homework'}
                                                      </h5>
                                                      <div className="flex items-center gap-4 mb-2 text-xs sm:text-sm text-gray-600">
                                                        <span>Subject: {submission.subjectId?.name || submission.subjectId || 'N/A'}</span>
                                                        {submission.homeworkId?.deadline && (
                                                          <span>Deadline: {new Date(submission.homeworkId.deadline).toLocaleDateString()}</span>
                                                        )}
                                                      </div>
                                                      {submission.description && (
                                                        <p className="text-xs sm:text-sm text-gray-700 mb-2">{submission.description}</p>
                                                      )}
                                                      <div className="flex items-center gap-4 text-xs text-gray-500">
                                                        <span>Submitted: {new Date(submission.submittedAt).toLocaleString()}</span>
                                                        {submission.grade !== null && submission.grade !== undefined && (
                                                          <span>Grade: {submission.grade}%</span>
                                                        )}
                                                      </div>
                                                    </div>
                                                    <div className="ml-4">
                                                      <Button
                                                        size="sm"
                                                        variant="outline"
                                                        asChild
                                                        className="bg-purple-50 text-purple-700 hover:bg-purple-100 border-purple-200"
                                                      >
                                                        <a
                                                          href={submission.submissionLink}
                                                          target="_blank"
                                                          rel="noopener noreferrer"
                                                          onClick={(e) => e.stopPropagation()}
                                                        >
                                                          <Eye className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                                                          View
                                                        </a>
                                                      </Button>
                                                    </div>
                                                  </div>
                                                </div>
                                              ))}
                                            </div>
                                          ) : (
                                            <div className="text-center py-4 sm:py-6 lg:py-8 text-gray-500">
                                              <FileText className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                                              <p>No submissions from this student</p>
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  );
                                                        })
                                                      ) : (
                                                        <div className="py-6 text-center text-sm text-gray-500">
                                                          <Users className="mx-auto mb-2 h-10 w-10 text-gray-400" />
                                                          <p>No homework submissions in this section</p>
                                                        </div>
                                                      )}
                                                    </div>
                                                  )}
                                                </div>
                                              );
                                            })
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {dashboardSubTab === 'students' && studentsSubTab === 'daily' && <TeacherWorkDiaryPanel />}

                  </div>
                </div>
              )}

              {/* EduOTT opens /edu-ott (same UI as student) */}
            </div>

        {/* Add Video Modal */}
        <Dialog open={isAddVideoModalOpen} onOpenChange={setIsAddVideoModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg sm:text-xl font-semibold text-gray-800">Add New Video</DialogTitle>
            <DialogDescription>
              Create a new educational video for your students.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateVideo} className="space-y-4">
            <div>
              <Label htmlFor="video-title" className="text-gray-700 font-medium">Title *</Label>
              <Input
                id="video-title"
                value={videoForm.title}
                onChange={(e) => setVideoForm(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Enter video title"
                required
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="video-description" className="text-gray-700 font-medium">Description</Label>
              <Textarea
                id="video-description"
                value={videoForm.description}
                onChange={(e) => setVideoForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Enter video description"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="video-url" className="text-gray-700 font-medium">Video URL *</Label>
              <Input
                id="video-url"
                type="url"
                value={videoForm.videoUrl}
                onChange={(e) => setVideoForm(prev => ({ ...prev, videoUrl: e.target.value }))}
                placeholder="https://youtube.com/watch?v=..."
                required
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="video-subject" className="text-gray-700 font-medium">Subject *</Label>
              {teacherSubjects.length === 0 && (
                <div className="mt-1 mb-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-xs sm:text-sm text-yellow-800">
                    <strong>No subjects assigned:</strong> You need to be assigned subjects by an admin before creating videos. 
                    Please contact your administrator to assign subjects to your account.
                  </p>
                </div>
              )}
              <Select value={videoForm.subject} onValueChange={(value) => setVideoForm(prev => ({ ...prev, subject: value }))}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select subject" />
                </SelectTrigger>
                <SelectContent>
                  {teacherSubjects.length > 0 ? (
                    teacherSubjects.map(subject => (
                      <SelectItem key={subject._id || subject.id} value={subject.name}>
                        {subject.name}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="no-subjects" disabled>
                      No subjects assigned - Contact admin to assign subjects
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="video-duration" className="text-gray-700 font-medium">Duration (minutes) *</Label>
              <Input
                id="video-duration"
                type="number"
                value={videoForm.duration}
                onChange={(e) => setVideoForm(prev => ({ ...prev, duration: e.target.value }))}
                placeholder="60"
                required
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="video-difficulty" className="text-gray-700 font-medium">Difficulty</Label>
              <Select value={videoForm.difficulty} onValueChange={(value) => setVideoForm(prev => ({ ...prev, difficulty: value }))}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select difficulty" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="easy">Easy</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="hard">Hard</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end space-x-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setIsAddVideoModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isCreatingVideo || teacherSubjects.length === 0} className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600">
                {isCreatingVideo ? 'Creating...' : teacherSubjects.length === 0 ? 'No Subjects Assigned' : 'Create Video'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>


      {/* Video Viewer Modal */}
      <Dialog open={isVideoViewerOpen} onOpenChange={setIsVideoViewerOpen}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle className="text-lg sm:text-xl font-semibold text-gray-800">
              {selectedVideo?.title || 'Video Viewer'}
            </DialogTitle>
            <DialogDescription>
              {selectedVideo?.description || 'Watch your uploaded video'}
            </DialogDescription>
          </DialogHeader>
          
          {selectedVideo && (
            <div className="space-y-4">
              {/* Video Player */}
              <div className="aspect-video bg-black rounded-lg overflow-hidden">
                {selectedVideo.videoUrl ? (
                  <iframe
                    src={selectedVideo.videoUrl}
                    title={selectedVideo.title}
                    className="w-full h-full"
                    allowFullScreen
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-white">
                    <div className="text-center">
                      <Play className="w-16 h-16 mx-auto mb-4" />
                      <p>Video URL not available</p>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Video Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs sm:text-sm">
                <div>
                  <span className="font-medium text-gray-700">Subject:</span>
                  <span className="ml-2 text-gray-900">{selectedVideo.subject}</span>
                </div>
                <div>
                  <span className="font-medium text-gray-700">Duration:</span>
                  <span className="ml-2 text-gray-900">{selectedVideo.duration} minutes</span>
                </div>
                <div>
                  <span className="font-medium text-gray-700">Difficulty:</span>
                  <span className="ml-2 text-gray-900 capitalize">{selectedVideo.difficulty}</span>
                </div>
                <div>
                  <span className="font-medium text-gray-700">Views:</span>
                  <span className="ml-2 text-gray-900">{selectedVideo.views || 0}</span>
                </div>
              </div>
            </div>
          )}
          
          <div className="flex justify-end pt-4">
            <Button variant="outline" onClick={() => setIsVideoViewerOpen(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Homework Modal */}
      <Dialog open={isHomeworkModalOpen} onOpenChange={setIsHomeworkModalOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl sm:text-2xl font-bold">Create Homework</DialogTitle>
            <DialogDescription>
              Create homework assignment for your assigned classes and students
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateHomework} className="space-y-4">
            <div>
              <Label htmlFor="homework-title">Title *</Label>
              <Input
                id="homework-title"
                value={homeworkForm.title}
                onChange={(e) => setHomeworkForm({ ...homeworkForm, title: e.target.value })}
                placeholder="Enter homework title"
                required
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="homework-description">Description</Label>
              <Textarea
                id="homework-description"
                value={homeworkForm.description}
                onChange={(e) => setHomeworkForm({ ...homeworkForm, description: e.target.value })}
                placeholder="Enter homework description"
                rows={3}
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="homework-subject">Subject *</Label>
                <Select
                  value={homeworkForm.subject}
                  onValueChange={(value) => setHomeworkForm({ ...homeworkForm, subject: value })}
                >
                  <SelectTrigger id="homework-subject" className="mt-1">
                    <SelectValue placeholder="Select subject" />
                  </SelectTrigger>
                  <SelectContent>
                    {teacherSubjects.map((subject) => (
                      <SelectItem key={subject._id || subject.id} value={subject._id || subject.id}>
                        {subject.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="homework-class">Class (Optional)</Label>
                <Select
                  value={homeworkForm.classNumber || 'all'}
                  onValueChange={(value) => setHomeworkForm({ ...homeworkForm, classNumber: value === 'all' ? '' : value })}
                >
                  <SelectTrigger id="homework-class" className="mt-1">
                    <SelectValue placeholder="Select class" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Classes</SelectItem>
                    {assignedClasses.map((classItem) => (
                      <SelectItem key={classItem._id || classItem.id} value={classItem.classNumber || classItem.name}>
                        {classItem.name || classItem.classNumber}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="homework-topic">Topic (Optional)</Label>
              <Input
                id="homework-topic"
                value={homeworkForm.topic}
                onChange={(e) => setHomeworkForm({ ...homeworkForm, topic: e.target.value })}
                placeholder="e.g., Algebra, Mechanics"
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="homework-date">Date *</Label>
                <Input
                  id="homework-date"
                  type="date"
                  value={homeworkForm.date}
                  onChange={(e) => setHomeworkForm({ ...homeworkForm, date: e.target.value })}
                  required
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="homework-deadline">Deadline *</Label>
                <Input
                  id="homework-deadline"
                  type="date"
                  value={homeworkForm.deadline}
                  onChange={(e) => setHomeworkForm({ ...homeworkForm, deadline: e.target.value })}
                  min={homeworkForm.date}
                  required
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="homework-file">File *</Label>
              <div className="space-y-2">
                <Input
                  id="homework-file"
                  type="file"
                  accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setSelectedHomeworkFile(file);
                      setHomeworkForm({ ...homeworkForm, fileUrl: '' });
                    }
                  }}
                  className="cursor-pointer mt-1"
                />
                {selectedHomeworkFile && (
                  <p className="text-xs text-green-600">
                    Selected: {selectedHomeworkFile.name} ({(selectedHomeworkFile.size / 1024 / 1024).toFixed(2)} MB)
                  </p>
                )}
                <div className="text-xs text-gray-500">
                  <p className="font-semibold mb-1">Or enter a URL:</p>
                  <Input
                    id="homework-fileUrl"
                    value={homeworkForm.fileUrl}
                    onChange={(e) => {
                      setHomeworkForm({ ...homeworkForm, fileUrl: e.target.value });
                      if (e.target.value) setSelectedHomeworkFile(null);
                    }}
                    placeholder="https://example.com/homework.pdf or Google Drive link"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Accepted formats: PDF, DOC, DOCX, PPT, PPTX, XLS, XLSX, TXT
                </p>
              </div>
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsHomeworkModalOpen(false);
                  setHomeworkForm({
                    title: '',
                    description: '',
                    subject: '',
                    classNumber: '',
                    topic: '',
                    date: localYmd(),
                    deadline: '',
                    fileUrl: ''
                  });
                  setSelectedHomeworkFile(null);
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isCreatingHomework || isUploadingHomeworkFile}
                className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white"
              >
                {isCreatingHomework || isUploadingHomeworkFile ? (
                  <>
                    <div className="animate-spin rounded-full h-3 w-3 sm:h-4 sm:w-4 border-b-2 border-white mr-2"></div>
                    {isUploadingHomeworkFile ? 'Uploading...' : 'Creating...'}
                  </>
                ) : (
                  'Create Homework'
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      </div>
    </TeacherShell>
  );
};

export default TeacherDashboard;
