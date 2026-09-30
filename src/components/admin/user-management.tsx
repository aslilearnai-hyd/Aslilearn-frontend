import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { API_BASE_URL } from '@/lib/api-config';
import { useToast } from '@/hooks/use-toast';
import { useConfirm } from '@/hooks/use-confirm';
import { cn } from '@/lib/utils';
import { formatSeatUsage, seatUsageHint, useAccountSeats } from '@/hooks/use-account-seats';
import { getAuthToken } from '@/lib/auth-utils';
import { 
  Users, 
  Plus, 
  Search, 
  Trash2, 
  Upload, 
  Download, 
  UserPlus,
  FileSpreadsheet,
  CheckCircle,
  Mail,
  Phone,
  Eye,
  EyeOff,
  Calendar,
  GraduationCap,
  BookOpen,
  TrendingUp,
  Loader2,
  Edit,
  Brain,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { StudentRiskAnalysisModal } from './StudentRiskAnalysisModal';
import { Trophy } from 'lucide-react';
import { AdminPageHero, AdminStatGrid, AdminFooterBanner, adminBtn } from './ui/AdminUiKit';

const STUDENT_FORM_FIELD_CLASS =
  'border border-sky-300 bg-sky-50 text-sky-950 shadow-sm placeholder:text-sky-500 focus-visible:border-sky-500 focus-visible:ring-2 focus-visible:ring-sky-400/35';
interface Student {
  id: string;
  name: string;
  email: string;
  classNumber: string;
  /** Section from linked class (CSV / manual add), e.g. A, B */
  section?: string;
  phone?: string;
  status: 'active' | 'inactive';
  createdAt: string;
  lastLogin?: string;
  assignedClass?: string | null;
  /** Display label like "9-A" when linked to a class section */
  classLabel?: string;
}

const normalizeClassNumberForDisplay = (value: unknown): string => {
  const raw = String(value ?? '').trim();
  if (!raw) return 'N/A';
  // Repair corrupted values like "-7", "Class -7", "-7A" that should be positive.
  return raw
    .replace(/^class\s*-\s*(\d+)/i, 'Class $1')
    .replace(/^-([0-9]+)([A-Za-z]?)$/, '$1$2');
};

const resolveAssignedClassId = (assignedClass: unknown): string | null => {
  if (!assignedClass) return null;
  if (typeof assignedClass === 'string' || typeof assignedClass === 'number') {
    const id = String(assignedClass).trim();
    return id || null;
  }
  if (typeof assignedClass === 'object') {
    const obj = assignedClass as { _id?: unknown; id?: unknown };
    const id = obj._id ?? obj.id;
    if (id == null) return null;
    return String(id).trim() || null;
  }
  return null;
};

const mapApiUserToStudent = (user: any): Student => {
  const assignedClassId = resolveAssignedClassId(user.assignedClass);
  const sectionFromAssigned =
    (typeof user.assignedClass === 'object' && user.assignedClass?.section
      ? String(user.assignedClass.section)
      : '') ||
    (user.section ? String(user.section) : '');
  const classNumber = normalizeClassNumberForDisplay(
    (typeof user.assignedClass === 'object' && user.assignedClass?.classNumber) ||
      user.classNumber
  );
  const classLabel =
    user.classLabel ||
    (assignedClassId && sectionFromAssigned
      ? `${classNumber}-${sectionFromAssigned}`
      : classNumber);

  return {
    id: user._id || user.id,
    name: user.fullName || user.name || 'Unknown Student',
    email: user.email || '',
    classNumber,
    section: sectionFromAssigned,
    phone: user.phone || '',
    status: (user.isActive ? 'active' : 'inactive') as 'active' | 'inactive',
    createdAt: user.createdAt || new Date().toISOString(),
    lastLogin: user.lastLogin || undefined,
    assignedClass: assignedClassId,
    classLabel,
  };
};

const UserManagement = () => {
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const notify = (message: string, variant: 'default' | 'destructive' = 'default') => {
    toast({
      title: variant === 'destructive' ? 'Error' : 'Notice',
      description: message,
      variant,
    });
  };
  const { seats, refresh: refreshSeats } = useAccountSeats();
  const [students, setStudents] = useState<Student[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>('all');
  const [selectedSectionFilter, setSelectedSectionFilter] = useState<string>('all');
  const [studentViewMode, setStudentViewMode] = useState<'all' | 'class-wise' | 'section-wise'>('class-wise');
  const [collapsedClasses, setCollapsedClasses] = useState<Record<string, boolean>>({});
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [newStudent, setNewStudent] = useState({
    name: '',
    email: '',
    classNumber: '',
    section: 'A',
    phone: '',
    password: '',
  });
  const [showNewStudentPassword, setShowNewStudentPassword] = useState(false);
  const [isAssignClassDialogOpen, setIsAssignClassDialogOpen] = useState(false);
  const [selectedStudentForClass, setSelectedStudentForClass] = useState<Student | null>(null);
  const [availableClasses, setAvailableClasses] = useState<any[]>([]);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedStudentForEdit, setSelectedStudentForEdit] = useState<Student | null>(null);
  const [editStudent, setEditStudent] = useState({
    name: '',
    email: '',
    classNumber: '',
    phone: '',
    isActive: true
  });
  const [isRiskAnalysisModalOpen, setIsRiskAnalysisModalOpen] = useState(false);
  const [selectedStudentForAnalysis, setSelectedStudentForAnalysis] = useState<Student | null>(null);
  const [isDeleteAllDialogOpen, setIsDeleteAllDialogOpen] = useState(false);
  const [deleteAllStep, setDeleteAllStep] = useState<1 | 2>(1);
  const [deleteAllConfirmation, setDeleteAllConfirmation] = useState('');
  const [isDeletingAll, setIsDeletingAll] = useState(false);

  useEffect(() => {
    fetchStudents();
    fetchClasses();
  }, []);

  const fetchClasses = async () => {
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE_URL}/api/admin/classes`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setAvailableClasses(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error('Failed to fetch classes:', error);
    }
  };

  const fetchStudents = async () => {
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE_URL}/api/admin/students`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const responseData = await response.json();
      
      // Backend returns { success: true, data: [...] } format
      const data = responseData.data || responseData;
      
      // Check if data is an array
      if (!Array.isArray(data)) {
        console.error('Expected array but got:', responseData);
        throw new Error('Invalid data format received from server');
      }
      
      setStudents(data.map(mapApiUserToStudent));
      void refreshSeats();
    } catch (error) {
      console.error('Failed to fetch students:', error);
      // Set mock data for development
      setStudents([
        {
          id: '1',
          name: 'John Doe',
          email: 'john.doe@example.com',
          classNumber: '10A',
          phone: '+1234567890',
          status: 'active',
          createdAt: new Date().toISOString(),
          lastLogin: new Date().toISOString()
        },
        {
          id: '2',
          name: 'Jane Smith',
          email: 'jane.smith@example.com',
          classNumber: '12B',
          phone: '+1234567891',
          status: 'active',
          createdAt: new Date().toISOString(),
          lastLogin: new Date().toISOString()
        }
      ]);
    }
  };

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate required fields
    if (!newStudent.name || !newStudent.email || !newStudent.classNumber || !newStudent.section) {
      notify('Please fill in Full Name, Email/Student ID, Class Number, and Section.');
      return;
    }
    if (!newStudent.password.trim() || newStudent.password.trim().length < 6) {
      notify('Password is required and must be at least 6 characters.');
      return;
    }

    // Bare ids (1724) → 1724@example.com so login email validation works
    const emailRaw = newStudent.email.trim().toLowerCase().replace(/\s+/g, '');
    const emailNorm = emailRaw.includes('@')
      ? emailRaw
      : /^[a-z0-9._+-]+$/i.test(emailRaw)
        ? `${emailRaw}@example.com`
        : emailRaw;

    try {
        const token = getAuthToken();
        const response = await fetch(`${API_BASE_URL}/api/admin/students`, {
          method: 'POST',
          headers: { 
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json' 
          },
        body: JSON.stringify({
          fullName: newStudent.name.trim(),
          email: emailNorm,
          classNumber: newStudent.classNumber.trim(),
          section: newStudent.section.trim(),
          phone: newStudent.phone.trim(),
          password: newStudent.password.trim(),
        })
      });

      let responseData;
      try {
        responseData = await response.json();
      } catch (jsonError) {
        const text = await response.text();
        console.error('Failed to parse JSON response:', text);
        notify(`Failed to add student: Server returned invalid response. Status: ${response.status}`);
        return;
      }
      
      if (response.ok && (responseData.success === true || responseData.success === undefined)) {
        // Reset form and close dialog
        setNewStudent({ name: '', email: '', classNumber: '', section: 'A', phone: '', password: '' });
        setShowNewStudentPassword(false);
        setIsAddDialogOpen(false);
        fetchStudents();
        fetchClasses();
        notify('Student added successfully with the password you entered.');
      } else {
        const errorMsg = responseData.message || responseData.error || 'Unknown error occurred';
        console.error('Error response:', responseData);
        notify(`Failed to add student: ${errorMsg}`);
      }
    } catch (error: any) {
      console.error('Failed to add student:', error);
      const errorMsg = error.message || 'Network error. Please check your connection and try again.';
      notify(`Failed to add student: ${errorMsg}`);
    }
  };

  const handleCSVUpload = async (file: File) => {
    if (isUploading) return; // Prevent multiple uploads
    
    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    
    console.log('Uploading file:', file.name, file.size, 'bytes');
      console.log('API Base URL:', API_BASE_URL);
      console.log('Upload endpoint:', `${API_BASE_URL}/api/admin/students/upload`);
    
    try {
      const token = getAuthToken();
      if (!token) {
        notify('You are not authenticated. Please log in again.');
        setIsUploading(false);
        return;
      }

      // Test connection first
      try {
        const healthCheck = await fetch(`${API_BASE_URL}/api/health`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
          }
        });
        console.log('Health check response:', healthCheck.status);
      } catch (healthError) {
        console.warn('Health check failed, but continuing with upload:', healthError);
      }

      // Check if API_BASE_URL is accessible
      console.log('Making request to:', `${API_BASE_URL}/api/admin/students/upload`);
      
      const response = await fetch(`${API_BASE_URL}/api/admin/students/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          // Don't set Content-Type for FormData - browser will set it with boundary
        },
        body: formData
      });
      
      console.log('Upload response status:', response.status);
      console.log('Upload response headers:', Object.fromEntries(response.headers.entries()));

      if (response.ok) {
        const result = await response.json();
        setIsUploadDialogOpen(false);
        setSelectedFile(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }

        // Instant UI from upload payload (class + section), then confirm with API refresh.
        const created = [
          ...(Array.isArray(result.createdUsers) ? result.createdUsers : []),
          ...(Array.isArray(result.updatedUsers) ? result.updatedUsers : []),
        ];
        if (created.length > 0) {
          const optimistic = created.map((row: any) =>
            mapApiUserToStudent({
              _id: row.id,
              fullName: row.name,
              email: row.email,
              classNumber: row.classNumber,
              section: row.section,
              classLabel: row.classLabel || row.class,
              assignedClass: row.assignedClass || null,
              isActive: true,
              createdAt: new Date().toISOString(),
            })
          );
          setStudents((prev) => {
            const existingIds = new Set(prev.map((s) => s.id));
            const fresh = optimistic.filter((s: Student) => s.id && !existingIds.has(s.id));
            return [...fresh, ...prev];
          });
        }

        await Promise.all([fetchStudents(), fetchClasses()]);
        
        // Show detailed results
        let description =
          result.message ||
          `Created ${result.createdUsers?.length || 0} student(s) with the passwords from your CSV.`;

        if (result.classesCreated && result.classesCreated > 0) {
          description += ` Linked ${result.classesCreated} class section(s).`;
        }
        
        if (result.errors && result.errors.length > 0) {
          description += `\n\nSome errors occurred:\n${result.errors.slice(0, 5).join('\n')}${result.errors.length > 5 ? `\n...and ${result.errors.length - 5} more` : ''}`;
        }
        
        toast({
          title: result.errors?.length ? 'CSV Upload Completed With Errors' : 'CSV Upload Successful',
          description: description,
          variant: result.errors && result.errors.length > 0 ? 'destructive' : 'default'
        });
      } else {
        let errorData;
        try {
          const text = await response.text();
          errorData = text ? JSON.parse(text) : {};
        } catch {
          errorData = {};
        }
        const errLines = Array.isArray(errorData.errors) ? errorData.errors.slice(0, 5) : [];
        toast({
          title: 'CSV Upload Failed',
          description:
            (errorData.message || 'No students were created.') +
            (errLines.length ? `\n\n${errLines.join('\n')}` : ''),
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Failed to upload CSV:', error);
      console.error('Error details:', {
        name: error instanceof Error ? error.name : 'Unknown',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      
      let errorMessage = 'Network error';
      let description = 'Please check your connection and try again.';
      
      if (error instanceof TypeError && error.message.includes('fetch')) {
        errorMessage = 'Cannot connect to server';
        description = `Cannot connect to ${API_BASE_URL}. Please check:\n1. The backend server is running\n2. The API_BASE_URL is correct\n3. CORS is properly configured`;
      } else if (error instanceof Error) {
        errorMessage = error.message;
        description = 'Please check:\n1. Your admin account has a board assigned\n2. The CSV file format is correct\n3. Your internet connection is stable';
      }
      
      toast({
        title: 'CSV Upload Failed',
        description: description,
        variant: 'destructive'
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteStudent = async (studentId: string, studentName: string) => {
    const ok = await confirm({
      title: `Delete ${studentName}?`,
      description: 'This action cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/students/${studentId}`, {
        method: 'DELETE',
        headers: { 
          'Authorization': `Bearer ${getAuthToken()}`,
          'Content-Type': 'application/json' 
        }
      });

      if (response.ok) {
        fetchStudents();
        notify(`${studentName} has been deleted successfully.`);
      } else {
        const errorData = await response.json();
        notify(`Failed to delete student: ${errorData.message || 'Unknown error'}`, 'destructive');
      }
    } catch (error) {
      console.error('Failed to delete student:', error);
      notify('Failed to delete student. Please try again.', 'destructive');
    }
  };

  const handleDeleteAllStudents = async () => {
    const phrase = `DELETE ${students.length} STUDENTS`;
    if (deleteAllConfirmation.trim().toUpperCase() !== phrase) return;
    setIsDeletingAll(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/users/delete-all`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ expectedCount: students.length, confirmation: phrase }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Failed to remove students');
      setIsDeleteAllDialogOpen(false);
      setDeleteAllStep(1);
      setDeleteAllConfirmation('');
      await Promise.all([fetchStudents(), refreshSeats()]);
      notify(data.message || 'Students removed from the active directory.');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Failed to remove students.', 'destructive');
    } finally {
      setIsDeletingAll(false);
    }
  };

  const handleEditStudent = (student: Student) => {
    setSelectedStudentForEdit(student);
    setEditStudent({
      name: student.name || '',
      email: student.email || '',
      classNumber: student.classNumber || '',
      phone: student.phone || '',
      isActive: student.status === 'active'
    });
    setIsEditDialogOpen(true);
  };

  const handleUpdateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedStudentForEdit) return;
    
    if (!editStudent.name || !editStudent.email) {
      toast({
        title: 'Error',
        description: 'Please fill in all required fields: Full Name and Email.',
        variant: 'destructive'
      });
      return;
    }
    
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE_URL}/api/admin/students/${selectedStudentForEdit.id}`, {
        method: 'PUT',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({
          fullName: editStudent.name.trim(),
          classNumber: editStudent.classNumber.trim(),
          phone: editStudent.phone.trim(),
          isActive: editStudent.isActive
        })
      });

      const responseData = await response.json();
      
      if (response.ok && responseData.success) {
        setIsEditDialogOpen(false);
        setSelectedStudentForEdit(null);
        fetchStudents();
        toast({
          title: 'Success',
          description: 'Student details updated successfully!',
        });
      } else {
        toast({
          title: 'Error',
          description: responseData.message || 'Failed to update student',
          variant: 'destructive'
        });
      }
    } catch (error: any) {
      console.error('Failed to update student:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to update student. Please try again.',
        variant: 'destructive'
      });
    }
  };


  const handleExportStudents = () => {
    const rows = filteredStudents.map((student) => ({
      name: student.name || '',
      email: student.email || '',
      classNumber: student.classNumber || '',
      phone: student.phone || '',
      status: student.status || '',
      lastLogin: student.lastLogin ? new Date(student.lastLogin).toISOString() : '',
      createdAt: student.createdAt ? new Date(student.createdAt).toISOString() : '',
    }));

    const headers = ['name', 'email', 'classNumber', 'phone', 'status', 'lastLogin', 'createdAt'];
    const csv = [
      headers.join(','),
      ...rows.map((row) =>
        headers
          .map((h) => `"${String((row as any)[h] ?? '').replace(/"/g, '""')}"`)
          .join(',')
      ),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `students_export_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const formatSectionLabel = (sectionRaw: string) => {
    const s = String(sectionRaw || '')
      .trim()
      .toUpperCase()
      .replace(/^SECTION\s*/i, '');
    if (!s) return '';
    const letter = s.match(/^[A-Z]$/) ? s : s.charAt(0);
    return letter ? `Section ${letter}` : '';
  };

  const getClassSectionMeta = (student: Pick<Student, 'classNumber' | 'section'>) => {
    const raw = (student.classNumber || '').trim();
    const sectionLabel = formatSectionLabel(student.section || '');

    if (!raw || raw === 'N/A') {
      return {
        classKey: 'Unassigned',
        sectionKey: sectionLabel || 'Unassigned',
      };
    }

    if (sectionLabel) {
      const numOnly = raw.match(/^(\d+)$/)?.[1];
      if (numOnly) {
        return { classKey: numOnly, sectionKey: sectionLabel };
      }
      const labeledNum = raw.match(/class[-\s]*(\d+)/i)?.[1];
      if (labeledNum) {
        return { classKey: labeledNum, sectionKey: sectionLabel };
      }
      return { classKey: raw, sectionKey: sectionLabel };
    }

    const compact = raw.replace(/\s+/g, '');
    const compactMatch = compact.match(/^(\d+)([A-Za-z])$/);
    if (compactMatch) {
      return {
        classKey: compactMatch[1],
        sectionKey: `Section ${compactMatch[2].toUpperCase()}`,
      };
    }

    const labeledMatch = raw.match(/class[-\s]*(\d+)\s*([A-Za-z])?/i);
    if (labeledMatch) {
      return {
        classKey: labeledMatch[1],
        sectionKey: labeledMatch[2]
          ? `Section ${labeledMatch[2].toUpperCase()}`
          : 'Section A',
      };
    }

    const digitsOnly = raw.match(/^(\d+)$/)?.[1];
    if (digitsOnly) {
      return { classKey: digitsOnly, sectionKey: 'Section A' };
    }

    return { classKey: raw, sectionKey: 'Section A' };
  };

  const getClassSortValue = (label: string) => {
    const match = label.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : Number.MAX_SAFE_INTEGER;
  };

  const sortByClassLabel = (a: string, b: string) => {
    const numDiff = getClassSortValue(a) - getClassSortValue(b);
    if (numDiff !== 0) return numDiff;
    return a.localeCompare(b);
  };

  // Get all unique classes/sections from students
  const allClasses = Array.from(
    new Set(students.map((s) => getClassSectionMeta(s).classKey))
  ).sort(sortByClassLabel);

  const sectionsByClass = allClasses.reduce<Record<string, string[]>>((acc, classKey) => {
    const sections = Array.from(
      new Set(
        students
          .filter((s) => getClassSectionMeta(s).classKey === classKey)
          .map((s) => getClassSectionMeta(s).sectionKey)
      )
    ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    acc[classKey] = sections;
    return acc;
  }, {});

  const availableSectionsForClass = selectedClassFilter === 'all'
    ? []
    : (sectionsByClass[selectedClassFilter] || []);

  const filteredStudents = students.filter(student => {
    // Search filter
    const matchesSearch = 
      (student.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (student.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (student.classNumber || '').includes(searchTerm);
    
    // Class filter
    const { classKey, sectionKey } = getClassSectionMeta(student);
    const matchesClass = selectedClassFilter === 'all' || classKey === selectedClassFilter;
    const matchesSection = selectedSectionFilter === 'all' || sectionKey === selectedSectionFilter;
    
    return matchesSearch && matchesClass && matchesSection;
  });

  // After promote, old class filter can be empty while students still exist under new grade / Finished
  useEffect(() => {
    if (
      selectedClassFilter !== 'all' &&
      students.length > 0 &&
      filteredStudents.length === 0 &&
      !searchTerm.trim()
    ) {
      setSelectedClassFilter('all');
      setSelectedSectionFilter('all');
    }
  }, [students, selectedClassFilter, filteredStudents.length, searchTerm]);

  useEffect(() => {
    setSelectedSectionFilter('all');
  }, [selectedClassFilter]);

  const classSectionGroups = filteredStudents.reduce<Record<string, Record<string, Student[]>>>((acc, student) => {
    const { classKey, sectionKey } = getClassSectionMeta(student);
    if (!acc[classKey]) acc[classKey] = {};
    if (!acc[classKey][sectionKey]) acc[classKey][sectionKey] = [];
    acc[classKey][sectionKey].push(student);
    return acc;
  }, {});

  const sectionClassGroups = filteredStudents.reduce<Record<string, Record<string, Student[]>>>((acc, student) => {
    const { classKey, sectionKey } = getClassSectionMeta(student);
    if (!acc[sectionKey]) acc[sectionKey] = {};
    if (!acc[sectionKey][classKey]) acc[sectionKey][classKey] = [];
    acc[sectionKey][classKey].push(student);
    return acc;
  }, {});

  const toggleClassCollapse = (classKey: string) => {
    setCollapsedClasses((prev) => ({ ...prev, [classKey]: !(prev[classKey] ?? false) }));
  };

  const toggleSectionCollapse = (scopeKey: string) => {
    setCollapsedSections((prev) => ({ ...prev, [scopeKey]: !(prev[scopeKey] ?? false) }));
  };

  const renderStudentCard = (student: Student, indexKey: string | number) => (
    <motion.div
      key={student.id}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: typeof indexKey === 'number' ? 0.03 * indexKey : 0 }}
      className="group relative min-w-0 overflow-hidden bg-white/80 backdrop-blur-xl rounded-xl p-4 border border-sky-200 hover:border-sky-400 hover:shadow-lg transition-all duration-200"
    >
      <div className="flex items-start justify-between gap-2 mb-3 min-w-0">
        <div className="flex items-center space-x-3 min-w-0 flex-1">
          <div className="relative">
            <div className="w-11 h-11 bg-gradient-to-br from-sky-500 to-blue-600 rounded-xl flex items-center justify-center text-white font-bold text-xs sm:text-sm shadow-md">
              {(student.name || 'U').charAt(0).toUpperCase()}
            </div>
            <div
              className={`absolute -bottom-1 -right-1 h-3 w-3 rounded-full border-2 border-white sm:h-4 sm:w-4 ${
                student.lastLogin ? 'bg-green-500' : 'bg-gray-400'
              }`}
              title={student.lastLogin ? 'Has logged in' : 'Never logged in'}
              aria-label={student.lastLogin ? 'Has logged in' : 'Never logged in'}
            />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <h4 className="font-semibold text-sky-900 text-xs sm:text-sm leading-tight break-words">
                {student.name || 'Unknown Student'}
              </h4>
              {seats.licensedStudents > 0 && (
                <Badge
                  variant="outline"
                  className="shrink-0 border-sky-200 bg-sky-50 text-[10px] font-semibold text-sky-800"
                  title={seatUsageHint(students.length, seats.licensedStudents)}
                >
                  {formatSeatUsage(students.length, seats.licensedStudents)} seats
                </Badge>
              )}
            </div>
            <p className="text-sky-700 text-xs truncate">{student.email || 'No email'}</p>
          </div>
        </div>
        <Badge className="bg-sky-100 text-sky-700 border border-sky-200 text-micro shrink-0 whitespace-nowrap">
          {student.classLabel || student.classNumber || 'N/A'}
        </Badge>
      </div>

      <div className="space-y-1.5 mb-3">
        {student.phone && (
          <div className="flex items-center text-xs text-sky-700">
            <Phone className="w-3.5 h-3.5 mr-2 text-sky-600" />
            <span className="truncate">{student.phone}</span>
          </div>
        )}
        <div className="flex items-center text-xs text-sky-700">
          <Calendar className="w-3.5 h-3.5 mr-2 text-sky-600" />
          <span className="truncate">Last login: {student.lastLogin ? new Date(student.lastLogin).toLocaleDateString() : 'Never'}</span>
        </div>
      </div>

      <div className="pt-3 border-t border-sky-200 w-full min-w-0 overflow-hidden">
        <div className="flex flex-col gap-2 min-w-0 sm:flex-row sm:items-center sm:justify-between board:flex-row board:items-center board:justify-start board:gap-2 board:flex-wrap uhd:flex-nowrap uhd:max-w-full">
        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="text-sky-600 hover:text-blue-700 hover:bg-blue-100/50 rounded-lg h-9 w-9 sm:h-10 sm:w-10 p-0"
            onClick={() => handleEditStudent(student)}
            title="Edit Details"
          >
            <Edit className="w-4 h-4 sm:w-5 sm:h-5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-sky-600 hover:text-red-700 hover:bg-red-100/50 rounded-lg h-9 w-9 sm:h-10 sm:w-10 p-0"
            onClick={() => handleDeleteStudent(student.id, student.name || 'Unknown Student')}
            title="Delete"
          >
            <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-orange-600 hover:text-orange-700 hover:bg-orange-100/50 rounded-lg h-9 w-9 sm:h-10 sm:w-10 p-0"
            onClick={() => {
              setSelectedStudentForAnalysis(student);
              setIsRiskAnalysisModalOpen(true);
            }}
            title="AI Risk Analysis"
          >
            <Brain className="w-4 h-4 sm:w-5 sm:h-5" />
          </Button>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-full sm:w-auto shrink-0 text-sky-600 hover:text-sky-800 border-sky-200 hover:bg-sky-50 rounded-lg h-9 text-xs sm:text-sm whitespace-nowrap board:w-auto"
          onClick={() => {
            setSelectedStudentForClass(student);
            setIsAssignClassDialogOpen(true);
          }}
        >
          <GraduationCap className="w-4 h-4 sm:w-5 sm:h-5 mr-1.5 shrink-0" />
          {student.assignedClass ? 'Change Class' : 'Assign Class'}
        </Button>
        </div>
      </div>
    </motion.div>
  );

  return (
    <div className="min-h-0 w-full overflow-x-hidden">
      <div className="space-y-4 lg:space-y-5">
        <AdminPageHero
          title="Student"
          highlight="Management"
          subtitle="Manage students and their academic progress with ease."
          icon={<Users className="h-10 w-10 lg:h-11 lg:w-11" />}
        />

        <AdminStatGrid
          stats={[
            {
              label: 'Total Students',
              value: formatSeatUsage(students.length, seats.licensedStudents),
              icon: <Users className="h-5 w-5" />,
              tone: 'blue',
              footLabel:
                seats.licensedStudents > 0
                  ? seatUsageHint(students.length, seats.licensedStudents)
                  : 'Enrolled students',
              footValue: students.length,
            },
            {
              label: 'Active Students',
              value: students.filter((s) => s.status === 'active').length,
              icon: <CheckCircle className="h-5 w-5" />,
              tone: 'green',
              footLabel: 'Currently active',
            },
            {
              label: 'Active Classes',
              value: new Set(students.map((s) => s.classNumber)).size,
              icon: <GraduationCap className="h-5 w-5" />,
              tone: 'orange',
              footLabel: 'Classes running',
              footValue: new Set(students.map((s) => s.classNumber)).size,
            },
            {
              label: 'Sections',
              value: new Set(students.map((s) => `${s.classNumber}-${s.section || ''}`)).size,
              icon: <TrendingUp className="h-5 w-5" />,
              tone: 'purple',
              footLabel: 'Across all classes',
            },
          ]}
        />

        {/* Enhanced Action Bar */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5"
        >
          <div className="space-y-4">
            <div className="flex flex-col xl:flex-row xl:items-center gap-4">
              <div className="flex flex-1 flex-wrap items-center gap-3">
                <Select value={selectedClassFilter} onValueChange={setSelectedClassFilter}>
                  <SelectTrigger className="w-full sm:w-[220px] bg-white border-sky-200 text-sky-900 rounded-xl">
                    <SelectValue placeholder="Select Class" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All classes</SelectItem>
                    {allClasses.map((classNum) => (
                      <SelectItem key={classNum} value={classNum}>
                        {classNum === 'Finished' ? 'Finished (alumni)' : `Class ${classNum}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={selectedSectionFilter}
                  onValueChange={setSelectedSectionFilter}
                  disabled={selectedClassFilter === 'all'}
                >
                  <SelectTrigger className="w-full sm:w-[220px] bg-white border-sky-200 text-sky-900 rounded-xl disabled:opacity-60">
                    <SelectValue placeholder="Select Section" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Select Section</SelectItem>
                    {availableSectionsForClass.map((section) => (
                      <SelectItem key={section} value={section}>
                        {section}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="relative w-full xl:w-[360px] xl:ml-auto">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-500 w-4 h-4 sm:w-5 sm:h-5" />
                <Input
                  placeholder="Search students by name, email, or class..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="px-0 pl-12 sm:pl-12 h-12 bg-white/70 border-gray-200 text-gray-900 placeholder-gray-600 focus:border-blue-400 focus:ring-blue-400/20 rounded-xl backdrop-blur-sm"
                />
              </div>
            </div>

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="inline-flex flex-wrap rounded-xl border border-sky-200 bg-white p-1">
                <Button
                  type="button"
                  size="sm"
                  variant={studentViewMode === 'all' ? 'default' : 'ghost'}
                  className={studentViewMode === 'all' ? adminBtn.toggleActive : adminBtn.toggleIdle}
                  onClick={() => setStudentViewMode('all')}
                >
                  All Students
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={studentViewMode === 'class-wise' ? 'default' : 'ghost'}
                  className={studentViewMode === 'class-wise' ? adminBtn.toggleActive : adminBtn.toggleIdle}
                  onClick={() => setStudentViewMode('class-wise')}
                >
                  Class-wise View
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={studentViewMode === 'section-wise' ? 'default' : 'ghost'}
                  className={studentViewMode === 'section-wise' ? adminBtn.toggleActive : adminBtn.toggleIdle}
                  onClick={() => setStudentViewMode('section-wise')}
                >
                  Section-wise View
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <Button
                  variant="outline"
                  className={adminBtn.secondary}
                  onClick={handleExportStudents}
                >
                  <Download className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
                  Export
                </Button>
            <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className={adminBtn.secondary}>
                  <Upload className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
                  Upload CSV
                </Button>
              </DialogTrigger>
                <DialogContent className="max-w-md bg-white/80 border-sky-200 backdrop-blur-xl">
                  <DialogHeader>
                    <DialogTitle className="text-lg sm:text-xl font-semibold text-sky-900">Upload Students CSV</DialogTitle>
                    <DialogDescription className="text-sky-700">
                      Upload a CSV with student details. Each row must include its own password (min 6 characters) and section.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3 sm:space-y-4 lg:space-y-6">
                    <div className="border-2 border-dashed border-sky-300 rounded-xl p-4 sm:p-6 lg:p-8 text-center hover:border-sky-400 transition-colors bg-sky-50 backdrop-blur-sm">
                      <FileSpreadsheet className="w-16 h-16 text-sky-600 mx-auto mb-4" />
                      <p className="text-sky-800 mb-2 font-medium">Drop your CSV file here</p>
                      <p className="text-xs sm:text-sm text-sky-700 mb-4">CSV Format (comma-separated):</p>
                      <div className="bg-white/70 rounded-lg p-4 mb-4 text-left">
                        <p className="text-xs text-sky-600 mb-2 font-medium">Required columns:</p>
                        <p className="text-xs text-sky-700">name, email (or studentid), classnumber, section, phone, password</p>
                        <p className="text-xs text-sky-600 mt-2 font-medium">Example:</p>
                        <p className="text-xs text-sky-700">John Doe, john@email.com, 7, A, 9876543210, MyPass123</p>
                        <p className="text-xs text-sky-700 mt-1">Or student id: Jane, 1724, 6, A, , 1724@Bpet → saved as 1724@example.com</p>
                        <p className="text-xs text-sky-600 mt-2 font-medium">
                          Bare student ids are stored as id@example.com so students can sign in. Passwords are per student.
                        </p>
                        <div className="mt-3">
                          <Button 
                            type="button"
                            variant="outline"
                            size="sm"
                            className="text-xs border-sky-200 text-sky-700 hover:bg-sky-50"
                            onClick={() => {
                              const link = document.createElement('a');
                              link.href = '/student_template.csv';
                              link.download = 'student_template.csv';
                              link.click();
                            }}
                          >
                            <Download className="w-3 h-3 mr-1" />
                            Download Template
                          </Button>
                        </div>
                      </div>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setSelectedFile(file);
                      }
                    }}
                    className="mt-4 w-full"
                    ref={fileInputRef}
                  />
                  
                  {selectedFile && (
                    <div className="mt-4 p-3 bg-sky-50 rounded-lg border border-sky-200">
                      <p className="text-xs sm:text-sm text-sky-700 mb-2">Selected file:</p>
                      <p className="text-xs sm:text-sm font-medium text-sky-900">{selectedFile.name}</p>
                    </div>
                  )}
                  
                  <div className="flex justify-end space-x-3 mt-6">
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => {
                        setIsUploadDialogOpen(false);
                        setSelectedFile(null);
                        if (fileInputRef.current) {
                          fileInputRef.current.value = '';
                        }
                      }}
                      className="border-sky-200 text-sky-700 hover:bg-sky-50"
                    >
                      Cancel
                    </Button>
                    <Button 
                      type="button"
                      onClick={() => {
                        if (selectedFile && !isUploading) {
                          handleCSVUpload(selectedFile);
                        }
                      }}
                      disabled={!selectedFile || isUploading}
                      className={cn(adminBtn.primary, 'disabled:opacity-50')}
                    >
                      {isUploading ? (
                        <>
                          <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 mr-2 animate-spin" />
                          Uploading...
                        </>
                      ) : (
                        <>
                          <Upload className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
                          Upload Students
                        </>
                      )}
                    </Button>
                  </div>
                </div>
        </div>
            </DialogContent>
          </Dialog>
          
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button 
              className={adminBtn.primary}
            >
              <UserPlus className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
              Add New Student
            </Button>
          </DialogTrigger>
                <DialogContent className="max-w-lg bg-white/80 border-sky-200 backdrop-blur-xl">
                  <DialogHeader>
                    <DialogTitle className="text-lg sm:text-xl font-semibold text-sky-900">Add New Student</DialogTitle>
                    <DialogDescription className="text-sky-700">
                      Add a student with class, section, and their own login password (min 6 characters).
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleAddStudent} className="space-y-3 sm:space-y-4 lg:space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="name" className="text-xs sm:text-sm font-medium text-sky-800">
                          Full Name <span className="text-red-500">*</span>
                        </Label>
                  <Input
                    id="name"
                    value={newStudent.name}
                    onChange={(e) => setNewStudent({ ...newStudent, name: e.target.value })}
                    className={cn(STUDENT_FORM_FIELD_CLASS, 'rounded-xl')}
                    required
                  />
                </div>
                      <div className="space-y-2">
                        <Label htmlFor="email" className="text-xs sm:text-sm font-medium text-sky-800">
                          Email or Student ID <span className="text-red-500">*</span>
                        </Label>
                  <Input
                    id="email"
                    type="text"
                    inputMode="email"
                    autoComplete="off"
                    value={newStudent.email}
                    onChange={(e) => setNewStudent({ ...newStudent, email: e.target.value })}
                    className={cn(STUDENT_FORM_FIELD_CLASS, 'rounded-xl')}
                    required
                    placeholder="name@school.com or 1724"
                  />
                  <p className="text-[11px] text-sky-600">Student ids like 1724 are saved as 1724@example.com</p>
                </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="classNumber" className="text-xs sm:text-sm font-medium text-sky-800">
                          Class Number <span className="text-red-500">*</span>
                        </Label>
                  <Input
                    id="classNumber"
                    value={newStudent.classNumber}
                    onChange={(e) => setNewStudent({ ...newStudent, classNumber: e.target.value })}
                    className={cn(STUDENT_FORM_FIELD_CLASS, 'rounded-xl')}
                    required
                    placeholder="e.g. 7, 8, 10"
                  />
                </div>
                      <div className="space-y-2">
                        <Label htmlFor="section" className="text-xs sm:text-sm font-medium text-sky-800">
                          Section <span className="text-red-500">*</span>
                        </Label>
                  <Input
                    id="section"
                    value={newStudent.section}
                    onChange={(e) =>
                      setNewStudent({
                        ...newStudent,
                        section: e.target.value.toUpperCase().slice(0, 1),
                      })
                    }
                    className={cn(STUDENT_FORM_FIELD_CLASS, 'rounded-xl')}
                    required
                    placeholder="A, B, or C"
                    maxLength={1}
                  />
                </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="phone" className="text-xs sm:text-sm font-medium text-sky-800">Phone (Optional)</Label>
                  <Input
                    id="phone"
                    type="tel"
                    inputMode="numeric"
                    maxLength={10}
                    value={newStudent.phone}
                    onChange={(e) =>
                      setNewStudent({
                        ...newStudent,
                        phone: e.target.value.replace(/\D/g, '').slice(0, 10),
                      })
                    }
                    className={cn(STUDENT_FORM_FIELD_CLASS, 'rounded-xl')}
                    placeholder="10-digit mobile"
                  />
                </div>
                      <div className="space-y-2">
                        <Label htmlFor="password" className="text-xs sm:text-sm font-medium text-sky-800">
                          Password <span className="text-red-500">*</span>
                        </Label>
                        <div className="relative">
                          <Input
                            id="password"
                            type={showNewStudentPassword ? 'text' : 'password'}
                            value={newStudent.password}
                            onChange={(e) => setNewStudent({ ...newStudent, password: e.target.value })}
                            className={cn(STUDENT_FORM_FIELD_CLASS, 'rounded-xl pr-10')}
                            required
                            minLength={6}
                            autoComplete="new-password"
                            placeholder="Min 6 characters"
                          />
                          <button
                            type="button"
                            onClick={() => setShowNewStudentPassword((p) => !p)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-sky-600 hover:text-sky-900"
                            aria-label={showNewStudentPassword ? 'Hide password' : 'Show password'}
                          >
                            {showNewStudentPassword ? (
                              <EyeOff className="h-3 w-3 sm:h-4 sm:w-4" />
                            ) : (
                              <Eye className="h-3 w-3 sm:h-4 sm:w-4" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-end space-x-3 pt-4">
                      <Button 
                        type="button" 
                        variant="outline" 
                        onClick={() => setIsAddDialogOpen(false)}
                        className="rounded-xl border-sky-200 text-sky-800 hover:bg-sky-50 backdrop-blur-sm"
                      >
                    Cancel
                  </Button>
                      <Button type="submit" className={adminBtn.primary}>
                    Add Student
              </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
            
          </div>
        </div>
          </div>
        </motion.div>

        {/* Modern Students Grid */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm"
        >
          <div className="border-b border-slate-200/80 p-3 sm:p-4 lg:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-blue-600 to-violet-600 text-white shadow-md">
                  <Users className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 sm:text-xl">Students Directory</h3>
                  <p className="mt-0.5 text-sm text-slate-500">
                    {filteredStudents.length} students found
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <Button
                  variant="outline"
                  className={adminBtn.secondary}
                  onClick={handleExportStudents}
                >
                <Download className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
                  Export Data
              </Button>
            </div>
          </div>
        </div>
        
          {filteredStudents.length > 0 ? (
            <div className="p-3 sm:p-4 lg:p-6 space-y-3 sm:space-y-4 lg:space-y-6">
              {studentViewMode === 'all' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 board:grid-cols-4 uhd:grid-cols-5 gap-4 [&>*]:min-w-0">
                  {filteredStudents.map((student, index) => renderStudentCard(student, index))}
                </div>
              )}

              {studentViewMode === 'class-wise' && (
                <div className="space-y-4">
                  {Object.keys(classSectionGroups).sort(sortByClassLabel).map((classKey) => {
                    const isClassCollapsed = collapsedClasses[classKey] ?? false;
                    return (
                      <div key={classKey} className="rounded-xl border border-sky-200 bg-white/70 shadow-sm">
                        <button
                          type="button"
                          onClick={() => toggleClassCollapse(classKey)}
                          className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-sky-50/70 rounded-xl"
                        >
                          <div className="flex items-center gap-2">
                            {isClassCollapsed ? <ChevronRight className="w-3 h-3 sm:w-4 sm:h-4 text-sky-700" /> : <ChevronDown className="w-3 h-3 sm:w-4 sm:h-4 text-sky-700" />}
                            <span className="font-semibold text-sky-900">{classKey}</span>
                          </div>
                          <Badge className="bg-sky-100 text-sky-700 border border-sky-200">
                            {Object.values(classSectionGroups[classKey]).flat().length} students
                          </Badge>
                        </button>

                        {!isClassCollapsed && (
                          <div className="px-4 pb-4 space-y-3">
                            {Object.keys(classSectionGroups[classKey]).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map((sectionKey) => {
                              const sectionScopeKey = `${classKey}::${sectionKey}`;
                              const isSectionCollapsed = collapsedSections[sectionScopeKey] ?? false;
                              return (
                                <div key={sectionScopeKey} className="rounded-lg border border-sky-100 bg-white p-3">
                                  <button
                                    type="button"
                                    onClick={() => toggleSectionCollapse(sectionScopeKey)}
                                    className="w-full flex items-center justify-between text-left"
                                  >
                                    <div className="flex items-center gap-2">
                                      {isSectionCollapsed ? <ChevronRight className="w-3 h-3 sm:w-4 sm:h-4 text-teal-700" /> : <ChevronDown className="w-3 h-3 sm:w-4 sm:h-4 text-teal-700" />}
                                      <span className="font-medium text-sky-900">{sectionKey}</span>
                                    </div>
                                    <Badge className="bg-teal-100 text-teal-700 border border-teal-200">
                                      {classSectionGroups[classKey][sectionKey].length}
                                    </Badge>
                                  </button>
                                  {!isSectionCollapsed && (
                                    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 board:grid-cols-4 uhd:grid-cols-5 gap-4 mt-3 [&>*]:min-w-0">
                                      {classSectionGroups[classKey][sectionKey].map((student, idx) => renderStudentCard(student, `${sectionScopeKey}-${idx}`))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {studentViewMode === 'section-wise' && (
                <div className="space-y-4">
                  {Object.keys(sectionClassGroups).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map((sectionKey) => {
                    const isSectionCollapsed = collapsedSections[sectionKey] ?? false;
                    return (
                      <div key={sectionKey} className="rounded-xl border border-teal-200 bg-white/70 shadow-sm">
                        <button
                          type="button"
                          onClick={() => toggleSectionCollapse(sectionKey)}
                          className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-teal-50/70 rounded-xl"
                        >
                          <div className="flex items-center gap-2">
                            {isSectionCollapsed ? <ChevronRight className="w-3 h-3 sm:w-4 sm:h-4 text-teal-700" /> : <ChevronDown className="w-3 h-3 sm:w-4 sm:h-4 text-teal-700" />}
                            <span className="font-semibold text-teal-900">{sectionKey}</span>
                          </div>
                          <Badge className="bg-teal-100 text-teal-700 border border-teal-200">
                            {Object.values(sectionClassGroups[sectionKey]).flat().length} students
                          </Badge>
                        </button>

                        {!isSectionCollapsed && (
                          <div className="px-4 pb-4 space-y-3">
                            {Object.keys(sectionClassGroups[sectionKey]).sort(sortByClassLabel).map((classKey) => (
                              <div key={`${sectionKey}::${classKey}`} className="rounded-lg border border-sky-100 bg-white p-3">
                                <div className="flex items-center justify-between mb-3">
                                  <span className="font-medium text-sky-900">{classKey}</span>
                                  <Badge className="bg-sky-100 text-sky-700 border border-sky-200">
                                    {sectionClassGroups[sectionKey][classKey].length}
                                  </Badge>
                                </div>
                                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 board:grid-cols-4 uhd:grid-cols-5 gap-4 [&>*]:min-w-0">
                                  {sectionClassGroups[sectionKey][classKey].map((student, idx) =>
                                    renderStudentCard(student, `${sectionKey}-${classKey}-${idx}`)
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="p-12 text-center">
              <div className="w-24 h-24 bg-sky-100 rounded-full flex items-center justify-center mx-auto mb-6 backdrop-blur-sm">
                <Users className="w-12 h-12 text-sky-600" />
              </div>
              <h3 className="text-lg sm:text-xl font-semibold text-sky-900 mb-2">No students found</h3>
              <p className="text-sky-700 mb-6">Try adjusting your search criteria or add new students</p>
              <Button 
                onClick={() => setIsAddDialogOpen(true)}
                className={adminBtn.primary}
              >
                <UserPlus className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
                Add First Student
              </Button>
        </div>
          )}
        </motion.div>

        <details className="mx-auto mt-6 max-w-md text-center text-xs text-slate-400">
          <summary className="cursor-pointer select-none hover:text-slate-600">Student data settings</summary>
          <div className="mt-3 rounded-xl border border-red-100 bg-red-50/60 p-4">
            <p className="mb-3 text-red-700">
              Danger zone: remove every student from this school's active directory.
            </p>
            <Button
              type="button"
              variant="outline"
              className="border-red-200 text-red-700 hover:bg-red-100"
              disabled={students.length === 0}
              onClick={() => {
                setDeleteAllStep(1);
                setDeleteAllConfirmation('');
                setIsDeleteAllDialogOpen(true);
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" /> Remove all students
            </Button>
          </div>
        </details>

        <AdminFooterBanner
          title="Every student. Every step. Every success."
          subtitle="Together we build a brighter future."
          icon={<Trophy className="h-6 w-6" />}
        />
      </div>

      <Dialog
        open={isDeleteAllDialogOpen}
        onOpenChange={(open) => {
          setIsDeleteAllDialogOpen(open);
          if (!open) {
            setDeleteAllStep(1);
            setDeleteAllConfirmation('');
          }
        }}
      >
        <DialogContent className="max-w-md border-red-200 bg-white">
          <DialogHeader>
            <DialogTitle className="text-red-800">
              {deleteAllStep === 1 ? 'Remove all students?' : 'Final confirmation'}
            </DialogTitle>
            <DialogDescription>
              {deleteAllStep === 1
                ? `This removes ${students.length} students from this school's active directory. Records remain recoverable.`
                : `Type DELETE ${students.length} STUDENTS exactly to continue.`}
            </DialogDescription>
          </DialogHeader>
          {deleteAllStep === 2 && (
            <Input
              value={deleteAllConfirmation}
              onChange={(event) => setDeleteAllConfirmation(event.target.value)}
              placeholder={`DELETE ${students.length} STUDENTS`}
              autoComplete="off"
              className="border-red-200"
            />
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => deleteAllStep === 2 ? setDeleteAllStep(1) : setIsDeleteAllDialogOpen(false)}
            >
              {deleteAllStep === 2 ? 'Go back' : 'Cancel'}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isDeletingAll || (deleteAllStep === 2 && deleteAllConfirmation.trim().toUpperCase() !== `DELETE ${students.length} STUDENTS`)}
              onClick={() => deleteAllStep === 1 ? setDeleteAllStep(2) : handleDeleteAllStudents()}
            >
              {isDeletingAll ? 'Removing…' : deleteAllStep === 1 ? 'Continue' : 'Remove all students'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Assign Class Dialog */}
      <Dialog open={isAssignClassDialogOpen} onOpenChange={setIsAssignClassDialogOpen}>
        <DialogContent className="max-w-md bg-white/80 border-sky-200 backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle className="text-lg sm:text-xl font-semibold text-sky-900">Assign Class to Student</DialogTitle>
            <DialogDescription className="text-sky-700">
              {selectedStudentForClass && `Assign a class to ${selectedStudentForClass.name}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {availableClasses.length === 0 ? (
              <div className="text-center py-4 sm:py-6 lg:py-8">
                <GraduationCap className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No classes available. Please create a class first.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {availableClasses.map((classItem) => {
                  const classId = String(classItem.id || classItem._id || '');
                  const isCurrentlyAssigned =
                    String(selectedStudentForClass?.assignedClass || '') === classId;
                  return (
                  <div
                    key={classId}
                    className={`p-3 rounded-lg border cursor-pointer transition-all ${
                      isCurrentlyAssigned
                        ? 'bg-sky-100 border-sky-400 border-2'
                        : 'bg-white border-sky-200 hover:border-sky-300 hover:bg-sky-50'
                    }`}
                    onClick={async () => {
                      if (selectedStudentForClass) {
                        try {
                          const token = getAuthToken();
                          const response = await fetch(`${API_BASE_URL}/api/admin/students/${selectedStudentForClass.id}/assign-class`, {
                            method: 'POST',
                            headers: {
                              'Authorization': `Bearer ${token}`,
                              'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ classId })
                          });

                          const responseData = await response.json();

                          if (response.ok && responseData.success !== false) {
                            setIsAssignClassDialogOpen(false);
                            setSelectedStudentForClass(null);
                            await Promise.all([fetchStudents(), fetchClasses()]);
                            notify('Class assigned successfully!');
                          } else {
                            notify(`Failed to assign class: ${responseData.message || 'Unknown error'}`);
                          }
                        } catch (error) {
                          console.error('Failed to assign class:', error);
                          notify('Failed to assign class. Please try again.');
                        }
                      }
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-sky-900">{classItem.name}</p>
                        {classItem.description && (
                          <p className="text-xs sm:text-sm text-sky-600">{classItem.description}</p>
                        )}
                        <p className="text-xs text-sky-500 mt-1">
                          {classItem.studentCount || 0} students
                        </p>
                      </div>
                      {isCurrentlyAssigned && (
                        <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-sky-600" />
                      )}
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
            <div className="flex justify-end pt-4 border-t border-sky-200">
              <Button
                variant="outline"
                onClick={() => {
                  setIsAssignClassDialogOpen(false);
                  setSelectedStudentForClass(null);
                }}
                className="border-sky-200 text-sky-700 hover:bg-sky-50"
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Student Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-md bg-white/80 border-sky-200 backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle className="text-lg sm:text-xl font-semibold text-sky-900">Edit Student Details</DialogTitle>
            <DialogDescription className="text-sky-700">
              {selectedStudentForEdit && `Update information for ${selectedStudentForEdit.name}`}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdateStudent} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name" className="text-sky-900">Full Name *</Label>
              <Input
                id="edit-name"
                value={editStudent.name}
                onChange={(e) => setEditStudent({ ...editStudent, name: e.target.value })}
                placeholder="Enter full name"
                required
                className="border-sky-200 focus:border-sky-400"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="edit-email" className="text-sky-900">Email *</Label>
              <Input
                id="edit-email"
                type="email"
                value={editStudent.email}
                onChange={(e) => setEditStudent({ ...editStudent, email: e.target.value })}
                placeholder="Enter email"
                required
                disabled
                className="border-sky-200 bg-gray-100"
              />
              <p className="text-xs text-sky-600">Email cannot be changed</p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="edit-classNumber" className="text-sky-900">Class Number</Label>
              <Input
                id="edit-classNumber"
                value={editStudent.classNumber}
                onChange={(e) => setEditStudent({ ...editStudent, classNumber: e.target.value })}
                placeholder="Enter class number (e.g., 10, 11, 12)"
                className="border-sky-200 focus:border-sky-400"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="edit-phone" className="text-sky-900">Phone Number</Label>
              <Input
                id="edit-phone"
                type="tel"
                value={editStudent.phone}
                onChange={(e) => setEditStudent({ ...editStudent, phone: e.target.value })}
                placeholder="Enter phone number"
                className="border-sky-200 focus:border-sky-400"
              />
            </div>
            
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="edit-isActive"
                checked={editStudent.isActive}
                onChange={(e) => setEditStudent({ ...editStudent, isActive: e.target.checked })}
                className="rounded border-sky-200"
              />
              <Label htmlFor="edit-isActive" className="text-sky-900 cursor-pointer">
                Active Account
              </Label>
            </div>
            
            <div className="flex justify-end space-x-2 pt-4 border-t border-sky-200">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsEditDialogOpen(false);
                  setSelectedStudentForEdit(null);
                }}
                className="border-sky-200 text-sky-700 hover:bg-sky-50"
              >
                Cancel
              </Button>
              <Button type="submit" className={adminBtn.primary}>
                Update Student
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* AI Risk Analysis Modal */}
      {selectedStudentForAnalysis && (
        <StudentRiskAnalysisModal
          open={isRiskAnalysisModalOpen}
          onOpenChange={setIsRiskAnalysisModalOpen}
          studentId={selectedStudentForAnalysis.id}
          studentName={selectedStudentForAnalysis.name}
          isSuperAdmin={false}
        />
      )}
      {ConfirmDialog}
    </div>
  );
};

export default UserManagement;
