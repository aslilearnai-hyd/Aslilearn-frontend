import { AiToolStackedSection } from '@/components/ai-tool-stacked-section';
import { AiToolV2InsightTail } from '@/components/ai-v2';
import { useMemo, useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileText,
  GraduationCap,
  HelpCircle,
  Lightbulb,
  ListChecks,
  MessageCircle,
  Package,
  Sparkles,
  Target,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { renderMarkdown } from '@/lib/render-teacher-markdown';
import {
  lessonHasVisibleContent,
  resolveLessonsFromPayload,
  type NormalizedLesson,
} from '@/lib/parse-lesson-planner';
import { stripStructuredAiToolMetadata } from '@/lib/strip-ai-tool-metadata';
import { AiToolMasonrySections } from '@/lib/ai-tool-section-layout';
import {
  CheckableTimeline,
  ExpandableText,
  SelfCheckList,
  TapToMarkItem,
} from '@/components/ai-tool-interactive';

interface LessonPlannerViewerProps {
  content: string;
  rawContent?: unknown;
  className?: string;
  variant?: 'default' | 'student' | 'teacher';
  /** Which 14/13-section template to use when parsing markdown and structured JSON. */
  toolKind?: 'lesson-planner' | 'study-schedule-maker' | 'auto';
}

/* ——— Shared lesson sections ——— */

type LessonSectionDef = {
  num: number;
  title: string;
  icon: LucideIcon;
  stripe: string;
  iconWrap: string;
  hasContent: (l: NormalizedLesson) => boolean;
  render: (l: NormalizedLesson) => ReactNode;
};

const STUDY_SCHEDULE_SECTIONS: LessonSectionDef[] = [
  {
    num: 2,
    title: 'Study Goal and Subtopic Link',
    icon: Target,
    stripe: 'border-cyan-500',
    iconWrap: 'bg-cyan-100 text-cyan-800',
    hasContent: (l) => !!l.studyGoalSubtopicLink,
    render: (l) => <ExpandableText text={l.studyGoalSubtopicLink} />,
  },
  {
    num: 3,
    title: 'Prior Knowledge and Readiness Check',
    icon: HelpCircle,
    stripe: 'border-violet-500',
    iconWrap: 'bg-violet-100 text-violet-800',
    hasContent: (l) => !!l.priorKnowledgeReadiness || !!l.priorKnowledge,
    render: (l) => <ExpandableText text={l.priorKnowledgeReadiness || l.priorKnowledge} />,
  },
  {
    num: 4,
    title: "Learning Objectives - Bloom's Taxonomy Aligned",
    icon: Target,
    stripe: 'border-indigo-500',
    iconWrap: 'bg-indigo-100 text-indigo-800',
    hasContent: (l) => l.learningObjectives.length > 0,
    render: (l) => <SelfCheckList items={l.learningObjectives} tone="indigo" />,
  },
  {
    num: 5,
    title: 'NCF Competency / Learning Outcome Alignment',
    icon: GraduationCap,
    stripe: 'border-blue-500',
    iconWrap: 'bg-blue-100 text-blue-800',
    hasContent: (l) => l.ncfAlignment.length > 0,
    render: (l) => <SelfCheckList items={l.ncfAlignment} tone="sky" prompt="Tap each alignment point once reviewed" />,
  },
  {
    num: 6,
    title: 'Study Plan Table',
    icon: Clock,
    stripe: 'border-amber-500',
    iconWrap: 'bg-amber-100 text-amber-900',
    hasContent: (l) => l.studyPlanTable.length > 0 || l.timeline.length > 0,
    render: (l) => (
      <CheckableTimeline items={l.studyPlanTable.length ? l.studyPlanTable : l.timeline} tone="amber" />
    ),
  },
  {
    num: 7,
    title: 'Concept Learning Slot',
    icon: BookOpen,
    stripe: 'border-teal-500',
    iconWrap: 'bg-teal-100 text-teal-800',
    hasContent: (l) => !!l.conceptLearningSlot || !!l.introductionWarmup || !!l.teachingStrategy,
    render: (l) => (
      <ExpandableText
        text={
          l.conceptLearningSlot ||
          [l.introductionWarmup, l.teachingStrategy].filter(Boolean).join('\n\n')
        }
      />
    ),
  },
  {
    num: 8,
    title: 'Practice Slot',
    icon: ListChecks,
    stripe: 'border-emerald-500',
    iconWrap: 'bg-emerald-100 text-emerald-800',
    hasContent: (l) => !!l.practiceSlot || !!l.homeworkPractice || l.studentTasks.length > 0,
    render: (l) => (
      <ExpandableText
        text={
          l.practiceSlot || [l.homeworkPractice, ...l.studentTasks].filter(Boolean).join('\n\n')
        }
      />
    ),
  },
  {
    num: 9,
    title: 'Breaks and Focus Tips',
    icon: Lightbulb,
    stripe: 'border-fuchsia-500',
    iconWrap: 'bg-fuchsia-100 text-fuchsia-800',
    hasContent: (l) => !!l.breaksFocusTips,
    render: (l) => <ExpandableText text={l.breaksFocusTips} />,
  },
  {
    num: 10,
    title: 'Self-Assessment Checkpoint',
    icon: ClipboardList,
    stripe: 'border-rose-500',
    iconWrap: 'bg-rose-100 text-rose-800',
    hasContent: (l) => !!l.selfAssessmentCheckpoint || l.formativeQuestions.length > 0,
    render: (l) => (
      <ExpandableText text={l.selfAssessmentCheckpoint || l.formativeQuestions.join('\n')} />
    ),
  },
  {
    num: 11,
    title: 'Support and Extension Plan',
    icon: Sparkles,
    stripe: 'border-pink-500',
    iconWrap: 'bg-pink-100 text-pink-800',
    hasContent: (l) => !!l.supportExtensionPlan || !!l.differentiationPlan,
    render: (l) => <ExpandableText text={l.supportExtensionPlan || l.differentiationPlan} />,
  },
  {
    num: 12,
    title: 'Expected Learning Outcomes',
    icon: GraduationCap,
    stripe: 'border-violet-500',
    iconWrap: 'bg-violet-100 text-violet-800',
    hasContent: (l) => l.expectedLearningOutcomes.length > 0,
    render: (l) => <SelfCheckList items={l.expectedLearningOutcomes} tone="violet" />,
  },
  {
    num: 13,
    title: 'Reflection / Exit Ticket',
    icon: CheckCircle2,
    stripe: 'border-cyan-600',
    iconWrap: 'bg-cyan-100 text-cyan-900',
    hasContent: (l) => !!l.reflectionExitTicket || !!l.closureExitTicket,
    render: (l) => <ExpandableText text={l.reflectionExitTicket || l.closureExitTicket} />,
  },
];

const TEACHER_LESSON_SECTIONS: LessonSectionDef[] = [
  {
    num: 2,
    title: 'Learning Objectives',
    icon: Target,
    stripe: 'border-indigo-500',
    iconWrap: 'bg-indigo-100 text-indigo-800',
    hasContent: (l) => l.learningObjectives.length > 0,
    render: (l) => <SelfCheckList items={l.learningObjectives} tone="indigo" />,
  },
  {
    num: 3,
    title: 'NCF Competency / Learning Outcome Alignment',
    icon: GraduationCap,
    stripe: 'border-blue-500',
    iconWrap: 'bg-blue-100 text-blue-800',
    hasContent: (l) => l.ncfAlignment.length > 0,
    render: (l) => <SelfCheckList items={l.ncfAlignment} tone="sky" prompt="Tap each alignment point once reviewed" />,
  },
  {
    num: 4,
    title: 'Prior Knowledge / Diagnostic Question',
    icon: HelpCircle,
    stripe: 'border-violet-500',
    iconWrap: 'bg-violet-100 text-violet-800',
    hasContent: (l) => !!l.priorKnowledgeReadiness || !!l.priorKnowledge,
    render: (l) => <ExpandableText text={l.priorKnowledgeReadiness || l.priorKnowledge} />,
  },
  {
    num: 5,
    title: 'Introduction / Warm-up',
    icon: Lightbulb,
    stripe: 'border-amber-500',
    iconWrap: 'bg-amber-100 text-amber-900',
    hasContent: (l) => !!l.introductionWarmup,
    render: (l) => <ExpandableText text={l.introductionWarmup} />,
  },
  {
    num: 6,
    title: 'Teaching Strategy',
    icon: BookOpen,
    stripe: 'border-teal-500',
    iconWrap: 'bg-teal-100 text-teal-800',
    hasContent: (l) => !!l.teachingStrategy,
    render: (l) => <ExpandableText text={l.teachingStrategy} />,
  },
  {
    num: 7,
    title: 'Classroom Activities',
    icon: ListChecks,
    stripe: 'border-emerald-500',
    iconWrap: 'bg-emerald-100 text-emerald-700',
    hasContent: (l) => l.classroomActivities.length > 0,
    render: (l) => <SelfCheckList items={l.classroomActivities} tone="emerald" prompt="Tap each once planned" />,
  },
  {
    num: 8,
    title: 'Teacher Talk Points',
    icon: MessageCircle,
    stripe: 'border-indigo-500',
    iconWrap: 'bg-indigo-100 text-indigo-700',
    hasContent: (l) => l.teacherTalkPoints.length > 0,
    render: (l) => <SelfCheckList items={l.teacherTalkPoints} tone="indigo" prompt="Tap each once covered" />,
  },
  {
    num: 9,
    title: 'Student Tasks',
    icon: Users,
    stripe: 'border-sky-500',
    iconWrap: 'bg-sky-100 text-sky-800',
    hasContent: (l) => l.studentTasks.length > 0,
    render: (l) => <SelfCheckList items={l.studentTasks} tone="sky" prompt="Tap each once assigned" />,
  },
  {
    num: 10,
    title: 'Formative Assessment Questions',
    icon: ClipboardList,
    stripe: 'border-rose-500',
    iconWrap: 'bg-rose-100 text-rose-700',
    hasContent: (l) => l.formativeQuestions.length > 0,
    render: (l) => <SelfCheckList items={l.formativeQuestions} tone="rose" prompt="Tap each once asked" />,
  },
  {
    num: 11,
    title: 'Differentiation Plan',
    icon: Sparkles,
    stripe: 'border-pink-500',
    iconWrap: 'bg-pink-100 text-pink-700',
    hasContent: (l) => !!l.differentiationPlan,
    render: (l) => <ExpandableText text={l.differentiationPlan} />,
  },
  {
    num: 12,
    title: 'Homework / Practice',
    icon: FileText,
    stripe: 'border-orange-500',
    iconWrap: 'bg-orange-100 text-orange-800',
    hasContent: (l) => !!l.homeworkPractice,
    render: (l) => <ExpandableText text={l.homeworkPractice} />,
  },
  {
    num: 13,
    title: 'Teaching Aids Required',
    icon: Package,
    stripe: 'border-amber-600',
    iconWrap: 'bg-amber-100 text-amber-900',
    hasContent: (l) => l.teachingAids.length > 0,
    render: (l) => (
      <div className="space-y-2">
        {l.teachingAids.map((item, i) => (
          <TapToMarkItem key={i} text={item} tone="amber" iconOff="notebook" iconOn="checklist" markedStyle="strike" />
        ))}
      </div>
    ),
  },
  {
    num: 14,
    title: 'Closure / Exit Ticket',
    icon: CheckCircle2,
    stripe: 'border-cyan-600',
    iconWrap: 'bg-cyan-100 text-cyan-900',
    hasContent: (l) => !!l.reflectionExitTicket || !!l.closureExitTicket,
    render: (l) => <ExpandableText text={l.reflectionExitTicket || l.closureExitTicket} />,
  },
];

const TEACHER_SECTION_PHASE: Record<number, (typeof LESSON_FLOW_PHASES)[number]['id']> = {
  2: 'prepare',
  3: 'prepare',
  4: 'prepare',
  5: 'prepare',
  6: 'teach',
  7: 'teach',
  8: 'teach',
  9: 'teach',
  10: 'wrap',
  11: 'wrap',
  12: 'wrap',
  13: 'wrap',
  14: 'wrap',
};

function countFilledLessonSections(lesson: NormalizedLesson, sections: LessonSectionDef[]): number {
  return sections.filter((s) => s.hasContent(lesson)).length;
}

function PlanSectionCard({
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

/** Teacher-only: lesson flow grouped by class phase (distinct from activity “kit” cards). */
const LESSON_FLOW_PHASES = [
  {
    id: 'prepare',
    label: 'Before class',
    hint: 'Objectives, prior knowledge & warm-up',
    dotClass: 'bg-sky-600 ring-sky-200',
    badgeClass: 'bg-sky-100 text-sky-900 border-sky-200',
  },
  {
    id: 'teach',
    label: 'During class',
    hint: 'Teaching, activities & student work',
    dotClass: 'bg-teal-600 ring-teal-200',
    badgeClass: 'bg-teal-100 text-teal-900 border-teal-200',
  },
  {
    id: 'wrap',
    label: 'Wrap-up',
    hint: 'Assessment, homework & closure',
    dotClass: 'bg-amber-600 ring-amber-200',
    badgeClass: 'bg-amber-100 text-amber-950 border-amber-200',
  },
] as const;

const SECTION_PHASE: Record<number, (typeof LESSON_FLOW_PHASES)[number]['id']> = {
  2: 'prepare',
  3: 'prepare',
  4: 'prepare',
  5: 'prepare',
  6: 'prepare',
  7: 'teach',
  8: 'teach',
  9: 'teach',
  10: 'wrap',
  11: 'wrap',
  12: 'wrap',
  13: 'wrap',
};

function PlannerTimelineStep({
  sectionNum,
  title,
  icon: Icon,
  dotClass,
  isLast,
  children,
}: {
  sectionNum: number;
  title: string;
  icon: LucideIcon;
  dotClass: string;
  isLast: boolean;
  children: ReactNode;
}) {
  return (
    <AiToolStackedSection num={String(sectionNum)} title={title} icon={Icon}>
      {children}
    </AiToolStackedSection>
  );
}

function TeacherLessonCard({
  lesson,
  rawContent,
}: {
  lesson: NormalizedLesson;
  rawContent?: unknown;
}) {
  const filled = countFilledLessonSections(lesson, TEACHER_LESSON_SECTIONS);
  const progressPct = Math.round((filled / Math.max(TEACHER_LESSON_SECTIONS.length, 1)) * 100);

  return (
    <div className="space-y-5">
      {/* Planner page header — notebook style, not “kit” hero */}
      <div className="rounded-xl border-2 border-dashed border-amber-300/70 bg-gradient-to-br from-amber-50/90 via-white to-sky-50/40 px-4 py-4 sm:px-5 sm:py-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-micro font-bold uppercase tracking-[0.2em] text-amber-800/80 mb-1">
              Lesson · Period plan
            </p>
            <h4 className="text-xl sm:text-2xl font-bold text-slate-900 leading-tight font-serif">
              {lesson.lessonName}
            </h4>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {lesson.subjectArea ? (
                <span className="text-xs text-slate-600">{lesson.subjectArea}</span>
              ) : null}
              {lesson.durationLabel ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-teal-800">
                  <Clock className="h-3.5 w-3.5" aria-hidden />
                  {lesson.durationLabel}
                </span>
              ) : null}
            </div>
          </div>
          <div className="shrink-0 w-full sm:w-36">
            <p className="text-micro font-semibold uppercase text-slate-500 mb-1">Flow ready</p>
            <div className="h-2.5 rounded-full bg-slate-200 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-sky-500 via-teal-500 to-amber-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <p className="text-mini text-slate-500 mt-1 text-right">
              {filled} block{filled === 1 ? '' : 's'}
            </p>
          </div>
        </div>
      </div>

      {(() => {
        let sectionIndex = 0;
        return LESSON_FLOW_PHASES.map((phase) => {
          const phaseSections = TEACHER_LESSON_SECTIONS.filter(
            (sec) => TEACHER_SECTION_PHASE[sec.num] === phase.id && sec.hasContent(lesson),
          );
          if (!phaseSections.length) return null;

          return (
            <section key={phase.id} aria-label={phase.label}>
              <div
                className={cn(
                  'mb-3 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2',
                  phase.badgeClass,
                )}
              >
                <span className={cn('h-2.5 w-2.5 rounded-full shrink-0', phase.dotClass.split(' ')[0])} />
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide">{phase.label}</p>
                  <p className="text-mini opacity-80">{phase.hint}</p>
                </div>
              </div>
              <div className="flex flex-col gap-4">
                {phaseSections.map((sec, idx) => {
                  sectionIndex += 1;
                  return (
                    <PlannerTimelineStep
                      key={sec.num}
                      sectionNum={sectionIndex}
                      title={sec.title}
                      icon={sec.icon}
                      dotClass={phase.dotClass}
                      isLast={idx === phaseSections.length - 1}
                    >
                      {sec.render(lesson)}
                    </PlannerTimelineStep>
                  );
                })}
              </div>
            </section>
          );
        });
      })()}

      <AiToolV2InsightTail
        rawContent={rawContent}
        startNum={filled + 1}
        includeOverview
        overviewStats={[
          { label: 'Lesson', value: lesson.lessonName },
          { label: 'Duration', value: lesson.durationLabel || '' },
          { label: 'Flow blocks', value: String(filled) },
        ].filter((s) => s.value)}
        bloomFromObjectives={lesson.learningObjectives}
        competencyItems={
          lesson.ncfAlignment.length > 0 ? lesson.ncfAlignment : lesson.learningObjectives
        }
        bestPracticesText="Follow the prepare → teach → wrap flow in order. Use formative questions mid-lesson, differentiation for mixed ability, and the exit ticket to decide homework or reteach focus for the next period."
      />
    </div>
  );
}

function TeacherLessonShell({
  lessonCount,
  bookName,
  classLabel,
  children,
}: {
  lessonCount: number;
  bookName: string;
  classLabel: string;
  children: ReactNode;
}) {
  // Document chrome provided by AiToolDocumentShell
  return (
    <div className="w-full space-y-5">
      {(classLabel || bookName || lessonCount > 0) && (
        <p className="text-xs font-semibold text-amber-900">
          {[classLabel && (/^class/i.test(String(classLabel)) ? String(classLabel) : `Class ${classLabel}`), bookName, lessonCount > 1 ? `${lessonCount} periods` : null]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}
      {children}
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

/* ——— Student UI ——— */

function StudentLessonCard({ lesson }: { lesson: NormalizedLesson }) {
  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-2xl bg-white border border-cyan-200 shadow-md">
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-50/90 via-white to-sky-50/50" />
        <div className="relative p-3 sm:p-4">
          <p className="text-micro font-bold uppercase tracking-wider text-cyan-700 mb-1">
            1. Study Schedule Title
          </p>
          <h4 className="text-xl sm:text-2xl font-bold text-slate-900 leading-snug">{lesson.lessonName}</h4>
          {(lesson.subjectArea || lesson.durationLabel) && (
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600">
              {lesson.subjectArea ? (
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5">{lesson.subjectArea}</span>
              ) : null}
              {lesson.durationLabel ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-cyan-50 px-2.5 py-0.5 text-cyan-900">
                  <Clock className="h-3 w-3" aria-hidden />
                  {lesson.durationLabel}
                </span>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <AiToolMasonrySections>
        {STUDY_SCHEDULE_SECTIONS.filter((sec) => sec.hasContent(lesson)).map((sec, i) => (
          <div key={sec.num} className="mb-2 break-inside-avoid">
            <PlanSectionCard
              sectionNum={`Section ${i + 2}`}
              title={sec.title}
              icon={sec.icon}
              stripe={sec.stripe}
              iconWrap={sec.iconWrap}
            >
              {sec.render(lesson)}
            </PlanSectionCard>
          </div>
        ))}
      </AiToolMasonrySections>
    </div>
  );
}

function StudentMarkdownBody({ markdown }: { markdown: string }) {
  return (
    <div
      className="prose prose-base max-w-none rounded-2xl border border-cyan-100 bg-white p-4 shadow-sm prose-headings:text-slate-900 prose-p:text-slate-700 prose-li:text-slate-700"
      dangerouslySetInnerHTML={{ __html: renderMarkdown(markdown) }}
    />
  );
}

function StudentLessonShell({
  lessonCount,
  bookName,
  classLabel,
  children,
}: {
  lessonCount: number;
  bookName: string;
  classLabel: string;
  children: ReactNode;
}) {
  return (
    <div className="w-full space-y-5">
      {(classLabel || bookName || lessonCount > 0) && (
        <p className="text-xs font-semibold text-cyan-900">
          {[classLabel && (/^class/i.test(String(classLabel)) ? String(classLabel) : `Class ${classLabel}`), bookName, lessonCount > 0 ? `${lessonCount} lesson${lessonCount !== 1 ? 's' : ''}` : null]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}
      {children}
    </div>
  );
}

export function LessonPlannerViewer({
  content,
  rawContent,
  className,
  variant = 'default',
  toolKind,
}: LessonPlannerViewerProps) {
  const parsedContent = useMemo(
    () => stripStructuredAiToolMetadata(String(content || '')),
    [content],
  );

  const resolvedToolKind =
    toolKind ??
    (variant === 'student' ? 'study-schedule-maker' : 'lesson-planner');

  const resolved = useMemo(
    () => resolveLessonsFromPayload(parsedContent, rawContent, { toolKind: resolvedToolKind }),
    [parsedContent, rawContent, resolvedToolKind],
  );

  const [lessonIdx, setLessonIdx] = useState(0);

  if (variant === 'student') {
    const lessons = resolved.lessons;
    const useMarkdown =
      !!resolved.markdownFallback &&
      (!lessons.length || !lessons.some(lessonHasVisibleContent));

    if (useMarkdown && resolved.markdownFallback) {
      return (
        <div className={className}>
          <StudentLessonShell
            lessonCount={0}
            bookName={resolved.book}
            classLabel={resolved.className}
          >
            <StudentMarkdownBody markdown={resolved.markdownFallback} />
          </StudentLessonShell>
        </div>
      );
    }

    if (!lessons.length) {
      return (
        <div className={cn('text-center py-12 text-gray-500', className)}>
          <p>No lesson plans found in the generated content.</p>
        </div>
      );
    }

    const safeIdx = Math.min(lessonIdx, lessons.length - 1);
    const current = lessons[safeIdx];

    return (
      <div className={className}>
        <StudentLessonShell
          lessonCount={lessons.length}
          bookName={resolved.book}
          classLabel={resolved.className}
        >
          {lessons.length > 1 ? (
            <div className="flex flex-wrap gap-2 mb-2">
              {lessons.map((l, i) => (
                <button
                  key={`${l.lessonName}-${i}`}
                  type="button"
                  onClick={() => setLessonIdx(i)}
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-bold transition-all max-w-full truncate',
                    i === safeIdx
                      ? 'bg-cyan-600 text-white shadow-md'
                      : 'bg-white text-cyan-800 border border-cyan-100',
                  )}
                >
                  {l.lessonName}
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
              <StudentLessonCard lesson={current} />
            </motion.div>
          </AnimatePresence>
        </StudentLessonShell>
      </div>
    );
  }

  const lessons = resolved.lessons;
  const useMarkdown =
    !!resolved.markdownFallback && (!lessons.length || !lessons.some(lessonHasVisibleContent));

  if (useMarkdown && resolved.markdownFallback) {
    return (
      <div className={className}>
        <TeacherLessonShell
          lessonCount={0}
          bookName={resolved.book}
          classLabel={resolved.className}
        >
          <TeacherMarkdownBody markdown={resolved.markdownFallback} />
        </TeacherLessonShell>
      </div>
    );
  }

  if (!lessons.length) {
    return (
      <div
        className={cn(
          'rounded-2xl border border-dashed border-amber-300 bg-amber-50/60 px-6 py-14 text-center',
          className,
        )}
      >
        <Calendar className="mx-auto h-10 w-10 text-amber-500/70 mb-3" aria-hidden />
        <p className="text-base font-medium text-stone-700">No lesson plan found for this selection</p>
        <p className="text-xs text-stone-500 mt-1">Try generating again or pick another topic.</p>
      </div>
    );
  }

  const safeIdx = Math.min(lessonIdx, lessons.length - 1);
  const current = lessons[safeIdx];

  return (
    <div className={className}>
      <TeacherLessonShell
        lessonCount={lessons.length}
        bookName={resolved.book}
        classLabel={resolved.className}
      >
        {lessons.length > 1 ? (
          <div className="flex flex-wrap gap-2 mb-3">
            {lessons.map((l, i) => (
              <button
                key={`${l.lessonName}-${i}`}
                type="button"
                onClick={() => setLessonIdx(i)}
                className={cn(
                  'rounded-full px-4 py-1.5 text-xs font-bold transition-all max-w-full truncate',
                  i === safeIdx
                    ? 'bg-teal-800 text-amber-50 shadow-md ring-2 ring-amber-300/50'
                    : 'bg-white text-slate-800 border border-amber-200 hover:bg-amber-50/80',
                )}
              >
                Lesson {i + 1}: {l.lessonName}
              </button>
            ))}
          </div>
        ) : null}
        <AnimatePresence mode="wait">
          <motion.div
            key={safeIdx}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
          >
            <TeacherLessonCard lesson={current} rawContent={rawContent} />
          </motion.div>
        </AnimatePresence>
      </TeacherLessonShell>
    </div>
  );
}
