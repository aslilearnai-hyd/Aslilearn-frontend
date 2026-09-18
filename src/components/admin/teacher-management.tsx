import { useState, useEffect, useRef, useMemo } from 'react';
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
import { API_BASE_URL } from '@/lib/api-config';
import { getAuthToken } from '@/lib/auth-utils';
import {
  contactFieldError,
  normalizePhoneInput,
  sanitizePhoneTyping,
} from '@/lib/contact-validation';
import {
  formatSubjectDisplayLabel,
  formatSubjectWithIitCategory,
  normalizeSubjectDisplayKey,
} from '@/lib/subject-names';
import { 
  Users, 
  Plus, 
  Search, 
  Trash2, 
  Mail,
  Phone,
  BookOpen,
  BookMarked,
  GraduationCap,
  CheckCircle,
  XCircle,
  Filter,
  Upload,
  Download,
  FileSpreadsheet,
  Loader2,
  Eye,
  EyeOff,
  Pencil
} from 'lucide-react';
import { AdminTeacherDailyDialog } from '@/components/admin/AdminTeacherDailyDialog';
import { Trophy } from 'lucide-react';
import { AdminPageHero, AdminStatGrid, AdminFooterBanner, adminBtn } from '@/components/admin/ui/AdminUiKit';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { formatSeatUsage, seatUsageHint, useAccountSeats } from '@/hooks/use-account-seats';
import { useToast } from '@/hooks/use-toast';
import { useConfirm } from '@/hooks/use-confirm';

interface TeacherClassAssignment {
  classId: string;
  subjectId: string;
}

interface AssignedClassSummary {
  id: string;
  name: string;
  classNumber?: string;
  section?: string;
  schedule?: string;
  room?: string;
  studentCount?: number;
  assignedSubjects?: Array<{
    id?: string;
    _id?: string;
    name?: string;
    code?: string;
    productCategory?: string;
  }>;
}

interface Teacher {
  id: string;
  fullName: string;
  email: string;
  phone?: string;
  department?: string;
  qualifications?: string;
  subjects: Subject[];
  assignedClassIds?: string[];
  assignments?: TeacherClassAssignment[];
  assignedClasses?: AssignedClassSummary[];
  isActive: boolean;
  createdAt: string;
  lastLogin?: string;
}

interface Class {
  id: string;
  name: string;
  classNumber?: string;
  section?: string;
  description?: string;
  subject: string;
  assignedSubjects?: Array<{
    id?: string;
    _id?: string;
    name?: string;
    code?: string;
    productCategory?: string;
  }>;
  grade: string;
  teacher: string;
  schedule: string;
  room: string;
  studentCount: number;
  students: any[];
  createdAt: string;
}

const dedupeSubjectsForDisplay = (subjects: Subject[] | undefined) => {
  const byKey = new Map<string, { id: string; label: string }>();
  for (const subject of subjects ?? []) {
    if (!subject) continue;
    const raw = subject.name || subject.code || '';
    if (!raw) continue;
    const track = String(subject.productCategory || '').toUpperCase().trim() || 'GENERAL';
    const key = `${normalizeSubjectDisplayKey(raw)}::${track}`;
    const label = formatSubjectWithIitCategory(raw, subject.productCategory);
    const existing = byKey.get(key);
    const id = getSubjectRecordId(subject) || key;
    if (!existing || label.length > existing.label.length) {
      byKey.set(key, { id, label });
    }
  }
  return Array.from(byKey.values());
};

const getClassSubjectLineForTeacher = (
  classId: string,
  teacherSubjects: Subject[] = [],
  assignments: TeacherClassAssignment[] = [],
) => {
  const rows = assignments.filter((row) => String(row.classId) === String(classId));
  const sourceSubjects =
    rows.length > 0
      ? rows
          .map((row) =>
            teacherSubjects.find((s) => getSubjectRecordId(s) === String(row.subjectId)),
          )
          .filter(Boolean)
      : teacherSubjects;

  const labels = sourceSubjects
    .map((subject) =>
      subject
        ? formatSubjectWithIitCategory(subject.name || subject.code || '', subject.productCategory)
        : '',
    )
    .filter(Boolean);

  return Array.from(new Set(labels)).join(', ');
};

const resolveTeacherAssignedClasses = (
  teacher: Teacher,
  classList: Class[] | undefined
): AssignedClassSummary[] => {
  if (teacher.assignedClasses?.length) {
    return teacher.assignedClasses;
  }

  return (teacher.assignedClassIds ?? []).map((classId) => {
    const classItem = resolveAssignedClass(classId, classList);
    if (!classItem) {
      return {
        id: classId,
        name: classId,
        schedule: 'Not scheduled',
        room: '—',
        studentCount: 0,
      };
    }
    return {
      id: classItem.id,
      name: classItem.name,
      classNumber: classItem.classNumber,
      section: classItem.section,
      schedule: classItem.schedule,
      room: classItem.room,
      studentCount: classItem.studentCount,
      assignedSubjects: classItem.assignedSubjects,
    };
  });
};

const resolveAssignedClass = (classId: string, classList: Class[] | undefined) => {
  const id = String(classId);
  return (classList ?? []).find(
    (c) =>
      c != null &&
      (c.id === id ||
        c.classNumber === id ||
        `${c.classNumber ?? ''}${c.section ?? ''}` === id)
  );
};

interface Subject {
  id: string;
  _id?: string;
  name: string;
  code?: string;
  description?: string;
  productCategory?: string;
  isActive?: boolean;
}

function readSavedClassAssignments(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem('teacherClassAssignments');
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string[]>) : {};
  } catch {
    return {};
  }
}

function getSubjectRecordId(subject: { id?: string; _id?: string } | null | undefined): string {
  if (!subject) return '';
  return String(subject.id || subject._id || '');
}

function buildAvailableSubjectIndex(availableSubjects: Subject[]) {
  const idSet = new Set<string>();
  const keyToId = new Map<string, string>();

  for (const subject of availableSubjects) {
    const id = getSubjectRecordId(subject);
    if (!id) continue;
    idSet.add(id);

    const raw = String(subject.name || subject.code || '').trim();
    if (!raw) continue;
    const key = normalizeSubjectDisplayKey(raw);
    if (!keyToId.has(key)) keyToId.set(key, id);
  }

  return { idSet, keyToId };
}

function mapSubjectFromApi(subject: unknown): Subject | null {
  if (!subject || typeof subject !== 'object') return null;
  const s = subject as {
    id?: string;
    _id?: string;
    name?: string;
    code?: string;
    description?: string;
    productCategory?: string;
    isActive?: boolean;
  };
  const id = getSubjectRecordId(s);
  if (!id || typeof s.name !== 'string') return null;
  if (s.isActive === false) return null;
  return {
    id,
    _id: s._id || id,
    name: s.name,
    code: s.code || '',
    description: s.description,
    productCategory: String(s.productCategory || '').trim().toUpperCase() || undefined,
    isActive: true,
  };
}

function mapTeacherFromApi(
  teacher: unknown,
  savedAssignments: Record<string, string[]>
): Teacher | null {
  if (!teacher || typeof teacher !== 'object') return null;
  const t = teacher as Teacher & { _id?: string };
  const id = String(t._id || t.id || '');
  if (!id) return null;

  const subjects = (Array.isArray(t.subjects) ? t.subjects : [])
    .map(mapSubjectFromApi)
    .filter((s): s is Subject => s != null);

  const assignments = Array.isArray(
    (t as Teacher & { assignments?: TeacherClassAssignment[] }).assignments,
  )
    ? (t as Teacher & { assignments?: TeacherClassAssignment[] }).assignments!.map((row) => ({
        classId: String(row.classId || ''),
        subjectId: String(row.subjectId || ''),
      })).filter((row) => row.classId && row.subjectId)
    : [];

  const fromAssignments = assignments.map((a) => a.classId);

  const fromSummaries = Array.isArray(
    (t as Teacher & { assignedClassSummaries?: { id: string }[] }).assignedClassSummaries
  )
    ? (t as Teacher & { assignedClassSummaries?: { id: string }[] }).assignedClassSummaries!.map(
        (c) => String(c.id)
      )
    : [];

  const assignedRaw = t.assignedClassIds ?? savedAssignments[id] ?? [];
  const assignedClassIds = Array.from(
    new Set([
      ...(Array.isArray(assignedRaw) ? assignedRaw.map((x) => String(x)).filter(Boolean) : []),
      ...fromAssignments,
      ...fromSummaries,
    ])
  );

  return {
    id,
    fullName: String(t.fullName || 'Unknown'),
    email: String(t.email || ''),
    phone: t.phone,
    department: t.department,
    qualifications: t.qualifications,
    subjects,
    assignedClassIds,
    assignments,
    assignedClasses: Array.isArray(
      (t as Teacher & { assignedClasses?: AssignedClassSummary[] }).assignedClasses
    )
      ? (t as Teacher & { assignedClasses?: AssignedClassSummary[] }).assignedClasses
      : undefined,
    isActive: t.isActive !== false,
    createdAt: t.createdAt || new Date().toISOString(),
    lastLogin: t.lastLogin,
  };
}

function mapClassFromApi(classItem: unknown): Class | null {
  if (!classItem || typeof classItem !== 'object') return null;
  const c = classItem as Class & { _id?: string };
  const id = String(c._id || c.id || '');
  if (!id) return null;

  return {
    id,
    name: String(c.name || `Class ${c.classNumber ?? ''}${c.section ?? ''}`),
    classNumber: c.classNumber != null ? String(c.classNumber) : undefined,
    section: c.section != null ? String(c.section) : undefined,
    description: c.description,
    subject: typeof c.subject === 'string' ? c.subject : 'General',
    assignedSubjects: Array.isArray(c.assignedSubjects) ? c.assignedSubjects : [],
    grade: String(c.grade ?? c.classNumber ?? ''),
    teacher: String(c.teacher ?? 'TBD'),
    schedule: c.schedule != null && String(c.schedule).trim() !== '' ? String(c.schedule) : 'Not scheduled',
    room: c.room != null && String(c.room).trim() !== '' ? String(c.room) : '—',
    studentCount: Number(c.studentCount) || 0,
    students: Array.isArray(c.students) ? c.students : [],
    createdAt: c.createdAt || new Date().toISOString(),
  };
}

function getTeacherInitials(fullName?: string): string {
  const parts = String(fullName || '?')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '?';
  return parts
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

const TeacherManagement = () => {
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
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [isAssignClassDialogOpen, setIsAssignClassDialogOpen] = useState(false);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showNewTeacherPassword, setShowNewTeacherPassword] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
  const [assigningTeacher, setAssigningTeacher] = useState<Teacher | null>(null);
  const [assigningClassTeacher, setAssigningClassTeacher] = useState<Teacher | null>(null);
  const [dailyDialogTeacher, setDailyDialogTeacher] = useState<Teacher | null>(null);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [newTeacher, setNewTeacher] = useState({
    fullName: '',
    email: '',
    password: '',
    phone: '',
    department: '',
    qualifications: '',
    subjects: [] as string[]
  });
  const [selectedTeacherIds, setSelectedTeacherIds] = useState<string[]>([]);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  useEffect(() => {
    fetchTeachers();
    fetchSubjects();
    fetchClasses();
  }, []);

  const fetchTeachers = async () => {
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE_URL}/api/admin/teachers`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('API Response:', data); // Debug log
      console.log('Raw teachers data:', data);
      
      // Handle different response formats
      let teachersArray: unknown[] = [];
      if (Array.isArray(data)) {
        teachersArray = data;
      } else if (data && Array.isArray(data.data)) {
        teachersArray = data.data;
      } else if (data && Array.isArray(data.teachers)) {
        teachersArray = data.teachers;
      } else {
        console.warn('Unexpected API response format:', data);
        teachersArray = [];
      }
      
      const savedAssignments = readSavedClassAssignments();
      const mappedTeachers = teachersArray
        .map((teacher: unknown) => mapTeacherFromApi(teacher, savedAssignments))
        .filter((teacher): teacher is Teacher => teacher != null)
        .sort((a, b) =>
          (a.fullName || '').localeCompare(b.fullName || '', 'en', { sensitivity: 'base' }),
        );
      setTeachers(mappedTeachers);
      setSelectedTeacherIds((prev) => prev.filter((id) => mappedTeachers.some((t) => t.id === id)));
      void refreshSeats();
    } catch (error) {
      console.error('Failed to fetch teachers:', error);
      // Set mock data for development
      setTeachers([
        {
          id: '1',
          fullName: 'Dr. Sarah Johnson',
          email: 'sarah.johnson@school.edu',
          phone: '+1234567890',
          department: 'Mathematics',
          qualifications: 'PhD in Mathematics',
          subjects: [
            { id: '1', name: 'Calculus', code: 'MATH101' },
            { id: '2', name: 'Algebra', code: 'MATH102' }
          ],
          isActive: true,
          createdAt: new Date().toISOString()
        },
        {
          id: '2',
          fullName: 'Prof. Michael Brown',
          email: 'michael.brown@school.edu',
          phone: '+1234567891',
          department: 'Physics',
          qualifications: 'PhD in Physics',
          subjects: [
            { id: '3', name: 'Mechanics', code: 'PHYS101' }
          ],
          isActive: true,
          createdAt: new Date().toISOString()
        }
      ]);
    }
  };

  const fetchSubjects = async () => {
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE_URL}/api/admin/subjects`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('Subjects API Response:', data); // Debug log
      
      // Handle different response formats
      let subjectsArray: unknown[] = [];
      if (Array.isArray(data)) {
        subjectsArray = data;
      } else if (data && Array.isArray(data.data)) {
        subjectsArray = data.data;
      } else if (data && Array.isArray(data.subjects)) {
        subjectsArray = data.subjects;
      } else {
        console.warn('Unexpected subjects API response format:', data);
        subjectsArray = [];
      }
      
      const mappedSubjects: Subject[] = [];
      for (const item of subjectsArray) {
        const mapped = mapSubjectFromApi(item);
        if (mapped) mappedSubjects.push(mapped);
      }

      setSubjects(mappedSubjects);
    } catch (error) {
      console.error('Failed to fetch subjects:', error);
      setSubjects([]);
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
      
      const data = await response.json();
      console.log('Classes API Response:', data);
      
      // Handle different response formats
      let classesArray: unknown[] = [];
      if (Array.isArray(data)) {
        classesArray = data;
      } else if (data && Array.isArray(data.data)) {
        classesArray = data.data;
      } else if (data && Array.isArray(data.classes)) {
        classesArray = data.classes;
      } else {
        console.warn('Unexpected classes API response format:', data);
        classesArray = [];
      }
      
      // Map backend _id to frontend id; sort by grade number then section (not string order)
      const mappedClasses = classesArray
        .map((classItem: unknown) => mapClassFromApi(classItem))
        .filter((c): c is Class => c != null)
        .sort((a, b) => {
          const an = parseInt(String(a.classNumber ?? a.grade ?? ''), 10);
          const bn = parseInt(String(b.classNumber ?? b.grade ?? ''), 10);
          const aNum = Number.isFinite(an) ? an : Number.MAX_SAFE_INTEGER;
          const bNum = Number.isFinite(bn) ? bn : Number.MAX_SAFE_INTEGER;
          if (aNum !== bNum) return aNum - bNum;
          return String(a.section ?? '').localeCompare(String(b.section ?? ''), undefined, {
            sensitivity: 'base',
          });
        });

      setClasses(mappedClasses);
    } catch (error) {
      console.error('Failed to fetch classes:', error);
      setClasses([]);
    }
  };

  const handleAddTeacher = async (e: React.FormEvent) => {
    e.preventDefault();

    const fullName = String(newTeacher.fullName || '').trim();
    const email = String(newTeacher.email || '').trim().toLowerCase();
    const phone = normalizePhoneInput(newTeacher.phone || '');
    const department = String(newTeacher.department || '').trim();

    // Validate required fields
    if (!fullName || !email || !phone || !newTeacher.password || !department || newTeacher.subjects.length === 0) {
      notify('Please fill in all required fields: Name, Email, Phone, Password, Department, and at least one subject.');
      return;
    }

    const contactError = contactFieldError({ email, phone, requirePhone: true });
    if (contactError) {
      notify(contactError);
      return;
    }

    if (newTeacher.password.length < 6) {
      notify('Password must be at least 6 characters long.');
      return;
    }
    
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE_URL}/api/admin/teachers`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({
          ...newTeacher,
          fullName,
          email,
          phone,
          department,
        })
      });

      let responseData;
      try {
        responseData = await response.json();
      } catch (jsonError) {
        const text = await response.text();
        console.error('Failed to parse JSON response:', text);
        notify(`Failed to add teacher: Server returned invalid response. Status: ${response.status}`);
        return;
      }
      
      if (response.ok && (responseData.success === true || responseData.success === undefined)) {
        setNewTeacher({ fullName: '', email: '', password: '', phone: '', department: '', qualifications: '', subjects: [] });
        setShowNewTeacherPassword(false);
        setIsAddDialogOpen(false);
        fetchTeachers();
        notify('Teacher added successfully!');
      } else {
        const errorMsg = responseData.message || responseData.error || 'Unknown error occurred';
        console.error('Error response:', responseData);
        notify(`Failed to add teacher: ${errorMsg}`);
      }
    } catch (error: any) {
      console.error('Failed to add teacher:', error);
      const errorMsg = error.message || 'Network error. Please check your connection and try again.';
      notify(`Failed to add teacher: ${errorMsg}`);
    }
  };

  const handleEditTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTeacher) return;

    try {
      const token = getAuthToken();
      if (!token) {
        notify('Authentication token not found. Please log in again.');
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/admin/teachers/${editingTeacher.id}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          fullName: editingTeacher.fullName,
          phone: editingTeacher.phone,
          department: editingTeacher.department,
          qualifications: editingTeacher.qualifications,
          isActive: editingTeacher.isActive,
        })
      });

      if (response.ok) {
        setEditingTeacher(null);
        setIsEditDialogOpen(false);
        fetchTeachers();
        notify('Teacher updated successfully!');
      } else {
        const errorData = await response.json();
        notify(`Failed to update teacher: ${errorData.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to update teacher:', error);
      notify('Failed to update teacher. Please try again.');
    }
  };

  const handleDeleteTeacher = async (teacherId: string, teacherName: string) => {
    const ok = await confirm({
      title: `Delete ${teacherName}?`,
      description: 'This action cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    try {
      const token = getAuthToken();
      if (!token) {
        notify('Authentication token not found. Please log in again.', 'destructive');
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/admin/teachers/${teacherId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        setSelectedTeacherIds((prev) => prev.filter((id) => id !== teacherId));
        fetchTeachers();
        notify(`${teacherName} has been deleted successfully.`);
      } else {
        const errorData = await response.json();
        notify(`Failed to delete teacher: ${errorData.message || 'Unknown error'}`, 'destructive');
      }
    } catch (error) {
      console.error('Failed to delete teacher:', error);
      notify('Failed to delete teacher. Please try again.', 'destructive');
    }
  };

  const handleBulkDeleteTeachers = async () => {
    if (selectedTeacherIds.length === 0) return;
    const count = selectedTeacherIds.length;
    const ok = await confirm({
      title: `Delete ${count} selected teacher${count !== 1 ? 's' : ''}?`,
      description: 'This action cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    setIsBulkDeleting(true);
    try {
      const token = getAuthToken();
      if (!token) {
        notify('Authentication token not found. Please log in again.');
        return;
      }
      const response = await fetch(`${API_BASE_URL}/api/admin/teachers/bulk-delete`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ids: selectedTeacherIds }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.success === false) {
        throw new Error(data?.message || 'Bulk delete failed');
      }
      const deleted = Number(data.deletedCount ?? count);
      setSelectedTeacherIds([]);
      await fetchTeachers();
      notify(`Deleted ${deleted} teacher${deleted !== 1 ? 's' : ''} successfully.`);
    } catch (error) {
      console.error('Bulk delete teachers failed:', error);
      notify(error instanceof Error ? error.message : 'Failed to delete selected teachers.');
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const toggleTeacherSelection = (teacherId: string, checked: boolean) => {
    setSelectedTeacherIds((prev) => {
      if (checked) return prev.includes(teacherId) ? prev : [...prev, teacherId];
      return prev.filter((id) => id !== teacherId);
    });
  };

  const handleCSVUpload = async (file: File) => {
    if (isUploading) return;
    
    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    
    console.log('Uploading teacher CSV file:', file.name, file.size, 'bytes');
    console.log('API Base URL:', API_BASE_URL);
    console.log('Upload endpoint:', `${API_BASE_URL}/api/admin/teachers/upload`);
    
    try {
      const token = getAuthToken();
      if (!token) {
        notify('You are not authenticated. Please log in again.');
        setIsUploading(false);
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/admin/teachers/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData
      });
      
      console.log('Upload response status:', response.status);

      if (response.ok) {
        const result = await response.json();
        setIsUploadDialogOpen(false);
        setSelectedFile(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        fetchTeachers();
        fetchSubjects();
        window.dispatchEvent(new CustomEvent('subjectsUpdated'));

        const newSubjects = result.createdSubjects?.length || 0;
        let message =
          result.message ||
          `CSV uploaded successfully!\nCreated ${result.createdTeachers?.length || 0} teacher(s).`;
        if (newSubjects > 0) {
          message += `\n${newSubjects} new subject(s) added to Subject Management.`;
        }

        if (result.errors && result.errors.length > 0) {
          message += `\n\nErrors:\n${result.errors.slice(0, 10).join('\n')}`;
          if (result.errors.length > 10) {
            message += `\n... and ${result.errors.length - 10} more errors`;
          }
        }
        
        notify(message);
      } else {
        let errorData;
        try {
          const text = await response.text();
          console.log('Error response text:', text);
          errorData = JSON.parse(text);
        } catch (e) {
          errorData = { 
            message: `Server error (${response.status}): ${response.statusText}`,
            hint: 'The server returned an error. Please check the console for details.'
          };
        }
        
        const errorMessage = errorData.message || 'Unknown error';
        const errorHint = errorData.hint ? `\n\nHint: ${errorData.hint}` : '';
        const fullError = errorData.error ? `${errorMessage}\n\nError details: ${errorData.error}${errorHint}` : `${errorMessage}${errorHint}`;
        notify(`Failed to upload CSV: ${fullError}`);
      }
    } catch (error) {
      console.error('Failed to upload CSV:', error);
      console.error('Error details:', {
        name: error instanceof Error ? error.name : 'Unknown',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      
      let errorMessage = 'Network error';
      if (error instanceof TypeError && error.message.includes('fetch')) {
        errorMessage = `Cannot connect to server at ${API_BASE_URL}\n\nPlease check:\n1. The backend server is running\n2. The API_BASE_URL is correct\n3. CORS is properly configured`;
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }
      
      notify(`Failed to upload CSV: ${errorMessage}\n\nPlease check:\n1. Your admin account has a board assigned\n2. The CSV file format is correct\n3. Your internet connection is stable\n4. The backend server is running at ${API_BASE_URL}`);
    } finally {
      setIsUploading(false);
    }
  };

  const downloadTemplate = () => {
    const csvContent = `name,email,password,phone,department,qualifications,subjects
John Doe,john.doe@school.edu,TeacherPass1,1234567890,Mathematics,PhD in Mathematics,Mathematics,Physics
Jane Smith,jane.smith@school.edu,TeacherPass2,1234567891,Science,MSc in Chemistry,Chemistry,Biology`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'teacher_template.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleAssignClasses = async (
    teacherId: string,
    assignments: TeacherClassAssignment[],
  ) => {
    if (!teacherId) {
      notify('Invalid teacher ID');
      return;
    }

    const validAssignments = assignments.filter((row) => row.classId && row.subjectId);
    console.log('Assigning class+subject rows:', { teacherId, validAssignments });

    try {
      const token = getAuthToken();
      if (!token) {
        notify('Authentication token not found. Please log in again.');
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/admin/teachers/${teacherId}/assign-classes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ assignments: validAssignments }),
      });

      const responseData = await response.json();
      console.log('Class assignment response:', responseData);

      if (response.ok) {
        await fetchTeachers();

        setIsAssignClassDialogOpen(false);
        setAssigningClassTeacher(null);
        setSelectedClassIds([]);
        notify('Class assignments saved successfully!');
      } else {
        notify(`Failed to assign classes: ${responseData.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to assign classes:', error);
      notify('Failed to assign classes. Please try again.');
    }
  };

  const handleAssignSubjects = async (teacherId: string, subjectIds: string[]) => {
    if (!teacherId) {
      notify('Invalid teacher ID');
      return;
    }

    console.log('Assigning subjects:', { teacherId, subjectIds });
    console.log('Subject IDs type:', typeof subjectIds, 'Length:', subjectIds.length);
    console.log('Subject IDs details:', subjectIds);

    try {
      const token = getAuthToken();
      if (!token) {
        notify('Authentication token not found. Please log in again.');
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/admin/teachers/${teacherId}/assign-subjects`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ subjectIds })
      });

      const responseData = await response.json();
      console.log('Assignment response:', responseData);

      if (response.ok) {
        console.log('Subjects assigned successfully, refreshing teacher data...');

        // 1) Optimistic update (keep until server confirms)
        if (assigningTeacher) {
          const updatedSubjects: Subject[] = subjectIds
            .map((id) => {
              const subject = subjects.find((s) => getSubjectRecordId(s) === id);
              return subject ? mapSubjectFromApi(subject) : null;
            })
            .filter((s): s is Subject => s != null);

          setTeachers((prevTeachers) =>
            prevTeachers.map((teacher) =>
              teacher.id === assigningTeacher.id
                ? { ...assigningTeacher, subjects: updatedSubjects }
                : teacher
            )
          );
        }

        // 2) Poll the server a few times to avoid flicker from eventual consistency
        const delay = (ms: number) => new Promise(res => setTimeout(res, ms));
        let serverConfirmed = false;
        for (let attempt = 1; attempt <= 3; attempt++) {
          await delay(600); // give backend time to persist
          try {
            const token2 = getAuthToken();
            const resp2 = await fetch(`${API_BASE_URL}/api/admin/teachers`, {
              headers: {
                'Authorization': `Bearer ${token2}`,
                'Content-Type': 'application/json'
              }
            });
            if (!resp2.ok) throw new Error(`Refresh status ${resp2.status}`);
            const raw = await resp2.json();
            const arr: unknown[] = Array.isArray(raw)
              ? raw
              : Array.isArray(raw?.data)
                ? raw.data
                : Array.isArray(raw?.teachers)
                  ? raw.teachers
                  : [];

            const savedAssignments = readSavedClassAssignments();
            const mapped: Teacher[] = arr
              .map((t) => mapTeacherFromApi(t, savedAssignments))
              .filter((t): t is Teacher => t != null);

            const refreshed = mapped.find((t: Teacher) => t.id === teacherId);
            const ok = refreshed && Array.isArray(refreshed.subjects) && refreshed.subjects.length >= subjectIds.length;
            console.log(`Refresh attempt ${attempt} → confirmed:`, ok, refreshed?.subjects);

            if (ok) {
              setTeachers(mapped);
              serverConfirmed = true;
              break;
            }
          } catch (e) {
            console.warn('Refresh attempt failed:', e);
          }
        }

        if (!serverConfirmed) {
          console.warn('Server did not confirm assignment yet; keeping optimistic UI state.');
        }

        notify('Subjects assigned successfully!');
      } else {
        console.error('Assignment failed:', responseData);
        notify(`Failed to assign subjects: ${responseData.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to assign subjects:', error);
      notify('Failed to assign subjects. Please try again.');
    }
  };

  const openAssignDialog = (teacher: Teacher) => {
    console.log('Opening assign dialog for teacher:', teacher);
    console.log('Teacher subjects:', teacher.subjects);
    
    setAssigningTeacher(teacher);
    
    // Keep only subject IDs that are actually selectable in the dialog.
    // Also map older/variant subject IDs to visible IDs by normalized name.
    const { idSet, keyToId } = buildAvailableSubjectIndex(subjects);
    const existingSubjectIds = Array.from(
      new Set(
        (teacher.subjects ?? []).flatMap((subject) => {
          const mapped: string[] = [];
          const sid = getSubjectRecordId(subject);
          if (sid && idSet.has(sid)) mapped.push(sid);

          const raw = String(subject.name || subject.code || '').trim();
          if (raw) {
            const visibleId = keyToId.get(normalizeSubjectDisplayKey(raw));
            if (visibleId) mapped.push(visibleId);
          }
          return mapped;
        }),
      ),
    );
    
    console.log('Existing subject IDs:', existingSubjectIds);
    setSelectedSubjects(existingSubjectIds);
    setIsAssignDialogOpen(true);
  };

  const openAssignClassDialog = (teacher: Teacher) => {
    console.log('Opening assign class dialog for teacher:', teacher);
    setAssigningClassTeacher(teacher);
    const fromAssignments = (teacher.assignments ?? [])
      .map((row) => String(row.classId || '').trim())
      .filter(Boolean);
    const fromIds = (teacher.assignedClassIds ?? []).map((id) => String(id).trim()).filter(Boolean);
    setSelectedClassIds(Array.from(new Set([...fromAssignments, ...fromIds])));
    setIsAssignClassDialogOpen(true);
  };

  const teacherSubjectsForClassAssign = useMemo(() => {
    if (!assigningClassTeacher) return [];
    return assigningClassTeacher.subjects ?? [];
  }, [assigningClassTeacher]);

  const handleAssignClassDialogSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assigningClassTeacher) {
      notify('Invalid teacher selected');
      return;
    }

    try {
      const teacherId = assigningClassTeacher.id || (assigningClassTeacher as any)._id;
      if (!teacherId) {
        notify('Invalid teacher ID');
        return;
      }

      const teacherSubjectIds = (assigningClassTeacher.subjects ?? [])
        .map((s) => getSubjectRecordId(s))
        .filter(Boolean);

      if (teacherSubjectIds.length === 0) {
        notify('Assign subjects to this teacher first (book icon), then pick classes.');
        return;
      }

      // Each selected class gets all of the teacher's subjects automatically.
      const assignments: TeacherClassAssignment[] = [];
      for (const classId of selectedClassIds) {
        for (const subjectId of teacherSubjectIds) {
          assignments.push({ classId, subjectId });
        }
      }

      await handleAssignClasses(teacherId, assignments);
    } catch (error) {
      console.error('Failed to assign classes:', error);
      notify('Failed to assign classes. Please try again.');
    }
  };

  const handleAssignDialogSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assigningTeacher) {
      notify('Invalid teacher selected');
      return;
    }

    console.log('Dialog submit - assigningTeacher:', assigningTeacher);
    console.log('Dialog submit - selectedSubjects:', selectedSubjects);

    // Use _id if id is not available (backend returns _id)
    const teacherId = assigningTeacher.id || (assigningTeacher as any)._id;
    if (!teacherId) {
      notify('Invalid teacher ID');
      return;
    }

    console.log('Final teacher ID:', teacherId);
    const availableSubjectIds = new Set(
      subjects.map((subject) => getSubjectRecordId(subject)).filter(Boolean),
    );
    const sanitizedSubjectIds = Array.from(
      new Set(selectedSubjects.filter((id) => availableSubjectIds.has(id))),
    );

    console.log('Final selected subjects (raw):', selectedSubjects);
    console.log('Final selected subjects (sanitized):', sanitizedSubjectIds);

    try {
      await handleAssignSubjects(teacherId, sanitizedSubjectIds);
      setIsAssignDialogOpen(false);
      setAssigningTeacher(null);
      setSelectedSubjects([]);
    } catch (error) {
      console.error('Failed to assign subjects:', error);
      notify('Failed to assign subjects. Please try again.');
    }
  };

  const sortedFilteredTeachers = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    return teachers
      .filter((teacher) => {
        if (!q) return true;
        return (
          (teacher.fullName || '').toLowerCase().includes(q) ||
          (teacher.email || '').toLowerCase().includes(q) ||
          (teacher.department || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) =>
        (a.fullName || '').localeCompare(b.fullName || '', 'en', { sensitivity: 'base' }),
      );
  }, [teachers, searchTerm]);

  const allVisibleSelected =
    sortedFilteredTeachers.length > 0 &&
    sortedFilteredTeachers.every((t) => selectedTeacherIds.includes(t.id));

  const toggleSelectAllVisible = () => {
    const visibleIds = sortedFilteredTeachers.map((t) => t.id);
    if (allVisibleSelected) {
      setSelectedTeacherIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelectedTeacherIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  const totalTeachers = teachers.length;
  const activeTeachers = teachers.filter(t => t.isActive).length;
  const totalSubjects = teachers.reduce((total, teacher) => total + (teacher.subjects?.length ?? 0), 0);

  return (
    <div className="min-h-0 w-full overflow-x-hidden">
      <div className="space-y-4 lg:space-y-5">
        <AdminPageHero
          title="Teacher"
          highlight="Management"
          subtitle="Manage teachers and their subject assignments with ease."
          icon={<Users className="h-10 w-10 lg:h-11 lg:w-11" />}
        />

        <AdminStatGrid
          stats={[
            {
              label: 'Total Teachers',
              value: formatSeatUsage(totalTeachers, seats.licensedTeachers),
              icon: <Users className="h-5 w-5" />,
              tone: 'orange',
              footLabel:
                seats.licensedTeachers > 0
                  ? seatUsageHint(totalTeachers, seats.licensedTeachers)
                  : 'Faculty members',
            },
            {
              label: 'Active Teachers',
              value: activeTeachers,
              icon: <CheckCircle className="h-5 w-5" />,
              tone: 'blue',
              footLabel: 'Currently teaching',
            },
            {
              label: 'Total Subjects',
              value: totalSubjects,
              icon: <BookOpen className="h-5 w-5" />,
              tone: 'green',
              footLabel: 'Subject assignments',
            },
            {
              label: 'Assigned Classes',
              value: teachers.reduce(
                (total, teacher) => total + (teacher.assignedClasses?.length ?? 0),
                0,
              ),
              icon: <GraduationCap className="h-5 w-5" />,
              tone: 'purple',
              footLabel: 'Across all teachers',
            },
          ]}
        />

        {/* Action Bar */}
        {/* Wraps rather than overflowing: when "Delete selected" appears it used
            to push the Add Teacher group outside the bar. */}
        <div className="flex flex-col sm:flex-row flex-wrap gap-4 items-center justify-between rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex min-w-0 flex-col sm:flex-row flex-wrap gap-4 items-center">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-orange-600 w-4 h-4 sm:w-5 sm:h-5" />
              <Input
                placeholder="Search teachers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 w-full sm:w-64 border-orange-200 focus:border-orange-400 bg-white/80 rounded-xl"
              />
            </div>
            <Button variant="outline" className={adminBtn.secondary}>
              <Filter className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
              Filter
            </Button>
            {sortedFilteredTeachers.length > 0 ? (
              <label className="flex w-full sm:w-auto shrink-0 items-center gap-2 rounded-xl border border-orange-100 bg-white/80 px-3 py-2 text-sm text-gray-700 cursor-pointer select-none">
                <Checkbox
                  checked={allVisibleSelected}
                  onCheckedChange={() => toggleSelectAllVisible()}
                  aria-label="Select all visible teachers"
                />
                Select all
              </label>
            ) : null}
            {selectedTeacherIds.length > 0 ? (
              <Button
                type="button"
                variant="outline"
                className="border-red-200 text-red-700 hover:bg-red-50 rounded-xl"
                disabled={isBulkDeleting}
                onClick={() => void handleBulkDeleteTeachers()}
              >
                {isBulkDeleting ? (
                  <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 mr-2 animate-spin" />
                ) : (
                  <Trash2 className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
                )}
                Delete selected ({selectedTeacherIds.length})
              </Button>
            ) : null}
          </div>
          
          <div className="flex shrink-0 flex-wrap gap-3">
            <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className={adminBtn.secondary}>
                  <Upload className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
                  Upload CSV
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md bg-white/95 border-orange-200 backdrop-blur-xl">
                <DialogHeader>
                  <DialogTitle className="text-lg sm:text-xl font-bold bg-gradient-to-r from-indigo-blue-600 to-violet-600 bg-clip-text text-transparent">
                    Upload Teachers CSV
                  </DialogTitle>
                  <DialogDescription className="text-gray-600 text-xs sm:text-sm">
                    Upload a CSV file to bulk import teachers. Download the template for the correct format.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-4 bg-gradient-to-r from-orange-50 to-orange-100 rounded-xl border border-orange-200">
                    <div className="flex items-center gap-3 min-w-0">
                      <FileSpreadsheet className="w-6 h-6 sm:w-7 sm:h-7 lg:w-8 lg:h-8 text-orange-600 shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900">CSV Template</p>
                        <p className="text-xs sm:text-sm text-gray-600 break-words">Download the template file</p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={downloadTemplate}
                      className={cn('w-full shrink-0 sm:w-auto', adminBtn.secondary)}
                    >
                      <Download className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
                      Download
                    </Button>
                  </div>
                  <div>
                    <Label htmlFor="csv-file" className="text-gray-700 font-medium mb-2 block">
                      Select CSV File
                    </Label>
                    <Input
                      id="csv-file"
                      ref={fileInputRef}
                      type="file"
                      accept=".csv"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setSelectedFile(file);
                        }
                      }}
                      className="border-orange-200 focus:border-orange-400 rounded-xl"
                    />
                    {selectedFile && (
                      <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded-lg">
                        <p className="text-xs sm:text-sm text-green-800">
                          <FileSpreadsheet className="w-3 h-3 sm:w-4 sm:h-4 inline mr-2" />
                          {selectedFile.name} ({(selectedFile.size / 1024).toFixed(2)} KB)
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="bg-blue-50 border border-orange-200 rounded-xl p-3">
                    <p className="text-xs text-blue-800">
                      <strong>Required columns:</strong> name, email, password (min 6 characters)<br />
                      <strong>Optional columns:</strong> phone, department, qualifications, subjects (comma-separated)<br />
                      <strong>Note:</strong> CSV must include a <code className="text-xs">password</code> column (min 6 characters) for each teacher. Extra subject columns after <code className="text-xs">subjects</code> are supported.
                    </p>
                  </div>
                </div>
                <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200 mt-4">
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
                    className="rounded-xl"
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
                        Upload Teachers
                      </>
                    )}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog
              open={isAddDialogOpen}
              onOpenChange={(open) => {
                setIsAddDialogOpen(open);
                if (!open) setShowNewTeacherPassword(false);
              }}
            >
              <DialogTrigger asChild>
                <Button className={adminBtn.primary}>
                  <Plus className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                  Add Teacher
                </Button>
              </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] bg-white/95 border-orange-200 backdrop-blur-xl flex flex-col">
              <DialogHeader className="flex-shrink-0">
                <DialogTitle className="text-lg sm:text-xl font-bold bg-gradient-to-r from-indigo-blue-600 to-violet-600 bg-clip-text text-transparent">Add New Teacher</DialogTitle>
                <DialogDescription className="text-gray-600 text-xs sm:text-sm">
                  Create a new teacher account and assign subjects.
                </DialogDescription>
              </DialogHeader>
              <div className="flex-1 overflow-y-auto pr-2">
                <form onSubmit={handleAddTeacher} id="add-teacher-form" className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="fullName" className="text-gray-700 font-medium">
                      Full Name <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="fullName"
                      autoComplete="off"
                      value={newTeacher.fullName}
                      onChange={(e) => setNewTeacher({ ...newTeacher, fullName: e.target.value })}
                      className="border-orange-200 focus:border-orange-400 rounded-xl"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="email" className="text-gray-700 font-medium">
                      Email <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      inputMode="email"
                      autoComplete="off"
                      placeholder="name@school.com"
                      value={newTeacher.email}
                      onChange={(e) => setNewTeacher({ ...newTeacher, email: e.target.value })}
                      className="border-orange-200 focus:border-orange-400 rounded-xl"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="phone" className="text-gray-700 font-medium">
                      Phone <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="phone"
                      type="tel"
                      inputMode="tel"
                      autoComplete="off"
                      placeholder="10-digit mobile number"
                      value={newTeacher.phone}
                      onChange={(e) =>
                        setNewTeacher({
                          ...newTeacher,
                          phone: sanitizePhoneTyping(e.target.value),
                        })
                      }
                      className="border-orange-200 focus:border-orange-400 rounded-xl"
                      required
                      minLength={10}
                      maxLength={18}
                    />
                  </div>
                  <div>
                    <Label htmlFor="department" className="text-gray-700 font-medium">
                      Department <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="department"
                      value={newTeacher.department}
                      onChange={(e) => setNewTeacher({ ...newTeacher, department: e.target.value })}
                      className="border-orange-200 focus:border-orange-400 rounded-xl"
                      required
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label htmlFor="password" className="text-gray-700 font-medium">
                      Password <span className="text-red-500">*</span>
                    </Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showNewTeacherPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        value={newTeacher.password}
                        onChange={(e) => setNewTeacher({ ...newTeacher, password: e.target.value })}
                        className="border-orange-200 focus:border-orange-400 rounded-xl px-0 pl-3 pr-10 sm:pr-12"
                        placeholder="Minimum 6 characters"
                        minLength={6}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewTeacherPassword((prev) => !prev)}
                        className="absolute right-3 top-1/2 z-10 -translate-y-1/2 text-gray-400 hover:text-orange-600"
                        aria-label={showNewTeacherPassword ? 'Hide password' : 'Show password'}
                      >
                        {showNewTeacherPassword ? (
                          <EyeOff className="w-4 h-4 sm:w-5 sm:h-5" />
                        ) : (
                          <Eye className="w-4 h-4 sm:w-5 sm:h-5" />
                        )}
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Teacher will use this password to sign in.</p>
                  </div>
                </div>
                <div>
                  <Label htmlFor="qualifications" className="text-gray-700 font-medium">Qualifications</Label>
                  <Textarea
                    id="qualifications"
                    value={newTeacher.qualifications}
                    onChange={(e) => setNewTeacher({ ...newTeacher, qualifications: e.target.value })}
                    className="border-orange-200 focus:border-orange-400 rounded-xl"
                    rows={2}
                  />
                </div>
                <div>
                  <Label className="text-gray-700 font-medium mb-3 block">
                    Assign Subjects <span className="text-red-500">*</span>
                  </Label>
                  {subjects.length === 0 ? (
                    <div className="text-xs sm:text-sm text-gray-500 p-4 bg-gray-50 rounded-xl border border-gray-200">
                      No subjects available. Please add subjects first.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-2 border border-orange-200 rounded-xl bg-gray-50">
                      {subjects.map(subject => {
                        const subjectId = getSubjectRecordId(subject);
                        const isSelected = newTeacher.subjects.includes(subjectId);
                        return (
                          <Card
                            key={subjectId}
                            className={`cursor-pointer transition-all duration-200 hover:shadow-md ${
                              isSelected
                                ? 'bg-gradient-to-r from-indigo-blue-600 to-violet-600 text-white border-indigo-blue-600 shadow-lg'
                                : 'bg-white border-gray-200 hover:border-purple-300'
                            }`}
                            onClick={() => {
                              if (isSelected) {
                                setNewTeacher({
                                  ...newTeacher,
                                  subjects: newTeacher.subjects.filter(id => id !== subjectId)
                                });
                              } else {
                                setNewTeacher({
                                  ...newTeacher,
                                  subjects: [...newTeacher.subjects, subjectId]
                                });
                              }
                            }}
                          >
                            <CardContent className="p-2">
                              <div className="flex items-center justify-between">
                                <div className="flex-1 min-w-0">
                                  <p className={`font-semibold text-xs whitespace-normal break-words ${isSelected ? 'text-white' : 'text-gray-900'}`}>
                                    {subject.name}
                                  </p>
                                  {subject.code && (
                                    <p className={`text-xs mt-0.5 whitespace-normal break-words ${isSelected ? 'text-purple-100' : 'text-gray-600'}`}>
                                      {subject.code}
                                    </p>
                                  )}
                                </div>
                                {isSelected && (
                                  <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4 text-white ml-1 flex-shrink-0" />
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  )}
                  {newTeacher.subjects.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs text-gray-600 mb-1">
                        Selected ({newTeacher.subjects.length}):
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {newTeacher.subjects.map(subjectId => {
                          const subject = subjects.find((s) => getSubjectRecordId(s) === subjectId);
                          return subject ? (
                            <Badge key={subjectId} className="bg-gradient-to-r from-purple-100 to-pink-100 text-purple-800 border-orange-200 rounded-lg px-3 py-1">
                              {subject.name}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setNewTeacher({ 
                                    ...newTeacher, 
                                    subjects: newTeacher.subjects.filter(id => id !== subjectId) 
                                  });
                                }}
                                className="ml-2 text-orange-600 hover:text-purple-800 font-bold"
                              >
                                ×
                              </button>
                            </Badge>
                          ) : null;
                        })}
                      </div>
                    </div>
                  )}
                  {newTeacher.subjects.length === 0 && (
                    <p className="text-xs sm:text-sm text-red-500 mt-2">Please select at least one subject</p>
                  )}
                </div>
                </form>
              </div>
              <div className="flex-shrink-0 flex justify-end space-x-3 pt-4 border-t border-gray-200 mt-4">
                <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)} className="rounded-xl">
                  Cancel
                </Button>
                <Button type="submit" form="add-teacher-form" className={adminBtn.primary}>
                  Add Teacher
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          </div>
        </div>

        {/* Teachers Grid — stretch cards so sections align across columns */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:p-4 lg:p-6 items-stretch">
          {sortedFilteredTeachers.map((teacher, index) => {
            const teacherSubjects = teacher.subjects ?? [];
            const assignedClasses = resolveTeacherAssignedClasses(teacher, classes);
            const isSelected = selectedTeacherIds.includes(teacher.id);
            const gradientColors = [
              'from-orange-500 to-orange-400',
              'from-blue-500 to-cyan-500', 
              'from-emerald-500 to-teal-500',
              'from-orange-500 to-red-500',
              'from-violet-500 to-purple-500',
              'from-indigo-500 to-blue-500'
            ];
            const gradient = gradientColors[index % gradientColors.length];
            
            return (
              <motion.div
                key={teacher.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className={`group relative overflow-hidden bg-white/80 backdrop-blur-xl rounded-3xl p-3 sm:p-4 lg:p-6 shadow-xl hover:shadow-2xl transition-all duration-300 h-full flex flex-col ${
                  isSelected ? 'border-2 border-orange-500 ring-2 ring-orange-200' : 'border border-white/20'
                }`}
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-5 group-hover:opacity-10 transition-opacity duration-300`}></div>
                <div className="relative z-10 flex flex-col flex-1 min-h-0">
                  {/* Header — fixed height so Subjects / Classes align across cards */}
                  <div className="flex items-start justify-between gap-2 mb-4 min-h-[5.5rem]">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={(checked) => toggleTeacherSelection(teacher.id, checked === true)}
                        className="mt-1 shrink-0"
                        aria-label={`Select ${teacher.fullName}`}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div className={`w-14 h-14 sm:w-16 sm:h-16 shrink-0 bg-gradient-to-r ${gradient} rounded-2xl flex items-center justify-center text-white font-bold text-base sm:text-lg shadow-lg`}>
                        {getTeacherInitials(teacher.fullName)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-bold text-gray-900 text-sm sm:text-base leading-tight line-clamp-2">
                            {teacher.fullName}
                          </h3>
                          {seats.licensedTeachers > 0 && (
                            <Badge
                              variant="outline"
                              className="shrink-0 border-orange-200 bg-orange-50 text-[10px] font-semibold text-orange-800"
                              title={seatUsageHint(totalTeachers, seats.licensedTeachers)}
                            >
                              {formatSeatUsage(totalTeachers, seats.licensedTeachers)} seats
                            </Badge>
                          )}
                        </div>
                        <p className="text-gray-600 text-xs sm:text-sm mt-1 line-clamp-2 min-h-[2.5rem] leading-snug" title={teacher.email}>
                          {teacher.email}
                        </p>
                      </div>
                    </div>
                    <Badge className={`shrink-0 ${teacher.isActive ? 'bg-gradient-to-r from-emerald-100 to-teal-100 text-emerald-800 border-emerald-200' : 'bg-gradient-to-r from-red-100 to-pink-100 text-red-800 border-red-200'} rounded-lg px-3 py-1`}>
                      {teacher.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>

                  {/* Contact — same two rows on every card */}
                  <div className="space-y-2 mb-4">
                    <div className="flex items-center text-xs sm:text-sm text-gray-700 bg-white/50 rounded-xl px-3 min-h-[2.75rem]">
                      <Phone className="w-4 h-4 mr-3 shrink-0 text-orange-600" />
                      <span className={`font-medium truncate ${teacher.phone ? '' : 'text-gray-400'}`}>
                        {teacher.phone || '—'}
                      </span>
                    </div>
                    <div className="flex items-center text-xs sm:text-sm text-gray-700 bg-white/50 rounded-xl px-3 min-h-[2.75rem]">
                      <BookOpen className="w-4 h-4 mr-3 shrink-0 text-emerald-600" />
                      <span className={`font-medium truncate ${teacher.qualifications ? '' : 'text-gray-400'}`}>
                        {teacher.qualifications || '—'}
                      </span>
                    </div>
                  </div>

                  {/* Subjects — fixed block height */}
                  <div className="mb-4 min-h-[4.25rem]">
                    <h4 className="font-bold text-gray-900 text-xs sm:text-sm mb-2">Subjects:</h4>
                    <div className="flex flex-wrap gap-2 min-h-[1.75rem] items-start">
                      {dedupeSubjectsForDisplay(teacherSubjects).map((subject) => (
                        <Badge key={subject.id} className={`bg-gradient-to-r ${gradient} text-white border-0 rounded-lg px-3 py-1 text-xs font-medium whitespace-normal break-words max-w-full`}>
                          {subject.label}
                        </Badge>
                      ))}
                      {teacherSubjects.length === 0 && (
                        <span className="text-xs text-gray-500 bg-gray-100 rounded-lg px-3 py-1">No subjects assigned</span>
                      )}
                    </div>
                  </div>

                  {/* Assigned classes — equal scroll area on all cards */}
                  <div className="mb-4 flex flex-col flex-1 min-h-[8rem]">
                    <h4 className="font-bold text-gray-900 text-xs sm:text-sm mb-2">Assigned Classes:</h4>
                    <div className="space-y-2 flex-1 overflow-y-auto max-h-48 pr-0.5">
                      {assignedClasses.length > 0 ? (
                        assignedClasses.map((classItem) => {
                          const subjectLine = getClassSubjectLineForTeacher(
                            classItem.id,
                            teacherSubjects,
                            teacher.assignments ?? [],
                          );
                          return (
                            <div key={classItem.id} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                              <div className="text-sm leading-snug">
                                <span className="font-medium text-gray-900">{classItem.name}</span>
                                {subjectLine ? (
                                  <span className="text-gray-600 block sm:inline sm:ml-2">- {subjectLine}</span>
                                ) : null}
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <span className="text-xs text-gray-500 bg-gray-100 rounded-lg px-3 py-1 inline-block">No classes assigned</span>
                      )}
                    </div>
                  </div>

                  <div className="mt-auto grid grid-cols-5 gap-1.5 border-t border-gray-200 pt-4 sm:gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className={`${adminBtn.secondary} min-w-0 px-0`}
                        onClick={() => {
                          setEditingTeacher(teacher);
                          setIsEditDialogOpen(true);
                        }}
                        title="Edit teacher"
                        aria-label="Edit teacher"
                      >
                        <Pencil className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className={`${adminBtn.secondary} min-w-0 px-0`}
                        onClick={() => openAssignClassDialog(teacher)}
                        title="Assign Class"
                        aria-label="Assign class"
                      >
                        <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="min-w-0 border-emerald-200 px-0 text-emerald-700 hover:bg-emerald-50 rounded-xl"
                        onClick={() => openAssignDialog(teacher)}
                        title="Assign subjects"
                        aria-label="Assign subjects"
                      >
                        <BookOpen className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="min-w-0 border-indigo-200 px-0 text-indigo-700 hover:bg-indigo-50 rounded-xl"
                        onClick={() => setDailyDialogTeacher(teacher)}
                        title="View daily diary"
                        aria-label="View daily diary"
                      >
                        <BookMarked className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="min-w-0 border-red-200 px-0 text-red-700 hover:bg-red-50 rounded-xl"
                        onClick={() => handleDeleteTeacher(teacher.id, teacher.fullName)}
                        title="Delete teacher"
                        aria-label="Delete teacher"
                      >
                        <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      </Button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {sortedFilteredTeachers.length === 0 && (
          <div className="text-center py-16">
            <div className="w-24 h-24 bg-gradient-to-r from-orange-500 to-orange-400 rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl">
              <Users className="w-12 h-12 text-white" />
            </div>
            <h3 className="text-xl sm:text-2xl font-bold text-gray-800 mb-3">No teachers found</h3>
            <p className="text-gray-600 text-base sm:text-lg">Try adjusting your search criteria or add a new teacher.</p>
          </div>
        )}

        <AdminFooterBanner
          title="Great teachers build great futures."
          subtitle="Empower. Inspire. Educate."
          icon={<Trophy className="h-6 w-6" />}
        />

        <Dialog
          open={isEditDialogOpen}
          onOpenChange={(open) => {
            setIsEditDialogOpen(open);
            if (!open) setEditingTeacher(null);
          }}
        >
          <DialogContent className="max-w-lg bg-white/95 border-orange-200">
            <DialogHeader>
              <DialogTitle>Edit teacher</DialogTitle>
              <DialogDescription>
                Update contact details. Use Assign Class / Assign subjects for timetable mapping.
              </DialogDescription>
            </DialogHeader>
            {editingTeacher ? (
              <form onSubmit={handleEditTeacher} className="space-y-3">
                <div>
                  <Label htmlFor="edit-teacher-name">Full name</Label>
                  <Input
                    id="edit-teacher-name"
                    autoComplete="off"
                    value={editingTeacher.fullName}
                    onChange={(e) =>
                      setEditingTeacher({ ...editingTeacher, fullName: e.target.value })
                    }
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="edit-teacher-email">Email</Label>
                  <Input
                    id="edit-teacher-email"
                    value={editingTeacher.email}
                    readOnly
                    className="bg-slate-50"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-teacher-phone">Phone</Label>
                  <Input
                    id="edit-teacher-phone"
                    autoComplete="off"
                    value={editingTeacher.phone || ''}
                    onChange={(e) =>
                      setEditingTeacher({
                        ...editingTeacher,
                        phone: sanitizePhoneTyping(e.target.value),
                      })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="edit-teacher-dept">Department</Label>
                  <Input
                    id="edit-teacher-dept"
                    autoComplete="off"
                    value={editingTeacher.department || ''}
                    onChange={(e) =>
                      setEditingTeacher({ ...editingTeacher, department: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="edit-teacher-qual">Qualifications</Label>
                  <Textarea
                    id="edit-teacher-qual"
                    value={editingTeacher.qualifications || ''}
                    onChange={(e) =>
                      setEditingTeacher({ ...editingTeacher, qualifications: e.target.value })
                    }
                    rows={3}
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsEditDialogOpen(false);
                      setEditingTeacher(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit">Save changes</Button>
                </div>
              </form>
            ) : null}
          </DialogContent>
        </Dialog>

        {/* Subject Assignment Dialog */}
        <Dialog open={isAssignDialogOpen} onOpenChange={setIsAssignDialogOpen}>
          <DialogContent className="max-w-2xl bg-white/95 border-orange-200 backdrop-blur-xl">
            <DialogHeader>
              <DialogTitle className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-indigo-blue-600 to-violet-600 bg-clip-text text-transparent">
                Assign Subjects to {assigningTeacher?.fullName}
              </DialogTitle>
              <DialogDescription className="text-gray-600 text-base sm:text-lg">
                Select the subjects this teacher will teach.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAssignDialogSubmit} className="space-y-3 sm:space-y-4 lg:space-y-6">
              <div>
                <Label className="text-gray-700 font-medium text-base sm:text-lg">Available Subjects</Label>
                <div className="mt-3 space-y-3 max-h-60 overflow-y-auto">
                  {subjects.map(subject => {
                    const subjectId = getSubjectRecordId(subject);
                    const subjectLabel = formatSubjectWithIitCategory(
                      subject.name || subject.code || '',
                      subject.productCategory,
                    ).trim();
                    if (!subjectId || !subjectLabel) return null;
                    const subtitle = [subject.code, subject.description].filter(Boolean).join(' - ');
                    return (
                      <div key={subjectId} className="flex items-center space-x-4 p-4 bg-gradient-to-r from-orange-50 to-orange-100 rounded-xl border border-purple-100 hover:border-orange-200 transition-colors">
                        <input
                          type="checkbox"
                          id={`subject-${subjectId}`}
                          checked={selectedSubjects.includes(subjectId)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedSubjects([...selectedSubjects, subjectId]);
                            } else {
                              setSelectedSubjects(selectedSubjects.filter(id => id !== subjectId));
                            }
                          }}
                          className="w-4 h-4 sm:w-5 sm:h-5 text-orange-600 border-purple-300 rounded focus:ring-purple-500"
                        />
                        <label htmlFor={`subject-${subjectId}`} className="flex-1 cursor-pointer">
                          <div className="font-bold text-gray-900 text-base sm:text-lg">{subjectLabel}</div>
                          {subtitle ? (
                            <div className="text-xs sm:text-sm text-gray-600">{subtitle}</div>
                          ) : null}
                        </label>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="flex justify-end space-x-3">
                <Button type="button" variant="outline" onClick={() => setIsAssignDialogOpen(false)} className="rounded-xl">
                  Cancel
                </Button>
                <Button type="submit" className={adminBtn.primary}>
                  Assign Subjects
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Assign Class Dialog — checkbox classes; subjects come from teacher profile */}
        <Dialog open={isAssignClassDialogOpen} onOpenChange={setIsAssignClassDialogOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-lg sm:text-xl font-semibold text-gray-800">
                Assign to Class — {assigningClassTeacher?.fullName}
              </DialogTitle>
              <DialogDescription>
                Tick the classes this teacher teaches. Their assigned subjects are applied
                automatically to each selected class.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAssignClassDialogSubmit} className="space-y-4">
              {(assigningClassTeacher?.subjects ?? []).length === 0 ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  Assign subjects to this teacher first (book icon), then return here to pick
                  classes.
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-lg border border-orange-100 bg-orange-50/70 px-3 py-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-orange-800 mb-1.5">
                      Subjects (from teacher profile)
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {teacherSubjectsForClassAssign.map((subject) => {
                        const sid = getSubjectRecordId(subject);
                        const label = formatSubjectWithIitCategory(
                          subject.name || subject.code || '',
                          subject.productCategory,
                        );
                        return (
                          <Badge
                            key={sid}
                            variant="secondary"
                            className="rounded-md bg-white text-orange-800 border border-orange-200"
                          >
                            {label}
                          </Badge>
                        );
                      })}
                    </div>
                  </div>

                  <Label className="text-gray-700 font-medium">Classes</Label>
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {classes.length === 0 ? (
                      <div className="text-center text-gray-500 py-4 text-sm">
                        No classes available. Create classes first.
                      </div>
                    ) : (
                      classes.map((classItem) => {
                        const checked = selectedClassIds.includes(classItem.id);
                        return (
                          <label
                            key={classItem.id}
                            htmlFor={`teacher-class-${classItem.id}`}
                            className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 bg-gray-50 hover:border-orange-200 hover:bg-orange-50/40 cursor-pointer"
                          >
                            <Checkbox
                              id={`teacher-class-${classItem.id}`}
                              checked={checked}
                              onCheckedChange={(value) => {
                                const on = value === true;
                                setSelectedClassIds((prev) => {
                                  if (on) {
                                    return prev.includes(classItem.id)
                                      ? prev
                                      : [...prev, classItem.id];
                                  }
                                  return prev.filter((id) => id !== classItem.id);
                                });
                              }}
                            />
                            <span className="font-medium text-gray-900 text-sm">
                              {classItem.name}
                            </span>
                          </label>
                        );
                      })
                    )}
                  </div>
                  {selectedClassIds.length > 0 ? (
                    <p className="text-xs text-gray-500">
                      {selectedClassIds.length} class
                      {selectedClassIds.length === 1 ? '' : 'es'} selected ·{' '}
                      {teacherSubjectsForClassAssign.length} subject
                      {teacherSubjectsForClassAssign.length === 1 ? '' : 's'} each
                    </p>
                  ) : null}
                </div>
              )}
              <div className="flex justify-end space-x-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsAssignClassDialogOpen(false)}
                  className="rounded-xl"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className={adminBtn.primary}
                  disabled={(assigningClassTeacher?.subjects ?? []).length === 0}
                >
                  Save assignments
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <AdminTeacherDailyDialog
          open={!!dailyDialogTeacher}
          onOpenChange={(open) => {
            if (!open) setDailyDialogTeacher(null);
          }}
          teacherId={dailyDialogTeacher?.id ?? null}
          teacherName={dailyDialogTeacher?.fullName ?? 'Teacher'}
          assignedClasses={
            dailyDialogTeacher
              ? (dailyDialogTeacher.assignedClassIds ?? []).map((classId) => {
                  const classItem = resolveAssignedClass(classId, classes);
                  const label = classItem?.name
                    ? classItem.name
                    : classItem?.classNumber
                      ? `Class ${classItem.classNumber}${classItem.section ? ` - ${classItem.section}` : ''}`
                      : `Class ${classId}`;
                  return { id: String(classItem?.id ?? classId), label };
                })
              : []
          }
        />
        {ConfirmDialog}
      </div>
    </div>
  );
};

export default TeacherManagement;
