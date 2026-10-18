import { useCallback, useEffect, useRef, useState } from 'react';
import { ImagePlus, Trash2, Upload, Camera, CheckCircle2, Maximize2, ExternalLink } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  resolveTimetablePhotoUrl,
  useDeleteMyTimetablePhoto,
  useMyTimetablePhoto,
  useUploadMyTimetablePhoto,
} from '@/hooks/useTimetable';

/** Teacher uploads a single personal timetable photo (not class-linked). */
export default function TeacherTimetableDashboard() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);

  const { data: photo, isLoading, refetch } = useMyTimetablePhoto();
  const uploadMutation = useUploadMyTimetablePhoto();
  const deleteMutation = useDeleteMyTimetablePhoto();

  useEffect(() => {
    return () => {
      if (previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const onPickFile = useCallback(
    (file: File | null) => {
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        toast({ title: 'Please choose an image file', variant: 'destructive' });
        return;
      }
      setPendingFile(file);
      setPreviewUrl((prev) => {
        if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev);
        return URL.createObjectURL(file);
      });
    },
    [toast],
  );

  const handleUpload = async () => {
    if (!pendingFile) {
      toast({ title: 'Choose a photo first', variant: 'destructive' });
      return;
    }
    try {
      const result = await uploadMutation.mutateAsync(pendingFile);
      toast({
        title: 'Timetable saved',
        description: result.message || 'Your timetable photo was updated',
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
    if (!photo) return;
    try {
      await deleteMutation.mutateAsync();
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
    previewUrl || resolveTimetablePhotoUrl(photo?.imageUrl);

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden border-sky-100 bg-gradient-to-br from-white via-sky-50/40 to-teal-50/30 shadow-sm">
        <CardHeader className="border-b border-sky-100/80 bg-white/70 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-100 text-sky-700 ring-1 ring-sky-200">
              <Camera className="h-4 w-4" />
            </div>
            <p className="text-sm font-medium text-slate-600">
              Upload one timetable photo for yourself — no class selection needed.
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-5 pt-5">
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

          <div className="overflow-hidden rounded-2xl border border-sky-100 bg-white shadow-inner">
            {isLoading ? (
              <div className="flex min-h-[220px] items-center justify-center text-sm text-slate-500">
                Loading…
              </div>
            ) : displayImage ? (
              <div className="relative">
                <button
                  type="button"
                  className="group block w-full cursor-zoom-in"
                  onClick={() => setViewerOpen(true)}
                  aria-label="Open timetable full size"
                >
                  <img
                    src={displayImage}
                    alt="My timetable"
                    className="mx-auto max-h-[min(70vh,720px)] w-full object-contain bg-slate-50"
                  />
                  <span className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full bg-slate-900/75 px-3 py-1 text-xs font-semibold text-white shadow">
                    <Maximize2 className="h-3.5 w-3.5" />
                    Tap to enlarge
                  </span>
                </button>
                {pendingFile ? (
                  <div className="absolute left-3 top-3 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                    Preview — click Save timetable
                  </div>
                ) : photo ? (
                  <div className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-teal-100 px-3 py-1 text-xs font-semibold text-teal-800">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Saved
                  </div>
                ) : null}
              </div>
            ) : (
              <button
                type="button"
                className="flex min-h-[220px] w-full flex-col items-center justify-center gap-2 bg-gradient-to-b from-sky-50 to-white px-4 py-10 text-center transition hover:from-sky-100/60"
                onClick={() => fileInputRef.current?.click()}
              >
                <ImagePlus className="h-10 w-10 text-sky-400" />
                <p className="text-sm font-medium text-slate-700">Upload your timetable photo</p>
                <p className="text-xs text-slate-500">
                  JPG, PNG, or WEBP · clear classroom board / printed sheet
                </p>
              </button>
            )}
          </div>

          {photo && !pendingFile ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 bg-white/80 px-3 py-2.5">
              <p className="text-xs text-slate-500">
                Last updated{' '}
                {photo.updatedAt ? new Date(photo.updatedAt).toLocaleString() : '—'}
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
      <Dialog open={viewerOpen && Boolean(displayImage)} onOpenChange={setViewerOpen}>
        <DialogContent className="flex h-[92vh] w-[96vw] max-w-[96vw] flex-col gap-2 p-3 sm:p-4">
          <div className="flex items-center justify-between gap-2 pr-8">
            <DialogTitle className="text-base">My timetable</DialogTitle>
            {displayImage ? (
              <a
                href={displayImage}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700 hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Open original
              </a>
            ) : null}
          </div>
          {/* Natural size inside a scroll box: pinch / scroll to read small cells. */}
          <div className="min-h-0 flex-1 overflow-auto rounded-lg bg-slate-50 [touch-action:pan-x_pan-y_pinch-zoom]">
            {displayImage ? <img src={displayImage} alt="My timetable full size" className="h-auto max-w-none min-w-full" /> : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
