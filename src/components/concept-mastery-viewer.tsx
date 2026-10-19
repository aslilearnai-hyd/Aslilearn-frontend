import { AiToolStackedSection } from '@/components/ai-tool-stacked-section';
import { useMemo, useState, useEffect, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle,
  BookOpen,
  Brain,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Eye,
  GraduationCap,
  HelpCircle,
  Lightbulb,
  ListChecks,
  Sparkles,
  Target,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { renderMarkdown } from '@/lib/render-teacher-markdown';
import { stripStructuredAiToolMetadata } from '@/lib/strip-ai-tool-metadata';
import {
  conceptHasVisibleContent,
  countConceptMasterySectionHeaders,
  fillConceptGapsFromMarkdown,
  parseSingleConceptDocument,
  resolveConceptsFromPayload,
  shouldPreferConceptMasteryMarkdown,
  type NormalizedConcept,
} from '@/lib/parse-concept-mastery';
import { SelfCheckList, TapToMarkItem } from '@/components/ai-tool-interactive';

export { conceptMasteryViewerPayloadFromRecord } from '@/lib/parse-concept-mastery';

export interface ConceptMasteryViewerProps {
  content: string;
  rawContent?: unknown;
  className?: string;
  variant?: 'default' | 'student' | 'teacher';
}

type ConceptSectionDef = {
  num: number;
  title: string;
  icon: LucideIcon;
  stripe: string;
  iconWrap: string;
  hasContent: (c: NormalizedConcept) => boolean;
  render: (c: NormalizedConcept) => ReactNode;
};

const CONCEPT_PROSE_CLASS =
  'prose prose-base max-w-none break-words text-slate-800 [&_p]:leading-relaxed [&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:my-2 [&_ol]:my-2 [&_strong]:font-semibold [&_pre]:overflow-x-auto';

function ConceptProse({ text, className }: { text: string; className?: string }) {
  if (!String(text || '').trim()) return null;
  return (
    <div
      className={cn(CONCEPT_PROSE_CLASS, className)}
      dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }}
    />
  );
}

const CONCEPT_TEMPLATE_SECTIONS: ConceptSectionDef[] = [
  {
    num: 1,
    title: 'Simple definition',
    icon: BookOpen,
    stripe: 'border-fuchsia-500',
    iconWrap: 'bg-fuchsia-100 text-fuchsia-800',
    hasContent: (c) => !!c.simpleDefinition,
    render: (c) => <ConceptProse text={c.simpleDefinition} />,
  },
  {
    num: 2,
    title: 'Why this concept is important',
    icon: Target,
    stripe: 'border-violet-500',
    iconWrap: 'bg-violet-100 text-violet-800',
    hasContent: (c) => !!c.whyImportant,
    render: (c) => <ConceptProse text={c.whyImportant} />,
  },
  {
    num: 3,
    title: 'Prior knowledge needed',
    icon: HelpCircle,
    stripe: 'border-purple-500',
    iconWrap: 'bg-purple-100 text-purple-800',
    hasContent: (c) => !!c.priorKnowledge,
    render: (c) => <ConceptProse text={c.priorKnowledge} />,
  },
  {
    num: 4,
    title: 'Step-by-step explanation',
    icon: Lightbulb,
    stripe: 'border-indigo-500',
    iconWrap: 'bg-indigo-100 text-indigo-800',
    hasContent: (c) => !!c.explanation,
    render: (c) => <ExplanationBody text={c.explanation} />,
  },
  {
    num: 5,
    title: 'Diagram / visualisation suggestion',
    icon: Eye,
    stripe: 'border-blue-500',
    iconWrap: 'bg-blue-100 text-blue-800',
    hasContent: (c) => !!c.diagramSuggestion,
    render: (c) => (
      <ConceptProse
        text={c.diagramSuggestion}
        className="rounded-lg border border-dashed border-blue-200 bg-blue-50/60 px-3 py-2.5 italic"
      />
    ),
  },
  {
    num: 6,
    title: 'Real-life examples',
    icon: Sparkles,
    stripe: 'border-cyan-500',
    iconWrap: 'bg-cyan-100 text-cyan-900',
    hasContent: (c) => !!c.realLifeExamples,
    render: (c) => <ConceptProse text={c.realLifeExamples} />,
  },
  {
    num: 7,
    title: 'Common misconceptions and corrections',
    icon: AlertTriangle,
    stripe: 'border-amber-500',
    iconWrap: 'bg-amber-100 text-amber-900',
    hasContent: (c) => c.misconceptions.length > 0,
    render: (c) => (
      <SelfCheckList items={c.misconceptions} tone="amber" prompt="Tap each one once you've corrected it" />
    ),
  },
  {
    num: 8,
    title: 'Concept check questions',
    icon: ClipboardList,
    stripe: 'border-rose-500',
    iconWrap: 'bg-rose-100 text-rose-800',
    hasContent: (c) => c.conceptCheckQuestions.length > 0,
    render: (c) => (
      <SelfCheckList items={c.conceptCheckQuestions} tone="rose" prompt="Tap each once you've answered it" />
    ),
  },
  {
    num: 9,
    title: 'Key points to remember',
    icon: ListChecks,
    stripe: 'border-emerald-500',
    iconWrap: 'bg-emerald-100 text-emerald-800',
    hasContent: (c) => c.keyPoints.length > 0,
    render: (c) => (
      <div className="space-y-2">
        {c.keyPoints.map((point, i) => (
          <TapToMarkItem key={i} text={point} tone="emerald" markedStyle="strike" />
        ))}
      </div>
    ),
  },
  {
    num: 10,
    title: 'Exam tips',
    icon: GraduationCap,
    stripe: 'border-sky-500',
    iconWrap: 'bg-sky-100 text-sky-800',
    hasContent: (c) => !!c.examTips,
    render: (c) => (
      <ConceptProse
        text={c.examTips}
        className="rounded-lg bg-sky-50 border border-sky-100 px-3 py-2.5"
      />
    ),
  },
  {
    num: 11,
    title: 'Higher-order thinking question',
    icon: Brain,
    stripe: 'border-pink-500',
    iconWrap: 'bg-pink-100 text-pink-800',
    hasContent: (c) => !!c.hotsQuestion,
    render: (c) => (
      <ConceptProse
        text={c.hotsQuestion}
        className="font-medium border-l-4 border-pink-400 pl-3"
      />
    ),
  },
  {
    num: 12,
    title: 'Quick self-reflection prompt',
    icon: Sparkles,
    stripe: 'border-fuchsia-600',
    iconWrap: 'bg-fuchsia-50 text-fuchsia-900',
    hasContent: (c) => !!c.reflectionPrompt,
    render: (c) => (
      <ConceptProse
        text={c.reflectionPrompt}
        className="italic rounded-lg bg-fuchsia-50/80 px-3 py-2.5"
      />
    ),
  },
];

/** Step-by-step explanation — render full markdown so no sub-step is dropped. */
function ExplanationBody({ text }: { text: string }) {
  return (
    <ConceptProse
      text={text}
      className="[&_ol]:space-y-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-2"
    />
  );
}

function difficultyStyles(difficulty?: string) {
  switch (difficulty?.toLowerCase()) {
    case 'easy':
      return 'bg-emerald-600 text-white';
    case 'medium':
      return 'bg-amber-500 text-white';
    case 'hard':
      return 'bg-rose-600 text-white';
    default:
      return 'bg-slate-500 text-white';
  }
}

function ConceptTimelineStep({
  sectionNum,
  title,
  icon: Icon,
  children,
}: {
  sectionNum: number;
  title: string;
  icon: LucideIcon;
  dotClass?: string;
  isLast?: boolean;
  children: ReactNode;
}) {
  return (
    <AiToolStackedSection num={String(sectionNum)} title={title} icon={Icon}>
      {children}
    </AiToolStackedSection>
  );
}

function TeacherConceptCard({ concept }: { concept: NormalizedConcept }) {
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-fuchsia-200 bg-gradient-to-br from-fuchsia-50/90 via-white to-violet-50/40 px-4 py-3.5 sm:px-5">
        <p className="text-micro font-bold uppercase tracking-[0.2em] text-fuchsia-800/80 mb-1">
          Concept · Teaching reference
        </p>
        <h4 className="text-xl sm:text-2xl font-bold text-slate-900 leading-tight">
          {concept.conceptName}
        </h4>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {concept.difficulty ? (
            <span
              className={cn(
                'rounded-full px-2.5 py-0.5 text-micro font-bold uppercase tracking-wide',
                difficultyStyles(concept.difficulty),
              )}
            >
              {concept.difficulty}
            </span>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5">
        {CONCEPT_TEMPLATE_SECTIONS.filter((sec) => sec.hasContent(concept)).map((sec, idx) => (
          <ConceptTimelineStep
            key={sec.num}
            sectionNum={idx + 1}
            title={sec.title}
            icon={sec.icon}
          >
            {sec.render(concept)}
          </ConceptTimelineStep>
        ))}
      </div>
    </div>
  );
}

function TeacherMarkdownBody({ markdown }: { markdown: string }) {
  return (
    <div
      className="prose prose-base max-w-none rounded-xl border border-slate-200 bg-white/90 p-4 sm:p-5 shadow-sm prose-headings:font-serif prose-headings:text-slate-900 prose-p:text-slate-700 prose-li:text-slate-700"
      dangerouslySetInnerHTML={{ __html: renderMarkdown(markdown) }}
    />
  );
}

function TeacherConceptShell({ conceptCount, children }: { conceptCount: number; children: ReactNode }) {
  // Outer document chrome lives in AiToolDocumentShell (resolveInteractiveAiToolViewer).
  return (
    <div className="w-full space-y-5">
      {conceptCount > 1 ? (
        <p className="text-xs font-semibold text-violet-800">
          {conceptCount} concepts in this pack
        </p>
      ) : null}
      {children}
    </div>
  );
}

/** Student / legacy: flip-card explorer for quick review */
function FlipCardConceptView({ concepts }: { concepts: NormalizedConcept[] }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTurning, setIsTurning] = useState(false);
  const [direction, setDirection] = useState<'left' | 'right'>('right');

  const current = concepts[Math.min(currentIndex, concepts.length - 1)];
  const progress = ((currentIndex + 1) / concepts.length) * 100;

  const go = (dir: 'left' | 'right') => {
    if (isTurning) return;
    if (dir === 'left' && currentIndex === 0) return;
    if (dir === 'right' && currentIndex >= concepts.length - 1) return;
    setIsTurning(true);
    setDirection(dir);
    setTimeout(() => {
      setCurrentIndex((i) => (dir === 'right' ? i + 1 : i - 1));
      setIsTurning(false);
    }, 350);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') go('left');
      if (e.key === 'ArrowRight') go('right');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [currentIndex, isTurning, concepts.length]);

  return (
    <div className="flex flex-col items-center w-full max-w-4xl mx-auto py-4 space-y-4">
      <p className="text-xs text-slate-500 text-center">
        Use <kbd className="px-1.5 py-0.5 bg-slate-100 rounded text-micro font-mono">←</kbd>{' '}
        <kbd className="px-1.5 py-0.5 bg-slate-100 rounded text-micro font-mono">→</kbd> to browse concepts
      </p>

      <div className="w-full" style={{ perspective: '1200px' }}>
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={currentIndex}
            custom={direction}
            initial={{ rotateY: direction === 'right' ? 70 : -70, opacity: 0 }}
            animate={{ rotateY: 0, opacity: 1 }}
            exit={{ rotateY: direction === 'right' ? -70 : 70, opacity: 0 }}
            transition={{ duration: 0.35 }}
            className="rounded-2xl border border-cyan-200 bg-gradient-to-br from-cyan-50 to-white p-6 sm:p-8 shadow-lg min-h-[320px]"
          >
            <div className="flex items-start justify-between gap-2 mb-4">
              <h2 className="text-xl font-bold text-slate-900">{current.conceptName}</h2>
              {current.difficulty ? (
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-micro font-bold uppercase',
                    difficultyStyles(current.difficulty),
                  )}
                >
                  {current.difficulty}
                </span>
              ) : null}
            </div>
            <div className="space-y-4 max-h-[420px] overflow-y-auto text-base text-slate-700">
              {current.explanation ? (
                <div>
                  <h3 className="font-semibold text-indigo-700 mb-1">Explanation</h3>
                  <p className="whitespace-pre-wrap leading-relaxed">{current.explanation}</p>
                </div>
              ) : null}
              {current.realLifeExamples ? (
                <div>
                  <h3 className="font-semibold text-violet-700 mb-1">Real-life example</h3>
                  <p className="whitespace-pre-wrap leading-relaxed">{current.realLifeExamples}</p>
                </div>
              ) : null}
              {current.keyPoints.length > 0 ? (
                <div>
                  <h3 className="font-semibold text-emerald-700 mb-2">Key points</h3>
                  <div className="space-y-2">
                    {current.keyPoints.map((p, i) => (
                      <TapToMarkItem key={i} text={p} tone="emerald" markedStyle="strike" />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="flex items-center gap-3 w-full max-w-lg">
        <Button type="button" variant="outline" size="sm" onClick={() => go('left')} disabled={currentIndex === 0 || isTurning}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 h-2 rounded-full bg-slate-200 overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-cyan-500 to-violet-500"
            animate={{ width: `${progress}%` }}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => go('right')}
          disabled={currentIndex >= concepts.length - 1 || isTurning}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <p className="text-xs text-slate-500">
        Concept {currentIndex + 1} of {concepts.length}
      </p>
    </div>
  );
}

export function ConceptMasteryViewer({
  content,
  rawContent,
  className,
  variant = 'default',
}: ConceptMasteryViewerProps) {
  const parsedContent = useMemo(
    () => stripStructuredAiToolMetadata(String(content || '')),
    [content],
  );

  const markdownSource = useMemo(() => {
    const text = parsedContent.trim();
    if (!text) return '';
    try {
      const envelope = JSON.parse(text) as Record<string, unknown>;
      if (envelope.formatted != null) return String(envelope.formatted).trim();
      if (envelope.markdown != null) return String(envelope.markdown).trim();
    } catch {
      /* plain markdown */
    }
    return text;
  }, [parsedContent]);

  const resolved = useMemo(() => {
    const base = resolveConceptsFromPayload(parsedContent, rawContent);
    if (base.concepts.some(conceptHasVisibleContent)) return base;
    const reparsed = parseSingleConceptDocument(parsedContent);
    if (reparsed) {
      return { concepts: [reparsed], markdownFallback: null };
    }
    if (base.markdownFallback) {
      const fromMd = parseSingleConceptDocument(base.markdownFallback);
      if (fromMd) return { concepts: [fromMd], markdownFallback: null };
    }
    return base;
  }, [parsedContent, rawContent]);

  const [conceptIdx, setConceptIdx] = useState(0);

  const useTeacher = variant === 'teacher' || variant === 'default';
  const safeIdx = Math.min(
    conceptIdx,
    Math.max(0, resolved.concepts.length - 1),
  );
  const current = useMemo(() => {
    const c = resolved.concepts[safeIdx];
    if (!c) return c;
    let enriched = c;
    if (markdownSource) {
      enriched = fillConceptGapsFromMarkdown(enriched, markdownSource);
    }
    if (resolved.markdownFallback?.trim()) {
      enriched = fillConceptGapsFromMarkdown(enriched, resolved.markdownFallback);
    }
    if (conceptHasVisibleContent(enriched)) return enriched;
    const reparsed = parseSingleConceptDocument(markdownSource || parsedContent);
    if (reparsed) return reparsed;
    return enriched;
  }, [resolved.concepts, resolved.markdownFallback, safeIdx, markdownSource, parsedContent]);

  const useMarkdown =
    !!resolved.markdownFallback &&
    (!resolved.concepts.length || !resolved.concepts.some(conceptHasVisibleContent));

  const preferMarkdownBody = useMemo(() => {
    if (useMarkdown && resolved.markdownFallback?.trim()) return resolved.markdownFallback.trim();
    const md = markdownSource.trim();
    if (!md || countConceptMasterySectionHeaders(md) < 3) return null;
    if (current && shouldPreferConceptMasteryMarkdown(md, current)) return md;
    return null;
  }, [useMarkdown, resolved.markdownFallback, markdownSource, current]);

  if (preferMarkdownBody) {
    if (useTeacher) {
      return (
        <div className={className}>
          <TeacherConceptShell conceptCount={resolved.concepts.length || 1}>
            <TeacherMarkdownBody markdown={preferMarkdownBody} />
          </TeacherConceptShell>
        </div>
      );
    }
    return (
      <div className={cn('w-full', className)}>
        <div
          className="prose prose-base max-w-none rounded-xl border border-fuchsia-100 bg-white p-4 sm:p-5 shadow-sm"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(preferMarkdownBody) }}
        />
      </div>
    );
  }

  if (!resolved.concepts.length) {
    return (
      <div
        className={cn(
          'rounded-2xl border border-dashed border-fuchsia-300 bg-fuchsia-50/60 px-6 py-14 text-center',
          className,
        )}
      >
        <Brain className="mx-auto h-10 w-10 text-fuchsia-500/70 mb-3" aria-hidden />
        <p className="text-base font-medium text-stone-700">No concepts found for this selection</p>
        <p className="text-xs text-stone-500 mt-1">Try generating again or pick another topic.</p>
      </div>
    );
  }

  if (!useTeacher) {
    return (
      <div className={className}>
        <FlipCardConceptView concepts={resolved.concepts} />
      </div>
    );
  }

  return (
    <div className={className}>
      <TeacherConceptShell conceptCount={resolved.concepts.length}>
        {resolved.concepts.length > 1 ? (
          <div className="flex flex-wrap gap-2 mb-3">
            {resolved.concepts.map((c, i) => (
              <button
                key={`${c.conceptName}-${i}`}
                type="button"
                onClick={() => setConceptIdx(i)}
                className={cn(
                  'rounded-full px-4 py-1.5 text-xs font-bold transition-all max-w-full truncate',
                  i === safeIdx
                    ? 'bg-violet-900 text-fuchsia-50 shadow-md ring-2 ring-fuchsia-300/50'
                    : 'bg-white text-slate-800 border border-fuchsia-200 hover:bg-fuchsia-50/80',
                )}
                title={c.conceptName}
              >
                Concept {i + 1}: {c.conceptName}
              </button>
            ))}
          </div>
        ) : null}
        <AnimatePresence mode="wait">
          <motion.div
            key={safeIdx}
            className="h-fit"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
          >
            {current ? <TeacherConceptCard concept={current} /> : null}
          </motion.div>
        </AnimatePresence>
      </TeacherConceptShell>
    </div>
  );
}
