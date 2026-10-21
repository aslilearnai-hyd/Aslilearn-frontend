import { useMemo, useState, type ReactNode } from 'react';
import ExamMathText from '@/components/exam/ExamMathText';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock,
  Eye,
  EyeOff,
  HelpCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { renderMarkdown } from '@/lib/render-teacher-markdown';
import { stripStructuredAiToolMetadata } from '@/lib/strip-ai-tool-metadata';
import {
  resolveStudyGuideFromPayload,
  studyGuideViewerPayloadFromRecord,
  getMissingStudyGuideSections,
  isStudyGuideComplete,
  studyGuideHasVisibleBody,
  type StudyGuideContent,
  type StudyGuidePracticeQuestion,
} from '@/lib/parse-smart-study-guide';
import { renderSmartStudyGuideMarkdown } from '@/lib/render-smart-study-guide-markdown';
import {
  RealisticIcon,
  type AiTool3dIconName,
} from '@/components/ai-tool-3d-icons';
import { AiToolStackedSection, type AiToolSectionMetaItem } from '@/components/ai-tool-stacked-section';
import {
  AiToolV2InsightTail,
  parseBloomLevelsFromText,
} from '@/components/ai-v2';
import {
  CheckableTimeline,
  ExpandableText,
  FlipCard,
  OneAtATimeCarousel,
  SelfCheckList,
  StepFlowDiagram,
  TapToMarkItem,
  TapToRevealCard,
} from '@/components/ai-tool-interactive';

export { studyGuideViewerPayloadFromRecord };

interface SmartStudyGuideViewerProps {
  content: string;
  rawContent?: unknown;
  className?: string;
}

const fadeUp = {
  hidden: { opacity: 0, y: 18, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1 },
};

function RichTextBlock({ text, className }: { text: string; className?: string }) {
  if (!text.trim()) return null;
  const hasMarkdown =
    text.includes('|') ||
    /^\s*#{1,6}\s/m.test(text) ||
    /\*\*[^*]+\*\*/.test(text) ||
    /^\s*[-*•]\s/m.test(text);
  if (hasMarkdown) {
    return (
      <div
        className={cn('prose prose-base max-w-none text-slate-700 prose-li:text-base', className)}
        dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }}
      />
    );
  }
  return (
    <p className={cn('whitespace-pre-wrap text-base leading-relaxed text-slate-700', className)}>
      {text}
    </p>
  );
}

function SectionShell({
  num,
  title,
  illustration,
  accent,
  gradient,
  children,
  className,
  meta,
}: {
  num: string;
  title: string;
  illustration: AiTool3dIconName;
  accent?: string;
  gradient?: string;
  children: ReactNode;
  className?: string;
  meta?: AiToolSectionMetaItem[];
}) {
  return (
    <AiToolStackedSection
      num={num}
      title={title}
      iconName={illustration}
      accent={accent}
      gradient={gradient}
      className={className}
      meta={meta}
    >
      {children}
    </AiToolStackedSection>
  );
}

function ConceptFlipCard({
  name,
  explanation,
  icon,
}: {
  name: string;
  explanation: string;
  icon: AiTool3dIconName;
}) {
  return (
    <FlipCard
      tone="emerald"
      front={
        <>
          <div className="mb-2 flex items-center gap-2">
            <RealisticIcon name={icon} alt="" className="h-9 w-9" />
            <Badge className="border-0 bg-emerald-100 text-emerald-800">Concept</Badge>
            <span className="ml-auto inline-flex items-center gap-1 text-mini font-semibold text-emerald-600">
              Tap to flip ↻
            </span>
          </div>
          <p className="text-base font-bold text-emerald-950">{name}</p>
          <p className="mt-1.5 text-base leading-relaxed text-slate-700">{explanation}</p>
        </>
      }
      back={
        <>
          <RealisticIcon name="sparkle" alt="" className="h-10 w-10" />
          <p className="text-sm font-bold uppercase tracking-wide">Quick challenge</p>
          <p className="text-base leading-relaxed">
            Explain <span className="font-bold">{name}</span> in one sentence — out loud, to a
            friend or to yourself.
          </p>
        </>
      }
    />
  );
}

function PracticeQuestionCard({
  q,
  index,
}: {
  q: StudyGuidePracticeQuestion;
  index: number;
}) {
  const isMcq = q.type === 'objective' && q.options.length >= 2;
  const [revealed, setRevealed] = useState(false);
  const [hintOpen, setHintOpen] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const difficulty =
    index % 3 === 0 ? 'Easy' : index % 3 === 1 ? 'Medium' : 'Hard';
  const difficultyClass =
    difficulty === 'Easy'
      ? 'bg-emerald-100 text-emerald-800'
      : difficulty === 'Medium'
        ? 'bg-amber-100 text-amber-900'
        : 'bg-rose-100 text-rose-800';

  const correctLabel = useMemo(() => {
    const raw = String(q.answer || '').trim();
    if (!raw) return '';
    const m = raw.match(/^([A-D])(?:[\).:\s-]|$)/i);
    if (m) return m[1].toUpperCase();
    // Match full option text to a letter
    for (let i = 0; i < q.options.length; i += 1) {
      const opt = q.options[i];
      const label =
        opt.match(/^([A-D])\)/i)?.[1]?.toUpperCase() || String.fromCharCode(65 + i);
      const text = opt.replace(/^[A-D]\)\s*/i, '').trim().toLowerCase();
      if (text && raw.toLowerCase().includes(text)) return label;
    }
    return '';
  }, [q.answer, q.options]);

  const answerText = useMemo(() => {
    const raw = String(q.answer || '').trim();
    if (raw) return raw;
    if (isMcq && correctLabel) {
      const match = q.options.find((opt, i) => {
        const label =
          opt.match(/^([A-D])\)/i)?.[1]?.toUpperCase() || String.fromCharCode(65 + i);
        return label === correctLabel;
      });
      if (match) return match;
      return `Option ${correctLabel}`;
    }
    return 'Use the key concepts above to write your own answer, then compare with a classmate or teacher.';
  }, [q.answer, q.options, isMcq, correctLabel]);

  return (
    <motion.article
      variants={fadeUp}
      whileHover={{ y: -2 }}
      className="rounded-3xl border border-[#6C63FF]/15 bg-gradient-to-br from-white via-white to-[#F8F7FF] p-4 shadow-sm"
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex h-8 min-w-[2rem] items-center justify-center rounded-xl bg-gradient-to-br from-[#6C63FF] to-[#8B5CF6] px-2 text-xs font-bold text-white shadow">
          Q{index + 1}
        </span>
        <Badge className={cn('border-0 text-micro font-semibold', difficultyClass)}>
          {difficulty}
        </Badge>
        <Badge
          variant="outline"
          className={cn(
            'border-0 text-micro font-semibold',
            isMcq ? 'bg-pink-100 text-pink-800' : 'bg-orange-100 text-orange-800',
          )}
        >
          {isMcq ? 'MCQ' : 'Practice'}
        </Badge>
      </div>

      <p className="text-base font-semibold leading-snug text-slate-900 sm:text-base"><ExamMathText text={q.question} /></p>

      {isMcq ? (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {q.options.map((opt, i) => {
            const label =
              opt.match(/^([A-D])\)/i)?.[1]?.toUpperCase() || String.fromCharCode(65 + i);
            const text = opt.replace(/^[A-D]\)\s*/i, '').trim();
            const isPicked = picked === label;
            const showCorrect = revealed && correctLabel && label === correctLabel;
            const showWrong = revealed && isPicked && correctLabel && label !== correctLabel;
            return (
              <motion.li
                key={`${opt}-${i}`}
                whileHover={{ scale: 1.02 }}
                animate={showWrong ? { x: [0, -6, 6, -4, 4, 0] } : { x: 0 }}
                transition={{ duration: 0.35 }}
              >
                <button
                  type="button"
                  onClick={() => setPicked(label)}
                  className={cn(
                    'flex w-full gap-2 rounded-2xl border px-3 py-2.5 text-left text-base transition-all',
                    showCorrect
                      ? 'border-emerald-400 bg-emerald-50 text-emerald-900 shadow-[0_0_0_3px_rgba(34,197,94,0.15)]'
                      : showWrong
                        ? 'border-rose-400 bg-rose-50 text-rose-900'
                        : isPicked
                          ? 'border-[#6C63FF] bg-[#6C63FF]/5 text-slate-900'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-[#6C63FF]/40 hover:shadow-md',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                      showCorrect
                        ? 'bg-emerald-500 text-white'
                        : showWrong
                          ? 'bg-rose-500 text-white'
                          : 'bg-[#6C63FF]/10 text-[#6C63FF]',
                    )}
                  >
                    {label}
                  </span>
                  <span className="min-w-0 flex-1 pt-0.5"><ExamMathText text={text} /></span>
                </button>
              </motion.li>
            );
          })}
        </ul>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="rounded-xl border-[#6C63FF]/25 bg-white"
          onClick={() => setHintOpen((v) => !v)}
        >
          <HelpCircle className="mr-1.5 h-3.5 w-3.5" />
          Hint
        </Button>
        <Button
          type="button"
          size="sm"
          className="rounded-xl bg-gradient-to-r from-[#6C63FF] to-[#00C2FF] text-white hover:opacity-95"
          onClick={() => setRevealed((prev) => !prev)}
        >
          {revealed ? <EyeOff className="mr-1.5 h-3.5 w-3.5" /> : <Eye className="mr-1.5 h-3.5 w-3.5" />}
          {revealed ? 'Hide answer' : 'Reveal answer'}
        </Button>
      </div>

      <AnimatePresence initial={false}>
        {hintOpen ? (
          <motion.p
            key="hint"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-2 overflow-hidden rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900"
          >
            Think about the key idea in this topic, then answer in your own words.
          </motion.p>
        ) : null}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {revealed ? (
          <motion.div
            key="answer"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-base text-emerald-900"
          >
            <span className="font-semibold">Answer:</span> {answerText}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.article>
  );
}

export function SmartStudyGuideViewer({ content, rawContent, className }: SmartStudyGuideViewerProps) {
  const payload = useMemo(() => {
    if (rawContent != null) return { content: String(content || '').trim(), rawContent };
    return studyGuideViewerPayloadFromRecord({ generatedContent: content });
  }, [content, rawContent]);

  const { guide, markdownFallback } = useMemo(() => {
    const text = stripStructuredAiToolMetadata(payload.content);
    return resolveStudyGuideFromPayload(text, payload.rawContent);
  }, [payload.content, payload.rawContent]);

  if (markdownFallback) {
    return (
      <div
        className={cn(
          'w-full overflow-hidden rounded-[1.75rem] border border-[#6C63FF]/15 bg-[#F8F7FF] p-4 sm:p-6',
          className,
        )}
        dangerouslySetInnerHTML={{ __html: renderSmartStudyGuideMarkdown(markdownFallback) }}
      />
    );
  }

  const missingSections = getMissingStudyGuideSections(guide);
  const complete = isStudyGuideComplete(guide);

  if (!studyGuideHasVisibleBody(guide) && !guide.title.trim()) {
    return (
      <div
        className={cn(
          'rounded-[1.75rem] border border-amber-200 bg-amber-50 px-4 py-3 text-base text-amber-950',
          className,
        )}
        role="status"
      >
        <p className="font-semibold">Study guide incomplete</p>
        <p className="mt-1 text-amber-900/90">
          No study guide sections could be loaded. Ask your Super Admin to regenerate with all 11
          sections filled.
          {missingSections.length > 0 ? ` Missing: ${missingSections.join(', ')}.` : ''}
        </p>
      </div>
    );
  }

  const mcqCount = guide.practiceQuestions.filter(
    (q) => q.type === 'objective' && q.options.length >= 2,
  ).length;
  const conceptCount = guide.keyConcepts.filter((c) => c.name.trim() && c.explanation?.trim()).length;
  const practiceCount = guide.practiceQuestions.filter((q) => q.question.trim()).length;
  const sectionFlags = [
    Boolean(guide.title.trim()),
    Boolean(guide.chapterOverview.trim()),
    guide.learningObjectives.length > 0,
    guide.priorKnowledge.length > 0,
    conceptCount > 0,
    guide.definitions.length > 0 || guide.formulae.length > 0,
    Boolean(guide.conceptFlow.trim()),
    guide.realLifeExamples.length > 0,
    guide.quickRevisionNotes.length > 0,
    practiceCount > 0,
    guide.improvementTips.length > 0,
  ];
  const sectionsDone = sectionFlags.filter(Boolean).length;
  const readMins = Math.max(4, Math.round((conceptCount * 2 + practiceCount * 3 + 4)));

  return (
    <div
      className={cn(
        'relative w-full overflow-hidden rounded-[2rem] border border-[#6C63FF]/10 bg-white',
        className,
      )}
    >
      {/* Ambient background */}
      <div className="pointer-events-none absolute inset-0 bg-[#F8F7FF]" />
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 10%, rgba(108,99,255,0.14), transparent 35%), radial-gradient(circle at 85% 15%, rgba(0,194,255,0.12), transparent 30%), radial-gradient(circle at 50% 90%, rgba(139,92,246,0.1), transparent 35%)',
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(108,99,255,0.12) 1px, transparent 1px)',
          backgroundSize: '22px 22px',
        }}
      />

      <div className="relative space-y-5 p-3 sm:space-y-6 sm:p-5 lg:p-6">
        {!complete && missingSections.length > 0 ? (
          <div
            className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-base text-amber-950"
            role="status"
          >
            <p className="font-semibold">Some sections are incomplete</p>
            <p className="mt-1 text-amber-900/90">
              Showing available content below. Missing: {missingSections.join(', ')}.
            </p>
          </div>
        ) : null}

        <motion.div
          className="space-y-4"
          initial="hidden"
          animate="show"
          variants={{
            hidden: {},
            show: { transition: { staggerChildren: 0.06 } },
          }}
        >
          {(() => {
            let n = 0;
            const nextNum = () => String(++n).padStart(2, '0');
            return (
              <>
          {/* Section Title */}
          <SectionShell
            num={nextNum()}
            title="Study Guide Title"
            illustration="books"
            accent="bg-gradient-to-br from-[#6C63FF] to-[#8B5CF6]"
            gradient="bg-gradient-to-r from-[#6C63FF]/10 to-[#00C2FF]/10"
            meta={[
              { icon: Clock, label: 'Read Time', value: `${readMins} min` },
              { iconName: 'brain', label: 'Concepts', value: String(conceptCount) },
              { iconName: 'quiz', label: 'Practice', value: String(practiceCount) },
            ]}
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <h4 className="text-xl font-black leading-snug text-slate-900 sm:text-2xl">
                  {guide.title}
                </h4>
                <p className="mt-2 text-base text-slate-600">
                  Your personalized path through this topic — concepts, practice, and revision in one
                  place.
                </p>
              </div>
              <RealisticIcon
                name="books"
                alt="Books"
                className="mx-auto h-20 w-20 sm:h-24 sm:w-24"
              />
            </div>
          </SectionShell>

          {guide.chapterOverview.trim() ? (
            <SectionShell
              num={nextNum()}
              title="Chapter & Subtopic Overview"
              illustration="notebook"
              accent="bg-gradient-to-br from-sky-500 to-blue-600"
              gradient="bg-gradient-to-r from-sky-50 to-blue-50"
            >
              <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-start">
                <ExpandableText text={guide.chapterOverview} />
                <RealisticIcon
                  name="notebook"
                  alt="Notebook"
                  className="mx-auto h-20 w-20"
                />
              </div>
            </SectionShell>
          ) : null}

          {guide.learningObjectives.length > 0 ? (
            <SectionShell
              num={nextNum()}
              title="Learning Objectives"
              illustration="target"
              accent="bg-gradient-to-br from-violet-500 to-purple-600"
              gradient="bg-gradient-to-r from-violet-50 to-fuchsia-50"
            >
              <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-start">
                <CheckableTimeline items={guide.learningObjectives} tone="violet" />
                <RealisticIcon
                  name="target"
                  alt="Target"
                  className="mx-auto h-20 w-20"
                />
              </div>
            </SectionShell>
          ) : null}

          {guide.priorKnowledge.length > 0 ? (
            <SectionShell
              num={nextNum()}
              title="Prior Knowledge Required"
              illustration="graduation"
              accent="bg-gradient-to-br from-teal-500 to-cyan-600"
              gradient="bg-gradient-to-r from-teal-50 to-cyan-50"
            >
              <SelfCheckList items={guide.priorKnowledge} tone="teal" />
            </SectionShell>
          ) : null}

          {conceptCount > 0 ? (
            <SectionShell
              num={nextNum()}
              title="Key Concepts Explained"
              illustration="brain"
              accent="bg-gradient-to-br from-emerald-500 to-green-600"
              gradient="bg-gradient-to-r from-emerald-50 to-lime-50"
            >
              <div
                className={cn(
                  'grid gap-3',
                  conceptCount === 1
                    ? 'grid-cols-1'
                    : conceptCount === 2
                      ? 'sm:grid-cols-2'
                      : 'sm:grid-cols-2 lg:grid-cols-3',
                )}
              >
                {guide.keyConcepts
                  .filter((c) => c.name.trim() && c.explanation?.trim())
                  .map((c, i) => (
                    <ConceptFlipCard
                      key={`${c.name}-${i}`}
                      name={c.name}
                      explanation={c.explanation}
                      icon={(["lightbulb","brain","sparkle","target","notebook","openBook"] as const)[i % 6]}
                    />
                  ))}
              </div>
              <p className="mt-2 text-xs font-medium text-slate-400">
                Tap a card to flip it and try the quick challenge on the back.
              </p>
            </SectionShell>
          ) : null}

          {guide.definitions.length > 0 || guide.formulae.length > 0 ? (
            <SectionShell
              num={nextNum()}
              title="Definitions & Formulae"
              illustration="formula"
              accent="bg-gradient-to-br from-amber-500 to-orange-500"
              gradient="bg-gradient-to-r from-amber-50 to-orange-50"
            >
              <div className="space-y-3">
                {guide.definitions.length > 0 ? (
                  <p className="text-xs font-medium text-slate-400">Tap a term to test yourself before reading the definition.</p>
                ) : null}
                {guide.definitions.map((d, i) => (
                  <TapToRevealCard key={`def-${i}`} prompt={d.term} detail={d.definition} tone="amber" />
                ))}
                {guide.formulae.map((f, i) => (
                  <div
                    key={`fm-${i}`}
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base text-slate-800"
                  >
                    {/* Name and formula often repeat each other ("Cube: V = s³: Cube: V = s³"). */}
                    {f.name && !String(f.formula || '').toLowerCase().startsWith(String(f.name).toLowerCase()) ? (
                      <span className="font-semibold text-slate-900">{f.name}: </span>
                    ) : null}
                    <ExamMathText text={String(f.formula || f.name || '')} />
                    {f.note ? <p className="mt-1 font-sans text-xs text-slate-500">{f.note}</p> : null}
                  </div>
                ))}
              </div>
            </SectionShell>
          ) : null}

          {guide.conceptFlow.trim() ? (
            <SectionShell
              num={nextNum()}
              title="Concept Flow / Mind Map"
              illustration="mindMap"
              accent="bg-gradient-to-br from-teal-500 to-emerald-600"
              gradient="bg-gradient-to-r from-teal-50 to-emerald-50"
            >
              <StepFlowDiagram
                text={guide.conceptFlow}
                tone="teal"
                fallback={<RichTextBlock text={guide.conceptFlow} />}
              />
            </SectionShell>
          ) : null}

          {guide.realLifeExamples.length > 0 ? (
            <SectionShell
              num={nextNum()}
              title="Real-life Examples"
              illustration="globe"
              accent="bg-gradient-to-br from-lime-500 to-green-600"
              gradient="bg-gradient-to-r from-lime-50 to-green-50"
            >
              <p className="mb-2 text-xs font-medium text-slate-400">Tap an example you've noticed in real life.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {guide.realLifeExamples.map((ex, i) => (
                  <TapToMarkItem key={i} text={ex} tone="lime" iconOff="lightbulb" iconOn="star" markedStyle="highlight" />
                ))}
              </div>
            </SectionShell>
          ) : null}

          {guide.quickRevisionNotes.length > 0 ? (
            <SectionShell
              num={nextNum()}
              title="Quick Revision Notes"
              illustration="magic"
              accent="bg-gradient-to-br from-orange-500 to-amber-500"
              gradient="bg-gradient-to-r from-orange-50 to-amber-50"
            >
              <div className="rounded-3xl border border-amber-200 bg-[#FFFBEB] p-4 shadow-inner">
                <p className="mb-3 text-xs font-bold uppercase tracking-wide text-amber-800">
                  Key takeaways · tap each note once you've revised it
                </p>
                <ul className="space-y-2">
                  {guide.quickRevisionNotes.map((note, i) => (
                    <li key={i}>
                      <TapToMarkItem text={note} tone="amber" iconOff="checklist" iconOn="checklist" markedStyle="strike" />
                    </li>
                  ))}
                </ul>
              </div>
            </SectionShell>
          ) : null}

          {practiceCount > 0 ? (
            <SectionShell
              num={nextNum()}
              title="Practice Questions"
              illustration="quiz"
              accent="bg-gradient-to-br from-pink-500 to-rose-500"
              gradient="bg-gradient-to-r from-pink-50 to-rose-50"
            >
              <div className="space-y-3">
                {guide.practiceQuestions
                  .filter((q) => q.question.trim())
                  .map((q, i) => (
                    <PracticeQuestionCard key={`pq-${i}`} q={q} index={i} />
                  ))}
              </div>
            </SectionShell>
          ) : null}

          {guide.improvementTips.length > 0 ? (
            <SectionShell
              num={nextNum()}
              title="Tips for Further Improvement"
              illustration="rocket"
              accent="bg-gradient-to-br from-fuchsia-500 to-purple-600"
              gradient="bg-gradient-to-r from-fuchsia-50 to-purple-50"
            >
              <OneAtATimeCarousel items={guide.improvementTips} tone="fuchsia" icon="sparkle" />
            </SectionShell>
          ) : null}
              </>
            );
          })()}
        </motion.div>

        <div data-ai-insight-tail data-ai-focus-hide>
        <AiToolV2InsightTail
          rawContent={payload.rawContent}
          startNum={sectionsDone + 1}
          includeOverview
          overviewStats={[
            { label: 'Concepts', value: conceptCount > 0 ? String(conceptCount) : '' },
            { label: 'Practice Qs', value: practiceCount > 0 ? String(practiceCount) : '' },
            { label: 'MCQs', value: mcqCount > 0 ? String(mcqCount) : '' },
            { label: 'Sections', value: String(sectionsDone) },
            { label: 'Read time', value: `${readMins} min` },
          ].filter((s) => s.value)}
          bloomFromObjectives={guide.learningObjectives}
          bloomRows={parseBloomLevelsFromText(guide.learningObjectives)}
          competencyItems={
            guide.priorKnowledge.length > 0 ? guide.priorKnowledge : guide.learningObjectives
          }
          bestPracticesText="Study in order: overview → objectives → concepts → revision notes → practice. Attempt each question yourself before revealing the answer — it sticks better that way."
        />
        </div>

        {/* Footer gamification */}
        <div data-ai-focus-hide className="flex flex-col items-center justify-between gap-3 rounded-[1.75rem] border border-white/80 bg-white/80 px-4 py-4 text-center shadow-sm sm:flex-row sm:text-left">
          <p className="flex items-center gap-2 text-base font-medium text-slate-700">
            <RealisticIcon name="rocket" alt="" className="h-8 w-8" />
            Keep exploring, keep learning! Your journey to knowledge starts here.
          </p>
          <p className="flex items-center gap-2 text-base font-semibold text-[#6C63FF]">
            <RealisticIcon name="trophy" alt="" className="h-8 w-8" />
            AI makes learning easier — you make it meaningful.
            <RealisticIcon name="star" alt="" className="h-7 w-7" />
          </p>
        </div>
      </div>
    </div>
  );
}
