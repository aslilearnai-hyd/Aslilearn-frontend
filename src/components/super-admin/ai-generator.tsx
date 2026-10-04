import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getAuthToken } from '@/lib/auth-utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Eye, FileDown, Loader2, Pencil, Sparkles, Trash2 } from "lucide-react";
import { API_BASE_URL } from "@/lib/api-config";
import { networkErrorUserMessage, resilientFetch } from "@/lib/resilient-fetch";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/use-confirm";
import { useCurriculumCascade } from "@/hooks/use-curriculum-cascade";
import { useProductCategories } from "@/hooks/use-product-categories";
import { formatIitCategoryLabel, isIitStyleBoard, normalizeIitCategory } from "@/lib/products";
import { displayBoardShort } from "@/lib/board-label";
import { GeneratedRecordBody } from "@/components/super-admin/generated-record-body";
import { AiToolRecordPreviewBody } from "@/components/super-admin/ai-tool-record-preview-body";
import {
  recordGenerationVariant,
  recordVariantAngle,
} from "@/lib/ai-tool-record-list-preview";
import { openAiToolRecordPdf } from "@/lib/ai-tool-record-pdf";
import { sortAiToolRecordsByVariantThenDate } from "@/lib/ai-tool-record-sort";
import { FlashcardViewer } from "@/components/flashcard-viewer";
import {
  MyStudyDecksViewer,
  deckViewerPayloadFromRecord,
} from "@/components/my-study-decks-viewer";
import {
  MockTestViewer,
  mockTestViewerPayloadFromRecord,
} from "@/components/mock-test-viewer";
import { GeneratorRecordViewer } from "@/components/super-admin/generator-record-viewer";
import { displaySubtopicLabel, isSingleSubtopicLabel } from "@/lib/curriculum-subtopic-display";
import {
  SmartStudyGuideViewer,
  studyGuideViewerPayloadFromRecord,
} from "@/components/smart-study-guide-viewer";
import {
  ConceptBreakdownViewer,
  conceptBreakdownViewerPayloadFromRecord,
} from "@/components/concept-breakdown-viewer";
import {
  PracticeQaViewer,
  practiceQaViewerPayloadFromRecord,
} from "@/components/practice-qa-viewer";
import {
  ChapterSummaryViewer,
  chapterSummaryViewerPayloadFromRecord,
} from "@/components/chapter-summary-viewer";
import {
  KeyPointsViewer,
  keyPointsViewerPayloadFromRecord,
} from "@/components/key-points-viewer";
import {
  QuickAssignmentViewer,
  quickAssignmentViewerPayloadFromRecord,
} from "@/components/quick-assignment-viewer";
import { HomeworkCreatorViewer } from "@/components/homework-creator-viewer";
import { LessonPlannerViewer } from "@/components/lesson-planner-viewer";
import { DailyClassPlanViewer } from "@/components/daily-class-plan-viewer";
import { StoryPassageViewer } from "@/components/story-passage-viewer";
import { ShortNotesViewer } from "@/components/short-notes-viewer";
import { WorksheetMcqViewer } from "@/components/worksheet-mcq-viewer";
import {
  ActivityProjectViewer,
  activityViewerPayloadFromRecord,
} from "@/components/activity-project-viewer";
import {
  ConceptMasteryViewer,
  conceptMasteryViewerPayloadFromRecord,
} from "@/components/concept-mastery-viewer";
import {
  filterSubjectsForAiTool,
  isLanguageExcludedTool,
  isStoryLanguageTool,
  isStoryPassageLanguageSubject,
  LANGUAGE_EXCLUDED_TOOL_ERROR,
} from "@/lib/ai-tool-subject-rules";
import {
  computeGeminiCostFromTokenUsage,
  emptyTokenTotals,
  formatCostInr,
  formatInr,
  formatTokenCount,
  mergeTokenTotals,
  mergeTokenUsageSnapshots,
  perRecordShareFromCost,
  type GeminiCostEstimate,
  type StoredRecordCost,
  type TokenCall,
  type TokenTotals,
  type TokenUsageSnapshot,
} from "@/lib/gemini-token-cost";
import { AiGeneratorAuditPanel } from "@/components/super-admin/ai-generator-audit";
import {
  GENERATION_RECORD_COUNT_MAX,
  GENERATION_RECORD_COUNT_MIN,
  generationRecordCountButtonLabel,
  isValidGenerationRecordCount,
  parseGenerationRecordCount,
  sanitizeGenerationRecordCountInput,
} from "@/lib/generation-record-count";
import {
  DEFAULT_GENERATION_QUALITY_TIER,
  GENERATION_QUALITY_TIERS,
  type GenerationQualityTierId,
} from "@/lib/generation-quality-tier";

function formatSubtopicGroupLabel(name: string) {
  const raw = String(name || "").trim();
  if (!raw || /^whole\s*chapter$/i.test(raw)) return "Whole chapter";
  if (isSingleSubtopicLabel(raw)) return displaySubtopicLabel(raw) || raw;
  // Explicit multi-joins only — keep a visible Whole chapter bucket
  return "Whole chapter";
}

const MAX_GENERATION_BATCH_SIZE = GENERATION_RECORD_COUNT_MAX;
/** Parallel workers — each picks the latest avoid-list before calling Gemini. */
const BATCH_CONCURRENCY = 3;
const RECOVERY_ATTEMPTS_PER_VARIANT = 2;
const RECOVERY_ROUNDS_MAX = 1;

type VariantGenerateResult = {
  variant: number;
  ok: boolean;
  message?: string;
  generatedContent?: string;
  tokenTotals?: Partial<TokenTotals>;
  tokenUsage?: TokenUsageSnapshot;
  exchangeRateInr?: number;
};

/** Parallel workers for batch variant generation. */
async function runVariantWorkerPool(
  variants: number[],
  concurrency: number,
  runOne: (variant: number) => Promise<VariantGenerateResult>,
  onDone: (completed: number, total: number) => void,
): Promise<VariantGenerateResult[]> {
  const results: VariantGenerateResult[] = new Array(variants.length);
  let nextJob = 0;
  let completed = 0;

  async function worker() {
    while (true) {
      const jobIndex = nextJob;
      nextJob += 1;
      if (jobIndex >= variants.length) break;
      const variant = variants[jobIndex];
      const result = await runOne(variant);
      results[jobIndex] = result;
      completed += 1;
      onDone(completed, variants.length);
    }
  }

  const workers = Math.min(concurrency, variants.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

type ToolId =
  | "activity-project-generator"
  | "project-idea-lab"
  | "worksheet-mcq-generator"
  | "concept-mastery-helper"
  | "lesson-planner"
  | "study-schedule-maker"
  | "homework-creator"
  | "reading-practice-room"
  | "story-passage-creator"
  | "short-notes-summaries-maker"
  | "my-study-decks"
  | "flashcard-generator"
  | "daily-class-plan-maker"
  | "mock-test-builder"
  | "exam-question-paper-generator"
  | "smart-study-guide-generator"
  | "concept-breakdown-explainer"
  | "smart-qa-practice-generator"
  | "chapter-summary-creator"
  | "key-points-formula-extractor"
  | "quick-assignment-builder";

const TOOLS: Array<{ id: ToolId; name: string; description: string }> = [
  { id: "project-idea-lab", name: "Project Idea Lab", description: "14-point student project format with safety, observation table, creative output, and self-assessment." },
  { id: "activity-project-generator", name: "Activity / Project Generator", description: "13-point teacher activity kit with teacher and student instructions and assessment rubric." },
  { id: "worksheet-mcq-generator", name: "Worksheet & MCQ Generator", description: "Design worksheets and exam-quality MCQs." },
  { id: "concept-mastery-helper", name: "Concept Mastery Helper", description: "Generate concept explanations and mastery notes." },
  { id: "study-schedule-maker", name: "Study Schedule Maker", description: "13-point student study schedule with plan table, concept slot, and self-assessment." },
  { id: "lesson-planner", name: "Lesson Planner", description: "14-point teacher lesson plan with classroom activities and formative assessment." },
  { id: "homework-creator", name: "Homework Creator", description: "Generate homework tasks and practice sets." },
  { id: "reading-practice-room", name: "Reading Practice Room", description: "13-section reading practice with recall, infer, and connect questions (English, Hindi & Telugu only)." },
  { id: "story-passage-creator", name: "Story and Passage Creator", description: "19-section teacher story and passage sets (English, Hindi & Telugu only)." },
  { id: "short-notes-summaries-maker", name: "Short Notes & Summaries", description: "Create concise revision notes." },
  { id: "my-study-decks", name: "My Study Decks", description: "12-section student study decks with flashcard set, difficulty tags, and self-check." },
  { id: "flashcard-generator", name: "Flash Card Generator", description: "5-block teacher deck: Context, Foundations, HOTS Task/Solution cards, Study Aids, and Wrap-Up." },
  { id: "daily-class-plan-maker", name: "Daily Class Plan", description: "Create day-wise classroom plans." },
  { id: "mock-test-builder", name: "Mock Test Builder", description: "12-section mock tests with question paper, answer key, solutions, and remedial guidance." },
  { id: "exam-question-paper-generator", name: "Exam Question Paper Generator", description: "11-section exam papers: blueprint, sections A–E, answer key, marking scheme, and rubric." },
  { id: "smart-study-guide-generator", name: "Smart Study Guide Generator", description: "11-section study guides with overview, concepts, practice questions, and improvement tips." },
  { id: "concept-breakdown-explainer", name: "Concept Breakdown Explainer", description: "9-section concept breakdown with Indian-context examples and thinking prompts." },
  { id: "smart-qa-practice-generator", name: "Smart Q&A Practice Generator", description: "11-section practice sets with MCQs, sections A–G, and answer key with explanations." },
  { id: "chapter-summary-creator", name: "Chapter Summary Creator", description: "10-section chapter summaries with concepts, revision notes, and recall questions." },
  // Retired (not in prompts/registry): key-points-formula-extractor, quick-assignment-builder
];

const STUDENT_TOOL_IDS: ToolId[] = [
  "smart-study-guide-generator",
  "smart-qa-practice-generator",
  "concept-breakdown-explainer",
  "chapter-summary-creator",
  "my-study-decks",
  "mock-test-builder",
  "project-idea-lab",
  "reading-practice-room",
  "study-schedule-maker",
];

const TEACHER_TOOL_IDS: ToolId[] = [
  "activity-project-generator",
  "worksheet-mcq-generator",
  "concept-mastery-helper",
  "lesson-planner",
  "exam-question-paper-generator",
  "daily-class-plan-maker",
  "homework-creator",
  "story-passage-creator",
  "short-notes-summaries-maker",
  "flashcard-generator",
];

const TEACHER_TOOL_LABELS: Partial<Record<ToolId, string>> = {
  "activity-project-generator": "Activity / Project Generator",
  "worksheet-mcq-generator": "Worksheet & MCQ Generator",
  "concept-mastery-helper": "Concept Mastery Helper",
  "lesson-planner": "Lesson Planner",
  "exam-question-paper-generator": "Exam Question Paper Generator",
  "daily-class-plan-maker": "Daily Class Plan Maker",
  "homework-creator": "Homework Creator",
  "short-notes-summaries-maker": "Short Notes & Summarizer",
};

type GeneratorRecord = {
  _id: string;
  generatedContent: string;
  createdAt?: string;
  metadata?: {
    structuredContent?: unknown;
    extraParams?: { generationVariant?: number; variantAngle?: string };
    cost?: StoredRecordCost;
    tokenUsage?: TokenUsageSnapshot;
  };
  generationVariant?: number | null;
  variantAngle?: string;
};

type GroupedSubtopic = { subtopicName: string; records: GeneratorRecord[] };
type GroupedTopic = { topicName: string; subtopics: GroupedSubtopic[] };
type GroupedSubject = { subjectName: string; topics: GroupedTopic[] };

/** Question tools that support combining multiple subtopics into one paper. */
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
type GroupedClass = { className: string; boardName?: string; subjects: GroupedSubject[] };
type GroupedTool = { toolName: string; toolSlug: string; classes: GroupedClass[] };

function isWorksheetToolValue(v: unknown): boolean {
  const t = String(v || "").trim().toLowerCase();
  return t === "worksheet-mcq-generator" || (t.includes("worksheet") && t.includes("mcq"));
}

export default function SuperAdminAiGenerator() {
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const [board, setBoard] = useState("CBSE");
  /** Records list is filtered only by board; independent of the generate form. */
  const [recordsBoardFilter, setRecordsBoardFilter] = useState("CBSE");
  const [boardOptions, setBoardOptions] = useState<string[]>([]);
  const [productCategory, setProductCategory] = useState("");
  const [categoryOptions, setCategoryOptions] = useState<Array<{ code: string; label: string }>>([
    { code: "", label: "General" },
  ]);
  const [selectedTool, setSelectedTool] = useState<ToolId | "">("");
  const [classNumber, setClassNumber] = useState("");
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [subTopic, setSubTopic] = useState("");
  // Additional subtopics for a COMBINED paper (question tools only).
  const [extraSubTopics, setExtraSubTopics] = useState<string[]>([]);
  /** Generate each selected subtopic as its own batch (+ optional whole chapter). */
  const [expandEachSubtopic, setExpandEachSubtopic] = useState(false);
  const [questionType, setQuestionType] = useState("All Types");
  const [questionCount, setQuestionCount] = useState("10");
  const [generationRecordCount, setGenerationRecordCount] = useState("");
  const [difficulty, setDifficulty] = useState("medium");
  const [duration, setDuration] = useState("30");
  const [isGenerating, setIsGenerating] = useState(false);
  const generateInFlightRef = useRef(false);
  const [generationLocked, setGenerationLocked] = useState(false);
  const [activeTab, setActiveTab] = useState<"generate" | "audit">("generate");
  const [forceGenerateNew, setForceGenerateNew] = useState(false);
  const [qualityTier, setQualityTier] = useState<GenerationQualityTierId>(DEFAULT_GENERATION_QUALITY_TIER);
  const [generationProgress, setGenerationProgress] = useState<{
    current: number;
    total: number;
    phase?: string;
    currentSubtopic?: string;
    subtopicIndex?: number;
    subtopicTotal?: number;
  } | null>(null);
  const [lastBatchSummary, setLastBatchSummary] = useState<{
    successCount: number;
    failedCount: number;
    batchSize: number;
    mode?: string;
    failures?: string[];
    tokenUsage: TokenTotals;
    cost: GeminiCostEstimate;
    perRecordCost?: { usd: number; inr: number };
    boardUsed?: string;
  } | null>(null);
  const [recordsTree, setRecordsTree] = useState<GroupedTool[]>([]);
  const [recordsTotal, setRecordsTotal] = useState(0);
  const [recordsLoadedCount, setRecordsLoadedCount] = useState(0);
  const [recordsTruncated, setRecordsTruncated] = useState(false);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [isDeleteAllDialogOpen, setIsDeleteAllDialogOpen] = useState(false);
  const [activeRecord, setActiveRecord] = useState<any | null>(null);
  const [editRecord, setEditRecord] = useState<any | null>(null);
  const [editContent, setEditContent] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingSubtopicKey, setDeletingSubtopicKey] = useState<string | null>(null);
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
    productCategory,
  );

  const { codes: productCategoryCodes, labelMap: productCategoryLabels } = useProductCategories();

  const subjectsForTool = useMemo(
    () => filterSubjectsForAiTool(selectedTool || "", subjects),
    [selectedTool, subjects],
  );
  const studentTools = useMemo(
    () => TOOLS.filter((tool) => STUDENT_TOOL_IDS.includes(tool.id)),
    [],
  );
  const teacherTools = useMemo(
    () => TOOLS.filter((tool) => TEACHER_TOOL_IDS.includes(tool.id)),
    [],
  );

  const currentTool = useMemo(() => TOOLS.find((t) => t.id === selectedTool), [selectedTool]);
  const authHeaders = (): Record<string, string> => {
    const token = getAuthToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  useEffect(() => {
    let cancelled = false;
    const loadBoards = async () => {
      try {
        const res = await resilientFetch(`${API_BASE_URL}/api/super-admin/ai-tool-topics/options`, {
          headers: { ...authHeaders() },
          credentials: "include",
          timeoutMs: 30_000,
          retries: 1,
        });
        const json = await res.json();
        if (!res.ok || json?.success === false || cancelled) throw new Error("Options fetch failed");
        const boardsFromOptions: string[] = Array.isArray(json?.data?.boards)
          ? json.data.boards.map((b: unknown) => String(b || "").trim()).filter(Boolean)
          : [];
        if (boardsFromOptions.length > 0) {
          setBoardOptions(Array.from(new Set<string>(boardsFromOptions)).sort((a, b) => a.localeCompare(b)));
          return;
        }
        throw new Error("No boards in options response");
      } catch {
        try {
          // Fallback: still source boards only from ai_tool_topics rows.
          const listRes = await fetch(`${API_BASE_URL}/api/super-admin/ai-tool-topics?page=1&limit=200`, {
            headers: { ...authHeaders() },
            credentials: "include",
          });
          const listJson = await listRes.json();
          const boardsFromRows: string[] = Array.isArray(listJson?.data?.items)
            ? listJson.data.items.map((row: any) => String(row?.board || "").trim()).filter(Boolean)
            : [];
          setBoardOptions(Array.from(new Set<string>(boardsFromRows)).sort((a, b) => a.localeCompare(b)));
        } catch {
          setBoardOptions([]);
        }
      }
    };
    void loadBoards();
    return () => {
      cancelled = true;
    };
  }, []);

  const buildExtraParams = () => {
    const payload: Record<string, any> = {};
    if (productCategory) payload.productCategory = productCategory;
    if (QUESTION_COUNT_TOOLS.has(selectedTool as ToolId)) {
      payload.questionCount = parseQuestionCount(questionCount);
      payload.numberOfQuestions = payload.questionCount;
    }
    if (selectedTool === "worksheet-mcq-generator") {
      payload.questionType = questionType;
    }
    if (selectedTool === "smart-qa-practice-generator") {
      payload.questionType = questionType;
      payload.difficulty = difficulty;
    }
    if (
      selectedTool === "homework-creator" ||
      selectedTool === "mock-test-builder" ||
      selectedTool === "quick-assignment-builder"
    ) {
      payload.duration = Number(duration) || 30;
    }
    return payload;
  };

  const loadRecords = async (boardOverride?: string) => {
    setRecordsLoading(true);
    const boardFilter = boardOverride ?? recordsBoardFilter;
    try {
      const qs = new URLSearchParams();
      if (boardFilter && boardFilter !== "__all__") {
        qs.set("board", boardFilter);
      }
      qs.set("limit", "200");
      let res: Response | null = null;
      let json: { success?: boolean; message?: string; data?: { grouped?: unknown[]; total?: number; loadedCount?: number; truncated?: boolean } } | null = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        res = await resilientFetch(`${API_BASE_URL}/api/ai-generator/records?${qs.toString()}`, {
          headers: { ...authHeaders() },
          retries: 3,
          retryDelayMs: 1500,
          timeoutMs: 90_000,
        });
        json = await res.json().catch(() => null);
        if (res.status !== 429 && res.status !== 503) break;
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
      if (!res || !res.ok || !json?.success) {
        throw new Error(json?.message || "Failed to load records");
      }
      const grouped = Array.isArray(json?.data?.grouped) ? json.data.grouped : [];
      setRecordsTree(grouped as typeof recordsTree);
      setRecordsTotal(Number(json?.data?.total || 0));
      const loaded = Number(json?.data?.loadedCount);
      setRecordsLoadedCount(Number.isFinite(loaded) && loaded > 0 ? loaded : 0);
      setRecordsTruncated(Boolean(json?.data?.truncated));
    } catch (error: any) {
      setRecordsTree([]);
      setRecordsTotal(0);
      setRecordsLoadedCount(0);
      setRecordsTruncated(false);
      toast({
        title: "Records load failed",
        description: networkErrorUserMessage(error),
        variant: "destructive",
      });
    } finally {
      setRecordsLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const loadCategories = async () => {
      if (!board) {
        setCategoryOptions([{ code: "", label: "General" }]);
        return;
      }
      // Always include active Product tracks (Alpha/Beta/Gamma/Delta) so SA can
      // generate for a track even before AI Tool Topics exist for it.
      const fromProducts = productCategoryCodes
        .map((code) => normalizeIitCategory(code))
        .filter(Boolean)
        .map((code) => ({
          code,
          label: `IIT ${formatIitCategoryLabel(code, productCategoryLabels)}`,
        }));
      const byCode = new Map<string, { code: string; label: string }>();
      byCode.set("", { code: "", label: "General" });
      for (const row of fromProducts) byCode.set(row.code, row);

      try {
        const res = await fetch(
          `${API_BASE_URL}/api/super-admin/ai-tool-topics/options?${new URLSearchParams({ board }).toString()}`,
          { headers: { ...authHeaders() }, credentials: "include" },
        );
        const json = await res.json();
        if (!res.ok || cancelled) return;
        const rows = Array.isArray(json?.data?.productCategories) ? json.data.productCategories : [];
        for (const c of rows) {
          const code = normalizeIitCategory(c?.code);
          if (!code) continue;
          if (!byCode.has(code)) {
            byCode.set(code, {
              code,
              label: String(c.label || formatIitCategoryLabel(code, productCategoryLabels) || code),
            });
          }
        }
      } catch {
        // Products list is enough as fallback
      }
      if (!cancelled) {
        setCategoryOptions(Array.from(byCode.values()));
      }
    };
    void loadCategories();
    return () => {
      cancelled = true;
    };
  }, [board, productCategoryCodes, productCategoryLabels]);

  useEffect(() => {
    void loadRecords();
  }, [recordsBoardFilter]);

  const handleClassChange = (value: string) => {
    setClassNumber(value);
    setSubject("");
    setTopic("");
    setSubTopic("");
  };

  const handleBoardChange = (value: string) => {
    setBoard(value);
    setProductCategory("");
    setClassNumber("");
    setSubject("");
    setTopic("");
    setSubTopic("");
  };

  const handleCategoryChange = (value: string) => {
    setProductCategory(value === "__general__" ? "" : value);
    setClassNumber("");
    setSubject("");
    setTopic("");
    setSubTopic("");
  };

  const handleSubjectChange = (value: string) => {
    setSubject(value);
    setTopic("");
    setSubTopic("");
  };

  const handleTopicChange = (value: string) => {
    setTopic(value);
    setSubTopic("");
  };

  const handleToolSelect = (toolId: ToolId) => {
    setSelectedTool(toolId);
    if (isStoryLanguageTool(toolId) && subject && !isStoryPassageLanguageSubject(subject)) {
      setSubject("");
      setTopic("");
      setSubTopic("");
    }
    if (isLanguageExcludedTool(toolId) && subject && isStoryPassageLanguageSubject(subject)) {
      setSubject("");
      setTopic("");
      setSubTopic("");
    }
  };

  useEffect(() => {
    if (!isStoryLanguageTool(selectedTool)) return;
    if (!subject || isStoryPassageLanguageSubject(subject)) return;
    setSubject("");
    setTopic("");
    setSubTopic("");
  }, [selectedTool, subject]);

  // Reset combined-paper extra subtopics whenever the tool, topic, or primary
  // subtopic changes (also covers the subtopics list reloading on topic change).
  useEffect(() => {
    setExtraSubTopics([]);
  }, [selectedTool, topic, subTopic]);

  useEffect(() => {
    if (!isLanguageExcludedTool(selectedTool)) return;
    if (!subject || !isStoryPassageLanguageSubject(subject)) return;
    setSubject("");
    setTopic("");
    setSubTopic("");
  }, [selectedTool, subject]);

  const parseBatchSize = () => parseGenerationRecordCount(generationRecordCount)!;

  const buildGenerationPayload = (forceUnlock = false) => {
    const multiList =
      MULTI_SUBTOPIC_TOOLS.has(selectedTool) && extraSubTopics.length > 0
        ? [subTopic, ...extraSubTopics.filter((s) => s && s !== subTopic)]
        : [];
    const expand = expandEachSubtopic && multiList.length > 1;
    return {
      toolSlug: selectedTool,
      toolName: currentTool?.name || selectedTool,
      board,
      productCategory,
      className: classNumber,
      subjectName: subject,
      topicName: topic,
      subtopicName: subTopic,
      ...(multiList.length > 1 ? { subTopics: multiList } : {}),
      ...(expand
        ? { expandSubtopics: true, includeWholeChapter: true, combineSubtopics: false }
        : multiList.length > 1
          ? { combineSubtopics: true }
          : {}),
      batchSize: parseBatchSize(),
      qualityTier,
      forceGenerate: forceGenerateNew,
      forceGenerateNew: forceGenerateNew,
      extraParams: buildExtraParams(),
      ...(forceUnlock ? { forceUnlock: true } : {}),
    };
  };

  const releaseLockAndRetry = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/ai-generator/release-lock`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
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
      await generate({ forceUnlock: true });
    } catch (e: unknown) {
      toast({
        title: "Could not clear lock",
        description: e instanceof Error ? e.message : "Failed to clear lock",
        variant: "destructive",
      });
    }
  };

  const generate = async (opts?: { forceUnlock?: boolean }) => {
    if (generateInFlightRef.current && !opts?.forceUnlock) {
      return;
    }
    if (!selectedTool || !board || !classNumber || !subject || !subTopic) {
      toast({
        title: "Missing fields",
        description: "Tool, board, class, subject and sub topic are required.",
        variant: "destructive",
      });
      return;
    }
    if (
      !topic &&
      ![
        "lesson-planner",
        "study-schedule-maker",
        "activity-project-generator",
        "project-idea-lab",
        "reading-practice-room",
        "story-passage-creator",
      ].includes(selectedTool)
    ) {
      toast({ title: "Missing topic", description: "Topic is required for this tool.", variant: "destructive" });
      return;
    }
    if (isStoryLanguageTool(selectedTool) && !isStoryPassageLanguageSubject(subject)) {
      toast({
        title: "English, Hindi, or Telugu only",
        description: "This tool works only with English, Hindi, or Telugu subjects.",
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
        description: `Enter a whole number from ${GENERATION_RECORD_COUNT_MIN} to ${MAX_GENERATION_BATCH_SIZE} only.`,
        variant: "destructive",
      });
      return;
    }
    const batchSize = parseBatchSize();
    const selectedSubtopics = [subTopic, ...extraSubTopics.filter((s) => s && s !== subTopic)];
    const expandedTargets = expandEachSubtopic && selectedSubtopics.length > 1
      ? [...selectedSubtopics, "Whole chapter"]
      : [];
    const plannedTotal = expandedTargets.length > 0 ? batchSize * expandedTargets.length : batchSize;
    generateInFlightRef.current = true;
    setIsGenerating(true);
    setGenerationLocked(false);
    setGenerationProgress({
      current: 0,
      total: plannedTotal,
      phase: `Preparing ${plannedTotal} records…`,
      currentSubtopic: expandedTargets[0],
      subtopicIndex: expandedTargets.length ? 1 : undefined,
      subtopicTotal: expandedTargets.length || undefined,
    });
    if (!opts?.forceUnlock) setLastBatchSummary(null);

    try {
      // Run expanded subtopics one at a time so the UI can show an accurate live
      // subtopic name and cumulative record count instead of one opaque long request.
      if (expandedTargets.length > 0) {
        let completedRecords = 0;
        let failedRecords = 0;
        const allFailures: string[] = [];
        let aggregateTokens = emptyTokenTotals();
        const aggregateCalls: TokenCall[] = [];
        let exchangeRateInr = 95.11;
        for (let index = 0; index < expandedTargets.length; index += 1) {
          const target = expandedTargets[index];
          setGenerationProgress({
            current: completedRecords,
            total: plannedTotal,
            currentSubtopic: target,
            subtopicIndex: index + 1,
            subtopicTotal: expandedTargets.length,
            phase: `Generating ${target}`,
          });
          const payload = buildGenerationPayload(opts?.forceUnlock);
          const targetPayload = {
            ...payload,
            subtopicName: target,
            subTopics: target === "Whole chapter" ? selectedSubtopics : undefined,
            expandSubtopics: false,
            includeWholeChapter: false,
            combineSubtopics: false,
            chapterScope: target === "Whole chapter",
          };
          const targetRes = await resilientFetch(`${API_BASE_URL}/api/ai-generator/generate-batch`, {
            method: "POST",
            headers: { ...authHeaders(), "Content-Type": "application/json" },
            body: JSON.stringify(targetPayload),
            retries: 2,
            retryDelayMs: 2500,
            timeoutMs: 0,
          });
          const targetJson = await targetRes.json();
          const saved = Number(targetJson?.data?.savedCount) || 0;
          const failed = Number(targetJson?.data?.failedCount) || Math.max(0, batchSize - saved);
          if (!targetRes.ok && saved === 0) throw new Error(targetJson?.message || `Generation failed for ${target}`);
          completedRecords += saved;
          failedRecords += failed;
          allFailures.push(...(Array.isArray(targetJson?.data?.failures) ? targetJson.data.failures.map((f: string) => `${target}: ${f}`) : []));
          const usage = targetJson?.data?.tokenUsage;
          if (usage?.totals) aggregateTokens = mergeTokenTotals(aggregateTokens, usage.totals);
          if (Array.isArray(usage?.calls)) aggregateCalls.push(...usage.calls);
          exchangeRateInr = Number(targetJson?.data?.cost?.exchangeRateInr) || exchangeRateInr;
          setGenerationProgress({
            current: completedRecords,
            total: plannedTotal,
            currentSubtopic: target,
            subtopicIndex: index + 1,
            subtopicTotal: expandedTargets.length,
            phase: index + 1 === expandedTargets.length ? "Complete" : `Saved ${saved}/${batchSize} for ${target}`,
          });
        }
        const cost = computeGeminiCostFromTokenUsage({ totals: aggregateTokens, calls: aggregateCalls }, exchangeRateInr);
        setLastBatchSummary({ successCount: completedRecords, failedCount: failedRecords, batchSize: plannedTotal,
          mode: "expanded_subtopics", failures: allFailures, tokenUsage: aggregateTokens, cost,
          perRecordCost: perRecordShareFromCost(cost, completedRecords || 1), boardUsed: board });
        if (board && recordsBoardFilter !== "__all__" && recordsBoardFilter !== board) {
          setRecordsBoardFilter(board); await loadRecords(board);
        } else await loadRecords();
        toast({ title: `${completedRecords}/${plannedTotal} records saved`, description: `${expandedTargets.length} subtopic batches completed.`, variant: failedRecords > 0 ? "destructive" : "default" });
        return;
      }
      // Long batches can run 2–5+ minutes; retry only brief gateway/DB blips (not mid-batch aborts).
      const res = await resilientFetch(`${API_BASE_URL}/api/ai-generator/generate-batch`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(buildGenerationPayload(opts?.forceUnlock)),
        retries: 2,
        retryDelayMs: 2500,
        timeoutMs: 0,
      });
      const json = await res.json();
      const savedCount = Number(json?.data?.savedCount) || 0;
      const failedCount = Number(json?.data?.failedCount) || 0;
      const resultBatchSize = Number(json?.data?.batchSize) || batchSize;
      const failures: string[] = Array.isArray(json?.data?.failures) ? json.data.failures : [];

      if (!res.ok && savedCount === 0) {
        if (res.status === 409 || json?.data?.locked) {
          setGenerationLocked(true);
          throw new Error(
            json?.message ||
              "Generation already in progress for this topic. Tap “Clear lock & retry” below if a previous batch was interrupted.",
          );
        }
        throw new Error(json?.message || "Batch generation failed");
      }
      const mode = String(json?.data?.mode || "");
      const saturation = json?.data?.saturation;
      const geminiAvoided = Number(json?.data?.geminiGenerationsAvoided) || 0;
      const usage = json?.data?.tokenUsage;
      const tokenUsage =
        usage?.totals && typeof usage.totals === "object"
          ? { ...emptyTokenTotals(), ...usage.totals }
          : emptyTokenTotals();
      const tokenCalls: TokenCall[] = Array.isArray(usage?.calls) ? usage.calls : [];
      const exchangeRateInr = Number(json?.data?.cost?.exchangeRateInr) || 95.11;
      let cost: GeminiCostEstimate;
      const apiCost =
        json?.data?.cost && typeof json.data.cost === "object"
          ? (json.data.cost as GeminiCostEstimate)
          : null;
      if (apiCost && Number(apiCost.inr) >= 0) {
        cost = apiCost;
      } else {
        try {
          cost = computeGeminiCostFromTokenUsage({ totals: tokenUsage, calls: tokenCalls }, exchangeRateInr);
        } catch {
          cost = computeGeminiCostFromTokenUsage({ totals: tokenUsage, calls: [] }, exchangeRateInr);
        }
      }
      const perRecord =
        Number(cost.perRecordInr) > 0
          ? { usd: Number(cost.perRecordUsd || 0), inr: Number(cost.perRecordInr) }
          : perRecordShareFromCost(cost, savedCount || 1);

      setGenerationProgress({ current: savedCount, total: resultBatchSize, phase: "Complete" });
      setLastBatchSummary({
        successCount: savedCount,
        failedCount,
        batchSize: resultBatchSize,
        mode,
        failures,
        tokenUsage,
        cost,
        perRecordCost: perRecord,
        boardUsed: board,
      });

      if (savedCount === 0) {
        throw new Error(failures[0] || `All ${resultBatchSize} generations failed`);
      }

      if (board && recordsBoardFilter !== "__all__" && recordsBoardFilter !== board) {
        setRecordsBoardFilter(board);
        await loadRecords(board);
      } else {
        await loadRecords();
      }

      const tokenNote = `${formatTokenCount(tokenUsage.totalTokens)} tokens (${formatTokenCount(tokenUsage.promptTokens)} in / ${formatTokenCount(tokenUsage.completionTokens)} out, ${tokenUsage.callCount} LLM calls). Batch cost: ${formatCostInr(cost.inr)}${savedCount > 0 ? ` · ~${formatCostInr(perRecord.inr)}/record` : ""}. Saved under board “${board}”.`;

      toast({
        title:
          mode === "random_retrieval"
            ? `Retrieved ${savedCount} records from pool (0 Gemini tokens)`
            : savedCount === resultBatchSize
              ? `${resultBatchSize} unique records saved`
              : `${savedCount}/${resultBatchSize} records saved`,
        description:
          (mode === "random_retrieval"
            ? `Topic saturation: ${saturation?.saturationLevel || "Saturated"}. Random diverse selection from ${json?.data?.existingCountBefore ?? "existing"} records. `
            : savedCount === resultBatchSize
              ? "Batch orchestrator saved all unique variants with fingerprint indexing."
              : `${failures.length} slot(s) failed after max retries. `) +
          (geminiAvoided > 0 ? `Gemini generations avoided: ${geminiAvoided}. ` : "") +
          tokenNote,
        variant: failures.length > 0 ? "destructive" : "default",
      });
    } catch (error: any) {
      toast({
        title: "Generation failed",
        description: networkErrorUserMessage(error),
        variant: "destructive",
      });
      // Batch may still finish on the server after the browser drops the connection.
      try {
        await loadRecords();
      } catch {
        /* ignore */
      }
    } finally {
      generateInFlightRef.current = false;
      setIsGenerating(false);
      setGenerationProgress(null);
    }
  };

  const openView = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/ai-generator/records/${id}`, {
        headers: { ...authHeaders() },
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.message || "Failed to fetch record");
      setActiveRecord(json.data);
    } catch (error: any) {
      toast({
        title: "Load failed",
        description: error?.message || "Could not load record.",
        variant: "destructive",
      });
    }
  };

  const openEdit = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/ai-generator/records/${id}`, {
        headers: { ...authHeaders() },
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.message || "Failed to fetch record");
      setEditRecord(json.data);
      setEditContent(String(json.data?.generatedContent || ""));
    } catch (error: any) {
      toast({
        title: "Load failed",
        description: error?.message || "Could not load record.",
        variant: "destructive",
      });
    }
  };

  const saveEdit = async () => {
    if (!editRecord) return;
    if (!editContent.trim()) {
      toast({ title: "Missing content", description: "Content cannot be empty.", variant: "destructive" });
      return;
    }
    setSavingEdit(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/ai-generator/records/${editRecord._id}`, {
        method: "PUT",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          generatedContent: editContent,
          toolName: editRecord.toolName,
          toolSlug: editRecord.toolSlug,
          className: editRecord.className,
          subjectName: editRecord.subjectName,
          topicName: editRecord.topicName,
          subtopicName: editRecord.subtopicName,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.message || "Update failed");
      toast({ title: "Updated", description: "Record updated successfully." });
      setEditRecord(null);
      await loadRecords();
    } catch (error: any) {
      toast({ title: "Update failed", description: error?.message || "Could not update.", variant: "destructive" });
    } finally {
      setSavingEdit(false);
    }
  };

  const deleteRecord = async (id: string) => {
    const ok = await confirm({
      title: "Delete this record?",
      description: "Delete this record permanently?",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    setDeletingId(id);
    try {
      const res = await fetch(`${API_BASE_URL}/api/ai-generator/records/${id}`, {
        method: "DELETE",
        headers: { ...authHeaders() },
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.message || "Delete failed");
      toast({ title: "Deleted", description: "Record deleted successfully." });
      await loadRecords();
    } catch (error: any) {
      toast({ title: "Delete failed", description: error?.message || "Could not delete.", variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  };

  const deleteAllRecords = async () => {
    setIsDeletingAll(true);
    try {
      const qs = new URLSearchParams();
      if (recordsBoardFilter && recordsBoardFilter !== "__all__") {
        qs.set("board", recordsBoardFilter);
      }
      const res = await fetch(`${API_BASE_URL}/api/ai-generator/records/all?${qs.toString()}`, {
        method: "DELETE",
        headers: { ...authHeaders() },
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.message || "Delete all failed");
      const count = Number(json?.data?.deletedCount ?? 0);
      toast({
        title: "Deleted",
        description: json?.message || `Deleted ${count} record${count === 1 ? "" : "s"}.`,
      });
      setIsDeleteAllDialogOpen(false);
      await loadRecords();
    } catch (error: any) {
      toast({
        title: "Delete all failed",
        description: error?.message || "Could not delete all records.",
        variant: "destructive",
      });
    } finally {
      setIsDeletingAll(false);
    }
  };

  const subtopicSectionKey = (
    toolSlug: string,
    className: string,
    boardName: string,
    subjectName: string,
    topicName: string,
    subtopicName: string,
  ) => `subtopic:${toolSlug}:${className}:${boardName}:${subjectName}:${topicName}:${subtopicName}`;

  const deleteAllSubtopicRecords = async (
    records: GeneratorRecord[],
    subtopicLabel: string,
    sectionKey: string,
  ) => {
    const ids = records.map((r) => r._id).filter(Boolean);
    if (ids.length === 0) return;
    const ok = await confirm({
      title: "Delete all subtopic records?",
      description: `Delete all ${ids.length} record${ids.length !== 1 ? "s" : ""} in subtopic “${subtopicLabel}”? This cannot be undone.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    setDeletingSubtopicKey(sectionKey);
    try {
      const res = await fetch(`${API_BASE_URL}/api/ai-generator/records/bulk-delete`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        throw new Error(json?.message || "Bulk delete failed");
      }
      const deleted = Number(json?.data?.deletedCount ?? ids.length);
      const failed = Number(json?.data?.failedCount ?? 0);
      toast({
        title: "Deleted",
        description:
          failed > 0
            ? `Removed ${deleted} record(s); ${failed} could not be deleted.`
            : `Removed ${deleted} record(s) from this subtopic.`,
      });
      if (activeRecord && ids.includes(activeRecord._id)) {
        setActiveRecord(null);
      }
      await loadRecords();
    } catch (error: any) {
      toast({
        title: "Delete failed",
        description: error?.message || "Could not delete subtopic records.",
        variant: "destructive",
      });
    } finally {
      setDeletingSubtopicKey(null);
    }
  };

  const openPdf = async (id: string) => {
    try {
      await openAiToolRecordPdf(id);
    } catch (error: any) {
      toast({
        title: "PDF failed",
        description: error?.message || "Could not generate PDF.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-3 sm:space-y-4 lg:space-y-6">
      {ConfirmDialog}
      <div className="flex gap-2">
        <Button
          variant={activeTab === "generate" ? "default" : "outline"}
          onClick={() => setActiveTab("generate")}
        >
          Generate
        </Button>
        <Button
          variant={activeTab === "audit" ? "default" : "outline"}
          onClick={() => setActiveTab("audit")}
        >
          Duplicate Audit & Analytics
        </Button>
      </div>

      {activeTab === "audit" ? <AiGeneratorAuditPanel /> : null}

      {activeTab === "generate" ? (
      <>
      <Card>
        <CardHeader>
          <CardTitle>Select tool</CardTitle>
          <p className="text-sm text-slate-600">
            Choose a student or teacher generator, then set curriculum scope below.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="max-w-xl space-y-1.5">
            <Label>Available tools</Label>
            <Select
              value={selectedTool || undefined}
              onValueChange={(id) => handleToolSelect(id as ToolId)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pick a tool…" />
              </SelectTrigger>
              <SelectContent className="max-h-80">
                <div className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Student
                </div>
                {studentTools.map((tool) => (
                  <SelectItem key={tool.id} value={tool.id}>
                    {tool.name}
                  </SelectItem>
                ))}
                <div className="mt-1 px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Teacher
                </div>
                {teacherTools.map((tool) => (
                  <SelectItem key={tool.id} value={tool.id}>
                    {TEACHER_TOOL_LABELS[tool.id] || tool.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {currentTool ? (
            <p className="text-sm text-slate-600 rounded-lg border border-orange-100 bg-orange-50/60 px-3 py-2">
              <span className="font-medium text-slate-900">{currentTool.name}</span>
              {" — "}
              {currentTool.description}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Generate Content</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-4">
            <Label className="text-xs">Selected Tool</Label>
            <div className="mt-1">{currentTool ? <Badge>{currentTool.name}</Badge> : <Badge variant="secondary">No tool selected</Badge>}</div>
            {isStoryLanguageTool(selectedTool) ? (
              <p className="mt-2 text-xs text-blue-800 bg-blue-50 border border-blue-200 rounded-md px-2 py-1.5">
                English, Hindi, and Telugu subjects only for Story &amp; Passage Creator.
              </p>
            ) : null}
            {isLanguageExcludedTool(selectedTool) ? (
              <p className="mt-2 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
                Not available for English, Hindi, or Telugu subjects.
              </p>
            ) : null}
          </div>
          <div className="min-w-0 space-y-1">
            <Label className="text-xs">Board</Label>
            <Select value={board} onValueChange={handleBoardChange}>
              <SelectTrigger className="h-10 overflow-hidden">
                <SelectValue placeholder="Select board" />
              </SelectTrigger>
              <SelectContent>
                {boardOptions.map((b) => (
                  <SelectItem key={b} value={b}>
                    {displayBoardShort(b) || b}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {isIitStyleBoard(board) ? (
            <div className="space-y-1">
              <Label className="text-xs">IIT track</Label>
              <Select
                value={productCategory || "__general__"}
                onValueChange={handleCategoryChange}
                disabled={!board}
              >
                <SelectTrigger>
                  <SelectValue placeholder={!board ? "Board first" : "General"} />
                </SelectTrigger>
                <SelectContent>
                  {categoryOptions.map((c) => (
                    <SelectItem key={c.code || "__general__"} value={c.code || "__general__"}>
                      {c.label || "General"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Alpha–Delta must match school track.
              </p>
            </div>
          ) : null}
          <div className="space-y-1">
            <Label className="text-xs">Class</Label>
            <Select value={classNumber} onValueChange={handleClassChange} disabled={!board || loadingClasses}>
              <SelectTrigger><SelectValue placeholder={!board ? "Select board first" : (loadingClasses ? "Loading classes..." : "Select class")} /></SelectTrigger>
              <SelectContent>{classOptions.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Subject</Label>
            <Select value={subject} onValueChange={handleSubjectChange} disabled={!classNumber || loadingSubjects}>
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    !classNumber
                      ? "Select class first"
                      : loadingSubjects
                        ? "Loading subjects..."
                        : isStoryLanguageTool(selectedTool) && subjectsForTool.length === 0
                          ? "English, Hindi, or Telugu only"
                          : isLanguageExcludedTool(selectedTool) && subjectsForTool.length === 0
                            ? "Not available for English, Hindi, or Telugu"
                            : "Select subject"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {subjectsForTool.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0 space-y-1">
            <Label>Topic</Label>
            <Select value={topic} onValueChange={handleTopicChange} disabled={!classNumber || !subject || loadingTopics}>
              <SelectTrigger>
                <SelectValue placeholder={!subject ? "Select class & subject first" : (loadingTopics ? "Loading topics..." : "Select topic")} />
              </SelectTrigger>
              <SelectContent>
                {topics.length === 0 ? (
                  <div className="px-2 py-3 text-center text-xs text-slate-500">
                    No topics found for this board / class / subject
                  </div>
                ) : (
                  topics.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {!loadingTopics && subject && topics.length === 0 ? (
              <p className="mt-1 text-xs text-amber-700">
                No chapters available yet. Add topics under <strong>AI Tool Topics</strong>, or ensure
                NCERT content files exist for this class/subject.
              </p>
            ) : null}
          </div>
          <div className="min-w-0 space-y-1 sm:col-span-2 lg:col-span-4">
            <Label>Sub Topic</Label>
            <Select value={subTopic} onValueChange={setSubTopic} disabled={!topic || loadingSubtopics}>
              <SelectTrigger>
                <SelectValue placeholder={!topic ? "Select topic first" : (loadingSubtopics ? "Loading sub topics..." : "Select sub topic")} />
              </SelectTrigger>
              <SelectContent>{subtopics.map((st) => <SelectItem key={st} value={st}>{st}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {MULTI_SUBTOPIC_TOOLS.has(selectedTool) && subTopic && subtopics.length > 1 && (
            <div className="col-span-full">
              <Label className="text-xs text-slate-500">
                Combined paper — add more subtopics ({extraSubTopics.length + 1} selected)
              </Label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {subtopics.filter((st) => st !== subTopic).map((st) => {
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
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                        on
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      {on ? "✓ " : "+ "}
                      {st}
                    </button>
                  );
                })}
              </div>
              {extraSubTopics.length > 0 && (
                <>
                  <p className="mt-1 text-mini text-slate-400">
                    {expandEachSubtopic
                      ? `Will generate separately for ${extraSubTopics.length + 1} subtopics + Whole chapter.`
                      : `One combined paper covering ${extraSubTopics.length + 1} subtopics (saved under Whole chapter).`}
                  </p>
                  <label className="mt-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-950 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={expandEachSubtopic}
                      onChange={(e) => setExpandEachSubtopic(e.target.checked)}
                    />
                    <span>
                      Generate <strong>separately per subtopic</strong> (+ Whole chapter) instead of one
                      combined Whole chapter paper.
                    </span>
                  </label>
                </>
              )}
            </div>
          )}

          {selectedTool === "worksheet-mcq-generator" ? (
            <div>
              <Label>Question Type</Label>
              <Select value={questionType} onValueChange={setQuestionType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Single Option", "Multiple Option", "Integer Type", "All Types"].map((q) => <SelectItem key={q} value={q}>{q}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {QUESTION_COUNT_TOOLS.has(selectedTool as ToolId) ? (
            <div>
              <Label>Number of questions</Label>
              <Input
                type="number"
                min={QUESTION_COUNT_MIN}
                max={QUESTION_COUNT_MAX}
                placeholder={`e.g. 10 (${QUESTION_COUNT_MIN}–${QUESTION_COUNT_MAX})`}
                value={questionCount}
                onChange={(e) => {
                  const next = sanitizeQuestionCountInput(e.target.value);
                  if (next !== null) setQuestionCount(next);
                }}
              />
              <p className="mt-1 text-xs text-slate-500">
                Each generated paper will contain exactly this many questions.
              </p>
            </div>
          ) : null}

          {selectedTool === "smart-qa-practice-generator" ? (
            <div>
              <Label>Difficulty</Label>
              <Select value={difficulty} onValueChange={setDifficulty}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["easy", "medium", "hard"].map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          ) : null}

          {(selectedTool === "homework-creator" ||
            selectedTool === "mock-test-builder" ||
            selectedTool === "quick-assignment-builder") && (
            <div>
              <Label>Duration (minutes)</Label>
              <Input value={duration} onChange={(e) => setDuration(e.target.value)} />
            </div>
          )}

          <div className="lg:col-span-3 space-y-3">
            <div className="max-w-xs">
              <Label>Records to generate</Label>
              <Input
                type="number"
                min={GENERATION_RECORD_COUNT_MIN}
                max={MAX_GENERATION_BATCH_SIZE}
                placeholder={`${GENERATION_RECORD_COUNT_MIN}–${MAX_GENERATION_BATCH_SIZE}`}
                value={generationRecordCount}
                onChange={(e) => {
                  const next = sanitizeGenerationRecordCountInput(e.target.value);
                  if (next !== null) setGenerationRecordCount(next);
                }}
                disabled={isGenerating}
              />
              <p className="mt-1 text-xs text-slate-500">
                Only {GENERATION_RECORD_COUNT_MIN}–{MAX_GENERATION_BATCH_SIZE} allowed. Other values are not accepted.
              </p>
              {expandEachSubtopic && extraSubTopics.length > 0 && isValidGenerationRecordCount(generationRecordCount) ? (
                <p className="mt-2 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-2 text-xs font-semibold text-blue-900">
                  Planned total: {parseBatchSize() * (extraSubTopics.length + 2)} records
                  <span className="block font-normal text-blue-700">
                    {parseBatchSize()} records × {extraSubTopics.length + 1} subtopics + Whole chapter
                  </span>
                </p>
              ) : null}
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <Checkbox
                checked={forceGenerateNew}
                onCheckedChange={(v) => setForceGenerateNew(v === true)}
              />
              Force Generate New Content (even when topic has 1000+ records)
            </label>
            <div className="space-y-1.5">
              <Label htmlFor="ai-quality-tier" className="text-sm">
                Generation quality
              </Label>
              <Select
                value={qualityTier}
                onValueChange={(v) => setQualityTier(v as GenerationQualityTierId)}
                disabled={isGenerating}
              >
                <SelectTrigger id="ai-quality-tier" className="max-w-xs bg-white">
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
              <p className="text-xs text-slate-500">
                {GENERATION_QUALITY_TIERS.find((t) => t.id === qualityTier)?.description}
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:flex-wrap">
              <p className="text-xs text-slate-500 w-full sm:flex-1 sm:min-w-0">
                Smart strategy: 0–100 generate · 101–500 strong uniqueness · 501–1000 strict · 1000+ random pool (₹0, unless forced).
                Ultra economy: Flash-Lite only, 1 LLM call per record — lower cost for smaller batches.
              </p>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:shrink-0">
                <Button
                  onClick={() => void generate()}
                  disabled={isGenerating || !selectedTool || !isValidGenerationRecordCount(generationRecordCount)}
                  className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Generating…
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" />
                      {generationRecordCountButtonLabel(generationRecordCount)}
                    </>
                  )}
                </Button>
                {generationLocked ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full border-amber-300 text-amber-800 hover:bg-amber-50 sm:w-auto"
                    disabled={isGenerating}
                    onClick={() => void releaseLockAndRetry()}
                  >
                    Clear lock & retry
                  </Button>
                ) : null}
              </div>
              {generationLocked ? (
                <p className="w-full rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  A previous batch may still be locked for this topic. Tap <strong>Clear lock &amp; retry</strong>{" "}
                  if nothing is generating, then run again.
                </p>
              ) : null}
              {isGenerating && generationProgress ? (
                <div className="w-full space-y-1.5 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs leading-relaxed text-blue-900">
                  {generationProgress.currentSubtopic ? <p className="font-semibold break-words">Subtopic {generationProgress.subtopicIndex}/{generationProgress.subtopicTotal}: {generationProgress.currentSubtopic}</p> : null}
                  <div className="flex flex-wrap justify-between gap-2"><span>{generationProgress.current}/{generationProgress.total} records completed</span><span>{Math.max(0, generationProgress.total-generationProgress.current)} remaining</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-blue-100"><div className="h-full rounded-full bg-blue-600 transition-all" style={{width:`${Math.min(100,Math.round((generationProgress.current/generationProgress.total)*100))}%`}} /></div>
                  <p className="text-blue-700">{generationProgress.phase}</p>
                </div>
              ) : null}
            </div>
            {lastBatchSummary ? (
              <div
                className={`rounded-lg border px-3 py-2.5 text-xs text-slate-700 space-y-2 ${
                  lastBatchSummary.mode === "random_retrieval"
                    ? "border-amber-200 bg-amber-50/80"
                    : "border-emerald-200 bg-emerald-50/80"
                }`}
              >
                <p
                  className={`font-semibold ${
                    lastBatchSummary.mode === "random_retrieval" ? "text-amber-900" : "text-emerald-900"
                  }`}
                >
                  {lastBatchSummary.mode === "random_retrieval" ? (
                    <>
                      Last batch: {lastBatchSummary.successCount}/{lastBatchSummary.batchSize} retrieved from existing
                      pool (not newly generated)
                    </>
                  ) : (
                    <>
                      Last batch: {lastBatchSummary.successCount}/{lastBatchSummary.batchSize} generated & saved
                      {lastBatchSummary.failedCount > 0 ? ` (${lastBatchSummary.failedCount} failed)` : ""}
                    </>
                  )}
                </p>
                {lastBatchSummary.mode === "random_retrieval" ? (
                  <p className="text-amber-800">
                    No Gemini call was made (0 tokens). Old records were reused. For fresh Hindi content, check{" "}
                    <strong>Force Generate New Content</strong> or use Story/Reading tools (always generate fresh).
                  </p>
                ) : null}
                {lastBatchSummary.failures && lastBatchSummary.failures.length > 0 ? (
                  <div className="rounded-md border border-red-200 bg-red-50/80 px-2.5 py-2 text-red-900">
                    <p className="font-semibold">Failed variants</p>
                    <ul className="mt-1 list-disc pl-4 space-y-0.5">
                      {lastBatchSummary.failures.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <p>
                  Tokens:{" "}
                  <span className="font-medium">{formatTokenCount(lastBatchSummary.tokenUsage.totalTokens)}</span> total
                  {" "}({formatTokenCount(lastBatchSummary.tokenUsage.promptTokens)} prompt +{" "}
                  {formatTokenCount(lastBatchSummary.tokenUsage.completionTokens)} completion,{" "}
                  {lastBatchSummary.tokenUsage.callCount} LLM calls)
                </p>
                <p>
                  Batch cost:{" "}
                  <span className="font-semibold text-emerald-900">{formatCostInr(lastBatchSummary.cost.inr)}</span>
                  {" "}(~${lastBatchSummary.cost.usd.toFixed(4)} USD at ₹{lastBatchSummary.cost.exchangeRateInr}/$)
                  {lastBatchSummary.successCount > 0 && lastBatchSummary.perRecordCost ? (
                    <>
                      {" · "}
                      <span className="font-medium text-emerald-800">
                        ~{formatCostInr(lastBatchSummary.perRecordCost.inr)}/record
                      </span>
                    </>
                  ) : null}
                </p>
                <p className="text-mini text-slate-500">
                  Model: {lastBatchSummary.cost.model}
                  {lastBatchSummary.boardUsed ? ` · Board: ${lastBatchSummary.boardUsed}` : ""}
                  {lastBatchSummary.cost.pricingNote ? ` · ${lastBatchSummary.cost.pricingNote}` : ""}
                </p>
                {lastBatchSummary.cost.model.includes("mixed") ? (
                  <p className="text-mini text-slate-500">
                    Pricing model: {lastBatchSummary.cost.model}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <CardTitle className="mb-0">
              Records
              {recordsTotal > 0 ? (
                <span className="text-base font-normal text-slate-500 ml-1">
                  ({recordsTotal.toLocaleString()})
                </span>
              ) : null}
              {recordsTruncated && recordsLoadedCount > 0 ? (
                <span className="text-sm font-normal text-amber-700 ml-2">
                  — showing {recordsLoadedCount.toLocaleString()} newest
                </span>
              ) : null}
            </CardTitle>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex flex-col gap-1.5 sm:w-64">
                <Label className="text-xs text-slate-600">Filter by board</Label>
                <Select value={recordsBoardFilter} onValueChange={setRecordsBoardFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Board" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All boards</SelectItem>
                    {boardOptions.map((b) => (
                      <SelectItem key={b} value={b}>
                        {b}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <AlertDialog open={isDeleteAllDialogOpen} onOpenChange={setIsDeleteAllDialogOpen}>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="shrink-0"
                    disabled={recordsLoading || recordsTotal === 0 || isDeletingAll}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                    {isDeletingAll ? "Deleting..." : "Delete All"}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete all records?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete{" "}
                      <span className="font-medium text-slate-900">{recordsTotal}</span> AI Generator record
                      {recordsTotal === 1 ? "" : "s"}
                      {recordsBoardFilter === "__all__"
                        ? " across all boards."
                        : ` for board “${recordsBoardFilter}”.`}
                      {" "}This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-red-600 hover:bg-red-700"
                      disabled={isDeletingAll}
                      onClick={(e) => {
                        e.preventDefault();
                        void deleteAllRecords();
                      }}
                    >
                      {isDeletingAll ? "Deleting..." : "Delete All"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
          <p className="text-xs text-slate-500">
            Showing records for:{" "}
            <span className="font-medium text-slate-700">
              {recordsBoardFilter === "__all__" ? "All boards" : recordsBoardFilter}
            </span>
          </p>
        </CardHeader>
        <CardContent className="min-w-0 overflow-x-hidden px-3 sm:px-6">
          {recordsLoading ? (
            <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-600">
              <Loader2 className="h-3 w-3 sm:h-4 sm:w-4 animate-spin" />
              Loading records...
            </div>
          ) : recordsTree.length === 0 ? (
            <p className="text-xs sm:text-sm text-slate-600">
              No records found
              {recordsBoardFilter !== "__all__" ? (
                <>
                  {" "}
                  for board “{recordsBoardFilter}”. Try{" "}
                  <button
                    type="button"
                    className="font-medium text-violet-700 underline underline-offset-2"
                    onClick={() => setRecordsBoardFilter("__all__")}
                  >
                    All boards
                  </button>{" "}
                  if you generated under IIT/NEET or another board.
                </>
              ) : (
                "."
              )}
            </p>
          ) : (
            <Accordion type="multiple" className="w-full min-w-0">
              {recordsTree.map((toolNode) => (
                <AccordionItem key={toolNode.toolSlug} value={`tool-${toolNode.toolSlug}`} className="border rounded-xl px-0 sm:px-2 mb-3 min-w-0 overflow-hidden">
                  <AccordionTrigger className="hover:no-underline px-3 py-3 min-h-0">
                    <div className="text-left min-w-0">
                      <p className="font-semibold break-words">{toolNode.toolName}</p>
                      <p className="text-xs text-slate-500 break-all">{toolNode.toolSlug}</p>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-1 sm:px-3 pb-2 pt-2">
                    <p className="text-xs text-slate-500 mb-3">Classes in this tool</p>
                    <Accordion type="multiple" className="w-full min-w-0 space-y-2">
                      {toolNode.classes.map((classNode) => (
                        <AccordionItem key={`${toolNode.toolSlug}-${classNode.className}-${classNode.boardName || ''}`} value={`class-${toolNode.toolSlug}-${classNode.className}-${classNode.boardName || ''}`} className="border rounded-lg px-0 mb-0 min-w-0 overflow-hidden">
                          <AccordionTrigger className="hover:no-underline px-3 py-2.5 min-h-0 gap-2">
                            <div className="text-left min-w-0">
                              <p className="text-xs text-slate-500">CLASS</p>
                              <p className="font-medium break-words">
                                {classNode.className}
                                {classNode.boardName ? ` (${classNode.boardName})` : ""}
                              </p>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="px-1 sm:px-2 pb-2 pt-2">
                            <Accordion type="multiple" className="w-full min-w-0 space-y-2">
                              {classNode.subjects.map((subjectNode) => (
                                <AccordionItem key={`${classNode.className}-${subjectNode.subjectName}`} value={`subject-${classNode.className}-${subjectNode.subjectName}`} className="border rounded-lg px-0 mb-0 min-w-0 overflow-hidden">
                                  <AccordionTrigger className="hover:no-underline px-3 py-2.5 min-h-0 gap-2">
                                    <div className="text-left min-w-0">
                                      <p className="text-xs text-slate-500">SUBJECT</p>
                                      <p className="font-medium break-words">{subjectNode.subjectName}</p>
                                    </div>
                                  </AccordionTrigger>
                                  <AccordionContent className="px-1 sm:px-2 pb-2 pt-2">
                                    <Accordion type="multiple" className="w-full min-w-0 space-y-2">
                                      {subjectNode.topics.map((topicNode) => (
                                        <AccordionItem key={`${subjectNode.subjectName}-${topicNode.topicName}`} value={`topic-${subjectNode.subjectName}-${topicNode.topicName}`} className="border rounded-lg px-0 mb-0 min-w-0 overflow-hidden">
                                          <AccordionTrigger className="hover:no-underline px-3 py-2.5 min-h-0 gap-2">
                                            <div className="text-left min-w-0">
                                              <p className="text-xs text-slate-500">TOPIC</p>
                                              <p className="font-medium break-words">{topicNode.topicName || "General"}</p>
                                            </div>
                                          </AccordionTrigger>
                                          <AccordionContent className="px-1 sm:px-2 pb-2 pt-2">
                                            <Accordion type="multiple" className="w-full min-w-0 space-y-2">
                                              {topicNode.subtopics.map((subtopicNode) => {
                                                const subtopicKey = subtopicSectionKey(
                                                  toolNode.toolSlug,
                                                  classNode.className,
                                                  classNode.boardName || "",
                                                  subjectNode.subjectName,
                                                  topicNode.topicName,
                                                  subtopicNode.subtopicName,
                                                );
                                                const isDeletingSubtopic = deletingSubtopicKey === subtopicKey;
                                                return (
                                                <AccordionItem key={`${topicNode.topicName}-${subtopicNode.subtopicName}`} value={`subtopic-${topicNode.topicName}-${subtopicNode.subtopicName}`} className="border rounded-lg px-0 mb-0 min-w-0 overflow-hidden">
                                                  <AccordionTrigger className="hover:no-underline px-3 py-2.5 min-h-0 gap-2">
                                                    <div className="text-left min-w-0">
                                                      <p className="text-xs text-slate-500">SUBTOPIC</p>
                                                      <p className="font-medium break-words">{formatSubtopicGroupLabel(subtopicNode.subtopicName)}</p>
                                                    </div>
                                                  </AccordionTrigger>
                                                  <AccordionContent className="px-1 sm:px-2 pb-2 pt-2">
                                                    <div className="rounded-2xl border border-slate-200/90 bg-gradient-to-br from-white via-slate-50/30 to-orange-50/20 shadow-sm overflow-hidden min-w-0">
                                                      <div className="border-b border-slate-100/80 bg-white/80 px-3 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                                        <div className="min-w-0">
                                                          <p className="text-xs text-slate-500">RECORDS</p>
                                                          <p className="text-xs sm:text-sm font-semibold text-slate-900 break-words">
                                                            {subtopicNode.records.length} generation{subtopicNode.records.length === 1 ? "" : "s"}
                                                          </p>
                                                        </div>
                                                        {subtopicNode.records.length > 0 ? (
                                                          <Button
                                                            type="button"
                                                            variant="outline"
                                                            size="sm"
                                                            className="w-full sm:w-auto h-8 gap-1.5 rounded-lg border-red-200 text-red-700 hover:bg-red-50 shrink-0"
                                                            disabled={isDeletingSubtopic || !!deletingId || isDeletingAll}
                                                            onClick={(e) => {
                                                              e.preventDefault();
                                                              e.stopPropagation();
                                                              void deleteAllSubtopicRecords(
                                                                subtopicNode.records,
                                                                subtopicNode.subtopicName,
                                                                subtopicKey,
                                                              );
                                                            }}
                                                          >
                                                            {isDeletingSubtopic ? (
                                                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                            ) : (
                                                              <Trash2 className="h-3.5 w-3.5" />
                                                            )}
                                                            Delete all ({subtopicNode.records.length})
                                                          </Button>
                                                        ) : null}
                                                      </div>
                                                      <div className="p-2 sm:p-4 min-w-0 overflow-x-hidden">
                                                      <div className="space-y-3 min-w-0">
                                                        {sortAiToolRecordsByVariantThenDate(subtopicNode.records).map((row) => (
                                                          <div key={row._id} className="group rounded-xl border border-slate-200/90 bg-white p-3 sm:p-4 shadow-sm transition-all hover:border-orange-200/80 hover:shadow-md min-w-0 overflow-hidden">
                                                            <div className="flex flex-col gap-2 mb-2 min-w-0">
                                                              <div className="flex flex-wrap items-center gap-2 min-w-0">
                                                                <p className="inline-flex items-center gap-1.5 text-xs text-slate-500 break-words">
                                                                  {row.createdAt ? new Date(row.createdAt).toLocaleString() : "-"}
                                                                </p>
                                                                {row.generationVariant ? (
                                                                  <Badge variant="outline" className="text-micro h-5 border-orange-200 text-orange-800 bg-orange-50 shrink-0">
                                                                    Variant {row.generationVariant}
                                                                  </Badge>
                                                                ) : null}
                                                                {row.variantAngle ? (
                                                                  <span className="text-micro text-slate-500 w-full sm:w-auto break-words" title={row.variantAngle}>
                                                                    {row.variantAngle}
                                                                  </span>
                                                                ) : null}
                                                                {row.metadata?.cost?.inr != null && Number(row.metadata.cost.inr) > 0 ? (
                                                                  <Badge variant="outline" className="text-micro h-5 border-emerald-200 text-emerald-800 bg-emerald-50 shrink-0">
                                                                    {formatCostInr(Number(row.metadata.cost.inr))}
                                                                  </Badge>
                                                                ) : null}
                                                                {Number(row.metadata?.tokenUsage?.totals?.totalTokens || 0) > 0 ? (
                                                                  <Badge
                                                                    variant="outline"
                                                                    className="text-micro h-5 border-sky-200 bg-sky-50 text-sky-800 shrink-0"
                                                                    title={`${formatTokenCount(Number(row.metadata?.tokenUsage?.totals?.promptTokens || 0))} input + ${formatTokenCount(Number(row.metadata?.tokenUsage?.totals?.completionTokens || 0))} output · ${Number(row.metadata?.tokenUsage?.totals?.callCount || 0)} LLM call(s)`}
                                                                  >
                                                                    {formatTokenCount(Number(row.metadata?.tokenUsage?.totals?.promptTokens || 0))} in /{' '}
                                                                    {formatTokenCount(Number(row.metadata?.tokenUsage?.totals?.completionTokens || 0))} out ·{' '}
                                                                    {Number(row.metadata?.tokenUsage?.totals?.callCount || 0)} call(s)
                                                                  </Badge>
                                                                ) : null}
                                                              </div>
                                                              <div className="flex flex-wrap items-center gap-1 -ml-1">
                                                                <Button
                                                                  variant="ghost"
                                                                  size="sm"
                                                                  className="h-8 text-xs rounded-lg text-orange-700 hover:text-orange-800 hover:bg-orange-50"
                                                                  onClick={() => openView(row._id)}
                                                                >
                                                                  <Eye className="h-3.5 w-3.5 mr-1.5" /> View full
                                                                </Button>
                                                                <Button
                                                                  variant="ghost"
                                                                  size="sm"
                                                                  className="h-8 text-xs rounded-lg text-blue-700 hover:text-blue-800 hover:bg-blue-50"
                                                                  onClick={() => openEdit(row._id)}
                                                                >
                                                                  <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
                                                                </Button>
                                                                <Button
                                                                  variant="ghost"
                                                                  size="sm"
                                                                  className="h-8 text-xs rounded-lg text-red-700 hover:text-red-800 hover:bg-red-50"
                                                                  onClick={() => deleteRecord(row._id)}
                                                                  disabled={deletingId === row._id}
                                                                >
                                                                  <Trash2 className="h-3.5 w-3.5 mr-1.5" /> {deletingId === row._id ? "Deleting..." : "Delete"}
                                                                </Button>
                                                                <Button
                                                                  variant="ghost"
                                                                  size="sm"
                                                                  className="h-8 text-xs rounded-lg text-slate-700 hover:text-slate-900 hover:bg-slate-100"
                                                                  onClick={() => openPdf(row._id)}
                                                                >
                                                                  <FileDown className="h-3.5 w-3.5 mr-1.5" /> PDF
                                                                </Button>
                                                              </div>
                                                            </div>
                                                            <AiToolRecordPreviewBody
                                                              toolSlug={toolNode.toolSlug}
                                                              record={{
                                                                toolSlug: toolNode.toolSlug,
                                                                generatedContent: String(row.generatedContent || ""),
                                                                content: String(row.generatedContent || ""),
                                                                metadata: row.metadata,
                                                                generationVariant:
                                                                  row.generationVariant ??
                                                                  recordGenerationVariant(row) ??
                                                                  undefined,
                                                                variantAngle:
                                                                  row.variantAngle || recordVariantAngle(row),
                                                              }}
                                                              recordId={row._id}
                                                            />
                                                          </div>
                                                        ))}
                                                      </div>
                                                    </div>
                                                    </div>
                                                  </AccordionContent>
                                                </AccordionItem>
                                              );
                                              })}
                                            </Accordion>
                                          </AccordionContent>
                                        </AccordionItem>
                                      ))}
                                    </Accordion>
                                  </AccordionContent>
                                </AccordionItem>
                              ))}
                            </Accordion>
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </CardContent>
      </Card>

      </>
      ) : null}

      <Dialog
        open={!!activeRecord}
        onOpenChange={() => setActiveRecord(null)}
      >
        <DialogContent
          className={cn(
            "flex max-h-[min(92vh,920px)] w-[min(96vw,1400px)]",
            "max-w-[min(96vw,1400px)] sm:max-w-[min(96vw,1400px)] lg:max-w-[min(96vw,1400px)]",
            "flex-col gap-0 overflow-hidden rounded-2xl border-slate-200 p-0 shadow-2xl",
          )}
        >
          <DialogHeader className="shrink-0 border-b border-slate-100 px-4 py-3 sm:px-6">
            <DialogTitle>Generated Record</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-slate-50/80 px-2 py-2 sm:px-4 sm:py-4">
            <GeneratorRecordViewer record={activeRecord} />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editRecord} onOpenChange={() => setEditRecord(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Edit Record</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} className="min-h-[320px]" />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditRecord(null)}>Cancel</Button>
              <Button onClick={saveEdit} disabled={savingEdit}>{savingEdit ? "Saving..." : "Save"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

