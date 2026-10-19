import { canonicalTeacherSubjectLabel } from '@/lib/subject-names';
import { useState, useEffect, useRef } from 'react';
import { useRoute, useLocation, useSearch } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getAuthToken } from '@/lib/auth-utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { 
  ArrowLeft,
  FileText, 
  Filter,
  RefreshCw,
  X
} from 'lucide-react';
import CalendarView from '@/components/student/calendar-view';
import { API_BASE_URL } from '@/lib/api-config';
import { sortContentsChapterWise } from '@/lib/video-chapter-schedule';
import { filterVideosForLearningPath } from '@/lib/school-program';
import { formatLibraryContentClassLabel } from '@/lib/library-content-labels';

interface ContentItem {
  _id: string;
  title: string;
  description?: string;
  type: 'TextBook' | 'Workbook' | 'Material' | 'Video' | 'Audio' | 'Homework';
  fileUrl: string;
  date: string;
  createdAt: string;
  deadline?: string;
  chapter?: string;
  module?: string;
  topic?: string;
}

interface Subject {
  _id: string;
  name: string;
  description?: string;
}

export default function AdminSubjectContent() {
  const [, params] = useRoute('/admin/subject/:id');
  const [, setLocation] = useLocation();
  const search = useSearch();
  const [subject, setSubject] = useState<Subject | null>(null);
  const [loading, setLoading] = useState(true);
  const [contents, setContents] = useState<ContentItem[]>([]);
  const [loadingContents, setLoadingContents] = useState(true);
  const [selectedContentType, setSelectedContentType] = useState<string | null>(null);
  const fetchGenRef = useRef(0);

  useEffect(() => {
    if (!params?.id) return;
    const q = search.startsWith('?') ? search.slice(1) : search;
    const mergeParam = new URLSearchParams(q).get('merge');
    const mergeIds = mergeParam
      ? mergeParam
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    void fetchSubjectContent(params.id, mergeIds);
  }, [params?.id, search]);

  const fetchSubjectContent = async (subjectId: string, mergeSubjectIds: string[]) => {
    const fetchId = ++fetchGenRef.current;
    try {
      setLoading(true);
      setLoadingContents(true);
      const token = getAuthToken();
      const subjectIds = Array.from(new Set([subjectId, ...mergeSubjectIds]));

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

      const contentResponses = await Promise.all(
        subjectIds.map((id) =>
          fetch(
            `${API_BASE_URL}/api/admin/asli-prep-content?subject=${encodeURIComponent(id)}&surface=learning-path`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
            },
          ),
        ),
      );

      if (fetchId !== fetchGenRef.current) return;

      const seen = new Set<string>();
      const merged: ContentItem[] = [];
      for (const contentsResponse of contentResponses) {
        if (!contentsResponse.ok) continue;
        const contentType = contentsResponse.headers.get('content-type');
        if (!contentType?.includes('application/json')) continue;
        const contentsData = await contentsResponse.json();
        const contentsList = contentsData.data || contentsData || [];
        if (!Array.isArray(contentsList)) continue;
        for (const item of contentsList) {
          const id = item?._id ? String(item._id) : '';
          if (!id || seen.has(id)) continue;
          seen.add(id);
          merged.push(item);
        }
      }

      // Defense in depth: IIT-track videos belong in EduOTT only.
      setContents(sortContentsChapterWise(filterVideosForLearningPath(merged)));
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

  const getContentTypeOptions = () => {
    const types = new Set(contents.map(c => c.type));
    return Array.from(types);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
        <div className="w-full px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading subject content...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <div className="w-full px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
        {/* Header */}
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => setLocation('/admin/dashboard?tab=learning-paths')}
            className="mb-4"
          >
            <ArrowLeft className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
            Back to Learning Paths
          </Button>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 break-words">{subject?.name ? canonicalTeacherSubjectLabel(subject.name) : 'Subject'}</h1>
              {(() => {
                const classLabel = contents
                  .map((row) => formatLibraryContentClassLabel(row))
                  .find(Boolean);
                return classLabel ? (
                  <p className="text-sm font-medium text-sky-800 mt-1">{classLabel}</p>
                ) : null;
              })()}
              {subject?.description && (
                <p className="text-gray-600 mt-2 break-words">{subject.description}</p>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (!params?.id) return;
                const q = search.startsWith('?') ? search.slice(1) : search;
                const mergeParam = new URLSearchParams(q).get('merge');
                const mergeIds = mergeParam
                  ? mergeParam
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean)
                  : [];
                void fetchSubjectContent(params.id, mergeIds);
              }}
              disabled={loadingContents}
              className="w-full sm:w-auto shrink-0"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${loadingContents ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Calendar View */}
        <Card className="bg-white/80 backdrop-blur-xl shadow-xl border border-white/20">
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-xl sm:text-2xl font-bold break-words">Content Calendar</CardTitle>
              {getContentTypeOptions().length > 0 && (
                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                  <Filter className="w-3 h-3 sm:w-4 sm:h-4 text-gray-500 shrink-0" />
                  <select
                    value={selectedContentType || ''}
                    onChange={(e) => setSelectedContentType(e.target.value || null)}
                    className="flex-1 sm:flex-none min-w-0 px-3 py-1 border border-gray-300 rounded-lg text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">All Content Types</option>
                    {getContentTypeOptions().map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                  {selectedContentType && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedContentType(null)}
                      className="flex items-center space-x-1"
                    >
                      <X className="w-3 h-3 sm:w-4 sm:h-4" />
                      <span>Clear</span>
                    </Button>
                  )}
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {loadingContents ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Loading content...</p>
              </div>
            ) : (
              <CalendarView 
                contents={selectedContentType 
                  ? contents.filter(c => c.type === selectedContentType)
                  : contents}
                onMarkAsDone={undefined}
                completedItems={[]}
                subjectName={subject?.name || ''}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}


