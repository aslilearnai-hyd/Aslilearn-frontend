import { useState, useEffect, useRef, useMemo } from 'react';
import { useRoute, useLocation, useSearch } from 'wouter';
import { Button } from '@/components/ui/button';
import { getAuthToken } from '@/lib/auth-utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ArrowLeft,
  BookOpen,
  Filter,
  Play,
  X,
} from 'lucide-react';
import CalendarView from '@/components/student/calendar-view';
import { API_BASE_URL } from '@/lib/api-config';
import { normalizeClassNumber } from '@/lib/exam-classes';
import { filterVideosForLearningPath } from '@/lib/school-program';
import { formatLibraryContentClassLabel } from '@/lib/library-content-labels';
import { goBackOrFallback } from '@/lib/navigate-back';

interface ContentItem {
  _id: string;
  title: string;
  description?: string;
  type: 'TextBook' | 'Workbook' | 'Material' | 'Video' | 'Audio' | 'Homework';
  fileUrl: string;
  date: string;
  createdAt: string;
  deadline?: string;
  classNumber?: string;
}

interface TeacherClass {
  _id: string;
  classNumber?: string;
  section?: string;
  name?: string;
}

interface Subject {
  _id: string;
  name: string;
  description?: string;
}

export default function TeacherSubjectContent() {
  const [, params] = useRoute('/teacher/subject/:id');
  const [, setLocation] = useLocation();
  const search = useSearch();
  const returnTo = useMemo(() => {
    const q = search.startsWith('?') ? search.slice(1) : search;
    return new URLSearchParams(q).get('returnTo') || '';
  }, [search]);

  const handleBack = () => {
    if (returnTo === 'learning' || returnTo === 'learning-paths') {
      setLocation('/learning-paths');
      return;
    }
    if (returnTo === 'eduott' || returnTo === 'edu-ott') {
      setLocation('/edu-ott');
      return;
    }
    goBackOrFallback(setLocation, '/learning-paths');
  };
  const [subject, setSubject] = useState<Subject | null>(null);
  const [loading, setLoading] = useState(true);
  const [contents, setContents] = useState<ContentItem[]>([]);
  const [loadingContents, setLoadingContents] = useState(true);
  const [selectedContentType, setSelectedContentType] = useState<string | null>(null);
  const [selectedClassFilter, setSelectedClassFilter] = useState<string | null>(null);
  const [teacherClasses, setTeacherClasses] = useState<TeacherClass[]>([]);
  const fetchGenRef = useRef(0);

  useEffect(() => {
    if (!params?.id) return;
    void fetchSubjectContent(params.id);
    void fetchTeacherClasses();
  }, [params?.id]);

  useEffect(() => {
    setSelectedContentType(null);
  }, [selectedClassFilter]);

  const fetchTeacherClasses = async () => {
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE_URL}/api/teacher/classes`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) return;
      const contentType = response.headers.get('content-type');
      if (!contentType?.includes('application/json')) return;
      const data = await response.json();
      const list = data.data || data || [];
      setTeacherClasses(Array.isArray(list) ? list : []);
    } catch (error) {
      console.error('Failed to fetch teacher classes:', error);
    }
  };

  const fetchSubjectContent = async (subjectId: string) => {
    const fetchId = ++fetchGenRef.current;
    try {
      setLoading(true);
      setLoadingContents(true);
      const token = getAuthToken();

      const subjectResponse = await fetch(`${API_BASE_URL}/api/subjects/${subjectId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (fetchId !== fetchGenRef.current) return;

      if (subjectResponse.ok) {
        const contentType = subjectResponse.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const subjectData = await subjectResponse.json();
          setSubject(subjectData.subject || { _id: subjectId, name: subjectData.name || 'Subject' });
        } else {
          setSubject({ _id: subjectId, name: 'Subject' });
        }
      } else {
        setSubject({ _id: subjectId, name: 'Subject' });
      }

      const contentsResponse = await fetch(
        `${API_BASE_URL}/api/teacher/asli-prep-content?subject=${encodeURIComponent(subjectId)}&surface=learning-path`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (fetchId !== fetchGenRef.current) return;

      if (contentsResponse.ok) {
        const contentType = contentsResponse.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const contentsData = await contentsResponse.json();
          const contentsList = contentsData.data || contentsData || [];
          const rows = Array.isArray(contentsList) ? contentsList : [];
          setContents(filterVideosForLearningPath(rows));
        } else {
          setContents([]);
        }
      } else {
        setContents([]);
      }
    } catch (error) {
      console.error('Failed to fetch subject content:', error);
      if (fetchId === fetchGenRef.current) {
        setSubject({ _id: params?.id || '', name: 'Subject' });
        setContents([]);
      }
    } finally {
      if (fetchId === fetchGenRef.current) {
        setLoadingContents(false);
        setLoading(false);
      }
    }
  };

  const classOptions = useMemo(() => {
    const set = new Set<string>();
    teacherClasses.forEach((c) => {
      const n = normalizeClassNumber(c.classNumber);
      if (n) set.add(n);
    });
    contents.forEach((c) => {
      const n = normalizeClassNumber(c.classNumber);
      if (n) set.add(n);
    });
    return Array.from(set).sort((a, b) => {
      const na = parseInt(a, 10);
      const nb = parseInt(b, 10);
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
      return a.localeCompare(b, undefined, { numeric: true });
    });
  }, [teacherClasses, contents]);

  const classFilteredContents = useMemo(() => {
    if (!selectedClassFilter) return contents;
    return contents.filter(
      (c) => normalizeClassNumber(c.classNumber) === selectedClassFilter,
    );
  }, [contents, selectedClassFilter]);

  const filteredContents = useMemo(() => {
    if (!selectedContentType) return classFilteredContents;
    return classFilteredContents.filter((c) => c.type === selectedContentType);
  }, [classFilteredContents, selectedContentType]);

  const uniqueContentTypes = useMemo(
    () => Array.from(new Set(classFilteredContents.map((c) => c.type))).sort((a, b) => a.localeCompare(b)),
    [classFilteredContents],
  );

  const hasActiveFilters = Boolean(selectedContentType || selectedClassFilter);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="w-full px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
            <p className="text-gray-600">Loading subject content...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
        {/* Back link */}
        <div className="mb-6">
          <Button
            variant="outline"
            onClick={handleBack}
            className="bg-white/90 backdrop-blur-sm border-blue-200 text-blue-700 shadow-sm hover:bg-blue-50 hover:text-blue-800"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            {returnTo === 'eduott' || returnTo === 'edu-ott'
              ? 'Back to EduOTT'
              : 'Back to Learning Paths'}
          </Button>
        </div>

        {/* Blue header — matches student learning path */}
        <div className="mb-8">
          <div className="gradient-primary rounded-2xl p-5 sm:p-8 text-white relative overflow-hidden">
            <div className="relative z-10">
              <div className="flex items-center space-x-4 mb-4">
                <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center">
                  <BookOpen className="w-7 h-8 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl sm:text-3xl font-bold mb-1 uppercase tracking-wide">
                    {subject?.name || 'Subject'}
                  </h1>
                  {(() => {
                    const classLabel = selectedClassFilter
                      ? `Class ${selectedClassFilter}`
                      : contents.map((row) => formatLibraryContentClassLabel(row)).find(Boolean);
                    return classLabel ? (
                      <p className="text-blue-50 font-medium mb-1">{classLabel}</p>
                    ) : null;
                  })()}
                  {subject?.description && (
                    <p className="text-blue-100 text-sm sm:text-base">{subject.description}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="absolute top-0 right-0 w-64 h-64 opacity-10 pointer-events-none">
              <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
                <path
                  fill="currentColor"
                  d="M47.1,-78.5C58.9,-69.2,64.3,-50.4,73.2,-32.8C82.1,-15.1,94.5,1.4,94.4,17.9C94.3,34.4,81.7,50.9,66.3,63.2C50.9,75.5,32.7,83.6,13.8,87.1C-5.1,90.6,-24.7,89.5,-41.6,82.1C-58.5,74.7,-72.7,61,-79.8,44.8C-86.9,28.6,-86.9,9.9,-83.2,-6.8C-79.5,-23.5,-72.1,-38.2,-61.3,-49.6C-50.5,-61,-36.3,-69.1,-21.4,-75.8C-6.5,-82.5,9.1,-87.8,25.2,-84.9C41.3,-82,57.9,-70,47.1,-78.5Z"
                  transform="translate(100 100)"
                />
              </svg>
            </div>
          </div>
        </div>

        {/* Learning Calendar */}
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Learning Calendar</h2>
              <p className="text-gray-600 mt-1 text-sm sm:text-base">
                Content organized by upload date
              </p>
            </div>

            {(contents.length > 0 || classOptions.length > 0) && (
              <div className="flex items-center flex-wrap gap-2">
                {classOptions.length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="flex items-center space-x-2 bg-white">
                        <Filter className="w-4 h-4" />
                        <span>
                          {selectedClassFilter
                            ? `Class ${selectedClassFilter}`
                            : 'Filter by Class'}
                        </span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem
                        onClick={() => setSelectedClassFilter(null)}
                        className={!selectedClassFilter ? 'bg-blue-50' : ''}
                      >
                        All Classes ({contents.length})
                      </DropdownMenuItem>
                      {classOptions.map((classNum) => {
                        const count = contents.filter(
                          (c) => normalizeClassNumber(c.classNumber) === classNum,
                        ).length;
                        return (
                          <DropdownMenuItem
                            key={classNum}
                            onClick={() => setSelectedClassFilter(classNum)}
                            className={selectedClassFilter === classNum ? 'bg-blue-50' : ''}
                          >
                            Class {classNum} ({count})
                          </DropdownMenuItem>
                        );
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}

                {contents.length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="flex items-center space-x-2 bg-white">
                        <Filter className="w-4 h-4" />
                        <span>
                          {selectedContentType ? `Filter: ${selectedContentType}` : 'Filter by Type'}
                        </span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem
                        onClick={() => setSelectedContentType(null)}
                        className={!selectedContentType ? 'bg-blue-50' : ''}
                      >
                        All Types ({classFilteredContents.length})
                      </DropdownMenuItem>
                      {uniqueContentTypes.map((type) => {
                        const count = classFilteredContents.filter((c) => c.type === type).length;
                        return (
                          <DropdownMenuItem
                            key={type}
                            onClick={() => setSelectedContentType(type)}
                            className={selectedContentType === type ? 'bg-blue-50' : ''}
                          >
                            {type} ({count})
                          </DropdownMenuItem>
                        );
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}

                {hasActiveFilters && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedContentType(null);
                      setSelectedClassFilter(null);
                    }}
                    className="flex items-center space-x-1"
                  >
                    <X className="w-4 h-4" />
                    <span>Clear filters</span>
                  </Button>
                )}
              </div>
            )}
          </div>

          {loadingContents ? (
            <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
              <p className="text-gray-600">Loading content...</p>
            </div>
          ) : filteredContents.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
              <Play className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No content available</h3>
              <p className="text-gray-500 text-sm">
                {selectedContentType && selectedClassFilter
                  ? `No ${selectedContentType} items for Class ${selectedClassFilter} yet.`
                  : selectedContentType
                    ? `No ${selectedContentType} items for this subject yet.`
                    : selectedClassFilter
                      ? `No content for Class ${selectedClassFilter} in this subject yet.`
                      : 'Content will appear here once it is added to your assigned subjects.'}
              </p>
            </div>
          ) : (
            <CalendarView
              contents={filteredContents}
              isLoading={loadingContents}
              onMarkAsDone={undefined}
              completedItems={[]}
              subjectName={subject?.name || ''}
            />
          )}
        </div>
      </div>
    </div>
  );
}
