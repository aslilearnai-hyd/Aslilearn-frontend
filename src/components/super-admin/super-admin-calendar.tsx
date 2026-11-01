import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getAuthToken } from '@/lib/auth-utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useConfirm } from '@/hooks/use-confirm';
import { API_BASE_URL } from '@/lib/api-config';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Eye,
  Building2,
  Plus,
  BookOpen,
  Search,
  Trash2,
  Loader2,
} from 'lucide-react';

export type CalendarEventRecord = {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  type: 'exam' | 'holiday' | 'custom' | 'school_event';
  examId?: string;
  description?: string;
  meta?: {
    examType?: string;
    subject?: string;
    duration?: number;
    schoolNames?: string[];
    schoolIds?: string[];
    isSchoolSpecific?: boolean;
  };
};

interface Admin {
  id: string;
  _id?: string;
  name: string;
  email: string;
  schoolName?: string;
}

function stripTime(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function localTodayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isPastLocalDay(date: Date) {
  return stripTime(date) < stripTime(new Date());
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function normalizeSchoolLabel(value?: string) {
  return (value || '')
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Super-admin path is canonical; retry legacy `/api/calendar/events` only if the server returns 404 (old deploys / gateway rules). */
async function fetchCalendarEventsGet(
  searchParams: URLSearchParams,
  token: string | null
): Promise<Response> {
  const headers: HeadersInit = {
    ...(token && { Authorization: `Bearer ${token}` }),
    'Content-Type': 'application/json',
  };
  const paths = ['/api/super-admin/calendar/events', '/api/calendar/events'] as const;
  let last: Response | undefined;
  for (const path of paths) {
    last = await fetch(`${API_BASE_URL}${path}?${searchParams.toString()}`, { headers });
    if (last.status !== 404) return last;
  }
  return last!;
}

async function fetchCalendarEventsPost(
  body: Record<string, unknown>,
  token: string | null
): Promise<Response> {
  const headers: HeadersInit = {
    ...(token && { Authorization: `Bearer ${token}` }),
    'Content-Type': 'application/json',
  };
  const paths = ['/api/super-admin/calendar/events', '/api/calendar/events'] as const;
  let last: Response | undefined;
  for (const path of paths) {
    last = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (last.status !== 404) return last;
  }
  return last!;
}

async function fetchCalendarEventsDelete(
  eventId: string,
  token: string | null
): Promise<Response> {
  const headers: HeadersInit = {
    ...(token && { Authorization: `Bearer ${token}` }),
    'Content-Type': 'application/json',
  };
  const paths = [
    `/api/super-admin/calendar/events/${encodeURIComponent(eventId)}`,
    `/api/calendar/events/${encodeURIComponent(eventId)}`,
  ] as const;
  let last: Response | undefined;
  for (const path of paths) {
    last = await fetch(`${API_BASE_URL}${path}`, {
      method: 'DELETE',
      headers,
    });
    if (last.status !== 404) return last;
  }
  return last!;
}

function toDatetimeLocal(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const TYPE_STYLES: Record<
  CalendarEventRecord['type'],
  { bar: string; dot: string; label: string }
> = {
  exam: {
    bar: 'bg-blue-600 hover:bg-blue-700',
    dot: 'bg-blue-500',
    label: 'Exam',
  },
  holiday: {
    bar: 'bg-emerald-600 hover:bg-emerald-700',
    dot: 'bg-emerald-500',
    label: 'Holiday',
  },
  custom: {
    bar: 'bg-orange-500 hover:bg-orange-600',
    dot: 'bg-orange-500',
    label: 'Custom',
  },
  school_event: {
    bar: 'bg-violet-600 hover:bg-violet-700',
    dot: 'bg-violet-500',
    label: 'School',
  },
};

interface SuperAdminCalendarProps {
  onNavigateToExams?: (prefill: {
    startDate: string;
    endDate: string;
    filterType: 'all-schools' | 'specific-schools';
    selectedSchools: string[];
  }) => void;
}

export default function SuperAdminCalendar({ onNavigateToExams }: SuperAdminCalendarProps) {
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEventRecord[]>([]);
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>('all');
  const [schoolFilterSearch, setSchoolFilterSearch] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<CalendarEventRecord | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [jumpDate, setJumpDate] = useState('');

  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddDate, setQuickAddDate] = useState<Date | null>(null);
  const [quickAddForm, setQuickAddForm] = useState({
    title: '',
    date: '',
    startTime: '09:00',
    endTime: '10:00',
    priority: 'medium' as 'low' | 'medium' | 'high',
    category: 'custom' as 'custom' | 'holiday' | 'school_event',
    notes: '',
  });
  const [isSavingCustom, setIsSavingCustom] = useState(false);
  const [isDeletingEvent, setIsDeletingEvent] = useState(false);

  useEffect(() => {
    fetchAdmins();
  }, []);

  const fetchCalendarEvents = useCallback(async () => {
    const month = monthKey(currentDate);
    try {
      setIsLoadingEvents(true);
      const token = getAuthToken();
      const params = new URLSearchParams({ month });
      if (selectedSchoolId && selectedSchoolId !== 'all') {
        params.set('schoolId', selectedSchoolId);
      }
      const response = await fetchCalendarEventsGet(params, token);

      if (response.ok) {
        const data = await response.json();
        const list = (data.data || data || []) as CalendarEventRecord[];
        setEvents(Array.isArray(list) ? list : []);
      } else {
        const err = await response.json().catch(() => ({}));
        toast({
          title: 'Error',
          description: err.message || 'Failed to load calendar',
          variant: 'destructive',
        });
        setEvents([]);
      }
    } catch (e) {
      console.error(e);
      toast({ title: 'Error', description: 'Failed to load calendar', variant: 'destructive' });
      setEvents([]);
    } finally {
      setIsLoadingEvents(false);
    }
  }, [currentDate, selectedSchoolId, toast]);

  useEffect(() => {
    fetchCalendarEvents();
  }, [fetchCalendarEvents]);

  const fetchAdmins = async () => {
    try {
      setIsLoading(true);
      const token = getAuthToken();
      const response = await fetch(`${API_BASE_URL}/api/super-admin/admins?lite=1`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        const adminsList = Array.isArray(data) ? data : data.data || [];
        setAdmins(adminsList);
      } else {
        toast({
          title: 'Error',
          description: 'Failed to fetch schools',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error fetching admins:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch schools',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getFirstDayOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);
  const getLastDayOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0);

  const calendarDays = useMemo(() => {
    const firstDay = getFirstDayOfMonth(currentDate);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - startDate.getDay());

    const days: Date[] = [];
    const current = new Date(startDate);
    for (let i = 0; i < 42; i++) {
      days.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    return days;
  }, [currentDate]);

  const eventsByDateKey = useMemo(() => {
    const map: Record<string, CalendarEventRecord[]> = {};
    // Build only for visible grid range (42 days) to keep work bounded.
    const visibleStart = stripTime(calendarDays[0]);
    const visibleEnd = stripTime(calendarDays[calendarDays.length - 1]);
    events.forEach((ev) => {
      const start = stripTime(new Date(ev.startDate));
      const end = stripTime(new Date(ev.endDate));
      // Exams: mark start + end only (not every day in the window)
      if (ev.type === 'exam') {
        for (const t of start === end ? [start] : [start, end]) {
          if (t < visibleStart || t > visibleEnd) continue;
          const key = new Date(t).toDateString();
          if (!map[key]) map[key] = [];
          map[key].push(ev);
        }
        return;
      }
      const boundedStart = Math.max(start, visibleStart);
      const boundedEnd = Math.min(end, visibleEnd);
      if (boundedEnd < boundedStart) return;
      for (let t = boundedStart; t <= boundedEnd; t += 24 * 60 * 60 * 1000) {
        const key = new Date(t).toDateString();
        if (!map[key]) map[key] = [];
        map[key].push(ev);
      }
    });
    return map;
  }, [events, calendarDays]);

  const monthlyEvents = useMemo(() => {
    const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    const startMs = monthStart.getTime();
    const endMs = monthEnd.getTime();

    return events
      .filter((ev) => {
        const evStart = new Date(ev.startDate).getTime();
        const evEnd = new Date(ev.endDate).getTime();
        return evStart <= endMs && evEnd >= startMs;
      })
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  }, [events, currentDate]);

  const monthlyEventsByDate = useMemo(() => {
    const grouped = monthlyEvents.reduce<Record<string, CalendarEventRecord[]>>((acc, event) => {
      const key = new Date(event.startDate).toDateString();
      if (!acc[key]) acc[key] = [];
      acc[key].push(event);
      return acc;
    }, {});
    return Object.entries(grouped).sort(
      ([a], [b]) => new Date(a).getTime() - new Date(b).getTime()
    );
  }, [monthlyEvents]);

  const isToday = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const isCurrentMonth = (date: Date) =>
    date.getMonth() === currentDate.getMonth() && date.getFullYear() === currentDate.getFullYear();

  const goToPreviousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const goToToday = () => setCurrentDate(new Date());
  const goToDate = () => {
    if (!jumpDate) return;
    const [y, m, d] = jumpDate.split('-').map(Number);
    if (!y || !m || !d) return;
    const target = new Date(y, m - 1, d);
    setCurrentDate(target);
  };

  const handleViewEvent = (event: CalendarEventRecord) => {
    setSelectedEvent(event);
    setIsViewDialogOpen(true);
  };

  const canDeleteSelectedEvent =
    Boolean(selectedEvent) && selectedEvent?.type !== 'exam';

  const deleteSelectedEvent = async () => {
    if (!selectedEvent || selectedEvent.type === 'exam') return;
    const ok = await confirm({
      title: 'Delete this event?',
      description: `Delete “${selectedEvent.title}”? This removes it from the school calendar.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    setIsDeletingEvent(true);
    try {
      const token = getAuthToken();
      const response = await fetchCalendarEventsDelete(selectedEvent.id, token);
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to delete event');
      }
      toast({ title: 'Deleted', description: 'Event removed from calendar' });
      setIsViewDialogOpen(false);
      setSelectedEvent(null);
      fetchCalendarEvents();
    } catch (e) {
      toast({
        title: 'Could not delete',
        description: e instanceof Error ? e.message : 'Failed to delete event',
        variant: 'destructive',
      });
    } finally {
      setIsDeletingEvent(false);
    }
  };

  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const selectedAdmin = admins.find((a) => (a.id || a._id) === selectedSchoolId);
  const selectedSchoolLabel = selectedAdmin?.schoolName || selectedAdmin?.name || selectedAdmin?.email || '';
  const sortedAdmins = useMemo(() => {
    return [...admins].sort((a, b) => {
      const aLabel = normalizeSchoolLabel(a.schoolName || a.name || a.email);
      const bLabel = normalizeSchoolLabel(b.schoolName || b.name || b.email);
      return aLabel.localeCompare(bLabel, undefined, { sensitivity: 'base' });
    });
  }, [admins]);

  const filteredAdmins = useMemo(() => {
    const q = schoolFilterSearch.trim().toLowerCase();
    if (!q) return sortedAdmins;
    return sortedAdmins.filter((admin) => {
      const name = String(admin.schoolName || admin.name || '').toLowerCase();
      const email = String(admin.email || '').toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [sortedAdmins, schoolFilterSearch]);

  const getSchoolLabelById = (schoolId: string) => {
    const school = admins.find((a) => (a.id || a._id) === schoolId);
    return school?.schoolName || school?.name || school?.email || '';
  };

  const openQuickAdd = (date: Date) => {
    if (isPastLocalDay(date)) {
      toast({
        title: 'Past date',
        description: 'You can view past days, but new events can only be added for today or a future date.',
        variant: 'destructive',
      });
      return;
    }
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    setQuickAddDate(date);
    setQuickAddForm({
      title: '',
      date: `${yyyy}-${mm}-${dd}`,
      startTime: '09:00',
      endTime: '10:00',
      priority: 'medium',
      category: 'custom',
      notes: '',
    });
    setQuickAddOpen(true);
  };

  const goToExamWithDate = (date: Date) => {
    const start = new Date(date);
    start.setHours(9, 0, 0, 0);
    const end = new Date(date);
    end.setHours(21, 0, 0, 0);
    const prefill = {
      startDate: toDatetimeLocal(start),
      endDate: toDatetimeLocal(end),
      filterType:
        selectedSchoolId !== 'all'
          ? ('specific-schools' as const)
          : ('all-schools' as const),
      selectedSchools: selectedSchoolId !== 'all' ? [selectedSchoolId] : [],
    };
    onNavigateToExams?.(prefill);
    setQuickAddOpen(false);
  };

  const saveCustomEvent = async () => {
    if (selectedSchoolId === 'all') {
      toast({
        title: 'Select school',
        description: 'Please select a specific school before adding events.',
        variant: 'destructive',
      });
      return;
    }
    if (!quickAddForm.title.trim() || !quickAddForm.date) {
      toast({
        title: 'Validation',
        description: 'Event title and date are required.',
        variant: 'destructive',
      });
      return;
    }
    if (quickAddForm.date < localTodayIso()) {
      toast({
        title: 'Past date',
        description: 'Calendar events cannot be created on a past date.',
        variant: 'destructive',
      });
      return;
    }
    setIsSavingCustom(true);
    try {
      const token = getAuthToken();
      const [yy, mm, dd] = quickAddForm.date.split('-').map(Number);
      const [startHour, startMinute] = quickAddForm.startTime.split(':').map(Number);
      const [endHour, endMinute] = quickAddForm.endTime.split(':').map(Number);
      const start = new Date(yy, mm - 1, dd, startHour || 0, startMinute || 0, 0, 0);
      const end = new Date(yy, mm - 1, dd, endHour || 0, endMinute || 0, 0, 0);
      if (end <= start) {
        toast({
          title: 'Invalid time range',
          description: 'End time must be later than start time.',
          variant: 'destructive',
        });
        setIsSavingCustom(false);
        return;
      }
      const priorityLabel =
        quickAddForm.priority.charAt(0).toUpperCase() + quickAddForm.priority.slice(1);
      const composedDescription = [`Priority: ${priorityLabel}`, quickAddForm.notes.trim()]
        .filter(Boolean)
        .join('\n\n');
      const response = await fetchCalendarEventsPost(
        {
          title: quickAddForm.title.trim(),
          schoolId: selectedSchoolId,
          startDate: start.toISOString(),
          endDate: end.toISOString(),
          eventKind: quickAddForm.category,
          description: composedDescription,
        },
        token
      );
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.success) {
        toast({ title: 'Saved', description: 'Event added to calendar' });
        setQuickAddOpen(false);
        setQuickAddDate(null);
        fetchCalendarEvents();
      } else {
        toast({
          title: 'Error',
          description: data.message || 'Failed to save',
          variant: 'destructive',
        });
      }
    } catch (e) {
      console.error(e);
      toast({ title: 'Error', description: 'Failed to save event', variant: 'destructive' });
    } finally {
      setIsSavingCustom(false);
    }
  };

  return (
    <TooltipProvider>
      {ConfirmDialog}
      <div className="space-y-3 sm:space-y-4 lg:space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl sm:text-2xl sm:text-3xl font-bold text-gray-900">School Calendar</h2>
            <p className="text-sm sm:text-base text-gray-600 mt-1">
              Exams, holidays, and events by school. Exams sync from Exam Management.
            </p>
          </div>
          <Button onClick={goToToday} variant="outline" className="shrink-0">
            Today
          </Button>
        </div>

        <Card>
          <CardContent className="p-3 sm:p-4 lg:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <Building2 className="h-4 w-4 sm:h-5 sm:w-5 text-gray-500 shrink-0" />
              <div className="flex-1 space-y-2">
                <Label htmlFor="school-select">School filter</Label>
                <Select
                  value={selectedSchoolId}
                  onValueChange={setSelectedSchoolId}
                  onOpenChange={(open) => {
                    if (!open) setSchoolFilterSearch('');
                  }}
                >
                  <SelectTrigger
                    id="school-select"
                    className="w-full max-w-md border border-orange-200 bg-white shadow-sm transition-colors hover:border-orange-400 focus:ring-2 focus:ring-orange-400/40"
                  >
                    <SelectValue placeholder="Select scope" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    <div className="sticky top-0 z-10 border-b border-gray-100 bg-popover p-2">
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                        <Input
                          value={schoolFilterSearch}
                          onChange={(e) => setSchoolFilterSearch(e.target.value)}
                          placeholder="Search schools…"
                          className="h-8 pl-8 text-xs"
                          onKeyDown={(e) => e.stopPropagation()}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                    </div>
                    <SelectItem value="all">All Schools</SelectItem>
                    {filteredAdmins.length === 0 ? (
                      <div className="px-2 py-3 text-center text-xs text-gray-500">
                        No schools found
                      </div>
                    ) : (
                      filteredAdmins.map((admin) => {
                        const adminId = admin.id || admin._id || '';
                        return (
                          <SelectItem key={adminId} value={adminId}>
                            {admin.schoolName || admin.name || admin.email}
                          </SelectItem>
                        );
                      })
                    )}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500">
                  Legend:{' '}
                  <span className="inline-flex items-center gap-1">
                    <span className="inline-block w-2 h-2 rounded-full bg-blue-500" /> Exam
                  </span>{' '}
                  <span className="inline-flex items-center gap-1 ml-2">
                    <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" /> Holiday
                  </span>{' '}
                  <span className="inline-flex items-center gap-1 ml-2">
                    <span className="inline-block w-2 h-2 rounded-full bg-orange-500" /> Custom
                  </span>{' '}
                  <span className="inline-flex items-center gap-1 ml-2">
                    <span className="inline-block w-2 h-2 rounded-full bg-violet-500" /> School (admin)
                  </span>
                </p>
              </div>
            </div>
            {selectedSchoolId !== 'all' && selectedAdmin && (
              <div className="mt-4 p-4 bg-orange-50 rounded-lg">
                <p className="text-xs sm:text-sm text-gray-700">
                  <span className="font-semibold">Filtered school:</span>{' '}
                  {selectedAdmin.schoolName || selectedAdmin.name}
                </p>
                <p className="text-xs text-gray-500 mt-1">{selectedAdmin.email}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3 sm:p-6">
            <div className="flex items-center justify-between gap-2 sm:gap-4 mb-4 sm:mb-6">
              <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
                <Button variant="outline" size="icon" onClick={goToPreviousMonth} className="h-6 w-6 sm:h-7 sm:w-7 lg:h-8 lg:w-8 sm:h-10 sm:w-10">
                  <ChevronLeft className="h-3 w-3 sm:h-4 sm:w-4" />
                </Button>
                <h3 className="text-base sm:text-lg sm:text-2xl font-semibold text-gray-900">
                  {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
                </h3>
                <Button variant="outline" size="icon" onClick={goToNextMonth} className="h-6 w-6 sm:h-7 sm:w-7 lg:h-8 lg:w-8 sm:h-10 sm:w-10">
                  <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4" />
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={jumpDate}
                  onChange={(e) => setJumpDate(e.target.value)}
                  className="h-9 w-[160px]"
                />
                <Button type="button" variant="outline" onClick={goToDate}>
                  Go
                </Button>
              </div>
            </div>

            {isLoading || isLoadingEvents ? (
              <div className="flex items-center justify-center h-64">
                <div className="text-center">
                  <CalendarIcon className="w-12 h-12 text-gray-400 mx-auto mb-4 animate-pulse" />
                  <p className="text-gray-600">Loading calendar…</p>
                </div>
              </div>
            ) : (
              <>
                <div className="sm:hidden mb-4">
                  <h4 className="text-xs sm:text-sm font-semibold text-sky-900 mb-2">Upcoming This Month</h4>
                  {monthlyEventsByDate.length === 0 ? (
                    <p className="text-xs sm:text-sm text-gray-500">No events or exams scheduled this month.</p>
                  ) : (
                    <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
                      {monthlyEventsByDate.map(([dateKey, dayEvents]) => (
                        <div key={dateKey} className="rounded-lg border border-sky-100 bg-white p-2.5">
                          <p className="text-xs font-semibold text-sky-700 mb-2">
                            {new Date(dateKey).toLocaleDateString(undefined, {
                              weekday: 'short',
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </p>
                          <div className="space-y-1.5">
                            {dayEvents.map((event) => {
                              const style = TYPE_STYLES[event.type] || TYPE_STYLES.custom;
                              return (
                                <button
                                  key={event.id}
                                  type="button"
                                  onClick={() => handleViewEvent(event)}
                                  className="w-full rounded-md border border-sky-100 bg-sky-50 text-left px-2 py-2"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <p className="text-xs sm:text-sm font-medium text-sky-900 truncate">{event.title}</p>
                                    <Badge className={`${style.dot} text-white border-0`}>{style.label}</Badge>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="hidden sm:block overflow-x-auto pb-1">
                <div className="min-w-[700px]">
                  <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
                    {dayNames.map((day) => (
                      <div key={day} className="text-center text-mini sm:text-sm font-semibold text-gray-600 py-1.5 sm:py-2">
                        <span className="sm:hidden">{day.slice(0, 2)}</span>
                        <span className="hidden sm:inline">{day}</span>
                      </div>
                    ))}

                    {calendarDays.map((date, index) => {
                      const dayEvents = eventsByDateKey[date.toDateString()] || [];
                      const isCurrentMonthDay = isCurrentMonth(date);
                      const isTodayDate = isToday(date);
                      const isPastDay = isPastLocalDay(date);

                      return (
                        <motion.div
                          key={index}
                          className={`
                            min-h-[116px] sm:min-h-[112px] border border-gray-200 rounded-lg p-1.5 flex flex-col
                            transition-all
                            ${!isCurrentMonthDay ? 'bg-gray-50 opacity-50' : 'bg-white'}
                            ${isTodayDate ? 'ring-2 ring-orange-500 ring-offset-1 shadow-sm' : ''}
                          `}
                          whileHover={{ scale: 1.01 }}
                        >
                          <div className="flex items-start justify-between gap-1 mb-1">
                            <span
                              className={`
                              text-xs sm:text-sm font-medium px-1
                              ${isTodayDate ? 'text-orange-600 font-bold' : 'text-gray-700'}
                              ${!isCurrentMonthDay ? 'text-gray-400' : ''}
                            `}
                            >
                              {date.getDate()}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-4 w-4 sm:h-5 sm:w-5 lg:h-6 lg:w-6 shrink-0 text-gray-500 hover:text-sky-600 disabled:text-gray-300"
                              title={isPastDay ? 'Cannot add events on past dates' : 'Add'}
                              disabled={isPastDay}
                              onClick={() => openQuickAdd(date)}
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </Button>
                          </div>

                          <div className="space-y-0.5 flex-1 overflow-hidden">
                            {dayEvents.slice(0, 4).map((ev) => {
                              const st = TYPE_STYLES[ev.type] || TYPE_STYLES.custom;
                              const tip = [
                                ev.title,
                                ev.description,
                                ev.meta?.subject ? `Subject: ${ev.meta.subject}` : '',
                                ev.type === 'exam' && ev.meta?.duration ? `${ev.meta.duration} min` : '',
                              ]
                                .filter(Boolean)
                                .join('\n');
                              return (
                                <Tooltip key={ev.id}>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      onClick={() => handleViewEvent(ev)}
                                      className={`w-full text-left text-micro sm:text-mini leading-tight px-1.5 py-0.5 rounded text-white truncate ${st.bar}`}
                                    >
                                      <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle ${st.dot}`} />
                                      {ev.title}
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="max-w-xs whitespace-pre-wrap">
                                    {tip}
                                  </TooltipContent>
                                </Tooltip>
                              );
                            })}
                            {dayEvents.length > 4 && (
                              <div className="text-micro sm:text-xs text-gray-500 font-medium px-0.5">
                                +{dayEvents.length - 4} more
                              </div>
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="mt-5 border-t border-sky-100 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm sm:text-base font-semibold text-sky-900">This Month Events</h4>
                  <span className="text-xs text-sky-600">{monthlyEvents.length} scheduled</span>
                </div>
                {monthlyEvents.length === 0 ? (
                  <p className="text-xs sm:text-sm text-gray-500">No events or exams scheduled this month.</p>
                ) : (
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {monthlyEvents.map((event) => {
                      const start = new Date(event.startDate);
                      const end = new Date(event.endDate);
                      const isRange = start.toDateString() !== end.toDateString();
                      const style = TYPE_STYLES[event.type] || TYPE_STYLES.custom;
                      return (
                        <button
                          type="button"
                          key={event.id}
                          onClick={() => handleViewEvent(event)}
                          className="w-full text-left rounded-lg border border-sky-100 bg-white hover:bg-sky-50 px-3 py-2 transition-colors"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs sm:text-sm font-medium text-sky-900 truncate">{event.title}</p>
                            <Badge className={`${style.dot} text-white border-0`}>{style.label}</Badge>
                          </div>
                          <p className="text-xs text-sky-700 mt-1">
                            {start.toLocaleDateString()}
                            {isRange ? ` - ${end.toLocaleDateString()}` : ''}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Quick add */}
        <Dialog open={quickAddOpen} onOpenChange={setQuickAddOpen}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Add Event</DialogTitle>
              <DialogDescription>
                {quickAddDate?.toLocaleDateString(undefined, {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-xs sm:text-sm text-slate-600">
                  Fill event details and save to calendar.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-lg"
                  onClick={() => {
                    if (quickAddDate) goToExamWithDate(quickAddDate);
                  }}
                >
                  <BookOpen className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
                  Add Exam Instead
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2 space-y-2">
                  <Label htmlFor="quick-add-title">Event title *</Label>
                  <Input
                    id="quick-add-title"
                    value={quickAddForm.title}
                    onChange={(e) => setQuickAddForm((prev) => ({ ...prev, title: e.target.value }))}
                    placeholder="Enter event title"
                    className="rounded-lg bg-white"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="quick-add-date">Date *</Label>
                  <Input
                    id="quick-add-date"
                    type="date"
                    min={localTodayIso()}
                    value={quickAddForm.date}
                    onChange={(e) => {
                      const next = e.target.value;
                      const today = localTodayIso();
                      if (next && next < today) {
                        toast({
                          title: 'Past date',
                          description: 'Choose today or a future date.',
                          variant: 'destructive',
                        });
                        setQuickAddForm((prev) => ({ ...prev, date: today }));
                        return;
                      }
                      setQuickAddForm((prev) => ({ ...prev, date: next }));
                    }}
                    className="rounded-lg bg-white"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="quick-add-start-time">Start time</Label>
                    <Input
                      id="quick-add-start-time"
                      type="time"
                      value={quickAddForm.startTime}
                      onChange={(e) => setQuickAddForm((prev) => ({ ...prev, startTime: e.target.value }))}
                      className="rounded-lg bg-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="quick-add-end-time">End time</Label>
                    <Input
                      id="quick-add-end-time"
                      type="time"
                      value={quickAddForm.endTime}
                      onChange={(e) => setQuickAddForm((prev) => ({ ...prev, endTime: e.target.value }))}
                      className="rounded-lg bg-white"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select
                    value={quickAddForm.priority}
                    onValueChange={(value: 'low' | 'medium' | 'high') =>
                      setQuickAddForm((prev) => ({ ...prev, priority: value }))
                    }
                  >
                    <SelectTrigger className="rounded-lg bg-white">
                      <SelectValue placeholder="Select priority" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select
                    value={quickAddForm.category}
                    onValueChange={(value: 'custom' | 'holiday' | 'school_event') =>
                      setQuickAddForm((prev) => ({ ...prev, category: value }))
                    }
                  >
                    <SelectTrigger className="rounded-lg bg-white">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="custom">Custom</SelectItem>
                      <SelectItem value="holiday">Holiday</SelectItem>
                      <SelectItem value="school_event">School Event</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="md:col-span-2 space-y-2">
                  <Label htmlFor="quick-add-notes">Notes / Content</Label>
                  <Textarea
                    id="quick-add-notes"
                    rows={4}
                    value={quickAddForm.notes}
                    onChange={(e) => setQuickAddForm((prev) => ({ ...prev, notes: e.target.value }))}
                    placeholder="Type any notes or custom content here..."
                    className="rounded-lg bg-white"
                  />
                </div>
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setQuickAddOpen(false)} className="rounded-lg">
                Cancel
              </Button>
              <Button
                onClick={saveCustomEvent}
                disabled={isSavingCustom || !quickAddForm.date || quickAddForm.date < localTodayIso()}
                className="rounded-lg"
              >
                {isSavingCustom ? 'Saving...' : 'Save Event'}
              </Button>
            </DialogFooter>
            {selectedSchoolId === 'all' && (
              <p className="text-xs text-amber-700">
                Select a specific school first to save custom events.
              </p>
            )}
          </DialogContent>
        </Dialog>

        {/* View */}
        <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{selectedEvent?.title}</DialogTitle>
              <DialogDescription>
                {selectedEvent && TYPE_STYLES[selectedEvent.type]?.label} ·{' '}
                {selectedEvent?.type === 'exam' ? 'Linked exam' : 'Calendar entry'}
              </DialogDescription>
            </DialogHeader>
            {selectedEvent && (
              <div className="space-y-3 text-xs sm:text-sm">
                <div>
                  <Label>Start</Label>
                  <p className="text-gray-800">
                    {new Date(selectedEvent.startDate).toLocaleString(undefined, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </p>
                </div>
                <div>
                  <Label>End</Label>
                  <p className="text-gray-800">
                    {new Date(selectedEvent.endDate).toLocaleString(undefined, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </p>
                </div>
                {selectedEvent.description && (
                  <div>
                    <Label>Description</Label>
                    <p className="text-gray-700 whitespace-pre-wrap">{selectedEvent.description}</p>
                  </div>
                )}
                {selectedEvent.meta?.subject && (
                  <p className="text-gray-600">
                    Subject: <span className="font-medium">{selectedEvent.meta.subject}</span>
                  </p>
                )}
                {selectedEvent.type === 'exam' && (() => {
                  const schoolNamesFromEvent = selectedEvent.meta?.schoolNames || [];
                  const schoolIdsFromEvent = selectedEvent.meta?.schoolIds || [];
                  const schoolNamesFromIds = schoolIdsFromEvent
                    .map((schoolId) => getSchoolLabelById(schoolId))
                    .filter(Boolean);
                  const resolvedSchoolNames = schoolNamesFromEvent.length > 0 ? schoolNamesFromEvent : schoolNamesFromIds;
                  const resolvedLabel =
                    resolvedSchoolNames.length > 0
                      ? resolvedSchoolNames.join(', ')
                      : selectedEvent.meta?.isSchoolSpecific === false
                        ? 'All Schools'
                        : selectedSchoolId !== 'all' && selectedSchoolLabel
                          ? selectedSchoolLabel
                          : 'Specific Schools';
                  return (
                    <p className="text-gray-600">
                      School{resolvedSchoolNames.length > 1 ? 's' : ''}:{' '}
                      <span className="font-medium">{resolvedLabel}</span>
                    </p>
                  );
                })()}
                {canDeleteSelectedEvent ? (
                  <div className="flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-slate-500">
                      You can remove this holiday or custom event from the calendar.
                    </p>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={isDeletingEvent}
                      onClick={() => void deleteSelectedEvent()}
                      className="shrink-0"
                    >
                      {isDeletingEvent ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="mr-2 h-4 w-4" />
                      )}
                      Delete event
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-gray-500">
                    <Eye className="h-3 w-3 sm:h-4 sm:w-4" />
                    <span>
                      {selectedEvent.type === 'exam'
                        ? 'Exam entries are managed in Exam Management'
                        : 'Read-only'}
                    </span>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
