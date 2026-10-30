import { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { API_BASE_URL } from '@/lib/api-config';
import { getAuthToken } from '@/lib/auth-utils';
import { useToast } from '@/hooks/use-toast';

/**
 * "Assign Subjects To Class" — the mobile app had this tab, web did not.
 * Same API and rules as mobile ClassesView: pick class number + section, tick
 * subjects, POST /api/admin/classes/by-id/:classId/assign-subjects.
 */

type ClassRow = {
  id: string;
  classNumber: string;
  section?: string;
  studentCount?: number;
  assignedSubjects?: Array<{ _id?: string; id?: string; name?: string }>;
};

type SubjectRow = { id: string; name: string; code?: string; variantIds: string[] };

const normalizeClassNumber = (value: string) =>
  String(value || '')
    .replace(/^class\s*/i, '')
    .trim();

const rowMatches = (row: SubjectRow, storedId: string) =>
  row.id === storedId || row.variantIds.includes(storedId);

export function AssignSubjectsToClassPanel({
  classes,
  onSaved,
}: {
  classes: ClassRow[];
  onSaved?: () => void;
}) {
  const { toast } = useToast();
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [loadingSubjects, setLoadingSubjects] = useState(true);
  const [classNumber, setClassNumber] = useState('');
  const [section, setSection] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const fetchSubjects = useCallback(async () => {
    setLoadingSubjects(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/subjects`, {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
      const data = await res.json().catch(() => null);
      const rows = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
      setSubjects(
        rows
          .map((s: any) => {
            const id = String(s._id || s.id || '');
            return {
              id,
              name: String(s.name || '').split('__deleted__')[0].trim(),
              code: s.code,
              variantIds: Array.isArray(s.variantIds) ? s.variantIds.map(String) : [id],
            };
          })
          .filter((s: SubjectRow) => s.id && s.name)
          .sort((a: SubjectRow, b: SubjectRow) => a.name.localeCompare(b.name)),
      );
    } catch {
      setSubjects([]);
    } finally {
      setLoadingSubjects(false);
    }
  }, []);

  useEffect(() => {
    void fetchSubjects();
  }, [fetchSubjects]);

  const classNumbers = useMemo(
    () =>
      [...new Set(classes.map((c) => normalizeClassNumber(c.classNumber)).filter((n) => /\d/.test(n)))].sort(
        (a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0) || a.localeCompare(b),
      ),
    [classes],
  );

  const sections = useMemo(
    () =>
      classes
        .filter((c) => normalizeClassNumber(c.classNumber) === classNumber && c.section)
        .sort((a, b) => String(a.section).localeCompare(String(b.section))),
    [classes, classNumber],
  );

  const target = useMemo(
    () =>
      classes.find(
        (c) =>
          normalizeClassNumber(c.classNumber) === classNumber &&
          String(c.section || '').toUpperCase() === section.toUpperCase(),
      ),
    [classes, classNumber, section],
  );

  // Pre-tick the subjects already on the chosen section.
  useEffect(() => {
    if (!target) {
      setSelectedIds([]);
      return;
    }
    const resolved = new Set<string>();
    for (const subj of target.assignedSubjects || []) {
      const stored = String(subj.id || subj._id || '');
      const row =
        subjects.find((s) => stored && rowMatches(s, stored)) ||
        subjects.find((s) => subj.name && s.name.toLowerCase() === String(subj.name).toLowerCase());
      if (row) resolved.add(row.id);
    }
    setSelectedIds([...resolved]);
  }, [target, subjects]);

  const toggle = (id: string, on: boolean) => {
    setSelectedIds((prev) => (on ? [...new Set([...prev, id])] : prev.filter((x) => x !== id)));
  };

  const save = async () => {
    if (!target?.id) {
      toast({ title: 'Select a class and section', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const subjectIds = selectedIds.filter((id) => /^[a-f\d]{24}$/i.test(id));
      const res = await fetch(
        `${API_BASE_URL}/api/admin/classes/by-id/${encodeURIComponent(target.id)}/assign-subjects`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${getAuthToken()}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ subjectIds }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.success === false) throw new Error(data?.message || 'Failed to assign subjects');
      toast({
        title: 'Subjects saved',
        description: data?.message || `Class ${classNumber} Section ${section}`,
      });
      onSaved?.();
      void fetchSubjects();
    } catch (err) {
      toast({
        title: 'Could not assign subjects',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <h3 className="flex items-center gap-2 text-lg font-bold text-slate-900">
        <BookOpen className="h-5 w-5 text-violet-600" />
        Assign Subjects To Class
      </h3>
      <p className="mt-1 text-sm text-slate-500">Select a class, section, and the subjects for that section only.</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Class number *</Label>
          <Select
            value={classNumber}
            onValueChange={(v) => {
              setClassNumber(v);
              setSection('');
            }}
          >
            <SelectTrigger className="bg-white">
              <SelectValue placeholder="Choose a class number" />
            </SelectTrigger>
            <SelectContent>
              {classNumbers.map((n) => (
                <SelectItem key={n} value={n}>
                  Class {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Section *</Label>
          <Select value={section} onValueChange={setSection} disabled={!classNumber}>
            <SelectTrigger className="bg-white">
              <SelectValue placeholder={classNumber ? 'Choose a section' : 'Select class first'} />
            </SelectTrigger>
            <SelectContent>
              {sections.map((c) => (
                <SelectItem key={c.id} value={String(c.section)}>
                  Section {c.section} ({c.studentCount || 0} students)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {target ? (
        <p className="mt-3 text-sm text-violet-700">
          Subjects will be assigned to Class {classNumber} Section {section} only.
        </p>
      ) : null}

      <div className="mt-4">
        <Label>Select subjects *</Label>
        {loadingSubjects ? (
          <div className="mt-3 flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading subjects…
          </div>
        ) : subjects.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No subjects available.</p>
        ) : (
          <div className="mt-3 grid max-h-80 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
            {subjects.map((s) => {
              const checked = selectedIds.includes(s.id);
              return (
                <label
                  key={s.id}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
                    checked ? 'border-violet-300 bg-violet-50' : 'border-slate-200 bg-white hover:bg-slate-50'
                  } ${!target ? 'pointer-events-none opacity-50' : ''}`}
                >
                  <Checkbox checked={checked} onCheckedChange={(v) => toggle(s.id, v === true)} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-slate-900">{s.name}</span>
                    {s.code ? <span className="block text-xs text-slate-500">Code: {s.code}</span> : null}
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={saving}
          onClick={() => {
            setClassNumber('');
            setSection('');
            setSelectedIds([]);
          }}
        >
          Clear
        </Button>
        <Button type="button" disabled={!target || saving} onClick={save}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Save subjects
        </Button>
      </div>
    </div>
  );
}
