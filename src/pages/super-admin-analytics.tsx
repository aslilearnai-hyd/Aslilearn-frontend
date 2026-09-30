import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getAuthToken } from '@/lib/auth-utils';
import {
  BarChart3Icon, 
  UsersIcon, 
  TrendingUpIcon, 
  BookIcon,
  CrownIcon,
  StarIcon,
  TargetIcon,
  AwardIcon
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { API_BASE_URL } from "@/lib/api-config";

export type SchoolSummary = {
  id: string;
  name: string;
  email: string;
};

type SuperAdminAnalyticsDashboardProps = {
  /** Opens Exam & AI insights for this school (combined analytics page). */
  onSelectSchool?: (admin: SchoolSummary) => void;
};

export default function SuperAdminAnalyticsDashboard({ onSelectSchool }: SuperAdminAnalyticsDashboardProps) {
  const { toast } = useToast();
  const [analytics, setAnalytics] = useState<any[]>([]);
  const [dashboardStats, setDashboardStats] = useState<any>(null);
  const [platformAnalytics, setPlatformAnalytics] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
    
    // Listen for admin deletion events to refresh analytics
    const handleAdminDeleted = () => {
      fetchAnalytics();
    };
    
    window.addEventListener('adminDeleted', handleAdminDeleted);
    
    return () => {
      window.removeEventListener('adminDeleted', handleAdminDeleted);
    };
  }, []);

  const fetchAnalytics = async () => {
    try {
      const token = getAuthToken();
      const [adminsResponse, statsResponse, analyticsResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/api/super-admin/admins`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }),
        fetch(`${API_BASE_URL}/api/super-admin/dashboard/stats`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }),
        fetch(`${API_BASE_URL}/api/super-admin/analytics`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }),
      ]);

      if (adminsResponse.ok) {
        const data = await adminsResponse.json();
        setAnalytics(data.data);
      }

      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        setDashboardStats(statsData?.data || null);
      }

      if (analyticsResponse.ok) {
        const aData = await analyticsResponse.json();
        setPlatformAnalytics(aData?.data || null);
      }
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
      toast({
        title: 'Analytics',
        description: 'Some analytics data could not be loaded',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const totalContentFromAdmins =
    analytics?.reduce(
      (sum, admin) =>
        sum + (admin.stats?.videos || 0) + (admin.stats?.assessments || 0) + (admin.stats?.exams || 0),
      0
    ) || 0;
  const totalContentFromStats =
    (dashboardStats?.totalContent || dashboardStats?.courses || 0) +
    (dashboardStats?.assessments || 0) +
    (dashboardStats?.exams || 0);
  const totalContentDisplay = totalContentFromStats || totalContentFromAdmins;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <BarChart3Icon className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-base sm:text-lg font-semibold">Loading Analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-4 lg:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center">
            <BarChart3Icon className="w-6 h-6 sm:w-7 sm:h-7 lg:w-8 lg:h-8 mr-3 text-blue-600" />
            Analytics Dashboard
          </h1>
          <p className="text-gray-600 mt-2">
            School platform overview plus individual (B2C) trial conversion — live counts only.
          </p>
        </div>
      </div>

      {/* Individual / B2C trials & conversions */}
      <Card className="border-emerald-100 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <TargetIcon className="h-5 w-5 text-emerald-600" />
            Individual trials &amp; subscriptions (B2C)
          </CardTitle>
          <p className="text-sm text-slate-600">
            Converted = trial members unlocked as paid. Manage in Trial Members; list under
            Subscriptions → Individual.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { label: 'Total individuals', value: platformAnalytics?.individual?.total ?? '—' },
              { label: 'On trial', value: platformAnalytics?.individual?.trialActive ?? '—' },
              { label: 'Exceeded', value: platformAnalytics?.individual?.exceeded ?? '—' },
              { label: 'Converted', value: platformAnalytics?.individual?.converted ?? '—' },
              {
                label: 'Conversion rate',
                value:
                  platformAnalytics?.individual?.conversionRate != null
                    ? `${platformAnalytics.individual.conversionRate}%`
                    : '—',
              },
              {
                label: 'B2C revenue recorded',
                value:
                  platformAnalytics?.individual?.revenueInr != null
                    ? `₹${Number(platformAnalytics.individual.revenueInr).toLocaleString('en-IN')}`
                    : '—',
              },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-3"
              >
                <p className="text-xs text-slate-500">{item.label}</p>
                <p className="mt-1 text-xl font-bold text-slate-900">{item.value}</p>
              </div>
            ))}
          </div>
          {(platformAnalytics?.weeklyActiveStudents != null ||
            platformAnalytics?.monthlyActiveStudents != null) && (
            <p className="mt-3 text-xs text-slate-500">
              Students with login in last 7 days: {platformAnalytics?.weeklyActiveStudents ?? '—'} ·
              last 30 days: {platformAnalytics?.monthlyActiveStudents ?? '—'}
              {platformAnalytics?.schoolStudents != null
                ? ` · school students (excl. B2C): ${platformAnalytics.schoolStudents}`
                : ''}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Analytics Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
        {/* Total Admins - Orange (matching admin dashboard) */}
        <Card className="bg-gradient-to-r from-orange-300 to-orange-400 text-white border-0 shadow-lg">
          <CardContent className="p-3 sm:p-4 lg:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm font-medium text-white/90">Total Admins</p>
                <p className="text-2xl sm:text-3xl font-bold text-white">{analytics?.length || 0}</p>
                <p className="text-xs sm:text-sm text-white/90">Active administrators</p>
              </div>
              <CrownIcon className="h-12 w-12 text-white" />
            </div>
          </CardContent>
        </Card>

        {/* Total Students - Sky Blue (matching admin dashboard) */}
        <Card className="bg-gradient-to-br from-sky-300 to-sky-400 text-white border-0 shadow-lg">
          <CardContent className="p-3 sm:p-4 lg:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm font-medium text-white/90">School Students</p>
                <p className="text-2xl sm:text-3xl font-bold text-white">
                  {platformAnalytics?.schoolStudents != null
                    ? platformAnalytics.schoolStudents
                    : analytics?.reduce((sum, admin) => sum + (admin.stats?.students || 0), 0) || 0}
                </p>
                <p className="text-xs sm:text-sm text-white/90">Excl. individual (B2C) accounts</p>
              </div>
              <UsersIcon className="h-12 w-12 text-white" />
            </div>
          </CardContent>
        </Card>

        {/* Total Teachers - Teal (matching admin dashboard) */}
        <Card className="bg-gradient-to-br from-teal-400 to-teal-500 text-white border-0 shadow-lg">
          <CardContent className="p-3 sm:p-4 lg:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm font-medium text-white/90">Total Teachers</p>
                <p className="text-2xl sm:text-3xl font-bold text-white">
                  {analytics?.reduce((sum, admin) => sum + (admin.stats?.teachers || 0), 0) || 0}
                </p>
                <p className="text-xs sm:text-sm text-white/90">Active educators</p>
              </div>
              <AwardIcon className="h-12 w-12 text-white" />
            </div>
          </CardContent>
        </Card>

        {/* Total Content - Orange (matching admin dashboard) */}
        <Card className="bg-gradient-to-r from-orange-300 to-orange-400 text-white border-0 shadow-lg">
          <CardContent className="p-3 sm:p-4 lg:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm font-medium text-white/90">Total Content</p>
                <p className="text-2xl sm:text-3xl font-bold text-white">
                  {totalContentDisplay}
                </p>
                <p className="text-xs sm:text-sm text-white/90">Videos, assessments, exams</p>
              </div>
              <BookIcon className="h-12 w-12 text-white" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Admin Performance */}
      <Card className="relative border-0 overflow-hidden" style={{
        background: 'linear-gradient(135deg, #7dd3fc 0%, #7dd3fc 20%, #2dd4bf 60%, #14b8a6 100%)'
      }}>
        <div className="absolute inset-0 bg-white/5 pointer-events-none"></div>
        <CardHeader className="relative z-10">
          <CardTitle className="flex items-center text-gray-900">
            <TrendingUpIcon className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
            Admin Performance Overview
          </CardTitle>
        </CardHeader>
        <CardContent className="relative z-10">
          <div className="space-y-4">
            {analytics?.map((admin) => {
              const schoolId = String(admin.id || admin._id || '');
              const interactive = Boolean(onSelectSchool && schoolId);
              return (
                <div
                  key={schoolId || admin.email}
                  role={interactive ? 'button' : undefined}
                  tabIndex={interactive ? 0 : undefined}
                  onClick={
                    interactive
                      ? () =>
                          onSelectSchool!({
                            id: schoolId,
                            name: admin.name || admin.schoolName || 'School',
                            email: admin.email || '',
                          })
                      : undefined
                  }
                  onKeyDown={
                    interactive
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onSelectSchool!({
                              id: schoolId,
                              name: admin.name || admin.schoolName || 'School',
                              email: admin.email || '',
                            });
                          }
                        }
                      : undefined
                  }
                  className={`p-4 bg-white/90 backdrop-blur-sm rounded-lg border border-white/50 shadow-md ${
                    interactive
                      ? 'cursor-pointer transition hover:ring-2 hover:ring-teal-400 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500'
                      : ''
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-base sm:text-lg text-gray-900">{admin.name}</h3>
                      <p className="text-gray-600">{admin.email}</p>
                      {interactive && (
                        <p className="text-xs text-teal-700 font-medium mt-1">
                          Click for detailed exam &amp; AI analytics →
                        </p>
                      )}
                    </div>
                    <Badge
                      className={
                        admin.status === 'Active'
                          ? 'bg-teal-600 text-white border-2 border-teal-700 shadow-lg font-semibold'
                          : 'bg-gray-600 text-white border-2 border-gray-700 shadow-lg font-semibold'
                      }
                    >
                      {admin.status}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs sm:text-sm">
                    <div className="text-center">
                      <p className="font-semibold text-gray-900 text-base sm:text-lg">{admin.stats?.students || 0}</p>
                      <p className="text-gray-600">Students</p>
                    </div>
                    <div className="text-center">
                      <p className="font-semibold text-gray-900 text-base sm:text-lg">{admin.stats?.teachers || 0}</p>
                      <p className="text-gray-600">Teachers</p>
                    </div>
                    <div className="text-center">
                      <p className="font-semibold text-gray-900 text-base sm:text-lg">{admin.stats?.videos || 0}</p>
                      <p className="text-gray-600">Videos</p>
                    </div>
                    <div className="text-center">
                      <p className="font-semibold text-gray-900 text-base sm:text-lg">{admin.stats?.assessments || 0}</p>
                      <p className="text-gray-600">Assessments</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
