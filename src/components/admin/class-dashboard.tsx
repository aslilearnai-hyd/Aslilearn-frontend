import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { API_BASE_URL, apiFetch } from '@/lib/api-config';
import { useToast } from '@/hooks/use-toast';
import { useConfirm } from '@/hooks/use-confirm';
import { getAuthToken } from '@/lib/auth-utils';
import {
  GraduationCap, 
  Users, 
  BookOpen, 
  Plus, 
  Search, 
  Filter,
  Trash2,
  Pencil,
  AlertTriangle,
  UserPlus,
  Clock,
  Target,
  TrendingUp,
  BarChart3,
  ChevronDown,
  ChevronUp,
  ArrowUp,
  CheckCircle2,
  Loader2,
  Eye,
  Brain
} from 'lucide-react';
import { StudentRiskAnalysisModal } from './StudentRiskAnalysisModal';
import { Trophy } from 'lucide-react';
import { AdminPageHero, AdminStatGrid, AdminFooterBanner, adminBtn } from './ui/AdminUiKit';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { formatSeatUsage, useAccountSeats } from '@/hooks/use-account-seats';

interface Student {
  id: string;
  name: string;
  email: string;
  classNumber: string;
  phone?: string;
  status: 'active' | 'inactive' | 'completed';
  createdAt: string;
  lastLogin?: string;
}

interface Teacher {
  id: string;
  name: string;
  email: string;
}

interface Class {
  id: string;
  name: string;
  description: string;
  classNumber: string;
  section?: string;
  assignedSubjects?: Array<{
    _id: string;
    id: string;
    name: string;
    description?: string;
    code?: string;
    board?: string;
  }>;
  subject: string;
  grade: string;
  teacher: string;
  teachers?: Teacher[];
  schedule: string;
  room: string;
  studentCount: number;
  students: Student[];
  createdAt: string;
}

interface SubjectClassRef {
  id: string;
  classNumber?: string;
  section?: string;
}

interface Subject {
  _id: string;
  id: string;
  name: string;
  code?: string;
  description?: string;
  board: string;
  classNumber?: string;
  variantIds?: string[];
  classes?: SubjectClassRef[];
}

const normalizeClassNumber = (value: string) =>
  String(value || '')
    .replace(/^class\s*/i, '')
    .trim();

const ClassDashboard = () => {
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const { seats } = useAccountSeats();
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('all');
  const [isAddClassDialogOpen, setIsAddClassDialogOpen] = useState(false);
  const [isEditClassDialogOpen, setIsEditClassDialogOpen] = useState(false);
  const [editingClassId, setEditingClassId] = useState<string | null>(null);
  const [isSavingClass, setIsSavingClass] = useState(false);
  const [isAddStudentDialogOpen, setIsAddStudentDialogOpen] = useState(false);
  const [isDeleteAllDialogOpen, setIsDeleteAllDialogOpen] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [pendingDeleteClassId, setPendingDeleteClassId] = useState<string | null>(null);
  const [isDeletingClass, setIsDeletingClass] = useState(false);
  const [selectedClass, setSelectedClass] = useState<Class | null>(null);
  const [expandedClassId, setExpandedClassId] = useState<string | null>(null);
  const [expandedTeachersClassId, setExpandedTeachersClassId] = useState<string | null>(null);
  const [newClass, setNewClass] = useState({
    classNumber: '',
    section: '',
    description: ''
  });
  const [editClass, setEditClass] = useState({
    classNumber: '',
    section: '',
    description: ''
  });
  const [isCustomSection, setIsCustomSection] = useState(false);
  const [customSectionLetter, setCustomSectionLetter] = useState('');
  const [isEditCustomSection, setIsEditCustomSection] = useState(false);
  const [editCustomSectionLetter, setEditCustomSectionLetter] = useState('');

  const resetAddClassForm = () => {
    setNewClass({ classNumber: '', section: '', description: '' });
    setIsCustomSection(false);
    setCustomSectionLetter('');
  };

  const resetEditClassForm = () => {
    setEditClass({ classNumber: '', section: '', description: '' });
    setIsEditCustomSection(false);
    setEditCustomSectionLetter('');
    setEditingClassId(null);
  };

  const openEditClassDialog = (classItem: Class) => {
    const section = String(classItem.section || '').toUpperCase();
    const knownSections = ['A', 'B', 'C'];
    const isKnown = knownSections.includes(section);
    setEditingClassId(classItem.id);
    setEditClass({
      classNumber: String(classItem.classNumber || ''),
      section: isKnown ? section : '',
      description: classItem.description || '',
    });
    setIsEditCustomSection(!isKnown && !!section);
    setEditCustomSectionLetter(isKnown ? '' : section);
    setIsEditClassDialogOpen(true);
  };
  const [selectedClassesForPromotion, setSelectedClassesForPromotion] = useState<Set<string>>(new Set());
  const [isPromoting, setIsPromoting] = useState(false);
  const [selectedStudentForAnalysis, setSelectedStudentForAnalysis] = useState<Student | null>(null);
  const [isStudentAnalysisDialogOpen, setIsStudentAnalysisDialogOpen] = useState(false);
  const [studentAnalysis, setStudentAnalysis] = useState<any>(null);
  const [isLoadingAnalysis, setIsLoadingAnalysis] = useState(false);
  const [isAIRiskAnalysisModalOpen, setIsAIRiskAnalysisModalOpen] = useState(false);
  const [selectedStudentForAIRisk, setSelectedStudentForAIRisk] = useState<Student | null>(null);

  useEffect(() => {
    fetchClasses();
    fetchSubjects();
    const onSubjectsUpdated = () => {
      fetchClasses();
      fetchSubjects();
    };
    window.addEventListener('subjectsUpdated', onSubjectsUpdated);
    return () => window.removeEventListener('subjectsUpdated', onSubjectsUpdated);
  }, []);

  const fetchSubjects = async () => {
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE_URL}/api/admin/subjects?includeCatalog=true`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        const subjectsArray = Array.isArray(data) ? data : (data.data || []);
        setSubjects(
          subjectsArray
            .map((subject: any) => ({
              _id: subject._id || subject.id,
              id: subject._id || subject.id,
              name: String(subject.name || '').split('__deleted__')[0].trim(),
              code: subject.code,
              description: subject.description,
              board: subject.board,
              classNumber: subject.classNumber,
              variantIds: Array.isArray(subject.variantIds)
                ? subject.variantIds.map(String)
                : [String(subject._id || subject.id)],
              classes: Array.isArray(subject.classes)
                ? subject.classes.map((c: any) => ({
                    id: String(c.id || c._id || ''),
                    classNumber: c.classNumber,
                    section: c.section,
                  }))
                : [],
            }))
            .sort((a: any, b: any) =>
              String(a.name || '').localeCompare(String(b.name || ''), undefined, {
                sensitivity: 'base',
                numeric: true,
              }),
            ),
        );
      }
    } catch (error) {
      console.error('Failed to fetch subjects:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch subjects',
        variant: 'destructive'
      });
    }
  };

  const fetchStudents = async () => {
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE_URL}/api/admin/users`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!Array.isArray(data)) {
        console.error('Expected array but got:', data);
        throw new Error('Invalid data format received from server');
      }
      
      // Note: Students are already included in classes data from backend
      // This function is kept for potential future use
    } catch (error) {
      console.error('Failed to fetch students:', error);
      // Note: Students are fetched as part of classes data
    }
  };

  const handleViewStudentAnalysis = async (student: Student) => {
    setSelectedStudentForAnalysis(student);
    setIsStudentAnalysisDialogOpen(true);
    setIsLoadingAnalysis(true);
    setStudentAnalysis(null); // Reset previous analysis
    
    try {
      const token = getAuthToken();
      const studentId = student.id;
      
      if (!studentId) {
        console.error('Student ID is missing');
        setIsLoadingAnalysis(false);
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/admin/students/${studentId}/analytics`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setStudentAnalysis(data);
      } else if (response.status === 404) {
        // 404 means no analytics data exists yet - this is not an error, just no data
        setStudentAnalysis(null);
        // Don't show error toast for 404 - it's expected for new students
      } else {
        // Only show error for actual server errors (500, 503, etc.)
        console.error('Failed to fetch student analysis:', response.status, response.statusText);
        toast({
          title: 'Error',
          description: 'Failed to fetch student analysis. Please try again later.',
          variant: 'destructive'
        });
      }
    } catch (error) {
      // Only show error toast for network errors or unexpected errors
      console.error('Failed to fetch student analysis:', error);
      toast({
        title: 'Error',
        description: 'Network error. Please check your connection and try again.',
        variant: 'destructive'
      });
    } finally {
      setIsLoadingAnalysis(false);
    }
  };

  const fetchClasses = async () => {
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE_URL}/api/admin/classes`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const responseData = await response.json();
      
      // Handle different response formats
      let data = responseData;
      if (responseData && Array.isArray(responseData.data)) {
        data = responseData.data;
      } else if (responseData && Array.isArray(responseData)) {
        data = responseData;
      } else {
        console.error('Expected array but got:', responseData);
        throw new Error('Invalid data format received from server');
      }
      
      setClasses(data);
    } catch (error) {
      console.error('Failed to fetch classes:', error);
      // Set mock data for development
      setClasses([
        {
          id: '10A',
          name: 'Class 10A',
          classNumber: '10',
          description: 'Grade 10 Section A',
          subject: 'General',
          grade: '10',
          teacher: 'Ms. Sarah Wilson',
          schedule: 'Mon-Fri 9:00 AM - 3:00 PM',
          room: 'Room 101',
          studentCount: 2,
          students: [],
          createdAt: new Date().toISOString()
        },
        {
          id: '12B',
          name: 'Class 12B',
          classNumber: '12',
          description: 'Grade 12 Section B',
          subject: 'General',
          grade: '12',
          teacher: 'Mr. David Brown',
          schedule: 'Mon-Fri 10:00 AM - 4:00 PM',
          room: 'Room 201',
          studentCount: 1,
          students: [],
          createdAt: new Date().toISOString()
        }
      ]);
    }
  };

  const handleAddClass = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const sectionValue = isCustomSection
      ? customSectionLetter.trim().toUpperCase()
      : newClass.section.trim();

    if (!newClass.classNumber || !sectionValue) {
      toast({
        title: 'Missing fields',
        description: isCustomSection
          ? 'Please fill in Class Number and enter a section letter.'
          : 'Please fill in all required fields: Class Number and Section.',
        variant: 'destructive',
      });
      return;
    }

    if (isCustomSection && !/^[A-Z0-9]{1,3}$/i.test(sectionValue)) {
      toast({
        title: 'Invalid section',
        description: 'Section must be 1–3 letters or numbers (e.g. D, E1).',
        variant: 'destructive',
      });
      return;
    }
    
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE_URL}/api/admin/classes`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          classNumber: newClass.classNumber.trim(),
          section: sectionValue,
          description: newClass.description.trim()
        })
      });

      const responseData = await response.json();
      
      if (response.ok && responseData.success !== false) {
        resetAddClassForm();
        setIsAddClassDialogOpen(false);
        fetchClasses();
        toast({
          title: 'Success',
          description: 'Class created successfully!',
          variant: 'default'
        });
      } else {
        toast({
          title: 'Error',
          description: responseData.message || 'Failed to create class. Please try again.',
          variant: 'destructive'
        });
      }
    } catch (error) {
      console.error('Failed to create class:', error);
      toast({
        title: 'Error',
        description: 'Failed to create class. Please try again.',
        variant: 'destructive'
      });
    }
  };

  const handleEditClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClassId) return;

    const sectionValue = isEditCustomSection
      ? editCustomSectionLetter.trim().toUpperCase()
      : editClass.section.trim().toUpperCase();

    if (!editClass.classNumber || !sectionValue) {
      toast({
        title: 'Missing fields',
        description: isEditCustomSection
          ? 'Please fill in Class Number and enter a section letter.'
          : 'Please fill in all required fields: Class Number and Section.',
        variant: 'destructive',
      });
      return;
    }

    if (!/^[A-Z0-9]{1,3}$/i.test(sectionValue)) {
      toast({
        title: 'Invalid section',
        description: 'Section must be 1–3 letters or numbers (e.g. D, E1).',
        variant: 'destructive',
      });
      return;
    }

    setIsSavingClass(true);
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE_URL}/api/admin/classes/${editingClassId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          classNumber: editClass.classNumber.trim(),
          section: sectionValue,
          description: editClass.description.trim(),
        }),
      });

      const responseData = await response.json();

      if (response.ok && responseData.success !== false) {
        resetEditClassForm();
        setIsEditClassDialogOpen(false);
        fetchClasses();
        toast({
          title: 'Success',
          description: 'Class updated successfully!',
          variant: 'default',
        });
      } else {
        toast({
          title: 'Error',
          description: responseData.message || 'Failed to update class. Please try again.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Failed to update class:', error);
      toast({
        title: 'Error',
        description: 'Failed to update class. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSavingClass(false);
    }
  };

  const handleDeleteClass = async (classId: string) => {
    setIsDeletingClass(true);
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE_URL}/api/admin/classes/${classId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const responseData = await response.json();

      if (response.ok && responseData.success !== false) {
        setPendingDeleteClassId(null);
        fetchClasses();
        toast({
          title: 'Success',
          description: 'Class deleted successfully!',
          variant: 'default'
        });
      } else {
        toast({
          title: 'Error',
          description: responseData.message || 'Failed to delete class. Please try again.',
          variant: 'destructive'
        });
      }
    } catch (error) {
      console.error('Failed to delete class:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete class. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setIsDeletingClass(false);
    }
  };

  const handleDeleteAllClasses = async () => {
    setIsDeletingAll(true);
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE_URL}/api/admin/classes/delete-all`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const responseData = await response.json();

      if (response.ok && responseData.success !== false) {
        fetchClasses();
        setIsDeleteAllDialogOpen(false);
        toast({
          title: 'Success',
          description: `All ${classes.length} classes deleted successfully!`,
          variant: 'default'
        });
      } else {
        toast({
          title: 'Error',
          description: responseData.message || 'Failed to delete all classes. Please try again.',
          variant: 'destructive'
        });
      }
    } catch (error) {
      console.error('Failed to delete all classes:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete all classes. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setIsDeletingAll(false);
    }
  };

  const handlePromoteClasses = async () => {
    if (selectedClassesForPromotion.size === 0) {
      toast({
        title: 'No Classes Selected',
        description: 'Please select at least one class to promote.',
        variant: 'destructive'
      });
      return;
    }

    const classIds = Array.from(selectedClassesForPromotion);
    const classesToPromote = classes.filter(c => classIds.includes(c.id));
    
    // Show confirmation with details
    const promotionDetails = classesToPromote.map(c => {
      // Handle both positive and negative class numbers
      const cleanClassNum = c.classNumber.replace(/[^-\d]/g, '');
      const currentClassNum = parseInt(cleanClassNum);
      const absClassNum = Math.abs(currentClassNum);
      const willBeFinished = absClassNum === 12;
      // Calculate next class number (same logic as backend)
      let nextClassNum;
      if (absClassNum === 11) {
        nextClassNum = 12;
      } else if (absClassNum < 11) {
        nextClassNum = absClassNum + 1;
      } else {
        nextClassNum = absClassNum + 1; // Should not reach here
      }
      return `Class ${c.classNumber}${c.section ? c.section : ''} → ${willBeFinished ? 'Finished Academic Career' : `Class ${nextClassNum}${c.section ? c.section : ''}`}`;
    }).join('\n');

    const ok = await confirm({
      title: `Promote ${classIds.length} class(es)?`,
      description: `${promotionDetails}\n\nThis action cannot be undone.`,
      confirmLabel: 'Promote',
      destructive: true,
    });
    if (!ok) {
      return;
    }

    setIsPromoting(true);
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE_URL}/api/admin/classes/promote`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          classIds: classIds
        })
      });

      const responseData = await response.json();

      if (response.ok && responseData.success !== false) {
        fetchClasses();
        setSelectedClassesForPromotion(new Set());
        const moved = Number(responseData.studentsMoved || 0);
        toast({
          title: 'Classes promoted',
          description:
            responseData.message ||
            `Promoted ${responseData.promotedCount || classIds.length} class(es). ${moved} student(s) moved — open Students → All classes (or the new grade / Finished) to see them.`,
          variant: 'default'
        });
      } else {
        toast({
          title: 'Error',
          description: responseData.message || 'Failed to promote classes. Please try again.',
          variant: 'destructive'
        });
      }
    } catch (error) {
      console.error('Failed to promote classes:', error);
      toast({
        title: 'Error',
        description: 'Failed to promote classes. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setIsPromoting(false);
    }
  };

  const handleClassCardClick = (classId: string) => {
    // If clicking the same class, collapse it
    if (expandedClassId === classId) {
      setExpandedClassId(null);
    } else {
      // Expand the clicked class and collapse any previously expanded class
      setExpandedClassId(classId);
    }
  };

  const handleTeachersDropdownToggle = (classId: string) => {
    setExpandedTeachersClassId((prev) => (prev === classId ? null : classId));
  };

  /** One spelling per subject: "Maths", "maths" and "Mathematics" are the same. */
  const canonicalSubjectKey = (value: string) => {
    const t = String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
    if (t === 'mathematics' || t === 'math') return 'maths';
    if (t === 'social studies') return 'social science';
    return t;
  };

  const plainSubjectLabel = (rawName: string) => {
    const raw = String(rawName || '').trim().replace(/\s+/g, ' ');
    if (!raw) return '';
    return raw.replace(/_\d+$/, '').trim() || raw;
  };

  const isIitTrackSubjectLabel = (label: string) =>
    /\sIIT$/i.test(String(label || '').trim()) || /\bIIT\b/i.test(String(label || ''));

  /** Standard subjects first (A–Z), then IIT track subjects (A–Z). */
  const compareSubjectFilterLabels = (a: string, b: string) => {
    const aIit = isIitTrackSubjectLabel(a);
    const bIit = isIitTrackSubjectLabel(b);
    if (aIit !== bIit) return aIit ? 1 : -1;
    return a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });
  };

  /** Individual subject labels for a class — catalog by class number, then saved links. */
  const collectClassSubjectLabels = (classItem: Class): string[] => {
    const labels: string[] = [];
    const seen = new Set<string>();
    const pushLabel = (raw: string) => {
      const label = plainSubjectLabel(raw);
      if (!label) return;
      const key = canonicalSubjectKey(label);
      if (seen.has(key)) return;
      seen.add(key);
      labels.push(label);
    };

    const classNum = normalizeClassNumber(classItem.classNumber);
    for (const subj of subjects) {
      const subjClass = normalizeClassNumber(
        String((subj as { classNumber?: string }).classNumber || ''),
      );
      const nameHasClass = new RegExp(`_${classNum}$`).test(String(subj.name || ''));
      if ((classNum && subjClass === classNum) || (classNum && nameHasClass)) {
        pushLabel(subj.name || subj.code || '');
      }
    }

    for (const subj of classItem.assignedSubjects || []) {
      pushLabel(subj.name || subj.code || '');
    }

    if (labels.length === 0) {
      const raw = String(classItem.subject || '').trim();
      if (raw && raw !== 'General') {
        for (const part of raw.split(',')) {
          pushLabel(part);
        }
      }
    }
    return labels;
  };

  const classHasSubject = (classItem: Class, subjectLabel: string) => {
    const targetKey = canonicalSubjectKey(subjectLabel);
    return collectClassSubjectLabels(classItem).some(
      (label) => canonicalSubjectKey(label) === targetKey,
    );
  };

  const filteredClasses = classes.filter(classItem => {
    const subjectLabels = collectClassSubjectLabels(classItem);
    const subjectSearchBlob = [
      ...subjectLabels,
      String(classItem.subject || ''),
    ]
      .join(' ')
      .toLowerCase();
    const matchesSearch =
      classItem.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      subjectSearchBlob.includes(searchTerm.toLowerCase()) ||
      classItem.teacher.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSubject =
      selectedSubject === 'all' || classHasSubject(classItem, selectedSubject);
    return matchesSearch && matchesSubject;
  });

  /**
   * Filter dropdown: school subject catalog order (core first, IIT tracks last).
   * Only subjects that appear on at least one class.
   */
  const classSubjects = (() => {
    const onClassKeys = new Set<string>();
    for (const classItem of classes) {
      for (const label of collectClassSubjectLabels(classItem)) {
        onClassKeys.add(canonicalSubjectKey(label));
      }
    }

    const seen = new Set<string>();
    const fromCatalog = subjects
      .map((s) => plainSubjectLabel(s.name || s.code || ''))
      .filter((label) => {
        if (!label) return false;
        const key = canonicalSubjectKey(label);
        if (!onClassKeys.has(key) || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort(compareSubjectFilterLabels);

    if (fromCatalog.length > 0) return fromCatalog;

    const byKey = new Map<string, string>();
    for (const classItem of classes) {
      for (const label of collectClassSubjectLabels(classItem)) {
        const key = canonicalSubjectKey(label);
        const existing = byKey.get(key);
        if (!existing || (existing === existing.toLowerCase() && label !== label.toLowerCase())) {
          byKey.set(key, label);
        }
      }
    }
    return [...byKey.values()].sort(compareSubjectFilterLabels);
  })();

  const schoolSubjectCount = subjects.length > 0 ? subjects.length : classSubjects.length;

  return (
    <div className="min-h-0 w-full overflow-x-hidden">
      <div className="space-y-4 lg:space-y-5">
        <AdminPageHero
          title="Class"
          highlight="Management"
          subtitle="Organize and manage your classes and students with ease."
          icon={<GraduationCap className="h-10 w-10 lg:h-11 lg:w-11" />}
        />

        <AdminStatGrid
          stats={[
            {
              label: 'Total Classes',
              value: classes.length,
              icon: <GraduationCap className="h-5 w-5" />,
              tone: 'orange',
              footLabel: 'Active classes',
            },
            {
              label: 'Total Students',
              value: classes.reduce((total, cls) => total + cls.studentCount, 0),
              icon: <Users className="h-5 w-5" />,
              tone: 'blue',
              footLabel: 'Enrolled students',
            },
            {
              label: 'Avg. Class Size',
              value:
                classes.length > 0
                  ? Math.round(
                      classes.reduce((total, cls) => total + cls.studentCount, 0) / classes.length,
                    )
                  : 0,
              icon: <BarChart3 className="h-5 w-5" />,
              tone: 'green',
              footLabel: 'Students per class',
            },
            {
              label: 'Subjects',
              value: schoolSubjectCount,
              icon: <Target className="h-5 w-5" />,
              tone: 'purple',
              footLabel: 'Different subjects',
            },
          ]}
        />

        {/* Tabs */}
        <Tabs defaultValue="classes" className="w-full space-y-3 sm:space-y-4 lg:space-y-5">
          <TabsList className="flex h-auto min-h-[3rem] w-full flex-wrap justify-start gap-1.5 rounded-2xl border border-slate-200/80 bg-white p-2 shadow-sm sm:w-full">
            <TabsTrigger
              value="classes"
              className="rounded-2xl px-4 py-2.5 text-sm font-semibold sm:px-6 sm:py-3 sm:text-base data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-pink-500 data-[state=active]:text-white"
            >
              <GraduationCap className="mr-2 h-5 w-5 sm:h-6 sm:w-6" />
              Classes
            </TabsTrigger>
            <TabsTrigger
              value="promote-class"
              className="rounded-2xl px-4 py-2.5 text-sm font-semibold sm:px-6 sm:py-3 sm:text-base data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-pink-500 data-[state=active]:text-white"
            >
              <ArrowUp className="mr-2 h-5 w-5 sm:h-6 sm:w-6" />
              Promote Class
            </TabsTrigger>
          </TabsList>

          <TabsContent value="classes" className="mt-0 space-y-3 sm:space-y-4 lg:space-y-6">
            {/* Action Bar */}
            <div className="w-full bg-white/80 backdrop-blur-xl rounded-3xl p-3 sm:p-4 shadow-xl border border-white/20">
              <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:gap-4 sm:flex-1 min-w-0">
                  <div className="relative w-full sm:w-64 sm:shrink-0">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 w-3 h-3 sm:w-4 sm:h-4" />
                    <Input
                      placeholder="Search classes..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 sm:pl-11 w-full rounded-xl bg-white/70 border-gray-200 text-gray-900 backdrop-blur-sm"
                    />
                  </div>
                  
                  <Select value={selectedSubject} onValueChange={setSelectedSubject}>
                    <SelectTrigger className="w-full sm:w-48 max-w-full rounded-xl bg-white/70 border-gray-200 text-gray-900 backdrop-blur-sm">
                      <SelectValue placeholder="Filter by subject" />
                    </SelectTrigger>
                    <SelectContent className="max-w-[min(100vw-2rem,22rem)]">
                      <SelectItem value="all">All Subjects</SelectItem>
                      {classSubjects.map((subject) => (
                        <SelectItem key={subject} value={subject}>
                          <span className="truncate">{subject}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex w-full flex-wrap gap-3 sm:w-auto sm:shrink-0 sm:justify-end">
                  {classes.length > 0 && (
                    <AlertDialog open={isDeleteAllDialogOpen} onOpenChange={setIsDeleteAllDialogOpen}>
                      <AlertDialogTrigger asChild>
                        <Button 
                          variant="outline"
                          className={cn('flex-1 sm:flex-none', adminBtn.danger)}
                        >
                          <Trash2 className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
                          Delete All
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="bg-white">
                        <AlertDialogHeader>
                          <AlertDialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-red-500" />
                            Delete All Classes?
                          </AlertDialogTitle>
                          <AlertDialogDescription className="text-gray-600">
                            This will permanently delete all {classes.length} classes. This action cannot be undone.
                            <br /><br />
                            <strong className="text-red-600">Are you absolutely sure?</strong>
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel disabled={isDeletingAll}>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={handleDeleteAllClasses}
                            disabled={isDeletingAll}
                            className="bg-red-600 hover:bg-red-700"
                          >
                            {isDeletingAll ? 'Deleting...' : 'Delete All Classes'}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                  <AlertDialog
                    open={Boolean(pendingDeleteClassId)}
                    onOpenChange={(open) => {
                      if (!open && !isDeletingClass) setPendingDeleteClassId(null);
                    }}
                  >
                    <AlertDialogContent className="bg-white">
                      <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-red-500" />
                          Delete this class?
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-gray-600">
                          This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeletingClass}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => pendingDeleteClassId && void handleDeleteClass(pendingDeleteClassId)}
                          disabled={isDeletingClass || !pendingDeleteClassId}
                          className="bg-red-600 hover:bg-red-700"
                        >
                          {isDeletingClass ? 'Deleting...' : 'Delete Class'}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  <Button 
                    onClick={() => setIsAddClassDialogOpen(true)}
                    className="flex-1 sm:flex-none bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white rounded-xl"
                  >
                    <Plus className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
                    Add Class
                  </Button>
                </div>
              </div>
            </div>

            {/* Classes Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 board:grid-cols-4 uhd:grid-cols-5 gap-3 sm:gap-4 lg:gap-6 [&>*]:min-w-0">
          {filteredClasses.length > 0 ? (
            filteredClasses.map((classItem, index) => {
              const isExpanded = expandedClassId === classItem.id;
              const teacherCount = classItem.teachers?.length || 0;
              return (
              <motion.div
                key={classItem.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className={`group relative min-w-0 overflow-hidden bg-white/80 backdrop-blur-xl rounded-3xl shadow-xl hover:shadow-2xl transition-all duration-300 border ${
                  isExpanded ? 'border-sky-400 border-2' : 'border-white/20'
                }`}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-sky-400/10 to-blue-500/10 backdrop-blur-sm"></div>
                <div className="relative z-10 p-3 sm:p-4 lg:p-6 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-4 min-w-0">
                    <div className="flex items-center space-x-3 min-w-0 flex-1">
                      <div className="p-3 bg-white/40 rounded-xl backdrop-blur-sm shrink-0">
                        <GraduationCap className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-sky-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-bold text-sky-900 text-base sm:text-lg break-words">
                          {classItem.name || `Class ${classItem.classNumber}${classItem.section || ''}`}
                        </h3>
                        {classItem.description && (
                          <p className="text-sky-700 text-xs sm:text-sm mt-1 line-clamp-2 break-words">{classItem.description}</p>
                        )}
                      </div>
                    </div>
                    <Badge className="bg-green-100 text-green-800 shrink-0 whitespace-nowrap">Active</Badge>
                  </div>
                  
                  <div className="space-y-3 mb-6">
                    <div className="flex items-center justify-between gap-2 text-xs sm:text-sm min-w-0">
                      <div className="flex items-center text-sky-700 min-w-0">
                        <Users className="w-3 h-3 sm:w-4 sm:h-4 mr-3 text-sky-600 shrink-0" />
                        <span className="shrink-0">Students:</span>
                      </div>
                      <span className="font-medium text-sky-900 shrink-0">{classItem.studentCount || 0}</span>
                    </div>
                    {classItem.teachers && classItem.teachers.length > 0 && (
                      <div className="flex items-start justify-between gap-3 text-xs sm:text-sm min-w-0">
                        <div className="flex items-center text-sky-700 shrink-0">
                          <UserPlus className="w-3 h-3 sm:w-4 sm:h-4 mr-3 text-sky-600 shrink-0" />
                          <span>Teachers:</span>
                        </div>
                        <div className="min-w-0 flex-1 text-right leading-snug">
                          <p className="font-medium text-sky-900 break-words">
                            {teacherCount} on class
                          </p>
                          {seats.licensedTeachers > 0 ? (
                            <p className="text-sky-600 break-words">
                              School {formatSeatUsage(seats.usedTeachers, seats.licensedTeachers)} seats
                            </p>
                          ) : null}
                        </div>
                      </div>
                    )}
                    {(!classItem.teachers || classItem.teachers.length === 0) && (
                      <div className="flex items-start justify-between gap-3 text-xs sm:text-sm min-w-0">
                        <div className="flex items-center text-sky-700 shrink-0">
                          <UserPlus className="w-3 h-3 sm:w-4 sm:h-4 mr-3 text-sky-600 shrink-0" />
                          <span>Teachers:</span>
                        </div>
                        <div className="min-w-0 flex-1 text-right leading-snug">
                          <p className="font-medium text-sky-500 break-words">
                            No teachers assigned
                          </p>
                          {seats.licensedTeachers > 0 ? (
                            <p className="text-sky-600 break-words">
                              School {formatSeatUsage(seats.usedTeachers, seats.licensedTeachers)} seats
                            </p>
                          ) : null}
                        </div>
                      </div>
                    )}
                    <div className="flex items-start justify-between gap-3 text-xs sm:text-sm min-w-0">
                      <div className="flex items-center text-sky-700 shrink-0">
                        <Users className="w-3 h-3 sm:w-4 sm:h-4 mr-3 text-sky-600 shrink-0" />
                        <span>School students:</span>
                      </div>
                      <span className="min-w-0 flex-1 text-right font-medium text-sky-900 leading-snug break-words">
                        {formatSeatUsage(seats.usedStudents, seats.licensedStudents)}
                        {seats.licensedStudents > 0 ? " seats" : ""}
                      </span>
                    </div>
                    {classItem.section && (
                      <div className="flex items-center justify-between gap-2 text-xs sm:text-sm min-w-0">
                        <div className="flex items-center text-sky-700 min-w-0">
                          <GraduationCap className="w-3 h-3 sm:w-4 sm:h-4 mr-3 text-sky-600 shrink-0" />
                          <span className="shrink-0">Section:</span>
                        </div>
                        <span className="font-medium text-sky-900 shrink-0">{classItem.section}</span>
                      </div>
                    )}
                  </div>
                  
                  {/* Teachers List (dropdown) */}
                  {classItem.teachers && classItem.teachers.length > 0 && (
                    <div className="space-y-2 mb-4">
                      <div className="flex items-start justify-between gap-2 mb-1 min-w-0">
                        <h4 className="min-w-0 font-semibold text-sky-900 text-xs sm:text-sm leading-snug">
                          Assigned Teachers ({teacherCount})
                          {seats.licensedTeachers > 0 && (
                            <span className="mt-0.5 block font-medium text-sky-600 break-words">
                              School {formatSeatUsage(seats.usedTeachers, seats.licensedTeachers)} max
                            </span>
                          )}
                        </h4>
                        <Button
                          size="sm"
                          variant="outline"
                          className={cn('text-xs', adminBtn.secondary)}
                          onClick={() => handleTeachersDropdownToggle(classItem.id)}
                        >
                          {expandedTeachersClassId === classItem.id ? (
                            <>
                              <ChevronUp className="w-3 h-3 mr-1" />
                              Hide
                            </>
                          ) : (
                            <>
                              <ChevronDown className="w-3 h-3 mr-1" />
                              View
                            </>
                          )}
                        </Button>
                      </div>
                      <div
                        className={`space-y-2 transition-all duration-300 ${
                          expandedTeachersClassId === classItem.id
                            ? 'max-h-64 overflow-y-auto'
                            : 'max-h-0 overflow-hidden'
                        }`}
                      >
                        {classItem.teachers.map((teacher) => (
                          <div
                            key={teacher.id}
                            className="flex items-center gap-2 min-w-0 bg-sky-50 rounded-lg p-2 hover:bg-sky-100 transition-colors border border-sky-200"
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <div className="w-6 h-6 sm:w-7 sm:h-7 lg:w-8 lg:h-8 shrink-0 bg-gradient-to-br from-sky-400 to-blue-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                                {teacher.name.charAt(0).toUpperCase()}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-xs sm:text-sm font-medium text-sky-900 truncate">
                                  {teacher.name}
                                </p>
                                <p className="text-xs text-sky-600 truncate">{teacher.email}</p>
                              </div>
                            </div>
                            <Badge
                              variant="outline"
                              className="shrink-0 border-sky-300 text-sky-700 bg-sky-100 text-xs whitespace-nowrap"
                            >
                              Teacher
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold text-sky-900 text-xs sm:text-sm">
                        Students List
                        {seats.licensedStudents > 0 && (
                          <span className="ml-1 font-medium text-sky-600">
                            · school {formatSeatUsage(seats.usedStudents, seats.licensedStudents)} max
                          </span>
                        )}
                      </h4>
                      <Button
                        size="sm"
                        variant="outline"
                        className={cn('text-xs', adminBtn.secondary)}
                        onClick={() => handleClassCardClick(classItem.id)}
                      >
                        {isExpanded ? (
                          <>
                            <ChevronUp className="w-3 h-3 mr-1" />
                            Hide
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-3 h-3 mr-1" />
                            View
                          </>
                        )}
                      </Button>
                    </div>
                    <div className={`space-y-1 transition-all duration-300 ${
                      isExpanded ? 'max-h-64 overflow-y-auto' : 'max-h-0 overflow-hidden'
                    }`}>
                      {classItem.students && classItem.students.length > 0 ? (
                        classItem.students.map(student => (
                        <div
                          key={student.id}
                          className="flex flex-col gap-2 min-w-0 sm:flex-row sm:items-center sm:gap-2 bg-white/50 rounded-lg p-2 hover:bg-white/70 transition-colors uhd:flex-col uhd:items-stretch"
                        >
                          <div className="min-w-0 w-full sm:flex-1">
                            <p className="text-xs sm:text-sm font-medium text-sky-900 truncate">{student.name}</p>
                            <p className="text-xs text-sky-600 truncate">{student.email}</p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0 sm:ml-auto uhd:justify-end">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 sm:h-9 sm:w-9 shrink-0 hover:bg-sky-100"
                              onClick={() => handleViewStudentAnalysis(student)}
                              title="View Student Analysis"
                            >
                              <Eye className="w-4 h-4 text-sky-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 sm:h-9 sm:w-9 shrink-0 hover:bg-orange-100"
                              onClick={() => {
                                setSelectedStudentForAIRisk(student);
                                setIsAIRiskAnalysisModalOpen(true);
                              }}
                              title="AI Risk Analysis"
                            >
                              <Brain className="w-4 h-4 text-orange-600" />
                            </Button>
                            <Badge
                              variant="outline"
                              className={`text-xs shrink-0 whitespace-nowrap capitalize ${
                              student.status === 'active' 
                                ? 'border-green-200 text-green-700 bg-green-50' 
                                : 'border-gray-200 text-gray-700 bg-gray-50'
                            }`}>
                              {student.status}
                            </Badge>
                          </div>
                        </div>
                        ))
                      ) : (
                        <div className="text-xs sm:text-sm text-sky-600 text-center py-2">
                          No students assigned to this class
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-sky-200">
                    <Button
                      size="sm"
                      variant="outline"
                      className={adminBtn.secondary}
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditClassDialog(classItem);
                      }}
                    >
                      <Pencil className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                      Edit
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className={adminBtn.danger}
                      onClick={(e) => {
                        e.stopPropagation();
                        setPendingDeleteClassId(classItem.id);
                      }}
                    >
                      <Trash2 className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                      Delete
                    </Button>
                  </div>
                </div>
              </motion.div>
              );
            })
          ) : (
            <div className="col-span-full text-center py-12">
              <GraduationCap className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 text-base sm:text-lg mb-2">No classes found</p>
              <p className="text-gray-500 text-xs sm:text-sm">Create your first class by clicking the "Add Class" button above</p>
            </div>
          )}
          </div>
          </TabsContent>

          <TabsContent value="promote-class" className="mt-0 space-y-3 sm:space-y-4 lg:space-y-6">
            <Card className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-xl border border-white/20">
              <CardHeader>
                <CardTitle className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-green-600 via-emerald-600 to-teal-500 bg-clip-text text-transparent">
                  Promote Classes
                </CardTitle>
                <p className="text-gray-600 mt-2">
                  Promote classes to the next grade. Students stay in your school — they move to the next class
                  (or Finished for Class 12). After promote, open Students and choose <strong>All classes</strong>
                  or the new grade; the old grade filter will be empty on purpose.
                </p>
              </CardHeader>
              <CardContent className="space-y-3 sm:space-y-4 lg:space-y-6">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-start">
                    <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 mr-2 mt-0.5 flex-shrink-0" />
                    <div className="text-xs sm:text-sm text-blue-800">
                      <p className="font-semibold mb-1">Important Notes:</p>
                      <ul className="list-disc list-inside space-y-1">
                        <li>Select classes to promote them to the next grade level</li>
                        <li>Class 1 → 2, Class 2 → 3, … Class 11 → 12</li>
                        <li>Class 12 → Finished (alumni) — students stay visible under filter “Finished”</li>
                        <li>Students are moved, not deleted. Switch Students filter to All classes after promoting</li>
                        <li>If the old class filter looks empty, that is expected — pick the new grade</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <Label className="text-sm sm:text-base font-semibold">Select Classes to Promote</Label>
                  <div className="space-y-4 max-h-96 overflow-y-auto p-2 border border-gray-200 rounded-lg">
                    {(() => {
                      // Group classes by class number
                      const classesByNumber = classes
                        .filter(c => {
                          // Handle both positive and negative class numbers
                          // Extract numeric part (including negative sign)
                          const cleanClassNum = c.classNumber.replace(/[^-\d]/g, '');
                          const classNum = parseInt(cleanClassNum);
                          // Use absolute value to check if it's between 1-12
                          const absClassNum = Math.abs(classNum);
                          // Allow classes from 1-12 (including negative like -10, -11, -12)
                          return !isNaN(classNum) && absClassNum >= 1 && absClassNum <= 12;
                        })
                        .reduce((acc, classItem) => {
                          // Use the original classNumber as key to preserve negative signs
                          const classNum = classItem.classNumber;
                          if (!acc[classNum]) {
                            acc[classNum] = [];
                          }
                          acc[classNum].push(classItem);
                          return acc;
                        }, {} as Record<string, typeof classes>);

                      // Sort class numbers (handle negative numbers)
                      const sortedClassNumbers = Object.keys(classesByNumber).sort((a, b) => {
                        // Clean the class numbers for comparison
                        const cleanA = a.replace(/[^-\d]/g, '');
                        const cleanB = b.replace(/[^-\d]/g, '');
                        const numA = parseInt(cleanA);
                        const numB = parseInt(cleanB);
                        if (!isNaN(numA) && !isNaN(numB)) {
                          return numA - numB;
                        }
                        return a.localeCompare(b);
                      });

                      return sortedClassNumbers.map((classNum) => {
                        const classItems = classesByNumber[classNum].sort((a, b) => {
                          // Sort by section (A, B, C)
                          const sectionA = a.section || '';
                          const sectionB = b.section || '';
                          return sectionA.localeCompare(sectionB);
                        });

                        // Clean class number for calculations
                        const cleanClassNum = classNum.replace(/[^-\d]/g, '');
                        const currentClassNum = parseInt(cleanClassNum);
                        const absClassNum = Math.abs(currentClassNum);
                        // Calculate next class number
                        // - If abs value is 11, promote to 12 (regardless of sign)
                        // - If abs value < 11, promote to abs value + 1 (always positive)
                        let nextClassNum;
                        if (absClassNum === 11) {
                          nextClassNum = 12;
                        } else if (absClassNum < 11) {
                          nextClassNum = absClassNum + 1;
                        } else {
                          nextClassNum = absClassNum + 1; // Should not reach here
                        }
                        const willBeFinished = absClassNum === 12;

                        return (
                          <div key={classNum} className="space-y-2">
                            <div className="flex items-center space-x-2 mb-2">
                              <h4 className="font-semibold text-gray-700">Class {classNum}</h4>
                              <Badge variant="outline" className="text-xs">
                                {classItems.length} section{classItems.length !== 1 ? 's' : ''}
                              </Badge>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 ml-4">
                              {classItems.map((classItem) => {
                                const isSelected = selectedClassesForPromotion.has(classItem.id);
                                
                                return (
                                  <div
                                    key={classItem.id}
                                    className={`p-3 border-2 rounded-lg cursor-pointer transition-all ${
                                      isSelected
                                        ? 'border-green-500 bg-green-50'
                                        : 'border-gray-200 bg-white hover:border-gray-300'
                                    }`}
                                    onClick={() => {
                                      const newSet = new Set(selectedClassesForPromotion);
                                      if (isSelected) {
                                        newSet.delete(classItem.id);
                                      } else {
                                        newSet.add(classItem.id);
                                      }
                                      setSelectedClassesForPromotion(newSet);
                                    }}
                                  >
                                    <div className="flex items-start space-x-2">
                                      <Checkbox
                                        checked={isSelected}
                                        onCheckedChange={(checked) => {
                                          const newSet = new Set(selectedClassesForPromotion);
                                          if (checked) {
                                            newSet.add(classItem.id);
                                          } else {
                                            newSet.delete(classItem.id);
                                          }
                                          setSelectedClassesForPromotion(newSet);
                                        }}
                                      />
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between mb-1">
                                          <span className="font-semibold text-gray-900 text-xs sm:text-sm">
                                            Section {classItem.section || 'N/A'}
                                          </span>
                                          {isSelected && (
                                            <CheckCircle2 className="w-3 h-3 sm:w-4 sm:h-4 text-green-600 flex-shrink-0" />
                                          )}
                                        </div>
                                        <p className="text-xs text-gray-600 mb-1">
                                          {classItem.studentCount || 0} students
                                        </p>
                                        <div className="flex items-center space-x-1 text-xs">
                                          <ArrowUp className="w-3 h-3 text-gray-400" />
                                          <span className="text-gray-500">
                                            {willBeFinished 
                                              ? 'Finished'
                                              : `Class ${nextClassNum}${classItem.section ? classItem.section : ''}`
                                            }
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                  
                  {classes.filter(c => {
                    // Handle both positive and negative class numbers
                    const cleanClassNum = c.classNumber.replace(/[^-\d]/g, '');
                    const classNum = parseInt(cleanClassNum);
                    const absClassNum = Math.abs(classNum);
                    return !isNaN(classNum) && absClassNum >= 1 && absClassNum <= 12;
                  }).length === 0 && (
                    <div className="text-center py-4 sm:py-6 lg:py-8 text-gray-500">
                      <GraduationCap className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                      <p>No classes available for promotion</p>
                      <p className="text-xs sm:text-sm">Classes must be between Class 1 and Class 12</p>
                    </div>
                  )}
                </div>

                <div className="flex justify-end space-x-3 pt-4 border-t">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSelectedClassesForPromotion(new Set());
                    }}
                    disabled={isPromoting || selectedClassesForPromotion.size === 0}
                  >
                    Clear Selection
                  </Button>
                  <Button
                    onClick={handlePromoteClasses}
                    disabled={isPromoting || selectedClassesForPromotion.size === 0}
                    className={adminBtn.primary}
                  >
                    {isPromoting ? (
                      <>
                        <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 mr-2 animate-spin" />
                        Promoting...
                      </>
                    ) : (
                      <>
                        <ArrowUp className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
                        Promote {selectedClassesForPromotion.size} Class{selectedClassesForPromotion.size !== 1 ? 'es' : ''}
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <AdminFooterBanner
          title="Strong classes build strong learners."
          subtitle="Keep creating engaging classrooms where every student can thrive."
          icon={<Trophy className="h-6 w-6" />}
        />

        {/* Add Class Dialog */}
        <Dialog
          open={isAddClassDialogOpen}
          onOpenChange={(open) => {
            setIsAddClassDialogOpen(open);
            if (!open) resetAddClassForm();
          }}
        >
          <DialogContent className="bg-white/90 backdrop-blur-xl border-sky-200">
            <DialogHeader>
              <DialogTitle className="text-sky-900">Add New Class</DialogTitle>
              <DialogDescription>
                Create a new class to organize your students
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAddClass} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="classNumber" className="text-xs sm:text-sm font-medium text-sky-800">
                    Class Number <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="classNumber"
                    value={newClass.classNumber}
                    onChange={(e) => setNewClass({ ...newClass, classNumber: e.target.value })}
                    className="rounded-xl bg-white/70 border-sky-200 text-sky-900 backdrop-blur-sm"
                    required
                    placeholder="e.g., 10, 11, 12"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="section" className="text-xs sm:text-sm font-medium text-sky-800">
                    Section <span className="text-red-500">*</span>
                  </Label>
                  <Select
                    value={isCustomSection ? '__add__' : newClass.section}
                    onValueChange={(value) => {
                      if (value === '__add__') {
                        setIsCustomSection(true);
                        setNewClass({ ...newClass, section: '' });
                      } else {
                        setIsCustomSection(false);
                        setCustomSectionLetter('');
                        setNewClass({ ...newClass, section: value });
                      }
                    }}
                  >
                    <SelectTrigger className="rounded-xl bg-white/70 border-sky-200 text-sky-900 backdrop-blur-sm">
                      <SelectValue placeholder="Select section" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="A">Section A</SelectItem>
                      <SelectItem value="B">Section B</SelectItem>
                      <SelectItem value="C">Section C</SelectItem>
                      <SelectItem value="__add__">
                        <span className="flex items-center gap-2">
                          <Plus className="h-3 w-3 sm:h-4 sm:w-4" />
                          Add new section…
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  {isCustomSection && (
                    <Input
                      id="customSection"
                      value={customSectionLetter}
                      onChange={(e) =>
                        setCustomSectionLetter(
                          e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 3)
                        )
                      }
                      className="rounded-xl bg-white/70 border-sky-200 text-sky-900 backdrop-blur-sm mt-2"
                      placeholder="Enter section letter (e.g. D)"
                      maxLength={3}
                      autoFocus
                      required
                    />
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description" className="text-xs sm:text-sm font-medium text-sky-800">Description (Optional)</Label>
                <Textarea
                  id="description"
                  value={newClass.description}
                  onChange={(e) => setNewClass({ ...newClass, description: e.target.value })}
                  className="rounded-xl bg-white/70 border-sky-200 text-sky-900 backdrop-blur-sm"
                  rows={3}
                  placeholder="Optional description for this class"
                />
              </div>
              <div className="flex justify-end space-x-3">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => {
                    resetAddClassForm();
                    setIsAddClassDialogOpen(false);
                  }}
                  className="border-sky-200 text-sky-700 hover:bg-sky-50"
                >
                  Cancel
                </Button>
                <Button type="submit" className={adminBtn.primary}>
                  Create Class
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Edit Class Dialog */}
        <Dialog
          open={isEditClassDialogOpen}
          onOpenChange={(open) => {
            setIsEditClassDialogOpen(open);
            if (!open) resetEditClassForm();
          }}
        >
          <DialogContent className="bg-white/90 backdrop-blur-xl border-sky-200">
            <DialogHeader>
              <DialogTitle className="text-sky-900">Edit Class</DialogTitle>
              <DialogDescription>
                Update class number, section, or description
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleEditClass} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="editClassNumber" className="text-xs sm:text-sm font-medium text-sky-800">
                    Class Number <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="editClassNumber"
                    value={editClass.classNumber}
                    onChange={(e) => setEditClass({ ...editClass, classNumber: e.target.value })}
                    className="rounded-xl bg-white/70 border-sky-200 text-sky-900 backdrop-blur-sm"
                    required
                    placeholder="e.g., 10, 11, 12"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="editSection" className="text-xs sm:text-sm font-medium text-sky-800">
                    Section <span className="text-red-500">*</span>
                  </Label>
                  <Select
                    value={isEditCustomSection ? '__add__' : editClass.section}
                    onValueChange={(value) => {
                      if (value === '__add__') {
                        setIsEditCustomSection(true);
                        setEditClass({ ...editClass, section: '' });
                      } else {
                        setIsEditCustomSection(false);
                        setEditCustomSectionLetter('');
                        setEditClass({ ...editClass, section: value });
                      }
                    }}
                  >
                    <SelectTrigger
                      id="editSection"
                      className="rounded-xl bg-white/70 border-sky-200 text-sky-900 backdrop-blur-sm"
                    >
                      <SelectValue placeholder="Select section" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="A">Section A</SelectItem>
                      <SelectItem value="B">Section B</SelectItem>
                      <SelectItem value="C">Section C</SelectItem>
                      <SelectItem value="__add__">
                        <span className="flex items-center gap-2">
                          <Plus className="h-3 w-3 sm:h-4 sm:w-4" />
                          Add new section…
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  {isEditCustomSection && (
                    <Input
                      id="editCustomSection"
                      value={editCustomSectionLetter}
                      onChange={(e) =>
                        setEditCustomSectionLetter(
                          e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 3)
                        )
                      }
                      className="rounded-xl bg-white/70 border-sky-200 text-sky-900 backdrop-blur-sm mt-2"
                      placeholder="Enter section letter (e.g. D)"
                      maxLength={3}
                      autoFocus
                      required
                    />
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="editDescription" className="text-xs sm:text-sm font-medium text-sky-800">
                  Description (Optional)
                </Label>
                <Textarea
                  id="editDescription"
                  value={editClass.description}
                  onChange={(e) => setEditClass({ ...editClass, description: e.target.value })}
                  className="rounded-xl bg-white/70 border-sky-200 text-sky-900 backdrop-blur-sm"
                  rows={3}
                  placeholder="Optional description for this class"
                />
              </div>
              <div className="flex justify-end space-x-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    resetEditClassForm();
                    setIsEditClassDialogOpen(false);
                  }}
                  className="border-sky-200 text-sky-700 hover:bg-sky-50"
                  disabled={isSavingClass}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSavingClass}
                  className={adminBtn.primary}
                >
                  {isSavingClass ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

        {/* Student Analysis Dialog */}
        <Dialog open={isStudentAnalysisDialogOpen} onOpenChange={setIsStudentAnalysisDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5 text-sky-600" />
                Student Analysis - {selectedStudentForAnalysis?.name}
              </DialogTitle>
              <DialogDescription>
                {selectedStudentForAnalysis?.email}
              </DialogDescription>
            </DialogHeader>
            
            {isLoadingAnalysis ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 sm:w-7 sm:h-7 lg:w-8 lg:h-8 animate-spin text-sky-600" />
                <span className="ml-2 text-gray-600">Loading analysis...</span>
              </div>
            ) : studentAnalysis ? (
              <div className="space-y-3 sm:space-y-4 lg:space-y-6">
                {/* Performance Summary */}
                {studentAnalysis.performance && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base sm:text-lg">Performance Summary</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                        {studentAnalysis.performance.totalExams > 0 && (
                          <div className="bg-blue-50 rounded-lg p-4">
                            <p className="text-xs sm:text-sm text-gray-600">Total Exams</p>
                            <p className="text-xl sm:text-2xl font-bold text-blue-700">{studentAnalysis.performance.totalExams}</p>
                          </div>
                        )}
                        {studentAnalysis.performance.averageScore && (
                          <div className="bg-green-50 rounded-lg p-4">
                            <p className="text-xs sm:text-sm text-gray-600">Average Score</p>
                            <p className="text-xl sm:text-2xl font-bold text-green-700">{studentAnalysis.performance.averageScore}%</p>
                          </div>
                        )}
                        {studentAnalysis.performance.overallProgress && (
                          <div className="bg-purple-50 rounded-lg p-4">
                            <p className="text-xs sm:text-sm text-gray-600">Overall Progress</p>
                            <p className="text-xl sm:text-2xl font-bold text-purple-700">{studentAnalysis.performance.overallProgress}%</p>
                          </div>
                        )}
                        {studentAnalysis.performance.watchTime && (
                          <div className="bg-orange-50 rounded-lg p-4">
                            <p className="text-xs sm:text-sm text-gray-600">Watch Time</p>
                            <p className="text-xl sm:text-2xl font-bold text-orange-700">{Math.round(studentAnalysis.performance.watchTime / 60)}h</p>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Recent Activity */}
                {studentAnalysis.recentActivity && studentAnalysis.recentActivity.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base sm:text-lg">Recent Activity</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {studentAnalysis.recentActivity.map((activity: any, index: number) => (
                          <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <div>
                              <p className="font-medium text-gray-900">{activity.title || activity.type}</p>
                              <p className="text-xs sm:text-sm text-gray-600">{activity.date || activity.createdAt}</p>
                            </div>
                            {activity.score && (
                              <Badge className="bg-sky-100 text-sky-700">{activity.score}%</Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {!studentAnalysis.performance && !studentAnalysis.recentActivity && (
                  <div className="text-center py-12">
                    <BarChart3 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-600">No analysis data available for this student yet.</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-12">
                <BarChart3 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-600">No analysis data available for this student yet.</p>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* AI Risk Analysis Modal */}
        {selectedStudentForAIRisk && (
          <StudentRiskAnalysisModal
            open={isAIRiskAnalysisModalOpen}
            onOpenChange={setIsAIRiskAnalysisModalOpen}
            studentId={selectedStudentForAIRisk.id}
            studentName={selectedStudentForAIRisk.name}
            isSuperAdmin={false}
          />
        )}
        {ConfirmDialog}
    </div>
  );
};

export default ClassDashboard;
