import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ExternalLink, FileText, Loader2 } from 'lucide-react';
import { API_BASE_URL, openProtectedFile } from '@/lib/api-config';
import { getAuthToken } from '@/lib/auth-utils';
import { filterContentsBySchoolProgram, resolveIsAsliPrepExclusive } from '@/lib/school-program';
import { fetchAuthUser } from '@/lib/auth-session';

function getSubjectName(contentItem: any): string {
  if (typeof contentItem.subjectId === 'object' && contentItem.subjectId?.name) {
    return contentItem.subjectId.name;
  }
  if (typeof contentItem.subject === 'string') {
    return contentItem.subject;
  }
  if (typeof contentItem.subject === 'object' && contentItem.subject?.name) {
    return contentItem.subject.name;
  }
  return 'Unknown Subject';
}

export function StudentHomeworkView() {
  const [homework, setHomework] = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [selectedHomework, setSelectedHomework] = useState<any | null>(null);
  const [submissionFile, setSubmissionFile] = useState<File | null>(null);
  const [submissionDescription, setSubmissionDescription] = useState('');
  const [existingLink, setExistingLink] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = getAuthToken();
        const authUser = await fetchAuthUser();
        const [contentRes, submissionsRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/student/asli-prep-content?type=Homework`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API_BASE_URL}/api/student/homework-submissions`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        if (cancelled) return;

        let items: any[] = [];
        if (contentRes.ok) {
          const json = await contentRes.json();
          const raw = json.data || json || [];
          items = filterContentsBySchoolProgram(
            Array.isArray(raw) ? raw : [],
            resolveIsAsliPrepExclusive(authUser as Parameters<typeof resolveIsAsliPrepExclusive>[0]),
          ).filter((c: any) => String(c.type || '').toLowerCase() === 'homework');
          items.sort((a, b) => {
            const aTime = a.deadline ? new Date(a.deadline).getTime() : 0;
            const bTime = b.deadline ? new Date(b.deadline).getTime() : 0;
            return aTime - bTime;
          });
        }

        if (submissionsRes.ok) {
          const json = await submissionsRes.json();
          if (json.success) setSubmissions(json.data || []);
        }

        setHomework(items);
      } catch {
        if (!cancelled) {
          setHomework([]);
          setSubmissions([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const submissionByHomeworkId = useMemo(() => {
    const map = new Map<string, any>();
    submissions.forEach((submission) => {
      const homeworkId =
        typeof submission.homeworkId === 'object'
          ? submission.homeworkId?._id
          : submission.homeworkId;
      if (homeworkId) map.set(String(homeworkId), submission);
    });
    return map;
  }, [submissions]);

  const openSubmit = (item: any) => {
    const id = String(item._id || item.id || '');
    const existing = submissionByHomeworkId.get(id);
    setSelectedHomework(item);
    setExistingLink(existing?.submissionLink || '');
    setSubmissionFile(null);
    setSubmissionDescription(existing?.description || '');
    setSubmitError('');
    setSubmitOpen(true);
  };

  const handleSubmit = async () => {
    if (!selectedHomework) return;
    if (!submissionFile) {
      setSubmitError('Please upload a submission file.');
      return;
    }

    try {
      setSubmitting(true);
      setSubmitError('');
      const token = getAuthToken();
      if (!token) {
        setSubmitError('Please login again and retry.');
        return;
      }

      const formData = new FormData();
      formData.append('file', submissionFile);
      const uploadResponse = await fetch(`${API_BASE_URL}/api/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const uploadData = await uploadResponse.json().catch(() => ({}));
      if (!uploadResponse.ok || !uploadData?.url) {
        setSubmitError(uploadData?.message || 'Failed to upload file.');
        return;
      }

      const submissionLink = String(uploadData.url).startsWith('http')
        ? String(uploadData.url)
        : `${API_BASE_URL}${String(uploadData.url).startsWith('/') ? '' : '/'}${uploadData.url}`;

      const response = await fetch(`${API_BASE_URL}/api/student/homework-submission`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          homeworkId: selectedHomework._id || selectedHomework.id,
          submissionLink,
          description: submissionDescription.trim(),
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.success) {
        setSubmitError(data?.message || 'Failed to submit homework.');
        return;
      }

      const saved = data.data;
      setSubmissions((prev) => {
        const savedId =
          typeof saved?.homeworkId === 'object' ? saved.homeworkId?._id : saved?.homeworkId;
        const savedIdStr = String(savedId || '');
        return [
          saved,
          ...prev.filter((s) => {
            const currentId =
              typeof s.homeworkId === 'object' ? s.homeworkId?._id : s.homeworkId;
            return String(currentId || '') !== savedIdStr;
          }),
        ];
      });
      setSubmitOpen(false);
      setSelectedHomework(null);
    } catch {
      setSubmitError('An unexpected error occurred while submitting.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-orange-100 bg-white shadow-sm">
        <div className="border-b border-orange-100 bg-gradient-to-r from-orange-50 to-white px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500 text-white">
              <FileText className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-lg font-bold text-slate-900 sm:text-xl">My Homework</h1>
              <p className="text-sm text-slate-600">View and manage your assignments.</p>
            </div>
          </div>
        </div>

        <div className="space-y-3 p-4 sm:p-6">
          {homework.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">No homework assigned yet.</p>
          ) : (
            homework.map((item) => {
              const id = String(item._id || item.id || '');
              const submitted = submissionByHomeworkId.has(id);
              return (
                <div
                  key={id}
                  className={`flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
                    submitted ? 'border-emerald-200 bg-emerald-50/60' : 'border-orange-100 bg-orange-50/40'
                  }`}
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">{item.title || 'Untitled Homework'}</p>
                    <p className="mt-1 text-sm text-slate-600">
                      {getSubjectName(item)}
                      {item.deadline
                        ? ` · Due ${new Date(item.deadline).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}`
                        : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge
                      className={
                        submitted
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-orange-100 text-orange-700'
                      }
                    >
                      {submitted ? 'Submitted' : 'Pending'}
                    </Badge>
                    {item.fileUrl ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => openProtectedFile(item.fileUrl, item.title || 'Homework')}
                      >
                        <ExternalLink className="mr-1.5 h-4 w-4" />
                        View
                      </Button>
                    ) : null}
                    <Button size="sm" onClick={() => openSubmit(item)}>
                      {submitted ? 'Update' : 'Submit'}
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <Dialog open={submitOpen} onOpenChange={setSubmitOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Submit Homework</DialogTitle>
            <DialogDescription>Upload your completed homework file.</DialogDescription>
          </DialogHeader>
          {selectedHomework ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-semibold text-slate-900">
                  {selectedHomework.title || 'Untitled Homework'}
                </p>
                <p className="mt-1 text-xs text-slate-600">Subject: {getSubjectName(selectedHomework)}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">Upload submission file</label>
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.jpg,.jpeg,.png,.gif"
                  onChange={(e) => setSubmissionFile(e.target.files?.[0] || null)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-orange-100 file:px-3 file:py-1 file:text-orange-700"
                />
                {!submissionFile && existingLink ? (
                  <p className="mt-1 text-xs text-slate-500">
                    A file is already submitted. Upload a new one to replace it.
                  </p>
                ) : null}
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">Description (optional)</label>
                <textarea
                  value={submissionDescription}
                  onChange={(e) => setSubmissionDescription(e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                />
              </div>
              {submitError ? <p className="text-sm text-red-600">{submitError}</p> : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubmitOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleSubmit()} disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
