import { normalizeBoardKey } from '@/lib/board-label';
import { learningPathDisplayName } from '@/lib/learning-path-subjects';
import {
  extractClassNumberFromSubjectName,
  extractPlainSubjectName,
  formatSubjectWithIitCategory,
  normalizeSubjectDisplayKey,
} from '@/lib/subject-names';

export type LibrarySubjectRef = {
  _id?: string;
  id?: string;
  name?: string;
  classNumber?: string | number | null;
  productCategory?: string | null;
  board?: string | null;
};

export type LibraryContentLike = {
  title?: string | null;
  topic?: string | null;
  type?: string | null;
  classNumber?: string | number | null;
  productCategory?: string | null;
  board?: string | null;
  subject?: LibrarySubjectRef | string | null;
  subjectId?: LibrarySubjectRef | string | null;
  subjectName?: string | null;
};

function asSubjectRef(
  value: LibraryContentLike['subject'] | LibraryContentLike['subjectId'],
): LibrarySubjectRef | null {
  if (!value) return null;
  if (typeof value === 'string') return { _id: value };
  return value;
}

export function getLibraryContentSubjectId(row: LibraryContentLike): string {
  const subject = asSubjectRef(row.subject) || asSubjectRef(row.subjectId);
  return String(subject?._id || subject?.id || '').trim();
}

/** Raw subject name for alias matching (Social studies ↔ Social Science). */
export function getLibraryContentSubjectRawName(row: LibraryContentLike): string {
  const subject = asSubjectRef(row.subject) || asSubjectRef(row.subjectId);
  const fromRef = String(subject?.name || '').trim();
  if (fromRef) return fromRef;
  return String(row.subjectName || '').trim();
}

export function getLibraryContentSubjectKey(row: LibraryContentLike): string {
  return normalizeSubjectDisplayKey(getLibraryContentSubjectRawName(row));
}

/**
 * Match library content to a Learning Paths subject card.
 * Uses assigned/merged subject IDs and subject-name aliases (backend sibling subjects
 * often have different Mongo IDs than the student's assigned subject).
 */
export function libraryContentMatchesSubject(
  row: LibraryContentLike,
  subject: {
    _id?: string;
    id?: string;
    name?: string;
    mergedSubjectIds?: string[];
  },
): boolean {
  const subjectIds = new Set(
    [subject._id, subject.id, ...(subject.mergedSubjectIds || [])]
      .map((id) => String(id || '').trim())
      .filter(Boolean),
  );
  const contentId = getLibraryContentSubjectId(row);
  if (contentId && subjectIds.has(contentId)) return true;

  const subjectKey = normalizeSubjectDisplayKey(subject.name || '');
  const contentKey = getLibraryContentSubjectKey(row);
  return Boolean(subjectKey && contentKey && subjectKey === contentKey);
}

export function getLibraryContentProductCategory(row: LibraryContentLike): string {
  const direct = String(row.productCategory || '')
    .trim()
    .toUpperCase();
  if (direct && direct !== 'GENERAL' && direct !== 'NONE' && direct !== 'ALL') {
    return direct;
  }
  const subject = asSubjectRef(row.subject) || asSubjectRef(row.subjectId);
  const fromSubject = String(subject?.productCategory || '')
    .trim()
    .toUpperCase();
  if (fromSubject && fromSubject !== 'GENERAL' && fromSubject !== 'NONE' && fromSubject !== 'ALL') {
    return fromSubject;
  }
  return '';
}

function contentBoardKey(row: LibraryContentLike): string {
  const direct = normalizeBoardKey(String(row.board || ''));
  if (direct) return direct;
  const subject = asSubjectRef(row.subject) || asSubjectRef(row.subjectId);
  return normalizeBoardKey(String(subject?.board || ''));
}

/** IIT-board or Alpha/Beta/Gamma track materials (videos stay EduOTT). */
export function isIitTrackContent(row: LibraryContentLike): boolean {
  if (getLibraryContentProductCategory(row)) return true;
  const board = contentBoardKey(row);
  return board === 'IIT' || board === 'IIT/NEET';
}

/**
 * Keep a row on an opened subject page (Maths must not list Biology IIT).
 * IIT rows without a subject name are excluded; board rows without a name stay.
 */
export function libraryContentBelongsToOpenedSubject(
  row: LibraryContentLike,
  openedSubjectName?: string,
): boolean {
  const openedKey = normalizeSubjectDisplayKey(openedSubjectName || '');
  if (!openedKey) return true;
  const contentKey = getLibraryContentSubjectKey(row);
  if (contentKey) return contentKey === openedKey;
  return !isIitTrackContent(row);
}

export function getLibraryContentSubjectName(row: LibraryContentLike): string {
  const raw = getLibraryContentSubjectRawName(row);
  if (raw) return learningPathDisplayName(raw) || extractPlainSubjectName(raw);
  return '';
}

export function normalizeLibraryClassNumber(value: unknown): string {
  const trimmed = value != null ? String(value).trim() : '';
  if (!trimmed) return '';
  const withoutPrefix = trimmed.replace(/^class\s+/i, '').trim();
  const parsed = parseInt(withoutPrefix, 10);
  if (!Number.isNaN(parsed) && parsed > 0) return String(parsed);
  return withoutPrefix || trimmed;
}

export function getLibraryContentClassNumber(row: LibraryContentLike): string {
  const direct = normalizeLibraryClassNumber(row.classNumber);
  if (direct) return direct;
  const subject = asSubjectRef(row.subject) || asSubjectRef(row.subjectId);
  const fromSubject = normalizeLibraryClassNumber(subject?.classNumber);
  if (fromSubject) return fromSubject;
  return extractClassNumberFromSubjectName(getLibraryContentSubjectRawName(row)) || '';
}

export function formatLibraryContentClassLabel(
  row: LibraryContentLike,
  fallbackClassNumber?: string | number | null,
): string {
  const n =
    getLibraryContentClassNumber(row) ||
    normalizeLibraryClassNumber(fallbackClassNumber);
  if (!n) return '';
  return /^class\b/i.test(n) ? n : `Class ${n}`;
}

/** e.g. "Class 6 · English" or "Class 9 · Mathematics IIT Alpha" — shown while viewing. */
export function formatLibraryContentContextLabel(
  row: LibraryContentLike,
  opts?: { fallbackSubjectName?: string; fallbackClassNumber?: string | number | null },
): string {
  const classLabel = formatLibraryContentClassLabel(row, opts?.fallbackClassNumber);
  const subject = isIitTrackContent(row)
    ? formatIitLearningPathContentLabel(row, opts?.fallbackSubjectName)
    : getLibraryContentSubjectName(row) ||
      learningPathDisplayName(opts?.fallbackSubjectName || '') ||
      '';
  return [classLabel, subject].filter(Boolean).join(' · ');
}

/** e.g. Biology IIT Alpha — used under the Learning Paths IIT section. */
export function formatIitLearningPathContentLabel(
  row: LibraryContentLike,
  fallbackSubjectName?: string,
): string {
  const subjectName =
    getLibraryContentSubjectName(row) ||
    learningPathDisplayName(fallbackSubjectName || '') ||
    'Subject';
  const cat = getLibraryContentProductCategory(row);
  if (!cat) return `${subjectName.replace(/\s+IIT$/i, '')} · IIT / NEET`;
  return formatSubjectWithIitCategory(subjectName, cat);
}
