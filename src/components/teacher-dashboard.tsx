import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { API_BASE_URL } from '@/lib/api-config';
import { getAuthToken } from '@/lib/auth-utils';
import {
  BookOpen, 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  Eye, 
  Play,
  FileText,
  BarChart3,
  Users,
  Clock,
  Star,
  Upload,
  Download,
  Filter,
  LogOut,
  CheckCircle,
  FileVideo,
  Youtube
} from 'lucide-react';

interface Teacher {
  id: string;
  fullName: string;
  email: string;
  subjects: Subject[];
}

interface Subject {
  id: string;
  name: string;
  code?: string;
  description?: string;
  _id?: string;
}

interface Quiz {
  id: string;
  title: string;
  subject: string;
  questions: number;
  duration: number;
  difficulty: string;
  isActive: boolean;
  createdAt: string;
}

interface Video {
  id: string;
  title: string;
  subject: string;
  duration: number;
  description?: string;
  isActive: boolean;
  createdAt: string;
  isYouTubeVideo?: boolean;
  views?: number;
  difficulty?: string;
  driveLink?: string;
  programmingLink?: string;
  url?: string;
  videoUrl?: string;
  thumbnail?: string;
  youtubeUrl?: string;
}

interface Assessment {
  id: string;
  title: string;
  subject: string;
  type: string;
  duration: number;
  difficulty: string;
  isActive: boolean;
  createdAt: string;
  description?: string;
  totalPoints?: number;
  driveLink?: string;
  programmingLink?: string;
}

const TeacherDashboard = () => {
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSubject, setFilterSubject] = useState('all');

  // Quiz form state
  const [isQuizDialogOpen, setIsQuizDialogOpen] = useState(false);
  const [newQuiz, setNewQuiz] = useState({
    title: '',
    subject: '',
    duration: 60,
    difficulty: 'medium',
    description: ''
  });

  // Video form state
  const [isVideoDialogOpen, setIsVideoDialogOpen] = useState(false);
  const [isEditVideoDialogOpen, setIsEditVideoDialogOpen] = useState(false);
  const [editingVideo, setEditingVideo] = useState<Video | null>(null);
  const [newVideo, setNewVideo] = useState({
    title: '',
    description: '',
    subject: '',
    subjectId: '',
    duration: 30,
    videoUrl: '',
    thumbnail: '',
    youtubeUrl: '',
    isYouTubeVideo: false,
    difficulty: 'Beginner'
  });

  // Assessment form state
  const [isAssessmentDialogOpen, setIsAssessmentDialogOpen] = useState(false);
  const [newAssessment, setNewAssessment] = useState({
    title: '',
    subject: '',
    type: 'quiz' as 'quiz' | 'exam' | 'assignment' | 'project',
    duration: 60,
    difficulty: 'intermediate' as 'beginner' | 'intermediate' | 'advanced',
    description: '',
    totalMarks: 100,
    passingMarks: 50,
    questions: 20,
    isDriveQuiz: false,
    driveLink: ''
  });

  useEffect(() => {
    fetchTeacherData();
    fetchQuizzes();
    fetchVideos();
    fetchAssessments();
  }, []);

  const fetchTeacherData = async () => {
    try {
      console.log('Fetching teacher data...');
      console.log('Current URL:', window.location.href);
      console.log('Document cookies:', document.cookie);
      
      // For development, use mock teacher data if authentication fails
      if (process.env.NODE_ENV === 'development') {
        console.log('Development mode: Using mock teacher data...');
        const mockTeacher = {
          id: '68fb5f00cde14c9994483094',
          email: 'teacher@test.com',
          fullName: 'Test Teacher',
          subjects: [
            { id: '68fa7cbdd138037a2e0edba3', name: 'Samayamanthula' },
            { id: '68fa61c8a58637f5c6d5f93e', name: 'Maths' }
          ]
        };
        console.log('Using mock teacher data:', mockTeacher);
        setTeacher(mockTeacher);
        return;
      }
      
      const token = getAuthToken();
      const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        }
      });
      
      console.log('Auth response status:', response.status);
      console.log('Auth response headers:', response.headers);
      
      if (response.ok) {
        const data = await response.json();
        console.log('Teacher data fetched from /api/auth/me:', data.user);
        console.log('Teacher subjects:', data.user?.subjects);
        
        // Check if user is a teacher
        if (data.user.role !== 'teacher') {
          console.log('User is not a teacher, redirecting to login');
          window.location.href = '/auth/login';
          return;
        }
        
        setTeacher(data.user);
      } else {
        const errorData = await response.json();
        console.error('Failed to fetch teacher data from /api/auth/me:', response.status, errorData);
        console.log('Not authenticated, redirecting to login');
        window.location.href = '/auth/login';
        return;
      }
    } catch (error) {
      console.error('Failed to fetch teacher data:', error);
      console.log('Error occurred, redirecting to login');
      window.location.href = '/auth/login';
    } finally {
      setIsLoading(false);
    }
  };

  const fetchQuizzes = async () => {
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE_URL}/api/teacher/quizzes`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setQuizzes(data);
      } else {
        // No mock data - show empty state
        setQuizzes([]);
      }
    } catch (error) {
      console.error('Failed to fetch quizzes:', error);
      setQuizzes([]);
    }
  };

  const fetchVideos = async () => {
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE_URL}/api/teacher/videos`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setVideos(data);
      } else {
        // No mock data - show empty state
        setVideos([]);
      }
    } catch (error) {
      console.error('Failed to fetch videos:', error);
      setVideos([]);
    }
  };

  const fetchAssessments = async () => {
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE_URL}/api/teacher/assessments`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setAssessments(data);
      } else {
        // No mock data - show empty state
        setAssessments([]);
      }
    } catch (error) {
      console.error('Failed to fetch assessments:', error);
      setAssessments([]);
    }
  };

  const handleLogout = async () => {
    try {
      const token = getAuthToken();
      await fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      window.location.href = '/signin';
    } catch (error) {
      console.error('Logout failed:', error);
      window.location.href = '/signin';
    }
  };

  // Form submission handlers
  const handleCreateQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE_URL}/api/teacher/quizzes`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...newQuiz,
          difficulty: newQuiz.difficulty.toLowerCase(), // Convert to lowercase
          questions: [
            {
              question: "Sample question 1",
              type: "multiple-choice",
              options: ["Option A", "Option B", "Option C", "Option D"],
              correctAnswer: "Option A",
              points: 1
            }
          ]
        })
      });

      if (response.ok) {
        setIsQuizDialogOpen(false);
        setNewQuiz({ title: '', subject: '', duration: 60, difficulty: 'medium', description: '' });
        fetchQuizzes();
      } else {
        console.error('Failed to create quiz');
      }
    } catch (error) {
      console.error('Error creating quiz:', error);
    }
  };

  const handleCreateVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE_URL}/api/teacher/videos`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: newVideo.title,
          description: newVideo.description,
          videoUrl: newVideo.isYouTubeVideo ? newVideo.youtubeUrl : newVideo.videoUrl,
          subject: newVideo.subject,
          duration: newVideo.duration * 60, // Convert to seconds
          difficulty: newVideo.difficulty.toLowerCase(), // Convert to lowercase for backend validation
          isYouTubeVideo: newVideo.isYouTubeVideo,
          thumbnail: newVideo.thumbnail
        })
      });

      if (response.ok) {
        const createdVideo = await response.json();
        setVideos([...videos, createdVideo]);
        setNewVideo({
          title: '',
          description: '',
          subject: '',
          subjectId: '',
          duration: 30,
          videoUrl: '',
          thumbnail: '',
          youtubeUrl: '',
          isYouTubeVideo: false,
          difficulty: 'Beginner'
        });
        setIsVideoDialogOpen(false);
        fetchVideos();
      } else {
        console.error('Failed to create video');
      }
    } catch (error) {
      console.error('Error creating video:', error);
    }
  };

  const handleEditVideo = async (video: Video) => {
    try {
      const response = await fetch(`/api/teacher/videos/${video.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(video),
      });

      if (response.ok) {
        const updatedVideo = await response.json();
        setVideos(videos.map(v => v.id === video.id ? updatedVideo : v));
        setIsEditVideoDialogOpen(false);
        setEditingVideo(null);
      }
    } catch (error) {
      console.error('Failed to update video:', error);
    }
  };

  const handleCreateAssessment = async () => {
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE_URL}/api/teacher/assessments`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: newAssessment.title,
          description: newAssessment.description,
          subject: newAssessment.subject,
          type: newAssessment.type,
          duration: newAssessment.duration,
          difficulty: newAssessment.difficulty,
          questions: [
            {
              question: "Sample assessment question 1",
              type: "multiple-choice",
              options: ["Option A", "Option B", "Option C", "Option D"],
              correctAnswer: "Option A",
              points: 2
            }
          ]
        })
      });

      if (response.ok) {
        setIsAssessmentDialogOpen(false);
        setNewAssessment({
          title: '',
          subject: '',
          type: 'quiz' as 'quiz' | 'exam' | 'assignment' | 'project',
          duration: 60,
          difficulty: 'intermediate' as 'beginner' | 'intermediate' | 'advanced',
          description: '',
          totalMarks: 100,
          passingMarks: 50,
          questions: 20,
          isDriveQuiz: false,
          driveLink: ''
        });
        fetchAssessments();
      } else {
        console.error('Failed to create assessment');
      }
    } catch (error) {
      console.error('Error creating assessment:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-blue-50 to-cyan-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600 mx-auto mb-4"></div>
          <p className="text-sky-700">Loading teacher dashboard...</p>
          <p className="text-sky-600 text-xs sm:text-sm mt-2">If you're not logged in, you'll be redirected to the login page.</p>
        </div>
      </div>
    );
  }

  const totalQuizzes = quizzes.length;
  const totalVideos = videos.length;
  const totalAssessments = assessments.length;
  const activeContent = [...quizzes, ...videos, ...assessments].filter(item => item.isActive).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-blue-50 to-cyan-50">
      {/* Header */}
      <div className="bg-white/40 backdrop-blur-xl border-b border-sky-200 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <div className="w-10 h-10 bg-gradient-to-r from-sky-500 to-blue-600 rounded-full flex items-center justify-center text-white font-bold">
                {teacher?.fullName?.split(' ').map(n => n[0]).join('') || 'T'}
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-semibold text-sky-900">Teacher Dashboard</h1>
                <p className="text-xs sm:text-sm text-sky-700">Welcome back, {teacher?.fullName || 'Teacher'}!</p>
                <p className="text-xs text-sky-600">
                  Email: {teacher?.email || 'Not loaded'}
                </p>
                <p className="text-xs text-sky-600">
                  Assigned subjects: {teacher?.subjects?.length && teacher.subjects.length > 0 ? teacher.subjects.map(s => s.name).join(', ') : 'None'}
                </p>
                <p className="text-xs text-sky-600">
                  Subjects count: {teacher?.subjects?.length || 0}
                </p>
              </div>
            </div>
            <Button 
              onClick={handleLogout}
              variant="outline" 
              className="border-sky-200 text-sky-700 hover:bg-sky-50"
            >
              <LogOut className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 sm:p-4 lg:p-6 mb-8">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white/70 backdrop-blur-xl rounded-2xl p-3 sm:p-4 lg:p-6 shadow-lg border border-sky-200"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sky-700 text-xs sm:text-sm font-medium">Total Quizzes</p>
                <p className="text-2xl sm:text-3xl font-bold text-sky-900">{totalQuizzes}</p>
              </div>
              <div className="p-3 bg-sky-100 rounded-xl">
                <FileText className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-sky-600" />
              </div>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white/70 backdrop-blur-xl rounded-2xl p-3 sm:p-4 lg:p-6 shadow-lg border border-sky-200"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sky-700 text-xs sm:text-sm font-medium">Total Videos</p>
                <p className="text-2xl sm:text-3xl font-bold text-sky-900">{totalVideos}</p>
              </div>
              <div className="p-3 bg-sky-100 rounded-xl">
                <Play className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-sky-600" />
              </div>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white/70 backdrop-blur-xl rounded-2xl p-3 sm:p-4 lg:p-6 shadow-lg border border-sky-200"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sky-700 text-xs sm:text-sm font-medium">Total Assessments</p>
                <p className="text-2xl sm:text-3xl font-bold text-sky-900">{totalAssessments}</p>
              </div>
              <div className="p-3 bg-sky-100 rounded-xl">
                <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-sky-600" />
              </div>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-white/70 backdrop-blur-xl rounded-2xl p-3 sm:p-4 lg:p-6 shadow-lg border border-sky-200"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sky-700 text-xs sm:text-sm font-medium">Active Content</p>
                <p className="text-2xl sm:text-3xl font-bold text-sky-900">{activeContent}</p>
              </div>
              <div className="p-3 bg-sky-100 rounded-xl">
                <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-sky-600" />
              </div>
            </div>
          </motion.div>
        </div>

        {/* Main Content Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-3 sm:space-y-4 lg:space-y-6">
          <TabsList className="bg-white/40 backdrop-blur-xl border border-sky-200">
            <TabsTrigger value="overview" className="data-[state=active]:bg-sky-100 data-[state=active]:text-sky-900">
              Overview
            </TabsTrigger>
            <TabsTrigger value="videos" className="data-[state=active]:bg-sky-100 data-[state=active]:text-sky-900">
              Videos
            </TabsTrigger>
            <TabsTrigger value="assessments" className="data-[state=active]:bg-sky-100 data-[state=active]:text-sky-900">
              Assessments
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-3 sm:space-y-4 lg:space-y-6">
            {/* Teacher Profile Section */}
            <Card className="bg-gradient-to-r from-sky-50 to-blue-50 border-sky-200">
                <CardHeader>
                  <CardTitle className="text-sky-900 flex items-center">
                  <Users className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                  Teacher Profile
                  </CardTitle>
                </CardHeader>
                <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:p-4 lg:p-6">
                        <div>
                    <h3 className="text-base sm:text-lg font-semibold text-sky-900 mb-2">Personal Information</h3>
                    <div className="space-y-2">
                      <p><span className="font-medium">Name:</span> {teacher?.fullName || 'Loading...'}</p>
                      <p><span className="font-medium">Email:</span> {teacher?.email || 'Loading...'}</p>
                      <p><span className="font-medium">Role:</span> Teacher</p>
                        </div>
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-semibold text-sky-900 mb-2">Assigned Subjects</h3>
                    <div className="flex flex-wrap gap-2">
                      {teacher?.subjects?.length && teacher.subjects.length > 0 ? (
                        teacher.subjects.map(subject => (
                          <Badge key={subject.id || subject._id} className="bg-sky-100 text-sky-800">
                            {subject.name}
                        </Badge>
                        ))
                      ) : (
                        <p className="text-sky-600">No subjects assigned</p>
                      )}
                      </div>
                  </div>
                  </div>
                </CardContent>
              </Card>

            {/* Content Statistics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:p-4 lg:p-6">
              <Card className="bg-white/70 backdrop-blur-xl border-sky-200">
                <CardContent className="p-3 sm:p-4 lg:p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs sm:text-sm font-medium text-sky-600">Total Videos</p>
                      <p className="text-xl sm:text-2xl font-bold text-sky-900">{videos.length}</p>
                    </div>
                    <Play className="w-6 h-6 sm:w-7 sm:h-7 lg:w-8 lg:h-8 text-sky-500" />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white/70 backdrop-blur-xl border-sky-200">
                <CardContent className="p-3 sm:p-4 lg:p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs sm:text-sm font-medium text-sky-600">Total Quizzes</p>
                      <p className="text-xl sm:text-2xl font-bold text-sky-900">{quizzes.length}</p>
                    </div>
                    <FileText className="w-6 h-6 sm:w-7 sm:h-7 lg:w-8 lg:h-8 text-sky-500" />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white/70 backdrop-blur-xl border-sky-200">
                <CardContent className="p-3 sm:p-4 lg:p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs sm:text-sm font-medium text-sky-600">Total Assessments</p>
                      <p className="text-xl sm:text-2xl font-bold text-sky-900">{assessments.length}</p>
                    </div>
                    <BarChart3 className="w-6 h-6 sm:w-7 sm:h-7 lg:w-8 lg:h-8 text-sky-500" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Recent Content */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:p-4 lg:p-6">
              {/* Recent Videos */}
              <Card className="bg-white/70 backdrop-blur-xl border-sky-200">
                <CardHeader>
                  <CardTitle className="text-sky-900 flex items-center justify-between">
                    <div className="flex items-center">
                    <Play className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                    Recent Videos
                    </div>
                    <Button 
                      size="sm" 
                      className="bg-sky-500 hover:bg-sky-600 text-white"
                      onClick={() => {
                        // Switch to videos tab
                        const videosTab = document.querySelector('[data-value="videos"]') as HTMLElement;
                        if (videosTab) videosTab.click();
                      }}
                    >
                      <Plus className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                      Add Video
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {videos.length === 0 ? (
                    <div className="text-center py-3 sm:py-4 lg:py-6">
                      <Play className="w-12 h-12 text-sky-300 mx-auto mb-3" />
                      <p className="text-sky-600 mb-3">No videos uploaded yet</p>
                      <Button 
                        className="bg-sky-500 hover:bg-sky-600 text-white"
                        onClick={() => {
                          const videosTab = document.querySelector('[data-value="videos"]') as HTMLElement;
                          if (videosTab) videosTab.click();
                        }}
                      >
                        <Upload className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
                        Upload Your First Video
                      </Button>
                    </div>
                  ) : (
                  <div className="space-y-3">
                    {videos.slice(0, 3).map(video => (
                        <div key={video.id} className="flex items-center justify-between p-3 bg-sky-50 rounded-lg hover:bg-sky-100 transition-colors">
                          <div className="flex-1">
                          <p className="font-medium text-sky-900">{video.title}</p>
                          <p className="text-xs sm:text-sm text-sky-600">{video.subject}</p>
                            <p className="text-xs text-sky-500">{video.duration} min</p>
                        </div>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" className="text-sky-600 border-sky-300">
                              <Eye className="w-3 h-3 sm:w-4 sm:h-4" />
                            </Button>
                            <Button size="sm" variant="outline" className="text-sky-600 border-sky-300">
                              <Edit className="w-3 h-3 sm:w-4 sm:h-4" />
                            </Button>
                          </div>
                      </div>
                    ))}
                      {videos.length > 3 && (
                        <div key="view-all-videos" className="text-center pt-2">
                          <Button 
                            variant="ghost" 
                            className="text-sky-600 hover:text-sky-700"
                            onClick={() => {
                              const videosTab = document.querySelector('[data-value="videos"]') as HTMLElement;
                              if (videosTab) videosTab.click();
                            }}
                          >
                            View All Videos ({videos.length})
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Recent Quizzes */}
              <Card className="bg-white/70 backdrop-blur-xl border-sky-200">
                <CardHeader>
                  <CardTitle className="text-sky-900 flex items-center justify-between">
                    <div className="flex items-center">
                      <FileText className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                      Recent Quizzes
                    </div>
                    <Button 
                      size="sm" 
                      className="bg-sky-500 hover:bg-sky-600 text-white"
                      onClick={() => {
                        const quizzesTab = document.querySelector('[data-value="quizzes"]') as HTMLElement;
                        if (quizzesTab) quizzesTab.click();
                      }}
                    >
                      <Plus className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                    Create Quiz
                  </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {quizzes.length === 0 ? (
                    <div className="text-center py-3 sm:py-4 lg:py-6">
                      <FileText className="w-12 h-12 text-sky-300 mx-auto mb-3" />
                      <p className="text-sky-600 mb-3">No quizzes created yet</p>
                      <Button 
                        className="bg-sky-500 hover:bg-sky-600 text-white"
                        onClick={() => {
                          const quizzesTab = document.querySelector('[data-value="quizzes"]') as HTMLElement;
                          if (quizzesTab) quizzesTab.click();
                        }}
                      >
                        <Plus className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
                        Create Your First Quiz
                      </Button>
                      </div>
                  ) : (
                    <div className="space-y-3">
                      {quizzes.slice(0, 3).map(quiz => (
                        <div key={quiz.id} className="flex items-center justify-between p-3 bg-sky-50 rounded-lg hover:bg-sky-100 transition-colors">
                          <div className="flex-1">
                            <p className="font-medium text-sky-900">{quiz.title}</p>
                            <p className="text-xs sm:text-sm text-sky-600">{quiz.subject}</p>
                            <p className="text-xs text-sky-500">{quiz.questions || 0} questions</p>
                      </div>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" className="text-sky-600 border-sky-300">
                              <Eye className="w-3 h-3 sm:w-4 sm:h-4" />
                            </Button>
                            <Button size="sm" variant="outline" className="text-sky-600 border-sky-300">
                              <Edit className="w-3 h-3 sm:w-4 sm:h-4" />
                            </Button>
                    </div>
                      </div>
                      ))}
                      {quizzes.length > 3 && (
                        <div key="view-all-quizzes" className="text-center pt-2">
                          <Button 
                            variant="ghost" 
                            className="text-sky-600 hover:text-sky-700"
                            onClick={() => {
                              const quizzesTab = document.querySelector('[data-value="quizzes"]') as HTMLElement;
                              if (quizzesTab) quizzesTab.click();
                            }}
                          >
                            View All Quizzes ({quizzes.length})
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
                    </div>

            {/* Quiz Link Section */}
            <Card className="bg-gradient-to-r from-green-50 to-emerald-50 border-green-200">
              <CardHeader>
                <CardTitle className="text-green-900 flex items-center justify-between">
                  <div className="flex items-center">
                    <FileText className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                    Quiz Management
                  </div>
                  <Button 
                    size="sm" 
                    className="bg-green-500 hover:bg-green-600 text-white"
                    onClick={() => {
                      // Open quiz management in new tab or redirect
                      window.open('/admin/dashboard', '_blank');
                    }}
                  >
                    <FileText className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                    Manage Quizzes
                      </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-white/60 rounded-lg p-4">
                  <div className="flex items-center space-x-3">
                    <FileText className="w-6 h-6 sm:w-7 sm:h-7 lg:w-8 lg:h-8 text-green-600" />
                    <div>
                      <p className="text-xs sm:text-sm font-medium text-green-900">Create and manage quiz questions</p>
                      <p className="text-xs text-green-600">Access the admin dashboard to create quizzes for your subjects</p>
                    </div>
            </div>
                </div>
              </CardContent>
            </Card>

            {/* Recent Assessments */}
            <Card className="bg-white/70 backdrop-blur-xl border-sky-200">
                  <CardHeader>
                <CardTitle className="text-sky-900 flex items-center justify-between">
                  <div className="flex items-center">
                    <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                    Recent Assessments
                  </div>
                  <Button 
                    size="sm" 
                    className="bg-sky-500 hover:bg-sky-600 text-white"
                    onClick={() => {
                      const assessmentsTab = document.querySelector('[data-value="assessments"]') as HTMLElement;
                      if (assessmentsTab) assessmentsTab.click();
                    }}
                  >
                    <Plus className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                    Create Assessment
                  </Button>
                </CardTitle>
                  </CardHeader>
                  <CardContent>
                {assessments.length === 0 ? (
                  <div className="text-center py-3 sm:py-4 lg:py-6">
                    <BarChart3 className="w-12 h-12 text-sky-300 mx-auto mb-3" />
                    <p className="text-sky-600 mb-3">No assessments created yet</p>
                    <Button 
                      className="bg-sky-500 hover:bg-sky-600 text-white"
                      onClick={() => {
                        const assessmentsTab = document.querySelector('[data-value="assessments"]') as HTMLElement;
                        if (assessmentsTab) assessmentsTab.click();
                      }}
                    >
                      <Plus className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
                      Create Your First Assessment
                    </Button>
                      </div>
                ) : (
                  <div className="space-y-3">
                    {assessments.slice(0, 3).map(assessment => (
                      <div key={assessment.id} className="flex items-center justify-between p-3 bg-sky-50 rounded-lg hover:bg-sky-100 transition-colors">
                        <div className="flex-1">
                          <p className="font-medium text-sky-900">{assessment.title}</p>
                          <p className="text-xs sm:text-sm text-sky-600">{assessment.subject}</p>
                          <p className="text-xs text-sky-500">{assessment.duration} min • {assessment.totalPoints} points</p>
                      </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" className="text-sky-600 border-sky-300">
                            <Eye className="w-3 h-3 sm:w-4 sm:h-4" />
                          </Button>
                          <Button size="sm" variant="outline" className="text-sky-600 border-sky-300">
                            <Edit className="w-3 h-3 sm:w-4 sm:h-4" />
                          </Button>
                      </div>
                    </div>
                    ))}
                    {assessments.length > 3 && (
                      <div key="view-all-assessments" className="text-center pt-2">
                        <Button 
                          variant="ghost" 
                          className="text-sky-600 hover:text-sky-700"
                          onClick={() => {
                            const assessmentsTab = document.querySelector('[data-value="assessments"]') as HTMLElement;
                            if (assessmentsTab) assessmentsTab.click();
                          }}
                        >
                          View All Assessments ({assessments.length})
                        </Button>
                      </div>
                    )}
                  </div>
                )}
                  </CardContent>
                </Card>
          </TabsContent>


          <TabsContent value="videos" className="space-y-3 sm:space-y-4 lg:space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Video Management</h2>
                <p className="text-gray-600">Upload and manage educational videos</p>
              </div>
              <Dialog open={isVideoDialogOpen} onOpenChange={setIsVideoDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-sky-600 hover:bg-sky-700">
                    <Plus className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
                    Upload Video
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Upload New Video</DialogTitle>
                    <DialogDescription>
                      Upload a new educational video with title, description, and metadata.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="title">Video Title</Label>
                      <Input
                        id="title"
                        value={newVideo.title}
                        onChange={(e) => setNewVideo({ ...newVideo, title: e.target.value })}
                        placeholder="Enter video title"
                      />
                    </div>
                    <div>
                      <Label htmlFor="description">Description</Label>
                      <Textarea
                        id="description"
                        value={newVideo.description}
                        onChange={(e) => setNewVideo({ ...newVideo, description: e.target.value })}
                        placeholder="Enter video description"
                        rows={3}
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="subject">Learning Path</Label>
                        <Select value={newVideo.subjectId} onValueChange={(value) => {
                          const selectedSubject = teacher?.subjects?.find(s => (s.id || s._id) === value);
                          setNewVideo({ 
                            ...newVideo, 
                            subjectId: value,
                            subject: selectedSubject?.name || ''
                          });
                        }}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select learning path" />
                          </SelectTrigger>
                          <SelectContent>
                            {teacher?.subjects?.length && teacher.subjects.length > 0 ? (
                              teacher.subjects
                                .filter(subject => (subject.id || subject._id))
                                .map(subject => (
                                  <SelectItem key={subject.id || subject._id} value={subject.id || subject._id || 'unknown'}>
                                    {subject.name}
                                  </SelectItem>
                                ))
                            ) : (
                              <SelectItem value="no-subjects" disabled>No subjects assigned</SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="duration">Duration (minutes)</Label>
                        <Input
                          id="duration"
                          type="number"
                          value={newVideo.duration}
                          onChange={(e) => setNewVideo({ ...newVideo, duration: parseInt(e.target.value) })}
                        />
                      </div>
                    </div>
                    {/* Video Type Selection */}
                    <div className="border-t pt-4">
                      <div className="flex items-center space-x-2 mb-4">
                        <input
                          type="checkbox"
                          id="isYouTubeVideo"
                          checked={newVideo.isYouTubeVideo}
                          onChange={(e) => setNewVideo({ ...newVideo, isYouTubeVideo: e.target.checked })}
                          className="rounded"
                        />
                        <Label htmlFor="isYouTubeVideo" className="text-xs sm:text-sm font-medium">
                          This is a YouTube Video
                        </Label>
                      </div>
                      
                      {newVideo.isYouTubeVideo ? (
                        <div>
                          <Label htmlFor="youtubeUrl">YouTube URL</Label>
                          <Input
                            id="youtubeUrl"
                            value={newVideo.youtubeUrl}
                            onChange={(e) => setNewVideo({ ...newVideo, youtubeUrl: e.target.value })}
                            placeholder="https://www.youtube.com/watch?v=..."
                            className="mt-1"
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            Paste the YouTube video URL - it will be embedded and played on your website
                          </p>
                        </div>
                      ) : (
                        <>
                          <div>
                            <Label htmlFor="videoUrl">Video URL</Label>
                            <Input
                              id="videoUrl"
                              value={newVideo.videoUrl}
                              onChange={(e) => setNewVideo({ ...newVideo, videoUrl: e.target.value })}
                              placeholder="Enter video URL or upload file"
                            />
                          </div>
                          <div>
                            <Label htmlFor="thumbnail">Thumbnail URL</Label>
                            <Input
                              id="thumbnail"
                              value={newVideo.thumbnail}
                              onChange={(e) => setNewVideo({ ...newVideo, thumbnail: e.target.value })}
                              placeholder="Enter thumbnail URL"
                            />
                          </div>
                        </>
                      )}
                    </div>
                    <div className="flex justify-end space-x-2">
                      <Button variant="outline" onClick={() => setIsVideoDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleCreateVideo} className="bg-sky-600 hover:bg-sky-700">
                        Upload Video
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {/* Search and Filter */}
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-3 h-3 sm:w-4 sm:h-4" />
                  <Input
                    placeholder="Search videos..."
                    className="px-0 pl-10 sm:pl-11"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Select value={filterSubject} onValueChange={setFilterSubject}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Filter by subject" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Subjects</SelectItem>
                    {teacher?.subjects?.map(subject => (
                      <SelectItem key={subject.id || subject._id} value={subject.name}>
                        {subject.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {videos.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-sky-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Play className="w-6 h-6 sm:w-7 sm:h-7 lg:w-8 lg:h-8 text-sky-600" />
                </div>
                <h3 className="text-base sm:text-lg font-semibold text-sky-900 mb-2">No Videos Yet</h3>
                <p className="text-sky-600 mb-4">Upload your first video lecture for your assigned subjects.</p>
                <Button 
                  onClick={() => setIsVideoDialogOpen(true)}
                  className="bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white"
                >
                  <Plus className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
                  Upload Your First Video
                </Button>
              </div>
            ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:p-4 lg:p-6">
                {videos
                  .filter(video => {
                    const matchesSearch = video.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                         (video.description || '').toLowerCase().includes(searchTerm.toLowerCase());
                    const matchesSubject = filterSubject === 'all' || video.subject === filterSubject;
                    return matchesSearch && matchesSubject;
                  })
                  .map(video => (
                  <Card key={video.id} className="bg-white shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
                    {/* Video Thumbnail */}
                    <div className="relative">
                      <div className="w-full h-48 bg-gray-200 flex items-center justify-center">
                        {video.isYouTubeVideo ? (
                          <Youtube className="w-16 h-16 text-red-500" />
                        ) : (
                          <Play className="w-16 h-16 text-gray-400" />
                        )}
                      </div>
                      {/* Status Badge */}
                      <div className="absolute top-2 right-2">
                        <Badge variant="secondary" className="bg-gray-100 text-gray-600 text-xs">
                          {video.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                    </div>
                    
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-base sm:text-lg font-semibold text-gray-900 line-clamp-2">
                            {video.title}
                          </CardTitle>
                          <p className="text-xs sm:text-sm text-gray-600 mt-1">{video.description || video.subject || ''}</p>
                        </div>
                        <Badge 
                          variant="outline" 
                          className={`ml-2 text-xs ${
                            video.difficulty === 'beginner' ? 'bg-green-100 text-green-800 border-green-200' :
                            video.difficulty === 'intermediate' ? 'bg-yellow-100 text-yellow-800 border-yellow-200' :
                            'bg-red-100 text-red-800 border-red-200'
                          }`}
                        >
                          {video.difficulty}
                        </Badge>
                      </div>
                    </CardHeader>
                    
                    <CardContent className="pt-0">
                      {/* Metadata */}
                      <div className="flex items-center justify-between text-xs sm:text-sm text-gray-500 mb-4">
                        <div className="flex items-center space-x-4">
                          <div className="flex items-center">
                            <Clock className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                            <span>{video.duration}min</span>
                          </div>
                          <div className="flex items-center">
                            <Eye className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                            <span>{video.views || 0} views</span>
                          </div>
                        </div>
                      </div>
                      
                      {/* Google Drive Integration (if applicable) */}
                      {video.driveLink && (
                        <div className="mb-3 p-2 bg-blue-50 rounded-lg">
                          <div className="flex items-center space-x-2">
                            <div className="w-3 h-3 sm:w-4 sm:h-4 bg-blue-500 rounded"></div>
                            <span className="text-xs sm:text-sm text-blue-700">Google Drive Document</span>
                          </div>
                          <div className="mt-1 flex items-center space-x-2">
                            <span className="text-xs text-gray-600">{video.title}</span>
                            <Button size="sm" variant="outline" className="text-xs h-6">
                              Download
                            </Button>
                            <Button size="sm" variant="outline" className="text-xs h-6">
                              Open
                            </Button>
                          </div>
                        </div>
                      )}
                      
                      {/* Programming Environment (if applicable) */}
                      {video.programmingLink && (
                        <div className="mb-3 p-2 bg-green-50 rounded-lg">
                          <div className="flex items-center justify-between">
                            <span className="text-xs sm:text-sm text-green-700">Programiz Online Java Compiler</span>
                            <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white text-xs h-6">
                              Programiz PRO
                            </Button>
                          </div>
                        </div>
                      )}
                      
                      {/* Action Buttons */}
                      <div className="flex items-center justify-between">
                        <div className="flex space-x-2">
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="p-2"
                            onClick={() => {
                              setEditingVideo(video);
                              setIsEditVideoDialogOpen(true);
                            }}
                          >
                            <Edit className="w-3 h-3 sm:w-4 sm:h-4" />
                          </Button>
                          <Button size="sm" variant="outline" className="p-2">
                            <Play className="w-3 h-3 sm:w-4 sm:h-4" />
                          </Button>
                          <Button size="sm" variant="outline" className="p-2 text-red-600 hover:bg-red-50">
                            <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
                          </Button>
                        </div>
                        <Button size="sm" variant="outline" className="flex items-center space-x-1">
                          <Eye className="w-3 h-3 sm:w-4 sm:h-4" />
                          <span>View</span>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
              ))}
            </div>
            )}
          </TabsContent>

          <TabsContent value="assessments" className="space-y-3 sm:space-y-4 lg:space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Assessment Management</h2>
                <p className="text-gray-600">Create and manage assessments for your students</p>
              </div>
              <Dialog open={isAssessmentDialogOpen} onOpenChange={setIsAssessmentDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-sky-600 hover:bg-sky-700">
                    <Plus className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
                    Create Assessment
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Create New Assessment</DialogTitle>
                    <DialogDescription>
                      Create a new assessment, exam, assignment, or project with detailed settings.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="title">Assessment Title</Label>
                      <Input
                        id="title"
                        value={newAssessment.title}
                        onChange={(e) => setNewAssessment({ ...newAssessment, title: e.target.value })}
                        placeholder="Enter assessment title"
                      />
                    </div>
                    <div>
                      <Label htmlFor="description">Description</Label>
                      <Textarea
                        id="description"
                        value={newAssessment.description}
                        onChange={(e) => setNewAssessment({ ...newAssessment, description: e.target.value })}
                        placeholder="Enter assessment description"
                        rows={3}
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="subject">Subject</Label>
                        <Select value={newAssessment.subject} onValueChange={(value) => setNewAssessment({ ...newAssessment, subject: value })}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select subject" />
                          </SelectTrigger>
                          <SelectContent>
                            {teacher?.subjects?.map(subject => (
                              <SelectItem key={subject.id || subject._id} value={subject.name}>{subject.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="type">Type</Label>
                        <Select value={newAssessment.type} onValueChange={(value: 'quiz' | 'exam' | 'assignment' | 'project') => setNewAssessment({ ...newAssessment, type: value })}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="quiz">Quiz</SelectItem>
                            <SelectItem value="exam">Exam</SelectItem>
                            <SelectItem value="assignment">Assignment</SelectItem>
                            <SelectItem value="project">Project</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="difficulty">Difficulty</Label>
                        <Select value={newAssessment.difficulty} onValueChange={(value: 'beginner' | 'intermediate' | 'advanced') => setNewAssessment({ ...newAssessment, difficulty: value })}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="beginner">Beginner</SelectItem>
                            <SelectItem value="intermediate">Intermediate</SelectItem>
                            <SelectItem value="advanced">Advanced</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="duration">Duration (minutes)</Label>
                        <Input
                          id="duration"
                          type="number"
                          value={newAssessment.duration}
                          onChange={(e) => setNewAssessment({ ...newAssessment, duration: parseInt(e.target.value) })}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div>
                        <Label htmlFor="totalMarks">Total Marks</Label>
                        <Input
                          id="totalMarks"
                          type="number"
                          value={newAssessment.totalMarks}
                          onChange={(e) => setNewAssessment({ ...newAssessment, totalMarks: parseInt(e.target.value) })}
                        />
                      </div>
                      <div>
                        <Label htmlFor="passingMarks">Passing Marks</Label>
                        <Input
                          id="passingMarks"
                          type="number"
                          value={newAssessment.passingMarks}
                          onChange={(e) => setNewAssessment({ ...newAssessment, passingMarks: parseInt(e.target.value) })}
                        />
                      </div>
                      <div>
                        <Label htmlFor="questions">Questions</Label>
                        <Input
                          id="questions"
                          type="number"
                          value={newAssessment.questions}
                          onChange={(e) => setNewAssessment({ ...newAssessment, questions: parseInt(e.target.value) })}
                        />
                      </div>
                    </div>
                    
                    {/* Google Drive Link Section */}
                    <div className="border-t pt-4">
                      <div className="flex items-center space-x-2 mb-4">
                        <input
                          type="checkbox"
                          id="isDriveQuiz"
                          checked={newAssessment.isDriveQuiz}
                          onChange={(e) => setNewAssessment({ ...newAssessment, isDriveQuiz: e.target.checked })}
                          className="rounded"
                        />
                        <Label htmlFor="isDriveQuiz" className="text-xs sm:text-sm font-medium">
                          This is a Google Drive Quiz/Exam
                        </Label>
                      </div>
                      
                      {newAssessment.isDriveQuiz && (
                        <div>
                          <Label htmlFor="driveLink">Google Drive Link</Label>
                          <Input
                            id="driveLink"
                            value={newAssessment.driveLink}
                            onChange={(e) => setNewAssessment({ ...newAssessment, driveLink: e.target.value })}
                            placeholder="https://drive.google.com/file/d/..."
                            className="mt-1"
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            Paste the Google Drive link for the quiz/exam document
                          </p>
                        </div>
                      )}
                    </div>
                    <div className="flex justify-end space-x-2">
                      <Button variant="outline" onClick={() => setIsAssessmentDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleCreateAssessment} className="bg-sky-600 hover:bg-sky-700">
                        Create Assessment
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {/* Search and Filter */}
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-3 h-3 sm:w-4 sm:h-4" />
                  <Input
                    placeholder="Search assessments..."
                    className="px-0 pl-10 sm:pl-11"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Select value={filterSubject} onValueChange={setFilterSubject}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Filter by subject" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Subjects</SelectItem>
                    {teacher?.subjects?.map(subject => (
                      <SelectItem key={subject.id || subject._id} value={subject.name}>
                        {subject.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {assessments.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-sky-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <BarChart3 className="w-6 h-6 sm:w-7 sm:h-7 lg:w-8 lg:h-8 text-sky-600" />
                </div>
                <h3 className="text-base sm:text-lg font-semibold text-sky-900 mb-2">No Assessments Yet</h3>
                <p className="text-sky-600 mb-4">Create your first assessment for your assigned subjects.</p>
                <Button 
                  onClick={() => setIsAssessmentDialogOpen(true)}
                  className="bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white"
                >
                  <Plus className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
                  Create Your First Assessment
                </Button>
              </div>
            ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:p-4 lg:p-6">
                {assessments
                  .filter(assessment => {
                    const matchesSearch = assessment.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                         (assessment.description || '').toLowerCase().includes(searchTerm.toLowerCase());
                    const matchesSubject = filterSubject === 'all' || assessment.subject === filterSubject;
                    return matchesSearch && matchesSubject;
                  })
                  .map(assessment => (
                  <Card key={assessment.id} className="bg-white shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-base sm:text-lg font-semibold text-gray-900 line-clamp-2">
                            {assessment.title}
                          </CardTitle>
                          <p className="text-xs sm:text-sm text-gray-600 mt-1">{assessment.description || assessment.subject || ''}</p>
                        </div>
                        <div className="flex flex-col space-y-1 ml-2">
                          <Badge variant="secondary" className="bg-gray-100 text-gray-600 text-xs">
                            {assessment.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                          <Badge 
                            variant="outline" 
                            className={`text-xs ${
                              assessment.difficulty === 'beginner' ? 'bg-green-100 text-green-800 border-green-200' :
                              assessment.difficulty === 'intermediate' ? 'bg-yellow-100 text-yellow-800 border-yellow-200' :
                              'bg-red-100 text-red-800 border-red-200'
                            }`}
                          >
                            {assessment.difficulty}
                          </Badge>
                        </div>
                      </div>
                  </CardHeader>
                    
                    <CardContent className="pt-0">
                      {/* Assessment Details */}
                      <div className="flex items-center justify-between text-xs sm:text-sm text-gray-500 mb-4">
                        <div className="flex items-center space-x-4">
                          <div className="flex items-center">
                            <Clock className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                            <span>{assessment.duration}min</span>
                      </div>
                          <div className="flex items-center">
                            <FileText className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                            <span>Q</span>
                      </div>
                          <div className="flex items-center">
                            <Users className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                            <span>attempts</span>
                      </div>
                    </div>
                      </div>
                      
                      {/* Total Marks and Passing */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                        <div>
                          <span className="text-xs sm:text-sm text-gray-600">Total Marks:</span>
                          <span className="ml-2 text-xs sm:text-sm font-medium">{assessment.totalPoints || 0}</span>
                        </div>
                        <div>
                          <span className="text-xs sm:text-sm text-gray-600">Passing:</span>
                          <span className="ml-2 text-xs sm:text-sm font-medium">{Math.floor((assessment.totalPoints || 0) * 0.6)}</span>
                        </div>
                      </div>
                      
                      {/* Google Drive Integration */}
                      {assessment.driveLink && (
                        <div className="mb-3 p-2 bg-blue-50 rounded-lg">
                          <div className="flex items-center space-x-2">
                            <div className="w-3 h-3 sm:w-4 sm:h-4 bg-blue-500 rounded"></div>
                            <span className="text-xs sm:text-sm text-blue-700">Google Drive Document</span>
                          </div>
                          <div className="mt-1 flex items-center space-x-2">
                            <span className="text-xs text-gray-600">{assessment.title}</span>
                            <Button size="sm" variant="outline" className="text-xs h-6">
                              Download
                            </Button>
                            <Button size="sm" variant="outline" className="text-xs h-6">
                              Open
                            </Button>
                          </div>
                        </div>
                      )}
                      
                      {/* Programming Environment */}
                      {assessment.programmingLink && (
                        <div className="mb-3 p-2 bg-green-50 rounded-lg">
                          <div className="flex items-center justify-between">
                            <span className="text-xs sm:text-sm text-green-700">Programiz Online Java Compiler</span>
                            <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white text-xs h-6">
                              Programiz PRO
                            </Button>
                          </div>
                        </div>
                      )}
                      
                      {/* Action Buttons */}
                      <div className="flex items-center justify-between">
                    <div className="flex space-x-2">
                          <Button size="sm" variant="outline" className="p-2">
                            <Edit className="w-3 h-3 sm:w-4 sm:h-4" />
                      </Button>
                          <Button size="sm" variant="outline" className="p-2">
                            <Play className="w-3 h-3 sm:w-4 sm:h-4" />
                          </Button>
                          <Button size="sm" variant="outline" className="p-2 text-red-600 hover:bg-red-50">
                            <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
                          </Button>
                        </div>
                        <Button size="sm" variant="outline" className="flex items-center space-x-1">
                          <Eye className="w-3 h-3 sm:w-4 sm:h-4" />
                          <span>View</span>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Edit Video Dialog */}
      <Dialog open={isEditVideoDialogOpen} onOpenChange={setIsEditVideoDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Video</DialogTitle>
            <DialogDescription>
              Update video details, metadata, and settings.
            </DialogDescription>
          </DialogHeader>
          {editingVideo && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-title">Video Title</Label>
                <Input
                  id="edit-title"
                  value={editingVideo.title}
                  onChange={(e) => setEditingVideo({ ...editingVideo, title: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="edit-description">Description</Label>
                <Textarea
                  id="edit-description"
                  value={editingVideo.description || ''}
                  onChange={(e) => setEditingVideo({ ...editingVideo, description: e.target.value })}
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-subject">Subject</Label>
                  <Select value={editingVideo.subject} onValueChange={(value) => setEditingVideo({ ...editingVideo, subject: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {teacher?.subjects?.length && teacher.subjects.length > 0 ? (
                        teacher.subjects
                          .filter(subject => subject.name)
                          .map(subject => (
                            <SelectItem key={subject.id || subject._id} value={subject.name || 'unknown'}>
                              {subject.name}
                            </SelectItem>
                          ))
                      ) : (
                        <SelectItem value="no-subjects" disabled>No subjects assigned</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="edit-duration">Duration (minutes)</Label>
                  <Input
                    id="edit-duration"
                    type="number"
                    value={editingVideo.duration}
                    onChange={(e) => setEditingVideo({ ...editingVideo, duration: parseInt(e.target.value) })}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="edit-videoUrl">Video URL</Label>
                <Input
                  id="edit-videoUrl"
                  value={editingVideo.videoUrl || editingVideo.url || ''}
                  onChange={(e) => setEditingVideo({ ...editingVideo, videoUrl: e.target.value })}
                />
              </div>
              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setIsEditVideoDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={() => handleEditVideo(editingVideo)} className="bg-sky-600 hover:bg-sky-700">
                  Update Video
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TeacherDashboard;
