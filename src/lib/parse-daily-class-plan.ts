import { stripDisplayMarkdown } from '@/lib/parse-lesson-planner';
import { sanitizeAiDisplayText } from '@/lib/sanitize-ai-display-text';

export type DailyPlanTimeSlot = {
  time: string;
  activity: string;
  type: string;
};

export type NormalizedDailyPlan = {
  sl: number;
  title: string;
  dayPeriodBreakup: string;
  objectives: string[];
  teachingMethods: string[];
  classroomActivities: string[];
  exitTicket: string;
  differentiatedSupport: string;
  homeworkFollowup: string;
  teachingAids: string[];
  teacherReflection: string;
  timeSlots: DailyPlanTimeSlot[];
  timeline: string[];
};

export type ResolvedDailyClassPlan = {
  plans: NormalizedDailyPlan[];
  markdownFallback: string | null;
};

const SECTION_HINT: Record<number, RegExp> = {
  1: /day\s*\/\s*period|topic\s*break/i,
  2: /learning\s+objective/i,
  3: /teaching\s+method/i,
  4: /classroom\s+activit|demonstration/i,
  5: /exit\s+ticket|quick\s+assessment/i,
  6: /differentiated/i,
  7: /homework|follow[-\s]?up/i,
  8: /teaching\s+aids|required\s+teaching/i,
  9: /teacher\s+reflection/i,
};

const SECTION_HEADING_MD_RE = /^#{1,3}\s+(\d{1,2})\.\s*(.+?)\s*$/i;
const SECTION_HEADING_BOLD_RE = /^\*\*(\d{1,2})\.\s*(.+?)\*\*\s*$/i;
const SECTION_PLAIN_RE = /^(\d{1,2})\.\s+(.+?)\s*$/i;

function coalesceLines(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v
      .map((x) => stripDisplayMarkdown(String(x ?? '')))
      .filter(Boolean);
  }
  if (typeof v === 'string' && v.trim()) {
    return v
      .split(/\n+/)
      .map((line) => stripDisplayMarkdown(line.replace(/^\s*[-*•]\s*|\s*\d+[\).\s]+/i, '')))
      .filter(Boolean);
  }
  return [];
}

function coalesceText(v: unknown): string {
  if (Array.isArray(v)) {
    return stripDisplayMarkdown(v.map((x) => sanitizeAiDisplayText(x)).filter(Boolean).join('\n'));
  }
  return stripDisplayMarkdown(sanitizeAiDisplayText(v));
}

function linesToList(body: string): string[] {
  const { prose, slots } = extractTimeSlotsFromText(body);
  void slots;
  return prose
    .split(/\n+/)
    .map((line) => line.replace(/^\s*[-*•]\s*|\s*\d+[\).\s]+/i, '').trim())
    .filter(Boolean);
}

function coalesceTextField(body: string): string {
  return extractTimeSlotsFromText(body).prose;
}

function looksLikeTimeCell(value: string): boolean {
  const t = String(value || '').trim();
  if (!t) return false;
  return (
    /^\d+\s*min/i.test(t) ||
    /^\d{1,2}:\d{2}/.test(t) ||
    /^period\s*\d+/i.test(t) ||
    /^\d+\s*-\s*\d+\s*min/i.test(t)
  );
}

function isTableSeparatorLine(line: string): boolean {
  return /^\|?[\s\-:|]+\|?$/.test(line.trim()) && line.includes('-');
}

function isHeaderRow(parts: string[]): boolean {
  if (parts.length < 2) return false;
  return /^time$/i.test(parts[0]) && /activit/i.test(parts[1]);
}

function parsePipeRow(line: string, fallbackIndex: number): DailyPlanTimeSlot | null {
  const trimmed = line.trim();
  if (!trimmed.includes('|')) return null;
  if (isTableSeparatorLine(trimmed)) return null;

  const parts = trimmed
    .split('|')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  if (parts.length < 2 || isHeaderRow(parts)) return null;

  let time = '';
  let activity = '';
  let type = '';

  if (parts.length >= 3 && (looksLikeTimeCell(parts[0]) || looksLikeTimeCell(parts[1]))) {
    if (looksLikeTimeCell(parts[0])) {
      [time, activity, type] = [parts[0], parts[1], parts[2] || ''];
    } else {
      [time, activity, type] = [parts[1], parts[0], parts[2] || ''];
    }
  } else if (parts.length >= 2 && looksLikeTimeCell(parts[0])) {
    [time, activity] = [parts[0], parts[1]];
    type = parts[2] || '';
  } else if (parts.length >= 2) {
    activity = parts[0];
    type = parts[1] || 'Activity';
    time = parts.length >= 3 && looksLikeTimeCell(parts[2]) ? parts[2] : '';
  }

  activity = stripDisplayMarkdown(activity);
  time = stripDisplayMarkdown(time);
  type = stripDisplayMarkdown(type || 'Activity');

  if (!activity && !time) return null;

  if (!time) {
    time = `Period ${fallbackIndex + 1}`;
  }

  return { time, activity, type: type || 'Activity' };
}

function parseTimelineLine(line: string): DailyPlanTimeSlot | null {
  const cleaned = stripDisplayMarkdown(line.replace(/^\s*[-*•]\s*/, ''));
  const m = cleaned.match(
    /^(.+?)\s*[\-–—:]\s+(.+)$/,
  );
  if (!m) return null;
  const left = m[1].trim();
  const right = m[2].trim();
  if (!looksLikeTimeCell(left) && !/^\d+\s*min/i.test(left)) return null;
  return {
    time: left,
    activity: right,
    type: '',
  };
}

/** Pull period-grid pipe rows out of prose so they are not shown inside reflection etc. */
export function extractTimeSlotsFromText(text: string): { prose: string; slots: DailyPlanTimeSlot[] } {
  const slots: DailyPlanTimeSlot[] = [];
  const proseLines: string[] = [];

  for (const line of String(text || '').split('\n')) {
    const trimmed = line.trim();

    if (!trimmed) {
      proseLines.push('');
      continue;
    }

    if (/^#{1,3}\s*Period\s*grid/i.test(trimmed)) {
      continue;
    }

    if (isTableSeparatorLine(trimmed)) {
      continue;
    }

    const pipeSlot = parsePipeRow(line, slots.length);
    if (pipeSlot) {
      slots.push(pipeSlot);
      continue;
    }

    const timelineSlot = parseTimelineLine(trimmed);
    if (timelineSlot) {
      slots.push(timelineSlot);
      continue;
    }

    proseLines.push(line);
  }

  return {
    prose: stripDisplayMarkdown(proseLines.join('\n').replace(/\n{3,}/g, '\n\n').trim()),
    slots,
  };
}

/** A long "type" (a whole sentence) reads as a badge-shaped paragraph: move it into the text. */
function tidySlot(slot: DailyPlanTimeSlot): DailyPlanTimeSlot {
  const type = String(slot.type || '').trim();
  if (type.length <= 24) return slot;
  return { ...slot, type: 'Activity', activity: [type, slot.activity].filter(Boolean).join('\n') };
}

const slotActivityKey = (s: DailyPlanTimeSlot) =>
  String(s.activity || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * The same period arrives from several places (objectives turned into
 * "Period 1..4", the timeline, the prose), so one plan showed Period 1-4 and
 * then Period 1, 2 again. Dedupe on the activity text, and when timed periods
 * exist ("Period 1 · 40 min") show only those.
 */
export function mergeTimeSlots(...lists: DailyPlanTimeSlot[][]): DailyPlanTimeSlot[] {
  const seen = new Set<string>();
  const out: DailyPlanTimeSlot[] = [];
  for (const list of lists) {
    for (const raw of list) {
      const s = tidySlot(raw);
      const key = slotActivityKey(s) || `${s.time}|${s.type}`.toLowerCase();
      if (!key.replace(/\|/g, '').trim()) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(s);
    }
  }
  const timed = out.filter((s) => /\d+\s*min/i.test(String(s.time || '')));
  return timed.length ? timed : out;
}

function parseTimeSlotsFromMarkdown(block: string): DailyPlanTimeSlot[] {
  return extractTimeSlotsFromText(block).slots;
}

function parseTimeSlotsFromRaw(raw: Record<string, unknown>): DailyPlanTimeSlot[] {
  const fromArray = raw.time_slots;
  const slots: DailyPlanTimeSlot[] = [];
  if (Array.isArray(fromArray)) {
    for (const slot of fromArray) {
      const s = slot && typeof slot === 'object' ? (slot as Record<string, unknown>) : {};
      const time = coalesceText(s.time);
      const activity = coalesceText(s.activity);
      const type = coalesceText(s.type);
      if (time || activity) {
        slots.push({ time, activity, type: type || 'Activity' });
      }
    }
  }

  const timeline = coalesceLines(raw.timeline || raw.schedule_lines);
  for (const line of timeline) {
    const slot = parseTimelineLine(line);
    if (slot) slots.push(slot);
  }

  return slots;
}

function extractPeriodGridBlock(body: string): { bodyWithoutGrid: string; gridBlock: string } {
  const match = body.match(/###\s*Period\s*grid\s*([\s\S]*?)(?=^#{1,3}\s|\Z)/im);
  if (!match) {
    return { bodyWithoutGrid: body, gridBlock: '' };
  }
  return {
    bodyWithoutGrid: body.replace(match[0], ''),
    gridBlock: match[1] || '',
  };
}

function finalizePlan(plan: NormalizedDailyPlan, extraMarkdown = ''): NormalizedDailyPlan {
  const reflectionSplit = extractTimeSlotsFromText(plan.teacherReflection);
  const breakupSplit = extractTimeSlotsFromText(plan.dayPeriodBreakup);
  const exitSplit = extractTimeSlotsFromText(plan.exitTicket);
  const extraSplit = extractTimeSlotsFromText(extraMarkdown);

  const timelineSlots = plan.timeline
    .map((line) => parseTimelineLine(line))
    .filter((s): s is DailyPlanTimeSlot => Boolean(s));

  // Structured periods (time_slots) are the plan; lines scraped from prose
  // only fill in when there are none (they produced "3 blocks" of fragments).
  const timeSlots = plan.timeSlots.length
    ? mergeTimeSlots(plan.timeSlots)
    : mergeTimeSlots(
        plan.timeSlots,
        reflectionSplit.slots,
        breakupSplit.slots,
        exitSplit.slots,
        extraSplit.slots,
        timelineSlots,
      );

  return {
    ...plan,
    timeSlots,
    teacherReflection: reflectionSplit.prose,
    dayPeriodBreakup: breakupSplit.prose || (breakupSplit.slots.length ? '' : plan.dayPeriodBreakup),
    exitTicket: exitSplit.prose || (exitSplit.slots.length ? '' : plan.exitTicket),
    timeline: plan.timeline.filter((line) => !parseTimelineLine(line)),
  };
}

function templateSectionNumberFromLine(line: string): number | null {
  const trimmed = line.trim();
  let m = trimmed.match(SECTION_HEADING_MD_RE);
  if (m) {
    const n = Number(m[1]);
    if (n >= 1 && n <= 9) return n;
  }
  m = trimmed.match(SECTION_HEADING_BOLD_RE);
  if (m) {
    const n = Number(m[1]);
    if (n >= 1 && n <= 9) return n;
  }
  m = trimmed.match(SECTION_PLAIN_RE);
  if (m) {
    const n = Number(m[1]);
    const hint = SECTION_HINT[n];
    if (n >= 1 && n <= 9 && hint?.test(m[2])) return n;
  }
  return null;
}

function splitNumberedSections(block: string): Map<number, string> {
  const map = new Map<number, string>();
  const lines = block.split('\n');
  let currentNum: number | null = null;
  const buf: string[] = [];
  const flush = () => {
    if (currentNum != null && buf.length) {
      const body = buf.join('\n').trim();
      if (body) map.set(currentNum, body);
    }
    buf.length = 0;
  };
  for (const line of lines) {
    const sectionNum = templateSectionNumberFromLine(line);
    if (sectionNum != null) {
      flush();
      currentNum = sectionNum;
      continue;
    }
    if (currentNum != null) buf.push(line);
  }
  flush();
  return map;
}

function normalizeFromRaw(raw: Record<string, unknown>, idx: number): NormalizedDailyPlan {
  const plan: NormalizedDailyPlan = {
    sl: idx + 1,
    title:
      coalesceText(raw.title) ||
      coalesceText(raw.day_period_topic_breakup || raw.dayPeriodTopicBreakup) ||
      `Day plan ${idx + 1}`,
    dayPeriodBreakup: coalesceText(
      raw.day_period_topic_breakup || raw.dayPeriodTopicBreakup || raw.topic_breakup || raw.period_plan,
    ),
    objectives: coalesceLines(
      raw.objectives ||
        raw.period_objectives ||
        raw.learning_objectives ||
        raw.learningObjectives ||
        raw.periodObjectives,
    ),
    teachingMethods: coalesceLines(
      raw.teaching_methods || raw.teachingMethods || raw.methods || raw.pedagogy,
    ),
    classroomActivities: coalesceLines(
      raw.classroom_activity ||
        raw.classroom_activities ||
        raw.classroomActivities ||
        raw.activities ||
        raw.student_tasks,
    ),
    exitTicket: coalesceText(
      raw.exit_ticket || raw.exitTicket || raw.formative_check || raw.formativeCheck || raw.closure,
    ),
    differentiatedSupport: coalesceText(
      raw.differentiated_support || raw.differentiation || raw.differentiation_plan || raw.support_plan,
    ),
    homeworkFollowup: coalesceText(
      raw.homework_followup || raw.homeworkFollowup || raw.homework || raw.follow_up,
    ),
    teachingAids: coalesceLines(
      raw.teaching_aids || raw.teachingAids || raw.materials || raw.resources || raw.aids,
    ),
    teacherReflection: coalesceText(
      raw.teacher_reflection_notes || raw.teacherReflection || raw.reflection || raw.reflection_notes,
    ),
    timeSlots: parseTimeSlotsFromRaw(raw),
    timeline: coalesceLines(raw.timeline || raw.schedule_lines),
  };
  return finalizePlan(plan);
}

function normalizeFromSectionMap(
  title: string,
  sectionMap: Map<number, string>,
  periodGridBlock: string,
  looseSlots: DailyPlanTimeSlot[],
  idx: number,
): NormalizedDailyPlan {
  const get = (n: number) => sectionMap.get(n) || '';

  const plan: NormalizedDailyPlan = {
    sl: idx + 1,
    title: title || `Day plan ${idx + 1}`,
    dayPeriodBreakup: coalesceTextField(get(1)),
    objectives: linesToList(get(2)),
    teachingMethods: linesToList(get(3)),
    classroomActivities: linesToList(get(4)),
    exitTicket: coalesceTextField(get(5)),
    differentiatedSupport: coalesceTextField(get(6)),
    homeworkFollowup: coalesceTextField(get(7)),
    teachingAids: linesToList(get(8)),
    teacherReflection: coalesceTextField(get(9)),
    timeSlots: mergeTimeSlots(
      looseSlots,
      parseTimeSlotsFromMarkdown(periodGridBlock),
      extractTimeSlotsFromText(get(9)).slots,
    ),
    timeline: [],
  };

  return finalizePlan(plan);
}

function parseMarkdownPlans(markdown: string): NormalizedDailyPlan[] {
  const text = String(markdown || '').trim();
  if (!text) return [];

  const chunks = text.split(/^##\s+/m).filter(Boolean);
  const plans: NormalizedDailyPlan[] = [];

  chunks.forEach((chunk, idx) => {
    const lines = chunk.split('\n');
    const titleLine = lines[0]?.trim() || `Day plan ${idx + 1}`;
    const body = lines.slice(1).join('\n');
    const { bodyWithoutGrid, gridBlock } = extractPeriodGridBlock(body);
    const bodyExtracted = extractTimeSlotsFromText(bodyWithoutGrid);
    const sectionMap = splitNumberedSections(bodyExtracted.prose);
    plans.push(
      finalizePlan(
        normalizeFromSectionMap(
          stripDisplayMarkdown(titleLine),
          sectionMap,
          gridBlock,
          bodyExtracted.slots,
          idx,
        ),
      ),
    );
  });

  if (plans.length) return plans;

  const { bodyWithoutGrid, gridBlock } = extractPeriodGridBlock(text);
  const bodyExtracted = extractTimeSlotsFromText(bodyWithoutGrid);
  const sectionMap = splitNumberedSections(bodyExtracted.prose);
  if (sectionMap.size > 0 || bodyExtracted.slots.length || gridBlock.trim()) {
    return [
      finalizePlan(
        normalizeFromSectionMap('Daily class plan', sectionMap, gridBlock, bodyExtracted.slots, 0),
      ),
    ];
  }

  return [];
}

function tryParseJson(text: string): unknown {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function extractRawRecords(payload: unknown): Record<string, unknown>[] {
  if (!payload) return [];
  if (Array.isArray(payload)) {
    return payload.filter((x) => x && typeof x === 'object') as Record<string, unknown>[];
  }
  if (typeof payload !== 'object') return [];
  const obj = payload as Record<string, unknown>;
  if (obj.raw && typeof obj.raw === 'object') {
    return extractRawRecords(obj.raw);
  }
  if (Array.isArray(obj.plans)) {
    return obj.plans.filter((x) => x && typeof x === 'object') as Record<string, unknown>[];
  }
  if (Array.isArray(obj.items)) {
    return obj.items.filter((x) => x && typeof x === 'object') as Record<string, unknown>[];
  }
  return [obj];
}

export function planHasVisibleContent(plan: NormalizedDailyPlan): boolean {
  return Boolean(
    plan.title ||
      plan.dayPeriodBreakup ||
      plan.objectives.length ||
      plan.teachingMethods.length ||
      plan.classroomActivities.length ||
      plan.exitTicket ||
      plan.differentiatedSupport ||
      plan.homeworkFollowup ||
      plan.teachingAids.length ||
      plan.teacherReflection ||
      plan.timeSlots.length ||
      plan.timeline.length,
  );
}

export function resolveDailyPlansFromPayload(
  content: string,
  rawContent?: unknown,
): ResolvedDailyClassPlan {
  const records: Record<string, unknown>[] = [];

  if (rawContent) {
    records.push(...extractRawRecords(rawContent));
  }

  const parsed = tryParseJson(content);
  if (parsed) {
    records.push(...extractRawRecords(parsed));
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'formatted' in (parsed as Record<string, unknown>)
    ) {
      const inner = tryParseJson(String((parsed as Record<string, unknown>).formatted || ''));
      if (inner) records.push(...extractRawRecords(inner));
    }
  }

  const markdownPlans = parseMarkdownPlans(content);

  const uniqueRecords = records.filter(Boolean);
  if (uniqueRecords.length) {
    const plans = uniqueRecords.map((raw, idx) => {
      const fromRaw = normalizeFromRaw(raw, idx);
      const mdPeer = markdownPlans[idx] || markdownPlans[0];
      if (!mdPeer) return fromRaw;
      return finalizePlan({
        ...fromRaw,
        timeSlots: mergeTimeSlots(fromRaw.timeSlots, mdPeer.timeSlots),
        objectives: fromRaw.objectives.length ? fromRaw.objectives : mdPeer.objectives,
        teachingMethods: fromRaw.teachingMethods.length ? fromRaw.teachingMethods : mdPeer.teachingMethods,
        classroomActivities: fromRaw.classroomActivities.length
          ? fromRaw.classroomActivities
          : mdPeer.classroomActivities,
        exitTicket: fromRaw.exitTicket || mdPeer.exitTicket,
        differentiatedSupport: fromRaw.differentiatedSupport || mdPeer.differentiatedSupport,
        homeworkFollowup: fromRaw.homeworkFollowup || mdPeer.homeworkFollowup,
        teachingAids: fromRaw.teachingAids.length ? fromRaw.teachingAids : mdPeer.teachingAids,
        teacherReflection: fromRaw.teacherReflection || mdPeer.teacherReflection,
        dayPeriodBreakup: fromRaw.dayPeriodBreakup || mdPeer.dayPeriodBreakup,
      }, content);
    });
    if (plans.some(planHasVisibleContent)) {
      return { plans, markdownFallback: null };
    }
  }

  if (markdownPlans.some(planHasVisibleContent)) {
    return { plans: markdownPlans, markdownFallback: null };
  }

  return {
    plans: [],
    markdownFallback: content.trim() || null,
  };
}

export function looksLikeDailyClassPlanContent(text: string): boolean {
  const sample = String(text || '').slice(0, 16000);
  if (!sample.trim()) return false;
  const hasLabel =
    /daily\s+class\s+plan/i.test(sample) ||
    /day\s*\/\s*period[-\s]?wise/i.test(sample) ||
    /period[-\s]?wise\s+topic/i.test(sample);
  const hasSections =
    /(?:^|\n)\s*#{1,3}\s*\d{1,2}\.\s*(Day\s*\/\s*Period|Learning Objective|Teaching Method|Classroom Activit|Exit Ticket|Differentiated|Homework|Teaching Aids|Teacher Reflection)/im.test(
      sample,
    ) ||
    /(?:^|\n)\s*\d{1,2}\.\s*(Day\s*\/\s*Period|Learning Objective|Teaching Method|Classroom Activit)/im.test(
      sample,
    );
  return hasLabel || hasSections;
}
