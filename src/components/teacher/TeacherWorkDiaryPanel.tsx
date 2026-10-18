import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { getAuthToken } from '@/lib/auth-utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { API_BASE_URL } from '@/lib/api-config';
import { Badge } from '@/components/ui/badge';
import { BookMarked, Loader2, Save, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useConfirm } from '@/hooks/use-confirm';

type TeacherClassOption = {
  id: string;
  classNumber?: string;
  section?: string;
  name?: string;
  className?: string;
};

type ClassRef = {
  classNumber?: string;
  section?: string;
  name?: string;
};

type DiaryEntry = {
  _id: string;
  forDate: string;
  title?: string;
  content: string;
  classDisplay?: string;
  classId?: string | ClassRef;
  createdAt?: string;
  updatedAt?: string;
};

function formatClassSectionLabel(c: TeacherClassOption | ClassRef) {
  if (c.classNumber) {
    const section = c.section?.trim();
    return section ? `Class ${c.classNumber} - ${section}` : `Class ${c.classNumber}`;
  }
  const named = 'className' in c ? c.className : c.name;
  return named || 'Class';
}

function formatDiaryDay(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

function entryClassLabel(entry: DiaryEntry) {
  if (entry.classDisplay?.trim()) return entry.classDisplay.trim();
  const ref = entry.classId;
  if (!ref) return null;
  if (typeof ref === 'object') return formatClassSectionLabel(ref);
  return null;
}

export function TeacherWorkDiaryPanel({ className }: { className?: string }) {
  const { confirm, ConfirmDialog } = useConfirm();
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [classes, setClasses] = useState<TeacherClassOption[]>([]);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [classId, setClassId] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loadClasses = useCallback(async () => {
    setLoadingClasses(true);
    try {
      const token = getAuthToken();
      const res = await fetch(`${API_BASE_URL}/api/teacher/classes`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        const options: TeacherClassOption[] = data.data
          .map((c: { _id?: string; id?: string; classNumber?: string; section?: string; name?: string; className?: string }) => ({
            id: String(c.id || c._id || ''),
            classNumber: c.classNumber,
            section: c.section,
            name: c.name,
            className: c.className,
          }))
          .filter((c: TeacherClassOption) => c.id)
          // Class 6-A, 6-B, 7-C, 8-A… (API order is arbitrary).
          .sort((a: TeacherClassOption, b: TeacherClassOption) => {
            const na = parseInt(String(a.classNumber || a.name || '').replace(/\D+/g, ' ').trim(), 10);
            const nb = parseInt(String(b.classNumber || b.name || '').replace(/\D+/g, ' ').trim(), 10);
            if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
            if (Number.isFinite(na) !== Number.isFinite(nb)) return Number.isFinite(na) ? -1 : 1;
            return String(a.section || '').localeCompare(String(b.section || ''), undefined, { numeric: true });
          });
        setClasses(options);
        if (options.length === 1) {
          setClassId(options[0].id);
        }
      } else {
        setClasses([]);
      }
    } catch {
      setClasses([]);
    } finally {
      setLoadingClasses(false);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = getAuthToken();
      const res = await fetch(`${API_BASE_URL}/api/teacher/work-diary?limit=40`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setEntries(data.data);
      } else {
        setEntries([]);
      }
    } catch {
      setError('Could not load diary');
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadClasses();
    load();
  }, [loadClasses, load]);

  const handleSave = async () => {
    if (!content.trim() || !classId) return;
    setSaving(true);
    setError(null);
    try {
      const token = getAuthToken();
      const res = await fetch(`${API_BASE_URL}/api/teacher/work-diary`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          date,
          classId,
          title: title.trim() || undefined,
          content: content.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.message || 'Save failed');
        return;
      }
      setTitle('');
      setContent('');
      await load();
    } catch {
      setError('Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: 'Remove diary entry?',
      description: 'Remove this diary entry?',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    try {
      const token = getAuthToken();
      await fetch(`${API_BASE_URL}/api/teacher/work-diary/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      await load();
    } catch {
      setError('Delete failed');
    }
  };

  const canSave = Boolean(content.trim() && classId && classes.length > 0);

  return (
    <div
      className={cn(
        'rounded-2xl border border-indigo-100 bg-gradient-to-br from-white to-indigo-50/40 p-5 shadow-sm sm:p-6',
        className
      )}
    >
      {ConfirmDialog}
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md ring-4 ring-indigo-600/15">
            <BookMarked className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold tracking-tight text-gray-900 sm:text-xl">
              Diary
            </h3>
            <p className="text-xs sm:text-sm text-gray-600">
              Log what you covered today — visible to your students and school admin.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4 border-b border-indigo-100/80 pb-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="diary-class">Class &amp; section</Label>
            {loadingClasses ? (
              <div className="flex h-10 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
                Loading classes…
              </div>
            ) : classes.length === 0 ? (
              <p className="rounded-xl border border-dashed border-amber-200 bg-amber-50 px-3 py-2 text-xs sm:text-sm text-amber-800">
                No classes assigned yet. Contact your administrator to assign a class before
                posting a diary entry.
              </p>
            ) : (
              <Select value={classId} onValueChange={setClassId}>
                <SelectTrigger id="diary-class" className="rounded-xl border-gray-200 bg-white">
                  <SelectValue placeholder="Select class and section" />
                </SelectTrigger>
                <SelectContent>
                  {classes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {formatClassSectionLabel(c)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="diary-date">Date</Label>
            <Input
              id="diary-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-xl border-gray-200 bg-white"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="diary-title">Title (optional)</Label>
            <Input
              id="diary-title"
              placeholder="e.g. Algebra — quadratic equations"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="rounded-xl border-gray-200 bg-white"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="diary-content">Today&apos;s work</Label>
          <Textarea
            id="diary-content"
            placeholder="Topics taught, activities, homework given, notes for parents…"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            className="rounded-xl border-gray-200 bg-white"
          />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button
            type="button"
            disabled={saving || !canSave}
            onClick={handleSave}
            className="h-11 w-full rounded-xl bg-indigo-600 font-semibold hover:bg-indigo-700 sm:w-auto"
          >
            {saving ? (
              <Loader2 className="mr-2 h-3 w-3 sm:h-4 sm:w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-3 w-3 sm:h-4 sm:w-4" />
            )}
            Save entry
          </Button>
          {error ? <p className="text-xs sm:text-sm text-red-600">{error}</p> : null}
        </div>
      </div>

      <div className="pt-5">
        <h4 className="mb-3 text-xs sm:text-sm font-semibold uppercase tracking-wide text-gray-500">
          Recent entries
        </h4>
        {loading ? (
          <div className="flex items-center justify-center py-10 text-gray-500">
            <Loader2 className="h-6 w-6 sm:h-7 sm:w-7 lg:h-8 lg:w-8 animate-spin text-indigo-500" />
          </div>
        ) : entries.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-200 bg-white/80 px-4 py-4 sm:py-6 lg:py-8 text-center text-xs sm:text-sm text-gray-500">
            No diary entries yet. Add one above — it will show for students linked to your classes and
            for your school administrator.
          </p>
        ) : (
          <ul className="max-h-[min(360px,50vh)] space-y-3 overflow-y-auto pr-1">
            {entries.map((e) => {
              const classLabel = entryClassLabel(e);
              return (
                <li
                  key={e._id}
                  className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
                          {formatDiaryDay(e.forDate)}
                        </p>
                        {classLabel ? (
                          <Badge className="rounded-md bg-indigo-600 text-xs font-medium text-white hover:bg-indigo-600">
                            {classLabel}
                          </Badge>
                        ) : null}
                      </div>
                      {e.title ? (
                        <p className="mt-1 font-semibold text-gray-900">{e.title}</p>
                      ) : null}
                      <p className="mt-2 whitespace-pre-wrap text-xs sm:text-sm text-gray-700">
                        {e.content}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 shrink-0 text-gray-400 hover:bg-red-50 hover:text-red-600"
                      onClick={() => handleDelete(e._id)}
                      aria-label="Delete entry"
                    >
                      <Trash2 className="h-3 w-3 sm:h-4 sm:w-4" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
