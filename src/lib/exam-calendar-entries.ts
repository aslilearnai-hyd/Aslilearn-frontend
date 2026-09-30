export function formatCalendarDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseCalendarDate(value: unknown): Date | null {
  if (!value) return null;
  const date = new Date(value as string | number | Date);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getExamSubjectLabel(exam: any): string {
  if (typeof exam?.subject === 'string' && exam.subject.trim()) {
    return exam.subject;
  }
  if (Array.isArray(exam?.subjects) && exam.subjects.length > 0) {
    return exam.subjects.join(', ');
  }
  return exam?.subject?.name || 'Exam';
}

/** Each calendar day from startDate through endDate (inclusive, local midnight steps). */
export function eachLocalDayInRange(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const endDay = new Date(end);
  endDay.setHours(0, 0, 0, 0);
  while (cursor.getTime() <= endDay.getTime()) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

/** Start + end calendar days only (same day → one entry). Used for exam red-dot markers. */
export function examMarkerDays(start: Date, end: Date): Date[] {
  const startDay = new Date(start);
  startDay.setHours(0, 0, 0, 0);
  const endDay = new Date(end);
  endDay.setHours(0, 0, 0, 0);
  if (startDay.getTime() === endDay.getTime()) return [startDay];
  return [startDay, endDay];
}

export function isDateWithinExamWindow(day: Date, exam: any): boolean {
  const start = parseCalendarDate(exam?.startDate);
  if (!start) return false;
  const end = parseCalendarDate(exam?.endDate) || start;
  const key = formatCalendarDateKey(day);
  const startKey = formatCalendarDateKey(start);
  const endKey = formatCalendarDateKey(end);
  return key >= startKey && key <= endKey;
}

/** True when day is the exam open or close date (calendar red-dot days). */
export function isExamMarkerDate(day: Date, exam: any): boolean {
  const start = parseCalendarDate(exam?.startDate);
  if (!start) return false;
  const end = parseCalendarDate(exam?.endDate) || start;
  const key = formatCalendarDateKey(day);
  const startKey = formatCalendarDateKey(start);
  const endKey = formatCalendarDateKey(end);
  return key === startKey || key === endKey;
}

export type ExamCalendarEntry = {
  id: string;
  type: 'exam';
  title: string;
  subject: string;
  date: Date;
  source: any;
};

/** One calendar marker on start date and one on end date (not every day in between). */
export function buildExamCalendarEntries(exams: any[]): ExamCalendarEntry[] {
  const entries: ExamCalendarEntry[] = [];

  for (const exam of exams) {
    const start = parseCalendarDate(exam?.startDate);
    const end = parseCalendarDate(exam?.endDate) || start;
    if (!start || !end) continue;

    const examId = String(exam._id || exam.id || '');
    if (!examId) continue;

    for (const day of examMarkerDays(start, end)) {
      const slot = new Date(day);
      const isEnd =
        formatCalendarDateKey(day) === formatCalendarDateKey(end) &&
        formatCalendarDateKey(start) !== formatCalendarDateKey(end);
      // Start marker uses open time; end marker uses close time
      if (isEnd) {
        slot.setHours(end.getHours(), end.getMinutes(), 0, 0);
      } else {
        slot.setHours(start.getHours(), start.getMinutes(), 0, 0);
      }
      entries.push({
        id: examId,
        type: 'exam',
        title: exam.title || exam.examTitle || 'Exam',
        subject: getExamSubjectLabel(exam),
        date: slot,
        source: exam,
      });
    }
  }

  return entries;
}

export type SchoolEventCalendarEntry = {
  id: string;
  type: 'event';
  title: string;
  subject: string;
  date: Date;
  source: any;
  description?: string;
};

export function buildSchoolEventCalendarEntries(events: any[]): SchoolEventCalendarEntry[] {
  const entries: SchoolEventCalendarEntry[] = [];
  for (const event of events) {
    const title = String(event?.title || event?.name || 'School event');
    const start = parseCalendarDate(event?.startDate || event?.date);
    const end = parseCalendarDate(event?.endDate || event?.startDate || event?.date) || start;
    if (!start || !end) continue;
    const id = String(event?.id || event?._id || title);
    for (const day of eachLocalDayInRange(start, end)) {
      const slot = new Date(day);
      slot.setHours(start.getHours(), start.getMinutes(), 0, 0);
      entries.push({
        id,
        type: 'event',
        title,
        subject: 'School event',
        date: slot,
        source: event,
        description: String(event?.description || ''),
      });
    }
  }
  return entries;
}
