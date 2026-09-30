import { useEffect, useMemo, useState, type ReactNode } from 'react';
import * as pdfjs from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getAuthToken } from '@/lib/auth-utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  API_BASE_URL,
  getEmbeddedPdfIframeSrc,
  isOurBackendPdfUrl,
  isPdfPreviewContent,
} from '@/lib/api-config';
import { getVideoDisplayTitle, sortContentsChapterWise, chapterNumberFromContent } from '@/lib/video-chapter-schedule';
import PdfPreviewPanel from '@/components/shared/PdfPreviewPanel';
import { useToast } from '@/hooks/use-toast';
import { useConfirm } from '@/hooks/use-confirm';
import {
  formatIitCategoryLabel,
  normalizeIitCategory,
} from '@/lib/products';
import { useProductCategories } from '@/hooks/use-product-categories';
import { useBoards } from '@/hooks/use-boards';
import {
  boardsMatch,
  formatClassBoardLabel,
  normalizeBoardKey,
  parseClassBoardLabel,
} from '@/lib/board-label';
import {
  getCurriculumClassLabels,
  removeCurriculumClass,
  saveCurriculumClass,
} from '@/lib/super-admin-curriculum-classes';
import {
  extractClassNumberFromSubjectName,
  extractPlainSubjectName,
  formatSubjectWithIitCategory,
  isActiveCatalogSubject,
  isSoftDeletedSubjectName,
  normalizeSubjectDisplayKey,
} from '@/lib/subject-names';
import {
  BookOpen,
  ChevronRight,
  File,
  FileText,
  Headphones,
  Loader2,
  Plus,
  Trash2,
  Video,
  Edit,
} from 'lucide-react';

interface SubjectItem {
  _id: string;
  name: string;
  description?: string;
  code?: string;
  board: string;
  classNumber?: string;
  stateName?: string;
  productCategory?: string;
  isActive?: boolean;
}

type ContentType =
  | 'TextBook'
  | 'Workbook'
  | 'Material'
  | 'Video'
  | 'Audio'
  | 'Homework';

interface ContentItem {
  _id: string;
  title: string;
  description?: string;
  type: ContentType;
  board: string;
  stateName?: string;
  productCategory?: string;
  isActive?: boolean;
  subject: {
    _id: string;
    name: string;
    classNumber?: string;
    productCategory?: string;
    missingFromCatalog?: boolean;
  };
  classNumber?: string;
  topic?: string;
  chapter?: string;
  module?: string;
  date: string;
  fileUrl: string;
  fileUrls?: string[];
  thumbnailUrl?: string;
  thumbnail?: string;
  videoThumbnail?: string;
  previewImage?: string;
  image?: string;
  duration?: number;
  createdAt: string;
}

const VIDEO_NUMBER_PATTERN = /^[1-9]\d*$/;

function videoNumberOnly(value: string): string {
  return String(value || '').replace(/\D/g, '');
}

function isVideoNumber(value: string): boolean {
  return VIDEO_NUMBER_PATTERN.test(String(value || '').trim());
}

function getVideoContentDisplayTitle(
  item: Pick<ContentItem, 'type' | 'title' | 'chapter' | 'module'> & { topic?: string }
): string {
  return getVideoDisplayTitle(item);
}

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const pdfFirstPageThumbCache = new Map<string, string>();
/** URLs that returned 404/403 — skip repeat fetches for orphan DB rows. */
const pdfUnavailableUrls = new Set<string>();

const BOARD_CODE = 'ASLI_EXCLUSIVE_SCHOOLS';

type SyllabusBoard = string;

/** Fallback when boards API is empty. */
const CONTENT_FETCH_BOARDS_FALLBACK = ['ASLI_EXCLUSIVE_SCHOOLS', 'CBSE', 'STATE', 'IIT'];

const INDIAN_STATE_OPTIONS = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  'Andaman and Nicobar Islands',
  'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Jammu and Kashmir',
  'Ladakh',
  'Lakshadweep',
  'Puducherry',
] as const;

function syllabusLabel(
  board: string,
  options?: { value: string; label: string }[]
): string {
  const normalized = board.toUpperCase();
  if (normalized === 'ASLI_EXCLUSIVE_SCHOOLS') return '';
  const list = options?.length
    ? options
    : [
        { value: 'CBSE', label: 'CBSE' },
        { value: 'STATE', label: 'State Board (generic)' },
        { value: 'IIT', label: 'IIT' },
        { value: 'ICSE', label: 'ICSE' },
        { value: 'IB', label: 'IB' },
        { value: 'SSC', label: 'SSC' },
        { value: 'CAMBRIDGE', label: 'Cambridge' },
      ];
  const o = list.find((x) => x.value === normalized || x.value === board);
  return o?.label ?? board;
}

/** Section order for content cards (every type gets its own heading; avoids mis-labelling Material/Homework as "Other"). */
const CONTENT_TYPE_SECTIONS: { title: string; types: ContentType[] }[] = [
  { title: 'Textbooks', types: ['TextBook'] },
  { title: 'Workbooks', types: ['Workbook'] },
  { title: 'Materials', types: ['Material'] },
  { title: 'Homework', types: ['Homework'] },
  { title: 'Videos', types: ['Video'] },
  { title: 'Audio', types: ['Audio'] },
];

/** Compare class numbers consistently ("8", "08", Class 8). */
function normalizeClassNumber(value: string | null | undefined): string {
  const trimmed = value != null ? String(value).trim() : '';
  if (!trimmed) return '';
  const parsed = parseInt(trimmed, 10);
  if (!Number.isNaN(parsed)) return String(parsed);
  return trimmed;
}

function isValidGradeClassNumber(value: string | null | undefined): boolean {
  const n = normalizeClassNumber(value);
  if (!n) return false;
  const parsed = parseInt(n, 10);
  return !Number.isNaN(parsed) && parsed >= 1 && parsed <= 12;
}

function getContentSubjectId(item: ContentItem): string | null {
  const subj = item.subject as { _id?: string } | string | null | undefined;
  if (!subj) return null;
  if (typeof subj === 'string') return subj;
  return subj._id ? String(subj._id) : null;
}

function inferSubjectLabelFromContent(item: ContentItem): string {
  const text = `${item.title || ''} ${item.description || ''} ${item.topic || ''}`.toLowerCase();
  if (/ganita|mathematics|maths|\bmath\b/.test(text)) return 'Mathematics';
  if (/\bphysics\b/.test(text)) return 'Physics';
  if (/\bchemistry\b/.test(text)) return 'Chemistry';
  if (/\bbiolog/.test(text)) return 'Biology';
  if (/science|curiosity/.test(text)) return 'Science';
  if (/english/.test(text)) return 'English';
  if (/social|history|geography/.test(text)) return 'Social Studies';
  if (/hindi/.test(text)) return 'Hindi';
  if (/telugu/.test(text)) return 'Telugu';
  // Never promote video/chapter titles into the subject sidebar.
  return 'Unassigned';
}

function isInferredSubjectId(id: string | null | undefined): boolean {
  return !id || String(id).startsWith('inferred-');
}

function isMongoObjectId(id: string | null | undefined): boolean {
  return Boolean(id && /^[a-f0-9]{24}$/i.test(String(id)));
}

function isCatalogSubjectId(id: string | null, catalog: SubjectItem[]): boolean {
  if (isInferredSubjectId(id)) return false;
  return catalog.some((s) => String(s._id) === String(id));
}

/** One sidebar row per subject title + class + board + product category track. */
function subjectSidebarKey(
  name: string,
  classNum: string,
  board = '',
  productCategory = '',
): string {
  const cat = normalizeIitCategory(productCategory) || 'GENERAL';
  return `${normalizeSubjectDisplayKey(name)}|${classNum}|${normalizeBoardKey(board)}|${cat}`;
}

function resolveSubjectProductCategory(subj?: { productCategory?: string } | null): string {
  return normalizeIitCategory(subj?.productCategory) || '';
}

function resolveContentProductCategory(
  item: ContentItem,
  catalog: SubjectItem[],
): string {
  const fromItem = normalizeIitCategory(item.productCategory);
  if (fromItem) return fromItem;
  const fromNested = normalizeIitCategory(item.subject?.productCategory);
  if (fromNested) return fromNested;
  const sid = getContentSubjectId(item);
  if (!sid) return '';
  const linked = catalog.find((s) => String(s._id) === String(sid));
  return resolveSubjectProductCategory(linked);
}

function contentMatchesClassBoard(
  item: ContentItem,
  catalog: SubjectItem[],
  classNum: string,
  board: string
): boolean {
  if (item.isActive === false) return false;
  const effClass = effectiveContentClass(item, catalog);
  if (normalizeClassNumber(effClass || '') !== normalizeClassNumber(classNum)) return false;
  if (!board) return true;
  return boardsMatch(normalizeBoardKey(item.board || ''), board);
}

function displaySubjectName(name: string): string {
  const base = String(name || '').split('__deleted__')[0].trim();
  return extractPlainSubjectName(base) || base;
}

/** Map UI subject row (incl. inferred groups) to a real catalog subject id for save. */
function resolveCatalogSubjectIdForSave(
  subjectId: string | null,
  catalog: SubjectItem[],
  classNumber: string,
  classSubjects: SubjectItem[]
): string | null {
  if (!subjectId) return null;
  if (isCatalogSubjectId(subjectId, catalog)) return String(subjectId);
  if (isMongoObjectId(subjectId) && !isInferredSubjectId(subjectId)) {
    return String(subjectId);
  }

  const row =
    classSubjects.find((s) => String(s._id) === String(subjectId)) ?? null;
  if (!row) return null;

  const plain = extractPlainSubjectName(row.name).toLowerCase().trim();
  const normClass = normalizeClassNumber(classNumber);
  if (!plain || !normClass) return null;

  const match = catalog.find((s) => {
    const sClass = s.classNumber
      ? normalizeClassNumber(s.classNumber)
      : normalizeClassNumber(extractClassNumberFromSubjectName(s.name) || '');
    if (sClass !== normClass) return false;
    return normalizeSubjectDisplayKey(s.name) === normalizeSubjectDisplayKey(row.name);
  });

  return match ? String(match._id) : null;
}

/** Resolve subject for display/save — catalog row or embedded content.subject. */
function resolveSubjectForContent(
  content: ContentItem | null | undefined,
  catalog: SubjectItem[]
): SubjectItem | null {
  if (!content) return null;
  const sid = getContentSubjectId(content);
  if (sid && !sid.startsWith('inferred-')) {
    const fromCatalog = catalog.find((s) => String(s._id) === String(sid));
    if (fromCatalog) return fromCatalog;
  }
  if (content.subject?.name) {
    return {
      _id: sid || content.subject._id,
      name: content.subject.name,
      board: content.board || BOARD_CODE,
      classNumber: content.subject.classNumber || content.classNumber,
      stateName: content.stateName,
    };
  }
  return null;
}

/** Prefer content.classNumber; else derive from linked subject (matches selected class in UI). */
function effectiveContentClass(
  item: ContentItem,
  subjects: SubjectItem[]
): string | null {
  if (item.classNumber != null && String(item.classNumber).trim() !== '') {
    return normalizeClassNumber(item.classNumber);
  }
  if (item.subject?.classNumber != null && String(item.subject.classNumber).trim() !== '') {
    return normalizeClassNumber(item.subject.classNumber);
  }
  const sid = item.subject?._id;
  if (!sid) return null;
  const subj = subjects.find((s) => String(s._id) === String(sid));
  if (!subj) return null;
  if (subj.classNumber != null && String(subj.classNumber).trim() !== '') {
    return normalizeClassNumber(subj.classNumber);
  }
  return extractClassNumberFromSubjectName(subj.name);
}

const getContentTypeIcon = (type: ContentType) => {
  switch (type) {
    case 'Video':
      return Video;
    case 'Audio':
      return Headphones;
    case 'TextBook':
      return FileText;
    case 'Workbook':
    case 'Material':
    case 'Homework':
      return File;
    default:
      return File;
  }
};

const isUploadType = (type: ContentType) =>
  type === 'TextBook' ||
  type === 'Workbook' ||
  type === 'Material' ||
  type === 'Audio' ||
  type === 'Homework';

const getUploadAcceptForContentType = (type: ContentType): string => {
  if (type === 'Video') {
    return 'video/mp4,video/mpeg,video/quicktime,video/x-msvideo,video/webm,video/x-matroska';
  }
  if (type === 'Audio') {
    return 'audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac';
  }
  return '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx';
};

function uploadFailureHint(status: number): string {
  if (status === 401) return ' Your session has expired. Sign in again and retry.';
  if (status === 403) return ' Your account does not have permission to upload this file.';
  if (status === 413) return ' The file exceeds the server or reverse-proxy upload limit.';
  if (status >= 500) {
    return ' The upload service could not save the file. Check server storage and logs, then retry.';
  }
  return '';
}

/** Normalize upload paths so validation and API always get `/uploads/...`. */
function normalizeServerContentFileUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith(`${API_BASE_URL}/uploads/`)) {
    return trimmed.slice(API_BASE_URL.length);
  }
  if (trimmed.startsWith('/uploads/')) return trimmed;
  if (trimmed.startsWith('uploads/')) return `/${trimmed}`;
  return trimmed;
}

const isServerHostedFileUrl = (url: string): boolean => {
  const normalized = normalizeServerContentFileUrl(url);
  return normalized.startsWith('/uploads/');
};

const isHttpUrl = (url: string): boolean => {
  try {
    const u = new URL(url.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
};

/** Video: external URL only. Audio: URL or upload. Other types: upload only. */
function isValidContentSourceUrl(url: string, type: ContentType): boolean {
  const trimmed = normalizeServerContentFileUrl(url) || url.trim();
  if (!trimmed) return false;
  if (type === 'Video') return isHttpUrl(url.trim());
  if (type === 'Audio') return isServerHostedFileUrl(url) || isHttpUrl(url.trim());
  return isServerHostedFileUrl(url);
}

const normalizeMediaUrl = (value?: string | null): string | null => {
  const trimmed = (value || '').trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  if (trimmed.startsWith('/uploads/')) return `${API_BASE_URL}${trimmed}`;
  return trimmed;
};

function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  const regExp = /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  if (match && match[2].length === 11) return match[2];
  const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (shortMatch) return shortMatch[1];
  return null;
}

function extractVimeoId(url: string): string | null {
  const match = url.match(/vimeo\.com\/(?:channels\/[^/]+\/|groups\/[^/]+\/videos\/|video\/)?(\d+)/);
  return match ? match[1] : null;
}

function isImageFileUrl(url: string): boolean {
  return /\.(jpe?g|png|gif|webp|bmp|svg)(\?|#|$)/i.test(url);
}

type ContentCardPreview =
  | { kind: 'image'; src: string }
  | { kind: 'pdf'; src: string }
  | { kind: 'video'; src: string }
  | { kind: 'icon'; contentType: ContentType };

function resolveContentCardPreview(content: ContentItem, fileUrl: string): ContentCardPreview {
  const storedRaw =
    content.thumbnailUrl ||
    content.thumbnail ||
    content.videoThumbnail ||
    content.previewImage ||
    content.image;
  const stored = normalizeMediaUrl(storedRaw);
  if (stored) return { kind: 'image', src: stored };

  const url = normalizeMediaUrl(fileUrl) || String(fileUrl || '').trim();
  if (!url) return { kind: 'icon', contentType: content.type };

  const youtubeId = extractYouTubeId(url);
  if (youtubeId) {
    return { kind: 'image', src: `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg` };
  }

  const vimeoId = extractVimeoId(url);
  if (vimeoId) {
    return { kind: 'image', src: `https://vumbnail.com/${vimeoId}.jpg` };
  }

  if (isImageFileUrl(url)) return { kind: 'image', src: url };

  if (isPdfPreviewContent(url, content.type)) {
    const pdfSrc = isOurBackendPdfUrl(url)
      ? url
      : `https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`;
    return { kind: 'pdf', src: pdfSrc };
  }

  if (
    (content.type === 'Video' || content.type === 'Audio') &&
    /\.(mp4|webm|ogg|m4a|mp3|wav)(\?|#|$)/i.test(url)
  ) {
    return { kind: 'video', src: url };
  }

  return { kind: 'icon', contentType: content.type };
}

async function renderPdfPageToDataUrl(
  pdf: pdfjs.PDFDocumentProxy,
  pageNumber = 1
): Promise<string> {
  const safePage = Math.min(Math.max(1, Math.floor(pageNumber) || 1), pdf.numPages || 1);
  const page = await pdf.getPage(safePage);
  const baseViewport = page.getViewport({ scale: 1 });
  const targetWidth = 560;
  const scale = targetWidth / baseViewport.width;
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  return canvas.toDataURL('image/jpeg', 0.82);
}

async function loadPdfBytesForThumbnail(fetchUrl: string): Promise<ArrayBuffer> {
  const isStaticUpload = /\/uploads\//i.test(fetchUrl);
  const token = getAuthToken() || '';
  const res = await fetch(fetchUrl, {
    method: 'GET',
    credentials: isStaticUpload ? 'omit' : 'include',
    headers:
      !isStaticUpload && token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) throw new Error(`PDF fetch failed: ${res.status}`);
  return res.arrayBuffer();
}

async function pdfFetchUrlReachable(fetchUrl: string): Promise<boolean> {
  if (pdfUnavailableUrls.has(fetchUrl)) return false;
  try {
    const isStaticUpload = /\/uploads\//i.test(fetchUrl);
    const res = await fetch(fetchUrl, {
      method: 'HEAD',
      credentials: isStaticUpload ? 'omit' : 'include',
    });
    if (!res.ok) {
      pdfUnavailableUrls.add(fetchUrl);
      return false;
    }
    return true;
  } catch {
    pdfUnavailableUrls.add(fetchUrl);
    return false;
  }
}

async function inspectPdfPageCount(file: File): Promise<number> {
  const src = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: src.slice(0) }).promise;
  try {
    return pdf.numPages || 1;
  } finally {
    await pdf.destroy();
  }
}

async function renderPdfFirstPageDataUrlFromFile(file: File, pageNumber = 1): Promise<string> {
  const src = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: src.slice(0) }).promise;
  try {
    return await renderPdfPageToDataUrl(pdf, pageNumber);
  } finally {
    await pdf.destroy();
  }
}

function PdfCoverPageField({
  id,
  page,
  pageCount,
  previewUrl,
  previewLoading,
  onPageChange,
}: {
  id: string;
  page: number;
  pageCount: number;
  previewUrl: string;
  previewLoading: boolean;
  onPageChange: (page: number) => void;
}) {
  const setPage = (n: number) => onPageChange(Math.min(pageCount, Math.max(1, Math.floor(n) || 1)));
  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor={id}>PDF page</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 w-9 px-0"
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
          aria-label="Previous PDF page"
        >
          −
        </Button>
        <Input
          id={id}
          type="number"
          min={1}
          max={pageCount}
          value={page}
          onChange={(e) => setPage(parseInt(e.target.value, 10) || 1)}
          className="h-9 w-24"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 w-9 px-0"
          disabled={page >= pageCount}
          onClick={() => setPage(page + 1)}
          aria-label="Next PDF page"
        >
          +
        </Button>
        <span className="text-xs text-gray-500">of {pageCount}</span>
      </div>
      <p className="text-xs text-gray-500">
        Changing the number only previews that page. Click Upload to use it as the cover.
      </p>
      <div className="overflow-hidden rounded-md border border-slate-200 bg-slate-50">
        {previewLoading && !previewUrl ? (
          <div className="flex h-40 items-center justify-center gap-2 text-xs text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading page {page}…
          </div>
        ) : previewUrl ? (
          <img
            src={previewUrl}
            alt={`PDF page ${page}`}
            className={`mx-auto max-h-56 w-auto ${previewLoading ? 'opacity-60' : ''}`}
          />
        ) : (
          <div className="flex h-24 items-center justify-center text-xs text-slate-500">
            Could not preview this page
          </div>
        )}
      </div>
    </div>
  );
}

async function renderPdfFirstPageDataUrl(
  fileUrl: string,
  title?: string
): Promise<string> {
  const cacheKey = fileUrl.trim();
  const cached = pdfFirstPageThumbCache.get(cacheKey);
  if (cached) return cached;

  const fetchUrl = getEmbeddedPdfIframeSrc(fileUrl, title).split('#')[0];
  if (!(await pdfFetchUrlReachable(fetchUrl))) {
    throw new Error('PDF not available');
  }

  const pdf = await pdfjs.getDocument({ data: await loadPdfBytesForThumbnail(fetchUrl) }).promise;
  try {
    const dataUrl = await renderPdfPageToDataUrl(pdf);
    pdfFirstPageThumbCache.set(cacheKey, dataUrl);
    return dataUrl;
  } finally {
    await pdf.destroy();
  }
}

async function uploadContentThumbnailJpeg(
  dataUrl: string,
  token: string
): Promise<string | null> {
  const blob = await fetch(dataUrl).then((r) => r.blob());
  const formData = new FormData();
  formData.append('thumbnail', blob, 'pdf-page1.jpg');
  const response = await fetch(
    `${API_BASE_URL}/api/super-admin/content/upload-thumbnail`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    }
  );
  const data = await response.json().catch(() => ({}));
  if (response.ok && data.success && typeof data.thumbnailUrl === 'string') {
    return data.thumbnailUrl;
  }
  return null;
}

function PdfFirstPageThumbnail({
  fileUrl,
  title,
  alt,
  fallback,
}: {
  fileUrl: string;
  title?: string;
  alt: string;
  fallback: ReactNode;
}) {
  const cacheKey = fileUrl.trim();
  const [thumbSrc, setThumbSrc] = useState<string | null>(
    () => pdfFirstPageThumbCache.get(cacheKey) ?? null
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (thumbSrc || failed) return;
    let cancelled = false;
    renderPdfFirstPageDataUrl(fileUrl, title)
      .then((src) => {
        if (!cancelled) setThumbSrc(src);
      })
      .catch(() => {
        const unreachable = getEmbeddedPdfIframeSrc(fileUrl, title).split('#')[0];
        if (unreachable) pdfUnavailableUrls.add(unreachable);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [fileUrl, title, thumbSrc, failed]);

  if (thumbSrc) {
    return (
      <img
        src={thumbSrc}
        alt={alt}
        className="w-full h-full object-cover object-top bg-white"
        loading="lazy"
      />
    );
  }

  if (failed) return <>{fallback}</>;

  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-sky-100 to-teal-100">
      <Loader2 className="h-7 w-7 animate-spin text-sky-500" aria-hidden />
    </div>
  );
}

/** YouTube / Vimeo URLs must use an iframe; <video src> cannot play them. */
function getStreamingEmbedSrc(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
      const v = u.searchParams.get('v');
      if (v) return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(v)}`;
      const embed = u.pathname.match(/\/embed\/([^/?]+)/);
      if (embed?.[1]) return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(embed[1])}`;
      const shorts = u.pathname.match(/\/shorts\/([^/?]+)/);
      if (shorts?.[1]) return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(shorts[1])}`;
    }
    if (host === 'youtu.be') {
      const id = u.pathname.split('/').filter(Boolean)[0];
      if (id) return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`;
    }
    if (host === 'vimeo.com') {
      const id = u.pathname.split('/').filter(Boolean)[0];
      if (id && /^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}`;
    }
  } catch {
    return null;
  }
  return null;
}

export default function SubjectContentManagement() {
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const { codes: iitCategoryCodes, labelMap: iitLabelMap } = useProductCategories();
  const { catalogOptions } = useBoards();

  const SYLLABUS_OPTIONS = useMemo(() => {
    const options = catalogOptions
      .filter((b) => b.code !== 'ASLI_EXCLUSIVE_SCHOOLS')
      .map((b) => ({ value: b.code as SyllabusBoard, label: b.name }));

    // CBSE and IIT are built-in content scopes. Keep them available even when
    // an older board catalog has not created explicit rows yet.
    if (!options.some((option) => boardsMatch(option.value, 'CBSE'))) {
      options.unshift({ value: 'CBSE', label: 'CBSE' });
    }
    if (!options.some((option) => boardsMatch(option.value, 'IIT'))) {
      options.push({ value: 'IIT', label: 'IIT' });
    }
    return options;
  }, [catalogOptions]);

  const CONTENT_FETCH_BOARDS = useMemo(() => {
    const codes = catalogOptions.map((b) => b.code);
    return codes.length > 0 ? codes : CONTENT_FETCH_BOARDS_FALLBACK;
  }, [catalogOptions]);

  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [isLoadingSubjects, setIsLoadingSubjects] = useState(false);

  const [contents, setContents] = useState<ContentItem[]>([]);
  const [isLoadingContents, setIsLoadingContents] = useState(false);

  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  /** Chapter key for content list dropdown: "1" | "2" | … | "unassigned" */
  const [selectedChapterKey, setSelectedChapterKey] = useState<string>('');

  const [isAddClassOpen, setIsAddClassOpen] = useState(false);
  const [newClassNumber, setNewClassNumber] = useState('');
  const [newClassDescription, setNewClassDescription] = useState('');

  const [isAddSubjectOpen, setIsAddSubjectOpen] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState('');
  const [newSubjectSyllabus, setNewSubjectSyllabus] = useState<SyllabusBoard>('CBSE');
  const [newSubjectStateName, setNewSubjectStateName] = useState('');
  const [newSubjectProductCategory, setNewSubjectProductCategory] = useState('');
  const [editingSubject, setEditingSubject] = useState<SubjectItem | null>(null);
  const [isEditSubjectOpen, setIsEditSubjectOpen] = useState(false);
  const [editSubjectName, setEditSubjectName] = useState('');
  const [editSubjectSyllabus, setEditSubjectSyllabus] = useState<SyllabusBoard>('CBSE');
  const [editSubjectStateName, setEditSubjectStateName] = useState('');
  const [editSubjectProductCategory, setEditSubjectProductCategory] = useState('');

  const [isAddContentOpen, setIsAddContentOpen] = useState(false);
  const [editingContentId, setEditingContentId] = useState<string | null>(null);
  const [contentForm, setContentForm] = useState({
    title: '',
    description: '',
    type: 'Video' as ContentType,
    date: '',
    fileUrl: '',
    thumbnailUrl: '',
    chapter: '',
    module: '',
  });
  const [selectedUploadFile, setSelectedUploadFile] = useState<File | null>(null);
  const [uploadInputKey, setUploadInputKey] = useState(0);
  const [pdfCoverPage, setPdfCoverPage] = useState(1);
  const [pdfPageCount, setPdfPageCount] = useState<number | null>(null);
  const [pdfCoverPreviewUrl, setPdfCoverPreviewUrl] = useState('');
  const [pdfCoverPreviewLoading, setPdfCoverPreviewLoading] = useState(false);
  const [isUploadingFile, setIsUploadingFile] = useState(false);

  const [isSavingSubject, setIsSavingSubject] = useState(false);
  const [isSavingContent, setIsSavingContent] = useState(false);
  const [deletingSubjectId, setDeletingSubjectId] = useState<string | null>(null);
  const [deletingContentId, setDeletingContentId] = useState<string | null>(null);
  const [deletingClassLabel, setDeletingClassLabel] = useState<string | null>(null);
  const [failedThumbnailIds, setFailedThumbnailIds] = useState<Set<string>>(new Set());
  /** In-page preview instead of opening files in a new browser tab. */
  const [contentPreviewItem, setContentPreviewItem] = useState<ContentItem | null>(null);

  const clearSelectedUploadFile = () => {
    setSelectedUploadFile(null);
    setUploadInputKey((k) => k + 1);
    setPdfCoverPage(1);
    setPdfPageCount(null);
    setPdfCoverPreviewUrl('');
    setPdfCoverPreviewLoading(false);
  };

  const onPickUploadFile = (file: File | null) => {
    setSelectedUploadFile(file);
    if (file && (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))) {
      void inspectPdfPageCount(file)
        .then((n) => {
          setPdfPageCount(n);
          setPdfCoverPage((prev) => Math.min(Math.max(1, prev || 1), n));
        })
        .catch(() => {
          setPdfPageCount(null);
          setPdfCoverPage(1);
        });
    } else {
      setPdfPageCount(null);
      setPdfCoverPage(1);
      setPdfCoverPreviewUrl('');
    }
  };

  useEffect(() => {
    const file = selectedUploadFile;
    const isPdf =
      !!file &&
      (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'));
    if (!isPdf || !file) {
      setPdfCoverPreviewUrl('');
      setPdfCoverPreviewLoading(false);
      return;
    }
    let cancelled = false;
    setPdfCoverPreviewLoading(true);
    const timer = window.setTimeout(() => {
      void renderPdfFirstPageDataUrlFromFile(file, pdfCoverPage)
        .then((url) => {
          if (!cancelled) setPdfCoverPreviewUrl(url);
        })
        .catch(() => {
          if (!cancelled) setPdfCoverPreviewUrl('');
        })
        .finally(() => {
          if (!cancelled) setPdfCoverPreviewLoading(false);
        });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [selectedUploadFile, pdfCoverPage]);
  /** Pinned class/subject while Edit Content dialog is open (avoids sidebar auto-select override). */
  const [editContentContext, setEditContentContext] = useState<{
    classLabel: string;
    subjectName: string;
    board: string;
    stateName?: string;
    subjectId: string;
  } | null>(null);

  const contentPreviewUrl = useMemo(() => {
    if (!contentPreviewItem) return null;
    const u =
      normalizeMediaUrl(contentPreviewItem.fileUrl) || contentPreviewItem.fileUrl;
    const t = String(u || '').trim();
    return t ? t : null;
  }, [contentPreviewItem]);

  useEffect(() => {
    // Load subjects and content as soon as the page mounts
    fetchSubjects();
    fetchContents();
  }, []);

  // Class labels from subjects, linked content, and manual entries (board-scoped)
  const classOptions = useMemo(() => {
    const labels = new Set<string>();
    const add = (classNum: string | null | undefined, board?: string) => {
      if (!isValidGradeClassNumber(classNum)) return;
      labels.add(formatClassBoardLabel(normalizeClassNumber(classNum!), board));
    };

    subjects.forEach((subj) => {
      if (!isActiveCatalogSubject(subj)) return;
      const cn = subj.classNumber
        ? normalizeClassNumber(subj.classNumber)
        : normalizeClassNumber(extractClassNumberFromSubjectName(subj.name) || '');
      if (cn) add(cn, subj.board);
    });

    contents.forEach((item) => {
      if (item.isActive === false) return;
      const cn = effectiveContentClass(item, subjects);
      if (cn) add(cn, item.board || BOARD_CODE);
    });

    return Array.from(labels).sort((a, b) => {
      const pa = parseClassBoardLabel(a);
      const pb = parseClassBoardLabel(b);
      const na = parseInt(pa.classNum, 10);
      const nb = parseInt(pb.classNum, 10);
      if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
      return a.localeCompare(b);
    });
  }, [subjects, contents]);

  const [selectedClassLabel, setSelectedClassLabel] = useState<string | null>(null);
  /** Board filter (CBSE / IIT / …) — pick before category → class → subject → content. */
  const [selectedFilterBoard, setSelectedFilterBoard] = useState<SyllabusBoard>('CBSE');
  /** Product category track (General / Alpha / Beta / …) — subjects live inside a category. */
  const [selectedProductCategory, setSelectedProductCategory] = useState('');
  /** Classes added manually before any subject exists (unblocks first subject). */
  const [manualClassLabels, setManualClassLabels] = useState<string[]>([]);

  useEffect(() => {
    setManualClassLabels(getCurriculumClassLabels());
  }, []);

  useEffect(() => {
    if (
      SYLLABUS_OPTIONS.length > 0 &&
      !SYLLABUS_OPTIONS.some((o) => boardsMatch(o.value, selectedFilterBoard))
    ) {
      setSelectedFilterBoard(SYLLABUS_OPTIONS[0].value);
    }
  }, [SYLLABUS_OPTIONS, selectedFilterBoard]);

  const displayClassOptions = useMemo(() => {
    const merged = new Set([...classOptions, ...manualClassLabels]);
    const byClassNumber = new Map<string, string>();

    Array.from(merged).forEach((label) => {
      const parsed = parseClassBoardLabel(label);
      if (!parsed.classNum) return;
      if (parsed.board && !boardsMatch(parsed.board, selectedFilterBoard)) return;

      const classNumber = normalizeClassNumber(parsed.classNum);
      const existing = byClassNumber.get(classNumber);
      if (!existing) {
        byClassNumber.set(classNumber, label);
        return;
      }

      // A legacy unscoped "Class 6" and a board-scoped "Class 6 (CBSE)"
      // represent one visible class inside the selected board. Prefer the
      // scoped label so subsequent subject/content operations retain the board.
      const existingBoard = parseClassBoardLabel(existing).board;
      if (!existingBoard && parsed.board) byClassNumber.set(classNumber, label);
    });

    return Array.from(byClassNumber.values())
      .sort((a, b) => {
        const pa = parseClassBoardLabel(a);
        const pb = parseClassBoardLabel(b);
        const na = parseInt(pa.classNum, 10);
        const nb = parseInt(pb.classNum, 10);
        if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
        return a.localeCompare(b);
      });
  }, [classOptions, manualClassLabels, selectedFilterBoard]);

  // Keep class selection valid when board filter / class list changes
  useEffect(() => {
    if (displayClassOptions.length === 0) {
      if (selectedClassLabel) setSelectedClassLabel(null);
      return;
    }
    if (!selectedClassLabel || !displayClassOptions.includes(selectedClassLabel)) {
      setSelectedClassLabel(displayClassOptions[0]);
      setSelectedSubjectId(null);
    }
  }, [displayClassOptions, selectedClassLabel]);

  const selectedClassParsed = useMemo(
    () => parseClassBoardLabel(selectedClassLabel || ''),
    [selectedClassLabel]
  );
  const selectedClassNumber = selectedClassParsed.classNum
    ? normalizeClassNumber(selectedClassParsed.classNum)
    : '';
  const selectedBoard =
    selectedClassParsed.board || normalizeBoardKey(selectedFilterBoard);

  /** Subjects from catalog + groups inferred from content (orphan / deleted subject refs). */
  const subjectsForClass = useMemo(() => {
    if (!selectedClassNumber) return [];
    const normClass = normalizeClassNumber(selectedClassNumber);
    const normBoard = normalizeBoardKey(selectedBoard);
    const selectedCat = normalizeIitCategory(selectedProductCategory) || '';
    const map = new Map<string, SubjectItem>();

    subjects.forEach((subj) => {
      if (!isActiveCatalogSubject(subj)) return;
      if ((resolveSubjectProductCategory(subj) || '') !== selectedCat) return;

      const subjClass = subj.classNumber
        ? normalizeClassNumber(subj.classNumber)
        : normalizeClassNumber(extractClassNumberFromSubjectName(subj.name) || '');
      const subjBoard = normalizeBoardKey(subj.board || '');
      if (normBoard && subjBoard && !boardsMatch(subjBoard, normBoard)) return;
      const linkedViaContent = contents.some((item) => {
        if (!contentMatchesClassBoard(item, subjects, normClass, normBoard)) return false;
        if ((resolveContentProductCategory(item, subjects) || '') !== selectedCat) return false;
        const sid = getContentSubjectId(item);
        return sid != null && String(sid) === String(subj._id);
      });
      if (subjClass === normClass || linkedViaContent) {
        const rowClass = subjClass || normClass;
        const groupKey = subjectSidebarKey(
          subj.name,
          rowClass,
          normBoard || subjBoard,
          resolveSubjectProductCategory(subj),
        );
        const existing = map.get(groupKey);
        const preferThis =
          !existing ||
          (isInferredSubjectId(existing._id) && isMongoObjectId(subj._id));
        if (preferThis) {
          map.set(groupKey, {
            ...subj,
            name: displaySubjectName(subj.name),
            classNumber: rowClass || subj.classNumber,
            board: normBoard || subjBoard || subj.board,
            productCategory: resolveSubjectProductCategory(subj),
          });
        }
      }
    });

    contents.forEach((item) => {
      if (!contentMatchesClassBoard(item, subjects, normClass, normBoard)) return;
      if ((resolveContentProductCategory(item, subjects) || '') !== selectedCat) return;
      const sid = getContentSubjectId(item);
      const linked =
        sid && isMongoObjectId(sid)
          ? subjects.find((s) => String(s._id) === String(sid))
          : undefined;

      // Active catalog subject wins — never invent a sidebar row from a video title.
      if (linked && isActiveCatalogSubject(linked)) {
        const subjClass = linked.classNumber
          ? normalizeClassNumber(linked.classNumber)
          : normalizeClassNumber(extractClassNumberFromSubjectName(linked.name) || '') ||
            normClass;
        const groupKey = subjectSidebarKey(
          linked.name,
          subjClass || normClass,
          normBoard || normalizeBoardKey(linked.board || ''),
          resolveSubjectProductCategory(linked),
        );
        if (!map.has(groupKey)) {
          map.set(groupKey, {
            ...linked,
            name: displaySubjectName(linked.name),
            classNumber: subjClass || normClass,
            board: normBoard || linked.board,
            productCategory: resolveSubjectProductCategory(linked),
          });
        }
        return;
      }

      if (linked && !isActiveCatalogSubject(linked)) return;

      const label = item.subject?.name
        ? displaySubjectName(item.subject.name)
        : inferSubjectLabelFromContent(item);
      // Skip title-like ghosts that somehow still look like catalog names already shown.
      if (!label || label === 'Unassigned') return;

      const board = item.board || BOARD_CODE;
      const itemCat = resolveContentProductCategory(item, subjects);
      const groupKey = subjectSidebarKey(label, normClass, normBoard || board, itemCat);
      const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const idKey =
        sid && isMongoObjectId(sid) && !isInferredSubjectId(sid) ? String(sid) : `inferred-${slug}`;

      const existing = map.get(groupKey);
      if (!existing) {
        map.set(groupKey, {
          _id: idKey,
          name: label,
          board: normBoard || board,
          classNumber: normClass,
          productCategory: itemCat,
          isActive: item.isActive,
        });
      } else if (
        sid &&
        isMongoObjectId(sid) &&
        isInferredSubjectId(existing._id) &&
        !isInferredSubjectId(sid)
      ) {
        map.set(groupKey, { ...existing, _id: String(sid), board: existing.board || board });
      }
    });

    return Array.from(map.values()).sort((a, b) =>
      extractPlainSubjectName(a.name).localeCompare(extractPlainSubjectName(b.name))
    );
  }, [subjects, selectedClassNumber, selectedBoard, selectedProductCategory, contents]);

  // Keep subject selection in sync with the selected class (skip while editing content).
  useEffect(() => {
    if (isAddContentOpen && editingContentId) return;

    if (!selectedClassNumber) {
      setSelectedSubjectId(null);
      return;
    }
    if (subjectsForClass.length === 0) {
      setSelectedSubjectId(null);
      return;
    }
    const stillValid = subjectsForClass.some(
      (s) => String(s._id) === String(selectedSubjectId)
    );
    if (!stillValid) {
      const catalog =
        subjectsForClass.find((s) => isCatalogSubjectId(s._id, subjects)) ??
        subjectsForClass[0];
      setSelectedSubjectId(catalog._id);
    }
  }, [
    selectedClassNumber,
    subjectsForClass,
    selectedSubjectId,
    subjects,
    isAddContentOpen,
    editingContentId,
  ]);

  const matchesSubjectAndClass = useMemo(() => {
    if (!selectedSubjectId || !selectedClassNumber) return () => false;

    const selectedRow = subjectsForClass.find((s) => String(s._id) === String(selectedSubjectId));
    const selectedPlain = selectedRow
      ? extractPlainSubjectName(selectedRow.name).toLowerCase()
      : '';
    const selectedCat = normalizeIitCategory(selectedProductCategory) || '';

    return (item: ContentItem) => {
      if (!contentMatchesClassBoard(item, subjects, selectedClassNumber, selectedBoard)) {
        return false;
      }
      if ((resolveContentProductCategory(item, subjects) || '') !== selectedCat) {
        return false;
      }

      const sid = getContentSubjectId(item);
      if (sid && String(sid) === String(selectedSubjectId)) return true;
      if (String(item.subject?._id) === String(selectedSubjectId)) return true;

      const itemPlain = (
        item.subject?.name
          ? extractPlainSubjectName(item.subject.name)
          : inferSubjectLabelFromContent(item)
      ).toLowerCase();
      if (!selectedPlain || !itemPlain) return false;
      // Maths / Mathematics / Math must share Content under the same sidebar row
      return (
        itemPlain === selectedPlain ||
        normalizeSubjectDisplayKey(itemPlain) === normalizeSubjectDisplayKey(selectedPlain)
      );
    };
  }, [
    contents,
    selectedSubjectId,
    selectedClassNumber,
    selectedBoard,
    selectedProductCategory,
    subjects,
    subjectsForClass,
  ]);

  const contentCountForClass = useMemo(() => {
    if (!selectedClassNumber) return 0;
    const selectedCat = normalizeIitCategory(selectedProductCategory) || '';
    return contents.filter(
      (item) =>
        contentMatchesClassBoard(item, subjects, selectedClassNumber, selectedBoard) &&
        (resolveContentProductCategory(item, subjects) || '') === selectedCat,
    ).length;
  }, [contents, selectedClassNumber, selectedBoard, selectedProductCategory, subjects]);

  const filteredContents = useMemo(() => {
    if (!selectedSubjectId || !selectedClassNumber) return [];
    return contents.filter((item) => matchesSubjectAndClass(item));
  }, [contents, selectedSubjectId, selectedClassNumber, matchesSubjectAndClass]);

  /** Subject that owns the content in Add/Edit Content dialog (syllabus/state always follow this). */
  const editingContentItem = useMemo(
    () =>
      editingContentId
        ? contents.find((x) => x._id === editingContentId) ?? null
        : null,
    [editingContentId, contents]
  );

  const linkedSubjectForContent = useMemo((): SubjectItem | null => {
    if (!isAddContentOpen) return null;
    if (editingContentId) {
      return resolveSubjectForContent(editingContentItem, subjects);
    }
    if (!selectedSubjectId) return null;
    return (
      subjects.find((s) => String(s._id) === String(selectedSubjectId)) ??
      subjectsForClass.find((s) => String(s._id) === String(selectedSubjectId)) ??
      null
    );
  }, [
    isAddContentOpen,
    editingContentId,
    editingContentItem,
    subjects,
    subjectsForClass,
    selectedSubjectId,
  ]);

  const chapterContentGroups = useMemo(() => {
    const knownTypes = new Set(CONTENT_TYPE_SECTIONS.flatMap((s) => s.types));
    const byChapter = new Map<string, ContentItem[]>();

    for (const item of filteredContents) {
      const n = chapterNumberFromContent(item);
      const key = n != null ? String(n) : 'unassigned';
      const list = byChapter.get(key);
      if (list) list.push(item);
      else byChapter.set(key, [item]);
    }

    const keys = Array.from(byChapter.keys()).sort((a, b) => {
      if (a === 'unassigned') return 1;
      if (b === 'unassigned') return -1;
      return parseInt(a, 10) - parseInt(b, 10);
    });

    return keys.map((key) => {
      const items = sortContentsChapterWise(byChapter.get(key) || []);
      const typeSections = CONTENT_TYPE_SECTIONS.map(({ title, types }) => ({
        title,
        items: items.filter((c) => types.includes(c.type)),
      })).filter((s) => s.items.length > 0);

      const other = items.filter((c) => !knownTypes.has(c.type));
      if (other.length > 0) {
        typeSections.push({ title: 'Other', items: other });
      }

      return {
        key,
        label: key === 'unassigned' ? 'General (no chapter)' : `Chapter ${key}`,
        total: items.length,
        typeSections,
      };
    });
  }, [filteredContents]);

  const selectedChapterGroup = useMemo(
    () => chapterContentGroups.find((g) => g.key === selectedChapterKey) ?? null,
    [chapterContentGroups, selectedChapterKey],
  );

  useEffect(() => {
    if (!chapterContentGroups.length) {
      setSelectedChapterKey('');
      return;
    }
    if (!chapterContentGroups.some((g) => g.key === selectedChapterKey)) {
      setSelectedChapterKey(chapterContentGroups[0].key);
    }
  }, [chapterContentGroups, selectedChapterKey]);

  const fetchSubjects = async () => {
    setIsLoadingSubjects(true);
    try {
      const token = getAuthToken();
      const response = await fetch(
        `${API_BASE_URL}/api/super-admin/subjects?includeInactive=true`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        if (data.success && Array.isArray(data.data)) {
          const normalized = data.data.map((raw: SubjectItem & { id?: string }) => ({
            ...raw,
            _id: String(raw._id || raw.id),
            name: displaySubjectName(raw.name),
            isActive:
              raw.isActive !== false && !isSoftDeletedSubjectName(String(raw.name || '')),
            classNumber:
              raw.classNumber?.trim() ||
              extractClassNumberFromSubjectName(raw.name) ||
              undefined,
          }));
          setSubjects(normalized);
        }
      } else {
        toast({
          title: 'Error',
          description: `Failed to load subjects (${response.status})`,
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Failed to fetch subjects:', error);
      toast({
        title: 'Error',
        description: 'Failed to load subjects',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingSubjects(false);
    }
  };

  const normalizeContentRows = (rows: ContentItem[]) =>
    rows.map((row: ContentItem) => ({
      ...row,
      chapter: row.chapter ? videoNumberOnly(row.chapter) || undefined : undefined,
      module: row.module ? videoNumberOnly(row.module) || undefined : undefined,
      classNumber:
        row.classNumber?.trim() ||
        row.subject?.classNumber?.trim() ||
        extractClassNumberFromSubjectName(row.subject?.name || '') ||
        undefined,
    }));

  const fetchContents = async () => {
    setIsLoadingContents(true);
    try {
      const token = getAuthToken();
      const headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      };
      const query = 'includeInactive=true';

      const allUrl = `${API_BASE_URL}/api/super-admin/content?${query}`;
      const allResponse = await fetch(allUrl, { headers });

      let merged: ContentItem[] = [];

      if (allResponse.ok) {
        const data = await allResponse.json();
        if (data.success && Array.isArray(data.data)) {
          merged = normalizeContentRows(data.data);
        } else {
          toast({
            title: 'Error',
            description: data.message || 'Failed to load content',
            variant: 'destructive',
          });
        }
      } else {
        const byId = new Map<string, ContentItem>();
        const boardResponses = await Promise.all(
          CONTENT_FETCH_BOARDS.map((board) =>
            fetch(
              `${API_BASE_URL}/api/super-admin/boards/${board}/content?${query}`,
              { headers }
            )
          )
        );
        let anyOk = false;
        for (const response of boardResponses) {
          if (!response.ok) continue;
          anyOk = true;
          const data = await response.json();
          if (data.success && Array.isArray(data.data)) {
            for (const row of normalizeContentRows(data.data)) {
              byId.set(String(row._id), row);
            }
          }
        }
        merged = Array.from(byId.values());
        if (!anyOk) {
          toast({
            title: 'Error',
            description: 'Failed to load content',
            variant: 'destructive',
          });
          return;
        }
      }

      setContents(merged);
    } catch (error) {
      console.error('Failed to fetch contents:', error);
      toast({
        title: 'Error',
        description: 'Failed to load content',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingContents(false);
    }
  };

  const handleOpenAddClass = () => {
    setNewClassNumber('');
    setNewClassDescription('');
    setIsAddClassOpen(true);
  };

  const handleSaveClass = () => {
    const num = newClassNumber.trim().replace(/^class\s*/i, '');
    if (!num || !/^\d{1,2}$/.test(num)) {
      toast({
        title: 'Enter a class number',
        description: 'Use a number like 6, 7, 10, or 12.',
        variant: 'destructive',
      });
      return;
    }
    const label = formatClassBoardLabel(num, selectedFilterBoard);
    const alreadyListed =
      classOptions.includes(label) || manualClassLabels.includes(label);
    if (!alreadyListed) {
      const saved = saveCurriculumClass({
        classNumber: num,
        description: newClassDescription.trim(),
        label,
      });
      if (!saved) {
        toast({
          title: 'Class already exists',
          description: `${label} is already in the list.`,
          variant: 'destructive',
        });
        return;
      }
    }
    setManualClassLabels((prev) => (prev.includes(label) ? prev : [...prev, label]));
    setSelectedClassLabel(label);
    setSelectedSubjectId(null);
    setIsAddClassOpen(false);
    setNewClassNumber('');
    setNewClassDescription('');
    toast({
      title: 'Class added',
      description: `Class ${num} selected. Use Add Subject to add subjects for this class.`,
    });
  };

  const handleDeleteClass = async (label: string) => {
    const { classNum, board } = parseClassBoardLabel(label);
    if (!classNum) return;

    const normClass = normalizeClassNumber(classNum);
    const normBoard = normalizeBoardKey(board);

    const subjectsToDelete = subjects.filter((subj) => {
      if (!isActiveCatalogSubject(subj)) return false;
      const subjClass = subj.classNumber
        ? normalizeClassNumber(subj.classNumber)
        : normalizeClassNumber(extractClassNumberFromSubjectName(subj.name) || '');
      if (subjClass !== normClass) return false;
      if (normBoard) {
        return boardsMatch(subj.board, normBoard);
      }
      return !normalizeBoardKey(subj.board || '');
    });

    const contentsToDelete = contents.filter((item) =>
      contentMatchesClassBoard(item, subjects, normClass, normBoard)
    );

    const hasData = subjectsToDelete.length > 0 || contentsToDelete.length > 0;
    const confirmMsg = hasData
      ? `Delete "${label}" and all its subjects (${subjectsToDelete.length}) and content (${contentsToDelete.length})? This cannot be undone.`
      : `Remove "${label}" from the list?`;

    const ok = await confirm({
      title: hasData ? 'Delete this class?' : 'Remove this class?',
      description: confirmMsg,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;

    setDeletingClassLabel(label);
    try {
      const token = getAuthToken();
      let deletedSubjects = 0;
      let deletedContents = 0;
      let lastError = '';

      for (const target of subjectsToDelete) {
        const response = await fetch(
          `${API_BASE_URL}/api/super-admin/subjects/${target._id}`,
          {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          }
        );
        const data = await response.json().catch(() => ({}));
        if (response.ok && data.success !== false) {
          deletedSubjects += 1;
        } else {
          lastError = data.message || 'Failed to delete subject';
        }
      }

      // Subject delete may cascade content; remove any items still listed for this class.
      for (const item of contentsToDelete) {
        const response = await fetch(
          `${API_BASE_URL}/api/super-admin/content/${item._id}`,
          {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          }
        );
        const data = await response.json().catch(() => ({}));
        if (response.ok && data.success !== false) {
          deletedContents += 1;
        } else if (!lastError) {
          lastError = data.message || 'Failed to delete content';
        }
      }

      removeCurriculumClass(label);
      setManualClassLabels((prev) => prev.filter((l) => l !== label));

      if (selectedClassLabel === label) {
        setSelectedClassLabel(null);
        setSelectedSubjectId(null);
      }

      await fetchSubjects();
      await fetchContents();

      if (
        hasData &&
        deletedSubjects === 0 &&
        deletedContents === 0 &&
        subjectsToDelete.length > 0
      ) {
        toast({
          title: 'Error',
          description: lastError || 'Failed to delete class',
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: 'Class deleted',
        description:
          deletedSubjects > 0 || deletedContents > 0
            ? `Removed ${label} with ${deletedSubjects} subject${deletedSubjects === 1 ? '' : 's'} and related content.`
            : `${label} removed from the list.`,
      });
    } catch (error) {
      console.error('Failed to delete class:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete class',
        variant: 'destructive',
      });
    } finally {
      setDeletingClassLabel(null);
    }
  };

  const handleOpenAddSubject = () => {
    if (!selectedClassNumber) {
      toast({
        title: 'Select a class',
        description: 'Add or select a class on the left before adding a subject.',
        variant: 'destructive',
      });
      return;
    }
    setNewSubjectName('');
    const preferIit =
      Boolean(normalizeIitCategory(selectedProductCategory)) ||
      boardsMatch(selectedFilterBoard, 'IIT');
    const iitCode =
      SYLLABUS_OPTIONS.find((o) => boardsMatch(o.value, 'IIT'))?.value || 'IIT';
    setNewSubjectSyllabus(
      (preferIit
        ? iitCode
        : selectedFilterBoard || selectedBoard || 'CBSE') as SyllabusBoard
    );
    setNewSubjectStateName('');
    setNewSubjectProductCategory(selectedProductCategory || '');
    setIsAddSubjectOpen(true);
  };

  const handleSaveSubject = async () => {
    if (!newSubjectName.trim() || !selectedClassNumber) {
      toast({
        title: 'Validation error',
        description: 'Subject name is required.',
        variant: 'destructive',
      });
      return;
    }

    if (newSubjectSyllabus === 'STATE' && !newSubjectStateName.trim()) {
      toast({
        title: 'Validation error',
        description: 'Select a state for State syllabus.',
        variant: 'destructive',
      });
      return;
    }

    const preferIitBoard =
      boardsMatch(newSubjectSyllabus, 'IIT') ||
      /iit|neet|jee/i.test(String(newSubjectSyllabus || ''));
    if (preferIitBoard && !normalizeIitCategory(newSubjectProductCategory)) {
      toast({
        title: 'Validation error',
        description: 'Select a product category (Alpha / Beta / Gamma) for IIT subjects.',
        variant: 'destructive',
      });
      return;
    }

    setIsSavingSubject(true);
    try {
      const token = getAuthToken();
      const storedName = `${newSubjectName.trim()}_${selectedClassNumber}`;
      const body: Record<string, string> = {
        name: storedName,
        board: newSubjectSyllabus,
        classNumber: selectedClassNumber,
      };
      if (newSubjectSyllabus === 'STATE') {
        body.stateName = newSubjectStateName.trim();
      }
      const cat = normalizeIitCategory(newSubjectProductCategory) || '';
      body.productCategory = cat;

      const response = await fetch(`${API_BASE_URL}/api/super-admin/subjects`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok && data.success) {
        toast({
          title: 'Subject created',
          description: 'Subject added successfully under the selected class.',
        });
        setIsAddSubjectOpen(false);
        await fetchSubjects();
      } else {
        toast({
          title: 'Error',
          description:
            data.message ||
            data.error ||
            'Failed to create subject',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Failed to create subject:', error);
      toast({
        title: 'Error',
        description: 'Failed to create subject',
        variant: 'destructive',
      });
    } finally {
      setIsSavingSubject(false);
    }
  };

  const handleOpenEditSubject = (subject: SubjectItem) => {
    const classNum = subject.classNumber || extractClassNumberFromSubjectName(subject.name);
    if (classNum) {
      setSelectedClassLabel(
        formatClassBoardLabel(classNum, subject.board || selectedBoard || selectedFilterBoard)
      );
    }
    setEditingSubject(subject);
    setEditSubjectName(extractPlainSubjectName(subject.name));
    const b = (subject.board || BOARD_CODE).toUpperCase() as SyllabusBoard;
    const allowedSyllabus = new Set(SYLLABUS_OPTIONS.map((o) => o.value));
    setEditSubjectSyllabus(
      allowedSyllabus.has(b) || b === 'ASLI_EXCLUSIVE_SCHOOLS' ? b : (SYLLABUS_OPTIONS[0]?.value || 'CBSE')
    );
    setEditSubjectStateName(subject.stateName?.trim() || '');
    setEditSubjectProductCategory(resolveSubjectProductCategory(subject));
    setIsEditSubjectOpen(true);
  };

  const handleUpdateSubject = async () => {
    if (!editingSubject || !editSubjectName.trim() || !selectedClassNumber) {
      toast({
        title: 'Validation error',
        description: 'Subject name is required.',
        variant: 'destructive',
      });
      return;
    }

    if (editSubjectSyllabus === 'STATE' && !editSubjectStateName.trim()) {
      toast({
        title: 'Validation error',
        description: 'Select a state for State syllabus.',
        variant: 'destructive',
      });
      return;
    }

    const preferIitBoard =
      boardsMatch(editSubjectSyllabus, 'IIT') ||
      /iit|neet|jee/i.test(String(editSubjectSyllabus || ''));
    if (preferIitBoard && !normalizeIitCategory(editSubjectProductCategory)) {
      toast({
        title: 'Validation error',
        description: 'Select a product category (Alpha / Beta / Gamma) for IIT subjects.',
        variant: 'destructive',
      });
      return;
    }

    setIsSavingSubject(true);
    try {
      const token = getAuthToken();
      const storedName = `${editSubjectName.trim()}_${selectedClassNumber}`;
      const cat = normalizeIitCategory(editSubjectProductCategory) || '';
      const response = await fetch(
        `${API_BASE_URL}/api/super-admin/subjects/${editingSubject._id}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: storedName,
            classNumber: selectedClassNumber,
            board: editSubjectSyllabus,
            productCategory: cat,
            ...(editSubjectSyllabus === 'STATE'
              ? { stateName: editSubjectStateName.trim() }
              : { stateName: '' }),
          }),
        }
      );
      const data = await response.json().catch(() => ({}));

      if (response.ok && data.success) {
        toast({ title: 'Subject updated', description: 'Subject updated successfully.' });
        setIsEditSubjectOpen(false);
        setEditingSubject(null);
        await fetchSubjects();
      } else {
        toast({
          title: 'Error',
          description: data.message || 'Failed to update subject',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Failed to update subject:', error);
      toast({
        title: 'Error',
        description: 'Failed to update subject',
        variant: 'destructive',
      });
    } finally {
      setIsSavingSubject(false);
    }
  };

  const handleDeleteSubject = async (subjectId: string) => {
    const row =
      subjectsForClass.find((s) => String(s._id) === String(subjectId)) ??
      subjects.find((s) => String(s._id) === String(subjectId));

    if (!isMongoObjectId(subjectId) || isInferredSubjectId(subjectId)) {
      toast({
        title: 'Cannot delete',
        description:
          'This row is only a content group, not a catalog subject. Delete the videos/files under it instead.',
        variant: 'destructive',
      });
      return;
    }

    const catalogRow = subjects.find(
      (s) => String(s._id) === String(subjectId) && isActiveCatalogSubject(s)
    );
    if (!catalogRow) {
      toast({
        title: 'Cannot delete',
        description: 'This subject is not in the active catalog.',
        variant: 'destructive',
      });
      return;
    }

    const label = extractPlainSubjectName(row?.name || catalogRow.name);
    const ok = await confirm({
      title: 'Delete this subject?',
      description: `Delete "${label}" and all its content for this class? This only removes this one subject.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;

    setDeletingSubjectId(subjectId);
    try {
      const token = getAuthToken();
      const response = await fetch(
        `${API_BASE_URL}/api/super-admin/subjects/${subjectId}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      const data = await response.json().catch(() => ({}));

      if (response.ok && data.success !== false) {
        // Optimistic UI — don't wait for refetch to clear the row.
        setSubjects((prev) => prev.filter((s) => String(s._id) !== String(subjectId)));
        setContents((prev) =>
          prev.filter((c) => String(getContentSubjectId(c) || '') !== String(subjectId))
        );
        if (String(selectedSubjectId) === String(subjectId)) {
          setSelectedSubjectId(null);
        }
        toast({
          title: 'Subject deleted',
          description: 'Subject and related content deleted successfully.',
        });
        await fetchSubjects();
        await fetchContents();
      } else {
        toast({
          title: 'Error',
          description: data.message || data.error || 'Failed to delete subject',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Failed to delete subject:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete subject',
        variant: 'destructive',
      });
    } finally {
      setDeletingSubjectId(null);
    }
  };

  const handleOpenAddContent = () => {
    if (!selectedSubjectId || !selectedClassNumber) {
      toast({
        title: 'Select subject',
        description: 'Please select a subject before adding content.',
        variant: 'destructive',
      });
      return;
    }
    if (isInferredSubjectId(selectedSubjectId)) {
      toast({
        title: 'Catalog subject required',
        description:
          'Add a catalog subject first (use Add Subject or Sync Missing Subjects), then add content.',
        variant: 'destructive',
      });
      return;
    }
    setContentForm({
      title: '',
      description: '',
      type: 'Video',
      date: '',
      fileUrl: '',
      thumbnailUrl: '',
      chapter: '',
      module: '',
    });
    setEditingContentId(null);
    setEditContentContext(null);
    clearSelectedUploadFile();
    setIsAddContentOpen(true);
  };

  const handleOpenEditContent = (content: ContentItem) => {
    const effClass = effectiveContentClass(content, subjects);
    const classLabel = effClass
      ? `Class ${normalizeClassNumber(effClass)}`
      : selectedClassLabel ?? '';

    const resolvedSubj = resolveSubjectForContent(content, subjects);
    const plain = content.subject?.name
      ? extractPlainSubjectName(content.subject.name)
      : inferSubjectLabelFromContent(content);
    const sid = getContentSubjectId(content);
    const subjectId =
      sid && !sid.startsWith('inferred-')
        ? String(sid)
        : `inferred-${plain.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

    if (classLabel) setSelectedClassLabel(classLabel);
    setSelectedSubjectId(subjectId);

    setEditContentContext({
      classLabel,
      subjectName: resolvedSubj
        ? extractPlainSubjectName(resolvedSubj.name)
        : plain,
      board: resolvedSubj?.board || content.board || BOARD_CODE,
      stateName: resolvedSubj?.stateName || content.stateName,
      subjectId,
    });

    setEditingContentId(content._id);
    setContentForm({
      title: content.title || '',
      description: content.description || '',
      type: content.type,
      date: new Date(content.date || content.createdAt).toISOString().slice(0, 10),
      fileUrl: content.fileUrl || '',
      thumbnailUrl: content.thumbnailUrl || '',
      chapter: videoNumberOnly(content.chapter || ''),
      module: videoNumberOnly(content.module || ''),
    });
    setSelectedUploadFile(null);
    setUploadInputKey((k) => k + 1);
    setPdfCoverPage(1);
    setPdfPageCount(null);
    setIsAddContentOpen(true);
  };

  const handleSaveContent = async () => {
    const editingItem = editingContentId
      ? contents.find((c) => c._id === editingContentId)
      : null;
    const subjectIdForValidation = editingContentId
      ? getContentSubjectId(editingItem!) || selectedSubjectId
      : selectedSubjectId;

    const fileUrlForSave = normalizeServerContentFileUrl(contentForm.fileUrl);
    if (
      !subjectIdForValidation ||
      !contentForm.title.trim() ||
      !fileUrlForSave ||
      (!editingContentId && !String(contentForm.type || '').trim())
    ) {
      toast({
        title: 'Validation error',
        description: editingContentId
          ? 'Title and file/video URL are required.'
          : 'Title, type, file/video URL, class and subject are required.',
        variant: 'destructive',
      });
      return;
    }

    if (!editingContentId && !selectedClassNumber) {
      toast({
        title: 'Validation error',
        description: 'Select a class before adding content.',
        variant: 'destructive',
      });
      return;
    }

    const saveContentType = editingItem?.type ?? contentForm.type;
    const chapterNum = videoNumberOnly(contentForm.chapter);
    const moduleNum = videoNumberOnly(contentForm.module);
    // New videos need a chapter number; module is optional (if set, must be numeric).
    if (saveContentType === 'Video' && !editingContentId && !isVideoNumber(chapterNum)) {
      toast({
        title: 'Validation error',
        description: 'Chapter must be a number (e.g. 1). Module is optional.',
        variant: 'destructive',
      });
      return;
    }
    if (saveContentType === 'Video' && moduleNum && !isVideoNumber(moduleNum)) {
      toast({
        title: 'Validation error',
        description: 'Module must be a number only (e.g. 1), or leave it blank.',
        variant: 'destructive',
      });
      return;
    }

    if (!isValidContentSourceUrl(fileUrlForSave, contentForm.type)) {
      toast({
        title: contentForm.type === 'Video' ? 'Video source required' : 'Upload required',
        description:
          contentForm.type === 'Video'
            ? 'Enter a valid video URL (YouTube, Vimeo, or direct https link).'
            : contentForm.type === 'Audio'
              ? 'Enter an audio URL or upload a file to the server first.'
              : 'Please upload the file first. Only server files (/uploads/...) are allowed.',
        variant: 'destructive',
      });
      return;
    }

    if (isInferredSubjectId(subjectIdForValidation)) {
      toast({
        title: 'Catalog subject required',
        description:
          'Add a catalog subject first (use Add Subject or Sync Missing Subjects), then add content.',
        variant: 'destructive',
      });
      return;
    }

    const resolvedSubjectId =
      (editingContentId ? getContentSubjectId(editingItem!) : null) ||
      resolveCatalogSubjectIdForSave(
        subjectIdForValidation,
        subjects,
        selectedClassNumber,
        subjectsForClass
      ) ||
      (isMongoObjectId(subjectIdForValidation) ? String(subjectIdForValidation) : null);

    if (!resolvedSubjectId) {
      toast({
        title: 'Subject required',
        description:
          'Use "Add Subject" to create this subject in the catalog first, then add content.',
        variant: 'destructive',
      });
      return;
    }

    const saveSubjectId = resolvedSubjectId;
    const subj =
      subjects.find((s) => String(s._id) === String(saveSubjectId)) ??
      subjectsForClass.find((s) => String(s._id) === String(saveSubjectId)) ??
      resolveSubjectForContent(editingItem, subjects);

    if (!subj) {
      toast({
        title: 'Validation error',
        description: 'Could not resolve the subject for this content item.',
        variant: 'destructive',
      });
      return;
    }

    if (!editingContentId) {
      const expectedBoard = normalizeIitCategory(selectedProductCategory)
        ? 'IIT'
        : selectedBoard;
      const selectedCategory = normalizeIitCategory(selectedProductCategory) || '';
      const subjectCategory = resolveSubjectProductCategory(subj);

      if (!boardsMatch(subj.board, expectedBoard)) {
        toast({
          title: 'Board mismatch',
          description: `This subject belongs to ${syllabusLabel(subj.board, SYLLABUS_OPTIONS)}, not ${syllabusLabel(expectedBoard, SYLLABUS_OPTIONS)}. Select or create the subject under the correct board before saving.`,
          variant: 'destructive',
        });
        return;
      }
      if (subjectCategory !== selectedCategory) {
        toast({
          title: 'Track mismatch',
          description: selectedCategory
            ? `Select or create this subject under IIT ${formatIitCategoryLabel(selectedCategory, iitLabelMap)} before saving.`
            : 'This is an IIT-track subject. Select its Alpha, Beta, Gamma, or Delta track before saving.',
          variant: 'destructive',
        });
        return;
      }
    }

    const subBoard = (subj.board || editingItem?.board || BOARD_CODE).toUpperCase() as SyllabusBoard;
    const knownCodes = new Set([
      ...CONTENT_FETCH_BOARDS.map((c) => String(c).toUpperCase()),
      'ASLI_EXCLUSIVE_SCHOOLS',
      'CBSE',
      'STATE',
      'IIT',
    ]);
    const normalizedSubBoard: SyllabusBoard = knownCodes.has(subBoard) ? subBoard : subBoard || 'CBSE';
    if (normalizedSubBoard === 'STATE' && !(subj.stateName || '').trim()) {
      toast({
        title: 'Subject incomplete',
        description:
          'This subject uses State syllabus but has no state set. Edit the subject and choose a state first.',
        variant: 'destructive',
      });
      return;
    }

    setIsSavingContent(true);
    try {
      const token = getAuthToken();
      const classForPayload =
        selectedClassNumber ||
        (editingItem
          ? String(
              editingItem.classNumber ||
                effectiveContentClass(editingItem, subjects) ||
                ''
            )
          : '');
      if (!classForPayload) {
        toast({
          title: 'Validation error',
          description: 'Could not determine class for this content.',
          variant: 'destructive',
        });
        setIsSavingContent(false);
        return;
      }
      const normalizedFileUrl = normalizeServerContentFileUrl(contentForm.fileUrl);
      const body: Record<string, unknown> = {
        title: contentForm.title.trim(),
        description: contentForm.description?.trim() || undefined,
        fileUrl: normalizedFileUrl,
        classNumber: classForPayload,
        productCategory:
          resolveSubjectProductCategory(subj) ||
          normalizeIitCategory(selectedProductCategory) ||
          '',
      };
      if (contentForm.thumbnailUrl?.trim()) {
        body.thumbnailUrl = contentForm.thumbnailUrl.trim();
      }
      if (contentForm.date?.trim()) {
        body.date = contentForm.date.trim();
      }
      if (isVideoNumber(chapterNum)) {
        body.chapter = chapterNum;
      } else if (editingContentId && saveContentType !== 'Video') {
        body.chapter = '';
      }
      if (saveContentType === 'Video') {
        // Module optional — send number when set; empty string clears on edit
        if (isVideoNumber(moduleNum)) {
          body.module = moduleNum;
        } else if (editingContentId) {
          body.module = '';
        }
      }

      if (!editingContentId) {
        body.type = contentForm.type;
        body.board = normalizedSubBoard;
        body.subject = saveSubjectId;
        body.stateName =
          normalizedSubBoard === 'STATE' ? String(subj.stateName || '').trim() : '';
      } else {
        body.board = normalizedSubBoard;
        body.stateName =
          normalizedSubBoard === 'STATE' ? String(subj.stateName || '').trim() : '';
        if (editingItem?.isActive === false) {
          body.isActive = true;
        }
      }

      const response = await fetch(
        editingContentId
          ? `${API_BASE_URL}/api/super-admin/content/${editingContentId}`
          : `${API_BASE_URL}/api/super-admin/content`,
        {
        method: editingContentId ? 'PUT' : 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok && data.success) {
        const savedRow = data.data as ContentItem | undefined;
        if (savedRow?._id) {
          const normalized = normalizeContentRows([savedRow])[0];
          setContents((prev) => {
            const existing = prev.find((c) => String(c._id) === String(normalized._id));
            const savedSubject = normalized.subject;
            const preserveSubject =
              savedSubject &&
              typeof savedSubject === 'object' &&
              (savedSubject as { name?: string }).name
                ? savedSubject
                : existing?.subject && typeof existing.subject === 'object'
                  ? existing.subject
                  : subj
                    ? {
                        _id: String(subj._id),
                        name: subj.name,
                        board: subj.board,
                        classNumber: subj.classNumber,
                        productCategory: subj.productCategory,
                      }
                    : savedSubject;

            const mergedRow = {
              ...existing,
              ...normalized,
              subject: preserveSubject,
            } as ContentItem;

            if (existing) {
              return prev.map((c) =>
                String(c._id) === String(normalized._id) ? mergedRow : c
              );
            }
            return [...prev, mergedRow];
          });
        }
        toast({
          title: editingContentId ? 'Content updated' : 'Content added',
          description: editingContentId
            ? 'Content updated successfully.'
            : 'Content added successfully under the selected subject.',
        });
        setIsAddContentOpen(false);
        setEditingContentId(null);
        setEditContentContext(null);
        await fetchContents();
      } else {
        toast({
          title: 'Error',
          description:
            data.message ||
            data.error ||
            `Failed to ${editingContentId ? 'update' : 'add'} content`,
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Failed to save content:', error);
      toast({
        title: 'Error',
        description: `Failed to ${editingContentId ? 'update' : 'add'} content`,
        variant: 'destructive',
      });
    } finally {
      setIsSavingContent(false);
    }
  };

  const handleUploadContentFile = async () => {
    if (!selectedUploadFile) {
      toast({
        title: 'Select a file',
        description: 'Please choose a file to upload first.',
        variant: 'destructive',
      });
      return;
    }

    setIsUploadingFile(true);
    try {
      const token = getAuthToken();
      const formData = new FormData();
      // Append non-file fields first so multipart parsers often populate req.body before the file part.
      formData.append('contentType', contentForm.type);
      formData.append('file', selectedUploadFile);

      const response = await fetch(
        `${API_BASE_URL}/api/super-admin/content/upload-file?contentType=${encodeURIComponent(
          contentForm.type
        )}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        }
      );

      const rawText = await response.text().catch(() => '');
      let data: { success?: boolean; message?: string; fileUrl?: string; code?: string } = {};
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch {
        data = {};
      }

      if (response.ok && data.success && typeof data.fileUrl === 'string') {
        const uploadedUrl = normalizeServerContentFileUrl(data.fileUrl);
        let nextThumbnailUrl = '';
        const isPdfUpload =
          selectedUploadFile.type === 'application/pdf' ||
          selectedUploadFile.name.toLowerCase().endsWith('.pdf');
        if (isPdfUpload) {
          try {
            const thumbDataUrl = await renderPdfFirstPageDataUrlFromFile(
              selectedUploadFile,
              pdfCoverPage
            );
            const uploadedThumb = await uploadContentThumbnailJpeg(thumbDataUrl, token || '');
            if (uploadedThumb) nextThumbnailUrl = uploadedThumb;
          } catch (thumbErr) {
            console.warn('PDF cover thumbnail skipped:', thumbErr);
          }
        }
        setContentForm((prev) => ({
          ...prev,
          fileUrl: uploadedUrl,
          thumbnailUrl: nextThumbnailUrl || prev.thumbnailUrl,
        }));
        if (!isPdfUpload) {
          clearSelectedUploadFile();
        }
        toast({
          title: 'Uploaded',
          description: isPdfUpload && nextThumbnailUrl
            ? `File uploaded using PDF page ${pdfCoverPage} as the cover. Change the page and upload again to replace it, then Save.`
            : 'File uploaded successfully. You can now save the content.',
        });
      } else {
        const serverMessage = data.message || response.statusText || 'Failed to upload file';
        const statusHint = uploadFailureHint(response.status);
        toast({
          title: 'Upload failed',
          description: `${serverMessage}${statusHint} (HTTP ${response.status})`,
          variant: 'destructive',
        });
      }
    } catch (error) {
      const uploadUrl = `${API_BASE_URL}/api/super-admin/content/upload-file`;
      console.error('Failed to upload content file:', error, { uploadUrl });
      const msg = error instanceof Error ? error.message : String(error);
      const looksLikeDroppedConnection =
        msg.includes('fetch') ||
        msg.includes('Failed to fetch') ||
        msg.includes('NetworkError') ||
        msg.includes('Load failed') ||
        msg.includes('aborted');
      toast({
        title: 'Upload failed',
        description: looksLikeDroppedConnection
          ? 'The server did not return a response. Check the internet connection and API availability. For large files, also verify the reverse-proxy size and timeout settings.'
          : `Upload error: ${msg}`,
        variant: 'destructive',
      });
    } finally {
      setIsUploadingFile(false);
    }
  };

  const handleDeleteContent = async (contentId: string) => {
    const ok = await confirm({
      title: 'Delete this content?',
      description: 'Delete this content item?',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    setDeletingContentId(contentId);
    try {
      const token = getAuthToken();
      const response = await fetch(
        `${API_BASE_URL}/api/super-admin/content/${contentId}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const data = await response.json().catch(() => ({}));

      if (response.ok && data.success !== false) {
        setContents((prev) => prev.filter((c) => c._id !== contentId));
        toast({
          title: 'Content deleted',
          description: 'This item was removed from your list.',
        });
        await fetchContents();
      } else {
        toast({
          title: 'Error',
          description: data.message || 'Failed to delete content',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Failed to delete content:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete content',
        variant: 'destructive',
      });
    } finally {
      setDeletingContentId(null);
    }
  };

  return (
    <div className="space-y-3 sm:space-y-4 lg:space-y-6">
      {ConfirmDialog}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">
            Subject &amp; Content Management
          </h2>
          <p className="text-gray-600 mt-1">
            Pick a board, then product category → class → subject → content. Create boards under{' '}
            <strong>Board Management</strong>.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
          Board
        </p>
        <div className="flex flex-wrap gap-2">
          {SYLLABUS_OPTIONS.map((opt) => {
            const isActive = boardsMatch(opt.value, selectedFilterBoard);
            return (
              <Button
                key={opt.value}
                type="button"
                variant="outline"
                className={`rounded-full border px-4 py-1.5 text-xs sm:text-sm font-medium transition-all ${
                  isActive
                    ? 'border-sky-500 bg-sky-50 text-sky-900 shadow-sm'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-sky-300 hover:bg-sky-50/40'
                }`}
                onClick={() => {
                  setSelectedFilterBoard(opt.value);
                  setSelectedSubjectId(null);
                }}
              >
                {opt.label}
              </Button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Board scopes the classes and subjects below (e.g. CBSE Class 6 vs IIT Class 6). Add
          more under <strong>Board Management</strong>.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
          Product category
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className={`rounded-full border px-4 py-1.5 text-xs sm:text-sm font-medium transition-all ${
              selectedProductCategory === ''
                ? 'border-orange-500 bg-orange-50 text-orange-800 shadow-sm'
                : 'border-slate-200 bg-white text-slate-700 hover:border-orange-300 hover:bg-orange-50/40'
            }`}
            onClick={() => {
              setSelectedProductCategory('');
              setSelectedSubjectId(null);
            }}
          >
            General
          </Button>
          {iitCategoryCodes.map((code) => {
            const isActive = selectedProductCategory === code;
            return (
              <Button
                key={code}
                type="button"
                variant="outline"
                className={`rounded-full border px-4 py-1.5 text-xs sm:text-sm font-medium transition-all ${
                  isActive
                    ? 'border-orange-500 bg-orange-50 text-orange-800 shadow-sm'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-orange-300 hover:bg-orange-50/40'
                }`}
                onClick={() => {
                  setSelectedProductCategory(code);
                  setSelectedSubjectId(null);
                  // IIT tracks (Alpha/Beta/Gamma) live on the IIT board — switch board filter so content appears
                  const iitOpt = SYLLABUS_OPTIONS.find((o) =>
                    boardsMatch(o.value, 'IIT')
                  );
                  setSelectedFilterBoard(iitOpt?.value || 'IIT');
                }}
              >
                {formatIitCategoryLabel(code, iitLabelMap)}
              </Button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          <strong>General</strong> = board curriculum (CBSE, etc.).{' '}
                <strong>Alpha / Beta / Gamma / Delta</strong> = IIT tracks — videos go to EduOTT; materials stay on
          Learning Paths. Pick Board <strong>IIT</strong> above when managing those tracks.
        </p>
      </div>

      <div className="space-y-3 sm:space-y-4 lg:space-y-6">
        {/* Row 1: Classes | Subjects */}
        <div className="grid grid-cols-1 lg:grid-cols-[300px,minmax(0,1fr)] gap-5">
          {/* Left: Classes */}
          <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 gap-2 pb-3">
            <CardTitle className="flex min-w-0 items-center gap-2 text-base">
              <span>Classes</span>
              {isLoadingSubjects && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />}
            </CardTitle>
            <Button
              type="button"
              size="icon"
              onClick={handleOpenAddClass}
              title="Add Class"
              aria-label="Add Class"
              className="h-8 w-8 shrink-0 bg-gradient-to-r from-orange-400 to-sky-400 text-white hover:from-orange-500 hover:to-sky-500"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {displayClassOptions.length === 0 && !isLoadingSubjects ? (
              <p className="text-xs sm:text-sm text-gray-500 py-4 text-center space-y-2">
                {selectedProductCategory ? (
                  <>
                    No IIT classes for{' '}
                    <strong>
                      {formatIitCategoryLabel(selectedProductCategory, iitLabelMap)}
                    </strong>{' '}
                    yet. Confirm Board is <strong>IIT</strong>, then click <strong>Add Class</strong>.
                    IIT videos belong here (EduOTT); board videos belong under General + curriculum
                    board.
                  </>
                ) : (
                  <>
                    No classes yet for this board under <strong>General</strong>. Click{' '}
                    <strong>Add Class</strong>, or switch to <strong>Alpha / Beta / Gamma</strong> for
                    IIT-track content.
                  </>
                )}
              </p>
            ) : (
              <div className="space-y-2 max-h-[480px] overflow-auto pr-1">
                {displayClassOptions.map((label) => {
                  const isActive = label === selectedClassLabel;
                  const isDeleting = deletingClassLabel === label;
                  const visibleClassNumber = parseClassBoardLabel(label).classNum;
                  return (
                    <div
                      key={label}
                      className={`flex items-center justify-between rounded-md border px-3 py-2 text-xs sm:text-sm ${
                        isActive
                          ? 'border-sky-400 bg-sky-50'
                          : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedClassLabel(label);
                          setSelectedSubjectId(null);
                        }}
                        className="flex items-center justify-between flex-1 min-w-0 text-left"
                      >
                        <div className="font-medium text-gray-900 truncate">
                          {visibleClassNumber ? `Class ${visibleClassNumber}` : label}
                        </div>
                        <ChevronRight className="w-3 h-3 sm:w-4 sm:h-4 text-gray-400 shrink-0 ml-2" />
                      </button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteClass(label);
                        }}
                        disabled={isDeleting || deletingClassLabel !== null}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 ml-1 shrink-0"
                        title="Delete class"
                      >
                        {isDeleting ? (
                          <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
                        )}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
          </Card>

          {/* Right: Subjects under Class */}
          <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Subjects under Class</CardTitle>
              <p className="text-xs sm:text-sm text-gray-500">
                {selectedClassLabel
                  ? `Showing subjects for Class ${selectedClassNumber} · ${
                      selectedProductCategory
                        ? `IIT ${formatIitCategoryLabel(selectedProductCategory, iitLabelMap)}`
                        : 'General'
                    }`
                  : 'Select a class to see subjects.'}
              </p>
            </div>
            <Button
              size="sm"
              onClick={handleOpenAddSubject}
              disabled={!selectedClassNumber}
              className="bg-gradient-to-r from-orange-400 to-sky-400 hover:from-orange-500 hover:to-sky-500 text-white"
            >
              <Plus className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
              Add Subject
            </Button>
          </CardHeader>
          <CardContent>
            {isLoadingSubjects ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 animate-spin text-sky-500" />
              </div>
            ) : !selectedClassNumber ? (
              <p className="text-xs sm:text-sm text-gray-500">
                Select a class from the left to view its subjects.
              </p>
            ) : subjectsForClass.length === 0 ? (
              <div className="py-4 sm:py-6 lg:py-8 text-center text-xs sm:text-sm text-gray-500 space-y-2">
                <p>
                  No subjects found for this class. Use &quot;Add Subject&quot; to
                  create one.
                </p>
                {contentCountForClass > 0 && (
                  <p className="text-amber-700">
                    {contentCountForClass} content item
                    {contentCountForClass === 1 ? '' : 's'} exist for this class but
                    are not linked to a catalog subject yet.
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-2 max-h-[480px] overflow-auto pr-1">
                {subjectsForClass.map((subj) => {
                  const rowKey = subjectSidebarKey(
                    subj.name,
                    subj.classNumber || selectedClassNumber || '',
                    selectedBoard || subj.board || '',
                    resolveSubjectProductCategory(subj),
                  );
                  const isActive = String(selectedSubjectId) === String(subj._id);
                  const Icon = BookOpen;
                  const inCatalog = isCatalogSubjectId(subj._id, subjects);
                  const isInferredRow = isInferredSubjectId(subj._id);
                  const canManageSubject =
                    !isInferredRow && isMongoObjectId(subj._id);
                  return (
                    <div
                      key={rowKey}
                      className={`flex items-center justify-between rounded-md border px-3 py-2 text-xs sm:text-sm ${
                        isActive
                          ? 'border-sky-400 bg-sky-50'
                          : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <button
                        className="flex items-center gap-3 flex-1 text-left"
                        onClick={() => setSelectedSubjectId(String(subj._id))}
                      >
                        <div className="p-2 rounded-md bg-sky-100 text-sky-700">
                          <Icon className="w-3 h-3 sm:w-4 sm:h-4" />
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">
                            {formatSubjectWithIitCategory(
                              extractPlainSubjectName(subj.name),
                              subj.productCategory,
                              iitLabelMap,
                            )}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {syllabusLabel(subj.board) ? (
                              <Badge variant="outline" className="text-micro font-normal">
                                {syllabusLabel(subj.board)}
                              </Badge>
                            ) : null}
                            {subj.board === 'STATE' && subj.stateName && (
                              <Badge variant="secondary" className="text-micro font-normal">
                                {subj.stateName}
                              </Badge>
                            )}
                          </div>
                          {subj.description && (
                            <div className="text-xs text-gray-500 line-clamp-1">
                              {subj.description}
                            </div>
                          )}
                        </div>
                      </button>
                      {canManageSubject ? (
                        <div className="flex items-center gap-1 ml-2 shrink-0">
                          {inCatalog ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleOpenEditSubject(subj)}
                              className="text-sky-600 hover:text-sky-700 hover:bg-sky-50"
                              title="Edit subject"
                            >
                              <Edit className="w-3 h-3 sm:w-4 sm:h-4" />
                            </Button>
                          ) : null}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteSubject(subj._id)}
                            disabled={deletingSubjectId === subj._id}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            title="Delete subject"
                          >
                            {deletingSubjectId === subj._id ? (
                              <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
                            )}
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
          </Card>
        </div>

        {/* Row 2: Content under Subject (full width) */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Content under Subject</CardTitle>
              <p className="text-xs sm:text-sm text-gray-500">
                {selectedSubjectId
                  ? 'Pick a chapter from the dropdown to see textbooks, workbooks, and more.'
                  : 'Select a subject to see its content.'}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={handleOpenAddContent}
              disabled={!selectedClassNumber || !selectedSubjectId}
              className="bg-gradient-to-r from-sky-300 to-teal-400 hover:from-sky-400 hover:to-teal-500 text-white"
            >
              <Plus className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
              Add Content
            </Button>
          </CardHeader>
          <CardContent>
            {isLoadingContents ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 animate-spin text-sky-500" />
              </div>
            ) : !selectedSubjectId ? (
              <p className="text-xs sm:text-sm text-gray-500">Select a subject to view content.</p>
            ) : filteredContents.length === 0 ? (
              <div className="py-4 sm:py-6 lg:py-8 text-center text-xs sm:text-sm text-gray-500">
                No content found for this subject. Use &quot;Add Content&quot; to create one.
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex flex-col gap-2 sm:max-w-sm">
                  <Label htmlFor="content-chapter-select">Chapter</Label>
                  <Select value={selectedChapterKey} onValueChange={setSelectedChapterKey}>
                    <SelectTrigger id="content-chapter-select" className="bg-white">
                      <SelectValue placeholder="Select chapter" />
                    </SelectTrigger>
                    <SelectContent>
                      {chapterContentGroups.map((chapter) => (
                        <SelectItem key={chapter.key} value={chapter.key}>
                          {chapter.label} ({chapter.total})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {!selectedChapterGroup ? (
                  <p className="text-xs text-gray-500 sm:text-sm">Select a chapter to view content.</p>
                ) : (
                  <div className="space-y-8">
                    {selectedChapterGroup.typeSections.map((section) => (
                      <div key={`${selectedChapterGroup.key}-${section.title}`} className="space-y-3">
                        <h3 className="border-b border-gray-200 pb-2 text-sm font-semibold text-gray-900 sm:text-base">
                          {section.title}
                          <span className="ml-2 text-xs font-normal text-stone-500">
                            ({section.items.length})
                          </span>
                        </h3>
                        <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
                          {section.items.map((content) => {
                        const Icon = getContentTypeIcon(content.type);
                        const subjectLabel = content.subject?.name
                          ? extractPlainSubjectName(content.subject.name)
                          : '';
                        const isTimedMedia =
                          content.type === 'Video' || content.type === 'Audio';
                        const durationLabel =
                          isTimedMedia && content.duration && content.duration > 0
                            ? `${content.duration} mins`
                            : null;

                        const fileUrl =
                          normalizeMediaUrl(content.fileUrl) || content.fileUrl;
                        const hasPreviewableFile = Boolean(
                          String(content.fileUrl || '').trim()
                        );
                        const cardPreview = resolveContentCardPreview(content, fileUrl);
                        const hasBrokenThumbnail = failedThumbnailIds.has(content._id);
                        const showImageThumb =
                          cardPreview.kind === 'image' && !hasBrokenThumbnail;
                        const pdfFetchUrl = isPdfPreviewContent(fileUrl, content.type)
                          ? getEmbeddedPdfIframeSrc(fileUrl, content.title).split('#')[0]
                          : '';
                        const skipPdfThumbFetch =
                          cardPreview.kind === 'pdf' &&
                          Boolean(pdfFetchUrl && pdfUnavailableUrls.has(pdfFetchUrl));

                        const renderPreviewIcon = (type: ContentType) => {
                          const PreviewIcon = getContentTypeIcon(type);
                          return (
                            <div className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                              {type === 'Video' ? (
                                <Video className="w-6 h-6 sm:w-7 sm:h-7 lg:w-8 lg:h-8 text-sky-500" />
                              ) : type === 'Audio' ? (
                                <Headphones className="w-6 h-6 sm:w-7 sm:h-7 lg:w-8 lg:h-8 text-sky-500" />
                              ) : (
                                <PreviewIcon className="w-7 h-7 text-sky-500" />
                              )}
                            </div>
                          );
                        };

                        return (
                          <div
                            key={content._id}
                            className="group rounded-xl border border-gray-200 overflow-hidden bg-white shadow-sm hover:shadow-md transition-shadow duration-200 flex flex-col"
                          >
                            <div className="relative h-40 overflow-hidden bg-gradient-to-br from-sky-100 to-teal-100 flex items-center justify-center">
                              {showImageThumb ? (
                                <>
                                  <img
                                    src={cardPreview.src}
                                    alt={content.title}
                                    className="w-full h-full object-cover"
                                    loading="lazy"
                                    onError={() => {
                                      setFailedThumbnailIds((prev) => {
                                        const next = new Set(prev);
                                        next.add(content._id);
                                        return next;
                                      });
                                    }}
                                  />
                                  {content.type === 'Video' && (
                                    <div
                                      className="absolute inset-0 flex items-center justify-center bg-black/25 pointer-events-none"
                                      aria-hidden
                                    >
                                      <div className="w-11 h-11 rounded-full bg-white/95 flex items-center justify-center shadow-md">
                                        <Video className="w-5 h-5 text-sky-600 ml-0.5" />
                                      </div>
                                    </div>
                                  )}
                                </>
                              ) : cardPreview.kind === 'pdf' && !skipPdfThumbFetch ? (
                                <PdfFirstPageThumbnail
                                  fileUrl={fileUrl}
                                  title={content.title}
                                  alt={content.title}
                                  fallback={renderPreviewIcon(content.type)}
                                />
                              ) : cardPreview.kind === 'pdf' ? (
                                renderPreviewIcon(content.type)
                              ) : cardPreview.kind === 'video' ? (
                                <video
                                  src={cardPreview.src}
                                  muted
                                  playsInline
                                  preload="metadata"
                                  className="w-full h-full object-cover bg-black"
                                />
                              ) : cardPreview.kind === 'icon' ? (
                                renderPreviewIcon(cardPreview.contentType)
                              ) : (
                                renderPreviewIcon(content.type)
                              )}
                              {durationLabel && (
                                <div className="absolute bottom-2 right-2 px-2 py-1 rounded-full bg-black/70 text-white text-xs">
                                  {durationLabel}
                                </div>
                              )}
                            </div>

                            <div className="p-4 flex-1 flex flex-col space-y-2">
                              <div className="flex items-start justify-between gap-2">
                                <h4 className="font-semibold text-gray-900 text-xs sm:text-sm line-clamp-2">
                                  {getVideoContentDisplayTitle(content)}
                                </h4>
                              </div>
                              <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                                {subjectLabel && (
                                  <Badge
                                    variant="outline"
                                    className="border-sky-200 bg-sky-50 text-sky-700"
                                  >
                                    {subjectLabel}
                                  </Badge>
                                )}
                                {syllabusLabel(content.board) ? (
                                  <Badge variant="outline" className="text-micro font-normal">
                                    {syllabusLabel(content.board)}
                                  </Badge>
                                ) : null}
                                {content.board === 'STATE' && content.stateName && (
                                  <Badge variant="secondary" className="text-micro font-normal">
                                    {content.stateName}
                                  </Badge>
                                )}
                                <Badge
                                  variant="outline"
                                  className="border-gray-200 bg-gray-50 text-gray-700"
                                >
                                  {content.type}
                                </Badge>
                                {content.isActive === false && (
                                  <Badge
                                    variant="secondary"
                                    className="text-micro font-normal border-amber-200 bg-amber-50 text-amber-800"
                                  >
                                    Inactive
                                  </Badge>
                                )}
                                <span>
                                  {new Date(
                                    content.date || content.createdAt
                                  ).toLocaleDateString()}
                                </span>
                              </div>
                              {content.topic && (
                                <p className="text-xs text-gray-600 line-clamp-1">
                                  Topic: {content.topic}
                                </p>
                              )}
                              {content.description && (
                                <p className="text-xs text-gray-500 line-clamp-2">
                                  {content.description}
                                </p>
                              )}

                              <div className="mt-3 flex items-center justify-between">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-xs"
                                  disabled={!hasPreviewableFile}
                                  title={
                                    hasPreviewableFile
                                      ? 'View here'
                                      : 'No file uploaded for this content'
                                  }
                                  onClick={() => {
                                    if (!hasPreviewableFile) {
                                      toast({
                                        title: 'No file',
                                        description: 'Upload a file for this content before viewing.',
                                        variant: 'destructive',
                                      });
                                      return;
                                    }
                                    setContentPreviewItem(content);
                                  }}
                                >
                                  View
                                </Button>
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleOpenEditContent(content)}
                                    className="text-sky-600 hover:text-sky-700 hover:bg-sky-50"
                                    title="Edit content"
                                  >
                                    <Edit className="w-3 h-3 sm:w-4 sm:h-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleDeleteContent(content._id)}
                                    disabled={deletingContentId === content._id}
                                    className="text-red-600 hover:text-red-700"
                                  >
                                    {deletingContentId === content._id ? (
                                      <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 animate-spin" />
                                    ) : (
                                      <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
                                    )}
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={isAddClassOpen} onOpenChange={setIsAddClassOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Class</DialogTitle>
            <DialogDescription>
              Add a grade level for the selected board (
              {SYLLABUS_OPTIONS.find((o) => boardsMatch(o.value, selectedFilterBoard))?.label ||
                selectedFilterBoard}
              ), e.g. Class 6.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="add-class-number-dialog">Class number</Label>
              <Input
                id="add-class-number-dialog"
                type="text"
                inputMode="numeric"
                placeholder="e.g. 10"
                value={newClassNumber}
                onChange={(e) =>
                  setNewClassNumber(e.target.value.replace(/\D/g, '').slice(0, 2))
                }
              />
            </div>
            <div>
              <Label htmlFor="add-class-description-dialog">Description (optional)</Label>
              <Textarea
                id="add-class-description-dialog"
                placeholder="e.g. Middle school — grade 6"
                value={newClassDescription}
                onChange={(e) => setNewClassDescription(e.target.value)}
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsAddClassOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSaveClass}
                className="bg-gradient-to-r from-orange-400 to-sky-400 hover:from-orange-500 hover:to-sky-500 text-white"
              >
                Add Class
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isAddSubjectOpen} onOpenChange={setIsAddSubjectOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Subject</DialogTitle>
            <DialogDescription>
              Create a subject inside the selected product category. Categories (Alpha / Beta / …)
              are tracks — subjects like Maths / Physics live under them.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Class</Label>
              <Input value={selectedClassNumber ? `Class ${selectedClassNumber}` : ''} disabled />
            </div>
            <div>
              <Label>Syllabus</Label>
              <Select
                value={newSubjectSyllabus}
                onValueChange={(v) => {
                  const next = v as SyllabusBoard;
                  setNewSubjectSyllabus(next);
                  if (next !== 'STATE') setNewSubjectStateName('');
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select syllabus" />
                </SelectTrigger>
                <SelectContent>
                  {SYLLABUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {newSubjectSyllabus === 'STATE' && (
              <div>
                <Label>State name</Label>
                <Select
                  value={newSubjectStateName || undefined}
                  onValueChange={(v) => setNewSubjectStateName(v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select state" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {INDIAN_STATE_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Product category</Label>
              <Select
                value={newSubjectProductCategory || 'NONE'}
                onValueChange={(v) =>
                  setNewSubjectProductCategory(v === 'NONE' ? '' : v)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="General" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">General</SelectItem>
                  {iitCategoryCodes.map((c) => (
                    <SelectItem key={c} value={c}>
                      IIT {formatIitCategoryLabel(c, iitLabelMap)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                Same subject name can exist once per category (e.g. Maths in Beta and Maths in
                Alpha).
              </p>
            </div>
            <div>
              <Label>Subject Name</Label>
              <Input
                placeholder="e.g., Mathematics"
                value={newSubjectName}
                onChange={(e) => setNewSubjectName(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsAddSubjectOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSaveSubject}
                disabled={isSavingSubject}
                className="bg-gradient-to-r from-orange-400 to-sky-400 hover:from-orange-500 hover:to-sky-500 text-white"
              >
                {isSavingSubject && (
                  <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 mr-2 animate-spin" />
                )}
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditSubjectOpen} onOpenChange={setIsEditSubjectOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Subject</DialogTitle>
            <DialogDescription>
              Update syllabus, state (if applicable), and subject name.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Class</Label>
              <Input value={selectedClassNumber ? `Class ${selectedClassNumber}` : ''} disabled />
            </div>
            <div>
              <Label>Syllabus</Label>
              <Select
                value={editSubjectSyllabus}
                onValueChange={(v) => {
                  const next = v as SyllabusBoard;
                  setEditSubjectSyllabus(next);
                  if (next !== 'STATE') setEditSubjectStateName('');
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select syllabus" />
                </SelectTrigger>
                <SelectContent>
                  {SYLLABUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {editSubjectSyllabus === 'STATE' && (
              <div>
                <Label>State name</Label>
                <Select
                  value={editSubjectStateName || undefined}
                  onValueChange={(v) => setEditSubjectStateName(v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select state" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {INDIAN_STATE_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Product category</Label>
              <Select
                value={editSubjectProductCategory || 'NONE'}
                onValueChange={(v) =>
                  setEditSubjectProductCategory(v === 'NONE' ? '' : v)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="General" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">General</SelectItem>
                  {iitCategoryCodes.map((c) => (
                    <SelectItem key={c} value={c}>
                      IIT {formatIitCategoryLabel(c, iitLabelMap)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Subject Name</Label>
              <Input
                placeholder="e.g., Mathematics"
                value={editSubjectName}
                onChange={(e) => setEditSubjectName(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsEditSubjectOpen(false);
                  setEditingSubject(null);
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleUpdateSubject}
                disabled={isSavingSubject}
                className="bg-gradient-to-r from-orange-400 to-sky-400 hover:from-orange-500 hover:to-sky-500 text-white"
              >
                {isSavingSubject && (
                  <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 mr-2 animate-spin" />
                )}
                Update
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isAddContentOpen}
        onOpenChange={(open) => {
          setIsAddContentOpen(open);
          if (!open) {
            setEditingContentId(null);
            setEditContentContext(null);
            clearSelectedUploadFile();
          }
        }}
      >
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingContentId ? 'Edit Content' : 'Add Content'}</DialogTitle>
            <DialogDescription>
              {editingContentId
                ? 'Update content details for the selected subject.'
                : 'Upload or link learning content for the selected subject. Class and subject are auto selected.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>
                  Class <span className="text-destructive" aria-hidden="true">*</span>
                </Label>
                <Input
                  value={
                    editingContentId && editContentContext
                      ? editContentContext.classLabel
                      : selectedClassNumber
                        ? `Class ${selectedClassNumber}`
                        : ''
                  }
                  disabled
                />
              </div>
              <div>
                <Label>
                  Subject <span className="text-destructive" aria-hidden="true">*</span>
                </Label>
                <Input
                  value={
                    editingContentId && editContentContext
                      ? editContentContext.subjectName
                      : linkedSubjectForContent
                        ? extractPlainSubjectName(linkedSubjectForContent.name)
                        : ''
                  }
                  disabled
                  className="bg-muted/50"
                />
              </div>
            </div>
            {(editingContentId && editContentContext?.board === 'STATE') ||
            (!editingContentId && linkedSubjectForContent?.board === 'STATE') ? (
              <div>
                <Label>State name</Label>
                <Input
                  value={
                    editingContentId && editContentContext
                      ? editContentContext.stateName?.trim() || '—'
                      : linkedSubjectForContent?.stateName?.trim() || '—'
                  }
                  disabled
                  className="bg-muted/50"
                />
              </div>
            ) : null}
            <div>
              <Label>
                Content Title <span className="text-destructive" aria-hidden="true">*</span>
              </Label>
              <Input
                value={contentForm.title}
                onChange={(e) =>
                  setContentForm((prev) => ({ ...prev, title: e.target.value }))
                }
                placeholder="e.g., Algebra Basics - Part 1"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={contentForm.description}
                onChange={(e) =>
                  setContentForm((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                rows={3}
                placeholder="Short description for this content"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>
                  Type <span className="text-destructive" aria-hidden="true">*</span>
                </Label>
                <Select
                  value={contentForm.type}
                  disabled={Boolean(editingContentId)}
                  onValueChange={(value: ContentType) => {
                    setContentForm((prev) => ({
                      ...prev,
                      type: value,
                      fileUrl: '',
                      module: value === 'Video' ? prev.module : '',
                    }));
                    setSelectedUploadFile(null);
                    setUploadInputKey((k) => k + 1);
                    setPdfCoverPage(1);
                    setPdfPageCount(null);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Video">Video</SelectItem>
                    <SelectItem value="Audio">Audio</SelectItem>
                    <SelectItem value="TextBook">TextBook</SelectItem>
                    <SelectItem value="Workbook">Workbook</SelectItem>
                    <SelectItem value="Material">Material</SelectItem>
                    <SelectItem value="Homework">Homework</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>
                  Date{' '}
                  <span className="text-muted-foreground font-normal text-xs">(optional)</span>
                </Label>
                <Input
                  type="date"
                  value={contentForm.date}
                  onChange={(e) =>
                    setContentForm((prev) => ({ ...prev, date: e.target.value }))
                  }
                />
              </div>
            </div>
            {contentForm.type === 'Video' ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label>
                      Chapter <span className="text-destructive" aria-hidden="true">*</span>
                    </Label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={contentForm.chapter}
                      required
                      onChange={(e) =>
                        setContentForm((prev) => ({
                          ...prev,
                          chapter: videoNumberOnly(e.target.value),
                        }))
                      }
                      placeholder="1"
                    />
                  </div>
                  <div>
                    <Label>Module (optional)</Label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={contentForm.module}
                      onChange={(e) =>
                        setContentForm((prev) => ({
                          ...prev,
                          module: videoNumberOnly(e.target.value),
                        }))
                      }
                      placeholder="1"
                    />
                  </div>
                </div>
                <div>
                  <Label>
                    Video URL <span className="text-destructive" aria-hidden="true">*</span>
                  </Label>
                  <Input
                    value={contentForm.fileUrl}
                    onChange={(e) =>
                      setContentForm((prev) => ({ ...prev, fileUrl: e.target.value }))
                    }
                    placeholder="https://www.youtube.com/watch?v=... or https://youtu.be/..."
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Paste a YouTube, Vimeo, or direct https video link.
                  </p>
                </div>
              </>
            ) : (
              <div>
                <Label>
                  Chapter{' '}
                  <span className="text-muted-foreground font-normal text-xs">(optional)</span>
                </Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={contentForm.chapter}
                  onChange={(e) =>
                    setContentForm((prev) => ({
                      ...prev,
                      chapter: videoNumberOnly(e.target.value),
                    }))
                  }
                  placeholder="e.g. 1 — groups this under Chapter 1"
                />
              </div>
            )}
            {contentForm.type === 'Audio' ? (
              <div className="space-y-4">
                <div>
                  <Label>
                    Audio URL{' '}
                    <span className="text-destructive" aria-hidden="true">*</span>
                  </Label>
                  <Input
                    value={contentForm.fileUrl}
                    onChange={(e) =>
                      setContentForm((prev) => ({ ...prev, fileUrl: e.target.value }))
                    }
                    placeholder="https://example.com/audio.mp3"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Paste a direct audio link or upload a file below.
                  </p>
                </div>
                <div className="relative py-1">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-gray-200" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase tracking-wide">
                    <span className="bg-background px-2 text-gray-500">Or upload audio file</span>
                  </div>
                </div>
                <div>
                  <Label>
                    Upload audio (saved on server){' '}
                    <span className="text-muted-foreground font-normal text-xs">(optional)</span>
                  </Label>
                  <div className="mt-2 flex flex-col gap-2">
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Input
                        key={`audio-upload-${uploadInputKey}`}
                        type="file"
                        accept={getUploadAcceptForContentType('Audio')}
                        onChange={(e) => onPickUploadFile(e.target.files?.[0] || null)}
                        className="cursor-pointer text-xs sm:text-sm"
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={handleUploadContentFile}
                        disabled={isUploadingFile || !selectedUploadFile}
                      >
                        {isUploadingFile ? (
                          <span className="inline-flex items-center gap-2">
                            <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 animate-spin" />
                            Uploading
                          </span>
                        ) : (
                          'Upload'
                        )}
                      </Button>
                      {selectedUploadFile ? (
                        <Button type="button" variant="ghost" onClick={clearSelectedUploadFile}>
                          Remove file
                        </Button>
                      ) : null}
                    </div>
                    {pdfPageCount != null ? (
                      <PdfCoverPageField
                        id="pdf-cover-page-audio"
                        page={pdfCoverPage}
                        pageCount={pdfPageCount}
                        previewUrl={pdfCoverPreviewUrl}
                        previewLoading={pdfCoverPreviewLoading}
                        onPageChange={setPdfCoverPage}
                      />
                    ) : null}
                    <p
                      className={`text-xs ${selectedUploadFile ? 'text-orange-700 font-medium' : 'text-gray-500'}`}
                    >
                      {selectedUploadFile
                        ? `Selected file: ${selectedUploadFile.name}`
                        : 'No file selected yet'}
                    </p>
                    {isServerHostedFileUrl(contentForm.fileUrl) && (
                      <p className="text-xs text-green-700 break-all">
                        Using uploaded file: {contentForm.fileUrl}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <Label>
                  Upload File (saved on DigitalOcean server){' '}
                  <span className="text-destructive" aria-hidden="true">*</span>
                </Label>
                <div className="mt-2 flex flex-col gap-2">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input
                      key={`file-upload-${uploadInputKey}`}
                      type="file"
                      accept={
                        isUploadType(contentForm.type)
                          ? getUploadAcceptForContentType(contentForm.type)
                          : '.pdf,.doc,.docx'
                      }
                      onChange={(e) => onPickUploadFile(e.target.files?.[0] || null)}
                      className="cursor-pointer text-xs sm:text-sm"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleUploadContentFile}
                      disabled={isUploadingFile || !selectedUploadFile}
                    >
                      {isUploadingFile ? (
                        <span className="inline-flex items-center gap-2">
                          <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 animate-spin" />
                          Uploading
                        </span>
                      ) : (
                        'Upload'
                      )}
                    </Button>
                    {selectedUploadFile ? (
                      <Button type="button" variant="ghost" onClick={clearSelectedUploadFile}>
                        Remove file
                      </Button>
                    ) : null}
                  </div>
                  {pdfPageCount != null ? (
                    <PdfCoverPageField
                      id="pdf-cover-page"
                      page={pdfCoverPage}
                      pageCount={pdfPageCount}
                      previewUrl={pdfCoverPreviewUrl}
                      previewLoading={pdfCoverPreviewLoading}
                      onPageChange={setPdfCoverPage}
                    />
                  ) : null}
                  <p
                    className={`text-xs ${
                      normalizeServerContentFileUrl(contentForm.fileUrl)
                        ? 'text-green-700 font-medium'
                        : selectedUploadFile
                          ? 'text-orange-700 font-medium'
                          : 'text-gray-500'
                    }`}
                  >
                    {normalizeServerContentFileUrl(contentForm.fileUrl)
                      ? 'File uploaded — click Save to add this content.'
                      : selectedUploadFile
                        ? `Selected file: ${selectedUploadFile.name} — click Upload.`
                        : 'Choose a file, then click Upload before Save.'}
                  </p>
                  <Input
                    value={normalizeServerContentFileUrl(contentForm.fileUrl) || contentForm.fileUrl}
                    readOnly
                    placeholder="Uploaded file path will appear here (/uploads/...)"
                  />
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsAddContentOpen(false);
                  setEditingContentId(null);
                  setEditContentContext(null);
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSaveContent}
                disabled={isSavingContent}
                className="bg-gradient-to-r from-sky-300 to-teal-400 hover:from-sky-400 hover:to-teal-500 text-white"
              >
                {isSavingContent && (
                  <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 mr-2 animate-spin" />
                )}
                {editingContentId ? 'Update' : 'Save'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!contentPreviewItem}
        onOpenChange={(open) => {
          if (!open) setContentPreviewItem(null);
        }}
      >
        <DialogContent
          className={`flex max-h-[98dvh] flex-col gap-2 overflow-hidden rounded-2xl p-3 sm:gap-3 sm:p-4 lg:p-5 ${
            contentPreviewItem &&
            contentPreviewItem.type !== 'Video' &&
            contentPreviewItem.type !== 'Audio' &&
            contentPreviewUrl &&
            isPdfPreviewContent(contentPreviewUrl, contentPreviewItem.type)
              ? 'h-[min(96dvh,1120px)] w-[min(98vw,920px)] max-w-[920px]'
              : 'h-[min(98dvh,1200px)] w-[min(98vw,1680px)] max-w-[min(98vw,1680px)] lg:max-w-[min(98vw,1680px)]'
          }`}
        >
          <DialogHeader className="shrink-0 space-y-1 pr-10">
            <DialogTitle className="pr-2 text-base sm:text-lg lg:text-xl font-semibold leading-snug">
              {contentPreviewItem
                ? getVideoContentDisplayTitle(contentPreviewItem)
                : 'Content preview'}
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              {contentPreviewItem
                ? [
                    contentPreviewItem.type,
                    syllabusLabel(contentPreviewItem.board),
                  ]
                    .filter(Boolean)
                    .join(' · ')
                : 'Preview attached file'}
            </DialogDescription>
          </DialogHeader>
          {contentPreviewItem && (
            <>
              <div
                className={`flex min-h-0 flex-1 flex-col rounded-md border bg-muted/30 ${
                  contentPreviewItem.type === 'Video' ||
                  contentPreviewItem.type === 'Audio' ||
                  (contentPreviewUrl &&
                    isPdfPreviewContent(contentPreviewUrl, contentPreviewItem.type))
                    ? 'overflow-hidden'
                    : 'overflow-y-auto overflow-x-hidden'
                }`}
              >
                {!contentPreviewUrl ? (
                  <p className="p-3 sm:p-4 lg:p-6 text-center text-xs sm:text-sm text-muted-foreground">
                    No file URL for this content.
                  </p>
                ) : contentPreviewItem.type === 'Video' ? (
                  (() => {
                    const embed = getStreamingEmbedSrc(contentPreviewUrl);
                    if (embed) {
                      return (
                        <div className="w-full overflow-hidden bg-black p-2 sm:p-3">
                          <div className="relative mx-auto aspect-video w-full max-w-full max-h-[min(78vh,88dvh)] overflow-hidden rounded-sm bg-black shadow-inner">
                            <iframe
                              title={contentPreviewItem.title}
                              src={embed}
                              className="absolute inset-0 box-border h-full w-full border-0"
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                              allowFullScreen
                            />
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div className="flex w-full flex-col items-stretch overflow-hidden bg-black p-2 sm:p-3">
                        <video
                          key={contentPreviewUrl}
                          src={contentPreviewUrl}
                          controls
                          playsInline
                          preload="metadata"
                          className="mx-auto block w-full max-w-full bg-black object-contain"
                          style={{
                            aspectRatio: '16 / 9',
                            minHeight: 220,
                            maxHeight: 'min(80vh, 88dvh)',
                          }}
                          onError={() => {
                            toast({
                              title: 'Video could not play here',
                              description:
                                'The file may be an unsupported format, blocked by the server, or a hosted link that needs Open in new tab.',
                              variant: 'destructive',
                            });
                          }}
                        >
                          Your browser does not support embedded video.
                        </video>
                      </div>
                    );
                  })()
                ) : contentPreviewItem.type === 'Audio' ? (
                  <div className="flex flex-col items-center justify-center gap-4 p-4 sm:p-6 lg:p-8">
                    <Headphones className="h-12 w-12 text-sky-500" />
                    <audio src={contentPreviewUrl} controls className="w-full max-w-md">
                      Your browser does not support embedded audio.
                    </audio>
                  </div>
                ) : isPdfPreviewContent(contentPreviewUrl, contentPreviewItem.type) ? (
                  <PdfPreviewPanel
                    fileUrl={contentPreviewUrl}
                    title={contentPreviewItem.title}
                    className="h-full min-h-0 w-full flex-1"
                    showOpenInNewTab
                    variant="book"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center gap-4 p-4 sm:p-6 lg:p-8 text-center text-xs sm:text-sm text-muted-foreground">
                    <FileText className="h-12 w-12 opacity-40" />
                    <p>Preview is not available for this file type in the app.</p>
                  </div>
                )}
              </div>
              <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end shrink-0">
                <Button type="button" onClick={() => setContentPreviewItem(null)}>
                  Close
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

