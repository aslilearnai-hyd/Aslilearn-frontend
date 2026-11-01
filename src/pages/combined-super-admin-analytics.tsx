import { useEffect, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import SuperAdminAnalyticsDashboard from './super-admin-analytics';
import DetailedAIAnalyticsDashboard from './detailed-ai-analytics';
import ImpactReportsPanel from '@/components/super-admin/impact-reports-panel';
import AuditLogsPanel from '@/components/super-admin/audit-logs-panel';
import StudentDetailsPanel from '@/components/super-admin/student-details-panel';
import UsageAnalysisPanel from '@/components/super-admin/usage-analysis-panel';
import { BarChart3, BrainCircuit, FileBarChart, ScrollText, UserRound, Users } from 'lucide-react';

export type AnalyticsMainTab = 'overview' | 'students' | 'individuals' | 'impact' | 'audit' | 'ai';

type Props = {
  /** Open a specific Analytics sub-tab (from legacy sidebar deep links). */
  initialTab?: AnalyticsMainTab;
};

function tabFromLegacyView(view?: string): AnalyticsMainTab {
  if (view === 'impact-reports' || view === 'impact') return 'impact';
  if (view === 'audit-logs' || view === 'audit') return 'audit';
  if (view === 'ai-analytics' || view === 'ai') return 'ai';
  if (view === 'student-details' || view === 'students') return 'students';
  if (view === 'individuals') return 'individuals';
  return 'overview';
}

/**
 * Single Analytics area: platform overview, impact reports, audit logs, exam/AI insights.
 */
export default function CombinedSuperAdminAnalytics({ initialTab }: Props) {
  const [mainTab, setMainTab] = useState<AnalyticsMainTab>(() =>
    tabFromLegacyView(initialTab),
  );
  const [focusAdminId, setFocusAdminId] = useState<string | null>(null);

  useEffect(() => {
    if (initialTab) setMainTab(tabFromLegacyView(initialTab));
  }, [initialTab]);

  const handleSelectSchool = (admin: { id: string; name: string; email: string }) => {
    setFocusAdminId(admin.id);
    setMainTab('ai');
  };

  const handleClearSchoolFocus = () => {
    setFocusAdminId(null);
  };

  return (
    <div className="flex max-h-[calc(100vh-6rem)] flex-col space-y-4 overflow-hidden">
      <div className="shrink-0 space-y-1">
        <h2 className="text-xl font-bold text-slate-900 sm:text-2xl">Analytics</h2>
        <p className="text-sm text-slate-600">
          Overview, impact reports, audit logs, and exam/AI insights.
        </p>
      </div>
      <Tabs
        value={mainTab}
        onValueChange={(v) => setMainTab(v as AnalyticsMainTab)}
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        <TabsList className="sticky top-0 z-10 grid h-auto w-full max-w-4xl shrink-0 grid-cols-3 gap-1 bg-gray-50/95 py-1 backdrop-blur sm:grid-cols-6">
          <TabsTrigger value="overview" className="gap-2 py-2.5">
            <BarChart3 className="h-3 w-3 sm:h-4 sm:w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="students" className="gap-2 py-2.5">
            <Users className="h-3 w-3 sm:h-4 sm:w-4" />
            Students
          </TabsTrigger>
          <TabsTrigger value="individuals" className="gap-2 py-2.5">
            <UserRound className="h-3 w-3 sm:h-4 sm:w-4" />
            Individuals
          </TabsTrigger>
          <TabsTrigger value="impact" className="gap-2 py-2.5">
            <FileBarChart className="h-3 w-3 sm:h-4 sm:w-4" />
            Impact Reports
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-2 py-2.5">
            <ScrollText className="h-3 w-3 sm:h-4 sm:w-4" />
            Audit Logs
          </TabsTrigger>
          <TabsTrigger value="ai" className="gap-2 py-2.5">
            <BrainCircuit className="h-3 w-3 sm:h-4 sm:w-4" />
            Exam &amp; AI
          </TabsTrigger>
        </TabsList>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <TabsContent value="overview" className="mt-6 focus-visible:outline-none">
          <SuperAdminAnalyticsDashboard onSelectSchool={handleSelectSchool} />
        </TabsContent>

        <TabsContent value="students" className="mt-6 focus-visible:outline-none">
          <StudentDetailsPanel />
        </TabsContent>

        <TabsContent value="individuals" className="mt-6 focus-visible:outline-none">
          <UsageAnalysisPanel scope="individual" />
        </TabsContent>

        <TabsContent value="impact" className="mt-6 focus-visible:outline-none">
          <ImpactReportsPanel />
        </TabsContent>

        <TabsContent value="audit" className="mt-6 focus-visible:outline-none">
          <AuditLogsPanel />
        </TabsContent>

        <TabsContent value="ai" className="mt-6 focus-visible:outline-none">
          <DetailedAIAnalyticsDashboard
            singleAdminId={focusAdminId}
            onClearSchoolFocus={handleClearSchoolFocus}
          />
        </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
