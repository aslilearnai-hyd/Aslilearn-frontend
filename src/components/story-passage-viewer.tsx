import { AiToolStackedSection } from '@/components/ai-tool-stacked-section';
import { AiToolV2InsightTail } from '@/components/ai-v2';
import { useMemo, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BookMarked,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  HelpCircle,
  Lightbulb,
  Sparkles,
  Target,
  MessageCircle,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { AiToolMasonrySections } from '@/lib/ai-tool-section-layout';
import { renderMarkdown } from '@/lib/render-teacher-markdown';
import {
  resolveStoryFromPayload,
  type ParsedStory,
  type ParsedPassagesBundle,
  type ResolvedStoryContent,
} from '@/lib/parse-story-content';
import { stripStructuredAiToolMetadata } from '@/lib/strip-ai-tool-metadata';
import { ExpandableText, SelfCheckList, TapToRevealCard } from '@/components/ai-tool-interactive';

export type { ParsedStory, ParsedPassagesBundle };

type StoryPassageViewerProps = {
  content: string;
  rawData?: unknown;
  className?: string;
  variant?: 'default' | 'student';
};

function DefaultPassagesBundle({
  bundle,
  rawData,
}: {
  bundle: ParsedPassagesBundle;
  rawData?: unknown;
}) {
  const totalQuestions = bundle.passages.reduce((n, p) => n + p.questions.length, 0);

  return (
    <div className="max-h-[80vh] overflow-y-auto space-y-4 p-1">
      <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4">
        <h2 className="text-lg font-bold text-gray-900">{bundle.title}</h2>
        {(bundle.meta?.subject || bundle.meta?.chapter) && (
          <p className="text-base text-gray-600 mt-1">
            {[bundle.meta?.subject, bundle.meta?.book, bundle.meta?.chapter].filter(Boolean).join(' · ')}
          </p>
        )}
        {bundle.instructions ? (
          <p className="mt-3 text-base text-gray-700 bg-white rounded-lg p-3 border border-amber-100">
            {bundle.instructions}
          </p>
        ) : null}
      </div>
      {bundle.passages.map((p) => (
        <div key={p.passageNumber} className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b">
            <p className="text-base font-semibold flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-500 text-white text-xs font-bold">
                {p.passageNumber}
              </span>
              Passage {p.passageNumber}
            </p>
          </div>
          <div className="p-4 space-y-3">
            <p className="text-base leading-relaxed text-gray-800">{p.paragraph}</p>
            {p.questions.length > 0 ? (
              <ol className="list-decimal list-inside space-y-1 text-base text-gray-800 border-t pt-3">
                {p.questions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ol>
            ) : null}
          </div>
        </div>
      ))}
      <AiToolV2InsightTail
        rawContent={rawData}
        startNum={20}
        includeOverview
        overviewStats={[
          { label: 'Passages', value: String(bundle.passages.length) },
          { label: 'Comprehension Qs', value: String(totalQuestions) },
          { label: 'Subject', value: bundle.meta?.subject || '' },
          { label: 'Chapter', value: bundle.meta?.chapter || '' },
        ].filter((s) => s.value)}
        bestPracticesText="Read each passage aloud or silently, then pause for comprehension questions before moving on. Use vocabulary warm-ups when provided, and discuss answer keys as a class to build inferencing skills."
      />
    </div>
  );
}

function TeacherStoryReading({
  story,
  rawData,
}: {
  story: ParsedStory;
  rawData?: unknown;
}) {
  const comprehensionCount =
    story.readRecallQuestions.length +
    story.thinkInferQuestions.length +
    story.applyConnectQuestions.length;

  return (
    <div className="max-h-[80vh] overflow-y-auto space-y-3 p-1">
      <div className="rounded-xl border border-indigo-200 bg-indigo-50/80 p-4">
        <p className="text-micro font-bold uppercase tracking-wider text-indigo-600">Section 1</p>
        <h2 className="text-lg font-bold text-gray-900">{story.title}</h2>
      </div>
      <AiToolMasonrySections className="gap-3">
        {TEACHER_STORY_PASSAGE_SECTIONS.filter((sec) => sec.num > 1 && sec.hasContent(story)).map(
          (sec, i) => (
            <div key={sec.num} className="mb-3 break-inside-avoid">
              <StorySectionCard
                sectionNum={`Section ${i + 2}`}
                title={sec.title}
                icon={sec.icon}
                stripe={sec.stripe}
                iconWrap={sec.iconWrap}
              >
                {sec.render(story)}
              </StorySectionCard>
            </div>
          ),
        )}
      </AiToolMasonrySections>

      <AiToolV2InsightTail
        rawContent={rawData}
        startNum={
          2 +
          TEACHER_STORY_PASSAGE_SECTIONS.filter((sec) => sec.num > 1 && sec.hasContent(story)).length
        }
        includeOverview
        overviewStats={[
          { label: 'Story', value: story.title },
          { label: 'Comprehension Qs', value: comprehensionCount > 0 ? String(comprehensionCount) : '' },
          { label: 'Vocabulary', value: story.vocabulary.length > 0 ? String(story.vocabulary.length) : '' },
        ].filter((s) => s.value)}
        bloomFromObjectives={story.learningObjectives}
        competencyItems={
          story.ncfAlignment
            ? story.ncfAlignment.split(/\n+/).filter(Boolean)
            : story.learningObjectives
        }
        bestPracticesText="Run vocabulary warm-up and pre-reading prompts before the passage. Alternate choral and silent reading, then tackle comprehension in pairs before revealing suggested responses."
      />
    </div>
  );
}

type StorySectionDef = {
  num: number;
  title: string;
  icon: LucideIcon;
  stripe: string;
  iconWrap: string;
  hasContent: (s: ParsedStory) => boolean;
  render: (s: ParsedStory) => ReactNode;
};

const READING_PRACTICE_SECTIONS: StorySectionDef[] = [
  {
    num: 1,
    title: 'Reading Practice Title',
    icon: BookMarked,
    stripe: 'border-indigo-500',
    iconWrap: 'bg-indigo-100 text-indigo-700',
    hasContent: (s) => !!s.title,
    render: (s) => <p className="whitespace-pre-wrap text-base leading-relaxed font-medium">{s.title}</p>,
  },
  {
    num: 2,
    title: 'Subtopic Link and Prior Knowledge Required',
    icon: Target,
    stripe: 'border-cyan-500',
    iconWrap: 'bg-cyan-100 text-cyan-700',
    hasContent: (s) =>
      !!s.subtopicLinkPriorKnowledge || !!s.topicSubtopicConnection || !!s.priorKnowledgeRequired,
    render: (s) => (
      <ExpandableText
        text={
          s.subtopicLinkPriorKnowledge ||
          [s.topicSubtopicConnection, s.priorKnowledgeRequired].filter(Boolean).join('\n')
        }
      />
    ),
  },
  {
    num: 3,
    title: "Learning Objectives - Bloom's Taxonomy Aligned",
    icon: Target,
    stripe: 'border-violet-500',
    iconWrap: 'bg-violet-100 text-violet-700',
    hasContent: (s) => s.learningObjectives.length > 0,
    render: (s) => <SelfCheckList items={s.learningObjectives} tone="violet" />,
  },
  {
    num: 4,
    title: 'NCF Competency / Learning Outcome Alignment',
    icon: GraduationCap,
    stripe: 'border-blue-500',
    iconWrap: 'bg-blue-100 text-blue-700',
    hasContent: (s) => !!s.ncfAlignment || !!s.alignment,
    render: (s) => <ExpandableText text={s.ncfAlignment || s.alignment} />,
  },
  {
    num: 5,
    title: 'Vocabulary Warm-up',
    icon: BookMarked,
    stripe: 'border-teal-500',
    iconWrap: 'bg-teal-100 text-teal-800',
    hasContent: (s) => s.vocabulary.length > 0,
    render: (s) => (
      <div className="flex flex-wrap gap-2">
        {s.vocabulary.map((word, i) => (
          <VocabChip key={i} word={word} />
        ))}
      </div>
    ),
  },
  {
    num: 6,
    title: 'Passage / Story',
    icon: BookOpen,
    stripe: 'border-amber-500',
    iconWrap: 'bg-amber-100 text-amber-800',
    hasContent: (s) => !!s.passage,
    render: (s) => (
      <p className="text-base sm:text-lg leading-[1.85] text-slate-800 whitespace-pre-wrap">
        {s.passage}
      </p>
    ),
  },
  {
    num: 7,
    title: 'Read and Recall Questions',
    icon: HelpCircle,
    stripe: 'border-indigo-500',
    iconWrap: 'bg-indigo-100 text-indigo-700',
    hasContent: (s) => s.readRecallQuestions.length > 0 || s.questions.length > 0,
    render: (s) => (
      <SelfCheckList
        items={(s.readRecallQuestions.length ? s.readRecallQuestions : s.questions).map((q) => q.question)}
        tone="indigo"
        prompt="Tap each question once you've answered it"
      />
    ),
  },
  {
    num: 8,
    title: 'Think and Infer Questions',
    icon: HelpCircle,
    stripe: 'border-sky-500',
    iconWrap: 'bg-sky-100 text-sky-700',
    hasContent: (s) => s.thinkInferQuestions.length > 0,
    render: (s) => (
      <SelfCheckList
        items={s.thinkInferQuestions.map((q) => q.question)}
        tone="sky"
        prompt="Tap each question once you've answered it"
      />
    ),
  },
  {
    num: 9,
    title: 'Apply and Connect Questions',
    icon: HelpCircle,
    stripe: 'border-emerald-500',
    iconWrap: 'bg-emerald-100 text-emerald-700',
    hasContent: (s) => s.applyConnectQuestions.length > 0,
    render: (s) => (
      <SelfCheckList
        items={s.applyConnectQuestions.map((q) => q.question)}
        tone="emerald"
        prompt="Tap each question once you've answered it"
      />
    ),
  },
  {
    num: 10,
    title: 'Vocabulary Practice',
    icon: BookMarked,
    stripe: 'border-teal-500',
    iconWrap: 'bg-teal-100 text-teal-800',
    hasContent: (s) => s.vocabularyPractice.length > 0 || !!s.vocabularyGrammarPractice,
    render: (s) =>
      s.vocabularyPractice.length > 0 ? (
        <SelfCheckList items={s.vocabularyPractice} tone="teal" />
      ) : (
        <ExpandableText text={s.vocabularyGrammarPractice} />
      ),
  },
  {
    num: 11,
    title: 'Answer Key / Suggested Responses',
    icon: Lightbulb,
    stripe: 'border-yellow-500',
    iconWrap: 'bg-yellow-100 text-yellow-800',
    hasContent: (s) => !!s.answerKeySuggestedResponses || s.answerHints.length > 0,
    render: (s) => (
      <TapToRevealCard
        prompt="Answer key"
        detail={s.answerKeySuggestedResponses || s.answerHints.join('\n')}
        tone="amber"
        revealLabel="Show suggested responses"
      />
    ),
  },
  {
    num: 12,
    title: 'Expected Learning Outcomes',
    icon: GraduationCap,
    stripe: 'border-violet-500',
    iconWrap: 'bg-violet-100 text-violet-700',
    hasContent: (s) => !!s.expectedLearningOutcomes,
    render: (s) => <ExpandableText text={s.expectedLearningOutcomes} />,
  },
  {
    num: 13,
    title: 'Reflection / Exit Ticket',
    icon: MessageCircle,
    stripe: 'border-fuchsia-500',
    iconWrap: 'bg-fuchsia-100 text-fuchsia-700',
    hasContent: (s) => !!s.reflection,
    render: (s) => <ExpandableText text={s.reflection} />,
  },
];

function VocabChip({ word }: { word: string }) {
  const [known, setKnown] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setKnown((v) => !v)}
      className={cn(
        'rounded-xl border px-3 py-2 text-base transition-all',
        known ? 'border-teal-400 bg-teal-100 text-teal-950 font-medium' : 'border-teal-100 bg-teal-50 text-teal-900 hover:border-teal-300',
      )}
    >
      {known ? '✓ ' : ''}
      {word}
    </button>
  );
}

const TEACHER_STORY_PASSAGE_SECTIONS: StorySectionDef[] = [
  {
    num: 1,
    title: 'Story / Passage Title',
    icon: BookMarked,
    stripe: 'border-indigo-500',
    iconWrap: 'bg-indigo-100 text-indigo-700',
    hasContent: (s) => !!s.title,
    render: (s) => <p className="whitespace-pre-wrap text-base leading-relaxed font-medium">{s.title}</p>,
  },
  {
    num: 2,
    title: 'Topic and Subtopic Connection',
    icon: Target,
    stripe: 'border-cyan-500',
    iconWrap: 'bg-cyan-100 text-cyan-700',
    hasContent: (s) => !!s.topicSubtopicConnection,
    render: (s) => <p className="whitespace-pre-wrap text-base leading-relaxed">{s.topicSubtopicConnection}</p>,
  },
  {
    num: 3,
    title: 'Prior Knowledge Required',
    icon: Target,
    stripe: 'border-sky-500',
    iconWrap: 'bg-sky-100 text-sky-700',
    hasContent: (s) => !!s.priorKnowledgeRequired,
    render: (s) => <ExpandableText text={s.priorKnowledgeRequired} />,
  },
  {
    num: 4,
    title: "Learning Objectives – Bloom's Taxonomy Aligned",
    icon: Target,
    stripe: 'border-violet-500',
    iconWrap: 'bg-violet-100 text-violet-700',
    hasContent: (s) => s.learningObjectives.length > 0,
    render: (s) => <SelfCheckList items={s.learningObjectives} tone="violet" />,
  },
  {
    num: 5,
    title: 'NCF Competency / Learning Outcome Alignment',
    icon: GraduationCap,
    stripe: 'border-blue-500',
    iconWrap: 'bg-blue-100 text-blue-700',
    hasContent: (s) => !!s.ncfAlignment,
    render: (s) => <ExpandableText text={s.ncfAlignment} />,
  },
  {
    num: 6,
    title: 'Vocabulary Warm-up',
    icon: BookMarked,
    stripe: 'border-teal-500',
    iconWrap: 'bg-teal-100 text-teal-800',
    hasContent: (s) => s.vocabulary.length > 0,
    render: (s) => (
      <div className="flex flex-wrap gap-2">
        {s.vocabulary.map((word, i) => (
          <VocabChip key={i} word={word} />
        ))}
      </div>
    ),
  },
  {
    num: 7,
    title: 'Pre-reading Thinking Prompt',
    icon: Lightbulb,
    stripe: 'border-amber-500',
    iconWrap: 'bg-amber-100 text-amber-800',
    hasContent: (s) => !!s.preReadingPrompt,
    render: (s) => <ExpandableText text={s.preReadingPrompt} />,
  },
  {
    num: 8,
    title: 'Story / Passage Content',
    icon: BookOpen,
    stripe: 'border-amber-500',
    iconWrap: 'bg-amber-100 text-amber-800',
    hasContent: (s) => !!s.passage,
    render: (s) => (
      <p className="text-base sm:text-lg leading-[1.85] text-slate-800 whitespace-pre-wrap">
        {s.passage}
      </p>
    ),
  },
  {
    num: 9,
    title: 'Read and Recall Questions',
    icon: HelpCircle,
    stripe: 'border-indigo-500',
    iconWrap: 'bg-indigo-100 text-indigo-700',
    hasContent: (s) => s.readRecallQuestions.length > 0,
    render: (s) => (
      <SelfCheckList
        items={s.readRecallQuestions.map((q) => q.question)}
        tone="indigo"
        prompt="Tap each question once you've answered it"
      />
    ),
  },
  {
    num: 10,
    title: 'Think and Infer Questions',
    icon: HelpCircle,
    stripe: 'border-sky-500',
    iconWrap: 'bg-sky-100 text-sky-700',
    hasContent: (s) => s.thinkInferQuestions.length > 0,
    render: (s) => (
      <SelfCheckList
        items={s.thinkInferQuestions.map((q) => q.question)}
        tone="sky"
        prompt="Tap each question once you've answered it"
      />
    ),
  },
  {
    num: 11,
    title: 'Apply and Connect Questions',
    icon: HelpCircle,
    stripe: 'border-emerald-500',
    iconWrap: 'bg-emerald-100 text-emerald-700',
    hasContent: (s) => s.applyConnectQuestions.length > 0,
    render: (s) => (
      <SelfCheckList
        items={s.applyConnectQuestions.map((q) => q.question)}
        tone="emerald"
        prompt="Tap each question once you've answered it"
      />
    ),
  },
  {
    num: 12,
    title: 'Vocabulary and Grammar Practice',
    icon: BookMarked,
    stripe: 'border-teal-500',
    iconWrap: 'bg-teal-100 text-teal-800',
    hasContent: (s) => !!s.vocabularyGrammarPractice || s.vocabularyPractice.length > 0,
    render: (s) =>
      s.vocabularyGrammarPractice ? (
        <ExpandableText text={s.vocabularyGrammarPractice} />
      ) : (
        <SelfCheckList items={s.vocabularyPractice} tone="teal" />
      ),
  },
  {
    num: 13,
    title: 'Creative Response Activity',
    icon: Sparkles,
    stripe: 'border-purple-500',
    iconWrap: 'bg-purple-100 text-purple-700',
    hasContent: (s) => !!s.creativeResponseActivity,
    render: (s) => <ExpandableText text={s.creativeResponseActivity} />,
  },
  {
    num: 14,
    title: 'Answer Key / Suggested Responses',
    icon: Lightbulb,
    stripe: 'border-yellow-500',
    iconWrap: 'bg-yellow-100 text-yellow-800',
    hasContent: (s) => !!s.answerKeySuggestedResponses || s.answerHints.length > 0,
    render: (s) => (
      <TapToRevealCard
        prompt="Answer key"
        detail={s.answerKeySuggestedResponses || s.answerHints.join('\n')}
        tone="amber"
        revealLabel="Show suggested responses"
      />
    ),
  },
  {
    num: 15,
    title: 'Common Mistakes to Avoid',
    icon: MessageCircle,
    stripe: 'border-rose-500',
    iconWrap: 'bg-rose-100 text-rose-700',
    hasContent: (s) => !!s.commonMistakesToAvoid,
    render: (s) => <ExpandableText text={s.commonMistakesToAvoid} />,
  },
  {
    num: 16,
    title: 'Differentiation Support',
    icon: Users,
    stripe: 'border-emerald-500',
    iconWrap: 'bg-emerald-100 text-emerald-700',
    hasContent: (s) => !!s.differentiationSupport,
    render: (s) => <ExpandableText text={s.differentiationSupport} />,
  },
  {
    num: 17,
    title: 'Expected Learning Outcomes',
    icon: GraduationCap,
    stripe: 'border-violet-500',
    iconWrap: 'bg-violet-100 text-violet-700',
    hasContent: (s) => !!s.expectedLearningOutcomes,
    render: (s) => <ExpandableText text={s.expectedLearningOutcomes} />,
  },
  {
    num: 18,
    title: 'Real-life Application',
    icon: Lightbulb,
    stripe: 'border-orange-500',
    iconWrap: 'bg-orange-100 text-orange-800',
    hasContent: (s) => !!s.realLifeApplication,
    render: (s) => <ExpandableText text={s.realLifeApplication} />,
  },
  {
    num: 19,
    title: 'Reflection / Exit Ticket',
    icon: MessageCircle,
    stripe: 'border-fuchsia-500',
    iconWrap: 'bg-fuchsia-100 text-fuchsia-700',
    hasContent: (s) => !!s.reflection,
    render: (s) => <ExpandableText text={s.reflection} />,
  },
];

function StorySectionCard({
  sectionNum,
  title,
  icon: Icon,
  children,
}: {
  sectionNum: string;
  title: string;
  icon: LucideIcon;
  stripe?: string;
  iconWrap?: string;
  children: ReactNode;
}) {
  return (
    <AiToolStackedSection num={sectionNum} title={title} icon={Icon}>
      {children}
    </AiToolStackedSection>
  );
}

function StudentStoryReading({ story }: { story: ParsedStory }) {
  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-2xl bg-white border border-indigo-100 shadow-md">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/80 via-white to-violet-50/40" />
        <div className="relative p-3 sm:p-4">
          <p className="text-micro font-bold uppercase tracking-wider text-indigo-600 mb-1">
            Title of passage / story
          </p>
          <Badge className="mb-1.5 border-0 bg-indigo-100 text-indigo-800 hover:bg-indigo-100">
            Your read
          </Badge>
          <h4 className="text-xl sm:text-2xl font-bold text-slate-900 leading-snug font-serif">{story.title}</h4>
        </div>
      </div>

      <AiToolMasonrySections>
        {READING_PRACTICE_SECTIONS.filter((sec) => sec.hasContent(story)).map((sec, i) => (
          <div key={sec.num} className="mb-2 break-inside-avoid">
            <StorySectionCard
              sectionNum={`Section ${i + 1}`}
              title={sec.title}
              icon={sec.icon}
              stripe={sec.stripe}
              iconWrap={sec.iconWrap}
            >
              {sec.render(story)}
            </StorySectionCard>
          </div>
        ))}
      </AiToolMasonrySections>
    </div>
  );
}

function StudentPassagesBundle({ bundle }: { bundle: ParsedPassagesBundle }) {
  const [idx, setIdx] = useState(0);
  const safe = Math.min(idx, bundle.passages.length - 1);
  const current = bundle.passages[safe];

  return (
    <div className="space-y-2">
      <div className="rounded-2xl border border-indigo-100 bg-white p-3 sm:p-4 shadow-sm">
        <h4 className="text-lg font-bold text-slate-900">{bundle.title}</h4>
        {bundle.instructions ? (
          <p className="mt-2 text-base text-slate-600">{bundle.instructions}</p>
        ) : null}
      </div>

      {bundle.passages.length > 1 ? (
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            disabled={safe === 0}
            onClick={() => setIdx((i) => Math.max(0, i - 1))}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-indigo-200 bg-white disabled:opacity-40"
            aria-label="Previous passage"
          >
            <ChevronLeft className="h-5 w-5 text-indigo-700" />
          </button>
          <div className="flex flex-wrap justify-center gap-2">
            {bundle.passages.map((p, i) => (
              <button
                key={p.passageNumber}
                type="button"
                onClick={() => setIdx(i)}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-bold transition-all',
                  i === safe
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'bg-indigo-50 text-indigo-700 border border-indigo-100',
                )}
              >
                Passage {p.passageNumber}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={safe >= bundle.passages.length - 1}
            onClick={() => setIdx((i) => Math.min(bundle.passages.length - 1, i + 1))}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-indigo-200 bg-white disabled:opacity-40"
            aria-label="Next passage"
          >
            <ChevronRight className="h-5 w-5 text-indigo-700" />
          </button>
        </div>
      ) : null}

      <AnimatePresence mode="wait">
        <motion.div
          key={current.passageNumber}
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -12 }}
          transition={{ duration: 0.2 }}
        >
          <article className="rounded-2xl border border-amber-200/80 bg-[#fffdf8] px-5 py-6 sm:px-8 sm:py-8 shadow-inner">
            <p className="text-micro font-bold uppercase tracking-widest text-amber-800/70 mb-3">
              Passage {current.passageNumber}
            </p>
            <p className="text-base sm:text-lg leading-[1.85] text-slate-800">{current.paragraph}</p>
          </article>
          {current.questions.length > 0 ? (
            <div className="mt-2 space-y-2">
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-700">
                <HelpCircle className="h-4 w-4" aria-hidden />
                Comprehension questions
              </p>
              {current.questions.map((q, i) => (
                <div
                  key={i}
                  className="flex gap-3 rounded-xl border border-indigo-100 bg-white px-4 py-3 shadow-sm"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-xs font-bold text-white">
                    {i + 1}
                  </span>
                  <p className="text-base text-slate-800 pt-0.5">{q}</p>
                </div>
              ))}
            </div>
          ) : null}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function StudentStoryShell({
  resolved,
  children,
}: {
  resolved: ResolvedStoryContent;
  children: ReactNode;
}) {
  const count =
    resolved.mode === 'stories'
      ? resolved.stories.length
      : resolved.mode === 'passages'
        ? resolved.bundle.passages.length
        : 0;

  return (
    <div className="w-full space-y-4">
      {count > 0 ? (
        <p className="text-xs font-semibold text-teal-900">
          {count} {resolved.mode === 'passages' ? 'passages' : 'stories'}
        </p>
      ) : null}
      {children}
    </div>
  );
}

export function StoryPassageViewer({
  content,
  rawData,
  className,
  variant = 'default',
}: StoryPassageViewerProps) {
  const parsedContent = useMemo(
    () => stripStructuredAiToolMetadata(String(content || '')),
    [content],
  );

  const resolved = useMemo(
    () => resolveStoryFromPayload(parsedContent, rawData),
    [parsedContent, rawData],
  );
  const [storyIdx, setStoryIdx] = useState(0);

  if (resolved.mode === 'empty') {
    if (variant === 'student') {
      return (
        <div
          className={cn(
            'rounded-2xl border border-dashed border-indigo-200 bg-indigo-50/50 px-6 py-14 text-center',
            className,
          )}
        >
          <BookOpen className="mx-auto h-10 w-10 text-indigo-300 mb-3" aria-hidden />
          <p className="text-base font-medium text-slate-700">No story content yet</p>
          <p className="text-xs text-slate-500 mt-1">Generate again to load your reading passage.</p>
        </div>
      );
    }
    return (
      <div
        className={cn('prose prose-base max-w-none max-h-[80vh] overflow-y-auto p-4', className)}
        dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
      />
    );
  }

  if (variant === 'student') {
    if (resolved.mode === 'passages') {
      return (
        <div className={className}>
          <StudentStoryShell resolved={resolved}>
            <StudentPassagesBundle bundle={resolved.bundle} />
          </StudentStoryShell>
        </div>
      );
    }

    const stories = resolved.stories;
    const safeIdx = Math.min(storyIdx, stories.length - 1);
    const current = stories[safeIdx];

    return (
      <div className={className}>
        <StudentStoryShell resolved={resolved}>
          {stories.length > 1 ? (
            <div className="flex flex-wrap gap-2 mb-2">
              {stories.map((s, i) => (
                <button
                  key={`${s.title}-${i}`}
                  type="button"
                  onClick={() => setStoryIdx(i)}
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-bold transition-all',
                    i === safeIdx
                      ? 'bg-indigo-600 text-white shadow-md'
                      : 'bg-white text-indigo-700 border border-indigo-100',
                  )}
                >
                  {s.title}
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
              <StudentStoryReading story={current} />
            </motion.div>
          </AnimatePresence>
        </StudentStoryShell>
      </div>
    );
  }

  if (resolved.mode === 'passages') {
    return (
      <div className={className}>
        <DefaultPassagesBundle bundle={resolved.bundle} rawData={rawData} />
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {resolved.stories.map((story, i) => (
        <TeacherStoryReading key={`${story.title}-${i}`} story={story} rawData={rawData} />
      ))}
    </div>
  );
}
