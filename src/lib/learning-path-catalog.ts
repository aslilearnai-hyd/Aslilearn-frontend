import { API_BASE_URL } from '@/lib/api-config';
import { getAuthToken } from '@/lib/auth-utils';
import {
  consolidateLearningPathSubjects,
  consolidateTeacherLearningPathSubjects,
  dedupeTeacherLearningPathRows,
  groupTeacherSubjectsForCatalog,
} from '@/lib/learning-path-admin';
import { filterContentsBySchoolProgram, filterVideosForLearningPath } from '@/lib/school-program';
import {
  subjectDisplayLabel,
  isActiveCatalogSubject,
  isSoftDeletedSubjectName,
  subjectCatalogGroupKey,
} from '@/lib/subject-names';

export type LearningPathRole = 'admin' | 'teacher' | 'student';

export type SubjectWithPathContent = {
  _id: string;
  id: string;
  name: string;
  description?: string;
  board?: string;
  classNumber?: string;
  asliPrepContent: any[];
  totalContent: number;
  mergedSubjectIds?: string[];
};

function parseSubjectsPayload(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.subjects)) return data.subjects;
  return [];
}

function parseContentPayload(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

function getContentSubjectId(content: any): string | null {
  const subj = content?.subject;
  if (subj == null) return null;
  if (typeof subj === 'object' && subj._id != null) return String(subj._id);
  if (typeof subj === 'string' && subj.trim()) return subj.trim();
  return null;
}

async function authFetch(path: string): Promise<any> {
  const token = getAuthToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  if (!response.ok) return null;
  return response.json();
}

async function fetchSubjects(role: LearningPathRole): Promise<any[]> {
  if (role === 'admin') {
    const data = await authFetch('/api/admin/subjects');
    return parseSubjectsPayload(data);
  }
  if (role === 'teacher') {
    const data = await authFetch('/api/teacher/subjects');
    return parseSubjectsPayload(data);
  }
  const data = await authFetch('/api/student/subjects');
  return parseSubjectsPayload(data);
}

async function fetchAllPrepContent(role: LearningPathRole): Promise<any[]> {
  const q = 'surface=learning-path';
  if (role === 'admin') {
    const data = await authFetch(`/api/admin/asli-prep-content?${q}`);
    return parseContentPayload(data);
  }
  if (role === 'teacher') {
    const data = await authFetch(`/api/teacher/asli-prep-content?${q}`);
    return parseContentPayload(data);
  }
  const data = await authFetch(`/api/student/asli-prep-content?${q}`);
  return parseContentPayload(data);
}

function sortContentNewestFirst(items: any[]): any[] {
  return items.slice().sort((a, b) => {
    const ta = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
    return tb - ta;
  });
}

async function loadTeacherLearningPathCatalog(
  isAsliPrepExclusive: boolean
): Promise<SubjectWithPathContent[]> {
  const subjects = await fetchSubjects('teacher');
  const groups = groupTeacherSubjectsForCatalog(subjects);

  const assignedGroupKeys = new Set<string>();
  const groupMeta = new Map<
    string,
    {
      representative: (typeof groups)[number]['representative'];
      subjectIds: string[];
      displayName: string;
    }
  >();
  const subjectIdToGroupKey = new Map<string, string>();

  for (const { representative, subjectIds } of groups) {
    const key = subjectCatalogGroupKey(representative.name || '');
    assignedGroupKeys.add(key);
    groupMeta.set(key, {
      representative,
      subjectIds,
      displayName: subjectDisplayLabel(representative.name || '') || 'Unknown Subject',
    });
    for (const sid of subjectIds) {
      subjectIdToGroupKey.set(sid, key);
    }
  }

  const allContentRaw = await fetchAllPrepContent('teacher');
  const allContent = sortContentNewestFirst(
    filterContentsBySchoolProgram(parseContentPayload(allContentRaw), isAsliPrepExclusive)
  );

  const contentByKey = new Map<string, any[]>();
  const seenByKey = new Map<string, Set<string>>();

  for (const item of allContent) {
    let key: string | null = null;
    const sid = getContentSubjectId(item);
    if (sid && subjectIdToGroupKey.has(sid)) {
      key = subjectIdToGroupKey.get(sid)!;
    } else {
      const subj = item?.subject;
      const name =
        typeof subj === 'object' && subj?.name
          ? String(subj.name)
          : typeof subj === 'string'
            ? subj
            : '';
      if (name.trim()) key = subjectCatalogGroupKey(name);
    }
    if (!key || !assignedGroupKeys.has(key)) continue;

    if (!contentByKey.has(key)) contentByKey.set(key, []);
    if (!seenByKey.has(key)) seenByKey.set(key, new Set());
    const cid = String(item._id || '');
    if (!cid || seenByKey.get(key)!.has(cid)) continue;
    seenByKey.get(key)!.add(cid);
    contentByKey.get(key)!.push(item);
  }

  const rows: SubjectWithPathContent[] = [];
  for (const [key, meta] of Array.from(groupMeta.entries())) {
    const asliPrepContent = contentByKey.get(key) || [];
    if (asliPrepContent.length === 0) continue;
    const subjectId = meta.subjectIds[0];
    rows.push({
      _id: subjectId,
      id: subjectId,
      name: meta.displayName,
      description: meta.representative.description || `Content for ${meta.displayName}`,
      board: meta.representative.board || '',
      classNumber: meta.representative.classNumber,
      asliPrepContent,
      totalContent: asliPrepContent.length,
      mergedSubjectIds: meta.subjectIds,
    });
  }

  return consolidateTeacherLearningPathSubjects(dedupeTeacherLearningPathRows(rows))
    .filter((row) => isActiveCatalogSubject(row) && row.totalContent > 0)
    .sort((a, b) =>
      (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base', numeric: true })
    );
}

/** Load subjects grouped with catalog content — matches mobile teacher learning paths. */
export async function loadLearningPathCatalog(
  role: LearningPathRole,
  isAsliPrepExclusive: boolean
): Promise<SubjectWithPathContent[]> {
  if (role === 'teacher') {
    return loadTeacherLearningPathCatalog(isAsliPrepExclusive);
  }

  const [subjects, allContentRaw] = await Promise.all([
    fetchSubjects(role),
    fetchAllPrepContent(role),
  ]);

  const allContent = filterVideosForLearningPath(
    filterContentsBySchoolProgram(allContentRaw, isAsliPrepExclusive),
  );
  const bySubjectId = new Map<string, any[]>();

  for (const item of allContent) {
    const sid = getContentSubjectId(item);
    if (!sid) continue;
    if (!bySubjectId.has(sid)) bySubjectId.set(sid, []);
    bySubjectId.get(sid)!.push(item);
  }

  const consumedIds = new Set<string>();
  const merged: SubjectWithPathContent[] = [];

  for (const subject of subjects) {
    const subjectId = String(subject._id || subject.id || '');
    if (!subjectId) continue;
    const asliPrepContent = sortContentNewestFirst(bySubjectId.get(subjectId) || []);
    consumedIds.add(subjectId);
    merged.push({
      _id: subjectId,
      id: subjectId,
      name: subject.name || 'Unknown Subject',
      description: subject.description || '',
      board: subject.board || '',
      classNumber: subject.classNumber,
      asliPrepContent,
      totalContent: asliPrepContent.length,
    });
  }

  const withContent = merged.filter((row) => row.totalContent > 0);

  if (role === 'admin') {
    return consolidateLearningPathSubjects(withContent).filter(
      (row) => isActiveCatalogSubject(row) && row.totalContent > 0
    );
  }

  return withContent
    .filter((row) => !isSoftDeletedSubjectName(row.name || ''))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));
}
