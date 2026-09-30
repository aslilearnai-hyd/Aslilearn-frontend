import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { API_BASE_URL } from '@/lib/api-config';
import { getAuthToken } from '@/lib/auth-utils';
import { useToast } from '@/hooks/use-toast';
import { useConfirm } from '@/hooks/use-confirm';
import { formatIitCategoryLabel } from '@/lib/products';
import {
  Clock,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
  UserRound,
  GraduationCap,
  ClipboardList,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  CURRICULUM_BOARD_OPTIONS,
  INDIVIDUAL_CLASS_OPTIONS,
  INDIVIDUAL_COURSE_OPTIONS,
  INDIVIDUAL_SUBJECT_OPTIONS,
  INDIVIDUAL_TRIAL_DAYS,
} from '@/lib/individual-signup';
import IndividualPlanRatesPanel from '@/components/super-admin/IndividualPlanRatesPanel';

type TrialMember = {
  id: string;
  role: 'student' | 'teacher';
  fullName: string;
  email: string;
  phone: string;
  schoolName: string;
  classNumber: string;
  interestedCourses: string[];
  interestedSubjects: string[];
  iitCategories: string[];
  accountSource?: string;
  accountSourceLabel?: string;
  subscriptionStatus: string;
  trialStartsAt?: string | null;
  trialEndsAt?: string | null;
  trialDaysLeft?: number | null;
  trialActive?: boolean;
  trialExceeded?: boolean;
  paymentRequired?: boolean;
  trialAllowedContentTypes: string[];
  trialAllowedAiTools: string[];
  trialAssignedExams: string[];
  trialExamAccessConfigured?: boolean;
  trialAdminNotes: string;
  trialPaymentAmount?: number | null;
  trialPaidAt?: string | null;
  trialPaymentMethod?: string;
  trialPaymentReference?: string;
  converted?: boolean;
  convertedAt?: string | null;
  isActive: boolean;
  createdAt?: string | null;
};

const EMPTY_ADD_FORM = {
  role: 'student' as 'student' | 'teacher',
  fullName: '',
  email: '',
  password: '',
  phone: '',
  schoolName: '',
  classNumber: 'Class 10',
  curriculumBoard: 'CBSE',
  interestedCourses: [] as string[],
  interestedSubjects: [] as string[],
  trialDays: String(INDIVIDUAL_TRIAL_DAYS),
  trialAdminNotes: '',
};

type Summary = {
  total: number;
  trialActive: number;
  exceeded: number;
  paid: number;
  converted?: number;
  conversionRate?: number;
  revenueInr?: number;
  students: number;
  teachers: number;
};

type ExamOption = {
  _id: string;
  title: string;
  classNumber?: string;
  assignedClasses?: string[];
  subject?: string;
  startDate?: string;
  endDate?: string;
  isActive?: boolean;
};

const QUICK_TRIAL_DAYS = [1, 3, 7, 14, 30];

const COMMON_AI_TOOLS = [
  { id: 'worksheet-mcq-generator', label: 'Worksheet & MCQ' },
  { id: 'exam-question-paper-generator', label: 'Exam Question Paper' },
  { id: 'lesson-planner', label: 'Lesson Planner' },
  { id: 'concept-mastery-helper', label: 'Concept Mastery' },
  { id: 'flashcard-generator', label: 'Flashcards' },
  { id: 'short-notes-summaries-maker', label: 'Short Notes' },
  { id: 'homework-creator', label: 'Homework Creator' },
  { id: 'activity-project-generator', label: 'Activity & Project' },
];

function authHeaders(): HeadersInit {
  const token = getAuthToken();
  return token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

function statusBadge(m: TrialMember) {
  if (m.subscriptionStatus === 'active' || m.converted) {
    return (
      <Badge className="bg-emerald-100 text-emerald-900 hover:bg-emerald-100">
        Converted · Paid
      </Badge>
    );
  }
  if (m.trialExceeded || m.subscriptionStatus === 'expired') {
    return (
      <Badge className="bg-red-100 text-red-900 hover:bg-red-100">
        Trial exceeded
      </Badge>
    );
  }
  if (m.trialActive) {
    return (
      <Badge className="bg-amber-100 text-amber-950 hover:bg-amber-100">
        Trial · {m.trialDaysLeft ?? '—'}d left
      </Badge>
    );
  }
  return <Badge variant="outline">{m.subscriptionStatus || 'none'}</Badge>;
}

export default function TrialMembersManagement() {
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const [members, setMembers] = useState<TrialMember[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [contentTypeOptions, setContentTypeOptions] = useState<string[]>([]);
  const [examOptions, setExamOptions] = useState<ExamOption[]>([]);
  const [examsLoading, setExamsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('student');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<TrialMember | null>(null);
  const [saving, setSaving] = useState(false);
  const [addingOpen, setAddingOpen] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY_ADD_FORM);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [applyingDefaults, setApplyingDefaults] = useState(false);
  const [batchDefaults, setBatchDefaults] = useState({
    trialAllowedContentTypes: [] as string[],
    trialAllowedAiTools: [] as string[],
    trialAssignedExams: [] as string[],
  });
  const [editForm, setEditForm] = useState({
    trialDays: '7',
    extendDays: '',
    subscriptionStatus: 'trial',
    trialAllowedContentTypes: [] as string[],
    trialAllowedAiTools: [] as string[],
    trialAssignedExams: [] as string[],
    trialAdminNotes: '',
    trialPaymentAmount: '',
    trialPaidAt: '',
    trialPaymentMethod: 'manual',
    trialPaymentReference: '',
    isActive: true,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (roleFilter !== 'all') params.set('role', roleFilter);
      if (search.trim()) params.set('q', search.trim());
      const res = await fetch(`${API_BASE_URL}/api/super-admin/trial-members?${params}`, {
        headers: authHeaders(),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to load');
      setMembers(json.data?.members || []);
      setSummary(json.data?.summary || null);
      setContentTypeOptions(json.data?.contentTypeOptions || []);
    } catch (e) {
      toast({
        title: 'Could not load trial members',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [statusFilter, roleFilter, search, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let active = true;
    const loadExams = async () => {
      setExamsLoading(true);
      try {
        const res = await fetch(`${API_BASE_URL}/api/super-admin/exams`, { headers: authHeaders() });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.message || 'Failed to load exams');
        if (active) setExamOptions(Array.isArray(json.data) ? json.data : []);
      } catch (e) {
        if (active) {
          toast({
            title: 'Could not load exams for allotment',
            description: e instanceof Error ? e.message : 'Unknown error',
            variant: 'destructive',
          });
        }
      } finally {
        if (active) setExamsLoading(false);
      }
    };
    void loadExams();
    return () => { active = false; };
  }, [toast]);

  const openEdit = (m: TrialMember) => {
    setEditing(m);
    const paidAtLocal = m.trialPaidAt
      ? new Date(m.trialPaidAt).toISOString().slice(0, 16)
      : '';
    setEditForm({
      trialDays: String(Math.max(1, m.trialDaysLeft || 7)),
      extendDays: '',
      subscriptionStatus: m.subscriptionStatus || 'trial',
      trialAllowedContentTypes: [...(m.trialAllowedContentTypes || [])],
      trialAllowedAiTools: [...(m.trialAllowedAiTools || [])],
      trialAssignedExams: [...(m.trialAssignedExams || [])],
      trialAdminNotes: m.trialAdminNotes || '',
      trialPaymentAmount:
        m.trialPaymentAmount != null && Number.isFinite(m.trialPaymentAmount)
          ? String(m.trialPaymentAmount)
          : '',
      trialPaidAt: paidAtLocal,
      trialPaymentMethod: m.trialPaymentMethod || 'manual',
      trialPaymentReference: m.trialPaymentReference || '',
      isActive: m.isActive !== false,
    });
  };

  const paymentPayload = () => {
    const amountRaw = editForm.trialPaymentAmount.trim();
    return {
      trialPaymentAmount: amountRaw === '' ? null : Number(amountRaw),
      trialPaymentMethod: editForm.trialPaymentMethod || '',
      trialPaymentReference: editForm.trialPaymentReference.trim(),
      trialPaidAt: editForm.trialPaidAt
        ? new Date(editForm.trialPaidAt).toISOString()
        : null,
    };
  };

  const memberKey = (m: TrialMember) => `${m.role}:${m.id}`;

  const saveMember = async (extra: Record<string, unknown> = {}) => {
    if (!editing) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/super-admin/trial-members/${editing.id}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({
          role: editing.role,
          subscriptionStatus: editForm.subscriptionStatus,
          trialAllowedContentTypes: editForm.trialAllowedContentTypes,
          trialAllowedAiTools: editForm.trialAllowedAiTools,
          ...(editing.role === 'student'
            ? { trialAssignedExams: editForm.trialAssignedExams }
            : {}),
          trialAdminNotes: editForm.trialAdminNotes,
          isActive: editForm.isActive,
          ...paymentPayload(),
          ...extra,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Update failed');
      toast({ title: 'Trial member updated', description: json.message });
      if (json.data) openEdit(json.data);
      await load();
    } catch (e) {
      toast({
        title: 'Update failed',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const createMember = async () => {
    const phoneDigits = addForm.phone.replace(/\D/g, '');
    if (!addForm.fullName.trim()) {
      toast({ title: 'Full name is required', variant: 'destructive' });
      return;
    }
    if (!addForm.email.trim() || !addForm.email.includes('@')) {
      toast({ title: 'Valid email is required', variant: 'destructive' });
      return;
    }
    if (addForm.password.length < 6) {
      toast({ title: 'Password must be at least 6 characters', variant: 'destructive' });
      return;
    }
    if (!addForm.schoolName.trim()) {
      toast({ title: 'School name is required', variant: 'destructive' });
      return;
    }
    if (phoneDigits.length !== 10) {
      toast({ title: 'Phone must be exactly 10 digits', variant: 'destructive' });
      return;
    }
    if (addForm.role === 'student' && !addForm.classNumber) {
      toast({ title: 'Class is required for students', variant: 'destructive' });
      return;
    }
    if (addForm.interestedCourses.length === 0) {
      toast({ title: 'Select at least one course', variant: 'destructive' });
      return;
    }
    if (addForm.interestedSubjects.length === 0) {
      toast({ title: 'Select at least one subject', variant: 'destructive' });
      return;
    }

    setCreating(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/super-admin/trial-members`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          role: addForm.role,
          fullName: addForm.fullName.trim(),
          email: addForm.email.trim(),
          password: addForm.password,
          phone: phoneDigits,
          schoolName: addForm.schoolName.trim(),
          classNumber: addForm.classNumber,
          curriculumBoard: addForm.curriculumBoard,
          interestedCourses: addForm.interestedCourses,
          interestedSubjects: addForm.interestedSubjects,
          trialDays: Math.max(1, parseInt(addForm.trialDays, 10) || INDIVIDUAL_TRIAL_DAYS),
          trialAdminNotes: addForm.trialAdminNotes.trim(),
          accountSource: 'super_admin',
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Create failed');
      toast({ title: 'Member added', description: json.message });
      setAddingOpen(false);
      setAddForm(EMPTY_ADD_FORM);
      await load();
    } catch (e) {
      toast({
        title: 'Could not add member',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
    }
  };

  const deleteMember = async (m: TrialMember) => {
    const ok = await confirm({
      title: 'Delete this member?',
      description: `Delete ${m.fullName || m.email}? This permanently removes their individual trial account.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    setDeletingId(m.id);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/super-admin/trial-members/${m.id}?role=${encodeURIComponent(m.role)}`,
        { method: 'DELETE', headers: authHeaders() },
      );
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Delete failed');
      toast({ title: 'Member deleted', description: json.message });
      if (editing?.id === m.id) setEditing(null);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(memberKey(m));
        return next;
      });
      await load();
    } catch (e) {
      toast({
        title: 'Could not delete member',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setDeletingId(null);
    }
  };

  const toggleSelected = (m: TrialMember) => {
    const key = memberKey(m);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const applyDefaultsToSelected = async () => {
    if (selectedIds.size === 0) {
      toast({
        title: 'Select members first',
        description: 'Check one or more members, then apply content/AI defaults.',
        variant: 'destructive',
      });
      return;
    }
    setApplyingDefaults(true);
    try {
      const memberIds = [...selectedIds].map((key) => {
        const [role, id] = key.split(':');
        return { id, role };
      });
      const res = await fetch(`${API_BASE_URL}/api/super-admin/trial-members/apply-defaults`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          memberIds,
          trialAllowedContentTypes: batchDefaults.trialAllowedContentTypes,
          trialAllowedAiTools: batchDefaults.trialAllowedAiTools,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Apply failed');
      toast({
        title: 'Defaults applied',
        description: json.message,
      });
      setSelectedIds(new Set());
      await load();
    } catch (e) {
      toast({
        title: 'Could not apply defaults',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setApplyingDefaults(false);
    }
  };

  const toggleContentType = (type: string) => {
    setEditForm((prev) => ({
      ...prev,
      trialAllowedContentTypes: prev.trialAllowedContentTypes.includes(type)
        ? prev.trialAllowedContentTypes.filter((t) => t !== type)
        : [...prev.trialAllowedContentTypes, type],
    }));
  };

  const toggleTool = (id: string) => {
    setEditForm((prev) => ({
      ...prev,
      trialAllowedAiTools: prev.trialAllowedAiTools.includes(id)
        ? prev.trialAllowedAiTools.filter((t) => t !== id)
        : [...prev.trialAllowedAiTools, id],
    }));
  };

  const exceededCount = useMemo(
    () => members.filter((m) => m.trialExceeded).length,
    [members],
  );

  return (
    <div className="space-y-6">
      {ConfirmDialog}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 sm:text-2xl">Trial members</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Individual (B2C) teacher and student accounts. Add members here or they appear after
            self-signup. Source shows where each account came from. Unpaid trial: Vidya chat is
            limited to <strong>3 messages</strong> until payment; AI tools allow{' '}
            <strong>3 generations per 24 hours</strong> (then refresh). When you Unlock as paid they
            become <strong>Converted</strong> and also appear under{' '}
            <strong>Subscriptions → Individual</strong>.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => {
              setAddForm(EMPTY_ADD_FORM);
              setAddingOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add member
          </Button>
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Refresh
          </Button>
        </div>
      </div>

      <div className="sticky top-0 z-10 grid grid-cols-3 rounded-xl border border-slate-200 bg-slate-100/95 p-1 shadow-sm backdrop-blur" role="tablist" aria-label="Trial member role">
        {[
          { value: 'student', label: `Students${summary ? ` (${summary.students})` : ''}`, icon: UserRound },
          { value: 'teacher', label: `Teachers${summary ? ` (${summary.teachers})` : ''}`, icon: GraduationCap },
          { value: 'all', label: `All${summary ? ` (${summary.total})` : ''}`, icon: UserRound },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={roleFilter === tab.value}
              onClick={() => {
                setSelectedIds(new Set());
                setRoleFilter(tab.value);
              }}
              className={cn(
                'flex min-w-0 items-center justify-center gap-1 rounded-lg px-2 py-2.5 text-xs font-semibold transition sm:text-sm',
                roleFilter === tab.value
                  ? 'bg-white text-violet-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{tab.label}</span>
            </button>
          );
        })}
      </div>

      <IndividualPlanRatesPanel />

      {summary && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-7">
          {[
            { label: 'Total', value: summary.total },
            { label: 'Trial active', value: summary.trialActive },
            { label: 'Exceeded', value: summary.exceeded, warn: true },
            { label: 'Converted', value: summary.paid },
            {
              label: 'Conversion %',
              value: summary.conversionRate != null ? `${summary.conversionRate}%` : '—',
            },
            { label: 'Students', value: summary.students },
            { label: 'Teachers', value: summary.teachers },
          ].map((s) => (
            <Card key={s.label} className={cn(s.warn && s.value > 0 && 'border-red-200')}>
              <CardContent className="p-4">
                <p className="text-xs text-slate-500">{s.label}</p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {exceededCount > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-950">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-medium">{exceededCount} member(s) have exceeded their trial</p>
            <p className="mt-1 text-xs text-red-800">
              They are blocked from AI tools until you extend the trial, mark them paid, or they
              subscribe.
            </p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Members</CardTitle>
          <CardDescription>
            Filter by status, role, or search name / email / school / source.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                className="pl-9"
                placeholder="Search…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="trial">Trial active</SelectItem>
                <SelectItem value="exceeded">Trial exceeded</SelectItem>
                <SelectItem value="paid">Converted / Paid</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <details className="group rounded-xl border border-slate-200 bg-slate-50/80">
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-slate-900">
              Bulk content and AI-tool access
              <span className="ml-2 text-xs font-normal text-slate-500">({selectedIds.size} selected)</span>
            </summary>
          <div className="space-y-3 border-t border-slate-200 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-slate-900">
                  Apply content / AI defaults to selected
                </p>
                <p className="text-xs text-slate-500">
                  Empty lists mean all content types / all AI tools (no extra restriction). Select
                  members below, set defaults here, then apply.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                disabled={applyingDefaults || selectedIds.size === 0}
                onClick={() => void applyDefaultsToSelected()}
              >
                {applyingDefaults ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Apply to {selectedIds.size || 0} selected
              </Button>
            </div>
            <div className="flex flex-wrap gap-3">
              {(contentTypeOptions.length
                ? contentTypeOptions
                : ['Video', 'Audio', 'TextBook', 'Workbook', 'Material', 'Homework']
              ).map((type) => (
                <label key={`batch-ct-${type}`} className="flex items-center gap-2 text-xs">
                  <Checkbox
                    checked={batchDefaults.trialAllowedContentTypes.includes(type)}
                    onCheckedChange={() =>
                      setBatchDefaults((prev) => ({
                        ...prev,
                        trialAllowedContentTypes: prev.trialAllowedContentTypes.includes(type)
                          ? prev.trialAllowedContentTypes.filter((t) => t !== type)
                          : [...prev.trialAllowedContentTypes, type],
                      }))
                    }
                  />
                  {type}
                </label>
              ))}
            </div>
            <div className="flex flex-wrap gap-3 border-t border-slate-200 pt-3">
              {COMMON_AI_TOOLS.map((tool) => (
                <label key={`batch-ai-${tool.id}`} className="flex items-center gap-2 text-xs">
                  <Checkbox
                    checked={batchDefaults.trialAllowedAiTools.includes(tool.id)}
                    onCheckedChange={() =>
                      setBatchDefaults((prev) => ({
                        ...prev,
                        trialAllowedAiTools: prev.trialAllowedAiTools.includes(tool.id)
                          ? prev.trialAllowedAiTools.filter((t) => t !== tool.id)
                          : [...prev.trialAllowedAiTools, tool.id],
                      }))
                    }
                  />
                  {tool.label}
                </label>
              ))}
            </div>
          </div>
          </details>

          {loading ? (
            <div className="flex justify-center py-12 text-slate-500">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : members.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">
              No individual trial members yet. Add one above, or they appear after web self-signup.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {members.map((m) => (
                <div
                  key={`${m.role}-${m.id}`}
                  className={cn(
                    'flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between',
                    m.trialExceeded && 'bg-red-50/40',
                  )}
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <Checkbox
                      className="mt-1"
                      checked={selectedIds.has(memberKey(m))}
                      onCheckedChange={() => toggleSelected(m)}
                      aria-label={`Select ${m.fullName}`}
                    />
                    <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {m.role === 'teacher' ? (
                        <GraduationCap className="h-4 w-4 text-sky-600" />
                      ) : (
                        <UserRound className="h-4 w-4 text-orange-600" />
                      )}
                      <p className="font-medium text-slate-900">{m.fullName || '—'}</p>
                      <Badge variant="outline" className="capitalize">
                        {m.role}
                      </Badge>
                      {statusBadge(m)}
                      {!m.isActive && <Badge variant="destructive">Inactive</Badge>}
                      <Badge
                        variant="outline"
                        className="border-slate-200 bg-slate-50 text-slate-700"
                        title={m.accountSource || 'legacy'}
                      >
                        {m.accountSourceLabel || 'Self-signup · Legacy'}
                      </Badge>
                    </div>
                    <p className="truncate text-xs text-slate-600">
                      {m.email} · {m.phone || 'no phone'} · {m.schoolName || 'no school'}
                      {m.classNumber ? ` · ${m.classNumber}` : ''}
                    </p>
                    {m.createdAt && (
                      <p className="text-mini text-slate-500">
                        Joined {new Date(m.createdAt).toLocaleString()}
                      </p>
                    )}
                    {(m.trialPaymentAmount != null || m.trialPaidAt) && (
                      <p className="text-xs text-emerald-800">
                        Paid
                        {m.trialPaymentAmount != null ? ` ₹${m.trialPaymentAmount}` : ''}
                        {m.trialPaidAt
                          ? ` · ${new Date(m.trialPaidAt).toLocaleDateString()}`
                          : ''}
                        {m.trialPaymentMethod ? ` · ${m.trialPaymentMethod}` : ''}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-1 pt-1">
                      {(m.interestedCourses || []).slice(0, 4).map((c) => (
                        <Badge key={c} variant="secondary" className="text-micro">
                          {c}
                        </Badge>
                      ))}
                      {(m.iitCategories || []).map((c) => (
                        <Badge
                          key={c}
                          variant="outline"
                          className="border-sky-200 bg-sky-50 text-micro text-sky-900"
                        >
                          IIT {formatIitCategoryLabel(c)}
                        </Badge>
                      ))}
                      {(m.interestedSubjects || []).slice(0, 5).map((s) => (
                        <Badge key={s} variant="outline" className="text-micro">
                          {s}
                        </Badge>
                      ))}
                    </div>
                    {m.trialEndsAt && (
                      <p className="flex items-center gap-1 text-mini text-slate-500">
                        <Clock className="h-3 w-3" />
                        Trial ends {new Date(m.trialEndsAt).toLocaleString()}
                      </p>
                    )}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => openEdit(m)}>
                      Manage trial
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-red-200 text-red-700 hover:bg-red-50"
                      disabled={deletingId === m.id}
                      onClick={() => void deleteMember(m)}
                    >
                      {deletingId === m.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                      <span className="sr-only">Delete</span>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={addingOpen}
        onOpenChange={(open) => {
          setAddingOpen(open);
          if (!open) setAddForm(EMPTY_ADD_FORM);
        }}
      >
        <DialogContent className="flex max-h-[min(92vh,920px)] w-[min(96vw,44rem)] max-w-[min(96vw,44rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(94vw,48rem)]">
          <DialogHeader className="shrink-0 space-y-1 border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
            <DialogTitle className="text-lg sm:text-xl">Add trial member</DialogTitle>
            <DialogDescription className="text-sm text-slate-600">
              Creates an individual (B2C) account with source{' '}
              <strong>Added by Super Admin</strong>. Share the password with the member so they can
              sign in.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select
                  value={addForm.role}
                  onValueChange={(v) =>
                    setAddForm((prev) => ({ ...prev, role: v as 'student' | 'teacher' }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="student">Student</SelectItem>
                    <SelectItem value="teacher">Teacher</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Trial days</Label>
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={addForm.trialDays}
                  onChange={(e) => setAddForm((prev) => ({ ...prev, trialDays: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Full name</Label>
                <Input
                  value={addForm.fullName}
                  onChange={(e) => setAddForm((prev) => ({ ...prev, fullName: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={addForm.email}
                  onChange={(e) => setAddForm((prev) => ({ ...prev, email: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Password</Label>
                <Input
                  type="text"
                  autoComplete="new-password"
                  value={addForm.password}
                  onChange={(e) => setAddForm((prev) => ({ ...prev, password: e.target.value }))}
                  placeholder="Min 6 characters"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Phone (10 digits)</Label>
                <Input
                  value={addForm.phone}
                  onChange={(e) => setAddForm((prev) => ({ ...prev, phone: e.target.value }))}
                  inputMode="numeric"
                />
              </div>
              <div className="space-y-1.5">
                <Label>School name</Label>
                <Input
                  value={addForm.schoolName}
                  onChange={(e) => setAddForm((prev) => ({ ...prev, schoolName: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Board</Label>
                <Select
                  value={addForm.curriculumBoard}
                  onValueChange={(v) => setAddForm((prev) => ({ ...prev, curriculumBoard: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRICULUM_BOARD_OPTIONS.map((b) => (
                      <SelectItem key={b} value={b}>
                        {b}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {addForm.role === 'student' && (
                <div className="space-y-1.5">
                  <Label>Class</Label>
                  <Select
                    value={addForm.classNumber}
                    onValueChange={(v) => setAddForm((prev) => ({ ...prev, classNumber: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INDIVIDUAL_CLASS_OPTIONS.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Interested courses</Label>
              <div className="flex flex-wrap gap-3">
                {INDIVIDUAL_COURSE_OPTIONS.map((course) => (
                  <label key={course} className="flex items-center gap-2 text-xs">
                    <Checkbox
                      checked={addForm.interestedCourses.includes(course)}
                      onCheckedChange={() =>
                        setAddForm((prev) => ({
                          ...prev,
                          interestedCourses: prev.interestedCourses.includes(course)
                            ? prev.interestedCourses.filter((c) => c !== course)
                            : [...prev.interestedCourses, course],
                        }))
                      }
                    />
                    {course}
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Interested subjects</Label>
              <div className="flex flex-wrap gap-3">
                {INDIVIDUAL_SUBJECT_OPTIONS.map((subject) => (
                  <label key={subject} className="flex items-center gap-2 text-xs">
                    <Checkbox
                      checked={addForm.interestedSubjects.includes(subject)}
                      onCheckedChange={() =>
                        setAddForm((prev) => ({
                          ...prev,
                          interestedSubjects: prev.interestedSubjects.includes(subject)
                            ? prev.interestedSubjects.filter((s) => s !== subject)
                            : [...prev.interestedSubjects, subject],
                        }))
                      }
                    />
                    {subject}
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Admin notes (optional)</Label>
              <Textarea
                rows={2}
                value={addForm.trialAdminNotes}
                onChange={(e) =>
                  setAddForm((prev) => ({ ...prev, trialAdminNotes: e.target.value }))
                }
                placeholder="How / why this trial was created…"
              />
            </div>
          </div>

          <DialogFooter className="shrink-0 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:px-6">
            <Button type="button" variant="outline" onClick={() => setAddingOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={creating} onClick={() => void createMember()}>
              {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Create member
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="flex max-h-[min(92vh,920px)] w-[min(96vw,44rem)] max-w-[min(96vw,44rem)] translate-x-[-50%] translate-y-[-50%] flex-col gap-0 overflow-hidden p-0 sm:w-[min(94vw,48rem)] sm:max-w-[min(94vw,48rem)] lg:max-w-[min(94vw,48rem)]">
          <DialogHeader className="shrink-0 space-y-1 border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
            <DialogTitle className="text-lg sm:text-xl">
              Manage trial — {editing?.fullName}
            </DialogTitle>
            <DialogDescription className="text-sm text-slate-600">
              {editing?.email} · {editing?.role === 'teacher' ? 'Teacher' : 'Student'}
              {editing?.accountSourceLabel ? ` · ${editing.accountSourceLabel}` : ''}
              {editing?.trialEndsAt
                ? ` · Trial ends ${new Date(editing.trialEndsAt).toLocaleString()}`
                : ''}
            </DialogDescription>
          </DialogHeader>

          {editing && (
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
              <section className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">1. Trial length</h3>
                  <p className="mt-0.5 text-xs text-slate-600">
                    Preset buttons only fill the days field. Click Save trial length to apply.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {QUICK_TRIAL_DAYS.map((d) => {
                    const selected = String(d) === String(editForm.trialDays);
                    return (
                    <Button
                      key={d}
                      type="button"
                      size="sm"
                      variant={selected ? 'default' : 'outline'}
                      className={cn(
                        'transition-colors',
                        selected
                          ? 'bg-violet-600 text-white hover:bg-violet-700'
                          : 'bg-white text-slate-700 hover:bg-slate-100',
                      )}
                      disabled={saving}
                      onClick={() => setEditForm((p) => ({ ...p, trialDays: String(d) }))}
                    >
                      {d} days
                    </Button>
                    );
                  })}
                </div>
                <div className="flex flex-wrap gap-2 border-t border-slate-200/80 pt-3">
                  <span className="w-full text-xs font-medium text-slate-500 sm:w-auto sm:self-center">
                    Extend current trial (fills selection only):
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant={editForm.extendDays === '1' ? 'default' : 'secondary'}
                    className={cn(
                      editForm.extendDays === '1'
                        ? 'bg-violet-600 text-white hover:bg-violet-700'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200',
                    )}
                    disabled={saving}
                    onClick={() => setEditForm((p) => ({ ...p, extendDays: p.extendDays === '1' ? '' : '1' }))}
                  >
                    +1 day
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={editForm.extendDays === '7' ? 'default' : 'secondary'}
                    className={cn(
                      editForm.extendDays === '7'
                        ? 'bg-violet-600 text-white hover:bg-violet-700'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200',
                    )}
                    disabled={saving}
                    onClick={() => setEditForm((p) => ({ ...p, extendDays: p.extendDays === '7' ? '' : '7' }))}
                  >
                    +7 days
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={saving || !editForm.extendDays}
                    onClick={() => {
                      const extend = parseInt(editForm.extendDays, 10);
                      if (!Number.isFinite(extend) || extend <= 0) return;
                      void saveMember({ extendDays: extend, subscriptionStatus: 'trial' });
                    }}
                  >
                    Save extension
                  </Button>
                </div>
                <div className="grid gap-3 border-t border-slate-200/80 pt-3 sm:grid-cols-[1fr_auto] sm:items-end">
                  <div className="space-y-1.5">
                    <Label htmlFor="custom-trial-days">Days (not applied until you save)</Label>
                    <Input
                      id="custom-trial-days"
                      type="number"
                      min={1}
                      max={90}
                      className="bg-white"
                      value={editForm.trialDays}
                      onChange={(e) => setEditForm((p) => ({ ...p, trialDays: e.target.value }))}
                    />
                  </div>
                  <Button
                    type="button"
                    disabled={saving}
                    onClick={() =>
                      void saveMember({
                        resetTrial: true,
                        subscriptionStatus: 'trial',
                        trialDays: Math.max(1, parseInt(editForm.trialDays, 10) || 7),
                      })
                    }
                  >
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Save trial length
                  </Button>
                </div>
              </section>

              <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">2. Access status</h3>
                  <p className="mt-0.5 text-xs text-slate-600">
                    Controls whether the member can use the product right now.
                  </p>
                </div>
                <div className="space-y-1.5 max-w-sm">
                  <Label>Subscription status</Label>
                  <Select
                    value={editForm.subscriptionStatus}
                    onValueChange={(v) => setEditForm((p) => ({ ...p, subscriptionStatus: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="trial">Trial — access while trial is active</SelectItem>
                      <SelectItem value="active">Paid / unlocked — full access</SelectItem>
                      <SelectItem value="expired">Trial exceeded — blocked until extended/paid</SelectItem>
                      <SelectItem value="none">None</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <Checkbox
                    checked={editForm.isActive}
                    onCheckedChange={(v) =>
                      setEditForm((p) => ({ ...p, isActive: v === true }))
                    }
                  />
                  Account can log in (uncheck to deactivate)
                </label>
              </section>

              <section className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
                <div>
                  <h3 className="text-sm font-semibold text-emerald-950">3. Payment (manual)</h3>
                  <p className="mt-0.5 text-xs leading-relaxed text-emerald-900/90">
                    Optional bookkeeping when you unlock someone offline. Fill amount/reference, then
                    click <span className="font-medium">Unlock as paid</span> in the footer.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Amount (₹)</Label>
                    <Input
                      type="number"
                      min={0}
                      step="1"
                      className="bg-white"
                      value={editForm.trialPaymentAmount}
                      onChange={(e) =>
                        setEditForm((p) => ({ ...p, trialPaymentAmount: e.target.value }))
                      }
                      placeholder="e.g. 499"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Method</Label>
                    <Select
                      value={editForm.trialPaymentMethod || 'manual'}
                      onValueChange={(v) =>
                        setEditForm((p) => ({ ...p, trialPaymentMethod: v }))
                      }
                    >
                      <SelectTrigger className="bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="manual">Manual</SelectItem>
                        <SelectItem value="upi">UPI</SelectItem>
                        <SelectItem value="bank">Bank</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Paid at</Label>
                    <Input
                      type="datetime-local"
                      className="bg-white"
                      value={editForm.trialPaidAt}
                      onChange={(e) =>
                        setEditForm((p) => ({ ...p, trialPaidAt: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Reference</Label>
                    <Input
                      className="bg-white"
                      value={editForm.trialPaymentReference}
                      onChange={(e) =>
                        setEditForm((p) => ({ ...p, trialPaymentReference: e.target.value }))
                      }
                      placeholder="UPI txn / receipt #"
                    />
                  </div>
                </div>
              </section>

              <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">4. Content allowed on trial</h3>
                  <p className="mt-0.5 text-xs text-slate-600">
                    Leave all unchecked for no extra restriction (all types). Check boxes to allow
                    only those content types during trial.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {(contentTypeOptions.length
                    ? contentTypeOptions
                    : ['Video', 'Audio', 'TextBook', 'Workbook', 'Material', 'Homework']
                  ).map((type) => (
                    <label
                      key={type}
                      className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-2 text-sm text-slate-800"
                    >
                      <Checkbox
                        checked={editForm.trialAllowedContentTypes.includes(type)}
                        onCheckedChange={() => toggleContentType(type)}
                      />
                      {type}
                    </label>
                  ))}
                </div>
                {editForm.trialAllowedContentTypes.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-xs"
                    onClick={() =>
                      setEditForm((p) => ({ ...p, trialAllowedContentTypes: [] }))
                    }
                  >
                    Clear content restrictions
                  </Button>
                )}
              </section>

              <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">5. AI tools allowed on trial</h3>
                  <p className="mt-0.5 text-xs text-slate-600">
                    Leave all unchecked for all AI tools. Check tools to allow only those during
                    trial.
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {COMMON_AI_TOOLS.map((tool) => (
                    <label
                      key={tool.id}
                      className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-2 text-sm text-slate-800"
                    >
                      <Checkbox
                        checked={editForm.trialAllowedAiTools.includes(tool.id)}
                        onCheckedChange={() => toggleTool(tool.id)}
                      />
                      {tool.label}
                    </label>
                  ))}
                </div>
                {editForm.trialAllowedAiTools.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-xs"
                    onClick={() => setEditForm((p) => ({ ...p, trialAllowedAiTools: [] }))}
                  >
                    Clear AI tool restrictions
                  </Button>
                )}
              </section>

              {editing.role === 'student' && (
                <section className="space-y-3 rounded-xl border border-violet-200 bg-violet-50/40 p-4">
                  <div className="flex items-start gap-2">
                    <ClipboardList className="mt-0.5 h-4 w-4 shrink-0 text-violet-700" />
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">6. Exams allotted to this student</h3>
                      <p className="mt-0.5 text-xs text-slate-600">
                        Select the Super Admin exams this trial student may see. Saving an empty selection means no shared exams; their own generated practice exams remain available.
                      </p>
                    </div>
                  </div>
                  {examsLoading ? (
                    <div className="flex items-center gap-2 py-4 text-sm text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading exams…
                    </div>
                  ) : examOptions.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-slate-300 bg-white p-3 text-xs text-slate-500">
                      No active Super Admin exams are available to allot.
                    </p>
                  ) : (
                    <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2">
                      {examOptions.map((exam) => {
                        const checked = editForm.trialAssignedExams.includes(exam._id);
                        const classes = Array.isArray(exam.assignedClasses) && exam.assignedClasses.length
                          ? exam.assignedClasses.join(', ')
                          : exam.classNumber || 'Class not set';
                        return (
                          <label
                            key={exam._id}
                            className={cn(
                              'flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2.5 text-sm',
                              checked ? 'border-violet-300 bg-violet-50' : 'border-slate-100 hover:bg-slate-50',
                            )}
                          >
                            <Checkbox
                              className="mt-0.5"
                              checked={checked}
                              onCheckedChange={() =>
                                setEditForm((prev) => ({
                                  ...prev,
                                  trialAssignedExams: checked
                                    ? prev.trialAssignedExams.filter((id) => id !== exam._id)
                                    : [...prev.trialAssignedExams, exam._id],
                                }))
                              }
                            />
                            <span className="min-w-0">
                              <span className="block font-medium text-slate-900">{exam.title}</span>
                              <span className="block text-xs text-slate-500">
                                {classes}{exam.subject ? ` · ${exam.subject}` : ''}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-medium text-violet-900">
                      {editForm.trialAssignedExams.length} exam(s) selected
                    </p>
                    {editForm.trialAssignedExams.length > 0 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditForm((prev) => ({ ...prev, trialAssignedExams: [] }))}
                      >
                        Clear selection
                      </Button>
                    )}
                  </div>
                </section>
              )}

              <section className="space-y-1.5 rounded-xl border border-slate-200 bg-white p-4">
                <Label htmlFor="trial-admin-notes" className="text-sm font-semibold text-slate-900">
                  Admin notes
                </Label>
                <Textarea
                  id="trial-admin-notes"
                  value={editForm.trialAdminNotes}
                  onChange={(e) =>
                    setEditForm((p) => ({ ...p, trialAdminNotes: e.target.value }))
                  }
                  rows={3}
                  placeholder="Internal notes…"
                />
              </section>
            </div>
          )}

          <DialogFooter className="shrink-0 flex-col gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:flex-wrap sm:justify-end sm:gap-2 sm:px-6">
            <Button
              type="button"
              variant="destructive"
              disabled={saving}
              onClick={() => void saveMember({ subscriptionStatus: 'expired' })}
            >
              Mark trial exceeded
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-emerald-300 bg-white text-emerald-900 hover:bg-emerald-50"
              disabled={saving}
              onClick={() =>
                void saveMember({
                  subscriptionStatus: 'active',
                  ...paymentPayload(),
                  trialPaidAt: editForm.trialPaidAt
                    ? new Date(editForm.trialPaidAt).toISOString()
                    : new Date().toISOString(),
                })
              }
            >
              Unlock as paid
            </Button>
            <Button
              type="button"
              disabled={saving}
              onClick={() =>
                void saveMember({
                  resetTrial: true,
                  subscriptionStatus: 'trial',
                  trialDays: Math.max(1, parseInt(editForm.trialDays, 10) || 7),
                })
              }
            >
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save &amp; reset trial days
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={saving}
              onClick={() => void saveMember()}
            >
              Save restrictions
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
