import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  forwardRef,
  type RefObject,
} from 'react';
import type * as pdfjs from 'pdfjs-dist';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';
import PdfPagePinchFrame, {
  type PdfPagePinchFrameHandle,
} from '@/components/shared/PdfPagePinchFrame';
import { Button } from '@/components/ui/button';

function isIosOrIpadosBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/i.test(ua)) return true;
  return navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1;
}

function isMobileUserAgent(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|Mobile|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

function prefersDisableWorker(): boolean {
  return isMobileUserAgent() || isIosOrIpadosBrowser();
}

function capRenderScale(pageWidth: number, pageHeight: number, scale: number): number {
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
  return capRenderScale(pageWidth, pageHeight, cssScale * cappedDpr);
}

function getPageCssScale(
  containerWidth: number,
  pageWidth: number,
  pageHeight: number,
  maxHeight?: number,
): number {
  const pad = 16;
  const availW = Math.max(1, containerWidth - pad);
  const widthScale = pageWidth > 0 ? availW / pageWidth : 1;
  if (!maxHeight || maxHeight < 80 || pageHeight <= 0) return widthScale;
  const heightScale = Math.max(1, maxHeight - pad) / pageHeight;
  return Math.min(widthScale, heightScale);
}

export function pdfPageStorageKey(fileUrl: string): string {
  return `asli:pdf-page:${String(fileUrl || '').trim()}`;
}

export function readStoredPdfPage(fileUrl: string): number {
  if (!fileUrl || typeof window === 'undefined') return 1;
  try {
    const stored = Number(window.sessionStorage.getItem(pdfPageStorageKey(fileUrl)));
    return Number.isFinite(stored) && stored >= 1 ? Math.floor(stored) : 1;
  } catch {
    return 1;
  }
}

export function writeStoredPdfPage(fileUrl: string, page: number): void {
  if (!fileUrl || typeof window === 'undefined') return;
  const n = Math.floor(page);
  if (!Number.isFinite(n) || n < 1) return;
  try {
    window.sessionStorage.setItem(pdfPageStorageKey(fileUrl), String(n));
  } catch {
    /* private mode */
  }
}

/** Jump inside the PDF scroller. Avoid scrollIntoView — it moves the dialog, not the pages. */
export function scrollPdfHostToPage(
  host: HTMLElement | null | undefined,
  page: number,
  totalPages: number,
): boolean {
  if (!host) return false;
  const clamped = Math.min(Math.max(1, Math.floor(page)), Math.max(1, totalPages || 1));
  const slot = host.querySelector(`[data-page="${clamped}"]`) as HTMLElement | null;
  const pageH = Math.max(1, host.clientHeight);
  const top =
    slot && slot.offsetHeight > 8 ? slot.offsetTop : (clamped - 1) * pageH;
  const prevSnap = host.style.scrollSnapType;
  host.style.scrollSnapType = 'none';
  host.scrollTo({ top, left: 0, behavior: 'auto' });
  window.requestAnimationFrame(() => {
    host.style.scrollSnapType = prevSnap;
  });
  return Boolean(slot) || clamped === 1;
}

function getPageViewport(page: pdfjs.PDFPageProxy, scale: number) {
  // Honor embedded page rotation so landscape / sideways pages render upright.
  return page.getViewport({ scale, rotation: page.rotate ?? 0 });
}

async function measurePdfPageCssSize(
  pdf: pdfjs.PDFDocumentProxy,
  pageNum: number,
  containerWidth: number,
  maxHeight?: number,
): Promise<{ cssWidth: number; cssHeight: number } | null> {
  const page = await pdf.getPage(pageNum);
  const base = getPageViewport(page, 1);
  const fitWidth = Math.max(160, containerWidth);
  const fitHeight = maxHeight != null && maxHeight > 0 ? maxHeight : undefined;
  const cssScale = getPageCssScale(fitWidth, base.width, base.height, fitHeight);
  const cssWidth = Math.max(1, Math.floor(base.width * cssScale));
  const cssHeight = Math.max(1, Math.floor(base.height * cssScale));
  return { cssWidth, cssHeight };
}

async function renderPdfPageCanvas(
  pdf: pdfjs.PDFDocumentProxy,
  pageNum: number,
  containerWidth: number,
  canvas: HTMLCanvasElement,
  maxHeight?: number,
): Promise<{ cssWidth: number; cssHeight: number } | null> {
  const page = await pdf.getPage(pageNum);
  const base = getPageViewport(page, 1);
  const fitWidth = Math.max(160, containerWidth);
  const fitHeight = maxHeight != null && maxHeight > 0 ? maxHeight : undefined;
  const cssScale = getPageCssScale(fitWidth, base.width, base.height, fitHeight);
  const cssWidth = Math.max(1, Math.floor(base.width * cssScale));
  const cssHeight = Math.max(1, Math.floor(base.height * cssScale));

  const baseOutputScale = getSafeOutputScale(cssScale, base.width, base.height);
  const scaleAttempts = prefersDisableWorker()
    ? [baseOutputScale, baseOutputScale * 0.75, cssScale, cssScale * 0.65]
    : [baseOutputScale, baseOutputScale * 0.8, cssScale];

  for (const outputScale of scaleAttempts) {
    const viewport = getPageViewport(page, outputScale);
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    // CSS size is owned by the pinch frame (width/height 100%). Bitmap size
    // stays on the canvas attributes for sharp rendering.
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) continue;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    try {
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      return { cssWidth, cssHeight };
    } catch {
      /* retry at lower scale */
    }
  }
  return null;
}

function PdfPageCanvas({
  canvasRef,
}: {
  canvasRef: RefObject<HTMLCanvasElement>;
}) {
  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none block h-full w-full max-h-none max-w-none"
      draggable={false}
      style={{
        display: 'block',
        width: '100%',
        height: '100%',
        maxWidth: 'none',
        maxHeight: 'none',
      }}
    />
  );
}

type PdfMobilePageProps = {
  pageNum: number;
  pdf: pdfjs.PDFDocumentProxy;
  containerWidth: number;
  defaultMinHeight: number;
  scrollRoot: RefObject<HTMLDivElement | null>;
  viewportHeight?: number;
  fillViewport?: boolean;
  forceRender?: boolean;
  onZoomChange: (pageNum: number, zoomed: boolean, scale?: number) => void;
  registerZoomHandle?: (pageNum: number, handle: PdfPagePinchFrameHandle | null) => void;
};

function PdfMobilePage({
  pageNum,
  pdf,
  containerWidth,
  defaultMinHeight,
  scrollRoot,
  viewportHeight = 0,
  fillViewport = false,
  forceRender = false,
  onZoomChange,
  registerZoomHandle,
}: PdfMobilePageProps) {
  const slotRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pinchRef = useRef<PdfPagePinchFrameHandle | null>(null);
  const renderedRef = useRef(false);
  const [shouldRender, setShouldRender] = useState(pageNum === 1 || forceRender);
  const [layoutReady, setLayoutReady] = useState(false);
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const layoutReadyRef = useRef(false);

  const pageHeight = dims.h > 0 ? dims.h : defaultMinHeight;
  const pageWidth = dims.w > 0 ? dims.w : Math.max(containerWidth - 8, 280);
  const baseWidth = dims.w > 0 ? dims.w : pageWidth;
  const baseHeight = dims.h > 0 ? dims.h : pageHeight;
  const maxPageHeight =
    fillViewport && viewportHeight > 80 ? viewportHeight : undefined;
  const layoutKey = `${containerWidth}|${maxPageHeight ?? 0}`;

  const handlePageZoom = useCallback(
    (zoomed: boolean, scale?: number) => {
      onZoomChange(pageNum, zoomed, zoomed ? Math.max(1, scale ?? 1) : 1);
    },
    [onZoomChange, pageNum],
  );

  useEffect(() => {
    if (forceRender) setShouldRender(true);
  }, [forceRender]);

  useEffect(() => {
    const el = slotRef.current;
    const root = scrollRoot.current;
    if (!el || shouldRender || !root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setShouldRender(true);
        }
      },
      { root, rootMargin: '240px 0px', threshold: 0.01 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [shouldRender, scrollRoot]);

  useEffect(() => {
    return () => {
      onZoomChange(pageNum, false);
      registerZoomHandle?.(pageNum, null);
    };
  }, [onZoomChange, pageNum, registerZoomHandle]);

  const setPinchRef = useCallback(
    (handle: PdfPagePinchFrameHandle | null) => {
      pinchRef.current = handle;
      registerZoomHandle?.(pageNum, handle);
    },
    [pageNum, registerZoomHandle],
  );
  useEffect(() => {
    if (!shouldRender) return;
    let cancelled = false;
    const keepCanvas = layoutReadyRef.current;
    if (!keepCanvas) {
      renderedRef.current = false;
      setLayoutReady(false);
    }
    void (async () => {
      const measured = await measurePdfPageCssSize(
        pdf,
        pageNum,
        containerWidth,
        maxPageHeight,
      );
      if (cancelled || !measured) return;
      setDims({ w: measured.cssWidth, h: measured.cssHeight });
      layoutReadyRef.current = true;
      setLayoutReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [shouldRender, pdf, pageNum, layoutKey, maxPageHeight, containerWidth]);

  useEffect(() => {
    if (!layoutReady || renderedRef.current) return;

    let cancelled = false;
    let attempts = 0;

    const paint = () => {
      if (cancelled || renderedRef.current) return;
      const canvas = canvasRef.current;
      if (!canvas) {
        // Canvas mounts one frame after layoutReady — retry briefly.
        if (attempts < 20) {
          attempts += 1;
          window.requestAnimationFrame(paint);
        }
        return;
      }

      void (async () => {
        const result = await renderPdfPageCanvas(
          pdf,
          pageNum,
          containerWidth,
          canvas,
          maxPageHeight,
        );
        if (cancelled || !result) return;
        renderedRef.current = true;
        setDims({ w: result.cssWidth, h: result.cssHeight });
      })();
    };

    paint();

    return () => {
      cancelled = true;
    };
  }, [layoutReady, pdf, pageNum, layoutKey, maxPageHeight, containerWidth]);

  const slotStyle =
    fillViewport && viewportHeight > 0
      ? { minHeight: `${viewportHeight}px` }
      : { minHeight: `${pageHeight + 24}px` };

  return (
    <div
      ref={slotRef}
      data-page={pageNum}
      className="pdf-page-slot flex w-max min-w-full shrink-0 snap-start snap-always items-center justify-center overflow-visible px-1 py-2 sm:px-2 sm:py-3"
      style={slotStyle}
    >
      {layoutReady ? (
        <PdfPagePinchFrame
          ref={setPinchRef}
          pageWidth={baseWidth}
          pageHeight={baseHeight}
          onZoomChange={handlePageZoom}
          scrollParentRef={scrollRoot}
        >
          <PdfPageCanvas canvasRef={canvasRef} />
        </PdfPagePinchFrame>
      ) : (
        <div
          className="rounded-sm bg-white shadow-md animate-pulse"
          style={{ width: `${baseWidth}px`, height: `${baseHeight}px` }}
          aria-hidden
        />
      )}
    </div>
  );
}

export type PdfMobileScrollViewerHandle = {
  goToPage: (page: number) => void;
  getPage: () => number;
  /** Scroll inside the textbook canvas (not the page behind the modal). */
  scrollBy: (dx: number, dy: number) => void;
  /** Jump scroll position within the canvas. */
  scrollTo: (opts: { top?: number; left?: number; behavior?: ScrollBehavior }) => void;
  getScrollElement: () => HTMLDivElement | null;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  getZoomScale: () => number;
};

type PdfMobileScrollViewerProps = {
  pdf: pdfjs.PDFDocumentProxy;
  totalPages: number;
  containerWidth: number;
  defaultPageHeight?: number;
  className?: string;
  /** Absolute file URL — used as sessionStorage key for the current page. */
  storageKey?: string;
  /**
   * Floating overlay on the page (legacy). Prefer `false` and render controls
   * outside the page so nothing sits on top of the textbook.
   */
  showPageHud?: boolean;
  /** Fires when the visible page changes (for external page controls). */
  onPageChange?: (page: number, totalPages: number) => void;
  /** Reports the active page zoom so shared dashboard controls stay in sync. */
  onZoomScaleChange?: (scale: number) => void;
  /** Book mode: each page slot fills the reader height so the next page does not peek in. */
  fillViewport?: boolean;
};

const PdfMobileScrollViewer = forwardRef<PdfMobileScrollViewerHandle, PdfMobileScrollViewerProps>(
  function PdfMobileScrollViewer(
    {
      pdf,
      totalPages,
      containerWidth,
      defaultPageHeight = 280,
      className = '',
      storageKey = '',
      showPageHud = false,
      onPageChange,
      onZoomScaleChange,
      fillViewport = false,
    },
    ref,
  ) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const zoomedPagesRef = useRef(new Set<number>());
  const zoomHandlesRef = useRef(new Map<number, PdfPagePinchFrameHandle>());
  const currentPageRef = useRef(1);
  const persistedZoomRef = useRef(1);
  const restoredRef = useRef(false);
  const zoomRafRef = useRef(0);
  const zoomPendingRef = useRef<{ scale: number; dy: number; x: number; y: number } | null>(null);
  const latestZoomRef = useRef(1);
  const zoomLabelTimerRef = useRef(0);
  const [scrollLocked, setScrollLocked] = useState(false);
  const [anyZoomed, setAnyZoomed] = useState(false);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [currentPage, setCurrentPage] = useState(() =>
    storageKey ? readStoredPdfPage(storageKey) : 1,
  );
  currentPageRef.current = currentPage;

  const getActiveZoomHandle = useCallback(() => {
    const page = currentPageRef.current;
    const exact = zoomHandlesRef.current.get(page);
    if (exact) return exact;
    // Prefer neighbors so +/- still hits the visible page while it mounts.
    for (const candidate of [page - 1, page + 1, page - 2, page + 2]) {
      const handle = zoomHandlesRef.current.get(candidate);
      if (handle) return handle;
    }
    return zoomHandlesRef.current.values().next().value ?? null;
  }, []);

  const registerZoomHandle = useCallback(
    (pageNum: number, handle: PdfPagePinchFrameHandle | null) => {
      if (handle) {
        zoomHandlesRef.current.set(pageNum, handle);
        // Re-apply zoom after page remount (layout/resize) so +/- does not look dead.
        if (pageNum === currentPageRef.current && persistedZoomRef.current > 1.02) {
          const target = persistedZoomRef.current;
          window.requestAnimationFrame(() => {
            if (zoomHandlesRef.current.get(pageNum) !== handle) return;
            if (Math.abs(handle.getScale() - target) > 0.02) {
              handle.zoomTo(target);
            }
          });
        }
      } else {
        zoomHandlesRef.current.delete(pageNum);
      }
    },
    [],
  );

  const viewportHeight = viewportSize.height;
  const pageFitWidth =
    viewportSize.width >= 80 ? viewportSize.width : Math.max(containerWidth, 280);

  useEffect(() => {
    const host = scrollRef.current;
    if (!host) return;
    const update = () => {
      const width = Math.floor(host.clientWidth);
      const height = Math.floor(host.clientHeight);
      setViewportSize((prev) => {
        if (prev.width === 0 || prev.height === 0) return { width, height };
        if (Math.abs(prev.width - width) < 48 && Math.abs(prev.height - height) < 48) {
          return prev;
        }
        return { width, height };
      });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(host);
    return () => ro.disconnect();
  }, [totalPages, pdf, containerWidth]);

  const handleZoomChange = useCallback((pageNum: number, zoomed: boolean, scale = 1) => {
    if (zoomed) zoomedPagesRef.current.add(pageNum);
    else zoomedPagesRef.current.delete(pageNum);
    const any = zoomedPagesRef.current.size > 0;
    setAnyZoomed((prev) => (prev === any ? prev : any));
    setScrollLocked(false);
    if (pageNum !== currentPageRef.current) return;
    const reported = any ? Math.max(1, scale) : 1;
    latestZoomRef.current = reported;
    persistedZoomRef.current = reported;
    window.clearTimeout(zoomLabelTimerRef.current);
    if (!any) {
      persistedZoomRef.current = 1;
      onZoomScaleChange?.(1);
      return;
    }
    zoomLabelTimerRef.current = window.setTimeout(() => {
      zoomLabelTimerRef.current = 0;
      onZoomScaleChange?.(latestZoomRef.current);
    }, 150);
  }, [onZoomScaleChange]);

  const persistPage = useCallback(
    (page: number) => {
      const clamped = Math.min(Math.max(1, Math.floor(page)), Math.max(1, totalPages));
      setCurrentPage(clamped);
      if (storageKey) writeStoredPdfPage(storageKey, clamped);
      onPageChange?.(clamped, totalPages);
      onZoomScaleChange?.(zoomHandlesRef.current.get(clamped)?.getScale() ?? 1);
    },
    [storageKey, totalPages, onPageChange, onZoomScaleChange],
  );

  // Notify parent of initial / restored page once.
  useEffect(() => {
    if (totalPages < 1) return;
    onPageChange?.(currentPage, totalPages);
    // Only when doc/page count changes — avoid loops on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional mount/doc sync
  }, [totalPages, pdf]);

  // Restore scroll position after slots mount (refresh / reopen).
  useEffect(() => {
    if (restoredRef.current || !storageKey || totalPages < 1) return;
    const host = scrollRef.current;
    if (!host) return;
    const targetPage = Math.min(readStoredPdfPage(storageKey), totalPages);
    setCurrentPage(targetPage);
    if (targetPage <= 1) {
      restoredRef.current = true;
      host.scrollTop = 0;
      return;
    }

    let attempts = 0;
    const jump = () => {
      attempts += 1;
      if (scrollPdfHostToPage(host, targetPage, totalPages) || attempts >= 40) {
        restoredRef.current = true;
        return;
      }
      window.setTimeout(jump, 50);
    };
    window.requestAnimationFrame(jump);
  }, [storageKey, totalPages, pdf]);

  useEffect(() => {
    const host = scrollRef.current;
    if (!host) return;

    const onWheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      event.stopPropagation();
      const handle =
        zoomHandlesRef.current.get(currentPageRef.current) ||
        zoomHandlesRef.current.values().next().value ||
        null;
      if (!handle) return;

      let dy = event.deltaY;
      if (event.deltaMode === 1) dy *= 16;
      if (event.deltaMode === 2) dy *= 800;
      const pending = zoomPendingRef.current ?? {
        scale: handle.getScale(),
        dy: 0,
        x: event.clientX,
        y: event.clientY,
      };
      pending.dy += dy;
      pending.x = event.clientX;
      pending.y = event.clientY;
      zoomPendingRef.current = pending;
      if (zoomRafRef.current) return;
      zoomRafRef.current = window.requestAnimationFrame(() => {
        zoomRafRef.current = 0;
        const next = zoomPendingRef.current;
        zoomPendingRef.current = null;
        if (!next) return;
        const active =
          zoomHandlesRef.current.get(currentPageRef.current) ||
          zoomHandlesRef.current.values().next().value ||
          null;
        const factor = Math.exp(-Math.max(-160, Math.min(160, next.dy)) * 0.0032);
        active?.zoomTo(
          Math.min(3.25, Math.max(1, next.scale * factor)),
          next.x,
          next.y,
        );
      });
    };

    host.addEventListener('wheel', onWheel, { passive: false, capture: true });
    return () => {
      host.removeEventListener('wheel', onWheel, { capture: true } as EventListenerOptions);
      if (zoomRafRef.current) {
        window.cancelAnimationFrame(zoomRafRef.current);
        zoomRafRef.current = 0;
      }
    };
  }, [totalPages, pdf]);

  useEffect(() => {
    const host = scrollRef.current;
    if (!host) return;
    let tick = 0;
    const onScroll = () => {
      window.clearTimeout(tick);
      tick = window.setTimeout(() => {
        const slots = Array.from(host.querySelectorAll<HTMLElement>('[data-page]'));
        if (!slots.length) return;
        const mid = host.scrollTop + host.clientHeight * 0.35;
        let best = 1;
        let bestDist = Number.POSITIVE_INFINITY;
        for (const slot of slots) {
          const page = Number(slot.dataset.page);
          if (!Number.isFinite(page)) continue;
          const center = slot.offsetTop + slot.offsetHeight / 2;
          const dist = Math.abs(center - mid);
          if (dist < bestDist) {
            bestDist = dist;
            best = page;
          }
        }
        persistPage(best);
      }, 120);
    };
    host.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.clearTimeout(tick);
      host.removeEventListener('scroll', onScroll);
    };
  }, [persistPage]);

  useEffect(() => {
    const host = scrollRef.current;
    if (!host || !anyZoomed) return;

    const drag = {
      active: false,
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      pointerId: -1,
    };

    const startFromEvent = (clientX: number, clientY: number, pointerId: number) => {
      drag.active = true;
      drag.x = clientX;
      drag.y = clientY;
      drag.left = host.scrollLeft;
      drag.top = host.scrollTop;
      drag.pointerId = pointerId;
      host.style.cursor = 'grabbing';
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const target = event.target as HTMLElement | null;
      // Page frame handles its own drag; still allow gray-area pans (mouse + touch).
      if (target?.closest?.('.pdf-page-pinch-frame')) return;
      startFromEvent(event.clientX, event.clientY, event.pointerId);
      try {
        host.setPointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
      event.preventDefault();
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!drag.active || event.pointerId !== drag.pointerId) return;
      host.scrollLeft = drag.left - (event.clientX - drag.x);
      host.scrollTop = drag.top - (event.clientY - drag.y);
      event.preventDefault();
    };

    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerId !== drag.pointerId) return;
      drag.active = false;
      host.style.cursor = 'grab';
      try {
        host.releasePointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
    };

    host.style.cursor = 'grab';
    host.addEventListener('pointerdown', onPointerDown);
    host.addEventListener('pointermove', onPointerMove);
    host.addEventListener('pointerup', onPointerUp);
    host.addEventListener('pointercancel', onPointerUp);
    return () => {
      host.style.cursor = '';
      host.removeEventListener('pointerdown', onPointerDown);
      host.removeEventListener('pointermove', onPointerMove);
      host.removeEventListener('pointerup', onPointerUp);
      host.removeEventListener('pointercancel', onPointerUp);
    };
  }, [anyZoomed]);

  const goToPage = useCallback(
    (page: number) => {
      const host = scrollRef.current;
      const clamped = Math.min(Math.max(1, Math.floor(page)), Math.max(1, totalPages));
      persistPage(clamped);
      if (scrollPdfHostToPage(host, clamped, totalPages)) return;
      let attempts = 0;
      const retry = () => {
        attempts += 1;
        if (scrollPdfHostToPage(scrollRef.current, clamped, totalPages) || attempts >= 20) return;
        window.setTimeout(retry, 50);
      };
      window.requestAnimationFrame(retry);
    },
    [persistPage, totalPages],
  );

  useImperativeHandle(
    ref,
    () => ({
      goToPage,
      getPage: () => currentPage,
      scrollBy: (dx: number, dy: number) => {
        const host = scrollRef.current;
        if (!host) return;
        const zoomHandle = getActiveZoomHandle();
        if (zoomHandle && zoomHandle.getScale() > 1.02) {
          zoomHandle.panBy(dx, dy);
          return;
        }
        host.scrollBy({ left: dx, top: dy, behavior: 'auto' });
      },
      scrollTo: (opts) => {
        const host = scrollRef.current;
        if (!host) return;
        host.scrollTo({
          top: opts.top,
          left: opts.left,
          behavior: opts.behavior ?? 'auto',
        });
      },
      getScrollElement: () => scrollRef.current,
      zoomIn: () => {
        const run = (attempts = 0) => {
          const exact = zoomHandlesRef.current.get(currentPageRef.current);
          const handle = exact || (attempts >= 4 ? getActiveZoomHandle() : null);
          if (handle) {
            handle.zoomIn();
            const next = handle.getScale();
            persistedZoomRef.current = next;
            latestZoomRef.current = next;
            onZoomScaleChange?.(next);
            return;
          }
          if (attempts < 12) {
            window.requestAnimationFrame(() => run(attempts + 1));
          }
        };
        run();
      },
      zoomOut: () => {
        const run = (attempts = 0) => {
          const exact = zoomHandlesRef.current.get(currentPageRef.current);
          const handle = exact || (attempts >= 4 ? getActiveZoomHandle() : null);
          if (handle) {
            handle.zoomOut();
            const next = handle.getScale();
            persistedZoomRef.current = next;
            latestZoomRef.current = next;
            onZoomScaleChange?.(next);
            return;
          }
          if (attempts < 12) {
            window.requestAnimationFrame(() => run(attempts + 1));
          }
        };
        run();
      },
      resetZoom: () => {
        const handle =
          zoomHandlesRef.current.get(currentPageRef.current) || getActiveZoomHandle();
        handle?.resetZoom();
        persistedZoomRef.current = 1;
        latestZoomRef.current = 1;
        onZoomScaleChange?.(1);
      },
      getZoomScale: () => getActiveZoomHandle()?.getScale() ?? persistedZoomRef.current,
    }),
    [goToPage, getActiveZoomHandle, onZoomScaleChange],
  );

  return (
    <div className={`relative h-full w-full ${className}`}>
      <div
        ref={scrollRef}
        className="pdf-book-scroll hide-scrollbar h-full w-full overflow-x-auto overflow-y-auto overscroll-contain touch-pan-y"
        style={{
          WebkitOverflowScrolling: 'touch',
          scrollSnapType: scrollLocked || anyZoomed ? 'none' : 'y mandatory',
          touchAction: anyZoomed ? 'pan-x pan-y' : 'pan-y',
        }}
      >
        {Array.from({ length: totalPages }, (_, index) => {
          const pageNum = index + 1;
          const forceRender =
            pageNum === currentPage ||
            pageNum === currentPage - 1 ||
            pageNum === currentPage + 1;
          return (
            <PdfMobilePage
              key={pageNum}
              pageNum={pageNum}
              pdf={pdf}
              containerWidth={pageFitWidth}
              defaultMinHeight={defaultPageHeight}
              scrollRoot={scrollRef}
              viewportHeight={viewportHeight}
              fillViewport={fillViewport}
              forceRender={forceRender}
              onZoomChange={handleZoomChange}
              registerZoomHandle={registerZoomHandle}
            />
          );
        })}
      </div>

      {showPageHud && totalPages > 0 ? (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center px-3"
          data-pdf-page-hud=""
        >
          <div className="pointer-events-auto flex items-center gap-2 rounded-2xl border border-stone-200/90 bg-white/95 px-3 py-2.5 shadow-lg backdrop-blur-md sm:gap-3 sm:px-4 sm:py-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-10 min-w-10 rounded-xl px-0 sm:h-11 sm:min-w-11"
              disabled={currentPage <= 1}
              onClick={() => goToPage(currentPage - 1)}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <p className="min-w-[7.5rem] text-center text-sm font-semibold tabular-nums text-stone-800 sm:min-w-[9rem] sm:text-base">
              Page {currentPage} of {totalPages}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-10 min-w-10 rounded-xl px-0 sm:h-11 sm:min-w-11"
              disabled={currentPage >= totalPages}
              onClick={() => goToPage(currentPage + 1)}
              aria-label="Next page"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
            <span className="mx-0.5 h-6 w-px bg-stone-300" aria-hidden />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-10 min-w-10 rounded-xl px-0 sm:h-11 sm:min-w-11"
              onClick={() => getActiveZoomHandle()?.zoomOut()}
              aria-label="Zoom out"
              title="Zoom out"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-10 min-w-10 rounded-xl px-0 sm:h-11 sm:min-w-11"
              onClick={() => getActiveZoomHandle()?.zoomIn()}
              aria-label="Zoom in"
              title="Zoom in"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
});

export default PdfMobileScrollViewer;
