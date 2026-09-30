import { useState, useEffect, useMemo, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import {
  Play,
  Search,
  Video as VideoIcon,
  BookOpen,
  Radio,
  Eye,
  Users,
  Calendar,
  ChevronRight,
  FileText,
  Loader2,
  ArrowLeft,
} from 'lucide-react';
import StudentShell from "@/components/layout/StudentShell";
import TeacherShell from "@/components/layout/TeacherShell";
import { API_BASE_URL } from '@/lib/api-config';
import { getUser, getAuthToken } from '@/lib/auth-utils';
import { EduOTTVideoCard, EduOTTSubjectBadges } from '@/components/eduott/EduOTTVideoCard';
import type { EduOTTVideoCardItem } from '@/components/eduott/EduOTTVideoCard';
import { EduOTTVideoPlayerDialog } from '@/components/eduott/EduOTTVideoPlayerDialog';
import { EduOTTLiveSessionDialog } from '@/components/eduott/EduOTTLiveSessionDialog';
import { EduOTTJoinSessionButton } from '@/components/eduott/EduOTTJoinSessionButton';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  extractPlainSubjectName,
  getSubjectClassLabel,
  formatSubjectWithIitCategory,
} from '@/lib/subject-names';
import { normalizeVideoLike, normalizeSessionLike } from '@/lib/eduott-normalize';
import { extractYouTubeId, resolveContentDurationSeconds } from '@/lib/eduott-video-utils';
import { getVideoDisplayTitle } from '@/lib/video-chapter-schedule';
import { useEduOTTFilters } from '@/contexts/edu-ott-filter-context';
import { EduOTTGlobalFilterBar } from '@/components/eduott/EduOTTGlobalFilterBar';
import { EduOTTTabsList, eduOttTabTriggerClass } from '@/components/eduott/EduOTTTabsList';
import { EduOTTStage } from '@/components/eduott/EduOTTStage';
import VidyaAIFloatingAssistant from '@/components/student/VidyaAIFloatingAssistant';
import { isIitTrackContent } from '@/lib/library-content-labels';
import PdfPreviewPanel from '@/components/shared/PdfPreviewPanel';
import { cn } from '@/lib/utils';

interface Video {
  _id: string;
  title: string;
  description?: string;
  duration: number;
  durationSeconds?: number;
  videoUrl?: string;
  youtubeUrl?: string;
  isYouTubeVideo?: boolean;
  thumbnailUrl?: string;
  views: number;
  createdAt: string;
  subjectId?: string;
  subjectName?: string;
  classNumber?: string;
  fileUrl?: string;
  id?: string;
  productCategory?: string;
  /** Normalized class number / label for filters & binding */
  class: string;
  /** Plain subject name for filters & binding */
  subject: string;
}

type SubjectGroup = {
  key: string;
  subject: string;
  classLabel: string;
  subjectIds: string[];
  productCategories: string[];
  videos: Video[];
};

type LibraryRow = {
  _id: string;
  title?: string;
  name?: string;
  type?: string;
  description?: string;
  fileUrl?: string;
  thumbnailUrl?: string;
  duration?: number;
  durationSeconds?: number;
  views?: number;
  createdAt?: string;
  classNumber?: string;
  productCategory?: string;
  board?: string;
  subject?: { _id?: string; name?: string; classNumber?: string; board?: string; productCategory?: string } | string;
};

const PREVIEW_VIDEO_COUNT = 3;

interface LiveSession {
  _id: string;
  title: string;
  description?: string;
  streamer: {
    _id: string;
    fullName: string;
    email: string;
  };
  status: 'scheduled' | 'live' | 'ended' | 'cancelled';
  streamUrl?: string;
  hlsUrl?: string;
  playbackUrl?: string;
  youtubeUrl?: string;
  youtubeEmbedUrl?: string;
  scheduledTime?: string;
  scheduledStartTime?: string;
  board?: string;
  classNumber?: string;
  viewerCount: number;
  createdAt: string;
  /** Normalized class label for filters & UI */
  class: string;
  /** Plain subject name (binding); replaces populated subject from API */
  subject: string;
}

function authHeaders(): HeadersInit {
  const token = getAuthToken();
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

function mapContentToVideo(content: any): Video {
  const subjectName = content.subject?.name || content.subject || 'Unknown Subject';
  const subjectId = content.subject?._id || content.subject;
  const classNum =
    content.classNumber != null && String(content.classNumber).trim() !== ''
      ? String(content.classNumber).trim()
      : content.subject?.classNumber != null &&
          String(content.subject.classNumber).trim() !== ''
        ? String(content.subject.classNumber).trim()
        : undefined;

  const durationInSeconds = resolveContentDurationSeconds({
    duration: content.duration,
    durationSeconds: content.durationSeconds,
  });

  let videoFileUrl = content.fileUrl;
  if (videoFileUrl && !videoFileUrl.startsWith('http') && !videoFileUrl.startsWith('//')) {
    if (videoFileUrl.startsWith('/')) {
      videoFileUrl = `${API_BASE_URL}${videoFileUrl}`;
    } else {
      videoFileUrl = `${API_BASE_URL}/${videoFileUrl}`;
    }
  }

  const norm = normalizeVideoLike({ subjectName, classNumber: classNum });

  return {
    _id: content._id,
    id: content._id,
    title: getVideoDisplayTitle({ ...content, type: 'Video' }),
    description: content.description || '',
    videoUrl: videoFileUrl,
    fileUrl: videoFileUrl,
    thumbnailUrl: content.thumbnailUrl,
    duration: durationInSeconds,
    durationSeconds: durationInSeconds,
    views: content.views || 0,
    createdAt: content.createdAt,
    subjectId,
    subjectName,
    classNumber: classNum,
    productCategory:
      content.productCategory ||
      content.subject?.productCategory ||
      '',
    class: norm.class,
    subject: norm.subject,
    isYouTubeVideo: !!(
      content.fileUrl &&
      (content.fileUrl.includes('youtube.com') || content.fileUrl.includes('youtu.be'))
    ),
    youtubeUrl:
      content.fileUrl &&
      (content.fileUrl.includes('youtube.com') || content.fileUrl.includes('youtu.be'))
        ? content.fileUrl
        : undefined,
  };
}

function mapStreamToSession(s: any): LiveSession {
  const norm = normalizeSessionLike({
    subject: s.subject,
    classNumber: s.classNumber,
  });
  return {
    ...s,
    class: norm.class,
    subject: norm.subject,
  };
}

function isTeacherPortalUser(): boolean {
  const user = getUser();
  const role = String(user?.role || localStorage.getItem('userRole') || '').toLowerCase();
  return role.includes('teacher');
}

function apiRoot(): '/api/teacher' | '/api/student' {
  return isTeacherPortalUser() ? '/api/teacher' : '/api/student';
}

function buildVideosUrl(
  selectedClass: string | null,
  selectedSubject: string | null
): string {
  const params = new URLSearchParams({ type: 'Video', surface: 'eduott' });
  if (selectedClass) params.set('class', selectedClass);
  if (selectedSubject) params.set('subject', selectedSubject);
  return `${API_BASE_URL}${apiRoot()}/asli-prep-content?${params.toString()}`;
}

function buildStreamsUrl(
  selectedClass: string | null,
  selectedSubject: string | null
): string {
  const params = new URLSearchParams();
  if (selectedClass) params.set('class', selectedClass);
  if (selectedSubject) params.set('subject', selectedSubject);
  const q = params.toString();
  return `${API_BASE_URL}${apiRoot()}/streams${q ? `?${q}` : ''}`;
}

export default function EduOTT() {
  const isMobile = useIsMobile();
  const isTeacher = isTeacherPortalUser();
  const Shell = isTeacher ? TeacherShell : StudentShell;
  const {
    selectedClass,
    selectedSubject,
    listEpoch,
  } = useEduOTTFilters();

  const [activeTab, setActiveTab] = useState('videos');
  const [videos, setVideos] = useState<Video[]>([]);
  const [liveSessions, setLiveSessions] = useState<LiveSession[]>([]);
  const [videoCatalog, setVideoCatalog] = useState<Video[]>([]);
  const [sessionCatalog, setSessionCatalog] = useState<LiveSession[]>([]);
  const [videosEmptyMessage, setVideosEmptyMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [isRefreshingVideos, setIsRefreshingVideos] = useState(false);
  const [isRefreshingSessions, setIsRefreshingSessions] = useState(false);
  const [hasLoadedVideos, setHasLoadedVideos] = useState(false);
  const [hasLoadedSessions, setHasLoadedSessions] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sessionSearchTerm, setSessionSearchTerm] = useState('');
  const [selectedVideo, setSelectedVideo] = useState<EduOTTVideoCardItem | null>(null);
  const [selectedLiveSession, setSelectedLiveSession] = useState<LiveSession | null>(null);
  const [previewMaterial, setPreviewMaterial] = useState<{
    title: string;
    type: string;
    fileUrl: string;
  } | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [subjectFocus, setSubjectFocus] = useState<SubjectGroup | null>(null);
  const [subjectLibrary, setSubjectLibrary] = useState<LibraryRow[]>([]);
  const [subjectLibraryLoading, setSubjectLibraryLoading] = useState(false);

  /** Unfiltered catalog for dropdowns + default lists (avoids a duplicate round-trip). */
  useEffect(() => {
    let cancelled = false;
    async function loadCatalog() {
      try {
        setLoading(true);
        setLoadingSessions(true);

        const [vRes, sRes] = await Promise.all([
          fetch(`${API_BASE_URL}${apiRoot()}/asli-prep-content?type=Video&surface=eduott`, {
            headers: authHeaders(),
          }),
          fetch(`${API_BASE_URL}${apiRoot()}/streams`, { headers: authHeaders() }),
        ]);

        if (cancelled) return;

        let mappedVideos: Video[] = [];
        if (vRes.ok) {
          const data = await vRes.json();
          const list = data.data || data || [];
          mappedVideos = list.map(mapContentToVideo);
          setVideoCatalog(mappedVideos);
          if (!list.length && data?.message) {
            setVideosEmptyMessage(String(data.message));
          }
        } else {
          setVideoCatalog([]);
        }

        let mappedSessions: LiveSession[] = [];
        if (sRes.ok) {
          const data = await sRes.json();
          const list = data.data || data || [];
          mappedSessions = list.map(mapStreamToSession);
          setSessionCatalog(mappedSessions);
        } else {
          setSessionCatalog([]);
        }

        // Seed visible lists from catalog when no class/subject filter is active.
        if (!selectedClass && !selectedSubject) {
          setVideos(mappedVideos);
          setLiveSessions(mappedSessions);
        }
        setHasLoadedVideos(true);
        setHasLoadedSessions(true);
      } catch {
        if (!cancelled) {
          setVideoCatalog([]);
          setSessionCatalog([]);
          setHasLoadedVideos(true);
          setHasLoadedSessions(true);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setLoadingSessions(false);
        }
      }
    }
    loadCatalog();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- catalog once; filtered loads are separate
  }, []);

  useEffect(() => {
    if (activeTab !== 'videos') {
      setLoading(false);
      return;
    }

    // No filters → reuse catalog (catalog effect owns the initial fetch).
    if (!selectedClass && !selectedSubject) {
      if (hasLoadedVideos) {
        setVideos(videoCatalog);
        setLoading(false);
      }
      return;
    }

    let cancelled = false;

    async function fetchVideos() {
      try {
        if (!hasLoadedVideos) {
          setLoading(true);
        } else {
          setIsRefreshingVideos(true);
        }

        const response = await fetch(
          buildVideosUrl(selectedClass, selectedSubject),
          { headers: authHeaders() }
        );

        if (cancelled) return;

        if (response.ok) {
          const data = await response.json();
          const videosList = data.data || data || [];
          setVideos(videosList.map(mapContentToVideo));
          setVideosEmptyMessage(
            videosList.length === 0 && data?.message ? String(data.message) : '',
          );
        } else {
          setVideos([]);
          setVideosEmptyMessage('');
        }
      } catch (error) {
        console.error('Failed to fetch videos:', error);
        if (!cancelled) setVideos([]);
      } finally {
        if (!cancelled) {
          setLoading(false);
          setIsRefreshingVideos(false);
          setHasLoadedVideos(true);
        }
      }
    }

    fetchVideos();
    return () => {
      cancelled = true;
    };
  }, [activeTab, selectedClass, selectedSubject, listEpoch, videoCatalog, hasLoadedVideos]);

  useEffect(() => {
    if (activeTab !== 'live-sessions') {
      setLoadingSessions(false);
      return;
    }

    if (!selectedClass && !selectedSubject) {
      if (hasLoadedSessions) {
        setLiveSessions(sessionCatalog);
        setLoadingSessions(false);
      }
      return;
    }

    let cancelled = false;

    async function fetchLiveSessions() {
      try {
        if (!hasLoadedSessions) {
          setLoadingSessions(true);
        } else {
          setIsRefreshingSessions(true);
        }

        const response = await fetch(
          buildStreamsUrl(selectedClass, selectedSubject),
          { headers: authHeaders() }
        );

        if (cancelled) return;

        if (response.ok) {
          const data = await response.json();
          const sessionsList = data.data || data || [];
          setLiveSessions(sessionsList.map(mapStreamToSession));
        } else {
          setLiveSessions([]);
        }
      } catch (error) {
        console.error('Failed to fetch live sessions:', error);
        if (!cancelled) setLiveSessions([]);
      } finally {
        if (!cancelled) {
          setLoadingSessions(false);
          setIsRefreshingSessions(false);
          setHasLoadedSessions(true);
        }
      }
    }

    fetchLiveSessions();
    return () => {
      cancelled = true;
    };
  }, [activeTab, selectedClass, selectedSubject, listEpoch, sessionCatalog, hasLoadedSessions]);

  const globalClassOptions = useMemo(() => {
    const set = new Set<string>();
    videoCatalog.forEach((v) => {
      if (v.class) set.add(v.class);
    });
    sessionCatalog.forEach((s) => {
      if (s.class) set.add(s.class);
    });
    return Array.from(set).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  }, [videoCatalog, sessionCatalog]);

  const globalSubjectOptions = useMemo(() => {
    const names = new Set<string>();
    videoCatalog.forEach((v) => {
      if (selectedClass && v.class !== selectedClass) return;
      if (v.subject) names.add(v.subject);
    });
    sessionCatalog.forEach((s) => {
      if (selectedClass && s.class !== selectedClass) return;
      if (s.subject) names.add(s.subject);
    });
    return Array.from(names).filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [videoCatalog, sessionCatalog, selectedClass]);

  const filteredVideos = useMemo(() => {
    return videos.filter((video) => {
      const matchesSearch =
        video.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (video.description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        video.subject.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesSubject = !selectedSubject ||
        video.subject === selectedSubject ||
        (video.subjectName || '').toLowerCase().includes(selectedSubject.toLowerCase()) ||
        video.subject.toLowerCase() === selectedSubject.toLowerCase();
      return matchesSearch && matchesSubject;
    });
  }, [videos, searchTerm, selectedSubject]);

  const subjectGroups = useMemo((): SubjectGroup[] => {
    const map = new Map<string, SubjectGroup>();
    for (const video of filteredVideos) {
      const subject = video.subject || extractPlainSubjectName(video.subjectName || '') || 'Subject';
      const classLabel = video.class || video.classNumber || '';
      const key = `${classLabel}::${subject}`.toLowerCase();
      let group = map.get(key);
      if (!group) {
        group = {
          key,
          subject,
          classLabel,
          subjectIds: [],
          productCategories: [],
          videos: [],
        };
        map.set(key, group);
      }
      group.videos.push(video);
      const sid = String(video.subjectId || '').trim();
      if (sid && !group.subjectIds.includes(sid)) group.subjectIds.push(sid);
      const cat = String(video.productCategory || '').trim().toUpperCase();
      if (cat && !group.productCategories.includes(cat)) group.productCategories.push(cat);
    }
    return Array.from(map.values()).sort((a, b) => {
      const classCmp =
        (parseInt(a.classLabel, 10) || 0) - (parseInt(b.classLabel, 10) || 0) ||
        a.classLabel.localeCompare(b.classLabel);
      if (classCmp) return classCmp;
      return a.subject.localeCompare(b.subject);
    });
  }, [filteredVideos]);

  const openSubjectMore = useCallback((group: SubjectGroup) => {
    setSubjectFocus(group);
  }, []);

  useEffect(() => {
    if (!subjectFocus) {
      setSubjectLibrary([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setSubjectLibraryLoading(true);
      try {
        const params = new URLSearchParams({ surface: 'eduott' });
        if (subjectFocus.classLabel) params.set('class', subjectFocus.classLabel);
        if (subjectFocus.subjectIds[0]) {
          params.set('subject', subjectFocus.subjectIds[0]);
        } else if (subjectFocus.subject) {
          params.set('subject', subjectFocus.subject);
        }
        const res = await fetch(
          `${API_BASE_URL}${apiRoot()}/asli-prep-content?${params.toString()}`,
          { headers: authHeaders() },
        );
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const list: LibraryRow[] = Array.isArray(data?.data)
          ? data.data
          : Array.isArray(data)
            ? data
            : [];
        const idSet = new Set(subjectFocus.subjectIds.map(String));
        const subjectKey = subjectFocus.subject.toLowerCase();
        const classKey = String(subjectFocus.classLabel || '').trim();

        const matched = list.filter((row) => {
          const sid = String(
            typeof row.subject === 'object' && row.subject?._id
              ? row.subject._id
              : row.subject || '',
          );
          if (idSet.size > 0 && idSet.has(sid)) return true;

          const rawName =
            typeof row.subject === 'object' ? row.subject?.name || '' : String(row.subject || '');
          const plain = extractPlainSubjectName(rawName).toLowerCase();
          if (plain !== subjectKey) return false;

          const rowClass =
            getSubjectClassLabel(
              typeof row.subject === 'object' ? row.subject : { classNumber: row.classNumber },
            ) || String(row.classNumber || '').trim();
          if (classKey && rowClass && classKey !== rowClass) return false;

          return isIitTrackContent(row) || idSet.has(sid);
        });

        // Prefer IIT-tagged rows when both board + IIT exist for the same subject.
        const iitOnly = matched.filter((row) => isIitTrackContent(row));
        setSubjectLibrary(iitOnly.length > 0 ? iitOnly : matched);
      } catch {
        if (!cancelled) setSubjectLibrary([]);
      } finally {
        if (!cancelled) setSubjectLibraryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [subjectFocus]);

  const subjectLibraryVideos = useMemo(
    () =>
      subjectLibrary
        .filter((row) => String(row.type || '').trim() === 'Video')
        .map((row) => mapContentToVideo(row)),
    [subjectLibrary],
  );

  const subjectLibraryMaterials = useMemo(
    () =>
      subjectLibrary.filter((row) => {
        const t = String(row.type || '').trim();
        return t && t !== 'Video';
      }),
    [subjectLibrary],
  );

  const filteredSessions = useMemo(() => {
    return liveSessions.filter((session) => {
      const matchesSearch =
        session.title.toLowerCase().includes(sessionSearchTerm.toLowerCase()) ||
        (session.description || '').toLowerCase().includes(sessionSearchTerm.toLowerCase());
      const matchesStatus = filterStatus === 'all' || session.status === filterStatus;
      return matchesSearch && matchesStatus;
    });
  }, [liveSessions, sessionSearchTerm, filterStatus]);

  const hasGlobalFilters = selectedClass != null || selectedSubject != null;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'live':
        return 'bg-red-100 text-red-700 ring-1 ring-red-200';
      case 'scheduled':
        return 'bg-teal-green-50 text-teal-green-800 ring-1 ring-teal-green-200';
      case 'ended':
        return 'bg-slate-100 text-slate-700 ring-1 ring-slate-200';
      case 'cancelled':
        return 'bg-amber-50 text-amber-800 ring-1 ring-amber-200';
      default:
        return 'bg-slate-100 text-slate-700 ring-1 ring-slate-200';
    }
  };

  return (
    <Shell>
      <div className="asli-app-bg relative min-h-screen w-full overflow-x-hidden px-4 pb-10 sm:px-6  lg:px-8">
        <div className="w-full">
        {!isMobile && !isTeacher && <VidyaAIFloatingAssistant />}

        <EduOTTStage
          subtitle="IIT Exclusive library — Alpha / Beta / Gamma track videos for schools with IIT EduOTT enabled. Board textbooks and board videos stay in Learning Paths."
          stats={[
            {
              value: globalSubjectOptions.length,
              label: globalSubjectOptions.length === 1 ? 'Subject' : 'Subjects',
              icon: <BookOpen className="h-[1.15rem] w-[1.15rem]" aria-hidden="true" />,
            },
            {
              value: videos.length,
              label: videos.length === 1 ? 'IIT video' : 'IIT videos',
              icon: <VideoIcon className="h-[1.15rem] w-[1.15rem]" aria-hidden="true" />,
            },
          ]}
        >
        <EduOTTGlobalFilterBar
          classOptions={globalClassOptions}
          subjectOptions={globalSubjectOptions}
        />

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-2 space-y-6">
          <EduOTTTabsList>
            <TabsTrigger value="videos" className={eduOttTabTriggerClass}>
              Videos
            </TabsTrigger>
            <TabsTrigger value="live-sessions" className={eduOttTabTriggerClass}>
              Live Sessions
            </TabsTrigger>
          </EduOTTTabsList>

          <TabsContent value="videos" className="space-y-6">
            <div className="relative max-w-xl">
              <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-teal-green-300" />
              <Input
                type="text"
                placeholder="Search IIT subjects or videos..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-12 border-ink/10 bg-white pl-11 text-base text-ink placeholder:text-muted-foreground"
              />
            </div>

            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-base text-muted-foreground">
                {subjectGroups.length} IIT subject{subjectGroups.length === 1 ? '' : 's'} ·{' '}
                {filteredVideos.length} video{filteredVideos.length === 1 ? '' : 's'}
              </p>
              {isRefreshingVideos ? (
                <p className="text-[0.9375rem] font-medium text-teal-green-700">Updating list...</p>
              ) : null}
            </div>

            <div className="min-h-[240px] sm:min-h-[420px]">
            {loading ? (
              <div className="space-y-8">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className="space-y-4">
                    <Skeleton className="h-8 w-56 bg-mist-deep" />
                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                      {Array.from({ length: 3 }).map((_, j) => (
                        <div key={j} className="overflow-hidden rounded-2xl border border-ink/10 bg-white">
                          <Skeleton className="aspect-video w-full bg-mist-deep" />
                          <div className="space-y-3 p-5">
                            <Skeleton className="mb-2 h-6 w-3/4 bg-mist-deep" />
                            <Skeleton className="h-4 w-1/2 bg-mist-deep" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : subjectGroups.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-ink/15 bg-mist py-16 text-center">
                <VideoIcon className="mx-auto mb-4 h-16 w-16 text-ink/25" />
                <h3 className="mb-2 font-display text-xl font-semibold text-ink">
                  {videos.length === 0 ? 'No Videos Available' : 'No Videos Found'}
                </h3>
                <p className="mx-auto max-w-md text-lg text-muted-foreground">
                  {videos.length === 0
                    ? videosEmptyMessage ||
                      'No IIT videos for your class and assigned tracks yet. Board videos stay in Learning Paths.'
                    : hasGlobalFilters || searchTerm
                      ? 'No content available for the selected filters. Try clearing filters or adjusting your search.'
                      : 'Try adjusting your search.'}
                </p>
              </div>
            ) : (
              <div className="space-y-10">
                {subjectGroups.map((group) => {
                  const preview = group.videos.slice(0, PREVIEW_VIDEO_COUNT);
                  const trackLabel = group.productCategories[0]
                    ? formatSubjectWithIitCategory(group.subject, group.productCategories[0])
                    : `${group.subject} IIT`;
                  return (
                    <section key={group.key} className="space-y-4">
                      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-ink/10 pb-3">
                        <div className="min-w-0">
                          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-teal-green-700">
                            IIT subject
                          </p>
                          <h3 className="font-display text-xl font-bold text-ink sm:text-2xl">
                            {trackLabel}
                          </h3>
                          <p className="mt-0.5 text-sm text-muted-foreground">
                            {group.classLabel ? `Class ${group.classLabel} · ` : ''}
                            {group.videos.length} video{group.videos.length === 1 ? '' : 's'}
                          </p>
                        </div>
                        <Button
                          type="button"
                          className="shrink-0 gap-1.5 rounded-xl bg-gradient-to-r from-teal-green-500 to-indigo-blue-600 text-white shadow-glow hover:opacity-95"
                          onClick={() => openSubjectMore(group)}
                        >
                          View full library
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {preview.map((video) => {
                          const videoId = video._id || video.id || '';
                          return (
                            <EduOTTVideoCard
                              key={videoId}
                              video={video}
                              onPlay={() => setSelectedVideo(video)}
                              subjectBadges={
                                video.subjectName ? (
                                  <EduOTTSubjectBadges
                                    subjectLabel={
                                      video.subject || extractPlainSubjectName(video.subjectName)
                                    }
                                    classLabel={
                                      video.class ||
                                      getSubjectClassLabel({
                                        name: video.subjectName,
                                        classNumber: video.classNumber,
                                      }) ||
                                      undefined
                                    }
                                  />
                                ) : undefined
                              }
                            />
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </div>
            )}
            </div>
          </TabsContent>

          <TabsContent value="live-sessions" className="space-y-6">
            <div className="flex flex-col gap-4 rounded-2xl border border-ink/10 bg-mist/80 p-4 md:flex-row md:flex-wrap md:items-end sm:p-5">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-teal-green-300" />
                <Input
                  type="text"
                  placeholder="Search live sessions..."
                  value={sessionSearchTerm}
                  onChange={(e) => setSessionSearchTerm(e.target.value)}
                  className="h-12 border-ink/10 bg-white pl-11 text-base text-ink placeholder:text-muted-foreground"
                />
              </div>
              <div className="w-full space-y-2 sm:w-auto">
                <Label className="text-base text-muted-foreground">Status</Label>
                <div className="flex flex-wrap gap-2">
                  {['all', 'scheduled', 'live', 'ended', 'cancelled'].map((status) => {
                    const isActive = filterStatus === status;
                    const label =
                      status === 'all'
                        ? 'All'
                        : status.charAt(0).toUpperCase() + status.slice(1);
                    return (
                      <button
                        key={status}
                        type="button"
                        onClick={() => setFilterStatus(status)}
                        className={`rounded-full border px-4 py-2 text-[0.9375rem] font-semibold transition-colors ${
                          isActive
                            ? 'border-teal-green-500 bg-gradient-to-r from-teal-green-500 to-indigo-blue-600 text-white shadow-glow'
                            : 'border-ink/15 bg-white text-ink/70 hover:border-teal-green-400/50 hover:bg-mist'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="min-h-[320px]">
            {loadingSessions ? (
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="overflow-hidden rounded-2xl border border-ink/10 bg-white">
                    <Skeleton className="h-32 w-full bg-mist-deep" />
                  </div>
                ))}
              </div>
            ) : filteredSessions.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-ink/15 bg-mist py-16 text-center">
                <Radio className="mx-auto mb-4 h-16 w-16 text-ink/25" />
                <h3 className="mb-2 font-display text-xl font-semibold text-ink">
                  {liveSessions.length === 0
                    ? 'No Live Sessions Available'
                    : 'No Live Sessions Found'}
                </h3>
                <p className="mx-auto max-w-md text-lg text-muted-foreground">
                  {liveSessions.length === 0
                    ? 'No live sessions have been scheduled for your subjects yet.'
                    : hasGlobalFilters || sessionSearchTerm || filterStatus !== 'all'
                      ? 'No content available for the selected filters. Try clearing filters or adjusting search/status.'
                      : 'Try adjusting your search or filter criteria.'}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredSessions.map((session) => (
                  <div
                    key={session._id}
                    className="rounded-2xl border border-ink/10 bg-white p-5 shadow-sm transition hover:border-teal-green-400/40 hover:shadow-elevated sm:p-6"
                  >
                      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                        <div className="min-w-0 flex-1">
                          <div className="mb-2 flex flex-wrap items-center gap-3">
                            <h3 className="font-display text-xl font-semibold text-ink">{session.title}</h3>
                            <Badge className={getStatusColor(session.status)}>
                              {session.status.toUpperCase()}
                            </Badge>
                          </div>
                          {session.description && (
                            <p className="mb-4 text-base text-muted-foreground">{session.description}</p>
                          )}
                          <div className="flex flex-wrap items-center gap-4 text-base text-muted-foreground">
                            <div className="flex items-center gap-1.5">
                              <Users className="h-5 w-5" />
                              <span>
                                {session.streamer?.fullName || session.streamer?.email || 'Unknown'}
                              </span>
                            </div>
                            {session.subject ? (
                              <div className="flex items-center gap-1.5">
                                <BookOpen className="h-5 w-5" />
                                <span>{session.subject}</span>
                              </div>
                            ) : null}
                            {session.class ? (
                              <span className="rounded-full border border-ink/10 bg-mist px-3 py-1 text-[0.9375rem] text-ink">
                                Class {session.class}
                              </span>
                            ) : null}
                            <div className="flex items-center gap-1.5">
                              <Eye className="h-5 w-5" />
                              <span>{session.viewerCount || 0} viewers</span>
                            </div>
                            {(session.scheduledTime || session.scheduledStartTime) && (
                              <div className="flex items-center gap-1.5">
                                <Calendar className="h-5 w-5" />
                                <span>
                                  {new Date(
                                    session.scheduledTime || session.scheduledStartTime || ''
                                  ).toLocaleString()}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                        <EduOTTJoinSessionButton
                          session={session}
                          onJoin={() => setSelectedLiveSession(session)}
                          className="h-12 shrink-0 bg-red-600 text-base text-white hover:bg-red-700"
                        />
                      </div>
                  </div>
                ))}
              </div>
            )}
            </div>
          </TabsContent>
        </Tabs>
        </EduOTTStage>
        </div>
      </div>

      <Sheet
        open={!!subjectFocus}
        onOpenChange={(open) => {
          if (!open) setSubjectFocus(null);
        }}
      >
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-xl lg:max-w-2xl"
        >
          <SheetHeader className="shrink-0 border-b border-slate-200 bg-gradient-to-br from-teal-50 via-white to-orange-50 px-5 py-4 text-left sm:px-6">
            <button
              type="button"
              className="mb-2 inline-flex w-fit items-center gap-1 text-xs font-semibold text-teal-800 hover:underline"
              onClick={() => setSubjectFocus(null)}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to subjects
            </button>
            <SheetTitle className="font-display text-xl text-ink sm:text-2xl">
              {subjectFocus
                ? subjectFocus.productCategories[0]
                  ? formatSubjectWithIitCategory(
                      subjectFocus.subject,
                      subjectFocus.productCategories[0],
                    )
                  : `${subjectFocus.subject} IIT`
                : 'Subject library'}
            </SheetTitle>
            <SheetDescription className="text-sm text-muted-foreground">
              {subjectFocus?.classLabel ? `Class ${subjectFocus.classLabel} · ` : ''}
              All assigned IIT videos and materials for this subject
            </SheetDescription>
          </SheetHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
            {subjectLibraryLoading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading IIT library…
              </div>
            ) : (
              <div className="space-y-8">
                <section className="space-y-3">
                  <div className="flex items-center gap-2">
                    <VideoIcon className="h-4 w-4 text-teal-700" />
                    <h4 className="text-sm font-bold uppercase tracking-wide text-slate-700">
                      Videos ({subjectLibraryVideos.length || subjectFocus?.videos.length || 0})
                    </h4>
                  </div>
                  {(subjectLibraryVideos.length > 0 ? subjectLibraryVideos : subjectFocus?.videos || [])
                    .length === 0 ? (
                    <p className="text-sm text-slate-500">No IIT videos for this subject yet.</p>
                  ) : (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      {(subjectLibraryVideos.length > 0
                        ? subjectLibraryVideos
                        : subjectFocus?.videos || []
                      ).map((video) => (
                        <EduOTTVideoCard
                          key={video._id || video.id}
                          video={video}
                          onPlay={() => setSelectedVideo(video)}
                          subjectBadges={
                            <EduOTTSubjectBadges
                              subjectLabel={video.subject}
                              classLabel={video.class || undefined}
                            />
                          }
                        />
                      ))}
                    </div>
                  )}
                </section>

                <section className="space-y-3">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-orange-600" />
                    <h4 className="text-sm font-bold uppercase tracking-wide text-slate-700">
                      Materials ({subjectLibraryMaterials.length})
                    </h4>
                  </div>
                  {subjectLibraryMaterials.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      No IIT materials (notes, textbooks, workbooks) assigned for this subject yet.
                    </p>
                  ) : (
                    <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                      {subjectLibraryMaterials.map((row) => {
                        const title = String(row.title || row.name || 'Material').trim();
                        const type = String(row.type || 'Material').trim();
                        const href = row.fileUrl
                          ? row.fileUrl.startsWith('http') || row.fileUrl.startsWith('//')
                            ? row.fileUrl
                            : `${API_BASE_URL}${row.fileUrl.startsWith('/') ? '' : '/'}${row.fileUrl}`
                          : '';
                        return (
                          <li key={row._id} className="flex items-start justify-between gap-3 px-4 py-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-900">{title}</p>
                              <p className="text-xs text-slate-500">{type}</p>
                            </div>
                            {href ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setPreviewMaterial({
                                    title,
                                    type,
                                    fileUrl: href,
                                  })
                                }
                                className={cn(
                                  'shrink-0 rounded-lg border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-800 hover:bg-orange-100',
                                )}
                              >
                                Open
                              </button>
                            ) : (
                              <span className="shrink-0 text-xs text-slate-400">No file</span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <EduOTTVideoPlayerDialog
        video={selectedVideo}
        open={!!selectedVideo}
        onOpenChange={(open) => {
          if (!open) setSelectedVideo(null);
        }}
      />
      <EduOTTLiveSessionDialog
        session={selectedLiveSession}
        open={!!selectedLiveSession}
        onOpenChange={(open) => {
          if (!open) setSelectedLiveSession(null);
        }}
      />

      <Dialog
        open={Boolean(previewMaterial)}
        onOpenChange={(open) => {
          if (!open) setPreviewMaterial(null);
        }}
      >
        <DialogContent
          className={cn(
            'flex max-h-[94vh] w-[min(96vw,960px)] max-w-[960px] flex-col overflow-hidden',
            (() => {
              const u = String(previewMaterial?.fileUrl || '').toLowerCase();
              const t = String(previewMaterial?.type || '').toLowerCase();
              const isPdf =
                u.includes('.pdf') ||
                t === 'pdf' ||
                t.includes('textbook') ||
                t.includes('workbook') ||
                t.includes('notes') ||
                t.includes('material');
              return isPdf
                ? 'h-[min(96dvh,1200px)] w-[min(98vw,1280px)] max-w-[1280px] border-0 bg-[#d6d3d1] p-0 shadow-2xl sm:rounded-xl'
                : 'p-4 sm:p-6';
            })(),
          )}
        >
          {previewMaterial ? (
            (() => {
              const url = previewMaterial.fileUrl;
              const lower = url.toLowerCase();
              const type = previewMaterial.type.toLowerCase();
              const ytId = extractYouTubeId(url);
              const isImage = /\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?|$)/i.test(lower);
              const isVideoFile = /\.(mp4|webm|ogg|mov|m3u8)(\?|$)/i.test(lower) || type === 'video';
              const isPdf =
                lower.includes('.pdf') ||
                type === 'pdf' ||
                type.includes('textbook') ||
                type.includes('workbook') ||
                type.includes('notes') ||
                (type.includes('material') && !isImage && !isVideoFile && !ytId);

              if (ytId) {
                return (
                  <>
                    <DialogHeader className="shrink-0">
                      <DialogTitle className="pr-8 text-base sm:text-lg">{previewMaterial.title}</DialogTitle>
                      <DialogDescription className="text-xs sm:text-sm">
                        Playing in AsliLearn — stays on this page
                      </DialogDescription>
                    </DialogHeader>
                    <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
                      <iframe
                        title={previewMaterial.title}
                        src={`https://www.youtube.com/embed/${ytId}?rel=0&modestbranding=1`}
                        className="absolute inset-0 h-full w-full border-0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                      />
                    </div>
                  </>
                );
              }

              if (isPdf) {
                return (
                  <>
                    <DialogHeader className="shrink-0 border-b border-stone-300/60 bg-stone-100/95 px-4 py-3 sm:px-6">
                      <DialogTitle className="pr-8 text-base sm:text-lg">{previewMaterial.title}</DialogTitle>
                      <DialogDescription className="text-xs sm:text-sm">
                        Zoom expands on screen · drag to pan · ↑↓ pages
                      </DialogDescription>
                    </DialogHeader>
                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#d6d3d1]">
                      <PdfPreviewPanel
                        fileUrl={url}
                        title={previewMaterial.title}
                        className="h-full min-h-0 w-full flex-1"
                        variant="book"
                      />
                    </div>
                  </>
                );
              }

              if (isImage) {
                return (
                  <>
                    <DialogHeader className="shrink-0">
                      <DialogTitle className="pr-8 text-base sm:text-lg">{previewMaterial.title}</DialogTitle>
                      <DialogDescription className="sr-only">Image preview</DialogDescription>
                    </DialogHeader>
                    <div className="overflow-hidden rounded-lg bg-slate-100 p-2">
                      <img
                        src={url}
                        alt={previewMaterial.title}
                        className="mx-auto max-h-[70vh] w-full object-contain"
                        draggable={false}
                      />
                    </div>
                  </>
                );
              }

              if (isVideoFile) {
                return (
                  <>
                    <DialogHeader className="shrink-0">
                      <DialogTitle className="pr-8 text-base sm:text-lg">{previewMaterial.title}</DialogTitle>
                      <DialogDescription className="text-xs sm:text-sm">
                        Playing in AsliLearn — stays on this page
                      </DialogDescription>
                    </DialogHeader>
                    <video
                      key={url}
                      src={url}
                      controls
                      autoPlay
                      playsInline
                      className="mx-auto w-full rounded-lg bg-black"
                      style={{ aspectRatio: '16 / 9', maxHeight: '70vh' }}
                    >
                      <track kind="captions" />
                    </video>
                  </>
                );
              }

              return (
                <>
                  <DialogHeader className="shrink-0">
                    <DialogTitle className="pr-8 text-base sm:text-lg">{previewMaterial.title}</DialogTitle>
                    <DialogDescription className="text-xs sm:text-sm">
                      Preview in AsliLearn
                    </DialogDescription>
                  </DialogHeader>
                  <iframe
                    title={previewMaterial.title}
                    src={url}
                    className="h-[min(70vh,720px)] w-full rounded-lg border-0 bg-white"
                  />
                </>
              );
            })()
          ) : null}
        </DialogContent>
      </Dialog>
    </Shell>  );
}
