import { AiToolStackedSection } from '@/components/ai-tool-stacked-section';
import { useMemo, useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookMarked,
  CalendarDays,
  ClipboardCheck,
  Clock3,
  Lightbulb,
  NotebookPen,
  Package,
  Target,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import ExamMathText from '@/components/exam/ExamMathText';
import { cn } from '@/lib/utils';
import { renderMarkdown } from '@/lib/render-teacher-markdown';
import { stripStructuredAiToolMetadata } from '@/lib/strip-ai-tool-metadata';
import {
  planHasVisibleContent,
  resolveDailyPlansFromPayload,
  type DailyPlanTimeSlot,
  type NormalizedDailyPlan,
} from '@/lib/parse-daily-class-plan';
import { ExpandableText, SelfCheckList, TapToMarkItem } from '@/components/ai-tool-interactive';

interface DailyClassPlanViewerProps {
  content: string;
  rawContent?: unknown;
  className?: string;
  variant?: 'default' | 'teacher' | 'student';
}

const SLOT_TYPE_STYLES: Record<string, string> = {
  teach: 'bg-violet-100 text-violet-800 border-violet-200',
  activity: 'bg-sky-100 text-sky-800 border-sky-200',
  assessment: 'bg-rose-100 text-rose-800 border-rose-200',
  discussion: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  break: 'bg-slate-100 text-slate-700 border-slate-200',
};

function slotTypeClass(type: string): string {
  const key = String(type || 'teach')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
  if (key.includes('activ')) return SLOT_TYPE_STYLES.activity;
  if (key.includes('assess') || key.includes('exit') || key.includes('quiz')) {
    return SLOT_TYPE_STYLES.assessment;
  }
  if (key.includes('discuss')) return SLOT_TYPE_STYLES.discussion;
  if (key.includes('break')) return SLOT_TYPE_STYLES.break;
  return SLOT_TYPE_STYLES.teach;
}

function BentoCard({
  title,
  icon: Icon,
  children,
  className,
  sectionNum = '1',
}: {
  title: string;
  icon: LucideIcon;
  accent?: string;
  children: ReactNode;
  className?: string;
  sectionNum?: string;
}) {
  return (
    <AiToolStackedSection num={sectionNum} title={title} icon={Icon} className={className}>
      {children}
    </AiToolStackedSection>
  );
}

function PeriodTimeline({ slots }: { slots: DailyPlanTimeSlot[] }) {
  if (!slots.length) return null;
  return (
    <div className="relative pl-1">
      <div
        className="absolute left-[15px] top-3 bottom-3 w-0.5 bg-gradient-to-b from-violet-300 via-indigo-300 to-sky-300"
        aria-hidden
      />
      <ul className="space-y-4">
        {slots.map((slot, i) => (
          <motion.li
            key={`${slot.time}-${i}`}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            className="relative flex gap-4"
          >
            <div className="relative z-10 mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-white bg-gradient-to-br from-violet-500 to-indigo-600 shadow-md shadow-indigo-200/60">
              <Clock3 className="h-3.5 w-3.5 text-white" aria-hidden />
            </div>
            <div className="min-w-0 flex-1 rounded-2xl border border-indigo-100/80 bg-white p-4 shadow-sm ring-1 ring-indigo-50">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                {/* The model sometimes restarts its own numbering ("Period 1" twice); number generic labels by position. */}
                <span className="text-base font-bold text-indigo-900">
                  {!slot.time || /^period\s*\d+$/i.test(slot.time.trim()) ? `Period ${i + 1}` : slot.time}
                </span>
                {slot.type ? (
                  <Badge variant="outline" className={cn('text-micro font-semibold', slotTypeClass(slot.type))}>
                    {slot.type}
                  </Badge>
                ) : null}
              </div>
              <p className="text-base text-slate-700 whitespace-pre-wrap leading-relaxed"><ExamMathText text={slot.activity} /></p>
            </div>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

function DayPlanBoard({ plan }: { plan: NormalizedDailyPlan }) {
  const periodCount = plan.timeSlots.length || plan.objectives.length;

  return (
    <div className="space-y-5">
      {plan.dayPeriodBreakup ? (
        <div className="rounded-2xl border border-violet-200/70 bg-gradient-to-br from-violet-50 via-white to-sky-50 p-5 shadow-sm">
          <p className="text-mini font-bold uppercase tracking-widest text-violet-600 mb-2">
            Day overview
          </p>
          <p className="text-base sm:text-lg font-semibold text-slate-900 leading-snug whitespace-pre-wrap">
            {plan.dayPeriodBreakup}
          </p>
        </div>
      ) : null}

      {plan.timeSlots.length > 0 ? (
        <div className="rounded-2xl border border-indigo-100 bg-gradient-to-b from-indigo-50/50 to-white p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h4 className="text-base font-bold text-indigo-950 flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-indigo-600" aria-hidden />
              Period timeline
            </h4>
            <Badge className="bg-indigo-600 hover:bg-indigo-600 text-white">
              {plan.timeSlots.length} block{plan.timeSlots.length !== 1 ? 's' : ''}
            </Badge>
          </div>
          <PeriodTimeline slots={plan.timeSlots} />
        </div>
      ) : null}

      <div className="flex w-full flex-col gap-4">
        {(() => {
          const cards: Array<{ title: string; icon: typeof Target; body: ReactNode }> = [];
          if (plan.objectives.length > 0) {
            cards.push({
              title: 'Learning objectives',
              icon: Target,
              body: <SelfCheckList items={plan.objectives} tone="emerald" prompt="Tap each once covered" />,
            });
          }
          if (plan.teachingMethods.length > 0) {
            cards.push({
              title: 'Teaching methods',
              icon: Lightbulb,
              body: <SelfCheckList items={plan.teachingMethods} tone="amber" prompt="Tap each once planned" />,
            });
          }
          if (plan.classroomActivities.length > 0) {
            cards.push({
              title: 'Classroom activities',
              icon: Users,
              body: <SelfCheckList items={plan.classroomActivities} tone="sky" prompt="Tap each once run" />,
            });
          }
          if (plan.exitTicket) {
            cards.push({
              title: 'Exit ticket',
              icon: ClipboardCheck,
              body: <ExpandableText text={plan.exitTicket} />,
            });
          }
          if (plan.differentiatedSupport) {
            cards.push({
              title: 'Differentiated support',
              icon: Users,
              body: <ExpandableText text={plan.differentiatedSupport} />,
            });
          }
          if (plan.homeworkFollowup) {
            cards.push({
              title: 'Homework & follow-up',
              icon: BookMarked,
              body: <ExpandableText text={plan.homeworkFollowup} />,
            });
          }
          if (plan.teachingAids.length > 0) {
            cards.push({
              title: 'Teaching aids',
              icon: Package,
              body: (
                <div className="space-y-2">
                  {plan.teachingAids.map((item, i) => (
                    <TapToMarkItem
                      key={i}
                      text={item}
                      tone="slate"
                      iconOff="notebook"
                      iconOn="checklist"
                      markedStyle="strike"
                    />
                  ))}
                </div>
              ),
            });
          }
          if (plan.teacherReflection) {
            cards.push({
              title: 'Teacher reflection notes',
              icon: NotebookPen,
              body: <ExpandableText text={plan.teacherReflection} />,
            });
          }
          if (plan.timeline.length > 0) {
            cards.push({
              title: 'Additional schedule notes',
              icon: Clock3,
              body: <SelfCheckList items={plan.timeline} tone="indigo" prompt="Tap each once reviewed" />,
            });
          }
          return cards.map((card, i) => (
            <BentoCard key={card.title} sectionNum={String(i + 1)} title={card.title} icon={card.icon}>
              {card.body}
            </BentoCard>
          ));
        })()}
      </div>

      {periodCount === 0 && !planHasVisibleContent(plan) ? (
        <p className="text-base text-slate-500 italic text-center py-6">No structured sections in this plan.</p>
      ) : null}
    </div>
  );
}

function DayBoardShell({
  planCount,
  children,
  activeTitle,
}: {
  planCount: number;
  children: ReactNode;
  activeTitle?: string;
}) {
  return (
    <div className="w-full space-y-4">
      {(activeTitle || planCount > 0) && (
        <p className="text-xs font-semibold text-indigo-900">
          {[activeTitle, planCount > 0 ? `${planCount} plan${planCount !== 1 ? 's' : ''}` : null]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}
      {children}
    </div>
  );
}

function MarkdownFallback({ markdown }: { markdown: string }) {
  return (
    <div
      className="prose prose-base max-w-none rounded-2xl border border-indigo-100 bg-white p-4 shadow-sm prose-headings:text-slate-900 prose-p:text-slate-700"
      dangerouslySetInnerHTML={{ __html: renderMarkdown(markdown) }}
    />
  );
}

export function DailyClassPlanViewer({
  content,
  rawContent,
  className,
}: DailyClassPlanViewerProps) {
  const parsedContent = useMemo(
    () => stripStructuredAiToolMetadata(String(content || '')),
    [content],
  );

  const resolved = useMemo(
    () => resolveDailyPlansFromPayload(parsedContent, rawContent),
    [parsedContent, rawContent],
  );

  const [planIdx, setPlanIdx] = useState(0);

  const useMarkdown =
    !!resolved.markdownFallback &&
    (!resolved.plans.length || !resolved.plans.some(planHasVisibleContent));

  if (useMarkdown && resolved.markdownFallback) {
    return (
      <div className={className}>
        <DayBoardShell planCount={0}>
          <MarkdownFallback markdown={resolved.markdownFallback} />
        </DayBoardShell>
      </div>
    );
  }

  if (!resolved.plans.length) {
    return (
      <div
        className={cn(
          'rounded-2xl border border-dashed border-indigo-300 bg-indigo-50/50 px-6 py-14 text-center',
          className,
        )}
      >
        <CalendarDays className="mx-auto h-10 w-10 text-indigo-500/70 mb-3" aria-hidden />
        <p className="text-base font-medium text-slate-700">No daily class plan found</p>
        <p className="text-xs text-slate-500 mt-1">Generate again or choose another topic.</p>
      </div>
    );
  }

  const safeIdx = Math.min(planIdx, resolved.plans.length - 1);
  const current = resolved.plans[safeIdx];

  return (
    <div className={className}>
      <DayBoardShell planCount={resolved.plans.length} activeTitle={current.title}>
        {resolved.plans.length > 1 ? (
          <div className="mb-4 flex flex-wrap gap-2">
            {resolved.plans.map((p, i) => (
              <button
                key={`${p.title}-${i}`}
                type="button"
                onClick={() => setPlanIdx(i)}
                className={cn(
                  'rounded-full px-4 py-1.5 text-xs font-bold transition-all max-w-full truncate',
                  i === safeIdx
                    ? 'bg-indigo-700 text-white shadow-md ring-2 ring-violet-300/50'
                    : 'bg-white text-indigo-900 border border-indigo-200 hover:bg-indigo-50',
                )}
              >
                {p.title}
              </button>
            ))}
          </div>
        ) : null}
        <AnimatePresence mode="wait">
          <motion.div
            key={safeIdx}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22 }}
          >
            <DayPlanBoard plan={current} />
          </motion.div>
        </AnimatePresence>
      </DayBoardShell>
    </div>
  );
}
