import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { API_BASE_URL } from "@/lib/api-config";
import { getAuthToken } from '@/lib/auth-utils';
import {
  BrainIcon, 
  TrendingUpIcon, 
  AlertTriangleIcon, 
  TargetIcon, 
  ZapIcon, 
  EyeIcon, 
  BarChart3Icon,
  UsersIcon,
  BookOpenIcon,
  AwardIcon,
  ClockIcon,
  StarIcon,
  CheckCircleIcon,
  XCircleIcon,
  LightbulbIcon,
  RocketIcon,
  ShieldIcon,
  ActivityIcon,
  GaugeIcon,
  BrainCircuitIcon,
  SparklesIcon,
  CpuIcon,
  DatabaseIcon,
  NetworkIcon,
  LayersIcon,
  PieChartIcon,
  LineChartIcon,
  ScatterChartIcon,
  TrophyIcon,
  TrendingDownIcon,
  BookIcon,
  CalculatorIcon,
  ChartBarIcon,
  UserCheckIcon,
  AlertCircleIcon
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface DetailedAnalytics {
  adminAnalytics: AdminAnalytics[];
  globalAnalytics: GlobalAnalytics;
  aiInsights: AIInsight[];
}

interface GlobalAnalytics {
  totalAdmins: number;
  overallAverageScore?: number;
  totalExams: number;
  totalExamResults: number;
  topPerformers: TopScorer[];
  subjectWiseAnalysis: SubjectAnalysis[];
  trendsAnalysis: { improving: number; declining: number; stable: number };
}

interface ExamHistory {
  [key: string]: unknown;
}

interface AdminAnalytics {
  adminId: string;
  adminName: string;
  adminEmail: string;
  board?: string;
  curriculumBoard?: string;
  effectiveBoard?: string;
  iitCategories?: string[];
  state?: string;
  examDifficulty: ExamDifficulty;
  topScorers: TopScorer[];
  performanceDistribution: PerformanceDistribution;
  questionAnalysis: QuestionAnalysis[];
  performanceTrends: PerformanceTrend[];
  subjectAnalysis: SubjectAnalysis[];
  totalStudents: number;
  uniqueStudents?: number;
  totalAttempts?: number;
  totalExams: number;
  averageScore: number;
}

interface ExamDifficulty {
  exams: ExamDifficultyItem[];
  overallDifficulty: number;
  hardestExam: ExamDifficultyItem;
  easiestExam: ExamDifficultyItem;
}

interface ExamDifficultyItem {
  examId: string;
  examTitle: string;
  difficulty: string;
  difficultyScore: number;
  totalAttempts: number;
  averageScore: number;
  passRate: number;
  highestScore: number;
  lowestScore: number;
  questionCount: number;
}

interface TopScorer {
  studentId: string;
  studentName: string;
  studentEmail: string;
  totalExams: number;
  totalScore: number;
  highestScore: number;
  averageScore: number;
  examHistory: ExamHistory[];
}

interface PerformanceDistribution {
  excellent: { range: string; count: number; percentage: number };
  good: { range: string; count: number; percentage: number };
  average: { range: string; count: number; percentage: number };
  belowAverage: { range: string; count: number; percentage: number };
  poor: { range: string; count: number; percentage: number };
  veryPoor: { range: string; count: number; percentage: number };
}

interface QuestionAnalysis {
  questionId: string;
  questionText: string;
  questionType: string;
  subject: string;
  difficultyRate: number;
  correctAnswers: number;
  totalAttempts: number;
  examTitle: string;
  marks: number;
}

interface PerformanceTrend {
  month: string;
  totalExams: number;
  totalScore: number;
  averageScore: number;
  examCount: number;
}

interface SubjectAnalysis {
  subject: string;
  totalExams: number;
  totalScore: number;
  averageScore: number;
  highestScore: number;
  lowestScore: number;
  examCount: number;
}

interface AIInsight {
  type: string;
  title: string;
  description: string;
  confidence: number;
  impact: string;
  category: string;
  data: any;
}

export type DetailedAIAnalyticsDashboardProps = {
  /** When set, only this school’s rows are shown (from combined analytics drill-down). */
  singleAdminId?: string | null;
  onClearSchoolFocus?: () => void;
};

export default function DetailedAIAnalyticsDashboard({
  singleAdminId = null,
  onClearSchoolFocus,
}: DetailedAIAnalyticsDashboardProps = {}) {
  const { toast } = useToast();
  const [analytics, setAnalytics] = useState<DetailedAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedAdmin, setSelectedAdmin] = useState<string | null>(null);
  const [admins, setAdmins] = useState<any[]>([]);
  const [filterState, setFilterState] = useState<string>('all');
  const [filterBoard, setFilterBoard] = useState<string>('all');

  // Board options — curriculum boards + IIT + OTHER (aligned with backend boardScope)
  const boardOptions = [
    { value: 'all', label: 'All Boards' },
    { value: 'CBSE', label: 'CBSE' },
    { value: 'IIT', label: 'IIT' },
    { value: 'STATE', label: 'State Board' },
    { value: 'SSC', label: 'SSC' },
    { value: 'ICSE', label: 'ICSE' },
    { value: 'IB', label: 'IB' },
    { value: 'CAMBRIDGE', label: 'Cambridge' },
    { value: 'OTHER', label: 'Other / Unmapped' },
  ];

  const canonicalizeAnalyticsBoard = (raw?: string | null) => {
    const u = String(raw || '').toUpperCase().trim();
    if (!u) return '';
    const compact = u.replace(/[\s/\\-_]+/g, '');
    if (compact.includes('IIT') || compact.includes('NEET') || compact.includes('JEE')) return 'IIT';
    return u;
  };

  const adminHasIitProgram = (adminData: any, fallbackAdmin?: AdminAnalytics) => {
    const cats = adminData?.iitCategories || fallbackAdmin?.iitCategories;
    if (Array.isArray(cats) && cats.some((c: unknown) => String(c || '').trim())) return true;
    return (
      canonicalizeAnalyticsBoard(adminData?.board || fallbackAdmin?.board) === 'IIT' ||
      canonicalizeAnalyticsBoard(adminData?.curriculumBoard || fallbackAdmin?.curriculumBoard) === 'IIT'
    );
  };

  const resolveAdminCurriculumBoard = (adminData: any, fallbackAdmin?: AdminAnalytics) => {
    const curriculum = canonicalizeAnalyticsBoard(
      adminData?.curriculumBoard ||
        fallbackAdmin?.curriculumBoard ||
        fallbackAdmin?.effectiveBoard ||
        '',
    );
    if (curriculum && curriculum !== 'ASLI_EXCLUSIVE_SCHOOLS' && curriculum !== 'OTHER') {
      return curriculum;
    }
    const hub = canonicalizeAnalyticsBoard(adminData?.board || fallbackAdmin?.board || '');
    if (hub === 'IIT') return 'IIT';
    if (['CBSE', 'STATE', 'SSC', 'ICSE', 'IB', 'CAMBRIDGE'].includes(hub)) return hub;
    if (adminHasIitProgram(adminData, fallbackAdmin)) return 'IIT';
    return 'OTHER';
  };

  // Indian states/UT labels with short codes
  const stateOptions = [
    { value: 'all', label: 'All States' },
    { value: 'Andhra Pradesh', label: 'Andhra Pradesh (AP)' },
    { value: 'Arunachal Pradesh', label: 'Arunachal Pradesh (AR)' },
    { value: 'Assam', label: 'Assam (AS)' },
    { value: 'Bihar', label: 'Bihar (BR)' },
    { value: 'Chhattisgarh', label: 'Chhattisgarh (CG)' },
    { value: 'Goa', label: 'Goa (GA)' },
    { value: 'Gujarat', label: 'Gujarat (GJ)' },
    { value: 'Haryana', label: 'Haryana (HR)' },
    { value: 'Himachal Pradesh', label: 'Himachal Pradesh (HP)' },
    { value: 'Jharkhand', label: 'Jharkhand (JH)' },
    { value: 'Karnataka', label: 'Karnataka (KA)' },
    { value: 'Kerala', label: 'Kerala (KL)' },
    { value: 'Madhya Pradesh', label: 'Madhya Pradesh (MP)' },
    { value: 'Maharashtra', label: 'Maharashtra (MH)' },
    { value: 'Manipur', label: 'Manipur (MN)' },
    { value: 'Meghalaya', label: 'Meghalaya (ML)' },
    { value: 'Mizoram', label: 'Mizoram (MZ)' },
    { value: 'Nagaland', label: 'Nagaland (NL)' },
    { value: 'Odisha', label: 'Odisha (OD)' },
    { value: 'Punjab', label: 'Punjab (PB)' },
    { value: 'Rajasthan', label: 'Rajasthan (RJ)' },
    { value: 'Sikkim', label: 'Sikkim (SK)' },
    { value: 'Tamil Nadu', label: 'Tamil Nadu (TN)' },
    { value: 'Telangana', label: 'Telangana (TS)' },
    { value: 'Tripura', label: 'Tripura (TR)' },
    { value: 'Uttar Pradesh', label: 'Uttar Pradesh (UP)' },
    { value: 'Uttarakhand', label: 'Uttarakhand (UK)' },
    { value: 'West Bengal', label: 'West Bengal (WB)' },
    { value: 'Andaman and Nicobar Islands', label: 'Andaman and Nicobar Islands (AN)' },
    { value: 'Chandigarh', label: 'Chandigarh (CH)' },
    { value: 'Dadra and Nagar Haveli and Daman and Diu', label: 'Dadra and Nagar Haveli and Daman and Diu (DN)' },
    { value: 'Delhi', label: 'Delhi (DL)' },
    { value: 'Jammu and Kashmir', label: 'Jammu and Kashmir (JK)' },
    { value: 'Ladakh', label: 'Ladakh (LA)' },
    { value: 'Lakshadweep', label: 'Lakshadweep (LD)' },
    { value: 'Puducherry', label: 'Puducherry (PY)' }
  ];

  const fetchDetailedAnalytics = async () => {
    setIsLoading(true);
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE_URL}/api/ai/detailed-analytics`, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setAnalytics(data.data);
        toast({
          title: "Detailed Analytics Generated",
          description: "Comprehensive exam analysis completed successfully",
        });
      } else {
        console.error('Failed to fetch detailed analytics:', response.status);
        toast({
          title: "Error",
          description: "Failed to fetch detailed analytics",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Detailed analytics error:', error);
      toast({
        title: "Error",
        description: "Failed to fetch detailed analytics",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAdmins();
    fetchDetailedAnalytics();
  }, []);

  const fetchAdmins = async () => {
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE_URL}/api/super-admin/admins`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        const adminsList = Array.isArray(data) ? data : (data.data || []);
        setAdmins(adminsList);
      }
    } catch (error) {
      console.error('Error fetching admins:', error);
    }
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'Very Hard': return 'bg-red-100 text-red-800';
      case 'Hard': return 'bg-orange-100 text-orange-800';
      case 'Medium': return 'bg-yellow-100 text-yellow-800';
      case 'Easy': return 'bg-green-100 text-green-800';
      case 'Very Easy': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-600';
    if (score >= 80) return 'text-blue-600';
    if (score >= 70) return 'text-yellow-600';
    if (score >= 60) return 'text-orange-600';
    return 'text-red-600';
  };

  const getPerformanceColor = (range: string) => {
    switch (range) {
      case '90-100%': return 'bg-green-500';
      case '80-89%': return 'bg-blue-500';
      case '70-79%': return 'bg-yellow-500';
      case '60-69%': return 'bg-orange-500';
      case '50-59%': return 'bg-red-500';
      case '0-49%': return 'bg-gray-500';
      default: return 'bg-gray-500';
    }
  };

  // Filter analytics based on state and board
  const getFilteredAnalytics = (): DetailedAnalytics | null => {
    if (!analytics) return null;

    let filteredAdminAnalytics = [...analytics.adminAnalytics];

    if (singleAdminId) {
      filteredAdminAnalytics = filteredAdminAnalytics.filter(
        (a) => String(a.adminId) === String(singleAdminId)
      );
    }

    // Filter by curriculum board (not hub ASLI_EXCLUSIVE_SCHOOLS alone)
    if (filterBoard !== 'all') {
      filteredAdminAnalytics = filteredAdminAnalytics.filter(admin => {
        const adminData = admins.find(a => String(a.id || a._id) === String(admin.adminId));
        if (filterBoard === 'IIT') return adminHasIitProgram(adminData, admin);
        return resolveAdminCurriculumBoard(adminData, admin) === filterBoard;
      });
    }

    // Filter by state
    if (filterState !== 'all') {
      filteredAdminAnalytics = filteredAdminAnalytics.filter(admin => {
        const adminData = admins.find(a => String(a.id || a._id) === String(admin.adminId));
        return (adminData?.state || admin.state) === filterState;
      });
    }

    const filteredAdminIds = new Set(filteredAdminAnalytics.map((a) => String(a.adminId)));

    // Merge subject / distribution / toppers from filtered admins only
    const mergedSubjects = new Map<string, { subject: string; totalScore: number; totalExams: number; highestScore: number; lowestScore: number }>();
    for (const admin of filteredAdminAnalytics) {
      for (const s of admin.subjectAnalysis || []) {
        const key = s.subject || 'Unknown';
        const cur = mergedSubjects.get(key) || {
          subject: key,
          totalScore: 0,
          totalExams: 0,
          highestScore: 0,
          lowestScore: 100,
        };
        const exams = Number(s.totalExams || s.examCount || 0);
        cur.totalExams += exams;
        cur.totalScore += Number(s.averageScore || 0) * exams;
        cur.highestScore = Math.max(cur.highestScore, Number(s.highestScore || 0));
        cur.lowestScore = Math.min(cur.lowestScore, Number(s.lowestScore ?? 100));
        mergedSubjects.set(key, cur);
      }
    }

    const subjectWiseAnalysis = [...mergedSubjects.values()]
      .map((s) => ({
        ...s,
        examCount: s.totalExams,
        averageScore: s.totalExams > 0 ? Math.round((s.totalScore / s.totalExams) * 100) / 100 : 0,
      }))
      .sort((a, b) => b.averageScore - a.averageScore);

    const filteredTopPerformers = [
      ...filteredAdminAnalytics.flatMap((a) =>
        (a.topScorers || []).map((t) => ({ ...t, adminId: a.adminId, adminName: a.adminName })),
      ),
    ]
      .sort((a, b) => (b.averageScore || 0) - (a.averageScore || 0))
      .slice(0, 20);

    // Recalculate global analytics based on filtered data
    const filteredGlobalAnalytics = {
      ...analytics.globalAnalytics,
      totalAdmins: filteredAdminAnalytics.length,
      overallAverageScore: filteredAdminAnalytics.length > 0
        ? filteredAdminAnalytics.reduce((sum, admin) => sum + (admin.averageScore || 0), 0) / filteredAdminAnalytics.length
        : 0,
      totalExams: filteredAdminAnalytics.reduce((sum, admin) => sum + (admin.totalExams || 0), 0),
      totalExamResults: filteredAdminAnalytics.reduce(
        (sum, admin) => sum + (admin.totalAttempts ?? admin.totalStudents ?? 0),
        0,
      ),
      topPerformers: filteredTopPerformers.length
        ? filteredTopPerformers
        : analytics.globalAnalytics.topPerformers.filter((performer: any) =>
            filteredAdminIds.has(String(performer.adminId)),
          ),
      subjectWiseAnalysis,
    };

    return {
      ...analytics,
      adminAnalytics: filteredAdminAnalytics,
      globalAnalytics: filteredGlobalAnalytics
    };
  };

  const filteredAnalytics = getFilteredAnalytics();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <CpuIcon className="w-12 h-12 animate-spin text-purple-600 mx-auto mb-4" />
          <p className="text-base sm:text-lg font-semibold">Generating Detailed Analytics...</p>
          <p className="text-gray-600">Analyzing exam data and performance patterns</p>
        </div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="text-center py-12">
        <AlertCircleIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg sm:text-xl font-semibold mb-2">No Analytics Data</h3>
        <p className="text-gray-600 mb-4">Click the button below to generate detailed analytics</p>
        <Button onClick={fetchDetailedAnalytics} className="bg-gradient-to-r from-sky-300 to-teal-400 hover:from-sky-400 hover:to-teal-500 text-white">
          <SparklesIcon className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
          Generate Analytics
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-4 lg:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center">
            <ChartBarIcon className="w-6 h-6 sm:w-7 sm:h-7 lg:w-8 lg:h-8 mr-3 text-purple-600" />
            Detailed AI Analytics
          </h1>
          <p className="text-gray-600 mt-2">Comprehensive exam analysis with performance insights</p>
        </div>
        <Button 
          onClick={fetchDetailedAnalytics} 
          disabled={isLoading}
          className="bg-gradient-to-r from-sky-300 to-teal-400 hover:from-sky-400 hover:to-teal-500 text-white"
        >
          {isLoading ? (
            <>
              <CpuIcon className="w-3 h-3 sm:w-4 sm:h-4 mr-2 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <SparklesIcon className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
              Refresh Analytics
            </>
          )}
        </Button>
      </div>

      {/* Filter Options */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">Filter Options</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="filter-board">Filter by Board</Label>
              <Select value={filterBoard} onValueChange={setFilterBoard}>
                <SelectTrigger id="filter-board">
                  <SelectValue placeholder="Select Board" />
                </SelectTrigger>
                <SelectContent>
                  {boardOptions.map((board) => (
                    <SelectItem key={board.value} value={board.value}>
                      {board.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="filter-state">Filter by State</Label>
              <Select value={filterState} onValueChange={setFilterState}>
                <SelectTrigger id="filter-state">
                  <SelectValue placeholder="Select State" />
                </SelectTrigger>
                <SelectContent>
                  {stateOptions.map((state) => (
                    <SelectItem key={state.value} value={state.value}>
                      {state.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {(filterBoard !== 'all' || filterState !== 'all') && (
            <div className="mt-4 flex items-center gap-2">
              <Badge variant="outline" className="text-xs sm:text-sm">
                Showing {filteredAnalytics?.adminAnalytics.length || 0} schools
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFilterBoard('all');
                  setFilterState('all');
                }}
              >
                Clear Filters
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {singleAdminId && (
        <Card className="border-teal-200 bg-gradient-to-r from-teal-50 to-sky-50">
          <CardContent className="py-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs sm:text-sm font-semibold text-teal-900">School detail view</p>
              <p className="text-xs sm:text-sm text-teal-800">
                {filteredAnalytics?.adminAnalytics?.[0]?.adminName || 'Selected school'} — exam difficulty, scorers, and
                trends below are scoped to this school.
              </p>
            </div>
            {onClearSchoolFocus && (
              <Button type="button" variant="outline" size="sm" onClick={onClearSchoolFocus}>
                Back to all schools
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {singleAdminId && filteredAnalytics && filteredAnalytics.adminAnalytics.length === 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="py-3 sm:py-4 lg:py-6 text-center text-xs sm:text-sm text-amber-900">
            No exam analytics data matched this school in the AI pipeline yet. Try refreshing analytics or check that
            exams exist for this administrator.
          </CardContent>
        </Card>
      )}

      {/* Global Overview */}
      {filteredAnalytics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:p-4 lg:p-6">
          {/* Total Admins - Orange (matching Analytics page) */}
          <Card className="bg-gradient-to-r from-orange-300 to-orange-400 text-white border-0 shadow-lg">
            <CardContent className="p-3 sm:p-4 lg:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs sm:text-sm font-medium text-white/90">Total Admins</p>
                  <p className="text-2xl sm:text-3xl font-bold text-white">{filteredAnalytics.globalAnalytics.totalAdmins}</p>
                  <p className="text-xs sm:text-sm text-white/90">Active administrators</p>
                </div>
                <UsersIcon className="h-12 w-12 text-white" />
              </div>
            </CardContent>
          </Card>

          {/* Overall Average - Sky Blue (matching Analytics page) */}
          <Card className="bg-gradient-to-br from-sky-300 to-sky-400 text-white border-0 shadow-lg">
            <CardContent className="p-3 sm:p-4 lg:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs sm:text-sm font-medium text-white/90">Overall Average</p>
                  <p className="text-2xl sm:text-3xl font-bold text-white">{filteredAnalytics.globalAnalytics.overallAverageScore?.toFixed(1) || 'N/A'}%</p>
                  <p className="text-xs sm:text-sm text-white/90">Platform performance</p>
                </div>
                <TrendingUpIcon className="h-12 w-12 text-white" />
              </div>
            </CardContent>
          </Card>

          {/* Total Exams - Teal (matching Analytics page) */}
          <Card className="bg-gradient-to-br from-teal-400 to-teal-500 text-white border-0 shadow-lg">
            <CardContent className="p-3 sm:p-4 lg:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs sm:text-sm font-medium text-white/90">Total Exams</p>
                  <p className="text-2xl sm:text-3xl font-bold text-white">{filteredAnalytics.globalAnalytics.totalExams}</p>
                  <p className="text-xs sm:text-sm text-white/90">Conducted</p>
                </div>
                <BookIcon className="h-12 w-12 text-white" />
              </div>
            </CardContent>
          </Card>

          {/* Exam Results - Orange (matching Analytics page) */}
          <Card className="bg-gradient-to-r from-orange-300 to-orange-400 text-white border-0 shadow-lg">
            <CardContent className="p-3 sm:p-4 lg:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs sm:text-sm font-medium text-white/90">Exam Results</p>
                  <p className="text-2xl sm:text-3xl font-bold text-white">{filteredAnalytics.globalAnalytics.totalExamResults}</p>
                  <p className="text-xs sm:text-sm text-white/90">Total submissions</p>
                </div>
                <AwardIcon className="h-12 w-12 text-white" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Analytics Tabs */}
      <Tabs defaultValue="admin-comparison" className="space-y-4">
        <TabsList className="grid w-full grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
          <TabsTrigger value="admin-comparison">Admin Comparison</TabsTrigger>
          <TabsTrigger value="top-scorers">Top Scorers</TabsTrigger>
          <TabsTrigger value="difficulty-analysis">Difficulty Analysis</TabsTrigger>
          <TabsTrigger value="performance-distribution">Performance Distribution</TabsTrigger>
          <TabsTrigger value="subject-analysis">Subject Analysis</TabsTrigger>
          <TabsTrigger value="trends">Performance Trends</TabsTrigger>
        </TabsList>

        {/* Admin Comparison Tab */}
        <TabsContent value="admin-comparison" className="space-y-4">
          <Card className="relative border-0 overflow-hidden" style={{
            background: 'linear-gradient(135deg, #7dd3fc 0%, #7dd3fc 20%, #2dd4bf 60%, #14b8a6 100%)'
          }}>
            <div className="absolute inset-0 bg-white/5 pointer-events-none"></div>
            <CardHeader className="relative z-10">
              <CardTitle className="flex items-center text-gray-900">
                <UsersIcon className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                Admin Performance Comparison
              </CardTitle>
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="space-y-4">
                {filteredAnalytics?.adminAnalytics.length === 0 ? (
                  <div className="text-center py-4 sm:py-6 lg:py-8">
                    <AlertCircleIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">No schools found matching the selected filters</p>
                  </div>
                ) : (
                  filteredAnalytics?.adminAnalytics.map((admin) => (
                    <div key={admin.adminId} className="p-4 bg-white/90 backdrop-blur-sm rounded-lg border border-white/50 shadow-md">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h3 className="font-semibold text-base sm:text-lg text-gray-900">{admin.adminName}</h3>
                          <p className="text-gray-600">{admin.adminEmail}</p>
                        </div>
                        <div className="text-right">
                          <p className={`text-xl sm:text-2xl font-bold ${getScoreColor(admin.averageScore)}`}>
                            {admin.averageScore?.toFixed(1) || 'N/A'}%
                          </p>
                          <p className="text-xs sm:text-sm text-gray-600">Average Score</p>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs sm:text-sm">
                        <div className="text-center">
                          <p className="font-semibold text-gray-900 text-base sm:text-lg">
                            {admin.uniqueStudents ?? admin.totalStudents}
                          </p>
                          <p className="text-gray-600">Students</p>
                        </div>
                        <div className="text-center">
                          <p className="font-semibold text-gray-900 text-base sm:text-lg">
                            {admin.totalAttempts ?? admin.totalStudents}
                          </p>
                          <p className="text-gray-600">Attempts</p>
                        </div>
                        <div className="text-center">
                          <p className="font-semibold text-gray-900 text-base sm:text-lg">{admin.totalExams}</p>
                          <p className="text-gray-600">Exams</p>
                        </div>
                        <div className="text-center">
                          <p className="font-semibold text-gray-900 text-base sm:text-lg">{admin.examDifficulty.overallDifficulty.toFixed(1)}</p>
                          <p className="text-gray-600">Difficulty</p>
                        </div>
                        <div className="text-center">
                          <p className="font-semibold text-gray-900 text-base sm:text-lg">{admin.topScorers.length}</p>
                          <p className="text-gray-600">Top Scorers</p>
                        </div>
                      </div>
                      
                      <div className="mt-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs sm:text-sm font-medium text-gray-900">Performance Progress</span>
                          <span className="text-xs sm:text-sm text-gray-600">{admin.averageScore?.toFixed(1) || 'N/A'}%</span>
                        </div>
                        <Progress value={admin.averageScore || 0} className="h-2" />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Top Scorers Tab */}
        <TabsContent value="top-scorers" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <TrophyIcon className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                Top Performers Across All Admins
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {filteredAnalytics?.globalAnalytics.topPerformers.length === 0 ? (
                  <div className="text-center py-4 sm:py-6 lg:py-8">
                    <AlertCircleIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">No top performers found matching the selected filters</p>
                  </div>
                ) : (
                  filteredAnalytics?.globalAnalytics.topPerformers.map((scorer, index) => (
                  <div key={scorer.studentId} className="flex items-center justify-between p-4 bg-gradient-to-r from-yellow-50 to-orange-50 rounded-lg">
                    <div className="flex items-center space-x-4">
                      <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center">
                        <span className="font-bold text-yellow-800">#{index + 1}</span>
                      </div>
                      <div>
                        <h3 className="font-semibold">{scorer.studentName}</h3>
                        <p className="text-xs sm:text-sm text-gray-600">{scorer.studentEmail}</p>
                        <p className="text-xs sm:text-sm text-gray-500">{scorer.totalExams} exams taken</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-xl sm:text-2xl font-bold ${getScoreColor(scorer.averageScore)}`}>
                        {scorer.averageScore?.toFixed(1) || 'N/A'}%
                      </p>
                      <p className="text-xs sm:text-sm text-gray-600">Average Score</p>
                      <p className="text-xs sm:text-sm text-green-600">Best: {scorer.highestScore?.toFixed(1) || 'N/A'}%</p>
                    </div>
                  </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Difficulty Analysis Tab */}
        <TabsContent value="difficulty-analysis" className="space-y-4">
          {filteredAnalytics?.adminAnalytics.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <AlertCircleIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No schools found matching the selected filters</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:p-4 lg:p-6">
              {filteredAnalytics?.adminAnalytics.map((admin) => (
                <Card key={admin.adminId}>
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <CalculatorIcon className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                      {admin.adminName} - Exam Difficulty
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="text-center mb-4">
                        <p className="text-xl sm:text-2xl font-bold text-purple-600">
                          {admin.examDifficulty?.overallDifficulty?.toFixed(1) || 'N/A'}
                        </p>
                        <p className="text-xs sm:text-sm text-gray-600">Overall Difficulty Score</p>
                      </div>
                      
                      <div className="space-y-2">
                        {(admin.examDifficulty?.exams || []).slice(0, 5).map((exam) => (
                          <div key={exam.examId} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                            <div className="flex-1">
                              <p className="font-medium text-xs sm:text-sm">{exam.examTitle}</p>
                              <p className="text-xs text-gray-600">{exam.totalAttempts} attempts</p>
                            </div>
                            <div className="text-right">
                              <Badge className={getDifficultyColor(exam.difficulty)}>
                                {exam.difficulty}
                              </Badge>
                              <p className="text-xs sm:text-sm font-semibold">{exam.averageScore?.toFixed(1) || 'N/A'}%</p>
                            </div>
                          </div>
                        ))}
                      </div>
                      
                      <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                        <p className="text-xs sm:text-sm font-medium text-blue-800">Hardest Exam</p>
                        <p className="text-xs sm:text-sm text-blue-600">{admin.examDifficulty.hardestExam?.examTitle || 'No exams available'}</p>
                        <p className="text-xs text-blue-500">Score: {admin.examDifficulty.hardestExam?.averageScore?.toFixed(1) || 'N/A'}%</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Performance Distribution Tab */}
        <TabsContent value="performance-distribution" className="space-y-4">
          {filteredAnalytics?.adminAnalytics.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <AlertCircleIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No schools found matching the selected filters</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:p-4 lg:p-6">
              {filteredAnalytics?.adminAnalytics.map((admin) => (
              <Card key={admin.adminId}>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <PieChartIcon className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                    {admin.adminName} - Performance Distribution
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {Object.entries(admin.performanceDistribution).map(([key, data]) => (
                      <div key={key} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs sm:text-sm font-medium capitalize">{key}</span>
                          <span className="text-xs sm:text-sm text-gray-600">{data.count} students ({data.percentage}%)</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div 
                            className={`h-2 rounded-full ${getPerformanceColor(data.range)}`}
                            style={{ width: `${data.percentage}%` }}
                          ></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Subject Analysis Tab */}
        <TabsContent value="subject-analysis" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <BookOpenIcon className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                Subject-wise Performance Analysis
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {filteredAnalytics?.globalAnalytics.subjectWiseAnalysis.length === 0 ? (
                  <div className="text-center py-4 sm:py-6 lg:py-8">
                    <AlertCircleIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">No subject data found matching the selected filters</p>
                  </div>
                ) : (
                  filteredAnalytics?.globalAnalytics.subjectWiseAnalysis.map((subject) => (
                  <div key={subject.subject} className="p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold text-base sm:text-lg capitalize">{subject.subject}</h3>
                      <div className="text-right">
                        <p className={`text-xl sm:text-2xl font-bold ${getScoreColor(subject.averageScore)}`}>
                          {subject.averageScore?.toFixed(1) || 'N/A'}%
                        </p>
                        <p className="text-xs sm:text-sm text-gray-600">Average Score</p>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs sm:text-sm">
                      <div className="text-center">
                        <p className="font-semibold text-blue-600">{subject.totalExams}</p>
                        <p className="text-gray-600">Total Exams</p>
                      </div>
                      <div className="text-center">
                        <p className="font-semibold text-green-600">{subject.highestScore?.toFixed(1) || 'N/A'}%</p>
                        <p className="text-gray-600">Highest Score</p>
                      </div>
                      <div className="text-center">
                        <p className="font-semibold text-orange-600">{subject.lowestScore?.toFixed(1) || 'N/A'}%</p>
                        <p className="text-gray-600">Lowest Score</p>
                      </div>
                      <div className="text-center">
                        <p className="font-semibold text-purple-600">{subject.examCount}</p>
                        <p className="text-gray-600">Exam Count</p>
                      </div>
                    </div>
                    
                    <div className="mt-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs sm:text-sm font-medium">Performance Range</span>
                        <span className="text-xs sm:text-sm text-gray-600">
                          {subject.lowestScore?.toFixed(1) || 'N/A'}% - {subject.highestScore?.toFixed(1) || 'N/A'}%
                        </span>
                      </div>
                      <Progress value={subject.averageScore || 0} className="h-2" />
                    </div>
                  </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Performance Trends Tab */}
        <TabsContent value="trends" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <LineChartIcon className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                Performance Trends Analysis
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 sm:space-y-4 lg:space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center p-4 bg-green-50 rounded-lg">
                    <TrendingUpIcon className="w-6 h-6 sm:w-7 sm:h-7 lg:w-8 lg:h-8 text-green-600 mx-auto mb-2" />
                    <p className="text-xl sm:text-2xl font-bold text-green-600">{analytics.globalAnalytics.trendsAnalysis.improving}</p>
                    <p className="text-xs sm:text-sm text-green-600">Students Improving</p>
                  </div>
                  <div className="text-center p-4 bg-red-50 rounded-lg">
                    <TrendingDownIcon className="w-6 h-6 sm:w-7 sm:h-7 lg:w-8 lg:h-8 text-red-600 mx-auto mb-2" />
                    <p className="text-xl sm:text-2xl font-bold text-red-600">{analytics.globalAnalytics.trendsAnalysis.declining}</p>
                    <p className="text-xs sm:text-sm text-red-600">Students Declining</p>
                  </div>
                  <div className="text-center p-4 bg-blue-50 rounded-lg">
                    <ActivityIcon className="w-6 h-6 sm:w-7 sm:h-7 lg:w-8 lg:h-8 text-blue-600 mx-auto mb-2" />
                    <p className="text-xl sm:text-2xl font-bold text-blue-600">{analytics.globalAnalytics.trendsAnalysis.stable}</p>
                    <p className="text-xs sm:text-sm text-blue-600">Stable Performance</p>
                  </div>
                </div>
                
                <div className="space-y-4">
                  {filteredAnalytics?.adminAnalytics.length === 0 ? (
                    <div className="text-center py-4 sm:py-6 lg:py-8">
                      <AlertCircleIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-600">No performance trends found matching the selected filters</p>
                    </div>
                  ) : (
                    filteredAnalytics?.adminAnalytics.map((admin) => (
                    <div key={admin.adminId} className="p-4 bg-gray-50 rounded-lg">
                      <h3 className="font-semibold mb-3">{admin.adminName} - Monthly Trends</h3>
                      <div className="space-y-2">
                        {admin.performanceTrends.slice(-6).map((trend) => (
                          <div key={trend.month} className="flex items-center justify-between">
                            <span className="text-xs sm:text-sm font-medium">{trend.month}</span>
                            <div className="flex items-center space-x-4">
                              <span className="text-xs sm:text-sm text-gray-600">{trend.examCount} exams</span>
                              <span className={`text-xs sm:text-sm font-semibold ${getScoreColor(trend.averageScore)}`}>
                                {trend.averageScore?.toFixed(1) || 'N/A'}%
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    ))
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* AI Insights */}
      {filteredAnalytics?.aiInsights && filteredAnalytics.aiInsights.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <BrainCircuitIcon className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
              AI-Generated Insights
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredAnalytics.aiInsights.map((insight, index) => (
                <div key={index} className="p-4 bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-semibold">{insight.title}</h3>
                    <Badge className={
                      insight.type === 'alert' ? 'bg-red-100 text-red-800' :
                      insight.type === 'recommendation' ? 'bg-green-100 text-green-800' :
                      'bg-blue-100 text-blue-800'
                    }>
                      {insight.type}
                    </Badge>
                  </div>
                  <p className="text-xs sm:text-sm text-gray-600 mb-2">{insight.description}</p>
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>{insight.confidence}% confidence</span>
                    <span className={`px-2 py-1 rounded ${
                      insight.impact === 'high' ? 'bg-red-100 text-red-600' :
                      insight.impact === 'medium' ? 'bg-yellow-100 text-yellow-600' :
                      'bg-green-100 text-green-600'
                    }`}>
                      {insight.impact} impact
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
