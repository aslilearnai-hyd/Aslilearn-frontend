import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, BookOpen, Trash2, Edit, AlertCircle } from 'lucide-react';
import { API_BASE_URL } from '@/lib/api-config';
import { useToast } from '@/hooks/use-toast';
import { useConfirm } from '@/hooks/use-confirm';
import { getAuthToken } from '@/lib/auth-utils';

interface Subject {
  _id: string;
  name: string;
  code?: string;
  description?: string;
  board: string;
  classNumber?: string;
  isActive: boolean;
  createdAt: string;
}

const BOARDS = [
  { value: 'ASLI_EXCLUSIVE_SCHOOLS', label: 'Asli Exclusive Schools' }
];

export default function SubjectManagement() {
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const [selectedBoard, setSelectedBoard] = useState<string>('ASLI_EXCLUSIVE_SCHOOLS');
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [filterBySubject, setFilterBySubject] = useState<string>('all');
  const [filterByClass, setFilterByClass] = useState<string>('all');

  const [formData, setFormData] = useState({
    name: '',
    code: '',
    description: '',
    board: 'ASLI_EXCLUSIVE_SCHOOLS'
  });

  useEffect(() => {
    fetchSubjects();
    // Reset filters when board changes
    setFilterBySubject('all');
    setFilterByClass('all');
  }, [selectedBoard]);

  const fetchSubjects = async () => {
    setIsLoading(true);
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE_URL}/api/super-admin/boards/${selectedBoard}/subjects`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setSubjects(data.data || []);
        }
      }
    } catch (error) {
      console.error('Failed to fetch subjects:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch subjects',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !selectedBoard) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in all required fields',
        variant: 'destructive'
      });
      return;
    }

    try {
      const token = getAuthToken();
      
      // Build request body, only including fields with values
      // Use formData.board to ensure we use the board selected in the form
      const requestBody: any = {
        name: formData.name.trim(),
        board: formData.board || selectedBoard
      };
      
      if (formData.code && formData.code.trim()) {
        requestBody.code = formData.code.trim();
      }
      
      if (formData.description && formData.description.trim()) {
        requestBody.description = formData.description.trim();
      }
      
      console.log('📤 Creating subject with data:', requestBody);
      console.log('🌐 API Base URL:', API_BASE_URL);
      console.log('🔗 Full URL:', `${API_BASE_URL}/api/super-admin/subjects`);
      
      const response = await fetch(`${API_BASE_URL}/api/super-admin/subjects`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          toast({
            title: 'Success',
            description: 'Subject created successfully',
          });
          setIsAddModalOpen(false);
          setFormData({
            name: '',
            code: '',
            description: '',
            board: selectedBoard
          });
          fetchSubjects();
        } else {
          toast({
            title: 'Error',
            description: data.message || 'Failed to create subject',
            variant: 'destructive'
          });
        }
      } else {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch (e) {
          errorData = { message: errorText || `Server error: ${response.status}` };
        }
        console.error('Error response:', errorData);
        toast({
          title: 'Error',
          description: errorData.message || errorData.error || 'Failed to create subject',
          variant: 'destructive'
        });
      }
    } catch (error: any) {
      console.error('Create error:', error);
      
      // Handle network errors specifically
      let errorMessage = 'Failed to create subject';
      
      if (error instanceof TypeError) {
        if (error.message === 'Failed to fetch' || error.message.includes('ERR_NAME_NOT_RESOLVED') || error.message.includes('ERR_NETWORK')) {
          errorMessage = 'Network error: Cannot connect to server. Please check your internet connection and try again.';
        } else {
          errorMessage = `Network error: ${error.message}`;
        }
      } else if (error instanceof Error) {
        errorMessage = error.message || 'Failed to create subject';
      }
      
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive'
      });
    }
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

  // Get unique subject names and class numbers from subjects
  const getUniqueSubjectNames = (): string[] => {
    const names = subjects.map(s => extractSubjectName(s.name));
    return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  };

  const getUniqueClassNumbers = (): string[] => {
    const classes = subjects
      .map(s => extractClassNumber(s.name))
      .filter((c): c is string => c !== null);
    return Array.from(new Set(classes)).sort((a, b) => parseInt(a) - parseInt(b));
  };

  // Filter subjects based on selected filters
  const filteredSubjects = subjects.filter(subject => {
    const subjectName = extractSubjectName(subject.name);
    const classNumber = extractClassNumber(subject.name);

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

    return true;
  });

  const handleDelete = async (subjectId: string) => {
    const ok = await confirm({
      title: 'Delete this subject?',
      description: 'Are you sure you want to delete this subject? This will also delete all associated content.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;

    setIsDeleting(subjectId);
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE_URL}/api/super-admin/subjects/${subjectId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        toast({
          title: 'Success',
          description: 'Subject deleted successfully',
        });
        fetchSubjects();
      } else {
        toast({
          title: 'Error',
          description: 'Failed to delete subject',
          variant: 'destructive'
        });
      }
    } catch (error) {
      console.error('Delete error:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete subject',
        variant: 'destructive'
      });
    } finally {
      setIsDeleting(null);
    }
  };

  return (
    <div className="space-y-3 sm:space-y-4 lg:space-y-6">
      {ConfirmDialog}
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 break-words">Subject Management</h2>
          <p className="text-gray-600 mt-1 break-words">Create and manage subjects for each board</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button
            onClick={() => setIsAddModalOpen(true)}
            className="w-full sm:w-auto bg-gradient-to-r from-sky-300 to-teal-400 hover:from-sky-400 hover:to-teal-500 text-white"
          >
            <Plus className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
            Add Subject
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

            <Badge variant="outline" className="ml-auto">
              {filteredSubjects.length} of {subjects.length} subjects
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Subjects List */}
      {isLoading ? (
        <div className="text-center py-12">
          <div className="w-6 h-6 sm:w-7 sm:h-7 lg:w-8 lg:h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading subjects...</p>
        </div>
      ) : subjects.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <BookOpen className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2">No Subjects Yet</h3>
            <p className="text-gray-600 mb-4">Start creating subjects for {BOARDS.find(b => b.value === selectedBoard)?.label} board</p>
            <Button onClick={() => setIsAddModalOpen(true)} className="bg-gradient-to-r from-orange-400 to-sky-400 hover:from-orange-500 hover:to-sky-500 text-white">
              <Plus className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
              Create First Subject
            </Button>
          </CardContent>
        </Card>
      ) : filteredSubjects.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <BookOpen className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2">No Subjects Match Filters</h3>
            <p className="text-gray-600 mb-4">Try adjusting your filter criteria</p>
            <Button 
              onClick={() => {
                setFilterBySubject('all');
                setFilterByClass('all');
              }} 
              variant="outline"
            >
              Clear Filters
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:p-4 lg:p-6">
          {filteredSubjects.map((subject, index) => {
            // Randomly assign one of the three dashboard colors
            const colorSchemes = [
              { bg: 'from-orange-300 to-orange-400', text: 'text-white', badge: 'bg-orange-500/20 text-orange-100' },
              { bg: 'from-sky-300 to-sky-400', text: 'text-white', badge: 'bg-sky-500/20 text-sky-100' },
              { bg: 'from-teal-400 to-teal-500', text: 'text-white', badge: 'bg-teal-500/20 text-teal-100' }
            ];
            const colorScheme = colorSchemes[index % 3];
            
            return (
              <Card key={subject._id} className={`bg-gradient-to-br ${colorScheme.bg} border-0 hover:shadow-xl transition-all duration-300`}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-base sm:text-lg mb-1 text-gray-900">{subject.name}</CardTitle>
                      {subject.code && (
                        <Badge className={`mb-2 ${colorScheme.badge} border-0`}>
                          {subject.code}
                        </Badge>
                      )}
                      {subject.description && (
                        <p className={`text-xs sm:text-sm ${colorScheme.text}/90 mt-2 line-clamp-2`}>{subject.description}</p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(subject._id)}
                      disabled={isDeleting === subject._id}
                      className="text-white hover:text-white/80 hover:bg-white/20"
                    >
                      <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {subject.classNumber && (
                    <div className="flex items-center justify-between text-xs sm:text-sm mb-2">
                      <span className={colorScheme.text + '/90'}>Class:</span>
                      <Badge className={`${colorScheme.badge} border-0`}>
                        Class {subject.classNumber}
                      </Badge>
                    </div>
                  )}
                  <div className={`flex items-center justify-between text-xs sm:text-sm ${subject.classNumber ? 'mb-2' : ''}`}>
                    <span className={colorScheme.text + '/90'}>Board:</span>
                    <Badge className="bg-orange-600 text-white border-2 border-white/50 shadow-lg font-semibold">
                      Asli Exclusive Schools
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-xs sm:text-sm mt-2">
                    <span className={colorScheme.text + '/90'}>Status:</span>
                    <Badge className={subject.isActive ? 'bg-teal-600 text-white border-2 border-white/50 shadow-lg font-semibold' : 'bg-gray-600 text-white border-2 border-white/50 shadow-lg font-semibold'}>
                      {subject.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add Subject Modal */}
      <Dialog open={isAddModalOpen} onOpenChange={(open) => {
        setIsAddModalOpen(open);
        if (open) {
          // Initialize form with current board when modal opens
          setFormData({
            name: '',
            code: '',
            description: '',
            board: selectedBoard
          });
        } else {
          // Reset form when modal closes
          setFormData({
            name: '',
            code: '',
            description: '',
            board: selectedBoard
          });
        }
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl sm:text-2xl font-bold">Create New Subject</DialogTitle>
            <DialogDescription>
              Add a new subject for {BOARDS.find(b => b.value === selectedBoard)?.label} board
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <Label htmlFor="board">Board *</Label>
              <Select
                value={formData.board}
                onValueChange={(value) => {
                  setFormData({ ...formData, board: value });
                  setSelectedBoard(value);
                }}
              >
                <SelectTrigger id="board">
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

            <div>
              <Label htmlFor="name">Subject Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Mathematics, Physics, Chemistry"
                required
              />
            </div>

            <div>
              <Label htmlFor="code">Subject Code (Optional)</Label>
              <Input
                id="code"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                placeholder="e.g., MATH, PHY, CHEM"
              />
            </div>

            <div>
              <Label htmlFor="description">Description (Optional)</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Enter subject description"
                rows={3}
              />
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <div className="flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-600 mt-0.5" />
                <div className="text-xs sm:text-sm text-yellow-800">
                  <p className="font-medium">Note:</p>
                  <p>This subject will be created for <strong>{BOARDS.find(b => b.value === formData.board)?.label}</strong> board. Make sure this is correct before proceeding.</p>
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setIsAddModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-gradient-to-r from-orange-400 to-sky-400 hover:from-orange-500 hover:to-sky-500 text-white">
                <Plus className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
                Create Subject
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

