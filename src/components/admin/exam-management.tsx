import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { API_BASE_URL } from '@/lib/api-config';
import { useToast } from '@/hooks/use-toast';
import { useConfirm } from '@/hooks/use-confirm';
import { getAuthToken } from '@/lib/auth-utils';
import {
  Plus, 
  Edit, 
  Trash2, 
  Calendar, 
  Clock, 
  Users, 
  BookOpen, 
  Image as ImageIcon,
  Upload,
  Save,
  X,
  MoreHorizontal,
  Eye,
  Settings
} from 'lucide-react';

interface Exam {
  _id: string;
  title: string;
  description: string;
  examType: 'weekend' | 'mains' | 'advanced' | 'practice';
  duration: number;
  totalQuestions: number;
  totalMarks: number;
  instructions: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  questions: Question[];
  createdAt: string;
}

interface Question {
  id?: string;
  _id: string;
  questionText: string;
  questionImage?: string;
  questionType: 'mcq' | 'multiple' | 'integer';
  options?: Array<{ text: string; isCorrect: boolean }>;
  correctAnswer: string | number | string[];
  marks: number;
  negativeMarks: number;
  explanation: string;
  subject: 'maths' | 'physics' | 'chemistry';
}

const ExamManagement = () => {
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const notify = (message: string, variant: 'default' | 'destructive' = 'default') => {
    toast({
      title: variant === 'destructive' ? 'Error' : 'Notice',
      description: message,
      variant,
    });
  };
  const [exams, setExams] = useState<Exam[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExamDialogOpen, setIsExamDialogOpen] = useState(false);
  const [isQuestionDialogOpen, setIsQuestionDialogOpen] = useState(false);
  const [editingExam, setEditingExam] = useState<Exam | null>(null);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null);
  const [uploadedImage, setUploadedImage] = useState<string>('');

  // Exam form state
  const [examForm, setExamForm] = useState({
    title: '',
    description: '',
    examType: 'weekend' as 'weekend' | 'mains' | 'advanced' | 'practice',
    duration: 60,
    totalQuestions: 0,
    totalMarks: 0,
    instructions: '',
    startDate: '',
    endDate: ''
  });

  // Question form state
  const [questionForm, setQuestionForm] = useState({
    questionText: '',
    questionImage: '',
    questionType: 'mcq' as 'mcq' | 'multiple' | 'integer',
    options: [{ text: '', isCorrect: false }],
    correctAnswer: '',
    marks: 1,
    negativeMarks: 0,
    explanation: '',
    subject: 'maths' as 'maths' | 'physics' | 'chemistry'
  });

  useEffect(() => {
    checkAuthAndFetchExams();
  }, []);

  const checkAuthAndFetchExams = async () => {
    try {
      // Check if user is authenticated
      const token = getAuthToken();
      const authResponse = await fetch(`${API_BASE_URL}/api/auth/me`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!authResponse.ok) {
        console.log('Not authenticated, redirecting to login');
        window.location.href = '/signin';
        return;
      }
      
      const authData = await authResponse.json();
      if (!authData.user || authData.user.role !== 'admin') {
        console.log('Not an admin user, redirecting to login');
        window.location.href = '/signin';
        return;
      }
      
      // If authenticated, fetch exams
      await fetchExams();
    } catch (error) {
      console.error('Auth check failed:', error);
      window.location.href = '/signin';
    }
  };

  const fetchExams = async () => {
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE_URL}/api/admin/exams`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      if (response.ok) {
        const data = await response.json();
        setExams(data.data || data || []);
      } else {
        console.error('Failed to fetch exams:', response.status);
        setExams([]);
      }
    } catch (error) {
      console.error('Failed to fetch exams:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchQuestions = async (examId: string) => {
    try {
      console.log('Fetching questions for exam ID:', examId);
      const token = getAuthToken();
      const response = await fetch(`${API_BASE_URL}/api/admin/exams/${examId}/questions`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      console.log('Response status:', response.status);
      if (response.ok) {
        const data = await response.json();
        console.log('Questions data:', data);
        setQuestions(data.data || data); // Handle both response formats
      } else if (response.status === 401) {
        console.error('Unauthorized - redirecting to login');
        notify('Session expired. Please login again.');
        window.location.href = '/signin';
      } else {
        const errorData = await response.json();
        console.error('Failed to fetch questions:', errorData);
        notify(`Failed to fetch questions: ${errorData.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to fetch questions:', error);
      notify('Failed to fetch questions. Please check the console for details.');
    }
  };

  const handleCreateExam = async () => {
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE_URL}/api/admin/exams`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(examForm)
      });

      if (response.ok) {
        await fetchExams();
        setIsExamDialogOpen(false);
        resetExamForm();
      }
    } catch (error) {
      console.error('Failed to create exam:', error);
    }
  };

  const handleUpdateExam = async () => {
    if (!editingExam) return;

    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE_URL}/api/admin/exams/${editingExam._id}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(examForm)
      });

      if (response.ok) {
        await fetchExams();
        setIsExamDialogOpen(false);
        setEditingExam(null);
        resetExamForm();
      }
    } catch (error) {
      console.error('Failed to update exam:', error);
    }
  };

  const handleDeleteExam = async (examId: string) => {
    const ok = await confirm({
      title: 'Delete this exam?',
      description: 'This action cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;

    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE_URL}/api/admin/exams/${examId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        await fetchExams();
      }
    } catch (error) {
      console.error('Failed to delete exam:', error);
    }
  };

  const handleCreateQuestion = async () => {
    if (!selectedExam) return;

    // Validate that either question text or image is provided
    if (!questionForm.questionText.trim() && !questionForm.questionImage) {
      notify('Please provide either question text or upload an image.');
      return;
    }

    // Set marks and negative marks based on exam type
    let marks = questionForm.marks;
    let negativeMarks = questionForm.negativeMarks;

    if (selectedExam.examType === 'mains') {
      marks = 4;
      negativeMarks = 1;
    } else if (selectedExam.examType === 'advanced') {
      marks = 3;
      negativeMarks = 1;
    }

    const questionData = {
      ...questionForm,
      marks,
      negativeMarks
    };

    try {
      console.log('Creating question for exam:', selectedExam._id);
      console.log('Question data:', questionData);
      
      const token = getAuthToken();
      const response = await fetch(`${API_BASE_URL}/api/admin/exams/${selectedExam._id}/questions`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(questionData)
      });

      console.log('Response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('Question created successfully:', data);
        await fetchQuestions(selectedExam._id);
        setIsQuestionDialogOpen(false);
        resetQuestionForm();
        notify('Question created successfully!');
      } else if (response.status === 401) {
        console.error('Unauthorized - redirecting to login');
        notify('Session expired. Please login again.');
        window.location.href = '/signin';
      } else {
        const errorData = await response.json();
        console.error('Failed to create question:', errorData);
        notify(`Failed to create question: ${errorData.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to create question:', error);
      notify('Failed to create question. Please check the console for details.');
    }
  };

  const handleUpdateQuestion = async () => {
    if (!editingQuestion) return;

    // Validate that either question text or image is provided
    if (!questionForm.questionText.trim() && !questionForm.questionImage) {
      notify('Please provide either question text or upload an image.');
      return;
    }

    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE_URL}/api/admin/questions/${editingQuestion._id}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(questionForm)
      });

      if (response.ok) {
        await fetchQuestions(selectedExam?._id || '');
        setIsQuestionDialogOpen(false);
        setEditingQuestion(null);
        resetQuestionForm();
      }
    } catch (error) {
      console.error('Failed to update question:', error);
    }
  };

  const handleDeleteQuestion = async (questionId: string) => {
    const ok = await confirm({
      title: 'Delete this question?',
      description: 'This action cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;

    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE_URL}/api/admin/questions/${questionId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok && selectedExam) {
        await fetchQuestions(selectedExam._id);
      }
    } catch (error) {
      console.error('Failed to delete question:', error);
    }
  };

  const handleImageUpload = async (file: File) => {
    const formData = new FormData();
    formData.append('image', file);

    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE_URL}/api/admin/upload-question-image`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (response.ok) {
        const data = await response.json();
        setUploadedImage(data.imageUrl);
        setQuestionForm(prev => ({ ...prev, questionImage: data.imageUrl }));
      }
    } catch (error) {
      console.error('Failed to upload image:', error);
    }
  };

  const resetExamForm = () => {
    setExamForm({
      title: '',
      description: '',
      examType: 'weekend',
      duration: 60,
      totalQuestions: 0,
      totalMarks: 0,
      instructions: '',
      startDate: '',
      endDate: ''
    });
  };

  const resetQuestionForm = () => {
    setQuestionForm({
      questionText: '',
      questionImage: '',
      questionType: 'mcq',
      options: [{ text: '', isCorrect: false }],
      correctAnswer: '',
      marks: 1,
      negativeMarks: 0,
      explanation: '',
      subject: 'maths'
    });
    setUploadedImage('');
  };

  const openExamDialog = (exam?: Exam) => {
    if (exam) {
      setEditingExam(exam);
      setExamForm({
        title: exam.title,
        description: exam.description,
        examType: exam.examType,
        duration: exam.duration,
        totalQuestions: exam.totalQuestions,
        totalMarks: exam.totalMarks,
        instructions: exam.instructions,
        startDate: exam.startDate.split('T')[0],
        endDate: exam.endDate.split('T')[0]
      });
    } else {
      resetExamForm();
    }
    setIsExamDialogOpen(true);
  };

  const openQuestionDialog = (question?: Question) => {
    if (question) {
      setEditingQuestion(question);
      setQuestionForm({
        questionText: question.questionText,
        questionImage: question.questionImage || '',
        questionType: question.questionType,
        options: question.options || [{ text: '', isCorrect: false }],
        correctAnswer: Array.isArray(question.correctAnswer) 
          ? question.correctAnswer.join(',') 
          : question.correctAnswer.toString(),
        marks: question.marks,
        negativeMarks: question.negativeMarks,
        explanation: question.explanation,
        subject: question.subject as 'maths' | 'physics' | 'chemistry' || 'maths'
      });
      setUploadedImage(question.questionImage || '');
    } else {
      resetQuestionForm();
    }
    setIsQuestionDialogOpen(true);
  };

  const addOption = () => {
    setQuestionForm(prev => ({
      ...prev,
      options: [...prev.options, { text: '', isCorrect: false }]
    }));
  };

  const removeOption = (index: number) => {
    setQuestionForm(prev => ({
      ...prev,
      options: prev.options.filter((_, i) => i !== index)
    }));
  };

  const updateOption = (index: number, field: 'text' | 'isCorrect', value: string | boolean) => {
    setQuestionForm(prev => ({
      ...prev,
      options: prev.options.map((option, i) => 
        i === index ? { ...option, [field]: value } : option
      )
    }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-base sm:text-lg">Loading exams...</div>
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-4 lg:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 break-words">Weekend Exam Management</h2>
          <p className="text-gray-600 text-sm sm:text-base break-words">Create and manage weekend exams and questions</p>
        </div>
        <Button onClick={() => openExamDialog()} className="w-full sm:w-auto shrink-0 bg-blue-600 hover:bg-blue-700">
          <Plus className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
          Create Exam
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 sm:p-4 lg:p-6">
        <Card>
          <CardContent className="p-3 sm:p-4 lg:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm font-medium text-gray-600">Total Exams</p>
                <p className="text-xl sm:text-2xl font-bold text-gray-900">{Array.isArray(exams) ? exams.length : 0}</p>
              </div>
              <BookOpen className="w-6 h-6 sm:w-7 sm:h-7 lg:w-8 lg:h-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3 sm:p-4 lg:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm font-medium text-gray-600">Active Exams</p>
                <p className="text-xl sm:text-2xl font-bold text-gray-900">
                  {Array.isArray(exams) ? exams.filter(exam => exam.isActive).length : 0}
                </p>
              </div>
              <Calendar className="w-6 h-6 sm:w-7 sm:h-7 lg:w-8 lg:h-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3 sm:p-4 lg:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm font-medium text-gray-600">Total Questions</p>
                <p className="text-xl sm:text-2xl font-bold text-gray-900">
                  {Array.isArray(exams) ? exams.reduce((total, exam) => total + (exam.questions?.length || 0), 0) : 0}
                </p>
              </div>
              <Users className="w-6 h-6 sm:w-7 sm:h-7 lg:w-8 lg:h-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3 sm:p-4 lg:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm font-medium text-gray-600">Total Marks</p>
                <p className="text-xl sm:text-2xl font-bold text-gray-900">
                  {Array.isArray(exams) ? exams.reduce((total, exam) => total + (exam.totalMarks || 0), 0) : 0}
                </p>
              </div>
              <Clock className="w-6 h-6 sm:w-7 sm:h-7 lg:w-8 lg:h-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="exams" className="space-y-3 sm:space-y-4 lg:space-y-6">
        <TabsList className="grid w-full grid-cols-1 sm:grid-cols-2 bg-gray-100 p-1 rounded-lg">
          <TabsTrigger 
            value="exams" 
            className="text-base sm:text-lg font-semibold py-3 px-3 sm:px-4 lg:px-6 data-[state=active]:bg-blue-600 data-[state=active]:text-white"
          >
            📋 EXAMS
          </TabsTrigger>
          <TabsTrigger 
            value="questions" 
            className="text-base sm:text-lg font-semibold py-3 px-3 sm:px-4 lg:px-6 data-[state=active]:bg-green-600 data-[state=active]:text-white"
          >
            ❓ QUESTIONS
          </TabsTrigger>
        </TabsList>

        <TabsContent value="exams">
          <Card>
            <CardHeader>
              <CardTitle>All Exams</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto -mx-1 px-1">
              <Table className="min-w-[640px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Questions</TableHead>
                    <TableHead>Marks</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Array.isArray(exams) ? exams.map((exam) => (
                    <TableRow key={exam._id}>
                      <TableCell className="font-medium break-words max-w-[220px]">{exam.title}</TableCell>
                      <TableCell>
                        <Badge variant={exam.examType === 'weekend' ? 'default' : 'secondary'}>
                          {exam.examType}
                        </Badge>
                      </TableCell>
                      <TableCell>{exam.duration} min</TableCell>
                      <TableCell>{exam.totalQuestions}</TableCell>
                      <TableCell>{exam.totalMarks}</TableCell>
                      <TableCell>
                        <Badge variant={exam.isActive ? 'default' : 'destructive'}>
                          {exam.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="h-6 w-6 sm:h-7 sm:w-7 lg:h-8 lg:w-8 p-0">
                              <MoreHorizontal className="h-3 w-3 sm:h-4 sm:w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedExam(exam);
                                fetchQuestions(exam._id);
                              }}
                              className="text-green-700"
                            >
                              <BookOpen className="mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                              Manage Questions
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => openExamDialog(exam)}
                              className="text-blue-700"
                            >
                              <Edit className="mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                              Edit Exam
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => handleDeleteExam(exam._id)}
                              className="text-red-700"
                            >
                              <Trash2 className="mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                              Delete Exam
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  )) : (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-4 sm:py-6 lg:py-8 text-gray-500">
                        No exams found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="questions">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
                <CardTitle className="text-xl sm:text-2xl font-bold break-words min-w-0">
                  Questions {selectedExam && `- ${selectedExam.title}`}
                </CardTitle>
                {selectedExam && (
                  <Button 
                    onClick={() => openQuestionDialog()}
                    className="bg-green-600 hover:bg-green-700 text-white px-3 sm:px-4 lg:px-6 py-3 text-base sm:text-lg font-semibold"
                    size="lg"
                  >
                    <Plus className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 mr-3" />
                    + ADD NEW QUESTION
                  </Button>
                )}
              </div>
              {selectedExam && (
                <div className="mt-6 p-3 sm:p-4 lg:p-6 bg-gradient-to-r from-blue-50 to-green-50 rounded-xl border-2 border-blue-200">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-lg sm:text-xl font-bold text-blue-900">📝 QUESTION CREATION GUIDE</h4>
                    <div className="text-base sm:text-lg font-semibold text-green-600">
                      {selectedExam.examType === 'mains' ? 'MAINS EXAM (+4/-1)' : 
                       selectedExam.examType === 'advanced' ? 'ADVANCED EXAM (+3/-1)' : 
                       'CUSTOM SCORING'}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:p-4 lg:p-6">
                    <div className="bg-white p-4 rounded-lg border border-blue-200">
                      <h5 className="font-bold text-blue-800 mb-3 text-base sm:text-lg">🎯 Question Types</h5>
                      <div className="space-y-2 text-sm sm:text-base">
                        <div className="flex items-center space-x-2">
                          <span className="w-3 h-3 bg-blue-500 rounded-full"></span>
                          <span><strong>MCQ (Single Choice):</strong> One correct answer</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="w-3 h-3 bg-green-500 rounded-full"></span>
                          <span><strong>Multiple Choice:</strong> Multiple correct answers</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="w-3 h-3 bg-purple-500 rounded-full"></span>
                          <span><strong>Integer Type:</strong> Numerical answers</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="bg-white p-4 rounded-lg border border-green-200">
                      <h5 className="font-bold text-green-800 mb-3 text-base sm:text-lg">⚡ Scoring System</h5>
                      <div className="space-y-2 text-sm sm:text-base">
                        <div className="flex items-center space-x-2">
                          <span className="w-3 h-3 bg-red-500 rounded-full"></span>
                          <span><strong>Mains Exam:</strong> +4 correct, -1 wrong</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="w-3 h-3 bg-orange-500 rounded-full"></span>
                          <span><strong>Advanced Exam:</strong> +3 correct, -1 wrong</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="w-3 h-3 bg-gray-500 rounded-full"></span>
                          <span><strong>Other Exams:</strong> Custom marks</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-4 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                    <h5 className="font-bold text-yellow-800 mb-2 text-base sm:text-lg">🚀 Advanced Features</h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-sm sm:text-base">
                      <div className="flex items-center space-x-2">
                        <span className="text-xl sm:text-2xl">🖼️</span>
                        <span>Image Upload</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xl sm:text-2xl">📊</span>
                        <span>Difficulty Levels</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xl sm:text-2xl">📚</span>
                        <span>Subject Tags</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xl sm:text-2xl">💡</span>
                        <span>Explanations</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardHeader>
            <CardContent>
              {selectedExam ? (
                <div className="overflow-x-auto -mx-1 px-1">
                <Table className="min-w-[640px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Question</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>Marks</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {questions && questions.length > 0 ? questions.map((question) => (
                      <TableRow key={question._id || question.id || Math.random()}>
                        <TableCell className="max-w-xs break-words whitespace-normal">
                          {question.questionText || 'No question text'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{question.questionType || 'Unknown'}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={
                            question.subject === 'maths' ? 'default' :
                            question.subject === 'physics' ? 'secondary' : 'destructive'
                          }>
                            {question.subject ? question.subject.charAt(0).toUpperCase() + question.subject.slice(1) : 'Unknown'}
                          </Badge>
                        </TableCell>
                        <TableCell>{question.marks || 0}</TableCell>
                        <TableCell>
                          <div className="flex space-x-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openQuestionDialog(question)}
                            >
                              <Edit className="w-3 h-3 sm:w-4 sm:h-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                               onClick={() => handleDeleteQuestion(question._id || question.id || '')}
                            >
                              <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )) : (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-4 sm:py-6 lg:py-8 text-gray-500">
                          No questions found for this exam
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
                </div>
              ) : (
                <div className="text-center py-16">
                  <div className="bg-gradient-to-r from-yellow-50 to-orange-50 rounded-2xl p-4 sm:p-6 lg:p-8 border-2 border-yellow-200">
                    <div className="text-3xl sm:text-5xl lg:text-6xl mb-4">📚</div>
                    <h3 className="text-xl sm:text-2xl font-bold text-gray-800 mb-4">No Exam Selected</h3>
                    <p className="text-base sm:text-lg text-gray-600 mb-6">
                      To create and manage questions, you need to select an exam first.
                    </p>
                    <div className="bg-white p-4 rounded-lg border border-yellow-300">
                      <h4 className="font-bold text-gray-800 mb-2">📋 How to Select an Exam:</h4>
                      <ol className="text-left text-gray-700 space-y-2">
                        <li>1. Go to the <strong>"Exams"</strong> tab above</li>
                        <li>2. Find your exam in the table</li>
                        <li>3. Click the <strong>📖 book icon</strong> in the Actions column</li>
                        <li>4. Come back to this "Questions" tab</li>
                        <li>5. Click <strong>"+ ADD NEW QUESTION"</strong> button</li>
                      </ol>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Exam Dialog */}
      <Dialog open={isExamDialogOpen} onOpenChange={setIsExamDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingExam ? 'Edit Exam' : 'Create New Exam'}
            </DialogTitle>
            <DialogDescription>
              {editingExam ? 'Update exam details' : 'Fill in the exam information'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={examForm.title}
                  onChange={(e) => setExamForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Enter exam title"
                />
              </div>
              <div>
                <Label htmlFor="examType">Exam Type</Label>
                <Select
                  value={examForm.examType}
                  onValueChange={(value: 'weekend' | 'mains' | 'advanced' | 'practice') => setExamForm(prev => ({ ...prev, examType: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekend">Weekend Exam</SelectItem>
                    <SelectItem value="mains">Mains Exam (+4/-1)</SelectItem>
                    <SelectItem value="advanced">Advanced Exam (+3/-1)</SelectItem>
                    <SelectItem value="practice">Practice Test</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={examForm.description}
                onChange={(e) => setExamForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Enter exam description"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="duration">Duration (minutes)</Label>
                <Input
                  id="duration"
                  type="number"
                  value={examForm.duration}
                  onChange={(e) => setExamForm(prev => ({ ...prev, duration: parseInt(e.target.value) }))}
                />
              </div>
              <div>
                <Label htmlFor="totalQuestions">Total Questions</Label>
                <Input
                  id="totalQuestions"
                  type="number"
                  value={examForm.totalQuestions}
                  onChange={(e) => setExamForm(prev => ({ ...prev, totalQuestions: parseInt(e.target.value) }))}
                />
              </div>
              <div>
                <Label htmlFor="totalMarks">Total Marks</Label>
                <Input
                  id="totalMarks"
                  type="number"
                  value={examForm.totalMarks}
                  onChange={(e) => setExamForm(prev => ({ ...prev, totalMarks: parseInt(e.target.value) }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:items-start">
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor="startDate" className="text-sm font-semibold leading-none">
                  Start Date
                </Label>
                <Input
                  id="startDate"
                  type="datetime-local"
                  className="asli-date-input !h-11 !min-h-[2.75rem] py-1.5 text-base"
                  value={examForm.startDate}
                  onChange={(e) => setExamForm(prev => ({ ...prev, startDate: e.target.value }))}
                />
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor="endDate" className="text-sm font-semibold leading-none">
                  End Date
                </Label>
                <Input
                  id="endDate"
                  type="datetime-local"
                  className="asli-date-input !h-11 !min-h-[2.75rem] py-1.5 text-base"
                  value={examForm.endDate}
                  onChange={(e) => setExamForm(prev => ({ ...prev, endDate: e.target.value }))}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="instructions">Instructions</Label>
              <Textarea
                id="instructions"
                value={examForm.instructions}
                onChange={(e) => setExamForm(prev => ({ ...prev, instructions: e.target.value }))}
                placeholder="Enter exam instructions"
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsExamDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={editingExam ? handleUpdateExam : handleCreateExam}>
              {editingExam ? 'Update' : 'Create'} Exam
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Question Dialog */}
      <Dialog open={isQuestionDialogOpen} onOpenChange={setIsQuestionDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingQuestion ? 'Edit Question' : 'Add New Question'}
            </DialogTitle>
            <DialogDescription>
              {editingQuestion ? 'Update question details' : 'Create a new question for the exam'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="questionText">Question Text *</Label>
              <Textarea
                id="questionText"
                value={questionForm.questionText}
                onChange={(e) => setQuestionForm(prev => ({ ...prev, questionText: e.target.value }))}
                placeholder="Enter the question"
                rows={3}
              />
            </div>

            <div>
              <Label htmlFor="questionImage">Question Image *</Label>
              <p className="text-xs sm:text-sm text-gray-600 mb-2">Either question text or image is required</p>
              <div className="flex items-center space-x-2">
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleImageUpload(file);
                  }}
                />
                {uploadedImage && (
                  <div className="flex items-center space-x-2">
                    <img src={uploadedImage} alt="Question" className="w-16 h-16 object-cover rounded" />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setUploadedImage('');
                        setQuestionForm(prev => ({ ...prev, questionImage: '' }));
                      }}
                    >
                      <X className="w-3 h-3 sm:w-4 sm:h-4" />
                    </Button>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="questionType">Question Type</Label>
                <Select
                  value={questionForm.questionType}
                  onValueChange={(value: 'mcq' | 'multiple' | 'integer') => 
                    setQuestionForm(prev => ({ ...prev, questionType: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mcq">Single Choice (MCQ)</SelectItem>
                    <SelectItem value="multiple">Multiple Choice</SelectItem>
                    <SelectItem value="integer">Integer Type</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="subject">Subject</Label>
                <Select
                  value={questionForm.subject}
                  onValueChange={(value: 'maths' | 'physics' | 'chemistry') => 
                    setQuestionForm(prev => ({ ...prev, subject: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="maths">Maths</SelectItem>
                    <SelectItem value="physics">Physics</SelectItem>
                    <SelectItem value="chemistry">Chemistry</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="marks">Marks</Label>
                <Input
                  id="marks"
                  type="number"
                  value={
                    selectedExam?.examType === 'mains' ? 4 :
                    selectedExam?.examType === 'advanced' ? 3 :
                    questionForm.marks
                  }
                  onChange={(e) => setQuestionForm(prev => ({ ...prev, marks: parseInt(e.target.value) }))}
                  disabled={selectedExam?.examType === 'mains' || selectedExam?.examType === 'advanced'}
                />
                {selectedExam?.examType === 'mains' && (
                  <p className="text-xs text-blue-600 mt-1">Mains Exam: +4 marks for correct answer</p>
                )}
                {selectedExam?.examType === 'advanced' && (
                  <p className="text-xs text-blue-600 mt-1">Advanced Exam: +3 marks for correct answer</p>
                )}
              </div>
              <div>
                <Label htmlFor="negativeMarks">Negative Marks</Label>
                <Input
                  id="negativeMarks"
                  type="number"
                  step="0.25"
                  value={
                    selectedExam?.examType === 'mains' ? 1 :
                    selectedExam?.examType === 'advanced' ? 1 :
                    questionForm.negativeMarks
                  }
                  onChange={(e) => setQuestionForm(prev => ({ ...prev, negativeMarks: parseFloat(e.target.value) }))}
                  disabled={selectedExam?.examType === 'mains' || selectedExam?.examType === 'advanced'}
                />
                {(selectedExam?.examType === 'mains' || selectedExam?.examType === 'advanced') && (
                  <p className="text-xs text-red-600 mt-1">-1 mark for wrong answer</p>
                )}
              </div>
            </div>

            {/* Options for MCQ and Multiple Choice */}
            {(questionForm.questionType === 'mcq' || questionForm.questionType === 'multiple') && (
              <div>
                <div className="flex justify-between items-center mb-2">
                  <Label>Options</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addOption}>
                    <Plus className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                    Add Option
                  </Button>
                </div>
                {questionForm.options.map((option, index) => (
                  <div key={index} className="flex items-center space-x-2 mb-2">
                    <Input
                      value={option.text}
                      onChange={(e) => updateOption(index, 'text', e.target.value)}
                      placeholder={`Option ${index + 1}`}
                    />
                    <label className="flex items-center space-x-1">
                      <input
                        type="checkbox"
                        checked={option.isCorrect}
                        onChange={(e) => updateOption(index, 'isCorrect', e.target.checked)}
                      />
                      <span className="text-xs sm:text-sm">Correct</span>
                    </label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => removeOption(index)}
                    >
                      <X className="w-3 h-3 sm:w-4 sm:h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Correct Answer for Integer Type */}
            {questionForm.questionType === 'integer' && (
              <div>
                <Label htmlFor="correctAnswer">Correct Answer</Label>
                <Input
                  id="correctAnswer"
                  type="number"
                  value={questionForm.correctAnswer}
                  onChange={(e) => setQuestionForm(prev => ({ ...prev, correctAnswer: e.target.value }))}
                  placeholder="Enter the correct integer answer"
                />
              </div>
            )}

            <div>
              <Label htmlFor="explanation">Explanation (Optional)</Label>
              <Textarea
                id="explanation"
                value={questionForm.explanation}
                onChange={(e) => setQuestionForm(prev => ({ ...prev, explanation: e.target.value }))}
                placeholder="Enter explanation for the answer"
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsQuestionDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={editingQuestion ? handleUpdateQuestion : handleCreateQuestion}>
              {editingQuestion ? 'Update' : 'Create'} Question
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {ConfirmDialog}
    </div>
  );
};

export default ExamManagement;
