import { AiToolStackedSection } from '@/components/ai-tool-stacked-section';
import { QuestionFigure } from '@/components/ai-tools/QuestionFigure';
import { MatchFollowingCard } from '@/components/ai-tools/MatchFollowingCard';
import { useMemo, useState, type ReactNode } from 'react';
import {
  BookOpen,
  Brain,
  ClipboardList,
  Eye,
  EyeOff,
  HelpCircle,
  Lightbulb,
  ListChecks,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { displayQuestionSerial } from '@/lib/renumber-questions';
import { stripMarkdownSyntax } from '@/lib/strip-markdown-syntax';
import { isMatchQuestionType } from '@/lib/match-following';
import { stripStructuredAiToolMetadata } from '@/lib/strip-ai-tool-metadata';
import {
  homeworkHasVisibleContent,
  resolveHomeworkFromPayload,
  type NormalizedHomework,
  type HomeworkPracticeQuestion,
} from '@/lib/parse-homework-creator';
import { StructuredContentRequired } from '@/components/structured-content-required';
import { ExpandableText, SelfCheckList, TapToRevealCard } from '@/components/ai-tool-interactive';
import { reconcileInstructionCounts } from '@/lib/reconcile-instructions';

export interface HomeworkCreatorViewerProps {
  content: string;
  rawContent?: unknown;
  className?: string;
}

type SectionDef = {
  num: number;
  label: string;
  icon: LucideIcon;
  stripe: string;
  iconWrap: string;
  hasContent: (h: NormalizedHomework) => boolean;
  render: (h: NormalizedHomework) => ReactNode;
};

const HOMEWORK_SECTIONS: SectionDef[] = [
  {
    num: 2,
    label: 'Clear Student Instructions',
    icon: BookOpen,
    stripe: 'border-orange-500',
    iconWrap: 'bg-orange-100 text-orange-900',
    hasContent: (h) => !!h.instructions,
    render: (h) => (
      <ExpandableText
        text={reconcileInstructionCounts(stripMarkdownSyntax(h.instructions), { total: h.practiceQuestions.length })}
      />
    ),
  },
  {
    num: 3,
    label: 'Practice Questions',
    icon: ListChecks,
    stripe: 'border-amber-500',
    iconWrap: 'bg-amber-100 text-amber-900',
    hasContent: (h) => h.practiceQuestions.length > 0,
    render: (h) => <PracticeQuestionList questions={h.practiceQuestions} />,
  },
  {
    num: 4,
    label: 'Application-based Tasks',
    icon: Lightbulb,
    stripe: 'border-yellow-500',
    iconWrap: 'bg-yellow-100 text-yellow-900',
    hasContent: (h) => h.applicationTasks.length > 0,
    render: (h) => (
      <SelfCheckList
        items={h.applicationTasks.map((t) => stripMarkdownSyntax(t))}
        tone="amber"
        prompt="Tap each task once it's done"
      />
    ),
  },
  {
    num: 5,
    label: 'One Creative / Thinking Question',
    icon: Brain,
    stripe: 'border-violet-500',
    iconWrap: 'bg-violet-100 text-violet-900',
    hasContent: (h) => !!h.creativeThinkingQuestion,
    render: (h) => <ExpandableText text={stripMarkdownSyntax(h.creativeThinkingQuestion)} />,
  },
  {
    num: 6,
    label: 'One Real-life Observation Task',
    icon: Eye,
    stripe: 'border-cyan-500',
    iconWrap: 'bg-cyan-100 text-cyan-900',
    hasContent: (h) => !!h.realLifeObservationTask,
    render: (h) => <ExpandableText text={stripMarkdownSyntax(h.realLifeObservationTask)} />,
  },
  {
    num: 7,
    label: 'Challenge Question',
    icon: Sparkles,
    stripe: 'border-rose-500',
    iconWrap: 'bg-rose-100 text-rose-900',
    hasContent: (h) => !!h.challengeQuestion,
    render: (h) => <ExpandableText text={stripMarkdownSyntax(h.challengeQuestion)} />,
  },
  {
    num: 8,
    label: 'Support Hint for Struggling Learners',
    icon: HelpCircle,
    stripe: 'border-teal-500',
    iconWrap: 'bg-teal-100 text-teal-900',
    hasContent: (h) => !!h.supportHint,
    render: (h) => (
      <TapToRevealCard prompt="Stuck? Tap for a hint" detail={stripMarkdownSyntax(h.supportHint)} tone="teal" revealLabel="Show hint" />
    ),
  },
  {
    num: 9,
    label: 'Answer Hints / Key Points',
    icon: ClipboardList,
    stripe: 'border-emerald-500',
    iconWrap: 'bg-emerald-100 text-emerald-900',
    hasContent: (h) => !!h.answerHints,
    render: (h) => (
      <TapToRevealCard prompt="Check your answers" detail={stripMarkdownSyntax(h.answerHints)} tone="emerald" revealLabel="Show key points" />
    ),
  },
  {
    num: 10,
    label: 'Parent Note',
    icon: Users,
    stripe: 'border-indigo-500',
    iconWrap: 'bg-indigo-100 text-indigo-900',
    hasContent: (h) => !!h.parentNote,
    render: (h) => <ExpandableText text={stripMarkdownSyntax(h.parentNote)} />,
  },
];

function PracticeQuestionList({ questions }: { questions: HomeworkPracticeQuestion[] }) {
  return (
    <div className="space-y-3">
      {questions.map((q, i) => {
        const num = displayQuestionSerial(i);
        const isMatch =
          isMatchQuestionType(q.type) ||
          (Array.isArray(q.matchPairs) && q.matchPairs.length >= 2);
        if (isMatch && q.matchPairs && q.matchPairs.length >= 2) {
          return (
            <div key={i} className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-orange-600 text-xs font-bold text-white">
                  {num}
                </span>
                {q.marks != null ? (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-mini font-medium text-slate-700">
                    {q.marks} marks
                  </span>
                ) : null}
              </div>
              <MatchFollowingCard question={q.question} matchPairs={q.matchPairs} showAnswer />
            </div>
          );
        }
        return <HomeworkQuestionCard key={i} q={q} num={num} />;
      })}
    </div>
  );
}

function HomeworkQuestionCard({ q, num }: { q: HomeworkPracticeQuestion; num: number | string }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-sm space-y-2">
      <p className="text-base font-medium text-slate-900 whitespace-pre-wrap leading-relaxed">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-orange-600 text-xs font-bold text-white mr-2">
          {num}
        </span>
        {stripMarkdownSyntax(q.question)}
      </p>
      <QuestionFigure imageUrl={q.imageUrl} alt={`Figure for question ${num}`} className="ml-8" />
      {(q.type || q.marks != null) ? (
        <div className="pl-8 flex flex-wrap gap-2">
          {q.type ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-mini font-medium text-amber-900">
              {q.type}
            </span>
          ) : null}
          {q.marks != null ? (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-mini font-medium text-slate-700">
              {q.marks} marks
            </span>
          ) : null}
        </div>
      ) : null}
      {q.options.length > 0 ? (
        <ul className="grid gap-2 sm:grid-cols-2 pl-8">
          {q.options.map((opt, j) => (
            <li key={j} className="text-base text-slate-700 rounded-lg bg-slate-50 px-2 py-1.5 whitespace-pre-wrap">
              {opt}
            </li>
          ))}
        </ul>
      ) : null}
      {q.answer || q.explanation ? (
        <div className="pl-8">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 rounded-md border-orange-200 bg-white px-2 text-micro"
            onClick={() => setRevealed((v) => !v)}
          >
            {revealed ? <EyeOff className="mr-1 h-3.5 w-3.5" /> : <Eye className="mr-1 h-3.5 w-3.5" />}
            {revealed ? 'Hide answer' : 'Reveal answer'}
          </Button>
          {revealed ? (
            <div className="mt-1.5 space-y-1">
              {q.answer ? (
                <p className="text-base text-emerald-800">
                  <span className="font-semibold">Answer:</span> {q.answer}
                </p>
              ) : null}
              {q.explanation ? (
                <p className="text-base text-indigo-800 whitespace-pre-wrap">
                  <span className="font-semibold">Explanation:</span> {q.explanation}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SectionCard({
  sectionNum,
  label,
  icon: Icon,
  children,
}: {
  sectionNum: string;
  label: string;
  icon: LucideIcon;
  stripe?: string;
  iconWrap?: string;
  children: ReactNode;
}) {
  return (
    <AiToolStackedSection num={sectionNum} title={label} icon={Icon}>
      {children}
    </AiToolStackedSection>
  );
}

export function HomeworkCreatorViewer({ content, rawContent, className }: HomeworkCreatorViewerProps) {
  const parsedContent = useMemo(
    () => stripStructuredAiToolMetadata(String(content || '')),
    [content],
  );

  const resolved = useMemo(
    () => resolveHomeworkFromPayload(parsedContent, rawContent),
    [parsedContent, rawContent],
  );

  const homework = resolved.homework;

  if (!homework || !homeworkHasVisibleContent(homework)) {
    const fallbackText = String(parsedContent || '').trim();
    if (fallbackText.length > 40) {
      return (
        <div className={cn('space-y-3', className)}>
          <StructuredContentRequired toolLabel="Homework Creator" />
          <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-800">
            {fallbackText}
          </pre>
        </div>
      );
    }
    return <StructuredContentRequired className={className} toolLabel="Homework Creator" />;
  }

  const visibleSections = HOMEWORK_SECTIONS.filter((s) => s.hasContent(homework));

  return (
    <div className={cn('space-y-5', className)}>
      <p className="text-xs font-medium text-slate-400">
        {homework.practiceQuestions.length} practice question{homework.practiceQuestions.length === 1 ? '' : 's'}
      </p>

      <div className="space-y-3">
        {visibleSections.map((sec, i) => (
          <div key={sec.num}>
            <SectionCard
              sectionNum={`${i + 1}`}
              label={sec.label}
              icon={sec.icon}
              stripe={sec.stripe}
              iconWrap={sec.iconWrap}
            >
              {sec.render(homework)}
            </SectionCard>
          </div>
        ))}
      </div>

    </div>
  );
}
