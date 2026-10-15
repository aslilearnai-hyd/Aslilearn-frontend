import { useCallback, useEffect, useMemo, useState } from 'react';
import { Upload, AlertTriangle, Search, Link2, CheckCircle2, Building2, GraduationCap, Info, Trash2 } from 'lucide-react';
import { getAuthToken } from '@/lib/auth-utils';
import { API_BASE_URL } from '@/lib/api-config';
import { useToast } from '@/hooks/use-toast';
import { useConfirm } from '@/hooks/use-confirm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
import { cn } from '@/lib/utils';

type SubjectScore = { r: number; w: number; l: number; marks: number };

type OmrBatch = {
  _id: string;
  testNo?: string;
  testTitle: string;
  testDate?: string | null;
  rowCount: number;
  assignedCount: number;
  unassignedCount?: number;
  sourceFileName?: string;
  createdAt?: string;
};

type OmrRow = {
  _id: string;
  candidateId: string;
  candidateName?: string;
  fatherName?: string;
  group?: string;
  other?: string;
  maths?: SubjectScore;
  physics?: SubjectScore;
  chemistry?: SubjectScore;
  biology?: SubjectScore;
  totalQuestions?: number;
  attempted?: number;
  correct?: number;
  wrong?: number;
  left?: number;
  rightPct?: number;
  wrongPct?: number;
  totalMarks: number;
  percentage: number;
  testRank?: number | null;
  finalRank?: number | null;
  groupRank?: number | null;
  userId?: string | null;
  suggestedUserId?: string | null;
  student?: {
    _id: string;
    fullName: string;
    email: string;
    classNumber?: string;
    section?: string;
  } | null;
};

type StudentOption = {
  _id: string;
  fullName: string;
  email: string;
  classNumber?: string;
  section?: string;
};

type SchoolOption = {
  id: string;
  schoolName: string;
  place?: string;
};

type ClassFilterOption = {
  classNumber: string;
  section: string;
  label: string;
  count: number;
};

export type OmrResultsManagementProps = {
  variant?: 'school-admin' | 'super-admin';
};

function buildOmrApiUrl(
  apiPrefix: string,
  path: string,
  schoolAdminId?: string,
  query?: Record<string, string | undefined>,
) {
  const url = new URL(`${API_BASE_URL}${apiPrefix}${path}`);
  if (schoolAdminId) url.searchParams.set('adminId', schoolAdminId);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value) url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

function encodeClassFilter(classNumber: string, section: string) {
  return `${classNumber}::${section}`;
}

function decodeClassFilter(value: string): { classNumber: string; section: string } | null {
  if (!value || value === 'all') return null;
  const [classNumber = '', section = ''] = value.split('::');
  return { classNumber, section };
}

function authHeaders(json = false): HeadersInit {
  const token = getAuthToken();
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(json ? { 'Content-Type': 'application/json' } : {}),
  };
}

function n(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '—';
  return String(v);
}

function subjectCells(s?: SubjectScore) {
  return [n(s?.r), n(s?.w), n(s?.l), n(s?.marks)];
}

const TH =
  'sticky top-0 z-10 whitespace-nowrap border-b border-slate-200 bg-slate-50 px-2.5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-600';
const TD = 'whitespace-nowrap border-b border-slate-100 px-2.5 py-2 text-sm text-slate-800 tabular-nums';
const TD_TEXT = 'whitespace-nowrap border-b border-slate-100 px-2.5 py-2 text-sm text-slate-800';

export default function OmrResultsManagement({ variant = 'school-admin' }: OmrResultsManagementProps) {
  const isSuperAdmin = variant === 'super-admin';
  const readOnly = !isSuperAdmin;
  const apiPrefix = isSuperAdmin ? '/api/super-admin' : '/api/admin';

  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState('');
  const [schoolSearch, setSchoolSearch] = useState('');
  const [classFilter, setClassFilter] = useState('all');
  const [classOptions, setClassOptions] = useState<ClassFilterOption[]>([]);
  const [batches, setBatches] = useState<OmrBatch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [rows, setRows] = useState<OmrRow[]>([]);
  const [batchMeta, setBatchMeta] = useState<OmrBatch | null>(null);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [loading, setLoading] = useState(variant !== 'super-admin');
  const [schoolsLoading, setSchoolsLoading] = useState(isSuperAdmin);
  const [uploading, setUploading] = useState(false);
  const [savingAssign, setSavingAssign] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploadInputKey, setUploadInputKey] = useState(0);
  const [removingFile, setRemovingFile] = useState(false);
  const [search, setSearch] = useState('');
  const [assignDrafts, setAssignDrafts] = useState<Record<string, string>>({});
  const [filterUnassigned, setFilterUnassigned] = useState(false);
  const [assignRowId, setAssignRowId] = useState<string | null>(null);
  const [assignSearch, setAssignSearch] = useState('');

  const loadBatches = useCallback(async () => {
    if (isSuperAdmin && !selectedSchoolId) {
      setBatches([]);
      return [] as OmrBatch[];
    }
    const res = await fetch(
      buildOmrApiUrl(apiPrefix, '/omr-results/batches', isSuperAdmin ? selectedSchoolId : undefined),
      { headers: authHeaders() },
    );
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'Failed to load batches');
    const list = Array.isArray(data.data) ? data.data : [];
    setBatches(list);
    return list as OmrBatch[];
  }, [apiPrefix, isSuperAdmin, selectedSchoolId]);

  const loadBatchDetail = useCallback(
    async (batchId: string) => {
      const res = await fetch(
        buildOmrApiUrl(
          apiPrefix,
          `/omr-results/batches/${batchId}`,
          isSuperAdmin ? selectedSchoolId : undefined,
        ),
        { headers: authHeaders() },
      );
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to load batch');
      setBatchMeta(data.data.batch);
      const list: OmrRow[] = Array.isArray(data.data.rows) ? data.data.rows : [];
      setRows(list);
      const drafts: Record<string, string> = {};
      for (const row of list) {
        drafts[row._id] = row.userId || row.suggestedUserId || '';
      }
      setAssignDrafts(drafts);
    },
    [apiPrefix, isSuperAdmin, selectedSchoolId],
  );

  const loadClassOptions = useCallback(async () => {
    if (!isSuperAdmin || !selectedSchoolId) {
      setClassOptions([]);
      return;
    }
    const res = await fetch(
      buildOmrApiUrl(apiPrefix, '/omr-results/class-options', selectedSchoolId),
      { headers: authHeaders() },
    );
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'Failed to load classes');
    setClassOptions(Array.isArray(data.data) ? data.data : []);
  }, [apiPrefix, isSuperAdmin, selectedSchoolId]);

  const loadStudents = useCallback(async () => {
    if (isSuperAdmin && !selectedSchoolId) {
      setStudents([]);
      return;
    }

    const classParts = decodeClassFilter(classFilter);
    const res = isSuperAdmin
      ? await fetch(
          buildOmrApiUrl(apiPrefix, '/omr-results/students', selectedSchoolId, {
            classNumber: classParts?.classNumber,
            section: classParts?.section,
          }),
          { headers: authHeaders() },
        )
      : await fetch(`${API_BASE_URL}/api/admin/students`, { headers: authHeaders() });

    const data = await res.json();
    const raw = isSuperAdmin ? data?.data : data?.data || data?.students || data || [];
    const seen = new Set<string>();
    const list = (Array.isArray(raw) ? raw : [])
      .map((s: any) => ({
        _id: String(s._id || s.id || ''),
        fullName: s.fullName || s.name || '',
        email: s.email || '',
        classNumber: s.classNumber || s.assignedClass?.classNumber || '',
        section: s.section || s.assignedClass?.section || '',
      }))
      .filter((s: StudentOption) => {
        if (!s._id || seen.has(s._id)) return false;
        seen.add(s._id);
        return true;
      })
      .sort((a, b) =>
        (a.fullName || a.email).localeCompare(b.fullName || b.email, undefined, {
          sensitivity: 'base',
        }),
      );
    setStudents(list);
  }, [apiPrefix, classFilter, isSuperAdmin, selectedSchoolId]);

  const loadSchools = useCallback(async () => {
    const res = await fetch(`${API_BASE_URL}/api/super-admin/admins`, { headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to load schools');
    const rows = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
    const list = rows
      .map((row: any) => ({
        id: String(row.id || row.adminUserId || ''),
        schoolName: String(row.schoolName || row.name || 'Unnamed school').trim(),
        place: String(row.place || row.state || row.schoolDetails?.city || '').trim(),
      }))
      .filter((s: SchoolOption) => Boolean(s.id && s.schoolName))
      .sort((a: SchoolOption, b: SchoolOption) =>
        a.schoolName.localeCompare(b.schoolName, undefined, { sensitivity: 'base' }),
      );
    setSchools(list);
  }, []);

  useEffect(() => {
    if (!isSuperAdmin) return;
    setSchoolsLoading(true);
    loadSchools()
      .catch((err) => {
        toast({
          title: 'Could not load schools',
          description: err instanceof Error ? err.message : 'Request failed',
          variant: 'destructive',
        });
      })
      .finally(() => setSchoolsLoading(false));
  }, [isSuperAdmin, loadSchools, toast]);

  useEffect(() => {
    if (isSuperAdmin && !selectedSchoolId) {
      setBatches([]);
      setSelectedBatchId(null);
      setRows([]);
      setBatchMeta(null);
      setStudents([]);
      setClassOptions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    Promise.all([loadBatches(), isSuperAdmin ? loadClassOptions() : Promise.resolve()])
      .then(([list]) => {
        setSelectedBatchId((prev) => {
          if (prev && list?.some((b) => b._id === prev)) return prev;
          return list?.[0]?._id || null;
        });
      })
      .catch((err) => {
        toast({
          title: 'Could not load Results',
          description: err instanceof Error ? err.message : 'Request failed',
          variant: 'destructive',
        });
      })
      .finally(() => setLoading(false));
  }, [isSuperAdmin, selectedSchoolId, loadBatches, loadClassOptions, toast]);

  useEffect(() => {
    if (isSuperAdmin && !selectedSchoolId) return;
    loadStudents().catch((err) => {
      toast({
        title: 'Could not load students',
        description: err instanceof Error ? err.message : 'Request failed',
        variant: 'destructive',
      });
    });
  }, [isSuperAdmin, selectedSchoolId, classFilter, loadStudents, toast]);

  useEffect(() => {
    if (!selectedBatchId) {
      setRows([]);
      setBatchMeta(null);
      return;
    }
    loadBatchDetail(selectedBatchId).catch((err) => {
      toast({
        title: 'Batch load failed',
        description: err instanceof Error ? err.message : 'Request failed',
        variant: 'destructive',
      });
    });
  }, [selectedBatchId, loadBatchDetail, toast]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const classStudentIds = new Set(students.map((student) => student._id));
    const hasClassFilter = classFilter !== 'all';
    return rows.filter((r) => {
      if (filterUnassigned && r.userId) return false;
      if (hasClassFilter) {
        const mappedStudentId = String(r.userId || r.suggestedUserId || r.student?._id || '');
        if (!mappedStudentId || !classStudentIds.has(mappedStudentId)) return false;
      }
      if (!q) return true;
      const studentLabel = r.student
        ? `${r.student.fullName} ${r.student.email}`.toLowerCase()
        : '';
      return (
        r.candidateId.toLowerCase().includes(q) ||
        (r.candidateName || '').toLowerCase().includes(q) ||
        (r.fatherName || '').toLowerCase().includes(q) ||
        (r.group || '').toLowerCase().includes(q) ||
        studentLabel.includes(q)
      );
    });
  }, [rows, search, filterUnassigned, classFilter, students]);

  const unassignedCount = useMemo(
    () => filteredRows.filter((row) => !row.userId).length,
    [filteredRows],
  );

  const studentById = useMemo(() => {
    const map = new Map<string, StudentOption>();
    for (const s of students) map.set(s._id, s);
    return map;
  }, [students]);

  const formatStudentLabel = (s: StudentOption) =>
    `${s.fullName || s.email}${s.classNumber ? ` (${s.classNumber}${s.section ? `-${s.section}` : ''})` : ''}`;

  const resolveAssignValue = (rowId: string) => {
    const raw = assignDrafts[rowId] || '';
    if (raw && studentById.has(raw)) return raw;
    return '';
  };

  const assignRow = useMemo(
    () => (assignRowId ? rows.find((r) => r._id === assignRowId) || null : null),
    [assignRowId, rows],
  );

  const assignStudentMatches = useMemo(() => {
    const q = assignSearch.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) => {
      const hay = `${s.fullName} ${s.email} ${s.classNumber || ''}${s.section || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [students, assignSearch]);

  const openAssignDialog = (rowId: string) => {
    setAssignRowId(rowId);
    setAssignSearch('');
  };

  const closeAssignDialog = () => {
    setAssignRowId(null);
    setAssignSearch('');
  };

  const pickStudent = (userId: string) => {
    if (!assignRowId) return;
    setAssignDrafts((prev) => ({ ...prev, [assignRowId]: userId }));
    closeAssignDialog();
  };

  const clearAssignedStudent = () => {
    if (!assignRowId) return;
    setAssignDrafts((prev) => ({ ...prev, [assignRowId]: '' }));
    closeAssignDialog();
  };

  const filteredSchools = useMemo(() => {
    const q = schoolSearch.trim().toLowerCase();
    if (!q) return schools;
    return schools.filter((s) =>
      `${s.schoolName} ${s.place || ''}`.toLowerCase().includes(q),
    );
  }, [schoolSearch, schools]);

  const selectedSchool = useMemo(
    () => schools.find((s) => s.id === selectedSchoolId) || null,
    [schools, selectedSchoolId],
  );

  const handleUpload = async () => {
    if (!file) return;
    if (isSuperAdmin && !selectedSchoolId) {
      toast({
        title: 'Select a school first',
        description: 'Choose which school this offline score list belongs to.',
        variant: 'destructive',
      });
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (isSuperAdmin) formData.append('adminId', selectedSchoolId);
      const res = await fetch(`${API_BASE_URL}${apiPrefix}/omr-results/upload`, {
        method: 'POST',
        headers: authHeaders(),
        body: formData,
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Upload failed');
      toast({
        title: 'Offline Scores Imported',
        description: `${data.message}${
          data.data?.autoAssigned ? ` · ${data.data.autoAssigned} auto-assigned` : ''
        }`,
      });
      setUploadOpen(false);
      setFile(null);
      const list = await loadBatches();
      if (data.data?.batch?._id) setSelectedBatchId(data.data.batch._id);
      else if (list?.[0]?._id) setSelectedBatchId(list[0]._id);
    } catch (err) {
      toast({
        title: 'Upload failed',
        description: err instanceof Error ? err.message : 'Could not import CSV',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  const handleSaveAssignments = async () => {
    if (!selectedBatchId) return;
    const assignments = Object.entries(assignDrafts)
      .map(([rowId, userId]) => {
        const row = rows.find((r) => r._id === rowId);
        const current = row?.userId || '';
        const next = userId && studentById.has(userId) ? userId : '';
        if (current === next) return null;
        return { rowId, userId: next || null };
      })
      .filter(Boolean) as Array<{ rowId: string; userId: string | null }>;

    if (!assignments.length) {
      toast({ title: 'No changes', description: 'Change at least one student assignment first.' });
      return;
    }

    setSavingAssign(true);
    try {
      const res = await fetch(
        buildOmrApiUrl(
          apiPrefix,
          `/omr-results/batches/${selectedBatchId}/assign`,
          isSuperAdmin ? selectedSchoolId : undefined,
        ),
        {
          method: 'POST',
          headers: authHeaders(true),
          body: JSON.stringify({
            assignments,
            ...(isSuperAdmin ? { adminId: selectedSchoolId } : {}),
          }),
        },
      );
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Assign failed');
      toast({ title: 'Assignments saved', description: data.message });
      await Promise.all([loadBatches(), loadBatchDetail(selectedBatchId)]);
    } catch (err) {
      toast({
        title: 'Assign failed',
        description: err instanceof Error ? err.message : 'Could not save',
        variant: 'destructive',
      });
    } finally {
      setSavingAssign(false);
    }
  };

  const clearPickedUploadFile = () => {
    setFile(null);
    setUploadInputKey((k) => k + 1);
  };

  const handleRemoveSelectedFile = async () => {
    if (!selectedBatchId) {
      toast({
        title: 'No uploaded file',
        description: 'Select an uploaded test first, or use Upload CSV and Remove file before importing.',
      });
      return;
    }
    const label = batchMeta?.sourceFileName || batchMeta?.testTitle || 'this uploaded file';
    const ok = await confirm({
      title: 'Remove file?',
      description: `This permanently deletes ${label} and all of its score rows.`,
      confirmLabel: 'Remove file',
      destructive: true,
    });
    if (!ok) return;
    setRemovingFile(true);
    try {
      const res = await fetch(
        buildOmrApiUrl(
          apiPrefix,
          `/omr-results/batches/${selectedBatchId}`,
          isSuperAdmin ? selectedSchoolId : undefined,
        ),
        { method: 'DELETE', headers: authHeaders() },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.message || 'Could not remove file');
      toast({ title: 'File removed', description: data.message || 'Uploaded score list deleted.' });
      setSelectedBatchId(null);
      setRows([]);
      setBatchMeta(null);
      const list = await loadBatches();
      if (list[0]?._id) setSelectedBatchId(list[0]._id);
    } catch (err) {
      toast({
        title: 'Could not remove file',
        description: err instanceof Error ? err.message : 'Try again',
        variant: 'destructive',
      });
    } finally {
      setRemovingFile(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100" />
        ))}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100" />
        ))}
      </div>
    );
  }

  if (isSuperAdmin && !selectedSchoolId) {
    return (
      <div className="space-y-4">
        <Card className="rounded-2xl border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-violet-50 shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg text-slate-900">
              <Building2 className="h-5 w-5 text-indigo-600" />
              Upload offline results for a school
            </CardTitle>
            <p className="text-sm text-slate-600">
              Pick the school, upload the CSV from offline scanning, then map candidates to students.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={schoolSearch}
                onChange={(e) => setSchoolSearch(e.target.value)}
                placeholder="Search school by name or place…"
                className="h-11 rounded-xl border-slate-200 pl-9"
              />
            </div>
            <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white">
              {schoolsLoading ? (
                <p className="px-4 py-10 text-center text-sm text-slate-500">Loading schools…</p>
              ) : filteredSchools.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-slate-500">No schools match</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {filteredSchools.map((school) => (
                    <li key={school.id}>
                      <button
                        type="button"
                        className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-indigo-50/70"
                        onClick={() => {
                          setSelectedSchoolId(school.id);
                          setSelectedBatchId(null);
                          setClassFilter('all');
                        }}
                      >
                        <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" />
                        <span className="min-w-0">
                          <span className="block font-medium text-slate-900">{school.schoolName}</span>
                          {school.place ? (
                            <span className="block text-xs text-slate-500">{school.place}</span>
                          ) : null}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {readOnly ? (
        <div className="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Offline results are uploaded by the platform team. You can view scores and student
            mappings here — contact support if a new test needs to be added.
          </p>
        </div>
      ) : (
        <Card className="rounded-2xl border-indigo-100 bg-gradient-to-br from-indigo-50/80 via-white to-violet-50/60 shadow-none">
          <CardContent className="grid gap-4 p-4 lg:grid-cols-[1.2fr_1fr_auto] lg:items-end">
            <div className="space-y-2">
              <Label className="text-slate-600">School</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-indigo-100 text-indigo-900 hover:bg-indigo-100">
                  {selectedSchool?.schoolName || 'Selected school'}
                </Badge>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 rounded-lg text-slate-600"
                  onClick={() => {
                    setSelectedSchoolId('');
                    setSelectedBatchId(null);
                    setRows([]);
                    setBatchMeta(null);
                  }}
                >
                  Change school
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5 text-slate-600">
                <GraduationCap className="h-4 w-4" />
                Class filter (optional)
              </Label>
              <Select value={classFilter} onValueChange={setClassFilter}>
                <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-white">
                  <SelectValue placeholder="All classes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All classes</SelectItem>
                  {classOptions.map((c) => {
                    const value = encodeClassFilter(c.classNumber, c.section);
                    return (
                      <SelectItem key={value} value={value}>
                        {c.label || value} · {c.count} students
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
              <Button
                type="button"
                className="h-11 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700"
                onClick={() => setUploadOpen(true)}
              >
                <Upload className="mr-2 h-4 w-4" />
                Upload CSV
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-xl border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
                disabled={!selectedBatchId || removingFile}
                onClick={() => void handleRemoveSelectedFile()}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {removingFile ? 'Removing…' : 'Remove file'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2 min-w-0 flex-1">
          <Label className="text-slate-600">Uploaded test</Label>
          <Select
            value={selectedBatchId || undefined}
            onValueChange={(v) => setSelectedBatchId(v)}
          >
            <SelectTrigger className="h-11 max-w-xl rounded-xl border-slate-200 bg-white">
              <SelectValue placeholder="Select an uploaded Offline Score List" />
            </SelectTrigger>
            <SelectContent>
              {batches.map((b) => {
                const left = Math.max(0, (b.rowCount || 0) - (b.assignedCount || 0));
                return (
                  <SelectItem key={b._id} value={b._id}>
                    {b.testTitle}
                    {left > 0 ? ` · ${left} unassigned` : ' · all assigned'}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          {batchMeta ? (
            <p className="text-xs text-slate-500">
              Test #{batchMeta.testNo || '—'} · {batchMeta.rowCount} rows · Assigned{' '}
              {batchMeta.assignedCount}/{batchMeta.rowCount}
              {batchMeta.sourceFileName ? ` · ${batchMeta.sourceFileName}` : ''}
            </p>
          ) : (
            <p className="text-xs text-slate-500">Upload a Score List CSV From Offline Scanning.</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {!readOnly ? (
            <>
              <Button
                type="button"
                variant="outline"
                className="rounded-xl border-slate-200 lg:hidden"
                onClick={() => setUploadOpen(true)}
              >
                <Upload className="mr-2 h-4 w-4" />
                Upload CSV
              </Button>
              <Button
                type="button"
                className="rounded-xl bg-slate-900 text-white hover:bg-slate-800"
                disabled={!selectedBatchId || savingAssign}
                onClick={() => void handleSaveAssignments()}
              >
                <Link2 className="mr-2 h-4 w-4" />
                {savingAssign ? 'Saving…' : 'Save assignments'}
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <div className={cn('grid gap-3', readOnly ? 'sm:grid-cols-2' : 'sm:grid-cols-3')}>
        <Card className="rounded-xl border-slate-200 shadow-none">
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Batches</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{batches.length}</p>
          </CardContent>
        </Card>
        <Card className="rounded-xl border-slate-200 shadow-none">
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Rows in view</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{filteredRows.length}</p>
          </CardContent>
        </Card>
        {!readOnly ? (
        <Card className="rounded-xl border-slate-200 shadow-none">
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Unassigned</p>
            <p className="mt-1 text-2xl font-bold text-amber-700">{unassignedCount}</p>
          </CardContent>
        </Card>
        ) : null}
      </div>

      <Card className="rounded-xl border-slate-200 shadow-none overflow-hidden">
        <CardHeader className="space-y-3 border-b border-slate-100 bg-white py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base font-semibold text-slate-900">
              Score list
              {batchMeta?.testTitle ? (
                <span className="ml-2 font-normal text-slate-500">· {batchMeta.testTitle}</span>
              ) : null}
            </CardTitle>
            {unassignedCount > 0 && !readOnly ? (
              <Badge className="w-fit bg-amber-100 text-amber-900 hover:bg-amber-100">
                {unassignedCount} candidates need student mapping
              </Badge>
            ) : batchMeta && !readOnly ? (
              <Badge className="w-fit bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                All assigned
              </Badge>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                className="h-10 rounded-lg border-slate-200 pl-9"
                placeholder="Search candidate, name, father, student…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Button
              type="button"
              variant={filterUnassigned ? 'default' : 'outline'}
              className={cn(
                'h-10 rounded-lg',
                filterUnassigned ? 'bg-amber-600 text-white hover:bg-amber-700' : 'border-slate-200',
                readOnly && 'hidden',
              )}
              onClick={() => setFilterUnassigned((v) => !v)}
            >
              <AlertTriangle className="mr-1.5 h-4 w-4" />
              Unassigned only
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {!selectedBatchId ? (
            <div className="px-6 py-16 text-center text-sm text-slate-500">
              Upload or select a score list to view the full CSV table.
            </div>
          ) : (
            <div className="overflow-auto max-h-[min(70vh,720px)]">
              <table className="w-max min-w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className={cn(TH, 'left-0 z-20 min-w-[120px] shadow-[1px_0_0_0_#e2e8f0]')}>
                      Candidate ID
                    </th>
                    <th className={TH}>Candidate Name</th>
                    <th className={TH}>Father</th>
                    <th className={TH}>Group</th>
                    <th className={TH}>Other</th>
                    <th className={TH}>Maths R</th>
                    <th className={TH}>Maths W</th>
                    <th className={TH}>Maths L</th>
                    <th className={TH}>Maths Mk</th>
                    <th className={TH}>Physics R</th>
                    <th className={TH}>Physics W</th>
                    <th className={TH}>Physics L</th>
                    <th className={TH}>Physics Mk</th>
                    <th className={TH}>Chemistry R</th>
                    <th className={TH}>Chemistry W</th>
                    <th className={TH}>Chemistry L</th>
                    <th className={TH}>Chemistry Mk</th>
                    <th className={TH}>Biology R</th>
                    <th className={TH}>Biology W</th>
                    <th className={TH}>Biology L</th>
                    <th className={TH}>Biology Mk</th>
                    <th className={TH}>TOTQ</th>
                    <th className={TH}>ATTQ</th>
                    <th className={TH}>R</th>
                    <th className={TH}>W</th>
                    <th className={TH}>L</th>
                    <th className={TH}>R%</th>
                    <th className={TH}>W%</th>
                    <th className={TH}>Total</th>
                    <th className={TH}>Test Rank</th>
                    <th className={TH}>Final Rank</th>
                    <th className={TH}>Group Rank</th>
                    <th className={TH}>Percentage</th>
                    {!readOnly ? (
                      <th
                        className={cn(
                          TH,
                          'right-0 z-20 min-w-[220px] shadow-[-1px_0_0_0_#e2e8f0]',
                        )}
                      >
                        Assign student
                      </th>
                    ) : (
                      <th className={TH}>Student</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => {
                    const maths = subjectCells(row.maths);
                    const physics = subjectCells(row.physics);
                    const chemistry = subjectCells(row.chemistry);
                    const biology = subjectCells(row.biology);
                    return (
                      <tr key={row._id} className="hover:bg-slate-50/80">
                        <td
                          className={cn(
                            TD_TEXT,
                            'sticky left-0 z-[1] bg-white font-semibold shadow-[1px_0_0_0_#e2e8f0]',
                          )}
                        >
                          {row.candidateId}
                        </td>
                        <td className={TD_TEXT}>{row.candidateName || '—'}</td>
                        <td className={TD_TEXT}>{row.fatherName || '—'}</td>
                        <td className={TD_TEXT}>{row.group || '—'}</td>
                        <td className={TD_TEXT}>{row.other || '—'}</td>
                        {maths.map((v, i) => (
                          <td key={`m${i}`} className={TD}>
                            {v}
                          </td>
                        ))}
                        {physics.map((v, i) => (
                          <td key={`p${i}`} className={TD}>
                            {v}
                          </td>
                        ))}
                        {chemistry.map((v, i) => (
                          <td key={`c${i}`} className={TD}>
                            {v}
                          </td>
                        ))}
                        {biology.map((v, i) => (
                          <td key={`b${i}`} className={TD}>
                            {v}
                          </td>
                        ))}
                        <td className={TD}>{n(row.totalQuestions)}</td>
                        <td className={TD}>{n(row.attempted)}</td>
                        <td className={TD}>{n(row.correct)}</td>
                        <td className={TD}>{n(row.wrong)}</td>
                        <td className={TD}>{n(row.left)}</td>
                        <td className={TD}>{n(row.rightPct)}</td>
                        <td className={TD}>{n(row.wrongPct)}</td>
                        <td className={cn(TD, 'font-semibold')}>{n(row.totalMarks)}</td>
                        <td className={TD}>{n(row.testRank)}</td>
                        <td className={cn(TD, 'font-semibold')}>{n(row.finalRank)}</td>
                        <td className={TD}>{n(row.groupRank)}</td>
                        <td className={cn(TD, 'font-semibold')}>{n(row.percentage)}</td>
                        {!readOnly ? (
                          <td
                            className={cn(
                              'sticky right-0 z-[1] border-b border-slate-100 bg-white px-2 py-1.5 shadow-[-1px_0_0_0_#e2e8f0]',
                            )}
                          >
                            {(() => {
                              const assignedId = resolveAssignValue(row._id);
                              const assigned = assignedId ? studentById.get(assignedId) : null;
                              return (
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="h-9 min-w-[200px] max-w-[260px] justify-start rounded-lg border-slate-200 px-2.5 text-left text-xs font-normal"
                                  onClick={() => openAssignDialog(row._id)}
                                >
                                  <span className="truncate">
                                    {assigned ? formatStudentLabel(assigned) : 'Search student…'}
                                  </span>
                                </Button>
                              );
                            })()}
                          </td>
                        ) : (
                          <td className={TD_TEXT}>
                            {row.student
                              ? formatStudentLabel({
                                  _id: row.student._id,
                                  fullName: row.student.fullName,
                                  email: row.student.email,
                                  classNumber: row.student.classNumber,
                                  section: row.student.section,
                                })
                              : '—'}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={34} className="px-4 py-12 text-center text-sm text-slate-500">
                        No rows match this filter.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {!readOnly ? (
        <>
          <Dialog
            open={!!assignRowId}
            onOpenChange={(open) => {
              if (!open) closeAssignDialog();
            }}
          >
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Assign student</DialogTitle>
            <DialogDescription>
              {assignRow
                ? `Search and pick a school student for Candidate ID ${assignRow.candidateId}.`
                : 'Search and pick a school student.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                autoFocus
                value={assignSearch}
                onChange={(e) => setAssignSearch(e.target.value)}
                placeholder="Search by name, email, or class…"
                className="h-11 rounded-xl border-slate-200 pl-9"
              />
            </div>
            <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-200">
              {students.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-slate-500">
                  No students found for this school
                </p>
              ) : assignStudentMatches.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-slate-500">No students match</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {assignStudentMatches.map((s) => {
                    const selected =
                      assignRowId && resolveAssignValue(assignRowId) === s._id;
                    return (
                      <li key={s._id}>
                        <button
                          type="button"
                          className={cn(
                            'flex w-full items-start gap-2 px-3 py-2.5 text-left text-sm hover:bg-slate-50',
                            selected && 'bg-emerald-50',
                          )}
                          onClick={() => pickStudent(s._id)}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block font-medium text-slate-900">
                              {formatStudentLabel(s)}
                            </span>
                            {s.email ? (
                              <span className="block truncate text-xs text-slate-500">
                                {s.email}
                              </span>
                            ) : null}
                          </span>
                          {selected ? (
                            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              className="rounded-xl text-slate-600"
              onClick={clearAssignedStudent}
              disabled={!assignRowId || !resolveAssignValue(assignRowId)}
            >
              Clear assignment
            </Button>
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              onClick={closeAssignDialog}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

          <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
            <DialogContent className="max-w-md rounded-2xl">
              <DialogHeader>
                <DialogTitle>Upload Offline Score List</DialogTitle>
                <DialogDescription>
                  {selectedSchool
                    ? `Import scores for ${selectedSchool.schoolName}. CSV columns should match the offline export.`
                    : 'CSV columns should match the Offline Export. Then assign each candidate to a student in the table.'}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <Label htmlFor="omr-csv">Score List CSV / Excel</Label>
                <Input
                  key={uploadInputKey}
                  id="omr-csv"
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="rounded-xl border-slate-200"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="min-w-0 truncate text-xs text-slate-600">
                    {file ? `Selected file: ${file.name}` : 'No file selected'}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-lg border-red-200 text-red-700 hover:bg-red-50"
                    disabled={!file}
                    onClick={clearPickedUploadFile}
                  >
                    Remove file
                  </Button>
                </div>
              </div>
              <DialogFooter className="gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => setUploadOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  className="rounded-xl bg-slate-900 text-white"
                  disabled={!file || uploading}
                  onClick={() => void handleUpload()}
                >
                  {uploading ? 'Uploading…' : 'Import scores'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      ) : null}
      {ConfirmDialog}
    </div>
  );
}
