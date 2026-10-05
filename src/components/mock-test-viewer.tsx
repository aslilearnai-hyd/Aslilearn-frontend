import { AiToolStackedSection } from '@/components/ai-tool-stacked-section';
import { useMemo, useState, type ReactNode } from 'react';
import { AiToolMockTestSectionLayout } from '@/lib/ai-tool-section-layout';
import {
  BookOpen,
  Brain,
  CheckCircle2,
  ClipboardList,
  Eye,
  EyeOff,
  FileQuestion,
  GraduationCap,
  Lightbulb,
  ListChecks,
  MessageCircle,
  Sparkles,
  Target,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExpandableText, SelfCheckList } from '@/components/ai-tool-interactive';
import { cn } from '@/lib/utils';
import { displayQuestionSerial } from '@/lib/renumber-questions';
import { renderMarkdown } from '@/lib/render-teacher-markdown';
import { renderMockTestMarkdown } from '@/lib/render-mock-test-markdown';
import ExamMathText from '@/components/exam/ExamMathText';
import { stripStructuredAiToolMetadata } from '@/lib/strip-ai-tool-metadata';
import {
  extractInlineMcqFromQuestionText,
  formatLabeledMcqOptions,
  buildBloomDistributionFromExamSections,
  type ExamQuestion,
  type ExamSection,
} from '@/lib/parse-exam-question-paper';
import { AiToolV2InsightTail } from '@/components/ai-v2';
import {
  mockTestViewerPayloadFromRecord,
  parseNumberedMarkdownSections,
  resolveMockTestFromPayload,
  synthesizeAnswerKeyFromSections,
  synthesizeSolutionsFromSections,
} from '@/lib/parse-mock-test';

export { mockTestViewerPayloadFromRecord };

interface MockTestViewerProps {
  content: string;
  rawContent?: unknown;
  className?: string;
}

function MockSectionCard({
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

function RichTextBlock({ text, className }: { text: string; className?: string }) {
  if (!text.trim()) return null;
  const hasMarkdown =
    text.includes('|') ||
    text.includes('$') ||
    /^\s*#{1,6}\s/m.test(text) ||
    /\*\*[^*]+\*\*/.test(text) ||
    /^\s*[-*•]\s/m.test(text) ||
    /^\s*\d+\.\s/m.test(text);
  if (hasMarkdown) {
    return (
      <div
        className={cn(
          'prose prose-base max-w-none text-slate-800',
          'prose-table:w-full prose-table:border-collapse prose-th:border prose-th:border-amber-200 prose-th:bg-amber-50/90 prose-th:px-2 prose-th:py-1.5 prose-th:text-left prose-th:text-base prose-th:font-semibold',
          'prose-td:border prose-td:border-amber-100 prose-td:px-2 prose-td:py-1.5 prose-td:text-base prose-td:align-top',
          'prose-ol:my-1 prose-ul:my-1 prose-li:text-base',
          className,
        )}
        dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }}
      />
    );
  }
  return <p className="whitespace-pre-wrap text-base leading-relaxed text-slate-800">{text}</p>;
}

/** Hide markdown-rich content (answer keys, solutions) until the student taps to reveal. */
function RevealBlock({ text, label }: { text: string; label: string }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div>
      <Button type="button" size="sm" variant="outline" onClick={() => setRevealed((v) => !v)}>
        {revealed ? <EyeOff className="mr-1.5 h-3.5 w-3.5" /> : <Eye className="mr-1.5 h-3.5 w-3.5" />}
        {revealed ? `Hide ${label.toLowerCase()}` : `Reveal ${label.toLowerCase()}`}
      </Button>
      {revealed ? (
        <div className="mt-3">
          <RichTextBlock text={text} />
        </div>
      ) : null}
    </div>
  );
}

function QuestionCard({
  question,
  index,
  showAnswer,
}: {
  question: ExamQuestion;
  index: number;
  showAnswer: boolean;
}) {
  const qNo = String(displayQuestionSerial(index));
  const inline =
    question.options.length < 2 ? extractInlineMcqFromQuestionText(question.question) : null;
  const questionText =
    inline && inline.options.length >= 2 ? inline.question : question.question;
  const displayOptions =
    question.options.length >= 2
      ? formatLabeledMcqOptions(question.options)
      : inline && inline.options.length >= 2
        ? inline.options
        : question.options;
  return (
    <article className="rounded-lg border border-rose-100 bg-gradient-to-br from-white to-rose-50/30 p-3">
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <p className="text-base font-semibold text-slate-900">
          <span className="mr-1.5 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded bg-rose-600 px-1 text-micro font-bold text-white">
            {qNo}
          </span>
          <ExamMathText text={questionText} />
        </p>
        {question.marks != null ? (
          <Badge className="shrink-0 border-0 bg-rose-100 text-rose-800 hover:bg-rose-100">
            {question.marks} m
          </Badge>
        ) : null}
      </div>
      {displayOptions.length > 0 ? (
        <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {displayOptions.map((opt, i) => {
            const label = opt.match(/^([A-D])\)/i)?.[1]?.toUpperCase() || String.fromCharCode(65 + i);
            const text = opt.replace(/^[A-D]\)\s*/i, '').trim();
            return (
              <li
                key={`${opt}-${i}`}
                className="flex gap-2 rounded-md border border-slate-200/80 bg-white px-2.5 py-1.5 text-base text-slate-700"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-100 text-xs font-bold text-rose-800">
                  {label}
                </span>
                <span className="min-w-0 flex-1 pt-0.5"><ExamMathText text={text} /></span>
              </li>
            );
          })}
        </ul>
      ) : null}
      {showAnswer && question.answer ? (
        <p className="mt-2 rounded-md bg-emerald-50 px-2 py-1 text-xs text-emerald-800">
          <span className="font-semibold">Answer:</span> <ExamMathText text={question.answer} />
        </p>
      ) : null}
      {question.internalChoiceGroup ? (
        <p className="mt-1.5 text-mini text-indigo-700">
          <span className="font-semibold">OR / Choice:</span> <ExamMathText text={question.internalChoiceGroup} />
        </p>
      ) : null}
    </article>
  );
}

function ExamSectionBlock({ section, showAnswers }: { section: ExamSection; showAnswers: boolean }) {
  return (
    <div className="rounded-xl border border-rose-200/80 bg-white/90 p-3">
      <div className="mb-2 flex items-center justify-between gap-2 border-b border-rose-100 pb-2">
        <h5 className="text-base font-bold text-rose-900">{section.title}</h5>
        <Badge variant="outline" className="border-rose-200 text-rose-700">
          {section.questions.length} Q
        </Badge>
      </div>
      {section.questions.length > 0 ? (
        <div className="space-y-2">
          {section.questions.map((q, idx) => (
            <QuestionCard key={`${section.id}-${idx}`} question={q} index={idx} showAnswer={showAnswers} />
          ))}
        </div>
      ) : (
        <p className="text-xs italic text-stone-400">No questions in this section.</p>
      )}
    </div>
  );
}

export function MockTestViewer({ content, rawContent, className }: MockTestViewerProps) {
  const payload = useMemo(() => {
    if (rawContent != null) {
      return { content: String(content || '').trim(), rawContent };
    }
    return mockTestViewerPayloadFromRecord({ generatedContent: content });
  }, [content, rawContent]);

  const parsed = useMemo(() => {
    const text = stripStructuredAiToolMetadata(payload.content);
    return resolveMockTestFromPayload(text, payload.rawContent);
  }, [payload.content, payload.rawContent]);

  const { meta: rawMeta, paper, markdownFallback } = parsed;

  const meta = useMemo(() => {
    const activeSections = paper?.sections.filter((s) => s.questions.length > 0) ?? [];
    let answerKey = rawMeta.answerKey;
    let solutions = rawMeta.solutions;
    if (!answerKey.trim() && activeSections.length) {
      answerKey = synthesizeAnswerKeyFromSections(activeSections);
    }
    if (!solutions.trim() && activeSections.length) {
      solutions = synthesizeSolutionsFromSections(activeSections);
    }
    return { ...rawMeta, answerKey, solutions };
  }, [rawMeta, paper?.sections]);

  const questionPaperMarkdown = useMemo(() => {
    const numbered = parseNumberedMarkdownSections(payload.content);
    return numbered.get(6) || '';
  }, [payload.content]);

  if (markdownFallback && !paper) {
    return (
      <div
        className={cn('w-full', className)}
        dangerouslySetInnerHTML={{ __html: renderMockTestMarkdown(markdownFallback) }}
      />
    );
  }

  const totalQuestions = paper?.sections.reduce((n, s) => n + s.questions.length, 0) ?? 0;
  const totalMarks =
    paper?.sections.reduce(
      (n, s) => n + s.questions.reduce((m, q) => m + (q.marks != null ? q.marks : 0), 0),
      0,
    ) ?? 0;
  const activeSections = paper?.sections.filter((s) => s.questions.length > 0) ?? [];

  const bodyDefs: Array<{
    key: string;
    title: string;
    icon: LucideIcon;
    stripe?: string;
    iconWrap?: string;
    className?: string;
    hasContent: boolean;
    body: ReactNode;
  }> = [
    {
      key: 'purpose',
      title: 'Test Purpose and Subtopic Link',
      icon: Target,
      stripe: 'border-amber-500',
      iconWrap: 'bg-amber-100 text-amber-800',
      hasContent: !!meta.testPurpose.trim(),
      body: <ExpandableText text={meta.testPurpose} />,
    },
    {
      key: 'objectives',
      title: "Learning Objectives – Bloom's Taxonomy",
      icon: Brain,
      stripe: 'border-violet-500',
      iconWrap: 'bg-violet-100 text-violet-800',
      hasContent: meta.learningObjectives.length > 0,
      body: <SelfCheckList items={meta.learningObjectives} tone="violet" />,
    },
    {
      key: 'ncf',
      title: 'NCF Competency / Learning Outcome Alignment',
      icon: GraduationCap,
      stripe: 'border-cyan-500',
      iconWrap: 'bg-cyan-100 text-cyan-800',
      hasContent: !!meta.ncfAlignment.trim(),
      body: <ExpandableText text={meta.ncfAlignment} />,
    },
    {
      key: 'instructions',
      title: 'Instructions for Students',
      icon: ClipboardList,
      stripe: 'border-slate-500',
      iconWrap: 'bg-slate-100 text-slate-800',
      hasContent: !!meta.instructions.trim(),
      body: <ExpandableText text={meta.instructions} />,
    },
    {
      key: 'paper',
      title: 'Question Paper',
      icon: FileQuestion,
      stripe: 'border-rose-600',
      iconWrap: 'bg-rose-100 text-rose-800',
      className: 'sm:col-span-2',
      hasContent: activeSections.length > 0 || !!questionPaperMarkdown,
      body:
        activeSections.length > 0 ? (
          <div className="space-y-3">
            {activeSections.map((sec) => (
              <ExamSectionBlock key={sec.id} section={sec} showAnswers={false} />
            ))}
          </div>
        ) : (
          <div
            className="rounded-lg border border-rose-100 bg-rose-50/30 p-1"
            dangerouslySetInnerHTML={{
              __html: renderMockTestMarkdown(`## Question Paper\n\n${questionPaperMarkdown}`),
            }}
          />
        ),
    },
    {
      key: 'answerKey',
      title: 'Answer Key',
      icon: CheckCircle2,
      stripe: 'border-emerald-500',
      iconWrap: 'bg-emerald-100 text-emerald-800',
      hasContent: !!meta.answerKey.trim(),
      body: <RevealBlock text={meta.answerKey} label="Answer Key" />,
    },
    {
      key: 'solutions',
      title: 'Step-by-step Solutions / Explanations',
      icon: BookOpen,
      stripe: 'border-sky-500',
      iconWrap: 'bg-sky-100 text-sky-800',
      hasContent: !!meta.solutions.trim(),
      body: <RevealBlock text={meta.solutions} label="Solutions" />,
    },
    {
      key: 'remedial',
      title: 'Remedial Revision Suggestions',
      icon: ListChecks,
      stripe: 'border-orange-500',
      iconWrap: 'bg-orange-100 text-orange-800',
      hasContent: meta.remedial.length > 0,
      body: <SelfCheckList items={meta.remedial} tone="orange" prompt="Tap each suggestion once you've revised it" />,
    },
    {
      key: 'outcomes',
      title: 'Expected Learning Outcomes',
      icon: Sparkles,
      stripe: 'border-teal-500',
      iconWrap: 'bg-teal-100 text-teal-800',
      hasContent: meta.outcomes.length > 0,
      body: <SelfCheckList items={meta.outcomes} tone="teal" />,
    },
    {
      key: 'realLife',
      title: 'Real-life Application',
      icon: Lightbulb,
      stripe: 'border-lime-600',
      iconWrap: 'bg-lime-100 text-lime-900',
      hasContent: !!meta.realLife.trim(),
      body: <ExpandableText text={meta.realLife} />,
    },
    {
      key: 'reflection',
      title: 'Reflection / Exit Ticket',
      icon: MessageCircle,
      stripe: 'border-slate-600',
      iconWrap: 'bg-slate-100 text-slate-800',
      hasContent: !!meta.reflection.trim(),
      body: <ExpandableText text={meta.reflection} />,
    },
  ];

  const bodySections = bodyDefs
    .filter((d) => d.hasContent)
    .map((d, i) => (
      <MockSectionCard
        key={d.key}
        sectionNum={`Section ${i + 2}`}
        title={d.title}
        icon={d.icon}
        stripe={d.stripe}
        iconWrap={d.iconWrap}
        className={d.className}
      >
        {d.body}
      </MockSectionCard>
    ));

  const visibleCount = 1 + bodySections.length;

  return (
    <div className={cn('w-full space-y-4', className)}>
      <div className="rounded-xl border border-rose-100 bg-rose-50/70 px-4 py-3">
        <h4 className="text-lg font-bold text-rose-950">{meta.title}</h4>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge className="border-0 bg-rose-100 text-rose-900 hover:bg-rose-100 text-micro">
            {totalQuestions} questions
          </Badge>
          {totalMarks > 0 ? (
            <Badge className="border-0 bg-rose-100 text-rose-900 hover:bg-rose-100 text-micro">
              {totalMarks} marks
            </Badge>
          ) : null}
          <Badge className="border-0 bg-rose-100 text-rose-900 hover:bg-rose-100 text-micro">
            {activeSections.length} sections
          </Badge>
        </div>
      </div>
      <AiToolMockTestSectionLayout>{bodySections}</AiToolMockTestSectionLayout>

      <AiToolV2InsightTail
        rawContent={payload.rawContent}
        startNum={visibleCount + 1}
        includeOverview
        overviewStats={[
          { label: 'Questions', value: String(totalQuestions) },
          { label: 'Marks', value: totalMarks > 0 ? String(totalMarks) : '' },
          { label: 'Sections', value: String(activeSections.length) },
        ].filter((s) => s.value)}
        bloomRows={paper ? buildBloomDistributionFromExamSections(paper.sections) : []}
        bloomFromObjectives={meta.learningObjectives}
        competencyItems={meta.learningObjectives}
        bestPracticesText="Attempt under timed exam conditions, mark uncertain items, then review solutions section-by-section using the Bloom tags to plan revision."
      />
    </div>
  );
}
