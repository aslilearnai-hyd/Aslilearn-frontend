import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, API_BASE_URL } from '@/lib/api-config';
import type { TimetableEntry, TimetableFilters } from '@/types/timetable';
import { getAuthToken } from '@/lib/auth-utils';

function buildQueryString(filters: TimetableFilters): string {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

async function parseJson<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Request failed');
  return data;
}

export function useTimetableEntries(filters: TimetableFilters = {}, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['timetable', filters],
    enabled: options?.enabled !== false,
    queryFn: async () => {
      const res = await apiFetch(`/api/timetable${buildQueryString(filters)}`);
      const data = await parseJson<{ data: TimetableEntry[] }>(res);
      return data.data || [];
    },
  });
}

export function useCreateTimetable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<TimetableEntry> & { forceSave?: boolean }) => {
      const res = await apiFetch('/api/timetable', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      return parseJson(res);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['timetable'] }),
  });
}

export function useUpdateTimetable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...payload }: Partial<TimetableEntry> & { id: string; forceSave?: boolean }) => {
      const res = await apiFetch(`/api/timetable/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      return parseJson(res);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['timetable'] }),
  });
}

export function usePatchTimetableStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: TimetableEntry['status'] }) => {
      const res = await apiFetch(`/api/timetable/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      return parseJson(res);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['timetable'] }),
  });
}

export function useDeleteTimetable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/api/timetable/${id}`, { method: 'DELETE' });
      return parseJson(res);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['timetable'] }),
  });
}

export function useBulkDeleteTimetable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (filters: TimetableFilters) => {
      const res = await apiFetch(`/api/timetable/bulk-delete${buildQueryString(filters)}`, { method: 'POST' });
      return parseJson<{ deleted: number }>(res);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['timetable'] }),
  });
}

export function useBulkDeleteTimetableGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (groupId: string) => {
      const res = await apiFetch(`/api/timetable/group/${groupId}`, { method: 'DELETE' });
      return parseJson<{ deleted: number }>(res);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['timetable'] }),
  });
}

export function useImportTimetableCSV() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, mode }: { file: File; mode?: 'import' | 'replace' | 'merge' }) => {
      const token = getAuthToken();
      const formData = new FormData();
      formData.append('file', file);
      if (mode) formData.append('mode', mode);
      const res = await fetch(`${API_BASE_URL}/api/timetable/import/csv`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      return parseJson(res);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['timetable'] }),
  });
}

export function useRemapPeriodTimes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      classId: string;
      startDate: string;
      endDate: string;
      mappings: Array<{ fromStart: string; toStart: string; toEnd: string }>;
      breaksToAdd?: Array<{ startTime: string; endTime: string; label: string }>;
      breaksToUpdate?: Array<{ fromStart: string; toStart: string; toEnd: string; label: string }>;
      breaksToRemove?: Array<{ fromStart: string }>;
    }) => {
      const res = await apiFetch('/api/timetable/remap-periods', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      return parseJson<{
        updated: number;
        breaksCreated: number;
        breaksUpdated?: number;
        breaksRemoved?: number;
      }>(res);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['timetable'] }),
  });
}

export function useValidateTimetableCSV() {
  return useMutation({
    mutationFn: async (file: File) => {
      const token = getAuthToken();
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${API_BASE_URL}/api/timetable/validate/csv`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      return parseJson<{ imported: number; skipped: number; errors: Array<{ row: number; reason: string; status?: string }> }>(res);
    },
  });
}

export function useCopyPreviousWeek() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (targetWeekStart: string) => {
      const res = await apiFetch('/api/timetable/copy-week', {
        method: 'POST',
        body: JSON.stringify({ targetWeekStart }),
      });
      return parseJson(res);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['timetable'] }),
  });
}

export async function downloadTimetableTemplate() {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE_URL}/api/timetable/template/csv`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    let message = 'Could not download template';
    try {
      const data = await res.json();
      if (data?.message) message = data.message;
    } catch {
      /* ignore non-JSON error bodies */
    }
    throw new Error(message);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'timetable-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportTimetableCSV(filters: TimetableFilters = {}) {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE_URL}/api/timetable/export/csv${buildQueryString(filters)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'timetable-export.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export type TimetablePhoto = {
  _id: string;
  classId: string;
  classNumber: string;
  sectionId: string;
  label: string;
  imageUrl: string;
  originalFileName?: string;
  updatedAt?: string;
};

export function resolveTimetablePhotoUrl(imageUrl?: string | null): string {
  const raw = String(imageUrl || '').trim();
  if (!raw) return '';
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  // Preserve signed ?exp=&sig= query when present
  if (raw.startsWith('/')) return `${API_BASE_URL}${raw}`;
  return `${API_BASE_URL}/${raw}`;
}

export function useTimetablePhotos(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['timetable-photos'],
    enabled: options?.enabled !== false,
    queryFn: async () => {
      const res = await apiFetch('/api/timetable/photos');
      const data = await parseJson<{ data: TimetablePhoto[] }>(res);
      return data.data || [];
    },
  });
}

export function useTimetablePhoto(classId?: string, options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false;
  return useQuery({
    queryKey: ['timetable-photo', classId || 'mine'],
    enabled,
    queryFn: async () => {
      const qs = classId ? `?classId=${encodeURIComponent(classId)}` : '';
      const res = await apiFetch(`/api/timetable/photo${qs}`);
      const data = await parseJson<{ data: TimetablePhoto | null }>(res);
      return data.data || null;
    },
  });
}

export function useUploadTimetablePhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ classId, file }: { classId: string; file: File }) => {
      const token = getAuthToken();
      const form = new FormData();
      form.append('classId', classId);
      form.append('image', file);
      const res = await fetch(`${API_BASE_URL}/api/timetable/photo`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      return parseJson<{ success: boolean; message?: string; data: TimetablePhoto }>(res);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['timetable-photos'] });
      qc.invalidateQueries({ queryKey: ['timetable-photo'] });
    },
  });
}

export function useDeleteTimetablePhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (classId: string) => {
      const res = await apiFetch(`/api/timetable/photo?classId=${encodeURIComponent(classId)}`, {
        method: 'DELETE',
      });
      return parseJson(res);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['timetable-photos'] });
      qc.invalidateQueries({ queryKey: ['timetable-photo'] });
    },
  });
}

export type TeacherTimetablePhoto = {
  _id: string;
  teacherId?: string;
  label: string;
  imageUrl: string;
  originalFileName?: string;
  updatedAt?: string | null;
};

export function useMyTimetablePhoto(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['timetable-my-photo'],
    enabled: options?.enabled !== false,
    queryFn: async () => {
      const res = await apiFetch('/api/timetable/my-photo');
      const data = await parseJson<{ data: TeacherTimetablePhoto | null }>(res);
      return data.data || null;
    },
  });
}

export function useUploadMyTimetablePhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const token = getAuthToken();
      const form = new FormData();
      form.append('image', file);
      const res = await fetch(`${API_BASE_URL}/api/timetable/my-photo`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      return parseJson<{ success: boolean; message?: string; data: TeacherTimetablePhoto }>(res);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['timetable-my-photo'] });
    },
  });
}

export function useDeleteMyTimetablePhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiFetch('/api/timetable/my-photo', { method: 'DELETE' });
      return parseJson(res);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['timetable-my-photo'] });
    },
  });
}
