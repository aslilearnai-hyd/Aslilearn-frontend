import { normalizeBoardKey } from '@/lib/board-label';

/** Parse Super Admin style subject keys, e.g. Chemistry_10 → class "10", plain "Chemistry". */

export function extractClassNumberFromSubjectName(name: string): string | null {
  const base = String(name || '').split('__deleted__')[0].trim();
  const match = base.match(/_(\d+)$/);
  return match ? match[1] : null;
}

/** True when subject was soft-deleted in Super Admin (name contains __deleted__). */
export function isSoftDeletedSubjectName(name: string): boolean {
  return String(name || '').includes('__deleted__');
}

export function extractPlainSubjectName(name: string): string {
  const base = String(name || '').split('__deleted__')[0].trim();
  const match = base.match(/^(.+?)_\d+$/);
  return match ? match[1] : base;
}

/** Human-readable label for teacher cards, class rows, etc. (BIO → Biology, Biology_7 → Biology). */
export function formatSubjectDisplayLabel(name: string): string {
  const raw = (name || '').trim();
  if (!raw) return '';
  const plain = extractPlainSubjectName(raw).trim();
  const lower = plain.toLowerCase();
  const classNum = extractClassNumberFromSubjectName(raw);

  if (lower === 'bio' || lower === 'biology') {
    return classNum ? `Biology (Class ${classNum})` : 'Biology';
  }

  if (classNum && plain) {
    const titled = plain.charAt(0).toUpperCase() + plain.slice(1);
    return `${titled} (Class ${classNum})`;
  }

  return plain;
}

/**
 * Subject label with IIT track when set — e.g. Physics → "Physics IIT Alpha".
 * Does not append anything for General / empty productCategory.
 */
export function formatSubjectWithIitCategory(
  name: string,
  productCategory?: string | null,
  labelMap?: Record<string, string>,
): string {
  const base = formatSubjectDisplayLabel(name) || displaySubjectName(name) || String(name || '').trim();
  if (!base) return '';

  const rawCat = String(productCategory || '')
    .toUpperCase()
    .trim()
    .replace(/^IIT_/, '');
  if (!rawCat || rawCat === 'GENERAL' || rawCat === 'NONE' || rawCat === 'ALL') {
    return base;
  }

  const trackLabel = labelMap?.[rawCat]
    ? String(labelMap[rawCat])
    : rawCat
        .split('_')
        .map((p) => p.charAt(0) + p.slice(1).toLowerCase())
        .join(' ');

  const already = new RegExp(`\\biit(?:\\s*/\\s*neet)?\\s+${trackLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(base);
  if (already) return base;
  // The IIT track is the IIT / NEET programme: "Biology · IIT / NEET Alpha".
  return `${base.replace(/\s+IIT$/i, '')} · IIT / NEET ${trackLabel}`;
}

export function normalizeSubjectDisplayKey(name: string): string {
  const plain = extractPlainSubjectName(name || '')
    .trim()
    .toLowerCase()
    .replace(/\b(iit|neet|jee)\b/g, ' ')
    .replace(/[-_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (plain === 'bio' || plain === 'biology') return 'biology';
  if (plain === 'math' || plain === 'maths' || plain === 'mat' || plain === 'mathematics') {
    return 'math';
  }
  if (plain === 'phy' || plain === 'physics') return 'physics';
  if (plain === 'chem' || plain === 'chemistry') return 'chemistry';
  if (plain === 'sci' || plain === 'science' || plain === 'evs') return 'science';
  if (
    plain === 'sst' ||
    plain === 'social' ||
    plain === 'social science' ||
    plain === 'social studies' ||
    plain === 'history' ||
    plain === 'geography' ||
    plain === 'civics' ||
    plain === 'economics'
  ) {
    return 'social';
  }
  if (plain === 'computer' || plain === 'computers' || plain === 'cs' || plain === 'it') {
    return 'computer';
  }
  if (plain === 'eng' || plain === 'english') return 'english';
  return plain;
}

/** Canonical bucket for teacher learning-path cards (one card per subject name). */
export function subjectCatalogGroupKey(name: string): string {
  return normalizeSubjectDisplayKey(name || '');
}

/** Active catalog row (not soft-deleted / inactive). */
export function isActiveCatalogSubject(subject: {
  name?: string;
  isActive?: boolean;
}): boolean {
  if (subject.isActive === false) return false;
  if (isSoftDeletedSubjectName(subject.name || '')) return false;
  return true;
}

/** Strip soft-delete suffix and class suffix for display (e.g. Chemistry_10 → Chemistry). */
export function displaySubjectName(name: string): string {
  const base = String(name || '').split('__deleted__')[0].trim();
  return extractPlainSubjectName(base) || base;
}

export function getSubjectClassLabel(subject: {
  name?: string;
  classNumber?: string;
}): string | null {
  if (subject.classNumber != null && String(subject.classNumber).trim() !== '') {
    return String(subject.classNumber).trim();
  }
  return extractClassNumberFromSubjectName(subject.name || '');
}

/** When Subject has no classNumber / _N suffix, use class from linked prep content (common for 11–12). */
export function inferClassNumberFromPrepContent(
  items: Array<{ classNumber?: string }> | undefined
): string | null {
  if (!items || !Array.isArray(items)) return null;
  for (const item of items) {
    const cn =
      item?.classNumber != null && String(item.classNumber).trim() !== ''
        ? String(item.classNumber).trim()
        : null;
    if (cn) return cn;
  }
  return null;
}

/** Admin Learning Paths: subject row may only have class on Content documents (e.g. Class 11 Chemistry). */
export function getLearningPathClassLabel(subject: {
  name?: string;
  classNumber?: string;
  asliPrepContent?: Array<{ classNumber?: string }>;
}): string | null {
  const fromSubject = getSubjectClassLabel(subject);
  if (fromSubject) return fromSubject;
  return inferClassNumberFromPrepContent(subject.asliPrepContent);
}

/** Board track for a learning-path row (CBSE vs IIT/NEET must not merge). */
export function getLearningPathBoardLabel(subject: {
  board?: string;
  asliPrepContent?: Array<{
    board?: string;
    subject?: { board?: string } | string;
  }>;
}): string {
  if (subject.board != null && String(subject.board).trim() !== '') {
    return normalizeBoardKey(String(subject.board));
  }
  if (!Array.isArray(subject.asliPrepContent)) return '';
  for (const item of subject.asliPrepContent) {
    const fromItem = item?.board;
    if (fromItem != null && String(fromItem).trim() !== '') {
      return normalizeBoardKey(String(fromItem));
    }
    const subj = item?.subject;
    if (subj != null && typeof subj === 'object' && subj.board) {
      return normalizeBoardKey(String(subj.board));
    }
  }
  return '';
}

export type TeacherVidyaSubjectSelectOption = {
  /** Original assigned subject name (sent to Vidya). */
  value: string;
  /** Clean label without BIO / Maths / Chemistry_8 noise. */
  label: string;
  /** Dropdown group for easy scanning. */
  group: 'CBSE' | 'IIT' | 'Other';
};

const CANONICAL_SUBJECT_LABELS: Record<string, string> = {
  biology: 'Biology',
  math: 'Mathematics',
  physics: 'Physics',
  chemistry: 'Chemistry',
  science: 'Science',
  english: 'English',
  social: 'Social Science',
  computer: 'Computer Science',
  hindi: 'Hindi',
  telugu: 'Telugu',
};

function titleCaseSubjectWords(value: string): string {
  return String(value || '')
    .replace(/\biit\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/** Clean subject label for teacher Vidya / lesson dropdowns. */
export function canonicalTeacherSubjectLabel(name: string): string {
  const key = normalizeSubjectDisplayKey(name);
  if (CANONICAL_SUBJECT_LABELS[key]) return CANONICAL_SUBJECT_LABELS[key];
  const plain = extractPlainSubjectName(String(name || ''))
    .replace(/\b(iit|neet|jee)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return titleCaseSubjectWords(plain) || String(name || '').trim();
}

export function isIitTeacherSubjectTrack(subject: {
  name?: string;
  board?: string;
  productCategory?: string;
}): boolean {
  const board = normalizeBoardKey(String(subject.board || ''));
  if (board.includes('IIT') || board.includes('NEET') || board.includes('JEE')) return true;
  const name = String(subject.name || '');
  if (/\b(iit|neet|jee)\b/i.test(name)) return true;
  const cat = String(subject.productCategory || '')
    .toUpperCase()
    .trim()
    .replace(/^IIT_/, '');
  if (cat && cat !== 'GENERAL' && cat !== 'NONE' && cat !== 'ALL') return true;
  return false;
}

function teacherSubjectValueScore(name: string): number {
  const raw = String(name || '').trim();
  const plain = extractPlainSubjectName(raw);
  let score = plain.length;
  if (!/_\d+$/.test(raw)) score += 40;
  if (!/\b(iit|neet|jee)\b/i.test(raw)) score += 5;
  if (/^(biology|mathematics|chemistry|physics|science|english)/i.test(plain)) score += 25;
  if (/^(bio|maths|math|chem|phy|sci)$/i.test(plain)) score -= 30;
  return score;
}

/**
 * Dedupes BIO/Biology, Maths/Mathematics, Chemistry_8/9 into one clean option
 * per CBSE vs IIT track for the teacher Vidya subject picker.
 */
export function buildTeacherVidyaSubjectSelectOptions(
  subjects: Array<{ name?: string; board?: string; productCategory?: string } | string>,
): TeacherVidyaSubjectSelectOption[] {
  const best = new Map<
    string,
    { value: string; label: string; group: TeacherVidyaSubjectSelectOption['group']; score: number }
  >();

  for (const row of subjects || []) {
    const subject =
      typeof row === 'string'
        ? { name: row }
        : {
            name: row?.name,
            board: row?.board,
            productCategory: row?.productCategory,
          };
    const value = String(subject.name || '').trim();
    if (!value) continue;

    const resolvedGroup: TeacherVidyaSubjectSelectOption['group'] = isIitTeacherSubjectTrack(subject)
      ? 'IIT'
      : 'CBSE';

    const label = canonicalTeacherSubjectLabel(value);
    const key = `${resolvedGroup}|${normalizeSubjectDisplayKey(value)}`;
    const score = teacherSubjectValueScore(value);
    const prev = best.get(key);
    if (!prev || score > prev.score) {
      best.set(key, { value, label, group: resolvedGroup, score });
    }
  }

  const groupOrder: Record<TeacherVidyaSubjectSelectOption['group'], number> = {
    CBSE: 0,
    IIT: 1,
    Other: 2,
  };

  return [...best.values()]
    .map(({ value, label, group }) => ({ value, label, group }))
    .sort((a, b) => {
      const g = groupOrder[a.group] - groupOrder[b.group];
      if (g !== 0) return g;
      return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
    });
}

export type HomeworkSubjectOption = { value: string; label: string };

/**
 * One option per subject for Create Homework ("BIO", "Biology", "Biology" →
 * "Biology"; "Physics IIT" → "Physics · IIT / NEET"). The server accepts any
 * sibling id of a subject group, so keeping one id per label is safe; the
 * copy for the selected class wins.
 */
export type HomeworkBoardTrack = 'school' | 'iit';

/** Which boards a teacher's subjects span: the school board and/or IIT / NEET. */
export function homeworkBoardTracks(
  subjects: Array<{ name?: string; board?: string; productCategory?: string }>,
): { school: boolean; iit: boolean; schoolBoard: string } {
  let school = false;
  let iit = false;
  const boards = new Map<string, number>();
  for (const subject of subjects || []) {
    if (!String(subject?.name || '').trim()) continue;
    if (isIitTeacherSubjectTrack(subject)) {
      iit = true;
    } else {
      school = true;
      const b = String(subject?.board || '').toUpperCase().trim();
      if (b && b !== 'ASLI_EXCLUSIVE_SCHOOLS') boards.set(b, (boards.get(b) || 0) + 1);
    }
  }
  const schoolBoard = [...boards.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'CBSE';
  return { school, iit, schoolBoard };
}

export function buildHomeworkSubjectOptions(
  subjects: Array<{ _id?: string; id?: string; name?: string; board?: string; productCategory?: string; classNumber?: string | number }>,
  classNumber?: string,
  track?: HomeworkBoardTrack,
): HomeworkSubjectOption[] {
  const wantClass = String(classNumber || '').replace(/\D/g, '');
  const best = new Map<string, HomeworkSubjectOption & { score: number }>();
  for (const subject of subjects || []) {
    const value = String(subject?._id || subject?.id || '').trim();
    const name = String(subject?.name || '').trim();
    if (!value || !name) continue;
    const iit = isIitTeacherSubjectTrack(subject);
    // With a board picked, only that board's subjects, under their plain name.
    if (track && (track === 'iit') !== iit) continue;
    const label = track ? canonicalTeacherSubjectLabel(name) : `${canonicalTeacherSubjectLabel(name)}${iit ? ' · IIT / NEET' : ''}`;
    const key = label.toLowerCase();
    const ownClass = String(subject?.classNumber ?? (name.match(/_(\d{1,2})$/) || [])[1] ?? '').replace(/\D/g, '');
    const score = (wantClass && ownClass === wantClass ? 100 : 0) + teacherSubjectValueScore(name);
    const prev = best.get(key);
    if (!prev || score > prev.score) best.set(key, { value, label, score });
  }
  return [...best.values()]
    .map(({ value, label }) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
}
