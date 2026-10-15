import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { getAuthToken } from '@/lib/auth-utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  BookOpen,
  FileText,
  Link2,
  Loader2,
  RefreshCw,
  Trash2,
  Upload,
  BarChart3,
} from "lucide-react";
import { API_BASE_URL } from "@/lib/api-config";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/use-confirm";
import { useCurriculumCascade } from "@/hooks/use-curriculum-cascade";
import { cn } from "@/lib/utils";
import { formatIitCategoryLabel, isIitStyleBoard, normalizeIitCategory } from "@/lib/products";
import { useProductCategories } from "@/hooks/use-product-categories";

type BookRow = {
  _id: string;
  title: string;
  board: string;
  class: string;
  subject: string;
  productCategory?: string;
  topic?: string;
  subtopic?: string;
  source: string;
  processingStatus: string;
  processingError?: string;
  chunkCount?: number;
  extractedTextLength?: number;
  embeddingsCreated?: boolean;
  contentId?: string;
  chapters?: Array<{ title: string; topic?: string; wordCount?: number }>;
  generationStats?: { totalGenerations?: number; toolBreakdown?: Record<string, number> };
  createdAt?: string;
};

type ImportableContentRow = {
  contentId: string;
  title: string;
  type: string;
  board: string;
  classNumber: string;
  subjectName: string;
  productCategory?: string;
  topic?: string;
  fileUrl: string;
  imported: boolean;
  bookId?: string | null;
  bookStatus?: string | null;
  bookChunkCount?: number;
};

export default function BookKnowledgeBase() {
  const { toast } = useToast();
  const { confirm: askConfirm, ConfirmDialog } = useConfirm();
  const { codes: iitCategoryCodes, labelMap: iitLabelMap } = useProductCategories();
  const [books, setBooks] = useState<BookRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [reindexingId, setReindexingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [viewBook, setViewBook] = useState<BookRow | null>(null);
  const [textPreview, setTextPreview] = useState("");
  const [chunksPreview, setChunksPreview] = useState<Array<{ chunkIndex: number; chapter: string; contentPreview: string }>>([]);
  const [chunksTotal, setChunksTotal] = useState(0);

  const [importableContent, setImportableContent] = useState<ImportableContentRow[]>([]);
  const [importLoading, setImportLoading] = useState(false);
  const [importingIds, setImportingIds] = useState<Set<string>>(new Set());
  const [bulkImporting, setBulkImporting] = useState(false);
  const [selectedContentIds, setSelectedContentIds] = useState<Set<string>>(new Set());
  const [showImportedContent, setShowImportedContent] = useState(false);

  const [title, setTitle] = useState("");
  const [boardOptions, setBoardOptions] = useState<string[]>([]);
  const [board, setBoard] = useState("");
  const [classLabel, setClassLabel] = useState("");
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [subTopic, setSubTopic] = useState("");
  const [source, setSource] = useState("textbook");
  const [productCategory, setProductCategory] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    title?: string;
    board?: string;
    classLabel?: string;
    subject?: string;
    file?: string;
  }>({});

  const clearFieldError = (key: keyof typeof fieldErrors) => {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const {
    classOptions,
    subjects,
    topics,
    subtopics,
    loadingClasses,
    loadingSubjects,
    loadingTopics,
    loadingSubtopics,
  } = useCurriculumCascade(
    classLabel || undefined,
    subject || undefined,
    topic || undefined,
    board || undefined,
    productCategory,
  );

  const authHeaders = (): Record<string, string> => {
    const token =
      getAuthToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const loadBooks = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/book-knowledge/books`, {
        headers: { ...authHeaders() },
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "Failed to load books");
      setBooks(Array.isArray(json.data) ? json.data : []);
    } catch (e: any) {
      toast({ title: "Load failed", description: e.message, variant: "destructive" });
      setBooks([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadBooks();
    void loadImportableContent();
  }, []);

  const loadImportableContent = async () => {
    setImportLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/book-knowledge/importable-content`, {
        headers: { ...authHeaders() },
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "Failed to load learning-path content");
      setImportableContent(Array.isArray(json.data) ? json.data : []);
    } catch (e: any) {
      toast({ title: "Could not load learning-path content", description: e.message, variant: "destructive" });
      setImportableContent([]);
    } finally {
      setImportLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const loadBoards = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/super-admin/ai-tool-topics/options`, {
          headers: { ...authHeaders() },
          credentials: "include",
        });
        const json = await res.json();
        if (!res.ok || json?.success === false || cancelled) throw new Error("Options fetch failed");
        const boardsFromOptions: string[] = Array.isArray(json?.data?.boards)
          ? json.data.boards.map((b: unknown) => String(b || "").trim()).filter(Boolean)
          : [];
        if (boardsFromOptions.length > 0) {
          const boards = Array.from(new Set<string>(boardsFromOptions)).sort((a, b) => a.localeCompare(b));
          setBoardOptions(boards);
          if (!board && boards[0]) setBoard(boards[0]);
          return;
        }
        throw new Error("No boards in options response");
      } catch {
        try {
          const listRes = await fetch(`${API_BASE_URL}/api/super-admin/ai-tool-topics?page=1&limit=200`, {
            headers: { ...authHeaders() },
            credentials: "include",
          });
          const listJson = await listRes.json();
          const boardsFromRows: string[] = Array.isArray(listJson?.data?.items)
            ? listJson.data.items.map((row: any) => String(row?.board || "").trim()).filter(Boolean)
            : [];
          const boards = Array.from(new Set<string>(boardsFromRows)).sort((a, b) => a.localeCompare(b));
          if (!cancelled) {
            setBoardOptions(boards);
            if (!board && boards[0]) setBoard(boards[0]);
          }
        } catch {
          if (!cancelled) setBoardOptions([]);
        }
      }
    };
    void loadBoards();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleBoardChange = (value: string) => {
    setBoard(value);
    clearFieldError("board");
    setProductCategory("");
    setClassLabel("");
    setSubject("");
    setTopic("");
    setSubTopic("");
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next.classLabel;
      delete next.subject;
      return next;
    });
  };

  const handleClassChange = (value: string) => {
    setClassLabel(value);
    clearFieldError("classLabel");
    setSubject("");
    setTopic("");
    setSubTopic("");
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next.subject;
      return next;
    });
  };

  const handleSubjectChange = (value: string) => {
    setSubject(value);
    clearFieldError("subject");
    setTopic("");
    setSubTopic("");
  };

  const handleTopicChange = (value: string) => {
    setTopic(value);
    setSubTopic("");
  };

  const handleImportFromContent = async (contentId: string) => {
    setImportingIds((prev) => new Set(prev).add(contentId));
    try {
      const res = await fetch(`${API_BASE_URL}/api/book-knowledge/books/import-from-content`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        credentials: "include",
        body: JSON.stringify({ contentId }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "Import failed");
      toast({
        title: json.alreadyImported ? "Already linked" : "Imported",
        description: json.message || `${json.data?.title || "Book"} is ready for indexing.`,
      });
      await Promise.all([loadBooks(), loadImportableContent()]);
    } catch (e: any) {
      toast({ title: "Import failed", description: e.message, variant: "destructive" });
    } finally {
      setImportingIds((prev) => {
        const next = new Set(prev);
        next.delete(contentId);
        return next;
      });
    }
  };

  const handleBulkImport = async () => {
    const ids = [...selectedContentIds];
    if (!ids.length) return;
    setBulkImporting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/book-knowledge/books/import-from-content/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        credentials: "include",
        body: JSON.stringify({ contentIds: ids }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "Bulk import failed");
      toast({
        title: "Bulk import complete",
        description: json.message || `Imported ${json.summary?.imported || 0} books.`,
        variant: Number(json.summary?.failed || 0) > 0 ? "destructive" : undefined,
      });
      const failures = Array.isArray(json.data)
        ? json.data.filter((r: { success?: boolean }) => !r.success).slice(0, 5)
        : [];
      if (failures.length) {
        const detail = failures
          .map((r: { title?: string; contentId?: string; message?: string }) =>
            `${r.title || r.contentId || "item"}: ${r.message || "failed"}`,
          )
          .join(" · ");
        toast({
          title: "Why some imports failed",
          description: detail + (Number(json.summary?.failed || 0) > 5 ? " · …" : ""),
          variant: "destructive",
        });
      }
      setSelectedContentIds(new Set());
      await Promise.all([loadBooks(), loadImportableContent()]);
    } catch (e: any) {
      toast({ title: "Bulk import failed", description: e.message, variant: "destructive" });
    } finally {
      setBulkImporting(false);
    }
  };

  const toggleContentSelection = (contentId: string, checked: boolean) => {
    setSelectedContentIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(contentId);
      else next.delete(contentId);
      return next;
    });
  };

  const visibleImportable = useMemo(
    () => importableContent.filter((row) => (showImportedContent ? true : !row.imported)),
    [importableContent, showImportedContent],
  );

  const pendingImportable = useMemo(
    () => importableContent.filter((row) => !row.imported),
    [importableContent],
  );

  const handleUpload = async () => {
    const nextErrors: typeof fieldErrors = {};
    if (!title.trim()) nextErrors.title = "Title is required.";
    if (!board) nextErrors.board = "Board is required.";
    if (!classLabel) nextErrors.classLabel = "Class is required.";
    if (!subject) nextErrors.subject = "Subject is required.";
    if (!file) nextErrors.file = "Please choose a PDF, DOCX, or TXT file.";
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file!);
      fd.append("title", title.trim());
      fd.append("board", board);
      fd.append("class", classLabel);
      fd.append("subject", subject);
      if (topic) fd.append("topic", topic);
      if (subTopic) fd.append("subtopic", subTopic);
      fd.append("source", source);
      const cat = normalizeIitCategory(productCategory);
      if (cat) fd.append("productCategory", cat);
      const res = await fetch(`${API_BASE_URL}/api/book-knowledge/books/upload`, {
        method: "POST",
        headers: { ...authHeaders() },
        body: fd,
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "Upload failed");
      toast({ title: "Book uploaded", description: json.message || "Indexing started." });
      setTitle("");
      setFile(null);
      setClassLabel("");
      setSubject("");
      setTopic("");
      setSubTopic("");
      setProductCategory("");
      setSource("textbook");
      setBoard(boardOptions[0] || "");
      setFieldErrors({});
      await loadBooks();
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleReindex = async (book: BookRow) => {
    setReindexingId(book._id);
    try {
      const res = await fetch(`${API_BASE_URL}/api/book-knowledge/books/${book._id}/reindex`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ contentId: book.contentId || undefined }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "Reindex failed");
      toast({ title: "Reindexed", description: `${json.data?.chunkCount || 0} chunks indexed.` });
      await loadBooks();
    } catch (e: any) {
      toast({ title: "Reindex failed", description: e.message, variant: "destructive" });
    } finally {
      setReindexingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    const book = books.find((b) => b._id === id);
    const label = book?.title || "this book";
    const ok = await askConfirm({
      title: "Remove this book?",
      description: `Remove "${label}" from the Book Knowledge Base?\n\nThis unlinks/deletes the indexed book so Book-Based Generator can no longer use it. Learning-path source files (if any) are not deleted from Subjects & Content.`,
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      destructive: true,
    });
    if (!ok) return;
    setDeletingId(id);
    try {
      const res = await fetch(`${API_BASE_URL}/api/book-knowledge/books/${id}`, {
        method: "DELETE",
        headers: { ...authHeaders() },
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "Delete failed");
      toast({ title: "Book removed", description: "Unlinked from Book Knowledge Base." });
      await Promise.all([loadBooks(), loadImportableContent()]);
    } catch (e: any) {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  };

  const openBookDetails = async (book: BookRow) => {
    setViewBook(book);
    setTextPreview("");
    setChunksPreview([]);
    setChunksTotal(0);
    try {
      const [chapterRes, textRes, chunkRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/book-knowledge/books/${book._id}/chapters`, { headers: { ...authHeaders() } }),
        fetch(`${API_BASE_URL}/api/book-knowledge/books/${book._id}/text`, { headers: { ...authHeaders() } }),
        fetch(`${API_BASE_URL}/api/book-knowledge/books/${book._id}/chunks?limit=2000`, { headers: { ...authHeaders() } }),
      ]);
      const chapterJson = await chapterRes.json();
      const textJson = await textRes.json();
      const chunkJson = await chunkRes.json();
      if (chapterJson.success) {
        setViewBook((current) => current?._id === book._id
          ? { ...current, chapters: Array.isArray(chapterJson.data) ? chapterJson.data : [] }
          : current);
      }
      if (textJson.success) setTextPreview(String(textJson.data?.preview || ""));
      if (chunkJson.success) {
        const loadedChunks = Array.isArray(chunkJson.data) ? chunkJson.data : [];
        setChunksPreview(loadedChunks);
        setChunksTotal(Number(chunkJson.total) || loadedChunks.length);
      }
    } catch {
      /* non-fatal */
    }
  };

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      indexed: "bg-emerald-100 text-emerald-800",
      processing: "bg-amber-100 text-amber-800",
      failed: "bg-red-100 text-red-800",
      needs_ocr: "bg-orange-100 text-orange-800",
      pending: "bg-slate-100 text-slate-700",
    };
    return map[status] || map.pending;
  };

  const totalChunks = useMemo(() => books.reduce((n, b) => n + (b.chunkCount || 0), 0), [books]);

  return (
    <div className="w-full max-w-[min(100%,1400px)] mx-auto space-y-6">
      {ConfirmDialog}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <BookOpen className="h-7 w-7 text-violet-600" />
            Book Knowledge Base
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Import textbooks and materials already uploaded in the learning path, or upload new PDFs. After indexing, generate content in{" "}
            <strong>Book-Based Generator</strong>.
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Indexing: PDF text extract is free. Local embeddings (default) are ₹0. OCR for scanned PDFs uses Gemini
            Vision at roughly <strong>₹0.15–₹0.40 per page</strong> depending on density (exact total shown after upload when billed).
            Generation cost is shown on Book-Based Generator after each batch.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            void loadBooks();
            void loadImportableContent();
          }}
          disabled={loading || importLoading}
        >
          <RefreshCw className={cn("h-4 w-4 mr-2", (loading || importLoading) && "animate-spin")} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Books</p>
            <p className="text-2xl font-bold">{books.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Indexed chunks</p>
            <p className="text-2xl font-bold">{totalChunks}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Indexed books</p>
            <p className="text-2xl font-bold">{books.filter((b) => b.processingStatus === "indexed").length}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-emerald-200/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Link2 className="h-5 w-5 text-emerald-600" />
            Import from Learning Path
          </CardTitle>
          <p className="text-sm text-slate-500 font-normal">
            Link textbooks, workbooks, and materials already uploaded in Subjects &amp; Content. Files are reused — no duplicate upload.
            Only server-uploaded PDF/DOCX/TXT files are supported (external flipbook links cannot be indexed).
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
              <span>{pendingImportable.length} ready to import</span>
              <span>·</span>
              <span>{importableContent.filter((r) => r.imported).length} already linked</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <Checkbox checked={showImportedContent} onCheckedChange={(v) => setShowImportedContent(v === true)} />
                Show already linked
              </label>
              {selectedContentIds.size > 0 && (
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => void handleBulkImport()}
                  disabled={bulkImporting}
                >
                  {bulkImporting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Link2 className="h-4 w-4 mr-1" />}
                  Import selected ({selectedContentIds.size})
                </Button>
              )}
            </div>
          </div>

          {importLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-emerald-500" /></div>
          ) : visibleImportable.length === 0 ? (
            <p className="text-sm text-slate-500 py-8 text-center">
              {importableContent.length === 0
                ? "No importable textbooks or materials found. Upload PDFs in Subjects & Content first."
                : "All importable items are already linked to the book knowledge base."}
            </p>
          ) : (
            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
              {visibleImportable.map((row) => (
                <div
                  key={row.contentId}
                  className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm min-w-0 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    {!row.imported && (
                      <Checkbox
                        checked={selectedContentIds.has(row.contentId)}
                        onCheckedChange={(v) => toggleContentSelection(row.contentId, v === true)}
                        className="mt-1 shrink-0"
                      />
                    )}
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <p className="font-medium text-slate-900 break-words leading-snug">{row.title}</p>
                      <div className="flex flex-wrap gap-x-2 gap-y-1 text-xs text-slate-500">
                        <span className="break-words">{row.type}</span>
                        <span className="text-slate-300">·</span>
                        <span className="break-words">{row.board}</span>
                        <span className="text-slate-300">·</span>
                        <span>Class {row.classNumber || "—"}</span>
                        <span className="text-slate-300">·</span>
                        <span className="break-words">{row.subjectName}</span>
                        {normalizeIitCategory(row.productCategory) ? (
                          <>
                            <span className="text-slate-300">·</span>
                            <span className="break-words">
                              {formatIitCategoryLabel(row.productCategory, iitLabelMap)}
                            </span>
                          </>
                        ) : null}
                        {row.topic ? (
                          <>
                            <span className="text-slate-300">·</span>
                            <span className="break-words">{row.topic}</span>
                          </>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {normalizeIitCategory(row.productCategory) ? (
                          <Badge variant="outline" className="border-violet-300 text-violet-800">
                            {formatIitCategoryLabel(row.productCategory, iitLabelMap)}
                          </Badge>
                        ) : null}
                        {row.imported ? (
                          <>
                            <Badge className="bg-emerald-100 text-emerald-800">Linked</Badge>
                            {row.bookStatus && <Badge className={statusBadge(row.bookStatus)}>{row.bookStatus}</Badge>}
                            {row.bookChunkCount ? <Badge variant="outline">{row.bookChunkCount} chunks</Badge> : null}
                          </>
                        ) : (
                          <Badge variant="outline">Not linked</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex w-full sm:w-auto shrink-0">
                    {row.imported ? (
                      <Button size="sm" variant="outline" disabled className="w-full sm:w-auto">
                        Linked
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700"
                        onClick={() => void handleImportFromContent(row.contentId)}
                        disabled={importingIds.has(row.contentId)}
                      >
                        {importingIds.has(row.contentId) ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Link2 className="h-4 w-4 mr-1" /> Import
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-violet-200/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Upload className="h-5 w-5 text-violet-600" />
            Upload Book
          </CardTitle>
          <p className="text-sm text-slate-500 font-normal">
            Board, class, subject, topic, and sub-topic use the same AI Tool Topics / curriculum data as AI Generator.
          </p>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="space-y-2 md:col-span-2 lg:col-span-3">
            <Label htmlFor="book-kb-title">Title</Label>
            <Input
              id="book-kb-title"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (e.target.value.trim()) clearFieldError("title");
              }}
              placeholder="HC Verma Vol 1"
              aria-invalid={Boolean(fieldErrors.title)}
              className={cn(fieldErrors.title && "border-red-500 focus-visible:ring-red-500")}
            />
            {fieldErrors.title ? <p className="text-xs text-red-600">{fieldErrors.title}</p> : null}
          </div>
          <div className="space-y-2">
            <Label>Board</Label>
            <Select value={board} onValueChange={handleBoardChange}>
              <SelectTrigger
                aria-invalid={Boolean(fieldErrors.board)}
                className={cn(fieldErrors.board && "border-red-500 focus:ring-red-500")}
              >
                <SelectValue placeholder={boardOptions.length ? "Select board" : "Loading boards…"} />
              </SelectTrigger>
              <SelectContent>
                {boardOptions.map((b) => (
                  <SelectItem key={b} value={b}>{b}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldErrors.board ? <p className="text-xs text-red-600">{fieldErrors.board}</p> : null}
          </div>
          {isIitStyleBoard(board) ? (
            <div className="space-y-2">
              <Label>IIT track</Label>
              <Select
                value={productCategory || "NONE"}
                onValueChange={(v) => {
                  const next = v === "NONE" ? "" : v;
                  setProductCategory(next);
                  setClassLabel("");
                  setSubject("");
                  setTopic("");
                  setSubTopic("");
                  setFieldErrors((prev) => {
                    const nextErrors = { ...prev };
                    delete nextErrors.classLabel;
                    delete nextErrors.subject;
                    return nextErrors;
                  });
                }}
                disabled={!board}
              >
                <SelectTrigger>
                  <SelectValue placeholder={!board ? "Select board first" : "General"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">General (no IIT track)</SelectItem>
                  {iitCategoryCodes.map((c) => (
                    <SelectItem key={c} value={c}>
                      IIT {formatIitCategoryLabel(c, iitLabelMap)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="space-y-2">
            <Label>Class</Label>
            <Select value={classLabel} onValueChange={handleClassChange} disabled={!board || loadingClasses}>
              <SelectTrigger
                aria-invalid={Boolean(fieldErrors.classLabel)}
                className={cn(fieldErrors.classLabel && "border-red-500 focus:ring-red-500")}
              >
                <SelectValue placeholder={!board ? "Select board first" : loadingClasses ? "Loading classes…" : "Select class"} />
              </SelectTrigger>
              <SelectContent>
                {classOptions.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            {fieldErrors.classLabel ? <p className="text-xs text-red-600">{fieldErrors.classLabel}</p> : null}
          </div>
          <div className="space-y-2">
            <Label>Subject</Label>
            <Select value={subject} onValueChange={handleSubjectChange} disabled={!classLabel || loadingSubjects}>
              <SelectTrigger
                aria-invalid={Boolean(fieldErrors.subject)}
                className={cn(fieldErrors.subject && "border-red-500 focus:ring-red-500")}
              >
                <SelectValue placeholder={!classLabel ? "Select class first" : loadingSubjects ? "Loading subjects…" : "Select subject"} />
              </SelectTrigger>
              <SelectContent>
                {subjects.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            {fieldErrors.subject ? <p className="text-xs text-red-600">{fieldErrors.subject}</p> : null}
          </div>
          <div className="space-y-2">
            <Label>Topic <span className="text-slate-400 font-normal">(optional)</span></Label>
            <Select value={topic} onValueChange={handleTopicChange} disabled={!subject || loadingTopics}>
              <SelectTrigger>
                <SelectValue placeholder={!subject ? "Select subject first" : loadingTopics ? "Loading topics…" : "Select topic"} />
              </SelectTrigger>
              <SelectContent>
                {topics.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Sub Topic <span className="text-slate-400 font-normal">(optional)</span></Label>
            <Select value={subTopic} onValueChange={setSubTopic} disabled={!topic || loadingSubtopics}>
              <SelectTrigger>
                <SelectValue placeholder={!topic ? "Select topic first" : loadingSubtopics ? "Loading sub topics…" : "Select sub topic"} />
              </SelectTrigger>
              <SelectContent>
                {subtopics.map((st) => <SelectItem key={st} value={st}>{st}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Source type</Label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {[
                  { v: "textbook", l: "Textbook" },
                  { v: "coaching", l: "Coaching material" },
                  { v: "notes", l: "Notes" },
                  { v: "question_bank", l: "Question bank" },
                  { v: "proprietary", l: "Proprietary" },
                ].map((o) => (
                  <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 md:col-span-2 lg:col-span-2">
            <Label>File (PDF, DOCX, TXT) — click or drag &amp; drop</Label>
            <div
              className={cn(
                "rounded-xl border-2 border-dashed bg-violet-50/40 p-4 transition-colors",
                "hover:border-violet-400 hover:bg-violet-50",
                fieldErrors.file ? "border-red-400 bg-red-50/40" : "border-violet-200",
              )}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const dropped = e.dataTransfer.files?.[0];
                if (dropped) {
                  setFile(dropped);
                  clearFieldError("file");
                }
              }}
            >
              <label className="flex cursor-pointer flex-col gap-2 sm:flex-row sm:items-center">
                <span className="inline-flex shrink-0 items-center justify-center rounded-md border border-violet-300 bg-white px-3 py-2 text-sm font-medium text-violet-800 shadow-sm hover:bg-violet-50">
                  Choose file
                </span>
                <span className="min-w-0 text-xs text-slate-600 break-all">
                  {file ? file.name : "No file selected"}
                </span>
                <Input
                  type="file"
                  accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                  onChange={(e) => {
                    const next = e.target.files?.[0] || null;
                    setFile(next);
                    if (next) clearFieldError("file");
                  }}
                  className="sr-only"
                  aria-invalid={Boolean(fieldErrors.file)}
                />
              </label>
              <p className="mt-2 text-xs text-slate-500">
                Drop a file here, or use Choose file above.
              </p>
            </div>
            {fieldErrors.file ? <p className="text-xs text-red-600">{fieldErrors.file}</p> : null}
          </div>
          <div className="flex items-end">
            <Button
              className="w-full bg-violet-600 hover:bg-violet-700"
              onClick={() => void handleUpload()}
              disabled={uploading}
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
              Upload &amp; Index
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Uploaded Books</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-violet-500" /></div>
          ) : books.length === 0 ? (
            <p className="text-sm text-slate-500 py-8 text-center">No books uploaded yet.</p>
          ) : (
            books.map((book) => (
              <div
                key={book._id}
                className="flex flex-wrap items-center gap-3 justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900 break-words">{book.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {book.board} · {book.class} · {book.subject}
                    {normalizeIitCategory(book.productCategory)
                      ? ` · ${formatIitCategoryLabel(book.productCategory, iitLabelMap)}`
                      : ""}
                    {book.topic ? ` · ${book.topic}` : ""}
                    {book.subtopic ? ` / ${book.subtopic}` : ""} · {book.source}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <Badge className={statusBadge(book.processingStatus)}>{book.processingStatus}</Badge>
                    {normalizeIitCategory(book.productCategory) ? (
                      <Badge variant="outline" className="border-violet-300 text-violet-800">
                        {formatIitCategoryLabel(book.productCategory, iitLabelMap)}
                      </Badge>
                    ) : null}
                    {book.contentId && <Badge variant="outline" className="border-emerald-300 text-emerald-700">Learning path</Badge>}
                    <Badge variant="outline">{book.chunkCount || 0} chunks</Badge>
                    <Badge variant="outline">{book.generationStats?.totalGenerations || 0} generations</Badge>
                  </div>
                  {book.processingStatus === 'failed' && book.processingError ? (
                    <p className="mt-2 text-xs font-medium text-red-700">{book.processingError}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => void openBookDetails(book)}>
                    <FileText className="h-4 w-4 mr-1" /> View
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    title="Re-index"
                    aria-label="Re-index"
                    onClick={() => void handleReindex(book)}
                    disabled={reindexingId === book._id}
                  >
                    {reindexingId === book._id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    title="Unlink / remove from knowledge base"
                    onClick={() => void handleDelete(book._id)}
                    disabled={deletingId === book._id}
                  >
                    {deletingId === book._id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    <span className="ml-1 hidden sm:inline">Unlink</span>
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={!!viewBook} onOpenChange={() => setViewBook(null)}>
        <DialogContent className="flex max-h-[min(92vh,900px)] w-[min(96vw,900px)] max-w-[min(96vw,900px)] flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>{viewBook?.title}</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto space-y-4">
            <div>
              <p className="text-sm font-medium flex items-center gap-2 mb-2">
                <BarChart3 className="h-4 w-4" /> Chapters ({viewBook?.chapters?.length || 0})
              </p>
              <ul className="text-sm space-y-1 max-h-32 overflow-y-auto">
                {(viewBook?.chapters || []).map((ch, i) => (
                  <li key={i} className="text-slate-700">
                    {ch.title} {ch.wordCount ? `(${ch.wordCount} words)` : ""}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-sm font-medium mb-2">Extracted text preview</p>
              <Textarea readOnly className="min-h-[160px] text-xs font-mono" value={textPreview} />
            </div>
            <div>
              <p className="text-sm font-medium mb-2">
                Chunks ({chunksPreview.length === chunksTotal
                  ? chunksTotal
                  : `${chunksPreview.length} of ${chunksTotal}`})
              </p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {chunksPreview.map((c) => (
                  <div key={c.chunkIndex} className="rounded border p-2 text-xs text-slate-600">
                    <span className="font-semibold">#{c.chunkIndex} {c.chapter}</span>
                    <p className="mt-1">{c.contentPreview}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
