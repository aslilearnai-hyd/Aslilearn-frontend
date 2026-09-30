import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/use-confirm";
import { API_BASE_URL } from "@/lib/api-config";
import { cn } from "@/lib/utils";
import { toCurriculumSelectRows, type CurriculumSelectRow } from "@/lib/vidya-subjects";
import { getAuthToken } from '@/lib/auth-utils';
import {
  filterSubjectRowsForAiTool,
  isLanguageExcludedTool,
  isStoryPassageLanguageSubject,
  isStoryLanguageTool,
  LANGUAGE_EXCLUDED_TOOL_ERROR,
  subjectLabelFromRows,
} from "@/lib/ai-tool-subject-rules";
import { isDeprecatedAiToolIdentifier } from "@/lib/ai-tool-registry";
import { compareClassLabels, sortClassLabelsAscending } from "@/lib/super-admin-curriculum-classes";
import { compareChapterWiseLabels, sortCurriculumSelectRowsChapterWise } from "@/lib/curriculum-chapter-sort";
import { StoryPassageViewer } from "@/components/story-passage-viewer";
import { SmartStudyGuideViewer } from "@/components/smart-study-guide-viewer";
import { ConceptBreakdownViewer } from "@/components/concept-breakdown-viewer";
import { PracticeQaViewer } from "@/components/practice-qa-viewer";
import { ChapterSummaryViewer } from "@/components/chapter-summary-viewer";
import { KeyPointsViewer } from "@/components/key-points-viewer";
import { QuickAssignmentViewer } from "@/components/quick-assignment-viewer";
import { MockTestViewer } from "@/components/mock-test-viewer";
import { coerceHomeworkText as coerceHomeworkFieldText } from "@/lib/coerce-homework-text";
import {
  cleanActivityTitleForDisplay,
  extractActivityTitleFromMarkdown,
  isCurriculumBreadcrumbTitle,
  isGenericActivityNumberTitle,
  looksLikeValidActivityTitle,
} from "@/lib/activity-title-utils";
import { resolveWorksheetFromPayload } from "@/lib/parse-worksheet-mcq";
import {
  Wrench,
  School,
  BookOpen,
  BookText,
  Pin,
  FolderOpen,
  CircleCheck,
  FlaskConical,
  Target,
  ClipboardList,
  Lightbulb,
  Key,
  Clock3,
  BarChart3,
  ScrollText,
  Star,
  Layers,
  CalendarDays,
  Trash2,
  Loader2,
  Eye,
  HelpCircle,
} from "lucide-react";

/** Keep in sync with ASLI-STUD-BACK/routes/pdf-rag.js AI_PDF_MAX_FILE_BYTES */
const AI_PDF_MAX_MB = 100;
const AI_PDF_MAX_BYTES = AI_PDF_MAX_MB * 1024 * 1024;

/** Merge legacy typo CBSC with CBSE when grouping list rows (matches backend board helpers). */
function canonicalCurriculumBoardLabel(raw: string): string {
  const s = String(raw || "")
    .trim()
    .replace(/\s+/g, " ");
  if (!s || s === "-") return s || "-";
  if (s.toUpperCase() === "CBSC") return "CBSE";
  return s;
}

type PdfItem = {
  _id: string;
  board?: string;
  originalName: string;
  fileUrl: string;
  subject: string;
  classLabel: string;
  chapter: string;
  processingStatus: "pending" | "processing" | "processed" | "failed";
  approvalStatus?: "pending" | "approved" | "rejected";
  toolType?: string;
  topic?: string;
  subTopic?: string;
  contentType?: string;
  structuredContent?: any;
  renderContent?: any;
  chunkCount: number;
  uploadDate: string;
  /** Plain-text layout from DB when structured JSON is sparse (ai_pdf master rows). */
  generatedContent?: string;
  /** Resolved activity name for list cards (backend). */
  displayTitle?: string;
  recordKind?: "generation" | "pdf" | "legacy";
  pdfId?: string;
  pdfCode?: string;
  generationNumber?: number;
  generationTitle?: string;
  markerLabel?: string;
  totalGenerations?: number;
  metadata?: Record<string, unknown>;
};

type UploadStep = "idle" | "uploading" | "indexing" | "generating" | "validating" | "saving" | "done" | "error";

type TokenUsageTotals = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  callCount: number;
};

type TokenUsageSnapshot = {
  label?: string;
  totals: TokenUsageTotals;
  calls?: Array<{
    label: string;
    model?: string;
    provider?: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  }>;
};

type TokenUsageSummary = TokenUsageTotals & {
  generationCount: number;
  totalCalls: number;
};

function formatTokenCount(value: number) {
  const n = Number(value || 0);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

const STEP_MESSAGES: Record<UploadStep, string> = {
  idle: "",
  uploading: "Uploading PDF...",
  indexing: "Indexing PDF for RAG context...",
  generating: "Generating tool content with Gemini (same structure as AI Generator)...",
  validating: "Validating structured JSON...",
  saving: "Saving generated records...",
  done: "",
  error: "",
};

export default function AIContentEngine() {
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const [items, setItems] = useState<PdfItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [listLoadError, setListLoadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [subject, setSubject] = useState("");
  const [board, setBoard] = useState("CBSE");
  /** PDF records list is filtered only by board; independent of upload/curriculum form. */
  const [recordsBoardFilter, setRecordsBoardFilter] = useState("__all__");
  const [boardOptions, setBoardOptions] = useState<string[]>([]);
  const [classLabel, setClassLabel] = useState("");
  const [topic, setTopic] = useState("");
  const [subTopic, setSubTopic] = useState("");
  const [toolType, setToolType] = useState("");
  const [classOptions, setClassOptions] = useState<string[]>([]);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [pdfAnalysis, setPdfAnalysis] = useState<{
    contentFamily: string;
    confidence: number;
    questionCount: number;
    extractionOk: boolean;
    useGemini: boolean;
    suggestedToolSlug: string;
    suggestedToolLabel: string;
    recommendedTools: { tool?: string; toolLabel?: string; confidence?: number }[];
  } | null>(null);
  const [analyzingPdf, setAnalyzingPdf] = useState(false);
  const [subjectRows, setSubjectRows] = useState<CurriculumSelectRow[]>([]);
  const [topicRows, setTopicRows] = useState<CurriculumSelectRow[]>([]);
  const [subtopicRows, setSubtopicRows] = useState<CurriculumSelectRow[]>([]);
  const [loadingClasses, setLoadingClasses] = useState(false);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [loadingSubtopics, setLoadingSubtopics] = useState(false);
  const [reviewingId, setReviewingId] = useState("");
  const [deletingPdfId, setDeletingPdfId] = useState("");
  const [deletingSubtopicKey, setDeletingSubtopicKey] = useState<string | null>(null);
  const [deletingQuestionKey, setDeletingQuestionKey] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [uploadStep, setUploadStep] = useState<UploadStep>("idle");
  const [lastUploadResult, setLastUploadResult] = useState<{ totalSaved: number } | null>(null);
  const [lastTokenUsage, setLastTokenUsage] = useState<TokenUsageSnapshot | null>(null);
  const [overallTokenSummary, setOverallTokenSummary] = useState<TokenUsageSummary | null>(null);
  const [listMeta, setListMeta] = useState<{
    newGenerationCount?: number;
    legacyRecordCount?: number;
    orphanSourceCount?: number;
  } | null>(null);
  const [isLoadingMoreList, setIsLoadingMoreList] = useState(false);
  const [pdfContentViewId, setPdfContentViewId] = useState<string | null>(null);
  const [pdfContentViewDetail, setPdfContentViewDetail] = useState<PdfItem | null>(null);
  const [pdfContentViewLoading, setPdfContentViewLoading] = useState(false);

  const [mismatchDetails, setMismatchDetails] = useState<
    null | {
      selectedSubject?: string;
      detectedSubject?: string;
      selectedTopic?: string;
      detectedTopic?: string;
      selectedTool?: string;
      detectedTool?: string;
    }
  >(null);

  const toolOptions = useMemo(() => {
    const tools = [
      { value: "activity-project-generator", label: "Activity / Project Generator" },
      { value: "project-idea-lab", label: "Project Idea Lab" },
      { value: "worksheet-mcq-generator", label: "Worksheet & MCQ Generator" },
      { value: "concept-mastery-helper", label: "Concept Mastery Helper" },
      { value: "lesson-planner", label: "Lesson Planner" },
      { value: "study-schedule-maker", label: "Study Schedule Maker" },
      { value: "homework-creator", label: "Homework Creator" },
      { value: "reading-practice-room", label: "Reading Practice Room" },
      { value: "story-passage-creator", label: "Story and Passage Creator" },
      { value: "short-notes-summaries-maker", label: "Short Notes & Summaries" },
      { value: "my-study-decks", label: "My Study Decks" },
      { value: "flashcard-generator", label: "Flash Card Generator" },
      { value: "daily-class-plan-maker", label: "Daily Class Plan" },
      { value: "mock-test-builder", label: "Mock Test Builder" },
      { value: "exam-question-paper-generator", label: "Exam Question Paper Generator" },
      { value: "smart-study-guide-generator", label: "Smart Study Guide Generator" },
      { value: "concept-breakdown-explainer", label: "Concept Breakdown Explainer" },
      { value: "smart-qa-practice-generator", label: "Smart Q&A Practice Generator" },
      { value: "chapter-summary-creator", label: "Chapter Summary Creator" },
    ];
    return tools.sort((a, b) => a.label.localeCompare(b.label, "en", { sensitivity: "base" }));
  }, []);

  const fieldClassName =
    "h-11 border-slate-300 bg-slate-50 text-slate-800 placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-0";
  const labelClassName = "text-slate-700";
  const reqStar = <span className="text-red-600">*</span>;
  const getToolLabel = (toolValue?: string) =>
    toolOptions.find((tool) => tool.value === String(toolValue || "").trim())?.label || toolValue || "-";

  const sortedClassOptions = useMemo(
    () => sortClassLabelsAscending(classOptions),
    [classOptions],
  );

  const subjectRowsForTool = useMemo(
    () => filterSubjectRowsForAiTool(toolType, subjectRows),
    [toolType, subjectRows],
  );

  const parseQuestionBlob = (blob: string) => {
    const cleaned = String(blob || "")
      .replace(/\s+/g, " ")
      .replace(/Correct Answer\s*:/gi, "Answer:")
      .trim();
    if (!cleaned) return [];

    const segments = cleaned
      .split(/\s*(?:Q(?:uestion)?\s*\d+[\.\):]|(?:^|\s)\d+[\.\)])\s*/gi)
      .map((part) => part.trim())
      .filter(Boolean);

    return segments.map((segment) => {
      const answerMatch = segment.match(/Answer\s*:\s*([^]+)$/i);
      const answerRaw = answerMatch ? answerMatch[1].trim() : "";
      const withoutAnswer = answerMatch ? segment.slice(0, answerMatch.index).trim() : segment;
      const optionMatches = Array.from(
        withoutAnswer.matchAll(/([A-D])[\).]\s*([^]+?)(?=(?:\s+[A-D][\).]\s*)|$)/gi),
      );
      const options = optionMatches.map((m) => `${m[1].toUpperCase()}) ${String(m[2] || "").trim()}`).filter(Boolean);
      const questionText = optionMatches.length > 0
        ? withoutAnswer.slice(0, optionMatches[0].index).trim()
        : withoutAnswer.trim();
      return {
        question: questionText.replace(/^\W+/, "").trim(),
        options,
        answer: answerRaw,
      };
    }).filter((entry) => entry.question);
  };

  const normalizeOptions = (entry: any) => {
    if (!Array.isArray(entry?.options)) return [];
    return entry.options
      .map((opt: any, idx: number) => {
        const text = String(opt || "").trim();
        if (!text) return "";
        if (/^[A-D][\).]/i.test(text)) return text.replace(/^([A-D])\./i, "$1)");
        return `${String.fromCharCode(65 + idx)}) ${text}`;
      })
      .filter(Boolean);
  };

  const isWorksheetQuestionJunk = (text: string) => {
    const q = String(text || "").replace(/\s+/g, " ").trim();
    if (!q) return true;
    if (/worksheet\s*&\s*mcq/i.test(q)) return true;
    if (/nep[\s-]*ncf/i.test(q)) return true;
    if (/\bpage\s*\d+\b/i.test(q) && !/\?/.test(q) && !/_{2,}/.test(q)) return true;
    if ((q.match(/\|/g) || []).length >= 2) return true;
    if (/mathematics\s*-\s*chapter/i.test(q) && !/\?/.test(q)) return true;
    if (/\bsubtopic\s*$/i.test(q)) return true;
    if (/varieties!\s*(worksheet|\|)/i.test(q)) return true;
    if (/\s+section\s+[a-e]\s*:/i.test(q)) return true;
    return false;
  };

  const cleanWorksheetQuestionDisplay = (text: string) => {
    let q = String(text || "").replace(/\s+/g, " ").trim();
    q = q.replace(/^(?:q(?:uestion)?\.?\s*)?\d{1,3}[\).:\-]\s+/i, "").trim();
    q = q.replace(/\s+section\s+[a-e]\s*:\s*.+$/i, "").trim();
    q = q.replace(/\s*\|\s*worksheet\s*&\s*mcq[^|?]*/gi, "").trim();
    q = q.replace(/\s*\|\s*nep[\s-]*ncf[^|?]*/gi, "").trim();
    q = q.replace(/\s*\|\s*page\s*\d+\s*$/i, "").trim();
    q = q.replace(/\s*--\s*\d+\s+of\s+\d+\s*--/gi, " ").trim();
    return q;
  };

  const toQuestionArray = (value: any) => {
    const baseRows = (Array.isArray(value) ? value : [])
      .flatMap((entry: any) => {
        const questionRaw = cleanWorksheetQuestionDisplay(
          String(entry?.question || entry?.prompt || entry?.text || "").trim(),
        );
        const answerRaw = String(entry?.answer || entry?.correctAnswer || "").trim();
        const options = normalizeOptions(entry);
        const looksMergedBlob =
          questionRaw.length > 240 ||
          /\bQ(?:uestion)?\s*\d+[\.\):]/i.test(questionRaw) ||
          (/A[\).]/i.test(questionRaw) && /B[\).]/i.test(questionRaw) && /C[\).]/i.test(questionRaw));
        if (looksMergedBlob) {
          return parseQuestionBlob(questionRaw);
        }
        return [{
          question: questionRaw,
          options,
          answer: answerRaw,
        }];
      })
      .filter((entry) => entry.question)
      .filter((entry) => !isWorksheetQuestionJunk(entry.question));

    return baseRows.filter(
      (entry, idx, arr) => arr.findIndex((q) => q.question.toLowerCase() === entry.question.toLowerCase()) === idx,
    );
  };

  const renderSectionHeader = (icon: ReactNode, title: string) => (
    <div className="flex items-center gap-2 text-slate-800 font-semibold text-xs sm:text-sm">
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 text-slate-600">
        {icon}
      </span>
      <span>{title}</span>
    </div>
  );

  const handleDeleteQuestion = async (record: PdfItem, questionIndex: number) => {
    const key = `${record._id}:${questionIndex}`;
    setDeletingQuestionKey(key);
    try {
      const currentQuestions = Array.isArray(record.structuredContent?.questions)
        ? record.structuredContent.questions
        : [];
      const nextQuestions = currentQuestions.filter((_: any, idx: number) => idx !== questionIndex);
      const nextStructured = { ...(record.structuredContent || {}), questions: nextQuestions };
      const res = await fetch(`${API_BASE_URL}/api/pdf/${record._id}`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          structuredContent: nextStructured,
          contentType: record.contentType,
          toolType: record.toolType,
          topic: record.topic || "",
          subTopic: record.subTopic || "",
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        throw new Error(json?.message || "Failed to delete question");
      }
      toast({ title: "Question deleted", description: "The question was removed from this record." });
      await fetchList();
    } catch (error: any) {
      toast({
        title: "Delete failed",
        description: error?.message || "Could not delete question",
        variant: "destructive",
      });
    } finally {
      setDeletingQuestionKey(null);
    }
  };

  const activityTitleForDisplay = (raw: string, record: PdfItem): string => {
    const bad =
      /^(?:\d+\.\s*)?(?:title\s*[—:-]\s*)?(materials required|learning objectives|step-by-step procedure|teacher instructions|expected learning outcomes|assessment criteria(?:\s*\(rubric\))?|rubric|real[-\s]?life application|title)\s*$/i;
    let t = cleanActivityTitleForDisplay(String(raw || ""));
    if (t && !looksLikeValidActivityTitle(t)) t = "";
    if (/title\s*[—:-]\s*materials required/i.test(t)) {
      t = t.replace(/\s*title\s*[—:-]\s*materials required\s*$/i, "").trim();
    }
    const dashParts = t.split(/\s*[—–]\s/).map((p) => p.trim()).filter(Boolean);
    if (dashParts.length >= 2 && bad.test(dashParts[dashParts.length - 1])) {
      t = dashParts.slice(0, -1).join(" — ");
    }
    if (!t || bad.test(t) || isGenericActivityNumberTitle(t)) {
      const fromMd = extractActivityTitleFromMarkdown(String(record.generatedContent || ""));
      if (fromMd) return fromMd;
      const meta = (record as { metadata?: { bulkItemIndex?: number; itemIndex?: number } }).metadata;
      const n =
        meta?.bulkItemIndex != null
          ? Number(meta.bulkItemIndex) + 1
          : meta?.itemIndex != null
            ? Number(meta.itemIndex) + 1
            : null;
      const isLesson =
        record.toolType === "lesson-planner" || record.toolType === "daily-class-plan-maker";
      const label = isLesson ? "Lesson" : "Activity";
      return n != null ? `${label} ${n}` : label;
    }
    return t;
  };

  /** Curiosity-style PDFs sometimes append an index after the last activity's section 9; strip for display. */
  const trimActivityRealLifeDisplayTail = (raw: string): string => {
    const s = String(raw || "").trim();
    if (!s) return s;
    const inlineCut = s.search(
      /\s(?:Included Activities\s*:|Activities\s+\d{1,3}\s*[-–]\s*\d{1,3}\s*\(|The remaining activities follow|Each activity is fully structured using)\b/i,
    );
    if (inlineCut > 0) return s.slice(0, inlineCut).trim();
    return s;
  };

  const pdfGenerationBadge = (record: PdfItem, fallbackIndex: number): string => {
    if (record.recordKind === "legacy") {
      if (record.generationNumber != null) {
        return `Record ${record.generationNumber}`;
      }
      return `Record ${fallbackIndex + 1}`;
    }
    if (record.generationNumber != null) {
      const label = String(record.markerLabel || "Generation").trim();
      return `${label} ${record.generationNumber}`;
    }
    return `Record ${fallbackIndex + 1}`;
  };

  const isPdfGenerationRecord = (record: PdfItem): boolean => record.recordKind === "generation";

  const pdfRecordPreviewLine = (record: PdfItem): string => {
    const genTitle = String(record.generationTitle || "").trim();
    if (genTitle) return genTitle;
    if (record.generationNumber != null) {
      const label = String(record.markerLabel || "Generation").trim();
      return `${label} ${record.generationNumber}`;
    }
    const rc =
      record.renderContent && typeof record.renderContent === "object"
        ? (record.renderContent as Record<string, unknown>)
        : null;
    const sc =
      record.structuredContent && typeof record.structuredContent === "object"
        ? (record.structuredContent as Record<string, unknown>)
        : null;
    const pick = (o: Record<string, unknown> | null) => {
      if (!o) return "";
      if (record.toolType === "my-study-decks" || record.toolType === "flashcard-generator") {
        const cards = Array.isArray(o.cards) ? o.cards : [];
        const first = cards[0] && typeof cards[0] === "object" ? (cards[0] as Record<string, unknown>) : null;
        return String(o.deckTitle || o.front || first?.front || o.title || "").trim();
      }
      return String(o.concept_name || o.title || o.name || o.lesson_name || "").trim();
    };
    const preset = String(record.displayTitle || "").trim();
    if (
      preset &&
      looksLikeValidActivityTitle(preset) &&
      !isCurriculumBreadcrumbTitle(preset) &&
      !isGenericActivityNumberTitle(preset)
    ) {
      return preset;
    }

    let rawTitle = pick(rc) || pick(sc);
    if (
      record.toolType === "activity-project-generator" ||
      record.toolType === "project-idea-lab"
    ) {
      if (isCurriculumBreadcrumbTitle(rawTitle) || isGenericActivityNumberTitle(rawTitle)) rawTitle = "";
      const md = String(record.generatedContent || "").trim();
      const mdTitle = extractActivityTitleFromMarkdown(md);
      if (mdTitle) rawTitle = mdTitle;
      const cleaned = activityTitleForDisplay(rawTitle, record);
      if (
        cleaned &&
        !isGenericActivityNumberTitle(cleaned) &&
        !isCurriculumBreadcrumbTitle(cleaned)
      ) {
        return cleaned;
      }
      const meta = (record as { metadata?: { bulkItemIndex?: number; itemIndex?: number } }).metadata;
      const n =
        meta?.bulkItemIndex != null
          ? Number(meta.bulkItemIndex) + 1
          : meta?.itemIndex != null
            ? Number(meta.itemIndex) + 1
            : null;
      return n != null ? `Activity ${n}` : "Activity";
    }
    const topicFallback = String(record.topic || "").trim();
    const chapterFallback = String(record.chapter || "").trim();
    return (
      (rawTitle && !isCurriculumBreadcrumbTitle(rawTitle) ? rawTitle : "") ||
      (!isCurriculumBreadcrumbTitle(topicFallback) ? topicFallback : "") ||
      String(record.subTopic || "").trim() ||
      (!isCurriculumBreadcrumbTitle(chapterFallback) ? chapterFallback : "") ||
      String(record.originalName || "").trim() ||
      "Saved PDF — use View for full structured content"
    );
  };

  const pdfRecordViewHint = (record: PdfItem): string => {
    switch (record.toolType) {
      case "my-study-decks":
        return "Open View for the 12-section study deck: objectives, flashcard set, difficulty tags, self-check, and reflection.";
      case "flashcard-generator":
        return "Open View for the 5-block Flash Card Generator: Context, Foundations, HOTS Task/Solution cards, Study Aids, and Wrap-Up.";
      case "short-notes-summaries-maker":
        return "Open View for the full 10-section short notes layout.";
      case "reading-practice-room":
        return "Open View for the 13-section Reading Practice Room: passage, recall/infer/connect questions, vocabulary practice, answer key, and reflection.";
      case "story-passage-creator":
        return "Open View for the 19-section Story and Passage Creator: topic link, passage, recall/infer/connect questions, creative response, answer key, and reflection.";
      case "worksheet-mcq-generator":
        return "Open View for practice questions, answers, and marking details.";
      case "quick-assignment-builder":
        return "Open View for the 11-section assignment: objectives, concept questions, application tasks, rubric, and outcomes.";
      case "smart-qa-practice-generator":
        return "Open View for the 11-section practice set: sections A–G and answer key with explanations.";
      case "smart-study-guide-generator":
        return "Open View for the 11-section study guide: overview, objectives, concepts, practice questions, and improvement tips.";
      case "concept-breakdown-explainer":
        return "Open View for the 9-section concept breakdown: definition, steps, Indian-context examples, and thinking prompts.";
      case "chapter-summary-creator":
        return "Open View for the 10-section chapter summary: overview, concepts, revision notes, and recall questions.";
      case "key-points-formula-extractor":
        return "Open View for the 10-section key points layout: concepts, definitions, formulae, exam points, and one-minute summary.";
      case "mock-test-builder":
        return "Open View for the 12-section mock test: title, purpose, objectives, question paper, answer key, solutions, remedial plan, outcomes, real-life application, and reflection.";
      case "exam-question-paper-generator":
        return "Open View for the 11-section exam paper: blueprint, sections A–E, answer key, marking scheme, and open-ended rubric.";
      default:
        return "Open View for the full lesson layout — objectives, materials, steps, and rubrics.";
    }
  };

  const renderEducationalContent = (item: PdfItem) => {
    const content = (item.renderContent && typeof item.renderContent === "object" ? item.renderContent : null) || {};
    const fallback = (item.structuredContent && typeof item.structuredContent === "object" ? item.structuredContent : null) || {};
    const kind =
      item.toolType === "reading-practice-room" || item.toolType === "story-passage-creator"
        ? "story"
        : item.toolType === "short-notes-summaries-maker"
          ? "shortNotes"
        : item.toolType === "key-points-formula-extractor"
          ? "keyPoints"
        : item.toolType === "quick-assignment-builder"
          ? "quickAssignment"
        : item.toolType === "chapter-summary-creator"
          ? "chapterSummary"
        : item.toolType === "smart-study-guide-generator"
          ? "studyGuide"
        : item.toolType === "concept-breakdown-explainer"
          ? "conceptBreakdown"
        : item.toolType === "smart-qa-practice-generator"
          ? "practiceQa"
          : item.toolType === "my-study-decks" || item.toolType === "flashcard-generator"
            ? "flashcards"
            : item.toolType === "mock-test-builder"
              ? "mockTest"
              : item.toolType === "exam-question-paper-generator"
                ? "examPaper"
                : String(content.kind || "").trim();

    if (item.toolType === "concept-breakdown-explainer" || kind === "conceptBreakdown") {
      return (
        <ConceptBreakdownViewer
          content={String(item.generatedContent || "").trim()}
          rawContent={{
            ...(fallback as Record<string, unknown>),
            ...(content as Record<string, unknown>),
            structuredContent: fallback,
            renderContent: content,
          }}
        />
      );
    }

        if (
      item.toolType !== "short-notes-summaries-maker" &&
      item.toolType !== "reading-practice-room" &&
      item.toolType !== "story-passage-creator" &&
      item.toolType !== "my-study-decks" &&
      item.toolType !== "flashcard-generator" &&
      item.toolType !== "chapter-summary-creator" &&
      item.toolType !== "smart-study-guide-generator" &&
      item.toolType !== "key-points-formula-extractor" &&
      item.toolType !== "concept-breakdown-explainer" &&
      (item.toolType === "concept-mastery-helper" ||
        kind === "concept" ||
        String(fallback.concept_name || "").trim())
    ) {
      const fb = fallback as Record<string, unknown>;
      const rc = content as Record<string, unknown>;
      const pickStr = (...keys: string[]) => {
        for (const k of keys) {
          const v = rc[k] ?? fb[k];
          if (v != null && String(v).trim()) return String(v).trim();
        }
        return "";
      };
      const pickArr = (...keys: string[]) => {
        for (const k of keys) {
          const v = rc[k] ?? fb[k];
          if (Array.isArray(v) && v.length) return v.map((x) => String(x ?? "").trim()).filter(Boolean);
        }
        return [];
      };
      const conceptTitle = pickStr("concept_name", "title", "name") || "Concept";
      const section = (label: string, children: ReactNode) => (
        <div className="rounded-xl border bg-white p-3 shadow-sm">
          <p className="text-xs font-semibold text-slate-500">{label}</p>
          <div className="mt-2">{children}</div>
        </div>
      );
      const bodyFromMarkdown = String(item.generatedContent || "").trim();
      const hasStructured = Boolean(
        pickStr(
          "lesson",
          "simple_definition",
          "explanation",
          "step_by_step_explanation",
          "content",
          "summary",
          "why_important",
          "real_example",
          "exam_tips",
        ) ||
          pickArr("key_points").length ||
          pickArr("common_mistakes").length ||
          pickArr("concept_check_questions").length,
      );
      return (
        <div className="space-y-3">
          {renderSectionHeader(<Lightbulb className="h-3 w-3 sm:h-4 sm:w-4" />, conceptTitle)}
          {pickStr("simple_definition")
            ? section("1. Simple Definition", <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap">{pickStr("simple_definition")}</p>)
            : null}
          {pickStr("why_important")
            ? section("2. Why This Concept Is Important", <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap">{pickStr("why_important")}</p>)
            : null}
          {pickStr("prior_knowledge_needed")
            ? section("3. Prior Knowledge Needed", <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap">{pickStr("prior_knowledge_needed")}</p>)
            : null}
          {pickStr("lesson", "explanation", "step_by_step_explanation", "content", "summary")
            ? section(
                "4. Step-by-step Explanation",
                <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                  {pickStr("lesson", "explanation", "step_by_step_explanation", "content", "summary")}
                </p>,
              )
            : null}
          {pickStr("diagram_suggestion")
            ? section("5. Diagram / Visualisation Suggestion", <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap">{pickStr("diagram_suggestion")}</p>)
            : null}
          {pickStr("real_example")
            ? section("6. Real-life Examples", <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap">{pickStr("real_example")}</p>)
            : null}
          {pickArr("common_mistakes").length
            ? section(
                "7. Common Misconceptions and Corrections",
                <ul className="text-xs sm:text-sm space-y-1">
                  {pickArr("common_mistakes").map((line, i) => (
                    <li key={`${item._id}-cm-${i}`}>- {line}</li>
                  ))}
                </ul>,
              )
            : null}
          {pickArr("concept_check_questions").length
            ? section(
                "8. Concept Check Questions",
                <ul className="text-xs sm:text-sm space-y-1">
                  {pickArr("concept_check_questions").map((line, i) => (
                    <li key={`${item._id}-cc-${i}`}>- {line}</li>
                  ))}
                </ul>,
              )
            : null}
          {pickArr("key_points").length
            ? section(
                "9. Key Points to Remember",
                <ul className="text-xs sm:text-sm space-y-1">
                  {pickArr("key_points").map((line, i) => (
                    <li key={`${item._id}-kp-${i}`}>- {line}</li>
                  ))}
                </ul>,
              )
            : null}
          {pickStr("exam_tips")
            ? section("10. Exam Tips", <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap">{pickStr("exam_tips")}</p>)
            : null}
          {pickStr("hots_question")
            ? section("11. Higher-order Thinking Question", <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap">{pickStr("hots_question")}</p>)
            : null}
          {pickStr("self_reflection_prompt")
            ? section("12. Quick Self-reflection Prompt", <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap">{pickStr("self_reflection_prompt")}</p>)
            : null}
          {!hasStructured && bodyFromMarkdown ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3">
              <p className="text-xs font-semibold text-amber-900 mb-2">Extracted content</p>
              <pre className="max-h-96 overflow-y-auto text-xs text-slate-800 whitespace-pre-wrap leading-relaxed font-sans">
                {bodyFromMarkdown}
              </pre>
            </div>
          ) : null}
          {!hasStructured && !bodyFromMarkdown ? (
            <p className="text-xs text-slate-500 italic">No concept sections extracted. Re-upload with Concept Mastery Helper selected.</p>
          ) : null}
        </div>
      );
    }

    if (
      item.toolType === "homework-creator" ||
      kind === "homework" ||
      (item.toolType === "homework-creator" &&
        (fallback.instructions ||
          fallback.application_tasks ||
          fallback.creative_thinking_question ||
          fallback.parent_note))
    ) {
      const fb = fallback as Record<string, unknown>;
      const rc = content as Record<string, unknown>;
      const pickStr = (...keys: string[]) => {
        for (const k of keys) {
          const v = rc[k] ?? fb[k];
          const text = coerceHomeworkFieldText(v);
          if (text) return text;
        }
        return "";
      };
      const listFrom = (primary: unknown, ...alts: unknown[]): string[] => {
        const pull = (v: unknown): string[] => {
          if (v == null) return [];
          if (Array.isArray(v)) {
            return v.flatMap((x) => {
              const line = coerceHomeworkFieldText(x);
              return line ? [line] : [];
            });
          }
          if (typeof v === "object") {
            const line = coerceHomeworkFieldText(v);
            return line ? [line] : [];
          }
          if (typeof v === "string" && v.trim()) {
            return v
              .split(/\n+/)
              .map((ln) => ln.replace(/^\s*[-*•]\s*|\s*\d+[\).\s]+/i, "").trim())
              .filter(Boolean);
          }
          return [];
        };
        const a = pull(primary);
        if (a.length) return a;
        for (const x of alts) {
          const b = pull(x);
          if (b.length) return b;
        }
        return [];
      };
      const practiceQuestions = toQuestionArray(
        rc.practiceQuestions || fb.practice_questions || rc.questions || fb.questions || [],
      );
      const applicationTasks = listFrom(rc.applicationTasks, fb.application_tasks);
      const hwTitle = pickStr("title", "homework_title", "name") || "Homework";
      const section = (label: string, children: ReactNode) => (
        <div className="rounded-xl border bg-white p-3 shadow-sm">
          <p className="text-xs font-semibold text-slate-500">{label}</p>
          <div className="mt-2">{children}</div>
        </div>
      );
      const fallbackBody = String(item.generatedContent || "").trim();
      const hasStructured = Boolean(
        pickStr("instructions") ||
          practiceQuestions.length ||
          applicationTasks.length ||
          pickStr("creativeThinkingQuestion", "creative_thinking_question") ||
          pickStr("realLifeObservationTask", "real_life_observation_task") ||
          pickStr("challengeQuestion", "challenge_question") ||
          pickStr("supportHint", "support_hint") ||
          pickStr("answerHints", "answer_hints") ||
          pickStr("parentNote", "parent_note"),
      );

      return (
        <div className="space-y-3">
          {renderSectionHeader(<ClipboardList className="h-3 w-3 sm:h-4 sm:w-4" />, hwTitle)}
          {pickStr("instructions", "student_instructions")
            ? section(
                "2. Clear Student Instructions",
                <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap">
                  {pickStr("instructions", "student_instructions")}
                </p>,
              )
            : null}
          {practiceQuestions.length > 0
            ? section(
                "3. Practice Questions",
                <div className="space-y-3">
                  {practiceQuestions.map((q, i) => (
                    <div key={`${item._id}-hw-q-${i}`} className="rounded-lg border border-slate-100 p-3 space-y-2">
                      <p className="text-xs sm:text-sm font-medium">Q{i + 1}. {q.question}</p>
                      {q.options.length > 0 && (
                        <ul className="text-xs sm:text-sm space-y-1 text-slate-700">
                          {q.options.map((opt: string, idx: number) => (
                            <li key={`${item._id}-hw-q-${i}-o-${idx}`}>- {opt}</li>
                          ))}
                        </ul>
                      )}
                      {q.answer ? (
                        <p className="text-xs text-emerald-700">
                          <span className="font-medium">Answer:</span> {q.answer}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>,
              )
            : null}
          {applicationTasks.length > 0
            ? section(
                "4. Application-based Tasks",
                <ul className="text-xs sm:text-sm space-y-1">
                  {applicationTasks.map((t, i) => (
                    <li key={`${item._id}-hw-app-${i}`}>- {t}</li>
                  ))}
                </ul>,
              )
            : null}
          {pickStr("creativeThinkingQuestion", "creative_thinking_question")
            ? section(
                "5. One Creative / Thinking Question",
                <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap">
                  {pickStr("creativeThinkingQuestion", "creative_thinking_question")}
                </p>,
              )
            : null}
          {pickStr("realLifeObservationTask", "real_life_observation_task")
            ? section(
                "6. One Real-life Observation Task",
                <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap">
                  {pickStr("realLifeObservationTask", "real_life_observation_task")}
                </p>,
              )
            : null}
          {pickStr("challengeQuestion", "challenge_question")
            ? section(
                "7. Challenge Question",
                <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap">
                  {pickStr("challengeQuestion", "challenge_question")}
                </p>,
              )
            : null}
          {pickStr("supportHint", "support_hint", "hints")
            ? section(
                "8. Support Hint",
                <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap">
                  {pickStr("supportHint", "support_hint", "hints")}
                </p>,
              )
            : null}
          {pickStr("answerHints", "answer_hints", "answer_key")
            ? section(
                "9. Answer Hints / Key Points",
                <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap">
                  {pickStr("answerHints", "answer_hints", "answer_key")}
                </p>,
              )
            : null}
          {pickStr("parentNote", "parent_note")
            ? section(
                "10. Parent Note",
                <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap">
                  {pickStr("parentNote", "parent_note")}
                </p>,
              )
            : null}
          {!hasStructured && fallbackBody ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3">
              <p className="text-xs font-semibold text-amber-900 mb-2">Extracted content (sections not mapped)</p>
              <pre className="max-h-72 overflow-y-auto text-xs text-slate-800 whitespace-pre-wrap leading-relaxed font-sans">
                {fallbackBody.slice(0, 120000)}
              </pre>
            </div>
          ) : null}
        </div>
      );
    }

    if (item.toolType === "smart-qa-practice-generator" || kind === "practiceQa") {
      return (
        <PracticeQaViewer
          content={String(item.generatedContent || "").trim()}
          rawContent={{
            ...(fallback as Record<string, unknown>),
            ...(content as Record<string, unknown>),
            structuredContent: fallback,
            renderContent: content,
          }}
        />
      );
    }

    if (item.toolType === "worksheet-mcq-generator" || kind === "worksheet") {
      const fb = fallback as Record<string, unknown>;
      const rc = content as Record<string, unknown>;
      const pickStr = (...keys: string[]) => {
        for (const k of keys) {
          const v = rc[k] ?? fb[k];
          if (v != null && String(v).trim()) return String(v).trim();
        }
        return "";
      };
      const listFrom = (primary: unknown, ...alts: unknown[]): string[] => {
        const pull = (v: unknown): string[] => {
          if (v == null) return [];
          if (Array.isArray(v)) return v.map((x) => String(x ?? "").trim()).filter(Boolean);
          if (typeof v === "string" && v.trim()) {
            return v
              .split(/\n+/)
              .map((ln) => ln.replace(/^\s*[-*•]\s*|\s*\d+[\).\s]+/i, "").trim())
              .filter(Boolean);
          }
          return [];
        };
        const a = pull(primary);
        if (a.length) return a;
        for (const x of alts) {
          const b = pull(x);
          if (b.length) return b;
        }
        return [];
      };
      const WORKSHEET_SECTION_ORDER = [
        "Section A: MCQs",
        "Section B: Fill in the Blanks",
        "Section C: Very Short Answer Questions",
        "Section D: Short Answer Questions",
        "Section E: Competency / Real-life Application Questions",
      ];
      const WORKSHEET_SECTION_LETTERS = ["A", "B", "C", "D", "E"];
      const mapSectionName = (name: string) => {
        const n = String(name || "").trim();
        if (/^section\s*a|mcq|multiple\s*choice/i.test(n)) return WORKSHEET_SECTION_ORDER[0];
        if (/^section\s*b|fill|blank|fib/i.test(n)) return WORKSHEET_SECTION_ORDER[1];
        if (/^section\s*c|very\s*short|vsa/i.test(n)) return WORKSHEET_SECTION_ORDER[2];
        if (/^section\s*d|short\s*answer/i.test(n) && !/very/i.test(n)) return WORKSHEET_SECTION_ORDER[3];
        if (/^section\s*[ef]|competency|real[\s-]*life|application/i.test(n)) return WORKSHEET_SECTION_ORDER[4];
        if (n === "Questions" && !n) return n;
        return WORKSHEET_SECTION_ORDER.includes(n) ? n : n;
      };
      const sectionsRaw = (rc.sections ?? fb.sections ?? []) as {
        sectionName?: string;
        title?: string;
        questions?: unknown[];
      }[];
      const sectionMap = new Map<string, ReturnType<typeof toQuestionArray>>();
      const addToSection = (name: string, qs: ReturnType<typeof toQuestionArray>) => {
        const key = mapSectionName(name);
        const prev = sectionMap.get(key) || [];
        sectionMap.set(key, [...prev, ...qs]);
      };
      if (Array.isArray(sectionsRaw)) {
        for (const sec of sectionsRaw) {
          addToSection(String(sec?.sectionName || sec?.title || "Section"), toQuestionArray(sec?.questions || []));
        }
      }
      const sectionsHaveQuestions = sectionsRaw.some(
        (sec) => Array.isArray(sec?.questions) && sec.questions.length > 0,
      );
      const flatQs = sectionsHaveQuestions ? [] : toQuestionArray(rc.questions || fb.questions || []);
      if (flatQs.length) {
        for (const q of flatQs) {
          let sec = String((q as { section?: string }).section || "").trim();
          const qt = String(q.question || "");
          const words = qt.split(/\s+/).filter(Boolean).length;
          const competencyCue =
            /(?:real[\s-]*life|application|competency|case[\s-]*based|scenario|daily\s+life|at\s+home|in\s+school|how\s+would\s+you|what\s+would\s+you\s+do|design|plan|investigate|experiment|observe|compare)\b/i.test(
              qt,
            );
          const looksPromptLike =
            /\?/.test(qt) ||
            /^(?:imagine|suppose|consider|how would you|what would you do|design|plan|investigate|observe|compare)\b/i.test(
              qt,
            );
          if (!sec || sec === "Questions") {
            if ((q as { options?: string[] }).options?.length) sec = WORKSHEET_SECTION_ORDER[0];
            else if (/_{2,}/.test(qt)) sec = WORKSHEET_SECTION_ORDER[1];
            else if (competencyCue && looksPromptLike) sec = WORKSHEET_SECTION_ORDER[4];
            else if (/\?/.test(qt) && words <= 14) sec = WORKSHEET_SECTION_ORDER[2];
            else if (/\?/.test(qt)) sec = WORKSHEET_SECTION_ORDER[3];
            else if (words >= 10) sec = WORKSHEET_SECTION_ORDER[3];
            else sec = WORKSHEET_SECTION_ORDER[2];
          }
          addToSection(mapSectionName(sec), [q]);
        }
      }
      if (!sectionMap.size && String(fb.question || "").trim()) {
        const single = toQuestionArray([fb])[0];
        const qt = String(single?.question || "");
        let sec = String(fb.section || "").trim();
        if (!sec) {
          if (/_{2,}/.test(qt)) sec = WORKSHEET_SECTION_ORDER[1];
          else sec = WORKSHEET_SECTION_ORDER[0];
        }
        addToSection(mapSectionName(sec), [single]);
      }
      const dKey = WORKSHEET_SECTION_ORDER[3];
      const eKey = WORKSHEET_SECTION_ORDER[4];
      const dQuestions = [...(sectionMap.get(dKey) || [])];
      const eQuestions = [...(sectionMap.get(eKey) || [])];
      if (eQuestions.length === 0 && dQuestions.length > 1) {
        const preferredIdx = dQuestions.findIndex((q) =>
          /(?:competency|real[\s-]*life|application|case[\s-]*based|scenario|how would you|what would you do|daily life|at home|in school)/i.test(
            String(q?.question || ""),
          ),
        );
        if (preferredIdx >= 0) {
          const [moved] = dQuestions.splice(preferredIdx, 1);
          sectionMap.set(dKey, dQuestions);
          sectionMap.set(eKey, [...eQuestions, moved]);
        }
      }
      if (dQuestions.length === 0 && eQuestions.length > 1) {
        const moveBackIdx = eQuestions.findIndex((q) =>
          !/(?:competency|real[\s-]*life|application|case[\s-]*based|scenario|daily\s+life|at\s+home|in\s+school|how would you|what would you do|design|plan|investigate|experiment|observe|compare)\b/i.test(
            String(q?.question || ""),
          ),
        );
        const idx = moveBackIdx >= 0 ? moveBackIdx : eQuestions.length - 1;
        const [movedBack] = eQuestions.splice(idx, 1);
        if (movedBack) {
          sectionMap.set(dKey, [...dQuestions, movedBack]);
          sectionMap.set(eKey, eQuestions);
        }
      }
      let sections = WORKSHEET_SECTION_ORDER.map((sectionName, idx) => ({
        sectionName,
        displayLabel: `${4 + idx}. ${sectionName}`,
        questions: sectionMap.get(sectionName) || [],
      }));
      const fallbackBodyEarly = String(item.generatedContent || "").trim();
      if (!sections.some((s) => s.questions.length > 0) && fallbackBodyEarly) {
        const repaired = resolveWorksheetFromPayload(fallbackBodyEarly, fb);
        if (repaired.worksheet?.sections.some((s) => s.questions.length > 0)) {
          sections = repaired.worksheet.sections.map((sec) => ({
            sectionName: sec.label,
            displayLabel: sec.displayLabel,
            questions: sec.questions.map((q) => ({
              question: q.question,
              options: q.options,
              answer: q.answer,
              question_number: q.questionNumber,
              marks: q.marks,
              type: q.type,
            })),
          }));
        }
      }
      const answerKeySectionsFromRender = Array.isArray(
        (rc as { answerKeySections?: unknown }).answerKeySections,
      )
        ? (
            (rc as {
              answerKeySections: {
                letter?: string;
                sectionName?: string;
                entries?: { question_number?: number; answer?: string }[];
              }[];
            }).answerKeySections
          )
        : [];
      const answerKeySectionsBuilt =
        answerKeySectionsFromRender.length > 0
          ? answerKeySectionsFromRender
          : (WORKSHEET_SECTION_ORDER.map((sectionName, idx) => {
              const qs = (sections.find((s) => s.sectionName === sectionName)?.questions || []).filter(
                (q) => String(q.answer || "").trim(),
              );
              if (!qs.length) return null;
              return {
                letter: WORKSHEET_SECTION_LETTERS[idx],
                sectionName,
                entries: qs.map((q, qIdx) => ({
                  question_number:
                    (q as { question_number?: number }).question_number ?? qIdx + 1,
                  answer: String(q.answer || "").trim(),
                })),
              };
            }).filter(Boolean) as {
              letter: string;
              sectionName: string;
              entries: { question_number?: number; answer: string }[];
            }[]);
      const wsTitle = pickStr("title", "worksheet_title", "name") || activityTitleForDisplay("Worksheet", item);
      const objectives = listFrom(rc.learningObjectives, fb.learning_objectives, fb.objectives);
      const section = (label: string, children: ReactNode) => (
        <div className="rounded-xl border bg-white p-3 shadow-sm">
          <p className="text-xs font-semibold text-slate-500">{label}</p>
          <div className="mt-2">{children}</div>
        </div>
      );
      const fallbackBody = String(item.generatedContent || "").trim();
      const hasStructured = Boolean(
        objectives.length ||
          pickStr("instructions", "student_instructions") ||
          sections.some((s) => s.questions.length) ||
          pickStr("answerKey", "answer_key") ||
          pickStr("bloomLevel", "bloom_level") ||
          pickStr("difficultyTag", "difficulty_tag", "difficulty"),
      );

      return (
        <div className="space-y-3">
          <div className="space-y-0.5">
            {renderSectionHeader(<ClipboardList className="h-3 w-3 sm:h-4 sm:w-4" />, wsTitle)}
            <p className="text-xs text-slate-500 pl-9">Worksheet &amp; MCQ — 10-section template</p>
          </div>
          {objectives.length > 0
            ? section(
                "2. Learning Objectives",
                <ul className="text-xs sm:text-sm space-y-1">
                  {objectives.map((line, i) => (
                    <li key={`${item._id}-ws-lo-${i}`}>- {line}</li>
                  ))}
                </ul>,
              )
            : null}
          {pickStr("instructions", "student_instructions")
            ? section(
                "3. Instructions to Students",
                <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap">
                  {pickStr("instructions", "student_instructions")}
                </p>,
              )
            : null}
          {sections.map((sec, sIdx) =>
            section(
              sec.displayLabel || sec.sectionName,
              sec.questions.length > 0 ? (
              <div className="space-y-3">
                {sec.questions.map((q, qIdx) => {
                  const qx = q as { question_number?: number; marks?: number; type?: string };
                  return (
                    <div
                      key={`${item._id}-ws-${sIdx}-q-${qIdx}`}
                      className="rounded-lg border border-slate-100 p-3 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs sm:text-sm font-medium flex-1">
                          Q{qIdx + 1}. {q.question}
                          {qx.type ? (
                            <span className="ml-2 text-xs font-normal text-slate-500">({qx.type})</span>
                          ) : null}
                        </p>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50"
                          disabled={deletingQuestionKey === `${item._id}:${qIdx}`}
                          onClick={() => handleDeleteQuestion(item, qIdx)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      {q.options.length > 0 && (
                        <ul className="text-xs sm:text-sm space-y-1 text-slate-700">
                          {q.options.map((opt: string, idx: number) => (
                            <li key={`${item._id}-ws-${sIdx}-q-${qIdx}-o-${idx}`} className="flex items-start gap-2">
                              <span className="mt-1 inline-block h-2.5 w-2.5 rounded-full border border-slate-500" />
                              <span>{opt.replace(/^[A-D][\).]\s*/i, `${String.fromCharCode(65 + idx)}) `)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {q.answer ? (
                        <p className="text-xs text-emerald-700 flex items-center gap-1.5">
                          <CircleCheck className="h-3.5 w-3.5" />
                          <span>
                            <span className="font-medium">Answer:</span> {q.answer}
                          </span>
                        </p>
                      ) : null}
                      {qx.marks != null && !Number.isNaN(Number(qx.marks)) ? (
                        <p className="text-xs text-slate-500">Marks: {String(qx.marks)}</p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              ) : (
                <p className="text-xs text-slate-500 italic">
                  No questions extracted for this section. Re-upload the worksheet PDF to capture all sections.
                </p>
              )
            )
          )}
          {answerKeySectionsBuilt.length > 0 || pickStr("answerKey", "answer_key")
            ? section(
                "9. Answer Key",
                answerKeySectionsBuilt.length > 0 ? (
                  <div className="space-y-3">
                    {answerKeySectionsBuilt.map((sec, aIdx) => (
                      <div
                        key={`${item._id}-ws-ak-${aIdx}`}
                        className="rounded-lg border border-emerald-100 bg-emerald-50/40 p-3 space-y-1.5"
                      >
                        <p className="text-xs font-semibold text-emerald-900">
                          {sec.letter}. {sec.sectionName}
                        </p>
                        <ul className="text-xs sm:text-sm text-slate-800 space-y-1">
                          {(sec.entries || []).map((entry, eIdx) => (
                            <li key={`${item._id}-ws-ak-${aIdx}-${eIdx}`}>
                              <span className="font-medium text-slate-600">
                                Q{entry.question_number ?? eIdx + 1}.
                              </span>{" "}
                              {entry.answer}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                ) : (
                  <pre className="text-xs text-slate-800 whitespace-pre-wrap font-sans leading-relaxed">
                    {pickStr("answerKey", "answer_key")}
                  </pre>
                ),
              )
            : null}
          {pickStr("bloomLevel", "bloom_level") || pickStr("difficultyTag", "difficulty_tag", "difficulty") ? (
            section(
              "10. Bloom's Level and Difficulty Tag",
              <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap">
                {[pickStr("bloomLevel", "bloom_level"), pickStr("difficultyTag", "difficulty_tag", "difficulty")]
                  .filter(Boolean)
                  .join(" — ")}
              </p>
            )
          ) : null}
          {!hasStructured && fallbackBody ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3">
              <p className="text-xs font-semibold text-amber-900 mb-2">Extracted content (sections not mapped)</p>
              <pre className="max-h-72 overflow-y-auto text-xs text-slate-800 whitespace-pre-wrap leading-relaxed font-sans">
                {fallbackBody.slice(0, 120000)}
              </pre>
            </div>
          ) : null}
        </div>
      );
    }

    if (
      kind === "questionSet" ||
      (Array.isArray(content.questions) &&
        item.toolType !== "concept-mastery-helper" &&
        item.toolType !== "homework-creator" &&
        item.toolType !== "worksheet-mcq-generator" &&
        item.toolType !== "reading-practice-room" &&
      item.toolType !== "story-passage-creator" &&
        item.toolType !== "short-notes-summaries-maker" &&
        item.toolType !== "quick-assignment-builder") ||
      (Array.isArray(fallback.questions) &&
        item.toolType !== "concept-mastery-helper" &&
        item.toolType !== "homework-creator" &&
        item.toolType !== "worksheet-mcq-generator" &&
        item.toolType !== "reading-practice-room" &&
      item.toolType !== "story-passage-creator" &&
        item.toolType !== "short-notes-summaries-maker" &&
        item.toolType !== "quick-assignment-builder")
    ) {
      const questions = toQuestionArray(content.questions || fallback.questions || []);
      if (questions.length === 0) {
        return (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            Parsed questions are unavailable for this record. Reprocess this PDF to generate structured questions.
          </div>
        );
      }
      return (
        <div className="space-y-3">
          {renderSectionHeader(<ClipboardList className="h-3 w-3 sm:h-4 sm:w-4" />, item.toolType === "homework-creator" ? "Homework Questions" : "Worksheet / MCQ Questions")}
          {questions.map((q, i) => (
            <div key={`${item._id}-q-${i}`} className="rounded-xl border bg-white p-4 shadow-sm space-y-2">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs sm:text-sm font-medium leading-relaxed flex-1">Q{i + 1}. {q.question}</p>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50"
                  disabled={deletingQuestionKey === `${item._id}:${i}`}
                  onClick={() => handleDeleteQuestion(item, i)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              {q.options.length > 0 && (
                <ul className="mt-3 space-y-1.5 text-xs sm:text-sm text-slate-700">
                  {q.options.map((opt: string, idx: number) => (
                    <li key={`${item._id}-q-${i}-opt-${idx}`} className="flex items-start gap-2">
                      <span className="mt-1 inline-block h-2.5 w-2.5 rounded-full border border-slate-500" />
                      <span>{opt.replace(/^[A-D][\).]\s*/i, `${String.fromCharCode(65 + idx)}) `)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {q.answer && (
                <p className="mt-3 text-xs text-emerald-700 flex items-center gap-1.5">
                  <CircleCheck className="h-3.5 w-3.5" />
                  <span><span className="font-medium">Correct answer:</span> {q.answer}</span>
                </p>
              )}
            </div>
          ))}
        </div>
      );
    }

    if (
      item.toolType === "my-study-decks" ||
      item.toolType === "flashcard-generator" ||
      kind === "flashcards" ||
      Array.isArray(content.cards) ||
      Array.isArray(fallback.cards)
    ) {
      const isTeacherFlashcards = item.toolType === "flashcard-generator";
      const fb = fallback as Record<string, unknown>;
      const rc = content as Record<string, unknown>;
      const pickCardStr = (card: Record<string, unknown>, ...keys: string[]) => {
        for (const k of keys) {
          const v = card[k];
          if (v != null && String(v).trim()) return String(v).trim();
        }
        return "";
      };
      const normalizeCard = (raw: unknown) => {
        const c = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
        return {
          front: pickCardStr(c, "front"),
          back: pickCardStr(c, "back"),
          difficultyTagForEachCard: pickCardStr(
            c,
            "difficultyTagForEachCard",
            "difficulty_tag_for_each_card",
            "difficulty_tag",
            "difficulty_level",
            "skillFocus",
            "skill_focus",
            "bloom_level",
          ),
          memoryCue: pickCardStr(c, "memoryCue", "memory_cue", "hint"),
          skillFocus: pickCardStr(c, "skillFocus", "skill_focus", "bloom_level"),
          exampleUse: pickCardStr(c, "exampleUse", "example_use", "real_life_link"),
          peerPrompt: pickCardStr(c, "peerPrompt", "peer_prompt"),
          selfCheckRound: pickCardStr(c, "selfCheckRound", "self_check_round", "self_check"),
          reflection: pickCardStr(c, "reflection", "reflection_prompt", "self_check"),
        };
      };
      const rawCards = Array.isArray(rc.cards)
        ? rc.cards
        : Array.isArray(fallback.cards)
          ? (fallback.cards as unknown[])
          : pickCardStr(fb, "front") || pickCardStr(fb, "back")
            ? [fb]
            : [];
      const cards = rawCards.map(normalizeCard).filter((c) => c.front || c.back);
      const deckTitle = pickCardStr(rc, "title") || pickCardStr(fb, "deck_title", "title") || "Flashcards";
      const listValues = (value: unknown): string[] =>
        Array.isArray(value)
          ? value.map((v) => String(v || "").trim()).filter(Boolean)
          : String(value || "")
              .split(/\n|;/)
              .map((v) => v.trim())
              .filter(Boolean);
      const rootText = (...keys: string[]) => {
        for (const key of keys) {
          const value = rc[key] ?? fb[key];
          if (value != null && String(value).trim()) return String(value).trim();
        }
        return "";
      };
      const fieldRow = (label: string, value: string) =>
        value ? (
          <p className="text-xs sm:text-sm text-slate-800">
            <span className="font-medium text-slate-600">{label}:</span> {value}
          </p>
        ) : null;
      return (
        <div className="space-y-3">
          {renderSectionHeader(<Layers className="h-3 w-3 sm:h-4 sm:w-4" />, deckTitle)}
          <p className="text-xs text-slate-500 pl-9">
            {isTeacherFlashcards ? "Flash Card Generator — 5-block template" : "My Study Decks — 12-point template"}
          </p>
          {isTeacherFlashcards ? (
            <div className="rounded-xl border bg-white p-4 space-y-2 shadow-sm">
              {fieldRow(
                "Topic and Subtopic Link",
                rootText("topic_and_subtopic_link", "subtopic_link"),
              )}
              {fieldRow("Prior Knowledge Required", rootText("prior_knowledge_required"))}
              {(() => {
                const rows = listValues(rc.learningObjectives ?? fb.learning_objectives ?? fb.objectives);
                return rows.length ? (
                  <p className="text-xs sm:text-sm text-slate-800">
                    <span className="font-medium text-slate-600">Learning Objectives – Bloom&apos;s:</span> {rows.join(" | ")}
                  </p>
                ) : null;
              })()}
              {fieldRow(
                "NCF Competency / Learning Outcome Alignment",
                rootText("ncf_competency_alignment", "learning_outcome_alignment"),
              )}
              {fieldRow(
                "Self-Check Rapid Recall Round",
                rootText("self_check_rapid_recall_round", "self_check_round"),
              )}
              {(() => {
                const rows = listValues(rc.common_mistakes_to_avoid ?? fb.common_mistakes_to_avoid);
                return rows.length ? (
                  <p className="text-xs sm:text-sm text-slate-800">
                    <span className="font-medium text-slate-600">Common Mistakes to Avoid:</span> {rows.join(" | ")}
                  </p>
                ) : null;
              })()}
              {fieldRow("Differentiation Support", rootText("differentiation_support", "differentiation"))}
              {(() => {
                const rows = listValues(rc.expected_learning_outcomes ?? fb.expected_learning_outcomes);
                return rows.length ? (
                  <p className="text-xs sm:text-sm text-slate-800">
                    <span className="font-medium text-slate-600">Expected Learning Outcomes:</span> {rows.join(" | ")}
                  </p>
                ) : null;
              })()}
              {fieldRow(
                "Real-life Connection",
                rootText("real_life_connection", "real_life_application"),
              )}
              {fieldRow(
                "Reflection / Exit Ticket",
                rootText("reflection_exit_ticket", "reflection"),
              )}
            </div>
          ) : null}
          {!isTeacherFlashcards ? (
            <div className="rounded-xl border bg-white p-4 space-y-2 shadow-sm">
              {fieldRow(
                "Subtopic Link and Prior Knowledge Required",
                rootText("subtopicLinkPriorKnowledgeRequired", "subtopic_link_prior_knowledge_required", "prior_knowledge_required"),
              )}
              {(() => {
                const rows = listValues(rc.learningObjectives ?? fb.learning_objectives ?? fb.objectives);
                return rows.length ? (
                  <p className="text-xs sm:text-sm text-slate-800">
                    <span className="font-medium text-slate-600">Learning Objectives - Bloom&apos;s Taxonomy Aligned:</span> {rows.join(" | ")}
                  </p>
                ) : null;
              })()}
              {fieldRow(
                "NCF Competency / Learning Outcome Alignment",
                rootText("ncfCompetencyAlignment", "ncf_competency_alignment", "learning_outcome_alignment"),
              )}
              {(() => {
                const rows = listValues(rc.commonMistakesToAvoid ?? fb.common_mistakes_to_avoid ?? fb.common_mistakes);
                return rows.length ? (
                  <p className="text-xs sm:text-sm text-slate-800">
                    <span className="font-medium text-slate-600">Common Mistakes to Avoid:</span> {rows.join(" | ")}
                  </p>
                ) : null;
              })()}
              {(() => {
                const rows = listValues(rc.expectedLearningOutcomes ?? fb.expected_learning_outcomes);
                return rows.length ? (
                  <p className="text-xs sm:text-sm text-slate-800">
                    <span className="font-medium text-slate-600">Expected Learning Outcomes:</span> {rows.join(" | ")}
                  </p>
                ) : null;
              })()}
              {fieldRow(
                "Real-life Application",
                rootText("realLifeApplication", "real_life_application", "example_use", "real_life_link"),
              )}
              {fieldRow(
                "Reflection / Exit Ticket",
                rootText("reflectionExitTicket", "reflection_exit_ticket", "reflection", "reflection_prompt"),
              )}
            </div>
          ) : null}
          <div className="grid gap-3 md:grid-cols-2">
          {cards.map((card, idx) => (
            <div key={`${item._id}-card-${idx}`} className="rounded-xl border bg-white p-4 space-y-2 shadow-sm">
              <p className="text-xs font-semibold text-slate-500">Card {idx + 1}</p>
              {fieldRow("Front", card.front)}
              {fieldRow("Back", card.back)}
              {fieldRow("Difficulty Tag for Each Card", card.difficultyTagForEachCard)}
              {fieldRow("Memory Hook / Quick Tip", card.memoryCue)}
              {!isTeacherFlashcards ? fieldRow("Self-Check Round", card.selfCheckRound || card.peerPrompt) : null}
              {!isTeacherFlashcards ? fieldRow("Skill Focus", card.skillFocus) : null}
              {!isTeacherFlashcards ? fieldRow("Example Use", card.exampleUse) : null}
              {!isTeacherFlashcards ? fieldRow("Peer Prompt", card.peerPrompt) : null}
              {!isTeacherFlashcards ? fieldRow("Reflection", card.reflection) : null}
            </div>
          ))}
          </div>
          {cards.length === 0 ? (
            <p className="text-xs text-slate-500 italic">
              {isTeacherFlashcards
                ? "No flashcards extracted. Re-upload with Flash Card Generator selected."
                : "No flashcards extracted. Re-upload with My Study Decks selected."}
            </p>
          ) : null}
        </div>
      );
    }

    if (
      item.toolType === "reading-practice-room" ||
      item.toolType === "story-passage-creator" ||
      kind === "story"
    ) {
      if (item.toolType === "story-passage-creator") {
        return (
          <StoryPassageViewer
            content={String(item.generatedContent || "").trim()}
            rawData={content && typeof content === "object" ? content : fallback}
          />
        );
      }
      const fb = fallback as Record<string, unknown>;
      const rc = content as Record<string, unknown>;
      const pickStr = (...keys: string[]) => {
        for (const k of keys) {
          const v = rc[k] ?? fb[k];
          if (v != null && String(v).trim()) return String(v).trim();
        }
        return "";
      };
      const listFrom = (primary: unknown, ...alts: unknown[]): string[] => {
        const pull = (v: unknown): string[] => {
          if (v == null) return [];
          if (Array.isArray(v)) {
            return v.flatMap((x) => {
              if (typeof x === "string") return [String(x).trim()].filter(Boolean);
              if (x && typeof x === "object") {
                const o = x as Record<string, unknown>;
                return [String(o.text || o.hint || o.answer || o.question || "").trim()].filter(Boolean);
              }
              return [];
            });
          }
          if (typeof v === "string" && v.trim()) {
            return v
              .split(/\n+/)
              .map((ln) => ln.replace(/^\s*[-*•]\s*|\s*\d+[\).\s]+/i, "").trim())
              .filter(Boolean);
          }
          return [];
        };
        const a = pull(primary);
        if (a.length) return a;
        for (const x of alts) {
          const b = pull(x);
          if (b.length) return b;
        }
        return [];
      };
      const storyTitle =
        pickStr("readingPracticeTitle", "reading_practice_title", "title") || "Reading Practice";
      const passage = pickStr("passage", "content");
      const subtopicPrior = pickStr(
        "subtopicLinkPriorKnowledge",
        "subtopic_link_prior_knowledge",
        "subtopic_link",
      );
      const objectives = listFrom(rc.learningObjectives, fb.learning_objectives, fb.objectives);
      const ncfAlignment = pickStr("ncfCompetencyAlignment", "ncf_competency_alignment", "alignment_block");
      const vocabularyWarmup = listFrom(
        rc.vocabularyWarmup,
        fb.vocabulary_warmup,
        fb.vocabulary_support,
        fb.vocabulary,
      );
      const recallQs = toQuestionArray(
        rc.readAndRecallQuestions || fb.read_and_recall_questions || rc.questions || fb.questions || [],
      );
      const inferQs = toQuestionArray(rc.thinkAndInferQuestions || fb.think_and_infer_questions || []);
      const connectQs = toQuestionArray(rc.applyAndConnectQuestions || fb.apply_and_connect_questions || []);
      const vocabPractice = listFrom(rc.vocabularyPractice, fb.vocabulary_practice);
      const answerKey = listFrom(
        rc.answerKeySuggestedResponses,
        fb.answer_key_suggested_responses,
        rc.answerHints,
        fb.answer_hints,
      );
      const expectedOutcomes = listFrom(rc.expectedLearningOutcomes, fb.expected_learning_outcomes);
      const metaClass = pickStr("classLabel", "class_label") || String(item.classLabel || "").trim();
      const metaSubject = pickStr("subject") || String(item.subject || "").trim();
      const metaSubtopic = pickStr("subtopic", "subtopic_link") || String(item.subTopic || "").trim();
      const metaBloom = pickStr("bloomLevel", "bloom_level");
      const metaDifficulty = pickStr("difficultyLevel", "difficulty_level", "difficulty_tag");
      const section = (label: string, children: ReactNode) => (
        <div className="rounded-xl border bg-white p-3 shadow-sm">
          <p className="text-xs font-semibold text-slate-500">{label}</p>
          <div className="mt-2">{children}</div>
        </div>
      );
      const emptyHint = (text: string) => <p className="text-xs text-slate-500 italic">{text}</p>;

      return (
        <div className="space-y-3">
          <div className="space-y-0.5">
            {renderSectionHeader(<BookText className="h-3 w-3 sm:h-4 sm:w-4" />, storyTitle)}
            <p className="text-xs text-slate-500 pl-9">Reading Practice Room — 13-section template</p>
          </div>
          {(metaClass || metaSubject || metaSubtopic || metaBloom || metaDifficulty) && (
            <div className="flex flex-wrap gap-2 text-xs">
              {metaClass ? (
                <span className="rounded-full border bg-slate-50 px-2 py-1 text-slate-600">Class: {metaClass}</span>
              ) : null}
              {metaSubject ? (
                <span className="rounded-full border bg-slate-50 px-2 py-1 text-slate-600">Subject: {metaSubject}</span>
              ) : null}
              {metaSubtopic ? (
                <span className="rounded-full border bg-slate-50 px-2 py-1 text-slate-600">Subtopic: {metaSubtopic}</span>
              ) : null}
              {metaBloom ? (
                <span className="rounded-full border bg-slate-50 px-2 py-1 text-slate-600">Bloom: {metaBloom}</span>
              ) : null}
              {metaDifficulty ? (
                <span className="rounded-full border bg-slate-50 px-2 py-1 text-slate-600">Difficulty: {metaDifficulty}</span>
              ) : null}
            </div>
          )}
          {section(
            "1. Reading Practice Title",
            <p className="text-xs sm:text-sm text-slate-800 font-medium">{storyTitle}</p>,
          )}
          {section(
            "2. Subtopic Link and Prior Knowledge Required",
            subtopicPrior ? (
              <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap">{subtopicPrior}</p>
            ) : (
              emptyHint("No subtopic link or prior knowledge extracted.")
            ),
          )}
          {section(
            "3. Learning Objectives - Bloom's Taxonomy Aligned",
            objectives.length > 0 ? (
              <ul className="text-xs sm:text-sm space-y-1 text-slate-800">
                {objectives.map((o, i) => (
                  <li key={`${item._id}-story-lo-${i}`}>- {o}</li>
                ))}
              </ul>
            ) : (
              emptyHint("No learning objectives extracted.")
            ),
          )}
          {section(
            "4. NCF Competency / Learning Outcome Alignment",
            ncfAlignment ? (
              <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap">{ncfAlignment}</p>
            ) : (
              emptyHint("No NCF competency alignment extracted.")
            ),
          )}
          {section(
            "5. Vocabulary Warm-up",
            vocabularyWarmup.length > 0 ? (
              <ul className="text-xs sm:text-sm space-y-1 text-slate-800">
                {vocabularyWarmup.map((v, i) => (
                  <li key={`${item._id}-story-voc-${i}`}>- {v}</li>
                ))}
              </ul>
            ) : (
              emptyHint("No vocabulary warm-up extracted.")
            ),
          )}
          {section(
            "6. Passage / Story",
            passage ? (
              <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">{passage}</p>
            ) : (
              emptyHint("Passage text missing — re-upload the reading practice PDF.")
            ),
          )}
          {section(
            "7. Read and Recall Questions",
            recallQs.length > 0 ? (
              <div className="space-y-2">
                {recallQs.map((q, i) => (
                  <p key={`${item._id}-story-recall-${i}`} className="text-xs sm:text-sm text-slate-800">
                    Q{i + 1}. {q.question}
                  </p>
                ))}
              </div>
            ) : (
              emptyHint("No read and recall questions extracted.")
            ),
          )}
          {section(
            "8. Think and Infer Questions",
            inferQs.length > 0 ? (
              <div className="space-y-2">
                {inferQs.map((q, i) => (
                  <p key={`${item._id}-story-infer-${i}`} className="text-xs sm:text-sm text-slate-800">
                    Q{i + 1}. {q.question}
                  </p>
                ))}
              </div>
            ) : (
              emptyHint("No think and infer questions extracted.")
            ),
          )}
          {section(
            "9. Apply and Connect Questions",
            connectQs.length > 0 ? (
              <div className="space-y-2">
                {connectQs.map((q, i) => (
                  <p key={`${item._id}-story-connect-${i}`} className="text-xs sm:text-sm text-slate-800">
                    Q{i + 1}. {q.question}
                  </p>
                ))}
              </div>
            ) : (
              emptyHint("No apply and connect questions extracted.")
            ),
          )}
          {section(
            "10. Vocabulary Practice",
            vocabPractice.length > 0 ? (
              <ul className="text-xs sm:text-sm space-y-1 text-slate-800">
                {vocabPractice.map((v, i) => (
                  <li key={`${item._id}-story-vp-${i}`}>- {v}</li>
                ))}
              </ul>
            ) : (
              emptyHint("No vocabulary practice extracted.")
            ),
          )}
          {section(
            "11. Answer Key / Suggested Responses",
            answerKey.length > 0 ? (
              <ul className="text-xs sm:text-sm space-y-1 text-slate-800">
                {answerKey.map((h, i) => (
                  <li key={`${item._id}-story-ans-${i}`}>- {h}</li>
                ))}
              </ul>
            ) : (
              emptyHint("No answer key extracted.")
            ),
          )}
          {section(
            "12. Expected Learning Outcomes",
            expectedOutcomes.length > 0 ? (
              <ul className="text-xs sm:text-sm space-y-1 text-slate-800">
                {expectedOutcomes.map((o, i) => (
                  <li key={`${item._id}-story-out-${i}`}>- {o}</li>
                ))}
              </ul>
            ) : (
              emptyHint("No expected learning outcomes extracted.")
            ),
          )}
          {section(
            "13. Reflection / Exit Ticket",
            pickStr("reflectionExitTicket", "reflection_exit_ticket", "reflection_prompt", "reflectionPrompt") ? (
              <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap">
                {pickStr("reflectionExitTicket", "reflection_exit_ticket", "reflection_prompt", "reflectionPrompt")}
              </p>
            ) : (
              emptyHint("No reflection / exit ticket extracted.")
            ),
          )}
        </div>
      );
    }

    if (item.toolType === "chapter-summary-creator" || kind === "chapterSummary") {
      return (
        <ChapterSummaryViewer
          content={String(item.generatedContent || "").trim()}
          rawContent={{
            ...(fallback as Record<string, unknown>),
            ...(content as Record<string, unknown>),
            structuredContent: fallback,
            renderContent: content,
          }}
        />
      );
    }

    if (item.toolType === "smart-study-guide-generator" || kind === "studyGuide") {
      return (
        <SmartStudyGuideViewer
          content={String(item.generatedContent || "").trim()}
          rawContent={{
            ...(fallback as Record<string, unknown>),
            ...(content as Record<string, unknown>),
            structuredContent: fallback,
            renderContent: content,
          }}
        />
      );
    }

    if (item.toolType === "key-points-formula-extractor" || kind === "keyPoints") {
      return (
        <KeyPointsViewer
          content={String(item.generatedContent || "").trim()}
          rawContent={{
            ...(fallback as Record<string, unknown>),
            ...(content as Record<string, unknown>),
            structuredContent: fallback,
            renderContent: content,
          }}
        />
      );
    }

    if (item.toolType === "quick-assignment-builder" || kind === "quickAssignment") {
      return (
        <QuickAssignmentViewer
          content={String(item.generatedContent || "").trim()}
          rawContent={{
            ...(fallback as Record<string, unknown>),
            ...(content as Record<string, unknown>),
            structuredContent: fallback,
            renderContent: content,
          }}
        />
      );
    }

    if (item.toolType === "short-notes-summaries-maker" || kind === "shortNotes") {
      const fb = fallback as Record<string, unknown>;
      const rc = content as Record<string, unknown>;
      const pickStr = (...keys: string[]) => {
        for (const k of keys) {
          const v = rc[k] ?? fb[k];
          if (v != null && String(v).trim()) return String(v).trim();
        }
        return "";
      };
      const listFrom = (primary: unknown, ...alts: unknown[]): string[] => {
        const pull = (v: unknown): string[] => {
          if (v == null) return [];
          if (Array.isArray(v)) {
            return v.flatMap((x) => {
              if (typeof x === "string") return [String(x).trim()].filter(Boolean);
              return [];
            });
          }
          if (typeof v === "string" && v.trim()) {
            return v
              .split(/\n+/)
              .map((ln) => ln.replace(/^\s*[-*•]\s*|\s*\d+[\).\s]+/i, "").trim())
              .filter(Boolean);
          }
          return [];
        };
        const a = pull(primary);
        if (a.length) return a;
        for (const x of alts) {
          const b = pull(x);
          if (b.length) return b;
        }
        return [];
      };
      const noteTitle = pickStr("title", "concept_name") || "Notes";
      const objectives = listFrom(rc.learningObjectives, fb.learning_objectives, fb.objectives);
      const keyPoints = listFrom(
        rc.keyPointsToRemember,
        fb.key_points_to_remember,
        fb.key_points,
        fb.keyPoints,
      );
      const quickChecks = listFrom(rc.quickCheckQuestions, fb.quick_check_questions);
      const metaClass = pickStr("classLabel", "class_label") || String(item.classLabel || "").trim();
      const metaSubject = pickStr("subject") || String(item.subject || "").trim();
      const metaSubtopic = pickStr("subtopic") || String(item.subTopic || "").trim();
      const metaBloom = pickStr("bloomLevel", "bloom_level");
      const metaSkill = pickStr("skillFocus", "skill_focus", "skill");
      const section = (label: string, children: ReactNode) => (
        <div className="rounded-xl border bg-white p-3 shadow-sm">
          <p className="text-xs font-semibold text-slate-500">{label}</p>
          <div className="mt-2">{children}</div>
        </div>
      );
      const emptyHint = (text: string) => <p className="text-xs text-slate-500 italic">{text}</p>;
      const alignment =
        pickStr("alignmentBlock", "alignment_block") ||
        [
          pickStr("nepNcfFocus", "nep_ncf_focus") ? `NEP/NCF Focus: ${pickStr("nepNcfFocus", "nep_ncf_focus")}` : "",
          pickStr("udlSupport", "udl_support", "udl") ? `UDL: ${pickStr("udlSupport", "udl_support", "udl")}` : "",
        ]
          .filter(Boolean)
          .join(" ");

      return (
        <div className="space-y-3">
          <div className="space-y-0.5">
            {renderSectionHeader(<Lightbulb className="h-3 w-3 sm:h-4 sm:w-4" />, noteTitle)}
            <p className="text-xs text-slate-500 pl-9">Short Notes &amp; Summaries — 10-section template</p>
          </div>
          {(metaClass || metaSubject || metaSubtopic || metaBloom || metaSkill) && (
            <div className="flex flex-wrap gap-2 text-xs">
              {metaClass ? (
                <span className="rounded-full border bg-slate-50 px-2 py-1 text-slate-600">Class: {metaClass}</span>
              ) : null}
              {metaSubject ? (
                <span className="rounded-full border bg-slate-50 px-2 py-1 text-slate-600">Subject: {metaSubject}</span>
              ) : null}
              {metaSubtopic ? (
                <span className="rounded-full border bg-slate-50 px-2 py-1 text-slate-600">Subtopic: {metaSubtopic}</span>
              ) : null}
              {metaBloom ? (
                <span className="rounded-full border bg-slate-50 px-2 py-1 text-slate-600">Bloom: {metaBloom}</span>
              ) : null}
              {metaSkill ? (
                <span className="rounded-full border bg-slate-50 px-2 py-1 text-slate-600">Skill: {metaSkill}</span>
              ) : null}
            </div>
          )}
          {section(
            "1. Alignment Block",
            alignment ? (
              <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap">{alignment}</p>
            ) : (
              emptyHint("Re-upload with Short Notes & Summaries to extract alignment.")
            ),
          )}
          {section(
            "2. Learning Objectives",
            objectives.length > 0 ? (
              <ul className="text-xs sm:text-sm space-y-1 text-slate-800">
                {objectives.map((o, i) => (
                  <li key={`${item._id}-sns-lo-${i}`}>- {o}</li>
                ))}
              </ul>
            ) : (
              emptyHint("No learning objectives extracted.")
            ),
          )}
          {section(
            "3. Short Note / Summary",
            pickStr("shortNoteSummary", "short_note_summary", "summary") ? (
              <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                {pickStr("shortNoteSummary", "short_note_summary", "summary")}
              </p>
            ) : (
              emptyHint("Short note summary missing — re-upload the PDF.")
            ),
          )}
          {section(
            "4. Key Points to Remember",
            keyPoints.length > 0 ? (
              <ul className="text-xs sm:text-sm space-y-1 text-slate-800">
                {keyPoints.map((p, i) => (
                  <li key={`${item._id}-sns-kp-${i}`}>- {p}</li>
                ))}
              </ul>
            ) : (
              emptyHint("No key points extracted.")
            ),
          )}
          {section(
            "5. Example",
            pickStr("example") ? (
              <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap">{pickStr("example")}</p>
            ) : (
              emptyHint("No example extracted.")
            ),
          )}
          {section(
            "6. Common Misconception and Correction",
            pickStr("commonMisconceptionCorrection", "common_misconception_correction") ? (
              <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap">
                {pickStr("commonMisconceptionCorrection", "common_misconception_correction")}
              </p>
            ) : (
              emptyHint("No misconception / correction extracted.")
            ),
          )}
          {section(
            "7. Quick Check Questions",
            quickChecks.length > 0 ? (
              <ul className="text-xs sm:text-sm space-y-1 text-slate-800">
                {quickChecks.map((q, i) => (
                  <li key={`${item._id}-sns-qc-${i}`}>- {q}</li>
                ))}
              </ul>
            ) : (
              emptyHint("No quick check questions extracted.")
            ),
          )}
          {section(
            "8. Differentiation",
            pickStr("differentiationSupport", "differentiation_support") ||
              pickStr("differentiationExtension", "differentiation_extension") ? (
              <div className="space-y-2 text-xs sm:text-sm text-slate-800">
                {pickStr("differentiationSupport", "differentiation_support") ? (
                  <p>
                    <span className="font-medium">Support:</span>{" "}
                    {pickStr("differentiationSupport", "differentiation_support")}
                  </p>
                ) : null}
                {pickStr("differentiationExtension", "differentiation_extension") ? (
                  <p>
                    <span className="font-medium">Extension:</span>{" "}
                    {pickStr("differentiationExtension", "differentiation_extension")}
                  </p>
                ) : null}
              </div>
            ) : (
              emptyHint("No differentiation extracted.")
            ),
          )}
          {section(
            "9. Real-life Application",
            pickStr("realLifeApplication", "real_life_application", "real_life_link") ? (
              <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap">
                {pickStr("realLifeApplication", "real_life_application", "real_life_link")}
              </p>
            ) : (
              emptyHint("No real-life application extracted.")
            ),
          )}
          {section(
            "10. Reflection / Exit Ticket",
            pickStr("reflectionExitTicket", "reflection_exit_ticket", "reflection_prompt") ? (
              <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap">
                {pickStr("reflectionExitTicket", "reflection_exit_ticket", "reflection_prompt")}
              </p>
            ) : (
              emptyHint("No reflection / exit ticket extracted.")
            ),
          )}
        </div>
      );
    }

    const isDailyPlanRecord =
      kind === "dailyPlan" ||
      item.toolType === "daily-class-plan-maker";

    if (isDailyPlanRecord) {
      const fb = fallback as Record<string, unknown>;
      const rc = content as Record<string, unknown>;
      const listFrom = (primary: unknown, ...alts: unknown[]): string[] => {
        const pull = (v: unknown): string[] => {
          if (v == null) return [];
          if (Array.isArray(v)) {
            return v.flatMap((x) => {
              if (typeof x === "string") return [String(x).trim()].filter(Boolean);
              if (x && typeof x === "object") {
                const o = x as Record<string, unknown>;
                const s = String(o.text || o.step || o.objective || o.method || o.activity || "").trim();
                return s ? [s] : [];
              }
              return [];
            });
          }
          if (typeof v === "string" && v.trim()) {
            return v
              .split(/\n+/)
              .map((ln) => ln.replace(/^\s*[-*•]\s*|\s*\d+[\).\s]+/i, "").trim())
              .filter(Boolean);
          }
          return [];
        };
        const a = pull(primary);
        if (a.length) return a;
        for (const x of alts) {
          const b = pull(x);
          if (b.length) return b;
        }
        return [];
      };
      const pickStr = (...keys: string[]) => {
        for (const k of keys) {
          const v = rc[k] ?? fb[k];
          if (v != null && String(v).trim()) return String(v).trim();
        }
        return "";
      };
      const section = (label: string, children: ReactNode) => (
        <div className="rounded-xl border bg-white p-3 shadow-sm">
          <p className="text-xs font-semibold text-slate-500">{label}</p>
          <div className="mt-2">{children}</div>
        </div>
      );
      const objectives = listFrom(rc.objectives, fb.objectives, fb.period_objectives, fb.learning_objectives);
      const teachingMethods = listFrom(rc.teachingMethods, fb.teaching_methods, fb.methodology);
      const classroomActivity = listFrom(
        rc.classroomActivity,
        fb.classroom_activity,
        fb.classroom_activities,
        fb.activities,
      );
      const teachingAids = listFrom(rc.teachingAids, fb.teaching_aids, fb.materials_required, fb.materials);
      const timeSlotsRaw = (rc.timeSlots ?? fb.time_slots) as
        | { time?: string; activity?: string; type?: string }[]
        | undefined;
      const timeSlots = Array.isArray(timeSlotsRaw)
        ? timeSlotsRaw.filter((ts) => String(ts?.activity || ts?.time || "").trim())
        : [];
      let timeline = listFrom(rc.timeline, fb.timeline, fb.schedule);
      if (!timeSlots.length && timeline.length) {
        timeline.forEach((line) => {
          const m = String(line).match(/^([^:–-]+)[:–-]\s*(.+)$/);
          if (m) timeSlots.push({ time: m[1].trim(), activity: m[2].trim(), type: "" });
          else timeSlots.push({ time: "", activity: line, type: "" });
        });
      }
      const displayTitle = activityTitleForDisplay(
        pickStr("title", "dayPeriodTopicBreakup", "day_period_topic_breakup", "name") || "Daily class plan",
        item,
      );
      const fallbackBody = String(item.generatedContent || "").trim();
      const hasStructured = Boolean(
        pickStr("dayPeriodTopicBreakup", "day_period_topic_breakup") ||
          objectives.length ||
          teachingMethods.length ||
          classroomActivity.length ||
          pickStr("exitTicket", "exit_ticket", "formative_check") ||
          pickStr("differentiatedSupport", "differentiated_support", "differentiation") ||
          pickStr("homeworkFollowup", "homework_followup", "homework") ||
          teachingAids.length ||
          pickStr("teacherReflectionNotes", "teacher_reflection_notes", "reflection") ||
          timeSlots.length ||
          timeline.length,
      );

      return (
        <div className="space-y-3">
          <div className="space-y-0.5">
            {renderSectionHeader(<CalendarDays className="h-3 w-3 sm:h-4 sm:w-4" />, displayTitle)}
            <p className="text-xs text-slate-500 pl-9">Daily class plan — 9-section template</p>
          </div>
          {pickStr("dayPeriodTopicBreakup", "day_period_topic_breakup", "topic_breakup")
            ? section(
                "1. Day / Period-wise Topic Break-up",
                <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap">
                  {pickStr("dayPeriodTopicBreakup", "day_period_topic_breakup", "topic_breakup")}
                </p>,
              )
            : null}
          {section(
            "2. Learning Objectives (per period)",
            objectives.length > 0 ? (
              <ul className="text-xs sm:text-sm space-y-1">
                {objectives.map((line, i) => (
                  <li key={`${item._id}-dp-lo-${i}`}>- {line}</li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-500 italic">None listed.</p>
            ),
          )}
          {section(
            "3. Teaching Methods",
            teachingMethods.length > 0 ? (
              <ul className="text-xs sm:text-sm space-y-1">
                {teachingMethods.map((line, i) => (
                  <li key={`${item._id}-dp-tm-${i}`}>- {line}</li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-500 italic">None listed.</p>
            ),
          )}
          {section(
            "4. Classroom Activity / Demonstration",
            classroomActivity.length > 0 ? (
              <ul className="text-xs sm:text-sm space-y-1">
                {classroomActivity.map((line, i) => (
                  <li key={`${item._id}-dp-ca-${i}`}>- {line}</li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-500 italic">None listed.</p>
            ),
          )}
          {pickStr("exitTicket", "exit_ticket", "formative_check", "quick_assessment")
            ? section(
                "5. Quick Assessment / Exit Ticket",
                <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap">
                  {pickStr("exitTicket", "exit_ticket", "formative_check", "quick_assessment")}
                </p>,
              )
            : null}
          {pickStr("differentiatedSupport", "differentiated_support", "differentiation", "udl_support")
            ? section(
                "6. Differentiated Support",
                <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap">
                  {pickStr("differentiatedSupport", "differentiated_support", "differentiation", "udl_support")}
                </p>,
              )
            : null}
          {pickStr("homeworkFollowup", "homework_followup", "homework", "follow_up")
            ? section(
                "7. Homework / Follow-up",
                <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap">
                  {pickStr("homeworkFollowup", "homework_followup", "homework", "follow_up")}
                </p>,
              )
            : null}
          {teachingAids.length > 0
            ? section(
                "8. Required Teaching Aids",
                <ul className="text-xs sm:text-sm space-y-1">
                  {teachingAids.map((m, i) => (
                    <li key={`${item._id}-dp-aid-${i}`}>- {m}</li>
                  ))}
                </ul>,
              )
            : null}
          {pickStr("teacherReflectionNotes", "teacher_reflection_notes", "reflection", "teacher_notes")
            ? section(
                "9. Teacher Reflection Notes",
                <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap">
                  {pickStr("teacherReflectionNotes", "teacher_reflection_notes", "reflection", "teacher_notes")}
                </p>,
              )
            : null}
          {timeSlots.length > 0
            ? section(
                "Period schedule",
                <ul className="text-xs sm:text-sm space-y-2">
                  {timeSlots.map((ts, i) => {
                    const time = String(ts?.time || "").trim();
                    const activity = String(ts?.activity || "").trim();
                    const type = String(ts?.type || "").trim();
                    const label = [time, activity].filter(Boolean).join(": ") || activity || time;
                    return (
                      <li key={`${item._id}-dp-ts-${i}`} className="text-slate-800">
                        - {label}
                        {type ? <span className="text-slate-500"> ({type})</span> : null}
                      </li>
                    );
                  })}
                </ul>,
              )
            : timeline.length > 0
              ? section(
                  "Period schedule",
                  <ul className="text-xs sm:text-sm space-y-1">
                    {timeline.map((t, i) => (
                      <li key={`${item._id}-dp-tl-${i}`}>- {t}</li>
                    ))}
                  </ul>,
                )
              : null}
          {!hasStructured && fallbackBody ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3">
              <p className="text-xs font-semibold text-amber-900 mb-2">Extracted content (sections not mapped)</p>
              <pre className="max-h-72 overflow-y-auto text-xs text-slate-800 whitespace-pre-wrap leading-relaxed font-sans">
                {fallbackBody.slice(0, 120000)}
              </pre>
            </div>
          ) : null}
        </div>
      );
    }

    const isLessonPlannerRecord =
      kind === "lessonPlan" ||
      item.toolType === "lesson-planner" ||
      item.toolType === "study-schedule-maker";

    if (isLessonPlannerRecord) {
      const fb = fallback as Record<string, unknown>;
      const rc = content as Record<string, unknown>;

      const listFrom = (primary: unknown, ...alts: unknown[]): string[] => {
        const pull = (v: unknown): string[] => {
          if (v == null) return [];
          if (Array.isArray(v)) {
            return v.flatMap((x) => {
              if (typeof x === "string") return [String(x).trim()].filter(Boolean);
              if (x && typeof x === "object") {
                const o = x as Record<string, unknown>;
                const s = String(
                  o.text || o.step || o.objective || o.outcome || o.description || o.activity || o.content || "",
                ).trim();
                return s ? [s] : [];
              }
              return [];
            });
          }
          if (typeof v === "string" && v.trim()) {
            return v
              .split(/\n+/)
              .map((ln) => ln.replace(/^\s*[-*•]\s*|\s*\d+[\).\s]+/i, "").trim())
              .filter(Boolean);
          }
          return [];
        };
        const a = pull(primary);
        if (a.length) return a;
        for (const x of alts) {
          const b = pull(x);
          if (b.length) return b;
        }
        return [];
      };

      const pickStr = (...keys: string[]) => {
        for (const k of keys) {
          const v = rc[k] ?? fb[k];
          if (v != null && String(v).trim()) return String(v).trim();
        }
        return "";
      };

      const displayLessonTitle = activityTitleForDisplay(
        pickStr("studyScheduleTitle", "study_schedule_title", "title", "lesson_name", "name") ||
          "Study schedule",
        item,
      );
      const objectives = listFrom(
        rc.objectives,
        fb.objectives,
        fb.learning_objectives,
        fb.learningObjectives,
        fb.goals,
      );
      const ncfRaw = rc.ncfAlignment ?? fb.ncf_competency_alignment ?? fb.competencies;
      const ncfText = Array.isArray(ncfRaw)
        ? ncfRaw.map((x) => String(x ?? "").trim()).filter(Boolean).join("; ")
        : String(ncfRaw || "").trim();
      let studyPlanTable = listFrom(rc.studyPlanTable, fb.study_plan_table, rc.timeline, fb.timeline, fb.schedule);
      if (!studyPlanTable.length && Array.isArray(fb.time_slots)) {
        studyPlanTable = (fb.time_slots as { time?: string; activity?: string }[])
          .map((ts) => {
            const t = String(ts?.time || "").trim();
            const a = String(ts?.activity || "").trim();
            if (t && a) return `${t}: ${a}`;
            return a || t;
          })
          .filter(Boolean);
      }
      const expectedOutcomes = listFrom(rc.expectedLearningOutcomes, fb.expected_learning_outcomes);

      const section = (label: string, children: ReactNode) => (
        <div className="rounded-xl border bg-white p-3 shadow-sm">
          <p className="text-xs font-semibold text-slate-500">{label}</p>
          <div className="mt-2">{children}</div>
        </div>
      );

      const fallbackBody = String(item.generatedContent || "").trim();
      const hasStructured = Boolean(
        objectives.length ||
          ncfText ||
          pickStr("studyGoalSubtopicLink", "study_goal_subtopic_link") ||
          pickStr("priorKnowledgeReadinessCheck", "prior_knowledge_readiness_check", "prior_knowledge_diagnostic") ||
          studyPlanTable.length ||
          pickStr("conceptLearningSlot", "concept_learning_slot") ||
          pickStr("practiceSlot", "practice_slot") ||
          pickStr("breaksFocusTips", "breaks_focus_tips") ||
          pickStr("selfAssessmentCheckpoint", "self_assessment_checkpoint") ||
          pickStr("supportExtensionPlan", "support_extension_plan") ||
          expectedOutcomes.length ||
          pickStr("reflectionExitTicket", "reflection_exit_ticket", "closure_exit_ticket"),
      );

      return (
        <div className="space-y-3">
          <div className="space-y-0.5">
            {renderSectionHeader(<CalendarDays className="h-3 w-3 sm:h-4 sm:w-4" />, displayLessonTitle)}
            <p className="text-xs text-slate-500 pl-9">
              {item.toolType === "lesson-planner"
                ? "Lesson Planner — 14-point teacher template"
                : "Study Schedule Maker — 13-point student template"}
            </p>
          </div>
          {section(
            "1. Study Schedule Title",
            <p className="text-xs sm:text-sm text-slate-800 font-medium">{displayLessonTitle}</p>,
          )}
          {pickStr("studyGoalSubtopicLink", "study_goal_subtopic_link", "subtopic_link")
            ? section(
                "2. Study Goal and Subtopic Link",
                <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap">
                  {pickStr("studyGoalSubtopicLink", "study_goal_subtopic_link", "subtopic_link")}
                </p>,
              )
            : null}
          {pickStr(
            "priorKnowledgeReadinessCheck",
            "prior_knowledge_readiness_check",
            "prior_knowledge_diagnostic",
            "diagnostic_question",
          )
            ? section(
                "3. Prior Knowledge and Readiness Check",
                <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap">
                  {pickStr(
                    "priorKnowledgeReadinessCheck",
                    "prior_knowledge_readiness_check",
                    "prior_knowledge_diagnostic",
                    "diagnostic_question",
                  )}
                </p>,
              )
            : null}
          {section(
            "4. Learning Objectives - Bloom's Taxonomy Aligned",
            objectives.length > 0 ? (
              <ul className="text-xs sm:text-sm space-y-1">
                {objectives.map((line, i) => (
                  <li key={`${item._id}-lp-lo-${i}`}>- {line}</li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-500 italic">None listed.</p>
            ),
          )}
          {ncfText
            ? section("5. NCF Competency / Learning Outcome Alignment", (
                <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap">{ncfText}</p>
              ))
            : null}
          {section(
            "6. Study Plan Table",
            studyPlanTable.length > 0 ? (
              <ol className="text-xs sm:text-sm space-y-1 list-decimal list-inside">
                {studyPlanTable.map((s, i) => (
                  <li key={`${item._id}-lp-plan-${i}`}>{s}</li>
                ))}
              </ol>
            ) : (
              <p className="text-xs text-slate-500 italic">None listed.</p>
            ),
          )}
          {pickStr("conceptLearningSlot", "concept_learning_slot", "introduction_warmup", "teaching_strategy")
            ? section(
                "7. Concept Learning Slot",
                <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap">
                  {pickStr("conceptLearningSlot", "concept_learning_slot", "introduction_warmup", "teaching_strategy")}
                </p>,
              )
            : null}
          {pickStr("practiceSlot", "practice_slot", "homework_practice", "homework")
            ? section(
                "8. Practice Slot",
                <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap">
                  {pickStr("practiceSlot", "practice_slot", "homework_practice", "homework")}
                </p>,
              )
            : null}
          {pickStr("breaksFocusTips", "breaks_focus_tips", "warmup")
            ? section(
                "9. Breaks and Focus Tips",
                <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap">
                  {pickStr("breaksFocusTips", "breaks_focus_tips", "warmup")}
                </p>,
              )
            : null}
          {pickStr("selfAssessmentCheckpoint", "self_assessment_checkpoint", "assessment")
            ? section(
                "10. Self-Assessment Checkpoint",
                <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap">
                  {pickStr("selfAssessmentCheckpoint", "self_assessment_checkpoint", "assessment")}
                </p>,
              )
            : null}
          {pickStr("supportExtensionPlan", "support_extension_plan", "differentiation_plan", "differentiation")
            ? section(
                "11. Support and Extension Plan",
                <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap">
                  {pickStr("supportExtensionPlan", "support_extension_plan", "differentiation_plan", "differentiation")}
                </p>,
              )
            : null}
          {expectedOutcomes.length > 0
            ? section(
                "12. Expected Learning Outcomes",
                <ul className="text-xs sm:text-sm space-y-1">
                  {expectedOutcomes.map((o, i) => (
                    <li key={`${item._id}-lp-out-${i}`}>- {o}</li>
                  ))}
                </ul>,
              )
            : null}
          {pickStr("reflectionExitTicket", "reflection_exit_ticket", "closure_exit_ticket", "exit_ticket")
            ? section(
                "13. Reflection / Exit Ticket",
                <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap">
                  {pickStr("reflectionExitTicket", "reflection_exit_ticket", "closure_exit_ticket", "exit_ticket")}
                </p>,
              )
            : null}
          {!hasStructured && fallbackBody ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3">
              <p className="text-xs font-semibold text-amber-900 mb-2">Extracted content (sections not mapped)</p>
              <pre className="max-h-72 overflow-y-auto text-xs text-slate-800 whitespace-pre-wrap leading-relaxed font-sans">
                {fallbackBody.slice(0, 120000)}
              </pre>
            </div>
          ) : null}
        </div>
      );
    }

    if (
      kind === "rubric" ||
      Array.isArray((content as Record<string, unknown>).criteriaRows) ||
      Array.isArray(fallback.criteria)
    ) {
      const fb = fallback as Record<string, unknown>;
      const rc = content as Record<string, unknown>;
      const pickStr = (...keys: string[]) => {
        for (const k of keys) {
          const v = rc[k] ?? fb[k];
          if (v != null && String(v).trim()) return String(v).trim();
        }
        return "";
      };
      const rawCriteria = (rc.criteriaRows ?? fb.criteria ?? rc.criteria ?? []) as unknown[];
      const criteriaRows: {
        name: string;
        excellent: string;
        good: string;
        satisfactory: string;
        needs_improvement: string;
      }[] = [];
      for (const entry of rawCriteria) {
        if (typeof entry === "string" && entry.trim()) {
          criteriaRows.push({
            name: entry.trim(),
            excellent: "",
            good: "",
            satisfactory: "",
            needs_improvement: "",
          });
          continue;
        }
        if (entry && typeof entry === "object") {
          const o = entry as Record<string, unknown>;
          criteriaRows.push({
            name: String(o.name || o.criterion || "").trim() || "Criterion",
            excellent: String(o.excellent || "").trim(),
            good: String(o.good || "").trim(),
            satisfactory: String(o.satisfactory || "").trim(),
            needs_improvement: String(o.needs_improvement || o.needsImprovement || "").trim(),
          });
        }
      }
      const rubricTitle = pickStr("title", "rubric_title", "name") || "Rubric & Evaluation";
      const section = (label: string, children: ReactNode) => (
        <div className="rounded-xl border bg-white p-3 shadow-sm">
          <p className="text-xs font-semibold text-slate-500">{label}</p>
          <div className="mt-2">{children}</div>
        </div>
      );
      const fallbackBody = String(item.generatedContent || "").trim();
      const hasStructured = Boolean(
        pickStr("assessmentPurpose", "assessment_purpose") ||
          pickStr("competencyAssessed", "competency_assessed") ||
          criteriaRows.length ||
          pickStr("gradingCriteria", "grading_criteria") ||
          pickStr("strengthsObserved", "strengths_observed") ||
          pickStr("areasForImprovement", "areas_for_improvement") ||
          pickStr("teacherRemarks", "teacher_remarks") ||
          pickStr("actionableSuggestions", "actionable_suggestions") ||
          pickStr("parentFriendlyFeedback", "parent_friendly_feedback") ||
          pickStr("nextStepRemedialEnrichment", "next_step_remedial_enrichment"),
      );

      return (
        <div className="space-y-3">
          {renderSectionHeader(<BarChart3 className="h-3 w-3 sm:h-4 sm:w-4" />, rubricTitle)}
          {pickStr("assessmentPurpose", "assessment_purpose")
            ? section(
                "1. Assessment Purpose",
                <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap">
                  {pickStr("assessmentPurpose", "assessment_purpose")}
                </p>,
              )
            : null}
          {pickStr("competencyAssessed", "competency_assessed")
            ? section(
                "2. Competency / Learning Outcome Assessed",
                <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap">
                  {pickStr("competencyAssessed", "competency_assessed")}
                </p>,
              )
            : null}
          {criteriaRows.length > 0
            ? section(
                "3. Evaluation Rubric with 4 Performance Levels",
                <div className="space-y-4 text-xs sm:text-sm text-slate-800">
                  {criteriaRows.map((row, i) => {
                    const levels = [
                      { label: "Excellent", value: row.excellent },
                      { label: "Good", value: row.good },
                      { label: "Satisfactory", value: row.satisfactory },
                      { label: "Needs Improvement", value: row.needs_improvement },
                    ].filter((l) => String(l.value || "").trim());
                    return (
                      <div
                        key={`${item._id}-rub-row-${i}`}
                        className="rounded-lg border border-slate-100 bg-slate-50/50 p-3 space-y-1.5"
                      >
                        <p className="font-semibold text-slate-900">{row.name}</p>
                        {levels.length > 0 ? (
                          <ul className="space-y-1 pl-1">
                            {levels.map((l) => (
                              <li key={`${item._id}-rub-${i}-${l.label}`}>
                                <span className="font-medium text-slate-600">{l.label}:</span> {l.value}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-xs text-slate-500 italic">No performance levels listed.</p>
                        )}
                      </div>
                    );
                  })}
                </div>,
              )
            : null}
          {pickStr("gradingCriteria", "grading_criteria")
            ? section("4. Grading Criteria", (
                <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap">
                  {pickStr("gradingCriteria", "grading_criteria")}
                </p>
              ))
            : null}
          {pickStr("strengthsObserved", "strengths_observed")
            ? section("5. Strengths Observed", (
                <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap">
                  {pickStr("strengthsObserved", "strengths_observed")}
                </p>
              ))
            : null}
          {pickStr("areasForImprovement", "areas_for_improvement")
            ? section("6. Areas for Improvement", (
                <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap">
                  {pickStr("areasForImprovement", "areas_for_improvement")}
                </p>
              ))
            : null}
          {pickStr("teacherRemarks", "teacher_remarks")
            ? section("7. Teacher Remarks", (
                <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap">
                  {pickStr("teacherRemarks", "teacher_remarks")}
                </p>
              ))
            : null}
          {pickStr("actionableSuggestions", "actionable_suggestions")
            ? section("8. Actionable Improvement Suggestions", (
                <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap">
                  {pickStr("actionableSuggestions", "actionable_suggestions")}
                </p>
              ))
            : null}
          {pickStr("parentFriendlyFeedback", "parent_friendly_feedback")
            ? section("9. Parent-friendly Feedback", (
                <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap">
                  {pickStr("parentFriendlyFeedback", "parent_friendly_feedback")}
                </p>
              ))
            : null}
          {pickStr("nextStepRemedialEnrichment", "next_step_remedial_enrichment")
            ? section("10. Next-step Remedial / Enrichment Activity", (
                <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap">
                  {pickStr("nextStepRemedialEnrichment", "next_step_remedial_enrichment")}
                </p>
              ))
            : null}
          {!hasStructured && fallbackBody ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3">
              <p className="text-xs font-semibold text-amber-900 mb-2">Extracted content (sections not mapped)</p>
              <pre className="max-h-72 overflow-y-auto text-xs text-slate-800 whitespace-pre-wrap leading-relaxed font-sans">
                {fallbackBody.slice(0, 120000)}
              </pre>
            </div>
          ) : null}
        </div>
      );
    }

    if (
      item.toolType === "mock-test-builder" ||
      item.toolType === "exam-question-paper-generator" ||
      kind === "examPaper" ||
      kind === "mockTest"
    ) {
      const isMockTest =
        item.toolType === "mock-test-builder" || kind === "mockTest";
      const fb = fallback as Record<string, unknown>;
      const rc = content as Record<string, unknown>;

      if (isMockTest) {
        return (
          <MockTestViewer
            content={String(item.generatedContent || "").trim()}
            rawContent={{
              ...fb,
              ...rc,
              structuredContent: fallback,
              renderContent: content,
            }}
          />
        );
      }

      const pickStr = (...keys: string[]) => {
        for (const k of keys) {
          const v = rc[k] ?? fb[k];
          if (v != null && String(v).trim()) return String(v).trim();
        }
        return "";
      };
      let sections = Array.isArray(content.sections)
        ? (content.sections as { sectionName?: string; title?: string; questions?: unknown[] }[])
        : (fallback.sections as { sectionName?: string; title?: string; questions?: unknown[] }[]) || [];
      if (!sections.length) {
        const sectionSeeds: Array<{ sectionName: string; questions: unknown[] }> = [
          {
            sectionName: "Section A: MCQs",
            questions: Array.isArray(rc.section_a)
              ? (rc.section_a as unknown[])
              : Array.isArray(fb.section_a)
                ? (fb.section_a as unknown[])
                : [],
          },
          {
            sectionName: "Section B: Very Short Answer Questions",
            questions: Array.isArray(rc.section_b)
              ? (rc.section_b as unknown[])
              : Array.isArray(fb.section_b)
                ? (fb.section_b as unknown[])
                : [],
          },
          {
            sectionName: "Section C: Short Answer Questions",
            questions: Array.isArray(rc.section_c)
              ? (rc.section_c as unknown[])
              : Array.isArray(fb.section_c)
                ? (fb.section_c as unknown[])
                : [],
          },
          {
            sectionName: "Section D: Long Answer Questions",
            questions: Array.isArray(rc.section_d)
              ? (rc.section_d as unknown[])
              : Array.isArray(fb.section_d)
                ? (fb.section_d as unknown[])
                : [],
          },
          {
            sectionName: "Section E: Case-based / Competency Questions",
            questions: Array.isArray(rc.section_e)
              ? (rc.section_e as unknown[])
              : Array.isArray(fb.section_e)
                ? (fb.section_e as unknown[])
                : [],
          },
        ];
        sections = sectionSeeds.filter((s) => Array.isArray(s.questions) && s.questions.length > 0);
      }
      if (!sections.length && String(fb.question || "").trim()) {
        sections = [{ sectionName: String(fb.section || "Questions"), questions: [fb] }];
      }
      const sectionOrder = [
        "Section A: MCQs",
        "Section B: Very Short Answer Questions",
        "Section C: Short Answer Questions",
        "Section D: Long Answer Questions",
        "Section E: Case-based / Competency Questions",
      ];
      const canonicalExamSectionName = (name: string) => {
        const n = String(name || "").toLowerCase().trim();
        if (/^section\s*a|mcq|multiple\s*choice/.test(n)) return sectionOrder[0];
        if (/^section\s*b|very\s*short|vsa/.test(n)) return sectionOrder[1];
        if (/^section\s*c|short\s*answer/.test(n) && !/very\s*short|vsa/.test(n)) return sectionOrder[2];
        if (/^section\s*d|long\s*answer|essay/.test(n)) return sectionOrder[3];
        if (/^section\s*e|case|competency|competence/.test(n)) return sectionOrder[4];
        return "";
      };
      const orderedSectionMap = new Map<string, unknown[]>(
        sectionOrder.map((name) => [name, [] as unknown[]]),
      );
      for (const sec of sections) {
        const questions = Array.isArray(sec?.questions) ? sec.questions : [];
        const canonical = canonicalExamSectionName(String(sec?.sectionName || sec?.title || ""));
        if (canonical) {
          orderedSectionMap.set(canonical, [...(orderedSectionMap.get(canonical) || []), ...questions]);
          continue;
        }
        // If section label is generic (e.g. "Questions"), default to Section A.
        orderedSectionMap.set(sectionOrder[0], [...(orderedSectionMap.get(sectionOrder[0]) || []), ...questions]);
      }
      const displaySections = sectionOrder.map((name) => ({
        sectionName: name,
        questions: orderedSectionMap.get(name) || [],
      }));
      const examTitle =
        pickStr("paperTitle", "paper_title", "title") || activityTitleForDisplay("Exam Paper", item);
      return (
        <div className="space-y-3">
          <div className="space-y-0.5">
            {renderSectionHeader(<ScrollText className="h-3 w-3 sm:h-4 sm:w-4" />, examTitle)}
            <p className="text-xs text-slate-500 pl-9">
              {isMockTest ? "Mock Test Builder — 13-point template" : "Exam Question Paper Generator — 11-section template"}
            </p>
          </div>
          <div className="rounded-xl border bg-white p-3 shadow-sm">
            <p className="text-xs font-semibold text-slate-500">
              {isMockTest ? "1. Mock Test Title" : "1. Paper Title and General Instructions"}
            </p>
            <p className="text-xs sm:text-sm text-slate-900 mt-2 font-medium">
              {pickStr("mockTestTitle", "mock_test_title", "paperTitle", "paper_title", "title") || examTitle}
            </p>
            {!isMockTest && pickStr("instructions", "general_instructions") ? (
              <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap mt-2">
                {pickStr("instructions", "general_instructions")}
              </p>
            ) : null}
          </div>
          {isMockTest && pickStr("testPurposeSubtopicLink", "test_purpose_subtopic_link", "test_purpose", "subtopic_link") ? (
            <div className="rounded-xl border bg-white p-3 shadow-sm">
              <p className="text-xs font-semibold text-slate-500">2. Test Purpose and Subtopic Link</p>
              <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap mt-2">
                {pickStr("testPurposeSubtopicLink", "test_purpose_subtopic_link", "test_purpose", "subtopic_link", "blueprint", "design_grid")}
              </p>
            </div>
          ) : null}
          {!isMockTest && pickStr("blueprint", "design_grid") ? (
            <div className="rounded-xl border bg-white p-3 shadow-sm">
              <p className="text-xs font-semibold text-slate-500">2. Blueprint / Design Grid</p>
              <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap mt-2">{pickStr("blueprint", "design_grid")}</p>
            </div>
          ) : null}
          {isMockTest && pickStr("learningObjectives", "learning_objectives", "objectives") ? (
            <div className="rounded-xl border bg-white p-3 shadow-sm">
              <p className="text-xs font-semibold text-slate-500">3. Learning Objectives - Bloom&apos;s Taxonomy Aligned</p>
              <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap mt-2">
                {pickStr("learningObjectives", "learning_objectives", "objectives")}
              </p>
            </div>
          ) : null}
          {isMockTest && pickStr("ncfCompetencyAlignment", "ncf_competency_alignment", "learning_outcome_alignment") ? (
            <div className="rounded-xl border bg-white p-3 shadow-sm">
              <p className="text-xs font-semibold text-slate-500">4. NCF Competency / Learning Outcome Alignment</p>
              <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap mt-2">
                {pickStr("ncfCompetencyAlignment", "ncf_competency_alignment", "learning_outcome_alignment")}
              </p>
            </div>
          ) : null}
          {isMockTest && pickStr("instructions", "general_instructions") ? (
            <div className="rounded-xl border bg-white p-3 shadow-sm">
              <p className="text-xs font-semibold text-slate-500">5. Instructions for Students</p>
              <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap mt-2">
                {pickStr("instructions", "general_instructions")}
              </p>
            </div>
          ) : null}
          <div className="rounded-xl border bg-white p-3 shadow-sm">
            <p className="text-xs font-semibold text-slate-500">
              {isMockTest ? "6. Question Paper" : "3–7. Question Paper Sections"}
            </p>
          </div>
          {displaySections.map((section: any, sIdx: number) => (
            <div key={`${item._id}-sec-${sIdx}`} className="rounded-xl border bg-white p-4 shadow-sm">
              <p className="text-xs sm:text-sm font-semibold">{String(section?.sectionName || section?.title || `Section ${sIdx + 1}`)}</p>
              {toQuestionArray(section?.questions || []).length === 0 ? (
                <p className="text-xs text-slate-500 italic mt-2">No questions listed.</p>
              ) : null}
              {toQuestionArray(section?.questions || []).map((q, qIdx) => {
                const qx = q as { question_number?: number; marks?: number };
                return (
                <div key={`${item._id}-sec-${sIdx}-q-${qIdx}`} className="rounded-lg border border-slate-100 p-3 mt-2 space-y-2">
                  <p className="text-xs sm:text-sm font-medium">
                    Q{qx.question_number != null ? String(qx.question_number) : qIdx + 1}. {q.question}
                  </p>
                  {q.options.length > 0 && (
                    <ul className="text-xs sm:text-sm space-y-1 text-slate-700">
                      {q.options.map((opt: string, idx: number) => (
                        <li key={`${item._id}-sec-${sIdx}-q-${qIdx}-o-${idx}`}>- {opt}</li>
                      ))}
                    </ul>
                  )}
                  {q.answer ? (
                    <p className="text-xs text-emerald-700">
                      <span className="font-medium">Answer:</span> {q.answer}
                    </p>
                  ) : null}
                  {qx.marks != null && !Number.isNaN(Number(qx.marks)) ? (
                    <p className="text-xs text-slate-500">Marks: {String(qx.marks)}</p>
                  ) : null}
                </div>
              );
              })}
            </div>
          ))}
          {pickStr("answerKey", "answer_key") ? (
            <div className="rounded-xl border bg-white p-3 shadow-sm">
              <p className="text-xs font-semibold text-slate-500">
                {isMockTest ? "7. Answer Key" : "9. Complete Answer Key"}
              </p>
              <pre className="text-xs text-slate-800 whitespace-pre-wrap mt-2 font-sans leading-relaxed">
                {pickStr("answerKey", "answer_key")}
              </pre>
            </div>
          ) : null}
          {isMockTest && pickStr("stepByStepSolutionsExplanations", "step_by_step_solutions_explanations", "solutions", "explanations") ? (
            <div className="rounded-xl border bg-white p-3 shadow-sm">
              <p className="text-xs font-semibold text-slate-500">8. Step-by-step Solutions / Explanations</p>
              <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap mt-2">
                {pickStr("stepByStepSolutionsExplanations", "step_by_step_solutions_explanations", "solutions", "explanations")}
              </p>
            </div>
          ) : null}
          {isMockTest && pickStr("remedialRevisionSuggestions", "remedial_revision_suggestions", "revision_suggestions", "remedial_suggestions") ? (
            <div className="rounded-xl border bg-white p-3 shadow-sm">
              <p className="text-xs font-semibold text-slate-500">9. Remedial Revision Suggestions</p>
              <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap mt-2">
                {pickStr("remedialRevisionSuggestions", "remedial_revision_suggestions", "revision_suggestions", "remedial_suggestions")}
              </p>
            </div>
          ) : null}
          {isMockTest && pickStr("expectedLearningOutcomes", "expected_learning_outcomes") ? (
            <div className="rounded-xl border bg-white p-3 shadow-sm">
              <p className="text-xs font-semibold text-slate-500">10. Expected Learning Outcomes</p>
              <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap mt-2">
                {pickStr("expectedLearningOutcomes", "expected_learning_outcomes")}
              </p>
            </div>
          ) : null}
          {isMockTest && pickStr("realLifeApplication", "real_life_application", "real_life_connections") ? (
            <div className="rounded-xl border bg-white p-3 shadow-sm">
              <p className="text-xs font-semibold text-slate-500">11. Real-life Application</p>
              <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap mt-2">
                {pickStr("realLifeApplication", "real_life_application", "real_life_connections")}
              </p>
            </div>
          ) : null}
          {isMockTest && pickStr("reflectionExitTicket", "reflection_exit_ticket", "reflection", "exit_ticket") ? (
            <div className="rounded-xl border bg-white p-3 shadow-sm">
              <p className="text-xs font-semibold text-slate-500">12. Reflection / Exit Ticket</p>
              <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap mt-2">
                {pickStr("reflectionExitTicket", "reflection_exit_ticket", "reflection", "exit_ticket")}
              </p>
            </div>
          ) : null}
          {!isMockTest && pickStr("internalChoices", "internal_choices") ? (
            <div className="rounded-xl border bg-white p-3 shadow-sm">
              <p className="text-xs font-semibold text-slate-500">8. Internal Choices</p>
              <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap mt-2">
                {pickStr("internalChoices", "internal_choices")}
              </p>
            </div>
          ) : null}
          {!isMockTest && pickStr("markingScheme", "marking_scheme") ? (
            <div className="rounded-xl border bg-white p-3 shadow-sm">
              <p className="text-xs font-semibold text-slate-500">10. Detailed Marking Scheme</p>
              <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap mt-2">
                {pickStr("markingScheme", "marking_scheme")}
              </p>
            </div>
          ) : null}
          {!isMockTest && pickStr("openEndedRubric", "open_ended_rubric") ? (
            <div className="rounded-xl border bg-white p-3 shadow-sm">
              <p className="text-xs font-semibold text-slate-500">11. Rubric for Open-ended Questions</p>
              <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap mt-2">
                {pickStr("openEndedRubric", "open_ended_rubric")}
              </p>
            </div>
          ) : null}
        </div>
      );
    }

    if (
      item.toolType === "project-idea-lab" ||
      item.toolType === "activity-project-generator" ||
      kind === "activity" ||
      fallback.steps ||
      fallback.materials ||
      fallback.student_instructions ||
      fallback.step_by_step_procedure
    ) {
      const coalesceLines = (v: unknown): string[] => {
        if (Array.isArray(v)) return v.map((x) => String(x ?? "").trim()).filter(Boolean);
        if (typeof v === "string" && v.trim()) {
          return v
            .split(/\n+/)
            .map((line) => line.replace(/^\s*[-*•]\s*|\s*\d+[\).\s]+/i, "").trim())
            .filter(Boolean);
        }
        return [];
      };
      const fb = fallback as Record<string, unknown>;
      const rc = content as Record<string, unknown>;
      const pickLines = (primary: unknown, ...alts: unknown[]) => {
        const a = coalesceLines(primary);
        if (a.length) return a;
        for (const x of alts) {
          const b = coalesceLines(x);
          if (b.length) return b;
        }
        return [];
      };
      const title = String(rc.title || fb.title || "Activity").trim();
      const displayTitle = activityTitleForDisplay(title, item);
      const subtopicLink = String(rc.subtopicLink || fb.subtopic_link_prior_knowledge || "").trim();
      const ncfRaw = rc.ncfAlignment ?? fb.ncf_competency_alignment;
      const ncfAlignment = Array.isArray(ncfRaw)
        ? ncfRaw.map((x) => String(x ?? "").trim()).filter(Boolean)
        : String(ncfRaw || "").trim();
      const isTeacherActivity = item.toolType === "activity-project-generator";
      const learningObjectives = pickLines(rc.learningObjectives, fb.learning_objectives, fb.learningObjectives);
      let materials = pickLines(rc.materials, fb.materials_required, fb.materials);
      let steps = pickLines(rc.steps, fb.step_by_step_procedure, fb.steps);
      const teacherInstructions = pickLines(rc.teacherInstructions, fb.teacher_instructions, fb.teacherInstructions);
      const studentInstructions = pickLines(rc.studentInstructions, fb.student_instructions, fb.studentInstructions);
      const differentiation = String(
        rc.differentiationSupportExtension ||
          fb.differentiation_support_extension ||
          rc.differentiation ||
          fb.differentiation ||
          "",
      ).trim();
      const reflectionExit = String(rc.reflectionExitTicket || fb.reflection_exit_ticket || "").trim();
      const modelPlaceholder = /No structured steps were returned from the model/i;
      if (steps.length && steps.every((s) => modelPlaceholder.test(String(s)))) {
        const fbSteps = coalesceLines(fb.steps || fb.step_by_step_procedure);
        if (fbSteps.length) steps = fbSteps;
      }
      if (!steps.length) {
        steps = coalesceLines(
          (fb as { procedure?: string }).procedure || (fb as { instructions?: string }).instructions,
        );
      }
      const stepsVisible = steps.filter((s) => !modelPlaceholder.test(String(s)));
      const safetyInstructions = pickLines(
        rc.safetyCareInstructions,
        fb.safety_care_instructions,
        fb.safety_instructions,
        fb.care_instructions,
      );
      const observationTable = String(
        rc.observationDataRecordingTable ||
          fb.observation_data_recording_table ||
          fb.observation_table ||
          fb.data_recording_table ||
          "",
      ).trim();
      const creativeOutput = String(
        rc.creativeOutputFinalProduct ||
          fb.creative_output_final_product ||
          fb.creative_output ||
          fb.final_product ||
          "",
      ).trim();
      const expectedOutcomes = String(
        rc.learningOutcome || fb.learningOutcome || fb.expected_learning_outcomes || fb.expectedLearningOutcomes || "",
      ).trim();
      const assessmentRubric = pickLines(
        rc.selfAssessmentRubric,
        fb.self_assessment_rubric,
        rc.assessmentRubric,
        fb.assessment_criteria_rubric,
        fb.assessment,
      );
      const realLifeApplication = trimActivityRealLifeDisplayTail(
        String(rc.realLifeApplication || fb.real_life_application || fb.realLifeApplication || ""),
      ).trim();
      const rawExcerpt =
        String(
          (fb as { content?: string }).content ||
            (fb as { description?: string }).description ||
            (fb as { overview?: string }).overview ||
            "",
        ).trim();
      const section = (label: string, children: ReactNode) => (
        <div className="rounded-xl border bg-white p-3 shadow-sm">
          <p className="text-xs font-semibold text-slate-500">{label}</p>
          <div className="mt-2">{children}</div>
        </div>
      );
      const emptyLine = <p className="text-xs text-slate-500 italic">None listed.</p>;
      const bulletList = (lines: string[], keyPrefix: string) => (
        <ul className="text-xs sm:text-sm space-y-1">
          {lines.map((line: string, i: number) => (
            <li key={`${item._id}-${keyPrefix}-${i}`}>- {line}</li>
          ))}
        </ul>
      );
      const numberedList = (lines: string[], keyPrefix: string) => (
        <ol className="text-xs sm:text-sm space-y-1 list-decimal list-inside">
          {lines.map((line: string, i: number) => (
            <li key={`${item._id}-${keyPrefix}-${i}`}>{line}</li>
          ))}
        </ol>
      );
      const ncfBody = Array.isArray(ncfAlignment) ? (
        (ncfAlignment as string[]).length ? bulletList(ncfAlignment as string[], "ncf") : emptyLine
      ) : ncfAlignment ? (
        <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap">{ncfAlignment as string}</p>
      ) : (
        emptyLine
      );
      const procedureBody =
        stepsVisible.length > 0 ? (
          numberedList(stepsVisible, "s")
        ) : rawExcerpt ? (
          <p className="text-xs sm:text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{rawExcerpt}</p>
        ) : (
          <p className="text-xs text-slate-500 italic">
            No procedure extracted. Re-upload the PDF after server update, or check that the PDF uses the template section headings.
          </p>
        );

      if (isTeacherActivity) {
        return (
          <div className="space-y-3">
            <div className="space-y-0.5">
              {renderSectionHeader(<FlaskConical className="h-3 w-3 sm:h-4 sm:w-4" />, displayTitle)}
              <p className="text-xs text-slate-500 pl-9">Activity / Project Generator — 13-point teacher template</p>
            </div>
            {section("1. Title of Activity / Project", <p className="text-xs sm:text-sm text-slate-900 font-medium">{displayTitle}</p>)}
            {section(
              "2. Subtopic Link and Prior Knowledge Required",
              subtopicLink ? (
                <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap">{subtopicLink}</p>
              ) : (
                emptyLine
              ),
            )}
            {section("3. Learning Objectives", learningObjectives.length ? bulletList(learningObjectives, "lo") : emptyLine)}
            {section("4. NCF Competency / Learning Outcome Alignment", ncfBody)}
            {section("5. Materials Required", materials.length ? bulletList(materials, "m") : emptyLine)}
            {section("6. Step-by-step Procedure", procedureBody)}
            {section(
              "7. Teacher Instructions",
              teacherInstructions.length ? bulletList(teacherInstructions, "ti") : emptyLine,
            )}
            {section(
              "8. Student Instructions",
              studentInstructions.length ? bulletList(studentInstructions, "si") : emptyLine,
            )}
            {section(
              "9. Differentiation",
              differentiation ? (
                <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap">{differentiation}</p>
              ) : (
                emptyLine
              ),
            )}
            {section(
              "10. Assessment Rubric",
              assessmentRubric.length ? bulletList(assessmentRubric, "ar") : emptyLine,
            )}
            {section(
              "11. Expected Learning Outcomes",
              expectedOutcomes ? (
                <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap">{expectedOutcomes}</p>
              ) : (
                emptyLine
              ),
            )}
            {section(
              "12. Real-life Application",
              realLifeApplication ? (
                <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap">{realLifeApplication}</p>
              ) : (
                emptyLine
              ),
            )}
            {section(
              "13. Reflection / Exit Ticket",
              reflectionExit ? (
                <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap">{reflectionExit}</p>
              ) : (
                emptyLine
              ),
            )}
          </div>
        );
      }

      return (
        <div className="space-y-3">
          <div className="space-y-0.5">
            {renderSectionHeader(<FlaskConical className="h-3 w-3 sm:h-4 sm:w-4" />, displayTitle)}
            <p className="text-xs text-slate-500 pl-9">Project Idea Lab — 14-point student template</p>
          </div>
          {section("1. Project / Activity Title", <p className="text-xs sm:text-sm text-slate-900 font-medium">{displayTitle}</p>)}
          {section(
            "2. Subtopic Link and Prior Knowledge Required",
            subtopicLink ? (
              <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap">{subtopicLink}</p>
            ) : (
              emptyLine
            ),
          )}
          {section(
            "3. Learning Objectives - Bloom's Taxonomy Aligned",
            learningObjectives.length ? bulletList(learningObjectives, "lo") : emptyLine,
          )}
          {section("4. NCF Competency / Learning Outcome Alignment", ncfBody)}
          {section("5. Materials Required", materials.length ? bulletList(materials, "m") : emptyLine)}
          {section("6. Step-by-step Student Procedure", procedureBody)}
          {section(
            "7. Safety and Care Instructions",
            safetyInstructions.length ? bulletList(safetyInstructions, "safe") : emptyLine,
          )}
          {section(
            "8. Observation / Data Recording Table",
            observationTable ? (
              <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap">{observationTable}</p>
            ) : (
              emptyLine
            ),
          )}
          {section(
            "9. Creative Output / Final Product",
            creativeOutput ? (
              <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap">{creativeOutput}</p>
            ) : (
              emptyLine
            ),
          )}
          {section(
            "10. Differentiation: Support and Extension",
            differentiation ? (
              <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap">{differentiation}</p>
            ) : (
              emptyLine
            ),
          )}
          {section(
            "11. Self-Assessment Rubric",
            assessmentRubric.length ? bulletList(assessmentRubric, "ar") : emptyLine,
          )}
          {section(
            "12. Expected Learning Outcomes",
            expectedOutcomes ? (
              <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap">{expectedOutcomes}</p>
            ) : (
              emptyLine
            ),
          )}
          {section(
            "13. Real-life Application",
            realLifeApplication ? (
              <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap">{realLifeApplication}</p>
            ) : (
              emptyLine
            ),
          )}
          {section(
            "14. Reflection / Exit Ticket",
            reflectionExit ? (
              <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap">{reflectionExit}</p>
            ) : (
              emptyLine
            ),
          )}
        </div>
      );
    }

    const sections = Array.isArray(content.sections) ? content.sections : [];
    const keyPoints = Array.isArray(content.keyPoints) ? content.keyPoints : fallback.keyPoints || [];
    return (
      <div className="space-y-2">
        {renderSectionHeader(<Lightbulb className="h-3 w-3 sm:h-4 sm:w-4" />, "Notes / Summary")}
        {sections.map((section: any, idx: number) => (
          <div key={`${item._id}-note-${idx}`} className="rounded-xl border bg-white p-4 shadow-sm">
            <p className="text-xs sm:text-sm font-semibold">{String(section?.heading || section?.title || `Section ${idx + 1}`)}</p>
            <p className="text-xs sm:text-sm text-slate-700 mt-1">{String(section?.explanation || section?.content || "").trim()}</p>
          </div>
        ))}
        {keyPoints.length > 0 && (
          <div className="rounded-xl border bg-white p-4">
            <p className="text-xs font-semibold text-slate-500 mb-2 flex items-center gap-1"><Star className="h-3.5 w-3.5" />Key Points</p>
            <ul className="text-xs sm:text-sm text-slate-700 space-y-1">{keyPoints.map((point: any, idx: number) => <li key={`${item._id}-kp-${idx}`}>- {String(point)}</li>)}</ul>
          </div>
        )}
      </div>
    );
  };
  const visiblePdfItems = useMemo(
    () =>
      items.filter(
        (item) =>
          !isDeprecatedAiToolIdentifier(item.toolType) &&
          !isDeprecatedAiToolIdentifier(item.contentType),
      ),
    [items],
  );

  const groupedHierarchy = useMemo(() => {
    const byTool = new Map<string, Map<string, { classLabel: string; board: string; subjects: Map<string, Map<string, Map<string, PdfItem[]>>> }>>();
    for (const item of visiblePdfItems) {
      const tool = getToolLabel(item.toolType) || "-";
      const classKey = String(item.classLabel || "-").trim() || "-";
      const boardKey = canonicalCurriculumBoardLabel(String(item.board || "").trim() || "-");
      const classMapKey = `${classKey}||${boardKey}`;
      const subjectKey = String(item.subject || "-").trim() || "-";
      const topicKey = String(item.topic || item.chapter || "-").trim() || "-";
      const subtopicKey = String(item.subTopic || "-").trim() || "-";
      if (!byTool.has(tool)) byTool.set(tool, new Map());
      const classMap = byTool.get(tool)!;
      if (!classMap.has(classMapKey)) classMap.set(classMapKey, { classLabel: classKey, board: boardKey, subjects: new Map() });
      const classEntry = classMap.get(classMapKey)!;
      const subjectMap = classEntry.subjects;
      if (!subjectMap.has(subjectKey)) subjectMap.set(subjectKey, new Map());
      const topicMap = subjectMap.get(subjectKey)!;
      if (!topicMap.has(topicKey)) topicMap.set(topicKey, new Map());
      const subtopicMap = topicMap.get(topicKey)!;
      if (!subtopicMap.has(subtopicKey)) subtopicMap.set(subtopicKey, []);
      subtopicMap.get(subtopicKey)!.push(item);
    }
    const countNestedRecords = (
      classes: Array<{
        subjects: Array<{
          topics: Array<{
            subtopics: Array<{ records: PdfItem[] }>;
          }>;
        }>;
      }>,
    ) =>
      classes.reduce(
        (toolSum, classNode) =>
          toolSum +
          classNode.subjects.reduce(
            (classSum, subjectNode) =>
              classSum +
              subjectNode.topics.reduce(
                (subjectSum, topicNode) =>
                  subjectSum +
                  topicNode.subtopics.reduce((topicSum, subtopicNode) => topicSum + subtopicNode.records.length, 0),
                0,
              ),
            0,
          ),
        0,
      );

    return Array.from(byTool.entries())
      .sort(([a], [b]) => a.localeCompare(b, "en", { sensitivity: "base" }))
      .map(([tool, classMap]) => {
        const classes = Array.from(classMap.entries())
          .sort(([, a], [, b]) => compareClassLabels(a.classLabel, b.classLabel) || a.board.localeCompare(b.board))
          .map(([, classEntry]) => ({
            classLabel: classEntry.classLabel,
            board: classEntry.board,
            subjects: Array.from(classEntry.subjects.entries())
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([subjectValue, topicMap]) => ({
                subject: subjectValue,
                topics: Array.from(topicMap.entries())
                  .sort(([a], [b]) => compareChapterWiseLabels(a, b))
                  .map(([topicValue, subtopicMap]) => ({
                    topic: topicValue,
                    subtopics: Array.from(subtopicMap.entries())
                      .sort(([a], [b]) => compareChapterWiseLabels(a, b))
                      .map(([subtopicValue, records]) => ({
                        subtopic: subtopicValue,
                        records: [...records].sort(
                          (a, b) => new Date(b.uploadDate || 0).getTime() - new Date(a.uploadDate || 0).getTime(),
                        ),
                      })),
                  })),
              })),
          }));
        return {
          tool,
          recordCount: countNestedRecords(classes),
          classes,
        };
      });
  }, [visiblePdfItems, toolOptions]);

  const pdfContentViewRecord = pdfContentViewDetail;

  const authHeaders = (): Record<string, string> => {
    const token =
      getAuthToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const toNames = (data: any): string[] => {
    const rows = Array.isArray(data) ? data : [];
    return rows
      .map((row: any) => String(row?.name || row?.label || row?.title || "").trim())
      .filter(Boolean);
  };

  const fetchClasses = async () => {
    setLoadingClasses(true);
    try {
      const qs = new URLSearchParams({ v: "3" });
      if (board) qs.set("board", board);
      const res = await fetch(`${API_BASE_URL}/api/curriculum/classes?${qs.toString()}`, { headers: authHeaders(), credentials: "include" });
      const json = await res.json();
      const names = sortClassLabelsAscending(toNames(json?.data));
      setClassOptions(
        names.length > 0 ? names : sortClassLabelsAscending(["Class 6", "Class 7", "Class 8", "Class 10"]),
      );
    } catch {
      setClassOptions(sortClassLabelsAscending(["Class 6", "Class 7", "Class 8", "Class 10"]));
    } finally {
      setLoadingClasses(false);
    }
  };

  const fetchSubjects = async (selectedClass: string) => {
    setLoadingSubjects(true);
    try {
      const qs = new URLSearchParams({ classId: selectedClass, syllabus: "curriculum-v3" });
      if (board) qs.set("board", board);
      const res = await fetch(`${API_BASE_URL}/api/curriculum/subjects?${qs.toString()}`, { headers: authHeaders(), credentials: "include" });
      const json = await res.json();
      if (!res.ok || json?.success === false) {
        throw new Error(json?.message || "Failed to load subjects");
      }
      setSubjectRows(toCurriculumSelectRows(json?.data));
    } catch {
      setSubjectRows([]);
    } finally {
      setLoadingSubjects(false);
    }
  };

  const fetchTopics = async (selectedClass: string, selectedSubject: string) => {
    setLoadingTopics(true);
    try {
      const qs = new URLSearchParams({ classId: selectedClass, subjectId: selectedSubject });
      if (board) qs.set("board", board);
      const res = await fetch(`${API_BASE_URL}/api/curriculum/topics?${qs.toString()}`, { headers: authHeaders(), credentials: "include" });
      const json = await res.json();
      if (!res.ok || json?.success === false) {
        throw new Error(json?.message || "Failed to load topics");
      }
      setTopicRows(sortCurriculumSelectRowsChapterWise(toCurriculumSelectRows(json?.data)));
    } catch {
      setTopicRows([]);
    } finally {
      setLoadingTopics(false);
    }
  };

  const fetchSubtopics = async (selectedClass: string, selectedSubject: string, selectedTopic: string) => {
    setLoadingSubtopics(true);
    try {
      const qs = new URLSearchParams({
        classId: selectedClass,
        subjectId: selectedSubject,
        topicId: selectedTopic,
        v: '7',
      });
      if (board) qs.set("board", board);
      const res = await fetch(`${API_BASE_URL}/api/curriculum/subtopics?${qs.toString()}`, { headers: authHeaders(), credentials: "include" });
      const json = await res.json();
      if (!res.ok || json?.success === false) {
        throw new Error(json?.message || "Failed to load subtopics");
      }
      setSubtopicRows(sortCurriculumSelectRowsChapterWise(toCurriculumSelectRows(json?.data)));
    } catch {
      setSubtopicRows([]);
    } finally {
      setLoadingSubtopics(false);
    }
  };

  const mapApiPdfDetailToItem = (data: Record<string, unknown>): PdfItem => ({
    _id: String(data._id || ""),
    board: String(data.board || ""),
    originalName: String(data.originalName || ""),
    fileUrl: String(data.fileUrl || ""),
    subject: String(data.subject || ""),
    classLabel: String(data.classLabel || ""),
    chapter: String(data.chapter || data.topic || ""),
    topic: String(data.topic || data.chapter || ""),
    subTopic: String(data.subTopic || ""),
    processingStatus: (data.processingStatus as PdfItem["processingStatus"]) || "pending",
    approvalStatus: data.approvalStatus as PdfItem["approvalStatus"],
    toolType: String(data.toolType || ""),
    contentType: String(data.contentType || ""),
    structuredContent: data.structuredContent,
    renderContent: data.renderContent,
    chunkCount: Number(data.chunkCount) || 0,
    uploadDate: String(data.uploadDate || data.createdAt || ""),
    generatedContent: String(data.generatedContent || ""),
    displayTitle: typeof data.displayTitle === "string" ? data.displayTitle : undefined,
    recordKind: data.recordKind as PdfItem["recordKind"],
    pdfId: typeof data.pdfId === "string" ? data.pdfId : undefined,
    pdfCode: typeof data.pdfCode === "string" ? data.pdfCode : undefined,
    generationNumber:
      data.generationNumber != null ? Number(data.generationNumber) : undefined,
    generationTitle:
      typeof data.generationTitle === "string" ? data.generationTitle : undefined,
    markerLabel: typeof data.markerLabel === "string" ? data.markerLabel : undefined,
    totalGenerations:
      data.totalGenerations != null ? Number(data.totalGenerations) : undefined,
    metadata:
      data.metadata && typeof data.metadata === "object"
        ? (data.metadata as Record<string, unknown>)
        : undefined,
  });

  const openPdfContentView = async (id: string) => {
    const listRecord = items.find((x) => x._id === id) ?? null;
    setPdfContentViewId(id);
    setPdfContentViewDetail(listRecord);
    setPdfContentViewLoading(true);
    try {
      const endpoint = isPdfGenerationRecord(listRecord || { _id: id, originalName: "", fileUrl: "", subject: "", classLabel: "", chapter: "", chunkCount: 0, uploadDate: "", processingStatus: "pending" })
        ? `${API_BASE_URL}/api/generations/${id}`
        : `${API_BASE_URL}/api/pdf/${id}`;
      const res = await fetch(endpoint, { headers: authHeaders() });
      const json = await res.json();
      if (!res.ok || json?.success === false) {
        throw new Error(json?.message || "Could not load record");
      }
      const detail = mapApiPdfDetailToItem(json.data || {});
      setPdfContentViewDetail(detail);
      setItems((prev) => prev.map((row) => (row._id === id ? { ...row, ...detail } : row)));
    } catch (error: unknown) {
      setPdfContentViewId(null);
      setPdfContentViewDetail(null);
      toast({
        title: "Failed",
        description: error instanceof Error ? error.message : "Could not load record",
        variant: "destructive",
      });
    } finally {
      setPdfContentViewLoading(false);
    }
  };

  const closePdfContentView = () => {
    setPdfContentViewId(null);
    setPdfContentViewDetail(null);
    setPdfContentViewLoading(false);
  };

  const fetchList = async () => {
    setIsLoading(true);
    setListLoadError(null);
    try {
      const baseQs = new URLSearchParams({ summary: "1", limit: "500" });
      if (recordsBoardFilter && recordsBoardFilter !== "__all__") {
        baseQs.set("board", recordsBoardFilter);
      }
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 180_000);
      const fetchPage = async (page: number) => {
        const qs = new URLSearchParams(baseQs);
        qs.set("page", String(page));
        const res = await fetch(`${API_BASE_URL}/api/pdf/list?${qs.toString()}`, {
          headers: authHeaders(),
          signal: controller.signal,
        });
        const json = await res.json();
        if (!res.ok || json?.success === false) {
          throw new Error(json?.message || "Could not load PDF list");
        }
        return json as {
          data?: PdfItem[];
          pagination?: { totalPages?: number; total?: number };
          listMeta?: {
            newGenerationCount?: number;
            legacyRecordCount?: number;
            orphanSourceCount?: number;
          };
          tokenUsageSummary?: TokenUsageSummary;
        };
      };
      let first;
      try {
        first = await fetchPage(1);
      } finally {
        window.clearTimeout(timeoutId);
      }
      const totalPages = Math.max(1, Number(first.pagination?.totalPages) || 1);
      const allRows: PdfItem[] = Array.isArray(first.data) ? [...first.data] : [];
      setItems(allRows);
      setListMeta(first.listMeta ?? null);
      if (first.tokenUsageSummary) {
        setOverallTokenSummary(first.tokenUsageSummary);
      }
      setIsLoading(false);

      if (totalPages > 1) {
        setIsLoadingMoreList(true);
        void (async () => {
          try {
            for (let page = 2; page <= totalPages; page += 1) {
              const json = await fetchPage(page);
              if (Array.isArray(json.data) && json.data.length > 0) {
                setItems((prev) => {
                  const seen = new Set(prev.map((r) => r._id));
                  const extra = json.data!.filter((r) => !seen.has(r._id));
                  return extra.length > 0 ? [...prev, ...extra] : prev;
                });
              }
            }
          } catch {
            toast({
              title: "Partial list loaded",
              description:
                "Some older records may still be loading. Refresh the page or set board filter to All boards.",
              variant: "destructive",
            });
          } finally {
            setIsLoadingMoreList(false);
          }
        })();
      } else {
        setIsLoadingMoreList(false);
      }
    } catch (error: unknown) {
      setItems([]);
      const message =
        error instanceof Error && error.name === "AbortError"
          ? "Request timed out. Try filtering by board or refresh."
          : error instanceof Error
            ? error.message
            : "Could not load PDF list";
      setListLoadError(message);
      toast({
        title: "Failed",
        description: message,
        variant: "destructive",
      });
      setIsLoading(false);
    }
  };

  const reviewAction = async (id: string, action: "approve" | "reject") => {
    setReviewingId(id);
    try {
      const res = await fetch(`${API_BASE_URL}/api/pdf/${id}/review`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.message || "Review failed");
      toast({ title: "Success", description: `Record ${action}d successfully.` });
      await fetchList();
    } catch (error: any) {
      toast({ title: "Review failed", description: error?.message || "Could not complete action", variant: "destructive" });
    } finally {
      setReviewingId("");
    }
  };

  useEffect(() => {
    let cancelled = false;
    const fetchBoards = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/super-admin/ai-tool-topics/options`, {
          headers: authHeaders(),
          credentials: "include",
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
            headers: authHeaders(),
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
    void fetchBoards();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    fetchClasses();
  }, [board]);

  useEffect(() => {
    void fetchList();
  }, [recordsBoardFilter]);

  useEffect(() => {
    if (!classLabel) {
      setSubjectRows([]);
      return;
    }
    fetchSubjects(classLabel);
  }, [classLabel, board]);

  useEffect(() => {
    if (!classLabel || !subject) {
      setTopicRows([]);
      return;
    }
    fetchTopics(classLabel, subject);
  }, [classLabel, subject, board]);

  useEffect(() => {
    if (!classLabel || !subject || !topic) {
      setSubtopicRows([]);
      return;
    }
    fetchSubtopics(classLabel, subject, topic);
  }, [classLabel, subject, topic, board]);

  useEffect(() => {
    const label = subjectLabelFromRows(subjectRows, subject);
    if (isStoryLanguageTool(toolType)) {
      if (!subject || isStoryPassageLanguageSubject(label)) return;
      setSubject("");
      setTopic("");
      setSubTopic("");
      return;
    }
    if (isLanguageExcludedTool(toolType)) {
      if (!subject || !isStoryPassageLanguageSubject(label)) return;
      setSubject("");
      setTopic("");
      setSubTopic("");
    }
  }, [toolType, subject, subjectRows]);

  const handleToolTypeChange = (value: string) => {
    setToolType(value);
    const label = subjectLabelFromRows(subjectRows, subject);
    if (isStoryLanguageTool(value)) {
      if (subject && !isStoryPassageLanguageSubject(label)) {
        setSubject("");
        setTopic("");
        setSubTopic("");
      }
      return;
    }
    if (isLanguageExcludedTool(value)) {
      if (subject && isStoryPassageLanguageSubject(label)) {
        setSubject("");
        setTopic("");
        setSubTopic("");
      }
    }
  };

  const analyzePdfFile = async (file: File) => {
    setAnalyzingPdf(true);
    setPdfAnalysis(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${API_BASE_URL}/api/pdf/analyze`, {
        method: "POST",
        headers: authHeaders(),
        body: form,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success) {
        throw new Error(json?.message || "PDF analysis failed");
      }
      const data = json.data as {
        contentFamily?: string;
        confidence?: number;
        questionCount?: number;
        extractionOk?: boolean;
        useGemini?: boolean;
        suggestedToolSlug?: string;
        suggestedToolLabel?: string;
        recommendedTools?: { tool?: string; toolLabel?: string; confidence?: number }[];
      };
      setPdfAnalysis({
        contentFamily: String(data.contentFamily || "UNKNOWN"),
        confidence: Number(data.confidence || 0),
        questionCount: Number(data.questionCount || 0),
        extractionOk: Boolean(data.extractionOk),
        useGemini: Boolean(data.useGemini),
        suggestedToolSlug: String(data.suggestedToolSlug || ""),
        suggestedToolLabel: String(data.suggestedToolLabel || ""),
        recommendedTools: Array.isArray(data.recommendedTools) ? data.recommendedTools : [],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "PDF analysis failed";
      toast({ title: "Analysis skipped", description: message, variant: "destructive" });
      setPdfAnalysis(null);
    } finally {
      setAnalyzingPdf(false);
    }
  };

  const handleUpload = async () => {
    if (!pdfFile || !board || !subject || !classLabel || !topic || !toolType) {
      setUploadError("Choose a PDF file, board, class, subject, topic, and tool.");
      toast({ title: "Missing fields", description: "Choose a PDF file, board, class, subject, topic, and tool." });
      return;
    }
    const subjectLabel = subjectLabelFromRows(subjectRows, subject);
    if (isStoryLanguageTool(toolType) && !isStoryPassageLanguageSubject(subjectLabel)) {
      const msg = "Story & Passage Creator works only with English, Hindi, or Telugu subjects.";
      setUploadError(msg);
      toast({ title: "English, Hindi, or Telugu only", description: msg, variant: "destructive" });
      return;
    }
    if (isLanguageExcludedTool(toolType) && isStoryPassageLanguageSubject(subjectLabel)) {
      setUploadError(LANGUAGE_EXCLUDED_TOOL_ERROR);
      toast({ title: "Language subjects not supported", description: LANGUAGE_EXCLUDED_TOOL_ERROR, variant: "destructive" });
      return;
    }
    if (pdfFile.size > AI_PDF_MAX_BYTES) {
      const msg = `PDF is larger than ${AI_PDF_MAX_MB} MB. Choose a smaller file or split the document.`;
      setUploadError(msg);
      toast({ title: "File too large", description: msg, variant: "destructive" });
      return;
    }
    setIsUploading(true);
    setUploadStep("uploading");
    setUploadError("");
    setLastUploadResult(null);
    setMismatchDetails(null);
    try {
      const form = new FormData();
      form.append("file", pdfFile);
      form.append("board", board);
      form.append("subject", subject);
      form.append("subjectLabel", subjectLabel);
      form.append("class", classLabel);
      form.append("chapter", topic);
      form.append("topic", topic);
      form.append("subTopic", String(subTopic || "").trim());
      form.append("toolType", toolType);
      setUploadStep("indexing");
      setUploadStep("generating");
      setUploadStep("validating");
      const res = await fetch(`${API_BASE_URL}/api/pdf/upload`, {
        method: "POST",
        headers: authHeaders(),
        body: form,
      });
      setUploadStep("saving");
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success) {
        type UploadErrData = {
          detectedSubject?: string;
          detectedTopic?: string;
          detectedTool?: string;
          selectedSubject?: string;
          selectedTopic?: string;
          selectedTool?: string;
        };
        const data = json?.data as UploadErrData | undefined;
        const err = new Error(json?.message || "Upload failed") as Error & {
          data?: UploadErrData;
          code?: string;
        };
        err.data = data;
        err.code = typeof json?.code === "string" ? json.code : undefined;
        throw err;
      }
      const totalSaved = Number(json?.data?.totalSaved || 1);
      const totalGenerationsFound = Number(
        json?.data?.totalGenerationsFound || json?.data?.totalSaved || 1,
      );
      const pdfCode = String(json?.data?.pdfCode || "").trim();
      const generationMarkerLabel = String(json?.data?.generationMarkerLabel || "Generation").trim();
      const extractedFromPdf = Number(json?.data?.extractedFromPdf || 0);
      const generatedByAI = Number(json?.data?.generatedByAI || 0);
      const extraction = json?.data?.extraction as
        | {
            validationPassed?: boolean;
            retryCount?: number;
            expectedItemCount?: number;
            validationErrors?: string[];
          }
        | undefined;
      const classification = json?.data?.classification as
        | {
            family?: string;
            confidence?: number;
            recommendedTools?: { tool?: string; toolLabel?: string; confidence?: number }[];
          }
        | undefined;
      setUploadStep("done");
      setLastUploadResult({ totalSaved });
      const tokenUsage = json?.data?.tokenUsage as TokenUsageSnapshot | undefined;
      setLastTokenUsage(tokenUsage?.totals ? tokenUsage : null);
      const retryNote =
        extraction?.retryCount && extraction.retryCount > 0
          ? ` (${extraction.retryCount} validation retries)`
          : "";
      const validationNote =
        extraction?.validationPassed === false
          ? " Some fields may be incomplete — review saved records."
          : "";
      const tokenNote = tokenUsage?.totals
        ? ` Tokens: ${formatTokenCount(tokenUsage.totals.totalTokens)} total (${formatTokenCount(tokenUsage.totals.promptTokens)} in / ${formatTokenCount(tokenUsage.totals.completionTokens)} out, ${tokenUsage.totals.callCount} LLM calls).`
        : "";
      const familyNote = classification?.family
        ? ` Family: ${classification.family}${classification.confidence != null ? ` (${classification.confidence}%)` : ""}.`
        : "";
      const toolRecNote =
        classification?.recommendedTools?.length
          ? ` Suggested: ${classification.recommendedTools
              .slice(0, 2)
              .map((t) => `${t.toolLabel || t.tool} (${t.confidence ?? "?"}%)`)
              .join(", ")}.`
          : "";
      toast({
        title: `PDF Processed — ${totalGenerationsFound} generation${totalGenerationsFound !== 1 ? "s" : ""} found`,
        description:
          `Total Generations Found: ${totalGenerationsFound}${pdfCode ? ` (${pdfCode})` : ""}. ` +
          `${totalSaved} ${generationMarkerLabel.toLowerCase()} record${totalSaved !== 1 ? "s" : ""} saved. ` +
          (generatedByAI > 0
            ? `${generatedByAI} AI-generated from PDF (RAG)${retryNote}.${validationNote}`
            : `${extractedFromPdf} extracted from PDF${retryNote}.${validationNote}`) +
          familyNote +
          toolRecNote +
          tokenNote,
      });
      setUploadError("");
      setMismatchDetails(null);
      setPdfFile(null);
      if (pdfInputRef.current) pdfInputRef.current.value = "";
      fetchList();
    } catch (error: unknown) {
      const errObj = error as Error & {
        code?: string;
        data?: {
          detectedSubject?: string;
          detectedTopic?: string;
          detectedTool?: string;
          selectedSubject?: string;
          selectedTopic?: string;
          selectedTool?: string;
        };
      };
      const message = error instanceof Error ? error.message : "Failed to upload";
      const data = errObj?.data;
      setUploadError(message);
      setUploadStep("error");
      if (
        data &&
        (data.detectedSubject !== undefined ||
          data.detectedTopic !== undefined ||
          data.detectedTool !== undefined ||
          data.selectedSubject !== undefined ||
          data.selectedTopic !== undefined)
      ) {
        setMismatchDetails({
          selectedSubject: data.selectedSubject,
          detectedSubject: data.detectedSubject,
          selectedTopic: data.selectedTopic,
          detectedTopic: data.detectedTopic,
          selectedTool: data.selectedTool,
          detectedTool: data.detectedTool,
        });
      }
      const toastTitle =
        errObj?.code === "PDF_GENERATION_DUPLICATE"
          ? "Duplicate generation detected"
          : errObj?.code === "PDF_KNOWLEDGE_EXTRACTION_FAILED"
            ? "PDF extraction failed"
            : errObj?.code === "PDF_KNOWLEDGE_EMPTY"
              ? "No content found in PDF"
              : "Generate failed";
      toast({ title: toastTitle, description: message, variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  const deletePdf = async (id: string) => {
    const record = items.find((row) => row._id === id);
    setDeletingPdfId(id);
    try {
      const endpoint = isPdfGenerationRecord(record || { _id: id, originalName: "", fileUrl: "", subject: "", classLabel: "", chapter: "", chunkCount: 0, uploadDate: "", processingStatus: "pending" })
        ? `${API_BASE_URL}/api/generations/${id}`
        : `${API_BASE_URL}/api/pdf/${id}`;
      const res = await fetch(endpoint, {
        method: "DELETE",
        headers: authHeaders(),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.message || "Delete failed");
      setItems((prev) => prev.filter((row) => row._id !== id));
      if (pdfContentViewId === id) closePdfContentView();
      toast({ title: "Deleted", description: json?.message || "Record deleted." });
    } catch (error: any) {
      toast({ title: "Delete failed", description: error?.message || "Could not delete", variant: "destructive" });
    } finally {
      setDeletingPdfId("");
    }
  };

  const subtopicSectionKey = (
    tool: string,
    classLabel: string,
    board: string,
    subject: string,
    topic: string,
    subtopic: string,
  ) => `subtopic:${tool}:${classLabel}:${board}:${subject}:${topic}:${subtopic}`;

  const deleteAllSubtopicRecords = async (
    records: PdfItem[],
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
      const res = await fetch(`${API_BASE_URL}/api/pdf/bulk-delete`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        throw new Error(json?.message || "Bulk delete failed");
      }
      const deletedIds = new Set(ids);
      setItems((prev) => prev.filter((row) => !deletedIds.has(row._id)));
      if (pdfContentViewId && deletedIds.has(pdfContentViewId)) closePdfContentView();
      const deleted = Number(json.deletedCount ?? ids.length);
      const failed = Number(json.failedCount ?? 0);
      toast({
        title: "Deleted",
        description:
          failed > 0
            ? `Removed ${deleted} record(s); ${failed} could not be deleted.`
            : `Removed ${deleted} record(s) from this subtopic.`,
      });
    } catch (error: unknown) {
      toast({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Could not delete subtopic records",
        variant: "destructive",
      });
    } finally {
      setDeletingSubtopicKey(null);
    }
  };

  return (
    <div className="space-y-3 sm:space-y-4 lg:space-y-6 max-lg:space-y-4">
      {ConfirmDialog}
      <Card>
        <CardHeader>
          <CardTitle>AI PDF</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          <div className="md:col-span-2 lg:col-span-4">
            <Label className={labelClassName}>
              Upload PDF file {reqStar}
            </Label>
            <Input
              ref={pdfInputRef}
              type="file"
              accept="application/pdf,.pdf"
              className={cn(fieldClassName, "cursor-pointer")}
              disabled={isUploading}
              onChange={(e) => {
                const next = e.target.files?.[0] ?? null;
                if (!next) {
                  setPdfFile(null);
                  return;
                }
                const ok = next.type === "application/pdf" || /\.pdf$/i.test(next.name);
                if (!ok) {
                  toast({
                    title: "Invalid file",
                    description: "Please choose a PDF file.",
                    variant: "destructive",
                  });
                  e.target.value = "";
                  setPdfFile(null);
                  return;
                }
                if (next.size > AI_PDF_MAX_BYTES) {
                  const msg = `Maximum size is ${AI_PDF_MAX_MB} MB.`;
                  toast({ title: "File too large", description: msg, variant: "destructive" });
                  e.target.value = "";
                  setPdfFile(null);
                  setUploadError(msg);
                  return;
                }
                setPdfFile(next);
                setMismatchDetails(null);
                setUploadError("");
                setPdfAnalysis(null);
                void analyzePdfFile(next);
              }}
            />
            {pdfFile ? (
              <p className="mt-1.5 truncate text-xs text-slate-600">
                Selected: {pdfFile.name} ({(pdfFile.size / (1024 * 1024)).toFixed(2)} MB · max {AI_PDF_MAX_MB} MB)
              </p>
            ) : (
              <p className="mt-1.5 text-xs text-slate-500">
                Choose PDF (max {AI_PDF_MAX_MB} MB per file), fill class → subject → topic → tool, then Generate. One Gemini call builds a shared knowledge base; all tools render from stored JSON (zero AI on view).
              </p>
            )}
            {analyzingPdf && (
              <p className="mt-2 text-xs text-blue-700">Analyzing PDF content (no LLM)...</p>
            )}
            {pdfAnalysis && !analyzingPdf && (
              <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 space-y-1.5">
                <p>
                  <span className="font-medium">Detected family:</span> {pdfAnalysis.contentFamily}{" "}
                  ({pdfAnalysis.confidence}% confidence)
                  {pdfAnalysis.questionCount > 0 ? ` · ${pdfAnalysis.questionCount} questions` : ""}
                </p>
                <p>
                  <span className="font-medium">Extraction:</span>{" "}
                  {pdfAnalysis.extractionOk ? "content found (zero-LLM path)" : "may need AI fallback"}
                  {pdfAnalysis.useGemini ? " · low confidence" : " · no Gemini needed"}
                </p>
                {pdfAnalysis.recommendedTools.length > 0 && (
                  <p>
                    <span className="font-medium">Suggested tools:</span>{" "}
                    {pdfAnalysis.recommendedTools
                      .slice(0, 3)
                      .map((t) => `${t.toolLabel || t.tool} (${t.confidence ?? "?"}%)`)
                      .join(", ")}
                  </p>
                )}
                {pdfAnalysis.suggestedToolSlug && pdfAnalysis.suggestedToolSlug !== toolType && (
                  <button
                    type="button"
                    className="text-blue-700 underline hover:text-blue-900"
                    onClick={() => handleToolTypeChange(pdfAnalysis.suggestedToolSlug)}
                  >
                    Use suggested: {pdfAnalysis.suggestedToolLabel || getToolLabel(pdfAnalysis.suggestedToolSlug)}
                  </button>
                )}
              </div>
            )}
          </div>

          <div>
            <Label className={labelClassName}>
              Board {reqStar}
            </Label>
            <Select
              value={board}
              onValueChange={(value) => {
                setBoard(value);
                setClassLabel("");
                setSubject("");
                setTopic("");
                setSubTopic("");
              }}
            >
              <SelectTrigger className={fieldClassName}>
                <SelectValue placeholder="Select board" />
              </SelectTrigger>
              <SelectContent>
                {boardOptions.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className={labelClassName}>
              Class {reqStar}
            </Label>
            <Select
              value={classLabel}
              onValueChange={(value) => {
                setClassLabel(value);
                setSubject("");
                setTopic("");
                setSubTopic("");
              }}
              disabled={!board || (loadingClasses && sortedClassOptions.length === 0)}
            >
              <SelectTrigger className={fieldClassName}>
                <SelectValue placeholder={!board ? "Select board first" : (loadingClasses ? "Loading classes..." : "Select class")} />
              </SelectTrigger>
              <SelectContent>
                {sortedClassOptions.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className={labelClassName}>
              Subject {reqStar}
            </Label>
            <Select
              value={subject}
              onValueChange={(value) => {
                setSubject(value);
                setTopic("");
                setSubTopic("");
              }}
              disabled={!board || !classLabel || loadingSubjects}
            >
              <SelectTrigger className={fieldClassName}>
                <SelectValue
                  placeholder={
                    !board
                      ? "Select board first"
                      : !classLabel
                        ? "Select class first"
                      : loadingSubjects
                        ? "Loading subjects..."
                        : "Select subject"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {subjectRowsForTool.map((row) => (
                  <SelectItem key={row.value} value={row.value}>
                    {row.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className={labelClassName}>
              Topic {reqStar}
            </Label>
            <Select
              value={topic}
              onValueChange={(value) => {
                setTopic(value);
                setSubTopic("");
              }}
              disabled={!board || !classLabel || !subject || loadingTopics}
            >
              <SelectTrigger className={fieldClassName}>
                <SelectValue
                  placeholder={
                    !subject
                      ? "Select subject first"
                      : loadingTopics
                        ? "Loading topics..."
                        : "Select topic"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {topicRows.map((row) => (
                  <SelectItem key={row.value} value={row.value}>
                    {row.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className={labelClassName}>Sub Topic</Label>
            <Select
              value={subTopic}
              onValueChange={setSubTopic}
              disabled={!board || !classLabel || !subject || !topic || loadingSubtopics}
            >
              <SelectTrigger className={fieldClassName}>
                <SelectValue
                  placeholder={
                    !topic
                      ? "Select topic first"
                      : loadingSubtopics
                        ? "Loading sub topics..."
                        : "Select sub topic"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {subtopicRows.map((row) => (
                  <SelectItem key={row.value} value={row.value}>
                    {row.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2 lg:col-span-2">
            <Label className={labelClassName}>
              Tool {reqStar}
            </Label>
            <Select value={toolType} onValueChange={handleToolTypeChange}>
              <SelectTrigger className={fieldClassName}>
                <SelectValue placeholder="Select tool" />
              </SelectTrigger>
              <SelectContent>
                {toolOptions.map((tool) => (
                  <SelectItem key={tool.value} value={tool.value}>
                    {tool.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isStoryLanguageTool(toolType) ? (
              <p className="mt-1.5 text-xs text-blue-800">
                English, Hindi, and Telugu subjects only for Story &amp; Passage Creator.
              </p>
            ) : null}
            {isLanguageExcludedTool(toolType) ? (
              <p className="mt-1.5 text-xs text-amber-900">
                Not available for English, Hindi, or Telugu subjects.
              </p>
            ) : null}
          </div>

          <div className="flex items-end md:col-span-2 lg:col-span-4">
            <Button
              type="button"
              onClick={() => void handleUpload()}
              disabled={isUploading}
              className="h-11 w-full bg-blue-600 hover:bg-blue-700"
            >
              {isUploading ? "Generating..." : "Generate"}
            </Button>
          </div>

          {uploadStep !== "idle" && uploadStep !== "done" && uploadStep !== "error" && (
            <div className="md:col-span-2 lg:col-span-4 flex items-center gap-2 text-xs sm:text-sm text-blue-700 bg-blue-50 px-4 py-2 rounded-lg">
              <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 animate-spin" />
              {STEP_MESSAGES[uploadStep]}
            </div>
          )}

          {uploadStep === "done" && lastUploadResult && (
            <div className="md:col-span-2 lg:col-span-4 space-y-1 text-xs sm:text-sm text-emerald-700 bg-emerald-50 px-4 py-2 rounded-lg">
              <p>{`✅ ${lastUploadResult.totalSaved} record${lastUploadResult.totalSaved !== 1 ? "s" : ""} saved successfully`}</p>
              {lastTokenUsage?.totals ? (
                <p className="text-emerald-800/90">
                  This generation used{" "}
                  <span className="font-semibold">{formatTokenCount(lastTokenUsage.totals.totalTokens)} tokens</span>
                  {" "}({formatTokenCount(lastTokenUsage.totals.promptTokens)} prompt +{" "}
                  {formatTokenCount(lastTokenUsage.totals.completionTokens)} completion,{" "}
                  {lastTokenUsage.totals.callCount} LLM call
                  {lastTokenUsage.totals.callCount !== 1 ? "s" : ""}).
                </p>
              ) : null}
              {lastTokenUsage?.calls && lastTokenUsage.calls.length > 0 ? (
                <ul className="mt-1 list-disc pl-5 text-mini text-emerald-900/80 space-y-0.5">
                  {lastTokenUsage.calls.slice(0, 8).map((call, idx) => (
                    <li key={`token-call-${idx}`}>
                      {call.label}: {formatTokenCount(call.totalTokens)} tokens
                      {call.model ? ` (${call.model})` : ""}
                    </li>
                  ))}
                  {lastTokenUsage.calls.length > 8 ? (
                    <li>+{lastTokenUsage.calls.length - 8} more LLM calls</li>
                  ) : null}
                </ul>
              ) : null}
            </div>
          )}

          {mismatchDetails && (
            <div className="md:col-span-2 lg:col-span-4 rounded-md bg-amber-50 border border-amber-300 px-3 py-2 text-xs text-amber-900 space-y-2">
              <p className="font-semibold">PDF mismatch detected:</p>
              {mismatchDetails.selectedSubject ? (
                <p>
                  Subject — Selected: <strong>{mismatchDetails.selectedSubject}</strong>
                  {" "}
                  | Detected: <strong>{mismatchDetails.detectedSubject || "Unknown"}</strong>
                </p>
              ) : null}
              {mismatchDetails.selectedTopic ? (
                <p>
                  Topic — Selected: <strong>{mismatchDetails.selectedTopic}</strong>
                  {" "}
                  | Detected: <strong>{mismatchDetails.detectedTopic || "Unknown"}</strong>
                </p>
              ) : null}
              {mismatchDetails.selectedTool ? (
                <p>
                  Tool — Selected: <strong>{mismatchDetails.selectedTool}</strong>
                  {" "}
                  | Detected: <strong>{mismatchDetails.detectedTool || "Unknown"}</strong>
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-8"
                  onClick={() => {
                    const detectedSubject = String(mismatchDetails.detectedSubject || "").trim();
                    const detectedTopic = String(mismatchDetails.detectedTopic || "").trim();
                    const detectedTool = String(mismatchDetails.detectedTool || "").trim();
                    let applied = false;
                    if (detectedSubject) {
                      const subjectMatch = subjectRows.find(
                        (row) =>
                          String(row.value).localeCompare(detectedSubject, undefined, {
                            sensitivity: "base",
                          }) === 0 ||
                          String(row.label).localeCompare(detectedSubject, undefined, {
                            sensitivity: "base",
                          }) === 0,
                      );
                      if (subjectMatch) {
                        setSubject(String(subjectMatch.value));
                        applied = true;
                      } else {
                        setSubject(detectedSubject);
                        applied = true;
                      }
                    }
                    if (detectedTopic) {
                      const topicMatch = topicRows.find(
                        (row) =>
                          String(row.value).localeCompare(detectedTopic, undefined, {
                            sensitivity: "base",
                          }) === 0 ||
                          String(row.label).localeCompare(detectedTopic, undefined, {
                            sensitivity: "base",
                          }) === 0,
                      );
                      if (topicMatch) {
                        setTopic(String(topicMatch.value));
                        applied = true;
                      } else {
                        setTopic(detectedTopic);
                        applied = true;
                      }
                    }
                    if (detectedTool) {
                      setToolType(detectedTool);
                      applied = true;
                    }
                    if (applied) {
                      setMismatchDetails(null);
                      toast({
                        title: "Curriculum mapped",
                        description: "Applied detected subject/topic from the PDF. Re-upload to generate with the new mapping.",
                      });
                    } else {
                      toast({
                        title: "Could not map",
                        description: "Detected values were empty or could not be applied.",
                        variant: "destructive",
                      });
                    }
                  }}
                >
                  Use detected curriculum
                </Button>
              </div>
              <p>Or upload a PDF that already matches your selected subject and topic.</p>
            </div>
          )}

          {uploadError && (
            <p className="md:col-span-2 lg:col-span-4 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">
              {uploadError}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1">
              <p className="text-xs sm:text-sm font-semibold text-slate-800">Saved PDF records</p>
              <p className="text-xs text-slate-500">
                Showing:{" "}
                <span className="font-medium text-slate-700">
                  {recordsBoardFilter === "__all__" ? "All boards" : recordsBoardFilter}
                </span>
                {!isLoading && visiblePdfItems.length > 0 ? (
                  <>
                    {" "}
                    ·{" "}
                    <span className="font-medium text-slate-700">
                      {visiblePdfItems.length} record{visiblePdfItems.length !== 1 ? "s" : ""} in{" "}
                      {groupedHierarchy.length} tool{groupedHierarchy.length !== 1 ? "s" : ""}
                      {listMeta &&
                      (listMeta.legacyRecordCount != null || listMeta.newGenerationCount != null) ? (
                        <>
                          {" "}
                          (
                          {Number(listMeta.legacyRecordCount || 0)} legacy
                          {Number(listMeta.newGenerationCount || 0) > 0
                            ? ` · ${Number(listMeta.newGenerationCount)} new`
                            : ""}
                          )
                        </>
                      ) : null}
                    </span>
                    {isLoadingMoreList ? (
                      <span className="text-slate-500"> · loading more…</span>
                    ) : null}
                  </>
                ) : null}
              </p>
              <p className="text-xs text-slate-500">
                Expand each tool to browse class, subject, topic, and subtopic.
              </p>
              {overallTokenSummary && overallTokenSummary.generationCount > 0 ? (
                <p className="text-xs text-slate-600">
                  Overall token usage:{" "}
                  <span className="font-medium text-slate-800">
                    {formatTokenCount(overallTokenSummary.totalTokens)} tokens
                  </span>{" "}
                  across {overallTokenSummary.generationCount} generation
                  {overallTokenSummary.generationCount !== 1 ? "s" : ""} (
                  {formatTokenCount(overallTokenSummary.promptTokens)} in /{" "}
                  {formatTokenCount(overallTokenSummary.completionTokens)} out,{" "}
                  {overallTokenSummary.totalCalls} LLM calls).
                </p>
              ) : null}
            </div>
            <div className="flex flex-col gap-1.5 sm:w-64">
              <Label className={labelClassName}>Filter by board</Label>
              <Select value={recordsBoardFilter} onValueChange={setRecordsBoardFilter}>
                <SelectTrigger className={fieldClassName}>
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
          </div>
          {isLoading ? (
            <div className="flex items-center gap-2 py-4 text-gray-600">
              <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
              <p className="text-xs sm:text-sm">Loading hierarchy…</p>
            </div>
          ) : listLoadError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs sm:text-sm text-red-800">
              {listLoadError}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2 h-8"
                onClick={() => void fetchList()}
              >
                Retry
              </Button>
            </div>
          ) : groupedHierarchy.length === 0 ? (
            <p className="text-xs sm:text-sm text-gray-600">
              No saved AI content records
              {recordsBoardFilter !== "__all__"
                ? ` for board “${recordsBoardFilter}”. Try “All boards” in the filter above.`
                : " yet."}
            </p>
          ) : (
            <Accordion type="multiple" className="w-full space-y-2 max-lg:space-y-1.5">
              {groupedHierarchy.map((toolNode) => (
                <AccordionItem
                  key={toolNode.tool}
                  value={`tool:${toolNode.tool}`}
                  className="rounded-md border px-2 sm:px-2.5 lg:px-3"
                >
                  <AccordionTrigger className="py-3 no-underline hover:no-underline max-lg:py-2.5 [&>svg]:shrink-0">
                    <div className="flex min-w-0 flex-1 items-center gap-2 text-left">
                      <Wrench className="h-3 w-3 sm:h-4 sm:w-4 shrink-0 text-orange-600" />
                      <Badge className="shrink-0 bg-orange-500 hover:bg-orange-500">Tool</Badge>
                      <span className="min-w-0 flex-1 break-words font-medium text-xs sm:text-sm">{toolNode.tool}</span>
                      <Badge className="shrink-0" variant="outline">
                        {toolNode.recordCount} generation{toolNode.recordCount !== 1 ? "s" : ""}
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-2">
                    <Accordion type="multiple" className="w-full space-y-2">
                      {toolNode.classes.map((classNode) => (
                        <AccordionItem
                          key={`${toolNode.tool}:${classNode.classLabel}:${classNode.board}`}
                          value={`class:${toolNode.tool}:${classNode.classLabel}:${classNode.board}`}
                          className="rounded-md border px-2 sm:px-2.5 lg:px-3"
                        >
                          <AccordionTrigger className="py-2.5 no-underline hover:no-underline max-lg:py-2 [&>svg]:shrink-0">
                            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-left">
                              <School className="h-3 w-3 sm:h-4 sm:w-4 shrink-0 text-slate-600" />
                              <Badge className="shrink-0" variant="secondary">
                                Class
                              </Badge>
                              <span className="min-w-0 break-words text-xs sm:text-sm">{classNode.classLabel}</span>
                              <Badge className="shrink-0" variant="outline">
                                {classNode.board || "-"}
                              </Badge>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="space-y-2">
                            <Accordion type="multiple" className="w-full space-y-2">
                              {classNode.subjects.map((subjectNode) => (
                                <AccordionItem
                                  key={`${toolNode.tool}:${classNode.classLabel}:${classNode.board}:${subjectNode.subject}`}
                                  value={`subject:${toolNode.tool}:${classNode.classLabel}:${classNode.board}:${subjectNode.subject}`}
                                  className="rounded-md border px-2 sm:px-2.5 lg:px-3"
                                >
                                  <AccordionTrigger className="py-2.5 no-underline hover:no-underline max-lg:py-2 [&>svg]:shrink-0">
                                    <div className="flex min-w-0 flex-1 items-center gap-2 text-left">
                                      <BookOpen className="h-3 w-3 sm:h-4 sm:w-4 shrink-0 text-slate-600" />
                                      <Badge className="shrink-0" variant="secondary">
                                        Subject
                                      </Badge>
                                      <span className="min-w-0 break-words text-xs sm:text-sm">{subjectNode.subject}</span>
                                    </div>
                                  </AccordionTrigger>
                                  <AccordionContent className="space-y-2">
                                    <Accordion type="multiple" className="w-full space-y-2">
                                      {subjectNode.topics.map((topicNode) => (
                                        <AccordionItem
                                          key={`${toolNode.tool}:${classNode.classLabel}:${classNode.board}:${subjectNode.subject}:${topicNode.topic}`}
                                          value={`topic:${toolNode.tool}:${classNode.classLabel}:${classNode.board}:${subjectNode.subject}:${topicNode.topic}`}
                                          className="rounded-md border px-2 sm:px-2.5 lg:px-3"
                                        >
                                          <AccordionTrigger className="py-2.5 no-underline hover:no-underline max-lg:py-2 [&>svg]:shrink-0">
                                            <div className="flex min-w-0 flex-1 items-center gap-2 text-left">
                                              <BookText className="h-3 w-3 sm:h-4 sm:w-4 shrink-0 text-slate-600" />
                                              <Badge className="shrink-0" variant="secondary">
                                                Topic
                                              </Badge>
                                              <span className="min-w-0 break-words text-xs sm:text-sm">{topicNode.topic}</span>
                                            </div>
                                          </AccordionTrigger>
                                          <AccordionContent className="space-y-2">
                                            <Accordion type="multiple" className="w-full space-y-2">
                                              {topicNode.subtopics.map((subtopicNode) => {
                                                const subtopicKey = subtopicSectionKey(
                                                  toolNode.tool,
                                                  classNode.classLabel,
                                                  classNode.board,
                                                  subjectNode.subject,
                                                  topicNode.topic,
                                                  subtopicNode.subtopic,
                                                );
                                                const isDeletingSubtopic = deletingSubtopicKey === subtopicKey;
                                                return (
                                                <AccordionItem
                                                  key={`${toolNode.tool}:${classNode.classLabel}:${classNode.board}:${subjectNode.subject}:${topicNode.topic}:${subtopicNode.subtopic}`}
                                                  value={subtopicKey}
                                                  className="rounded-md border px-2 sm:px-2.5 lg:px-3"
                                                >
                                                  <AccordionTrigger className="py-2.5 no-underline hover:no-underline max-lg:py-2 [&>svg]:shrink-0">
                                                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-left">
                                                      <Pin className="h-3 w-3 sm:h-4 sm:w-4 shrink-0 text-slate-600" />
                                                      <Badge className="shrink-0" variant="secondary">
                                                        Subtopic
                                                      </Badge>
                                                      <span className="min-w-0 flex-1 break-words text-xs sm:text-sm lg:flex-initial">
                                                        {subtopicNode.subtopic}
                                                      </span>
                                                      <Badge className="shrink-0" variant="outline">
                                                        {subtopicNode.records.length} generations
                                                      </Badge>
                                                    </div>
                                                  </AccordionTrigger>
                                                  <AccordionContent className="space-y-2 max-lg:space-y-1.5 max-lg:pb-1">
                                                    {subtopicNode.records.length > 0 ? (
                                                      <div className="flex justify-end px-1 pb-1">
                                                        <Button
                                                          type="button"
                                                          variant="outline"
                                                          size="sm"
                                                          className="h-8 gap-1.5 rounded-lg border-red-200 text-red-700 hover:bg-red-50"
                                                          disabled={isDeletingSubtopic || !!deletingPdfId}
                                                          onClick={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            void deleteAllSubtopicRecords(
                                                              subtopicNode.records,
                                                              subtopicNode.subtopic,
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
                                                      </div>
                                                    ) : null}
                                                    {subtopicNode.records.map((record, idx) => (
                                                      <div
                                                        key={record._id}
                                                        className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm ring-1 ring-slate-900/[0.04] transition-shadow hover:shadow-md max-lg:rounded-xl"
                                                      >
                                                        <div
                                                          className="h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500 opacity-[0.92]"
                                                          aria-hidden
                                                        />
                                                        <div className="space-y-3 p-4 pt-4 max-lg:space-y-2.5 max-lg:p-3 max-lg:pt-3">
                                                          <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-start lg:justify-between">
                                                            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                                                              <div className="flex flex-wrap items-center gap-2">
                                                                <FolderOpen className="h-3 w-3 sm:h-4 sm:w-4 shrink-0 text-slate-500" />
                                                                <Badge variant="outline" className="font-medium">
                                                                  {pdfGenerationBadge(record, idx)}
                                                                </Badge>
                                                                {record.pdfCode ? (
                                                                  <span className="text-micro text-slate-400 font-mono">
                                                                    {record.pdfCode}
                                                                  </span>
                                                                ) : null}
                                                                <span className="hidden text-xs text-slate-500 tabular-nums lg:inline">
                                                                  {new Date(record.uploadDate).toLocaleString()}
                                                                </span>
                                                              </div>
                                                              <span className="pl-6 text-xs text-slate-500 tabular-nums lg:hidden">
                                                                {new Date(record.uploadDate).toLocaleString()}
                                                              </span>
                                                              <p className="text-xs sm:text-sm font-medium leading-snug text-slate-800 line-clamp-2 pl-6 sm:pl-0">
                                                                {pdfRecordPreviewLine(record)}
                                                              </p>
                                                            </div>
                                                            <div className="flex w-full min-w-0 flex-col gap-2 lg:w-auto lg:shrink-0 lg:flex-row lg:flex-wrap lg:items-center lg:justify-end">
                                                              <div className="flex min-w-0 flex-wrap items-center gap-2">
                                                                <Badge
                                                                  variant={
                                                                    record.approvalStatus === "approved" ? "default" : "secondary"
                                                                  }
                                                                  className="capitalize"
                                                                >
                                                                  {record.approvalStatus || "pending"}
                                                                </Badge>
                                                                <Badge
                                                                  variant="outline"
                                                                  className="max-w-full font-normal lg:max-w-[10rem] lg:truncate"
                                                                >
                                                                  {record.contentType || "Generated Content"}
                                                                </Badge>
                                                              </div>
                                                              <div className="flex w-full gap-2 lg:w-auto">
                                                                <Button
                                                                  type="button"
                                                                  size="sm"
                                                                  className="h-9 min-h-11 flex-1 gap-1.5 rounded-xl bg-slate-900 px-4 text-white shadow-sm hover:bg-slate-800 lg:min-h-0 lg:h-9 lg:flex-initial"
                                                                  onClick={(e) => {
                                                                    e.preventDefault();
                                                                    e.stopPropagation();
                                                                    void openPdfContentView(record._id);
                                                                  }}
                                                                >
                                                                  <Eye className="h-3 w-3 sm:h-4 sm:w-4 shrink-0" />
                                                                  View
                                                                </Button>
                                                                <Button
                                                                  type="button"
                                                                  variant="outline"
                                                                  size="icon"
                                                                  className="h-11 w-11 shrink-0 rounded-xl border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 lg:h-9 lg:w-9"
                                                                  disabled={deletingPdfId === record._id}
                                                                  aria-label={`Delete ${pdfGenerationBadge(record, idx)}`}
                                                                  onClick={(e) => {
                                                                    e.preventDefault();
                                                                    e.stopPropagation();
                                                                    void deletePdf(record._id);
                                                                  }}
                                                                >
                                                                  <Trash2 className="h-3 w-3 sm:h-4 sm:w-4" />
                                                                </Button>
                                                              </div>
                                                            </div>
                                                          </div>
                                                          <p className="border-l-2 border-blue-100 pl-3 text-xs leading-relaxed text-slate-500 max-lg:text-mini">
                                                            {pdfRecordViewHint(record)}
                                                          </p>
                                                        </div>
                                                      </div>
                                                    ))}
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

      <Dialog open={!!pdfContentViewId} onOpenChange={(open) => !open && closePdfContentView()}>
        <DialogContent className="flex max-h-[min(92vh,920px)] w-[min(100vw-1.5rem,56rem)] max-w-[56rem] flex-col gap-0 overflow-hidden rounded-2xl border-slate-200/90 p-0 shadow-2xl">
          <DialogHeader className="shrink-0 space-y-1 border-b border-slate-100 bg-gradient-to-br from-slate-50 via-white to-blue-50/50 px-3 sm:px-4 lg:px-6 py-4 text-left">
            <DialogTitle className="pr-8 text-base sm:text-lg font-semibold leading-snug tracking-tight text-slate-900">
              {pdfContentViewRecord
                ? pdfRecordPreviewLine(pdfContentViewRecord)
                : "Generation content"}
            </DialogTitle>
            {pdfContentViewRecord ? (
              <p className="text-xs text-slate-500">
                <span className="font-medium text-slate-600">{getToolLabel(pdfContentViewRecord.toolType)}</span>
                {pdfContentViewRecord.topic ? ` · ${pdfContentViewRecord.topic}` : ""}
                {pdfContentViewRecord.subTopic ? ` · ${pdfContentViewRecord.subTopic}` : ""}
                <span className="text-slate-400"> · </span>
                {new Date(pdfContentViewRecord.uploadDate).toLocaleString()}
              </p>
            ) : null}
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/60 px-4 py-4 sm:px-6 sm:py-5">
            {pdfContentViewLoading ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                <p className="text-xs sm:text-sm">Loading record…</p>
              </div>
            ) : pdfContentViewRecord ? (
              <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm sm:p-6">
                {renderEducationalContent(pdfContentViewRecord)}
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
