import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatAiToolText } from '@/lib/title-case';
import { displaySubtopicLabel } from '@/lib/curriculum-subtopic-display';
import { QuestionFigure } from '@/components/ai-tools/QuestionFigure';
import { MatchFollowingCard } from '@/components/ai-tools/MatchFollowingCard';

/**
 * SixSectionViewer — one reusable, premium card shell for all 21 AsliLearn tools.
 * Each tool supplies its icon, accent colours, section labels, and typed content
 * blocks; the layout stays identical and polished (accent-barred cards, layered
 * depth, refined MCQ / answer-key / Bloom / tier rendering). White page, vivid cards.
 */

export type SectionAccent = 'blue' | 'green' | 'amber' | 'violet' | 'teal' | 'rose';

type Accent = {
  text: string;
  badge: string;
  bar: string;
  head: string;
  soft: string;
  ring: string;
  dot: string;
  glow: string;
};

const ACCENTS: Record<SectionAccent, Accent> = {
  blue: {
    text: 'text-blue-600 dark:text-blue-300',
    badge: 'bg-gradient-to-br from-blue-500 to-indigo-600',
    bar: 'from-blue-500 to-indigo-500',
    head: 'from-blue-50/80 dark:from-blue-950/40',
    soft: 'bg-blue-50 dark:bg-blue-950/40',
    ring: 'border-blue-100 dark:border-blue-900/60',
    dot: 'bg-blue-500',
    glow: 'shadow-blue-500/25',
  },
  green: {
    text: 'text-emerald-600 dark:text-emerald-300',
    badge: 'bg-gradient-to-br from-emerald-500 to-teal-600',
    bar: 'from-emerald-500 to-teal-500',
    head: 'from-emerald-50/80 dark:from-emerald-950/40',
    soft: 'bg-emerald-50 dark:bg-emerald-950/40',
    ring: 'border-emerald-100 dark:border-emerald-900/60',
    dot: 'bg-emerald-500',
    glow: 'shadow-emerald-500/25',
  },
  amber: {
    text: 'text-amber-600 dark:text-amber-300',
    badge: 'bg-gradient-to-br from-amber-400 to-orange-600',
    bar: 'from-amber-400 to-orange-500',
    head: 'from-amber-50/80 dark:from-amber-950/40',
    soft: 'bg-amber-50 dark:bg-amber-950/40',
    ring: 'border-amber-100 dark:border-amber-900/60',
    dot: 'bg-amber-500',
    glow: 'shadow-amber-500/25',
  },
  violet: {
    text: 'text-violet-600 dark:text-violet-300',
    badge: 'bg-gradient-to-br from-violet-500 to-fuchsia-600',
    bar: 'from-violet-500 to-fuchsia-500',
    head: 'from-violet-50/80 dark:from-violet-950/40',
    soft: 'bg-violet-50 dark:bg-violet-950/40',
    ring: 'border-violet-100 dark:border-violet-900/60',
    dot: 'bg-violet-500',
    glow: 'shadow-violet-500/25',
  },
  teal: {
    text: 'text-teal-600 dark:text-teal-300',
    badge: 'bg-gradient-to-br from-teal-500 to-cyan-600',
    bar: 'from-teal-500 to-cyan-500',
    head: 'from-teal-50/80 dark:from-teal-950/40',
    soft: 'bg-teal-50 dark:bg-teal-950/40',
    ring: 'border-teal-100 dark:border-teal-900/60',
    dot: 'bg-teal-500',
    glow: 'shadow-teal-500/25',
  },
  rose: {
    text: 'text-rose-600 dark:text-rose-300',
    badge: 'bg-gradient-to-br from-rose-500 to-pink-600',
    bar: 'from-rose-500 to-pink-500',
    head: 'from-rose-50/80 dark:from-rose-950/40',
    soft: 'bg-rose-50 dark:bg-rose-950/40',
    ring: 'border-rose-100 dark:border-rose-900/60',
    dot: 'bg-rose-500',
    glow: 'shadow-rose-500/25',
  },
};

const BLOOM_TONE = ['violet', 'blue', 'green', 'amber', 'rose'] as const;
const TIER_TONE: Record<string, SectionAccent> = { support: 'green', core: 'blue', stretch: 'violet' };

export type McqQuestion = {
  n: string;
  stem: string;
  marks?: string;
  imageUrl?: string;
  matchPairs?: { left: string; right: string; leftKey?: string; rightKey?: string }[];
  options: { label: string; text: string; correct?: boolean }[];
};

export type ContentBlock =
  | { kind: 'lead'; text: string }
  | { kind: 'titleLine'; text: string }
  | { kind: 'bullets'; items: string[] }
  | { kind: 'steps'; items: string[] }
  | { kind: 'keyValue'; rows: { label: string; value: string }[] }
  | { kind: 'mcq'; questions: McqQuestion[] }
  | { kind: 'shortAnswer'; questions: { n: string; stem: string; marks?: string; imageUrl?: string }[] }
  | { kind: 'answerKey'; items: { n: string; answer: string; work?: string }[] }
  | { kind: 'table'; head: string[]; rows: string[][] }
  | { kind: 'flashcards'; cards: { front: string; back: string }[] }
  | { kind: 'bloom'; chips: { level: string; desc: string }[] }
  | { kind: 'tips'; items: string[] };

export type SixSection = {
  id: string;
  label: string;
  accent: SectionAccent;
  icon: LucideIcon;
  emoji?: string;
  tag?: string;
  full?: boolean;
  blocks: ContentBlock[];
};

export type SixSectionViewerProps = {
  tool: { name: string; subtitle?: string; icon: LucideIcon };
  curriculum?: { board?: string; class?: string; subject?: string; chapter?: string; subtopic?: string };
  chapter?: { title?: string; subtopic?: string; icon?: LucideIcon; emoji?: string };
  /** Optional "AI Teaching Summary" hero — what students will learn + quick stats. */
  summary?: { learn?: string[]; stats?: { label: string; value: string }[] };
  sections: SixSection[];
  className?: string;
};

const DEFAULT_EMOJI: Record<string, string> = {
  core: '📄', objectives: '🎯', differentiation: '🪜', assessment: '🔑', teacher: '📋', reallife: '🌏',
};

/** Short tab labels per known section id (falls back to the first words of the label). */
const TAB_LABEL: Record<string, string> = {
  core: 'Worksheet', objectives: 'Objectives', differentiation: 'Support', assessment: 'Answer Key', teacher: 'Teacher', reallife: 'Real-Life',
};
const shortTabLabel = (s: SixSection) =>
  TAB_LABEL[s.id] || String(s.label).split(/[—&:(]/)[0].trim().split(/\s+/).slice(0, 2).join(' ');

function InteractiveFlashcards({
  cards,
  accent,
}: {
  cards: { front: string; back: string }[];
  accent: Accent;
}) {
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  if (!cards.length) return null;
  const card = cards[Math.min(idx, cards.length - 1)];
  const go = (next: number) => {
    setFlipped(false);
    setIdx(((next % cards.length) + cards.length) % cards.length);
  };
  return (
    <div className="mx-auto w-full max-w-lg space-y-4">
      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        className={cn(
          'group relative w-full min-h-[200px] rounded-2xl border bg-white p-6 text-left shadow-md transition-all duration-300',
          'hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400',
          accent.ring,
          flipped && 'bg-gradient-to-br from-sky-50 to-teal-50',
        )}
        aria-label={flipped ? 'Show front' : 'Flip card'}
      >
        <div className={cn('mb-3 text-micro font-black uppercase tracking-widest', accent.text)}>
          {flipped ? 'Back · Answer' : 'Front · Prompt'} · Card {idx + 1}/{cards.length}
        </div>
        <p className="text-[1.02rem] font-semibold leading-relaxed text-slate-900 whitespace-pre-wrap">
          {flipped ? card.back : card.front}
        </p>
        <span className="mt-4 inline-flex items-center gap-1.5 text-micro font-semibold text-slate-400 group-hover:text-slate-600">
          <RotateCcw className="h-3.5 w-3.5" /> Tap to flip
        </span>
      </button>
      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => go(idx - 1)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50"
          aria-label="Previous card"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <span className="min-w-[4rem] text-center text-sm font-semibold tabular-nums text-slate-600">
          {idx + 1} / {cards.length}
        </span>
        <button
          type="button"
          onClick={() => go(idx + 1)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50"
          aria-label="Next card"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

function InteractiveMcq({ questions, accent }: { questions: McqQuestion[]; accent: Accent }) {
  const [picked, setPicked] = useState<Record<string, string>>({});
  return (
    <div className="space-y-4">
      {questions.map((q, j) => {
        const key = `${q.n}-${j}`;
        if (Array.isArray(q.matchPairs) && q.matchPairs.length >= 2) {
          return (
            <div key={key} className="space-y-2">
              <div className="flex gap-2.5 text-[0.92rem] font-semibold leading-snug text-slate-800">
                <span className={cn('font-extrabold', accent.text)}>{q.n}.</span>
                {q.marks && (
                  <span className="ml-auto shrink-0 whitespace-nowrap rounded-full bg-white px-2 py-0.5 text-micro font-bold text-slate-400 ring-1 ring-slate-200">
                    {q.marks}
                  </span>
                )}
              </div>
              <MatchFollowingCard question={q.stem} matchPairs={q.matchPairs} showAnswer />
            </div>
          );
        }
        const selected = picked[key];
        const hasCorrect = q.options.some((o) => o.correct);
        return (
          <div
            key={key}
            className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-800/30"
          >
            <div className="flex gap-2.5 text-[0.92rem] font-semibold leading-snug text-slate-800 dark:text-slate-200">
              <span className={cn('font-extrabold', accent.text)}>{q.n}.</span>
              <span className="flex-1">{q.stem}</span>
              {q.marks && (
                <span className="ml-auto shrink-0 whitespace-nowrap rounded-full bg-white px-2 py-0.5 text-micro font-bold text-slate-400 ring-1 ring-slate-200">
                  {q.marks}
                </span>
              )}
            </div>
            <QuestionFigure imageUrl={q.imageUrl} alt={`Figure for question ${q.n}`} />
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {q.options.map((o, k) => {
                const isSelected = selected === o.label;
                const showResult = Boolean(selected) && hasCorrect;
                const isCorrectOpt = Boolean(o.correct);
                const wrongPick = showResult && isSelected && !isCorrectOpt;
                const rightShow = showResult && isCorrectOpt;
                return (
                  <button
                    type="button"
                    key={k}
                    onClick={() => setPicked((p) => ({ ...p, [key]: o.label }))}
                    className={cn(
                      'flex items-center gap-2.5 rounded-xl border px-3 py-2 text-left text-mini transition-all',
                      rightShow
                        ? 'border-emerald-400 bg-emerald-50 ring-1 ring-emerald-300'
                        : wrongPick
                          ? 'border-rose-300 bg-rose-50 ring-1 ring-rose-200'
                          : isSelected
                            ? cn('ring-1', accent.ring, accent.soft)
                            : 'border-slate-200 bg-white hover:border-slate-300',
                    )}
                  >
                    <span
                      className={cn(
                        'grid h-6 w-6 shrink-0 place-items-center rounded-full text-micro font-extrabold',
                        rightShow
                          ? 'bg-emerald-500 text-white'
                          : wrongPick
                            ? 'bg-rose-500 text-white'
                            : isSelected
                              ? cn(accent.badge, 'text-white')
                              : 'bg-slate-100 text-slate-500',
                      )}
                    >
                      {o.label}
                    </span>
                    <span className="flex-1 text-slate-700">{o.text}</span>
                    {rightShow ? <Check className="ml-auto h-4 w-4 shrink-0 text-emerald-500" strokeWidth={3} /> : null}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RevealAnswerKey({
  items,
}: {
  items: { n: string; answer: string; work?: string }[];
}) {
  const [revealed, setRevealed] = useState(false);
  if (!items.length) return null;
  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setRevealed((r) => !r)}
        className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100"
      >
        {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        {revealed ? 'Hide answers' : 'Reveal answers'}
      </button>
      {revealed ? (
        <div className="space-y-2.5 animate-in fade-in duration-200">
          {items.map((a, j) => (
            <div
              key={j}
              className="grid grid-cols-[auto_1fr] gap-3 rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-teal-50/40 p-3.5"
            >
              <span className="grid h-7 min-w-7 place-items-center self-start rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 px-1.5 text-micro font-extrabold tabular-nums text-white shadow-sm">
                {a.n}
              </span>
              <div className="text-[0.9rem]">
                <span className="font-semibold text-slate-900">{a.answer}</span>
                {a.work ? (
                  <div className="mt-1 text-mini leading-relaxed text-slate-500">{a.work}</div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-500">Answers are hidden — try the questions first, then reveal.</p>
      )}
    </div>
  );
}

function CheckableSteps({ items, accent }: { items: string[]; accent: Accent }) {
  const [done, setDone] = useState<Record<number, boolean>>({});
  const doneCount = Object.values(done).filter(Boolean).length;
  return (
    <div className="space-y-3">
      <p className="text-micro font-semibold uppercase tracking-wide text-slate-400">
        Progress {doneCount}/{items.length}
      </p>
      <ol className="relative space-y-3 before:absolute before:left-[15px] before:top-4 before:bottom-4 before:w-px before:bg-slate-200">
        {items.map((it, j) => {
          const checked = Boolean(done[j]);
          return (
            <li key={j}>
              <button
                type="button"
                onClick={() => setDone((d) => ({ ...d, [j]: !d[j] }))}
                className={cn(
                  'relative flex w-full items-start gap-4 rounded-xl border px-3 py-2.5 text-left text-[0.92rem] leading-relaxed transition',
                  checked
                    ? 'border-emerald-200 bg-emerald-50/80 text-slate-600'
                    : 'border-transparent bg-transparent text-slate-700 hover:border-slate-200 hover:bg-white',
                )}
              >
                <span
                  className={cn(
                    'relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full text-mini font-extrabold text-white shadow-md ring-4 ring-white',
                    checked ? 'bg-emerald-500' : cn(accent.badge, accent.glow),
                  )}
                >
                  {checked ? <Check className="h-4 w-4" strokeWidth={3} /> : j + 1}
                </span>
                <span className={cn('pt-1', checked && 'line-through decoration-emerald-400/80')}>{it}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Blocks({ blocks, accent }: { blocks: ContentBlock[]; accent: Accent }) {
  return (
    <div className="space-y-5">
      {blocks.map((b, i) => {
        switch (b.kind) {
          case 'lead':
            return (
              <p key={i} className="text-[0.92rem] leading-relaxed text-slate-600 dark:text-slate-300">
                {b.text}
              </p>
            );
          case 'titleLine':
            return (
              <p
                key={i}
                className="flex items-center gap-2 pt-1 text-[0.95rem] font-bold tracking-tight text-slate-900 dark:text-slate-100"
              >
                <span className={cn('h-4 w-1.5 rounded-full bg-gradient-to-b', accent.bar)} />
                {b.text}
              </p>
            );
          case 'bullets':
            return (
              <ul key={i} className="space-y-2.5">
                {b.items.map((it, j) => (
                  <li
                    key={j}
                    className="flex gap-3 text-[0.92rem] leading-relaxed text-slate-700 dark:text-slate-300"
                  >
                    <span
                      className={cn(
                        'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full ring-1 ring-inset',
                        accent.soft,
                        accent.ring,
                      )}
                    >
                      <Check className={cn('h-3 w-3', accent.text)} strokeWidth={3} />
                    </span>
                    <span>{it}</span>
                  </li>
                ))}
              </ul>
            );
          case 'steps':
            return <CheckableSteps key={i} items={b.items} accent={accent} />;
          case 'keyValue':
            return (
              <div key={i} className="grid gap-3 sm:grid-cols-3">
                {b.rows.map((r, j) => {
                  const tone = ACCENTS[TIER_TONE[String(r.label || '').trim().toLowerCase()] || accentKey(accent)];
                  return (
                    <div
                      key={j}
                      className={cn(
                        'relative overflow-hidden rounded-2xl border p-4 transition-shadow hover:shadow-md',
                        tone.ring,
                        tone.soft,
                      )}
                    >
                      <div className={cn('absolute inset-x-0 top-0 h-1 bg-gradient-to-r', tone.bar)} />
                      <div className={cn('text-micro font-black uppercase tracking-widest', tone.text)}>
                        {r.label}
                      </div>
                      <div className="mt-1.5 text-mini leading-relaxed text-slate-700 dark:text-slate-300">
                        {r.value}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          case 'mcq':
            return <InteractiveMcq key={i} questions={b.questions} accent={accent} />;
          case 'shortAnswer':
            return (
              <div key={i} className="divide-y divide-slate-100 dark:divide-slate-800">
                {b.questions.map((q, j) => (
                  <div
                    key={j}
                    className="space-y-2 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="flex gap-3 text-[0.92rem] leading-snug text-slate-800 dark:text-slate-200">
                      <span className={cn('font-extrabold', accent.text)}>{q.n}.</span>
                      <span className="flex-1 font-medium">{q.stem}</span>
                      {q.marks && (
                        <span className="ml-auto shrink-0 whitespace-nowrap rounded-full bg-slate-50 px-2 py-0.5 text-micro font-bold text-slate-400 ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
                          {q.marks}
                        </span>
                      )}
                    </div>
                    <QuestionFigure imageUrl={q.imageUrl} alt={`Figure for question ${q.n}`} />
                  </div>
                ))}
              </div>
            );
          case 'answerKey':
            return <RevealAnswerKey key={i} items={b.items} />;
          case 'flashcards':
            return <InteractiveFlashcards key={i} cards={b.cards} accent={accent} />;
          case 'table': {
            const headLower = b.head.map((h) => h.toLowerCase());
            const isCardTable =
              headLower.includes('front') && headLower.includes('back') && b.rows.length > 0;
            if (isCardTable) {
              const fi = headLower.indexOf('front');
              const bi = headLower.indexOf('back');
              const cards = b.rows
                .map((r) => ({ front: String(r[fi] || '').trim(), back: String(r[bi] || '').trim() }))
                .filter((c) => c.front && c.back);
              if (cards.length) return <InteractiveFlashcards key={i} cards={cards} accent={accent} />;
            }
            return (
              <div key={i} className={cn('overflow-x-auto rounded-2xl border', accent.ring)}>
                <table className="w-full min-w-[340px] text-mini">
                  <thead>
                    <tr className={cn(accent.soft)}>
                      {b.head.map((h, j) => (
                        <th
                          key={j}
                          className={cn(
                            'whitespace-nowrap px-3.5 py-3 text-left text-micro font-black uppercase tracking-wider',
                            accent.text,
                          )}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, j) => (
                      <tr
                        key={j}
                        className="border-t border-slate-100 even:bg-slate-50/60 dark:border-slate-800 dark:even:bg-slate-800/30"
                      >
                        {r.map((cell, k) => (
                          <td
                            key={k}
                            className={cn(
                              'px-3.5 py-2.5',
                              k === 0
                                ? 'w-px text-center font-bold tabular-nums text-slate-400'
                                : 'text-slate-600 dark:text-slate-300',
                            )}
                          >
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          }
          case 'bloom':
            return (
              <div key={i} className="grid grid-cols-2 gap-3">
                {b.chips.map((c, j) => {
                  const tone = ACCENTS[BLOOM_TONE[j % BLOOM_TONE.length]];
                  return (
                    <div
                      key={j}
                      className={cn(
                        'relative overflow-hidden rounded-2xl border p-3.5 text-center transition-shadow hover:shadow-md',
                        tone.soft,
                        tone.ring,
                      )}
                    >
                      <div className={cn('absolute inset-x-0 top-0 h-1 bg-gradient-to-r', tone.bar)} />
                      <div className={cn('mt-1 text-[0.92rem] font-black leading-tight tracking-tight', tone.text)}>
                        {c.level}
                      </div>
                      <div className="mt-1 text-mini leading-snug text-slate-500 dark:text-slate-400">
                        {c.desc}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          case 'tips':
            return (
              <div key={i} className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                {b.items.map((it, j) => (
                  <div
                    key={j}
                    className="flex items-start gap-3 text-[0.9rem] leading-relaxed text-slate-700 dark:text-slate-300"
                  >
                    <span
                      className={cn(
                        'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full ring-1 ring-inset',
                        accent.soft,
                        accent.ring,
                      )}
                    >
                      <Check className={cn('h-3 w-3', accent.text)} strokeWidth={3} />
                    </span>
                    <span>{it}</span>
                  </div>
                ))}
              </div>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}

/** Reverse-lookup an accent's key so tier cards can fall back to the section accent. */
function accentKey(accent: Accent): SectionAccent {
  const found = (Object.keys(ACCENTS) as SectionAccent[]).find((k) => ACCENTS[k] === accent);
  return found || 'blue';
}

export function SixSectionViewer({ tool, curriculum, chapter, summary, sections, className }: SixSectionViewerProps) {
  const ToolIcon = tool.icon;
  const ChapterIcon = chapter?.icon;
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggleSection = (id: string) => setCollapsed((c) => ({ ...c, [id]: !c[id] }));
  const [activeTab, setActiveTab] = useState('all');
  const visibleSections = activeTab === 'all' ? sections : sections.filter((s) => s.id === activeTab);
  const soloView = activeTab !== 'all';
  const subtopicShown = displaySubtopicLabel(curriculum?.subtopic);
  const chapterSubtopicShown = displaySubtopicLabel(chapter?.subtopic);
  const chips = [
    { k: 'Board', v: curriculum?.board },
    { k: 'Class', v: curriculum?.class },
    { k: 'Subject', v: curriculum?.subject },
    { k: 'Chapter', v: curriculum?.chapter },
    { k: 'Subtopic', v: subtopicShown },
  ].filter((c) => c.v);

  return (
    <div className={cn('mx-auto w-full max-w-4xl space-y-5 text-slate-900 dark:text-slate-100', className)}>
      {/* tool header — hero */}
      <div className="relative overflow-hidden rounded-[1.75rem] border border-sky-100 bg-gradient-to-br from-white via-sky-50/40 to-teal-50/50 p-6 shadow-[0_2px_12px_-4px_rgba(14,165,233,0.12)] dark:border-slate-800 dark:from-slate-900 dark:via-slate-900 dark:to-sky-950/30">
        <div className="pointer-events-none absolute -right-8 -top-10 h-40 w-40 rounded-full bg-gradient-to-br from-sky-300/25 to-teal-400/15 blur-2xl" />
        <div className="relative flex items-center gap-4">
          <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-sky-500 to-teal-500 text-white shadow-lg shadow-sky-500/25 ring-1 ring-white/40">
            <ToolIcon className="h-8 w-8" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-xl font-black tracking-tight sm:text-2xl">{formatAiToolText(tool.name)}</h2>
            {tool.subtitle && (
              <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{formatAiToolText(tool.subtitle)}</p>
            )}
          </div>
          <span className="ml-auto hidden shrink-0 items-center gap-1.5 self-start rounded-full bg-gradient-to-r from-sky-500 to-teal-500 px-3 py-1.5 text-xs font-bold text-white shadow-sm shadow-sky-500/25 sm:inline-flex">
            <Sparkles className="h-3.5 w-3.5" /> AI Powered
          </span>
        </div>
      </div>

      {/* curriculum chips — label on top, value below (full chip width, no clipping) */}
      {chips.length > 0 && (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {chips.map((c) => (
            <div
              key={c.k}
              className="min-w-0 rounded-2xl border border-slate-200/80 bg-white px-4 py-2.5 shadow-sm transition-shadow hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="text-micro font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {formatAiToolText(c.k)}
              </div>
              <div className="mt-0.5 break-words text-sm font-bold leading-snug text-slate-800 dark:text-slate-200">
                {formatAiToolText(String(c.v || ''))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* chapter hero */}
      {(chapter?.title || chapterSubtopicShown) && (
        <div className="flex items-center gap-4 overflow-hidden rounded-[1.75rem] border border-sky-100 bg-gradient-to-r from-sky-50 via-teal-50/40 to-white p-5 shadow-sm dark:border-slate-800 dark:from-slate-800/60 dark:via-slate-900 dark:to-slate-900">
          <div className="min-w-0">
            {chapter?.title && (
              <h3 className="flex items-center gap-2 text-lg font-black tracking-tight">
                {ChapterIcon && <ChapterIcon className="h-5 w-5 shrink-0 text-sky-600 dark:text-sky-300" />}
                <span className="truncate">{chapter.title}</span>
              </h3>
            )}
            {chapterSubtopicShown ? (
              <p className="mt-1 font-bold text-teal-700 dark:text-teal-300">{chapterSubtopicShown}</p>
            ) : null}
          </div>
          {chapter?.emoji && <div className="ml-auto shrink-0 text-4xl drop-shadow-sm">{chapter.emoji}</div>}
        </div>
      )}

      {/* AI Teaching Summary hero — what students will learn + quick stats */}
      {summary && ((summary.learn && summary.learn.length > 0) || (summary.stats && summary.stats.length > 0)) && (
        <div className="overflow-hidden rounded-[1.75rem] border border-sky-100 bg-gradient-to-br from-sky-50 via-white to-teal-50/40 p-5 shadow-[0_2px_12px_-4px_rgba(14,165,233,0.1)] dark:border-sky-900/50 dark:from-sky-950/40 dark:via-slate-900 dark:to-teal-950/20">
          <div className="flex items-center gap-2 text-micro font-black uppercase tracking-[0.18em] text-sky-600 dark:text-sky-300">
            <Sparkles className="h-4 w-4" /> AI Teaching Summary
          </div>
          {summary.learn && summary.learn.length > 0 && (
            <>
              <p className="mt-2.5 text-mini font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Students will learn to
              </p>
              <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                {summary.learn.map((it, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-[0.92rem] leading-snug text-slate-700 dark:text-slate-300">
                    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-100 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-950/50 dark:ring-emerald-800">
                      <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-300" strokeWidth={3} />
                    </span>
                    <span>{it}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {summary.stats && summary.stats.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2.5">
              {summary.stats.map((s, i) => (
                <div
                  key={i}
                  className="rounded-2xl border border-slate-200/80 bg-white px-3.5 py-2 shadow-sm dark:border-slate-700 dark:bg-slate-900"
                >
                  <div className="text-micro font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
                    {formatAiToolText(s.label)}
                  </div>
                  <div className="mt-0.5 text-[0.92rem] font-bold text-slate-800 dark:text-slate-200">
                    {formatAiToolText(s.value)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* section tabs — "All" (default) plus one focus tab per section */}
      {sections.length > 1 && (
        <div className="sticky top-0 z-20 flex gap-1.5 overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/95 p-1.5 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-mini font-bold transition-colors',
              activeTab === 'all'
                ? 'bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-900'
                : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800',
            )}
          >
            <span aria-hidden>📋</span> All
          </button>
          {sections.map((s) => {
            const on = activeTab === s.id;
            const emoji = s.emoji ?? DEFAULT_EMOJI[s.id];
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveTab(s.id)}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-mini font-bold transition-colors',
                  on
                    ? cn('text-white shadow-sm', ACCENTS[s.accent].badge)
                    : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800',
                )}
              >
                <span aria-hidden>{emoji}</span> {shortTabLabel(s)}
              </button>
            );
          })}
        </div>
      )}

      {/* six sections — the primary (worksheet/core) dominates; all collapsible */}
      <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-2">
        {visibleSections.map((s) => {
          const idx = sections.indexOf(s);
          const accent = ACCENTS[s.accent];
          const Icon = s.icon;
          const emoji = s.emoji ?? DEFAULT_EMOJI[s.id];
          const isPrimary = s.id === 'core';
          const isCollapsed = !soloView && !!collapsed[s.id];
          return (
            <section
              key={s.id}
              className={cn(
                'group relative flex h-auto flex-col overflow-hidden rounded-[1.5rem] border bg-white transition-all duration-300 dark:bg-slate-900',
                accent.ring,
                (s.full || isPrimary || soloView) && 'md:col-span-2',
                isCollapsed && 'self-start',
                isPrimary
                  ? 'shadow-[0_8px_30px_-8px_rgba(0,0,0,0.16)] ring-1 ring-slate-900/5 dark:ring-white/10'
                  : 'shadow-[0_2px_10px_-4px_rgba(0,0,0,0.08)] hover:-translate-y-0.5 hover:shadow-[0_12px_32px_-8px_rgba(0,0,0,0.14)]',
              )}
            >
              {/* top accent bar — thicker on the primary section */}
              <div className={cn('w-full bg-gradient-to-r', accent.bar, isPrimary ? 'h-2' : 'h-1.5')} />
              {/* tinted header — click to collapse/expand */}
              <button
                type="button"
                onClick={() => toggleSection(s.id)}
                aria-expanded={!isCollapsed}
                className={cn(
                  'flex w-full items-center gap-3 bg-gradient-to-b to-white px-5 text-left transition-colors hover:brightness-[0.99] dark:to-slate-900',
                  !isCollapsed && 'border-b',
                  accent.ring,
                  accent.head,
                  isPrimary ? 'py-5' : 'py-4',
                )}
              >
                <span
                  className={cn(
                    'grid shrink-0 place-items-center rounded-2xl text-white shadow-md ring-1 ring-white/30',
                    accent.badge,
                    accent.glow,
                    isPrimary ? 'h-12 w-12' : 'h-11 w-11',
                  )}
                >
                  <Icon className={isPrimary ? 'h-6 w-6' : 'h-5 w-5'} />
                </span>
                <div className="min-w-0 flex-1">
                  <h4
                    className={cn(
                      'font-black leading-tight tracking-tight',
                      accent.text,
                      isPrimary ? 'text-[1.2rem]' : 'text-[1.05rem]',
                    )}
                  >
                    <span className="mr-1.5 tabular-nums opacity-50">{idx + 1}.</span>
                    {formatAiToolText(s.label)}
                  </h4>
                </div>
                {isPrimary && (
                  <span className="hidden shrink-0 rounded-full bg-white/70 px-2.5 py-0.5 text-micro font-black uppercase tracking-widest text-slate-500 ring-1 ring-slate-200 sm:inline-block dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700">
                    Main
                  </span>
                )}
                {s.tag && (
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-2.5 py-0.5 text-micro font-bold ring-1 ring-inset',
                      accent.soft,
                      accent.text,
                      accent.ring,
                    )}
                  >
                    {s.tag}
                  </span>
                )}
                {emoji && !s.tag && !isPrimary && (
                  <span className="shrink-0 text-2xl opacity-90">{emoji}</span>
                )}
                <ChevronDown
                  className={cn(
                    'h-5 w-5 shrink-0 text-slate-400 transition-transform duration-300',
                    isCollapsed && '-rotate-90',
                  )}
                />
              </button>
              {!isCollapsed && (
                <div className={isPrimary ? 'p-6' : 'p-5'}>
                  <Blocks blocks={s.blocks} accent={accent} />
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

export default SixSectionViewer;
