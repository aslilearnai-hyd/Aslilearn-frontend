import {
  classBoardFilterKey,
  displayBoardShort,
  formatClassBoardFilterLabel,
  normalizeBoardKey,
  parseClassBoardFilterKey,
} from '@/lib/board-label';
import {
  extractPlainSubjectName,
  getLearningPathBoardLabel,
  getLearningPathClassLabel,
  isActiveCatalogSubject,
  isSoftDeletedSubjectName,
  subjectCatalogGroupKey,
} from '@/lib/subject-names';
import type { SubjectWithPathContent } from '@/lib/learning-path-catalog';

function getContentSubjectId(content: any): string | null {
  const subj = content?.subject;
  if (subj == null) return null;
  if (typeof subj === 'object' && subj._id != null) return String(subj._id);
  if (typeof subj === 'string' && subj.trim()) return subj.trim();
  return null;
}

function isActiveCatalogContent(item: {
  isActive?: boolean;
  subject?: { name?: string; isActive?: boolean } | string;
}): boolean {
  if (item?.isActive === false) return false;
  const subj = item.subject;
  if (subj != null && typeof subj === 'object') {
    if (subj.isActive === false) return false;
    if (isSoftDeletedSubjectName(subj.name || '')) return false;
  }
  return true;
}

function normalizeSubjectNameForMerge(name: string): string {
  const plain = extractPlainSubjectName(name || '').trim().toLowerCase();
  if (/^bio(logy)?$/.test(plain) || plain === 'bio') return 'biology';
  return plain;
}

function isIitBoardSubjectRow(row: { board?: string; productCategory?: string | null }): boolean {
  const cat = String(row.productCategory || '')
    .trim()
    .toUpperCase();
  if (cat && cat !== 'GENERAL' && cat !== 'NONE' && cat !== 'ALL') return true;
  const board = normalizeBoardKey(String(row.board || ''));
  return board === 'IIT' || board === 'IIT/NEET';
}

function groupKeyForSubjectRow(row: SubjectWithPathContent): string {
  const classLabel =
    getLearningPathClassLabel(row) ||
    String(row.classNumber || '').trim() ||
    'none';
  // Merge CBSE Biology + IIT Biology (same class) so materials show under one Biology card.
  return `${classLabel}::${normalizeSubjectNameForMerge(row.name || '')}`;
}

/** Teacher paths: one card per canonical subject name (board/class ignored). */
function groupKeyForTeacherSubjectRow(row: SubjectWithPathContent): string {
  return subjectCatalogGroupKey(row.name || '');
}

function groupKeyForTeacherSubjectRecord(subject: { name?: string }): string {
  return subjectCatalogGroupKey(subject.name || '');
}

export type TeacherCatalogSubject = {
  _id?: string;
  id?: string;
  name?: string;
  description?: string;
  board?: string;
  classNumber?: string;
  isActive?: boolean;
};

/** Group duplicate teacher subject assignments before per-subject content fetch. */
export function groupTeacherSubjectsForCatalog(
  subjects: TeacherCatalogSubject[]
): Array<{ representative: TeacherCatalogSubject; subjectIds: string[] }> {
  const byKey = new Map<string, { representative: TeacherCatalogSubject; subjectIds: string[] }>();

  for (const subject of subjects) {
    if (!isActiveCatalogSubject(subject)) continue;

    const mergedFromApi = Array.isArray((subject as { mergedSubjectIds?: string[] }).mergedSubjectIds)
      ? (subject as { mergedSubjectIds?: string[] }).mergedSubjectIds!.map(String).filter(Boolean)
      : [];
    const primaryId = String(subject._id || subject.id || '');
    const subjectIds =
      mergedFromApi.length > 0 ? mergedFromApi : primaryId ? [primaryId] : [];
    if (subjectIds.length === 0) continue;

    const key = groupKeyForTeacherSubjectRecord(subject);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { representative: subject, subjectIds: [...new Set(subjectIds)] });
      continue;
    }
    for (const sid of subjectIds) {
      if (!existing.subjectIds.includes(sid)) existing.subjectIds.push(sid);
    }
  }

  return Array.from(byKey.values());
}

function consolidateLearningPathSubjectsWithKey(
  rows: SubjectWithPathContent[],
  groupKey: (row: SubjectWithPathContent) => string,
  descriptionForRow?: (plainName: string, agg: SubjectWithPathContent) => string
): SubjectWithPathContent[] {
  const byKey = new Map<string, SubjectWithPathContent & { mergedSubjectIds?: string[] }>();

  for (const row of rows) {
    if (!isActiveCatalogSubject(row)) continue;
    const key = groupKey(row);
    const rowId = String(row._id || row.id);
    const incoming = [...(row.asliPrepContent || [])].filter((c) => isActiveCatalogContent(c));

    if (!byKey.has(key)) {
      byKey.set(key, { ...row, mergedSubjectIds: [rowId], asliPrepContent: incoming });
      continue;
    }

    const agg = byKey.get(key)!;
    // Prefer non-IIT catalog row as the card representative (IIT stays a content section).
    if (isIitBoardSubjectRow(agg) && !isIitBoardSubjectRow(row)) {
      Object.assign(agg, {
        ...row,
        mergedSubjectIds: agg.mergedSubjectIds,
        asliPrepContent: agg.asliPrepContent,
      });
    }
    const idSet = new Set<string>(agg.mergedSubjectIds || [String(agg._id || agg.id)]);
    idSet.add(rowId);
    agg.mergedSubjectIds = Array.from(idSet);

    const seen = new Set((agg.asliPrepContent || []).map((c: any) => String(c._id)));
    for (const c of incoming) {
      const cid = String(c._id);
      if (!seen.has(cid)) {
        seen.add(cid);
        agg.asliPrepContent.push(c);
      }
    }

    if ((row.classNumber != null && String(row.classNumber).trim() !== '') && !agg.classNumber) {
      agg.classNumber = row.classNumber;
    }
    if (row.board && !agg.board) {
      agg.board = row.board;
    }
  }

  return Array.from(byKey.values()).map((agg) => {
    const contents = (agg.asliPrepContent || []).slice().sort((a: any, b: any) => {
      const ta = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tb - ta;
    });
    const ids =
      agg.mergedSubjectIds && agg.mergedSubjectIds.length > 0
        ? agg.mergedSubjectIds
        : [String(agg._id || agg.id)];

    const countBySubject = new Map<string, number>();
    for (const c of contents) {
      const sid = getContentSubjectId(c);
      if (!sid) continue;
      countBySubject.set(sid, (countBySubject.get(sid) || 0) + 1);
    }

    let primaryId = String(agg._id || agg.id);
    let max = -1;
    for (const sid of ids) {
      const n = countBySubject.get(sid) || 0;
      if (n > max) {
        max = n;
        primaryId = sid;
      }
    }
    if (max <= 0) primaryId = ids[0];

    const inferredClass =
      (agg.classNumber != null && String(agg.classNumber).trim() !== ''
        ? String(agg.classNumber).trim()
        : null) || getLearningPathClassLabel({ ...agg, asliPrepContent: contents });

    const inferredBoard =
      getLearningPathBoardLabel({ ...agg, asliPrepContent: contents }) ||
      normalizeBoardKey(agg.board);

    const plainName = extractPlainSubjectName(agg.name || '');
    const boardKey = normalizeBoardKey(inferredBoard);
    const boardSuffix =
      !boardKey || boardKey === 'ASLI_EXCLUSIVE_SCHOOLS'
        ? ''
        : ` (${boardKey === 'IIT/NEET' ? 'IIT' : displayBoardShort(inferredBoard) || boardKey})`;
    const existingDescription = String(agg.description || '')
      .replace(/\s*\(\s*ASLI_EXCLUSIVE_SCHOOLS\s*\)\s*/gi, '')
      .replace(/\s*\(\s*Asli\s+Exclusive(?:\s+Schools)?\s*\)\s*/gi, '')
      .trim();

    return {
      ...agg,
      _id: primaryId,
      id: primaryId,
      name: plainName,
      description:
        descriptionForRow?.(plainName, agg) ||
        existingDescription ||
        `Structured content for ${plainName}${inferredClass ? ` · Class ${inferredClass}` : ''}${boardSuffix}`,
      mergedSubjectIds: ids,
      asliPrepContent: contents,
      totalContent: contents.length,
      ...(inferredClass ? { classNumber: inferredClass } : {}),
      ...(inferredBoard ? { board: inferredBoard } : {}),
    };
  });
}

/** Collapse duplicate subject rows (e.g. BIO vs Biology) for the same class + board. */
export function consolidateLearningPathSubjects(
  rows: SubjectWithPathContent[]
): SubjectWithPathContent[] {
  return consolidateLearningPathSubjectsWithKey(rows, groupKeyForSubjectRow);
}

/** Teacher learning paths: merge by subject name + board only (not class). */
export function consolidateTeacherLearningPathSubjects(
  rows: SubjectWithPathContent[]
): SubjectWithPathContent[] {
  return consolidateLearningPathSubjectsWithKey(
    rows,
    groupKeyForTeacherSubjectRow,
    (plainName) => `Content for ${plainName}`
  );
}

function mergeTeacherLearningPathRow(
  existing: SubjectWithPathContent,
  row: SubjectWithPathContent
): SubjectWithPathContent {
  const mergedIds = Array.from(
    new Set([
      ...(existing.mergedSubjectIds || [String(existing._id || existing.id)]),
      ...(row.mergedSubjectIds || [String(row._id || row.id)]),
    ])
  );

  const seen = new Set((existing.asliPrepContent || []).map((item: any) => String(item._id)));
  const mergedContent = [...(existing.asliPrepContent || [])];
  for (const item of row.asliPrepContent || []) {
    const cid = String(item._id);
    if (!cid || seen.has(cid)) continue;
    seen.add(cid);
    mergedContent.push(item);
  }

  const plainName = extractPlainSubjectName(existing.name || row.name || '');
  const primaryId = existing._id || mergedIds[0];

  return {
    ...existing,
    _id: primaryId,
    id: primaryId,
    name: plainName,
    description:
      existing.description ||
      row.description ||
      `Content for ${plainName}`,
    mergedSubjectIds: mergedIds,
    asliPrepContent: mergedContent,
    totalContent: mergedContent.length,
  };
}

/** Final safety pass: one learning-path card per canonical subject name. */
export function dedupeTeacherLearningPathRows(
  rows: SubjectWithPathContent[]
): SubjectWithPathContent[] {
  const byName = new Map<string, SubjectWithPathContent>();

  for (const row of rows) {
    const nameKey = subjectCatalogGroupKey(row.name || '');
    const existing = byName.get(nameKey);
    if (!existing) {
      byName.set(nameKey, row);
      continue;
    }
    byName.set(nameKey, mergeTeacherLearningPathRow(existing, row));
  }

  return Array.from(byName.values());
}

export function subjectMatchesClassFilter(
  row: SubjectWithPathContent,
  classFilter: string
): boolean {
  if (classFilter === 'all') return true;
  const parsed = parseClassBoardFilterKey(classFilter);
  if (!parsed) return false;
  const label = getLearningPathClassLabel(row);
  const board = getLearningPathBoardLabel(row);
  const classMatches = String(label || '').trim() === parsed.classNum;
  if (!classMatches) return false;
  if (!parsed.board) return true;
  return normalizeBoardKey(board) === parsed.board;
}

export function subjectMatchesSubjectFilter(
  row: SubjectWithPathContent,
  subjectFilter: string
): boolean {
  if (subjectFilter === 'all') return true;
  return (
    extractPlainSubjectName(row.name || '').toLowerCase() === subjectFilter.toLowerCase()
  );
}

export function sortClassBoardFilterKeys(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    const pa = parseClassBoardFilterKey(a);
    const pb = parseClassBoardFilterKey(b);
    if (!pa || !pb) return a.localeCompare(b);
    const na = parseInt(pa.classNum, 10);
    const nb = parseInt(pb.classNum, 10);
    if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
    const boardCmp = pa.board.localeCompare(pb.board);
    if (boardCmp !== 0) return boardCmp;
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  });
}

export function buildClassFilterOptions(rows: SubjectWithPathContent[]): string[] {
  const keys = new Set<string>();
  for (const row of rows) {
    const label = getLearningPathClassLabel(row);
    if (!label) continue;
    keys.add(classBoardFilterKey(label, getLearningPathBoardLabel(row)));
  }
  return sortClassBoardFilterKeys(Array.from(keys));
}

export function formatClassFilterOptionLabel(filterKey: string): string {
  const parsed = parseClassBoardFilterKey(filterKey);
  if (!parsed) return filterKey;
  return formatClassBoardFilterLabel(parsed.classNum, parsed.board);
}

export function buildSubjectFilterOptions(
  rows: SubjectWithPathContent[],
  classFilter: string
): string[] {
  const names = new Set<string>();
  for (const row of rows) {
    if (!subjectMatchesClassFilter(row, classFilter)) continue;
    const plain = extractPlainSubjectName(row.name || '').trim();
    if (plain) names.add(plain);
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

export function filterLearningPathSubjects(
  rows: SubjectWithPathContent[],
  classFilter: string,
  subjectFilter: string
): SubjectWithPathContent[] {
  return rows.filter(
    (row) =>
      subjectMatchesClassFilter(row, classFilter) &&
      subjectMatchesSubjectFilter(row, subjectFilter)
  );
}

export type ClassSubjectGroup = {
  classKey: string;
  classLabel: string;
  board: string;
  subjects: SubjectWithPathContent[];
};

export function groupLearningPathsByClass(
  rows: SubjectWithPathContent[]
): ClassSubjectGroup[] {
  const grouped = new Map<string, SubjectWithPathContent[]>();

  for (const row of rows) {
    const classLabel = getLearningPathClassLabel(row) || 'Unassigned';
    const board = getLearningPathBoardLabel(row);
    const classKey =
      classLabel === 'Unassigned'
        ? 'Unassigned'
        : classBoardFilterKey(classLabel, board);
    if (!grouped.has(classKey)) grouped.set(classKey, []);
    grouped.get(classKey)!.push(row);
  }

  return sortClassBoardFilterKeys(Array.from(grouped.keys())).map((classKey) => {
    const parsed = parseClassBoardFilterKey(classKey);
    return {
      classKey,
      classLabel: parsed?.classNum || 'Unassigned',
      board: parsed?.board || '',
      subjects: (grouped.get(classKey) || [])
        .slice()
        .sort((a, b) =>
          extractPlainSubjectName(a.name || '').localeCompare(
            extractPlainSubjectName(b.name || ''),
            undefined,
            { sensitivity: 'base' }
          )
        ),
    };
  });
}

export function formatClassGroupTitle(group: ClassSubjectGroup): string {
  if (group.classKey === 'Unassigned') return 'Unassigned';
  return formatClassBoardFilterLabel(group.classLabel, group.board);
}
