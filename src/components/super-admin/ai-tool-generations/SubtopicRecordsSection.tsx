import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, FileDown, FileStack } from "lucide-react";
import { fetchRecords, fetchExportBundle } from "./api";
import type { RecordRow } from "./api";
import { downloadGenerationsPdf } from "./pdf-utils";
import { GenerationRecordsList } from "./GenerationRecordsList";
import { useToast } from "@/hooks/use-toast";

function labelEmpty(v: string) {
  return v === "" || v == null ? "(None)" : v;
}

export function SubtopicRecordsSection({
  parents,
}: {
  parents: Record<string, string>;
}) {
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [total, setTotal] = useState(0);
  const [items, setItems] = useState<RecordRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetchRecords(parents, page, 20);
      setTotal(r.data.total);
      setItems(r.data.items);
    } finally {
      setLoading(false);
    }
  }, [parents, page]);

  useEffect(() => {
    load();
  }, [load]);

  const pdfThisSubtopic = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const r = await fetchExportBundle(parents, 500);
      const recs = (r.data?.records || []).map((x) => ({
        toolDisplayName: x.toolDisplayName,
        toolName: x.toolName,
        classLabel: x.classLabel,
        subject: x.subject,
        topic: x.topic,
        subtopic: x.subtopic,
        content: x.content,
        createdAt: x.createdAt,
        // Lets the PDF show the same six-section view as the screen.
        record: x as unknown as Record<string, unknown>,
      }));
      if (!recs.length) {
        toast({
          title: "Nothing to download",
          description: "No records in this subtopic.",
          variant: "destructive",
        });
        return;
      }
      await downloadGenerationsPdf(
        `${parents.toolName || "tool"}_${parents.subtopic || "sub"}`,
        recs,
      );
      toast({
        title: "PDF downloaded",
        description: `${recs.length} record${recs.length === 1 ? "" : "s"} exported.`,
      });
    } catch (error: unknown) {
      toast({
        title: "Download failed",
        description: error instanceof Error ? error.message : "Could not create the PDF.",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200/90 bg-gradient-to-br from-white via-slate-50/30 to-orange-50/20 shadow-sm overflow-hidden min-w-0">
      <div className="border-b border-slate-100/80 bg-white/80 px-3 py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
        <div className="flex items-start gap-3 min-w-0">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-500 text-white shadow-sm">
            <FileStack className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900">Records</p>
            <p className="text-xs text-slate-500 mt-0.5 break-words leading-relaxed">
              {total} generation{total !== 1 ? "s" : ""}
              <span className="text-slate-300 mx-1.5">·</span>
              <span className="font-medium text-slate-700">{labelEmpty(parents.subtopic || "")}</span>
            </p>
          </div>
        </div>
        <Button
          size="sm"
          className="w-full sm:w-auto rounded-xl bg-orange-600 hover:bg-orange-700 text-white shadow-sm shrink-0"
          disabled={exporting || loading || total === 0}
          onClick={() => void pdfThisSubtopic()}
        >
          {exporting ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <FileDown className="w-4 h-4 mr-2" />
          )}
          {exporting ? "Preparing PDF…" : "Download PDF"}
        </Button>
      </div>

      <div className="p-2 sm:p-4 space-y-3 min-w-0 overflow-x-hidden">
        <GenerationRecordsList
          items={items}
          defaultToolName={parents.toolName}
          onRefresh={load}
          loading={loading}
          emptyMessage="No records for this path."
        />

        {total > 20 && (
          <div className="flex gap-2 justify-center pt-2 border-t border-slate-100/80">
            <Button
              size="sm"
              variant="outline"
              className="rounded-xl"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Badge variant="secondary" className="self-center rounded-lg px-3 tabular-nums">
              Page {page} · {total} total
            </Badge>
            <Button
              size="sm"
              variant="outline"
              className="rounded-xl"
              disabled={page * 20 >= total}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
