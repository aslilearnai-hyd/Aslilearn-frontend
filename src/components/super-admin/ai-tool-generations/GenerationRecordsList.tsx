import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Calendar, Eye, Pencil, Trash2, FileDown } from "lucide-react";
import {
  fetchDocument,
  updateDocument,
  deleteDocument,
  patchDocumentStructured,
} from "./api";
import type { RecordRow } from "./api";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/use-confirm";
import {
  extractMcqQuestionsFromRecord,
  type McqQuestion,
} from "@/lib/mcq-record-utils";
import {
  SectionGapFlagPanel,
  recordHasSectionGap,
  formatRecordPath,
} from "./SectionGapFlagPanel";
import { GeneratorRecordViewer } from "@/components/super-admin/generator-record-viewer";
import { AiToolRecordPreviewBody } from "@/components/super-admin/ai-tool-record-preview-body";
import { normalizeAiToolSlug } from "@/lib/normalize-ai-tool-slug";
import {
  recordGenerationVariant,
  recordVariantAngle,
} from "@/lib/ai-tool-record-list-preview";
import { openAiToolRecordPdf } from "@/lib/ai-tool-record-pdf";
import { sortAiToolRecordsByVariantThenDate } from "@/lib/ai-tool-record-sort";
import { downloadGenerationsPdf } from "./pdf-utils";

function questionsToStructuredPayload(questions: McqQuestion[]) {
  return questions.map((q) => ({
    question: q.question,
    options: q.options.map((o) => o.replace(/^[A-D]\)\s*/i, "").trim()),
    answer: q.answer.replace(/^[A-D]\)\s*/i, "").trim(),
    explanation: String(q.explanation || "").trim(),
  }));
}

function toEditablePlainText(content: string) {
  return String(content || "")
    .replace(/\r\n/g, "\n")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`{1,3}/g, "")
    .replace(/^[-*_]{3,}\s*$/gm, "")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/!\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isBookGroundedRow(row: RecordRow): boolean {
  if (row.sourceType === "book_rag") return true;
  const meta = row.metadata;
  if (!meta || typeof meta !== "object") return false;
  return Boolean(meta.bookGenerator) || meta.formatSource === "bookRag";
}

function buildViewRecord(
  row: RecordRow | null,
  detail: Record<string, unknown> | null,
  fullText: string | null,
  defaultToolName: string,
): Record<string, unknown> {
  const toolName = normalizeAiToolSlug(
    String(detail?.toolName || row?.toolName || defaultToolName || ""),
  );
  const text = String(detail?.content || detail?.generatedContent || fullText || row?.content || "");
  return {
    ...(detail || {}),
    toolName,
    toolSlug: toolName,
    content: text,
    generatedContent: String(detail?.generatedContent || text),
    metadata: detail?.metadata ?? row?.metadata,
  };
}

export type GenerationRecordsListProps = {
  items: RecordRow[];
  defaultToolName?: string;
  onRefresh?: () => Promise<void> | void;
  loading?: boolean;
  emptyMessage?: string;
  showRecordPath?: boolean;
  renderRowExtras?: (row: RecordRow) => ReactNode;
};

export function GenerationRecordsList({
  items,
  defaultToolName = "",
  onRefresh,
  loading = false,
  emptyMessage = "No records.",
  showRecordPath = false,
  renderRowExtras,
}: GenerationRecordsListProps) {
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const [view, setView] = useState<RecordRow | null>(null);
  const [fullText, setFullText] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<RecordRow | null>(null);
  const [editContent, setEditContent] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pdfDownloadingId, setPdfDownloadingId] = useState<string | null>(null);
  const [deletingQuestionKey, setDeletingQuestionKey] = useState<string | null>(null);
  const [viewDetail, setViewDetail] = useState<Record<string, unknown> | null>(null);

  const resolveToolName = (row: RecordRow) => row.toolName || defaultToolName;

  const openDoc = async (row: RecordRow) => {
    setView(row);
    const initialText = String(row.content || row.preview || "").trim();
    setFullText(initialText || "(No content available)");
    setViewDetail({
      board: row.board,
      toolName: row.toolName,
      toolDisplayName: row.toolDisplayName,
      classLabel: row.classLabel,
      subject: row.subject,
      topic: row.topic,
      subtopic: row.subtopic,
      content: initialText || "",
      generatedContent: initialText || "",
      metadata: row.metadata,
    });
    try {
      const r = await fetchDocument(row._id);
      setViewDetail(r.data as Record<string, unknown>);
      setFullText(String(r.data.content || ""));
    } catch {
      // Keep list payload content as fallback when document endpoint fails for legacy ids.
    }
  };

  const recordMcqQuestions = (row: RecordRow) =>
    extractMcqQuestionsFromRecord({
      ...row,
      toolName: normalizeAiToolSlug(resolveToolName(row)),
      generatedContent: String(row.content || row.preview || ""),
    });

  const removeQuestionFromRecord = async (row: RecordRow, questionIndex: number) => {
    const qs = recordMcqQuestions(row);
    if (questionIndex < 0 || questionIndex >= qs.length) return;
    const nextQs = qs.filter((_, i) => i !== questionIndex);
    const key = `${row._id}:${questionIndex}`;
    setDeletingQuestionKey(key);
    try {
      const prev = (row.metadata?.structuredContent as Record<string, unknown>) || {};
      await patchDocumentStructured(row._id, {
        ...prev,
        questions: questionsToStructuredPayload(nextQs),
      });
      toast({ title: "Updated", description: "Question removed from this record." });
      await onRefresh?.();
      if (view && view._id === row._id && viewDetail) {
        const r = await fetchDocument(row._id);
        setViewDetail(r.data as Record<string, unknown>);
      }
    } catch {
      toast({
        title: "Update failed",
        description: "Could not remove question.",
        variant: "destructive",
      });
    } finally {
      setDeletingQuestionKey(null);
    }
  };

  const openEdit = async (row: RecordRow) => {
    setEditRow(row);
    setEditContent("");
    try {
      const r = await fetchDocument(row._id);
      setEditContent(toEditablePlainText(r.data.content || ""));
    } catch {
      setEditContent("");
      toast({
        title: "Failed",
        description: "Could not load content for editing.",
        variant: "destructive",
      });
    }
  };

  const saveEdit = async () => {
    if (!editRow) return;
    if (!editContent.trim()) {
      toast({
        title: "Missing content",
        description: "Content cannot be empty.",
        variant: "destructive",
      });
      return;
    }
    setSavingEdit(true);
    try {
      await updateDocument(editRow._id, editContent);
      toast({ title: "Updated", description: "Record updated successfully." });
      setEditRow(null);
      await onRefresh?.();
      if (view && view._id === editRow._id) {
        setFullText(editContent);
      }
    } catch {
      toast({
        title: "Update failed",
        description: "Could not update record.",
        variant: "destructive",
      });
    } finally {
      setSavingEdit(false);
    }
  };

  const removeRow = async (row: RecordRow) => {
    const ok = await confirm({
      title: "Delete this record?",
      description: "Delete this record permanently?",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    setDeletingId(row._id);
    try {
      await deleteDocument(row._id);
      toast({ title: "Deleted", description: "Record deleted successfully." });
      if (view && view._id === row._id) {
        setView(null);
        setFullText(null);
      }
      await onRefresh?.();
    } catch {
      toast({
        title: "Delete failed",
        description: "Could not delete record.",
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  };

  const openPdf = async (row: RecordRow) => {
    if (pdfDownloadingId) return;
    setPdfDownloadingId(row._id);
    try {
      await openAiToolRecordPdf(row._id);
    } catch (firstError: unknown) {
      try {
        const full = await fetchDocument(row._id);
        const structured = (full.data as { metadata?: { structuredContent?: unknown } })?.metadata
          ?.structuredContent;
        let body = String(full.data?.content || row.content || row.preview || "").trim();
        if (structured && typeof structured === "object") {
          try {
            const dumped = JSON.stringify(structured, null, 2);
            if (dumped.length > body.length + 20) body = dumped;
          } catch {
            /* keep body */
          }
        }
        await downloadGenerationsPdf(
          String(full.data?.toolDisplayName || full.data?.toolName || row.toolDisplayName || row.toolName || "AI Content"),
          [
            {
              toolDisplayName: full.data?.toolDisplayName || row.toolDisplayName,
              toolName: full.data?.toolName || row.toolName,
              classLabel: full.data?.classLabel || row.classLabel,
              subject: full.data?.subject || row.subject,
              topic: full.data?.topic || row.topic,
              subtopic: full.data?.subtopic || row.subtopic,
              content: body,
              createdAt: full.data?.createdAt || row.createdAt,
            },
          ],
        );
      } catch {
        toast({
          title: "PDF failed",
          description:
            firstError instanceof Error ? firstError.message : "Could not generate PDF.",
          variant: "destructive",
        });
      }
    } finally {
      setPdfDownloadingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-slate-500">
        <Loader2 className="w-6 h-6 sm:w-7 sm:h-7 lg:w-8 lg:h-8 animate-spin text-orange-500" />
        <p className="text-xs sm:text-sm">Loading records…</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <p className="text-xs sm:text-sm text-center text-slate-500 py-4 sm:py-6 lg:py-8 rounded-xl border border-dashed border-slate-200 bg-white/60">
        {emptyMessage}
      </p>
    );
  }

  return (
    <>
      {ConfirmDialog}
      <ul className="space-y-3">
        {sortAiToolRecordsByVariantThenDate(items).map((row) => {
          const toolSlug = normalizeAiToolSlug(resolveToolName(row));
          const generationVariant = recordGenerationVariant(row);
          const variantAngle = recordVariantAngle(row);
          const hasGap = recordHasSectionGap(row);
          const previewRecord = {
            toolName: toolSlug,
            toolSlug,
            content: String(row.content || row.preview || ""),
            generatedContent: String(row.content || row.preview || ""),
            preview: row.preview,
            metadata: row.metadata,
            generationVariant,
            variantAngle,
          };
          return (
            <li
              key={row._id}
              className={`group rounded-xl border bg-white p-3 sm:p-4 shadow-sm transition-all hover:shadow-md min-w-0 overflow-hidden ${
                hasGap
                  ? "border-red-200/90 ring-1 ring-red-100/60 hover:border-red-300/80"
                  : "border-slate-200/90 hover:border-orange-200/80"
              }`}
            >
              <div className="flex flex-col gap-2 mb-2 min-w-0">
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 break-words">
                    <Calendar className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    {row.createdAt ? new Date(row.createdAt).toLocaleString() : "—"}
                  </span>
                  {row.board ? (
                    <Badge variant="outline" className="text-micro h-5 shrink-0">
                      {row.board}
                    </Badge>
                  ) : null}
                  {row.productCategory ? (
                    <Badge
                      variant="outline"
                      className={`text-micro h-5 shrink-0 ${
                        String(row.productCategory).toUpperCase() === 'ALPHA'
                          ? 'border-orange-200 bg-orange-50 text-orange-800'
                          : String(row.productCategory).toUpperCase() === 'BETA'
                            ? 'border-violet-200 bg-violet-50 text-violet-800'
                            : String(row.productCategory).toUpperCase() === 'GAMMA'
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                              : 'border-sky-200 bg-sky-50 text-sky-800'
                      }`}
                    >
                      {row.productCategory.charAt(0) + row.productCategory.slice(1).toLowerCase()}
                    </Badge>
                  ) : null}
                  {isBookGroundedRow(row) ? (
                    <Badge
                      variant="outline"
                      className="text-micro h-auto min-h-5 max-w-full whitespace-normal break-words border-violet-200 text-violet-800 bg-violet-50"
                    >
                      Book-based
                      {typeof row.metadata?.bookTitle === "string" && row.metadata.bookTitle
                        ? ` · ${row.metadata.bookTitle}`
                        : ""}
                    </Badge>
                  ) : null}
                  {generationVariant ? (
                    <Badge
                      variant="outline"
                      className="text-micro h-5 shrink-0 border-orange-200 text-orange-800 bg-orange-50"
                    >
                      Variant {generationVariant}
                    </Badge>
                  ) : null}
                  {variantAngle ? (
                    <span
                      className="text-micro text-slate-500 w-full sm:w-auto sm:max-w-[220px] break-words sm:truncate"
                      title={variantAngle}
                    >
                      {variantAngle}
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-1 -ml-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 text-xs rounded-lg text-orange-700 hover:text-orange-800 hover:bg-orange-50"
                    onClick={() => openDoc(row)}
                  >
                    <Eye className="h-3.5 w-3.5 mr-1.5" />
                    View full
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 text-xs rounded-lg text-blue-700 hover:text-blue-800 hover:bg-blue-50"
                    onClick={() => openEdit(row)}
                  >
                    <Pencil className="h-3.5 w-3.5 mr-1.5" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={deletingId === row._id}
                    className="h-8 text-xs rounded-lg text-red-700 hover:text-red-800 hover:bg-red-50"
                    onClick={() => removeRow(row)}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                    {deletingId === row._id ? "Deleting..." : "Delete"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pdfDownloadingId === row._id}
                    className="h-8 text-xs rounded-lg text-slate-700 hover:text-slate-900 hover:bg-slate-100"
                    onClick={() => void openPdf(row)}
                  >
                    {pdfDownloadingId === row._id ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <FileDown className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    {pdfDownloadingId === row._id ? "PDF…" : "PDF"}
                  </Button>
                </div>
              </div>

              {hasGap ? (
                <SectionGapFlagPanel
                  row={row}
                  defaultToolName={defaultToolName}
                  className="mb-3"
                  compact
                />
              ) : null}

              {showRecordPath ? (
                <div className="mb-3 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2.5 space-y-1.5">
                  {formatRecordPath(row).map(({ label, value }) => (
                    <p key={label} className="text-xs text-slate-700 leading-relaxed break-words">
                      <span className="font-medium text-slate-500">{label}: </span>
                      {value}
                    </p>
                  ))}
                </div>
              ) : null}

              {renderRowExtras ? <div className="mb-3">{renderRowExtras(row)}</div> : null}

              <AiToolRecordPreviewBody
                toolSlug={toolSlug}
                record={previewRecord}
                recordId={row._id}
                deletingQuestionKey={deletingQuestionKey}
                onDeleteQuestion={(questionIndex) => void removeQuestionFromRecord(row, questionIndex)}
              />
            </li>
          );
        })}
      </ul>

      <Dialog
        open={!!view}
        onOpenChange={() => {
          setView(null);
          setViewDetail(null);
        }}
      >
        <DialogContent className="flex max-h-[min(92vh,920px)] w-[min(96vw,1400px)] max-w-[min(96vw,1400px)] flex-col gap-0 overflow-hidden rounded-2xl border-slate-200 p-0 sm:max-w-[min(96vw,1400px)] lg:max-w-[min(96vw,1400px)]">
          <DialogHeader className="shrink-0 border-b border-slate-100 px-4 py-3 sm:px-6">
            <DialogTitle className="text-base sm:text-lg font-semibold text-slate-900">
              Generated content
            </DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-slate-50/80 px-2 py-2 sm:px-4 sm:py-4">
          {fullText == null ? (
            <div className="flex justify-center py-12">
              <Loader2 className="animate-spin w-6 h-6 sm:w-7 sm:h-7 lg:w-8 lg:h-8 text-orange-500" />
            </div>
          ) : (
            (() => {
              const viewRecord = buildViewRecord(view, viewDetail, fullText, defaultToolName);
              return (
                <div className="min-w-0">
                  <GeneratorRecordViewer record={viewRecord} />
                </div>
              );
            })()
          )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editRow} onOpenChange={() => setEditRow(null)}>
        <DialogContent className="max-w-3xl rounded-2xl border-slate-200">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg font-semibold text-slate-900">
              Edit content
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="min-h-[320px]"
              placeholder="Update content..."
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditRow(null)}>
                Cancel
              </Button>
              <Button onClick={saveEdit} disabled={savingEdit}>
                {savingEdit ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
