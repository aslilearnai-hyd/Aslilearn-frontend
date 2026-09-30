import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { 
  Plus, 
  Search, 
  Filter, 
  Edit, 
  Trash2, 
  BookOpen, 
  Clock,
  Users,
  Star,
  MoreHorizontal,
  ArrowRight
} from 'lucide-react';
import { useConfirm } from '@/hooks/use-confirm';

interface LearningPath {
  id: number;
  title: string;
  description: string;
  subjectIds: string[];
  difficulty: string;
  estimatedHours: number;
  createdAt: string;
}

const LearningPathManagement = () => {
  const { confirm, ConfirmDialog } = useConfirm();
  const [learningPaths, setLearningPaths] = useState<LearningPath[]>([]);
  const [filteredPaths, setFilteredPaths] = useState<LearningPath[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDifficulty, setFilterDifficulty] = useState('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPath, setEditingPath] = useState<LearningPath | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    subjectIds: [] as string[],
    difficulty: 'beginner',
    estimatedHours: ''
  });

  useEffect(() => {
    fetchLearningPaths();
  }, []);

  useEffect(() => {
    filterPaths();
  }, [learningPaths, searchTerm, filterDifficulty]);

  const fetchLearningPaths = async () => {
    try {
      const response = await fetch('/api/learning-paths');
      const data = await response.json();
      setLearningPaths(data);
    } catch (error) {
      console.error('Failed to fetch learning paths:', error);
    }
  };

  const filterPaths = () => {
    let filtered = learningPaths;

    if (searchTerm) {
      filtered = filtered.filter(path =>
        path.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        path.description.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (filterDifficulty !== 'all') {
      filtered = filtered.filter(path => path.difficulty === filterDifficulty);
    }

    setFilteredPaths(filtered);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const pathData = {
        ...formData,
        estimatedHours: parseInt(formData.estimatedHours)
      };

      let response: Response;
      if (editingPath) {
        // Update existing path
        response = await fetch(`/api/admin/learning-paths/${editingPath.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(pathData)
        });
      } else {
        // Create new path
        response = await fetch('/api/admin/learning-paths', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(pathData)
        });
      }

      if (response.ok) {
        fetchLearningPaths();
        resetForm();
        setIsDialogOpen(false);
      }
    } catch (error) {
      console.error('Failed to save learning path:', error);
    }
  };

  const handleEdit = (path: LearningPath) => {
    setEditingPath(path);
    setFormData({
      title: path.title,
      description: path.description,
      subjectIds: path.subjectIds,
      difficulty: path.difficulty,
      estimatedHours: path.estimatedHours.toString()
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: number) => {
    const ok = await confirm({
      title: 'Delete this learning path?',
      description: 'Are you sure you want to delete this learning path?',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    try {
      const response = await fetch(`/api/admin/learning-paths/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (response.ok) {
        fetchLearningPaths();
      }
    } catch (error) {
      console.error('Failed to delete learning path:', error);
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      subjectIds: [],
      difficulty: 'beginner',
      estimatedHours: ''
    });
    setEditingPath(null);
  };

  const addSubject = () => {
    setFormData({
      ...formData,
      subjectIds: [...formData.subjectIds, '']
    });
  };

  const updateSubject = (index: number, value: string) => {
    const newSubjects = [...formData.subjectIds];
    newSubjects[index] = value;
    setFormData({ ...formData, subjectIds: newSubjects });
  };

  const removeSubject = (index: number) => {
    const newSubjects = formData.subjectIds.filter((_, i) => i !== index);
    setFormData({ ...formData, subjectIds: newSubjects });
  };

  return (
    <div className="space-y-3 sm:space-y-4 lg:space-y-6">
      {ConfirmDialog}
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Learning Path Management</h2>
          <p className="text-gray-600">Create and manage structured learning journeys</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm} className="bg-gradient-to-r from-green-600 to-green-700">
              <Plus className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
              Create Learning Path
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingPath ? 'Edit Learning Path' : 'Create New Learning Path'}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label>Subjects</Label>
                <div className="space-y-2">
                  {formData.subjectIds.map((subject, index) => (
                    <div key={index} className="flex items-center space-x-2">
                      <Input
                        value={subject}
                        onChange={(e) => updateSubject(index, e.target.value)}
                        placeholder="Enter subject name"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => removeSubject(index)}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                  <Button type="button" variant="outline" onClick={addSubject}>
                    Add Subject
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="difficulty">Difficulty</Label>
                  <Select value={formData.difficulty} onValueChange={(value) => setFormData({ ...formData, difficulty: value })}>
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
                <div className="space-y-2">
                  <Label htmlFor="estimatedHours">Estimated Hours</Label>
                  <Input
                    id="estimatedHours"
                    type="number"
                    value={formData.estimatedHours}
                    onChange={(e) => setFormData({ ...formData, estimatedHours: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">
                  {editingPath ? 'Update Path' : 'Create Path'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-3 h-3 sm:w-4 sm:h-4 text-gray-400" />
                <Input
                  placeholder="Search learning paths..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="px-0 pl-10 sm:pl-11"
                />
              </div>
            </div>
            <Select value={filterDifficulty} onValueChange={setFilterDifficulty}>
              <SelectTrigger className="w-full sm:w-48">
                <Filter className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
                <SelectValue placeholder="Filter by difficulty" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Difficulties</SelectItem>
                <SelectItem value="beginner">Beginner</SelectItem>
                <SelectItem value="intermediate">Intermediate</SelectItem>
                <SelectItem value="advanced">Advanced</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Learning Paths Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:p-4 lg:p-6">
        {filteredPaths.map((path) => (
          <motion.div
            key={path.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Card className="hover:shadow-lg transition-shadow duration-300 h-full">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-base sm:text-lg font-semibold text-gray-900 mb-2 line-clamp-2">
                      {path.title}
                    </CardTitle>
                    <p className="text-xs sm:text-sm text-gray-600 line-clamp-3">
                      {path.description}
                    </p>
                  </div>
                  <Badge className={`ml-2 ${
                    path.difficulty === 'beginner' ? 'bg-green-100 text-green-800' :
                    path.difficulty === 'intermediate' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {path.difficulty}
                  </Badge>
                </div>
              </CardHeader>
              
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center text-xs sm:text-sm text-gray-600">
                    <Clock className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
                    {path.estimatedHours} hours
                  </div>
                  <div className="flex items-center text-xs sm:text-sm text-gray-600">
                    <BookOpen className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
                    {path.subjectIds.length} subjects
                  </div>
                </div>

                <div className="flex flex-wrap gap-1">
                  {path.subjectIds.slice(0, 3).map((subject, index) => (
                    <Badge key={index} variant="secondary" className="text-xs">
                      {subject}
                    </Badge>
                  ))}
                  {path.subjectIds.length > 3 && (
                    <Badge variant="secondary" className="text-xs">
                      +{path.subjectIds.length - 3} more
                    </Badge>
                  )}
                </div>

                <div className="flex items-center justify-between pt-4 border-t">
                  <div className="flex space-x-2">
                    <Button size="sm" variant="outline" onClick={() => handleEdit(path)}>
                      <Edit className="w-3 h-3 sm:w-4 sm:h-4" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleDelete(path.id)}>
                      <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
                    </Button>
                  </div>
                  <Button size="sm" variant="ghost">
                    <MoreHorizontal className="w-3 h-3 sm:w-4 sm:h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {filteredPaths.length === 0 && (
        <Card>
          <CardContent className="p-4 sm:p-6 lg:p-8 text-center">
            <div className="text-gray-500">
              <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="text-base sm:text-lg font-medium">No learning paths found</p>
              <p className="text-xs sm:text-sm">Try adjusting your search or filters</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default LearningPathManagement;

