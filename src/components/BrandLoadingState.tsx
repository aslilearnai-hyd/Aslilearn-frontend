/**
 * Full-screen brand loading card used while lazy routes / auth resolve.
 * Logo assets include wordmark + icon on a light canvas — use object-contain
 * on a white plate so the mark is never cropped away.
 */
type BrandLoadingStateProps = {
  title?: string;
  subtitle?: string;
};

export function BrandLoadingState({
  title = 'Loading',
  subtitle = 'Just a moment…',
}: BrandLoadingStateProps) {
  return (
    <div
      className="asli-app-bg flex !min-h-[100dvh] items-center justify-center p-6"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="asli-card-premium flex w-full max-w-xl flex-col items-center p-8 text-center sm:p-10">
        <div className="mb-6 flex h-36 w-36 items-center justify-center rounded-3xl bg-white p-2.5 shadow-md ring-1 ring-slate-200/90 sm:h-40 sm:w-40">
          <img
            src="/logo-transparent.png"
            alt="AsliLearn.ai"
            width={160}
            height={160}
            className="h-full w-full object-contain"
            decoding="async"
            onError={(e) => {
              const el = e.currentTarget;
              if (el.getAttribute('data-fallback') === '1') return;
              el.setAttribute('data-fallback', '1');
              el.src = '/logo.png';
            }}
          />
        </div>
        <p className="font-display text-2xl font-bold text-slate-900 sm:text-3xl">{title}</p>
        <p className="mt-3 text-base text-slate-600 sm:text-lg">{subtitle}</p>
        <div className="mt-8 w-full space-y-3" aria-hidden="true">
          <div className="mx-auto h-4 w-2/3 animate-pulse rounded-full bg-indigo-blue-100" />
          <div className="h-4 w-full animate-pulse rounded-full bg-slate-200" />
          <div className="mx-auto h-4 w-5/6 animate-pulse rounded-full bg-slate-200" />
        </div>
      </div>
    </div>
  );
}
