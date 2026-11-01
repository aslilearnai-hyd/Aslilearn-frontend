import { API_BASE_URL } from "@/lib/api-config";
import { getAuthToken } from "@/lib/auth-utils";

function authHeaders(): Record<string, string> {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function filenameFromContentDisposition(header: string | null): string | null {
  if (!header) return null;
  const utf8 = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header);
  if (utf8?.[1]) {
    try {
      return decodeURIComponent(utf8[1].trim().replace(/^"|"$/g, ""));
    } catch {
      /* ignore */
    }
  }
  const plain = /filename\s*=\s*"([^"]+)"|filename\s*=\s*([^;]+)/i.exec(header);
  const raw = (plain?.[1] || plain?.[2] || "").trim();
  return raw || null;
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename.toLowerCase().endsWith(".pdf") ? filename : `${filename}.pdf`;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

async function blobLooksLikePdf(blob: Blob): Promise<boolean> {
  const type = (blob.type || "").toLowerCase();
  if (type.includes("json") || type.includes("html") || type.includes("text/")) return false;
  try {
    const head = await blob.slice(0, 5).text();
    if (head.startsWith("%PDF")) return true;
    if (head.trim().startsWith("{") || head.trim().startsWith("<")) return false;
    // Some proxies omit Content-Type; still accept a non-empty binary blob.
    return blob.size > 80 && !type.includes("json");
  } catch {
    return blob.size > 80;
  }
}

async function fetchPdfFromUrl(url: string): Promise<{ blob: Blob; filename: string } | null> {
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) {
    const json = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(json?.message || `Failed to generate PDF (${res.status})`);
  }
  const blob = await res.blob();
  if (!(await blobLooksLikePdf(blob))) {
    throw new Error("Server did not return a PDF.");
  }
  const filename =
    filenameFromContentDisposition(res.headers.get("Content-Disposition")) ||
    "AsliLearn-AI-Content.pdf";
  return { blob, filename };
}

async function downloadScreenMatchedPdf(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/super-admin/ai-tool-generations/document/${id}`, {
      headers: authHeaders(),
    });
    if (!res.ok) return false;
    const json = (await res.json().catch(() => null)) as { data?: Record<string, unknown> } | null;
    const record = json?.data;
    if (!record || typeof record !== "object") return false;
    const [{ mapRecordToScreenSixSection }, { downloadGenerationsPdf }] = await Promise.all([
      import("@/components/super-admin/generator-record-viewer"),
      import("@/components/super-admin/ai-tool-generations/pdf-utils"),
    ]);
    if (!mapRecordToScreenSixSection(record)) return false;
    const text = (k: string) => (record[k] == null ? undefined : String(record[k]));
    const title = [text("toolDisplayName") || text("toolName") || "AI Content", text("classLabel"), text("subject"), text("topic"), text("subtopic")]
      .filter(Boolean)
      .join("_");
    await downloadGenerationsPdf(title, [
      {
        toolDisplayName: text("toolDisplayName"),
        toolName: text("toolName"),
        classLabel: text("classLabel"),
        subject: text("subject"),
        topic: text("topic"),
        subtopic: text("subtopic"),
        content: text("content"),
        createdAt: text("createdAt"),
        record,
      },
    ]);
    return true;
  } catch (error) {
    console.warn("Screen-matched PDF failed; using the server PDF.", error);
    return false;
  }
}

/** Download a single AI tool generation record as a named PDF. */
export async function openAiToolRecordPdf(id: string): Promise<void> {
  // Records shown in the six-section view get a PDF of that same view (same
  // sections, numbering and maths). The server PDF walks the raw saved JSON,
  // so it only serves plain-text records or when the screen view can't map.
  if (await downloadScreenMatchedPdf(id)) return;
  const urls = [
    `${API_BASE_URL}/api/super-admin/ai-tool-generations/document/${id}/pdf`,
    `${API_BASE_URL}/api/ai-generator/pdf/${id}`,
  ];
  let lastError: Error | null = null;
  for (const url of urls) {
    try {
      const result = await fetchPdfFromUrl(url);
      if (!result) continue;
      triggerBlobDownload(result.blob, result.filename);
      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Failed to open PDF");
    }
  }
  throw lastError || new Error("Failed to open PDF");
}
