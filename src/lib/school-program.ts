/**
 * School program content rules for students, teachers, and school admins only.
 * Super Admin content management does NOT use these filters — all types are allowed there.
 */
export type ContentTypeName =
  | 'Video'
  | 'Audio'
  | 'TextBook'
  | 'Workbook'
  | 'Material'
  | 'Homework';

export const ALL_CONTENT_TYPES: ContentTypeName[] = [
  'Video',
  'Audio',
  'TextBook',
  'Workbook',
  'Material',
  'Homework',
];

/** Curriculum / normal schools (when isAsliPrepExclusive is false). */
export const NORMAL_SCHOOL_CONTENT_TYPES: ContentTypeName[] = [
  'Audio',
  'TextBook',
  'Homework',
];

export function resolveIsAsliPrepExclusive(user?: {
  isAsliPrepExclusive?: boolean;
  board?: string;
  assignedAdmin?: { isAsliPrepExclusive?: boolean; board?: string };
} | null): boolean {
  if (!user) return false;
  if (user.isAsliPrepExclusive === true) return true;
  if (user.assignedAdmin?.isAsliPrepExclusive === true) return true;
  if (user.board === 'ASLI_EXCLUSIVE_SCHOOLS') return true;
  if (user.assignedAdmin?.board === 'ASLI_EXCLUSIVE_SCHOOLS') return true;
  return false;
}

/** Types a student/teacher/school admin may browse — based on school program, not subject board. */
export function getAllowedContentTypes(isAsliPrepExclusive: boolean): ContentTypeName[] {
  return isAsliPrepExclusive ? [...ALL_CONTENT_TYPES] : [...NORMAL_SCHOOL_CONTENT_TYPES];
}

export function isAllowedContentType(
  type: string | undefined,
  isAsliPrepExclusive: boolean,
): boolean {
  return getAllowedContentTypes(isAsliPrepExclusive).includes(
    String(type || '').trim() as ContentTypeName,
  );
}

export function filterContentsBySchoolProgram<T extends { type?: string }>(
  contents: T[],
  isAsliPrepExclusive: boolean,
): T[] {
  if (!Array.isArray(contents)) return [];
  return contents.filter((row) => isAllowedContentType(row?.type, isAsliPrepExclusive));
}

const CURRICULUM_BOARDS = ['CBSE', 'STATE', 'SSC', 'ICSE', 'IB', 'CAMBRIDGE'] as const;

function isHubBoardCode(code: string): boolean {
  return code === 'ASLI_EXCLUSIVE_SCHOOLS' || code === 'IIT';
}

function isCurriculumBoardCode(code: string): boolean {
  if (!code || isHubBoardCode(code)) return false;
  if ((CURRICULUM_BOARDS as readonly string[]).includes(code)) return true;
  // Dynamic state boards (TELANGANA, etc.) are valid curriculum codes.
  return /^[A-Z][A-Z0-9_/.-]{1,47}$/.test(code);
}

/** School curriculum board for AI tools (never IIT / ASLI_EXCLUSIVE_SCHOOLS). */
export function resolveCurriculumBoardForAiTools(user?: {
  curriculumBoard?: string;
  board?: string;
  assignedAdmin?: { curriculumBoard?: string; board?: string };
} | null): string {
  const candidates = [
    user?.curriculumBoard,
    user?.assignedAdmin?.curriculumBoard,
    user?.board,
    user?.assignedAdmin?.board,
  ];
  for (const value of candidates) {
    const raw = String(value || '').toUpperCase().trim();
    if (isCurriculumBoardCode(raw)) return raw;
  }
  return 'CBSE';
}

/** AI Tools board dropdown: curriculum always; IIT only when Asli Prep is on. */
export function getAiToolBoardOptions(
  isAsliPrepExclusive: boolean,
  curriculumBoard: string,
): string[] {
  const curriculum = resolveCurriculumBoardForAiTools({ curriculumBoard });
  const options = [curriculum];
  if (isAsliPrepExclusive && !options.includes('IIT')) {
    options.push('IIT');
  }
  return options;
}

/** Display name for an AI tool board value ("IIT" is the IIT / NEET track). */
export function aiToolBoardLabel(board: string): string {
  const compact = String(board || '').toUpperCase().replace(/[\s/\\-]+/g, '');
  if (compact === 'IIT' || compact === 'IITNEET' || compact === 'NEET') return 'IIT / NEET';
  return board;
}

/** Default AI tool board is always the school's curriculum board. */
export function getDefaultAiToolBoard(
  _isAsliPrepExclusive: boolean,
  curriculumBoard: string,
): string {
  return resolveCurriculumBoardForAiTools({ curriculumBoard });
}

/** Parse "Class 6", legacy IIT-6, etc. to a numeric class for API requests. */
export function parseAiToolClassNumber(classLabel: string | undefined): number | undefined {
  const gl = String(classLabel || '').trim();
  if (!gl) return undefined;
  if (gl === 'IIT-6' || gl === 'Class-6-IIT') return 6;
  const n = parseInt(gl.replace(/Class\s*/i, ''), 10);
  return Number.isFinite(n) ? n : undefined;
}

/** Board IIT does not change the class label — Class 6 stays Class 6. */
export function mapGradeLevelForIitBoard(
  board: string | undefined,
  gradeLevel: string | undefined,
): string | undefined {
  return gradeLevel;
}

const STUDENT_CLASS_OPTIONS = ['Class 6', 'Class 7', 'Class 8', 'Class 10'];

export function resolveStudentCurriculumGradeLevel(user?: {
  assignedClass?: { classNumber?: string };
  classNumber?: string;
} | null): string | undefined {
  const studentClass = user?.assignedClass?.classNumber || user?.classNumber;
  if (!studentClass) return undefined;

  let classValue = studentClass.toString().trim();
  classValue = classValue.replace(/^Class\s*/i, '');
  const classNum = classValue.replace(/[^-\d]/g, '');
  const absNum = Math.abs(parseInt(classNum, 10));

  if (!isNaN(absNum) && absNum >= 6 && absNum <= 12) {
    const mappedClass = `Class ${absNum}`;
    if (STUDENT_CLASS_OPTIONS.includes(mappedClass)) return mappedClass;
  } else if (classValue.toLowerCase().includes('dropper')) {
    return 'Dropper Batch';
  } else if (
    classValue.toLowerCase().includes('iit') ||
    classValue === 'IIT-6' ||
    classValue === 'Class-6-IIT'
  ) {
    return 'Class 6';
  }

  return undefined;
}

export function resolveIitBoardGradeLevel(classOptions: string[]): string {
  return classOptions.find((c) => /iit/i.test(c)) || 'Class 6';
}

export function resolveSchoolIitCategories(user?: {
  iitCategories?: string[];
  assignedAdmin?: { iitCategories?: string[] };
} | null): string[] {
  const fromAdmin = user?.assignedAdmin?.iitCategories;
  const fromUser = user?.iitCategories;
  const list = Array.isArray(fromAdmin) && fromAdmin.length ? fromAdmin : fromUser;
  if (!Array.isArray(list)) return [];
  return list.map((c) => String(c || '').toUpperCase().trim()).filter(Boolean);
}

/**
 * IIT Track dropdown: only when Board is IIT/NEET/JEE AND the school has
 * 2+ assigned product categories. One track (or none) → do not show the field.
 */
export function shouldShowIitTrackField(
  board?: string | null,
  schoolIitCategories?: string[] | null,
): boolean {
  const compact = String(board || '')
    .toUpperCase()
    .replace(/[\s/\\-]+/g, '');
  const isIitBoard =
    compact === 'IIT' ||
    compact.includes('IIT') ||
    compact.includes('NEET') ||
    compact.includes('JEE');
  if (!isIitBoard) return false;

  const unique = new Set(
    (schoolIitCategories || [])
      .map((c) => String(c || '').toUpperCase().trim())
      .filter(Boolean),
  );
  return unique.size >= 2;
}

export function schoolCanAccessProductCategory(
  schoolIitCategories: string[] | undefined,
  productCategory?: string | null,
): boolean {
  const cat = String(productCategory || '').toUpperCase().trim();
  if (!cat) return true;
  const allowed = new Set(
    (schoolIitCategories || []).map((c) => String(c || '').toUpperCase().trim()).filter(Boolean),
  );
  return allowed.has(cat);
}

export function filterByProductCategory<T extends {
  productCategory?: string | null;
  subject?: { productCategory?: string | null } | null;
}>(rows: T[], schoolIitCategories?: string[]): T[] {
  if (!Array.isArray(rows)) return [];
  return rows.filter((row) =>
    schoolCanAccessProductCategory(
      schoolIitCategories,
      row.productCategory || row.subject?.productCategory || '',
    ),
  );
}

/** Video tied to IIT board or an IIT product track. */
export function isIitTrackVideo(row: {
  type?: string;
  board?: string;
  productCategory?: string | null;
  subject?: { board?: string; productCategory?: string | null } | null;
}): boolean {
  if (String(row?.type || '').trim() !== 'Video') return false;
  const boardRaw = String(row?.board || row?.subject?.board || '')
    .toUpperCase()
    .trim();
  const boardCompact = boardRaw.replace(/[\s/\\-]+/g, '');
  if (
    boardRaw === 'IIT' ||
    boardRaw === 'IIT/NEET' ||
    boardCompact.includes('IIT') ||
    boardCompact.includes('NEET') ||
    boardCompact.includes('JEE')
  ) {
    return true;
  }
  const cat = String(row?.productCategory || row?.subject?.productCategory || '')
    .toUpperCase()
    .trim();
  return Boolean(cat);
}

export function filterVideosForEduOtt<T extends Parameters<typeof isIitTrackVideo>[0]>(
  rows: T[],
): T[] {
  if (!Array.isArray(rows)) return [];
  return rows.filter((row) => isIitTrackVideo(row));
}

export function filterVideosForLearningPath<T extends Parameters<typeof isIitTrackVideo>[0]>(
  rows: T[],
): T[] {
  if (!Array.isArray(rows)) return [];
  return rows.filter((row) => {
    if (String(row?.type || '').trim() !== 'Video') return true;
    return !isIitTrackVideo(row);
  });
}
