import { getAuthToken } from "@/lib/auth-utils";

// API config
// - Development: use local/non-SSL backend if needed
// - Production: MUST use HTTPS API endpoint (no mixed content)

const DEV_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const PROD_URL = import.meta.env.VITE_API_URL_PROD || "https://api.aslilearn.ai";

export const API_BASE_URL =
  import.meta.env.MODE === "production" ? PROD_URL : DEV_URL;

/** PDFs on our hosts can load in an iframe without the student proxy. */
export function isOurBackendPdfUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    return (
      host.includes("aslilearn.ai") ||
      host === "localhost" ||
      host === "127.0.0.1"
    );
  } catch {
    return true;
  }
}

/** Domains known to block datacenter IPs — serve directly to browser */
const DIRECT_FETCH_DOMAINS = [
  "ncert.nic.in",
  "ncertbooks.prashanthellina.com",
];

export function shouldFetchDirectly(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return DIRECT_FETCH_DOMAINS.some((d) => host === d || host.endsWith("." + d));
  } catch {
    return false;
  }
}

const PDF_IFRAME_CHROMELESS_HASH =
  "toolbar=0&navpanes=0&scrollbar=0&statusbar=0&messages=0&view=FitH";

/** Hide browser PDF viewer toolbar (download / print / menu) where supported. */
export function appendPdfViewerChromelessHash(src: string): string {
  if (!src) return "";
  const lower = src.toLowerCase();
  if (
    lower.includes("youtube.com") ||
    lower.includes("youtu.be") ||
    lower.includes("vimeo.com")
  ) {
    return src;
  }

  try {
    const url = new URL(src);
    const existing = url.hash ? url.hash.replace(/^#/, "") : "";
    const parts = existing
      ? existing
          .split("&")
          .filter(
            (p) =>
              p &&
              !p.startsWith("toolbar=") &&
              !p.startsWith("navpanes=") &&
              !p.startsWith("scrollbar=") &&
              !p.startsWith("statusbar=") &&
              !p.startsWith("messages=") &&
              !p.startsWith("view="),
          )
      : [];
    parts.push(...PDF_IFRAME_CHROMELESS_HASH.split("&"));
    url.hash = parts.join("&");
    return url.toString();
  } catch {
    if (src.includes("#")) {
      return `${src}&${PDF_IFRAME_CHROMELESS_HASH}`;
    }
    return `${src}#${PDF_IFRAME_CHROMELESS_HASH}`;
  }
}

/** Absolute URL for a stored content file path or full URL. */
export function normalizeContentFileUrl(fileUrl: string): string {
  if (!fileUrl?.trim()) return "";
  const raw = fileUrl.trim();
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  if (raw.startsWith("//")) return `https:${raw}`;
  if (raw.startsWith("/")) return `${API_BASE_URL}${raw}`;
  return `${API_BASE_URL}/${raw}`;
}

/**
 * PDF bytes via API proxy. Authentication uses the httpOnly session cookie.
 * Use on digital boards where embedded browser PDF plugins fail.
 */
export function getPdfContentPreviewProxyUrl(fileUrl: string, title?: string): string {
  const absolute = normalizeContentFileUrl(fileUrl);
  if (!absolute) return "";
  if (shouldFetchDirectly(absolute)) return absolute;

  return (
    `${API_BASE_URL}/api/student/content-preview` +
    `?url=${encodeURIComponent(absolute)}` +
    `&filename=${encodeURIComponent(title || "preview.pdf")}`
  );
}

/**
 * URL a new tab can actually open. `/uploads` files require auth or a signature;
 * `<a href="/uploads/...">` hits the frontend host and gets 401 on the API.
 */
export function getProtectedFileOpenUrl(fileUrl: string, title?: string): string {
  const raw = String(fileUrl || "").trim();
  if (!raw) return "";
  const lower = raw.toLowerCase();
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("data:") ||
    lower.startsWith("vbscript:") ||
    lower.startsWith("file:")
  ) {
    return "";
  }
  const absolute = normalizeContentFileUrl(raw);
  if (!absolute) return "";
  try {
    const parsed = new URL(absolute);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    if (parsed.searchParams.get("sig") && parsed.searchParams.get("exp")) {
      return absolute;
    }
    if (parsed.pathname.startsWith("/uploads/")) {
      return getPdfContentPreviewProxyUrl(absolute, title || "file");
    }
    return absolute;
  } catch {
    return "";
  }
}

export function openProtectedFile(fileUrl: string, title?: string): void {
  const url = getProtectedFileOpenUrl(fileUrl, title);
  if (!url || typeof window === "undefined") return;
  window.open(url, "_blank", "noopener,noreferrer");
}

/**
 * Authenticated proxy that returns PDF bytes (no 302 to NCERT) for pdf.js canvas rendering.
 */
export function getPdfJsFetchUrl(fileUrl: string, title?: string): string {
  const absolute = normalizeContentFileUrl(fileUrl);
  if (!absolute) return "";
  return (
    `${API_BASE_URL}/api/student/content-preview` +
    `?url=${encodeURIComponent(absolute)}` +
    `&filename=${encodeURIComponent(title || "preview.pdf")}` +
    `&forceProxy=1`
  );
}

/**
 * In-app full-window reader — never the browser PDF plugin (which shows Download).
 */
export function getPdfReaderAppUrl(fileUrl: string, title?: string, context?: string): string {
  const raw = String(fileUrl || "").trim();
  if (!raw) return "";
  const params = new URLSearchParams();
  params.set("file", raw);
  const label = String(title || "").trim();
  if (label) params.set("title", label);
  const ctx = String(context || "").trim();
  if (ctx) params.set("context", ctx);
  return `/pdf-reader?${params.toString()}`;
}

export function isAllowedPdfReaderFileUrl(fileUrl: string): boolean {
  const raw = String(fileUrl || "").trim();
  if (!raw) return false;
  const lower = raw.toLowerCase();
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("data:") ||
    lower.startsWith("vbscript:") ||
    lower.startsWith("file:")
  ) {
    return false;
  }
  const absolute = normalizeContentFileUrl(raw);
  if (!absolute) return false;
  try {
    const parsed = new URL(absolute);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/** Open a PDF in a new tab of our reader (no Chrome download toolbar). */
export function openPdfInAppReader(fileUrl: string, title?: string, context?: string): void {
  const url = getPdfReaderAppUrl(fileUrl, title, context);
  if (!url || typeof window === "undefined") return;
  window.open(url, "_blank", "noopener,noreferrer");
}

/**
 * Best URL to open a PDF in a new browser tab.
 * Always uses the in-app reader so Chrome's Download/Print bar is not shown.
 */
export function getPdfOpenInNewTabUrl(fileUrl: string, title?: string, context?: string): string {
  return getPdfReaderAppUrl(fileUrl, title, context);
}

/** Mobile iframe fallback: one page fitted to the viewport. */
export function getMobilePdfIframePageSrc(
  fileUrl: string,
  title?: string,
  page = 1,
): string {
  const base = getStudentPdfPreviewIframeSrc(fileUrl, title).split("#")[0];
  if (!base) return "";
  const pageNum = Math.max(1, Math.floor(page));
  return `${base}#page=${pageNum}&toolbar=0&navpanes=0&scrollbar=0&statusbar=0&messages=0&view=Fit`;
}

function resolvePdfPreviewBaseUrl(fileUrl: string, title?: string): string {
  const absolute = normalizeContentFileUrl(fileUrl);
  if (!absolute) return "";

  // NCERT and similar hosts block datacenter IPs — let the browser hit them directly.
  if (shouldFetchDirectly(absolute)) {
    return absolute;
  }

  // Always use the authenticated content-preview proxy for iframe embeds.
  // Direct api.aslilearn.ai /uploads URLs send X-Frame-Options: SAMEORIGIN, so
  // aslilearn.ai cannot iframe them (Chrome: "refused to connect").
  return getPdfContentPreviewProxyUrl(fileUrl, title);
}

/**
 * `src` for student PDF iframes. The API authenticates these requests with the
 * httpOnly session cookie; access tokens never appear in URLs.
 */
export function getStudentPdfPreviewIframeSrc(
  fileUrl: string,
  title?: string
): string {
  const base = resolvePdfPreviewBaseUrl(fileUrl, title);
  return appendPdfViewerChromelessHash(base);
}

/** PDF iframe src for any role (super-admin subject content, dashboard, etc.). */
export function getEmbeddedPdfIframeSrc(fileUrl: string, title?: string): string {
  return getStudentPdfPreviewIframeSrc(fileUrl, title);
}

const STREAMABLE_MEDIA_EXT =
  /\.(mp4|webm|ogg|mov|avi|mkv|mp3|wav|m4a|aac|flac|jpg|jpeg|png|gif|webp|svg|bmp)(\?|#|$)/i;

/** Whether inline PDF preview should be used (incl. Material uploads without .pdf in the URL). */
export function isPdfPreviewContent(
  fileUrl: string,
  contentType?: string | null,
): boolean {
  const absolute = normalizeContentFileUrl(fileUrl).toLowerCase();
  if (!absolute) return false;
  if (absolute.includes(".pdf")) return true;
  if (STREAMABLE_MEDIA_EXT.test(absolute)) return false;
  if (absolute.includes("youtube.com") || absolute.includes("youtu.be")) return false;

  const type = (contentType || "").trim();
  if (type === "TextBook" || type === "Workbook" || type === "PDF") return true;
  if (type === "Material" || type === "Homework") return true;
  if (/\/uploads\//i.test(absolute)) return true;

  return false;
}

export const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
  const url = endpoint.startsWith("http")
    ? endpoint
    : `${API_BASE_URL}${endpoint.startsWith("/") ? endpoint : "/" + endpoint}`;

  const token = typeof window !== "undefined" ? getAuthToken() || "" : "";

  const headers = {
    "Content-Type": "application/json",
    ...(token && { Authorization: `Bearer ${token}` }),
    ...(options.headers || {}),
  };

  return fetch(url, {
    ...options,
    headers,
    credentials: options.credentials ?? "include",
  });
};

export default API_BASE_URL;

