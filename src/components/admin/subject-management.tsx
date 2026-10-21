import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { API_BASE_URL } from '@/lib/api-config';
import { useToast } from '@/hooks/use-toast';
import { getAuthToken } from '@/lib/auth-utils';
import { formatSubjectWithIitCategory } from '@/lib/subject-names';
import { Trophy } from 'lucide-react';
import { AdminPageHero, AdminStatGrid, AdminFooterBanner, adminBtn } from '@/components/admin/ui/AdminUiKit';
import { cn } from '@/lib/utils';
import { 
  BookOpen, 
  Search, 
  UserPlus,
  Eye, 
  Users,
  GraduationCap,
  CheckCircle,
  XCircle
} from 'lucide-react';
/** Visible fields on white dialogs (default inputs are too faint). */
const SUBJECT_FORM_FIELD_CLASS =
  'border border-sky-300 bg-sky-50 text-sky-950 shadow-sm placeholder:text-sky-500 focus-visible:border-sky-500 focus-visible:ring-2 focus-visible:ring-sky-400/35';

interface ClassOption {
  id: string;
  classNumber: string;
  className: string;
  section?: string;
}

interface Subject {
  id: string;
  name: string;
  description?: string;
  productCategory?: string;
  teacher?: {
    id: string;
    fullName: string;
    email: string;
  };
  /** All teachers assigned this subject (Teacher Mgmt + primary). */
  teachers?: {
    id: string;
    fullName: string;
    email: string;
  }[];
  classes: ClassOption[];
  classIds?: string[];
  isActive: boolean;
  createdAt: string;
}

interface Teacher {
  id: string;
  fullName: string;
  email: string;
}

function subjectTeachersList(subject: Subject): { id: string; fullName: string; email: string }[] {
  if (Array.isArray(subject.teachers) && subject.teachers.length > 0) {
    return subject.teachers;
  }
  return subject.teacher ? [subject.teacher] : [];
}

const classNumberSortKey = (value: string) => {
  const n = parseInt(String(value || '').replace(/[^-\d]/g, ''), 10);
  return Number.isNaN(n) ? Number.MAX_SAFE_INTEGER : Math.abs(n);
};

const compareAssignedClasses = (
  a: { classNumber?: string; className?: string; section?: string },
  b: { classNumber?: string; className?: string; section?: string },
) => {
  const aNum = classNumberSortKey(a.classNumber || a.className || '');
  const bNum = classNumberSortKey(b.classNumber || b.className || '');
  if (aNum !== bNum) return aNum - bNum;
  return String(a.section || '').localeCompare(String(b.section || ''), undefined, {
    sensitivity: 'base',
  });
};

const getClassLabel = (c: {
  classNumber?: string;
  className?: string;
  section?: string;
}) => {
  const label = c.classNumber ? `Class ${c.classNumber}` : c.className || 'Class';
  return c.section ? `${label}-${c.section}` : label;
};

const sortedAssignedClasses = (subject: Subject) =>
  [...(subject.classes || [])].sort(compareAssignedClasses);

const formatClassLabels = (subject: Subject) => {
  const list = sortedAssignedClasses(subject);
  if (!list.length) return '—';
  return list.map(getClassLabel).join(', ');
};

const SubjectManagement = () => {
  const { toast } = useToast();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterByTeacher, setFilterByTeacher] = useState<string>('all');
  const [filterByStatus, setFilterByStatus] = useState<string>('active');
  /** Show one subject at a time instead of the whole list at once. */
  const [filterBySubject, setFilterBySubject] = useState<string>('all');
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [viewingSubject, setViewingSubject] = useState<Subject | null>(null);
  const [assigningSubject, setAssigningSubject] = useState<Subject | null>(null);

  useEffect(() => {
    fetchSubjects();
    fetchTeachers();
    fetchClasses();
    const onSubjectsUpdated = () => fetchSubjects();
    window.addEventListener('subjectsUpdated', onSubjectsUpdated);
    return () => window.removeEventListener('subjectsUpdated', onSubjectsUpdated);
  }, []);

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
      const subjectsData = data.data || data.subjects || data || [];

      const normalized = Array.isArray(subjectsData)
        ? subjectsData
            .filter((s: any) => s.isActive !== false)
            .map((s: any) => {
              const teachersList: { id: string; fullName: string; email: string }[] = Array.isArray(
                s.teachers
              )
                ? s.teachers
                    .map((t: any) => ({
                      id: String(t.id || t._id || ''),
                      fullName: t.fullName || t.name || '',
                      email: t.email || '',
                    }))
                    .filter((t: { id: string }) => t.id)
                : [];
              const primary = s.teacher
                ? {
                    id: String(s.teacher.id || s.teacher._id || ''),
                    fullName: s.teacher.fullName || s.teacher.name || '',
                    email: s.teacher.email || '',
                  }
                : teachersList[0];
              if (primary?.id && !teachersList.some((t) => t.id === primary.id)) {
                teachersList.unshift(primary);
              }
              return {
                id: String(s.id || s._id || ''),
                name: String(s.name || '').split('__deleted__')[0].trim(),
                description: s.description || '',
                productCategory: String(s.productCategory || '').trim().toUpperCase() || undefined,
                teacher: primary?.id ? primary : undefined,
                teachers: teachersList,
                classes: Array.isArray(s.classes)
                  ? s.classes
                      .map((c: any) => ({
                        id: String(c.id || c._id || ''),
                        classNumber: c.classNumber || '',
                        className: c.className || c.name || `Class ${c.classNumber || ''}`,
                        section: c.section,
                      }))
                      .sort(compareAssignedClasses)
                  : [],
                classIds: Array.isArray(s.classIds)
                  ? s.classIds.map(String)
                  : Array.isArray(s.classes)
                    ? s.classes.map((c: any) => String(c.id || c._id || ''))
                    : [],
                isActive: s.isActive !== false,
                createdAt: s.createdAt || new Date().toISOString(),
              };
            })
        : [];
      setSubjects(normalized);
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
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) return;
      const data = await response.json();
      const list = Array.isArray(data) ? data : data.data || [];
      setClasses(
        list
          .map((c: any) => ({
            id: String(c.id || c._id || ''),
            classNumber: String(c.classNumber || ''),
            className: c.name || c.className || `Class ${c.classNumber || ''}${c.section ? `-${c.section}` : ''}`,
            section: c.section,
          }))
          .sort(compareAssignedClasses)
      );
    } catch (error) {
      console.error('Failed to fetch classes:', error);
      setClasses([]);
    }
  };

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
      const teachersData = data.data || data.teachers || data || [];
      const normalizedTeachers = Array.isArray(teachersData)
        ? teachersData.map((t: any) => ({
            id: String(t.id || t._id || ''),
            fullName: t.fullName || t.name || '',
            email: t.email || '',
          }))
        : [];
      setTeachers(normalizedTeachers);
    } catch (error) {
      console.error('Failed to fetch teachers:', error);
      setTeachers([]);
    }
  };

  const toggleClassId = (classIds: string[], classId: string, checked: boolean) => {
    if (checked) return [...classIds, classId];
    return classIds.filter((id) => id !== classId);
  };

  const handleAssignSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assigningSubject) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/subjects/${assigningSubject.id}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAuthToken()}`
        },
        body: JSON.stringify({
          teacherId: assigningSubject.teacher?.id || null,
          classIds: assigningSubject.classIds || assigningSubject.classes?.map((c) => c.id) || [],
        }),
      });

      if (response.ok) {
        setAssigningSubject(null);
        setIsAssignDialogOpen(false);
        fetchSubjects();
        toast({ title: 'Success', description: 'Subject assignments updated!' });
      } else {
        const errorData = await response.json();
        toast({
          title: 'Error',
          description: errorData.message || 'Failed to update assignments',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Failed to assign subject:', error);
      toast({
        title: 'Error',
        description: 'Failed to update assignments. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleViewSubject = (subject: Subject) => {
    setViewingSubject(subject);
    setIsViewDialogOpen(true);
  };

  // Filter subjects based on search term and selected filters
  const filteredSubjects = useMemo(() => {
    if (!Array.isArray(subjects)) return [];

    let filtered = subjects;

    // Search filter
    if (searchTerm.trim()) {
      const query = searchTerm.toLowerCase();
      filtered = filtered.filter(subject =>
        subject.name?.toLowerCase().includes(query) ||
        formatSubjectWithIitCategory(subject.name, subject.productCategory)
          .toLowerCase()
          .includes(query) ||
        subject.description?.toLowerCase().includes(query) ||
        subjectTeachersList(subject).some((t) => t.fullName?.toLowerCase().includes(query)) ||
        formatClassLabels(subject).toLowerCase().includes(query)
      );
    }

    // Teacher filter
    if (filterByTeacher !== 'all') {
      if (filterByTeacher === 'assigned') {
        filtered = filtered.filter((s) => subjectTeachersList(s).length > 0);
      } else if (filterByTeacher === 'unassigned') {
        filtered = filtered.filter((s) => subjectTeachersList(s).length === 0);
      } else {
        filtered = filtered.filter((s) =>
          subjectTeachersList(s).some((t) => t.id === filterByTeacher)
        );
      }
    }

    // Subject filter — one subject (and IIT track) at a time
    if (filterBySubject !== 'all') {
      filtered = filtered.filter((s) => String(s.id || '') === filterBySubject);
    }

    if (filterByStatus !== 'all') {
      const isActive = filterByStatus === 'active';
      filtered = filtered.filter(s => s.isActive === isActive);
    }

    return filtered;
  }, [subjects, searchTerm, filterByTeacher, filterByStatus, filterBySubject]);

  const totalSubjects = Array.isArray(subjects) ? subjects.length : 0;
  const activeSubjects = Array.isArray(subjects) ? subjects.filter(s => s.isActive).length : 0;
  const assignedSubjects = Array.isArray(subjects)
    ? subjects.filter((s) => subjectTeachersList(s).length > 0).length
    : 0;

  return (
    <div className="min-h-0 w-full overflow-x-hidden">
      <div className="space-y-4 lg:space-y-5">
        <AdminPageHero
          title="Subject"
          highlight="Management"
          subtitle="Manage subjects and their assignments with ease."
          icon={<BookOpen className="h-10 w-10 lg:h-11 lg:w-11" />}
        />

        <AdminStatGrid
          stats={[
            {
              label: 'Total Subjects',
              value: totalSubjects,
              icon: <BookOpen className="h-5 w-5" />,
              tone: 'orange',
              footLabel: 'All available subjects',
            },
            {
              label: 'Active Subjects',
              value: activeSubjects,
              icon: <CheckCircle className="h-5 w-5" />,
              tone: 'blue',
              footLabel: 'Currently active',
            },
            {
              label: 'Assigned Subjects',
              value: assignedSubjects,
              icon: <Users className="h-5 w-5" />,
              tone: 'green',
              footLabel: 'With teachers',
            },
            {
              label: 'Unassigned',
              value: Math.max(totalSubjects - assignedSubjects, 0),
              icon: <BookOpen className="h-5 w-5" />,
              tone: 'purple',
              footLabel: 'Awaiting a teacher',
            },
          ]}
        />

        {/* Action Bar with Filters */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-4">
            <p className="text-sm text-sky-800">
              Subjects are created by Super Admin. You can view them and assign teachers / classes —
              you cannot edit or delete subjects.
            </p>
            {/* Search Bar */}
          <div className="flex flex-col sm:flex-row gap-4 items-center">
              <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-sky-600 w-3 h-3 sm:w-4 sm:h-4" />
              <Input
                placeholder="Search subjects..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                  className="px-0 pl-10 sm:pl-11 w-full border-sky-200 focus:border-sky-400"
              />
              </div>
              <Badge variant="outline" className="border-sky-200 text-sky-700 px-4 py-2">
                {filteredSubjects.length} of {subjects.length} subjects
              </Badge>
            </div>

            {/* Filter Controls */}
            <div className="flex flex-wrap items-center gap-4">
              <Label className="font-semibold text-sky-900">Filters:</Label>
              
              {/* Teacher Filter */}
              <div className="relative">
                <div className="absolute -inset-[2px] bg-gradient-to-r from-indigo-blue-500 to-violet-500 rounded-md"></div>
                <Select value={filterByTeacher} onValueChange={setFilterByTeacher}>
                  <SelectTrigger className="w-full sm:w-48 relative z-10 border-0 bg-white focus:ring-2 focus:ring-indigo-blue-500 focus:ring-offset-0">
                    <SelectValue placeholder="All Teachers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Teachers</SelectItem>
                    <SelectItem value="assigned">Assigned</SelectItem>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {teachers.map(teacher => (
                      <SelectItem key={teacher.id} value={teacher.id}>
                        {teacher.fullName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Status Filter */}
              <div className="relative">
                <div className="absolute -inset-[2px] bg-gradient-to-r from-indigo-blue-500 to-violet-500 rounded-md"></div>
                <Select value={filterByStatus} onValueChange={setFilterByStatus}>
                  <SelectTrigger className="w-full sm:w-40 relative z-10 border-0 bg-white focus:ring-2 focus:ring-indigo-blue-500 focus:ring-offset-0">
                    <SelectValue placeholder="All Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Subject filter — view one subject's data at a time */}
              <div className="relative">
                <div className="absolute -inset-[2px] bg-gradient-to-r from-indigo-blue-500 to-violet-500 rounded-md"></div>
                <Select value={filterBySubject} onValueChange={setFilterBySubject}>
                  <SelectTrigger className="w-full sm:w-48 relative z-10 border-0 bg-white focus:ring-2 focus:ring-indigo-blue-500 focus:ring-offset-0">
                    <SelectValue placeholder="All Subjects" />
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    <SelectItem value="all">All Subjects</SelectItem>
                    {(Array.isArray(subjects) ? subjects : [])
                      .slice()
                      .sort((a, b) =>
                        formatSubjectWithIitCategory(a.name, a.productCategory).localeCompare(
                          formatSubjectWithIitCategory(b.name, b.productCategory),
                        ),
                      )
                      .map((s) => {
                        const id = String(s.id || '');
                        if (!id) return null;
                        return (
                          <SelectItem key={id} value={id}>
                            {formatSubjectWithIitCategory(s.name, s.productCategory)}
                          </SelectItem>
                        );
                      })}
                  </SelectContent>
                </Select>
              </div>

              {/* Clear Filters Button */}
              {(filterByTeacher !== 'all' || filterByStatus !== 'all' || filterBySubject !== 'all') && (
                <Button
                  variant="outline"
                  className={adminBtn.secondary}
                  onClick={() => {
                    setFilterByTeacher('all');
                    setFilterByStatus('all');
                    setFilterBySubject('all');
                  }}
                >
                  Clear Filters
            </Button>
              )}
            </div>
          </div>
        </div>

        {/* Subjects Table */}
        <div className="bg-white/70 backdrop-blur-xl rounded-2xl shadow-lg border border-sky-200 overflow-hidden">
          <div className="overflow-x-auto">
          <Table className="min-w-[640px]">
            <TableHeader className="sticky top-0 z-10 bg-sky-50">
              <TableRow className="bg-sky-50/50">
                <TableHead className="text-sky-900 font-semibold">Subject</TableHead>
                <TableHead className="text-sky-900 font-semibold">Assigned Classes</TableHead>
                <TableHead className="text-sky-900 font-semibold">Teachers</TableHead>
                <TableHead className="text-sky-900 font-semibold">Status</TableHead>
                <TableHead className="text-sky-900 font-semibold">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSubjects.map((subject, index) => (
                <TableRow key={subject.id || `subject-${index}`} className="hover:bg-sky-50/30">
                  <TableCell>
                    <div>
                      <div className="font-medium text-sky-900">
                        {formatSubjectWithIitCategory(subject.name, subject.productCategory)}
                      </div>
                      {subject.description && (
                        <div className="text-xs sm:text-sm text-sky-600 mt-1">{subject.description}</div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const list = sortedAssignedClasses(subject);
                      if (!list.length) {
                        return <span className="text-sm text-sky-500">—</span>;
                      }
                      return (
                        <div className="flex flex-wrap gap-1.5 max-w-[18rem]">
                          {list.map((c) => (
                            <span
                              key={c.id || `${c.classNumber}-${c.section}`}
                              className="inline-block whitespace-nowrap rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-800"
                              title={getClassLabel(c)}
                            >
                              {getClassLabel(c)}
                            </span>
                          ))}
                        </div>
                      );
                    })()}
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const list = subjectTeachersList(subject);
                      if (list.length === 0) {
                        return <span className="text-sky-500 text-xs sm:text-sm">Unassigned</span>;
                      }
                      return (
                        <div className="space-y-1.5 max-w-[16rem]">
                          {list.map((t) => (
                            <div key={t.id} className="min-w-0">
                              <div className="font-medium text-sky-900 truncate" title={t.fullName}>
                                {t.fullName}
                              </div>
                              {t.email ? (
                                <div className="text-xs text-sky-600 truncate" title={t.email}>
                                  {t.email}
                                </div>
                              ) : null}
                            </div>
                          ))}
                          {list.length > 1 && (
                            <p className="text-[10px] font-medium text-sky-500">
                              {list.length} teachers assigned
                            </p>
                          )}
                        </div>
                      );
                    })()}
                  </TableCell>
                  <TableCell>
                    <Badge className={`${subject.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {subject.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button size="icon" variant="outline" className={cn(adminBtn.secondary, 'h-9 w-9 shrink-0 px-0 sm:h-10 sm:w-10 sm:px-0')} onClick={() => handleViewSubject(subject)} title="View">
                        <Eye className="w-4 h-4 sm:w-5 sm:h-5" />
                      </Button>
                      <Button 
                        size="icon"
                        variant="outline" 
                        className="h-9 w-9 sm:h-10 sm:w-10 border-teal-200 text-teal-700 hover:bg-teal-50 shrink-0"
                        title="Assign teachers & classes"
                        onClick={() => {
                          setAssigningSubject({
                            ...subject,
                            classIds: subject.classIds || subject.classes?.map((c) => c.id) || [],
                          });
                          setIsAssignDialogOpen(true);
                        }}
                      >
                        <UserPlus className="w-4 h-4 sm:w-5 sm:h-5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        </div>

        {filteredSubjects.length === 0 && (
          <div className="text-center py-12">
            <BookOpen className="w-16 h-16 text-sky-300 mx-auto mb-4" />
            <h3 className="text-lg sm:text-xl font-semibold text-sky-700 mb-2">No subjects found</h3>
            <p className="text-sky-600">Try adjusting your search. Subjects are created by Super Admin.</p>
          </div>
        )}

        <AdminFooterBanner
          title="Well-organized subjects create better learning journeys."
          subtitle="Keep your subject assignments updated for a smarter academic experience."
          icon={<Trophy className="h-6 w-6" />}
        />
      </div>

      {/* Assign teachers & classes — admin cannot edit/delete subject metadata */}
      <Dialog open={isAssignDialogOpen} onOpenChange={setIsAssignDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Assign Subject</DialogTitle>
            <DialogDescription>
              Assign teachers and classes to{' '}
              <span className="font-medium text-sky-900">{assigningSubject?.name}</span>. Subject
              details are managed by Super Admin.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAssignSubject} className="space-y-3">
            <div>
              <Label>Assign Teacher</Label>
              <Select
                value={assigningSubject?.teacher?.id || 'none'}
                onValueChange={(v) =>
                  setAssigningSubject((prev) =>
                    prev
                      ? {
                          ...prev,
                          teacher:
                            v === 'none'
                              ? undefined
                              : teachers.find((t) => t.id === v)
                                ? {
                                    id: v,
                                    fullName: teachers.find((t) => t.id === v)!.fullName,
                                    email: teachers.find((t) => t.id === v)!.email,
                                  }
                                : undefined,
                        }
                      : prev
                  )
                }
              >
                <SelectTrigger className={SUBJECT_FORM_FIELD_CLASS}>
                  <SelectValue placeholder="Select teacher" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {teachers.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Assign to Class(es)</Label>
              <div className="max-h-40 overflow-y-auto border border-sky-200 rounded-lg p-3 space-y-2 bg-sky-50/50">
                {classes.map((cls) => {
                  const selected =
                    assigningSubject?.classIds?.includes(cls.id) ||
                    assigningSubject?.classes?.some((c) => c.id === cls.id);
                  return (
                    <label key={cls.id} className="flex items-center gap-2 text-sm text-sky-900">
                      <Checkbox
                        checked={!!selected}
                        onCheckedChange={(checked) =>
                          setAssigningSubject((prev) => {
                            if (!prev) return prev;
                            const current =
                              prev.classIds || prev.classes?.map((c) => c.id) || [];
                            return {
                              ...prev,
                              classIds: toggleClassId(current, cls.id, checked === true),
                            };
                          })
                        }
                      />
                      <span>
                        {cls.className} ({cls.classNumber}
                        {cls.section ? `-${cls.section}` : ''})
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIsAssignDialogOpen(false)}>Cancel</Button>
              <Button type="submit">Save assignments</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* View Subject Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Subject Details</DialogTitle>
            <DialogDescription>Read-only subject information.</DialogDescription>
          </DialogHeader>
          {viewingSubject && (
            <div className="space-y-2 text-xs sm:text-sm">
              <p>
                <span className="font-semibold">Name:</span>{' '}
                {formatSubjectWithIitCategory(viewingSubject.name, viewingSubject.productCategory) || '-'}
              </p>
              <p><span className="font-semibold">Classes:</span> {formatClassLabels(viewingSubject)}</p>
              <p>
                <span className="font-semibold">Teachers:</span>{' '}
                {subjectTeachersList(viewingSubject).length > 0
                  ? subjectTeachersList(viewingSubject)
                      .map((t) => t.fullName)
                      .join(', ')
                  : 'Unassigned'}
              </p>
              <p><span className="font-semibold">Description:</span> {viewingSubject.description || '-'}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SubjectManagement;
