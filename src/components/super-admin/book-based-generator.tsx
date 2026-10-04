import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { BookOpen, CheckCircle2, ExternalLink, FileText, FolderTree, IndianRupee, Loader2, Sparkles } from "lucide-react";
import { GeneratorRecordsPanel } from "@/components/super-admin/generator-records-panel";
import { GenerationRecordCountField } from "@/components/super-admin/generation-record-count-field";
import { API_BASE_URL } from "@/lib/api-config";
import { networkErrorUserMessage, resilientFetch } from "@/lib/resilient-fetch";
import { useToast } from "@/hooks/use-toast";
import { useCurriculumCascade } from "@/hooks/use-curriculum-cascade";
import { useProductCategories } from "@/hooks/use-product-categories";
import { formatIitCategoryLabel, normalizeIitCategory } from "@/lib/products";
import { cn } from "@/lib/utils";
import { displayBoardShort } from "@/lib/board-label";
import { getAuthToken } from '@/lib/auth-utils';
import {
  BOOK_BASED_STUDENT_TOOLS,
  BOOK_BASED_TEACHER_TOOLS,
  BOOK_BASED_TOOLS,
  BOOK_GENERATOR_MAX_BATCH_SIZE,
  BOOK_UNIQUENESS_TARGET,
  type BookBasedTool,
  type BookBasedToolId,
} from "@/lib/book-based-tools";
import {
  bookListSubjectGroupKey,
  curriculumSubjectForAiToolTopics,
  filterSubjectsForAiTool,
  isIitAiToolBoard,
  isLanguageExcludedTool,
  isStoryLanguageTool,
  isStoryPassageLanguageSubject,
  LANGUAGE_EXCLUDED_TOOL_ERROR,
  scienceBranchDisplayLabel,
} from "@/lib/ai-tool-subject-rules";
import {
  computeGeminiCostFromTokenUsage,
  emptyTokenTotals,
  formatInr,
  formatTokenCount,
  type GeminiCostEstimate,
  type TokenCall,
  type TokenTotals,
} from "@/lib/gemini-token-cost";
import {
  GENERATION_RECORD_COUNT_MIN,
  generationRecordCountButtonLabel,
  isValidGenerationRecordCount,
  parseGenerationRecordCount,
} from "@/lib/generation-record-count";
import { sortClassLabelsAscending } from "@/lib/super-admin-curriculum-classes";
import {
  DEFAULT_GENERATION_QUALITY_TIER,
  GENERATION_QUALITY_TIERS,
  type GenerationQualityTierId,
} from "@/lib/generation-quality-tier";

type BookOption = {
  _id: string;
  title: string;
  board: string;
  class: string;
  subject: string;
  productCategory?: string;
  topic?: string;
  subtopic?: string;
  chunkCount?: number;
  processingStatus?: string;
  embeddingsCreated?: boolean;
};

function bookDisplayTitle(book: BookOption): string {
  const cat = normalizeIitCategory(book.productCategory);
  const title = String(book.title || "").trim() || "Untitled";
  if (!cat) return title;
  const label = formatIitCategoryLabel(cat);
  if (new RegExp(`\\b${label}\\b`, "i").test(title) || new RegExp(`\\b${cat}\\b`, "i").test(title)) {
    return title;
  }
  return `${title} · ${label}`;
}

function statusBadge(status?: string, indexed?: boolean) {
  if (indexed || status === "indexed") return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Ready</Badge>;
  if (status === "processing") return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Indexing…</Badge>;
  if (status === "needs_ocr") return <Badge variant="destructive">Needs OCR</Badge>;
  if (status === "failed") return <Badge variant="destructive">Failed</Badge>;
  return <Badge variant="secondary">Pending</Badge>;
}

function normalizeClassLabel(value: string): string {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "Unassigned";
  if (/^iit-\d+/i.test(trimmed) || trimmed === "Class-6-IIT") return "Class 6";
  return /^class\b/i.test(trimmed) ? trimmed : `Class ${trimmed}`;
}

type BookListGroup = {
  key: string;
  label: string;
  books: BookOption[];
};

function groupBooksByClass(books: BookOption[]): BookListGroup[] {
  const map = new Map<string, BookListGroup>();
  for (const book of books) {
    const board = String(book.board || "Other").trim() || "Other";
    const classLabel = normalizeClassLabel(book.class);
    const cat = normalizeIitCategory(book.productCategory);
    const key = `${board}|${classLabel}|${cat || "GENERAL"}`;
    const label = cat
      ? `${board} · ${classLabel} · ${formatIitCategoryLabel(cat)}`
      : `${board} · ${classLabel}`;
    const existing = map.get(key);
    if (existing) {
      existing.books.push(book);
    } else {
      map.set(key, { key, label, books: [book] });
    }
  }
  return Array.from(map.values())
    .map((group) => ({
      ...group,
      books: [...group.books].sort((a, b) => {
        const subjectCmp = String(a.subject || "").localeCompare(String(b.subject || ""));
        if (subjectCmp !== 0) return subjectCmp;
        const catCmp = String(a.productCategory || "").localeCompare(String(b.productCategory || ""));
        if (catCmp !== 0) return catCmp;
        return bookDisplayTitle(a).localeCompare(bookDisplayTitle(b));
      }),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function groupBooksBySubject(books: BookOption[]): BookListGroup[] {
  const map = new Map<string, BookListGroup>();
  for (const book of books) {
    const board = String(book.board || "Other").trim() || "Other";
    // CBSE: Physics/Chemistry/Biology textbooks group under Science (AI Tool Topics).
    const subjectGroup = bookListSubjectGroupKey(board, book.subject);
    const cat = normalizeIitCategory(book.productCategory);
    const key = `${board}|${subjectGroup}|${cat || "GENERAL"}`;
    const label = cat
      ? `${board} · ${subjectGroup} · ${formatIitCategoryLabel(cat)}`
      : `${board} · ${subjectGroup}`;
    const existing = map.get(key);
    if (existing) {
      existing.books.push(book);
    } else {
      map.set(key, { key, label, books: [book] });
    }
  }
  return Array.from(map.values())
    .map((group) => ({
      ...group,
      books: [...group.books].sort((a, b) => {
        const branchCmp = String(a.subject || "").localeCompare(String(b.subject || ""));
        if (branchCmp !== 0) return branchCmp;
        const classCmp = normalizeClassLabel(a.class).localeCompare(normalizeClassLabel(b.class));
        if (classCmp !== 0) return classCmp;
        return bookDisplayTitle(a).localeCompare(bookDisplayTitle(b));
      }),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

const WHOLE_CHAPTER_VALUE = "__WHOLE_CHAPTER__";

/** Tools that support a combined paper across multiple selected subtopics. */
const MULTI_SUBTOPIC_TOOLS = new Set([
  "worksheet-mcq-generator",
  "homework-creator",
  "mock-test-builder",
  "exam-question-paper-generator",
  "smart-qa-practice-generator",
  "quick-assignment-builder",
]);

/** Tools that accept an explicit "how many questions" count. */
const QUESTION_COUNT_TOOLS = new Set([
  "worksheet-mcq-generator",
  "smart-qa-practice-generator",
  "mock-test-builder",
  "exam-question-paper-generator",
  "homework-creator",
]);

const QUESTION_COUNT_MIN = 1;
const QUESTION_COUNT_MAX = 40;

function sanitizeQuestionCountInput(raw: string): string | null {
  if (raw === "") return "";
  if (!/^\d{0,2}$/.test(raw)) return null;
  return raw;
}

function parseQuestionCount(raw: string): number {
  const n = Number(String(raw || "").trim());
  if (!Number.isFinite(n)) return 10;
  return Math.min(QUESTION_COUNT_MAX, Math.max(QUESTION_COUNT_MIN, Math.floor(n)));
}

type BookBasedGeneratorProps = {
  onOpenBookKnowledge?: () => void;
  onOpenAiToolData?: () => void;
};

export default function BookBasedGenerator({ onOpenBookKnowledge, onOpenAiToolData }: BookBasedGeneratorProps) {
  const { toast } = useToast();
  const [selectedTool, setSelectedTool] = useState<BookBasedToolId | "">("");
  const [boardOptions, setBoardOptions] = useState<string[]>([]);
  const [board, setBoard] = useState("");
  const [productCategory, setProductCategory] = useState("");
  const [classNumber, setClassNumber] = useState("");
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [subTopic, setSubTopic] = useState(WHOLE_CHAPTER_VALUE);
  const [extraSubTopics, setExtraSubTopics] = useState<string[]>([]);
  /** When Whole chapter is selected, also generate one batch per real subtopic. */
  const [expandEachSubtopic, setExpandEachSubtopic] = useState(false);
  const [bookId, setBookId] = useState("");
  const [useBookKnowledge, setUseBookKnowledge] = useState(true);
  const [qualityTier, setQualityTier] = useState<GenerationQualityTierId>(DEFAULT_GENERATION_QUALITY_TIER);
  const [generationRecordCount, setGenerationRecordCount] = useState("");
  const [questionCount, setQuestionCount] = useState("10");
  const [books, setBooks] = useState<BookOption[]>([]);
  const [booksLoading, setBooksLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationLocked, setGenerationLocked] = useState(false);
  const [progress, setProgress] = useState("");
  const [lastBatchSummary, setLastBatchSummary] = useState<{
    successCount: number;
    failedCount: number;
    batchSize: number;
    tokenUsage: TokenTotals;
    cost: GeminiCostEstimate;
    failures: string[];
    trackingMissing: boolean;
  } | null>(null);
  const [recordsReloadNonce, setRecordsReloadNonce] = useState(0);

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
    classNumber || undefined,
    subject || undefined,
    topic || undefined,
    board || undefined,
    // CBSE/SSC use AI Tool Topics General; IIT uses the selected product track.
    isIitAiToolBoard(board) ? productCategory || undefined : "",
  );

  const { codes: iitCategoryCodes, labelMap: iitLabelMap } = useProductCategories();
  const isIitBoardSelected = useMemo(() => isIitAiToolBoard(board), [board]);
  const categorySelectOptions = useMemo(() => {
    const rows = [{ code: "", label: "General" }];
    for (const code of iitCategoryCodes) {
      const c = normalizeIitCategory(code);
      if (!c) continue;
      rows.push({ code: c, label: `IIT ${formatIitCategoryLabel(c, iitLabelMap)}` });
    }
    return rows;
  }, [iitCategoryCodes, iitLabelMap]);

  const currentTool = useMemo(() => BOOK_BASED_TOOLS.find((t) => t.id === selectedTool), [selectedTool]);
  const subjectsForTool = useMemo(
    () => filterSubjectsForAiTool(selectedTool || "", subjects),
    [selectedTool, subjects],
  );
  const classOptionsForSelect = useMemo(
    () => sortClassLabelsAscending(classOptions),
    [classOptions],
  );
  const subjectOptionsForSelect = useMemo(() => {
    const base = selectedTool ? subjectsForTool : subjects;
    if (subject && !base.some((s) => s.toLowerCase() === subject.toLowerCase())) {
      return [subject, ...base];
    }
    return base;
  }, [selectedTool, subjectsForTool, subjects, subject]);
  const classOptionsForSelectWithBook = useMemo(() => {
    if (classNumber && !classOptionsForSelect.includes(classNumber)) {
      return sortClassLabelsAscending([classNumber, ...classOptionsForSelect]);
    }
    return classOptionsForSelect;
  }, [classOptionsForSelect, classNumber]);
  const boardOptionsForSelect = useMemo(() => {
    if (board && !boardOptions.some((b) => b.toLowerCase() === board.toLowerCase())) {
      return [...boardOptions, board].sort((a, b) => a.localeCompare(b));
    }
    return boardOptions;
  }, [boardOptions, board]);
  const topicOptionsForSelect = useMemo(() => {
    if (topic && !topics.some((t) => t.toLowerCase() === topic.toLowerCase())) {
      return [topic, ...topics];
    }
    return topics;
  }, [topics, topic]);
  const selectedBook = useMemo(() => books.find((b) => b._id === bookId), [books, bookId]);
  const bookReady = Boolean(selectedBook?.embeddingsCreated && selectedBook?.processingStatus === "indexed");
  const step1Done = Boolean(bookId && bookReady);
  const curriculumDone = Boolean(
    step1Done && classNumber && subject && topic && (subTopic === WHOLE_CHAPTER_VALUE || subTopic),
  );
  const step2Done = Boolean(curriculumDone && selectedTool);

  const [bookGroupMode, setBookGroupMode] = useState<"class" | "subject">("class");
  const [bookGroupFilter, setBookGroupFilter] = useState("__all__");

  const bookGroups = useMemo(() => {
    const track = normalizeIitCategory(productCategory);
    // When an IIT track is selected, still include legacy books with no category
    // so older indexed textbooks remain visible.
    const scoped = track
      ? books.filter((b) => {
          const cat = normalizeIitCategory(b.productCategory);
          return !cat || cat === track;
        })
      : books;
    return bookGroupMode === "class" ? groupBooksByClass(scoped) : groupBooksBySubject(scoped);
  }, [books, bookGroupMode, productCategory]);

  const bookGroupFilterOptions = useMemo(
    () => bookGroups.filter((group) => !/^IIT\s*·\s*Class\s*6$/i.test(group.label.trim())),
    [bookGroups],
  );

  const visibleBookGroups = useMemo(() => {
    if (bookGroupFilter === "__all__") return bookGroups;
    return bookGroups.filter((group) => group.key === bookGroupFilter);
  }, [bookGroupFilter, bookGroups]);

  const authHeaders = (): Record<string, string> => {
    const token = getAuthToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const selectBook = useCallback((book: BookOption) => {
    setBookId(book._id);

    const nextBoard = String(book.board || "").trim();
    const nextClassRaw = normalizeClassLabel(book.class);
    const nextClass = nextClassRaw === "Unassigned" ? "" : nextClassRaw;
    const bookSubject = String(book.subject || "").trim();
    // Curriculum subject/topics always follow AI Tool Topics.
    // CBSE: Physics/Chemistry/Biology books map to Science.
    const nextSubject = curriculumSubjectForAiToolTopics(nextBoard || board, bookSubject);
    const nextCategory = isIitAiToolBoard(nextBoard || board)
      ? normalizeIitCategory(book.productCategory) || ""
      : "";

    if (nextBoard) {
      setBoard(nextBoard);
      setBoardOptions((prev) =>
        prev.includes(nextBoard)
          ? prev
          : [...prev, nextBoard].sort((a, b) => a.localeCompare(b)),
      );
    }
    setProductCategory(nextCategory);
    setClassNumber(nextClass);
    setSubject(nextSubject);
    // Do not copy book topic/subtopic — pick from AI Tool Topics only.
    setTopic("");
    setSubTopic(WHOLE_CHAPTER_VALUE);
    setExtraSubTopics([]);
    setExpandEachSubtopic(false);
  }, [board]);

  const loadBooks = async () => {
    setBooksLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/book-knowledge/books`, {
        headers: { ...authHeaders() },
        credentials: "include",
      });
      const json = await res.json();
      if (json.success) setBooks(Array.isArray(json.data) ? json.data : []);
    } catch {
      setBooks([]);
    } finally {
      setBooksLoading(false);
    }
  };

  useEffect(() => {
    void loadBooks();
  }, []);

  useEffect(() => {
    const boardKey = String(board || "").toUpperCase().replace(/[\s/\\-]+/g, "");
    const isIitBoard = boardKey.includes("IIT") || boardKey.includes("NEET") || boardKey.includes("JEE");
    if (isIitBoard && (classNumber === "IIT-6" || classNumber === "Class-6-IIT")) {
      setClassNumber("Class 6");
    }
  }, [board, classNumber]);

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
    setProductCategory("");
    setClassNumber("");
    setSubject("");
    setTopic("");
    setSubTopic(WHOLE_CHAPTER_VALUE);
    setExtraSubTopics([]);
  };

  const handleCategoryChange = (value: string) => {
    setProductCategory(value === "__general__" ? "" : normalizeIitCategory(value));
    setClassNumber("");
    setSubject("");
    setTopic("");
    setSubTopic(WHOLE_CHAPTER_VALUE);
    setExtraSubTopics([]);
  };

  const handleClassChange = (value: string) => {
    setClassNumber(value);
    setSubject("");
    setTopic("");
    setSubTopic(WHOLE_CHAPTER_VALUE);
    setExtraSubTopics([]);
  };

  const handleSubjectChange = (value: string) => {
    // CBSE forms must stay on AI Tool Topics subjects (Science, not Chem/Phy/Bio).
    setSubject(curriculumSubjectForAiToolTopics(board, value) || value);
    setTopic("");
    setSubTopic(WHOLE_CHAPTER_VALUE);
    setExtraSubTopics([]);
  };

  const handleTopicChange = (value: string) => {
    setTopic(value);
    setSubTopic(WHOLE_CHAPTER_VALUE);
    setExtraSubTopics([]);
  };

  const handleToolSelect = (toolId: BookBasedToolId) => {
    setSelectedTool(toolId);
    setExtraSubTopics([]);
    if (isStoryLanguageTool(toolId) && subject && !isStoryPassageLanguageSubject(subject)) {
      setSubject("");
      setTopic("");
      setSubTopic(WHOLE_CHAPTER_VALUE);
    }
    if (isLanguageExcludedTool(toolId) && subject && isStoryPassageLanguageSubject(subject)) {
      setSubject("");
      setTopic("");
      setSubTopic(WHOLE_CHAPTER_VALUE);
    }
  };

  useEffect(() => {
    if (!isStoryLanguageTool(selectedTool)) return;
    if (!subject || isStoryPassageLanguageSubject(subject)) return;
    setSubject("");
    setTopic("");
    setSubTopic(WHOLE_CHAPTER_VALUE);
  }, [selectedTool, subject]);

  useEffect(() => {
    setExtraSubTopics([]);
  }, [selectedTool, topic, subTopic]);

  useEffect(() => {
    if (!isLanguageExcludedTool(selectedTool)) return;
    if (!subject || !isStoryPassageLanguageSubject(subject)) return;
    setSubject("");
    setTopic("");
    setSubTopic(WHOLE_CHAPTER_VALUE);
  }, [selectedTool, subject]);

  const renderToolButton = (tool: BookBasedTool) => (
    <button
      key={tool.id}
      type="button"
      onClick={() => handleToolSelect(tool.id as BookBasedToolId)}
      disabled={!step1Done}
      className={cn(
        "text-left rounded-xl border p-4 transition shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed",
        selectedTool === tool.id ? "border-violet-500 bg-violet-50 ring-2 ring-violet-200" : "border-slate-200 bg-white",
      )}
    >
      <p className="font-semibold text-sm text-slate-900">{tool.name}</p>
      <p className="text-xs text-slate-500 mt-1 line-clamp-2">{tool.description}</p>
    </button>
  );

  const parseBatchSize = () => parseGenerationRecordCount(generationRecordCount)!;

  const isWholeChapter = subTopic === WHOLE_CHAPTER_VALUE || !subTopic;
  const supportsMultiSubtopic =
    Boolean(selectedTool) && MULTI_SUBTOPIC_TOOLS.has(selectedTool) && !isWholeChapter;
  const selectedSubTopicsForPayload = (() => {
    if (isWholeChapter) return subtopics;
    if (!supportsMultiSubtopic || extraSubTopics.length === 0) return [];
    return [subTopic, ...extraSubTopics.filter((s) => s && s !== subTopic)];
  })();
  const isCombinedPaper = !isWholeChapter && selectedSubTopicsForPayload.length > 1;
  const shouldExpandSubtopics =
    isWholeChapter && expandEachSubtopic && subtopics.length > 0;

  const buildGenerationPayload = (forceUnlock = false) => ({
    toolSlug: selectedTool,
    bookId,
    board,
    className: classNumber,
    subjectName: subject,
    topicName: topic,
    subtopicName: isWholeChapter ? "" : subTopic,
    chapterScope: isWholeChapter,
    productCategory: productCategory || "",
    ...(isWholeChapter || isCombinedPaper
      ? { subTopics: selectedSubTopicsForPayload }
      : {}),
    // Whole chapter + expand: save under each real subtopic AND Whole chapter
    // (fixes all content landing only under "Whole chapter").
    ...(shouldExpandSubtopics
      ? { expandSubtopics: true, includeWholeChapter: true, combineSubtopics: false }
      : isCombinedPaper
        ? { combineSubtopics: true }
        : {}),
    batchSize: parseBatchSize(),
    useBookKnowledge,
    qualityTier,
    async: true,
    ...(QUESTION_COUNT_TOOLS.has(selectedTool)
      ? {
          extraParams: {
            questionCount: parseQuestionCount(questionCount),
            numberOfQuestions: parseQuestionCount(questionCount),
          },
        }
      : {}),
    ...(forceUnlock ? { forceUnlock: true } : {}),
  });

  const applyBatchResult = async (data: Record<string, unknown>, json: { message?: string }) => {
    const usage = data.tokenUsage as { totals?: TokenTotals; calls?: TokenCall[] } | undefined;
    const tokenUsage =
      usage?.totals && typeof usage.totals === "object"
        ? { ...emptyTokenTotals(), ...usage.totals }
        : emptyTokenTotals();
    const tokenCalls: TokenCall[] = Array.isArray(usage?.calls) ? usage.calls : [];
    const exchangeRateInr = Number((data.cost as GeminiCostEstimate | undefined)?.exchangeRateInr) || 95.11;
    let cost: GeminiCostEstimate;
    try {
      cost = computeGeminiCostFromTokenUsage({ totals: tokenUsage, calls: tokenCalls }, exchangeRateInr);
    } catch {
      cost =
        data.cost && typeof data.cost === "object"
          ? (data.cost as GeminiCostEstimate)
          : computeGeminiCostFromTokenUsage({ totals: tokenUsage, calls: [] }, exchangeRateInr);
    }

    const savedCount = Number(data.savedCount) || 0;
    const failedCount = Number(data.failedCount) || 0;
    const bookTextUsed = data.bookTextUsed !== false;
    const ragChunkCount = Number(data.ragChunkCount) || 0;
    const resultBatchSize = Number(data.batchSize) || parseGenerationRecordCount(generationRecordCount) || 0;
    const batchFailures = Array.isArray(data.failures) ? (data.failures as string[]) : [];
    const trackingMissing = savedCount > 0 && tokenUsage.callCount === 0;
    setLastBatchSummary({
      successCount: savedCount,
      failedCount,
      batchSize: resultBatchSize,
      tokenUsage,
      cost,
      failures: batchFailures,
      trackingMissing,
    });

    const tokenNote = trackingMissing
      ? "Saved successfully, but token/cost tracking was unavailable for this batch"
      : `${formatTokenCount(tokenUsage.totalTokens)} tokens · Est. ${formatInr(cost.inr)}`;
    if (savedCount > 0) {
      setRecordsReloadNonce((n) => n + 1);
      toast({
        title: `${savedCount}/${resultBatchSize} saved`,
        description: bookTextUsed
          ? `${tokenNote}. Used ${ragChunkCount} textbook passage(s). Browse below or in AI Tool Data.`
          : `${tokenNote}. Warning: no textbook passages were retrieved — content may not be book-grounded. Reindex the book or verify topic/subtopic.`,
        variant: bookTextUsed ? "default" : "destructive",
      });
    } else {
      const failures = data.failures as string[] | undefined;
      const failedCount = Number(data.failedCount) || 0;
      const allBusy =
        Array.isArray(failures) &&
        failures.length > 0 &&
        failures.every((line) => /temporarily busy|503|429|UNAVAILABLE/i.test(line));
      const allSpendCap =
        Array.isArray(failures) &&
        failures.length > 0 &&
        failures.every((line) => /spending cap|monthly spend|Billing\/Spend/i.test(line));
      const allAuth =
        Array.isArray(failures) &&
        failures.length > 0 &&
        failures.every((line) =>
          /ACCESS_TOKEN_TYPE_UNSUPPORTED|invalid or missing|reported as leaked|API key type|check GEMINI_API_KEY/i.test(
            line,
          ),
        );
      const retryHint = allSpendCap
        ? " Raise the Gemini project spending cap in Google AI Studio (Billing/Spend), then retry."
        : allAuth
          ? " Stop retrying — create a working key in Google Cloud Console (Credentials) or another Google account, put it in server .env, then pm2 restart."
          : allBusy
          ? " Gemini may be rate-limited. Wait 1–2 minutes, try Balanced or Fast, or generate fewer records (3–5)."
          : "";
      const failNote =
        allAuth && failures?.length
          ? failures[0]
          : failures?.length && failedCount > 0
          ? `${failedCount} slot(s) failed. ${failures[0]}${failures.length > 1 ? ` (+${failures.length - 1} more)` : ""}${retryHint}`
          : `${json.message || "No records were saved."}${retryHint}`;
      toast({
        title: allAuth ? "Gemini API key blocked" : "Batch failed",
        description: failNote + (allAuth ? retryHint : ""),
        variant: "destructive",
      });
    }
  };

  const pollBookGeneratorJob = async (jobId: string) => {
    // Up to ~60 minutes (1200 × 3s). Premium book batches often need 15–40 min.
    const maxPolls = 1200;
    let consecutiveNetworkErrors = 0;
    for (let attempt = 0; attempt < maxPolls; attempt += 1) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
      let res: Response;
      let json: { data?: Record<string, unknown>; message?: string };
      try {
        res = await resilientFetch(`${API_BASE_URL}/api/book-generator/jobs/${jobId}`, {
          headers: authHeaders(),
          retries: 3,
          retryDelayMs: 1500,
          timeoutMs: 30_000,
        });
        json = await res.json();
        consecutiveNetworkErrors = 0;
      } catch (err) {
        consecutiveNetworkErrors += 1;
        setProgress(
          `Connection blip while checking status (retry ${consecutiveNetworkErrors}) — generation usually continues on the server…`,
        );
        // Don't kill a long batch for a single proxy/network drop; keep polling.
        if (consecutiveNetworkErrors < 40) continue;
        throw err;
      }

      if (!res.ok) {
        // Job store may briefly miss after restart — keep polling a bit.
        if (res.status === 404 && attempt < 20) {
          setProgress("Waiting for generation job to appear…");
          continue;
        }
        throw new Error(json?.message || `Job status failed (${res.status})`);
      }

      const job = (json.data || {}) as {
        done?: boolean;
        locked?: boolean;
        progress?: string;
        result?: Record<string, unknown>;
        error?: string;
      };

      if (job.progress) setProgress(job.progress);
      if (!job.done) continue;

      if (job.locked) {
        setGenerationLocked(true);
        toast({
          title: "Generation already in progress",
          description: "A previous batch may still be running, or a lock is stuck. Use “Clear lock & retry” below.",
          variant: "destructive",
        });
        return;
      }

      if (job.result) {
        await applyBatchResult(job.result, json);
        return;
      }

      toast({
        title: "Batch failed",
        description: job.error || json.message || "Generation job failed.",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Still generating",
      description:
        "The batch is taking longer than expected. Leave this page, wait a few minutes, then refresh the records list — work often finishes on the server after the browser disconnects.",
    });
  };

  const releaseLockAndRetry = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/book-generator/release-lock`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(buildGenerationPayload()),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to clear lock");
      setGenerationLocked(false);
      const released = Number(json?.data?.released || 0);
      toast({
        title: released > 0 ? "Lock cleared" : "Ready to retry",
        description: json.message || "Starting a fresh batch…",
      });
      await handleGenerate({ forceUnlock: true });
    } catch (e: unknown) {
      toast({
        title: "Could not clear lock",
        description: e instanceof Error ? e.message : "Failed to clear lock",
        variant: "destructive",
      });
    }
  };

  const handleGenerate = async (opts?: { forceUnlock?: boolean }) => {
    if (!selectedTool || !bookId || !classNumber || !subject || !topic || (!isWholeChapter && !subTopic)) {
      toast({
        title: "Complete all steps",
        description: "Select a textbook, pick curriculum (topic + whole chapter or a sub-topic), then choose a tool.",
        variant: "destructive",
      });
      return;
    }
    if (!bookReady) {
      toast({ title: "Book not ready", description: "Wait for indexing to finish or reindex from Book Knowledge Base.", variant: "destructive" });
      return;
    }
    if (isStoryLanguageTool(selectedTool) && !isStoryPassageLanguageSubject(subject)) {
      toast({
        title: "English, Hindi, or Telugu only",
        description: "Story & Passage and Reading Practice tools work only with English, Hindi, or Telugu subjects.",
        variant: "destructive",
      });
      return;
    }
    if (isLanguageExcludedTool(selectedTool) && isStoryPassageLanguageSubject(subject)) {
      toast({
        title: "Language subjects not supported",
        description: LANGUAGE_EXCLUDED_TOOL_ERROR,
        variant: "destructive",
      });
      return;
    }
    if (!isValidGenerationRecordCount(generationRecordCount)) {
      toast({
        title: "Invalid record count",
        description: `Enter a whole number from ${GENERATION_RECORD_COUNT_MIN} to ${BOOK_GENERATOR_MAX_BATCH_SIZE} only.`,
        variant: "destructive",
      });
      return;
    }
    const batchSize = parseBatchSize();
    setIsGenerating(true);
    setGenerationLocked(false);
    setProgress("Retrieving textbook chunks for your topic…");
    if (!opts?.forceUnlock) setLastBatchSummary(null);
    try {
      // Kickoff should return 202 quickly. Retries are safe: a second POST gets 409 + jobId if already running.
      const res = await resilientFetch(`${API_BASE_URL}/api/book-generator/generate-batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(buildGenerationPayload(opts?.forceUnlock)),
        retries: 2,
        retryDelayMs: 2500,
        timeoutMs: 120_000,
      });
      const json = await res.json();

      if (res.status === 409 || json.locked || json.data?.locked) {
        setGenerationLocked(true);
        const existingJobId = json.data?.jobId;
        toast({
          title: "Generation already in progress",
          description: existingJobId
            ? "A batch is still running for this book/sub-topic. Waiting for it to finish…"
            : "A previous batch may still be running, or a lock is stuck. Use “Clear lock & retry” below.",
          variant: "destructive",
        });
        if (existingJobId) {
          setProgress("Resuming status check for in-progress batch…");
          await pollBookGeneratorJob(String(existingJobId));
        }
        return;
      }

      if (res.status === 202 && json.data?.jobId) {
        setProgress(
          `Generation started — 0/${batchSize} saved. Gemini 3.1 Flash-Lite is running; leave this tab open…`,
        );
        await pollBookGeneratorJob(String(json.data.jobId));
        return;
      }

      const data = (json.data || {}) as Record<string, unknown>;
      await applyBatchResult(data, json);
    } catch (e: unknown) {
      toast({
        title: "Generation failed",
        description: networkErrorUserMessage(e),
        variant: "destructive",
      });
      toast({
        title: "Check before retrying",
        description:
          "The server may still be generating. Wait 1–2 minutes, refresh records below, and only use Clear lock & retry if nothing new appeared.",
      });
    } finally {
      setIsGenerating(false);
      setProgress("");
    }
  };

  return (
    <div className="w-full max-w-[min(100%,1400px)] mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <BookOpen className="h-7 w-7 text-violet-600" />
          Book-Based AI Generator
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Select an indexed textbook → pick curriculum topic/sub-topic → generate content grounded in your book.
          Same tool output as AI Generator, but built from your textbook passages. Saved records appear below and in{" "}
          <strong>AI Tool Data</strong> for teachers and students.
        </p>
        <p className="text-xs text-slate-500 mt-1">
          Upload PDFs in <strong>Book Knowledge Base</strong> (sidebar). Browse or edit saved output in{" "}
          <strong>AI Tool Data</strong> (sidebar).
        </p>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-xs text-slate-700 space-y-1">
        <p className="font-semibold text-amber-900 flex items-center gap-1.5">
          <IndianRupee className="h-3.5 w-3.5" />
          Where Gemini cost applies
        </p>
        <p>
          <strong>Book upload / indexing</strong> (Book Knowledge Base): PDF text extraction is free. Embeddings use{" "}
          <code className="text-mini bg-white/80 px-1 rounded">EMBEDDING_PROVIDER=local</code> by default (₹0).
          Only <em>scanned</em> PDFs need OCR, which runs on Gemini Flash-Lite at about{" "}
          <strong>₹0.02–0.03 per page</strong> (roughly <strong>₹2–3 per 100 pages</strong>) at current
          rates. A text-based PDF costs ₹0. The exact tokens and ₹ for every run are shown below.
        </p>
        <p>
          <strong>Content generation</strong> (this page): choose how many records to generate per batch ({GENERATION_RECORD_COUNT_MIN}–{BOOK_GENERATOR_MAX_BATCH_SIZE}) with Gemini.
          <strong> Premium</strong>, <strong>Balanced</strong>, and <strong>Fast</strong> all use Gemini 3.1 Flash-Lite (Premium adds stricter validation and more retries).
          Token count and estimated ₹ cost appear below after each run.
        </p>
      </div>

      {/* Flow steps */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[
          { n: 1, label: "Select textbook", done: step1Done },
          { n: 2, label: "Tool & inputs", done: step2Done },
        ].map((s) => (
          <div
            key={s.n}
            className={cn(
              "flex items-center gap-3 rounded-xl border px-4 py-3 text-sm",
              s.done ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-slate-200 bg-white text-slate-700",
            )}
          >
            <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold", s.done ? "bg-emerald-600 text-white" : "bg-violet-100 text-violet-700")}>
              {s.done ? <CheckCircle2 className="h-4 w-4" /> : s.n}
            </span>
            <span className="font-medium">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Step 1: Select textbook from library */}
      <Card className="border-violet-200/80">
        <CardHeader className="pb-4 lg:pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5 text-violet-600" />
            Step 1 — Select Textbook
          </CardTitle>
          <p className="text-sm text-slate-500 font-normal">
            Choose a book you already uploaded in Book Knowledge Base. Upload new PDFs there — not here.
          </p>
        </CardHeader>
        <CardContent className="space-y-4 pt-0 lg:pt-0">
          {books.length === 0 && !booksLoading ? (
            <div className="rounded-xl border border-dashed border-violet-200 bg-violet-50/40 p-6 text-center space-y-3">
              <p className="text-sm text-slate-600">No textbooks indexed yet.</p>
              <Button
                type="button"
                className="bg-violet-600 hover:bg-violet-700"
                onClick={() => onOpenBookKnowledge?.()}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Go to Book Knowledge Base to upload PDF
              </Button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <p className="text-sm font-medium text-slate-800">Your indexed textbooks</p>
                <div className="grid w-full grid-cols-1 gap-2 min-[460px]:grid-cols-2 sm:w-auto sm:grid-cols-[9.5rem_11rem_auto]">
                  <Select value={bookGroupMode} onValueChange={(v) => { setBookGroupMode(v as "class" | "subject"); setBookGroupFilter("__all__"); }}>
                    <SelectTrigger className="h-11 w-full items-center text-xs [&>span]:truncate [&>span]:whitespace-nowrap [&>svg]:mt-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="class">Group by class</SelectItem>
                      <SelectItem value="subject">Group by subject</SelectItem>
                    </SelectContent>
                  </Select>
                  {bookGroupFilterOptions.length > 1 ? (
                    <Select value={bookGroupFilter} onValueChange={setBookGroupFilter}>
                      <SelectTrigger className="h-11 w-full items-center text-xs [&>span]:truncate [&>span]:whitespace-nowrap [&>svg]:mt-0">
                        <SelectValue placeholder="All groups" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">All groups</SelectItem>
                        {bookGroupFilterOptions.map((group) => (
                          <SelectItem key={group.key} value={group.key}>
                            {group.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : null}
                  <Button type="button" variant="outline" size="sm" className="h-10 min-[460px]:col-span-2 sm:col-span-1" onClick={() => { void loadBooks(); }}>
                    Refresh list
                  </Button>
                </div>
              </div>
              {booksLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-violet-500" /></div>
              ) : (
                <div className="max-h-[min(22rem,52vh)] overflow-y-auto rounded-lg border">
                  {visibleBookGroups.map((group) => (
                    <section key={group.key} className="border-b border-slate-100 last:border-b-0">
                      <p className="sticky top-0 z-10 border-b border-violet-100 bg-violet-50/95 px-3 py-2 text-xs font-bold uppercase tracking-wide text-violet-900 backdrop-blur-sm">
                        {group.label}
                        <span className="ml-2 font-medium normal-case tracking-normal text-violet-700">
                          ({group.books.length})
                        </span>
                      </p>
                      <ul className="space-y-2 p-2">
                        {group.books.map((b) => (
                          <li key={b._id}>
                            <button
                              type="button"
                              onClick={() => selectBook(b)}
                              className={cn(
                                "w-full text-left rounded-lg border px-3 py-2.5 text-sm transition hover:bg-slate-50",
                                bookId === b._id ? "border-violet-500 bg-violet-50 ring-1 ring-violet-200" : "border-slate-200",
                              )}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <span className="font-medium text-slate-900 line-clamp-2">{bookDisplayTitle(b)}</span>
                                {statusBadge(b.processingStatus, b.embeddingsCreated)}
                              </div>
                              <p className="text-xs text-slate-500 mt-1">
                                {(() => {
                                  const branch = scienceBranchDisplayLabel(b.subject);
                                  const curriculumSubject = bookListSubjectGroupKey(b.board, b.subject);
                                  const subjectLine =
                                    branch && curriculumSubject === "Science"
                                      ? `Science · ${branch}`
                                      : b.subject || "Subject";
                                  return bookGroupMode === "class"
                                    ? `${subjectLine}${normalizeIitCategory(b.productCategory) ? ` · ${formatIitCategoryLabel(b.productCategory)}` : ""}${b.chunkCount ? ` · ${b.chunkCount} chunks` : ""}`
                                    : `${normalizeClassLabel(b.class)}${branch ? ` · ${branch}` : ""}${normalizeIitCategory(b.productCategory) ? ` · ${formatIitCategoryLabel(b.productCategory)}` : ""}${b.chunkCount ? ` · ${b.chunkCount} chunks` : ""}`;
                                })()}
                              </p>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              )}
            </>
          )}

          {selectedBook ? (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              <FileText className="h-4 w-4 shrink-0" />
              <span>
                Selected: <strong>{bookDisplayTitle(selectedBook)}</strong>
                {(() => {
                  const branch = scienceBranchDisplayLabel(selectedBook.subject);
                  const mapped = curriculumSubjectForAiToolTopics(selectedBook.board, selectedBook.subject);
                  if (branch && mapped === "Science") {
                    return ` — CBSE curriculum subject: Science (${branch} textbook)`;
                  }
                  return "";
                })()}
                {bookReady ? " — ready for generation" : " — still indexing; reindex from Book Knowledge Base"}
              </span>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Step 2: Curriculum + tool + generate */}
      <Card className={cn(!bookId && "opacity-60 pointer-events-none")}>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-violet-600" />
            Step 2 — Choose Tool, Then Inputs
          </CardTitle>
          <p className="text-sm text-slate-500 font-normal">
            Pick a <strong>tool</strong> first, then fill <strong>board</strong>, <strong>class</strong>, <strong>subject</strong>, <strong>topic</strong>, <strong>whole chapter or sub-topic</strong>, and record count (1–{BOOK_GENERATOR_MAX_BATCH_SIZE}) to generate.
          </p>
        </CardHeader>
        <CardContent className="space-y-8">
        <div className="space-y-6">
          <div>
            <p className="mb-1 text-sm font-semibold text-slate-900">1. Choose tool</p>
            <p className="mb-3 text-sm text-slate-500">
              <strong>{BOOK_BASED_STUDENT_TOOLS.length} student</strong> and <strong>{BOOK_BASED_TEACHER_TOOLS.length} teacher</strong> tools for{" "}
              <strong>{selectedBook?.title || "your textbook"}</strong>.
            </p>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Student ({BOOK_BASED_STUDENT_TOOLS.length})
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {BOOK_BASED_STUDENT_TOOLS.map(renderToolButton)}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Teacher ({BOOK_BASED_TEACHER_TOOLS.length})
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {BOOK_BASED_TEACHER_TOOLS.map(renderToolButton)}
            </div>
          </div>
        </div>

        <div className={cn("space-y-3 border-t border-slate-200 pt-4", !selectedTool && "opacity-60 pointer-events-none")}>
          <p className="text-sm font-semibold text-slate-900">2. Curriculum inputs</p>
          <p className="text-xs text-slate-500">
            Subject, topic, and sub-topic come only from <strong>AI Tool Topics</strong>.
            On CBSE, Physics / Chemistry / Biology textbooks stay under <strong>Science</strong>.
          </p>
          <div
            className={cn(
              "grid grid-cols-1 gap-3 sm:grid-cols-2",
              isIitBoardSelected ? "xl:grid-cols-5" : "xl:grid-cols-4",
            )}
          >
            <div className="min-w-0 space-y-1 xl:min-w-[13.5rem]">
              <Label className="text-xs">Board</Label>
              <Select value={board} onValueChange={handleBoardChange}>
                <SelectTrigger className="h-10 overflow-hidden">
                  <SelectValue placeholder={boardOptionsForSelect.length ? "Select board" : "Loading…"} />
                </SelectTrigger>
                <SelectContent>
                  {boardOptionsForSelect.map((b) => (
                    <SelectItem key={b} value={b}>
                      {displayBoardShort(b) || b}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {isIitBoardSelected ? (
              <div className="min-w-0 space-y-1">
                <Label className="text-xs">IIT track</Label>
                <Select
                  value={productCategory || "__general__"}
                  onValueChange={handleCategoryChange}
                  disabled={!board}
                >
                  <SelectTrigger className="h-10 overflow-hidden">
                    <SelectValue placeholder={!board ? "Board first" : "General"} />
                  </SelectTrigger>
                  <SelectContent>
                    {categorySelectOptions.map((c) => (
                      <SelectItem key={c.code || "__general__"} value={c.code || "__general__"}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div className="min-w-0 space-y-1">
              <Label className="text-xs">Class</Label>
              <Select value={classNumber} onValueChange={handleClassChange} disabled={!board || loadingClasses}>
                <SelectTrigger className="h-10 overflow-hidden">
                  <SelectValue placeholder={!board ? "Board first" : loadingClasses ? "Loading…" : "Class"} />
                </SelectTrigger>
                <SelectContent>
                  {classOptionsForSelectWithBook.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 space-y-1">
              <Label className="text-xs">Subject</Label>
              <Select value={subject} onValueChange={handleSubjectChange} disabled={!classNumber || loadingSubjects}>
                <SelectTrigger className="h-10 overflow-hidden">
                  <SelectValue
                    placeholder={
                      !classNumber
                        ? "Class first"
                        : loadingSubjects
                          ? "Loading…"
                          : isStoryLanguageTool(selectedTool) && subjectsForTool.length === 0
                            ? "Language subjects only"
                            : isLanguageExcludedTool(selectedTool) && subjectsForTool.length === 0
                              ? "Not for language subjects"
                              : "Subject"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {subjectOptionsForSelect.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 space-y-1">
              <Label className="text-xs">Topic</Label>
              <Select value={topic} onValueChange={handleTopicChange} disabled={!subject || loadingTopics}>
                <SelectTrigger>
                  <SelectValue placeholder={!subject ? "Subject first" : loadingTopics ? "Loading…" : "Topic"} />
                </SelectTrigger>
                <SelectContent>
                  {topicOptionsForSelect.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 space-y-1 sm:col-span-2 xl:col-span-full">
              <Label className="text-xs">Sub topic</Label>
              <Select
                value={subTopic || WHOLE_CHAPTER_VALUE}
                onValueChange={(value) => {
                  setSubTopic(value);
                  setExtraSubTopics([]);
                }}
                disabled={!topic || loadingSubtopics}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      !topic
                        ? "Topic first"
                        : loadingSubtopics
                          ? "Loading…"
                          : "Whole chapter / sub-topic"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={WHOLE_CHAPTER_VALUE}>Whole chapter</SelectItem>
                  {subtopics.map((st) => (
                    <SelectItem key={st} value={st}>
                      {st}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-slate-500">
            {isWholeChapter
              ? "Questions will cover the full chapter/topic (all major ideas)."
              : isCombinedPaper
                ? `Combined paper covering ${selectedSubTopicsForPayload.length} subtopics.`
                : "Questions will focus on this sub-topic — or add more below for a combined paper."}
          </p>
          {isWholeChapter && subtopics.length > 0 ? (
            <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-950 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={expandEachSubtopic}
                onChange={(e) => setExpandEachSubtopic(e.target.checked)}
              />
              <span>
                Also generate <strong>separately for each of the {subtopics.length} subtopic(s)</strong>,
                plus Whole chapter. Keeps content under the correct SUBTOPIC cards (not all under Whole chapter).
              </span>
            </label>
          ) : null}
          {supportsMultiSubtopic && subtopics.length > 1 ? (
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-500">
                Combined paper — add more subtopics ({extraSubTopics.length + 1} selected)
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {subtopics
                  .filter((st) => st !== subTopic)
                  .map((st) => {
                    const on = extraSubTopics.includes(st);
                    return (
                      <button
                        key={st}
                        type="button"
                        onClick={() =>
                          setExtraSubTopics((prev) =>
                            prev.includes(st) ? prev.filter((x) => x !== st) : [...prev, st],
                          )
                        }
                        className={cn(
                          "rounded-full border px-3 py-1 text-xs font-medium transition",
                          on
                            ? "border-violet-500 bg-violet-50 text-violet-800"
                            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                        )}
                      >
                        {on ? "✓ " : "+ "}
                        {st}
                      </button>
                    );
                  })}
              </div>
              {extraSubTopics.length > 0 ? (
                <p className="text-xs text-slate-400">
                  One combined paper covering {extraSubTopics.length + 1} subtopics from the textbook.
                </p>
              ) : null}
            </div>
          ) : null}
          <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-4 space-y-4">
            {selectedTool && QUESTION_COUNT_TOOLS.has(selectedTool) ? (
              <div className="max-w-xs space-y-1.5">
                <Label htmlFor="book-question-count">Number of questions</Label>
                <Input
                  id="book-question-count"
                  type="number"
                  min={QUESTION_COUNT_MIN}
                  max={QUESTION_COUNT_MAX}
                  placeholder={`e.g. 10 (${QUESTION_COUNT_MIN}–${QUESTION_COUNT_MAX})`}
                  value={questionCount}
                  onChange={(e) => {
                    const next = sanitizeQuestionCountInput(e.target.value);
                    if (next !== null) setQuestionCount(next);
                  }}
                  disabled={isGenerating}
                  className="bg-white"
                />
                <p className="text-xs text-slate-500">
                  Each generated paper will contain exactly this many questions.
                </p>
              </div>
            ) : null}
            <GenerationRecordCountField
              id="book-generation-count"
              value={generationRecordCount}
              onChange={setGenerationRecordCount}
              disabled={isGenerating}
            />
          </div>
        </div>

          {selectedTool && curriculumDone ? (
            <div className="flex flex-col gap-3 rounded-lg border border-violet-100 bg-violet-50/50 p-4 sm:gap-4">
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                {currentTool ? (
                  <Badge variant="secondary" className="shrink-0 max-w-full">
                    {currentTool.audience === "student" ? "Student" : "Teacher"} · {currentTool.name}
                  </Badge>
                ) : null}
                {isStoryLanguageTool(selectedTool) ? (
                  <p className="text-xs text-blue-800 bg-blue-50 border border-blue-200 rounded-md px-2 py-1.5 w-full sm:w-auto">
                    English, Hindi, and Telugu subjects only for this tool.
                  </p>
                ) : null}
                {isLanguageExcludedTool(selectedTool) ? (
                  <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5 w-full sm:w-auto">
                    Not available for English, Hindi, or Telugu subjects.
                  </p>
                ) : null}
              </div>
              <div className="flex items-start gap-2">
                <Checkbox id="use-book-kb" checked={useBookKnowledge} onCheckedChange={(v) => setUseBookKnowledge(v === true)} />
                <Label htmlFor="use-book-kb" className="text-sm cursor-pointer leading-snug">
                  Use textbook as primary source (RAG)
                </Label>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="book-quality-tier" className="text-sm">
                  Generation quality
                </Label>
                <Select
                  value={qualityTier}
                  onValueChange={(v) => setQualityTier(v as GenerationQualityTierId)}
                  disabled={isGenerating}
                >
                  <SelectTrigger id="book-quality-tier" className="max-w-xs bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GENERATION_QUALITY_TIERS.map((tier) => (
                      <SelectItem key={tier.id} value={tier.id}>
                        {tier.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-600">
                  {GENERATION_QUALITY_TIERS.find((t) => t.id === qualityTier)?.description}
                </p>
              </div>
              <p className="text-xs text-slate-600 w-full">
                Combines your curriculum inputs with retrieved book content.
              </p>
              <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                <Button
                  className="bg-violet-600 hover:bg-violet-700 w-full sm:w-auto sm:shrink-0"
                  onClick={() => void handleGenerate()}
                  disabled={isGenerating || !bookReady || !isValidGenerationRecordCount(generationRecordCount)}
                >
                  {isGenerating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
                  {isGenerating ? "Generating…" : generationRecordCountButtonLabel(generationRecordCount)}
                </Button>
                {generationLocked ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full shrink-0 border-amber-300 text-amber-800 hover:bg-amber-50 sm:w-auto"
                    disabled={isGenerating}
                    onClick={() => void releaseLockAndRetry()}
                  >
                    Clear lock & retry
                  </Button>
                ) : null}
              </div>
              {isGenerating && progress ? (
                <p className="w-full rounded-md border border-violet-200 bg-violet-100/70 px-3 py-2 text-xs leading-relaxed text-violet-900 break-words">
                  {progress}
                </p>
              ) : null}
            </div>
          ) : null}

          {lastBatchSummary ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-2.5 text-xs text-slate-700 space-y-2">
              <p className="font-semibold text-emerald-900">
                Last batch: {lastBatchSummary.successCount}/{lastBatchSummary.batchSize} saved
                {lastBatchSummary.failedCount > 0 ? ` (${lastBatchSummary.failedCount} failed)` : ""}
              </p>
              {lastBatchSummary.failures && lastBatchSummary.failures.length > 0 ? (
                <div className="rounded-md border border-red-200 bg-red-50/80 px-2.5 py-2 text-red-900">
                  <p className="font-semibold">Failed slots</p>
                  {lastBatchSummary.failures.every((line) => /spending cap|monthly spend|Billing\/Spend/i.test(line)) ? (
                    <p className="mt-1 text-mini leading-relaxed">
                      Gemini monthly spending cap is reached. Open Google AI Studio → Billing/Spend, raise the project cap (or add billing), then retry. Switching to Fast/Balanced will not help until the cap is raised.
                    </p>
                  ) : lastBatchSummary.failures.every((line) => /temporarily busy|503|429|UNAVAILABLE/i.test(line)) ? (
                    <p className="mt-1 text-mini leading-relaxed">
                      Gemini looks busy or rate-limited. Wait a minute, switch to Balanced/Fast, or generate fewer records at once.
                    </p>
                  ) : null}
                  <ul className="mt-1 list-disc space-y-0.5 pl-4">
                    {lastBatchSummary.failures.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {lastBatchSummary.trackingMissing ? (
                <p className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2 font-medium text-amber-900">
                  Token tracking was unavailable for this completed batch. ₹0.00 is not being reported as the real cost.
                  Deploy/restart the latest backend, then run a small test batch to verify live token and cost totals.
                </p>
              ) : (
                <>
                  <p>
                    Tokens:{" "}
                    <span className="font-medium">{formatTokenCount(lastBatchSummary.tokenUsage.totalTokens)}</span> total
                    {" "}({formatTokenCount(lastBatchSummary.tokenUsage.promptTokens)} prompt +{" "}
                    {formatTokenCount(lastBatchSummary.tokenUsage.completionTokens)} completion,{" "}
                    {lastBatchSummary.tokenUsage.callCount} LLM calls)
                  </p>
                  <p>
                    Estimated Gemini cost:{" "}
                    <span className="font-semibold text-emerald-900">{formatInr(lastBatchSummary.cost.inr)}</span>
                    {" "}(~${lastBatchSummary.cost.usd.toFixed(4)} USD at ₹{lastBatchSummary.cost.exchangeRateInr}/$)
                  </p>
                  <p className="text-mini text-slate-500">{lastBatchSummary.cost.pricingNote}</p>
                </>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <GeneratorRecordsPanel
        apiPrefix="/api/book-generator"
        boardOptions={boardOptions}
        boardFilterDefault="__all__"
        accent="violet"
        title="Records"
        subtitle="Textbook-grounded generations — same layout as AI Generator. Also visible in AI Tool Data for end users."
        showBookBadge
        reloadNonce={recordsReloadNonce}
        headerExtra={
          onOpenAiToolData ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0 border-orange-200 text-orange-800 hover:bg-orange-50"
              onClick={() => onOpenAiToolData()}
            >
              <FolderTree className="h-3.5 w-3.5 mr-1.5" />
              AI Tool Data
            </Button>
          ) : null
        }
      />
    </div>
  );
}
