import { useMemo } from 'react';
import { BookOpen, GraduationCap, Layers, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatAiToolText } from '@/lib/title-case';
import { displaySubtopicLabel } from '@/lib/curriculum-subtopic-display';
import { AI_V2 } from '@/lib/ai-tool-design-tokens';
import { extractAiToolV2Context } from '@/lib/extract-ai-tool-v2-context';
import { aiToolBoardLabel } from '@/lib/school-program';

export function AiToolV2InputSummary({
  rawContent,
  className,
}: {
  rawContent?: unknown;
  className?: string;
}) {
  const ctx = useMemo(() => extractAiToolV2Context(rawContent), [rawContent]);
  const subtopicDisplay = displaySubtopicLabel(ctx.subtopic);

  const rows = [
    { icon: GraduationCap, label: 'Class', value: ctx.className },
    { icon: BookOpen, label: 'Subject', value: ctx.subject },
    { icon: Target, label: 'Topic', value: ctx.topic },
    { icon: Layers, label: 'Subtopic', value: subtopicDisplay },
    { icon: Target, label: 'Board', value: ctx.board ? aiToolBoardLabel(ctx.board) : '' },
  ].filter((r) => r.value.trim());

  if (!rows.length) return null;

  return (
    <div
      className={cn(
        'rounded-xl border border-indigo-100 bg-gradient-to-r from-indigo-50/80 via-white to-violet-50/50 px-3 py-2.5',
        className,
      )}
    >
      <p className={cn(AI_V2.typography.label, 'mb-2 text-indigo-700')}>
        {formatAiToolText('Generation Context')}
      </p>
      <div className="flex flex-wrap gap-2">
        {rows.map((row) => {
          const Icon = row.icon;
          return (
            <span
              key={row.label}
              className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-white/80 bg-white/90 px-2.5 py-1 text-xs text-slate-700 shadow-sm"
            >
              <Icon className="h-3.5 w-3.5 shrink-0 text-indigo-500" aria-hidden />
              <span className="shrink-0 font-medium text-slate-500">{formatAiToolText(row.label)}:</span>
              <span className="min-w-0 break-words font-semibold text-slate-900">{formatAiToolText(row.value)}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
