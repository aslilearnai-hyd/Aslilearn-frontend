import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Play, FileText, File, Image, Video, Search, Filter, BookOpen, ExternalLink } from 'lucide-react';
import { API_BASE_URL } from '@/lib/api-config';
import PdfPreviewPanel from '@/components/shared/PdfPreviewPanel';
import { getAuthToken } from '@/lib/auth-utils';
import {
  filterContentsBySchoolProgram,
  getAllowedContentTypes,
  resolveIsAsliPrepExclusive,
} from '@/lib/school-program';
import { getVideoDisplayTitle } from '@/lib/video-chapter-schedule';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface Content {
  _id: string;
  title: string;
  description?: string;
  type: 'TextBook' | 'Workbook' | 'Material' | 'Video' | 'Audio';
  chapter?: string;
  module?: string;
  topic?: string;
  subject: {
    _id: string;
    name: string;
  };
  topic?: string;
  fileUrl: string;
  thumbnailUrl?: string;
  duration?: number;
  size?: number;
  views?: number;
  downloadCount?: number;
  createdAt: string;
}

export default function AsliPrepContent() {
  const [contents, setContents] = useState<Content[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filters, setFilters] = useState({
    subject: 'all',
    type: 'all',
    topic: ''
  });
  const [subjects, setSubjects] = useState<any[]>([]);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewContent, setPreviewContent] = useState<Content | null>(null);
  const [isAsliPrepExclusive, setIsAsliPrepExclusive] = useState(false);
  const allowedTypes = getAllowedContentTypes(isAsliPrepExclusive);

  useEffect(() => {
    void fetchSubjects();
  }, []);

  const fetchSubjects = async () => {
    try {
      const token = getAuthToken();
      const userResponse = await fetch(`${API_BASE_URL}/api/auth/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (userResponse.ok) {
        const userData = await userResponse.json();
        setIsAsliPrepExclusive(resolveIsAsliPrepExclusive(userData.user));
      }

      const subjectsResponse = await fetch(`${API_BASE_URL}/api/student/subjects`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (subjectsResponse.ok) {
        const data = await subjectsResponse.json();
        if (data.success) {
          setSubjects(data.data || data.subjects || []);
        }
      }
    } catch (error) {
      console.error('Failed to fetch subjects:', error);
    }
  };

  const fetchContents = async () => {
    setIsLoading(true);
    try {
      const token = getAuthToken();
      const queryParams = new URLSearchParams();
      if (filters.subject && filters.subject !== 'all') queryParams.append('subject', filters.subject);
      if (filters.type && filters.type !== 'all') queryParams.append('type', filters.type);
      if (filters.topic && filters.topic.trim()) queryParams.append('topic', filters.topic.trim());

      const response = await fetch(`${API_BASE_URL}/api/student/asli-prep-content?${queryParams}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          const rows = Array.isArray(data.data) ? data.data : [];
          setContents(filterContentsBySchoolProgram(rows, isAsliPrepExclusive));
        }
      }
    } catch (error) {
      console.error('Failed to fetch content:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchContents();
  }, [filters.subject, filters.type, filters.topic, isAsliPrepExclusive]);

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'Video': return <Video className="h-4 w-4 sm:h-5 sm:w-5" />;
      case 'TextBook': return <BookOpen className="h-4 w-4 sm:h-5 sm:w-5" />;
      case 'Workbook': return <FileText className="h-4 w-4 sm:h-5 sm:w-5" />;
      case 'Material': return <File className="h-4 w-4 sm:h-5 sm:w-5" />;
      case 'Audio': return <File className="h-4 w-4 sm:h-5 sm:w-5" />;
      default: return <File className="h-4 w-4 sm:h-5 sm:w-5" />;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'Video': return 'bg-red-100 text-red-700';
      case 'TextBook': return 'bg-blue-100 text-blue-700';
      case 'Workbook': return 'bg-purple-100 text-purple-700';
      case 'Material': return 'bg-green-100 text-green-700';
      case 'Audio': return 'bg-yellow-100 text-yellow-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'N/A';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatDuration = (minutes?: number) => {
    if (!minutes) return 'N/A';
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hrs > 0) return `${hrs}h ${mins}m`;
    return `${mins}m`;
  };

  const getNormalizedContentUrl = (url?: string) => {
    if (!url) return '';
    if (url.startsWith('http') || url.startsWith('//')) return url;
    return url.startsWith('/') ? `${API_BASE_URL}${url}` : `${API_BASE_URL}/${url}`;
  };

  const extractDirectFileUrl = (rawUrl: string) => {
    try {
      const parsed = new URL(rawUrl);
      if (parsed.hostname.includes('docs.google.com') && parsed.pathname.includes('/gview')) {
        const target = parsed.searchParams.get('url');
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
    return match && match[2].length === 11 ? `https://www.youtube.com/embed/${match[2]}` : null;
  };

  if (isLoading) {
    return (
      <div className="p-12 text-center">
        <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-gray-600">Loading AsliLearn content...</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-4 lg:space-y-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center space-x-3 mb-2">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-pink-600 rounded-lg flex items-center justify-center shadow-lg">
              <BookOpen className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-white" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
              Asli Prep
            </h2>
          </div>
          <p className="text-gray-600 mt-1 ml-[52px]">Premium study materials curated for your school</p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Filter className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
            Filter Content
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Subject</Label>
              <Select
                value={filters.subject || 'all'}
                onValueChange={(value) => setFilters({ ...filters, subject: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Subjects" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Subjects</SelectItem>
                  {subjects.map((subject) => (
                    <SelectItem key={subject._id} value={subject._id}>
                      {subject.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Type</Label>
              <Select
                value={filters.type || 'all'}
                onValueChange={(value) => setFilters({ ...filters, type: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="TextBook">TextBook</SelectItem>
                  <SelectItem value="Workbook">Workbook</SelectItem>
                  <SelectItem value="Material">Material</SelectItem>
                  <SelectItem value="Video">Video</SelectItem>
                  <SelectItem value="Audio">Audio</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Topic</Label>
              <Input
                placeholder="Search by topic..."
                value={filters.topic}
                onChange={(e) => setFilters({ ...filters, topic: e.target.value })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Content Grid */}
      {contents.length === 0 ? (
        <Card className="border-2 border-dashed border-purple-200 bg-gradient-to-br from-purple-50 to-pink-50">
          <CardContent className="p-16 text-center">
            <div className="w-20 h-20 bg-gradient-to-br from-purple-100 to-pink-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <BookOpen className="h-10 w-10 text-purple-600" />
            </div>
            <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-2">No Content Available Yet</h3>
            <p className="text-gray-600 max-w-md mx-auto">
              Exclusive premium content will appear here once uploaded by Super Admin for your board.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:p-4 lg:p-6">
          {contents.map((content, index) => (
            <Card 
              key={content._id} 
              className="group hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 border-2 border-transparent hover:border-purple-200 bg-gradient-to-br from-white to-purple-50/30"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between mb-2">
                  <CardTitle className="text-base sm:text-lg flex-1 font-bold leading-snug text-gray-900 group-hover:text-purple-700 transition-colors">
                    {content.type === 'Video' ? getVideoDisplayTitle(content) : content.title}
                  </CardTitle>
                  <Badge className={`${getTypeColor(content.type)} border-2 border-white shadow-sm`}>
                    <span className="flex items-center">
                      {getTypeIcon(content.type)}
                      <span className="ml-1 capitalize font-semibold">{content.type}</span>
                    </span>
                  </Badge>
                </div>
                {content.description && (
                  <p className="text-xs sm:text-sm text-gray-600 mt-2 line-clamp-2 leading-relaxed">{content.description}</p>
                )}
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs sm:text-sm">
                    <span className="text-gray-600">Subject:</span>
                    <Badge variant="outline">{content.subject?.name || 'N/A'}</Badge>
                  </div>
                  {content.topic && (
                    <div className="flex items-center justify-between text-xs sm:text-sm">
                      <span className="text-gray-600">Topic:</span>
                      <span>{content.topic}</span>
                    </div>
                  )}
                  {(content.type === 'Video' || content.type === 'Audio') && content.duration && (
                    <div className="flex items-center justify-between text-xs sm:text-sm">
                      <span className="text-gray-600">Duration:</span>
                      <span>{formatDuration(content.duration)}</span>
                    </div>
                  )}
                  {(content.type === 'TextBook' || content.type === 'Workbook' || content.type === 'Material') && content.size && (
                    <div className="flex items-center justify-between text-xs sm:text-sm">
                      <span className="text-gray-600">Size:</span>
                      <span>{formatFileSize(content.size)}</span>
                    </div>
                  )}
                  {Number(content.views) > 0 && (
                    <div className="flex items-center justify-between text-xs sm:text-sm text-gray-500">
                      <span>{content.views} views</span>
                    </div>
                  )}
                </div>
                <div className="flex gap-2 mt-6">
                  {content.type === 'Video' ? (
                    <Button 
                      className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white shadow-lg hover:shadow-xl transition-all duration-300"
                      onClick={() => {
                        setPreviewContent(content);
                        setIsPreviewOpen(true);
                      }}
                    >
                      <Play className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
                      Watch Video
                    </Button>
                  ) : content.type === 'Audio' ? (
                    <Button 
                      className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white shadow-lg hover:shadow-xl transition-all duration-300"
                      onClick={() => {
                        setPreviewContent(content);
                        setIsPreviewOpen(true);
                      }}
                    >
                      <Play className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
                      Play Audio
                    </Button>
                  ) : (
                    <div className="flex gap-3 mt-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs px-0 h-auto text-gray-700 hover:text-blue-600"
                        onClick={() => {
                          setPreviewContent(content);
                          setIsPreviewOpen(true);
                        }}
                      >
                        <ExternalLink className="h-3 w-3 mr-1" />
                        {content.type === 'TextBook' || content.type === 'Workbook' ? 'Open' : 'Preview'}
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={isPreviewOpen}
        onOpenChange={(open) => {
          setIsPreviewOpen(open);
          if (!open) setPreviewContent(null);
        }}
      >
        <DialogContent className="flex h-[min(96dvh,1200px)] max-h-[98dvh] w-[min(98vw,1280px)] max-w-[1280px] flex-col overflow-hidden rounded-xl border-0 bg-[#d6d3d1] p-0 shadow-2xl">
          <DialogHeader className="shrink-0 border-b border-stone-300/60 bg-stone-100/95 px-4 py-3 sm:px-6">
            <DialogTitle className="pl-1 pt-0.5 text-base sm:text-lg">{previewContent?.title || 'Content Preview'}</DialogTitle>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#d6d3d1]">
          {(() => {
            const fileUrl = extractDirectFileUrl(getNormalizedContentUrl(previewContent?.fileUrl));
            const lower = fileUrl.toLowerCase();
            const isPdf = lower.endsWith('.pdf') || lower.includes('.pdf');
            const isImage = /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/.test(lower);
            const isAudio = /\.(mp3|wav|ogg|m4a|aac|flac)$/.test(lower) || previewContent?.type === 'Audio';
            const isVideo = /\.(mp4|webm|ogg|mov|avi|mkv)$/.test(lower) || previewContent?.type === 'Video';
            const youtubeEmbedUrl = getYouTubeEmbedUrl(fileUrl);

            if (!fileUrl) return <p className="p-4 text-xs sm:text-sm text-gray-500">No preview URL available.</p>;

            if (youtubeEmbedUrl) {
              return (
                <div className="m-3 w-auto aspect-video overflow-hidden rounded-lg bg-gray-100 sm:m-4">
                  <iframe
                    className="w-full h-full border-0"
                    src={youtubeEmbedUrl}
                    title={previewContent?.title || 'YouTube content'}
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
                />
              );
            }

            if (isImage) {
              return (
                <div className="m-3 max-h-[70vh] w-auto overflow-auto rounded-lg bg-gray-100 p-2 sm:m-4">
                  <img src={fileUrl} alt={previewContent?.title || 'Preview'} className="mx-auto max-h-[66vh] object-contain" draggable={false} />
                </div>
              );
            }

            if (isAudio) {
              return <audio src={fileUrl} controls className="m-4 w-[calc(100%-2rem)]" />;
            }

            if (isVideo) {
              return (
                <div className="m-3 aspect-video w-auto overflow-hidden rounded-lg bg-gray-100 sm:m-4">
                  <video src={fileUrl} controls className="w-full h-full" />
                </div>
              );
            }

            return <p className="p-4 text-xs sm:text-sm text-gray-500">Preview not available for this file type.</p>;
          })()}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

