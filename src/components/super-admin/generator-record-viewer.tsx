import type { ReactNode } from 'react';
import { GeneratedRecordBody } from '@/components/super-admin/generated-record-body';
import { SixSectionViewer } from '@/components/ai-v2/six-section-viewer';
import { mapRecordToSixSectionViewer } from '@/lib/six-section-map';
import { normalizeAiToolSlug } from '@/lib/normalize-ai-tool-slug';
import {
  resolveInteractiveAiToolViewer,
} from '@/components/ai-tools/resolve-interactive-ai-tool-viewer';
import { AiToolViewerErrorBoundary } from '@/components/ai-tools/ai-tool-kit-layout';
import { displaySubtopicLabel } from '@/lib/curriculum-subtopic-display';

/** teacher/student = interactive-first; admin = SixSection-first (Super Admin browse). */
export type AiToolViewerAudience = 'teacher' | 'student' | 'admin';

function recordMeta(record: Record<string, unknown>, slug: string) {
  const val = (k: string) => String(record[k] || '').trim();
  const subtopic = displaySubtopicLabel(val('subtopic'));
  return {
    name: String(record.toolDisplayName || record.toolName || slug).trim(),
    curriculum: {
      board: val('board'),
      class: val('classLabel') || val('className'),
      subject: val('subject'),
      chapter: val('topic'),
      subtopic,
    },
    chapter: { title: val('topic'), subtopic },
  };
}

/** The six-section view the admin screen shows for a record (also used for its PDF). */
export function mapRecordToScreenSixSection(record: Record<string, unknown>) {
  const slug = normalizeAiToolSlug(record.toolSlug || record.toolName);
  return mapRecordToSixSectionViewer(slug, record, recordMeta(record, slug));
}

export function resolveViewerForRecord(
  record: Record<string, unknown>,
  slug: string,
  audience: AiToolViewerAudience = 'admin',
): ReactNode {
  // Teacher / student dashboards: interactive specialized viewers first.
  if (audience === 'teacher' || audience === 'student') {
    const interactive = resolveInteractiveAiToolViewer(record, slug, audience);
    if (interactive) return interactive;
  }

  const sixSection = mapRecordToSixSectionViewer(slug, record, recordMeta(record, slug));
  if (sixSection) {
    return <SixSectionViewer {...sixSection} />;
  }

  // Admin fallback: still try interactive if SixSection cannot map.
  if (audience === 'admin') {
    const interactive = resolveInteractiveAiToolViewer(record, slug, 'teacher');
    if (interactive) return interactive;
  }

  const generatedContent = String(record.generatedContent || record.content || '');
  return <GeneratedRecordBody content={generatedContent} toolType={slug} />;
}

export function recordUsesSixSectionViewer(record: Record<string, unknown> | null, slug: string): boolean {
  if (!record) return false;
  return mapRecordToSixSectionViewer(slug, record, recordMeta(record, slug)) != null;
}

export function GeneratorRecordViewer({
  record,
  audience = 'admin',
  wrapHost = true,
}: {
  record: Record<string, unknown> | null;
  audience?: AiToolViewerAudience;
  /** @deprecated Host wrapper removed — six-section UI is self-contained. */
  wrapHost?: boolean;
}) {
  void wrapHost;
  if (!record) return null;
  const slug = normalizeAiToolSlug(record.toolSlug || record.toolName);
  return (
    <AiToolViewerErrorBoundary fallbackTitle={String(record.toolDisplayName || record.toolName || slug)}>
      {resolveViewerForRecord(record, slug, audience)}
    </AiToolViewerErrorBoundary>
  );
}
