import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { ChevronLeft, ChevronRight, ExternalLink, Loader2, Maximize2, Minimize2, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getAuthToken } from '@/lib/auth-utils';
import {
  getEmbeddedPdfIframeSrc,
  getMobilePdfIframePageSrc,
  getPdfContentPreviewProxyUrl,
  getPdfJsFetchUrl,
  getPdfOpenInNewTabUrl,
  isOurBackendPdfUrl,
  normalizeContentFileUrl,
  shouldFetchDirectly,
} from '@/lib/api-config';
import { detectDigitalBoard } from '@/hooks/use-digital-board';
import PdfMobileScrollViewer, {
  readStoredPdfPage,
  writeStoredPdfPage,
  type PdfMobileScrollViewerHandle,
} from '@/components/shared/PdfMobileScrollViewer';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface PdfPreviewPanelProps {
  fileUrl: string;
  title?: string;
  className?: string;
  /** When true, always show external open link. Default: only when preview fails. */
  showOpenInNewTab?: boolean;
  /**
   * book = A4 portrait reading column (default for materials).
   * fill = stretch to parent (legacy wide preview).
   */
  variant?: 'book' | 'fill';
  /** Show a browser fullscreen toggle for the preview panel. */
  allowFullscreen?: boolean;
  /** Class · subject line shown while reading (Learning Paths). */
  contextLabel?: string;
}

function isPdfBuffer(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 5) return false;
  const h = new Uint8Array(buffer, 0, 5);
  return (
    h[0] === 0x25 &&
    h[1] === 0x50 &&
    h[2] === 0x44 &&
    h[3] === 0x46 &&
    h[4] === 0x2d
  );
}

function toPdfBytes(buffer: ArrayBuffer): Uint8Array {
  return new Uint8Array(buffer.slice(0));
}

/** Prefer authenticated proxy so pdf.js gets real bytes (NCERT hosts block browser CORS). */
function buildPdfFetchCandidates(fileUrl: string, title?: string): string[] {
  const absolute = normalizeContentFileUrl(fileUrl);
  const jsProxy = getPdfJsFetchUrl(fileUrl, title);
  const seen = new Set<string>();
  const candidates: string[] = [];

  const push = (url: string) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    candidates.push(url);
  };

  const directOnly = Boolean(absolute && shouldFetchDirectly(absolute));

  // These hosts are explicitly marked direct because API/datacenter requests
  // are blocked or unreliable. Do not wait through the failing proxy first.
  if (directOnly) push(absolute);
  else push(jsProxy);

  if (absolute && /\/uploads\//i.test(absolute)) {
    push(absolute);
  }

  // Known direct-only textbook hosts may reject datacenter/API traffic but allow
  // the student's browser. Give pdf.js a direct, credential-free attempt.
  if (absolute && (pdfJsCanLoadUrlDirectly(absolute) || directOnly)) {
    push(absolute);
  }

  return candidates;
}

function isContentPreviewProxyUrl(url: string): boolean {
  return /\/api\/student\/content-preview/i.test(url);
}

function pdfFetchCredentials(url: string): RequestCredentials {
  if (/\/uploads\//i.test(url)) return 'omit';
  if (isContentPreviewProxyUrl(url)) return 'omit';
  if (typeof window !== 'undefined') {
    try {
      if (new URL(url, window.location.href).origin !== window.location.origin) return 'omit';
    } catch {
      return 'omit';
    }
  }
  return 'include';
}

function pdfFetchHeaders(url: string, token: string): HeadersInit | undefined {
  if (isContentPreviewProxyUrl(url) && url.includes('token=')) {
    return undefined;
  }
  // Never send the AsliLearn JWT to a third-party textbook host. Besides being
  // unsafe, Authorization forces a CORS preflight that many PDF hosts reject.
  if (token && isContentPreviewProxyUrl(url)) {
    return { Authorization: `Bearer ${token}` };
  }
  return undefined;
}

async function fetchPdfBytes(fileUrl: string, title?: string): Promise<Uint8Array> {
  const candidates = buildPdfFetchCandidates(fileUrl, title);
  const token =
    typeof window !== 'undefined'
      ? getAuthToken() ||
        ''
      : '';

  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        method: 'GET',
        credentials: pdfFetchCredentials(url),
        headers: pdfFetchHeaders(url, token),
      });
      if (!res.ok) continue;
      const buf = await res.arrayBuffer();
      if (isPdfBuffer(buf)) return toPdfBytes(buf);
    } catch {
      /* try next URL */
    }
  }

  throw new Error('PDF_FETCH_FAILED');
}

function prefersDisableWorker(): boolean {
  return isMobileUserAgent() || isIosOrIpadosBrowser();
}

type PdfSource =
  | { mode: 'url'; url: string }
  | { mode: 'data'; bytes: Uint8Array };

type PdfDocumentInit = {
  url?: string;
  data?: Uint8Array;
  useSystemFonts?: boolean;
  withCredentials?: boolean;
  httpHeaders?: Record<string, string>;
};

function buildPdfDocumentInit(source: PdfSource): PdfDocumentInit {
  const token =
    typeof window !== 'undefined'
      ? getAuthToken() ||
        ''
      : '';
  const base: PdfDocumentInit = {
    useSystemFonts: true,
  };

  if (source.mode === 'url') {
    const isApiProxy = isContentPreviewProxyUrl(source.url);
    return {
      ...base,
      url: source.url,
      withCredentials: true,
      httpHeaders:
        token && !isApiProxy
          ? { Authorization: `Bearer ${token}` }
          : undefined,
    };
  }

  return { ...base, data: source.bytes };
}

function getPageViewport(page: pdfjs.PDFPageProxy, scale: number) {
  return page.getViewport({ scale, dontFlip: false });
}

/** Touch browsers: load bytes on the main thread when URL streaming is unreliable. */
async function openPdfDocument(source: PdfSource): Promise<pdfjs.PDFDocumentProxy> {
  const init = buildPdfDocumentInit(source) as Parameters<typeof pdfjs.getDocument>[0];
  return pdfjs.getDocument(init).promise;
}

function capRenderScale(
  pageWidth: number,
  pageHeight: number,
  scale: number,
): number {
  const mobile = prefersDisableWorker();
  const maxDim = mobile ? 1280 : 4096;
  const maxPixels = mobile ? 1_200_000 : 6_000_000;
  let w = pageWidth * scale;
  let h = pageHeight * scale;
  const dimLimit = maxDim / Math.max(pageWidth, pageHeight, 1);
  if (scale > dimLimit) scale = dimLimit;
  w = pageWidth * scale;
  h = pageHeight * scale;
  const pixelCount = w * h;
  if (pixelCount > maxPixels) {
    scale *= Math.sqrt(maxPixels / pixelCount);
  }
  return scale;
}

function getSafeOutputScale(
  cssScale: number,
  pageWidth: number,
  pageHeight: number,
): number {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const cappedDpr = prefersDisableWorker() ? Math.min(dpr, 1.5) : Math.min(dpr, 2);
  const scale = cssScale * cappedDpr;
  return capRenderScale(pageWidth, pageHeight, scale);
}

const COMPACT_VIEWPORT_MAX_PX = 1023;
const TABLET_VIEWPORT_MAX_PX = 1366;

function isIosOrIpadosBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/i.test(ua)) return true;
  // iPadOS 13+ may report as Mac with touch.
  return navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1;
}

function isMobileUserAgent(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|Mobile|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

function isCoarsePointerDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(pointer: coarse)').matches ||
    window.matchMedia('(hover: none)').matches
  );
}

function isTouchCapableDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (navigator.maxTouchPoints ?? 0) > 0;
}

function isTouchTabletViewport(): boolean {
  if (typeof window === 'undefined') return false;
  const touchPoints = navigator.maxTouchPoints ?? 0;
  const coarsePointer = isCoarsePointerDevice();
  return coarsePointer && touchPoints >= 1 && window.innerWidth <= TABLET_VIEWPORT_MAX_PX;
}

/** PDF iframes on touch browsers show only filename + "Open" — never use inline. */
function canUseInlinePdfIframe(): boolean {
  if (typeof window === 'undefined') return false;
  if (isMobileUserAgent()) return false;
  if (isIosOrIpadosBrowser()) return false;
  if (isTouchTabletViewport()) return false;
  if (isCoarsePointerDevice() && isTouchCapableDevice()) return false;
  return true;
}

/**
 * Most external PDF hosts send X-Frame-Options: SAMEORIGIN. Known direct-only
 * textbook hosts are the exception: the API cannot fetch them, so retain their
 * browser iframe as the final desktop fallback.
 */
function shouldAvoidCrossOriginPdfIframe(fileUrl: string): boolean {
  if (typeof window === 'undefined') return true;
  const absolute = normalizeContentFileUrl(fileUrl);
  if (!absolute) return true;
  if (shouldFetchDirectly(absolute)) return false;
  try {
    return new URL(absolute).origin !== window.location.origin;
  } catch {
    return true;
  }
}

/** Mobile/tablet browsers often show only filename + "Open" inside PDF iframes. */
function shouldUseCanvasPdfPreview(): boolean {
  if (typeof window === 'undefined') return false;
  if (detectDigitalBoard()) return true;
  // UA check catches phones even in "Desktop site" mode (wide layout + FitH iframe).
  if (isMobileUserAgent()) return true;
  if (isIosOrIpadosBrowser()) return true;
  if (isTouchTabletViewport()) return true;
  if (isCoarsePointerDevice() && isTouchCapableDevice()) return true;
  return window.innerWidth <= COMPACT_VIEWPORT_MAX_PX;
}

function pdfJsCanLoadUrlDirectly(url: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return new URL(url).origin === window.location.origin;
  } catch {
    return false;
  }
}

function useCanvasPdfPreview(): boolean {
  const [useCanvas, setUseCanvas] = useState(shouldUseCanvasPdfPreview);

  useLayoutEffect(() => {
    const update = () => setUseCanvas(shouldUseCanvasPdfPreview());
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    const compactMq = window.matchMedia(`(max-width: ${COMPACT_VIEWPORT_MAX_PX}px)`);
    const tabletMq = window.matchMedia(`(max-width: ${TABLET_VIEWPORT_MAX_PX}px)`);
    const coarseMq = window.matchMedia('(pointer: coarse)');
    const hoverMq = window.matchMedia('(hover: none)');
    compactMq.addEventListener('change', update);
    tabletMq.addEventListener('change', update);
    coarseMq.addEventListener('change', update);
    hoverMq.addEventListener('change', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      compactMq.removeEventListener('change', update);
      tabletMq.removeEventListener('change', update);
      coarseMq.removeEventListener('change', update);
      hoverMq.removeEventListener('change', update);
    };
  }, []);

  return useCanvas;
}

function measurePreviewViewport(el: HTMLElement): { width: number; height: number } {
  const rect = el.getBoundingClientRect();
  let width = Math.floor(rect.width || el.clientWidth);
  let height = Math.floor(rect.height || el.clientHeight);

  if (typeof window !== 'undefined') {
    if (height < 80) {
      let parent = el.parentElement;
      while (parent && parent.clientHeight < 80) {
        parent = parent.parentElement;
      }
      if (parent && parent.clientHeight >= 80) {
        height = Math.floor(parent.clientHeight);
      } else {
        height = Math.floor(Math.min(window.innerHeight * 0.72, 760));
      }
    }
    if (width < 80) {
      width = Math.floor(Math.min(window.innerWidth * 0.92, el.parentElement?.clientWidth || window.innerWidth));
    }
  }

  return { width, height };
}

/** Fit one page inside the preview area (single full-screen page). */
function getFitContainScale(
  containerWidth: number,
  containerHeight: number,
  pageWidth: number,
  pageHeight: number,
): number {
  const pad = 8;
  const availW = Math.max(0, containerWidth - pad);
  const availH = Math.max(0, containerHeight - pad);
  if (availW <= 0 || availH <= 0 || pageWidth <= 0 || pageHeight <= 0) return 1;
  return Math.min(availW / pageWidth, availH / pageHeight);
}

/** Fit page to container width — used for mobile vertical scroll stacks. */
function getFitWidthScale(containerWidth: number, pageWidth: number): number {
  const pad = 8;
  const availW = Math.max(0, containerWidth - pad);
  if (availW <= 0 || pageWidth <= 0) return 1;
  return availW / pageWidth;
}

type PageLayout = 'viewport' | 'scroll';

function PdfPageJumpBar({
  page,
  pageCount,
  draft,
  onDraftChange,
  onSubmit,
  onPrev,
  onNext,
}: {
  page: number;
  pageCount: number;
  draft: string;
  onDraftChange: (value: string) => void;
  onSubmit: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const knownCount = pageCount > 0;
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-t border-stone-300/50 bg-stone-100/95 px-3 py-2.5 backdrop-blur-sm sm:gap-3 sm:py-3">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-10 min-w-10 rounded-xl px-0 sm:h-11 sm:min-w-11"
        disabled={page <= 1}
        onClick={onPrev}
        aria-label="Previous page"
      >
        <ChevronLeft className="h-5 w-5" />
      </Button>
      <form
        className="flex items-center gap-1.5 sm:gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <span className="text-sm font-semibold text-stone-700">Page</span>
        <Input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={draft}
          onChange={(e) => onDraftChange(e.target.value.replace(/[^\d]/g, ''))}
          onBlur={onSubmit}
          onFocus={(e) => e.currentTarget.select()}
          className="h-10 w-14 rounded-xl text-center text-sm font-semibold tabular-nums sm:h-11 sm:w-16"
          aria-label="Go to page number"
        />
        {knownCount ? (
          <span className="text-sm font-semibold tabular-nums text-stone-700">
            of {pageCount}
          </span>
        ) : null}
        <Button type="submit" variant="outline" size="sm" className="h-10 rounded-xl px-3 sm:h-11">
          Go
        </Button>
      </form>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-10 min-w-10 rounded-xl px-0 sm:h-11 sm:min-w-11"
        disabled={knownCount ? page >= pageCount : false}
        onClick={onNext}
        aria-label="Next page"
      >
        <ChevronRight className="h-5 w-5" />
      </Button>
    </div>
  );
}

export default function PdfPreviewPanel({
  fileUrl,
  title,
  className = '',
  showOpenInNewTab = false,
  variant = 'book',
  allowFullscreen = true,
  contextLabel = '',
}: PdfPreviewPanelProps) {
  const isBookLayout = variant !== 'fill';
  const prefersCanvasPreview = useCanvasPdfPreview();
  const inlineIframeSupported = canUseInlinePdfIframe();
  const avoidCrossOriginIframe = shouldAvoidCrossOriginPdfIframe(fileUrl);
  /**
   * Book mode always uses canvas page stack (no Chrome FitH iframe clipping).
   * Otherwise canvas when touch/tablet, cross-origin APIs, or iframes cannot render.
   */
  const useCanvasRendering =
    isBookLayout ||
    prefersCanvasPreview ||
    !inlineIframeSupported ||
    avoidCrossOriginIframe;
  /**
   * Book / phone / tablet: vertical page stack (A4 reading).
   * Digital boards in fill mode keep snap full-viewport pages.
   */
  const useMobileScrollLayout =
    useCanvasRendering &&
    typeof window !== 'undefined' &&
    (isBookLayout || !detectDigitalBoard());
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollHostRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const mobileViewerRef = useRef<PdfMobileScrollViewerHandle>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [readerPage, setReaderPage] = useState(1);
  const [readerPageCount, setReaderPageCount] = useState(0);
  const [readerZoomScale, setReaderZoomScale] = useState(1);
  const [pageJumpDraft, setPageJumpDraft] = useState('1');
  const [iframeJumpPage, setIframeJumpPage] = useState(1);
  const pdfDocRef = useRef<pdfjs.PDFDocumentProxy | null>(null);
  const renderingPagesRef = useRef<Set<number>>(new Set());
  /** Survives the slot rebuild that fullscreen toggling causes. */
  const rememberedPageRef = useRef<number>(1);

  useEffect(() => {
    rememberedPageRef.current = readStoredPdfPage(normalizeContentFileUrl(fileUrl) || fileUrl);
  }, [fileUrl]);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [totalPages, setTotalPages] = useState(0);
  const [pdfSource, setPdfSource] = useState<PdfSource | null>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [useIframeFallback, setUseIframeFallback] = useState(false);

  const absoluteUrl = normalizeContentFileUrl(fileUrl);
  const proxyUrl = getPdfContentPreviewProxyUrl(fileUrl, title);
  const forcedProxyUrl = getPdfJsFetchUrl(fileUrl, title);
  const iframeSrc =
    iframeJumpPage > 1
      ? getMobilePdfIframePageSrc(absoluteUrl || fileUrl, title, iframeJumpPage)
      : getEmbeddedPdfIframeSrc(absoluteUrl || fileUrl, title);
  const openInNewTab = useCallback(() => {
    const target = getPdfOpenInNewTabUrl(fileUrl, title, contextLabel);
    if (target) window.open(target, '_blank', 'noopener,noreferrer');
  }, [fileUrl, title, contextLabel]);

  const toggleFullscreen = useCallback(async () => {
    const el = panelRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (el.requestFullscreen) {
        await el.requestFullscreen();
      }
    } catch {
      // Browser may deny fullscreen without user gesture or policy.
    }
  }, []);

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const jumpReaderPage = useCallback(
    (page: number) => {
      const knownMax = readerPageCount || totalPages;
      const next =
        knownMax > 0
          ? Math.min(Math.max(1, Math.floor(page)), knownMax)
          : Math.max(1, Math.floor(page));
      setReaderPage(next);
      setPageJumpDraft(String(next));
      setIframeJumpPage(next);
      rememberedPageRef.current = next;
      if (absoluteUrl) writeStoredPdfPage(absoluteUrl, next);

      if (useMobileScrollLayout) {
        const viewer = mobileViewerRef.current;
        if (viewer) {
          viewer.goToPage(next);
          return;
        }
        window.requestAnimationFrame(() => {
          mobileViewerRef.current?.goToPage(next);
        });
        return;
      }

      const host = scrollHostRef.current;
      if (host && host.childElementCount >= 1) {
        const pageH = Math.max(1, host.clientHeight);
        host.scrollTo({ top: (next - 1) * pageH, behavior: 'auto' });
      }
    },
    [useMobileScrollLayout, readerPageCount, totalPages, absoluteUrl],
  );

  /** Resolve the element that should receive keyboard scrolling (canvas, not window). */
  const getReaderScrollTarget = useCallback((): HTMLElement | null => {
    if (useMobileScrollLayout) {
      return mobileViewerRef.current?.getScrollElement() ?? null;
    }
    return scrollHostRef.current;
  }, [useMobileScrollLayout]);

  const scrollReaderCanvas = useCallback(
    (dx: number, dy: number) => {
      if (useMobileScrollLayout && mobileViewerRef.current) {
        mobileViewerRef.current.scrollBy(dx, dy);
        return;
      }
      const host = scrollHostRef.current;
      if (!host) return;
      host.scrollBy({ left: dx, top: dy, behavior: 'auto' });
    },
    [useMobileScrollLayout],
  );

  // Capture arrow/page keys so scrolling stays inside the textbook canvas.
  useEffect(() => {
    const isTypingTarget = (el: EventTarget | null) => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if (el.isContentEditable) return true;
      return Boolean(el.closest('[contenteditable="true"]'));
    };

    const shouldTrapKeys = () => {
      const panel = panelRef.current;
      if (!panel) return false;
      if (document.fullscreenElement && panel.contains(document.fullscreenElement)) return true;
      if (document.fullscreenElement === panel) return true;
      if (panel.closest('[role="dialog"]')) return true;
      if (panel.contains(document.activeElement)) return true;
      if (panel.matches(':hover')) return true;
      return false;
    };

    const lineStep = () => {
      const el = getReaderScrollTarget();
      const h = el?.clientHeight ?? 480;
      return Math.max(48, Math.min(120, Math.round(h * 0.12)));
    };

    const pageStep = () => {
      const el = getReaderScrollTarget();
      const h = el?.clientHeight ?? 480;
      return Math.max(160, Math.round(h * 0.85));
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      if (isTypingTarget(e.target)) return;
      if (!shouldTrapKeys()) return;

      const key = e.key;
      const isZoomInKey = key === '+' || key === '=' || key === 'Add';
      const isZoomOutKey = key === '-' || key === '_' || key === 'Subtract';
      const isResetZoomKey = key === '0';

      if (
        key !== 'ArrowDown' &&
        key !== 'ArrowUp' &&
        key !== 'ArrowLeft' &&
        key !== 'ArrowRight' &&
        key !== 'PageDown' &&
        key !== 'PageUp' &&
        key !== ' ' &&
        key !== 'Home' &&
        key !== 'End' &&
        !isZoomInKey &&
        !isZoomOutKey &&
        !isResetZoomKey
      ) {
        return;
      }

      // Keep focus/scroll inside the reader — never the dashboard behind.
      e.preventDefault();
      e.stopPropagation();

      if (isZoomInKey) {
        mobileViewerRef.current?.zoomIn();
      } else if (isZoomOutKey) {
        mobileViewerRef.current?.zoomOut();
      } else if (isResetZoomKey) {
        mobileViewerRef.current?.resetZoom();
      } else if (key === 'ArrowDown') {
        scrollReaderCanvas(0, lineStep());
      } else if (key === 'ArrowUp') {
        scrollReaderCanvas(0, -lineStep());
      } else if (key === 'ArrowRight') {
        scrollReaderCanvas(lineStep(), 0);
      } else if (key === 'ArrowLeft') {
        scrollReaderCanvas(-lineStep(), 0);
      } else if (key === 'PageDown' || key === ' ') {
        scrollReaderCanvas(0, pageStep());
      } else if (key === 'PageUp') {
        scrollReaderCanvas(0, -pageStep());
      } else if (key === 'Home') {
        if (useMobileScrollLayout && mobileViewerRef.current) {
          mobileViewerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        } else if (scrollHostRef.current) {
          scrollHostRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
          jumpReaderPage(1);
        }
      } else if (key === 'End') {
        const el = getReaderScrollTarget();
        if (el) {
          el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
        } else {
          jumpReaderPage(totalPages || readerPageCount || 1);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [
    scrollReaderCanvas,
    getReaderScrollTarget,
    jumpReaderPage,
    useMobileScrollLayout,
    totalPages,
    readerPageCount,
  ]);

  // Put keyboard focus on the reader so arrow keys work immediately when opened.
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const id = window.setTimeout(() => {
      panel.focus({ preventScroll: true });
    }, 0);
    return () => window.clearTimeout(id);
  }, [fileUrl]);

  const updateContainerSize = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const next = measurePreviewViewport(el);
    setContainerSize((prev) =>
      prev.width === next.width && prev.height === next.height ? prev : next,
    );
  }, []);

  useLayoutEffect(() => {
    if (!useCanvasRendering) return;
    updateContainerSize();
  }, [useCanvasRendering, updateContainerSize, loadingPdf, totalPages]);

  useEffect(() => {
    if (!useCanvasRendering || !containerRef.current) return;
    const el = containerRef.current;
    updateContainerSize();
    const ro = new ResizeObserver(() => updateContainerSize());
    ro.observe(el);
    window.addEventListener('resize', updateContainerSize);
    window.addEventListener('orientationchange', updateContainerSize);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateContainerSize);
      window.removeEventListener('orientationchange', updateContainerSize);
    };
  }, [useCanvasRendering, updateContainerSize]);

  useLayoutEffect(() => {
    if (!useCanvasRendering) return;
    updateContainerSize();
  }, [isFullscreen, useCanvasRendering, updateContainerSize]);

  useEffect(() => {
    setPageJumpDraft(String(readerPage));
  }, [readerPage]);

  useEffect(() => {
    const stored = readStoredPdfPage(normalizeContentFileUrl(fileUrl) || fileUrl);
    const start = stored >= 1 ? stored : 1;
    setTotalPages(0);
    setUseIframeFallback(false);
    setPdfError(null);
    setReaderPage(start);
    setReaderPageCount(0);
    setReaderZoomScale(1);
    setPageJumpDraft(String(start));
    setIframeJumpPage(start);
  }, [fileUrl, title]);

  const submitPageJump = useCallback(() => {
    const parsed = Number.parseInt(pageJumpDraft.replace(/[^\d]/g, ''), 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      setPageJumpDraft(String(readerPage));
      return;
    }
    const knownMax = readerPageCount || totalPages;
    const next = knownMax > 0 ? Math.min(parsed, knownMax) : parsed;
    jumpReaderPage(next);
  }, [pageJumpDraft, readerPage, readerPageCount, totalPages, jumpReaderPage]);

  const destroyPdfDoc = useCallback(async () => {
    if (!pdfDocRef.current) return;
    await pdfDocRef.current.destroy();
    pdfDocRef.current = null;
    setPdfDoc(null);
  }, []);

  useEffect(() => {
    if (!useCanvasRendering) {
      setLoadingPdf(false);
      setPdfError(null);
      setPdfSource(null);
      setUseIframeFallback(false);
      void destroyPdfDoc();
      if (scrollHostRef.current) scrollHostRef.current.innerHTML = '';
      return;
    }

    let cancelled = false;
    setLoadingPdf(true);
    setPdfError(null);
    setPdfSource(null);
    setUseIframeFallback(false);
    renderingPagesRef.current.clear();
    if (scrollHostRef.current) scrollHostRef.current.innerHTML = '';
    void destroyPdfDoc();

    const trySetPdfSource = async (source: PdfSource) => {
      await destroyPdfDoc();
      const pdf = await openPdfDocument(source);
      if (cancelled) {
        await pdf.destroy();
        return;
      }
      pdfDocRef.current = pdf;
      setPdfDoc(pdf);
      setPdfSource(source);
      setTotalPages(pdf.numPages);
    };

    const enableIframeFallback = async (sources: PdfSource[]) => {
      if (cancelled) return;

      for (const source of sources) {
        try {
          await trySetPdfSource(source);
          return;
        } catch {
          /* try next source */
        }
      }

      if (!canUseInlinePdfIframe() || shouldAvoidCrossOriginPdfIframe(fileUrl)) {
        if (!cancelled) {
          const isExternalHost =
            shouldFetchDirectly(absoluteUrl) ||
            (Boolean(absoluteUrl) &&
              !isOurBackendPdfUrl(absoluteUrl) &&
              !/\/uploads\//i.test(absoluteUrl));
          setPdfError(
            isExternalHost
              ? 'This textbook link could not be loaded for inline preview (often external NCERT/host links or very large files). Tap below to open it in your browser.'
              : 'Could not display this PDF on your device. Open it externally to read.',
          );
        }
        return;
      }

      setUseIframeFallback(true);
      setPdfSource(null);
      if (!cancelled) setTotalPages(500);
    };

    const jsUrl = getPdfJsFetchUrl(fileUrl, title);
    const absolute = normalizeContentFileUrl(fileUrl);
    const urlSources: PdfSource[] = [];
    const seenUrls = new Set<string>();
    const directOnly = Boolean(absolute && shouldFetchDirectly(absolute));
    for (const url of directOnly ? [absolute] : [jsUrl, absolute]) {
      if (!url || seenUrls.has(url)) continue;
      if (
        url === absolute &&
        !pdfJsCanLoadUrlDirectly(url) &&
        !shouldFetchDirectly(url) &&
        !/\/uploads\//i.test(url)
      ) {
        continue;
      }
      seenUrls.add(url);
      urlSources.push({ mode: 'url', url });
    }

    (async () => {
      // Mobile/tablet: load bytes first — URL streaming via pdf.js is less reliable on touch browsers.
      if (prefersDisableWorker()) {
        try {
          const bytes = await fetchPdfBytes(fileUrl, title);
          if (cancelled) return;
          await trySetPdfSource({ mode: 'data', bytes });
          return;
        } catch {
          /* try URL sources, then bytes again below */
        }
      }

      for (const source of urlSources) {
        if (cancelled) return;
        try {
          await trySetPdfSource(source);
          return;
        } catch {
          /* try streamed URL fallback */
        }
      }

      try {
        const bytes = await fetchPdfBytes(fileUrl, title);
        if (cancelled) return;
        await trySetPdfSource({ mode: 'data', bytes });
      } catch {
        await enableIframeFallback(urlSources);
      }
    })()
      .finally(() => {
        if (!cancelled) setLoadingPdf(false);
      });

    return () => {
      cancelled = true;
      void destroyPdfDoc();
    };
  }, [useCanvasRendering, fileUrl, title, destroyPdfDoc]);

  const renderPageIntoSlot = useCallback(
    async (
      pageNum: number,
      slot: HTMLElement,
      size: { width: number; height: number },
      signal?: { cancelled: boolean },
      layout: PageLayout = 'viewport',
    ) => {
      const pdf = pdfDocRef.current;
      if (!pdf || signal?.cancelled) return false;
      if (slot.dataset.rendered === '1' || renderingPagesRef.current.has(pageNum)) return true;
      renderingPagesRef.current.add(pageNum);
      try {
        const page = await pdf.getPage(pageNum);
        if (signal?.cancelled) return false;
        const base = getPageViewport(page, 1);
        const cssScale =
          layout === 'scroll'
            ? getFitWidthScale(size.width, base.width)
            : getFitContainScale(size.width, size.height, base.width, base.height);
        const cssWidth = Math.floor(base.width * cssScale);
        const cssHeight = Math.floor(base.height * cssScale);
        const baseOutputScale = getSafeOutputScale(cssScale, base.width, base.height);
        const scaleAttempts = prefersDisableWorker()
          ? [baseOutputScale, baseOutputScale * 0.75, cssScale, cssScale * 0.65]
          : [baseOutputScale, baseOutputScale * 0.8, cssScale];

        for (const outputScale of scaleAttempts) {
          if (signal?.cancelled) break;
          const viewport = getPageViewport(page, outputScale);
          const canvas = document.createElement('canvas');
          canvas.className = 'block max-w-full rounded-sm bg-white shadow-md';
          canvas.width = Math.max(1, Math.floor(viewport.width));
          canvas.height = Math.max(1, Math.floor(viewport.height));
          canvas.style.width = `${cssWidth}px`;
          canvas.style.height = `${cssHeight}px`;
          const ctx = canvas.getContext('2d', { alpha: false });
          if (!ctx) continue;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          try {
            await page.render({ canvasContext: ctx, viewport, canvas }).promise;
            if (!signal?.cancelled) {
              slot.replaceChildren(canvas);
              slot.dataset.rendered = '1';
              if (layout === 'scroll') {
                slot.style.minHeight = `${cssHeight + 8}px`;
              }
              return true;
            }
          } catch {
            /* retry at lower scale */
          }
        }
      } finally {
        renderingPagesRef.current.delete(pageNum);
      }
      return false;
    },
    [],
  );

  /** Canvas rendering: digital boards = full-screen snap pages (imperative DOM). */
  useEffect(() => {
    if (!useCanvasRendering || useMobileScrollLayout || useIframeFallback || !pdfSource || pdfError) {
      return;
    }
    if (!scrollHostRef.current) return;
    if (containerSize.width < 80) return;
    if (containerSize.height < 80) return;
    if (totalPages < 1 || !pdfDocRef.current) return;

    const host = scrollHostRef.current;
    const pdf = pdfDocRef.current;
    const signal = { cancelled: false };
    let renderObserver: IntersectionObserver | null = null;

    host.innerHTML = '';
    renderingPagesRef.current.clear();

    host.className =
      'h-full w-full snap-y snap-mandatory overflow-y-auto overflow-x-hidden overscroll-y-contain touch-pan-y';
    host.style.setProperty('-webkit-overflow-scrolling', 'touch');

    // Slots are rebuilt whenever the container resizes (entering/leaving
    // fullscreen) and on every mount (reload), which threw the reader back to
    // page 1. Remember the page and put the reader back where it was.
    const pageStorageKey = absoluteUrl;
    const readRememberedPage = () => {
      const fromRef = rememberedPageRef.current;
      if (fromRef && fromRef >= 1) return fromRef;
      return readStoredPdfPage(pageStorageKey);
    };
    const pageHeight = () => Math.max(1, containerSize.height);
    const rememberCurrentPage = () => {
      const page = Math.round(host.scrollTop / pageHeight()) + 1;
      if (!Number.isFinite(page) || page < 1) return;
      rememberedPageRef.current = page;
      writeStoredPdfPage(pageStorageKey, page);
    };
    let scrollTick = 0;
    const onScroll = () => {
      window.clearTimeout(scrollTick);
      scrollTick = window.setTimeout(rememberCurrentPage, 150);
    };
    host.addEventListener('scroll', onScroll, { passive: true });

    const setup = async () => {
      const slots: HTMLElement[] = [];

      for (let pageNum = 1; pageNum <= totalPages; pageNum += 1) {
        if (signal.cancelled) return;
        const slot = document.createElement('div');
        slot.dataset.page = String(pageNum);
        slot.className =
          'pdf-page-slot flex w-full shrink-0 snap-start snap-always items-center justify-center';
        slot.style.height = `${containerSize.height}px`;

        host.appendChild(slot);
        slots.push(slot);
      }

      if (signal.cancelled) return;

      renderObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const pageNum = Number((entry.target as HTMLElement).dataset.page);
            if (!Number.isFinite(pageNum)) continue;
            void renderPageIntoSlot(pageNum, entry.target as HTMLElement, containerSize, signal, 'viewport');
          }
        },
        { root: host, rootMargin: '400px 0px', threshold: 0.01 },
      );

      slots.forEach((slot) => {
        renderObserver?.observe(slot);
      });

      const restoreTo = Math.min(readRememberedPage(), totalPages);
      const target = slots[restoreTo - 1];
      if (target) {
        // Render the page we are about to land on before jumping, so the reader
        // does not flash a blank slot.
        await renderPageIntoSlot(restoreTo, target, containerSize, signal, 'viewport');
        if (signal.cancelled) return;
        if (restoreTo > 1) host.scrollTop = (restoreTo - 1) * pageHeight();
      }
      if (slots[0] && restoreTo !== 1) {
        void renderPageIntoSlot(1, slots[0], containerSize, signal, 'viewport');
      }
    };

    void setup();

    return () => {
      signal.cancelled = true;
      window.clearTimeout(scrollTick);
      host.removeEventListener('scroll', onScroll);
      renderObserver?.disconnect();
      host.innerHTML = '';
      renderingPagesRef.current.clear();
    };
  }, [
    useCanvasRendering,
    useMobileScrollLayout,
    useIframeFallback,
    pdfSource,
    pdfError,
    containerSize,
    totalPages,
    renderPageIntoSlot,
  ]);

  if (!absoluteUrl) {
    return (
      <p className="p-4 text-center text-sm text-muted-foreground">No file URL for preview.</p>
    );
  }

  const bookShellClass = isBookLayout
    ? 'mx-auto flex h-full min-h-0 w-full max-w-full flex-1 flex-col'
    : 'flex h-full min-h-0 w-full flex-1 flex-col';
  const readingSurfaceClass = isBookLayout
    ? 'bg-transparent'
    : 'rounded-lg border bg-slate-100';

  /** Fit the page to the visible reader. 100% = fully visible, as large as possible. */
  const bookPageWidth = Math.max(
    280,
    Math.floor(containerSize.width > 40 ? containerSize.width : 320),
  );

  /** Desktop mouse/trackpad — embedded PDF iframe (never on touch tablets / book mode). */
  if (!useCanvasRendering && inlineIframeSupported) {
    return (
      <div
        ref={panelRef}
        tabIndex={0}
        role="region"
        aria-label={title ? `${title} textbook reader` : 'Textbook reader'}
        className={`flex h-full min-h-0 flex-1 flex-col bg-[#d6d3d1] outline-none ${className}`}
      >
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-stone-300/60 bg-stone-100/95 px-3 py-2.5 backdrop-blur-sm sm:px-4">
          {contextLabel ? (
            <p className="min-w-0 flex-1 truncate text-xs font-semibold text-stone-800 sm:text-sm">
              {contextLabel}
            </p>
          ) : (
            <span />
          )}
          <div className="flex flex-wrap items-center justify-end gap-2">
          {allowFullscreen ? (
            <Button type="button" variant="outline" size="sm" onClick={() => void toggleFullscreen()}>
              {isFullscreen ? (
                <Minimize2 className="mr-2 h-4 w-4" />
              ) : (
                <Maximize2 className="mr-2 h-4 w-4" />
              )}
              {isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            </Button>
          ) : null}
          {showOpenInNewTab ? (
            <Button type="button" variant="outline" size="sm" onClick={openInNewTab}>
              <ExternalLink className="mr-2 h-4 w-4" />
              Open in new tab
            </Button>
          ) : null}
          </div>
        </div>
        <div
          className={`flex min-h-0 flex-1 justify-center overflow-hidden ${
            isBookLayout ? 'bg-[#d6d3d1] p-2 sm:p-3' : 'p-3 sm:p-5'
          }`}
        >
          <div
            className={`${bookShellClass} overflow-hidden ${
              isBookLayout ? 'bg-transparent' : readingSurfaceClass
            }`}
          >
            <iframe
              key={iframeSrc}
              title={title || 'PDF Preview'}
              src={iframeSrc}
              className="h-full min-h-[min(70dvh,900px)] w-full flex-1 border-0 bg-transparent"
            />
          </div>
        </div>
        <PdfPageJumpBar
          page={readerPage}
          pageCount={0}
          draft={pageJumpDraft}
          onDraftChange={setPageJumpDraft}
          onSubmit={submitPageJump}
          onPrev={() => jumpReaderPage(readerPage - 1)}
          onNext={() => jumpReaderPage(readerPage + 1)}
        />
      </div>
    );
  }

  const mobileIframeSrc =
    iframeJumpPage > 1
      ? getMobilePdfIframePageSrc(fileUrl, title, iframeJumpPage)
      : getEmbeddedPdfIframeSrc(fileUrl, title);

  /** Book / touch — scroll through full pages (no clipped FitH iframe). */
  return (
    <div
      ref={panelRef}
      tabIndex={0}
      role="region"
      aria-label={title ? `${title} textbook reader` : 'Textbook reader'}
      className={`flex h-full min-h-0 flex-1 flex-col bg-[#d6d3d1] outline-none ${className}`}
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-stone-300/60 bg-stone-100/95 px-3 py-2.5 backdrop-blur-sm sm:px-4">
        <div className="min-w-0 flex-1">
          {contextLabel ? (
            <p className="truncate text-xs font-semibold text-stone-800 sm:text-sm">{contextLabel}</p>
          ) : null}
          <p className="text-xs font-medium text-stone-600 sm:text-sm">
            {useIframeFallback
              ? 'Use the scrollbar to move through pages'
              : '↑↓ pages · Ctrl+scroll or +/− to zoom · drag anywhere to pan when zoomed'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!useIframeFallback ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => mobileViewerRef.current?.zoomOut()}
                aria-label="Zoom out"
                title="Zoom out"
                disabled={readerZoomScale <= 1.02}
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => mobileViewerRef.current?.zoomIn()}
                aria-label="Zoom in"
                title="Zoom in"
                disabled={readerZoomScale >= 3.24}
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
              <span
                className="min-w-12 text-center text-xs font-semibold tabular-nums text-stone-700"
                aria-live="polite"
                aria-label={`Zoom ${Math.round(readerZoomScale * 100)} percent`}
              >
                {Math.round(readerZoomScale * 100)}%
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={readerZoomScale <= 1.02}
                onClick={() => mobileViewerRef.current?.resetZoom()}
              >
                Reset zoom
              </Button>
            </>
          ) : null}
          {allowFullscreen ? (
            <Button type="button" variant="outline" size="sm" onClick={() => void toggleFullscreen()}>
              {isFullscreen ? (
                <Minimize2 className="mr-2 h-4 w-4" />
              ) : (
                <Maximize2 className="mr-2 h-4 w-4" />
              )}
              {isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            </Button>
          ) : null}
          {showOpenInNewTab ? (
            <Button type="button" variant="outline" size="sm" onClick={openInNewTab}>
              <ExternalLink className="mr-2 h-4 w-4" />
              Open in new tab
            </Button>
          ) : null}
        </div>
      </div>

      <div
        className={`flex min-h-0 flex-1 justify-center touch-manipulation ${
          isBookLayout ? 'overflow-hidden bg-[#d6d3d1]' : 'overflow-hidden'
        }`}
      >
        <div
          className={`${bookShellClass} touch-manipulation ${
            isBookLayout
              ? 'min-h-0 overflow-hidden bg-transparent'
              : `overflow-hidden ${readingSurfaceClass}`
          }`}
        >
          <div
            ref={containerRef}
            className="relative h-full min-h-0 flex-1 overflow-hidden touch-manipulation bg-transparent"
          >
            {useIframeFallback ? (
              <iframe
                key={mobileIframeSrc}
                title={title || 'PDF Preview'}
                src={mobileIframeSrc}
                className="h-full w-full border-0 bg-white"
              />
            ) : useMobileScrollLayout && pdfDoc && totalPages > 0 && bookPageWidth >= 280 ? (
              <PdfMobileScrollViewer
                ref={mobileViewerRef}
                pdf={pdfDoc}
                totalPages={totalPages}
                containerWidth={bookPageWidth}
                defaultPageHeight={Math.max(320, Math.floor(bookPageWidth * 1.414))}
                storageKey={absoluteUrl}
                showPageHud={false}
                fillViewport={isBookLayout}
                onPageChange={(page, count) => {
                  setReaderPage(page);
                  setReaderPageCount(count);
                }}
                onZoomScaleChange={setReaderZoomScale}
                className="h-full w-full"
              />
            ) : (
              <div ref={scrollHostRef} className="h-full w-full" />
            )}
            {loadingPdf || (!useIframeFallback && pdfSource && totalPages < 1 && !pdfError) ? (
              <div className="absolute inset-0 flex items-center justify-center gap-2 bg-stone-50/95 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
                <span className="text-sm">Loading book pages…</span>
              </div>
            ) : null}
            {pdfError ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-stone-50 px-4 text-center">
                <p className="text-sm text-muted-foreground">{pdfError}</p>
                {showOpenInNewTab ? (
                  <Button type="button" onClick={openInNewTab}>
                    Open in full window
                  </Button>
                ) : (
                  <Button type="button" onClick={() => window.location.reload()}>
                    Try again
                  </Button>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <PdfPageJumpBar
        page={readerPage}
        pageCount={readerPageCount || totalPages}
        draft={pageJumpDraft}
        onDraftChange={setPageJumpDraft}
        onSubmit={submitPageJump}
        onPrev={() => jumpReaderPage(readerPage - 1)}
        onNext={() => jumpReaderPage(readerPage + 1)}
      />
    </div>
  );
}
