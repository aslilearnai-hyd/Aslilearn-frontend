import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Check, CheckCircle2, ChevronsUpDown, Loader2, RefreshCw, Search, XCircle } from "lucide-react";
import { API_BASE_URL } from "@/lib/api-config";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export type SubtopicCoverageStatus = "mapped" | "not_covered_by_source" | "mapping_gap";

const CHUNK_STATUS_LABEL: Record<string, string> = {
  mapped: "Mapped to a subtopic",
  chapter_general: "Chapter-general",
  exercise_general: "Chapter exercises",
  front_matter: "Front matter (never used)",
  needs_review: "Waiting for review (not served)",
  mapping_gap: "Teaching text without subtopic",
  rejected: "Excluded",
};

export type CurriculumMappingStatus = "ready" | "needs_review" | "unmapped" | "no_curriculum" | "not_mapped";

export type CurriculumMappingSummary = {
  status?: CurriculumMappingStatus;
  coverage?: number;
  mappedTopics?: number;
  totalTopics?: number;
  mappedSubtopics?: number;
  totalSubtopics?: number;
  /** Whole class curriculum; the totals above count only this book's chapters. */
  curriculumTopics?: number;
  curriculumSubtopics?: number;
  sectionCount?: number;
  unmappedSections?: number;
  needsReviewSections?: number;
  unmappedHighValueSections?: number;
  chunkCount?: number;
  chunksWithoutSubtopic?: number;
  frontMatterChunks?: number;
  exerciseChunks?: number;
  confidenceBands?: { high?: number; review?: number; low?: number };
  notCoveredSubtopics?: number;
  mappingGapSubtopics?: number;
  /** Chunk counts per explicit retrieval status. */
  chunkStatus?: Record<string, number>;
  gates?: Array<{ key: string; label: string; pass: boolean; detail?: string }>;
  mathQa?: {
    applicable?: boolean;
    flaggedSections?: number;
    repairedExponents?: number;
    repairedLetters?: number;
    samples?: Array<{ sectionKey: string; title?: string; snippet?: string; hits?: Record<string, number> }>;
  } | null;
  subtopicCoverage?: Array<{ aiSubtopicId: string; aiTopicKey: string; status: SubtopicCoverageStatus; manual?: boolean }>;
  mappedAt?: string | null;
};

type CurriculumSubtopic = {
  aiSubtopicId: string;
  name: string;
  number?: string;
  chunkCount: number;
  assets: Record<string, number>;
};

type CurriculumTopic = {
  aiTopicKey: string;
  topicName: string;
  topicNumber?: string;
  topicLevelChunks: number;
  subtopics: CurriculumSubtopic[];
};

type MappedSection = {
  sectionKey: string;
  level: number;
  /** "exercise" = end-of-chapter practice block, "synopsis" = chapter-level note. */
  kind?: string;
  number?: string;
  title?: string;
  chapterTitle?: string;
  pageStart?: number | null;
  pageEnd?: number | null;
  wordCount?: number;
  preview?: string;
  aiTopicKey?: string;
  aiTopicName?: string;
  aiSubtopicId?: string;
  aiSubtopicName?: string;
  mappingStatus?: string;
  mappingConfidence?: number;
  mappingMethod?: string;
};

type MappingResponse = {
  mapping: CurriculumMappingSummary;
  curriculum: CurriculumTopic[];
  sections: MappedSection[];
};

type TestResult = {
  passed: boolean;
  mismatchCount?: number;
  route?: { mode?: string; status?: string; reason?: string };
  chunks: Array<{ chunkId: string; score: number; aiSubtopicName?: string; pages?: Array<number | null>; preview?: string }>;
};

const STATUS_LABEL: Record<string, string> = {
  ready: "Mapped",
  needs_review: "Needs review",
  unmapped: "Unmapped",
  no_curriculum: "No curriculum",
  not_mapped: "Not mapped",
};

const STATUS_CLASS: Record<string, string> = {
  ready: "bg-emerald-100 text-emerald-800",
  needs_review: "bg-amber-100 text-amber-800",
  unmapped: "bg-red-100 text-red-800",
  no_curriculum: "bg-slate-100 text-slate-700",
  not_mapped: "bg-slate-100 text-slate-700",
};

const SECTION_STATUS_CLASS: Record<string, string> = {
  auto_mapped: "bg-emerald-50 text-emerald-700 border-emerald-200",
  reviewed: "bg-sky-50 text-sky-700 border-sky-200",
  needs_review: "bg-amber-50 text-amber-800 border-amber-200",
  unmapped: "bg-red-50 text-red-700 border-red-200",
  rejected: "bg-slate-100 text-slate-500 border-slate-200",
};

/** Small badge for book cards; falls back to "Not mapped" for pre-migration books. */
export function CurriculumMappingBadge({ mapping }: { mapping?: CurriculumMappingSummary | null }) {
  const status = mapping?.status || "not_mapped";
  const subtopics =
    mapping?.totalSubtopics && status !== "no_curriculum"
      ? ` · ${mapping.mappedSubtopics || 0}/${mapping.totalSubtopics} subtopics`
      : "";
  return (
    <Badge className={STATUS_CLASS[status] || STATUS_CLASS.not_mapped}>
      Curriculum: {STATUS_LABEL[status] || status}
      {subtopics}
    </Badge>
  );
}

function Stat({ label, value, warn, hint }: { label: string; value: string | number; warn?: boolean; hint?: string }) {
  return (
    <div className={cn("rounded-lg border p-3", warn ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white")}>
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className={cn("text-lg font-semibold", warn ? "text-amber-800" : "text-slate-900")}>{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{hint}</p> : null}
    </div>
  );
}

function formatPages(start?: number | null, end?: number | null) {
  if (start == null) return "";
  return end != null && end !== start ? `p. ${start}–${end}` : `p. ${start}`;
}

/** Select values must be non-empty: encode the target kind in the value. */
const subValue = (id: string) => `sub:${id}`;
const topicValue = (key: string) => `topic:${key}`;

/** Searchable topic / subtopic picker (a book can have 80+ subtopics). */
function CurriculumTargetPicker({
  curriculum,
  value,
  disabled,
  onChange,
}: {
  curriculum: CurriculumTopic[];
  value?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const label = useMemo(() => {
    if (!value) return "";
    for (const topic of curriculum) {
      if (value === topicValue(topic.aiTopicKey)) return `${topic.topicName} (chapter-general)`;
      const sub = topic.subtopics.find((s) => value === subValue(s.aiSubtopicId));
      if (sub) return `${sub.number ? `${sub.number} ` : ""}${sub.name}`;
    }
    return "";
  }, [curriculum, value]);

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="h-auto min-h-10 min-w-0 flex-1 justify-between whitespace-normal py-2 text-left font-normal"
        >
          <span className={cn("min-w-0 break-words", !label && "text-slate-400")}>
            {label || "Map to a topic / subtopic…"}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(92vw,420px)] p-0" align="end">
        <Command>
          <CommandInput placeholder="Search topic or subtopic…" />
          <CommandList className="max-h-80">
            <CommandEmpty>No match.</CommandEmpty>
            {curriculum.map((topic) => (
              <CommandGroup key={topic.aiTopicKey} heading={topic.topicName}>
                <CommandItem
                  value={`${topic.topicName} whole topic ${topic.aiTopicKey}`}
                  onSelect={() => {
                    onChange(topicValue(topic.aiTopicKey));
                    setOpen(false);
                  }}
                  className="font-semibold"
                >
                  <Check className={cn("mr-2 h-4 w-4", value === topicValue(topic.aiTopicKey) ? "opacity-100" : "opacity-0")} />
                  {topic.topicName} (chapter-general)
                </CommandItem>
                {topic.subtopics.map((sub) => (
                  <CommandItem
                    key={sub.aiSubtopicId}
                    // Topic name is part of the search text so "square" finds every subtopic of that chapter.
                    value={`${sub.number || ""} ${sub.name} ${topic.topicName} ${sub.aiSubtopicId}`}
                    onSelect={() => {
                      onChange(subValue(sub.aiSubtopicId));
                      setOpen(false);
                    }}
                    className="pl-6"
                  >
                    <Check className={cn("mr-2 h-4 w-4", value === subValue(sub.aiSubtopicId) ? "opacity-100" : "opacity-0")} />
                    {sub.number ? `${sub.number} ` : ""}
                    {sub.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function BookCurriculumMappingDialog({
  bookId,
  bookTitle,
  open,
  onOpenChange,
  authHeaders,
  onChanged,
}: {
  bookId: string | null;
  bookTitle?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  authHeaders: () => Record<string, string>;
  onChanged?: () => void;
}) {
  const { toast } = useToast();
  const [data, setData] = useState<MappingResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [showAllSections, setShowAllSections] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [remapping, setRemapping] = useState(false);
  const [testTopic, setTestTopic] = useState("");
  const [testSubtopic, setTestSubtopic] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  const base = bookId ? `${API_BASE_URL}/api/book-knowledge/books/${bookId}/curriculum-mapping` : "";

  const load = async () => {
    if (!bookId) return;
    setLoading(true);
    try {
      const res = await fetch(base, { headers: { ...authHeaders() }, credentials: "include" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "Failed to load curriculum mapping");
      setData(json.data as MappingResponse);
    } catch (e: any) {
      toast({ title: "Could not load mapping", description: e.message, variant: "destructive" });
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && bookId) {
      // Each book opens on its own review list, not the previous book's "show all".
      setShowAllSections(false);
      setTestResult(null);
      setTestTopic("");
      setTestSubtopic("");
      void load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, bookId]);

  const mapping = data?.mapping || {};
  const curriculum = data?.curriculum || [];
  const sections = useMemo(() => (data?.sections || []).filter((s) => s.level > 0), [data]);
  const reviewSections = useMemo(
    () =>
      sections.filter(
        (s) =>
          // A heading with no text of its own (contents line, chapter topic list) has nothing to map.
          (s.wordCount || 0) >= 25 &&
          (s.mappingStatus === "unmapped" ||
          s.mappingStatus === "needs_review" ||
          // Numbered sub-sections that only reached topic level still need a subtopic.
          // Exercise blocks are chapter-level by design, not a gap to review.
          (s.level >= 2 && !s.kind && !s.aiSubtopicId && s.mappingStatus !== "rejected")),
      ),
    [sections],
  );
  const visibleSections = (showAllSections ? sections : reviewSections).slice(0, 300);
  const coverageById = useMemo(
    () => new Map((mapping.subtopicCoverage || []).map((row) => [String(row.aiSubtopicId), row])),
    [mapping.subtopicCoverage],
  );
  // Topics this book teaches (others belong to another book, e.g. Part-2).
  const bookTopicKeys = useMemo(() => {
    const keys = new Set((mapping.subtopicCoverage || []).map((row) => row.aiTopicKey));
    for (const t of curriculum) if (t.topicLevelChunks || t.subtopics.some((s) => s.chunkCount)) keys.add(t.aiTopicKey);
    return keys;
  }, [mapping.subtopicCoverage, curriculum]);
  const bookCurriculum = bookTopicKeys.size ? curriculum.filter((t) => bookTopicKeys.has(t.aiTopicKey)) : curriculum;
  const hiddenTopics = curriculum.length - bookCurriculum.length;
  const emptySubtopics =
    mapping.mappingGapSubtopics ??
    bookCurriculum.reduce((n, t) => n + t.subtopics.filter((s) => !s.chunkCount).length, 0);
  const [coverageSaving, setCoverageSaving] = useState<string | null>(null);

  const setSubtopicCoverage = async (aiSubtopicId: string, notCovered: boolean) => {
    setCoverageSaving(aiSubtopicId);
    try {
      const res = await fetch(`${base}/subtopics/${encodeURIComponent(aiSubtopicId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        credentials: "include",
        body: JSON.stringify({ status: notCovered ? "not_covered_by_source" : null }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "Update failed");
      toast({ title: notCovered ? "Marked: not in this book" : "Label cleared" });
      await load();
    } catch (e: any) {
      toast({ title: "Update failed", description: e.message, variant: "destructive" });
    } finally {
      setCoverageSaving(null);
    }
  };
  const testTopicRow = curriculum.find((t) => t.aiTopicKey === testTopic);

  const saveSection = async (section: MappedSection, body: Record<string, unknown>) => {
    setSavingKey(section.sectionKey);
    try {
      const res = await fetch(`${base}/sections/${encodeURIComponent(section.sectionKey)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "Update failed");
      toast({
        title: json.data?.reindexScheduled ? "Saved — re-chunking book" : "Mapping saved",
        description: json.data?.reindexScheduled
          ? "This section shared chunks with its neighbours, so the book is being re-chunked."
          : `${json.data?.updatedChunks ?? 0} chunk(s) relabelled.`,
      });
      if (json.data?.reindexScheduled) onChanged?.();
      await load();
    } catch (e: any) {
      toast({ title: "Update failed", description: e.message, variant: "destructive" });
    } finally {
      setSavingKey(null);
    }
  };

  const handleTargetChange = (section: MappedSection, value: string) => {
    if (value.startsWith("sub:")) void saveSection(section, { aiSubtopicId: value.slice(4) });
    else if (value.startsWith("topic:")) void saveSection(section, { aiTopicKey: value.slice(6) });
  };

  const handleRemap = async () => {
    setRemapping(true);
    try {
      const res = await fetch(`${base}/remap`, {
        method: "POST",
        headers: { ...authHeaders() },
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "Remap failed");
      toast({ title: "Remapping started", description: "Chunks are rebuilt and re-embedded in the background." });
      onChanged?.();
    } catch (e: any) {
      toast({ title: "Remap failed", description: e.message, variant: "destructive" });
    } finally {
      setRemapping(false);
    }
  };

  const handleTest = async () => {
    if (!testTopicRow) return;
    setTesting(true);
    setTestResult(null);
    try {
      const sub = testTopicRow.subtopics.find((s) => s.aiSubtopicId === testSubtopic);
      const res = await fetch(`${base}/test-retrieval`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        credentials: "include",
        body: JSON.stringify({ topicName: testTopicRow.topicName, subtopicName: sub?.name || "" }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "Test failed");
      setTestResult(json.data as TestResult);
    } catch (e: any) {
      toast({ title: "Test retrieval failed", description: e.message, variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

  const coveragePct = Math.round((Number(mapping.coverage) || 0) * 100);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(92vh,960px)] w-[calc(100vw-1.5rem)] max-w-[1100px] lg:max-w-[1100px] flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 pr-6">
            <span className="break-words">Curriculum mapping · {bookTitle}</span>
            {data ? <CurriculumMappingBadge mapping={mapping} /> : null}
          </DialogTitle>
        </DialogHeader>

        {loading && !data ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
          </div>
        ) : !data ? (
          <p className="py-10 text-center text-sm text-slate-500">No mapping data.</p>
        ) : (
          <div className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden pr-1">
            {mapping.status === "no_curriculum" || mapping.status === "not_mapped" || !mapping.status ? (
              <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                {mapping.status === "no_curriculum"
                  ? "No AI Tool Topics exist for this book's board / class / subject / track, so it uses legacy retrieval. Add topics, then remap."
                  : "This book was indexed before curriculum mapping. Remap it to attach chunks to AI Tool Topics."}
              </p>
            ) : null}

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span>Mapped section text</span>
                <span>{coveragePct}%</span>
              </div>
              <Progress value={coveragePct} className="h-2" />
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Stat
                label="Chapters in this book"
                value={`${mapping.mappedTopics || 0}/${mapping.totalTopics || 0}`}
                hint={
                  mapping.curriculumTopics && mapping.curriculumTopics > (mapping.totalTopics || 0)
                    ? `of ${mapping.curriculumTopics} class topics; the rest are in another book (e.g. Part-2)`
                    : undefined
                }
              />
              <Stat
                label="Subtopics mapped"
                value={`${mapping.mappedSubtopics || 0}/${mapping.totalSubtopics || 0}`}
                warn={(mapping.mappedSubtopics || 0) < (mapping.totalSubtopics || 0)}
              />
              <Stat label="Unmapped sections" value={mapping.unmappedSections || 0} warn={(mapping.unmappedSections || 0) > 0} />
              <Stat label="Needs review" value={mapping.needsReviewSections || 0} warn={(mapping.needsReviewSections || 0) > 0} />
              <Stat label="Chunks" value={mapping.chunkCount || 0} />
              <Stat
                label="Chunks w/o subtopic"
                value={mapping.chunksWithoutSubtopic || 0}
                hint={
                  mapping.frontMatterChunks != null || mapping.exerciseChunks != null
                    ? `${mapping.frontMatterChunks || 0} front matter (never used) · ${mapping.exerciseChunks || 0} chapter exercises`
                    : undefined
                }
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span>
                Mapping confidence ({(mapping.confidenceBands?.high || 0) + (mapping.confidenceBands?.review || 0) + (mapping.confidenceBands?.low || 0)} book sections):
              </span>
              <Badge variant="outline" className="border-emerald-300 text-emerald-700">high {mapping.confidenceBands?.high || 0}</Badge>
              <Badge variant="outline" className="border-amber-300 text-amber-700">review {mapping.confidenceBands?.review || 0}</Badge>
              <Badge variant="outline" className="border-red-300 text-red-700">low {mapping.confidenceBands?.low || 0}</Badge>
              <div className="ml-auto flex gap-2">
                <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
                  <RefreshCw className={cn("mr-1 h-4 w-4", loading && "animate-spin")} /> Refresh
                </Button>
                <Button size="sm" className="bg-violet-600 hover:bg-violet-700" onClick={() => void handleRemap()} disabled={remapping}>
                  {remapping ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}
                  Remap
                </Button>
              </div>
            </div>

            <ReadinessPanel
              mapping={mapping}
              sections={sections}
              savingKey={savingKey}
              onExclude={(section) => void saveSection(section, { reject: true })}
            />

            <Tabs defaultValue="review">
              <TabsList className="flex h-auto flex-wrap">
                <TabsTrigger value="review">Review mappings ({reviewSections.length})</TabsTrigger>
                <TabsTrigger value="subtopics">
                  Subtopics{emptySubtopics ? ` (${emptySubtopics} gaps)` : ""}
                </TabsTrigger>
                <TabsTrigger value="test">Test retrieval</TabsTrigger>
              </TabsList>

              <TabsContent value="review" className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-slate-500">
                    Pick the AI Tools subtopic for each book heading. Saving relabels its chunks; if a heading shares chunks with
                    neighbours, the book is re-chunked.
                  </p>
                  <Button size="sm" variant="ghost" onClick={() => setShowAllSections((v) => !v)}>
                    {showAllSections ? "Show only items to review" : `Show all ${sections.length} sections`}
                  </Button>
                </div>
                {visibleSections.length === 0 ? (
                  <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                    Nothing to review — every section is mapped.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {visibleSections.map((section) => {
                      const current = section.aiSubtopicId
                        ? subValue(section.aiSubtopicId)
                        : section.aiTopicKey
                          ? topicValue(section.aiTopicKey)
                          : undefined;
                      return (
                        <div
                          key={section.sectionKey}
                          className="flex min-w-0 flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3 xl:flex-row xl:items-start"
                        >
                          <div className="min-w-0 flex-1 space-y-1">
                            <p className="break-words text-sm font-medium text-slate-900">
                              {section.number ? `${section.number} ` : ""}
                              {section.title || "(untitled)"}
                            </p>
                            <div className="flex flex-wrap gap-1.5 text-xs text-slate-500">
                              {section.chapterTitle ? <span className="break-words">{section.chapterTitle}</span> : null}
                              {formatPages(section.pageStart, section.pageEnd) ? (
                                <span>· {formatPages(section.pageStart, section.pageEnd)}</span>
                              ) : null}
                              <span>· {section.wordCount || 0} words</span>
                              {section.mappingMethod ? <span>· {section.mappingMethod}</span> : null}
                              <span>· {Math.round((section.mappingConfidence || 0) * 100)}%</span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              <Badge variant="outline" className={cn("text-[11px]", SECTION_STATUS_CLASS[section.mappingStatus || ""])}>
                                {section.mappingStatus || "unmapped"}
                              </Badge>
                              {section.kind === "exercise" ? (
                                <Badge variant="outline" className="border-violet-200 bg-violet-50 text-[11px] text-violet-700">
                                  Exercises · whole chapter
                                </Badge>
                              ) : null}
                            </div>
                            {section.preview ? (
                              <p className="line-clamp-2 break-words text-xs text-slate-500">{section.preview}</p>
                            ) : null}
                          </div>
                          {/* Under the section text below xl: a right-hand column was cut off on laptop screens, so the picker looked missing. */}
                          <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row xl:w-[400px] xl:shrink-0">
                            <CurriculumTargetPicker
                              curriculum={curriculum}
                              value={current}
                              onChange={(v) => handleTargetChange(section, v)}
                              disabled={savingKey === section.sectionKey}
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              className="shrink-0"
                              title="Exclude this section from retrieval"
                              disabled={savingKey === section.sectionKey || section.mappingStatus === "rejected"}
                              onClick={() => void saveSection(section, { reject: true })}
                            >
                              {savingKey === section.sectionKey ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reject"}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                    {(showAllSections ? sections : reviewSections).length > visibleSections.length ? (
                      <p className="text-center text-xs text-slate-500">Showing first {visibleSections.length} sections.</p>
                    ) : null}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="subtopics">
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Topic / subtopic</th>
                        <th className="px-3 py-2 text-right">Chunks</th>
                        <th className="px-3 py-2">Status / figures</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bookCurriculum.map((topic) => (
                        <FragmentRows
                          key={topic.aiTopicKey}
                          topic={topic}
                          sections={sections}
                          savingKey={savingKey ?? coverageSaving}
                          coverageById={coverageById}
                          onAssign={(section, aiSubtopicId) => void saveSection(section, { aiSubtopicId })}
                          onNotCovered={(aiSubtopicId, notCovered) => void setSubtopicCoverage(aiSubtopicId, notCovered)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  An empty subtopic is either a <strong>mapping gap</strong> (the book seems to teach it: press{" "}
                  <strong>Assign book section</strong>) or <strong>not in this book</strong>. Generation for an empty
                  subtopic stops before calling Gemini and says which of the two it is.
                  {hiddenTopics > 0 ? ` ${hiddenTopics} class topic(s) taught in another book are hidden.` : ""}
                  Books indexed before this update need <strong>Remap</strong> once.
                </p>
              </TabsContent>

              <TabsContent value="test" className="space-y-3">
                <p className="text-xs text-slate-500">
                  Runs the same ID-filtered retrieval the generator uses (one embedding call, no Gemini) and checks every chunk
                  belongs to the selected subtopic.
                </p>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
                  <div className="space-y-1.5">
                    <Label>Topic</Label>
                    <Select
                      value={testTopic || undefined}
                      onValueChange={(v) => {
                        setTestTopic(v);
                        setTestSubtopic("");
                        setTestResult(null);
                      }}
                    >
                      <SelectTrigger><SelectValue placeholder="Select topic" /></SelectTrigger>
                      <SelectContent className="max-h-80">
                        {curriculum.map((t) => (
                          <SelectItem key={t.aiTopicKey} value={t.aiTopicKey}>{t.topicName}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Subtopic</Label>
                    <Select
                      value={testSubtopic || "__whole__"}
                      onValueChange={(v) => {
                        setTestSubtopic(v === "__whole__" ? "" : v);
                        setTestResult(null);
                      }}
                      disabled={!testTopicRow}
                    >
                      <SelectTrigger><SelectValue placeholder="Whole topic" /></SelectTrigger>
                      <SelectContent className="max-h-80">
                        <SelectItem value="__whole__">Whole topic</SelectItem>
                        {(testTopicRow?.subtopics || []).map((s) => (
                          <SelectItem key={s.aiSubtopicId} value={s.aiSubtopicId}>
                            {s.number ? `${s.number} ` : ""}{s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={() => void handleTest()} disabled={!testTopicRow || testing}>
                    {testing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Search className="mr-1 h-4 w-4" />}
                    Test
                  </Button>
                </div>

                {testResult ? (
                  <div className="space-y-2">
                    <div
                      className={cn(
                        "flex items-center gap-2 rounded-lg border p-3 text-sm",
                        testResult.passed ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800",
                      )}
                    >
                      {testResult.passed ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                      {testResult.passed
                        ? `Passed — ${testResult.chunks.length} chunk(s), all inside the selected scope.`
                        : testResult.route?.mode && testResult.route.mode !== "strict"
                          ? `Not ID-filtered (${testResult.route.mode}: ${testResult.route.status || testResult.route.reason || "unknown"}).`
                          : testResult.chunks.length === 0
                            ? "No mapped chunks for this scope — generation would stop with RAG_SCOPE_EMPTY."
                            : `${testResult.mismatchCount || 0} chunk(s) outside the selected scope.`}
                    </div>
                    {testResult.chunks.map((c) => (
                      <div key={c.chunkId} className="rounded border border-slate-200 p-2 text-xs text-slate-600">
                        <div className="flex flex-wrap gap-2 font-medium text-slate-800">
                          <span>{c.aiSubtopicName || "(topic-level)"}</span>
                          <span className="text-slate-400">score {c.score}</span>
                          {formatPages(c.pages?.[0], c.pages?.[1]) ? (
                            <span className="text-slate-400">{formatPages(c.pages?.[0], c.pages?.[1])}</span>
                          ) : null}
                        </div>
                        <p className="mt-1">{c.preview}</p>
                      </div>
                    ))}
                  </div>
                ) : null}
              </TabsContent>
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Readiness gates, chunk statuses and the maths-notation QA list. */
function ReadinessPanel({
  mapping,
  sections,
  savingKey,
  onExclude,
}: {
  mapping: CurriculumMappingSummary;
  sections: MappedSection[];
  savingKey: string | null;
  onExclude: (section: MappedSection) => void;
}) {
  const gates = mapping.gates || [];
  const chunkStatus = mapping.chunkStatus || {};
  const qa = mapping.mathQa;
  if (!gates.length) {
    return (
      <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
        Readiness gates appear after the next <strong>Remap</strong>.
      </p>
    );
  }
  const passed = gates.filter((g) => g.pass).length;
  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-800">
          Readiness gates · {passed}/{gates.length} passed
        </p>
        <span className="text-xs text-slate-500">All must pass before the book counts as Ready.</span>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {gates.map((g) => (
          <li
            key={g.key}
            className={cn(
              "flex items-start gap-2 rounded-md border px-2.5 py-2 text-xs",
              g.pass ? "border-emerald-200 bg-emerald-50/60" : "border-red-200 bg-red-50/60",
            )}
          >
            {g.pass ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            ) : (
              <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            )}
            <span className="min-w-0">
              <span className="block font-semibold text-slate-800">{g.label}</span>
              {g.detail ? <span className="block break-words text-slate-600">{g.detail}</span> : null}
            </span>
          </li>
        ))}
      </ul>
      {Object.keys(chunkStatus).length ? (
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          {Object.entries(chunkStatus).map(([key, n]) => (
            <Badge
              key={key}
              variant="outline"
              className={cn(
                key === "mapping_gap" || key === "needs_review" ? "border-amber-300 text-amber-800" : "border-slate-200 text-slate-600",
              )}
            >
              {CHUNK_STATUS_LABEL[key] || key}: {n}
            </Badge>
          ))}
        </div>
      ) : null}
      {qa?.applicable && (qa.samples || []).length ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-700">
            Damaged formulas: fix the source PDF and reindex, or exclude the section from retrieval
          </p>
          {(qa.samples || []).map((sample) => {
            const section = sections.find((s) => s.sectionKey === sample.sectionKey);
            return (
              <div key={sample.sectionKey} className="flex flex-col gap-2 rounded-md border border-amber-200 bg-amber-50/50 p-2 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-slate-800">{sample.title || "(untitled section)"}</p>
                  {sample.snippet ? (
                    <p data-no-title-case className="mt-0.5 break-words font-mono text-[11px] text-slate-600">{sample.snippet}</p>
                  ) : null}
                </div>
                {section ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 shrink-0 px-2 text-xs"
                    disabled={savingKey != null || section.mappingStatus === "rejected"}
                    onClick={() => onExclude(section)}
                  >
                    {section.mappingStatus === "rejected" ? "Excluded" : "Exclude section"}
                  </Button>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/** Pick the book section that teaches an empty subtopic (reverse of the review list). */
function SectionAssignPicker({
  topic,
  sections,
  disabled,
  onAssign,
}: {
  topic: CurriculumTopic;
  sections: MappedSection[];
  disabled?: boolean;
  onAssign: (section: MappedSection) => void;
}) {
  const [open, setOpen] = useState(false);
  // Sections of the same chapter first: the right one is almost always there.
  const ordered = useMemo(
    () =>
      [...sections]
        .filter((s) => s.kind !== "exercise")
        .sort((a, b) => Number(b.aiTopicKey === topic.aiTopicKey) - Number(a.aiTopicKey === topic.aiTopicKey)),
    [sections, topic.aiTopicKey],
  );
  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={disabled}>
          Assign book section
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(92vw,460px)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search book headings…" />
          <CommandList className="max-h-80">
            <CommandEmpty>No match.</CommandEmpty>
            <CommandGroup heading="Book sections (this chapter first)">
              {ordered.map((section) => (
                <CommandItem
                  key={section.sectionKey}
                  value={`${section.number || ""} ${section.title || ""} ${section.chapterTitle || ""} ${section.sectionKey}`}
                  onSelect={() => {
                    onAssign(section);
                    setOpen(false);
                  }}
                  className="flex flex-col items-start gap-0.5"
                >
                  <span className="text-sm">
                    {section.number ? `${section.number} ` : ""}
                    {section.title || "(untitled)"}
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {[section.chapterTitle, formatPages(section.pageStart, section.pageEnd), section.aiSubtopicName ? `now: ${section.aiSubtopicName}` : section.mappingStatus]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function FragmentRows({
  topic,
  sections,
  savingKey,
  coverageById,
  onAssign,
  onNotCovered,
}: {
  topic: CurriculumTopic;
  sections: MappedSection[];
  savingKey: string | null;
  coverageById: Map<string, { status: SubtopicCoverageStatus; manual?: boolean }>;
  onAssign: (section: MappedSection, aiSubtopicId: string) => void;
  onNotCovered: (aiSubtopicId: string, notCovered: boolean) => void;
}) {
  const assetText = (assets: Record<string, number>) =>
    Object.entries(assets || {})
      .map(([type, n]) => `${n} ${type.replace(/_/g, " ")}`)
      .join(", ") || "—";
  return (
    <>
      <tr className="border-t border-slate-200 bg-slate-50/60">
        <td className="px-3 py-2 font-semibold text-slate-800">{topic.topicName}</td>
        <td className="px-3 py-2 text-right text-slate-600" title="Topic-level chunks (whole-chapter use)">
          {topic.topicLevelChunks || 0}
        </td>
        <td className="px-3 py-2 text-xs text-slate-400">topic-level</td>
      </tr>
      {topic.subtopics.map((sub) => (
        <tr
          key={sub.aiSubtopicId}
          className={cn(
            "border-t border-slate-100",
            !sub.chunkCount && coverageById.get(sub.aiSubtopicId)?.status !== "not_covered_by_source" && "bg-amber-50",
          )}
        >
          <td className="px-3 py-1.5 pl-8 text-slate-700">
            {sub.number ? `${sub.number} ` : ""}
            {sub.name}
          </td>
          <td className={cn("px-3 py-1.5 text-right", sub.chunkCount ? "text-slate-700" : "font-semibold text-amber-700")}>
            {sub.chunkCount || 0}
          </td>
          <td className="px-3 py-1.5 text-xs text-slate-500">
            {sub.chunkCount ? (
              assetText(sub.assets)
            ) : coverageById.get(sub.aiSubtopicId)?.status === "not_covered_by_source" ? (
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-slate-300 bg-slate-100 text-[11px] text-slate-700">
                  Not in this book{coverageById.get(sub.aiSubtopicId)?.manual ? " (admin)" : ""}
                </Badge>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  disabled={savingKey != null}
                  onClick={() => onNotCovered(sub.aiSubtopicId, false)}
                >
                  Undo
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-amber-300 bg-amber-50 text-[11px] text-amber-800">
                  Mapping gap
                </Badge>
                <SectionAssignPicker
                  topic={topic}
                  sections={sections}
                  disabled={savingKey != null}
                  onAssign={(section) => onAssign(section, sub.aiSubtopicId)}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  disabled={savingKey != null}
                  onClick={() => onNotCovered(sub.aiSubtopicId, true)}
                >
                  Not in this book
                </Button>
              </div>
            )}
          </td>
        </tr>
      ))}
    </>
  );
}
