import { useState, useEffect, useMemo } from 'react';
import { useRoute, useSearch } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getAuthToken } from '@/lib/auth-utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  Play, 
  Clock, 
  Users, 
  BookOpen,
  Target,
  Award,
  ArrowLeft,
  CheckCircle,
  FileText,
  Video,
  Youtube,
  Filter,
  X,
} from 'lucide-react';
import StudentShell from "@/components/layout/StudentShell";
import { filterVideosForLearningPath } from '@/lib/school-program';
import { formatLibraryContentClassLabel } from '@/lib/library-content-labels';
import VideoModal from '@/components/video-modal';
import CalendarView from '@/components/student/calendar-view';
import VidyaAIFloatingAssistant from '@/components/student/VidyaAIFloatingAssistant';
import { Link } from 'wouter';
import { API_BASE_URL } from '@/lib/api-config';
import { useIsMobile } from '@/hooks/use-mobile';

interface Subject {
  _id: string;
  name: string;
  description: string;
  category: string;
  difficulty: string;
  duration: string;
  subjects: string[];
  color: string;
  icon: string;
  videos: Video[];
  quizzes: Quiz[];
  students: number;
  rating: number;
  progress: number;
}

interface Video {
  _id: string;
  title: string;
  description: string;
  duration: number;
  videoUrl: string;
  youtubeUrl?: string;
  isYouTubeVideo?: boolean;
  thumbnailUrl?: string;
  views: number;
  createdAt: string;
}

interface Quiz {
  _id: string;
  question: string;
  options: string[];
  correctAnswer: number;
  difficulty: string;
  duration: number;
  createdAt: string;
}

interface ContentItem {
  _id: string;
  title: string;
  description?: string;
  type: 'TextBook' | 'Workbook' | 'Material' | 'Video' | 'Audio';
  fileUrl: string;
  date: string;
  createdAt: string;
}

export default function SubjectContent() {
  const [, params] = useRoute('/subject/:id');
  const search = useSearch();
  const isMobile = useIsMobile();
  const [subject, setSubject] = useState<Subject | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  // Show calendar by default when accessed from learning paths
  const [showCalendar, setShowCalendar] = useState(true);
  const [contents, setContents] = useState<ContentItem[]>([]);
  const [loadingContents, setLoadingContents] = useState(false);
  const [completedContentIds, setCompletedContentIds] = useState<Set<string>>(new Set());
  const [selectedContentType, setSelectedContentType] = useState<string | null>(null);

  const focusChapter = useMemo(() => {
    if (typeof window === 'undefined') return '';
    try {
      return String(new URLSearchParams(window.location.search).get('focus') || '').trim();
    } catch {
      return '';
    }
  }, [params?.id]);

  const mergeSubjectIds = useMemo(() => {
    const q = search.startsWith('?') ? search.slice(1) : search;
    const mergeParam = new URLSearchParams(q).get('merge');
    if (!mergeParam) return [] as string[];
    return mergeParam
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }, [search]);

  useEffect(() => {
    if (params?.id) {
      fetchSubjectContent(params.id, mergeSubjectIds);
      // Load completed content from database and localStorage
      loadCompletedContentFromDB(params.id);
      loadCompletedContent(params.id);
    }
  }, [params?.id, mergeSubjectIds.join(',')]);

  // Load completed content from database
  const loadCompletedContentFromDB = async (subjectId: string) => {
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE_URL}/api/student/learning-progress?subjectId=${subjectId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data) {
          // Get completed content IDs from database
          const completedIds = data.data.progressRecords
            .filter((record: any) => record.completed)
            .map((record: any) => record.contentId?._id || record.contentId);
          
          if (completedIds.length > 0) {
            setCompletedContentIds(new Set(completedIds));
            // Also sync to localStorage
            saveCompletedContent(subjectId, new Set(completedIds));
          }
        }
      }
    } catch (error) {
      console.error('Failed to load completed content from database:', error);
    }
  };

  // Load completed content from localStorage
  const loadCompletedContent = (subjectId: string) => {
    try {
      const stored = localStorage.getItem(`completed_content_${subjectId}`);
      if (stored) {
        const completedIds = JSON.parse(stored);
        setCompletedContentIds(new Set(completedIds));
      }
    } catch (error) {
      console.error('Failed to load completed content:', error);
    }
  };

  // Save completed content to localStorage
  const saveCompletedContent = (subjectId: string, completedIds: Set<string>) => {
    try {
      localStorage.setItem(`completed_content_${subjectId}`, JSON.stringify(Array.from(completedIds)));
    } catch (error) {
      console.error('Failed to save completed content:', error);
    }
  };

  // Calculate progress based on completed items
  const calculateProgress = (totalItems: number, completedItems: number): number => {
    if (totalItems === 0) return 0;
    return Math.round((completedItems / totalItems) * 100);
  };

  // Handle mark as done - save to database
  const handleMarkAsDone = async (contentId: string) => {
    const newCompleted = new Set(completedContentIds);
    const isCompleted = newCompleted.has(contentId);
    
    if (isCompleted) {
      newCompleted.delete(contentId);
    } else {
      newCompleted.add(contentId);
    }
    setCompletedContentIds(newCompleted);
    
    // Save to localStorage (for offline support)
    if (params?.id) {
      saveCompletedContent(params.id, newCompleted);
    }

    // Save to database
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE_URL}/api/student/content-progress`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contentId: contentId,
          completed: !isCompleted, // Toggle completion status
          progress: !isCompleted ? 100 : 0
        })
      });

      if (response.ok) {
        console.log('✅ Learning progress saved to database');
      } else {
        console.error('Failed to save learning progress to database');
      }
    } catch (error) {
      console.error('Error saving learning progress:', error);
    }

    // Update subject progress
    const progress = calculateProgress(contents.length, newCompleted.size);
    setSubject(prev => prev ? { ...prev, progress } : prev);
  };

  const fetchSubjectContent = async (subjectId: string, mergeIds: string[] = []) => {
    try {
      const subjectIds = Array.from(new Set([subjectId, ...mergeIds]));
      const [subjectResponse, videosResponse, ...contentResponses] = await Promise.all([
        fetch(`${API_BASE_URL}/api/subjects/${subjectId}`, {
          headers: {
            'Authorization': `Bearer ${getAuthToken()}`,
            'Content-Type': 'application/json',
          }
        }),
        fetch(`${API_BASE_URL}/api/student/videos?subject=${encodeURIComponent(subjectId)}`, {
          headers: {
            'Authorization': `Bearer ${getAuthToken()}`,
            'Content-Type': 'application/json',
          }
        }),
        ...subjectIds.map((id) =>
          fetch(
            `${API_BASE_URL}/api/student/asli-prep-content?subject=${encodeURIComponent(id)}&surface=learning-path`,
            {
              headers: {
                Authorization: `Bearer ${getAuthToken()}`,
                'Content-Type': 'application/json',
              },
            },
          ),
        ),
      ]);
      
      let subjectName = '';
      
      if (subjectResponse.ok) {
        const contentType = subjectResponse.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const subjectData = await subjectResponse.json();
          setSubject(subjectData.subject);
          subjectName = subjectData.subject?.name || '';
        } else {
          console.warn('Subject response is not JSON');
          setSubject({ _id: subjectId, name: 'Subject', description: '', category: '', difficulty: '', duration: '', subjects: [], color: '', icon: '', videos: [], quizzes: [], students: 0, rating: 0, progress: 0 });
        }
      } else {
        console.warn('Subject API failed');
        setSubject({ _id: subjectId, name: 'Subject', description: '', category: '', difficulty: '', duration: '', subjects: [], color: '', icon: '', videos: [], quizzes: [], students: 0, rating: 0, progress: 0 });
      }
      
      // Attach subject-specific videos
      if (videosResponse.ok) {
        const vidCt = videosResponse.headers.get('content-type');
        if (vidCt && vidCt.includes('application/json')) {
          const videosData = await videosResponse.json();
          const videosList = (videosData.data || videosData.videos || videosData) as any[];
          console.log('📹 Videos fetched for subject:', {
            subjectId,
            videosCount: videosList.length,
            videos: videosList.map(v => ({ title: v.title, subjectId: v.subjectId }))
          });
          setSubject(prev => prev ? { ...prev, videos: videosList } as any : prev);
        } else {
          console.warn('⚠️ Videos response is not JSON');
          setSubject(prev => prev ? { ...prev, videos: [] } as any : prev);
        }
      } else {
        console.warn('⚠️ Videos API failed:', videosResponse.status, videosResponse.statusText);
        setSubject(prev => prev ? { ...prev, videos: [] } as any : prev);
      }

      // Fetch content for calendar view (board + merged IIT subject siblings)
      setLoadingContents(true);
      const seen = new Set<string>();
      const mergedContents: ContentItem[] = [];
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
          mergedContents.push(item);
        }
      }
      const lpContents = filterVideosForLearningPath(mergedContents);
      setContents(lpContents);
      if (params?.id) {
        const stored = localStorage.getItem(`completed_content_${params.id}`);
        const completedIds = stored ? JSON.parse(stored) : [];
        const progress = calculateProgress(lpContents.length, completedIds.length);
        setSubject((prev) => (prev ? { ...prev, progress } : prev));
        setCompletedContentIds(new Set(completedIds));
      }
      setLoadingContents(false);
    } catch (error) {
      console.error('Failed to fetch subject content:', error);
      setLoadingContents(false);
    } finally {
      setLoading(false);
    }
  };

  const handleVideoClick = (video: Video) => {
    setSelectedVideo(video);
    setIsVideoModalOpen(true);
  };

  const handleCloseVideoModal = () => {
    setIsVideoModalOpen(false);
    setSelectedVideo(null);
  };

  const getIcon = (iconName: string) => {
    switch (iconName) {
      case 'BookOpen': return BookOpen;
      case 'Target': return Target;
      case 'Award': return Award;
      default: return BookOpen;
    }
  };

  if (loading) {
    return (
      <StudentShell>
        <div className="w-full">
          <div className="mb-6 h-10 w-48 animate-pulse rounded-xl bg-slate-200/80" />
          <div className="mb-8 h-28 animate-pulse rounded-2xl bg-slate-200/70" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-36 animate-pulse rounded-2xl bg-slate-200/60" />
            ))}
          </div>
          <p className="sr-only" role="status" aria-live="polite">
            Loading subject content
          </p>
        </div>
      </StudentShell>
    );
  }

  if (!subject) {
    return (
      <StudentShell>
        <div className="w-full">
          <div className="text-center">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4">Subject not found</h1>
            <Link href="/learning-paths">
              <Button
                variant="outline"
                className="border-blue-200 text-blue-700 hover:bg-blue-50 hover:text-blue-800"
              >
                <ArrowLeft className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
                Back to Learning Path
              </Button>
            </Link>
          </div>
        </div>
      </StudentShell>
    );
  }

  const Icon = getIcon(subject.icon);

  return (
    <StudentShell>
      <div className="relative w-full pb-8">
        
        {!isMobile && <VidyaAIFloatingAssistant />}
        
        {/* Header Section */}
        <div className="mb-8">
          <div className="flex items-center mb-4">
            <Link href="/learning-paths">
              <Button 
                variant="outline" 
                className="mr-4 bg-white/90 backdrop-blur-sm border-blue-200 text-blue-700 shadow-sm hover:bg-blue-50 hover:text-blue-800 hover:shadow-md transition-all"
              >
                <ArrowLeft className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
                Back to Learning Path
              </Button>
            </Link>
          </div>
          
          <div className="gradient-primary rounded-2xl p-5 sm:p-8 text-white relative overflow-hidden">
            <div className="relative z-10">
              <div className="flex items-center space-x-4 mb-4">
                <div className={`w-16 h-16 ${subject.color} rounded-2xl flex items-center justify-center`}>
                  <Icon className="w-6 h-6 sm:w-7 sm:h-7 lg:w-8 lg:h-8" />
                </div>
                <div>
                  <h1 className="text-2xl sm:text-3xl font-bold mb-2">{subject.name}</h1>
                  {(() => {
                    const classLabel = contents
                      .map((row) => formatLibraryContentClassLabel(row))
                      .find(Boolean);
                    return classLabel ? (
                      <p className="text-blue-50 font-medium mb-1">{classLabel}</p>
                    ) : null;
                  })()}
                  <p className="text-blue-100">{subject.description}</p>
                </div>
              </div>

              {/* Progress */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs sm:text-sm font-medium text-blue-100">Your Progress</span>
                  <span className="text-xs sm:text-sm font-medium text-white">{subject.progress || 0}%</span>
                </div>
                <Progress value={subject.progress || 0} className="h-2 bg-white/20 [&>div]:bg-white" />
              </div>

              <div className="flex flex-wrap gap-4">
                {!showCalendar && (
                  <Button 
                    className="bg-white text-primary hover:bg-blue-50"
                    onClick={() => setShowCalendar(true)}
                  >
                    <Play className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
                    Start Learning
                  </Button>
                )}
              </div>
            </div>
            
            {/* Decorative elements */}
            <div className="absolute top-0 right-0 w-64 h-64 opacity-10">
              <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
                <path fill="currentColor" d="M47.1,-78.5C58.9,-69.2,64.3,-50.4,73.2,-32.8C82.1,-15.1,94.5,1.4,94.4,17.9C94.3,34.4,81.7,50.9,66.3,63.2C50.9,75.5,32.7,83.6,13.8,87.1C-5.1,90.6,-24.7,89.5,-41.6,82.1C-58.5,74.7,-72.7,61,-79.8,44.8C-86.9,28.6,-86.9,9.9,-83.2,-6.8C-79.5,-23.5,-72.1,-38.2,-61.3,-49.6C-50.5,-61,-36.3,-69.1,-21.4,-75.8C-6.5,-82.5,9.1,-87.8,25.2,-84.9C41.3,-82,57.9,-70,47.1,-78.5Z" transform="translate(100 100)"/>
              </svg>
            </div>
          </div>
        </div>

        {focusChapter ? (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950">
            <p className="text-xs font-bold uppercase tracking-wide text-amber-800">
              Focus from your exam
            </p>
            <p className="text-sm sm:text-base font-semibold mt-1">
              Study chapter / subtopic: {focusChapter}
            </p>
            <p className="text-xs text-amber-800/80 mt-1">
              Look for videos or materials on this topic in the list below, then practise related questions.
            </p>
          </div>
        ) : null}

        {/* Calendar View */}
        {showCalendar ? (
          <div className="space-y-3 sm:space-y-4 lg:space-y-6">
            <div className="mb-4 flex items-center justify-between flex-wrap gap-4">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Learning Calendar</h2>
                <p className="text-gray-600 mt-1">Content organized by upload date</p>
              </div>
              
              {/* Content Type Filter */}
              {contents.length > 0 && (
                <div className="flex items-center space-x-2">
                  {/* Get unique content types from contents */}
                  {(() => {
                    const uniqueTypes = Array.from(new Set(contents.map(c => c.type))).sort((a, b) => a.localeCompare(b));
                    return (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" className="flex items-center space-x-2">
                            <Filter className="w-3 h-3 sm:w-4 sm:h-4" />
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
                            All Types ({contents.length})
                          </DropdownMenuItem>
                          {uniqueTypes.map((type) => {
                            const count = contents.filter(c => c.type === type).length;
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
                    );
                  })()}
                  
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
                onMarkAsDone={handleMarkAsDone}
                completedItems={Array.from(completedContentIds)}
                subjectName={subject?.name || ''}
                allowHomeworkSubmit
              />
            )}
          </div>
        ) : (
          /* Content Tabs */
          <Tabs defaultValue="videos" className="space-y-3 sm:space-y-4 lg:space-y-6">
            <TabsList className="grid w-full grid-cols-1">
              <TabsTrigger value="videos" className="flex items-center space-x-2">
                <Video className="w-3 h-3 sm:w-4 sm:h-4" />
                <span>Videos ({subject.videos?.length || 0})</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="videos" className="space-y-3 sm:space-y-4 lg:space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:p-4 lg:p-6">
              {subject.videos?.map((video) => (
                <Card key={video._id} className="hover:shadow-lg transition-shadow duration-200">
                  <CardHeader>
                    <div className="aspect-video bg-gray-100 rounded-lg mb-4 flex items-center justify-center">
                      {video.isYouTubeVideo ? (
                        <Youtube className="w-12 h-12 text-red-500" />
                      ) : (
                        <Video className="w-12 h-12 text-blue-500" />
                      )}
                    </div>
                    <CardTitle className="text-base sm:text-lg">{video.title}</CardTitle>
                    <p className="text-gray-600 text-xs sm:text-sm">{video.description}</p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between text-xs sm:text-sm text-gray-600">
                      <div className="flex items-center space-x-1">
                        <Clock className="w-3 h-3 sm:w-4 sm:h-4" />
                        <span>{video.duration} min</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <Users className="w-3 h-3 sm:w-4 sm:h-4" />
                        <span>{video.views} views</span>
                      </div>
                    </div>

                    <Button 
                      className="w-full gradient-primary text-white"
                      onClick={() => handleVideoClick(video)}
                    >
                      <Play className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
                      Watch Video
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>

            {(!subject.videos || subject.videos.length === 0) && (
              <div className="text-center py-12">
                <Video className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-2">No videos available</h3>
                <p className="text-gray-600">Videos will appear here once they are added to this learning path.</p>
              </div>
            )}
          </TabsContent>

          </Tabs>
        )}
      </div>

      {/* Video Modal */}
      <VideoModal
        isOpen={isVideoModalOpen}
        onClose={handleCloseVideoModal}
        video={selectedVideo ? {
          id: selectedVideo._id,
          title: selectedVideo.title,
          description: selectedVideo.description,
          duration: Math.floor(selectedVideo.duration / 60),
          subject: subject.name,
          videoUrl: selectedVideo.videoUrl,
          youtubeUrl: selectedVideo.youtubeUrl || selectedVideo.videoUrl,
          isYouTubeVideo: selectedVideo.isYouTubeVideo || false
        } : null}
      />
    </StudentShell>
  );
}
