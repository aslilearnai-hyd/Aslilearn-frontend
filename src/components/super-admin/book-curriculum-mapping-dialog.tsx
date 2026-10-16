import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CheckCircle2, Loader2, RefreshCw, Search, XCircle } from "lucide-react";
import { API_BASE_URL } from "@/lib/api-config";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export type CurriculumMappingStatus = "ready" | "needs_review" | "unmapped" | "no_curriculum" | "not_mapped";

export type CurriculumMappingSummary = {
  status?: CurriculumMappingStatus;
  coverage?: number;
  mappedTopics?: number;
  totalTopics?: number;
  mappedSubtopics?: number;
  totalSubtopics?: number;
  sectionCount?: number;
  unmappedSections?: number;
  needsReviewSections?: number;
  unmappedHighValueSections?: number;
  chunkCount?: number;
  chunksWithoutSubtopic?: number;
  confidenceBands?: { high?: number; review?: number; low?: number };
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

function Stat({ label, value, warn }: { label: string; value: string | number; warn?: boolean }) {
  return (
    <div className={cn("rounded-lg border p-3", warn ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white")}>
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className={cn("text-lg font-semibold", warn ? "text-amber-800" : "text-slate-900")}>{value}</p>
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
          s.mappingStatus === "unmapped" ||
          s.mappingStatus === "needs_review" ||
          // Numbered sub-sections that only reached topic level still need a subtopic.
          // Exercise blocks are chapter-level by design, not a gap to review.
          (s.level >= 2 && !s.kind && !s.aiSubtopicId && s.mappingStatus !== "rejected"),
      ),
    [sections],
  );
  const visibleSections = (showAllSections ? sections : reviewSections).slice(0, 300);
  const emptySubtopics = curriculum.reduce(
    (n, t) => n + t.subtopics.filter((s) => !s.chunkCount).length,
    0,
  );
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
      <DialogContent className="flex max-h-[min(92vh,960px)] w-[min(96vw,1100px)] max-w-[min(96vw,1100px)] lg:max-w-[min(96vw,1100px)] flex-col overflow-hidden">
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
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
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
                <span>{coveragePct}% (ready at 95%)</span>
              </div>
              <Progress value={coveragePct} className="h-2" />
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Stat label="Topics mapped" value={`${mapping.mappedTopics || 0}/${mapping.totalTopics || 0}`} />
              <Stat
                label="Subtopics mapped"
                value={`${mapping.mappedSubtopics || 0}/${mapping.totalSubtopics || 0}`}
                warn={(mapping.mappedSubtopics || 0) < (mapping.totalSubtopics || 0)}
              />
              <Stat label="Unmapped sections" value={mapping.unmappedSections || 0} warn={(mapping.unmappedSections || 0) > 0} />
              <Stat label="Needs review" value={mapping.needsReviewSections || 0} warn={(mapping.needsReviewSections || 0) > 0} />
              <Stat label="Chunks" value={mapping.chunkCount || 0} />
              <Stat label="Chunks w/o subtopic" value={mapping.chunksWithoutSubtopic || 0} />
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span>Confidence:</span>
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

            <Tabs defaultValue="review">
              <TabsList className="flex h-auto flex-wrap">
                <TabsTrigger value="review">Review mappings ({reviewSections.length})</TabsTrigger>
                <TabsTrigger value="subtopics">
                  Subtopics{emptySubtopics ? ` (${emptySubtopics} empty)` : ""}
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
                          className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3 lg:flex-row lg:items-start"
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
                              <p className="line-clamp-2 text-xs text-slate-500">{section.preview}</p>
                            ) : null}
                          </div>
                          <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-[420px] lg:shrink-0">
                            <Select
                              value={current}
                              onValueChange={(v) => handleTargetChange(section, v)}
                              disabled={savingKey === section.sectionKey}
                            >
                              <SelectTrigger className="min-w-0 flex-1 text-left">
                                <SelectValue placeholder="Choose topic / subtopic" />
                              </SelectTrigger>
                              <SelectContent className="max-h-80">
                                {curriculum.map((topic) => (
                                  <SelectGroup key={topic.aiTopicKey}>
                                    <SelectItem value={topicValue(topic.aiTopicKey)} className="font-semibold">
                                      {topic.topicName} (whole topic)
                                    </SelectItem>
                                    {topic.subtopics.map((sub) => (
                                      <SelectItem key={sub.aiSubtopicId} value={subValue(sub.aiSubtopicId)} className="pl-6">
                                        {sub.number ? `${sub.number} ` : ""}
                                        {sub.name}
                                      </SelectItem>
                                    ))}
                                  </SelectGroup>
                                ))}
                              </SelectContent>
                            </Select>
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
                        <th className="px-3 py-2">Figures / equations / tables</th>
                      </tr>
                    </thead>
                    <tbody>
                      {curriculum.map((topic) => (
                        <FragmentRows key={topic.aiTopicKey} topic={topic} />
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Highlighted subtopics have no mapped chunks — generation for them stops before calling Gemini.
                  To fill one: open <strong>Review mappings</strong> → <strong>Show all sections</strong>, find the book
                  section that teaches it and pick that subtopic in its dropdown. If the book never covers it, leave it empty.
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

function FragmentRows({ topic }: { topic: CurriculumTopic }) {
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
          className={cn("border-t border-slate-100", !sub.chunkCount && "bg-amber-50")}
        >
          <td className="px-3 py-1.5 pl-8 text-slate-700">
            {sub.number ? `${sub.number} ` : ""}
            {sub.name}
          </td>
          <td className={cn("px-3 py-1.5 text-right", sub.chunkCount ? "text-slate-700" : "font-semibold text-amber-700")}>
            {sub.chunkCount || 0}
          </td>
          <td className="px-3 py-1.5 text-xs text-slate-500">{assetText(sub.assets)}</td>
        </tr>
      ))}
    </>
  );
}
