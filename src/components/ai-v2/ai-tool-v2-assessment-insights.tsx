import { canonicalTeacherSubjectLabel } from '@/lib/subject-names';
import type { ReactNode } from 'react';
import { Brain, CheckCircle2, Clock, GraduationCap, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatAiToolText } from '@/lib/title-case';
import { displaySubtopicLabel } from '@/lib/curriculum-subtopic-display';
import { AI_V2, BLOOM_LEVEL_STYLES } from '@/lib/ai-tool-design-tokens';
import { extractAiToolV2Context } from '@/lib/extract-ai-tool-v2-context';
import type { BloomDistributionRow } from '@/lib/parse-exam-question-paper';
import {
  AiToolV2BestPractices,
  AiToolV2BloomDistribution,
  AiToolV2CompetencyFocus,
  AiToolV2NepAlignment,
} from './ai-tool-v2-insights';
import { AiToolV2Section } from './ai-tool-v2-section';
import {
  AiToolV2DistributionDonut,
  bloomRowsToDonutRows,
  difficultyRowsFromTags,
} from './ai-tool-v2-analytics';
import { aiToolBoardLabel } from '@/lib/school-program';

const BLOOM_ORDER = ['Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate', 'Create'] as const;

export function parseBloomLevelsFromText(lines: string[]): BloomDistributionRow[] {
  const counts: Record<string, number> = {};
  const re = /\b(remember|understand|apply|analyze|analyse|evaluate|create)\b/gi;
  for (const line of lines) {
    const matches = line.match(re);
    if (!matches) continue;
    for (const raw of matches) {
      const level = raw.toLowerCase() === 'analyse' ? 'Analyze' : raw.charAt(0).toUpperCase() + raw.slice(1);
      counts[level] = (counts[level] || 0) + 1;
    }
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (!total) return [];
  return BLOOM_ORDER.filter((l) => counts[l])
    .map((level) => ({
      level,
      marks: counts[level] || 0,
      percent: Math.round(((counts[level] || 0) / total) * 100),
    }));
}

export function parseBloomLevelsFromQuestionTags(
  questions: Array<{ bloomLevel?: string; marks?: number | null }>,
): BloomDistributionRow[] {
  const totals: Record<string, number> = {};
  for (const q of questions) {
    const raw = String(q.bloomLevel || '').trim();
    if (!raw) continue;
    const level =
      BLOOM_ORDER.find((b) => raw.toLowerCase().includes(b.toLowerCase())) ||
      (raw.charAt(0).toUpperCase() + raw.slice(1) as (typeof BLOOM_ORDER)[number]);
    const weight = q.marks != null && q.marks > 0 ? q.marks : 1;
    totals[level] = (totals[level] || 0) + weight;
  }
  const total = Object.values(totals).reduce((a, b) => a + b, 0);
  if (!total) return [];
  return BLOOM_ORDER.filter((l) => totals[l])
    .map((level) => ({
      level,
      marks: totals[level] || 0,
      percent: Math.round(((totals[level] || 0) / total) * 100),
    }));
}

export function AiToolV2OverviewSnapshot({
  rawContent,
  stats,
}: {
  rawContent?: unknown;
  stats: Array<{ label: string; value: string }>;
}) {
  const ctx = extractAiToolV2Context(rawContent);
  const rows = [
    { label: 'Class', value: ctx.className },
    { label: 'Subject', value: (ctx.subject ? canonicalTeacherSubjectLabel(String(ctx.subject)) : '') },
    { label: 'Topic', value: ctx.topic },
    { label: 'Subtopic', value: displaySubtopicLabel(ctx.subtopic) },
    { label: 'Board', value: ctx.board ? aiToolBoardLabel(ctx.board) : '' },
    { label: 'Duration', value: ctx.duration ? `${ctx.duration} min` : '' },
    ...stats,
  ].filter((r) => r.value.trim());

  if (!rows.length) {
    return (
      <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs italic text-slate-500">
        Context metadata will appear when saved from the generator with class and topic selected.
      </p>
    );
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((row) => (
        <div key={row.label} className="rounded-lg border border-indigo-100 bg-white/80 px-3 py-2">
          <p className={AI_V2.typography.label}>{formatAiToolText(row.label)}</p>
          <p className="mt-0.5 text-sm font-medium text-slate-900">{formatAiToolText(row.value)}</p>
        </div>
      ))}
    </div>
  );
}

export function AiToolV2BloomBadges({ objectives }: { objectives: string[] }) {
  const levels = objectives
    .map((line) => {
      const m = line.match(/\b(Remember|Understand|Apply|Analyze|Analyse|Evaluate|Create)\b/i);
      return m ? (m[1].toLowerCase() === 'analyse' ? 'Analyze' : m[1]) : null;
    })
    .filter(Boolean) as string[];
  const unique = Array.from(new Set(levels));
  if (!unique.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {unique.map((level) => {
        const style = BLOOM_LEVEL_STYLES[level] || BLOOM_LEVEL_STYLES.Understand;
        return (
          <span
            key={level}
            className={cn(
              'rounded-full border px-2.5 py-0.5 text-mini font-semibold',
              style.bg,
              style.border,
              style.text,
            )}
          >
            {level}
          </span>
        );
      })}
    </div>
  );
}

type InsightTailProps = {
  rawContent?: unknown;
  startNum: number;
  bloomRows?: BloomDistributionRow[];
  bloomFromObjectives?: string[];
  competencyItems?: string[];
  bestPracticesText?: string;
  includeOverview?: boolean;
  overviewStats?: Array<{ label: string; value: string }>;
  difficultyTags?: string[];
  includeAnalytics?: boolean;
};

export function AiToolV2InsightTail({
  rawContent,
  startNum,
  bloomRows,
  bloomFromObjectives = [],
  competencyItems,
  bestPracticesText,
  includeOverview = false,
  overviewStats = [],
  difficultyTags = [],
  includeAnalytics = true,
}: InsightTailProps): ReactNode {
  const ctx = extractAiToolV2Context(rawContent);
  const bloom =
    bloomRows && bloomRows.length
      ? bloomRows
      : parseBloomLevelsFromText(bloomFromObjectives);
  const totalBloomMarks = bloom.reduce((s, r) => s + r.marks, 0);

  let num = startNum;
  const sections: ReactNode[] = [];

  if (includeOverview && overviewStats.length) {
    sections.push(
      <AiToolV2Section
        key="overview"
        num={num++}
        title="Content Snapshot"
        description="Generation context and quick stats"
        icon={Target}
        accent="indigo"
      >
        <AiToolV2OverviewSnapshot rawContent={rawContent} stats={overviewStats} />
      </AiToolV2Section>,
    );
  }

  if (bloom.length > 0) {
    sections.push(
      <AiToolV2Section
        key="bloom"
        num={num++}
        title="Bloom's Distribution"
        description="Cognitive level spread"
        icon={Brain}
        accent="violet"
      >
        {includeAnalytics ? (
          <div className="space-y-4">
            <AiToolV2DistributionDonut
              rows={bloomRowsToDonutRows(bloom)}
              title="Bloom levels"
              totalLabel="marks"
            />
            <AiToolV2BloomDistribution rows={bloom} totalMarks={totalBloomMarks} />
          </div>
        ) : (
          <AiToolV2BloomDistribution rows={bloom} totalMarks={totalBloomMarks} />
        )}
      </AiToolV2Section>,
    );
  } else if (ctx.bloomLevel) {
    sections.push(
      <AiToolV2Section
        key="bloom-target"
        num={num++}
        title="Bloom's Cognitive Target"
        description="Primary thinking level"
        icon={Brain}
        accent="violet"
      >
        <div className="rounded-lg border border-violet-100 bg-violet-50/50 px-3 py-2 text-sm text-violet-900">
          {ctx.bloomLevel}
        </div>
      </AiToolV2Section>,
    );
  }

  const difficultyRows = difficultyRowsFromTags([
    ...difficultyTags,
    ...(ctx.difficulty ? [ctx.difficulty] : []),
  ]);
  if (includeAnalytics && difficultyRows.length > 0) {
    sections.push(
      <AiToolV2Section
        key="difficulty"
        num={num++}
        title="Difficulty Analysis"
        description="Question difficulty spread"
        icon={Target}
        accent="amber"
      >
        <AiToolV2DistributionDonut
          rows={difficultyRows}
          title="Difficulty mix"
          totalLabel="tagged"
        />
      </AiToolV2Section>,
    );
  }

  if (competencyItems && competencyItems.length > 0) {
    sections.push(
      <AiToolV2Section
        key="competency"
        num={num++}
        title="Competency Focus"
        description="Skills assessed in this kit"
        icon={CheckCircle2}
        accent="emerald"
      >
        <AiToolV2CompetencyFocus items={competencyItems} />
      </AiToolV2Section>,
    );
  }

  if (ctx.nepNcfFocus?.trim()) {
    sections.push(
      <AiToolV2Section
        key="nep"
        num={num++}
        title="NEP / NCF Alignment"
        description="Curriculum framework alignment"
        icon={GraduationCap}
        accent="cyan"
      >
        <AiToolV2NepAlignment focusText={ctx.nepNcfFocus} />
      </AiToolV2Section>,
    );
  }

  if (bestPracticesText?.trim()) {
    sections.push(
      <AiToolV2Section
        key="practices"
        num={num++}
        title="Best Practices"
        description="How to use this in class"
        icon={Clock}
        accent="amber"
      >
        <AiToolV2BestPractices text={bestPracticesText} />
      </AiToolV2Section>,
    );
  }

  if (!sections.length) return null;
  return (
    <div data-ai-insight-tail data-ai-focus-hide className={cn(AI_V2.spacing.section, 'mt-4')}>
      {sections}
    </div>
  );
}
