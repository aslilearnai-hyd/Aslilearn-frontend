import { cleanAnswerKeyText } from '@/lib/answer-key-text';
import { AiToolStackedSection } from '@/components/ai-tool-stacked-section';
import { QuestionFigure } from '@/components/ai-tools/QuestionFigure';
import { MatchFollowingCard } from '@/components/ai-tools/MatchFollowingCard';
import {
  AiToolV2InsightTail,
  parseBloomLevelsFromQuestionTags,
} from '@/components/ai-v2';
import { useMemo, useState, type ReactNode } from 'react';
import { ToolSectionIcon } from '@/components/ai-tool-3d-icons';
import { AiToolPairedSectionColumns } from '@/lib/ai-tool-section-layout';
import {
  BookOpen,
  CircleCheck,
  ClipboardList,
  Eye,
  EyeOff,
  FileQuestion,
  HelpCircle,
  KeyRound,
  ListChecks,
  Sparkles,
  Target,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ExpandableText, SelfCheckList } from '@/components/ai-tool-interactive';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { displayQuestionSerial } from '@/lib/renumber-questions';
import { stripStructuredAiToolMetadata } from '@/lib/strip-ai-tool-metadata';
import { isMatchQuestionType } from '@/lib/match-following';
import {
  countPracticeQaQuestions,
  practiceQaViewerPayloadFromRecord,
  PRACTICE_QA_REAL_LIFE_SECTION,
  resolvePracticeQaFromPayload,
  type NormalizedPracticeQa,
  type PracticeQaQuestion,
  type PracticeQaSection,
} from '@/lib/parse-practice-qa';
import { renderPracticeQaMarkdown } from '@/lib/render-practice-qa-markdown';

export { practiceQaViewerPayloadFromRecord };

interface PracticeQaViewerProps {
  content: string;
  rawContent?: unknown;
  className?: string;
}

const SECTION_VISUAL: Record<
  string,
  { icon: LucideIcon; stripe: string; iconWrap: string; badge: string }
> = {
  'Section A: MCQs': {
    icon: ListChecks,
    stripe: 'border-emerald-500',
    iconWrap: 'bg-emerald-100 text-emerald-800',
    badge: 'bg-emerald-100 text-emerald-800',
  },
  'Section B: Fill in the Blanks': {
    icon: ClipboardList,
    stripe: 'border-teal-500',
    iconWrap: 'bg-teal-100 text-teal-800',
    badge: 'bg-teal-100 text-teal-800',
  },
  'Section C: True or False': {
    icon: Target,
    stripe: 'border-cyan-500',
    iconWrap: 'bg-cyan-100 text-cyan-800',
    badge: 'bg-cyan-100 text-cyan-800',
  },
  'Section D: Very Short Answer Questions': {
    icon: FileQuestion,
    stripe: 'border-sky-500',
    iconWrap: 'bg-sky-100 text-sky-800',
    badge: 'bg-sky-100 text-sky-800',
  },
  'Section E: Short Answer Questions': {
    icon: BookOpen,
    stripe: 'border-blue-500',
    iconWrap: 'bg-blue-100 text-blue-800',
    badge: 'bg-blue-100 text-blue-800',
  },
  'Section F: Application / Case-based Questions': {
    icon: Sparkles,
    stripe: 'border-orange-500',
    iconWrap: 'bg-orange-100 text-orange-800',
    badge: 'bg-orange-100 text-orange-800',
  },
  'Section G: HOTS / Analytical Questions': {
    icon: Zap,
    stripe: 'border-fuchsia-500',
    iconWrap: 'bg-fuchsia-100 text-fuchsia-800',
    badge: 'bg-fuchsia-100 text-fuchsia-800',
  },
  [PRACTICE_QA_REAL_LIFE_SECTION]: {
    icon: Sparkles,
    stripe: 'border-green-600',
    iconWrap: 'bg-green-100 text-green-900',
    badge: 'bg-green-100 text-green-900',
  },
};

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

function QuestionCard({ q, index }: { q: PracticeQaQuestion; index: number }) {
  const [revealed, setRevealed] = useState(false);
  const num = displayQuestionSerial(index);
  const isMatch =
    isMatchQuestionType(q.type) || (Array.isArray(q.matchPairs) && q.matchPairs.length >= 2);
  if (isMatch && q.matchPairs && q.matchPairs.length >= 2) {
    return (
      <article className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 px-0.5">
          <span className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-md bg-emerald-600 px-1.5 text-micro font-bold text-white">
            Q{num}
          </span>
          {q.marks != null ? (
            <Badge className="border-0 bg-amber-100 text-amber-900 text-micro hover:bg-amber-100">
              {q.marks} mark{q.marks === 1 ? '' : 's'}
            </Badge>
          ) : null}
        </div>
        <MatchFollowingCard question={q.question} matchPairs={q.matchPairs} showAnswer />
      </article>
    );
  }
  const isMcq = q.options.length >= 2;
  const visual = q.section ? SECTION_VISUAL[q.section] : null;

  return (
    <article className="rounded-lg border border-emerald-100 bg-gradient-to-br from-white to-emerald-50/30 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-md bg-emerald-600 px-1.5 text-micro font-bold text-white">
          Q{num}
        </span>
        {q.type ? (
          <Badge variant="outline" className="border-0 text-micro font-semibold bg-slate-100 text-slate-700">
            {q.type}
          </Badge>
        ) : isMcq ? (
          <Badge className={cn('border-0 text-micro font-semibold', visual?.badge || 'bg-emerald-100 text-emerald-800')}>
            MCQ
          </Badge>
        ) : null}
        {q.marks != null ? (
          <Badge className="border-0 bg-amber-100 text-amber-900 text-micro hover:bg-amber-100">
            {q.marks} mark{q.marks === 1 ? '' : 's'}
          </Badge>
        ) : null}
        {q.bloomLevel ? (
          <Badge variant="outline" className="text-micro border-violet-200 text-violet-700">
            {q.bloomLevel}
          </Badge>
        ) : null}
        {q.difficultyTag ? (
          <Badge variant="outline" className="text-micro border-slate-200 text-slate-600">
            {q.difficultyTag}
          </Badge>
        ) : null}
      </div>
      <p className="text-base font-medium leading-snug text-slate-900">{q.question}</p>
      <QuestionFigure imageUrl={q.imageUrl} alt="Practice question figure" />
      {isMcq ? (
        <ul className="mt-2 grid gap-2 md:grid-cols-2">
          {q.options.map((opt, i) => {
            const label = opt.match(/^([A-D])\)/i)?.[1]?.toUpperCase() || String.fromCharCode(65 + i);
            const text = opt.replace(/^[A-D]\)\s*/i, '').trim();
            return (
              <li
                key={`${opt}-${i}`}
                className="flex gap-2 rounded-md border border-slate-200/80 bg-white px-2.5 py-1.5 text-base text-slate-700"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800">
                  {label}
                </span>
                <span className="min-w-0 flex-1 pt-0.5">{text}</span>
              </li>
            );
          })}
        </ul>
      ) : null}
      {q.answer || q.explanation ? (
        <div className="mt-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 rounded-md border-emerald-200 bg-white px-2 text-micro"
            onClick={() => setRevealed((v) => !v)}
          >
            {revealed ? <EyeOff className="mr-1 h-3.5 w-3.5" /> : <Eye className="mr-1 h-3.5 w-3.5" />}
            {revealed ? 'Hide answer' : 'Reveal answer'}
          </Button>
          {revealed ? (
            <div className="mt-1.5 space-y-1.5">
              {q.answer ? (
                <p className="flex items-start gap-1.5 rounded-md bg-emerald-50 px-2 py-1.5 text-xs text-emerald-800 border border-emerald-100">
                  <CircleCheck className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
                  <span>
                    <span className="font-semibold">Answer:</span> {q.answer}
                  </span>
                </p>
              ) : null}
              {q.explanation ? (
                <p className="rounded-md bg-slate-50 px-2 py-1.5 text-xs text-slate-600 border border-slate-100">
                  <span className="font-semibold text-slate-700">Explanation:</span> {q.explanation}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function SectionQuestionsBlock({
  sec,
  sectionNum,
}: {
  sec: PracticeQaSection;
  sectionNum: string;
}) {
  const visual = SECTION_VISUAL[sec.label] || SECTION_VISUAL['Section A: MCQs'];
  const Icon = visual.icon;
  const shortTitle = sec.label.replace(/^Section [A-G]:\s*/i, '');

  if (!sec.questions.length) return null;

  return (
    <SectionCard
      sectionNum={sectionNum}
      title={shortTitle}
      icon={Icon}
      stripe={visual.stripe}
      iconWrap={visual.iconWrap}
      className="sm:col-span-2"
    >
      <div className="space-y-2">
        {sec.questions.map((q, i) => (
          <QuestionCard key={`${sec.id}-q-${i}`} q={q} index={i} />
        ))}
      </div>
    </SectionCard>
  );
}

function PracticeQaBody({
  practice,
  rawContent,
}: {
  practice: NormalizedPracticeQa;
  rawContent?: unknown;
}) {
  let nextNum = 2;
  const setupSections: ReactNode[] = [];
  if (practice.learningObjectives.length > 0) {
    const n = nextNum++;
    setupSections.push(
      <SectionCard
        key="lo"
        sectionNum={`Section ${n}`}
        title="Learning Objectives"
        icon={Target}
        stripe="border-teal-500"
        iconWrap="bg-teal-100 text-teal-800"
      >
        <SelfCheckList items={practice.learningObjectives} tone="teal" />
      </SectionCard>,
    );
  }
  if (practice.instructions) {
    const n = nextNum++;
    setupSections.push(
      <SectionCard
        key="inst"
        sectionNum={`Section ${n}`}
        title="Instructions to Students"
        icon={BookOpen}
        stripe="border-green-500"
        iconWrap="bg-green-100 text-green-800"
      >
        <ExpandableText text={practice.instructions} />
      </SectionCard>,
    );
  }

  const questionSections = practice.sections
    .filter((sec) => sec.questions.length > 0)
    .map((sec) => {
      const n = nextNum++;
      return <SectionQuestionsBlock key={sec.id} sec={sec} sectionNum={`Section ${n}`} />;
    });

  const realLifeBlock =
    practice.realLifeQuestions.length > 0 ? (
      <SectionCard
        sectionNum={`Section ${nextNum++}`}
        title="Problem-solving Questions"
        icon={Sparkles}
        stripe="border-green-600"
        iconWrap="bg-green-100 text-green-900"
        className="sm:col-span-2"
      >
        <div className="space-y-2">
          {practice.realLifeQuestions.map((q, i) => (
            <QuestionCard key={`rl-${i}`} q={q} index={i} />
          ))}
        </div>
      </SectionCard>
    ) : null;

  const allQuestions = [
    ...practice.sections.flatMap((s) => s.questions),
    ...practice.realLifeQuestions,
  ];
  const filledSections = practice.sections.filter((s) => s.questions.length > 0).length;
  const mcqCount = allQuestions.filter((q) => q.options.length >= 2).length;

  return (
    <div className="mt-1 flex flex-col gap-2">
      {setupSections.length > 0 ? (
        <AiToolPairedSectionColumns gap="gap-2">{setupSections}</AiToolPairedSectionColumns>
      ) : null}
      <div className="grid grid-cols-1 gap-2">{questionSections}</div>
      {realLifeBlock}
      {practice.answerKey ? (
        <SectionCard
          sectionNum={`Section ${nextNum++}`}
          title="Answer Key with Explanations"
          icon={KeyRound}
          stripe="border-emerald-600"
          iconWrap="bg-emerald-100 text-emerald-900"
          className="sm:col-span-2"
        >
          <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 px-2.5 py-2">
            <ExpandableText text={cleanAnswerKeyText(practice.answerKey)} />
          </div>
        </SectionCard>
      ) : null}

      <AiToolV2InsightTail
        rawContent={rawContent}
        startNum={nextNum}
        includeOverview
        overviewStats={[
          { label: 'Questions', value: String(allQuestions.length) },
          { label: 'Sections filled', value: String(filledSections) },
          { label: 'MCQs', value: mcqCount > 0 ? String(mcqCount) : '' },
        ].filter((s) => s.value)}
        bloomRows={parseBloomLevelsFromQuestionTags(allQuestions)}
        bloomFromObjectives={practice.learningObjectives}
        competencyItems={practice.learningObjectives}
        bestPracticesText="Use Section A–G as a progressive drill: MCQs for recall, blanks for precision, true/false for quick checks, and HOTS for exam readiness. Reveal the answer key only after students attempt each block."
      />
    </div>
  );
}

export function PracticeQaViewer({ content, rawContent, className }: PracticeQaViewerProps) {
  const payload = useMemo(() => {
    if (rawContent != null) return { content: String(content || '').trim(), rawContent };
    return practiceQaViewerPayloadFromRecord({ generatedContent: content });
  }, [content, rawContent]);

  const { practice, markdownFallback } = useMemo(() => {
    const text = stripStructuredAiToolMetadata(payload.content);
    return resolvePracticeQaFromPayload(text, payload.rawContent);
  }, [payload.content, payload.rawContent]);

  if (markdownFallback) {
    return (
      <div
        className={cn('w-full', className)}
        dangerouslySetInnerHTML={{ __html: renderPracticeQaMarkdown(markdownFallback) }}
      />
    );
  }

  if (!practice) {
    return (
      <p className={cn('text-sm italic text-slate-500', className)}>No practice content to display.</p>
    );
  }

  const totalQs = countPracticeQaQuestions(practice);
  const mcqCount = practice.sections
    .find((s) => s.label.includes('MCQ'))
    ?.questions.filter((q) => q.options.length >= 2).length ?? 0;

  return (
    <div className={cn('w-full min-w-0 space-y-5', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="border-0 bg-emerald-100 text-emerald-900 hover:bg-emerald-100 text-xs font-semibold">
          {totalQs} question{totalQs !== 1 ? 's' : ''}
        </Badge>
        {mcqCount > 0 ? (
          <Badge className="border-0 bg-teal-100 text-teal-900 hover:bg-teal-100 text-xs font-semibold">
            {mcqCount} MCQs
          </Badge>
        ) : null}
        {practice.sections.filter((s) => s.questions.length > 0).length > 0 ? (
          <Badge className="border-0 bg-green-100 text-green-900 hover:bg-green-100 text-xs font-semibold">
            {practice.sections.filter((s) => s.questions.length > 0).length} sections
          </Badge>
        ) : null}
      </div>

      <PracticeQaBody practice={practice} rawContent={payload.rawContent} />
    </div>
  );
}
