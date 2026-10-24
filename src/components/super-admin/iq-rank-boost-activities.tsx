import { useState, useEffect, useRef, useMemo } from 'react';
import { canonicalTeacherSubjectLabel, isIitTeacherSubjectTrack } from '@/lib/subject-names';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getAuthToken } from '@/lib/auth-utils';
import {
  Brain, 
  Trophy, 
  Target, 
  Plus, 
  Edit, 
  Trash2, 
  Search, 
  Filter,
  TrendingUp,
  Users,
  Award,
  Star,
  Clock,
  CheckCircle2,
  XCircle,
  Upload,
  Loader2
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { API_BASE_URL } from '@/lib/api-config';
import { useToast } from '@/hooks/use-toast';
import { useConfirm } from '@/hooks/use-confirm';
import { Skeleton } from '@/components/ui/skeleton';
import QuestionGenerator from './question-generator';

interface IQActivity {
  _id: string;
  title: string;
  description: string;
  type: 'iq-test' | 'rank-boost' | 'challenge' | 'quiz' | 'daily' | 'weekly';
  difficulty: 'easy' | 'medium' | 'hard' | 'expert';
  points: number;
  duration: number; // in minutes
  subject?: {
    _id: string;
    name: string;
  };
  board?: string;
  classNumber?: string;
  questions: number;
  isActive: boolean;
  trialOnly?: boolean;
  promptOnLogin?: boolean;
  scheduleType?: 'once' | 'daily' | 'weekly';
  scheduleDays?: number[];
  audienceType?: 'all_schools' | 'schools' | 'trial' | 'all_members' | 'specific_members';
  audienceRoles?: Array<'student' | 'teacher'>;
  targetSchools?: string[];
  targetUserIds?: string[];
  createdAt: string;
  updatedAt: string;
  participants?: number;
  averageScore?: number;
  completionRate?: number;
}

export default function IQRankBoostActivities() {
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const [activities, setActivities] = useState<IQActivity[]>([]);
  // Daily quiz bank questions per class. Cards used to add up the 5-question
  // daily set, so a 1000-question bank looked like ~30 questions in total.
  const [bankCounts, setBankCounts] = useState<Record<string, number>>({});
  const [isUploadingBank, setIsUploadingBank] = useState(false);
  const bankFileRef = useRef<HTMLInputElement | null>(null);

  const fetchBankCounts = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/super-admin/iq-rank-activities/bank-counts`, {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
      const json = await res.json().catch(() => null);
      setBankCounts(res.ok && json?.data && typeof json.data === 'object' ? json.data : {});
    } catch {
      setBankCounts({});
    }
  };

  const uploadQuestionBank = async (file: File) => {
    setIsUploadingBank(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${API_BASE_URL}/api/super-admin/iq-rank-activities/bank-upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getAuthToken()}` },
        body: form,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || 'Upload failed');
      const r = json.data || {};
      toast({
        title: 'Question bank uploaded',
        description: `${r.imported || 0} questions saved for Class ${(r.classes || []).join(', ') || '—'}${r.skipped ? `, ${r.skipped} rows skipped` : ''}.`,
      });
      setBankCounts(r.bankCounts || {});
      void fetchActivities();
    } catch (error) {
      toast({
        title: 'Upload failed',
        description: error instanceof Error ? error.message : 'Could not upload the question bank',
        variant: 'destructive',
      });
    } finally {
      setIsUploadingBank(false);
      if (bankFileRef.current) bankFileRef.current.value = '';
    }
  };
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterDifficulty, setFilterDifficulty] = useState<string>('all');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<IQActivity | null>(null);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [boards, setBoards] = useState<any[]>([]);
  const [selectedClass, setSelectedClass] = useState<number | null>(null);

  const [schools, setSchools] = useState<Array<{ _id: string; name: string }>>([]);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    type: 'quiz' as 'iq-test' | 'rank-boost' | 'challenge' | 'quiz' | 'daily' | 'weekly',
    difficulty: 'medium' as 'easy' | 'medium' | 'hard' | 'expert',
    points: 100,
    duration: 30,
    subject: '',
    board: '',
    classNumber: '',
    questions: 10,
    isActive: true,
    trialOnly: false,
    promptOnLogin: false,
    scheduleType: 'once' as 'once' | 'daily' | 'weekly',
    audienceType: 'all_schools' as 'all_schools' | 'schools' | 'trial' | 'all_members' | 'specific_members',
    audienceRoles: ['student'] as Array<'student' | 'teacher'>,
    targetSchools: [] as string[],
    targetUserIdsText: '',
  });

  // The quiz form listed every subject row of every board and class ("BIO",
  // "Biology" twice, "Biology IIT", "Biology_10", "Biology_6"…). Show one entry
  // per subject (and IIT track) for the chosen class.
  const subjectOptions = useMemo(() => {
    const cls = String(formData.classNumber || '').match(/\d+/)?.[0] || '';
    const classOf = (sub: any) =>
      String(sub?.classNumber ?? '').match(/\d+/)?.[0] || String(sub?.name || '').match(/_(\d+)$/)?.[1] || '';
    const seen = new Map<string, { _id: string; label: string }>();
    for (const sub of subjects as any[]) {
      if (!sub?._id) continue;
      const subClass = classOf(sub);
      if (cls && subClass && subClass !== cls) continue;
      const iit = isIitTeacherSubjectTrack(sub);
      const label = `${canonicalTeacherSubjectLabel(sub.name || '')}${iit ? ' · IIT / NEET' : ''}`;
      const key = label.toLowerCase();
      // Prefer the row for this exact class over a class-less one.
      if (!seen.has(key) || (cls && subClass === cls)) seen.set(key, { _id: sub._id, label });
    }
    const options = [...seen.values()].sort((a, b) => a.label.localeCompare(b.label));
    const current = (subjects as any[]).find((sub) => sub?._id === formData.subject);
    if (current && !options.some((o) => o._id === current._id)) {
      options.unshift({ _id: current._id, label: canonicalTeacherSubjectLabel(current.name || '') });
    }
    return options;
  }, [subjects, formData.classNumber, formData.subject]);


  useEffect(() => {
    void fetchBankCounts();
    fetchActivities();
    fetchSubjects();
    fetchBoards();
    fetchSchools();
  }, []);

  const fetchSchools = async () => {
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE_URL}/api/super-admin/admins`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });
      if (!response.ok) return;
      const data = await response.json();
      const list = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
      setSchools(
        list
          .map((admin: any) => ({
            _id: String(admin._id || admin.id || ''),
            name: String(admin.schoolName || admin.name || admin.email || 'School').trim(),
          }))
          .filter((s: { _id: string }) => s._id),
      );
    } catch {
      setSchools([]);
    }
  };

  const fetchActivities = async () => {
    try {
      setIsLoading(true);
      const token = getAuthToken();
      const response = await fetch(`${API_BASE_URL}/api/super-admin/iq-rank-activities`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setActivities(data.data || []);
      } else {
        // If endpoint doesn't exist yet, use empty array
        setActivities([]);
      }
    } catch (error) {
      console.error('Error fetching activities:', error);
      setActivities([]);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSubjects = async () => {
    try {
      const token = getAuthToken();
      const url = `${API_BASE_URL}/api/super-admin/subjects`;
      console.log('🌐 Fetching subjects from:', url);
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setSubjects(data.data || []);
      } else {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
        console.error('Failed to fetch subjects:', errorData);
      }
    } catch (error: any) {
      console.error('Error fetching subjects:', error);
      
      // Handle network errors specifically
      if (error instanceof TypeError) {
        if (error.message === 'Failed to fetch' || error.message.includes('ERR_NAME_NOT_RESOLVED') || error.message.includes('ERR_NETWORK')) {
          console.error('Network error: Cannot connect to server');
        }
      }
    }
  };

  const fetchBoards = async () => {
    try {
      const token = getAuthToken();
      const url = `${API_BASE_URL}/api/super-admin/boards`;
      console.log('🌐 Fetching boards from:', url);
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setBoards(data.data || []);
      } else {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
        console.error('Failed to fetch boards:', errorData);
      }
    } catch (error: any) {
      console.error('Error fetching boards:', error);
      
      // Handle network errors specifically
      if (error instanceof TypeError) {
        if (error.message === 'Failed to fetch' || error.message.includes('ERR_NAME_NOT_RESOLVED') || error.message.includes('ERR_NETWORK')) {
          console.error('Network error: Cannot connect to server');
        }
      }
    }
  };

  const buildPayload = () => {
    const targetUserIds = String(formData.targetUserIdsText || '')
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    return {
      title: formData.title,
      description: formData.description,
      type: formData.scheduleType === 'daily' ? 'daily' : formData.scheduleType === 'weekly' ? 'weekly' : 'quiz',
      difficulty: formData.difficulty,
      points: formData.points,
      duration: formData.duration,
      subject: formData.subject,
      board: formData.board,
      classNumber: formData.classNumber || 'all',
      questions: formData.questions,
      isActive: formData.isActive,
      scheduleType: formData.scheduleType,
      audienceType: formData.audienceType,
      audienceRoles: ['student'],
      targetSchools: formData.audienceType === 'schools' ? formData.targetSchools : [],
      targetUserIds: formData.audienceType === 'specific_members' ? targetUserIds : [],
      trialOnly: formData.audienceType === 'trial',
      promptOnLogin: formData.audienceType === 'trial' ? formData.promptOnLogin : false,
    };
  };

  const handleCreate = async () => {
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE_URL}/api/super-admin/iq-rank-activities`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(buildPayload())
      });

      if (response.ok) {
        toast({
          title: 'Success',
          description: 'Quiz created successfully'
        });
        setIsCreateModalOpen(false);
        resetForm();
        fetchActivities();
      } else {
        const data = await response.json();
        toast({
          title: 'Error',
          description: data.message || 'Failed to create quiz',
          variant: 'destructive'
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create quiz',
        variant: 'destructive'
      });
    }
  };

  const handleUpdate = async () => {
    if (!selectedActivity) return;

    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE_URL}/api/super-admin/iq-rank-activities/${selectedActivity._id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(buildPayload())
      });

      if (response.ok) {
        toast({
          title: 'Success',
          description: 'Quiz updated successfully'
        });
        setIsEditModalOpen(false);
        setSelectedActivity(null);
        resetForm();
        fetchActivities();
      } else {
        const data = await response.json();
        toast({
          title: 'Error',
          description: data.message || 'Failed to update quiz',
          variant: 'destructive'
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update quiz',
        variant: 'destructive'
      });
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: 'Delete this activity?',
      description: 'Are you sure you want to delete this activity?',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;

    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE_URL}/api/super-admin/iq-rank-activities/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        toast({
          title: 'Success',
          description: 'Activity deleted successfully'
        });
        fetchActivities();
      } else {
        toast({
          title: 'Error',
          description: 'Failed to delete activity',
          variant: 'destructive'
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete activity',
        variant: 'destructive'
      });
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      type: 'quiz',
      difficulty: 'medium',
      points: 100,
      duration: 30,
      subject: '',
      board: '',
      classNumber: '',
      questions: 10,
      isActive: true,
      trialOnly: false,
      promptOnLogin: false,
      scheduleType: 'once',
      audienceType: 'all_schools',
      audienceRoles: ['student'],
      targetSchools: [],
      targetUserIdsText: '',
    });
  };

  const openEditModal = (activity: IQActivity) => {
    setSelectedActivity(activity);
    setFormData({
      title: activity.title,
      description: activity.description,
      type: activity.type,
      difficulty: activity.difficulty,
      points: activity.points,
      duration: activity.duration,
      subject: activity.subject?._id || '',
      board: activity.board || '',
      classNumber: activity.classNumber || '',
      questions: activity.questions,
      isActive: activity.isActive,
      trialOnly: Boolean(activity.trialOnly),
      promptOnLogin: Boolean(activity.promptOnLogin),
      scheduleType: activity.scheduleType || (activity.type === 'daily' ? 'daily' : activity.type === 'weekly' ? 'weekly' : 'once'),
      audienceType:
        activity.audienceType ||
        (activity.trialOnly ? 'trial' : 'all_schools'),
      audienceRoles: activity.audienceRoles?.length ? activity.audienceRoles : ['student'],
      targetSchools: (activity.targetSchools || []).map(String),
      targetUserIdsText: (activity.targetUserIds || []).map(String).join(', '),
    });
    setIsEditModalOpen(true);
  };

  const filteredActivities = activities.filter(activity => {
    const matchesSearch = activity.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         activity.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === 'all' || activity.type === filterType;
    const matchesDifficulty = filterDifficulty === 'all' || activity.difficulty === filterDifficulty;
    return matchesSearch && matchesType && matchesDifficulty;
  });

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'iq-test':
        return <Brain className="w-3 h-3 sm:w-4 sm:h-4" />;
      case 'rank-boost':
        return <Trophy className="w-3 h-3 sm:w-4 sm:h-4" />;
      case 'challenge':
        return <Target className="w-3 h-3 sm:w-4 sm:h-4" />;
      case 'quiz':
        return <Award className="w-3 h-3 sm:w-4 sm:h-4" />;
      default:
        return <Star className="w-3 h-3 sm:w-4 sm:h-4" />;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'iq-test':
        return 'bg-slate-100 text-slate-700';
      case 'rank-boost':
        return 'bg-amber-100 text-amber-800';
      case 'challenge':
        return 'bg-rose-100 text-rose-800';
      case 'quiz':
        return 'bg-teal-100 text-teal-800';
      default:
        return 'bg-slate-100 text-slate-700';
    }
  };

  // If a class is selected, show the question generator
  if (selectedClass !== null) {
    return (
      <QuestionGenerator
        classNumber={selectedClass}
        onBack={() => setSelectedClass(null)}
      />
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      {ConfirmDialog}
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-700">
            Content &amp; Exams
          </p>
          <h2 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            Quiz
          </h2>
          <p className="mt-1.5 max-w-xl text-sm text-slate-600">
            Create daily or weekly quizzes for schools, trial users, or specific members.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <input
            ref={bankFileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void uploadQuestionBank(file);
            }}
          />
          <Button
            variant="outline"
            disabled={isUploadingBank}
            onClick={() => bankFileRef.current?.click()}
            title="Excel with columns Q_ID, Class, Question, Option_A–D, Correct_Answer (A–D), Difficulty, Category, Explanation, Active"
            className="border-teal-200 text-teal-800 hover:bg-teal-50"
          >
            {isUploadingBank ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
            {isUploadingBank ? 'Uploading…' : 'Upload question bank'}
          </Button>
          <Button
            onClick={() => {
              resetForm();
              setIsCreateModalOpen(true);
            }}
            className="bg-teal-600 text-white hover:bg-teal-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create quiz
          </Button>
        </div>
      </div>
      <p className="-mt-3 text-xs text-slate-500 sm:-mt-5">
        Question bank file: Excel sheet “Question Bank” with Q_ID, Class (6–10), Question, Option_A–Option_D,
        Correct_Answer (A–D), Difficulty, Category, Explanation, Active. Re-uploading updates questions by Q_ID.
      </p>

      {/* Class Cards Grid — equal height tiles */}
      <div className="grid auto-rows-fr grid-cols-[repeat(auto-fit,minmax(min(100%,250px),1fr))] gap-4">
        {[6, 7, 8, 9, 10].map((classNum) => {
          const classActivities = activities.filter(
            (a) => a.classNumber === classNum.toString() && !a.trialOnly,
          );
          const activeCount = classActivities.filter((a) => a.isActive).length;
          const totalQuestions = classActivities.reduce(
            (sum, a) => sum + (a.questions || 0),
            0,
          );
          const totalParticipants = classActivities.reduce(
            (sum, a) => sum + (a.participants || 0),
            0,
          );

          return (
            <div
              key={classNum}
              className="flex h-full min-h-[220px] flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md"
            >
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-600 text-sm font-bold text-white">
                  {classNum}
                </div>
                <div className="min-w-0">
                  <h3 className="truncate text-base font-semibold text-slate-900">
                    Class {classNum}
                  </h3>
                  <p className="text-xs text-slate-500">Quizzes</p>
                </div>
              </div>

              <div className="grid flex-1 grid-cols-2 gap-2 content-start">
                {[
                  { label: 'Activities', value: classActivities.length },
                  { label: 'Active', value: activeCount },
                  { label: 'Bank questions', value: bankCounts[String(classNum)] ?? 0 },
                  { label: 'Quiz questions', value: totalQuestions },
                  { label: 'Participants', value: totalParticipants },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-xl border border-slate-100 bg-slate-50 px-2.5 py-2"
                  >
                    <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                      {stat.label}
                    </p>
                    <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">
                      {stat.value}
                    </p>
                  </div>
                ))}
              </div>

              <Button
                className="mt-4 w-full border border-teal-200 bg-teal-50 text-teal-800 hover:bg-teal-100 hover:text-teal-900"
                variant="outline"
                onClick={() => setSelectedClass(classNum)}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Questions
              </Button>
            </div>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-4 sm:px-5">
          <h3 className="text-base font-semibold text-slate-900">All quizzes</h3>
          <p className="mt-1 text-sm text-slate-600">
            Edit trial-only flags, prompt-on-login, or delete activities. Trial quizzes appear only to
            individual trial logins (not school students).
          </p>
        </div>
        <div className="px-2 py-2 sm:px-3 sm:py-3">
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : filteredActivities.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">No activities yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-slate-600">Title</TableHead>
                    <TableHead className="text-slate-600">Class</TableHead>
                    <TableHead className="text-slate-600">Audience</TableHead>
                    <TableHead className="text-slate-600">Status</TableHead>
                    <TableHead className="text-right text-slate-600">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredActivities.map((activity) => (
                    <TableRow key={activity._id} className="border-slate-100">
                      <TableCell className="font-medium text-slate-900">
                        {activity.title}
                      </TableCell>
                      <TableCell className="text-slate-700">
                        {activity.classNumber || '—'}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {activity.trialOnly ? (
                            <Badge className="border-0 bg-amber-100 text-amber-950 hover:bg-amber-100">
                              Trial only
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="border-slate-200 text-slate-700"
                            >
                              School
                            </Badge>
                          )}
                          {activity.promptOnLogin && (
                            <Badge className="border-0 bg-teal-100 text-teal-900 hover:bg-teal-100">
                              Prompt on login
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {activity.isActive ? (
                          <Badge className="border-0 bg-emerald-100 text-emerald-900 hover:bg-emerald-100">
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-slate-600">
                            Inactive
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="space-x-2 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-slate-200"
                          onClick={() => openEditModal(activity)}
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-slate-200"
                          onClick={() => void handleDelete(activity._id)}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-red-600" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>

      {/* Create Modal */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create quiz</DialogTitle>
            <DialogDescription>
              Daily or weekly quizzes for school students, all members, or trial users — Gemini can generate questions. Teachers do not take these quizzes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Title</Label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Enter activity title"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Enter activity description"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Type</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value: any) => setFormData({ ...formData, type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="iq-test">IQ Test</SelectItem>
                    <SelectItem value="rank-boost">Rank Boost</SelectItem>
                    <SelectItem value="challenge">Challenge</SelectItem>
                    <SelectItem value="quiz">Quiz</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Difficulty</Label>
                <Select
                  value={formData.difficulty}
                  onValueChange={(value: any) => setFormData({ ...formData, difficulty: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="easy">Easy</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="hard">Hard</SelectItem>
                    <SelectItem value="expert">Expert</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <Label>Points</Label>
                <Input
                  type="number"
                  value={formData.points}
                  onChange={(e) => setFormData({ ...formData, points: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div>
                <Label>Duration (minutes)</Label>
                <Input
                  type="number"
                  value={formData.duration}
                  onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div>
                <Label>Questions</Label>
                <Input
                  type="number"
                  value={formData.questions}
                  onChange={(e) => setFormData({ ...formData, questions: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Subject (Optional)</Label>
                <Select
                  value={formData.subject || '__none__'}
                  onValueChange={(value) => setFormData({ ...formData, subject: value === '__none__' ? '' : value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select subject" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {subjectOptions.map((subject) => (
                      <SelectItem key={subject._id} value={subject._id}>
                        {subject.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Board (Optional)</Label>
                <Select
                  value={formData.board || '__none__'}
                  onValueChange={(value) => setFormData({ ...formData, board: value === '__none__' ? '' : value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select board" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {boards.map((board) => (
                      <SelectItem key={board._id || board.code} value={board.code || board._id}>
                        {board.name || board.code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Class Number (use &quot;all&quot; for every class)</Label>
              <Input
                value={formData.classNumber}
                onChange={(e) => setFormData({ ...formData, classNumber: e.target.value })}
                placeholder="e.g., 6, 7, 8, 9, 10, or all"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Schedule</Label>
                <Select
                  value={formData.scheduleType}
                  onValueChange={(value: 'once' | 'daily' | 'weekly') =>
                    setFormData({ ...formData, scheduleType: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="once">One-time</SelectItem>
                    <SelectItem value="daily">Daily quiz</SelectItem>
                    <SelectItem value="weekly">Weekly quiz</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Audience</Label>
                <Select
                  value={formData.audienceType}
                  onValueChange={(value: any) =>
                    setFormData({
                      ...formData,
                      audienceType: value,
                      trialOnly: value === 'trial',
                      promptOnLogin: value === 'trial' ? formData.promptOnLogin : false,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all_schools">All schools</SelectItem>
                    <SelectItem value="schools">Specific school(s)</SelectItem>
                    <SelectItem value="trial">Trial members</SelectItem>
                    <SelectItem value="all_members">All members</SelectItem>
                    <SelectItem value="specific_members">Specific members</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2 rounded-lg border border-sky-200 bg-sky-50/60 p-3">
              <p className="text-sm font-medium text-slate-800">Who can take this quiz</p>
              <p className="text-sm text-slate-600">
                Students and trial members only (matched by class). Teachers will not see Quiz in their portal.
              </p>
            </div>
            {formData.audienceType === 'schools' ? (
              <div className="max-h-40 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-3">
                <p className="text-sm font-medium">Select schools</p>
                {schools.length === 0 ? (
                  <p className="text-xs text-slate-500">No schools loaded.</p>
                ) : (
                  schools.map((school) => (
                    <label key={school._id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={formData.targetSchools.includes(school._id)}
                        onCheckedChange={(v) => {
                          const set = new Set(formData.targetSchools);
                          if (v === true) set.add(school._id);
                          else set.delete(school._id);
                          setFormData({ ...formData, targetSchools: Array.from(set) });
                        }}
                      />
                      <span className="truncate">{school.name}</span>
                    </label>
                  ))
                )}
              </div>
            ) : null}
            {formData.audienceType === 'specific_members' ? (
              <div>
                <Label>Member user IDs (comma-separated)</Label>
                <Textarea
                  value={formData.targetUserIdsText}
                  onChange={(e) => setFormData({ ...formData, targetUserIdsText: e.target.value })}
                  placeholder="Paste student or teacher user IDs"
                  rows={2}
                />
              </div>
            ) : null}
            {formData.audienceType === 'trial' ? (
              <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
                <p className="text-xs text-slate-600">
                  Only individual trial accounts see this quiz — not school students. Paid individuals stop receiving it.
                </p>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={formData.promptOnLogin}
                    onCheckedChange={(v) =>
                      setFormData({ ...formData, promptOnLogin: v === true })
                    }
                  />
                  Prompt on login
                </label>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} className="bg-teal-600 text-white hover:bg-teal-700">
              Create quiz
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit quiz</DialogTitle>
            <DialogDescription>
              Update quiz details, schedule, and audience
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Same form fields as create modal */}
            <div>
              <Label>Title</Label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Type</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value: any) => setFormData({ ...formData, type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="iq-test">IQ Test</SelectItem>
                    <SelectItem value="rank-boost">Rank Boost</SelectItem>
                    <SelectItem value="challenge">Challenge</SelectItem>
                    <SelectItem value="quiz">Quiz</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Difficulty</Label>
                <Select
                  value={formData.difficulty}
                  onValueChange={(value: any) => setFormData({ ...formData, difficulty: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="easy">Easy</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="hard">Hard</SelectItem>
                    <SelectItem value="expert">Expert</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <Label>Points</Label>
                <Input
                  type="number"
                  value={formData.points}
                  onChange={(e) => setFormData({ ...formData, points: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div>
                <Label>Duration (minutes)</Label>
                <Input
                  type="number"
                  value={formData.duration}
                  onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div>
                <Label>Questions</Label>
                <Input
                  type="number"
                  value={formData.questions}
                  onChange={(e) => setFormData({ ...formData, questions: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Subject (Optional)</Label>
                <Select
                  value={formData.subject || '__none__'}
                  onValueChange={(value) => setFormData({ ...formData, subject: value === '__none__' ? '' : value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select subject" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {subjectOptions.map((subject) => (
                      <SelectItem key={subject._id} value={subject._id}>
                        {subject.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Board (Optional)</Label>
                <Select
                  value={formData.board || '__none__'}
                  onValueChange={(value) => setFormData({ ...formData, board: value === '__none__' ? '' : value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select board" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {boards.map((board) => (
                      <SelectItem key={board._id || board.code} value={board.code || board._id}>
                        {board.name || board.code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Class Number (Optional)</Label>
              <Input
                value={formData.classNumber}
                onChange={(e) => setFormData({ ...formData, classNumber: e.target.value })}
                placeholder="e.g., 6–10"
              />
            </div>
            <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <Checkbox
                  checked={formData.trialOnly}
                  onCheckedChange={(v) =>
                    setFormData({
                      ...formData,
                      trialOnly: v === true,
                      promptOnLogin: v === true ? formData.promptOnLogin : false,
                    })
                  }
                />
                Trial users only
              </label>
              <p className="text-xs text-slate-600">
                When enabled, only individual trial accounts see this quiz — not school students.
                Paid individuals stop receiving it.
              </p>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={formData.promptOnLogin}
                  disabled={!formData.trialOnly}
                  onCheckedChange={(v) =>
                    setFormData({ ...formData, promptOnLogin: v === true })
                  }
                />
                Prompt on login
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdate} className="bg-teal-600 text-white hover:bg-teal-700">
              Update Activity
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
