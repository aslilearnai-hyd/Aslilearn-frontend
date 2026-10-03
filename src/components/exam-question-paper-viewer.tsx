import { useMemo, useState, type ReactNode } from 'react';
import {
  BookOpen,
  Brain,
  CheckCircle2,
  ClipboardList,
  Eye,
  EyeOff,
  FileQuestion,
  GraduationCap,
  ListChecks,
  Target,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExpandableText, SelfCheckList } from '@/components/ai-tool-interactive';
import { AiToolStackedSection } from '@/components/ai-tool-stacked-section';
import { cn } from '@/lib/utils';
import { formatClassroomScienceText } from '@/lib/exam-text-normalize';
import { displaySubtopicLabel } from '@/lib/curriculum-subtopic-display';
import { displayQuestionSerial } from '@/lib/renumber-questions';
import { renderMarkdown } from '@/lib/render-teacher-markdown';
import { stripStructuredAiToolMetadata } from '@/lib/strip-ai-tool-metadata';
import { AiToolMockTestSectionLayout } from '@/lib/ai-tool-section-layout';
import {
  AiToolV2BloomDistribution,
  AiToolV2CompetencyFocus,
  AiToolV2NepAlignment,
} from '@/components/ai-v2/ai-tool-v2-insights';
import { AiToolV2DistributionDonut, bloomRowsToDonutRows } from '@/components/ai-v2/ai-tool-v2-analytics';
import { AiToolV2Section, AiToolV2SectionStack } from '@/components/ai-v2/ai-tool-v2-section';
import {
  buildBloomDistributionFromExamSections,
  buildExamBlueprintRows,
  EXAM_SECTION_DEFINITIONS,
  examPaperHasVisibleContent,
  extractExamPaperContext,
  extractInlineMcqFromQuestionText,
  formatLabeledMcqOptions,
  parseBlueprintCounts,
  parseCompetencyFocusItems,
  resolveExamPaperFromPayload,
  synthesizeExamAnswerKeyRows,
  type ExamQuestion,
  type ExamSection,
} from '@/lib/parse-exam-question-paper';

export { examViewerPayloadFromRecord } from '@/lib/parse-exam-question-paper';

type MockTestMeta = {
  mockTestTitle: string;
  testPurposeSubtopicLink: string;
  learningObjectives: string[];
  ncfCompetencyAlignment: string;
  stepByStepSolutionsExplanations: string;
  remedialRevisionSuggestions: string[];
  expectedLearningOutcomes: string[];
  realLifeApplication: string;
  reflectionExitTicket: string;
};

interface ExamQuestionPaperViewerProps {
  content: string;
  rawContent?: unknown;
  className?: string;
  /** Student Mock Test Builder (12-section) vs teacher Exam Question Paper (11-section). */
  variant?: 'student' | 'teacher';
}

function extractMockTestMeta(rawContent?: unknown): MockTestMeta | null {
  const candidates: Record<string, unknown>[] = [];
  if (rawContent && typeof rawContent === 'object' && !Array.isArray(rawContent)) {
    candidates.push(rawContent as Record<string, unknown>);
    const render = (rawContent as Record<string, unknown>).renderContent;
    if (render && typeof render === 'object') candidates.push(render as Record<string, unknown>);
  }
  for (const c of candidates) {
    const title = String(c.mockTestTitle || c.mock_test_title || c.paperTitle || c.paper_title || '').trim();
    if (!title && !c.testPurposeSubtopicLink && !c.test_purpose_subtopic_link) continue;
    const toList = (v: unknown) =>
      Array.isArray(v) ? v.map((x) => String(x || '').trim()).filter(Boolean) : [];
    return {
      mockTestTitle: title || 'Mock Test',
      testPurposeSubtopicLink: String(
        c.testPurposeSubtopicLink || c.test_purpose_subtopic_link || '',
      ).trim(),
      learningObjectives: toList(c.learningObjectives || c.learning_objectives),
      ncfCompetencyAlignment: String(
        c.ncfCompetencyAlignment || c.ncf_competency_alignment || '',
      ).trim(),
      stepByStepSolutionsExplanations: String(
        c.stepByStepSolutionsExplanations || c.step_by_step_solutions_explanations || '',
      ).trim(),
      remedialRevisionSuggestions: toList(
        c.remedialRevisionSuggestions || c.remedial_revision_suggestions,
      ),
      expectedLearningOutcomes: toList(c.expectedLearningOutcomes || c.expected_learning_outcomes),
      realLifeApplication: String(c.realLifeApplication || c.real_life_application || '').trim(),
      reflectionExitTicket: String(
        c.reflectionExitTicket || c.reflection_exit_ticket || '',
      ).trim(),
    };
  }
  return null;
}

function RichTextBlock({ text, className }: { text: string; className?: string }) {
  const displayText = formatClassroomScienceText(text);
  if (!displayText.trim()) return null;
  const hasMarkdown =
    displayText.includes('|') ||
    displayText.includes('$') ||
    displayText.includes('\\sqrt') ||
    /^\s*#{1,6}\s/m.test(displayText) ||
    /\*\*[^*]+\*\*/.test(displayText) ||
    /^\s*[-*•]\s/m.test(displayText) ||
    /^\s*\d+\.\s/m.test(displayText);
  if (hasMarkdown || /\\[a-zA-Z]+/.test(displayText)) {
    return (
      <div
        className={cn(
          'prose prose-base max-w-none break-words text-slate-800',
          'prose-table:w-full prose-table:border-collapse prose-th:border prose-th:border-indigo-200 prose-th:bg-indigo-50/90 prose-th:px-2 prose-th:py-1.5 prose-th:text-left prose-th:text-base prose-th:font-semibold',
          'prose-td:border prose-td:border-indigo-100 prose-td:px-2 prose-td:py-1.5 prose-td:text-base prose-td:align-top',
          className,
        )}
        dangerouslySetInnerHTML={{ __html: renderMarkdown(displayText) }}
      />
    );
  }
  return (
    <p className="whitespace-pre-wrap break-words text-base leading-relaxed text-slate-800">
      {displayText}
    </p>
  );
}

function OverviewStat({ label, value }: { label: string; value: string }) {
  if (!value.trim()) return null;
  return (
    <div className="min-w-0 rounded-lg border border-indigo-100 bg-white/80 px-3 py-2.5">
      <p className="break-words text-xs font-semibold uppercase leading-snug tracking-wide text-indigo-600">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold leading-relaxed text-slate-900 sm:text-base">{value}</p>
    </div>
  );
}

function QuestionCard({
  question,
  index,
  showAnswer = false,
}: {
  question: ExamQuestion;
  index: number;
  showAnswer?: boolean;
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
    <article className="rounded-lg border border-indigo-100 bg-gradient-to-br from-white to-indigo-50/20 p-3 shadow-sm">
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <div className="text-base font-semibold text-slate-900">
          <span className="mr-1.5 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded bg-indigo-700 px-1 text-micro font-bold text-white">
            {qNo}
          </span>
          <span className="inline">
            <RichTextBlock text={questionText} className="inline prose-p:inline prose-p:m-0" />
          </span>
        </div>
        {question.marks != null ? (
          <Badge className="shrink-0 border-0 bg-indigo-100 text-indigo-800 hover:bg-indigo-100">
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
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-800">
                  {label}
                </span>
                <span className="min-w-0 flex-1 pt-0.5">
                  <RichTextBlock text={text} className="prose-p:m-0 prose-p:leading-snug" />
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}

      {showAnswer && question.answer ? (
        <p className="mt-2 rounded-md bg-emerald-50 px-2 py-1 text-xs text-emerald-800">
          <span className="font-semibold">Answer:</span>{' '}
          <RichTextBlock text={question.answer} className="inline prose-p:inline prose-p:m-0" />
        </p>
      ) : null}

      {question.internalChoiceGroup ? (
        <p className="mt-1.5 text-mini text-violet-700">
          <span className="font-semibold">OR / Choice:</span> {question.internalChoiceGroup}
        </p>
      ) : null}
    </article>
  );
}

function ExamSectionBlock({
  section,
  showAnswers,
}: {
  section: ExamSection;
  showAnswers: boolean;
}) {
  const sectionMarks = section.questions.reduce(
    (sum, q) => sum + (q.marks != null ? q.marks : 0),
    0,
  );
  return (
    <div className="rounded-xl border border-indigo-200/80 bg-white/90 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-indigo-100 pb-2">
        <h5 className="text-base font-bold text-indigo-900">
          Section {section.id.toUpperCase()} — {section.title.replace(/^Section\s*[A-E]\s*[-–:]\s*/i, '')}
        </h5>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline" className="border-indigo-200 text-indigo-700">
            {section.questions.length} Q
          </Badge>
          {sectionMarks > 0 ? (
            <Badge variant="outline" className="border-indigo-200 text-indigo-700">
              {sectionMarks} marks
            </Badge>
          ) : null}
        </div>
      </div>
      <div className="space-y-2">
        {section.questions.map((q, idx) => (
          <QuestionCard
            key={`${section.id}-${idx}`}
            question={q}
            index={idx}
            showAnswer={showAnswers}
          />
        ))}
      </div>
    </div>
  );
}

function BlueprintTable({ rows }: { rows: ReturnType<typeof buildExamBlueprintRows> }) {
  if (!rows.length) return null;
  return (
    <div className="overflow-x-auto rounded-lg border border-cyan-100">
      <table className="w-full min-w-[420px] border-collapse text-left text-xs">
        <thead>
          <tr className="bg-cyan-50/90 text-cyan-900">
            <th className="border border-cyan-100 px-2.5 py-2 font-semibold">Section</th>
            <th className="border border-cyan-100 px-2.5 py-2 font-semibold">Type</th>
            <th className="border border-cyan-100 px-2.5 py-2 font-semibold">Questions</th>
            <th className="border border-cyan-100 px-2.5 py-2 font-semibold">Marks</th>
            <th className="border border-cyan-100 px-2.5 py-2 font-semibold">% Marks</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.sectionId} className="bg-white text-slate-800">
              <td className="border border-cyan-50 px-2.5 py-2 font-medium">{row.sectionId.toUpperCase()}</td>
              <td className="border border-cyan-50 px-2.5 py-2">{row.questionType}</td>
              <td className="border border-cyan-50 px-2.5 py-2">{row.questionCount}</td>
              <td className="border border-cyan-50 px-2.5 py-2">{row.marks || '—'}</td>
              <td className="border border-cyan-50 px-2.5 py-2">{row.percent ? `${row.percent}%` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AnswerKeySnapshotTable({
  rows,
  fallbackText,
}: {
  rows: ReturnType<typeof synthesizeExamAnswerKeyRows>;
  fallbackText: string;
}) {
  if (rows.length > 0) {
    return (
      <div className="w-full min-w-0 overflow-x-auto rounded-lg border border-emerald-100">
        <table className="w-full table-fixed border-collapse text-left text-sm">
          <colgroup>
            <col className="w-16 sm:w-20" />
            <col className="w-16 sm:w-24" />
            <col />
            <col className="w-16 sm:w-20" />
          </colgroup>
          <thead>
            <tr className="bg-emerald-50/90 text-emerald-900">
              <th className="border border-emerald-100 px-2.5 py-2 font-semibold">Q. No.</th>
              <th className="border border-emerald-100 px-2.5 py-2 font-semibold">Section</th>
              <th className="border border-emerald-100 px-2.5 py-2 font-semibold">Answer</th>
              <th className="border border-emerald-100 px-2.5 py-2 font-semibold">Marks</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={`${row.qNo}-${i}`} className="bg-white text-slate-800">
                <td className="border border-emerald-50 px-2.5 py-2 font-medium">{row.qNo}</td>
                <td className="border border-emerald-50 px-2.5 py-2">{row.sectionId}</td>
                <td className="break-words border border-emerald-50 px-2.5 py-2 leading-relaxed">{row.answer}</td>
                <td className="border border-emerald-50 px-2.5 py-2">{row.marks ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return <RichTextBlock text={fallbackText} />;
}

/** Hide answer/solution content behind a tap so a mock test stays a real self-test. */
function RevealBlock({ children, label }: { children: ReactNode; label: string }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div>
      <Button type="button" size="sm" variant="outline" onClick={() => setRevealed((v) => !v)}>
        {revealed ? <EyeOff className="mr-1.5 h-3.5 w-3.5" /> : <Eye className="mr-1.5 h-3.5 w-3.5" />}
        {revealed ? `Hide ${label.toLowerCase()}` : `Reveal ${label.toLowerCase()}`}
      </Button>
      {revealed ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}

function ExamSectionCard({
  sectionNum,
  title,
  icon,
  children,
  className,
}: {
  sectionNum: string;
  title: string;
  icon: typeof ClipboardList;
  children: ReactNode;
  className?: string;
}) {
  return (
    <AiToolStackedSection num={sectionNum} title={title} icon={icon} className={className}>
      {children}
    </AiToolStackedSection>
  );
}

export function ExamQuestionPaperViewer({
  content,
  rawContent,
  className,
  variant = 'teacher',
}: ExamQuestionPaperViewerProps) {
  const mockMeta = variant === 'student' ? extractMockTestMeta(rawContent) : null;
  const context = useMemo(() => extractExamPaperContext(rawContent), [rawContent]);

  const parsedContent = useMemo(
    () => stripStructuredAiToolMetadata(String(content || '')),
    [content],
  );

  const resolved = useMemo(
    () => resolveExamPaperFromPayload(parsedContent, rawContent),
    [parsedContent, rawContent],
  );

  const paper = resolved.paper;
  const useMarkdown = !paper || !examPaperHasVisibleContent(paper);

  if (useMarkdown && resolved.markdownFallback) {
    return (
      <div className={className}>
        <div
          className="prose prose-base max-w-none rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(resolved.markdownFallback) }}
        />
      </div>
    );
  }

  if (!paper) {
    return (
      <div className={cn('rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center', className)}>
        <p className="text-base font-medium text-slate-700">No exam paper content found.</p>
      </div>
    );
  }

  const activeSections = paper.sections.filter((s) => s.questions.length > 0);
  const totalQuestions = activeSections.reduce((sum, sec) => sum + sec.questions.length, 0);
  const totalMarks = activeSections.reduce(
    (sum, sec) =>
      sum +
      sec.questions.reduce((sectionSum, q) => sectionSum + (q.marks != null ? q.marks : 0), 0),
    0,
  );
  const blueprintRows = buildExamBlueprintRows(activeSections, paper.blueprint);
  const answerKeyRows = synthesizeExamAnswerKeyRows(activeSections);
  const paperTitle =
    mockMeta?.mockTestTitle ||
    paper.paperTitle ||
    (variant === 'student' ? 'Mock Test' : 'Exam Question Paper');

  if (variant === 'student' && mockMeta) {
    return (
      <div className={cn('space-y-5', className)}>
        <div className="flex flex-wrap gap-2">
          <Badge className="border-0 bg-rose-100 text-rose-900 hover:bg-rose-100 text-xs font-semibold">
            {totalQuestions} Questions
          </Badge>
          <Badge className="border-0 bg-orange-100 text-orange-900 hover:bg-orange-100 text-xs font-semibold">
            {totalMarks || '—'} Total Marks
          </Badge>
          <Badge className="border-0 bg-amber-100 text-amber-900 hover:bg-amber-100 text-xs font-semibold">
            {activeSections.length} Sections
          </Badge>
        </div>
        <AiToolMockTestSectionLayout>
          {(() => {
            const defs: Array<{
              key: string;
              title: string;
              icon: typeof Target;
              hasContent: boolean;
              body: ReactNode;
            }> = [
              {
                key: 'purpose',
                title: 'Test Purpose and Subtopic Link',
                icon: Target,
                hasContent: !!mockMeta.testPurposeSubtopicLink?.trim(),
                body: <ExpandableText text={mockMeta.testPurposeSubtopicLink} />,
              },
              {
                key: 'objectives',
                title: "Learning Objectives – Bloom's",
                icon: Brain,
                hasContent: mockMeta.learningObjectives.length > 0,
                body: <SelfCheckList items={mockMeta.learningObjectives} tone="rose" />,
              },
              {
                key: 'ncf',
                title: 'NCF Competency / Learning Outcome',
                icon: GraduationCap,
                hasContent: !!mockMeta.ncfCompetencyAlignment?.trim(),
                body: <ExpandableText text={mockMeta.ncfCompetencyAlignment} />,
              },
              {
                key: 'instructions',
                title: 'Instructions for Students',
                icon: ClipboardList,
                hasContent: !!paper.instructions?.trim(),
                body: <ExpandableText text={paper.instructions} />,
              },
              {
                key: 'paper',
                title: 'Question Paper',
                icon: FileQuestion,
                hasContent: activeSections.length > 0,
                body: (
                  <div className="space-y-3">
                    {activeSections.map((sec) => (
                      <ExamSectionBlock key={sec.id} section={sec} showAnswers={false} />
                    ))}
                  </div>
                ),
              },
              {
                key: 'answerKey',
                title: 'Answer Key',
                icon: CheckCircle2,
                hasContent: answerKeyRows.length > 0 || !!paper.answerKey?.trim(),
                body: (
                  <RevealBlock label="Answer Key">
                    <AnswerKeySnapshotTable rows={answerKeyRows} fallbackText={paper.answerKey} />
                  </RevealBlock>
                ),
              },
              {
                key: 'solutions',
                title: 'Step-by-step Solutions / Explanations',
                icon: BookOpen,
                hasContent: !!mockMeta.stepByStepSolutionsExplanations?.trim(),
                body: (
                  <RevealBlock label="Solutions">
                    <RichTextBlock text={mockMeta.stepByStepSolutionsExplanations} />
                  </RevealBlock>
                ),
              },
            ];
            return defs
              .filter((d) => d.hasContent)
              .map((d, i) => (
                <ExamSectionCard key={d.key} sectionNum={String(i + 2)} title={d.title} icon={d.icon}>
                  {d.body}
                </ExamSectionCard>
              ));
          })()}
        </AiToolMockTestSectionLayout>
      </div>
    );
  }

  return (
    <div className={cn('space-y-5', className)} data-ai-tool-export>
      <div className="flex flex-wrap gap-2 print:hidden">
        <Badge className="border-0 bg-indigo-100 text-indigo-900 hover:bg-indigo-100 text-xs font-semibold">
          {totalQuestions} Questions
        </Badge>
        <Badge className="border-0 bg-violet-100 text-violet-900 hover:bg-violet-100 text-xs font-semibold">
          {totalMarks || '—'} Total Marks
        </Badge>
        <Badge className="border-0 bg-sky-100 text-sky-900 hover:bg-sky-100 text-xs font-semibold">
          {activeSections.length} Sections
        </Badge>
      </div>

      <AiToolV2SectionStack className="md:grid-cols-1">
        {(() => {
          const counts = parseBlueprintCounts(paper.blueprint);
          const countById: Record<string, number> = {
            a: counts.a,
            b: counts.b,
            c: counts.c,
            d: counts.d,
            e: counts.e,
          };
          const bloomRows = buildBloomDistributionFromExamSections(activeSections);
          const competencyItems = parseCompetencyFocusItems(rawContent);
          const sectionAccents = ['indigo', 'violet', 'emerald', 'amber', 'rose', 'cyan', 'slate'] as const;

          const examSectionCards = EXAM_SECTION_DEFINITIONS.map((meta) => {
            const expected = countById[meta.id] || 0;
            const section =
              activeSections.find((s) => s.id === meta.id) ||
              paper.sections.find((s) => s.id === meta.id) ||
              null;
            const questionCount = section?.questions.length ?? 0;
            if (questionCount <= 0) return null;
            const sectionMarks = section?.questions.reduce(
              (sum, q) => sum + (q.marks != null ? q.marks : 0),
              0,
            ) ?? 0;
            const title = meta.title.replace(/^Section\s*([A-E])\s*[-–:]\s*/i, 'Section $1 — ');
            const marksLabel =
              expected > 0 && sectionMarks > 0
                ? `${questionCount} × marks = ${sectionMarks} marks`
                : expected > 0
                  ? `${expected} question(s) planned`
                  : `${questionCount} question(s)`;
            return {
              key: meta.id,
              title,
              description: marksLabel,
              body: <ExamSectionBlock section={section!} showAnswers={false} />,
            };
          }).filter(Boolean) as Array<{
            key: string;
            title: string;
            description: string;
            body: ReactNode;
          }>;

          const blocks: Array<{
            key: string;
            title: string;
            description?: string;
            icon: typeof ClipboardList;
            accent: (typeof sectionAccents)[number];
            body: ReactNode;
          }> = [
            {
              key: 'overview',
              title: 'Paper Overview',
              description: 'Duration, marks, class context, and instructions',
              icon: ClipboardList,
              accent: 'indigo',
              body: (
                <div className="space-y-3">
                  <div className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    <OverviewStat label="Class" value={context.className} />
                    <OverviewStat label="Subject" value={context.subject} />
                    <OverviewStat label="Chapter / Topic" value={context.topic} />
                    <OverviewStat label="Subtopic" value={displaySubtopicLabel(context.subtopic)} />
                    <OverviewStat label="Board" value={context.board} />
                    <OverviewStat
                      label="Duration"
                      value={context.duration ? `${context.duration} min` : '40 min'}
                    />
                    <OverviewStat label="Total Questions" value={String(totalQuestions || '—')} />
                    <OverviewStat label="Total Marks" value={String(totalMarks || '—')} />
                  </div>
                  {paper.instructions ? (
                    <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3">
                      <p className="text-micro font-semibold uppercase tracking-wide text-slate-500">
                        General Instructions
                      </p>
                      <RichTextBlock text={paper.instructions} />
                    </div>
                  ) : null}
                </div>
              ),
            },
          ];

          if (paper.blueprint?.trim() || blueprintRows.length > 0) {
            blocks.push({
              key: 'blueprint',
              title: 'Blueprint / Question Distribution',
              description: 'Section-wise marks and weightage',
              icon: Target,
              accent: 'violet',
              body: (
                <div className="space-y-3">
                  {paper.blueprint ? (
                    <RichTextBlock text={paper.blueprint} className="text-xs" />
                  ) : null}
                  <BlueprintTable rows={blueprintRows} />
                </div>
              ),
            });
          }

          examSectionCards.forEach((card, i) => {
            blocks.push({
              key: card.key,
              title: card.title,
              description: card.description,
              icon: FileQuestion,
              accent: sectionAccents[(i + 2) % sectionAccents.length],
              body: card.body,
            });
          });

          if (bloomRows.some((r) => r.marks > 0 || r.percent > 0)) {
            blocks.push({
              key: 'bloom',
              title: "Bloom's Distribution (by Marks)",
              description: 'Cognitive level spread across the paper',
              icon: Brain,
              accent: 'violet',
              body: (
                <div className="space-y-4">
                  <AiToolV2DistributionDonut
                    rows={bloomRowsToDonutRows(bloomRows)}
                    title="Bloom levels"
                    totalLabel="marks"
                  />
                  <AiToolV2BloomDistribution rows={bloomRows} totalMarks={totalMarks} />
                </div>
              ),
            });
          }

          if (competencyItems.length > 0) {
            blocks.push({
              key: 'competency',
              title: 'Competency Focus',
              description: 'Skills and competencies assessed',
              icon: GraduationCap,
              accent: 'emerald',
              body: <AiToolV2CompetencyFocus items={competencyItems} />,
            });
          }

          if (answerKeyRows.length > 0 || paper.answerKey?.trim()) {
            blocks.push({
              key: 'answer-key',
              title: 'Answer Key Snapshot',
              description: 'Quick reference for all sections',
              icon: CheckCircle2,
              accent: 'amber',
              body: (
                <AnswerKeySnapshotTable rows={answerKeyRows} fallbackText={paper.answerKey} />
              ),
            });
          }

          if (context.nepNcfFocus?.trim()) {
            blocks.push({
              key: 'nep',
              title: 'NEP / NCF Alignment',
              description: 'Curriculum framework alignment',
              icon: GraduationCap,
              accent: 'cyan',
              body: <AiToolV2NepAlignment focusText={context.nepNcfFocus} />,
            });
          }

          if (paper.internalChoices) {
            blocks.push({
              key: 'internal-choices',
              title: 'Internal Choices',
              icon: ListChecks,
              accent: 'slate',
              body: <RichTextBlock text={paper.internalChoices} />,
            });
          }
          if (paper.markingScheme) {
            blocks.push({
              key: 'marking',
              title: 'Detailed Marking Scheme',
              icon: ListChecks,
              accent: 'slate',
              body: <RichTextBlock text={paper.markingScheme} />,
            });
          }
          if (paper.openEndedRubric) {
            blocks.push({
              key: 'rubric',
              title: 'Rubric for Open-ended Questions',
              icon: BookOpen,
              accent: 'slate',
              body: <RichTextBlock text={paper.openEndedRubric} />,
            });
          }

          return blocks.map((block, index) => (
            <AiToolV2Section
              key={block.key}
              num={index + 1}
              title={block.title}
              description={block.description}
              icon={block.icon}
              accent={block.accent}
            >
              {block.body}
            </AiToolV2Section>
          ));
        })()}
      </AiToolV2SectionStack>
    </div>
  );
}
