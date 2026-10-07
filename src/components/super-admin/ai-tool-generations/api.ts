import { API_BASE_URL } from "@/lib/api-config";
import { getAuthToken } from "@/lib/auth-utils";
import type { PdfRecord } from "./pdf-utils";
import { resilientFetch } from "@/lib/resilient-fetch";
export type { PdfRecord };

const BRANCH_FETCH_TIMEOUT_MS = 45_000;

function authHeaders(): HeadersInit {
  const token = getAuthToken() || "";
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export type BranchItem = { value: string; count: number };

/**
 * Shared board / product-track scope for every hierarchy request.
 * An empty `productCategory` means General, so it is only omitted when undefined.
 */
export function scopeParams(board?: string, productCategory?: string): Record<string, string> {
  return {
    ...(board ? { board } : {}),
    ...(productCategory !== undefined ? { productCategory } : {}),
  };
}
export type BranchResponse = {
  success: boolean;
  data: {
    nextLevel: string;
    items?: BranchItem[];
    leaf?: boolean;
    matchSummary?: Record<string, string>;
  };
};

export async function fetchBranch(params: Record<string, string>) {
  const qs = new URLSearchParams(params);
  const res = await resilientFetch(
    `${API_BASE_URL}/api/super-admin/ai-tool-generations/children?${qs.toString()}`,
    { headers: authHeaders(), timeoutMs: BRANCH_FETCH_TIMEOUT_MS, retries: 1 },
  );
  if (!res.ok) throw new Error(`Branch fetch failed: ${res.status}`);
  return (await res.json()) as BranchResponse;
}

export async function fetchBootstrap(params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params);
  const res = await resilientFetch(
    `${API_BASE_URL}/api/super-admin/ai-tool-generations/bootstrap?${qs.toString()}`,
    { headers: authHeaders(), timeoutMs: BRANCH_FETCH_TIMEOUT_MS, retries: 1 },
  );
  if (!res.ok) throw new Error(`Bootstrap fetch failed: ${res.status}`);
  return res.json() as Promise<{
    success: boolean;
    data: {
      total: number;
      topicsCount?: number;
      nextLevel: string;
      items: BranchItem[];
    };
  }>;
}

/**
 * Product tracks available for the category filter. Configured tracks come back
 * even when they have no generations yet, so an empty track is still selectable.
 */
export async function fetchProductCategories(params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params);
  const res = await resilientFetch(
    `${API_BASE_URL}/api/super-admin/ai-tool-generations/product-categories?${qs.toString()}`,
    { headers: authHeaders(), timeoutMs: BRANCH_FETCH_TIMEOUT_MS, retries: 1 },
  );
  if (!res.ok) throw new Error(`Product categories fetch failed: ${res.status}`);
  return res.json() as Promise<{
    success: boolean;
    data: { items: BranchItem[] };
  }>;
}

export async function fetchMeta(params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params);
  const res = await fetch(
    `${API_BASE_URL}/api/super-admin/ai-tool-generations/meta?${qs.toString()}`,
    { headers: authHeaders() },
  );
  if (!res.ok) throw new Error(`Meta fetch failed: ${res.status}`);
  return res.json() as Promise<{
    success: boolean;
    data: { total: number; topicsCount?: number };
  }>;
}

export type RecordSectionGap = {
  complete: boolean;
  missingSections: string[];
  optionalMissingSections?: string[];
};

export type ToolSectionGapSummary = {
  toolName: string;
  toolDisplayName: string;
  totalScanned: number;
  incompleteCount: number;
  truncated?: boolean;
  items: Pick<
    RecordRow,
    | "_id"
    | "toolName"
    | "toolDisplayName"
    | "classLabel"
    | "subject"
    | "topic"
    | "subtopic"
    | "sectionGap"
  >[];
};

export type AllToolSectionGapSummaries = {
  totalScanned: number;
  cachedAt?: string;
  byTool: Record<string, ToolSectionGapSummary>;
};

export async function fetchSectionGapSummaries(board = "", limit = 50, refresh = false) {
  const qs = new URLSearchParams({ limit: String(limit) });
  if (board) qs.set("board", board);
  if (refresh) qs.set("refresh", "1");
  const res = await resilientFetch(
    `${API_BASE_URL}/api/super-admin/ai-tool-generations/section-gap-summary?${qs.toString()}`,
    { headers: authHeaders(), timeoutMs: 90_000, retries: 1 },
  );
  if (!res.ok) throw new Error(`Section gap summaries failed: ${res.status}`);
  return res.json() as Promise<{ success: boolean; data: AllToolSectionGapSummaries }>;
}

export async function fetchToolSectionGapSummary(toolName: string, board = "", limit = 50) {
  const qs = new URLSearchParams({ toolName, limit: String(limit) });
  if (board) qs.set("board", board);
  const res = await fetch(
    `${API_BASE_URL}/api/super-admin/ai-tool-generations/section-gap-summary?${qs.toString()}`,
    { headers: authHeaders() },
  );
  if (!res.ok) throw new Error(`Section gap summary failed: ${res.status}`);
  return res.json() as Promise<{ success: boolean; data: ToolSectionGapSummary }>;
}

export type RecordRow = {
  _id: string;
  sourceType?: string;
  board?: string;
  /** IIT product track (ALPHA / BETA / …). Empty = General. */
  productCategory?: string;
  toolName: string;
  toolDisplayName?: string;
  classLabel: string;
  subject: string;
  topic?: string;
  subtopic?: string;
  createdAt?: string;
  preview: string;
  /** Full stored text / markdown (needed to parse fallback MCQ blobs in the list). */
  content?: string;
  metadata?: Record<string, unknown>;
  sectionGap?: RecordSectionGap;
};

export async function fetchRecords(
  params: Record<string, string>,
  page = 1,
  limit = 25,
) {
  const qs = new URLSearchParams({ ...params, page: String(page), limit: String(limit) });
  const res = await fetch(
    `${API_BASE_URL}/api/super-admin/ai-tool-generations/records?${qs.toString()}`,
    { headers: authHeaders() },
  );
  if (!res.ok) throw new Error(`Records fetch failed: ${res.status}`);
  return res.json() as Promise<{
    success: boolean;
    data: {
      total: number;
      items: RecordRow[];
      page: number;
      limit: number;
    };
  }>;
}

export async function fetchDocument(id: string) {
  const res = await fetch(
    `${API_BASE_URL}/api/super-admin/ai-tool-generations/document/${id}`,
    { headers: authHeaders() },
  );
  if (!res.ok) throw new Error(`Document fetch failed: ${res.status}`);
  return res.json() as Promise<{ success: boolean; data: PdfRecord & { content: string } }>;
}

export async function updateDocument(id: string, content: string) {
  const res = await fetch(
    `${API_BASE_URL}/api/super-admin/ai-tool-generations/document/${id}`,
    {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify({ content }),
    },
  );
  if (!res.ok) throw new Error(`Document update failed: ${res.status}`);
  return res.json() as Promise<{ success: boolean; data: PdfRecord & { content: string } }>;
}

/** Update worksheet / MCQ structured payload (e.g. delete one question) without replacing full text. */
export async function patchDocumentStructured(id: string, structuredContent: Record<string, unknown>) {
  const res = await fetch(
    `${API_BASE_URL}/api/super-admin/ai-tool-generations/document/${id}`,
    {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify({ structuredContent }),
    },
  );
  if (!res.ok) throw new Error(`Structured update failed: ${res.status}`);
  return res.json() as Promise<{ success: boolean; data: Record<string, unknown> }>;
}

export async function deleteDocument(id: string) {
  const res = await fetch(
    `${API_BASE_URL}/api/super-admin/ai-tool-generations/document/${id}`,
    {
      method: "DELETE",
      headers: authHeaders(),
    },
  );
  if (!res.ok) throw new Error(`Document delete failed: ${res.status}`);
  return res.json() as Promise<{ success: boolean; message?: string }>;
}

export async function fetchExportBundle(
  params: Record<string, string>,
  maxDocs = 2000,
) {
  const qs = new URLSearchParams({ ...params, maxDocs: String(maxDocs) });
  const res = await fetch(
    `${API_BASE_URL}/api/super-admin/ai-tool-generations/export-bundle?${qs.toString()}`,
    { headers: authHeaders() },
  );
  if (!res.ok) throw new Error(`Export failed: ${res.status}`);
  return res.json() as Promise<{
    success: boolean;
    data: {
      truncated?: boolean;
      warning?: string;
      records: PdfRecord[];
    };
  }>;
}
