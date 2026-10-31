/**
 * Pure helpers that keep Super Admin Subject & Content saves inside the class
 * being viewed. No imports on purpose (comparison rules are injected) so the
 * logic can be unit-tested with `node --test`.
 *
 * Why: a class's subject sidebar can show a row that is really ANOTHER class's
 * subject (content filed under Class 8 but linked to the Class 6 "Mathematics"
 * subject). Saving a new upload against that row's id linked the Class 8 book
 * to Class 6 Mathematics, and deleting that "duplicate" Class 6 subject later
 * took the Class 8 books with it.
 */

export interface ClassSubjectLike {
  _id: string;
  name: string;
  board?: string;
  classNumber?: string;
  productCategory?: string;
  isActive?: boolean;
}

export interface ClassSubjectRules<S extends ClassSubjectLike> {
  /** Normalized class of a catalog subject ("" when unknown). */
  classOf: (subject: S) => string;
  /** Normalized class of a value such as "08" / "8". */
  normalizeClass: (value: string | null | undefined) => string;
  /** Same subject title ("Maths" vs "Mathematics"). */
  sameName: (a: string, b: string) => boolean;
  /** Boards compatible (empty board on either side counts as a match). */
  sameBoard: (a: string, b: string) => boolean;
  /** Normalized IIT track ("" for none). */
  categoryOf: (subject: S) => string;
  /** Active, non-soft-deleted catalog subject. */
  isActive: (subject: S) => boolean;
}

export interface ClassSubjectResolution {
  /** Subject to save under, or null when none of the viewed class exists. */
  subjectId: string | null;
  /** True when the row's (foreign-class) subject was swapped for the class's own one. */
  redirected: boolean;
  /** Class of the selected row's subject when it is not the viewed class. */
  foreignClass: string;
  reason: 'ok' | 'no-subject-for-class' | 'unknown-row';
}

/**
 * Pick the catalog subject a new upload in `classNumber` must be saved under.
 *
 * - The selected row's own subject when it belongs to the class (or has no class).
 * - Otherwise the same-named subject of the viewed class (same board + track).
 * - Otherwise null: the caller must ask the admin to add that class's subject
 *   instead of silently filing the upload under another class.
 */
export function resolveClassSubjectForSave<S extends ClassSubjectLike>(
  args: {
    rowSubjectId: string | null | undefined;
    rowName?: string;
    classNumber: string;
    board: string;
    productCategory: string;
    catalog: S[];
  },
  rules: ClassSubjectRules<S>,
): ClassSubjectResolution {
  const normClass = rules.normalizeClass(args.classNumber);
  const row = args.rowSubjectId
    ? args.catalog.find((s) => String(s._id) === String(args.rowSubjectId))
    : undefined;
  const rowName = row?.name || args.rowName || '';

  if (row && rules.isActive(row)) {
    const rowClass = rules.classOf(row);
    if (!rowClass || !normClass || rowClass === normClass) {
      return { subjectId: String(row._id), redirected: false, foreignClass: '', reason: 'ok' };
    }
  }
  if (!rowName) {
    return { subjectId: null, redirected: false, foreignClass: '', reason: 'unknown-row' };
  }

  const wantCat = args.productCategory || '';
  const native = args.catalog.find(
    (s) =>
      rules.isActive(s) &&
      rules.classOf(s) === normClass &&
      rules.sameName(s.name, rowName) &&
      rules.sameBoard(s.board || '', args.board || '') &&
      (rules.categoryOf(s) || '') === wantCat,
  );
  if (native) {
    return {
      subjectId: String(native._id),
      redirected: true,
      foreignClass: row ? rules.classOf(row) : '',
      reason: 'ok',
    };
  }

  return {
    subjectId: null,
    redirected: false,
    foreignClass: row ? rules.classOf(row) : '',
    reason: 'no-subject-for-class',
  };
}

/**
 * Sidebar label for a class number, reusing the exact option string
 * ("Class 8 (IIT)") so the class selector does not reset to the first class.
 */
export function classLabelForNumber(
  options: string[],
  classNumber: string,
  fallback: string,
): string {
  const n = String(parseInt(String(classNumber || ''), 10));
  if (n === 'NaN') return fallback;
  const hit = options.find((label) => {
    const m = String(label).match(/^\s*Class\s+(\d+)/i);
    return !!m && String(parseInt(m[1], 10)) === n;
  });
  return hit ?? fallback;
}
