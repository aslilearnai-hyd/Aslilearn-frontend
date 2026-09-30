import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import { getAuthToken } from '@/lib/auth-utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  BookOpen, 
  GraduationCap,
  BarChart3,
  Target,
  Zap,
  ArrowRight,
  Layers3
} from 'lucide-react';
import { useLocation } from 'wouter';
import { API_BASE_URL } from '@/lib/api-config';
import { filterContentsBySchoolProgram, filterVideosForLearningPath, resolveIsAsliPrepExclusive } from '@/lib/school-program';
import {
  extractPlainSubjectName,
  getLearningPathClassLabel,
  isSoftDeletedSubjectName,
} from '@/lib/subject-names';
import {
  formatIitLearningPathContentLabel,
  isIitTrackContent,
} from '@/lib/library-content-labels';
import {
  buildClassFilterOptions,
  consolidateLearningPathSubjects,
  formatClassFilterOptionLabel,
  formatClassGroupTitle,
  groupLearningPathsByClass,
  subjectMatchesClassFilter,
} from '@/lib/learning-path-admin';
import { countLearningPathDisplayStats } from '@/lib/learning-path-stats';

function isActiveCatalogSubject(subject: {
  name?: string;
  isActive?: boolean;
}): boolean {
  if (!subject) return false;
  if (subject.isActive === false) return false;
  if (isSoftDeletedSubjectName(subject.name || '')) return false;
  return true;
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

function getContentSubjectId(content: any): string | null {
  const subj = content?.subject;
  if (subj == null) return null;
  if (typeof subj === 'object' && subj._id != null) return String(subj._id);
  if (typeof subj === 'string' && subj.trim()) return subj.trim();
  return null;
}

function normalizeSubjectNameKey(name: string): string {
  const plain = extractPlainSubjectName(name || '')
    .trim()
    .toLowerCase()
    .replace(/\b(iit|neet|jee)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (/^bio(logy)?$/.test(plain) || plain === 'bio') return 'biology';
  if (/^chem(istry)?$/.test(plain)) return 'chemistry';
  if (/^phy(sics)?$/.test(plain)) return 'physics';
  if (/^math(s|ematics)?$/.test(plain)) return 'mathematics';
  if (/^sci(ence)?$/.test(plain)) return 'science';
  if (/^eng(lish)?$/.test(plain)) return 'english';
  if (/social/.test(plain)) return 'social science';
  return plain;
}

function contentNameClassKey(content: any): string | null {
  const subj = content?.subject;
  if (subj == null || typeof subj !== 'object') return null;
  const classLabel =
    getLearningPathClassLabel(subj) ||
    String(subj.classNumber || content.classNumber || '')
      .trim()
      .replace(/^class\s+/i, '') ||
    'none';
  const nameKey = normalizeSubjectNameKey(String(subj.name || ''));
  if (!nameKey) return null;
  return `${classLabel}::${nameKey}`;
}

function subjectNameClassKey(subject: any): string | null {
  const classLabel =
    getLearningPathClassLabel(subject) ||
    String(subject?.classNumber || '')
      .trim()
      .replace(/^class\s+/i, '') ||
    'none';
  const nameKey = normalizeSubjectNameKey(String(subject?.name || ''));
  if (!nameKey) return null;
  return `${classLabel}::${nameKey}`;
}

export default function AdminLearningPaths() {
  const [, setLocation] = useLocation();
  const [subjects, setSubjects] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [subjectsWithContent, setSubjectsWithContent] = useState<any[]>([]);
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [classFilter, setClassFilter] = useState<string>('all');
  const [subjectFilter, setSubjectFilter] = useState<string>('all');
  const [isAsliPrepExclusive, setIsAsliPrepExclusive] = useState(false);

  useEffect(() => {
    const loadProgram = async () => {
      try {
        const token = getAuthToken();
        const res = await fetch(`${API_BASE_URL}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        });
        if (res.ok) {
          const data = await res.json();
          setIsAsliPrepExclusive(resolveIsAsliPrepExclusive(data?.user));
        }
      } catch {
        /* ignore */
      }
    };
    void loadProgram();
  }, []);

  const classOptionsFromData = useMemo(
    () => buildClassFilterOptions(subjectsWithContent),
    [subjectsWithContent]
  );

  const subjectNameOptions = useMemo(() => {
    const names = new Set<string>();
    subjectsWithContent.forEach((subj: any) => {
      if (!subjectMatchesClassFilter(subj, classFilter)) return;
      names.add(extractPlainSubjectName(subj.name || '').trim());
    });
    return Array.from(names).filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [subjectsWithContent, classFilter]);

  const filteredSubjectsWithContent = useMemo(() => {
    return subjectsWithContent.filter((subj: any) => {
      if (!subjectMatchesClassFilter(subj, classFilter)) return false;
      if (subjectFilter === 'all') return true;
      return (
        extractPlainSubjectName(subj.name || '').toLowerCase() ===
        subjectFilter.toLowerCase()
      );
    });
  }, [subjectsWithContent, classFilter, subjectFilter]);

  const groupedSubjectsByClass = useMemo(
    () => groupLearningPathsByClass(filteredSubjectsWithContent),
    [filteredSubjectsWithContent]
  );

  const totalContentItemsInView = useMemo(
    () =>
      filteredSubjectsWithContent.reduce(
        (sum: number, subj: any) => sum + (subj.asliPrepContent?.length || 0),
        0
      ),
    [filteredSubjectsWithContent]
  );

  useEffect(() => {
    setSubjectFilter('all');
  }, [classFilter]);

  useEffect(() => {
    fetchSubjects();
  }, []);

  useEffect(() => {
    if (isLoading) return;
    void fetchSubjectsWithContent();
  }, [subjects, isLoading, isAsliPrepExclusive]);

  const fetchSubjects = async () => {
    try {
      setIsLoading(true);
      const token = getAuthToken();
      // includeCatalog=true: full board catalog (ASLI + curriculum + IIT for Asli Prep),
      // not only subjects already linked to classes — so Super Admin uploads appear.
      const [subjectsRes, classesRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/admin/subjects?includeCatalog=true`, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }),
        fetch(`${API_BASE_URL}/api/admin/classes`, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }),
      ]);

      let classNumbers = new Set<string>();
      if (classesRes.ok) {
        const classesData = await classesRes.json();
        const classesArr = Array.isArray(classesData)
          ? classesData
          : classesData.data || classesData.classes || [];
        for (const c of classesArr) {
          const raw = String(c?.classNumber || c?.name || '')
            .trim()
            .replace(/^class\s+/i, '');
          const digits = raw.match(/\d+/)?.[0];
          if (digits) classNumbers.add(digits);
          if (raw) classNumbers.add(raw);
        }
      }

      if (subjectsRes.ok) {
        const data = await subjectsRes.json();
        const subjectsArray = Array.isArray(data) ? data : data.data || data.subjects || [];
        const active = subjectsArray.filter((s: { name?: string; isActive?: boolean }) =>
          isActiveCatalogSubject(s),
        );
        const scoped =
          classNumbers.size > 0
            ? active.filter((s: any) => {
                const label =
                  getLearningPathClassLabel(s) ||
                  String(s?.classNumber || '')
                    .trim()
                    .replace(/^class\s+/i, '');
                const digits = String(label).match(/\d+/)?.[0];
                if (!label && !digits) return true;
                return (
                  (digits && classNumbers.has(digits)) ||
                  (label && classNumbers.has(String(label)))
                );
              })
            : active;
        setSubjects(scoped);
      }
    } catch (error) {
      console.error('Failed to fetch subjects:', error);
      setSubjects([]);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSubjectsWithContent = async () => {
    try {
      setIsLoadingContent(true);
      const token = getAuthToken();

      // One request for all Asli Prep content (same source Super Admin uses), then group by subject.
      let allContent: any[] = [];
      let programExclusive = isAsliPrepExclusive;
      try {
        const contentResponse = await fetch(
          `${API_BASE_URL}/api/admin/asli-prep-content?surface=learning-path`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          }
        );
        if (contentResponse.ok) {
          const contentData = await contentResponse.json();
          allContent = contentData.data || contentData || [];
          if (!Array.isArray(allContent)) allContent = [];
          if (typeof contentData?.meta?.isAsliPrepExclusive === 'boolean') {
            programExclusive = contentData.meta.isAsliPrepExclusive;
            setIsAsliPrepExclusive(programExclusive);
          }
          allContent = filterVideosForLearningPath(
            filterContentsBySchoolProgram(allContent, programExclusive)
          );
        }
      } catch (e) {
        console.error('Failed to fetch all asli-prep content:', e);
        allContent = [];
      }

      const bySubjectId = new Map<string, any[]>();
      const byNameClass = new Map<string, any[]>();
      for (const item of allContent) {
        if (!isActiveCatalogContent(item)) continue;
        const sid = getContentSubjectId(item);
        if (sid) {
          if (!bySubjectId.has(sid)) bySubjectId.set(sid, []);
          bySubjectId.get(sid)!.push(item);
        }
        const nameKey = contentNameClassKey(item);
        if (nameKey) {
          if (!byNameClass.has(nameKey)) byNameClass.set(nameKey, []);
          byNameClass.get(nameKey)!.push(item);
        }
      }

      const merged: any[] = [];
      const claimedContentIds = new Set<string>();

      const sortContent = (list: any[]) =>
        list.slice().sort((a: any, b: any) => {
          const titleA = String(a?.title || a?.name || '').trim();
          const titleB = String(b?.title || b?.name || '').trim();
          if (titleA && titleB) {
            return titleA.localeCompare(titleB, undefined, { numeric: true, sensitivity: 'base' });
          }
          const ta = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
          const tb = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
          return ta - tb;
        });

      for (const subject of subjects) {
        if (!isActiveCatalogSubject(subject)) continue;
        const subjectId = String(subject._id || subject.id);
        const nameKey = subjectNameClassKey(subject);
        const fromId = bySubjectId.get(subjectId) || [];
        const fromName = nameKey ? byNameClass.get(nameKey) || [] : [];
        const seen = new Set<string>();
        const asliPrepContent = sortContent(
          [...fromId, ...fromName].filter((item) => {
            const id = String(item?._id || item?.id || '');
            if (!id || seen.has(id)) return false;
            seen.add(id);
            claimedContentIds.add(id);
            return true;
          }),
        );
        merged.push({
          _id: subject._id || subject.id,
          id: subject._id || subject.id,
          name: subject.name || 'Unknown Subject',
          description: subject.description || '',
          board: subject.board || '',
          productCategory: subject.productCategory || '',
          classNumber: subject.classNumber,
          asliPrepContent,
          totalContent: asliPrepContent.length,
        });
      }

      // Surface Super Admin content whose subject isn't on the class roster yet.
      const orphanGroups = new Map<string, any[]>();
      for (const item of allContent) {
        if (!isActiveCatalogContent(item)) continue;
        const id = String(item?._id || item?.id || '');
        if (!id || claimedContentIds.has(id)) continue;
        const nameKey = contentNameClassKey(item) || `orphan::${getContentSubjectId(item) || id}`;
        if (!orphanGroups.has(nameKey)) orphanGroups.set(nameKey, []);
        orphanGroups.get(nameKey)!.push(item);
      }

      for (const [nameKey, items] of orphanGroups) {
        const sample = items[0];
        const subj = sample?.subject && typeof sample.subject === 'object' ? sample.subject : null;
        const asliPrepContent = sortContent(items);
        merged.push({
          _id: getContentSubjectId(sample) || `orphan-${nameKey}`,
          id: getContentSubjectId(sample) || `orphan-${nameKey}`,
          name: subj?.name || extractPlainSubjectName(String(sample?.title || 'Content')) || 'Subject',
          description: '',
          board: subj?.board || sample?.board || '',
          productCategory: subj?.productCategory || sample?.productCategory || '',
          classNumber: subj?.classNumber || sample?.classNumber,
          asliPrepContent,
          totalContent: asliPrepContent.length,
        });
      }

      const consolidated = consolidateLearningPathSubjects(merged).filter(
        (row) =>
          isActiveCatalogSubject(row) &&
          (row.asliPrepContent?.length ?? 0) > 0
      );
      setSubjectsWithContent(consolidated);
    } catch (error) {
      console.error('Failed to fetch subjects with content:', error);
      setSubjectsWithContent([]);
    } finally {
      setIsLoadingContent(false);
    }
  };

  const getSubjectIcon = (subjectName: string) => {
    if (subjectName.toLowerCase().includes('math')) return Target;
    if (subjectName.toLowerCase().includes('science') || subjectName.toLowerCase().includes('physics') || subjectName.toLowerCase().includes('chemistry')) return Zap;
    if (subjectName.toLowerCase().includes('english')) return BookOpen;
    return BookOpen;
  };

  if (isLoading) {
    return (
      <div className="space-y-3 sm:space-y-4 lg:space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:p-4 lg:p-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-64 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-4 lg:space-y-6">
      <div className="rounded-2xl border border-sky-100 bg-gradient-to-r from-sky-50 via-white to-teal-50 p-5 sm:p-6">
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card className="border-sky-100 shadow-none">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500">Classes</p>
                  <p className="text-lg sm:text-xl font-bold text-gray-900">{groupedSubjectsByClass.length}</p>
                </div>
                <GraduationCap className="h-4 w-4 sm:h-5 sm:w-5 text-sky-600" />
              </CardContent>
            </Card>
            <Card className="border-sky-100 shadow-none">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500">Subjects In View</p>
                  <p className="text-lg sm:text-xl font-bold text-gray-900">{filteredSubjectsWithContent.length}</p>
                </div>
                <Layers3 className="h-4 w-4 sm:h-5 sm:w-5 text-teal-600" />
              </CardContent>
            </Card>
            <Card className="border-sky-100 shadow-none">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500">Content Items</p>
                  <p className="text-lg sm:text-xl font-bold text-gray-900">{totalContentItemsInView}</p>
                </div>
                <BarChart3 className="h-4 w-4 sm:h-5 sm:w-5 text-orange-600" />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {!isLoadingContent && subjectsWithContent.length > 0 && (
        <Card className="border-sky-100">
          <CardContent className="p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
              <div className="space-y-1.5">
                <Label htmlFor="lp-class-filter" className="text-xs text-gray-500">
                  Class
                </Label>
                <Select value={classFilter} onValueChange={setClassFilter}>
                  <SelectTrigger id="lp-class-filter" className="w-full sm:w-[200px] bg-white">
                    <SelectValue placeholder="All classes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All classes</SelectItem>
                    {classOptionsFromData.map((c) => (
                      <SelectItem key={c} value={c}>
                        {formatClassFilterOptionLabel(c)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lp-subject-filter" className="text-xs text-gray-500">
                  Subject
                </Label>
                <Select value={subjectFilter} onValueChange={setSubjectFilter}>
                  <SelectTrigger id="lp-subject-filter" className="w-full sm:w-[220px] bg-white">
                    <SelectValue placeholder="All subjects" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All subjects</SelectItem>
                    {subjectNameOptions.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoadingContent ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:p-4 lg:p-6">
          {Array.from({ length: subjects.length }).map((_, i) => (
            <Skeleton key={i} className="h-64 w-full" />
          ))}
        </div>
      ) : subjectsWithContent.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <BookOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-base sm:text-lg font-semibold text-gray-600 mb-2">No Subjects Available</h3>
            <p className="text-gray-500">No subjects have been registered for your board yet.</p>
          </CardContent>
        </Card>
      ) : filteredSubjectsWithContent.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <BookOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-base sm:text-lg font-semibold text-gray-600 mb-2">No matches</h3>
            <p className="text-gray-500">
              No subjects match the selected class and subject filters. Try choosing &quot;All
              classes&quot; or &quot;All subjects&quot;.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          {groupedSubjectsByClass.map((group) => {
            const classContentCount = group.subjects.reduce(
              (sum, s) => sum + (s.asliPrepContent?.length || 0),
              0
            );
            const classTitle = formatClassGroupTitle(group);

            return (
              <Card key={group.classKey} className="border-sky-100 overflow-hidden">
                <CardHeader className="bg-sky-50/60 border-b border-sky-100">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-sky-600 text-white border-0">
                        {classTitle}
                      </Badge>
                      <CardTitle className="text-sm sm:text-base text-gray-900">
                        {group.subjects.length} subject{group.subjects.length === 1 ? '' : 's'}
                      </CardTitle>
                    </div>
                    <p className="text-xs text-gray-600">
                      {classContentCount} content item{classContentCount === 1 ? '' : 's'}
                    </p>
                  </div>
                </CardHeader>
                <CardContent className="p-4 sm:p-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {group.subjects.map((subject: any) => {
                      const Icon = getSubjectIcon(subject.name);
                      const displayName = extractPlainSubjectName(subject.name || '');
                      const primaryId = String(subject._id || subject.id);
                      const mergedIds: string[] = Array.isArray(subject.mergedSubjectIds)
                        ? subject.mergedSubjectIds.map(String)
                        : [primaryId];
                      const otherIds = mergedIds.filter((id) => id !== primaryId);
                      const viewHref =
                        otherIds.length > 0
                          ? `/admin/subject/${primaryId}?merge=${encodeURIComponent(otherIds.join(','))}`
                          : `/admin/subject/${primaryId}`;
                      const iitItems = (subject.asliPrepContent || []).filter((c: any) =>
                        isIitTrackContent(c),
                      );
                      const boardItems = (subject.asliPrepContent || []).filter(
                        (c: any) => !isIitTrackContent(c),
                      );
                      const displayStats = countLearningPathDisplayStats(boardItems);
                      const hasIit = iitItems.length > 0;
                      const cardTotal =
                        displayStats.textbooks +
                        displayStats.materials +
                        displayStats.videos +
                        iitItems.length;

                      return (
                        <Card
                          key={mergedIds.slice().sort((a, b) => String(a).localeCompare(String(b))).join('-')}
                          className="border-gray-200 shadow-sm hover:shadow-md transition-all duration-200 h-full"
                        >
                          <CardContent className="p-4 h-full flex flex-col gap-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-sky-400 to-teal-500 flex items-center justify-center shrink-0">
                                  <Icon className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
                                </div>
                                <div className="min-w-0">
                                  <h3 className="font-semibold text-gray-900 truncate">{displayName}</h3>
                                  {hasIit ? (
                                    <p className="text-micro font-semibold uppercase tracking-wider text-amber-700">
                                      IIT · {formatIitLearningPathContentLabel(iitItems[0], displayName)}
                                    </p>
                                  ) : null}
                                </div>
                              </div>
                              <Badge variant="secondary" className="text-xs shrink-0">
                                {cardTotal}
                              </Badge>
                            </div>

                            <p className="text-xs text-gray-600 line-clamp-2">
                              {subject.description ||
                                `Structured content for ${displayName} in ${classTitle}.`}
                            </p>

                            <div className="flex flex-wrap gap-1.5">
                              <span className="rounded-md border border-sky-100 bg-sky-50 px-2 py-0.5 text-micro font-medium text-sky-800">
                                Textbooks {displayStats.textbooks}
                              </span>
                              <span className="rounded-md border border-amber-100 bg-amber-50 px-2 py-0.5 text-micro font-medium text-amber-800">
                                Materials {displayStats.materials}
                              </span>
                              {displayStats.videos > 0 ? (
                                <span className="rounded-md border border-violet-100 bg-violet-50 px-2 py-0.5 text-micro font-medium text-violet-800">
                                  Videos {displayStats.videos}
                                </span>
                              ) : null}
                              {hasIit ? (
                                <span className="rounded-md border border-slate-200 bg-slate-900 px-2 py-0.5 text-micro font-medium text-amber-200">
                                  IIT {iitItems.length}
                                </span>
                              ) : null}
                            </div>

                            <div className="space-y-1.5 min-h-[52px]">
                              {subject.asliPrepContent?.slice(0, 2).map((content: any, idx: number) => (
                                <div
                                  key={content._id || idx}
                                  className="rounded-md bg-gray-50 border border-gray-100 px-2 py-1"
                                >
                                  <p className="text-xs text-gray-800 font-medium truncate">
                                    {isIitTrackContent(content)
                                      ? formatIitLearningPathContentLabel(content, displayName)
                                      : content.title || 'Untitled'}
                                  </p>
                                  <p className="text-mini text-gray-500 truncate">
                                    {isIitTrackContent(content)
                                      ? `IIT · ${content.type || 'Content'}`
                                      : content.type || 'Content'}
                                  </p>
                                </div>
                              ))}
                            </div>

                            <Button
                              className="w-full mt-auto bg-gradient-to-r from-sky-400 to-teal-500 hover:from-sky-500 hover:to-teal-600 text-white"
                              onClick={() => setLocation(viewHref)}
                            >
                              View Content
                              <ArrowRight className="w-3 h-3 sm:w-4 sm:h-4 ml-2" />
                            </Button>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}


