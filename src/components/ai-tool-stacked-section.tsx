import { useRef, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Check, Copy, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatAiToolText } from '@/lib/title-case';
import { AI_V2 } from '@/lib/ai-tool-design-tokens';
import { aiToolSectionDomId } from '@/lib/ai-tool-section-id';
import {
  RealisticIcon,
  lucideTo3dName,
  type AiTool3dIconName,
} from '@/components/ai-tool-3d-icons';
import {
  paletteForSectionTitle,
  type AiToolSectionPalette,
} from '@/lib/ai-tool-section-palette';

/** Shared body type scale + colored nested headings for every tool section. */
export function aiToolSectionBodyClasses(palette: AiToolSectionPalette): string {
  return cn(
    'text-base sm:text-lg text-slate-800 leading-relaxed',
    '[&_strong]:font-bold [&_strong]:text-slate-900',
    '[&_p]:text-base [&_p]:sm:text-lg [&_p]:leading-relaxed',
    '[&_li]:text-base [&_li]:sm:text-lg [&_li]:leading-relaxed',
    cn('[&_li]:marker:font-semibold', palette.marker),
    cn('[&_h1]:text-xl [&_h1]:sm:text-2xl [&_h1]:font-bold', palette.title),
    cn('[&_h2]:text-lg [&_h2]:sm:text-xl [&_h2]:font-bold', palette.title),
    cn('[&_h3]:text-base [&_h3]:sm:text-lg [&_h3]:font-bold', palette.label),
    '[&_h4]:text-base [&_h4]:font-bold [&_h4]:text-slate-900',
  );
}

/**
 * Full-width section card used by every AI tool viewer (teacher + student).
 * Format: colored accent bar → bold colored title → soft nested content box
 * (Concept Mastery / tariff-brochure layering).
 */
export type AiToolSectionMetaItem = {
  icon?: LucideIcon;
  iconName?: AiTool3dIconName;
  label: string;
  value: string;
};

export function AiToolStackedSection({
  num,
  title,
  description,
  icon,
  iconName,
  accent: _accent,
  gradient: _gradient,
  children,
  className,
  hideActions = false,
  meta,
}: {
  num: string;
  title: string;
  description?: string;
  icon?: LucideIcon | null;
  iconName?: AiTool3dIconName;
  /** @deprecated kept for call-site compatibility — palette is derived from title */
  accent?: string;
  /** @deprecated kept for call-site compatibility */
  gradient?: string;
  children: ReactNode;
  className?: string;
  /** Hide Edit / Copy (e.g. print-only blocks) */
  hideActions?: boolean;
  /** Optional footer meta row (e.g. Pedagogy / Time / Bloom's Level) */
  meta?: AiToolSectionMetaItem[];
}) {
  const resolved = iconName || lucideTo3dName(icon);
  const numLabel = String(num).replace(/^section\s*/i, '').trim() || num;
  const palette = paletteForSectionTitle(title, numLabel);
  const LucideIcon = icon;
  const sectionDomId = aiToolSectionDomId(numLabel, title);
  const displayTitle = formatAiToolText(title);
  const displayDescription = description ? formatAiToolText(description) : undefined;
  const showNum = Boolean(numLabel) && !/^◆|•|-|$/.test(numLabel);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    const text = bodyRef.current?.innerText?.trim() || displayTitle;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  };

  return (
    <motion.section
      id={sectionDomId}
      data-ai-section-id={sectionDomId}
      data-ai-section-title={displayTitle}
      data-ai-section-num={showNum ? numLabel : ''}
      data-ai-section-icon={resolved}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      whileHover={{ y: -2 }}
      className={cn(
        'group relative w-full overflow-hidden border border-slate-200 bg-white print:break-inside-avoid',
        AI_V2.radius.cardLg,
        AI_V2.shadow.card,
        'transition-shadow duration-200 hover:shadow-[0_12px_40px_-14px_rgba(15,23,42,0.14)]',
        className,
      )}
    >
      <header className="flex items-start justify-between gap-3 px-4 py-4 sm:px-5 sm:py-5">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border',
              palette.iconTile,
            )}
          >
            {LucideIcon ? (
              <LucideIcon className="h-5 w-5" aria-hidden />
            ) : (
              <RealisticIcon name={resolved} alt="" className="h-6 w-6" />
            )}
          </div>
          <div className="min-w-0 pt-0.5">
            <p className="text-base font-bold leading-snug tracking-tight text-slate-900 sm:text-lg">
              {showNum ? `${numLabel}. ` : ''}
              {displayTitle}
            </p>
            {displayDescription ? (
              <p className={cn('mt-1 text-sm leading-relaxed sm:text-base', palette.subtitle)}>
                {displayDescription}
              </p>
            ) : null}
          </div>
        </div>
        {!hideActions ? (
          <div className="flex shrink-0 items-center gap-1.5 print:hidden">
            <button
              type="button"
              onClick={() => void onCopy()}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
              ) : (
                <Copy className="h-3.5 w-3.5" aria-hidden />
              )}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        ) : null}
      </header>

      {/* Nested soft tinted box — Concept Mastery inner panel */}
      <div className="px-4 pb-4 sm:px-5 sm:pb-5" data-ai-section-body>
        <div
          ref={bodyRef}
          className={cn(
            'ai-tool-section-body rounded-xl border px-5 py-5 sm:px-6 sm:py-6 outline-none',
            palette.inner,
            palette.innerBorder,
            aiToolSectionBodyClasses(palette),
          )}
        >
          {children}
        </div>

        {meta && meta.length > 0 ? (
          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-slate-100 pt-4">
            {meta.map((item) => {
              const MetaIcon = item.icon;
              const metaIconName = item.iconName || (MetaIcon ? lucideTo3dName(MetaIcon) : resolved);
              return (
                <div key={item.label} className="flex min-w-0 items-center gap-2">
                  <div
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border',
                      palette.iconTile,
                    )}
                  >
                    {MetaIcon ? (
                      <MetaIcon className="h-4 w-4" aria-hidden />
                    ) : (
                      <RealisticIcon name={metaIconName} alt="" className="h-5 w-5" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-500">{item.label}</p>
                    <p className="truncate text-sm font-bold text-slate-900">{item.value}</p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </motion.section>
  );
}

/** Two-column section grid on desktop (Concept Mastery mock). */
export function AiToolStackedList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    // Masonry columns, not a grid: a 2-column grid made every row as tall as
    // its taller card, leaving big holes under the shorter one.
    <div
      className={cn(
        'columns-1 gap-5 md:columns-2 [&>*]:mb-4 [&>*]:break-inside-avoid md:[&>*]:mb-5',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Soft nested content panel for use inside custom viewers. */
export function AiToolInnerBox({
  children,
  className,
  tone = 'sky',
}: {
  children: ReactNode;
  className?: string;
  tone?: 'violet' | 'sky' | 'blue' | 'amber' | 'emerald' | 'rose' | 'slate' | 'teal';
}) {
  const tones: Record<string, string> = {
    violet: 'border-violet-100 bg-violet-50/80',
    sky: 'border-sky-100 bg-sky-50/80',
    teal: 'border-teal-100 bg-teal-50/80',
    blue: 'border-blue-100 bg-blue-50/80',
    amber: 'border-amber-100 bg-amber-50/80',
    emerald: 'border-emerald-100 bg-emerald-50/80',
    rose: 'border-rose-100 bg-rose-50/80',
    slate: 'border-slate-200 bg-slate-50/80',
  };
  return (
    <div
      className={cn(
        'rounded-xl border px-4 py-4 sm:px-5 sm:py-5 text-base sm:text-lg text-slate-800 leading-relaxed',
        tones[tone],
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Colored meta chip (Class / Subject / Board). */
export function AiToolFormatChip({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-lg border border-sky-200 bg-sky-100 px-3 py-1.5 text-sm font-semibold text-sky-950',
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Brochure-style label (colored) + value (near-black). */
export function AiToolMetaPair({
  label,
  value,
  className,
  tone = 'sky',
}: {
  label: string;
  value: ReactNode;
  className?: string;
  tone?: keyof typeof META_PAIR_TONES;
}) {
  const t = META_PAIR_TONES[tone] || META_PAIR_TONES.sky;
  return (
    <div className={cn('min-w-0', className)}>
      <p className={cn('text-sm font-bold uppercase tracking-wide', t.label)}>{label}</p>
      <p className="mt-0.5 text-base sm:text-lg font-semibold text-slate-900">{value}</p>
    </div>
  );
}

const META_PAIR_TONES = {
  violet: { label: 'text-violet-700' },
  sky: { label: 'text-sky-700' },
  blue: { label: 'text-blue-700' },
  amber: { label: 'text-amber-800' },
  emerald: { label: 'text-emerald-700' },
  rose: { label: 'text-rose-700' },
  orange: { label: 'text-orange-700' },
  teal: { label: 'text-teal-700' },
  cyan: { label: 'text-cyan-700' },
  indigo: { label: 'text-indigo-700' },
} as const;

/** Tip / callout banner used under tool results. */
export function AiToolTipBanner({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex gap-3 rounded-xl border border-sky-200 bg-gradient-to-r from-sky-50 to-teal-50/60 px-4 py-3.5 text-base text-sky-950',
        className,
      )}
    >
      <span
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sm font-bold text-sky-700"
        aria-hidden
      >
        i
      </span>
      <div className="min-w-0 leading-relaxed">{children}</div>
    </div>
  );
}
