import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import StudentShell from "@/components/layout/StudentShell";
import TeacherShell from "@/components/layout/TeacherShell";
import {
  BookOpen,
  ChevronRight,
  Clock,
  Play,
  CheckCircle,
  ArrowRight,
  Target,
  Zap,
  Award,
  FileText,
  BarChart3,
  BookOpen as BookIcon,
  User,
  Calculator,
  Atom,
  FlaskConical,
  Microscope,
  File,
  Image as ImageIcon,
  FileText as FileTextIcon,
  X,
  Eye,
  ClipboardList,
  Headphones,
  ExternalLink,
  Video,
  Loader2,
  Search,
  RefreshCw,
  GraduationCap,
  Sparkles,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import {
  filterContentsBySchoolProgram,
  filterVideosForLearningPath,
  getAllowedContentTypes,
  resolveIsAsliPrepExclusive,
  type ContentTypeName,
} from "@/lib/school-program";
import {
  formatIitLearningPathContentLabel,
  formatLibraryContentContextLabel,
  isIitTrackContent,
  libraryContentMatchesSubject,
  getLibraryContentSubjectKey,
  getLibraryContentSubjectId,
} from "@/lib/library-content-labels";
import { useIsMobile } from "@/hooks/use-mobile";
import { useState, useEffect, useMemo, useCallback } from "react";
import { API_BASE_URL } from "@/lib/api-config";
import { getUser, getAuthToken } from '@/lib/auth-utils';
import PdfPreviewPanel from "@/components/shared/PdfPreviewPanel";
import VidyaAIFloatingAssistant from "@/components/student/VidyaAIFloatingAssistant";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import DriveViewer from "@/components/drive-viewer";
import {
  learningPathDisplayName,
  normalizeSubjectDisplayKey,
  prepareStudentLearningPathSubjects,
} from "@/lib/learning-path-subjects";
import { countLearningPathDisplayStats } from "@/lib/learning-path-stats";

function isTeacherPortalUser(): boolean {
  const stored = getUser();
  const role = String(stored?.role || localStorage.getItem("userRole") || "").toLowerCase();
  return role.includes("teacher");
}

function apiRoot(): "/api/teacher" | "/api/student" {
  return isTeacherPortalUser() ? "/api/teacher" : "/api/student";
}

/** Keys for restoring the view after a reload (QA: reload jumped to the root view). */
const LEARNING_PATHS_TAB_KEY = "asli:learning-paths:tab";
const LEARNING_PATHS_TYPE_KEY = "asli:learning-paths:contentType";
const LEARNING_PATHS_PREVIEW_KEY = "asli:learning-paths:preview";

type StoredLearningPathPreview = {
  id: string;
  title?: string;
  fileUrl?: string;
  type?: string;
  description?: string;
  subject?: unknown;
};

function readStoredPreview(): StoredLearningPathPreview | null {
  try {
    const raw = window.sessionStorage.getItem(LEARNING_PATHS_PREVIEW_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredLearningPathPreview;
    if (!parsed?.id || !parsed?.fileUrl) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredPreview(content: StoredLearningPathPreview | null) {
  try {
    if (!content?.id || !content?.fileUrl) {
      window.sessionStorage.removeItem(LEARNING_PATHS_PREVIEW_KEY);
      return;
    }
    window.sessionStorage.setItem(
      LEARNING_PATHS_PREVIEW_KEY,
      JSON.stringify({
        id: String(content.id),
        title: content.title,
        fileUrl: content.fileUrl,
        type: content.type,
        description: content.description,
        subject: content.subject,
      }),
    );
  } catch {
    /* private mode */
  }
}

export default function LearningPaths() {
  const [, setLocation] = useLocation();
  const isMobile = useIsMobile();
  const isTeacher = isTeacherPortalUser();
  const Shell = isTeacher ? TeacherShell : StudentShell;
  const [user, setUser] = useState<any>(() => getUser());
  const [isLoadingUser, setIsLoadingUser] = useState(() => !getUser());
  const [subjects, setSubjects] = useState<any[]>([]);
  const [isLoadingSubjects, setIsLoadingSubjects] = useState(true);
  /**
   * Reloading used to drop the user back on the default tab and content type.
   * The view is kept in sessionStorage so a refresh returns to where they were.
   */
  const [activeTab, setActiveTab] = useState<'subjects' | 'quizzes'>(() => {
    try {
      const saved = window.sessionStorage.getItem(LEARNING_PATHS_TAB_KEY);
      return saved === 'quizzes' || saved === 'subjects' ? saved : 'subjects';
    } catch {
      return 'subjects';
    }
  });
  const [quizzes, setQuizzes] = useState<any[]>([]);
  const [isLoadingQuizzes, setIsLoadingQuizzes] = useState(true);
  const isAsliPrepExclusive = resolveIsAsliPrepExclusive(user);
  const allowedBrowseTypes = getAllowedContentTypes(isAsliPrepExclusive);
  const [isLoadingContentCounts, setIsLoadingContentCounts] = useState(true);
  const [selectedContentType, setSelectedContentType] = useState<ContentTypeName | null>(() => {
    try {
      const saved = window.sessionStorage.getItem(LEARNING_PATHS_TYPE_KEY);
      return saved ? (saved as ContentTypeName) : null;
    } catch {
      return null;
    }
  });
  // Persist the view whenever it changes, so a refresh lands back here.
  useEffect(() => {
    try {
      window.sessionStorage.setItem(LEARNING_PATHS_TAB_KEY, activeTab);
      if (selectedContentType) {
        window.sessionStorage.setItem(LEARNING_PATHS_TYPE_KEY, selectedContentType);
      } else {
        window.sessionStorage.removeItem(LEARNING_PATHS_TYPE_KEY);
      }
    } catch {
      /* private mode — the view simply won't be restored */
    }
  }, [activeTab, selectedContentType]);

  const [filteredContent, setFilteredContent] = useState<any[]>([]);
  const [isLoadingFilteredContent, setIsLoadingFilteredContent] = useState(false);
  const [allLibraryContent, setAllLibraryContent] = useState<any[]>([]);
  const [headerSearch, setHeaderSearch] = useState('');
  const searchQuery = headerSearch.trim().toLowerCase();
  const allowedLibrarySubjectIds = useMemo(() => {
    const ids = new Set<string>();
    for (const subject of subjects) {
      const primary = String(subject._id || subject.id || '');
      if (primary) ids.add(primary);
      for (const mid of subject.mergedSubjectIds || []) {
        const s = String(mid || '');
        if (s) ids.add(s);
      }
    }
    return ids;
  }, [subjects]);

  const allowedLibrarySubjectKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const subject of subjects) {
      const key = normalizeSubjectDisplayKey(subject?.name || '');
      if (key) keys.add(key);
    }
    return keys;
  }, [subjects]);

  /** Content visible on Learning Paths — match by subject ID or name alias (sibling subjects). */
  const scopedLibraryContent = useMemo(() => {
    if (allowedLibrarySubjectIds.size === 0 && allowedLibrarySubjectKeys.size === 0) {
      return [];
    }
    return allLibraryContent.filter((content: any) => {
      const sid = getLibraryContentSubjectId(content);
      if (sid && allowedLibrarySubjectIds.has(sid)) return true;
      const key = getLibraryContentSubjectKey(content);
      return Boolean(key && allowedLibrarySubjectKeys.has(key));
    });
  }, [allLibraryContent, allowedLibrarySubjectIds, allowedLibrarySubjectKeys]);

  const contentTypeCounts = useMemo(() => {
    const counts = {
      TextBook: 0,
      Workbook: 0,
      Material: 0,
      Audio: 0,
      Homework: 0,
      Video: 0,
    };
    for (const content of scopedLibraryContent) {
      const contentType = content?.type as keyof typeof counts | undefined;
      if (contentType && Object.prototype.hasOwnProperty.call(counts, contentType)) {
        counts[contentType]++;
      }
    }
    return counts;
  }, [scopedLibraryContent]);

  const resourceCount = scopedLibraryContent.length;
  const subjectCount = subjects.length;
  const [libraryEpoch, setLibraryEpoch] = useState(0);

  const refreshLibrary = useCallback(() => {
    setLibraryEpoch((n) => n + 1);
  }, []);

  const visibleSubjects = useMemo(() => {
    if (!searchQuery) return subjects;
    return subjects.filter((subject: any) => {
      const name = learningPathDisplayName(subject.name || '').toLowerCase();
      const raw = String(subject.name || '').toLowerCase();
      if (name.includes(searchQuery) || raw.includes(searchQuery)) return true;

      const subjectIds = new Set(
        [subject._id, subject.id, ...(subject.mergedSubjectIds || [])]
          .map((value) => String(value || ''))
          .filter(Boolean),
      );
      const subjectKey = normalizeSubjectDisplayKey(subject.name || '');
      return scopedLibraryContent.some((content: any) => {
        const contentSubjectId = getLibraryContentSubjectId(content);
        const contentSubjectKey = getLibraryContentSubjectKey(content);
        const belongsToSubject =
          (contentSubjectId && subjectIds.has(contentSubjectId)) ||
          (contentSubjectKey && contentSubjectKey === subjectKey);
        if (!belongsToSubject) return false;
        const haystack = [
          content.title,
          content.description,
          content.type,
          content.chapter,
          content.chapterName,
          content.topic,
          content.subtopic,
          content.subTopic,
        ]
          .map((value) => String(value || '').toLowerCase())
          .join(' ');
        return haystack.includes(searchQuery);
      });
    });
  }, [subjects, scopedLibraryContent, searchQuery]);

  const [previewContent, setPreviewContent] = useState<any | null>(() => readStoredPreview());
  const [isPreviewOpen, setIsPreviewOpen] = useState(() => Boolean(readStoredPreview()));

  const openContentPreview = (content: any) => {
    if (!content?.fileUrl) return;
    const payload = {
      id: String(content._id || content.id || content.fileUrl),
      title: content.title,
      fileUrl: content.fileUrl,
      type: content.type,
      description: content.description,
      subject: content.subject,
    };
    setPreviewContent(payload);
    setIsPreviewOpen(true);
    writeStoredPreview(payload);
  };

  const closeContentPreview = () => {
    setIsPreviewOpen(false);
    setPreviewContent(null);
    writeStoredPreview(null);
  };

  const prefetchSubjectPage = () => {
    void import("@/pages/subject-content");
  };

  const handleSubjectClick = (subject: any) => {
    const primaryId = String(subject._id || subject.id || '');
    if (!primaryId) return;
    const mergedIds: string[] = Array.isArray(subject.mergedSubjectIds)
      ? subject.mergedSubjectIds.map(String).filter(Boolean)
      : [primaryId];
    const otherIds = mergedIds.filter((id) => id !== primaryId);
    const base = isTeacher ? `/teacher/subject/${primaryId}` : `/subject/${primaryId}`;
    const params = new URLSearchParams();
    params.set('returnTo', 'learning');
    if (otherIds.length > 0) {
      params.set('merge', otherIds.join(','));
    }
    setLocation(`${base}?${params.toString()}`);
  };

  const isYouTubeUrl = (url?: string) => {
    if (!url) return false;
    const lower = url.toLowerCase();
    return lower.includes("youtube.com") || lower.includes("youtu.be");
  };

  const getNormalizedContentUrl = (url?: string) => {
    if (!url) return "";
    if (url.startsWith("http") || url.startsWith("//")) return url;
    return url.startsWith("/") ? `${API_BASE_URL}${url}` : `${API_BASE_URL}/${url}`;
  };

  const extractDirectFileUrl = (rawUrl: string) => {
    try {
      const parsed = new URL(rawUrl);
      if (parsed.hostname.includes("docs.google.com") && parsed.pathname.includes("/gview")) {
        const target = parsed.searchParams.get("url");
        if (target) return target;
      }
    } catch {
      return rawUrl;
    }
    return rawUrl;
  };

  const getYouTubeEmbedUrl = (url?: string) => {
    if (!url) return null;
    const regExp = /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    if (!match || match[2].length !== 11) return null;
    return `https://www.youtube.com/embed/${match[2]}`;
  };

  // Fetch user data
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const token = getAuthToken();

        const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          }
        });
        
        if (response.ok) {
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const userData = await response.json();
            setUser(userData.user);
          } else {
            console.warn('User response is not JSON, using fallback data');
            setUser({ 
              fullName: "Student", 
              email: "student@example.com", 
              age: 18, 
              educationStream: "JEE" 
            });
          }
        } else {
          console.warn('User API failed, using fallback data');
          setUser({ 
            fullName: "Student", 
            email: "student@example.com", 
            age: 18, 
            educationStream: "JEE" 
          });
        }
      } catch (error) {
        console.error('Failed to fetch user:', error);
        // Fallback to mock data
        setUser({ 
          fullName: "Student", 
          email: "student@example.com", 
          age: 18, 
          educationStream: "JEE" 
        });
      } finally {
        setIsLoadingUser(false);
      }
    };

    fetchUser();
  }, []);

  // Fetch subjects (library content supplies card counts — no per-subject N+1).
  useEffect(() => {
    const fetchSubjects = async () => {
      try {
        setIsLoadingSubjects(true);
        
        const token = getAuthToken();
        const subjectsResponse = await fetch(`${API_BASE_URL}${apiRoot()}/subjects`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          }
        });
        
        if (subjectsResponse.ok) {
          const contentType = subjectsResponse.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const subjectsData = await subjectsResponse.json();
            
            let subjectsArray = [];
            
            if (subjectsData.subjects && Array.isArray(subjectsData.subjects)) {
              subjectsArray = subjectsData.subjects;
            } else if (subjectsData.data && Array.isArray(subjectsData.data)) {
              subjectsArray = subjectsData.data;
            } else if (Array.isArray(subjectsData)) {
              subjectsArray = subjectsData;
            }
            
            if (!Array.isArray(subjectsArray) || subjectsArray.length === 0) {
              setSubjects([]);
              setIsLoadingSubjects(false);
              return;
            }

            const baseSubjects = subjectsArray.map((subject: any) => ({
              ...subject,
              videos: [],
              quizzes: [],
              assessments: [],
              totalContent: 0
            }));
            const uniqueBaseSubjects = prepareStudentLearningPathSubjects(
              baseSubjects.filter((subject, index, self) => {
                const subjectId = subject._id || subject.id;
                return index === self.findIndex((s: any) => (s._id || s.id) === subjectId);
              }),
            );
            setSubjects(uniqueBaseSubjects);
          } else {
            console.warn('⚠️ Subjects response is not JSON');
            setSubjects([]);
          }
        } else {
          console.warn('Subjects API failed');
          setSubjects([]);
        }
      } catch (error) {
        console.error('❌ ERROR fetching subjects:', error);
        setSubjects([]);
      } finally {
        setIsLoadingSubjects(false);
      }
    };

    fetchSubjects();
  }, [libraryEpoch]);

  // Fetch assigned quizzes (students only — teachers create quizzes elsewhere)
  useEffect(() => {
    const fetchQuizzes = async () => {
      if (isTeacher) {
        setQuizzes([]);
        setIsLoadingQuizzes(false);
        return;
      }
      try {
        setIsLoadingQuizzes(true);
        const token = getAuthToken();
        const response = await fetch(`${API_BASE_URL}/api/student/quizzes`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          setQuizzes(data.data || []);
        } else {
          setQuizzes([]);
        }
      } catch (error) {
        console.error('Failed to fetch quizzes:', error);
        setQuizzes([]);
      } finally {
        setIsLoadingQuizzes(false);
      }
    };

    fetchQuizzes();
  }, [isTeacher]);

  // Fetch Digital Library once — seed AsliPrep flags from local user so we don't wait on /auth/me.
  useEffect(() => {
    const fetchContentCounts = async () => {
      try {
        setIsLoadingContentCounts(true);
        const token = getAuthToken();
        const response = await fetch(`${API_BASE_URL}${apiRoot()}/asli-prep-content?surface=learning-path`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          const rawContent = data.data || data || [];
          const exclusive =
            typeof data?.meta?.isAsliPrepExclusive === 'boolean'
              ? data.meta.isAsliPrepExclusive
              : resolveIsAsliPrepExclusive(user ?? getUser());
          const allContent = filterVideosForLearningPath(
            filterContentsBySchoolProgram(
              Array.isArray(rawContent) ? rawContent : [],
              exclusive,
            ),
          );
          setAllLibraryContent(allContent);
        } else {
          setAllLibraryContent([]);
        }
      } catch (error) {
        console.error('Failed to fetch content counts:', error);
        setAllLibraryContent([]);
      } finally {
        setIsLoadingContentCounts(false);
      }
    };

    fetchContentCounts();
    // Intentionally keyed by libraryEpoch — program meta comes from the API response.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libraryEpoch]);

  // Update filtered content from already-fetched library content
  useEffect(() => {
    if (!selectedContentType) {
      setFilteredContent([]);
      setIsLoadingFilteredContent(false);
      return;
    }

    if (isLoadingContentCounts) {
      setIsLoadingFilteredContent(true);
      return;
    }

    setIsLoadingFilteredContent(true);
    let filtered = scopedLibraryContent.filter((content: any) => content.type === selectedContentType);
    if (searchQuery) {
      filtered = filtered.filter((content: any) => {
        const title = String(content.title || '').toLowerCase();
        const subjectName =
          typeof content.subject === 'object'
            ? String(content.subject?.name || '').toLowerCase()
            : String(content.subject || '').toLowerCase();
        const haystack = [
          title,
          subjectName,
          content.description,
          content.type,
          content.chapter,
          content.chapterName,
          content.topic,
          content.subtopic,
          content.subTopic,
        ]
          .map((value) => String(value || '').toLowerCase())
          .join(' ');
        return haystack.includes(searchQuery);
      });
    }
    setFilteredContent(filtered);
    setIsLoadingFilteredContent(false);
  }, [selectedContentType, scopedLibraryContent, isLoadingContentCounts, searchQuery]);

  return (
    <Shell>
      <div className="relative w-full">
        
        {!isMobile && !isTeacher && <VidyaAIFloatingAssistant />}

        {/* Blue hero — books on the right, glow kept subtle */}
        <div className="mb-8">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#2f5bff] via-[#3558e8] to-[#2a3fd4] p-5 text-white shadow-[0_18px_40px_-24px_rgba(37,99,235,0.45)] sm:p-7 lg:p-8">
            <div
              className="pointer-events-none absolute -right-8 top-1/2 h-48 w-48 -translate-y-1/2 rounded-full bg-white/[0.08] blur-3xl"
              aria-hidden="true"
            />
            <BookOpen
              className="pointer-events-none absolute right-[38%] top-6 h-6 w-6 text-white/20"
              strokeWidth={1.4}
              aria-hidden="true"
            />
            <Sparkles
              className="pointer-events-none absolute right-10 top-8 h-5 w-5 text-white/20"
              strokeWidth={1.4}
              aria-hidden="true"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="absolute right-4 top-4 z-10 border-white/25 bg-white/15 text-white backdrop-blur-sm hover:bg-white/25 hover:text-white sm:right-6 sm:top-6"
              onClick={refreshLibrary}
              disabled={isLoadingSubjects || isLoadingContentCounts}
            >
              <RefreshCw
                className={
                  'mr-2 h-4 w-4' +
                  (isLoadingSubjects || isLoadingContentCounts ? ' animate-spin' : '')
                }
              />
              Refresh
            </Button>

            <div className="relative z-[1] grid items-center gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(200px,0.75fr)] lg:gap-6">
              <div className="min-w-0 space-y-4 sm:space-y-5">
                <div>
                  <p className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-white">
                    <GraduationCap className="h-3.5 w-3.5" />
                    Learning Paths
                  </p>
                  <h2 className="mt-3 font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
                    Learn with clarity.{' '}
                    <span className="text-[#9ee7ff]">Grow every day.</span>
                  </h2>
                  <p className="mt-2 max-w-xl text-sm leading-relaxed text-blue-100 sm:text-base">
                    {isTeacher
                      ? 'Subjects, textbooks, videos, and study materials for the classes you teach — all in one place.'
                      : 'Subjects, textbooks, videos, and practice materials curated for your class — ready when you are.'}
                  </p>
                </div>

                <label className="relative block max-w-xl">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    value={headerSearch}
                    onChange={(e) => setHeaderSearch(e.target.value)}
                    placeholder="Search for subjects, topics or content..."
                    className="h-12 w-full rounded-full border-0 bg-white pl-11 pr-4 text-sm text-slate-800 shadow-md outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-sky-200"
                    aria-label="Search learning paths"
                  />
                </label>

                <div className="grid gap-2.5 sm:grid-cols-3">
                  <div className="flex items-center gap-2.5 rounded-2xl bg-white/12 px-3 py-2.5 ring-1 ring-white/15">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15">
                      <BookOpen className="h-4 w-4 text-white" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold leading-tight">
                        {isLoadingSubjects ? '…' : subjectCount} Subjects
                      </p>
                      <p className="text-[11px] text-blue-100/90">Explore topics</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 rounded-2xl bg-white/12 px-3 py-2.5 ring-1 ring-white/15">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15">
                      <FileText className="h-4 w-4 text-white" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold leading-tight">
                        {isLoadingContentCounts ? '…' : `${resourceCount}+`} Resources
                      </p>
                      <p className="text-[11px] text-blue-100/90">Study materials</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 rounded-2xl bg-white/12 px-3 py-2.5 ring-1 ring-white/15">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15">
                      <Target className="h-4 w-4 text-white" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold leading-tight">Your Progress</p>
                      <p className="text-[11px] text-blue-100/90">Track &amp; achieve</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="relative mx-auto flex w-full max-w-[280px] items-end justify-center sm:max-w-[320px] lg:mx-0 lg:max-w-none lg:justify-end">
                <img
                  src="/Scholar.png"
                  alt="Stack of books with a graduation cap"
                  className="relative z-10 h-auto w-full max-h-[230px] object-contain drop-shadow-2xl sm:max-h-[270px] lg:max-h-[300px] lg:-mb-2"
                  draggable={false}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        {!isTeacher ? (
        <div className="mb-8">
          <div className="flex space-x-1 bg-gray-100 rounded-lg p-1 mb-6 overflow-x-auto">
            <button
              onClick={() => setActiveTab('subjects')}
              className={`flex-1 min-w-[140px] px-4 sm:px-6 py-3 text-xs sm:text-sm font-medium rounded-md transition-all ${
                activeTab === 'subjects'
                  ? 'bg-white text-gray-900 shadow-sm border border-gray-300'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Browse by Subject
            </button>
            <button
              onClick={() => setActiveTab('quizzes')}
              className={`flex-1 min-w-[140px] px-4 sm:px-6 py-3 text-xs sm:text-sm font-medium rounded-md transition-all ${
                activeTab === 'quizzes'
                  ? 'bg-white text-gray-900 shadow-sm border border-gray-300'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              My Quizzes
            </button>
          </div>
        </div>
        ) : null}

        {/* Browse by Subject Tab */}
        {activeTab === 'subjects' && (
        <div className="mb-8">
          <h2 className="mb-6 font-display text-2xl font-bold text-ink">Browse by Subject</h2>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {isLoadingSubjects ? (
              <div className="col-span-full flex flex-col items-center justify-center py-20">
                <Loader2 className="w-10 h-10 text-sky-500 animate-spin mb-3" aria-hidden />
                <p className="text-sm text-gray-600 font-medium">Loading subjects...</p>
              </div>
            ) : visibleSubjects.length === 0 ? (
              <div className="col-span-full text-center py-12">
                <BookOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-base sm:text-lg font-semibold text-gray-600 mb-2">
                  {searchQuery ? 'No matching subjects' : 'No Subjects Available'}
                </h3>
                <p className="text-gray-500 max-w-md mx-auto">
                  {searchQuery
                    ? `Nothing matched “${headerSearch.trim()}”. Try another subject name.`
                    : isTeacher
                      ? 'We could not match curriculum subjects for your class yet. Confirm Class 6–12 and board on signup, or ask your school admin to assign subjects.'
                      : 'Check back later for new learning content.'}
                </p>
              </div>
            ) : (
              visibleSubjects.map((subject: any) => {
                const displayName = learningPathDisplayName(subject.name || '');
                const name = String(displayName || subject.name || '').toLowerCase();
                const theme =
                  name.includes('math') ? { Icon: Calculator, chip: 'from-amber-500 to-orange-600', btn: 'bg-amber-500 hover:bg-amber-600', soft: 'bg-amber-50 text-amber-700' }
                  : name.includes('physics') ? { Icon: Atom, chip: 'from-orange-500 to-rose-600', btn: 'bg-orange-500 hover:bg-orange-600', soft: 'bg-orange-50 text-orange-700' }
                  : name.includes('chemistry') ? { Icon: FlaskConical, chip: 'from-sky-500 to-blue-600', btn: 'bg-sky-500 hover:bg-sky-600', soft: 'bg-sky-50 text-sky-700' }
                  : name.includes('biology') || name === 'bio' ? { Icon: Microscope, chip: 'from-emerald-500 to-green-600', btn: 'bg-emerald-500 hover:bg-emerald-600', soft: 'bg-emerald-50 text-emerald-700' }
                  : name.includes('english') ? { Icon: BookIcon, chip: 'from-violet-500 to-purple-600', btn: 'bg-violet-500 hover:bg-violet-600', soft: 'bg-violet-50 text-violet-700' }
                  : name.includes('social') ? { Icon: BookOpen, chip: 'from-pink-500 to-rose-600', btn: 'bg-pink-500 hover:bg-pink-600', soft: 'bg-pink-50 text-pink-700' }
                  : name.includes('science') ? { Icon: Zap, chip: 'from-teal-500 to-cyan-600', btn: 'bg-teal-500 hover:bg-teal-600', soft: 'bg-teal-50 text-teal-700' }
                  : { Icon: BookOpen, chip: 'from-indigo-blue-500 to-indigo-blue-700', btn: 'bg-indigo-blue-600 hover:bg-indigo-blue-700', soft: 'bg-indigo-blue-50 text-indigo-blue-700' };

                const Icon = theme.Icon;

                // Count from full library using ID + Social studies↔Social Science aliases
                // (same sibling expansion the subject page uses on the API).
                const mine = allLibraryContent.filter((c: any) =>
                  libraryContentMatchesSubject(c, subject),
                );
                const boardMine = mine.filter((c: any) => !isIitTrackContent(c));
                const iitMine = mine.filter((c: any) => isIitTrackContent(c));
                const boardStats = countLearningPathDisplayStats(boardMine);
                const iitCount = iitMine.length;
                const tiles = [
                  { label: 'Textbooks', value: boardStats.textbooks, iit: false },
                  { label: 'Materials', value: boardStats.materials, iit: false },
                  ...(iitCount > 0 || subject.hasIitTrack
                    ? [{ label: 'IIT', value: iitCount, iit: true }]
                    : boardStats.videos > 0 ||
                        (isAsliPrepExclusive && allowedBrowseTypes.includes('Video'))
                      ? [{ label: 'Videos', value: boardStats.videos, iit: false }]
                      : []),
                ];
                const cardTotal =
                  boardStats.textbooks + boardStats.materials + boardStats.videos + iitCount;
                const recentBoard = boardMine.slice(0, 2);
                const recentIit = iitMine.slice(0, 2);

                return (
                  <div
                    key={subject._id || subject.id}
                    className="flex h-full flex-col rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-elevated"
                    onMouseEnter={prefetchSubjectPage}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${theme.chip} shadow-sm`}>
                        <Icon className="h-6 w-6 text-white" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate font-display text-lg font-bold text-ink">{displayName}</h3>
                        <p className="truncate text-sm text-muted-foreground">
                          {iitCount > 0
                            ? `${displayName} · includes ${displayName} IIT`
                            : `Content for ${displayName}`}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${theme.soft}`}>
                        {cardTotal} {cardTotal === 1 ? 'Item' : 'Items'}
                      </span>
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2">
                      {tiles.map((t) => (
                        <div
                          key={t.label}
                          className={`rounded-xl border px-2 py-2.5 text-center ${
                            t.iit
                              ? 'border-slate-800 bg-slate-900 text-amber-200'
                              : 'border-border bg-background'
                          }`}
                        >
                          <p
                            className={`font-display text-lg font-bold leading-none ${
                              t.iit ? 'text-amber-200' : 'text-ink'
                            }`}
                          >
                            {t.value}
                          </p>
                          <p
                            className={`mt-1 text-micro font-medium ${
                              t.iit ? 'text-amber-200/80' : 'text-muted-foreground'
                            }`}
                          >
                            {t.label}
                          </p>
                        </div>
                      ))}
                    </div>

                    {recentBoard.length > 0 && (
                      <div className="mt-4">
                        <p className="mb-2 text-micro font-bold uppercase tracking-wider text-muted-foreground">
                          {displayName}
                        </p>
                        <ul className="space-y-1.5">
                          {recentBoard.map((c: any, i: number) => (
                            <li
                              key={c?._id || c?.id || `board-${i}`}
                              className="flex items-center justify-between gap-2 rounded-lg bg-background px-3 py-2"
                            >
                              <span className="truncate text-sm text-ink-soft">
                                {c?.title || c?.name || 'Untitled'}
                              </span>
                              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {recentIit.length > 0 && (
                      <div className="mt-3">
                        <p className="mb-2 text-micro font-bold uppercase tracking-wider text-amber-700">
                          {displayName} IIT
                        </p>
                        <ul className="space-y-1.5">
                          {recentIit.map((c: any, i: number) => (
                            <li
                              key={c?._id || c?.id || `iit-${i}`}
                              className="flex items-center justify-between gap-2 rounded-lg border border-amber-100 bg-amber-50/70 px-3 py-2"
                            >
                              <span className="truncate text-sm text-ink-soft">
                                {formatIitLearningPathContentLabel(c, displayName)}
                                {c?.title ? ` · ${c.title}` : ''}
                              </span>
                              <ChevronRight className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => handleSubjectClick(subject)}
                      className={`mt-auto flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${theme.btn} ${recentBoard.length || recentIit.length ? 'mt-4' : 'mt-4'}`}
                    >
                      View Content
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
        )}

        {/* My Quizzes Tab */}
        {activeTab === 'quizzes' && (
        <div className="mb-8 w-full">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-6">My Quizzes</h2>
          {isLoadingQuizzes ? (
            <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-gray-200">
              <Loader2 className="w-10 h-10 text-sky-500 animate-spin mb-3" aria-hidden />
              <p className="text-sm text-gray-600 font-medium">Loading quizzes...</p>
            </div>
          ) : quizzes.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-2xl border border-gray-200">
              <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-base sm:text-lg font-semibold text-gray-600 mb-2">No Quizzes Assigned</h3>
              <p className="text-gray-500">Your teacher hasn't assigned any quizzes yet. Check back later!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:p-4 lg:p-6">
              {quizzes.map((quiz: any) => (
                        <Card key={quiz._id} className="hover:shadow-lg transition-shadow duration-200">
                    <CardHeader>
                      <div className="flex items-center justify-between mb-2">
                      <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center shadow-lg">
                        <FileText className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-white" />
                        </div>
                      {quiz.hasAttempted && (
                        <Badge className="bg-green-100 text-green-700 border-green-300">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Completed
                        </Badge>
                      )}
                      </div>
                    <CardTitle className="text-base sm:text-lg">{quiz.title}</CardTitle>
                    <p className="text-gray-600 text-xs sm:text-sm">{quiz.description || `Quiz on ${quiz.subject}`}</p>
                    </CardHeader>
                    <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-center">
                      <div className="bg-blue-50 rounded-lg p-2">
                        <Clock className="w-3 h-3 sm:w-4 sm:h-4 text-blue-600 mx-auto mb-1" />
                        <p className="text-xs font-medium text-blue-800">{quiz.duration} min</p>
                        <p className="text-xs text-blue-600">Duration</p>
                      </div>
                      <div className="bg-blue-50 rounded-lg p-2">
                        <Target className="w-3 h-3 sm:w-4 sm:h-4 text-blue-600 mx-auto mb-1" />
                        <p className="text-xs font-medium text-blue-800">{quiz.questionCount}</p>
                        <p className="text-xs text-blue-600">Questions</p>
                      </div>
                    </div>
                    
                    {quiz.hasAttempted && quiz.bestScore !== null && (
                      <div className="bg-green-50 rounded-lg p-3 border border-green-200">
                        <div className="flex items-center justify-between">
                          <span className="text-xs sm:text-sm font-medium text-green-800">Best Score:</span>
                          <span className="text-base sm:text-lg font-bold text-green-900">{quiz.bestScore}/{quiz.totalPoints}</span>
                        </div>
                        {quiz.completedAt && (
                          <p className="text-xs text-green-600 mt-1">
                            Completed: {new Date(quiz.completedAt).toLocaleDateString()}
                          </p>
                                )}
                      </div>
                    )}

                    <div className="flex items-center space-x-2">
                      <Badge variant="outline" className="text-xs">
                        {quiz.difficulty}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {quiz.subject}
                      </Badge>
                              </div>

                    <Link href={`/student-exams?quiz=${quiz._id}`}>
                      <Button className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-lg">
                        {quiz.hasAttempted ? 'Retake Quiz' : 'Start Quiz'}
                        <ArrowRight className="w-3 h-3 sm:w-4 sm:h-4 ml-2" />
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
                            ))}
                          </div>
          )}
                        </div>
                      )}

        {/* Digital Library - Browse by Type - Always Visible */}
        <div className="mb-8 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-blue-500 to-violet-600 shadow-sm">
              <BookOpen className="h-[1.35rem] w-[1.35rem] text-white" aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-display text-2xl font-bold text-ink">Digital Library</h2>
              <p className="text-sm text-muted-foreground">Browse everything by type · tap a card to filter</p>
            </div>
          </div>

          <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {([
              { key: 'TextBook', label: 'Textbooks', Icon: BookOpen, chip: 'from-sky-500 to-blue-600', ring: 'ring-sky-500', tint: 'bg-sky-50' },
              { key: 'Video', label: 'Videos', Icon: Video, chip: 'from-rose-500 to-pink-600', ring: 'ring-rose-500', tint: 'bg-rose-50' },
              { key: 'Workbook', label: 'Workbooks', Icon: FileTextIcon, chip: 'from-violet-500 to-purple-600', ring: 'ring-violet-500', tint: 'bg-violet-50' },
              { key: 'Material', label: 'Materials', Icon: File, chip: 'from-amber-500 to-orange-600', ring: 'ring-amber-500', tint: 'bg-amber-50' },
              { key: 'Audio', label: 'Audio', Icon: Headphones, chip: 'from-teal-500 to-emerald-600', ring: 'ring-teal-500', tint: 'bg-teal-50' },
              { key: 'Homework', label: 'Homework', Icon: ClipboardList, chip: 'from-indigo-blue-500 to-indigo-blue-700', ring: 'ring-indigo-blue-500', tint: 'bg-indigo-blue-50' },
            ] as const)
              .filter((t) => t.key === 'TextBook' || t.key === 'Audio' || t.key === 'Homework' || allowedBrowseTypes.includes(t.key))
              .map(({ key, label, Icon, chip, ring, tint }) => {
                const count = contentTypeCounts[key as keyof typeof contentTypeCounts];
                const active = selectedContentType === key;
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setSelectedContentType(active ? null : key)}
                    className={`flex flex-col items-center gap-2 rounded-2xl border border-border p-4 text-center transition-all hover:-translate-y-0.5 hover:shadow-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      active ? `${tint} ring-2 ${ring}` : 'bg-background'
                    }`}
                  >
                    <span className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${chip} shadow-sm`}>
                      <Icon className="h-6 w-6 text-white" aria-hidden="true" />
                    </span>
                    <span className="font-display text-2xl font-bold leading-none text-ink">
                      {isLoadingContentCounts ? '—' : count}
                    </span>
                    <span className="text-sm font-medium text-muted-foreground">{label}</span>
                  </button>
                );
              })}
          </div>

          {/* Filtered Content Display */}
          {selectedContentType && (
            <div className="mt-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg sm:text-xl font-semibold text-gray-900">
                  All {selectedContentType}
                </h3>
                <Button
                  variant="outline"
                  onClick={() => setSelectedContentType(null)}
                  className="flex items-center space-x-2"
                >
                  <X className="w-3 h-3 sm:w-4 sm:h-4" />
                  <span>Clear Filter</span>
                </Button>
                              </div>

              {isLoadingFilteredContent ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:p-4 lg:p-6">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-48 w-full" />
                  ))}
                </div>
              ) : filteredContent.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-2xl border border-gray-200">
                  <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-base sm:text-lg font-semibold text-gray-600 mb-2">No Content Found</h3>
                  <p className="text-gray-500">No {selectedContentType} available at the moment.</p>
                </div>
              ) : (
                <div className="space-y-8">
                  {(() => {
                    const boardRows = filteredContent.filter((c: any) => !isIitTrackContent(c));
                    const iitRows = filteredContent.filter((c: any) => isIitTrackContent(c));
                    const renderCard = (content: any) => (
                      <Card key={content._id} className="hover:shadow-lg transition-shadow duration-200 h-full flex flex-col">
                      <CardHeader>
                        <div className="flex items-center justify-between mb-2">
                          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center shadow-lg">
                            {selectedContentType === 'TextBook' ? (
                              <BookOpen className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-white" />
                            ) : selectedContentType === 'Workbook' ? (
                              <FileTextIcon className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-white" />
                            ) : selectedContentType === 'Material' ? (
                              <File className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-white" />
                            ) : selectedContentType === 'Audio' ? (
                              <Headphones className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-white" />
                            ) : selectedContentType === 'Homework' ? (
                              <ClipboardList className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-white" />
                            ) : (
                              <FileTextIcon className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-white" />
                            )}
                          </div>
                          <Badge
                            variant="outline"
                            className={`text-xs ${isIitTrackContent(content) ? 'border-amber-300 bg-amber-50 text-amber-800' : ''}`}
                          >
                            {isIitTrackContent(content)
                              ? formatIitLearningPathContentLabel(
                                  content,
                                  typeof content.subject === 'object' ? content.subject?.name : '',
                                )
                              : content.type}
                          </Badge>
                        </div>
                        <CardTitle className="text-base sm:text-lg">{content.title}</CardTitle>
                        {(() => {
                          const context = formatLibraryContentContextLabel(content);
                          return context ? (
                            <p className="text-xs sm:text-sm font-medium text-slate-700 mt-1">{context}</p>
                          ) : null;
                        })()}
                        {content.description && (
                          <p className="text-gray-600 text-xs sm:text-sm mt-2">{content.description}</p>
                        )}
                      </CardHeader>
                      <CardContent className="space-y-3 flex-1 flex flex-col">
                        <div className="flex space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1"
                            onClick={() => openContentPreview(content)}
                            disabled={!content.fileUrl}
                          >
                            <Eye className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
                            View
                        </Button>
                          {content.fileUrl && isYouTubeUrl(content.fileUrl) && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openContentPreview(content)}
                                title="Preview in this page"
                              >
                                <ExternalLink className="w-3 h-3 sm:w-4 sm:h-4" />
                              </Button>
                          )}
                        </div>
                    </CardContent>
                  </Card>
                    );

                    return (
                      <>
                        {boardRows.length > 0 ? (
                          <section>
                            <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-600">
                              Board / curriculum
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:p-4 lg:p-6 items-stretch">
                              {boardRows.map(renderCard)}
                            </div>
                          </section>
                        ) : null}
                        {iitRows.length > 0 ? (
                          <section>
                            <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-amber-700">
                              IIT materials
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:p-4 lg:p-6 items-stretch">
                              {iitRows.map(renderCard)}
                            </div>
                          </section>
                        ) : null}
                      </>
                    );
                  })()}
                </div>
            )}
          </div>
          )}
        </div>

      </div>

      <Dialog
        open={isPreviewOpen}
        onOpenChange={(open) => {
          if (!open) closeContentPreview();
          else setIsPreviewOpen(true);
        }}
      >
        <DialogContent className="flex h-[min(96dvh,1200px)] max-h-[96dvh] w-[min(98vw,1280px)] max-w-[1280px] flex-col overflow-hidden rounded-xl border-0 bg-[#d6d3d1] p-0 shadow-2xl">
          <DialogHeader className="shrink-0 space-y-1 border-b border-stone-300/60 bg-stone-100/95 px-5 pb-4 pt-5 sm:px-7 sm:pb-5 sm:pt-6">
            <DialogTitle className="pr-12 text-left text-lg font-bold leading-snug text-slate-900 sm:text-xl md:text-2xl">
              {previewContent?.title || "Content Preview"}
            </DialogTitle>
            {(() => {
              const context = previewContent
                ? formatLibraryContentContextLabel(previewContent)
                : "";
              const bits = [context, previewContent?.type].filter(Boolean);
              return bits.length > 0 ? (
                <p className="text-left text-sm text-slate-600 sm:text-base">
                  {bits.join(" · ")}
                  {previewContent?.description ? ` · ${previewContent.description}` : ""}
                </p>
              ) : previewContent?.type ? (
                <p className="text-left text-sm text-slate-600 sm:text-base">
                  {previewContent.type}
                  {previewContent.description ? ` · ${previewContent.description}` : ""}
                </p>
              ) : null;
            })()}
          </DialogHeader>
          <div
            className={`min-h-0 flex-1 ${
              (() => {
                const previewUrl = extractDirectFileUrl(getNormalizedContentUrl(previewContent?.fileUrl));
                const previewLower = previewUrl.toLowerCase();
                const previewIsPdf =
                  previewLower.endsWith(".pdf") ||
                  previewLower.includes(".pdf") ||
                  previewContent?.type === "PDF" ||
                  previewContent?.type === "TextBook";
                return previewIsPdf
                  ? "flex min-h-0 flex-col overflow-hidden p-0"
                  : "overflow-x-hidden overflow-y-auto px-4 py-4 sm:px-6";
              })()
            }`}
          >

          {(() => {
            const fileUrl = extractDirectFileUrl(getNormalizedContentUrl(previewContent?.fileUrl));
            const lower = fileUrl.toLowerCase();
            const isPdf =
              lower.endsWith(".pdf") ||
              lower.includes(".pdf") ||
              previewContent?.type === "PDF" ||
              previewContent?.type === "TextBook";
            const isImage = /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/.test(lower);
            const isAudio = /\.(mp3|wav|ogg|m4a|aac|flac)$/.test(lower) || previewContent?.type === "Audio";
            const isVideo = /\.(mp4|webm|ogg|mov|avi|mkv)$/.test(lower) || previewContent?.type === "Video";
            const isYouTube = isYouTubeUrl(fileUrl);
            const youtubeEmbedUrl = getYouTubeEmbedUrl(fileUrl);
            const isGoogleDrive = lower.includes("drive.google.com");

            if (!fileUrl) {
              return <p className="text-xs sm:text-sm text-gray-500">No preview URL available.</p>;
            }

            if (isYouTube && youtubeEmbedUrl) {
              return (
                <div className="w-full aspect-video rounded-lg overflow-hidden bg-gray-100">
                  <iframe
                    className="w-full h-full border-0"
                    src={youtubeEmbedUrl}
                    title={previewContent?.title || "YouTube content"}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              );
            }

            if (isPdf) {
              return (
                <PdfPreviewPanel
                  fileUrl={previewContent?.fileUrl || fileUrl}
                  title={previewContent?.title}
                  className="h-full min-h-0 w-full flex-1"
                  variant="book"
                  contextLabel={
                    previewContent ? formatLibraryContentContextLabel(previewContent) : ""
                  }
                />
              );
            }

            if (isImage) {
              return (
                <div className="w-full max-w-full overflow-hidden rounded-lg bg-gray-100 p-2">
                  <img
                    src={fileUrl}
                    alt={previewContent?.title || "Preview"}
                    className="mx-auto h-auto w-full max-h-[min(66dvh,720px)] max-w-full object-contain"
                    draggable={false}
                  />
                </div>
              );
            }

            if (isAudio) {
              return (
                <div className="w-full rounded-lg bg-gray-100 p-4 sm:p-6 lg:p-8">
                  <audio src={fileUrl} controls className="w-full" />
                </div>
              );
            }

            if (isVideo) {
              return (
                <div className="w-full aspect-video rounded-lg overflow-hidden bg-gray-100">
                  <video src={fileUrl} controls className="w-full h-full" />
                </div>
              );
            }

            if (isGoogleDrive) {
              return (
                <DriveViewer
                  driveUrl={fileUrl}
                  title={previewContent?.title || "Drive content"}
                />
              );
            }

            return (
              <div className="text-xs sm:text-sm text-gray-600 bg-gray-50 rounded-lg p-4">
                Preview is not available for this file type.
              </div>
            );
          })()}
          </div>
        </DialogContent>
      </Dialog>
    </Shell>
  );
}
