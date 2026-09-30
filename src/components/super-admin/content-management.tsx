import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Upload, Video, FileText, File, X, Trash2, Edit, Play, Eye, Plus, Calendar, Grid3x3, ChevronDown, ChevronUp, BookOpen, GraduationCap, ExternalLink } from 'lucide-react';
import { API_BASE_URL, openPdfInAppReader } from '@/lib/api-config';
import { useToast } from '@/hooks/use-toast';
import { useConfirm } from '@/hooks/use-confirm';
import { getAuthToken } from '@/lib/auth-utils';

interface Content {
  _id: string;
  title: string;
  description?: string;
  type: 'TextBook' | 'Workbook' | 'Material' | 'Video' | 'Audio';
  board: string;
  subject: {
    _id: string;
    name: string;
  };
  classNumber?: string;
  topic?: string;
  date: string;
  fileUrl: string;
  fileUrls?: string[];
  thumbnailUrl?: string;
  duration?: number;
  createdAt: string;
  isExclusive?: boolean;
}

const BOARDS = [
  { value: 'ASLI_EXCLUSIVE_SCHOOLS', label: 'Asli Exclusive Schools' }
];

const ALL_BOARDS_VALUE = 'ALL_BOARDS';

const BOARD_SELECT_OPTIONS = [
  ...BOARDS,
  { value: ALL_BOARDS_VALUE, label: 'Aslilearn Exclusive (All Boards)' }
];

export default function ContentManagement() {
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const [selectedBoard, setSelectedBoard] = useState<string>('ASLI_EXCLUSIVE_SCHOOLS');
  const [subjects, setSubjects] = useState<any[]>([]);
  const [contents, setContents] = useState<Content[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [filterBySubject, setFilterBySubject] = useState<string>('all');
  const [filterByClass, setFilterByClass] = useState<string>('all');
  const [filterByType, setFilterByType] = useState<string>('all');
  const [viewingContent, setViewingContent] = useState<Content | null>(null);
  const [iframeLoading, setIframeLoading] = useState(true);
  const [iframeError, setIframeError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'calendar'>('grid');
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set());

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    type: 'Video' as 'TextBook' | 'Workbook' | 'Material' | 'Video' | 'Audio',
    board: 'ASLI_EXCLUSIVE_SCHOOLS',
    subject: '',
    topic: '',
    date: '',
    fileUrl: '',
    fileUrls: [] as string[],
    duration: ''
  });
  const [allBoardSubjectOptions, setAllBoardSubjectOptions] = useState<{ value: string; label: string; boards: Record<string, string>; }[]>([]);
  const [isLoadingAllBoardSubjects, setIsLoadingAllBoardSubjects] = useState(false);
  const [multiBoardSubjectMap, setMultiBoardSubjectMap] = useState<Record<string, string>>({});

  // Uploaded file (PDF / document) state for content upload
  const [uploadedFileUrl, setUploadedFileUrl] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [isUploadingFile, setIsUploadingFile] = useState(false);

  useEffect(() => {
    fetchSubjects();
    fetchContents();
    // Reset filters when board changes
    setFilterBySubject('all');
    setFilterByClass('all');
    setFilterByType('all');
  }, [selectedBoard]);

  const getSubjectsForBoard = async (boardCode: string, options: { silent?: boolean } = {}) => {
    const { silent = false } = options;
    try {
      const token = getAuthToken();
      const url = `${API_BASE_URL}/api/super-admin/boards/${boardCode}/subjects`;
      console.log('🌐 Fetching subjects from:', url);
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          return data.data || [];
        }
      } else {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
        if (!silent) {
        toast({
          title: 'Error',
          description: errorData.message || `Failed to fetch subjects (${response.status})`,
          variant: 'destructive'
        });
        }
      }
    } catch (error: any) {
      console.error('Failed to fetch subjects:', error);
      
      // Handle network errors specifically
      let errorMessage = 'Failed to fetch subjects';
      
      if (error instanceof TypeError) {
        if (error.message === 'Failed to fetch' || error.message.includes('ERR_NAME_NOT_RESOLVED') || error.message.includes('ERR_NETWORK')) {
          errorMessage = 'Network error: Cannot connect to server. Please check your internet connection and try again.';
        } else {
          errorMessage = `Network error: ${error.message}`;
        }
      } else if (error instanceof Error) {
        errorMessage = error.message || 'Failed to fetch subjects';
      }
      
      if (!silent) {
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive'
      });
      }
    }
    return [];
  };

  const fetchSubjects = async (boardCode = selectedBoard) => {
    const data = await getSubjectsForBoard(boardCode);
    setSubjects(data);
  };

  const loadAllBoardSubjects = async () => {
    setIsLoadingAllBoardSubjects(true);
    try {
      const subjectResults = await Promise.all(
        BOARDS.map(async (board) => {
          const data = await getSubjectsForBoard(board.value, { silent: true });
          return { board: board.value, subjects: data };
        })
      );

      const subjectMap = new Map<string, { label: string; boards: Record<string, string> }>();

      subjectResults.forEach(({ board, subjects }) => {
        subjects.forEach((subject: any) => {
          const key = subject.name?.trim().toLowerCase();
          if (!key) return;
          if (!subjectMap.has(key)) {
            subjectMap.set(key, { label: subject.name.trim(), boards: {} });
          }
          subjectMap.get(key)!.boards[board] = subject._id;
        });
      });

      const commonSubjects = Array.from(subjectMap.values()).filter(subject =>
        BOARDS.every(board => subject.boards[board.value])
      );

      setAllBoardSubjectOptions(commonSubjects.map(subject => ({
        value: subject.label,
        label: subject.label,
        boards: subject.boards
      })));

      if (commonSubjects.length === 0) {
        toast({
          title: 'No Common Subjects',
          description: 'No subject exists across every board yet. Please create matching subjects for each board to use the Aslilearn Exclusive option.',
          variant: 'destructive'
        });
      }
    } catch (error) {
      console.error('Failed to load all-board subjects:', error);
      toast({
        title: 'Error',
        description: 'Failed to load subjects for all boards. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setIsLoadingAllBoardSubjects(false);
    }
  };

  // Timeout handler for iframe loading
  useEffect(() => {
    if (viewingContent && viewingContent.fileUrl && (viewingContent.fileUrl.includes('flipbook') || viewingContent.fileUrl.includes('epathshala'))) {
      setIframeLoading(true);
      setIframeError(null);
      
      const timeout = setTimeout(() => {
        setIframeError('Content is taking too long to load. The external site may be blocking embedding. Try opening in a new tab.');
        setIframeLoading(false);
        console.error('Iframe load timeout after 30 seconds');
      }, 30000); // 30 second timeout
      
      return () => clearTimeout(timeout);
    }
  }, [viewingContent?.fileUrl]);

  const fetchContents = async () => {
    setIsLoading(true);
    try {
      const token = getAuthToken();
      const url = `${API_BASE_URL}/api/super-admin/boards/${selectedBoard}/content`;
      console.log('🌐 Fetching content from:', url);
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setContents(data.data || []);
        }
      } else {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
        toast({
          title: 'Error',
          description: errorData.message || `Failed to fetch content (${response.status})`,
          variant: 'destructive'
        });
      }
    } catch (error: any) {
      console.error('Failed to fetch contents:', error);
      
      // Handle network errors specifically
      let errorMessage = 'Failed to fetch content';
      
      if (error instanceof TypeError) {
        if (error.message === 'Failed to fetch' || error.message.includes('ERR_NAME_NOT_RESOLVED') || error.message.includes('ERR_NETWORK')) {
          errorMessage = 'Network error: Cannot connect to server. Please check your internet connection and try again.';
        } else {
          errorMessage = `Network error: ${error.message}`;
        }
      } else if (error instanceof Error) {
        errorMessage = error.message || 'Failed to fetch content';
      }
      
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };


  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();

    const isAllBoardsSelection = formData.board === ALL_BOARDS_VALUE;
    const requiredFieldsMissing = !formData.title || !formData.date || !formData.type || !formData.board;

    if (requiredFieldsMissing || (!formData.subject && !isAllBoardsSelection)) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in all required fields: title, subject, date, type, and board',
        variant: 'destructive'
      });
      return;
    }

    if (isAllBoardsSelection) {
      if (!formData.subject) {
        toast({
          title: 'Validation Error',
          description: 'Select a subject that exists across every board for Aslilearn Exclusive content.',
          variant: 'destructive'
        });
        return;
      }

      const missingBoards = BOARDS.filter(board => !multiBoardSubjectMap[board.value]);
      if (missingBoards.length > 0) {
        toast({
          title: 'Missing Subjects',
          description: `No matching subject found for: ${missingBoards.map(b => b.label).join(', ')}. Please ensure the subject exists in every board.`,
          variant: 'destructive'
        });
        return;
      }
    }


    let fileUrl = formData.fileUrl;
    let fileUrls = formData.fileUrls;

    // If a file was uploaded, prefer that URL over manual links
    if (uploadedFileUrl) {
      fileUrl = uploadedFileUrl;
      fileUrls = [uploadedFileUrl];
    } else {
    // Validate that at least one URL is provided
    if (formData.fileUrls.length > 0) {
      // Use multiple URLs if provided
      fileUrls = formData.fileUrls;
      fileUrl = formData.fileUrls[0]; // Keep first URL for backward compatibility
    } else if (formData.fileUrl) {
      // Single URL provided
      fileUrl = formData.fileUrl;
      fileUrls = [formData.fileUrl];
    } else {
      toast({
        title: 'Validation Error',
          description: 'Please upload a file or provide at least one file URL',
        variant: 'destructive'
      });
      return;
      }
    }

    try {
      const token = getAuthToken();
      
      // Prepare the request body with all required data
      const baseRequestBody: any = {
        title: formData.title.trim(),
        description: formData.description?.trim() || undefined,
        type: formData.type,
        topic: formData.topic?.trim() || undefined,
        date: formData.date, // Date in YYYY-MM-DD format
        fileUrl: fileUrl, // Keep for backward compatibility
        duration: formData.duration ? Number(formData.duration) : 0,
      };

      // Add multiple file URLs if available
      if (fileUrls && fileUrls.length > 0) {
        baseRequestBody.fileUrls = fileUrls;
      }

      if (isAllBoardsSelection) {
        const uploadResults = [];
        for (const board of BOARDS) {
          const payload = {
            ...baseRequestBody,
            board: board.value,
            subject: multiBoardSubjectMap[board.value]
          };

          console.log('📤 Uploading content for board:', board.value, 'with subject:', payload.subject);

          const response = await fetch(`${API_BASE_URL}/api/super-admin/content`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
          });

          const data = await response.json();
          uploadResults.push({
            board: board.label,
            success: response.ok && data.success,
            message: data.message
          });

          if (!response.ok || !data.success) {
            console.error(`Failed to upload for ${board.label}:`, data.message);
          }
        }

        const failedBoards = uploadResults.filter(result => !result.success);

        if (failedBoards.length === 0) {
          toast({
            title: 'Success',
            description: 'Content shared with every board successfully.'
          });
          setIsUploadModalOpen(false);
        } else if (failedBoards.length === uploadResults.length) {
          toast({
            title: 'Error',
            description: 'Content upload failed for all boards. Please try again.',
            variant: 'destructive'
          });
          return;
        } else {
          toast({
            title: 'Partial Success',
            description: `Some boards failed: ${failedBoards.map(board => board.board).join(', ')}`,
            variant: 'destructive'
          });
        }
      } else {
        const requestBody = {
          ...baseRequestBody,
          board: formData.board,
          subject: formData.subject
      };

      console.log('📤 Uploading content with data:', {
        title: requestBody.title,
        type: requestBody.type,
        board: requestBody.board,
        subject: requestBody.subject,
        date: requestBody.date,
        hasFileUrl: !!requestBody.fileUrl
      });

      const response = await fetch(`${API_BASE_URL}/api/super-admin/content`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      const data = await response.json();

      if (response.ok && data.success) {
        toast({
          title: 'Success',
          description: 'Content uploaded successfully',
        });
        setIsUploadModalOpen(false);
        } else {
          toast({
            title: 'Error',
            description: data.message || 'Failed to upload content',
            variant: 'destructive'
          });
          return;
        }
      }

      // Reset form after successful (or partially successful) upload
        setFormData({
          title: '',
          description: '',
          type: 'Video',
          board: selectedBoard,
          subject: '',
          topic: '',
          date: '',
          fileUrl: '',
        fileUrls: [],
          duration: '',
        });
      setMultiBoardSubjectMap({});
        fetchContents();
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: 'Error',
        description: 'Failed to upload content. Please try again.',
        variant: 'destructive'
      });
    }
  };

  const handleDelete = async (contentId: string) => {
    const ok = await confirm({
      title: 'Delete this content?',
      description: 'Are you sure you want to delete this content?',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;

    setIsDeleting(contentId);
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE_URL}/api/super-admin/content/${contentId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        toast({
          title: 'Success',
          description: 'Content deleted successfully',
        });
        fetchContents();
      } else {
        toast({
          title: 'Error',
          description: 'Failed to delete content',
          variant: 'destructive'
        });
      }
    } catch (error) {
      console.error('Delete error:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete content',
        variant: 'destructive'
      });
    } finally {
      setIsDeleting(null);
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'Video':
        return <Video className="w-3 h-3 sm:w-4 sm:h-4" />;
      case 'TextBook':
        return <FileText className="w-3 h-3 sm:w-4 sm:h-4" />;
      case 'Workbook':
        return <File className="w-3 h-3 sm:w-4 sm:h-4" />;
      case 'Material':
        return <File className="w-3 h-3 sm:w-4 sm:h-4" />;
      case 'Audio':
        return <File className="w-3 h-3 sm:w-4 sm:h-4" />;
      default:
        return <File className="w-3 h-3 sm:w-4 sm:h-4" />;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'Video':
        return 'bg-red-100 text-red-700';
      case 'TextBook':
        return 'bg-blue-100 text-blue-700';
      case 'Workbook':
        return 'bg-purple-100 text-purple-700';
      case 'Material':
        return 'bg-green-100 text-green-700';
      case 'Audio':
        return 'bg-yellow-100 text-yellow-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const getBoardLabel = (boardCode: string) => {
    return 'Asli Exclusive Schools';
  };

  // Extract class number from subject name (e.g., "Chemistry_1" -> "1", "Chemistry_10" -> "10")
  const extractClassNumber = (subjectName: string): string | null => {
    const match = subjectName.match(/_(\d+)$/);
    return match ? match[1] : null;
  };

  // Extract subject name without class number (e.g., "Chemistry_1" -> "Chemistry")
  const extractSubjectName = (subjectName: string): string => {
    const match = subjectName.match(/^(.+?)_\d+$/);
    return match ? match[1] : subjectName;
  };

  // Get unique subject names from contents
  const getUniqueSubjectNames = (): string[] => {
    const names = contents
      .map(c => c.subject?.name ? extractSubjectName(c.subject.name) : null)
      .filter((name): name is string => name !== null);
    return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  };

  // Get unique class numbers from contents
  const getUniqueClassNumbers = (): string[] => {
    const classes = contents
      .map(c => {
        if (c.classNumber) return c.classNumber;
        if (c.subject?.name) return extractClassNumber(c.subject.name);
        return null;
      })
      .filter((c): c is string => c !== null);
    return Array.from(new Set(classes)).sort((a, b) => parseInt(a) - parseInt(b));
  };

  // Get unique content types from contents
  const getUniqueContentTypes = (): string[] => {
    const types = contents.map(c => c.type);
    return Array.from(new Set(types)).sort((a, b) => a.localeCompare(b));
  };

  // Filter contents based on selected filters
  const filteredContents = contents.filter(content => {
    const subjectName = content.subject?.name ? extractSubjectName(content.subject.name) : null;
    const classNumber = content.classNumber || (content.subject?.name ? extractClassNumber(content.subject.name) : null);

    // Filter by subject name
    if (filterBySubject !== 'all' && subjectName !== filterBySubject) {
      return false;
    }

    // Filter by class number
    if (filterByClass !== 'all') {
      if (!classNumber || classNumber !== filterByClass) {
        return false;
      }
    }

    // Filter by content type
    if (filterByType !== 'all' && content.type !== filterByType) {
      return false;
    }

    return true;
  });

  const handleDeleteAll = async () => {
    const ok = await confirm({
      title: 'Delete all content?',
      description: 'Are you sure you want to delete ALL content? This action cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;

    setIsDeletingAll(true);
    try {
      const token = getAuthToken();
      
      // Use bulk delete endpoint for better performance
      const boardParam = selectedBoard === 'ALL_BOARDS' ? '' : `?board=${selectedBoard}`;
      const response = await fetch(`${API_BASE_URL}/api/super-admin/content${boardParam}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          toast({
            title: 'Success',
            description: data.message || `Deleted ${data.deletedCount || contents.length} content item${(data.deletedCount || contents.length) !== 1 ? 's' : ''} successfully`,
          });
          fetchContents();
        } else {
          toast({
            title: 'Error',
            description: data.message || 'Failed to delete all content',
            variant: 'destructive'
          });
        }
      } else {
        const errorData = await response.json().catch(() => ({ message: `HTTP ${response.status}` }));
        toast({
          title: 'Error',
          description: errorData.message || `Failed to delete all content (${response.status})`,
          variant: 'destructive'
        });
      }
    } catch (error: any) {
      console.error('Failed to delete all content:', error);
      toast({
        title: 'Error',
        description: `Failed to delete all content: ${error.message || 'Unknown error'}`,
        variant: 'destructive'
      });
    } finally {
      setIsDeletingAll(false);
    }
  };

  // Calendar View Functions
  interface WeekContent {
    weekStart: Date;
    weekEnd: Date;
    contents: Content[];
  }

  const getWeekStart = (date: Date): Date => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d;
  };

  const getWeekEnd = (date: Date): Date => {
    const weekStart = getWeekStart(date);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);
    return weekEnd;
  };

  const formatDateRange = (start: Date, end: Date): string => {
    const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `${startStr} - ${endStr}`;
  };

  const organizeByWeeks = (contents: Content[]): WeekContent[] => {
    if (!contents || contents.length === 0) {
      return [];
    }

    const sortedContents = [...contents].sort((a, b) => {
      const dateA = a.date ? new Date(a.date) : new Date(a.createdAt);
      const dateB = b.date ? new Date(b.date) : new Date(b.createdAt);
      return dateA.getTime() - dateB.getTime();
    });

    const weeksMap = new Map<string, Content[]>();

    sortedContents.forEach(content => {
      let contentDate: Date;
      if (content.date) {
        contentDate = typeof content.date === 'string' ? new Date(content.date) : new Date(content.date);
      } else if (content.createdAt) {
        contentDate = typeof content.createdAt === 'string' ? new Date(content.createdAt) : new Date(content.createdAt);
      } else {
        return;
      }
      
      if (isNaN(contentDate.getTime())) {
        return;
      }
      
      const weekStart = getWeekStart(contentDate);
      const weekEnd = getWeekEnd(contentDate);
      const weekKey = `${weekStart.getTime()}_${weekEnd.getTime()}`;

      if (!weeksMap.has(weekKey)) {
        weeksMap.set(weekKey, []);
      }
      weeksMap.get(weekKey)!.push(content);
    });

    const weeks: WeekContent[] = Array.from(weeksMap.entries())
      .filter(([_, contents]) => contents.length > 0)
      .map(([key, contents]) => {
        const [startTime, endTime] = key.split('_').map(Number);
        return {
          weekStart: new Date(startTime),
          weekEnd: new Date(endTime),
          contents: contents.sort((a, b) => {
            const dateA = a.date ? new Date(a.date) : new Date(a.createdAt);
            const dateB = b.date ? new Date(b.date) : new Date(b.createdAt);
            return dateA.getTime() - dateB.getTime();
          })
        };
      })
      .sort((a, b) => a.weekStart.getTime() - b.weekStart.getTime());

    return weeks;
  };

  const toggleWeek = (weekKey: string) => {
    setExpandedWeeks(prev => {
      const newSet = new Set(prev);
      if (newSet.has(weekKey)) {
        newSet.delete(weekKey);
      } else {
        newSet.add(weekKey);
      }
      return newSet;
    });
  };

  const getContentIcon = (type: string) => {
    switch (type) {
      case 'Video':
        return Video;
      case 'TextBook':
        return BookOpen;
      case 'Workbook':
        return FileText;
      case 'Material':
        return File;
      case 'Audio':
        return File;
      default:
        return File;
    }
  };

  const getContentTypeLabel = (type: string): string => {
    return type.toUpperCase();
  };

  return (
    <div className="space-y-3 sm:space-y-4 lg:space-y-6">
      {ConfirmDialog}
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">Content Management</h2>
          <p className="text-gray-600 mt-1">Upload videos and notes for AsliLearn Exclusive</p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={handleDeleteAll}
            disabled={isDeletingAll || contents.length === 0}
            variant="outline"
            className="border-red-500 text-red-600 hover:bg-red-50"
          >
            <Trash2 className={`w-3 h-3 sm:w-4 sm:h-4 mr-2 ${isDeletingAll ? 'animate-spin' : ''}`} />
            {isDeletingAll ? 'Deleting All...' : 'Delete All'}
          </Button>
          <Button
            onClick={() => setIsUploadModalOpen(true)}
            className="bg-gradient-to-r from-sky-300 to-teal-400 hover:from-sky-400 hover:to-teal-500 text-white"
          >
            <Upload className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
            Upload Content
          </Button>
        </div>
      </div>

      {/* Board Selector and Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <Label className="font-semibold">Select Board:</Label>
            <div className="relative w-48">
              <div className="absolute -inset-[2px] bg-gradient-to-r from-sky-300 to-teal-400 rounded-md"></div>
              <Select value={selectedBoard} onValueChange={setSelectedBoard}>
                <SelectTrigger className="w-full relative z-10 border-0 bg-white focus:ring-2 focus:ring-blue-700 focus:ring-offset-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BOARDS.map(board => (
                    <SelectItem key={board.value} value={board.value}>
                      {board.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Filter by Subject */}
            <Label className="font-semibold ml-4">Filter by Subject:</Label>
            <div className="relative w-48">
              <div className="absolute -inset-[2px] bg-gradient-to-r from-orange-300 to-orange-400 rounded-md"></div>
              <Select value={filterBySubject} onValueChange={setFilterBySubject}>
                <SelectTrigger className="w-full relative z-10 border-0 bg-white focus:ring-2 focus:ring-orange-500 focus:ring-offset-0">
                  <SelectValue placeholder="All Subjects" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Subjects</SelectItem>
                  {getUniqueSubjectNames().map(name => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Filter by Class */}
            <Label className="font-semibold ml-4">Filter by Class:</Label>
            <div className="relative w-48">
              <div className="absolute -inset-[2px] bg-gradient-to-r from-teal-400 to-teal-500 rounded-md"></div>
              <Select value={filterByClass} onValueChange={setFilterByClass}>
                <SelectTrigger className="w-full relative z-10 border-0 bg-white focus:ring-2 focus:ring-teal-500 focus:ring-offset-0">
                  <SelectValue placeholder="All Classes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Classes</SelectItem>
                  {getUniqueClassNumbers().map(classNum => (
                    <SelectItem key={classNum} value={classNum}>
                      Class {classNum}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Filter by Type */}
            <Label className="font-semibold ml-4">Filter by Type:</Label>
            <div className="relative w-48">
              <div className="absolute -inset-[2px] bg-gradient-to-r from-purple-300 to-purple-400 rounded-md"></div>
              <Select value={filterByType} onValueChange={setFilterByType}>
                <SelectTrigger className="w-full relative z-10 border-0 bg-white focus:ring-2 focus:ring-purple-500 focus:ring-offset-0">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {getUniqueContentTypes().map(type => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Badge variant="outline" className="ml-auto">
              {filteredContents.length} of {contents.length} items
            </Badge>
            
            {/* View Toggle */}
            <div className="flex items-center gap-2 ml-4">
              <Label className="font-semibold">View:</Label>
              <div className="flex border border-gray-300 rounded-md overflow-hidden">
                <Button
                  variant={viewMode === 'grid' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('grid')}
                  className={`rounded-none ${viewMode === 'grid' ? 'bg-sky-500 text-white hover:bg-sky-600' : ''}`}
                >
                  <Grid3x3 className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                  Grid
                </Button>
                <Button
                  variant={viewMode === 'calendar' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('calendar')}
                  className={`rounded-none ${viewMode === 'calendar' ? 'bg-sky-500 text-white hover:bg-sky-600' : ''}`}
                >
                  <Calendar className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                  Calendar
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Content View */}
      {isLoading ? (
        <div className="text-center py-12">
          <div className="w-6 h-6 sm:w-7 sm:h-7 lg:w-8 lg:h-8 border-4 border-blue-700 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading content...</p>
        </div>
      ) : contents.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2">No Content Yet</h3>
            <p className="text-gray-600 mb-4">Start uploading exclusive content for {BOARDS.find(b => b.value === selectedBoard)?.label} students</p>
            <Button onClick={() => setIsUploadModalOpen(true)} className="bg-gradient-to-r from-sky-300 to-teal-400 hover:from-sky-400 hover:to-teal-500 text-white">
              <Upload className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
              Upload First Content
            </Button>
          </CardContent>
        </Card>
      ) : filteredContents.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2">No Content Matches Filters</h3>
            <p className="text-gray-600 mb-4">Try adjusting your filter criteria</p>
            <Button 
              onClick={() => {
                setFilterBySubject('all');
                setFilterByClass('all');
                setFilterByType('all');
              }} 
              variant="outline"
            >
              Clear Filters
            </Button>
          </CardContent>
        </Card>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:p-4 lg:p-6">
          {filteredContents.map((content) => (
            <Card key={content._id} className="hover:shadow-xl transition-all duration-300 border-0 overflow-hidden" style={{
              background: 'linear-gradient(135deg, #7dd3fc 0%, #7dd3fc 20%, #2dd4bf 60%, #14b8a6 100%)'
            }}>
              <CardHeader className="bg-white/10 backdrop-blur-sm">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-base sm:text-lg mb-2 text-gray-900 font-semibold">{content.title}</CardTitle>
                    <Badge className="bg-white/20 text-white border-white/30 hover:bg-white/30">
                      {getTypeIcon(content.type)}
                      <span className="ml-1 capitalize">{content.type}</span>
                    </Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(content._id)}
                    disabled={isDeleting === content._id}
                    className="text-white hover:text-white hover:bg-white/20"
                  >
                    <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
                  </Button>
                </div>
                {content.description && (
                  <p className="text-xs sm:text-sm text-white/90 mt-2 line-clamp-2">{content.description}</p>
                )}
              </CardHeader>
              <CardContent className="bg-white/5">
                <div className="space-y-2 text-xs sm:text-sm">
                  <div className="flex items-center text-white">
                    <span className="font-medium mr-2">Subject:</span>
                    <span>{content.subject?.name || 'N/A'}</span>
                  </div>
                  <div className="flex items-center text-white">
                    <span className="font-medium mr-2">Board:</span>
                    <span>{getBoardLabel(content.board)}</span>
                  </div>
                  {content.topic && (
                    <div className="flex items-center text-white">
                      <span className="font-medium mr-2">Topic:</span>
                      <span>{content.topic}</span>
                    </div>
                  )}
                  {content.date && (
                    <div className="flex items-center text-white">
                      <span className="font-medium mr-2">Date:</span>
                      <span>{new Date(content.date).toLocaleDateString()}</span>
                    </div>
                  )}
                  {content.duration && (content.type === 'Video' || content.type === 'Audio') && (
                    <div className="flex items-center text-white">
                      <span className="font-medium mr-2">Duration:</span>
                      <span>{content.duration} min</span>
                    </div>
                  )}
                </div>
                <div className="mt-4 space-y-2">
                  {(content.fileUrls && content.fileUrls.length > 1) ? (
                    <div className="space-y-2">
                      <p className="text-xs text-white/80 mb-2">Multiple Links ({content.fileUrls.length}):</p>
                      {content.fileUrls.map((url: string, index: number) => (
                        <Button
                          key={index}
                          variant="outline"
                          size="sm"
                          className="w-full bg-white/90 text-gray-900 border-white/50 hover:bg-white hover:text-gray-900 text-left justify-start"
                          onClick={() => {
                            const contentWithUrl = { ...content, fileUrl: url };
                            setViewingContent(contentWithUrl);
                          }}
                        >
                          <Eye className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
                          <span className="truncate flex-1">Link {index + 1}</span>
                        </Button>
                      ))}
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full bg-white/90 text-gray-900 border-white/50 hover:bg-white hover:text-gray-900"
                      onClick={() => setViewingContent(content)}
                    >
                      <Eye className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                      View
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        // Calendar View
        <div className="space-y-4">
          {(() => {
            const weeks = organizeByWeeks(filteredContents);
            if (weeks.length === 0) {
              return (
                <Card>
                  <CardContent className="p-12 text-center">
                    <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2">No content available</h3>
                    <p className="text-gray-600">Content will appear here once it's uploaded.</p>
                  </CardContent>
                </Card>
              );
            }
            return weeks.map((week, index) => {
              const weekKey = `${week.weekStart.getTime()}_${week.weekEnd.getTime()}`;
              const isExpanded = expandedWeeks.has(weekKey) || (expandedWeeks.size === 0 && index === 0);

              return (
                <Card key={weekKey} className="overflow-hidden">
                  {/* Week Header */}
                  <button
                    onClick={() => toggleWeek(weekKey)}
                    className="w-full px-4 py-3 bg-gradient-to-r from-sky-50 to-teal-50 hover:from-sky-100 hover:to-teal-100 transition-colors flex items-center justify-between"
                  >
                    <span className="font-medium text-gray-900">
                      {formatDateRange(week.weekStart, week.weekEnd)}
                    </span>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="bg-white">
                        {week.contents.length} item{week.contents.length !== 1 ? 's' : ''}
                      </Badge>
                      {isExpanded ? (
                        <ChevronUp className="w-3 h-3 sm:w-4 sm:h-4 text-gray-500" />
                      ) : (
                        <ChevronDown className="w-3 h-3 sm:w-4 sm:h-4 text-gray-500" />
                      )}
                    </div>
                  </button>

                  {/* Week Content */}
                  {isExpanded && (
                    <CardContent className="p-4 space-y-3">
                      {week.contents.map((content) => {
                        const Icon = getContentIcon(content.type);
                        const contentTypeLabel = getContentTypeLabel(content.type);
                        const subjectName = content.subject?.name || 'N/A';
                        const classNumber = content.classNumber || (content.subject?.name ? extractClassNumber(content.subject.name) : null);

                        return (
                          <div
                            key={content._id}
                            className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-4 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:shadow-md transition-all duration-200 cursor-pointer group min-w-0"
                            onClick={() => setViewingContent(content)}
                          >
                            <div className="flex items-start space-x-3 sm:space-x-4 flex-1 min-w-0">
                              <div className="p-3 bg-gradient-to-br from-sky-100 to-teal-100 rounded-lg group-hover:from-sky-200 group-hover:to-teal-200 transition-colors shrink-0">
                                <Icon className="w-4 h-4 sm:w-5 sm:h-5 text-sky-600" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2 mb-1">
                                  <Badge className={`text-xs ${getTypeColor(content.type)}`}>
                                    {contentTypeLabel}
                                  </Badge>
                                  {content.topic && (
                                    <Badge variant="outline" className="text-xs max-w-full whitespace-normal break-words">
                                      {content.topic}
                                    </Badge>
                                  )}
                                </div>
                                <h4 className="font-semibold text-gray-900 text-sm sm:text-base mb-1 break-words">{content.title}</h4>
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm text-gray-600">
                                  <span className="flex items-center gap-1 break-words">
                                    <BookOpen className="w-3 h-3 shrink-0" />
                                    {extractSubjectName(subjectName)}
                                  </span>
                                  {classNumber && (
                                    <span className="flex items-center gap-1">
                                      <GraduationCap className="w-3 h-3 shrink-0" />
                                      Class {classNumber}
                                    </span>
                                  )}
                                  {content.date && (
                                    <span className="flex items-center gap-1">
                                      <Calendar className="w-3 h-3 shrink-0" />
                                      {new Date(content.date).toLocaleDateString()}
                                    </span>
                                  )}
                                  {content.duration && (
                                    <span className="text-xs text-gray-500">
                                      {content.duration} min
                                    </span>
                                  )}
                                </div>
                                {content.description && (
                                  <p className="text-xs text-gray-500 mt-1 line-clamp-2 break-words">{content.description}</p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 sm:ml-4 w-full sm:w-auto shrink-0">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setViewingContent(content);
                                }}
                                className="flex-1 sm:flex-none bg-sky-50 hover:bg-sky-100 border-sky-200 text-sky-700"
                              >
                                <Eye className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                                View
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(content._id);
                                }}
                                disabled={isDeleting === content._id}
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              >
                                <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </CardContent>
                  )}
                </Card>
              );
            });
          })()}
        </div>
      )}

      {/* Upload Modal */}
      <Dialog open={isUploadModalOpen} onOpenChange={(open) => {
        setIsUploadModalOpen(open);
        if (open) {
          // Sync form board with selected board when modal opens
          setFormData(prev => ({ ...prev, board: selectedBoard, subject: '' }));
        }
      }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl sm:text-2xl font-bold">Upload New Content</DialogTitle>
            <DialogDescription>
              Upload exclusive videos and notes for AsliLearn students
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpload} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="board">Board *</Label>
                <Select
                  value={formData.board}
                  onValueChange={async (value) => {
                    setFormData({ ...formData, board: value, subject: '' }); // Reset subject when board changes
                    setMultiBoardSubjectMap({});
                    if (value === ALL_BOARDS_VALUE) {
                      setSubjects([]);
                      if (allBoardSubjectOptions.length === 0) {
                        await loadAllBoardSubjects();
                      }
                    } else {
                    setSelectedBoard(value);
                      const boardSubjects = await getSubjectsForBoard(value);
                      setSubjects(boardSubjects);
                    }
                  }}
                >
                  <SelectTrigger id="board">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BOARD_SELECT_OPTIONS.map(board => (
                      <SelectItem key={board.value} value={board.value}>
                        {board.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {formData.board === ALL_BOARDS_VALUE && (
                  <p className="text-xs text-blue-700 mt-2">
                    Selecting Aslilearn Exclusive will duplicate this content across every board that has the chosen subject.
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="type">Content Type *</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value: any) => {
                    setFormData({ ...formData, type: value });
                  }}
                >
                  <SelectTrigger id="type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TextBook">TextBook</SelectItem>
                    <SelectItem value="Workbook">Workbook</SelectItem>
                    <SelectItem value="Material">Material</SelectItem>
                    <SelectItem value="Video">Video</SelectItem>
                    <SelectItem value="Audio">Audio</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="subject">Subject *</Label>
              {formData.board === ALL_BOARDS_VALUE ? (
                isLoadingAllBoardSubjects ? (
                  <div className="text-xs sm:text-sm text-gray-600">Loading subjects across boards...</div>
                ) : allBoardSubjectOptions.length === 0 ? (
                  <p className="text-xs text-yellow-600">
                    ⚠️ No common subjects exist across every board. Please create matching subjects for each board to use this option.
                  </p>
                ) : (
                  <Select
                    value={formData.subject}
                    onValueChange={(value) => {
                      setFormData({ ...formData, subject: value });
                      const mapping = allBoardSubjectOptions.find(option => option.value === value);
                      setMultiBoardSubjectMap(mapping?.boards || {});
                    }}
                  >
                    <SelectTrigger id="subject">
                      <SelectValue placeholder="Select a subject available in every board" />
                    </SelectTrigger>
                    <SelectContent>
                      {allBoardSubjectOptions.map(subject => (
                        <SelectItem key={subject.value} value={subject.value}>
                          {subject.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )
              ) : subjects.length === 0 ? (
                <div className="space-y-2">
                  <Select disabled>
                    <SelectTrigger id="subject">
                      <SelectValue placeholder="No subjects available" />
                    </SelectTrigger>
                  </Select>
                  <p className="text-xs text-yellow-600">
                    ⚠️ No subjects found for {BOARDS.find(b => b.value === formData.board)?.label}. 
                    Please create subjects first in Subject Management.
                  </p>
                </div>
              ) : (
                <Select
                  value={formData.subject}
                  onValueChange={(value) => setFormData({ ...formData, subject: value })}
                >
                  <SelectTrigger id="subject">
                    <SelectValue placeholder="Select subject" />
                  </SelectTrigger>
                  <SelectContent>
                    {subjects.map(subject => (
                      <SelectItem key={subject._id} value={subject._id}>
                        {subject.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="date">Date *</Label>
                <Input
                  id="date"
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  required
                />
              </div>
            </div>

            <div>
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Enter content title"
                required
              />
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Enter content description"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="topic">Topic (Optional)</Label>
                <Input
                  id="topic"
                  value={formData.topic}
                  onChange={(e) => setFormData({ ...formData, topic: e.target.value })}
                  placeholder="e.g., Algebra, Mechanics"
                />
              </div>
              {(formData.type === 'Video' || formData.type === 'Audio') && (
                <div>
                  <Label htmlFor="duration">Duration (minutes)</Label>
                  <Input
                    id="duration"
                    type="number"
                    value={formData.duration}
                    onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                    placeholder="0"
                  />
                </div>
              )}
            </div>

            <div>
              <Label htmlFor="file">Content File *</Label>
              <div className="space-y-3">
              <div className="space-y-2">
                  {/* File upload (PDF / document). If a file is uploaded we use that instead of URLs */}
                  <div className="flex items-center gap-3">
                    <input
                      id="content-file"
                      type="file"
                      accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx"
                      className="text-xs sm:text-sm"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;

                        try {
                          setIsUploadingFile(true);
                          setUploadedFileUrl(null);
                          setUploadedFileName(null);

                          const token = getAuthToken();
                          const formDataUpload = new FormData();
                          formDataUpload.append('file', file);

                          const uploadResponse = await fetch(
                            `${API_BASE_URL}/api/super-admin/content/upload-file?contentType=${encodeURIComponent(formData.type)}`,
                            {
                              method: 'POST',
                              headers: {
                                'Authorization': `Bearer ${token || ''}`,
                              },
                              body: formDataUpload,
                            }
                          );

                          const uploadData = await uploadResponse.json();
                          if (!uploadResponse.ok || !uploadData.success) {
                            throw new Error(uploadData.message || 'Failed to upload file');
                          }

                          setUploadedFileUrl(uploadData.fileUrl);
                          setUploadedFileName(uploadData.originalName || file.name);

                          toast({
                            title: 'File uploaded',
                            description: 'PDF uploaded successfully. It will be used for this content.',
                          });
                        } catch (error: any) {
                          console.error('File upload error:', error);
                          toast({
                            title: 'File upload failed',
                            description: error?.message || 'Could not upload file. Please try again.',
                            variant: 'destructive',
                          });
                        } finally {
                          setIsUploadingFile(false);
                        }
                      }}
                    />
                    {isUploadingFile && (
                      <span className="text-xs text-gray-500">Uploading...</span>
                    )}
                  </div>

                  {uploadedFileUrl && (
                    <div className="p-2 bg-green-50 border border-green-200 rounded-md flex items-center justify-between">
                      <div>
                        <p className="text-xs text-green-700 font-medium">File selected:</p>
                        <p className="text-xs text-gray-800 truncate max-w-xs">
                          {uploadedFileName || uploadedFileUrl}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => {
                          setUploadedFileUrl(null);
                          setUploadedFileName(null);
                        }}
                      >
                        <X className="h-3 w-3 sm:h-4 sm:w-4" />
                      </Button>
                    </div>
                  )}

                  {/* Fallback: URL links (optional when file uploaded) */}
                  <div className="flex items-center gap-2">
                    <Input
                      id="fileUrl"
                      value={formData.fileUrl}
                      onChange={(e) => {
                        setFormData({ ...formData, fileUrl: e.target.value });
                      }}
                      placeholder="https://example.com/video.mp4 or Google Drive link"
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (formData.fileUrl.trim()) {
                          setFormData({
                            ...formData,
                            fileUrls: [...formData.fileUrls, formData.fileUrl.trim()],
                            fileUrl: ''
                          });
                        }
                      }}
                      disabled={!formData.fileUrl.trim()}
                    >
                      <Plus className="h-3 w-3 sm:h-4 sm:w-4" />
                    </Button>
                  </div>
                  
                  {formData.fileUrls.length > 0 && (
                    <div className="space-y-2 mt-2">
                      {formData.fileUrls.map((url, index) => (
                        <div key={index} className="flex items-center gap-2 p-2 bg-gray-50 rounded-md border">
                          <span className="flex-1 text-xs sm:text-sm text-gray-700 truncate">{url}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setFormData({
                                ...formData,
                                fileUrls: formData.fileUrls.filter((_, i) => i !== index)
                              });
                            }}
                            className="text-red-600 hover:text-red-700"
                          >
                            <X className="h-3 w-3 sm:h-4 sm:w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <p className="text-xs text-blue-600 mt-1">
                  💡 Tip: You can either upload a PDF/file above or use one or more links for this content.
                </p>
              </div>
            </div>


            <div className="flex justify-end space-x-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setIsUploadModalOpen(false)}>
                Cancel
              </Button>
              <Button 
                type="submit" 
                className="bg-gradient-to-r from-sky-300 to-teal-400 hover:from-sky-400 hover:to-teal-500 text-white"
              >
                <Upload className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
                Upload Content
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* View Content Modal */}
      <Dialog open={!!viewingContent} onOpenChange={(open) => {
        if (!open) {
          setViewingContent(null);
          setIframeLoading(true);
          setIframeError(null);
        }
      }}>
        <DialogContent className="max-w-[96vw] w-full h-[90vh] max-h-[90vh] overflow-hidden flex flex-col p-0 rounded-2xl shadow-2xl">
          <DialogHeader className="px-3 sm:px-4 lg:px-6 pt-5 pb-3 flex-shrink-0 border-b bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white">
            <div className="flex items-center justify-between gap-4">
              <div>
                <DialogTitle className="text-lg sm:text-xl font-semibold break-words pr-2">
                  {viewingContent?.title || 'Content'}
                </DialogTitle>
                <DialogDescription className="text-slate-200/80">
              {viewingContent?.description || 'View content'}
            </DialogDescription>
              </div>
          {viewingContent && (
                <div className="hidden md:flex items-center gap-4 text-xs text-slate-200/80">
                  <span><span className="font-semibold">Subject:</span> {viewingContent.subject?.name || 'N/A'}</span>
                  <span><span className="font-semibold">Type:</span> {viewingContent.type}</span>
                </div>
              )}
                </div>
          </DialogHeader>
          
          {viewingContent && (
            <div className="flex-1 flex flex-col overflow-hidden px-3 sm:px-4 lg:px-6 pb-5 pt-3 bg-slate-50">
              {/* Compact meta row above viewer */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 text-xs mb-3 text-slate-600">
                <div><span className="font-semibold">Board:</span> {getBoardLabel(viewingContent.board)}</div>
                {viewingContent.topic && (
                  <div><span className="font-semibold">Topic:</span> {viewingContent.topic}</div>
                )}
                {viewingContent.date && (
                  <div><span className="font-semibold">Date:</span> {new Date(viewingContent.date).toLocaleDateString()}</div>
                )}
                {viewingContent.duration && (viewingContent.type === 'Video' || viewingContent.type === 'Audio') && (
                  <div><span className="font-semibold">Duration:</span> {viewingContent.duration} min</div>
                )}
              </div>

              {/* Content Display - Takes remaining space */}
              <div className="flex-1 flex flex-col min-h-0 rounded-xl bg-white border border-slate-200 overflow-hidden shadow-inner">
                {(() => {
                  const fileUrl = viewingContent.fileUrl.startsWith('http') 
                    ? viewingContent.fileUrl 
                    : `${API_BASE_URL}${viewingContent.fileUrl}`;
                  
                  // Check if it's a YouTube URL
                  const isYouTube = fileUrl.includes('youtube.com') || fileUrl.includes('youtu.be');
                  
                  // Function to extract YouTube video ID
                  const getYouTubeId = (url: string) => {
                    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
                    const match = url.match(regExp);
                    return (match && match[2].length === 11) ? match[2] : null;
                  };
                  
                  if (viewingContent.type === 'Video') {
                    if (isYouTube) {
                      const videoId = getYouTubeId(fileUrl);
                      if (videoId) {
                        return (
                          <div className="aspect-video">
                            <iframe
                              className="w-full h-full rounded-lg"
                              src={`https://www.youtube.com/embed/${videoId}`}
                              title={viewingContent.title}
                              frameBorder="0"
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                              allowFullScreen
                            />
                          </div>
                        );
                      }
                    }
                    // Regular video file
                    return (
                      <div className="aspect-video">
                        <video
                          controls
                          className="w-full h-full rounded-lg"
                          src={fileUrl}
                        >
                          Your browser does not support the video tag.
                        </video>
                      </div>
                    );
                  } else if (viewingContent.type === 'Audio') {
                    return (
                      <div className="p-4">
                        <audio
                          controls
                          className="w-full"
                          src={fileUrl}
                        >
                          Your browser does not support the audio tag.
                        </audio>
                      </div>
                    );
                  } else {
                    // Documents/PDFs/Flipbooks - use iframe with full browser-like experience
                    const isFlipbook = fileUrl.includes('flipbook') || fileUrl.includes('epathshala');
                    const isPDF = fileUrl.toLowerCase().endsWith('.pdf') || fileUrl.includes('.pdf');
                    const isExternal = fileUrl.startsWith('http://') || fileUrl.startsWith('https://');

                    // Our own uploaded files (served from backend) should NOT go through proxy
                    const isOurBackend =
                      fileUrl.startsWith(API_BASE_URL) ||
                      fileUrl.startsWith('/uploads') ||
                      fileUrl.includes('139.59.18.237') ||
                      fileUrl.includes('aslilearn.ai');

                    // Use proxy ONLY for external flipbook-style HTML viewers (epathshala, etc.)
                    // Load pure PDF URLs directly in the iframe to avoid network/proxy issues.
                    const shouldUseProxy =
                      isExternal &&
                      !isOurBackend &&
                      isFlipbook &&
                      !isPDF;

                    const iframeSrc = shouldUseProxy
                      ? `${API_BASE_URL}/api/proxy/content?url=${encodeURIComponent(fileUrl)}`
                      : fileUrl;
                    
                    console.log('Loading content:', { 
                      isFlipbook, 
                      isPDF,
                      fileUrl, 
                      iframeSrc,
                      API_BASE_URL 
                    });
                    
                    return (
                      <div className="flex-1 w-full h-full flex flex-col relative bg-white overflow-hidden">
                        {iframeLoading && !iframeError && (
                          <div className="absolute inset-0 flex items-center justify-center bg-gray-50 z-10">
                            <div className="text-center">
                              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                              <p className="text-xs sm:text-sm text-gray-600">Loading content...</p>
                              {isFlipbook && (
                                <p className="text-xs text-gray-500 mt-2">Using proxy to load flipbook...</p>
                              )}
                            </div>
                          </div>
                        )}
                        {iframeError ? (
                          <div className="absolute inset-0 flex items-center justify-center bg-gray-50 z-10">
                            <div className="text-center p-3 sm:p-4 lg:p-6">
                              <div className="text-red-500 mb-4">
                                <File className="w-16 h-16 mx-auto mb-2" />
                                <p className="text-xs sm:text-sm font-medium">Failed to load content</p>
                                <p className="text-xs text-gray-500 mt-1">{iframeError}</p>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setIframeError(null);
                                  setIframeLoading(true);
                                  // Force reload by updating key
                                  const iframe = document.querySelector('iframe[title="' + viewingContent.title + '"]') as HTMLIFrameElement;
                                  if (iframe) {
                                    const currentSrc = iframe.getAttribute('src');
                                    if (currentSrc) iframe.setAttribute('src', currentSrc);
                                  }
                                }}
                                className="mr-2"
                              >
                                Retry
                              </Button>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => openPdfInAppReader(fileUrl, viewingContent.title)}
                              >
                                <ExternalLink className="w-3 h-3 mr-1" />
                                Open in New Tab
                              </Button>
                            </div>
                          </div>
                        ) : null}
                        <iframe
                          key={iframeSrc} // Force reload when src changes
                          src={iframeSrc}
                          className="w-full h-full border-0 flex-1"
                          title={viewingContent.title}
                          allow="fullscreen; autoplay; encrypted-media; picture-in-picture; geolocation; microphone; camera"
                          allowFullScreen
                          referrerPolicy="no-referrer-when-downgrade"
                          onLoad={() => {
                            setIframeLoading(false);
                            setIframeError(null);
                            console.log('Iframe loaded successfully');
                            // Check if iframe actually has content
                            setTimeout(() => {
                              const iframe = document.querySelector(`iframe[title="${viewingContent.title}"]`) as HTMLIFrameElement;
                              if (iframe) {
                                try {
                                  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                                  if (iframeDoc && iframeDoc.body && iframeDoc.body.innerHTML.trim() === '') {
                                    console.warn('Iframe loaded but appears empty');
                                  }
                                } catch (e) {
                                  // Cross-origin, can't check - that's normal
                                  console.log('Cannot check iframe content (cross-origin)');
                                }
                              }
                            }, 2000);
                          }}
                          onError={() => {
                            setIframeLoading(false);
                            setIframeError('Failed to load iframe content. The external site may be blocking embedding.');
                            console.error('Iframe load error');
                          }}
                          style={{ display: (iframeLoading || iframeError) ? 'none' : 'block' }}
                        />
                        {/* Optional: Small toolbar at bottom */}
                        <div className="absolute bottom-2 right-2 z-20">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => openPdfInAppReader(fileUrl, viewingContent.title)}
                            className="text-xs shadow-lg"
                          >
                            <ExternalLink className="w-3 h-3 mr-1" />
                            Open in New Tab
                          </Button>
                        </div>
                      </div>
                    );
                  }
                })()}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

