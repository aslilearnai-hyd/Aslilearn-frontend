import { Suspense, lazy, useState, useEffect, useMemo, type FormEvent } from "react";
import { motion } from "framer-motion";
import SuperAdminSidebar from "@/components/dashboard/SuperAdminSidebar";
import type { SuperAdminView } from "@/lib/super-admin-views";
import { clearAuthData, getAuthToken, getUser } from "@/lib/auth-utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BellIcon, UsersIcon, Users2, TrendingUpIcon, BookIcon, UserPlusIcon, BookPlusIcon, SettingsIcon, DownloadIcon, HomeIcon, CrownIcon, BarChart3Icon, ArrowUpRightIcon, ArrowDownRightIcon, StarIcon, TargetIcon, BrainIcon, ZapIcon, AlertTriangleIcon, TrendingDownIcon, RefreshCw, Sparkles, MessageSquare, Clock, Plus, Monitor, Grid3x3, Shield, Search, Camera, PieChart, User, Download, Circle, Square, Bot, UploadIcon, BrainCircuitIcon, AlertTriangle, KeyRound, Loader2, Eye, EyeOff } from "lucide-react";
import { LineChart, Line, PieChart as RechartsPieChart, Pie, Cell, ResponsiveContainer, AreaChart, Area } from "recharts";
import { useToast } from "@/hooks/use-toast";
import { API_BASE_URL } from "@/lib/api-config";
import { cn } from "@/lib/utils";
import { InteractiveBackground, FloatingParticles } from "@/components/background/InteractiveBackground";
import { useSuperAdminDrawerNav } from "@/hooks/use-mobile";
import {
  clearSuperAdminDashboardQueryFromUrl,
  consumeSuperAdminViewRestore,
  persistSuperAdminView,
  readPersistedSuperAdminView,
} from "@/lib/super-admin-nav";
import { VidyaAnalyticsCard } from "@/components/super-admin/VidyaAnalyticsCard";
import { Input } from "@/components/ui/input";
const AdminManagement = lazy(() => import("@/components/admin/AdminManagement"));
const CombinedSuperAdminAnalytics = lazy(() => import("./combined-super-admin-analytics"));
const BoardComparisonCharts = lazy(() => import("@/components/admin/board-comparison-charts"));
const SubjectManagement = lazy(() => import("@/components/super-admin/subject-management"));
const SubjectContentManagement = lazy(() => import("@/components/super-admin/subject-content-management"));
const ExamManagement = lazy(() => import("@/components/super-admin/exam-management"));
const IQRankBoostActivities = lazy(() => import("@/components/super-admin/iq-rank-boost-activities"));
const SuperAdminCalendar = lazy(() => import("@/components/super-admin/super-admin-calendar"));
const AIChat = lazy(() => import("@/components/ai-chat"));
const AiToolGenerationsPanel = lazy(() => import("@/components/super-admin/ai-tool-generations/AiToolGenerationsPanel"));
const AiToolDuplicatesPanel = lazy(() => import("@/components/super-admin/ai-tool-duplicates-panel"));
const AiToolTopicsManagement = lazy(() => import("@/components/super-admin/ai-tool-topics-management"));
const SuperAdminAiGenerator = lazy(() => import("@/components/super-admin/ai-generator"));
const BookKnowledgeBase = lazy(() => import("@/components/super-admin/book-knowledge-base"));
const BookBasedGenerator = lazy(() => import("@/components/super-admin/book-based-generator"));
const LiveSessions = lazy(() => import("@/components/super-admin/live-sessions"));
const SubscriptionManagement = lazy(() => import("@/components/super-admin/subscription-management"));
const ProductsManagement = lazy(() => import("@/components/super-admin/products-management"));
const BoardsManagement = lazy(() => import("@/components/super-admin/boards-management"));
const TrialMembersManagement = lazy(() => import("@/components/super-admin/trial-members-management"));
const OmrResultsManagement = lazy(() => import("@/components/admin/omr-results-management"));

const lazySectionFallback = (
  <div className="rounded-xl border border-orange-100 bg-white p-4 sm:p-6 lg:p-8 shadow-sm">
    <div className="flex flex-col items-center justify-center gap-3 text-slate-600">
      <RefreshCw className="h-4 w-4 sm:h-5 sm:w-5 animate-spin text-orange-500" />
      <p className="text-xs sm:text-sm font-medium">Loading section...</p>
    </div>
  </div>
);

export default function SuperAdminDashboard() {
  const { toast } = useToast();
  const superAdminDrawerNav = useSuperAdminDrawerNav();
  const [currentView, setCurrentView] = useState<SuperAdminView>(
    () => readPersistedSuperAdminView() ?? "dashboard",
  );
  const [user] = useState({ 
    fullName: 'Super Admin', 
    role: 'super-admin',
    email: 'super.admin@aslilearn.com'
  });
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalStudents: 0,
    totalTeachers: 0,
    totalAdmins: 0,
    courses: 0,
    assessments: 0,
    exams: 0,
    examResults: 0,
    activeVideos: 0,
    activeAssessments: 0,
    avgExamsPerStudent: 0,
    contentEngagement: 0,
    contentVolume: 0,
    passRate: 0,
    activeStudents: 0,
    activeStudentsPercentage: 0
  });
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [realtimeAnalytics, setRealtimeAnalytics] = useState<any>(null);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(false);
  const [selectedBoard, setSelectedBoard] = useState<string | null>(null);
  const [boardData, setBoardData] = useState<any>(null);
  const [isLoadingBoard, setIsLoadingBoard] = useState(false);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [vidyaSettingsOpen, setVidyaSettingsOpen] = useState(false);
  const [systemSettingsOpen, setSystemSettingsOpen] = useState(false);
  const [vidyaExplainDepth, setVidyaExplainDepth] = useState<
    "concise" | "balanced" | "detailed"
  >("balanced");
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [changingPassword, setChangingPassword] = useState(false);
  const [showPasswordFields, setShowPasswordFields] = useState({
    current: false,
    next: false,
    confirm: false,
  });

  const dashboardRecommendations = useMemo(() => {
    const activeRate = Number(stats.activeStudentsPercentage) || 0;
    const passRate = Number(stats.passRate) || 0;
    const contentVolume = Number(stats.contentVolume ?? stats.contentEngagement) || 0;
    const totalStudents = Number(stats.totalStudents) || 0;
    const rows: Array<{ title: string; detail: string; metric: string; view?: SuperAdminView; action?: string }> = [];
    if (totalStudents > 0 && activeRate < 60) {
      rows.push({
        title: 'Improve student activation',
        detail: 'Review inactive cohorts and ask school admins to schedule a guided learning or quiz session.',
        metric: `${activeRate.toFixed(0)}% active`,
        view: 'impact-reports',
        action: 'Open school impact reports',
      });
    }
    if (Number(stats.examResults) > 0 && passRate < 70) {
      rows.push({
        title: 'Target low-performing exam topics',
        detail: 'Open Analytics to identify subjects with the largest correctness gap and assign focused practice.',
        metric: `${passRate.toFixed(0)}% pass rate`,
        view: 'analytics',
        action: 'Open exam analytics',
      });
    }
    if (contentVolume < Math.max(20, Math.ceil(totalStudents / 5))) {
      rows.push({
        title: 'Expand curriculum coverage',
        detail: 'Add or index more textbook-aligned content for classes with limited learning material.',
        metric: `${contentVolume.toLocaleString()} content items`,
        view: 'subjects-and-content',
        action: 'Open subjects & content',
      });
    }
    if (rows.length === 0) {
      rows.push({
        title: 'Platform indicators are healthy',
        detail: 'Continue monitoring engagement and exam outcomes; no urgent intervention is detected.',
        metric: `${activeRate.toFixed(0)}% active`,
      });
    }
    return rows.slice(0, 3);
  }, [stats]);

  const VIDYA_PREFS_KEY = "superAdminVidyaPrefs";

  // Same contract as AppShell: lock document scroll so only the main pane moves.
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
    };
  }, []);

  useEffect(() => {
    clearSuperAdminDashboardQueryFromUrl();
    const restore = consumeSuperAdminViewRestore();
    if (restore) {
      setCurrentView(restore);
    }
  }, []);

  useEffect(() => {
    persistSuperAdminView(currentView);
  }, [currentView]);

  const handleViewChange = (view: SuperAdminView) => {
    setCurrentView(view);
    clearSuperAdminDashboardQueryFromUrl();
  };

  // Fetch dashboard stats only on the home dashboard view (avoids slow/noisy calls on other tabs).
  useEffect(() => {
    if (currentView !== "dashboard") {
      setIsLoadingStats(false);
      return;
    }

    const fetchDashboardStats = async () => {
      try {
        const token = getAuthToken();
        const response = await fetch(`${API_BASE_URL}/api/super-admin/dashboard/stats`, {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            'Content-Type': 'application/json',
          },
          credentials: 'include',
        });

        if (response.ok) {
          const data = await response.json();
          setStats(data.data);
        } else {
          console.error('Failed to fetch dashboard stats:', response.status);
          toast({
            title: "Error",
            description: "Failed to fetch dashboard statistics",
            variant: "destructive"
          });
        }
      } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        toast({
          title: "Error",
          description: "Failed to fetch dashboard statistics",
          variant: "destructive"
        });
      } finally {
        setIsLoadingStats(false);
      }
    };

    fetchDashboardStats();
  }, [toast, currentView]);

  // Defer heavy analytics request so first paint is faster.
  useEffect(() => {
    const timerId = window.setTimeout(() => {
      fetchRealtimeAnalytics();
    }, 1200);

    return () => {
      window.clearTimeout(timerId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(VIDYA_PREFS_KEY);
      if (!raw) return;
      const p = JSON.parse(raw) as { explainDepth?: typeof vidyaExplainDepth };
      if (p.explainDepth === "concise" || p.explainDepth === "balanced" || p.explainDepth === "detailed") {
        setVidyaExplainDepth(p.explainDepth);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const saveVidyaPreferences = () => {
    localStorage.setItem(
      VIDYA_PREFS_KEY,
      JSON.stringify({ explainDepth: vidyaExplainDepth, updatedAt: Date.now() })
    );
    toast({
      title: "Preferences saved",
      description: "Vidya AI display preferences are stored in this browser.",
    });
    setVidyaSettingsOpen(false);
  };

  const fetchRealtimeAnalytics = async () => {
    setIsLoadingAnalytics(true);
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE_URL}/api/super-admin/analytics/realtime`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setRealtimeAnalytics(data.data);
        }
      }
    } catch (error) {
      console.error('Error fetching real-time analytics:', error);
    } finally {
      setIsLoadingAnalytics(false);
    }
  };

  const fetchBoardDashboard = async (
    boardCode: string,
    showToast = true,
    switchView: boolean = true
  ) => {
    setIsLoadingBoard(true);
    setBoardError(null);
    try {
      const token = getAuthToken();
      console.log('📊 Fetching board dashboard for:', boardCode);
      const response = await fetch(`${API_BASE_URL}/api/super-admin/boards/${boardCode}/dashboard`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      console.log('Board dashboard response status:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('Board dashboard data received:', data);
        if (data.success) {
          console.log('Setting board data:', data.data);
          console.log('Schools found:', data.data.schoolParticipation?.length || 0);
          setBoardData(data.data);
          setSelectedBoard(boardCode);
          if (switchView) {
            setCurrentView('board');
          }
        } else {
          console.error('API returned success: false:', data.message);
          setBoardData(null);
          setSelectedBoard(boardCode);
          setBoardError(data.message || 'Failed to fetch board data');
          if (showToast) {
            toast({
              title: 'Error',
              description: data.message || 'Failed to fetch board data',
              variant: 'destructive'
            });
          }
        }
      } else {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
        console.error('API error response:', errorData);
        setBoardData(null);
        setSelectedBoard(boardCode);
        setBoardError(errorData.message || `Failed to fetch board dashboard (${response.status})`);
        if (showToast) {
          toast({
            title: 'Error',
            description: errorData.message || `Failed to fetch board dashboard (${response.status})`,
            variant: 'destructive'
          });
        }
      }
    } catch (error) {
      console.error('Error fetching board dashboard:', error);
      setBoardData(null);
      setSelectedBoard(boardCode);
      setBoardError('Failed to fetch board dashboard. Please check your connection.');
      if (showToast) {
        toast({
          title: 'Error',
          description: 'Failed to fetch board dashboard. Please check your connection.',
          variant: 'destructive'
        });
      }
    } finally {
      setIsLoadingBoard(false);
    }
  };

  /** Same page as sidebar “Subject & Content” (current design). */
  const openSubjectAndContent = () => {
    setSelectedBoard(null);
    setCurrentView("subjects-and-content");
    clearSuperAdminDashboardQueryFromUrl();
  };

  const openAnalytics = () => {
    setSelectedBoard(null);
    setCurrentView("analytics");
    clearSuperAdminDashboardQueryFromUrl();
    void fetchRealtimeAnalytics();
  };

  const openAsliExclusiveBoard = () => {
    void fetchBoardDashboard("ASLI_EXCLUSIVE_SCHOOLS");
  };

  // Chart data - will be populated from real analytics when available
  const [totalStudentsData, setTotalStudentsData] = useState<Array<{name: string, value: number}>>([]);
  const [passRateData, setPassRateData] = useState<Array<{name: string, value: number}>>([]);

  // Chart data will be populated from real analytics when available
  const [coursesPerBoardData, setCoursesPerBoardData] = useState<Array<{name: string, value: number, color: string}>>([]);
  const [studentsPerAdminData, setStudentsPerAdminData] = useState<Array<{[key: string]: string | number}>>([]);

  const renderDashboardContent = () => {
    if (selectedBoard && currentView === 'board') {
      return renderBoardDashboard();
    }

    return (
    <div className="min-h-screen relative z-10 overflow-x-hidden">
      <div className="space-y-3 sm:space-y-4 lg:space-y-6">
        {/* Welcome Header */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">Welcome back, Super Admin</h1>
          <p className="text-gray-600">Manage boards, schools, exams, and AI analytics in one place.</p>
        </div>

        {/* Board Management */}
        <div className="space-y-4">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900">Board Management</h2>

          <Card
            className="bg-gradient-to-br from-orange-400 to-orange-500 text-white border-0 cursor-pointer hover:from-orange-500 hover:to-orange-600 transition-all duration-300 shadow-lg"
            onClick={openAsliExclusiveBoard}
          >
            <CardContent className="p-3 sm:p-4 lg:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg sm:text-xl font-bold mb-1 text-white">
                    Asli Exclusive Schools
                  </h3>
                  <p className="text-white/90 text-xs sm:text-sm">
                    All Boards Content — Unified Platform
                  </p>
                </div>
                <Users2 className="h-12 w-12 text-white" />
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Content Management - Light Blue (CBSE TS color) */}
          <Card 
            className="bg-gradient-to-br from-sky-300 to-sky-400 text-white border-0 cursor-pointer hover:from-sky-400 hover:to-sky-500 transition-all duration-300 shadow-lg"
            onClick={openSubjectAndContent}
          >
            <CardContent className="p-3 sm:p-4 lg:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg sm:text-xl font-bold mb-1 text-white">Content Management</h3>
                  <p className="text-white/90 text-xs sm:text-sm">Manage videos, notes & materials</p>
                </div>
                <UploadIcon className="h-12 w-12 text-white" />
              </div>
            </CardContent>
          </Card>

          {/* Analytics (overview + exam / AI insights) */}
          <Card 
            className="bg-gradient-to-br from-teal-400 to-teal-500 text-white border-0 cursor-pointer hover:from-teal-500 hover:to-teal-600 transition-all duration-300 shadow-lg"
            onClick={openAnalytics}
          >
            <CardContent className="p-3 sm:p-4 lg:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg sm:text-xl font-bold mb-1">Analytics</h3>
                  <p className="text-teal-100 text-xs sm:text-sm">Schools, exams &amp; AI insights</p>
                </div>
                <BrainCircuitIcon className="h-12 w-12 text-white/80" />
              </div>
            </CardContent>
          </Card>
          </div>
        </div>

        {/* Widgets Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Total Students Widget */}
          <Card className="bg-white">
          <CardContent className="p-3 sm:p-4 lg:p-6">
              <div className="flex items-center justify-between mb-4">
              <div>
                  <p className="text-xs sm:text-sm text-gray-600 mb-1">Total Students</p>
                  <p className="text-2xl sm:text-3xl font-bold text-gray-900">
                    {isLoadingStats ? '...' : (stats.totalStudents || 0).toLocaleString().replace(/\s/g, ' ')}
                  </p>
              </div>
                {totalStudentsData.length > 0 && (
                  <div className="w-16 h-12">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={totalStudentsData}>
                        <Area type="monotone" dataKey="value" stroke="#fb923c" fill="#fb923c" fillOpacity={0.2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* 80% Pass rate Widget */}
          <Card className="bg-white">
          <CardContent className="p-3 sm:p-4 lg:p-6">
              <div className="flex items-center justify-between mb-4">
              <div>
                  <p className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">
                    {isLoadingStats ? '...' : (stats.passRate || 0).toFixed(0)}%
                  </p>
                  <p className="text-xs sm:text-sm text-gray-600">Pass rate data</p>
              </div>
                {passRateData.length > 0 && (
                  <div className="w-16 h-12">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={passRateData}>
                        <Area type="monotone" dataKey="value" stroke="#10B981" fill="#10B981" fillOpacity={0.2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Vidya AI Card - Clickable */}
        <Card 
          className="relative cursor-pointer hover:shadow-lg transition-all duration-300 border-2 border-blue-300 hover:border-blue-400 overflow-hidden"
          onClick={() => setCurrentView('vidya-ai')}
        >
          <div className="absolute inset-0 bg-white/85"></div>
          <div className="absolute inset-0 bg-orange-300/15"></div>
          <CardContent className="p-3 sm:p-4 lg:p-6 relative z-10">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">Vidya AI</h3>
                <p className="text-xs sm:text-sm text-gray-600">24/7 AI Tutor Support</p>
                <p className="text-xs text-orange-500 mt-2 font-medium">Click to access Vidya AI →</p>
              </div>
              <div className="ml-4">
                <img 
                  src="/Vidya-ai.jpg" 
                  alt="Vidya AI" 
                  className="h-24 w-24 object-contain rounded-lg"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Student Analytics Widget */}
        <Card 
          className="bg-white cursor-pointer hover:shadow-lg transition-all duration-200 hover:border-orange-300"
          onClick={() => setCurrentView('analytics')}
        >
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Student Analytics</CardTitle>
            <span className="text-xs sm:text-sm text-orange-600 font-medium hover:text-orange-700 transition-colors flex items-center gap-1">
              View Details <ArrowUpRightIcon className="h-3 w-3 sm:h-4 sm:w-4" />
            </span>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs sm:text-sm text-gray-700">Total Students</span>
                <span className="text-xs sm:text-sm font-semibold text-gray-900">
                  {isLoadingStats ? '...' : (stats.totalStudents || 0).toLocaleString()}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs sm:text-sm text-gray-700">Active Students</span>
                <span className="text-xs sm:text-sm font-semibold text-orange-600">
                  {isLoadingStats ? '...' : (stats.activeStudents || 0).toLocaleString()} ({stats.activeStudentsPercentage || 0}%)
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs sm:text-sm text-gray-700">Avg Exams per Student</span>
                <span className="text-xs sm:text-sm font-semibold text-teal-600">
                  {isLoadingStats ? '...' : (Number(stats.avgExamsPerStudent) || 0).toFixed(1)}
                </span>
              </div>
              <div className="pt-2 border-t">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-600">Content items (videos + content + assessments + exams)</span>
                  <span className="text-xs font-semibold text-gray-900">
                    {isLoadingStats
                      ? '...'
                      : (
                          stats.contentVolume ??
                          stats.contentEngagement ??
                          0
                        ).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-600">Active student rate</span>
                  <span className="text-xs font-semibold text-gray-900">
                    {isLoadingStats ? '...' : `${stats.activeStudentsPercentage || 0}%`}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                  <div
                    className="bg-gradient-to-r from-orange-400 to-sky-400 h-2 rounded-full transition-all duration-300"
                    style={{
                      width: `${isLoadingStats ? 0 : Math.min(100, Number(stats.activeStudentsPercentage) || 0)}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <VidyaAnalyticsCard />


      {/* AI-Powered Recommendations */}
      <div className="space-y-4">
        <div className="flex items-center space-x-2">
          <TargetIcon className="h-4 w-4 sm:h-5 sm:w-5 text-orange-400" />
          <h2 className="text-lg sm:text-xl font-bold text-gray-900">AI-Powered Recommendations</h2>
        </div>
        <Card>
          <CardContent className="p-3 sm:p-4 lg:p-6">
            <div className="grid gap-3 md:grid-cols-3">
              {dashboardRecommendations.map((recommendation) => (
                <div
                  key={recommendation.title}
                  role={recommendation.view ? 'button' : undefined}
                  tabIndex={recommendation.view ? 0 : undefined}
                  onClick={recommendation.view ? () => handleViewChange(recommendation.view!) : undefined}
                  onKeyDown={recommendation.view ? (e) => { if (e.key === 'Enter') handleViewChange(recommendation.view!); } : undefined}
                  className={cn(
                    'rounded-xl border border-orange-100 bg-orange-50/50 p-4',
                    recommendation.view && 'cursor-pointer transition hover:border-orange-300 hover:bg-orange-50',
                  )}
                >
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <h3 className="text-sm font-semibold text-gray-900">{recommendation.title}</h3>
                    <Badge variant="outline" className="shrink-0 border-orange-200 bg-white text-orange-700">
                      {isLoadingStats ? 'Loading…' : recommendation.metric}
                    </Badge>
                  </div>
                  <p className="text-sm leading-relaxed text-gray-600">{recommendation.detail}</p>
                  {recommendation.action ? (
                    <p className="mt-2 text-xs font-semibold text-orange-700">{recommendation.action} →</p>
                  ) : null}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Real-time Analytics Section */}
      <div className="space-y-3 sm:space-y-4 lg:space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <BarChart3Icon className="h-4 w-4 sm:h-5 sm:w-5 text-teal-400" />
            <h2 className="text-lg sm:text-xl font-bold text-gray-900">Real-time Analytics</h2>
          </div>
          <Button onClick={fetchRealtimeAnalytics} disabled={isLoadingAnalytics} size="sm" variant="outline">
            <RefreshCw className={`h-3 w-3 sm:h-4 sm:w-4 mr-2 ${isLoadingAnalytics ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {isLoadingAnalytics ? (
          <Card>
            <CardContent className="p-4 sm:p-6 lg:p-8 text-center">
              <BarChart3Icon className="h-12 w-12 animate-spin text-teal-400 mx-auto mb-4" />
              <p className="text-gray-600">Loading real-time analytics...</p>
            </CardContent>
          </Card>
        ) : realtimeAnalytics ? (
          <div className="space-y-3 sm:space-y-4 lg:space-y-6">
            {/* Overall Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card className="bg-white/60 backdrop-blur-xl border-white/20 shadow-xl">
                <CardContent className="p-4">
                  <p className="text-xs sm:text-sm text-orange-600 font-medium">Total Students</p>
                  <p className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-orange-400 to-orange-300 bg-clip-text text-transparent">{stats.totalStudents || realtimeAnalytics.overallMetrics?.totalStudents || 0}</p>
                </CardContent>
              </Card>
              <Card className="bg-white/60 backdrop-blur-xl border-white/20 shadow-xl">
                <CardContent className="p-4">
                  <p className="text-xs sm:text-sm text-teal-600 font-medium">Total Exams</p>
                  <p className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-teal-400 to-orange-400 bg-clip-text text-transparent">{realtimeAnalytics.overallMetrics?.totalExams || 0}</p>
                </CardContent>
              </Card>
              <Card className="bg-white/60 backdrop-blur-xl border-white/20 shadow-xl">
                <CardContent className="p-4">
                  <p className="text-xs sm:text-sm text-orange-600 font-medium">Exam Results</p>
                  <p className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-orange-400 to-orange-500 bg-clip-text text-transparent">{realtimeAnalytics.overallMetrics?.totalExamResults || 0}</p>
                </CardContent>
              </Card>
              <Card className="bg-white/60 backdrop-blur-xl border-white/20 shadow-xl">
                <CardContent className="p-4">
                  <p className="text-xs sm:text-sm text-violet-700 font-medium">Overall Average</p>
                  <p className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-teal-400 to-orange-400 bg-clip-text text-transparent">{realtimeAnalytics.overallMetrics?.overallAverage || 0}%</p>
                </CardContent>
              </Card>
            </div>

            {/* Top Scorers by Exam */}
            {realtimeAnalytics.topScorersByExam && realtimeAnalytics.topScorersByExam.length > 0 && (
              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <CardTitle>Top Scorers by Exam</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {realtimeAnalytics.topScorersByExam.slice(0, 3).map((exam: any, examIdx: number) => {
                      const colorSchemes = [
                        { bg: 'from-orange-300 to-orange-400', border: 'border-orange-200' },
                        { bg: 'from-sky-300 to-sky-400', border: 'border-sky-200' },
                        { bg: 'from-teal-400 to-teal-500', border: 'border-teal-200' }
                      ];
                      const colorScheme = colorSchemes[examIdx % 3];
                      
                      return (
                        <div key={`${exam.examId || exam.examTitle || 'exam'}-${examIdx}`} className={`border-2 ${colorScheme.border} rounded-lg p-4 bg-gradient-to-br ${colorScheme.bg} text-white`}>
                          <h4 className="font-semibold text-white mb-3">{exam.examTitle}</h4>
                          <div className="space-y-2">
                            {exam.topScorers.slice(0, 5).map((scorer: any, idx: number) => (
                              <div key={`${scorer.studentId || scorer.studentEmail || scorer.studentName || 'scorer'}-${idx}`} className="flex items-center justify-between p-2 bg-white/90 backdrop-blur-sm rounded border border-white/50 shadow-sm">
                                <div>
                                  <p className="font-medium text-gray-900">{scorer.studentName}</p>
                                  {scorer.schoolName ? <p className="text-xs font-medium text-gray-700">{scorer.schoolName}</p> : null}
                                  <p className="text-xs text-gray-600">{scorer.studentEmail}</p>
                                </div>
                                <div className="text-right">
                                  <p className="font-bold text-orange-600">{scorer.percentage?.toFixed(1)}%</p>
                                  <p className="text-xs text-gray-600">{scorer.marks}/{scorer.totalMarks} marks</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Low-performing Admins */}
            {realtimeAnalytics.lowPerformingAdmins && realtimeAnalytics.lowPerformingAdmins.length > 0 && (
              <Card className="border-red-200 bg-red-50">
                <CardHeader>
                  <CardTitle className="text-red-900 flex items-center">
                    <AlertTriangleIcon className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
                    Low-performing Admins (Needs Attention)
                  </CardTitle>
                  <p className="text-xs text-gray-700">Avg score = marks obtained ÷ total marks over every exam result from the school&apos;s students. Logins and time spent per school are in Analytics → Impact Reports.</p>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {realtimeAnalytics.lowPerformingAdmins.map((admin: any, idx: number) => (
                      <div key={`${admin.adminId || admin.adminEmail || admin.adminName || 'admin'}-${idx}`} className="flex items-center justify-between p-3 bg-white rounded border border-red-200">
                        <div>
                          <p className="font-semibold text-gray-900">{admin.schoolName || admin.adminName}</p>
                          <p className="text-xs sm:text-sm text-gray-600">{admin.schoolName ? `${admin.adminName} · ${admin.adminEmail}` : admin.adminEmail}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            {admin.totalStudents} students • {admin.totalExams} exams
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-base sm:text-lg font-bold text-red-600">{admin.averageScore}%</p>
                          <p className="text-xs text-gray-600">Average Score</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Admin Performance Overview */}
            {realtimeAnalytics.adminAnalytics && realtimeAnalytics.adminAnalytics.length > 0 && (
              <Card className="relative border-0 overflow-hidden" style={{
                background: 'linear-gradient(135deg, #7dd3fc 0%, #7dd3fc 20%, #2dd4bf 60%, #14b8a6 100%)'
              }}>
                <div className="absolute inset-0 bg-white/5 pointer-events-none"></div>
                <CardHeader className="relative z-10">
                  <CardTitle className="flex items-center text-gray-900">
                    <TrendingUpIcon className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                    Admin Performance Overview
                  </CardTitle>
                  <p className="text-xs text-gray-700">Avg score = marks obtained ÷ total marks over every exam result from the school&apos;s students. Logins and time spent per school are in Analytics → Impact Reports.</p>
                </CardHeader>
                <CardContent className="relative z-10">
                  <div className="space-y-4">
                    {realtimeAnalytics.adminAnalytics.slice(0, 5).map((admin: any, idx: number) => (
                      <div key={`${admin.adminId || admin.adminEmail || admin.adminName || 'admin'}-${idx}`} className="p-4 bg-white/90 backdrop-blur-sm rounded-lg border border-white/50 shadow-md">
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <h3 className="font-semibold text-base sm:text-lg text-gray-900">{admin.schoolName || admin.adminName}</h3>
                            <p className="text-gray-600">{admin.adminEmail || `${admin.totalStudents} students`}</p>
                            <p className="text-xs text-gray-500">{admin.totalStudents} students · {admin.totalExams} exams · {admin.totalAttempts} results</p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-gray-900 text-base sm:text-lg">{admin.averageScore}%</p>
                            <p className="text-xs text-gray-600">Avg Score</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        ) : (
          <Card>
            <CardContent className="p-4 sm:p-6 lg:p-8 text-center">
              <BarChart3Icon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No analytics data available</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* AI-Powered Insights - Real data will be displayed here when available */}
      {realtimeAnalytics && realtimeAnalytics.insights && realtimeAnalytics.insights.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <BrainIcon className="h-4 w-4 sm:h-5 sm:w-5 text-orange-400" />
            <h2 className="text-lg sm:text-xl font-bold text-gray-900">AI-Powered Insights</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:p-4 lg:p-6">
            {realtimeAnalytics.insights.slice(0, 2).map((insight: any, index: number) => (
              <Card key={`${insight.id || insight.title || insight.description || 'insight'}-${index}`} className="bg-white/60 backdrop-blur-xl border-white/20 shadow-xl">
                <CardContent className="p-3 sm:p-4 lg:p-6">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-gradient-to-br from-blue-300 to-blue-400 rounded-lg">
                      <BrainIcon className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                    </div>
                    <div>
                      <p className="text-xs sm:text-sm font-medium bg-gradient-to-r from-blue-400 to-blue-300 bg-clip-text text-transparent">
                        {insight.title || insight.description || 'Insight'}
                      </p>
                      <p className="text-xs text-gray-600">
                        {insight.generatedAt ? new Date(insight.generatedAt).toLocaleString() : 'Recently generated'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
      </div>
    </div>
    );
  };

  // Board Management now shows CRUD UI; do not auto-fetch the old hub dashboard.
  useEffect(() => {
    if (currentView === 'board') {
      setBoardError(null);
    }
  }, [currentView]);

  const renderBoardDashboard = () => {
    if (boardError) {
      return (
        <div className="text-center py-12">
          <p className="text-gray-600">{boardError}</p>
          <Button onClick={() => fetchBoardDashboard(selectedBoard || 'ASLI_EXCLUSIVE_SCHOOLS')} className="mt-4">
            Retry
          </Button>
        </div>
      );
    }

    // Use cached data when available; otherwise fall back to safe defaults
    const stats = boardData?.stats || {};
    let boardName = boardData?.board?.name || selectedBoard || 'Board';
    // Format board name to title case
    if (boardName === 'ASLI EXCLUSIVE SCHOOLS' || boardName === 'ASLI_EXCLUSIVE_SCHOOLS') {
      boardName = 'Asli Exclusive Schools';
    }
    
    return (
      <div className="space-y-4 sm:space-y-6 lg:space-y-8">
        {/* Header with back button */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button onClick={() => { setSelectedBoard(null); setCurrentView('dashboard'); }} className="bg-gradient-to-r from-orange-400 to-sky-400 hover:from-orange-500 hover:to-sky-500 text-white">
              ← Back to Dashboard
            </Button>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{boardName}</h1>
              <p className="text-gray-600">Manage content, exams, subjects, and view analytics</p>
            </div>
          </div>
        </div>

        {/* Board Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 sm:p-4 lg:p-6">
          <Card className="bg-white/60 backdrop-blur-xl border-white/20 shadow-xl">
            <CardContent className="p-3 sm:p-4 lg:p-6">
              <p className="text-xs sm:text-sm text-orange-600 font-medium">Students</p>
              <p className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-orange-400 to-orange-300 bg-clip-text text-transparent">
                {typeof stats.students === 'number' ? stats.students : 0}
              </p>
            </CardContent>
          </Card>
          <Card className="bg-white/60 backdrop-blur-xl border-white/20 shadow-xl">
            <CardContent className="p-3 sm:p-4 lg:p-6">
              <p className="text-xs sm:text-sm text-teal-600 font-medium">Teachers</p>
              <p className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-teal-400 to-orange-400 bg-clip-text text-transparent">
                {typeof stats.teachers === 'number' ? stats.teachers : 0}
              </p>
            </CardContent>
          </Card>
          <Card className="bg-white/60 backdrop-blur-xl border-white/20 shadow-xl">
            <CardContent className="p-3 sm:p-4 lg:p-6">
              <p className="text-xs sm:text-sm text-orange-600 font-medium">Exams</p>
              <p className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-orange-400 to-orange-500 bg-clip-text text-transparent">
                {typeof stats.exams === 'number' ? stats.exams : 0}
              </p>
            </CardContent>
          </Card>
          <Card className="bg-white/60 backdrop-blur-xl border-white/20 shadow-xl">
            <CardContent className="p-3 sm:p-4 lg:p-6">
              <p className="text-xs sm:text-sm text-violet-700 font-medium">Avg Score</p>
              <p className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-teal-400 to-orange-400 bg-clip-text text-transparent">
                {typeof stats.averageScore === 'number' || typeof stats.averageScore === 'string'
                  ? `${stats.averageScore}%`
                  : '0.00%'}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Board Comparison Section */}
        <div className="mt-8">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4">Board Performance Comparison</h2>
          <Suspense fallback={lazySectionFallback}>
            <BoardComparisonCharts />
          </Suspense>
        </div>
      </div>
    );
  };

  const renderAdminsContent = () => (
    <Suspense fallback={lazySectionFallback}>
      <AdminManagement />
    </Suspense>
  );

  const renderAnalyticsContent = (initialTab?: "overview" | "impact" | "audit" | "ai") => (
    <Suspense fallback={lazySectionFallback}>
      <CombinedSuperAdminAnalytics initialTab={initialTab} />
    </Suspense>
  );

  const renderBoardComparisonContent = () => (
    <Suspense fallback={lazySectionFallback}>
      <BoardComparisonCharts />
    </Suspense>
  );

  const renderSubscriptionsContent = () => (
    <Suspense fallback={lazySectionFallback}>
      <SubscriptionManagement />
    </Suspense>
  );

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast({
        title: "Passwords do not match",
        description: "New password and confirmation must be the same.",
        variant: "destructive",
      });
      return;
    }
    setChangingPassword(true);
    try {
      const token = getAuthToken();
      const res = await fetch(`${API_BASE_URL}/api/super-admin/change-password`, {
        method: "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(passwordForm),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success) {
        throw new Error(json?.message || "Failed to change password");
      }
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      toast({
        title: "Password updated",
        description: "Your super admin password was changed successfully.",
      });
    } catch (err: unknown) {
      toast({
        title: "Could not update password",
        description: err instanceof Error ? err.message : "Try again",
        variant: "destructive",
      });
    } finally {
      setChangingPassword(false);
    }
  };

  const renderSettingsContent = () => {
    const storedUser = getUser();
    const profileName =
      String(storedUser?.fullName || storedUser?.name || user.fullName || "Super Admin").trim() ||
      "Super Admin";
    const profileEmail =
      String(storedUser?.email || user.email || "").trim() || "—";
    const profileRole = String(storedUser?.role || user.role || "super-admin").replace(/_/g, " ");

    return (
    <div className="space-y-3 sm:space-y-4 lg:space-y-6">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold">System Settings</h2>
        <p className="mt-1 text-sm text-slate-600">
          Account security, Vidya display preferences, and quick links. Provider keys and database URLs stay on the server.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <User className="h-5 w-5 text-orange-500" />
            Account
          </CardTitle>
          <p className="text-sm text-slate-600">Signed-in super admin profile for this session.</p>
        </CardHeader>
        <CardContent className="p-3 sm:p-4 lg:p-6 pt-0">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-orange-50 text-orange-600">
              <CrownIcon className="h-6 w-6" />
            </div>
            <div className="min-w-0 space-y-1">
              <p className="truncate text-base font-semibold text-slate-900">{profileName}</p>
              <p className="truncate text-sm text-slate-600">{profileEmail}</p>
              <Badge variant="secondary" className="capitalize">
                {profileRole}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Sparkles className="h-5 w-5 text-orange-500" />
            Vidya AI preferences
          </CardTitle>
          <p className="text-sm text-slate-600">
            Model choice and API credentials are configured on the server. Set tutor display preferences for this browser.
          </p>
        </CardHeader>
        <CardContent className="space-y-4 p-3 sm:p-4 lg:p-6 pt-0">
          <div className="mx-auto max-w-md space-y-2">
            <Label htmlFor="settings-vidya-depth">Default explanation depth</Label>
            <Select
              value={vidyaExplainDepth}
              onValueChange={(v: "concise" | "balanced" | "detailed") => setVidyaExplainDepth(v)}
            >
              <SelectTrigger id="settings-vidya-depth">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="concise">Concise — short answers</SelectItem>
                <SelectItem value="balanced">Balanced — recommended</SelectItem>
                <SelectItem value="detailed">Detailed — step-by-step</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-500">
              Stored locally in your browser; chat can read this preference.
            </p>
            <Button
              type="button"
              className="gap-2 bg-gradient-to-r from-orange-400 to-orange-300 hover:from-orange-500 hover:to-orange-400"
              onClick={saveVidyaPreferences}
            >
              <Sparkles className="h-4 w-4" />
              Save preferences
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <KeyRound className="h-5 w-5 text-orange-500" />
            Change password
          </CardTitle>
          <p className="text-sm text-slate-600">
            Update the password for your logged-in super admin account.
          </p>
        </CardHeader>
        <CardContent className="p-3 sm:p-4 lg:p-6 pt-0">
          <form onSubmit={handleChangePassword} className="mx-auto max-w-md space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="sa-current-password">Current password</Label>
              <div className="relative">
                <Input
                  id="sa-current-password"
                  type={showPasswordFields.current ? "text" : "password"}
                  autoComplete="current-password"
                  value={passwordForm.currentPassword}
                  onChange={(e) =>
                    setPasswordForm((p) => ({ ...p, currentPassword: e.target.value }))
                  }
                  className="pr-11"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-800"
                  onClick={() =>
                    setShowPasswordFields((p) => ({ ...p, current: !p.current }))
                  }
                  aria-label={showPasswordFields.current ? "Hide current password" : "Show current password"}
                >
                  {showPasswordFields.current ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sa-new-password">New password</Label>
              <div className="relative">
                <Input
                  id="sa-new-password"
                  type={showPasswordFields.next ? "text" : "password"}
                  autoComplete="new-password"
                  value={passwordForm.newPassword}
                  onChange={(e) =>
                    setPasswordForm((p) => ({ ...p, newPassword: e.target.value }))
                  }
                  className="pr-11"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-800"
                  onClick={() => setShowPasswordFields((p) => ({ ...p, next: !p.next }))}
                  aria-label={showPasswordFields.next ? "Hide new password" : "Show new password"}
                >
                  {showPasswordFields.next ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              <p className="text-xs text-slate-500">At least 8 characters</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sa-confirm-password">Confirm new password</Label>
              <div className="relative">
                <Input
                  id="sa-confirm-password"
                  type={showPasswordFields.confirm ? "text" : "password"}
                  autoComplete="new-password"
                  value={passwordForm.confirmPassword}
                  onChange={(e) =>
                    setPasswordForm((p) => ({ ...p, confirmPassword: e.target.value }))
                  }
                  className="pr-11"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-800"
                  onClick={() =>
                    setShowPasswordFields((p) => ({ ...p, confirm: !p.confirm }))
                  }
                  aria-label={
                    showPasswordFields.confirm ? "Hide confirm password" : "Show confirm password"
                  }
                >
                  {showPasswordFields.confirm ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
            <Button
              type="submit"
              disabled={
                changingPassword ||
                !passwordForm.currentPassword ||
                !passwordForm.newPassword ||
                !passwordForm.confirmPassword
              }
              className="gap-2"
            >
              {changingPassword ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <KeyRound className="h-4 w-4" />
              )}
              {changingPassword ? "Updating…" : "Update password"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Monitor className="h-5 w-5 text-orange-500" />
            Display
          </CardTitle>
          <p className="text-sm text-slate-600">Dashboard appearance for demos and school walkthroughs.</p>
        </CardHeader>
        <CardContent className="space-y-2 p-3 sm:p-4 lg:p-6 pt-0 text-sm text-slate-600">
          <p>
            Appearance stays <span className="font-medium text-slate-800">light-only</span> for consistent
            school demos. Dark mode is not enabled yet.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Shield className="h-5 w-5 text-orange-500" />
            Platform configuration
          </CardTitle>
          <p className="text-sm text-slate-600">
            Secrets are not editable in the browser. Update the backend environment and redeploy to change them.
          </p>
        </CardHeader>
        <CardContent className="space-y-3 p-3 sm:p-4 lg:p-6 pt-0">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">API base</p>
            <p className="mt-0.5 break-all font-mono text-slate-800">{API_BASE_URL || "(same origin)"}</p>
          </div>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
            <li>AI provider keys (e.g. Gemini)</li>
            <li>JWT / session secrets</li>
            <li>Database connection URL</li>
          </ul>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base sm:text-lg">Shortcuts</CardTitle>
          <p className="text-sm text-slate-600">Jump to the modules you use most.</p>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 p-3 sm:p-4 lg:p-6 pt-0">
          {[
            { label: "Analytics", view: "analytics" as const },
            { label: "Subjects & content", view: "subjects-and-content" as const },
            { label: "Exams", view: "exams" as const },
            { label: "Subscriptions", view: "subscriptions" as const },
            { label: "Vidya AI", view: "vidya-ai" as const },
            { label: "Calendar", view: "calendar" as const },
            { label: "School management", view: "admins" as const },
            { label: "Audit logs", view: "audit-logs" as const },
          ].map((item) => (
            <Button
              key={`${item.view}-${item.label}`}
              type="button"
              variant="outline"
              className="justify-start"
              onClick={() => setCurrentView(item.view)}
            >
              {item.label}
            </Button>
          ))}
        </CardContent>
      </Card>
    </div>
    );
  };

  const renderVidyaAIContent = () => {
    const quickActions = [
      {
        title: "View AI Usage Reports",
        description: "Open Analytics → Exam & AI usage across schools",
        icon: BarChart3Icon,
        run: () => setCurrentView("analytics"),
      },
      {
        title: "Monitor Active Sessions",
        description: "Ask Vidya about live AI conversation spikes",
        icon: Monitor,
        run: () => {
          document.getElementById("super-admin-vidya-chat")?.scrollIntoView({ behavior: "smooth", block: "start" });
          window.setTimeout(() => {
            window.dispatchEvent(
              new CustomEvent("vidya-chat-prefill", {
                detail: {
                  role: "super_admin",
                  // Concrete and answerable: this maps to the usage-analytics
                  // module. The old open-ended wording matched no module and
                  // always came back "could not find matching records".
                  message: "How many usage analytics entries were logged in the last 7 days, grouped by school?",
                },
              }),
            );
          }, 150);
        },
      },
      {
        title: "Configure AI Models",
        description: "Open Vidya AI preferences and response depth",
        icon: BrainCircuitIcon,
        run: () => setVidyaSettingsOpen(true),
      },
      {
        title: "Risk & Compliance Insights",
        description: "Ask Vidya about anomalies and compliance risks",
        icon: Shield,
        run: () => {
          document.getElementById("super-admin-vidya-chat")?.scrollIntoView({ behavior: "smooth", block: "start" });
          window.setTimeout(() => {
            window.dispatchEvent(
              new CustomEvent("vidya-chat-prefill", {
                detail: {
                  role: "super_admin",
                  // Maps to the audit-log module; the previous phrasing matched
                  // no module and always returned "no matching records".
                  message: "How many audit log entries were recorded in the last 7 days, grouped by school?",
                },
              }),
            );
          }, 150);
        },
      },
    ];

    return (
      <div className="space-y-3 sm:space-y-4 lg:space-y-6">
        <div className="rounded-2xl border border-orange-200 bg-gradient-to-r from-orange-400 to-orange-500 p-3 sm:p-4 lg:p-6 shadow-lg">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center border border-white/30">
              <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <Badge className="bg-white text-orange-600 hover:bg-white">System Control</Badge>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white">AI System Assistant</h2>
          <p className="text-white/90 mt-1">Manage and monitor AI across all schools</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <Card
                key={action.title}
                className="cursor-pointer border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md"
                onClick={() => action.run()}
              >
                <CardContent className="p-4">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-100 to-orange-200 flex items-center justify-center mb-3">
                    <Icon className="w-4 h-4 sm:w-5 sm:h-5 text-orange-600" />
                  </div>
                  <h3 className="text-xs sm:text-sm font-semibold text-slate-900">{action.title}</h3>
                  <p className="text-xs text-slate-600 mt-1">{action.description}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div id="super-admin-vidya-chat" className="w-full rounded-2xl bg-[#F5F7FA] border border-slate-200 shadow-[0_20px_40px_-30px_rgba(15,23,42,0.8)] p-2">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-2 pt-2">
            <p className="text-sm font-medium text-slate-700">Vidya chat</p>
            <Button type="button" variant="outline" size="sm" onClick={() => setVidyaSettingsOpen(true)}>
              Vidya preferences
            </Button>
          </div>
          <Suspense fallback={lazySectionFallback}>
            <AIChat
              userId="super-admin"
              context={{}}
              promptVariant="super-admin"
              className="w-full h-[640px]"
            />
          </Suspense>
        </div>
      </div>
    );
  };

  const renderContent = () => {
    switch (currentView) {
      case 'dashboard':
        return renderDashboardContent();
      case 'board':
        return (
          <Suspense fallback={lazySectionFallback}>
            <BoardsManagement />
          </Suspense>
        );
      case 'admins':
        return renderAdminsContent();
      case 'products':
        return (
          <Suspense fallback={lazySectionFallback}>
            <ProductsManagement />
          </Suspense>
        );
      case 'trial-members':
        return (
          <Suspense fallback={lazySectionFallback}>
            <TrialMembersManagement />
          </Suspense>
        );
      case 'audit-logs':
        return renderAnalyticsContent('audit');
      case 'impact-reports':
        return renderAnalyticsContent('impact');
      case 'analytics':
        return renderAnalyticsContent('overview');
      case 'board-comparison':
        return renderBoardComparisonContent();
      case 'ai-analytics':
        return renderAnalyticsContent('ai');
      case 'subjects-and-content':
        return (
          <Suspense fallback={lazySectionFallback}>
            <SubjectContentManagement />
          </Suspense>
        );
      case 'edu-ott-live':
        return (
          <Suspense fallback={lazySectionFallback}>
            <LiveSessions />
          </Suspense>
        );
      case 'content':
        // Legacy view id — same as Subject & Content (replaces old upload grid page).
        return (
          <Suspense fallback={lazySectionFallback}>
            <SubjectContentManagement />
          </Suspense>
        );
      case 'subjects':
        return (
          <Suspense fallback={lazySectionFallback}>
            <SubjectManagement />
          </Suspense>
        );
      case 'exams':
        return (
          <Suspense fallback={lazySectionFallback}>
            <ExamManagement />
          </Suspense>
        );
      case 'offline-results':
        return (
          <Suspense fallback={lazySectionFallback}>
            <OmrResultsManagement variant="super-admin" />
          </Suspense>
        );
      case 'iq-rank-boost':
        return (
          <Suspense fallback={lazySectionFallback}>
            <IQRankBoostActivities />
          </Suspense>
        );
      case 'calendar':
        return (
          <Suspense fallback={lazySectionFallback}>
            <SuperAdminCalendar
              onNavigateToExams={(prefill) => {
                sessionStorage.setItem('examCalendarPrefill', JSON.stringify(prefill));
                setCurrentView('exams');
              }}
            />
          </Suspense>
        );
      case 'vidya-ai':
        return renderVidyaAIContent();
      case 'ai-tool-generations':
        return (
          <Suspense fallback={lazySectionFallback}>
            <AiToolGenerationsPanel />
          </Suspense>
        );
      case 'ai-tool-duplicates':
        return (
          <Suspense fallback={lazySectionFallback}>
            <AiToolDuplicatesPanel />
          </Suspense>
        );
      case 'ai-tool-topics':
        return (
          <Suspense fallback={lazySectionFallback}>
            <AiToolTopicsManagement />
          </Suspense>
        );
      case 'ai-generator':
        return (
          <Suspense fallback={lazySectionFallback}>
            <SuperAdminAiGenerator />
          </Suspense>
        );
      case 'book-knowledge-base':
        return (
          <Suspense fallback={lazySectionFallback}>
            <BookKnowledgeBase />
          </Suspense>
        );
      case 'book-based-generator':
        return (
          <Suspense fallback={lazySectionFallback}>
            <BookBasedGenerator
              onOpenBookKnowledge={() => handleViewChange('book-knowledge-base')}
              onOpenAiToolData={() => handleViewChange('ai-tool-generations')}
            />
          </Suspense>
        );
      case 'subscriptions':
        return renderSubscriptionsContent();
      case 'settings':
        return renderSettingsContent();
      default:
        return renderDashboardContent();
    }
  };

  const handleLogout = () => {
    clearAuthData();
    window.location.replace('/signin');
  };

  return (
    <div className="fixed inset-0 z-10 flex overflow-hidden bg-gray-50">
      {/* Fixed sidebar */}
      <SuperAdminSidebar
        currentView={currentView}
        onViewChange={handleViewChange}
        user={user}
        onLogout={handleLogout}
      />

      {/* Internal main scroller — sidebar stays pinned */}
      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
          superAdminDrawerNav ? "ml-0 pt-14 pb-16 sm:pb-0" : "sm:ml-[60px] lg:ml-72",
        )}
      >
        <main
          data-dashboard-main-scroll=""
          className={cn(
            "dashboard-main-scroll custom-scrollbar min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain",
            currentView === "ai-tool-generations"
              ? "p-0"
              : superAdminDrawerNav
                ? "p-3 sm:p-4"
                : "p-3 sm:p-4 lg:p-6",
          )}
        >
          {renderContent()}
        </main>
      </div>

      <Dialog open={vidyaSettingsOpen} onOpenChange={setVidyaSettingsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Vidya AI settings</DialogTitle>
            <DialogDescription>
              Model choice and API credentials are configured on the server (environment / deployment). Here you can set
              tutor display preferences for this browser and jump to related tools.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="vidya-depth">Default explanation depth</Label>
              <Select
                value={vidyaExplainDepth}
                onValueChange={(v: "concise" | "balanced" | "detailed") => setVidyaExplainDepth(v)}
              >
                <SelectTrigger id="vidya-depth">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="concise">Concise — short answers</SelectItem>
                  <SelectItem value="balanced">Balanced — recommended</SelectItem>
                  <SelectItem value="detailed">Detailed — step-by-step</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Stored locally in your browser; future chat updates can read this preference.
              </p>
            </div>
            <div className="flex flex-col gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start"
                onClick={() => {
                  setVidyaSettingsOpen(false);
                  setCurrentView("analytics");
                }}
              >
                Open AI Analytics
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start"
                onClick={() => {
                  setVidyaSettingsOpen(false);
                  setCurrentView("settings");
                }}
              >
                Open system settings
              </Button>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setVidyaSettingsOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-gradient-to-r from-orange-400 to-orange-300 hover:from-orange-500 hover:to-orange-400"
              onClick={saveVidyaPreferences}
            >
              Save preferences
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={systemSettingsOpen} onOpenChange={setSystemSettingsOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>System settings</DialogTitle>
            <DialogDescription>
              Shortcuts to main modules. Secrets and database URLs are set on the server, not here.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-2">
              <p className="text-xs sm:text-sm font-medium text-foreground">Quick links</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Button
                  type="button"
                  variant="outline"
                  className="justify-start"
                  onClick={() => {
                    setSystemSettingsOpen(false);
                    setCurrentView("vidya-ai");
                    setVidyaSettingsOpen(true);
                  }}
                >
                  Vidya AI preferences
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="justify-start"
                  onClick={() => {
                    setSystemSettingsOpen(false);
                    setCurrentView("calendar");
                  }}
                >
                  School Calendar
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="justify-start"
                  onClick={() => {
                    setSystemSettingsOpen(false);
                    setCurrentView("exams");
                  }}
                >
                  Exam Management
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="justify-start"
                  onClick={() => {
                    setSystemSettingsOpen(false);
                    setCurrentView("admins");
                  }}
                >
                  School Management
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="justify-start"
                  onClick={() => {
                    setSystemSettingsOpen(false);
                    setCurrentView("subjects-and-content");
                  }}
                >
                  Subject &amp; Content
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="justify-start"
                  onClick={() => {
                    setSystemSettingsOpen(false);
                    setCurrentView("analytics");
                  }}
                >
                  Analytics
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="justify-start"
                  onClick={() => {
                    setSystemSettingsOpen(false);
                    setCurrentView("subscriptions");
                  }}
                >
                  Subscriptions
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              To change AI provider keys, JWT secrets, or database URLs, update the backend <code className="rounded bg-muted px-1">.env</code> and
              redeploy.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setSystemSettingsOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
