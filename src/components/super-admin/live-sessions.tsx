import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Video, Plus, Trash2, Search, Radio, School, Pencil } from 'lucide-react';
import { API_BASE_URL } from '@/lib/api-config';
import { useToast } from '@/hooks/use-toast';
import { useConfirm } from '@/hooks/use-confirm';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { getAuthToken } from '@/lib/auth-utils';

type SchoolOption = {
  id: string;
  schoolName: string;
  name?: string;
};

type LiveSessionRow = {
  _id: string;
  title: string;
  description?: string;
  youtubeUrl?: string;
  visibility: 'teacher' | 'student' | 'both';
  status: string;
  viewerCount?: number;
  joinCount?: number;
  adminId?: { _id: string; schoolName?: string; fullName?: string };
  schoolAdminIds?: Array<{ _id: string; schoolName?: string; fullName?: string }>;
  schoolNames?: string[];
  createdAt: string;
};

const VISIBILITY_LABELS: Record<string, string> = {
  teacher: 'Teachers only',
  student: 'Students only',
  both: 'Teachers & Students',
};

function isMongoObjectId(value: string): boolean {
  return /^[a-f\d]{24}$/i.test(value);
}

function mapSchoolOption(a: Record<string, unknown>): SchoolOption | null {
  const adminId = String(a.adminUserId || a.id || a._id || '').trim();
  if (!adminId || !isMongoObjectId(adminId)) return null;
  return {
    id: adminId,
    schoolName: String(a.schoolName || a.name || 'Unnamed school'),
    name: a.name ? String(a.name) : undefined,
  };
}

function sessionSchoolNames(session: LiveSessionRow): string[] {
  const names: string[] = [];
  if (session.schoolNames?.length) {
    names.push(...session.schoolNames);
  } else if (session.schoolAdminIds?.length) {
    for (const school of session.schoolAdminIds) {
      if (school?.schoolName) names.push(school.schoolName);
    }
  } else if (session.adminId?.schoolName) {
    names.push(session.adminId.schoolName);
  }
  return [...new Set(names.filter(Boolean))];
}

function SchoolsCell({ names }: { names: string[] }) {
  if (names.length === 0) {
    return <span className="text-sm text-gray-400">—</span>;
  }

  const preview = names.slice(0, 2).join(', ');
  const extra = names.length - 2;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="max-w-[220px] rounded-lg border border-transparent px-1 py-0.5 text-left transition-colors hover:border-sky-200 hover:bg-sky-50/60"
        >
          <Badge variant="secondary" className="text-xs font-medium">
            {names.length} school{names.length === 1 ? '' : 's'}
          </Badge>
          <p className="mt-1 text-xs text-gray-600 line-clamp-2">
            {preview}
            {extra > 0 ? ` +${extra} more` : ''}
          </p>
          <p className="mt-0.5 text-mini font-medium text-sky-600">View all</p>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <div className="border-b px-3 py-2">
          <p className="text-sm font-semibold text-gray-900">
            {names.length} school{names.length === 1 ? '' : 's'} assigned
          </p>
        </div>
        <ul className="max-h-64 overflow-y-auto py-1">
          {names.map((name) => (
            <li
              key={name}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700"
            >
              <School className="h-3.5 w-3.5 shrink-0 text-gray-400" />
              <span className="min-w-0 break-words">{name}</span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

export default function LiveSessions() {
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const [sessions, setSessions] = useState<LiveSessionRow[]>([]);
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [schoolPickerSearch, setSchoolPickerSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({
    title: '',
    youtubeUrl: '',
    schoolAdminIds: [] as string[],
    visibility: 'both' as 'teacher' | 'student' | 'both',
    description: '',
  });

  useEffect(() => {
    fetchSessions();
    fetchSchools();
  }, []);

  const authHeaders = () => {
    const token = getAuthToken();
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  };

  const fetchSessions = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/super-admin/streams`, {
        headers: authHeaders(),
      });
      if (response.ok) {
        const data = await response.json();
        setSessions(data.data || data || []);
      } else {
        toast({
          title: 'Error',
          description: 'Failed to fetch live sessions',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error fetching sessions:', error);
      toast({
        title: 'Error',
        description: 'An error occurred while fetching sessions',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSchools = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/super-admin/admins?lite=1`, {
        headers: authHeaders(),
      });
      if (response.ok) {
        const data = await response.json();
        const list = data.data || data.admins || data || [];
        setSchools(
          list
            .map((a: Record<string, unknown>) => mapSchoolOption(a))
            .filter((school: SchoolOption | null): school is SchoolOption => school !== null)
        );
      }
    } catch (error) {
      console.error('Error fetching schools:', error);
    }
  };

  const filteredSchoolOptions = useMemo(() => {
    const q = schoolPickerSearch.trim().toLowerCase();
    if (!q) return schools;
    return schools.filter((school) => school.schoolName.toLowerCase().includes(q));
  }, [schools, schoolPickerSearch]);

  const toggleSchool = (schoolId: string, checked: boolean) => {
    setFormData((prev) => {
      const next = new Set(prev.schoolAdminIds);
      if (checked) next.add(schoolId);
      else next.delete(schoolId);
      return { ...prev, schoolAdminIds: [...next] };
    });
  };

  const selectAllSchools = () => {
    setFormData((prev) => ({
      ...prev,
      schoolAdminIds: filteredSchoolOptions.map((s) => s.id),
    }));
  };

  const clearSchools = () => {
    setFormData((prev) => ({ ...prev, schoolAdminIds: [] }));
  };

  const resetForm = () => {
    setSchoolPickerSearch('');
    setEditingSessionId(null);
    setFormData({
      title: '',
      youtubeUrl: '',
      schoolAdminIds: [],
      visibility: 'both',
      description: '',
    });
  };

  const openCreateModal = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const openEditModal = (session: LiveSessionRow) => {
    const schoolIds =
      session.schoolAdminIds?.map((s) => String(s._id)).filter(Boolean) ||
      (session.adminId?._id ? [String(session.adminId._id)] : []);

    setEditingSessionId(session._id);
    setSchoolPickerSearch('');
    setFormData({
      title: session.title || '',
      youtubeUrl: session.youtubeUrl || '',
      schoolAdminIds: schoolIds,
      visibility: session.visibility || 'both',
      description: session.description || '',
    });
    setIsModalOpen(true);
  };

  const handleModalOpenChange = (open: boolean) => {
    setIsModalOpen(open);
    if (!open) resetForm();
  };

  const handleSave = async () => {
    if (!formData.title.trim() || !formData.youtubeUrl.trim() || formData.schoolAdminIds.length === 0) {
      toast({
        title: 'Validation Error',
        description: 'Session name, YouTube link, and at least one school are required',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsSaving(true);
      const payload = {
        title: formData.title.trim(),
        youtubeUrl: formData.youtubeUrl.trim(),
        schoolAdminIds: formData.schoolAdminIds,
        visibility: formData.visibility,
        description: formData.description.trim(),
        status: 'live',
      };

      const response = await fetch(
        editingSessionId
          ? `${API_BASE_URL}/api/super-admin/live-sessions/${editingSessionId}`
          : `${API_BASE_URL}/api/super-admin/live-sessions`,
        {
          method: editingSessionId ? 'PUT' : 'POST',
          headers: authHeaders(),
          body: JSON.stringify(payload),
        }
      );

      const result = await response.json();
      if (response.ok) {
        const count = formData.schoolAdminIds.length;
        toast({
          title: editingSessionId ? 'Updated' : 'Saved',
          description: editingSessionId
            ? 'Live session updated'
            : `Live session is visible in Edu OTT for ${count} school${count === 1 ? '' : 's'}`,
        });
        setIsModalOpen(false);
        resetForm();
        fetchSessions();
      } else {
        toast({
          title: 'Error',
          description: result.message || `Failed to ${editingSessionId ? 'update' : 'save'} live session`,
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error saving session:', error);
      toast({
        title: 'Error',
        description: 'An error occurred while saving the session',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (sessionId: string) => {
    const ok = await confirm({
      title: 'Remove live session?',
      description: 'Remove this live session from Edu OTT?',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/streams/${sessionId}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (response.ok) {
        toast({ title: 'Removed', description: 'Live session deleted' });
        fetchSessions();
      } else {
        const payload = await response.json();
        toast({
          title: 'Error',
          description: payload.message || 'Failed to delete session',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error deleting session:', error);
      toast({
        title: 'Error',
        description: 'An error occurred while deleting session',
        variant: 'destructive',
      });
    }
  };

  const filteredSessions = sessions.filter((session) => {
    const names = sessionSchoolNames(session).join(' ');
    const haystack = `${session.title} ${session.description || ''} ${names}`.toLowerCase();
    return haystack.includes(searchTerm.toLowerCase());
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4 lg:space-y-6">
      {ConfirmDialog}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Edu OTT — Live Sessions</h1>
          <p className="text-gray-600 mt-1">
            Paste an unlisted YouTube Live link. Assign one or more schools — users watch inside AsliLearn.
          </p>
        </div>
        <Button
          onClick={openCreateModal}
          className="bg-gradient-to-r from-sky-300 to-teal-400 hover:from-sky-400 hover:to-teal-500 text-white"
        >
          <Plus className="w-4 h-4 mr-2" />
          Live Session
        </Button>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search by session or school..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All Live Sessions ({filteredSessions.length})</CardTitle>
          <CardDescription>
            Manage YouTube Live sessions assigned to schools in Edu OTT
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredSessions.length === 0 ? (
            <div className="text-center py-12">
              <Video className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-600 mb-2">No live sessions yet</h3>
              <p className="text-gray-500">Add a YouTube Live link for one or more schools to get started</p>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-1 px-1">
            <Table className="min-w-[880px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[200px]">Session</TableHead>
                  <TableHead className="min-w-[180px]">Schools</TableHead>
                  <TableHead className="whitespace-nowrap">Visible to</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSessions.map((session) => {
                  const names = sessionSchoolNames(session);
                  return (
                    <TableRow key={session._id} className="align-top">
                      <TableCell className="max-w-[280px]">
                        <div className="font-medium text-gray-900">{session.title}</div>
                        {session.youtubeUrl ? (
                          <a
                            href={session.youtubeUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1 block text-xs text-sky-600 hover:underline truncate"
                            title={session.youtubeUrl}
                          >
                            {session.youtubeUrl}
                          </a>
                        ) : null}
                        {session.description ? (
                          <p className="mt-1 text-xs text-gray-500 line-clamp-2">{session.description}</p>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <SchoolsCell names={names} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Badge variant="outline">
                          {VISIBILITY_LABELS[session.visibility] || session.visibility || 'Both'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openEditModal(session)}
                            aria-label="Edit session"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDelete(session._id)}
                            aria-label="Delete session"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isModalOpen} onOpenChange={handleModalOpenChange}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Radio className="w-5 h-5 text-red-500" />
              {editingSessionId ? 'Edit Live Session' : 'Add Live Session'}
            </DialogTitle>
            <DialogDescription>
              Stream on YouTube Live (unlisted), then paste the watch or embed link here.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="live-title">Live session name *</Label>
              <Input
                id="live-title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="e.g. Class 10 Maths — Live Doubt Session"
              />
            </div>

            <div>
              <Label htmlFor="live-youtube">YouTube Live link *</Label>
              <Input
                id="live-youtube"
                value={formData.youtubeUrl}
                onChange={(e) => setFormData({ ...formData, youtubeUrl: e.target.value })}
                placeholder="https://www.youtube.com/watch?v=... or embed URL"
              />
            </div>

            <div className="space-y-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Label className="break-words">Schools * ({formData.schoolAdminIds.length} selected)</Label>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={selectAllSchools}>
                    Select all
                  </Button>
                  <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={clearSchools}>
                    Clear
                  </Button>
                </div>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <Input
                  value={schoolPickerSearch}
                  onChange={(e) => setSchoolPickerSearch(e.target.value)}
                  placeholder="Search schools..."
                  className="pl-9 h-9"
                />
              </div>
              <div className="rounded-md border max-h-48 overflow-y-auto divide-y">
                {filteredSchoolOptions.length === 0 ? (
                  <p className="p-3 text-sm text-gray-500 text-center">No schools found</p>
                ) : (
                  filteredSchoolOptions.map((school) => {
                    const checked = formData.schoolAdminIds.includes(school.id);
                    return (
                      <label
                        key={school.id}
                        className={cn(
                          'flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-sky-50/80',
                          checked && 'bg-sky-50'
                        )}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(value) => toggleSchool(school.id, value === true)}
                        />
                        <span className="text-sm font-medium text-gray-800">{school.schoolName}</span>
                      </label>
                    );
                  })
                )}
              </div>
              {formData.schoolAdminIds.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 rounded-md border border-sky-100 bg-sky-50/70 p-2">
                  {formData.schoolAdminIds.map((id) => {
                    const school = schools.find((s) => s.id === id);
                    if (!school) return null;
                    return (
                      <Badge key={id} variant="secondary" className="max-w-full whitespace-normal break-words text-xs">
                        {school.schoolName}
                      </Badge>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-gray-500">Selected school names will appear here.</p>
              )}
            </div>

            <div>
              <Label>Who can see this session? *</Label>
              <Select
                value={formData.visibility}
                onValueChange={(value: 'teacher' | 'student' | 'both') =>
                  setFormData({ ...formData, visibility: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="teacher">Teachers only</SelectItem>
                  <SelectItem value="student">Students only</SelectItem>
                  <SelectItem value="both">Teachers & Students</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="live-description">Description (optional)</Label>
              <Textarea
                id="live-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={2}
                placeholder="Short note for teachers/students"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => handleModalOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="bg-gradient-to-r from-sky-300 to-teal-400 hover:from-sky-400 hover:to-teal-500 text-white"
            >
              {isSaving ? 'Saving...' : editingSessionId ? 'Update' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
