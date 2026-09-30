import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsTrigger } from '@/components/ui/tabs';
import { getAuthToken } from '@/lib/auth-utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Play, 
  Search,
  Filter,
  Video as VideoIcon,
  BookOpen,
  Radio,
  Eye,
  Users,
  Calendar
} from 'lucide-react';
import { API_BASE_URL } from '@/lib/api-config';
import { getVideoDisplayTitle } from '@/lib/video-chapter-schedule';
import { EduOTTVideoCard, EduOTTSubjectBadges } from '@/components/eduott/EduOTTVideoCard';
import { EduOTTVideoPlayerDialog } from '@/components/eduott/EduOTTVideoPlayerDialog';
import { EduOTTLiveSessionDialog } from '@/components/eduott/EduOTTLiveSessionDialog';
import { EduOTTJoinSessionButton } from '@/components/eduott/EduOTTJoinSessionButton';
import { EduOTTTabsList } from '@/components/eduott/EduOTTTabsList';
import type { EduOTTVideoCardItem } from '@/components/eduott/EduOTTVideoCard';
import { resolveContentDurationSeconds } from '@/lib/eduott-video-utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import {
  formatSubjectWithIitCategory,
  getSubjectClassLabel,
} from '@/lib/subject-names';

interface Video {
  _id: string;
  title: string;
  description?: string;
  duration: number;
  videoUrl?: string;
  youtubeUrl?: string;
  isYouTubeVideo?: boolean;
  thumbnailUrl?: string;
  views: number;
  createdAt: string;
  subjectId?: string;
  subjectName?: string;
  productCategory?: string;
  classNumber?: string;
}

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
  subject?: {
    _id: string;
    name: string;
    productCategory?: string;
  };
  board?: string;
  classNumber?: string;
  viewerCount: number;
  createdAt: string;
}

export default function AdminEduOTT() {
  const [activeTab, setActiveTab] = useState('videos');
  const [videos, setVideos] = useState<Video[]>([]);
  const [liveSessions, setLiveSessions] = useState<LiveSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sessionSearchTerm, setSessionSearchTerm] = useState('');
  const [videoClassFilter, setVideoClassFilter] = useState<string>('all');
  const [videoSubjectFilter, setVideoSubjectFilter] = useState<string>('all');
  const [sessionClassFilter, setSessionClassFilter] = useState<string>('all');
  const [sessionSubjectFilter, setSessionSubjectFilter] = useState<string>('all');
  const [selectedVideo, setSelectedVideo] = useState<EduOTTVideoCardItem | null>(null);
  const [selectedLiveSession, setSelectedLiveSession] = useState<LiveSession | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [videosEmptyMessage, setVideosEmptyMessage] = useState('');

  useEffect(() => {
    setVideoSubjectFilter('all');
  }, [videoClassFilter]);

  useEffect(() => {
    setSessionSubjectFilter('all');
  }, [sessionClassFilter]);

  // Fetch videos
  useEffect(() => {
    const fetchVideos = async () => {
      try {
        setLoading(true);
        const token = getAuthToken();

        const response = await fetch(
          `${API_BASE_URL}/api/admin/asli-prep-content?type=Video&surface=eduott`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          const videosList = data.data || data || [];
          const metaReason = data?.meta?.reason ? String(data.meta.reason) : '';
          const fallbackNote =
            data?.meta?.iitBrowseFallback === true
              ? ' Showing full IIT catalog preview — assign Alpha/Beta/Gamma on the school profile for student access.'
              : '';
          setVideosEmptyMessage(
            !videosList.length
              ? String(data?.message || '') + (metaReason ? '' : '')
              : fallbackNote.trim()
                ? fallbackNote.trim()
                : '',
          );
          if (!videosList.length && data?.message) {
            setVideosEmptyMessage(String(data.message));
          } else if (videosList.length && data?.meta?.iitBrowseFallback) {
            setVideosEmptyMessage(
              'IIT EduOTT preview: tracks are not assigned on this school yet. Students will see videos after Super Admin assigns Alpha/Beta/Gamma.',
            );
          } else {
            setVideosEmptyMessage('');
          }
          const videosWithSubjects = videosList.map((content: any) => {
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
            const durationInMinutes =
              durationInSeconds > 0 ? Math.max(1, Math.round(durationInSeconds / 60)) : 0;
            
            let videoFileUrl = content.fileUrl;
            if (videoFileUrl && !videoFileUrl.startsWith('http') && !videoFileUrl.startsWith('//')) {
              if (videoFileUrl.startsWith('/')) {
                videoFileUrl = `${API_BASE_URL}${videoFileUrl}`;
              } else {
                videoFileUrl = `${API_BASE_URL}/${videoFileUrl}`;
              }
            }
            
            const rawFileUrl = content.fileUrl || '';
            const isYouTube =
              !!(
                content.youtubeUrl ||
                rawFileUrl.includes('youtube.com') ||
                rawFileUrl.includes('youtu.be')
              );
            const youtubeUrl = content.youtubeUrl || (isYouTube ? videoFileUrl || rawFileUrl : '');

            return {
              _id: content._id,
              title: getVideoDisplayTitle({ ...content, type: 'Video' }),
              description: content.description || '',
              duration: durationInMinutes,
              durationSeconds: durationInSeconds,
              videoUrl: videoFileUrl,
              fileUrl: videoFileUrl,
              youtubeUrl,
              isYouTubeVideo: isYouTube,
              thumbnailUrl: content.thumbnailUrl || '',
              views: content.views || 0,
              createdAt: content.createdAt || content.date || new Date().toISOString(),
              subjectId: subjectId,
              subjectName: subjectName,
              productCategory:
                content.productCategory ||
                content.subject?.productCategory ||
                '',
              classNumber: classNum
            };
          });

          setVideos(videosWithSubjects);
        }
      } catch (error) {
        console.error('Failed to fetch videos:', error);
        setVideos([]);
      } finally {
        setLoading(false);
      }
    };

    if (activeTab === 'videos') {
      fetchVideos();
    }
  }, [activeTab]);

  // Fetch live sessions
  useEffect(() => {
    const fetchLiveSessions = async () => {
      try {
        setLoadingSessions(true);
        const token = getAuthToken();

        const response = await fetch(`${API_BASE_URL}/api/admin/streams`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          }
        });

        if (response.ok) {
          const data = await response.json();
          const sessionsList = data.data || data || [];
          setLiveSessions(sessionsList);
        }
      } catch (error) {
        console.error('Failed to fetch live sessions:', error);
        setLiveSessions([]);
      } finally {
        setLoadingSessions(false);
      }
    };

    if (activeTab === 'live-sessions') {
      fetchLiveSessions();
    }
  }, [activeTab]);

  const videoClassOptions = useMemo(() => {
    const set = new Set<string>();
    videos.forEach((v) => {
      const l = getSubjectClassLabel({
        name: v.subjectName,
        classNumber: v.classNumber,
      });
      if (l) set.add(l);
    });
    return Array.from(set).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  }, [videos]);

  const videoSubjectOptions = useMemo(() => {
    const names = new Set<string>();
    videos.forEach((v) => {
      const l = getSubjectClassLabel({
        name: v.subjectName,
        classNumber: v.classNumber,
      });
      if (videoClassFilter !== 'all' && l !== videoClassFilter) return;
      const label = formatSubjectWithIitCategory(v.subjectName || '', v.productCategory).trim();
      if (label) names.add(label);
    });
    return Array.from(names).filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [videos, videoClassFilter]);

  const filteredVideos = useMemo(() => {
    return videos.filter((video) => {
      const matchesSearch =
        video.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (video.description || '').toLowerCase().includes(searchTerm.toLowerCase());
      const classL = getSubjectClassLabel({
        name: video.subjectName,
        classNumber: video.classNumber,
      });
      const matchesClass =
        videoClassFilter === 'all' || classL === videoClassFilter;
      const subjectLabel = formatSubjectWithIitCategory(
        video.subjectName || '',
        video.productCategory,
      );
      const matchesSubject =
        videoSubjectFilter === 'all' ||
        subjectLabel.toLowerCase() === videoSubjectFilter.toLowerCase();
      return matchesSearch && matchesClass && matchesSubject;
    });
  }, [videos, searchTerm, videoClassFilter, videoSubjectFilter]);

  const sessionClassOptions = useMemo(() => {
    const set = new Set<string>();
    liveSessions.forEach((session) => {
      const l = getSubjectClassLabel({
        name: session.subject?.name,
        classNumber: session.classNumber,
      });
      if (l) set.add(l);
    });
    return Array.from(set).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  }, [liveSessions]);

  const sessionSubjectOptions = useMemo(() => {
    const names = new Set<string>();
    liveSessions.forEach((session) => {
      const l = getSubjectClassLabel({
        name: session.subject?.name,
        classNumber: session.classNumber,
      });
      if (sessionClassFilter !== 'all' && l !== sessionClassFilter) return;
      const label = formatSubjectWithIitCategory(
        session.subject?.name || '',
        session.subject?.productCategory,
      ).trim();
      if (label) names.add(label);
    });
    return Array.from(names).filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [liveSessions, sessionClassFilter]);

  const filteredSessions = useMemo(() => {
    return liveSessions.filter((session) => {
      const matchesSearch =
        session.title.toLowerCase().includes(sessionSearchTerm.toLowerCase()) ||
        (session.description || '').toLowerCase().includes(sessionSearchTerm.toLowerCase());
      const matchesStatus = filterStatus === 'all' || session.status === filterStatus;
      const classL = getSubjectClassLabel({
        name: session.subject?.name,
        classNumber: session.classNumber,
      });
      const matchesClass =
        sessionClassFilter === 'all' || classL === sessionClassFilter;
      const subjectLabel = formatSubjectWithIitCategory(
        session.subject?.name || '',
        session.subject?.productCategory,
      );
      const matchesSubject =
        sessionSubjectFilter === 'all' ||
        subjectLabel.toLowerCase() === sessionSubjectFilter.toLowerCase();
      return matchesSearch && matchesStatus && matchesClass && matchesSubject;
    });
  }, [
    liveSessions,
    sessionSearchTerm,
    filterStatus,
    sessionClassFilter,
    sessionSubjectFilter,
  ]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'live':
        return 'bg-red-100 text-red-700';
      case 'scheduled':
        return 'bg-blue-100 text-blue-700';
      case 'ended':
        return 'bg-gray-100 text-gray-700';
      case 'cancelled':
        return 'bg-orange-100 text-orange-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className="space-y-3 sm:space-y-4 lg:space-y-6">
      {/* Header — IIT Exclusive branding */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-teal-950 p-4 sm:p-6 shadow-xl text-white">
        <div className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-amber-400/15 blur-3xl" />
        <div className="relative z-[1] flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-400/15 ring-1 ring-amber-400/30">
              <VideoIcon className="h-6 w-6 text-amber-200" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl sm:text-2xl font-bold text-white">EduOTT</h2>
                <span className="inline-flex items-center rounded-full border border-amber-400/40 bg-amber-400/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-200">
                  IIT Exclusive
                </span>
              </div>
              <p className="mt-0.5 text-sm text-slate-300">
                IIT track videos only — not board curriculum content. Live sessions for your school.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-3 sm:p-4 lg:p-6 shadow-xl border border-white/20">
        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <EduOTTTabsList>
            <TabsTrigger value="videos" className="w-full py-2 text-xs sm:text-sm">
              IIT Videos
            </TabsTrigger>
            <TabsTrigger value="live-sessions" className="w-full py-2 text-xs sm:text-sm">
              Live Sessions
            </TabsTrigger>
          </EduOTTTabsList>

          {/* Videos Tab */}
          <TabsContent value="videos" className="space-y-3 sm:space-y-4 lg:space-y-6 mt-6">
            {/* Search and Filter */}
            <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end">
              <div className="flex-1 min-w-[200px] relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-3 h-3 sm:w-4 sm:h-4 text-gray-400" />
                <Input
                  placeholder="Search videos..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="px-0 pl-10 sm:pl-11"
                />
              </div>
              <div className="space-y-1.5 w-full sm:w-auto">
                <Label className="text-xs text-gray-500">Class</Label>
                <Select value={videoClassFilter} onValueChange={setVideoClassFilter}>
                  <SelectTrigger className="w-full md:w-[180px] bg-white">
                    <SelectValue placeholder="All classes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All classes</SelectItem>
                    {videoClassOptions.map((c) => (
                      <SelectItem key={c} value={c}>
                        Class {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 w-full sm:w-auto">
                <Label className="text-xs text-gray-500">Subject</Label>
                <Select value={videoSubjectFilter} onValueChange={setVideoSubjectFilter}>
                  <SelectTrigger className="w-full md:w-[200px] bg-white">
                    <Filter className="w-3 h-3 sm:w-4 sm:h-4 mr-2 shrink-0" />
                    <SelectValue placeholder="All subjects" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All subjects</SelectItem>
                    {videoSubjectOptions.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Videos Grid */}
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:p-4 lg:p-6">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-64 w-full" />
                ))}
              </div>
            ) : filteredVideos.length === 0 ? (
              <Card>
                <CardContent className="py-16 text-center">
                  <VideoIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-base sm:text-lg font-semibold text-gray-600 mb-2">No IIT videos yet</h3>
                  <p className="text-gray-500 max-w-xl mx-auto">
                    {videosEmptyMessage ||
                      'EduOTT shows IIT Exclusive track videos only. Enable Asli Prep + IIT EduOTT (Alpha/Beta/Gamma) on the school, then open EduOTT — IIT videos are not listed inside Learning Paths.'}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:p-4 lg:p-6">
                {filteredVideos.map((video) => (
                  <EduOTTVideoCard
                    key={video._id}
                    video={video}
                    onPlay={() => setSelectedVideo(video)}
                    playAccentClass="text-sky-600"
                    subjectBadges={
                      video.subjectName ? (
                        <EduOTTSubjectBadges
                          subjectLabel={formatSubjectWithIitCategory(
                            video.subjectName || '',
                            video.productCategory,
                          )}
                          classLabel={
                            getSubjectClassLabel({
                              name: video.subjectName,
                              classNumber: video.classNumber,
                            }) || undefined
                          }
                        />
                      ) : undefined
                    }
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* Live Sessions Tab */}
          <TabsContent value="live-sessions" className="space-y-3 sm:space-y-4 lg:space-y-6 mt-6">
            {/* Search and Filter */}
            <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end">
              <div className="flex-1 min-w-[200px] relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-3 h-3 sm:w-4 sm:h-4 text-gray-400" />
                <Input
                  placeholder="Search live sessions..."
                  value={sessionSearchTerm}
                  onChange={(e) => setSessionSearchTerm(e.target.value)}
                  className="px-0 pl-10 sm:pl-11"
                />
              </div>
              <div className="space-y-1.5 w-full sm:w-auto">
                <Label className="text-xs text-gray-500">Class</Label>
                <Select value={sessionClassFilter} onValueChange={setSessionClassFilter}>
                  <SelectTrigger className="w-full md:w-[180px] bg-white">
                    <SelectValue placeholder="All classes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All classes</SelectItem>
                    {sessionClassOptions.map((c) => (
                      <SelectItem key={c} value={c}>
                        Class {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 w-full sm:w-auto">
                <Label className="text-xs text-gray-500">Subject</Label>
                <Select value={sessionSubjectFilter} onValueChange={setSessionSubjectFilter}>
                  <SelectTrigger className="w-full md:w-[200px] bg-white">
                    <SelectValue placeholder="All subjects" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All subjects</SelectItem>
                    {sessionSubjectOptions.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 w-full sm:w-auto">
                <Label className="text-xs text-gray-500">Status</Label>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-full md:w-[160px] bg-white">
                    <Filter className="w-3 h-3 sm:w-4 sm:h-4 mr-2 shrink-0" />
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                    <SelectItem value="live">Live</SelectItem>
                    <SelectItem value="ended">Ended</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Live Sessions List */}
            {loadingSessions ? (
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-32 w-full" />
                ))}
              </div>
            ) : filteredSessions.length === 0 ? (
              <Card>
                <CardContent className="py-16 text-center">
                  <Radio className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-base sm:text-lg font-semibold text-gray-600 mb-2">No Live Sessions Found</h3>
                  <p className="text-gray-500">No live sessions match your search criteria.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {filteredSessions.map((session) => (
                  <Card key={session._id} className="hover:shadow-lg transition-shadow">
                    <CardContent className="p-3 sm:p-4 lg:p-6">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-base sm:text-lg font-semibold text-gray-900">{session.title}</h3>
                            <Badge className={getStatusColor(session.status)}>
                              {session.status.toUpperCase()}
                            </Badge>
                          </div>
                          {session.description && (
                            <p className="text-gray-600 mb-4">{session.description}</p>
                          )}
                          <div className="flex flex-wrap items-center gap-4 text-xs sm:text-sm text-gray-600">
                            <div className="flex items-center gap-1">
                              <Users className="w-3 h-3 sm:w-4 sm:h-4" />
                              <span>{session.streamer?.fullName || session.streamer?.email || 'Unknown'}</span>
                            </div>
                            {session.subject?.name && (
                              <div className="flex items-center gap-1">
                                <BookOpen className="w-3 h-3 sm:w-4 sm:h-4" />
                                <span>
                                  {formatSubjectWithIitCategory(
                                    session.subject.name,
                                    session.subject.productCategory,
                                  )}
                                </span>
                              </div>
                            )}
                            {getSubjectClassLabel({
                              name: session.subject?.name,
                              classNumber: session.classNumber,
                            }) ? (
                              <Badge variant="outline">
                                Class{' '}
                                {getSubjectClassLabel({
                                  name: session.subject?.name,
                                  classNumber: session.classNumber,
                                })}
                              </Badge>
                            ) : null}
                            <div className="flex items-center gap-1">
                              <Eye className="w-3 h-3 sm:w-4 sm:h-4" />
                              <span>{session.viewerCount || 0} viewers</span>
                            </div>
                            {(session.scheduledTime || session.scheduledStartTime) && (
                              <div className="flex items-center gap-1">
                                <Calendar className="w-3 h-3 sm:w-4 sm:h-4" />
                                <span>
                                  {new Date(session.scheduledTime || session.scheduledStartTime || '').toLocaleString()}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                        <EduOTTJoinSessionButton
                          session={session}
                          onJoin={() => setSelectedLiveSession(session)}
                        />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

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
    </div>
  );
}
