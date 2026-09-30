import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw } from "lucide-react";
import { API_BASE_URL } from "@/lib/api-config";
import { useToast } from "@/hooks/use-toast";
import { getAuthToken } from '@/lib/auth-utils';

type DuplicateAuditData = {
  totalRecords: number;
  totalFingerprints: number;
  exactDuplicateCount: number;
  duplicateGroupCount: number;
  questionDuplicationPct: number;
  questionSimilarityThreshold: number;
  duplicatePreventionSuccessRate?: number;
  topDuplicates: Array<{
    contentType: string;
    fingerprint: string;
    count: number;
    sample: string;
  }>;
  topicSaturation: Array<{
    toolSlug: string;
    subject: string;
    topic: string;
    subtopic: string;
    recordCount: number;
    saturationLevel?: string;
  }>;
};

type AnalyticsData = {
  recentSampleSize?: number;
  totalGenerations: number;
  totalFingerprints?: number;
  estimatedCostUsd: number;
  estimatedCostInr?: number;
  totalTokensLast500: number;
  recordsWithFingerprints: number;
  fingerprintCoveragePct?: number;
  duplicatePreventionCount: number;
  duplicatePreventionSuccessRate?: number;
  validationFailures: number;
  sectionRepairs: number;
  batchOrchestratorRuns: number;
  randomRetrievalCount?: number;
  geminiGenerationsAvoided?: number;
  tokenSavingsEstimate?: number;
  uniqueContentGenerated: number;
  averageQualityScore: number;
};

function authHeaders(): Record<string, string> {
  const token =
    getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function saturationBadge(level?: string) {
  const l = String(level || "").toLowerCase();
  if (l === "saturated") return "destructive";
  if (l === "high") return "default";
  if (l === "growing") return "secondary";
  return "outline";
}

export function AiGeneratorAuditPanel() {
  const { toast } = useToast();
  const [toolSlug, setToolSlug] = useState("");
  const [loading, setLoading] = useState(false);
  const [audit, setAudit] = useState<DuplicateAuditData | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const qs = toolSlug.trim() ? `?toolSlug=${encodeURIComponent(toolSlug.trim())}` : "";
      const [auditRes, analyticsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/ai-generator/audit/duplicates${qs}`, {
          headers: { ...authHeaders() },
          credentials: "include",
        }),
        fetch(`${API_BASE_URL}/api/ai-generator/audit/analytics${qs}`, {
          headers: { ...authHeaders() },
          credentials: "include",
        }),
      ]);
      const auditJson = await auditRes.json();
      const analyticsJson = await analyticsRes.json();
      if (!auditRes.ok || !auditJson?.success) {
        throw new Error(auditJson?.message || "Duplicate audit failed");
      }
      if (!analyticsRes.ok || !analyticsJson?.success) {
        throw new Error(analyticsJson?.message || "Analytics failed");
      }
      setAudit(auditJson.data);
      setAnalytics(analyticsJson.data);
    } catch (error: any) {
      toast({
        title: "Audit load failed",
        description: error?.message || "Could not load audit data.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Label htmlFor="audit-tool-slug">Filter by tool slug (optional)</Label>
          <Input
            id="audit-tool-slug"
            value={toolSlug}
            onChange={(e) => setToolSlug(e.target.value)}
            placeholder="worksheet-mcq-generator"
          />
        </div>
        <Button onClick={load} disabled={loading} variant="outline">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Duplicate Audit</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {audit ? (
              <>
                <p>Total records: <strong>{audit.totalRecords}</strong></p>
                <p>Total fingerprints: <strong>{audit.totalFingerprints}</strong></p>
                <p>Exact duplicate fingerprints: <strong>{audit.exactDuplicateCount}</strong></p>
                <p>Duplicate prevention success: <strong>{audit.duplicatePreventionSuccessRate ?? 100}%</strong></p>
                <p>
                  Question similarity (sample):{" "}
                  <strong>{audit.questionDuplicationPct}%</strong>{" "}
                  <span className="text-slate-500">(threshold {Math.round(audit.questionSimilarityThreshold * 100)}%)</span>
                </p>
              </>
            ) : (
              <p className="text-slate-500">No audit data.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Generation Analytics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {analytics ? (
              <>
                <p>Total generations: <strong>{analytics.totalGenerations}</strong></p>
                <p>Fingerprint coverage: <strong>{analytics.fingerprintCoveragePct ?? 0}%</strong></p>
                <p>Random retrieval batches: <strong>{analytics.randomRetrievalCount ?? 0}</strong></p>
                <p>Gemini generations avoided: <strong>{analytics.geminiGenerationsAvoided ?? 0}</strong></p>
                <p>Token savings (est. batches): <strong>{analytics.tokenSavingsEstimate ?? 0}</strong></p>
                <p>Duplicate prevention events: <strong>{analytics.duplicatePreventionCount}</strong></p>
                <p>Section repairs: <strong>{analytics.sectionRepairs}</strong></p>
                <p>
                  Est. spend (last {analytics.recentSampleSize ?? 500} records):{" "}
                  <strong>
                    {analytics.estimatedCostUsd != null
                      ? `~$${Number(analytics.estimatedCostUsd).toFixed(4)} USD`
                      : "—"}
                  </strong>
                  {analytics.estimatedCostInr != null ? (
                    <span className="text-slate-600">
                      {" "}
                      (~₹{Number(analytics.estimatedCostInr).toFixed(2)})
                    </span>
                  ) : null}
                </p>
                <p>
                  Tokens (last {analytics.recentSampleSize ?? 500}):{" "}
                  <strong>{analytics.totalTokensLast500?.toLocaleString() ?? 0}</strong>
                </p>
                <p>Quality score: <strong>{analytics.averageQualityScore}%</strong></p>
              </>
            ) : (
              <p className="text-slate-500">No analytics data.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {audit?.topicSaturation?.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Topic Saturation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {audit.topicSaturation.slice(0, 15).map((row, idx) => (
              <div key={idx} className="flex justify-between gap-2 border-b pb-2 items-center">
                <span>{row.toolSlug} · {row.subject} · {row.topic || "—"} · {row.subtopic || "—"}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={saturationBadge(row.saturationLevel)}>{row.saturationLevel || "—"}</Badge>
                  <strong>{row.recordCount}</strong>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
