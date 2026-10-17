import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { getAuthToken } from '@/lib/auth-utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { 
  FileText, 
  CheckCircle,
  File,
  Video,
  BookOpen,
  Download,
  Upload,
  CheckCircle2
} from 'lucide-react';
import { API_BASE_URL } from '@/lib/api-config';
import PdfPreviewPanel from '@/components/shared/PdfPreviewPanel';
import { useToast } from '@/hooks/use-toast';
import {
  getVideoDisplayTitle,
  sortContentsChapterWise,
} from '@/lib/video-chapter-schedule';
import {
  formatIitLearningPathContentLabel,
  formatLibraryContentContextLabel,
  isIitTrackContent,
  libraryContentBelongsToOpenedSubject,
  formatLibraryContentClassLabel,
  getLibraryContentProductCategory,
} from '@/lib/library-content-labels';
import { formatIitCategoryLabel } from '@/lib/products';

const IIT_TRACK_ORDER = ['ALPHA', 'BETA', 'GAMMA', 'DELTA', 'OMEGA'];

function classNumberOf(label: string): number {
  const n = parseInt(String(label || '').replace(/\D+/g, ' ').trim().split(' ')[0] || '', 10);
  return Number.isFinite(n) ? n : 999;
}

interface ContentItem {
  _id: string;
  title: string;
  description?: string;
  type: 'TextBook' | 'Workbook' | 'Material' | 'Video' | 'Audio' | 'Homework';
  fileUrl: string;
  date: string;
  createdAt: string;
  deadline?: string;
  chapter?: string;
  module?: string;
  topic?: string;
  productCategory?: string | null;
  board?: string | null;
  classNumber?: string | number | null;
  subject?: {
    name?: string;
    classNumber?: string | number | null;
    productCategory?: string | null;
    board?: string | null;
  } | string;
}

/** School/admin calendar label: lesson title + chapter/module when present. */
export function getLibraryContentDisplayTitle(content: ContentItem): string {
  const type = String(content?.type || '');
  if (type === 'Video' || type === 'Audio') {
    return getVideoDisplayTitle(content);
  }
  const title = String(content?.title || '').trim();
  if (title) return title;
  const topic = String(content?.topic || '').trim();
  return topic || 'Untitled';
}

interface CalendarViewProps {
  contents: ContentItem[];
  isLoading?: boolean;
  onMarkAsDone?: (contentId: string) => void;
  completedItems?: string[];
  /** Plain subject name for IIT section labels (e.g. Biology → Biology IIT Alpha). */
  subjectName?: string;
  /**
   * Student-only: Assigned homework → upload file → submit.
   * School admin / teacher should leave this false (view + download only).
   */
  allowHomeworkSubmit?: boolean;
}

export default function CalendarView({
  contents,
  isLoading = false,
  onMarkAsDone,
  completedItems = [],
  subjectName = '',
  allowHomeworkSubmit = false,
}: CalendarViewProps) {
  const { toast } = useToast();
  const [markedDone, setMarkedDone] = useState<Set<string>>(new Set(completedItems));
  const [selectedContent, setSelectedContent] = useState<ContentItem | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isSubmissionOpen, setIsSubmissionOpen] = useState(false);
  const [selectedHomework, setSelectedHomework] = useState<ContentItem | null>(null);
  const [submissionLink, setSubmissionLink] = useState('');
  const [submissionFile, setSubmissionFile] = useState<File | null>(null);
  const [submissionDescription, setSubmissionDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [existingSubmission, setExistingSubmission] = useState<any>(null);

  // Match Super Admin: chapter → module → title (not upload date alone).
  const sortedContents = sortContentsChapterWise(
    subjectName
      ? contents.filter((c) => libraryContentBelongsToOpenedSubject(c, subjectName))
      : contents,
  );

  const handleMarkAsDone = (contentId: string) => {
    const newMarked = new Set(markedDone);
    if (newMarked.has(contentId)) {
      newMarked.delete(contentId);
    } else {
      newMarked.add(contentId);
    }
    setMarkedDone(newMarked);
    if (onMarkAsDone) {
      onMarkAsDone(contentId);
    }
  };

  const handleContentClick = (content: ContentItem) => {
    if (content.type === 'Homework' && allowHomeworkSubmit) {
      setSelectedHomework(content);
      setIsSubmissionOpen(true);
      fetchExistingSubmission(content._id);
      return;
    }
    setSelectedContent(content);
    setIsPreviewOpen(true);
  };

  const fetchExistingSubmission = async (homeworkId: string) => {
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE_URL}/api/student/homework-submission/${homeworkId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.data) {
          setExistingSubmission(data.data);
          setSubmissionLink(data.data.submissionLink);
          setSubmissionFile(null);
          setSubmissionDescription(data.data.description || '');
          // Mark as done if submission exists
          if (onMarkAsDone) {
            onMarkAsDone(homeworkId);
          }
          setMarkedDone((prev) => {
            const next = new Set(prev);
            next.add(homeworkId);
            return next;
          });
        } else {
          setExistingSubmission(null);
          setSubmissionLink('');
          setSubmissionFile(null);
          setSubmissionDescription('');
        }
      }
    } catch (error) {
      console.error('Error fetching submission:', error);
    }
  };

  const handleSubmitHomework = async () => {
    if (!selectedHomework || !submissionFile) {
      toast({
        title: 'Validation Error',
        description: 'Please upload a submission file',
        variant: 'destructive'
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const token = getAuthToken();
      const formData = new FormData();
      formData.append('file', submissionFile);
      const uploadResponse = await fetch(`${API_BASE_URL}/api/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });
      const uploadData = await uploadResponse.json().catch(() => ({}));
      if (!uploadResponse.ok || !uploadData?.url) {
        toast({
          title: 'Upload Error',
          description: uploadData?.message || 'Failed to upload submission file',
          variant: 'destructive'
        });
        return;
      }

      const submissionLink = String(uploadData.url).startsWith('http')
        ? String(uploadData.url)
        : `${API_BASE_URL}${String(uploadData.url).startsWith('/') ? '' : '/'}${uploadData.url}`;

      const response = await fetch(`${API_BASE_URL}/api/student/homework-submission`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          homeworkId: selectedHomework._id,
          submissionLink,
          description: submissionDescription.trim()
        })
      });

      if (response.ok) {
        const data = await response.json();
        setExistingSubmission(data.data);
        
        // Automatically mark as done
        if (onMarkAsDone) {
          onMarkAsDone(selectedHomework._id);
        }
        setMarkedDone((prev) => {
          const next = new Set(prev);
          next.add(selectedHomework._id);
          return next;
        });
        
        toast({
          title: 'Success',
          description: 'Homework submitted successfully and marked as done!',
        });
        
        setIsSubmissionOpen(false);
      } else {
        const errorData = await response.json();
        toast({
          title: 'Error',
          description: errorData.message || 'Failed to submit homework',
          variant: 'destructive'
        });
      }
    } catch (error) {
      console.error('Error submitting homework:', error);
      toast({
        title: 'Error',
        description: 'An error occurred while submitting homework',
        variant: 'destructive'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownload = (content: ContentItem) => {
    // Construct full URL for download
    const fileUrl = content.fileUrl.startsWith('http') 
      ? content.fileUrl 
      : `${API_BASE_URL}${content.fileUrl}`;
    
    // Create a temporary anchor element to trigger download
    const link = document.createElement('a');
    link.href = fileUrl;
    link.download = content.title || 'download';
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getFilePreviewUrl = (fileUrl: string): string => {
    if (fileUrl.startsWith('http')) {
      return fileUrl;
    }
    return `${API_BASE_URL}${fileUrl}`;
  };

  const getFileExtension = (fileUrl: string): string => {
    const parts = fileUrl.split('.');
    return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
  };

  const extractYouTubeId = (url: string): string | null => {
    if (!url) return null;
    
    // Handle full YouTube URLs
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    if (match && match[2].length === 11) {
      return match[2];
    }
    
    // Handle partial URLs like "com/watch?v=rducf9ajg0e"
    const partialMatch = url.match(/watch\?v=([a-zA-Z0-9_-]{11})/);
    if (partialMatch) {
      return partialMatch[1];
    }
    
    // Handle youtu.be short URLs
    const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
    if (shortMatch) {
      return shortMatch[1];
    }
    
    return null;
  };

  const renderFilePreview = (content: ContentItem) => {
    const previewUrl = getFilePreviewUrl(content.fileUrl);
    const fileExtension = getFileExtension(content.fileUrl);
    const youtubeId = extractYouTubeId(content.fileUrl);
    const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(fileExtension);
    const isVideo = ['mp4', 'webm', 'ogg'].includes(fileExtension);
    const isPDF =
      fileExtension === 'pdf' ||
      previewUrl.toLowerCase().includes('.pdf') ||
      content.type === 'TextBook' ||
      content.type === 'Workbook';
    const isAudio = ['mp3', 'wav', 'ogg', 'm4a'].includes(fileExtension);
    
    // Handle YouTube videos
    if (youtubeId) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-gray-900 rounded-lg p-4">
          <div className="w-full max-w-4xl aspect-video">
            <iframe
              src={`https://www.youtube.com/embed/${youtubeId}`}
              className="w-full h-full rounded-lg"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              title={content.title}
            />
          </div>
        </div>
      );
    }

    if (isImage) {
      return (
        <div className="flex h-full w-full max-w-full items-center justify-center overflow-hidden rounded-lg bg-gray-100">
          <img 
            src={previewUrl} 
            alt={content.title}
            className="h-auto w-full max-h-[min(60dvh,720px)] max-w-full object-contain rounded-lg"
            onError={(e) => {
              e.currentTarget.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2VlZSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5JbWFnZSBub3QgYXZhaWxhYmxlPC90ZXh0Pjwvc3ZnPg==';
            }}
          />
        </div>
      );
    }

    if (isVideo) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-gray-900 rounded-lg">
          <video 
            src={previewUrl} 
            controls 
            className="max-w-full max-h-[60vh] rounded-lg"
            onError={(e) => {
              console.error('Video preview error:', e);
            }}
          >
            Your browser does not support the video tag.
          </video>
        </div>
      );
    }

    if (isPDF) {
      return (
        <PdfPreviewPanel
          fileUrl={content.fileUrl}
          title={content.title}
          className="h-full min-h-0 w-full flex-1"
          contextLabel={formatLibraryContentContextLabel(content, {
            fallbackSubjectName: subjectName,
          })}
        />
      );
    }

    if (isAudio) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-gray-100 rounded-lg p-4 sm:p-6 lg:p-8">
          <div className="text-center space-y-4">
            <div className="w-24 h-24 mx-auto bg-blue-100 rounded-full flex items-center justify-center">
              <File className="w-12 h-12 text-blue-600" />
            </div>
            <audio 
              src={previewUrl} 
              controls 
              className="w-full max-w-md"
            >
              Your browser does not support the audio tag.
            </audio>
          </div>
        </div>
      );
    }

    // Default preview for other file types
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-100 rounded-lg p-4 sm:p-6 lg:p-8">
        <div className="text-center space-y-4">
          <div className="w-24 h-24 mx-auto bg-blue-100 rounded-full flex items-center justify-center">
            <File className="w-12 h-12 text-blue-600" />
          </div>
          <p className="text-gray-600">Preview not available for this file type</p>
          <p className="text-xs sm:text-sm text-gray-500">File extension: {fileExtension || 'unknown'}</p>
        </div>
      </div>
    );
  };

  const getContentIcon = (type: string) => {
    switch (type) {
      case 'Video':
        return Video;
      case 'TextBook':
      case 'Workbook':
        return BookOpen;
      case 'Material':
        return FileText;
      case 'Audio':
        return File;
      case 'Homework':
        return FileText;
      default:
        return File;
    }
  };

  const getContentTypeLabel = (type: string): string => type?.trim() || 'Content';

  const CONTENT_TYPE_ORDER: ContentItem['type'][] = [
    'Video',
    'TextBook',
    'Workbook',
    'Material',
    'Audio',
    'Homework',
  ];

  const boardContents = sortedContents.filter((c) => !isIitTrackContent(c));
  const iitContents = sortedContents.filter((c) => isIitTrackContent(c));

  // IIT material: one group per class + track ("Class 6 · IIT Alpha"), ordered
  // by class then track; inside a group by content type, then chapter order.
  const iitGroups = (() => {
    const groups = new Map<string, { key: string; label: string; classNo: number; trackRank: number; items: ContentItem[] }>();
    for (const content of iitContents) {
      const classLabel = formatLibraryContentClassLabel(content) || 'Class —';
      const track = getLibraryContentProductCategory(content);
      const key = `${classLabel}|${track}`;
      const group = groups.get(key) || {
        key,
        label: [classLabel, track ? `IIT ${formatIitCategoryLabel(track)}` : 'IIT'].join(' · '),
        classNo: classNumberOf(classLabel),
        trackRank: track ? (IIT_TRACK_ORDER.indexOf(track) + 1 || 50) : 0,
        items: [],
      };
      group.items.push(content);
      groups.set(key, group);
    }
    const typeRank = (type?: string) => {
      const i = CONTENT_TYPE_ORDER.indexOf(type as ContentItem['type']);
      return i === -1 ? 99 : i;
    };
    return [...groups.values()]
      .sort((a, b) => a.classNo - b.classNo || a.trackRank - b.trackRank || a.label.localeCompare(b.label))
      .map((group) => ({
        ...group,
        // Stable sort keeps the chapter-wise order within the same type.
        items: [...group.items].sort((a, b) => typeRank(a.type) - typeRank(b.type)),
      }));
  })();

  const groupedByType = boardContents.reduce<Record<string, ContentItem[]>>((acc, content) => {
    const type = content.type || 'Content';
    if (!acc[type]) acc[type] = [];
    acc[type].push(content);
    return acc;
  }, {});

  const contentTypeSections = [
    ...CONTENT_TYPE_ORDER.filter((type) => groupedByType[type]?.length),
    ...Object.keys(groupedByType).filter(
      (type) => !CONTENT_TYPE_ORDER.includes(type as ContentItem['type']),
    ),
  ];

  const renderContentCard = (content: ContentItem, opts?: { iit?: boolean }) => {
    const Icon = getContentIcon(content.type);
    const isDone = markedDone.has(content._id);
    // IIT rows keep the uploaded material name as the heading; the derived
    // "<Subject> IIT <Track>" label is context and belongs in the subtitle.
    const iitTrackLabel = opts?.iit
      ? formatIitLearningPathContentLabel(content, subjectName)
      : '';
    const uploadedTitle = getLibraryContentDisplayTitle(content);
    const hasUploadedTitle = Boolean(uploadedTitle) && uploadedTitle !== 'Untitled';
    const title = opts?.iit && !hasUploadedTitle ? iitTrackLabel : uploadedTitle;
    const contextLabel = formatLibraryContentContextLabel(content, {
      fallbackSubjectName: subjectName,
    });
    const subtitleBits = opts?.iit
      ? [
          content.chapter ? `Chapter ${content.chapter}` : null,
          content.module ? `Module ${content.module}` : null,
          content.type ? getContentTypeLabel(content.type) : null,
        ].filter(Boolean)
      : [
          contextLabel || null,
          content.chapter ? `Chapter ${content.chapter}` : null,
          content.module ? `Module ${content.module}` : null,
          content.topic && content.topic !== content.title ? content.topic : null,
        ].filter(Boolean);

    return (
      <div
        key={content._id}
        className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
        onClick={() => handleContentClick(content)}
      >
        <div className="flex items-center space-x-3 flex-1">
          <div className={`p-2 rounded-lg ${opts?.iit ? 'bg-slate-900' : 'bg-blue-100'}`}>
            <Icon className={`w-4 h-4 sm:w-5 sm:h-5 ${opts?.iit ? 'text-amber-300' : 'text-blue-600'}`} />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-medium text-gray-900 text-xs sm:text-sm line-clamp-2 break-words">
              {title}
            </h4>
            {subtitleBits.length > 0 && (
              <p className="text-xs text-gray-500 mt-0.5 line-clamp-2 break-words">
                {[...new Set(subtitleBits)].join(' · ')}
              </p>
            )}
            {content.description && (
              <p className="text-xs text-gray-500 mt-1 line-clamp-2">{content.description}</p>
            )}
          </div>
        </div>
        {content.type === 'Homework' && allowHomeworkSubmit ? (
          <div className="flex items-center space-x-2 ml-2">
            {isDone ? (
              <Badge className="bg-green-100 text-green-700 text-xs">Submitted</Badge>
            ) : (
              <Button
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white"
                onClick={(e) => {
                  e.stopPropagation();
                  handleContentClick(content);
                }}
              >
                <Upload className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                Upload & submit
              </Button>
            )}
          </div>
        ) : onMarkAsDone ? (
          <div className="flex items-center space-x-2">
            {isDone ? (
              <Button
                size="sm"
                className="bg-green-500 hover:bg-green-600 text-white"
                onClick={(e) => {
                  e.stopPropagation();
                  handleMarkAsDone(content._id);
                }}
              >
                <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                Done
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="border-gray-300 text-gray-700 hover:bg-gray-50"
                onClick={(e) => {
                  e.stopPropagation();
                  handleMarkAsDone(content._id);
                }}
              >
                Mark as done
              </Button>
            )}
          </div>
        ) : null}
        {content.deadline && content.type === 'Homework' && (
          <Badge className="bg-orange-100 text-orange-700 text-xs ml-2">
            Deadline: {new Date(content.deadline).toLocaleDateString()}
          </Badge>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {isLoading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading content...</p>
        </div>
      ) : sortedContents.length === 0 ? (
        <div className="text-center py-12">
          <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-2">No content available</h3>
          <p className="text-gray-600">Content will appear here once it's uploaded.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {contentTypeSections.map((type) => (
            <section key={type} className="space-y-2">
              <h3 className="text-sm sm:text-base font-semibold text-gray-900">
                {getContentTypeLabel(type)}
              </h3>
              <div className="space-y-2">
                {groupedByType[type].map((content) => renderContentCard(content))}
              </div>
            </section>
          ))}
          {iitGroups.length > 0 ? (
            <section className="space-y-4">
              <h3 className="text-sm sm:text-base font-semibold text-gray-900">IIT / NEET</h3>
              {iitGroups.map((group) => (
                <div key={group.key} className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {group.label} ({group.items.length})
                  </h4>
                  <div className="space-y-2">
                    {group.items.map((content) => renderContentCard(content, { iit: true }))}
                  </div>
                </div>
              ))}
            </section>
          ) : null}
        </div>
      )}

      {/* Preview Dialog — A4 book-style for readable textbooks / materials */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="!flex h-[min(96dvh,1200px)] max-h-[96dvh] w-[min(98vw,1280px)] max-w-[1280px] !flex-col gap-0 overflow-hidden rounded-xl border-0 bg-[#d6d3d1] p-0 shadow-2xl">
          <DialogHeader className="shrink-0 space-y-1 border-b border-stone-300/60 bg-stone-100/95 px-5 pb-3 pt-5 pr-14 sm:px-7">
            <DialogTitle className="text-base sm:text-lg lg:text-xl font-semibold leading-snug">
              {selectedContent ? getLibraryContentDisplayTitle(selectedContent) : ''}
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              {[
                selectedContent
                  ? formatLibraryContentContextLabel(selectedContent, {
                      fallbackSubjectName: subjectName,
                    })
                  : '',
                selectedContent?.type || '',
                selectedContent?.description || '',
              ]
                .filter(Boolean)
                .join(' · ') || 'Content preview'}
            </DialogDescription>
          </DialogHeader>
          
          {selectedContent && (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {/* File Preview */}
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg bg-stone-100">
                {renderFilePreview(selectedContent)}
              </div>

              {/* Content Info */}
              <div className="flex shrink-0 items-center justify-between border-t border-stone-300/60 bg-stone-100/95 px-5 py-2.5">
                <div className="flex items-center space-x-4 text-xs sm:text-sm text-gray-600">
                  <span className="flex items-center space-x-1">
                    <FileText className="w-3 h-3 sm:w-4 sm:h-4" />
                    <span>{getContentTypeLabel(selectedContent.type)}</span>
                  </span>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Student-only: Assigned → Upload → Submit */}
      {allowHomeworkSubmit && (
      <Dialog
        open={isSubmissionOpen}
        onOpenChange={(open) => {
          setIsSubmissionOpen(open);
          if (!open) {
            setSelectedHomework(null);
            setSubmissionFile(null);
            setSubmissionDescription('');
            setSubmissionLink('');
            setExistingSubmission(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg sm:text-xl font-semibold flex items-center gap-2">
              <FileText className="w-4 h-4 sm:w-5 sm:h-5" />
              {selectedHomework?.title}
            </DialogTitle>
            <DialogDescription>
              Assigned homework → upload your file → submit
            </DialogDescription>
          </DialogHeader>
          
          {selectedHomework && (
            <div className="space-y-3 sm:space-y-4 lg:space-y-6">
              <div className="flex flex-wrap gap-2 text-xs sm:text-sm">
                <Badge className="bg-slate-100 text-slate-800 hover:bg-slate-100">1. Assigned</Badge>
                <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">2. Upload</Badge>
                <Badge className="bg-green-100 text-green-800 hover:bg-green-100">3. Submit</Badge>
              </div>

              {/* Step 1 — Assigned reference */}
              <div className="space-y-2">
                <Label className="text-xs sm:text-sm font-semibold text-gray-700">
                  1. Assigned homework (reference)
                </Label>
                <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate">{selectedHomework.title}</p>
                        <p className="text-xs sm:text-sm text-gray-500">
                          {selectedHomework.description || 'Download the assigned file, then upload your completed work'}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => handleDownload(selectedHomework)}
                    >
                      <Download className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
                      Download
                    </Button>
                  </div>
                </div>
              </div>

              {selectedHomework.deadline && (
                <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
                  <p className="text-xs sm:text-sm text-orange-800">
                    <span className="font-semibold">Deadline:</span>{' '}
                    {new Date(selectedHomework.deadline).toLocaleString()}
                  </p>
                </div>
              )}

              {existingSubmission && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center gap-2 text-green-800">
                    <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5" />
                    <span className="font-semibold">Already Submitted</span>
                  </div>
                  <p className="text-xs sm:text-sm text-green-700 mt-1">
                    Submitted on {new Date(existingSubmission.submittedAt).toLocaleString()}
                  </p>
                </div>
              )}

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="submissionFile" className="text-xs sm:text-sm font-semibold text-gray-700">
                    2. Upload homework file <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="submissionFile"
                    type="file"
                    accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.jpg,.jpeg,.png,.gif"
                    onChange={(e) => setSubmissionFile(e.target.files?.[0] || null)}
                    disabled={!!existingSubmission}
                  />
                  <p className="text-xs text-gray-500">
                    Upload your completed homework (PDF, DOC, images, etc.)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="submissionDescription" className="text-xs sm:text-sm font-semibold text-gray-700">
                    Notes (optional)
                  </Label>
                  <Textarea
                    id="submissionDescription"
                    placeholder="Add any notes about your submission..."
                    value={submissionDescription}
                    onChange={(e) => setSubmissionDescription(e.target.value)}
                    rows={4}
                    disabled={!!existingSubmission}
                  />
                </div>

                {existingSubmission && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-xs sm:text-sm text-blue-800">
                      <span className="font-semibold">Your submission:</span>{' '}
                      <a
                        href={existingSubmission.submissionLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        {existingSubmission.submissionLink}
                      </a>
                    </p>
                    {existingSubmission.description && (
                      <p className="text-xs sm:text-sm text-blue-700 mt-2">
                        <span className="font-semibold">Notes:</span>{' '}
                        {existingSubmission.description}
                      </p>
                    )}
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-4 border-t">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsSubmissionOpen(false);
                      setSelectedHomework(null);
                    }}
                  >
                    {existingSubmission ? 'Close' : 'Cancel'}
                  </Button>
                  {!existingSubmission && (
                    <Button
                      onClick={handleSubmitHomework}
                      disabled={isSubmitting || !submissionFile}
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      {isSubmitting ? (
                        <>
                          <Upload className="w-3 h-3 sm:w-4 sm:h-4 mr-2 animate-spin" />
                          Submitting...
                        </>
                      ) : (
                        <>
                          <Upload className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
                          3. Submit homework
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      )}
    </div>
  );
}

