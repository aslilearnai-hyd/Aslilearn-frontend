import { motion } from 'framer-motion';
import { MapPin, Pencil, User } from 'lucide-react';
import type { TimetableEntry } from '@/types/timetable';
import {
  entryAccentStyle,
  getSubjectTheme,
  isBreakEntry,
  isEntryOngoing,
  refName,
  teacherSlotLabel,
} from '@/lib/student-timetable-utils';
import { cn } from '@/lib/utils';

type TimetableGridCellProps = {
  entries: TimetableEntry[];
  now?: Date;
  compact?: boolean;
  /** Tighter admin period grid: subject + short type, no mid-word wrap clutter */
  dense?: boolean;
  /** Teacher view: show class · section · room instead of subject name */
  labelMode?: 'subject' | 'teacher' | 'admin';
  interactive?: boolean;
  onEntryClick?: (entry: TimetableEntry) => void;
  onEmptyClick?: () => void;
};

function classLabel(entry: TimetableEntry): string {
  if (typeof entry.classId === 'object' && entry.classId) {
    const num = entry.classId.classNumber || '';
    const sec = entry.sectionId || entry.classId.section || '';
    return [num, sec].filter(Boolean).join('-');
  }
  return entry.sectionId || '';
}

function shortSession(entry: TimetableEntry): string {
  if (isBreakEntry(entry)) return 'Break';
  if (entry.sessionType === 'Lab') return 'Lab';
  if (entry.sessionType === 'Activity') return 'Act';
  if (entry.sessionType === 'Exam') return 'Exam';
  return 'Lec';
}

export function TimetableGridCell({
  entries,
  now = new Date(),
  compact,
  dense,
  labelMode = 'subject',
  interactive,
  onEntryClick,
  onEmptyClick,
}: TimetableGridCellProps) {
  if (entries.length === 0) {
    return (
      <div
        role={interactive && onEmptyClick ? 'button' : undefined}
        tabIndex={interactive && onEmptyClick ? 0 : undefined}
        onClick={interactive ? onEmptyClick : undefined}
        onKeyDown={
          interactive && onEmptyClick
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') onEmptyClick();
              }
            : undefined
        }
        className={cn(
          'w-full rounded-md border border-dashed border-gray-100 bg-gray-50/30',
          dense || compact ? 'h-[52px]' : 'min-h-[64px]',
          interactive && onEmptyClick && 'cursor-pointer hover:bg-orange-50/50 hover:border-orange-200',
        )}
      />
    );
  }

  return (
    <div className={cn('flex w-full flex-col gap-1', dense || compact ? 'min-h-[52px]' : 'min-h-[64px]')}>
      {entries.map((entry) => {
        const isTeacher = labelMode === 'teacher';
        const isAdmin = labelMode === 'admin';
        const subject = refName(entry.subjectId) || 'Class';
        const theme = getSubjectTheme(subject);
        const accent = isTeacher ? undefined : entryAccentStyle(entry.colorTag);
        const ongoing = isEntryOngoing(entry, now);
        const primaryLabel = isTeacher ? teacherSlotLabel(entry) : subject;
        const cls = classLabel(entry);
        const teacherName = refName(entry.teacherId);
        const showTeacher = !dense && !isTeacher && !!teacherName;

        return (
          <motion.div
            key={entry._id}
            layout
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ scale: 1.01 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            onClick={interactive && onEntryClick ? () => onEntryClick(entry) : undefined}
            style={accent}
            title={`${primaryLabel}${teacherName ? ` · ${teacherName}` : ''} · ${entry.startTime}–${entry.endTime}`}
            className={cn(
              'relative rounded-lg border shadow-sm overflow-hidden group',
              interactive && onEntryClick ? 'cursor-pointer' : 'cursor-default',
              dense ? 'px-1.5 py-1.5' : compact ? 'p-1.5' : 'p-2',
              isTeacher && 'bg-[#F0EBFF] border-violet-200/70',
              !isTeacher && !accent && 'bg-gradient-to-br',
              !isTeacher && !accent && theme.bg,
              !isTeacher && !accent && theme.border,
              !isTeacher && !accent && theme.gradient,
              !isTeacher && accent && 'border-2',
              ongoing && 'ring-2 ring-orange-400 ring-offset-1 shadow-md z-[1]',
            )}
          >
            {interactive && onEntryClick ? (
              <span className="absolute top-1 right-1 z-[2] rounded-md bg-white/95 p-0.5 text-orange-700 opacity-0 shadow-sm group-hover:opacity-100 transition-opacity">
                <Pencil className="w-3 h-3" />
              </span>
            ) : null}
            {isAdmin && cls ? (
              <p className="text-[9px] font-bold text-orange-700 mb-0.5 tracking-wide">{cls}</p>
            ) : null}

            <p
              className={cn(
                'font-bold leading-snug break-words hyphens-none',
                dense
                  ? 'text-[11px] line-clamp-2'
                  : compact
                    ? 'text-[10px] sm:text-[11px] line-clamp-2'
                    : 'text-[11px] sm:text-xs line-clamp-2',
                isTeacher ? 'text-[#6C5CE7]' : theme.text,
              )}
            >
              {primaryLabel}
            </p>

            {showTeacher && (
              <p className="text-[10px] text-gray-600 mt-0.5 flex items-center gap-1 truncate">
                <User className="w-3 h-3 shrink-0 text-gray-400" />
                <span className="truncate">{teacherName}</span>
              </p>
            )}

            {!dense && !compact && !isTeacher && entry.room && entry.room !== 'TBD' && (
              <p className="text-[10px] text-gray-600 flex items-center gap-1 truncate">
                <MapPin className="w-3 h-3 shrink-0 text-gray-400" />
                <span className="truncate">{entry.room}</span>
              </p>
            )}

            <p
              className={cn(
                'font-semibold mt-0.5',
                dense ? 'text-[9px] text-gray-500' : 'text-[9px]',
                isTeacher ? 'text-[#6C5CE7]/85' : 'text-gray-500',
              )}
            >
              {shortSession(entry)}
            </p>
          </motion.div>
        );
      })}
    </div>
  );
}

export default TimetableGridCell;
