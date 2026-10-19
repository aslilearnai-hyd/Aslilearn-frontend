import { useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { RealisticIcon, type AiTool3dIconName } from '@/components/ai-tool-3d-icons';
import { renderMarkdown } from '@/lib/render-teacher-markdown';

function looksLikeMarkdown(text: string): boolean {
  return (
    text.includes('|') ||
    /^\s*#{1,6}\s/m.test(text) ||
    /\*\*[^*]+\*\*/.test(text) ||
    /^\s*[-*•]\s/m.test(text)
  );
}

/**
 * Shared tap/click interactive building blocks used across every AI tool viewer
 * (teacher + student) so students have something to click, flip, or reveal instead
 * of a wall of static text. Pure client-side UI state — no scoring, no backend calls.
 */

export type InteractiveTone =
  | 'violet'
  | 'teal'
  | 'emerald'
  | 'amber'
  | 'lime'
  | 'fuchsia'
  | 'sky'
  | 'rose'
  | 'indigo'
  | 'pink'
  | 'orange'
  | 'cyan'
  | 'slate';

const TONE = {
  violet: { border: 'border-violet-100', borderStrong: 'border-violet-300', bg: 'bg-white', bgOn: 'bg-violet-50', text: 'text-violet-900', accent: 'bg-violet-600', accentText: 'text-violet-700', gradient: 'from-violet-500 to-purple-600' },
  teal: { border: 'border-teal-100', borderStrong: 'border-teal-300', bg: 'bg-white', bgOn: 'bg-teal-50', text: 'text-teal-900', accent: 'bg-teal-600', accentText: 'text-teal-700', gradient: 'from-teal-500 to-cyan-600' },
  emerald: { border: 'border-emerald-100', borderStrong: 'border-emerald-300', bg: 'bg-white', bgOn: 'bg-emerald-50', text: 'text-emerald-900', accent: 'bg-emerald-600', accentText: 'text-emerald-700', gradient: 'from-emerald-500 to-green-600' },
  amber: { border: 'border-amber-100', borderStrong: 'border-amber-300', bg: 'bg-white', bgOn: 'bg-amber-50', text: 'text-amber-900', accent: 'bg-amber-600', accentText: 'text-amber-700', gradient: 'from-amber-500 to-orange-500' },
  lime: { border: 'border-lime-100', borderStrong: 'border-lime-400', bg: 'bg-white', bgOn: 'bg-lime-50', text: 'text-lime-900', accent: 'bg-lime-600', accentText: 'text-lime-700', gradient: 'from-lime-500 to-green-600' },
  fuchsia: { border: 'border-fuchsia-100', borderStrong: 'border-fuchsia-300', bg: 'bg-white', bgOn: 'bg-fuchsia-50', text: 'text-fuchsia-900', accent: 'bg-fuchsia-600', accentText: 'text-fuchsia-700', gradient: 'from-fuchsia-500 to-purple-600' },
  sky: { border: 'border-sky-100', borderStrong: 'border-sky-300', bg: 'bg-white', bgOn: 'bg-sky-50', text: 'text-sky-900', accent: 'bg-sky-600', accentText: 'text-sky-700', gradient: 'from-sky-500 to-blue-600' },
  rose: { border: 'border-rose-100', borderStrong: 'border-rose-300', bg: 'bg-white', bgOn: 'bg-rose-50', text: 'text-rose-900', accent: 'bg-rose-600', accentText: 'text-rose-700', gradient: 'from-rose-500 to-red-500' },
  indigo: { border: 'border-indigo-100', borderStrong: 'border-indigo-300', bg: 'bg-white', bgOn: 'bg-indigo-50', text: 'text-indigo-900', accent: 'bg-indigo-600', accentText: 'text-indigo-700', gradient: 'from-indigo-500 to-blue-600' },
  pink: { border: 'border-pink-100', borderStrong: 'border-pink-300', bg: 'bg-white', bgOn: 'bg-pink-50', text: 'text-pink-900', accent: 'bg-pink-600', accentText: 'text-pink-700', gradient: 'from-pink-500 to-rose-500' },
  orange: { border: 'border-orange-100', borderStrong: 'border-orange-300', bg: 'bg-white', bgOn: 'bg-orange-50', text: 'text-orange-900', accent: 'bg-orange-600', accentText: 'text-orange-700', gradient: 'from-orange-500 to-amber-500' },
  cyan: { border: 'border-cyan-100', borderStrong: 'border-cyan-300', bg: 'bg-white', bgOn: 'bg-cyan-50', text: 'text-cyan-900', accent: 'bg-cyan-600', accentText: 'text-cyan-700', gradient: 'from-cyan-500 to-sky-500' },
  slate: { border: 'border-slate-200', borderStrong: 'border-slate-400', bg: 'bg-white', bgOn: 'bg-slate-100', text: 'text-slate-900', accent: 'bg-slate-600', accentText: 'text-slate-700', gradient: 'from-slate-500 to-slate-700' },
} as const satisfies Record<InteractiveTone, Record<string, string>>;

/** Generic tap-to-confirm checklist with a progress readout ("Prior Knowledge", "Skills you'll need", etc.). */
export function SelfCheckList({
  items,
  tone = 'teal',
  prompt = "Tap each one you're confident about",
}: {
  items: string[];
  tone?: InteractiveTone;
  prompt?: string;
}) {
  const t = TONE[tone];
  const [checked, setChecked] = useState<boolean[]>(() => items.map(() => false));
  const doneCount = checked.filter(Boolean).length;
  const toggle = (i: number) => setChecked((prev) => prev.map((v, idx) => (idx === i ? !v : v)));

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-500">{prompt}</span>
        <span className={cn('text-xs font-bold', t.accentText)}>
          {doneCount}/{items.length} confident
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((item, i) => {
          const done = checked[i];
          return (
            <motion.button
              key={i}
              type="button"
              whileTap={{ scale: 0.98 }}
              onClick={() => toggle(i)}
              className={cn(
                'flex gap-2 rounded-2xl border px-3 py-2.5 text-left text-base shadow-sm transition-all',
                done ? cn(t.borderStrong, t.bgOn) : cn(t.border, 'bg-white hover:border-slate-300'),
              )}
            >
              <CheckCircle2
                className={cn('mt-0.5 h-4 w-4 shrink-0 transition-colors', done ? 'text-emerald-500' : 'text-slate-300')}
              />
              <span className={done ? t.text : 'text-slate-800'}>{item}</span>
            </motion.button>
          );
        })}
      </div>
      {doneCount === items.length && items.length > 0 ? (
        <p className="mt-2 text-xs font-semibold text-emerald-700">All confident — nice work.</p>
      ) : null}
    </div>
  );
}

/** Click-to-reveal term/definition (or question/answer) flashcard. */
export function TapToRevealCard({
  prompt,
  detail,
  tone = 'amber',
  revealLabel = 'What does this mean?',
}: {
  prompt: string;
  detail: string;
  tone?: InteractiveTone;
  revealLabel?: string;
}) {
  const t = TONE[tone];
  const [revealed, setRevealed] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setRevealed((v) => !v)}
      className={cn('w-full rounded-2xl border bg-white px-4 py-3 text-left shadow-sm transition', t.border, `hover:${t.borderStrong}`)}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={cn('text-base font-bold', t.text)}>{prompt}</span>
        {detail ? (
          <span className={cn('shrink-0 text-mini font-semibold', t.accentText)}>
            {revealed ? 'Hide' : revealLabel}
          </span>
        ) : null}
      </div>
      <AnimatePresence initial={false}>
        {revealed && detail ? (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-1.5 overflow-hidden whitespace-pre-wrap text-base text-slate-700"
          >
            {detail}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </button>
  );
}

/** Tap-to-toggle item — "spot it" / "mark as reviewed" — pure delight, no scoring. */
export function TapToMarkItem({
  text,
  tone = 'lime',
  iconOff = 'lightbulb',
  iconOn = 'star',
  markedStyle = 'highlight',
}: {
  text: string;
  tone?: InteractiveTone;
  iconOff?: AiTool3dIconName;
  iconOn?: AiTool3dIconName;
  /** 'highlight' pops the card; 'strike' strikes through the text (for revision notes). */
  markedStyle?: 'highlight' | 'strike';
}) {
  const t = TONE[tone];
  const [marked, setMarked] = useState(false);
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.98 }}
      onClick={() => setMarked((v) => !v)}
      className={cn(
        'flex w-full items-start gap-2 rounded-2xl border px-3 py-2.5 text-left text-base shadow-sm transition-all',
        marked ? cn(t.borderStrong, t.bgOn) : cn(t.border, 'bg-white hover:border-slate-300'),
      )}
    >
      <motion.span
        animate={marked ? { rotate: [0, -12, 12, 0], scale: [1, 1.25, 1] } : { rotate: 0, scale: 1 }}
        transition={{ duration: 0.4 }}
      >
        <RealisticIcon name={marked ? iconOn : iconOff} alt="" className="mt-0.5 h-6 w-6 shrink-0" />
      </motion.span>
      <span
        className={cn(
          markedStyle === 'strike' && marked ? 'text-slate-500 line-through decoration-slate-400' : marked ? t.text : 'text-slate-800',
          markedStyle === 'highlight' && marked ? 'font-medium' : undefined,
        )}
      >
        {text}
      </span>
    </motion.button>
  );
}

/** One-item-at-a-time carousel — reads far better than cramming long items into a grid. */
export function OneAtATimeCarousel({
  items,
  tone = 'fuchsia',
  icon = 'sparkle',
}: {
  items: string[];
  tone?: InteractiveTone;
  icon?: AiTool3dIconName;
}) {
  const t = TONE[tone];
  const [index, setIndex] = useState(0);
  const item = items[Math.min(index, items.length - 1)];

  return (
    <div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={index}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.25 }}
          className={cn('flex items-start gap-3 rounded-2xl border bg-white px-4 py-4 text-base text-slate-800 shadow-sm', t.border)}
        >
          <RealisticIcon name={icon} alt="" className="mt-0.5 h-7 w-7 shrink-0" />
          <span className="leading-relaxed">{item}</span>
        </motion.div>
      </AnimatePresence>
      <div className="mt-3 flex items-center justify-between gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={index === 0}
          onClick={() => setIndex((v) => Math.max(0, v - 1))}
        >
          ← Prev
        </Button>
        <div className="flex gap-1.5">
          {items.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Item ${i + 1}`}
              className={cn('h-2 rounded-full transition-all', i === index ? cn('w-5', t.accent) : cn('w-2', t.bgOn))}
            />
          ))}
        </div>
        <Button
          type="button"
          size="sm"
          className={cn('text-white', t.accent, `hover:opacity-90`)}
          disabled={index === items.length - 1}
          onClick={() => setIndex((v) => Math.min(items.length - 1, v + 1))}
        >
          Next →
        </Button>
      </div>
    </div>
  );
}

/** Text with a Read more / Read less toggle once it gets long. */
export function ExpandableText({ text, threshold = 260 }: { text?: string; threshold?: number }) {
  const [expanded, setExpanded] = useState(false);
  const safeText = text || '';
  if (!safeText.trim()) return null;

  // Markdown (tables, lists, bold) isn't safe to truncate mid-syntax — render it in full.
  if (looksLikeMarkdown(safeText)) {
    return (
      <div
        className="prose prose-base max-w-none text-slate-700 prose-li:text-base"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(safeText) }}
      />
    );
  }

  const isLong = safeText.length > threshold;
  const display = isLong && !expanded ? `${safeText.slice(0, threshold - 40).trim()}…` : safeText;

  return (
    <div>
      <p className="whitespace-pre-wrap text-base leading-relaxed text-slate-700">{display}</p>
      {isLong ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-sm font-semibold text-sky-700 hover:text-sky-800"
        >
          {expanded ? 'Read less ↑' : 'Read more ↓'}
        </button>
      ) : null}
    </div>
  );
}

/** Timeline of steps/objectives the student can tap to check off. */
export function CheckableTimeline({ items, tone = 'violet' }: { items: string[]; tone?: InteractiveTone }) {
  const t = TONE[tone];
  const [checked, setChecked] = useState<boolean[]>(() => items.map(() => false));
  const doneCount = checked.filter(Boolean).length;
  const toggle = (i: number) => setChecked((prev) => prev.map((v, idx) => (idx === i ? !v : v)));

  return (
    <div>
      <ol className="relative space-y-0">
        {items.map((item, i) => {
          const done = checked[i];
          return (
            <li key={i} className="relative flex gap-3 pb-5 last:pb-0">
              {i < items.length - 1 ? (
                <span
                  className={cn(
                    'absolute left-[15px] top-8 h-[calc(100%-1.5rem)] w-0.5',
                    done ? 'bg-gradient-to-b from-emerald-400 to-emerald-200' : cn('bg-gradient-to-b', t.gradient, 'opacity-40'),
                  )}
                />
              ) : null}
              <motion.button
                type="button"
                onClick={() => toggle(i)}
                whileTap={{ scale: 0.85 }}
                animate={{ scale: done ? [1, 1.25, 1] : 1 }}
                transition={{ duration: 0.3 }}
                className={cn(
                  'relative z-[1] flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white shadow',
                  done ? 'bg-gradient-to-br from-emerald-500 to-green-600' : cn('bg-gradient-to-br', t.gradient),
                )}
              >
                {done ? '✓' : i + 1}
              </motion.button>
              <button
                type="button"
                onClick={() => toggle(i)}
                className={cn(
                  'min-w-0 flex-1 rounded-2xl border px-3 py-2 text-left text-base shadow-sm transition-colors',
                  done ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : cn(t.border, 'bg-white/80 text-slate-800 hover:border-slate-300'),
                )}
              >
                {item}
              </button>
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-xs font-semibold text-slate-500">
        {doneCount}/{items.length} marked as understood — tap a step to check it off.
      </p>
    </div>
  );
}

/** Click-to-reveal step flow for arrow-separated flow text (e.g. "A -> B -> C"). */
export function StepFlowDiagram({
  text,
  tone = 'teal',
  fallback,
}: {
  text: string;
  tone?: InteractiveTone;
  /** Rendered when the text has no arrow separators to split on. */
  fallback: ReactNode;
}) {
  const t = TONE[tone];
  const steps = text
    .split(/->|→/)
    .map((s) => s.trim())
    .filter(Boolean);

  const [revealedCount, setRevealedCount] = useState(1);

  if (steps.length < 2) {
    return <>{fallback}</>;
  }

  const allRevealed = revealedCount >= steps.length;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {steps.map((step, i) => {
          const visible = i < revealedCount;
          return (
            <div key={i} className="flex items-center gap-2">
              <motion.div
                initial={false}
                animate={visible ? { opacity: 1, scale: 1 } : { opacity: 0.5, scale: 0.96 }}
                transition={{ duration: 0.35 }}
                className={cn(
                  'flex min-w-[8rem] max-w-[12rem] flex-col items-center gap-1.5 rounded-2xl border px-3 py-3 text-center shadow-sm',
                  visible ? cn(t.borderStrong, 'bg-white') : 'border-dashed border-slate-200 bg-slate-50',
                )}
              >
                <span
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white',
                    visible ? t.accent : 'bg-slate-300',
                  )}
                >
                  {i + 1}
                </span>
                <span className={cn('text-sm font-semibold leading-snug', visible ? t.text : 'text-slate-400')}>
                  {visible ? step : '???'}
                </span>
              </motion.div>
              {i < steps.length - 1 ? (
                <span
                  className={cn('h-5 w-5 shrink-0', i < revealedCount - 1 ? t.accentText : 'text-slate-300')}
                  aria-hidden
                >
                  →
                </span>
              ) : null}
            </div>
          );
        })}
      </div>

      {!allRevealed ? (
        <Button
          type="button"
          size="sm"
          className={cn('mt-4 text-white', t.accent, 'hover:opacity-90')}
          onClick={() => setRevealedCount((v) => Math.min(v + 1, steps.length))}
        >
          Reveal next step ({revealedCount}/{steps.length})
        </Button>
      ) : (
        <p className={cn('mt-4 text-sm font-semibold', t.accentText)}>✓ Full flow revealed — trace it back in your own words.</p>
      )}
    </div>
  );
}

/** Flip card — front shows a prompt, back shows a reveal/challenge. */
export function FlipCard({
  front,
  back,
  tone = 'emerald',
}: {
  front: ReactNode;
  back: ReactNode;
  tone?: InteractiveTone;
}) {
  const t = TONE[tone];
  const [flipped, setFlipped] = useState(false);

  return (
    <button
      type="button"
      onClick={() => setFlipped((v) => !v)}
      className="block w-full text-left [perspective:1200px]"
      aria-pressed={flipped}
    >
      {/* Both faces share one grid cell, so the card grows to the taller face
          instead of long text spilling out of a fixed-height box. */}
      <motion.div
        className="grid min-h-[13rem]"
        style={{ transformStyle: 'preserve-3d' }}
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ duration: 0.5, ease: 'easeInOut' }}
      >
        <div
          className={cn('flex flex-col rounded-3xl border bg-gradient-to-br from-white to-slate-50 p-4 shadow-sm [grid-area:1/1] break-words', t.border)}
          style={{ backfaceVisibility: 'hidden' }}
        >
          {front}
        </div>
        <div
          className={cn('flex flex-col items-center justify-center gap-2 rounded-3xl border p-5 text-center text-white shadow-sm bg-gradient-to-br [grid-area:1/1]', t.border, t.gradient)}
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
        >
          {back}
        </div>
      </motion.div>
    </button>
  );
}
