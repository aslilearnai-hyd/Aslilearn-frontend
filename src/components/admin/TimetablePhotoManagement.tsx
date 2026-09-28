import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ImagePlus, Trash2, Upload, Camera, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { API_BASE_URL } from '@/lib/api-config';
import { getAuthToken } from '@/lib/auth-utils';
import {
  resolveTimetablePhotoUrl,
  useDeleteTimetablePhoto,
  useTimetablePhotos,
  useUploadTimetablePhoto,
  type TimetablePhoto,
} from '@/hooks/useTimetable';

type ClassOption = {
  _id: string;
  classNumber: string;
  section: string;
};

function classLabel(c: Pick<ClassOption, 'classNumber' | 'section'>): string {
  return `${String(c.classNumber || '').trim()}${String(c.section || '').trim().toUpperCase()}`;
}

type Props = {
  /** When true, load classes from teacher endpoint instead of admin. */
  forTeacher?: boolean;
};

export default function TimetablePhotoManagement({ forTeacher = false }: Props) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const { data: photos = [], isLoading: loadingPhotos, refetch } = useTimetablePhotos();
  const uploadMutation = useUploadTimetablePhoto();
  const deleteMutation = useDeleteTimetablePhoto();

  const photoByClassId = useMemo(() => {
    const map = new Map<string, TimetablePhoto>();
    photos.forEach((p) => map.set(String(p.classId), p));
    return map;
  }, [photos]);

  const selectedClass = useMemo(
    () => classes.find((c) => c._id === selectedClassId) || null,
    [classes, selectedClassId]
  );

  const existingPhoto = selectedClassId ? photoByClassId.get(selectedClassId) : undefined;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingClasses(true);
        const token = getAuthToken();
        const res = await fetch(`${API_BASE_URL}/api/timetable/photo-classes`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const json = await res.json();
        const rows = Array.isArray(json?.data) ? json.data : [];
        const normalized: ClassOption[] = rows
          .map((row: any) => ({
            _id: String(row._id || row.id || ''),
            classNumber: String(row.classNumber || row.name || '').trim(),
            section: String(row.section || '').trim().toUpperCase(),
          }))
          .filter((row: ClassOption) => row._id);
        normalized.sort((a, b) =>
          classLabel(a).localeCompare(classLabel(b), undefined, { numeric: true })
        );
        if (!cancelled) {
          setClasses(normalized);
          if (!selectedClassId && normalized[0]?._id) {
            setSelectedClassId(normalized[0]._id);
          }
        }
      } catch {
        if (!cancelled) setClasses([]);
      } finally {
        if (!cancelled) setLoadingClasses(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once / when role changes
  }, [forTeacher]);

  useEffect(() => {
    setPendingFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [selectedClassId]);

  const onPickFile = useCallback((file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Please choose an image file', variant: 'destructive' });
      return;
    }
    setPendingFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  }, [toast]);

  const handleUpload = async () => {
    if (!selectedClassId || !pendingFile) {
      toast({ title: 'Select a class and photo first', variant: 'destructive' });
      return;
    }
    try {
      const result = await uploadMutation.mutateAsync({
        classId: selectedClassId,
        file: pendingFile,
      });
      toast({
        title: 'Timetable photo saved',
        description: result.message || `${classLabel(selectedClass || { classNumber: '', section: '' })} updated`,
      });
      setPendingFile(null);
      setPreviewUrl(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      refetch();
    } catch (error: any) {
      toast({
        title: 'Upload failed',
        description: error?.message || 'Could not save timetable photo',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async () => {
    if (!selectedClassId || !existingPhoto) return;
    try {
      await deleteMutation.mutateAsync(selectedClassId);
      toast({ title: 'Timetable photo removed' });
      refetch();
    } catch (error: any) {
      toast({
        title: 'Delete failed',
        description: error?.message || 'Could not remove photo',
        variant: 'destructive',
      });
    }
  };

  const displayImage =
    previewUrl || resolveTimetablePhotoUrl(existingPhoto?.imageUrl);

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden border-sky-100 bg-gradient-to-br from-white via-sky-50/40 to-teal-50/30 shadow-sm">
        <CardHeader className="border-b border-sky-100/80 bg-white/70 pb-4">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-100 text-sky-700 ring-1 ring-sky-200">
              <Camera className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-xl font-bold text-slate-900">Class Timetable Photos</CardTitle>
              <p className="mt-1 text-sm text-slate-600">
                Upload one photo per class &amp; section (example: <span className="font-semibold">6A</span>).
                Students will see this image — no period form needed.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5 pt-5">
          <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="space-y-2">
              <Label className="text-slate-700">Class &amp; section</Label>
              <Select
                value={selectedClassId}
                onValueChange={setSelectedClassId}
                disabled={loadingClasses || classes.length === 0}
              >
                <SelectTrigger className="h-11 rounded-xl border-sky-200 bg-white">
                  <SelectValue placeholder={loadingClasses ? 'Loading classes…' : 'Select class'} />
                </SelectTrigger>
                <SelectContent>
                  {classes.map((c) => {
                    const hasPhoto = photoByClassId.has(c._id);
                    return (
                      <SelectItem key={c._id} value={c._id}>
                        {classLabel(c)}
                        {hasPhoto ? ' · photo ready' : ''}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => onPickFile(e.target.files?.[0] || null)}
              />
              <Button
                type="button"
                variant="outline"
                className="rounded-xl border-sky-200"
                disabled={!selectedClassId}
                onClick={() => fileInputRef.current?.click()}
              >
                <ImagePlus className="mr-2 h-4 w-4" />
                Choose photo
              </Button>
              <Button
                type="button"
                className="rounded-xl bg-sky-500 text-white hover:bg-sky-600"
                disabled={!pendingFile || uploadMutation.isPending}
                onClick={() => void handleUpload()}
              >
                <Upload className="mr-2 h-4 w-4" />
                {uploadMutation.isPending ? 'Saving…' : 'Save timetable'}
              </Button>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-sky-100 bg-white shadow-inner">
            {displayImage ? (
              <div className="relative">
                <img
                  src={displayImage}
                  alt={selectedClass ? `${classLabel(selectedClass)} timetable` : 'Timetable'}
                  className="mx-auto max-h-[min(70vh,720px)] w-full object-contain bg-slate-50"
                />
                {pendingFile ? (
                  <div className="absolute left-3 top-3 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                    Preview — click Save timetable
                  </div>
                ) : existingPhoto ? (
                  <div className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-teal-100 px-3 py-1 text-xs font-semibold text-teal-800">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {selectedClass ? `${classLabel(selectedClass)} saved` : 'Saved'}
                  </div>
                ) : null}
              </div>
            ) : (
              <button
                type="button"
                className="flex min-h-[220px] w-full flex-col items-center justify-center gap-2 bg-gradient-to-b from-sky-50 to-white px-4 py-10 text-center transition hover:from-sky-100/60"
                disabled={!selectedClassId}
                onClick={() => fileInputRef.current?.click()}
              >
                <ImagePlus className="h-10 w-10 text-sky-400" />
                <p className="text-sm font-medium text-slate-700">
                  {selectedClass
                    ? `Upload ${classLabel(selectedClass)} timetable photo`
                    : 'Select a class, then upload a photo'}
                </p>
                <p className="text-xs text-slate-500">JPG, PNG, or WEBP · clear classroom board / printed sheet</p>
              </button>
            )}
          </div>

          {existingPhoto && !pendingFile ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 bg-white/80 px-3 py-2.5">
              <p className="text-xs text-slate-500">
                Last updated{' '}
                {existingPhoto.updatedAt
                  ? new Date(existingPhoto.updatedAt).toLocaleString()
                  : '—'}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-lg border-rose-200 text-rose-600 hover:bg-rose-50"
                disabled={deleteMutation.isPending}
                onClick={() => void handleDelete()}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Remove photo
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-slate-100 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold text-slate-800">Uploaded classes</CardTitle>
          <p className="text-xs text-slate-500">Quick view of which class/section photos are ready</p>
        </CardHeader>
        <CardContent>
          {loadingPhotos ? (
            <div className="h-16 animate-pulse rounded-xl bg-slate-100" />
          ) : photos.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">No timetable photos uploaded yet.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {photos.map((photo) => (
                <button
                  key={photo._id}
                  type="button"
                  onClick={() => setSelectedClassId(photo.classId)}
                  className={`overflow-hidden rounded-xl border text-left transition hover:-translate-y-0.5 hover:shadow-md ${
                    selectedClassId === photo.classId
                      ? 'border-sky-400 ring-2 ring-sky-200'
                      : 'border-slate-150 border-slate-200'
                  }`}
                >
                  <div className="aspect-[4/3] bg-slate-50">
                    <img
                      src={resolveTimetablePhotoUrl(photo.imageUrl)}
                      alt={photo.label}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="px-2.5 py-2">
                    <p className="text-sm font-semibold text-slate-800">{photo.label}</p>
                    <p className="text-micro text-slate-500">Tap to manage</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
