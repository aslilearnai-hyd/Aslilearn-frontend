import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { 
  Plus, 
  Edit, 
  Trash2, 
  Eye,
  Clock,
  Users,
  BookOpen,
  Play,
  Pause,
  CheckCircle,
  AlertCircle,
  Search,
  Filter,
  Download,
  Upload,
  FileText,
  Target,
  TrendingUp,
  ExternalLink
} from 'lucide-react';
import DriveViewer from '@/components/drive-viewer';
import { useConfirm } from '@/hooks/use-confirm';

interface Assessment {
  id: string;
  title: string;
  description: string;
  subject: string;
  type: 'quiz' | 'exam' | 'assignment' | 'project';
  difficulty: 'easy' | 'medium' | 'hard';
  duration: number; // in minutes
  totalMarks: number;
  passingMarks: number;
  questions: number;
  driveLink?: string;
  isDriveQuiz?: boolean;
  isActive: boolean;
  attempts: number;
  createdAt: string;
  updatedAt: string;
}

const TeacherAssessmentManagement = () => {
  const { confirm, ConfirmDialog } = useConfirm();
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSubject, setFilterSubject] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingAssessment, setEditingAssessment] = useState<Assessment | null>(null);

  const [newAssessment, setNewAssessment] = useState({
    title: '',
    description: '',
    subject: '',
    type: 'quiz' as 'quiz' | 'exam' | 'assignment' | 'project',
    difficulty: 'medium' as 'easy' | 'medium' | 'hard',
    duration: 60,
    totalMarks: 100,
    passingMarks: 50,
    questions: 20,
    driveLink: '',
    isDriveQuiz: false
  });

  useEffect(() => {
    fetchAssessments();
    fetchSubjects();
  }, []);

  const fetchSubjects = async () => {
    try {
      const response = await fetch('/api/teacher/subjects');
      if (response.ok) {
        const data = await response.json();
        setSubjects(data.subjects || []);
      }
    } catch (error) {
      console.error('Failed to fetch subjects:', error);
    }
  };

  const fetchAssessments = async () => {
    try {
      const response = await fetch('/api/teacher/assessments');
      if (response.ok) {
      const data = await response.json();
      setAssessments(data);
      } else {
        // Mock data for development
        setAssessments([
          {
            id: '1',
            title: 'Mathematics Midterm Exam',
            description: 'Comprehensive mathematics assessment covering algebra and geometry',
            subject: 'Mathematics',
            type: 'exam',
            difficulty: 'medium',
            duration: 120,
            totalMarks: 100,
            passingMarks: 60,
            questions: 30,
            isActive: true,
            attempts: 45,
            createdAt: '2024-01-15',
            updatedAt: '2024-01-15'
          },
          {
            id: '2',
            title: 'Physics Lab Assignment',
            description: 'Practical physics experiments and calculations',
            subject: 'Physics',
            type: 'assignment',
            difficulty: 'hard',
            duration: 180,
            totalMarks: 150,
            passingMarks: 90,
            questions: 15,
            isActive: true,
            attempts: 28,
            createdAt: '2024-01-14',
            updatedAt: '2024-01-14'
          },
          {
            id: '3',
            title: 'English Grammar Quiz',
            description: 'Basic grammar rules and sentence structure',
            subject: 'English',
            type: 'quiz',
            difficulty: 'easy',
            duration: 30,
            totalMarks: 50,
            passingMarks: 30,
            questions: 25,
            isActive: false,
            attempts: 67,
            createdAt: '2024-01-13',
            updatedAt: '2024-01-13'
          }
        ]);
      }
    } catch (error) {
      console.error('Failed to fetch assessments:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAssessment = async () => {
    try {
      const response = await fetch('/api/teacher/assessments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(newAssessment),
      });

      if (response.ok) {
        const createdAssessment = await response.json();
        setAssessments([...assessments, createdAssessment]);
        setIsCreateDialogOpen(false);
        setNewAssessment({
          title: '',
          description: '',
          subject: '',
          type: 'quiz',
          difficulty: 'medium',
          duration: 60,
          totalMarks: 100,
          passingMarks: 50,
          questions: 20,
          driveLink: '',
          isDriveQuiz: false
        });
      }
    } catch (error) {
      console.error('Failed to create assessment:', error);
    }
  };

  const handleEditAssessment = async (assessment: Assessment) => {
    try {
      const response = await fetch(`/api/teacher/assessments/${assessment.id}`, {
          method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(assessment),
      });

      if (response.ok) {
        const updatedAssessment = await response.json();
        setAssessments(assessments.map(a => a.id === assessment.id ? updatedAssessment : a));
        setIsEditDialogOpen(false);
        setEditingAssessment(null);
      }
    } catch (error) {
      console.error('Failed to update assessment:', error);
    }
  };

  const handleDeleteAssessment = async (assessmentId: string) => {
    const ok = await confirm({
      title: 'Delete this assessment?',
      description: 'Are you sure you want to delete this assessment?',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    try {
      const response = await fetch(`/api/teacher/assessments/${assessmentId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (response.ok) {
        setAssessments(assessments.filter(a => a.id !== assessmentId));
      }
    } catch (error) {
      console.error('Failed to delete assessment:', error);
    }
  };

  const toggleAssessmentStatus = async (assessment: Assessment) => {
    try {
      const response = await fetch(`/api/teacher/assessments/${assessment.id}/toggle`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ isActive: !assessment.isActive }),
      });

      if (response.ok) {
        const updatedAssessment = await response.json();
        setAssessments(assessments.map(a => a.id === assessment.id ? updatedAssessment : a));
      }
    } catch (error) {
      console.error('Failed to toggle assessment status:', error);
    }
  };

  const filteredAssessments = assessments.filter(assessment => {
    const matchesSearch = assessment.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         assessment.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSubject = filterSubject === 'all' || assessment.subject === filterSubject;
    const matchesType = filterType === 'all' || assessment.type === filterType;
    return matchesSearch && matchesSubject && matchesType;
  });

  const types = ['quiz', 'exam', 'assignment', 'project'];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 sm:w-7 sm:h-7 lg:w-8 lg:h-8 border-4 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-4 lg:space-y-6">
      {ConfirmDialog}
      {/* Header */}
          <div className="flex items-center justify-between">
            <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Assessment Management</h2>
          <p className="text-gray-600">Create and manage assessments, exams, and assignments</p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
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
                      {subjects.map(subject => (
                        <SelectItem key={subject._id} value={subject.name}>{subject.name}</SelectItem>
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
                  <Select value={newAssessment.difficulty} onValueChange={(value: 'easy' | 'medium' | 'hard') => setNewAssessment({ ...newAssessment, difficulty: value })}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                      <SelectItem value="easy">Easy</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="hard">Hard</SelectItem>
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
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
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

      {/* Filters */}
      <div className="flex items-center space-x-4">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-3 h-3 sm:w-4 sm:h-4" />
            <Input
              placeholder="Search assessments..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="px-0 pl-10 sm:pl-11"
            />
          </div>
        </div>
        <Select value={filterSubject} onValueChange={setFilterSubject}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filter by subject" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Subjects</SelectItem>
            {subjects.map(subject => (
              <SelectItem key={subject._id} value={subject.name}>{subject.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {types.map(type => (
              <SelectItem key={type} value={type}>{type.charAt(0).toUpperCase() + type.slice(1)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Assessments Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:p-4 lg:p-6">
        {filteredAssessments.map((assessment) => (
          <motion.div
            key={assessment.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Card className="hover:shadow-lg transition-shadow duration-200">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-base sm:text-lg font-semibold text-gray-900 line-clamp-2">
                      {assessment.title}
                    </CardTitle>
                    <p className="text-xs sm:text-sm text-gray-600 mt-1">{assessment.subject}</p>
                  </div>
                  <div className="flex flex-col space-y-1">
                    <Badge 
                      variant={assessment.isActive ? "default" : "secondary"}
                      className={assessment.isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}
                    >
                      {assessment.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                    <Badge 
                      variant="outline"
                      className={
                        assessment.difficulty === 'easy' ? 'border-green-200 text-green-800' :
                        assessment.difficulty === 'medium' ? 'border-yellow-200 text-yellow-800' :
                        'border-red-200 text-red-800'
                      }
                    >
                    {assessment.difficulty}
                  </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-xs sm:text-sm text-gray-600 line-clamp-2">{assessment.description}</p>
                
                <div className="flex items-center justify-between text-xs sm:text-sm text-gray-500">
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center">
                      <Clock className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                      {assessment.duration}min
                    </div>
                    <div className="flex items-center">
                      <BookOpen className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                      {assessment.questions} Q
                    </div>
                    <div className="flex items-center">
                      <Users className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                      {assessment.attempts} attempts
                  </div>
                  </div>
                  <Badge variant="outline" className="border-blue-200 text-blue-800">
                    {assessment.type}
                  </Badge>
                </div>

                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="flex justify-between text-xs sm:text-sm">
                    <span>Total Marks: {assessment.totalMarks}</span>
                    <span>Passing: {assessment.passingMarks}</span>
                  </div>
                </div>

                {/* Google Drive Preview */}
                {assessment.isDriveQuiz && assessment.driveLink && (
                  <div className="mt-3">
                    <div className="flex items-center space-x-2 mb-2">
                      <ExternalLink className="w-3 h-3 sm:w-4 sm:h-4 text-blue-600" />
                      <span className="text-xs sm:text-sm font-medium text-blue-600">Google Drive Document</span>
                    </div>
                    <div className="h-32 rounded-lg overflow-hidden border border-gray-200">
                      <DriveViewer 
                        driveUrl={assessment.driveLink}
                        title={assessment.title}
                        className="h-full"
                      />
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between pt-2">
                  <div className="flex space-x-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditingAssessment(assessment);
                        setIsEditDialogOpen(true);
                      }}
                    >
                      <Edit className="w-3 h-3 sm:w-4 sm:h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => toggleAssessmentStatus(assessment)}
                    >
                      {assessment.isActive ? <Pause className="w-3 h-3 sm:w-4 sm:h-4" /> : <Play className="w-3 h-3 sm:w-4 sm:h-4" />}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDeleteAssessment(assessment.id)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
                    </Button>
                  </div>
                  <Button size="sm" variant="outline">
                    <Eye className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                    View
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Assessment</DialogTitle>
            <DialogDescription>
              Update assessment details, settings, and requirements.
            </DialogDescription>
          </DialogHeader>
          {editingAssessment && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-title">Assessment Title</Label>
                <Input
                  id="edit-title"
                  value={editingAssessment.title}
                  onChange={(e) => setEditingAssessment({ ...editingAssessment, title: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="edit-description">Description</Label>
                <Textarea
                  id="edit-description"
                  value={editingAssessment.description}
                  onChange={(e) => setEditingAssessment({ ...editingAssessment, description: e.target.value })}
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-subject">Subject</Label>
                  <Select value={editingAssessment.subject} onValueChange={(value) => setEditingAssessment({ ...editingAssessment, subject: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {subjects.map(subject => (
                        <SelectItem key={subject._id} value={subject.name}>{subject.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="edit-type">Type</Label>
                  <Select value={editingAssessment.type} onValueChange={(value: 'quiz' | 'exam' | 'assignment' | 'project') => setEditingAssessment({ ...editingAssessment, type: value })}>
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
                  <Label htmlFor="edit-difficulty">Difficulty</Label>
                  <Select value={editingAssessment.difficulty} onValueChange={(value: 'easy' | 'medium' | 'hard') => setEditingAssessment({ ...editingAssessment, difficulty: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="easy">Easy</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="hard">Hard</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="edit-duration">Duration (minutes)</Label>
                  <Input
                    id="edit-duration"
                    type="number"
                    value={editingAssessment.duration}
                    onChange={(e) => setEditingAssessment({ ...editingAssessment, duration: parseInt(e.target.value) })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="edit-totalMarks">Total Marks</Label>
                  <Input
                    id="edit-totalMarks"
                    type="number"
                    value={editingAssessment.totalMarks}
                    onChange={(e) => setEditingAssessment({ ...editingAssessment, totalMarks: parseInt(e.target.value) })}
                  />
                </div>
                <div>
                  <Label htmlFor="edit-passingMarks">Passing Marks</Label>
                  <Input
                    id="edit-passingMarks"
                    type="number"
                    value={editingAssessment.passingMarks}
                    onChange={(e) => setEditingAssessment({ ...editingAssessment, passingMarks: parseInt(e.target.value) })}
                  />
                </div>
                <div>
                  <Label htmlFor="edit-questions">Questions</Label>
                  <Input
                    id="edit-questions"
                    type="number"
                    value={editingAssessment.questions}
                    onChange={(e) => setEditingAssessment({ ...editingAssessment, questions: parseInt(e.target.value) })}
                  />
                </div>
              </div>
              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={() => handleEditAssessment(editingAssessment)} className="bg-sky-600 hover:bg-sky-700">
                  Update Assessment
                </Button>
              </div>
            </div>
      )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TeacherAssessmentManagement;
