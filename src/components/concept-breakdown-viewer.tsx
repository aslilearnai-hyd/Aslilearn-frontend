import { AiToolStackedSection } from '@/components/ai-tool-stacked-section';
import ExamMathText from '@/components/exam/ExamMathText';
import { useMemo, type ReactNode } from 'react';
import { ToolSectionIcon } from '@/components/ai-tool-3d-icons';
import { AiToolPairedSectionColumns } from '@/lib/ai-tool-section-layout';
import {
  Brain,
  HelpCircle,
  Lightbulb,
  ListOrdered,
  MessageCircleQuestion,
  Sparkles,
  Tag,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { stripStructuredAiToolMetadata } from '@/lib/strip-ai-tool-metadata';
import {
  conceptBreakdownViewerPayloadFromRecord,
  resolveConceptBreakdownFromPayload,
  type ConceptBreakdownContent,
} from '@/lib/parse-concept-breakdown';
import { renderConceptBreakdownMarkdown } from '@/lib/render-concept-breakdown-markdown';
import {
  CheckableTimeline,
  ExpandableText,
  FlipCard,
  SelfCheckList,
  TapToMarkItem,
} from '@/components/ai-tool-interactive';

export { conceptBreakdownViewerPayloadFromRecord };

interface ConceptBreakdownViewerProps {
  content: string;
  rawContent?: unknown;
  className?: string;
}

function SectionCard({
  sectionNum,
  title,
  icon: Icon,
  children,
  className,
}: {
  sectionNum: string;
  title: string;
  icon: LucideIcon;
  stripe?: string;
  iconWrap?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <AiToolStackedSection num={sectionNum} title={title} icon={Icon} className={className}>
      {children}
    </AiToolStackedSection>
  );
}

function buildSections(concept: ConceptBreakdownContent): {
  leading: ReactNode[];
  compact: ReactNode[];
  trailing: ReactNode[];
} {
  type Slot = {
    key: string;
    group: 'leading' | 'compact' | 'trailing';
    title: string;
    icon: LucideIcon;
    stripe?: string;
    iconWrap?: string;
    hasContent: boolean;
    body: ReactNode;
  };

  const slots: Slot[] = [
    {
      key: 'def',
      group: 'leading',
      title: 'Simple Definition',
      icon: Brain,
      stripe: 'border-blue-500',
      iconWrap: 'bg-blue-100 text-blue-800',
      hasContent: !!concept.simpleDefinition.trim(),
      body: <ExpandableText text={concept.simpleDefinition} />,
    },
    {
      key: 'steps',
      group: 'leading',
      title: 'Step-by-step Concept Breakdown',
      icon: ListOrdered,
      stripe: 'border-indigo-500',
      iconWrap: 'bg-indigo-100 text-indigo-800',
      hasContent: concept.breakdownSteps.length > 0,
      body: <CheckableTimeline items={concept.breakdownSteps} tone="indigo" />,
    },
    {
      key: 'real',
      group: 'compact',
      title: 'Real-life and Indian Context Examples',
      icon: Lightbulb,
      stripe: 'border-emerald-500',
      iconWrap: 'bg-emerald-100 text-emerald-800',
      hasContent: concept.realLifeExamples.length > 0,
      body: (
        <div className="space-y-2">
          {concept.realLifeExamples.map((item, i) => (
            <TapToMarkItem key={i} text={item} tone="emerald" iconOff="lightbulb" iconOn="star" markedStyle="highlight" />
          ))}
        </div>
      ),
    },
    {
      key: 'terms',
      group: 'compact',
      title: 'Important Terms and Keywords',
      icon: Tag,
      stripe: 'border-amber-500',
      iconWrap: 'bg-amber-100 text-amber-900',
      hasContent: concept.importantTerms.length > 0,
      body: (
        <div className="grid gap-1.5 sm:grid-cols-2">
          {concept.importantTerms.map((term, i) => (
            <FlipCard
              key={`${term.term}-${i}`}
              tone="amber"
              front={
                <div className="flex flex-1 flex-col justify-center">
                  <p className="text-base font-semibold text-amber-900"><ExamMathText text={term.term} /></p>
                  <p className="mt-1 text-mini font-medium text-amber-600">Tap to flip ↻</p>
                </div>
              }
              back={<p className="text-base leading-relaxed"><ExamMathText text={term.definition || term.term} /></p>}
            />
          ))}
        </div>
      ),
    },
    {
      key: 'check',
      group: 'compact',
      title: 'Concept Check Questions',
      icon: HelpCircle,
      stripe: 'border-cyan-500',
      iconWrap: 'bg-cyan-100 text-cyan-800',
      hasContent: concept.conceptCheckQuestions.length > 0,
      body: (
        <SelfCheckList
          items={concept.conceptCheckQuestions}
          tone="cyan"
          prompt="Tap each question once you've answered it"
        />
      ),
    },
    {
      key: 'app',
      group: 'trailing',
      title: 'Application-based Thinking Question',
      icon: MessageCircleQuestion,
      stripe: 'border-orange-500',
      iconWrap: 'bg-orange-100 text-orange-800',
      hasContent: !!concept.applicationThinkingQuestion.trim(),
      body: (
        <div className="rounded-lg border border-orange-200 bg-gradient-to-br from-orange-50 to-amber-50/80 px-2.5 py-2">
          <ExpandableText text={concept.applicationThinkingQuestion} />
        </div>
      ),
    },
    {
      key: 'hots',
      group: 'trailing',
      title: 'Higher-order Thinking Prompt',
      icon: Zap,
      stripe: 'border-fuchsia-500',
      iconWrap: 'bg-fuchsia-100 text-fuchsia-800',
      hasContent: !!concept.higherOrderThinkingPrompt.trim(),
      body: (
        <div className="rounded-lg border border-fuchsia-200 bg-gradient-to-br from-fuchsia-50 to-violet-50/80 px-2.5 py-2">
          <ExpandableText text={concept.higherOrderThinkingPrompt} />
        </div>
      ),
    },
    {
      key: 'revision',
      group: 'trailing',
      title: 'Quick Revision Summary',
      icon: Sparkles,
      stripe: 'border-violet-600',
      iconWrap: 'bg-violet-100 text-violet-900',
      hasContent: !!concept.quickRevisionSummary.trim(),
      body: (
        <div className="rounded-lg border border-violet-200 bg-violet-50/60 px-2.5 py-2">
          <ExpandableText text={concept.quickRevisionSummary} />
        </div>
      ),
    },
  ];

  let n = 1; // title is section 1
  const renderSlot = (slot: Slot) => {
    n += 1;
    return (
      <SectionCard
        key={slot.key}
        sectionNum={`Section ${n}`}
        title={slot.title}
        icon={slot.icon}
        stripe={slot.stripe}
        iconWrap={slot.iconWrap}
      >
        {slot.body}
      </SectionCard>
    );
  };

  const visible = slots.filter((s) => s.hasContent);
  return {
    leading: visible.filter((s) => s.group === 'leading').map(renderSlot),
    compact: visible.filter((s) => s.group === 'compact').map(renderSlot),
    trailing: visible.filter((s) => s.group === 'trailing').map(renderSlot),
  };
}

function ConceptBreakdownPanel({
  concept,
  index,
  total,
}: {
  concept: ConceptBreakdownContent;
  index: number;
  total: number;
}) {
  const { leading, compact, trailing } = buildSections(concept);

  return (
    <div className={cn(total > 1 && index > 0 && 'mt-3 border-t border-violet-200/80 pt-3')}>
      {total > 1 ? (
        <Badge className="mb-2 border-0 bg-violet-100 text-violet-800 hover:bg-violet-100">
          Concept {index + 1} of {total}
        </Badge>
      ) : null}
      <div className="relative overflow-hidden rounded-xl border border-violet-200 bg-white shadow-sm">
        <div className="absolute inset-0 bg-gradient-to-br from-violet-50/90 via-white to-purple-50/40" />
        <div className="relative p-2.5 sm:p-3">
          <p className="mb-0.5 text-micro font-bold uppercase tracking-wider text-violet-700">
            Section 1
          </p>
          <Badge className="mb-1 border-0 bg-violet-100 text-violet-900 hover:bg-violet-100 text-xs">
            Concept Title
          </Badge>
          <h4 className="text-lg font-bold leading-snug text-slate-900 sm:text-xl">
            {concept.conceptTitle}
          </h4>
        </div>
      </div>
      <div className="mt-0.5 flex flex-col gap-0.5">
        {[...leading, ...trailing].length === 0 && compact.length === 0 ? null : (
          <>
            {leading.map((section) => (
              <div key={(section as { key?: string }).key} className="w-full min-w-0">
                {section}
              </div>
            ))}
            {compact.length > 0 ? <AiToolPairedSectionColumns>{compact}</AiToolPairedSectionColumns> : null}
            {trailing.map((section) => (
              <div key={(section as { key?: string }).key} className="w-full min-w-0">
                {section}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

export function ConceptBreakdownViewer({ content, rawContent, className }: ConceptBreakdownViewerProps) {
  const payload = useMemo(() => {
    if (rawContent != null) return { content: String(content || '').trim(), rawContent };
    return conceptBreakdownViewerPayloadFromRecord({ generatedContent: content });
  }, [content, rawContent]);

  const { concepts, markdownFallback } = useMemo(() => {
    const text = stripStructuredAiToolMetadata(payload.content);
    return resolveConceptBreakdownFromPayload(text, payload.rawContent);
  }, [payload.content, payload.rawContent]);

  if (markdownFallback) {
    return (
      <div
        className={cn('w-full', className)}
        dangerouslySetInnerHTML={{ __html: renderConceptBreakdownMarkdown(markdownFallback) }}
      />
    );
  }

  const primary = concepts[0];
  const stepCount = primary?.breakdownSteps.length ?? 0;
  const termCount = primary?.importantTerms.length ?? 0;

  return (
    <div className={cn('w-full space-y-5', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="border-0 bg-violet-100 text-violet-900 hover:bg-violet-100 text-xs font-semibold">
          {concepts.length} concept{concepts.length !== 1 ? 's' : ''}
        </Badge>
        {stepCount > 0 ? (
          <Badge className="border-0 bg-purple-100 text-purple-900 hover:bg-purple-100 text-xs font-semibold">
            {stepCount} steps
          </Badge>
        ) : null}
        {termCount > 0 ? (
          <Badge className="border-0 bg-indigo-100 text-indigo-900 hover:bg-indigo-100 text-xs font-semibold">
            {termCount} terms
          </Badge>
        ) : null}
      </div>

      <div className="flex flex-col gap-4">
        {concepts.map((concept, i) => (
          <ConceptBreakdownPanel
            key={`${concept.conceptTitle}-${i}`}
            concept={concept}
            index={i}
            total={concepts.length}
          />
        ))}
      </div>
    </div>
  );
}
