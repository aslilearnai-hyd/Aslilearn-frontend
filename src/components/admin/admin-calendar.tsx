import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useConfirm } from '@/hooks/use-confirm';
import { API_BASE_URL } from '@/lib/api-config';
import { getAuthToken } from '@/lib/auth-utils';
import {
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Calendar as CalendarIcon,
  X,
  Image as ImageIcon,
  Edit,
  Trash2
} from 'lucide-react';

interface Event {
  _id?: string;
  id?: string;
  name: string;
  date: string;
  startDate?: string;
  endDate?: string;
  type?: 'event' | 'exam';
  examType?: string;
  examId?: string;
  photo?: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
}

export default function AdminCalendar() {
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isEventDialogOpen, setIsEventDialogOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);

  const [eventForm, setEventForm] = useState({
    name: '',
    date: '',
    photo: null as File | null,
    photoUrl: '',
    description: ''
  });

  // Fetch events on component mount
  useEffect(() => {
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    try {
      setIsLoading(true);
      const token = getAuthToken();
      const [eventsResponse, examsResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/api/admin/events`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }),
        fetch(`${API_BASE_URL}/api/admin/exams/viewable`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }),
      ]);

      const calendarEvents: Event[] = [];

      if (eventsResponse.ok) {
        const data = await eventsResponse.json();
        const baseEvents = Array.isArray(data) ? data : (data.events || data.data || []);
        calendarEvents.push(
          ...baseEvents.map((event: any) => ({
            ...event,
            type: 'event' as const,
            startDate: event.date,
            endDate: event.date,
          }))
        );
      }

      if (examsResponse.ok) {
        const examData = await examsResponse.json();
        const exams = examData?.data || [];
        calendarEvents.push(
          ...exams.map((exam: any) => ({
            id: `exam-${exam._id}`,
            examId: exam._id,
            name: exam.title,
            date: exam.startDate,
            startDate: exam.startDate,
            endDate: exam.endDate,
            description: exam.description,
            type: 'exam' as const,
            examType: exam.examType,
          }))
        );
      }

      setEvents(calendarEvents);
    } catch (error) {
      console.error('Error fetching events:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Get first day of month
  const getFirstDayOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  };

  // Get last day of month
  const getLastDayOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0);
  };

  // Generate calendar days
  const calendarDays = useMemo(() => {
    const firstDay = getFirstDayOfMonth(currentDate);
    const lastDay = getLastDayOfMonth(currentDate);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - startDate.getDay()); // Start from Sunday
    
    const days: Date[] = [];
    const current = new Date(startDate);
    
    // Generate 42 days (6 weeks)
    for (let i = 0; i < 42; i++) {
      days.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    
    return days;
  }, [currentDate]);

  // Get events for a specific date
  const getEventsForDate = (date: Date) => {
    // Normalize date to midnight in local timezone for accurate comparison
    const normalizedDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dateStr = `${normalizedDate.getFullYear()}-${String(normalizedDate.getMonth() + 1).padStart(2, '0')}-${String(normalizedDate.getDate()).padStart(2, '0')}`;
    
    return events.filter(event => {
      const start = event.startDate || event.date;
      const end = event.endDate || event.date;
      const startDateObj = new Date(start);
      const endDateObj = new Date(end);
      const normalizedStartDate = new Date(startDateObj.getFullYear(), startDateObj.getMonth(), startDateObj.getDate());
      const normalizedEndDate = new Date(endDateObj.getFullYear(), endDateObj.getMonth(), endDateObj.getDate());
      const startStr = `${normalizedStartDate.getFullYear()}-${String(normalizedStartDate.getMonth() + 1).padStart(2, '0')}-${String(normalizedStartDate.getDate()).padStart(2, '0')}`;
      const endStr = `${normalizedEndDate.getFullYear()}-${String(normalizedEndDate.getMonth() + 1).padStart(2, '0')}-${String(normalizedEndDate.getDate()).padStart(2, '0')}`;

      // Exams: show on start + end dates only (not every day in the window)
      if (event.type === 'exam') {
        return dateStr === startStr || dateStr === endStr;
      }
      return dateStr >= startStr && dateStr <= endStr;
    });
  };

  // Check if date is today
  const isToday = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  // True when the day is before today (local time). Accepts a Date or a
  // "YYYY-MM-DD" string (parsed as a local calendar day, not UTC).
  const isPastDay = (value: Date | string) => {
    let day: Date;
    if (typeof value === 'string') {
      const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
      day = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
    } else {
      day = new Date(value.getFullYear(), value.getMonth(), value.getDate());
    }
    if (Number.isNaN(day.getTime())) return false;
    day.setHours(0, 0, 0, 0);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    return day < todayStart;
  };

  // Check if date is in current month
  const isCurrentMonth = (date: Date) => {
    return date.getMonth() === currentDate.getMonth() && 
           date.getFullYear() === currentDate.getFullYear();
  };

  // Navigate months
  const goToPreviousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  // Handle date click
  const handleDateClick = (date: Date) => {
    // Normalize date to local timezone to avoid timezone issues
    const normalizedDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    if (normalizedDate < todayStart) {
      toast({
        title: "Past date",
        description: "You can view past days, but new events can only be added for today or future dates.",
        variant: "destructive",
      });
      return;
    }
    const year = normalizedDate.getFullYear();
    const month = String(normalizedDate.getMonth() + 1).padStart(2, '0');
    const day = String(normalizedDate.getDate()).padStart(2, '0');
    const dateString = `${year}-${month}-${day}`;
    
    setSelectedDate(normalizedDate);
    setEventForm({
      name: '',
      date: dateString,
      photo: null,
      photoUrl: '',
      description: ''
    });
    setIsEditMode(false);
    setEditingEvent(null);
    setIsEventDialogOpen(true);
  };

  // Handle event form submit
  const handleEventSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!eventForm.name || !eventForm.date) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    // New events can't be created on past dates (local "today" cutoff).
    if (!isEditMode && isPastDay(eventForm.date)) {
      toast({
        title: "Past date",
        description: "New events can only be added for today or future dates.",
        variant: "destructive",
      });
      return;
    }

    try {
      const token = getAuthToken();
      const formData = new FormData();
      formData.append('name', eventForm.name);
      formData.append('date', eventForm.date);
      formData.append('description', eventForm.description);
      
      if (eventForm.photo) {
        formData.append('photo', eventForm.photo);
      }

      const url = isEditMode && editingEvent
        ? `${API_BASE_URL}/api/admin/events/${editingEvent._id || editingEvent.id}`
        : `${API_BASE_URL}/api/admin/events`;

      const response = await fetch(url, {
        method: isEditMode ? 'PUT' : 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      if (response.ok) {
        toast({
          title: "Success",
          description: isEditMode ? "Event updated successfully" : "Event created successfully",
        });
        setIsEventDialogOpen(false);
        resetForm();
        fetchEvents();
      } else {
        const error = await response.json();
        toast({
          title: "Error",
          description: error.message || "Failed to save event",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error saving event:', error);
      toast({
        title: "Error",
        description: "Failed to save event",
        variant: "destructive",
      });
    }
  };

  // Handle delete event
  const handleDeleteEvent = async (event: Event) => {
    const eventDay = new Date(event.date);
    eventDay.setHours(0, 0, 0, 0);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    if (eventDay < todayStart) {
      toast({
        title: "Locked",
        description: "Past events cannot be deleted.",
        variant: "destructive",
      });
      return;
    }

    const ok = await confirm({
      title: 'Delete this event?',
      description: 'This action cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) {
      return;
    }

    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE_URL}/api/admin/events/${event._id || event.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        toast({
          title: "Success",
          description: "Event deleted successfully",
        });
        fetchEvents();
      } else {
        toast({
          title: "Error",
          description: "Failed to delete event",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error deleting event:', error);
      toast({
        title: "Error",
        description: "Failed to delete event",
        variant: "destructive",
      });
    }
  };

  // Handle edit event
  const handleEditEvent = (event: Event, e?: React.MouseEvent) => {
    if (e && typeof e.stopPropagation === 'function') {
      e.stopPropagation();
    }
    const eventDay = new Date(event.date);
    eventDay.setHours(0, 0, 0, 0);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    if (eventDay < todayStart) {
      toast({
        title: "Locked",
        description: "Past events cannot be edited.",
        variant: "destructive",
      });
      return;
    }
    setEditingEvent(event);
    setIsEditMode(true);
    setEventForm({
      name: event.name,
      date: new Date(event.date).toISOString().split('T')[0],
      photo: null,
      photoUrl: event.photo || '',
      description: event.description || ''
    });
    setSelectedDate(new Date(event.date));
    setIsEventDialogOpen(true);
  };

  // Handle view event
  const handleViewEvent = (event: Event, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    console.log('Viewing event:', {
      eventId: event._id || event.id,
      eventName: event.name,
      eventDate: event.date,
      eventDateFormatted: new Date(event.date).toLocaleDateString()
    });
    setSelectedEvent(event);
    setIsViewDialogOpen(true);
  };

  // Reset form
  const resetForm = () => {
    setEventForm({
      name: '',
      date: selectedDate ? selectedDate.toISOString().split('T')[0] : '',
      photo: null,
      photoUrl: '',
      description: ''
    });
    setIsEditMode(false);
    setEditingEvent(null);
  };

  // Handle photo change
  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setEventForm({
        ...eventForm,
        photo: file,
        photoUrl: URL.createObjectURL(file)
      });
    }
  };

  // Get month name
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
    'July', 'August', 'September', 'October', 'November', 'December'];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Color coding for events (cycling through colors)
  const eventColors = [
    'bg-green-500',
    'bg-blue-500',
    'bg-pink-500',
    'bg-purple-500',
    'bg-yellow-500',
    'bg-orange-500',
  ];

  const getEventColor = (event: Event, index: number) => {
    if (event.type === 'exam') return 'bg-blue-600';
    return eventColors[index % eventColors.length];
  };

  const monthlyEvents = useMemo(() => {
    const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    const startMs = monthStart.getTime();
    const endMs = monthEnd.getTime();

    return events
      .filter((event) => {
        const eventStart = new Date(event.startDate || event.date).getTime();
        const eventEnd = new Date(event.endDate || event.date).getTime();
        return eventStart <= endMs && eventEnd >= startMs;
      })
      .sort((a, b) => {
        const aTime = new Date(a.startDate || a.date).getTime();
        const bTime = new Date(b.startDate || b.date).getTime();
        return aTime - bTime;
      });
  }, [events, currentDate]);

  const monthlyEventsByDate = useMemo(() => {
    const grouped = monthlyEvents.reduce<Record<string, Event[]>>((acc, event) => {
      const key = new Date(event.startDate || event.date).toDateString();
      if (!acc[key]) acc[key] = [];
      acc[key].push(event);
      return acc;
    }, {});
    return Object.entries(grouped).sort(
      ([a], [b]) => new Date(a).getTime() - new Date(b).getTime()
    );
  }, [monthlyEvents]);

  return (
    <div className="space-y-3 sm:space-y-4 lg:space-y-6">
      <div className="flex justify-end">
        <Button onClick={goToToday} variant="outline" className="shrink-0">
          Today
        </Button>
      </div>

      {/* Calendar Navigation */}
      <Card>
        <CardContent className="p-3 sm:p-6">
          <div className="flex items-center justify-between gap-2 sm:gap-4 mb-4 sm:mb-6">
            <div className="flex items-center gap-2 sm:gap-4">
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
          </div>

          {/* Mobile agenda */}
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
                      {dayEvents.map((event, idx) => (
                        <button
                          key={event._id || event.id || `${event.name}-${idx}`}
                          type="button"
                          onClick={() => handleViewEvent(event)}
                          className="w-full rounded-md border border-sky-100 bg-sky-50 text-left px-2 py-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs sm:text-sm font-medium text-sky-900 truncate">{event.name}</p>
                            <Badge className={event.type === 'exam' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}>
                              {event.type === 'exam' ? 'Exam' : 'Event'}
                            </Badge>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Calendar Grid (tablet/desktop) */}
          <div className="hidden sm:block overflow-x-auto pb-1">
            <div className="min-w-[700px]">
              <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
                {/* Day Headers */}
                {dayNames.map((day) => (
                  <div key={day} className="text-center text-mini sm:text-sm font-semibold text-gray-600 py-1.5 sm:py-2">
                    <span className="sm:hidden">{day.slice(0, 2)}</span>
                    <span className="hidden sm:inline">{day}</span>
                  </div>
                ))}

                {/* Calendar Days */}
                {calendarDays.map((date, index) => {
                  const dayEvents = getEventsForDate(date);
                  const isCurrentMonthDay = isCurrentMonth(date);
                  const isTodayDate = isToday(date);

                  return (
                    <motion.div
                      key={index}
                      className={`
                        min-h-[64px] sm:min-h-[72px] md:min-h-[84px] border border-gray-200 rounded-lg p-1.5 sm:p-2 cursor-pointer
                        transition-all hover:bg-gray-50 relative
                        ${!isCurrentMonthDay ? 'bg-gray-50 opacity-50' : 'bg-white'}
                        ${isTodayDate ? 'ring-2 ring-orange-500' : ''}
                      `}
                      onClick={() => handleDateClick(date)}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <div
                        className={`
                          text-xs sm:text-sm font-medium mb-1
                          ${isTodayDate ? 'text-orange-600 font-bold' : 'text-gray-700'}
                          ${!isCurrentMonthDay ? 'text-gray-400' : ''}
                        `}
                      >
                        {date.getDate()}
                      </div>

                      {/* Events */}
                      <div className="space-y-1">
                        {dayEvents.slice(0, 3).map((event, eventIndex) => {
                          const eventId = event._id || event.id || `event-${eventIndex}`;
                          return (
                            <div
                              key={eventId}
                              className={`
                                text-micro sm:text-xs px-1.5 py-1 rounded truncate text-white cursor-pointer
                                ${getEventColor(event, eventIndex)}
                                hover:opacity-80
                              `}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleViewEvent(event, e);
                              }}
                              title={event.name}
                            >
                              {event.type === 'exam' ? `Exam: ${event.name}` : event.name}
                            </div>
                          );
                        })}
                        {dayEvents.length > 3 && (
                          <div className="text-micro sm:text-xs text-gray-500 font-medium">
                            +{dayEvents.length - 3} more
                          </div>
                        )}
                        {dayEvents.length === 0 && !isPastDay(date) && (
                          <div className="text-micro sm:text-xs text-gray-400 text-center py-1">
                            Tap to add
                          </div>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </div>

          {!isLoading && (
            <div className="mt-5 border-t border-sky-100 pt-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm sm:text-base font-semibold text-sky-900">This Month Events</h4>
                <span className="text-xs text-sky-600">{monthlyEvents.length} scheduled</span>
              </div>
              {monthlyEvents.length === 0 ? (
                <p className="text-xs sm:text-sm text-gray-500">No events or exams scheduled this month.</p>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {monthlyEvents.map((event, idx) => {
                    const start = new Date(event.startDate || event.date);
                    const end = new Date(event.endDate || event.date);
                    const isRange = start.toDateString() !== end.toDateString();
                    return (
                      <button
                        type="button"
                        key={event._id || event.id || `${event.name}-${idx}`}
                        onClick={() => handleViewEvent(event)}
                        className="w-full text-left rounded-lg border border-sky-100 bg-white hover:bg-sky-50 px-3 py-2 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs sm:text-sm font-medium text-sky-900 truncate">{event.name}</p>
                          <Badge className={event.type === 'exam' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}>
                            {event.type === 'exam' ? 'Exam' : 'Event'}
                          </Badge>
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
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Event Dialog */}
      <Dialog open={isEventDialogOpen} onOpenChange={setIsEventDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEditMode ? 'Edit Event' : 'Add Event'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEventSubmit} className="space-y-4">
            <div>
              <Label htmlFor="event-name">Event Name *</Label>
              <Input
                id="event-name"
                value={eventForm.name}
                onChange={(e) => setEventForm({ ...eventForm, name: e.target.value })}
                placeholder="Enter event name"
                required
              />
            </div>

            <div>
              <Label htmlFor="event-photo">Photo</Label>
              <div className="space-y-2">
                {eventForm.photoUrl && (
                  <div className="relative w-full h-48 rounded-lg overflow-hidden border">
                    <img
                      src={eventForm.photoUrl}
                      alt="Event preview"
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setEventForm({ ...eventForm, photo: null, photoUrl: '' })}
                      className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
                    >
                      <X className="h-3 w-3 sm:h-4 sm:w-4" />
                    </button>
                  </div>
                )}
                <Input
                  id="event-photo"
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoChange}
                  className="cursor-pointer"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="event-description">Description</Label>
              <Textarea
                id="event-description"
                value={eventForm.description}
                onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })}
                placeholder="Enter event description"
                rows={4}
              />
            </div>

            <div className="flex justify-end space-x-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsEventDialogOpen(false);
                  resetForm();
                }}
              >
                Cancel
              </Button>
              <Button type="submit">
                {isEditMode ? 'Update Event' : 'Create Event'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* View Event Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedEvent?.name}</DialogTitle>
          </DialogHeader>
          {selectedEvent && (
            <div className="space-y-4">
              {selectedEvent.photo && (
                <div className="w-full h-64 rounded-lg overflow-hidden">
                  <img
                    src={selectedEvent.photo}
                    alt={selectedEvent.name}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <div>
                <Label>Date</Label>
                <p className="text-gray-700">
                  {new Date(selectedEvent.startDate || selectedEvent.date).toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </p>
              </div>
              {selectedEvent.endDate && selectedEvent.endDate !== selectedEvent.startDate && (
                <div>
                  <Label>End Date</Label>
                  <p className="text-gray-700">
                    {new Date(selectedEvent.endDate).toLocaleDateString('en-US', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </p>
                </div>
              )}
              {selectedEvent.type === 'exam' && (
                <div>
                  <Label>Type</Label>
                  <p className="text-gray-700">Exam ({selectedEvent.examType || 'scheduled'})</p>
                </div>
              )}
              {selectedEvent.description && (
                <div>
                  <Label>Description</Label>
                  <p className="text-gray-700 whitespace-pre-wrap">{selectedEvent.description}</p>
                </div>
              )}
              {selectedEvent.type !== 'exam' ? (
                (() => {
                  const eventDay = new Date(selectedEvent.date);
                  eventDay.setHours(0, 0, 0, 0);
                  const todayStart = new Date();
                  todayStart.setHours(0, 0, 0, 0);
                  const isPastEvent = eventDay < todayStart;
                  if (isPastEvent) {
                    return (
                      <p className="text-sm text-slate-500 text-right">
                        Past events are locked (view only).
                      </p>
                    );
                  }
                  return (
                <div className="flex justify-end space-x-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsViewDialogOpen(false);
                      handleEditEvent(selectedEvent);
                    }}
                  >
                    <Edit className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
                    Edit
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => {
                      setIsViewDialogOpen(false);
                      handleDeleteEvent(selectedEvent);
                    }}
                  >
                    <Trash2 className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
                    Delete
                  </Button>
                </div>
                  );
                })()
              ) : null}
            </div>
          )}
        </DialogContent>
      </Dialog>
      {ConfirmDialog}
    </div>
  );
}

