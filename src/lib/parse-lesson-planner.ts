import { sanitizeAiDisplayText } from '@/lib/sanitize-ai-display-text';

export type NormalizedLesson = {
  sl: number;
  lessonName: string;
  subjectArea: string;
  durationLabel: string;
  studyGoalSubtopicLink: string;
  priorKnowledgeReadiness: string;
  learningObjectives: string[];
  ncfAlignment: string[];
  studyPlanTable: string[];
  conceptLearningSlot: string;
  practiceSlot: string;
  breaksFocusTips: string;
  selfAssessmentCheckpoint: string;
  supportExtensionPlan: string;
  expectedLearningOutcomes: string[];
  reflectionExitTicket: string;
  /** @deprecated legacy lesson-planner fields — used as fallbacks in the viewer */
  priorKnowledge: string;
  introductionWarmup: string;
  teachingStrategy: string;
  keyVocabulary: string[];
  classroomActivities: string[];
  teacherTalkPoints: string[];
  studentTasks: string[];
  formativeQuestions: string[];
  differentiationPlan: string;
  homeworkPractice: string;
  teachingAids: string[];
  closureExitTicket: string;
  timeline: string[];
  valuesAndMoral: string[];
};

export type ResolvedLessonPlanner = {
  lessons: NormalizedLesson[];
  book: string;
  className: string;
  markdownFallback: string | null;
};

export type LessonPlannerToolKind = 'lesson-planner' | 'study-schedule-maker' | 'auto';

const STUDY_SCHEDULE_SECTION_HINT: Record<number, RegExp> = {
  1: /study\s+schedule\s+title|lesson\s+title/i,
  2: /study\s+goal|subtopic\s+link/i,
  3: /prior\s+knowledge|readiness/i,
  4: /learning\s+objective/i,
  5: /ncf|competency|learning\s+outcome/i,
  6: /study\s+plan|daily\s+plan|time\s+table|timeline|schedule/i,
  7: /concept\s+learning/i,
  8: /practice\s+slot/i,
  9: /breaks|focus\s+tips/i,
  10: /self[-\s]?assessment/i,
  11: /support|extension/i,
  12: /expected\s+learning\s+outcome/i,
  13: /reflection|exit\s+ticket/i,
};

/** 14-point teacher Lesson Planner template (sections 1–14). */
const TEACHER_LESSON_SECTION_HINT: Record<number, RegExp> = {
  1: /lesson\s+title/i,
  2: /learning\s+objectives?/i,
  3: /ncf|competency|learning\s+outcome/i,
  4: /prior\s+knowledge|diagnostic/i,
  5: /introduction|warm[-\s]?up/i,
  6: /teaching\s+strategy/i,
  7: /classroom\s+activit|teaching\s+activit/i,
  8: /teacher\s+talk/i,
  9: /student\s+task/i,
  10: /formative|assessment\s+question/i,
  11: /differentiation/i,
  12: /homework|practice/i,
  13: /teaching\s+aids|materials\s+required/i,
  14: /closure|exit\s+ticket|reflection/i,
};

/** @deprecated use STUDY_SCHEDULE_SECTION_HINT */
const LESSON_SECTION_HINT = STUDY_SCHEDULE_SECTION_HINT;

function legacyStudyScheduleSectionNumFromTitle(title: string): number | null {
  const t = String(title || '').trim();
  if (!t) return null;
  if (/^introduction|warm[-\s]?up/i.test(t)) return 7;
  if (/^teaching\s+strategy/i.test(t)) return 7;
  if (/^classroom\s+activit|teaching\s+activit/i.test(t)) return 7;
  if (/^teacher\s+talk/i.test(t)) return 7;
  if (/^student\s+task/i.test(t)) return 8;
  if (/^formative|assessment\s+question/i.test(t)) return 10;
  if (/^differentiation/i.test(t)) return 11;
  if (/^homework/i.test(t)) return 8;
  if (/^teaching\s+aids|materials/i.test(t)) return 9;
  if (/^closure/i.test(t)) return 13;
  if (/^prior\s+knowledge|diagnostic/i.test(t)) return 3;
  if (/^learning\s+objectives?/i.test(t)) return 4;
  return null;
}

function legacyTeacherLessonSectionNumFromTitle(title: string): number | null {
  const t = String(title || '').trim();
  if (!t) return null;
  if (/^introduction|warm[-\s]?up/i.test(t)) return 5;
  if (/^teaching\s+strategy/i.test(t)) return 6;
  if (/^classroom\s+activit|teaching\s+activit/i.test(t)) return 7;
  if (/^teacher\s+talk/i.test(t)) return 8;
  if (/^student\s+task/i.test(t)) return 9;
  if (/^formative|assessment\s+question/i.test(t)) return 10;
  if (/^differentiation/i.test(t)) return 11;
  if (/^homework|practice/i.test(t)) return 12;
  if (/^teaching\s+aids|materials/i.test(t)) return 13;
  if (/^closure|exit\s+ticket|reflection/i.test(t)) return 14;
  if (/^prior\s+knowledge|diagnostic/i.test(t)) return 4;
  if (/^learning\s+objectives?/i.test(t)) return 2;
  if (/^ncf|competency/i.test(t)) return 3;
  if (/^lesson\s+title/i.test(t)) return 1;
  return null;
}

/** @deprecated */
function legacyLessonSectionNumFromTitle(title: string): number | null {
  return legacyStudyScheduleSectionNumFromTitle(title);
}

export function detectLessonPlannerFormat(body: string): LessonPlannerToolKind {
  const text = String(body || '');
  if (/^\s*2\.\s*Study\s+Goal/im.test(text) || /^\s*#{1,3}\s*2\.\s*Study\s+Goal/im.test(text)) {
    return 'study-schedule-maker';
  }
  if (/^\s*5\.\s*NCF/im.test(text) || /^\s*#{1,3}\s*5\.\s*NCF/im.test(text)) {
    return 'study-schedule-maker';
  }
  if (
    /^\s*5\.\s*Introduction/im.test(text) ||
    /^\s*#{1,3}\s*5\.\s*Introduction/im.test(text) ||
    /^\s*6\.\s*Teaching\s+Strategy/im.test(text) ||
    /^\s*#{1,3}\s*6\.\s*Teaching\s+Strategy/im.test(text)
  ) {
    return 'lesson-planner';
  }
  return 'auto';
}

const SECTION_HEADING_MD_RE = /^#{1,3}\s+(\d{1,2})\.\s*(.+?)\s*$/i;
const SECTION_HEADING_BOLD_RE = /^\*\*(\d{1,2})\.\s*(.+?)\*\*\s*$/i;
const SECTION_PLAIN_RE = /^(\d{1,2})\.\s+(.+?)\s*$/i;

/** Plain text for UI — no **bold**, bullets, or heading markers. */
export function stripDisplayMarkdown(text: string): string {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/_([^_\n]+)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

function stripOrderedPrefix(line: string): string {
  return stripDisplayMarkdown(
    String(line || '')
      .replace(/^\s*\d+[\).\s]+/i, '')
      .replace(/^\s*[-*•]\s*/, '')
      .trim(),
  );
}

const PERIOD_TIME_CUES_SPLIT_RE =
  /(?:\n|^)\s*(?:\*\*)?Period\s*\/\s*time\s*cues:?(?:\*\*)?\s*(?:\n|$)/i;

function splitClosureAndTimeline(raw: string): { closure: string; extraTimeline: string[] } {
  const text = String(raw || '').trim();
  if (!text) return { closure: '', extraTimeline: [] };
  const match = text.match(PERIOD_TIME_CUES_SPLIT_RE);
  if (!match || match.index == null) {
    return { closure: stripDisplayMarkdown(text), extraTimeline: [] };
  }
  const closurePart = text.slice(0, match.index).trim();
  const after = text.slice(match.index + match[0].length).trim();
  return {
    closure: stripDisplayMarkdown(closurePart),
    extraTimeline: linesToList(after),
  };
}

function mergeTimelineLists(base: string[], extra: string[]): string[] {
  if (!extra.length) return base;
  const seen = new Set(base.map((t) => t.toLowerCase()));
  const out = [...base];
  for (const item of extra) {
    const key = item.toLowerCase();
    if (!seen.has(key)) {
      out.push(item);
      seen.add(key);
    }
  }
  return out;
}

/** Build Section 6 rows from other study-schedule slots when the model omits study_plan_table. */
export function synthesizeStudyPlanTableRows(fields: {
  studyGoalSubtopicLink?: string;
  conceptLearningSlot?: string;
  practiceSlot?: string;
  breaksFocusTips?: string;
  selfAssessmentCheckpoint?: string;
}): string[] {
  const rows: string[] = [];
  const goal = String(fields.studyGoalSubtopicLink || '').trim();
  if (goal) rows.push(`Focus: ${goal}`);
  const concept = String(fields.conceptLearningSlot || '').trim();
  if (concept) rows.push(`Concept learning: ${concept}`);
  const practice = String(fields.practiceSlot || '').trim();
  if (practice) rows.push(`Practice: ${practice}`);
  const breaks = String(fields.breaksFocusTips || '').trim();
  if (breaks) rows.push(`Breaks & focus: ${breaks}`);
  const checkpoint = String(fields.selfAssessmentCheckpoint || '').trim();
  if (checkpoint) rows.push(`Self-assessment: ${checkpoint}`);
  return rows;
}

function unwrapRenderableLessonRecord(o: Record<string, unknown>): Record<string, unknown> {
  const mapped: Record<string, unknown> = {
    ...o,
    lesson_name: o.lesson_name ?? o.lessonName ?? o.title ?? o.name,
    learning_objectives: o.learning_objectives ?? o.objectives ?? o.learningObjectives,
    ncf_competency_alignment: o.ncf_competency_alignment ?? o.ncfAlignment ?? o.competencies,
    prior_knowledge_diagnostic:
      o.prior_knowledge_diagnostic ??
      o.priorKnowledgeDiagnostic ??
      o.prior_knowledge ??
      o.diagnostic_question,
    prior_knowledge_readiness_check:
      o.prior_knowledge_readiness_check ??
      o.priorKnowledgeReadinessCheck ??
      o.prior_knowledge_diagnostic,
    introduction_warmup: o.introduction_warmup ?? o.introductionWarmup ?? o.warmup ?? o.warm_up,
    teaching_strategy: o.teaching_strategy ?? o.teachingStrategy ?? o.pedagogy,
    teaching_activities:
      o.teaching_activities ?? o.activities ?? o.classroomActivities ?? o.classroom_activities,
    teacher_talk_points: o.teacher_talk_points ?? o.teacherTalkPoints ?? o.teacher_instructions,
    student_tasks: o.student_tasks ?? o.studentTasks ?? o.student_instructions,
    formative_assessment_questions:
      o.formative_assessment_questions ??
      o.formativeAssessmentQuestions ??
      o.formative_questions,
    differentiation_plan: o.differentiation_plan ?? o.differentiationPlan ?? o.differentiation,
    homework_practice: o.homework_practice ?? o.homeworkPractice ?? o.homework ?? o.practice,
    teaching_aids_required:
      o.teaching_aids_required ?? o.teachingAids ?? o.materials_required ?? o.materials,
    closure_exit_ticket:
      o.closure_exit_ticket ??
      o.closureExitTicket ??
      o.reflection_exit_ticket ??
      o.reflectionExitTicket ??
      o.exit_ticket,
    study_schedule_title:
      o.study_schedule_title ?? o.studyScheduleTitle ?? o.lesson_name ?? o.title,
    study_goal_subtopic_link: o.study_goal_subtopic_link ?? o.studyGoalSubtopicLink,
    study_plan_table: o.study_plan_table ?? o.studyPlanTable,
    concept_learning_slot: o.concept_learning_slot ?? o.conceptLearningSlot,
    practice_slot: o.practice_slot ?? o.practiceSlot,
    breaks_focus_tips: o.breaks_focus_tips ?? o.breaksFocusTips,
    self_assessment_checkpoint: o.self_assessment_checkpoint ?? o.selfAssessmentCheckpoint,
    support_extension_plan: o.support_extension_plan ?? o.supportExtensionPlan,
    expected_learning_outcomes: o.expected_learning_outcomes ?? o.expectedLearningOutcomes,
    reflection_exit_ticket: o.reflection_exit_ticket ?? o.reflectionExitTicket,
    timeline: o.timeline,
    time_slots: o.time_slots ?? o.timeSlots,
  };

  return mapped;
}

function unwrapAiToolPayload(o: Record<string, unknown>): Record<string, unknown> {
  const meta = o.metadata;
  if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
    const sc = (meta as Record<string, unknown>).structuredContent;
    if (sc && typeof sc === 'object' && !Array.isArray(sc)) {
      return unwrapRenderableLessonRecord(sc as Record<string, unknown>);
    }
  }
  const sc = o.structuredContent;
  if (sc && typeof sc === 'object' && !Array.isArray(sc)) {
    return unwrapRenderableLessonRecord(sc as Record<string, unknown>);
  }
  return unwrapRenderableLessonRecord(o);
}

/** Map time_slots / timeSlots rows to display lines (matches backend normalize). */
function linesFromTimeSlots(v: unknown): string[] {
  if (!Array.isArray(v) || !v.length) return [];
  return v
    .map((ts) => {
      if (typeof ts === 'string') return stripOrderedPrefix(ts);
      if (!ts || typeof ts !== 'object') return '';
      const row = ts as Record<string, unknown>;
      const t = String(row.time || row.duration || row.slot || '').trim();
      const a = String(
        row.activity || row.task || row.topic || row.description || row.text || '',
      ).trim();
      if (t && a) return `${t}: ${a}`;
      return a || t;
    })
    .filter(Boolean);
}

function coalesceLines(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v
      .map((x) => {
        if (typeof x === 'string') return stripOrderedPrefix(x);
        if (x && typeof x === 'object') {
          const row = x as Record<string, unknown>;
          const keys = [
            'question',
            'text',
            'prompt',
            'statement',
            'content',
            'label',
            'value',
            'item',
            'description',
            'name',
            'title',
            'body',
            'answer',
            'activity',
            'task',
            'step',
          ];
          for (const k of keys) {
            const s = String(row[k] ?? '').trim();
            if (s) return stripOrderedPrefix(s);
          }
          const first = Object.values(row).find(
            (val) => typeof val === 'string' && String(val).trim().length > 0,
          );
          if (typeof first === 'string') return stripOrderedPrefix(first);
        }
        return stripOrderedPrefix(String(x ?? ''));
      })
      .filter(Boolean);
  }
  if (typeof v === 'string' && v.trim()) {
    return v.split(/\n+/).map(stripOrderedPrefix).filter(Boolean);
  }
  return [];
}

function coalesceText(v: unknown): string {
  if (Array.isArray(v)) {
    return stripDisplayMarkdown(v.map((x) => sanitizeAiDisplayText(x)).filter(Boolean).join('\n'));
  }
  return stripDisplayMarkdown(sanitizeAiDisplayText(v));
}

function coalesceNcf(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  const t = String(v ?? '').trim();
  if (!t) return [];
  return t.split(/[;\n]+/).map((x) => x.trim()).filter(Boolean);
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function linesToList(body: string): string[] {
  return body
    .split(/\n+/)
    .map((line) => line.replace(/^\s*[-*•]\s*|\s*\d+[\).\s]+/i, '').trim())
    .filter(Boolean);
}

function linesToOrderedList(body: string): string[] {
  const lines = body.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const steps: string[] = [];
  let buf: string[] = [];
  const flush = () => {
    const text = buf.join(' ').trim();
    if (text) steps.push(text.replace(/^\s*\d+[\).\s]+/i, '').trim());
    buf = [];
  };
  for (const line of lines) {
    if (/^\d+[\).\s]+/.test(line)) {
      flush();
      buf.push(line.replace(/^\s*\d+[\).\s]+/i, '').trim());
    } else if (buf.length) {
      buf.push(line);
    } else {
      steps.push(line.replace(/^\s*[-*•]\s*/, '').trim());
    }
  }
  flush();
  return steps.filter(Boolean);
}

function templateSectionNumberFromLine(
  line: string,
  hints: Record<number, RegExp>,
  maxSection: number,
  legacyFromTitle: (title: string) => number | null,
): number | null {
  const trimmed = line.trim();
  let m = trimmed.match(SECTION_HEADING_MD_RE);
  if (m) {
    const n = Number(m[1]);
    if (n >= 1 && n <= maxSection) return n;
  }
  m = trimmed.match(SECTION_HEADING_BOLD_RE);
  if (m) {
    const n = Number(m[1]);
    if (n >= 1 && n <= maxSection) return n;
  }
  m = trimmed.match(SECTION_PLAIN_RE);
  if (m) {
    const n = Number(m[1]);
    const hint = hints[n];
    if (n >= 1 && n <= maxSection && hint?.test(m[2])) return n;
    const legacy = legacyFromTitle(m[2]);
    if (legacy != null && legacy >= 1 && legacy <= maxSection) return legacy;
  }
  return null;
}

function splitNumberedSections(
  block: string,
  format: 'lesson-planner' | 'study-schedule-maker',
): Map<number, string> {
  const hints =
    format === 'lesson-planner' ? TEACHER_LESSON_SECTION_HINT : STUDY_SCHEDULE_SECTION_HINT;
  const maxSection = format === 'lesson-planner' ? 14 : 13;
  const legacyFromTitle =
    format === 'lesson-planner'
      ? legacyTeacherLessonSectionNumFromTitle
      : legacyStudyScheduleSectionNumFromTitle;

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
    const sectionNum = templateSectionNumberFromLine(line, hints, maxSection, legacyFromTitle);
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

function durationLabelFrom(raw: Record<string, unknown>): string {
  const d = raw.duration as { periods?: number; minutes_per_period?: number } | undefined;
  if (d && typeof d === 'object') {
    const p = Number(d.periods);
    const m = Number(d.minutes_per_period);
    if (p && m) return `${p} period${p > 1 ? 's' : ''} × ${m} min`;
    if (p) return `${p} period${p > 1 ? 's' : ''}`;
  }
  return '';
}

function rawRecordFromStudyScheduleSectionMap(
  lessonName: string,
  sectionMap: Map<number, string>,
  idx: number,
): Record<string, unknown> {
  const raw: Record<string, unknown> = {
    sl_no: idx + 1,
    lesson_name: lessonName,
  };
  const get = (n: number) => sectionMap.get(n) || '';

  const goal = get(2);
  if (goal) raw.study_goal_subtopic_link = goal;

  const prior = get(3);
  if (prior) raw.prior_knowledge_readiness_check = prior;

  const lo = linesToList(get(4));
  if (lo.length) raw.learning_objectives = lo;

  const ncf = get(5);
  if (ncf) raw.ncf_competency_alignment = ncf;

  const plan = linesToOrderedList(get(6));
  if (plan.length) raw.study_plan_table = plan;

  const concept = get(7);
  if (concept) raw.concept_learning_slot = concept;

  const practice = get(8);
  if (practice) raw.practice_slot = practice;

  const breaks = get(9);
  if (breaks) raw.breaks_focus_tips = breaks;

  const checkpoint = get(10);
  if (checkpoint) raw.self_assessment_checkpoint = checkpoint;

  const support = get(11);
  if (support) raw.support_extension_plan = support;

  const outcomes = linesToList(get(12));
  if (outcomes.length) raw.expected_learning_outcomes = outcomes;

  const reflection = get(13);
  if (reflection) raw.reflection_exit_ticket = reflection;

  return raw;
}

function rawRecordFromTeacherLessonSectionMap(
  lessonName: string,
  sectionMap: Map<number, string>,
  idx: number,
): Record<string, unknown> {
  const raw: Record<string, unknown> = {
    sl_no: idx + 1,
    lesson_name: lessonName,
  };
  const get = (n: number) => sectionMap.get(n) || '';

  const title = get(1);
  if (title) raw.lesson_name = stripDisplayMarkdown(title) || lessonName;

  const lo = linesToList(get(2));
  if (lo.length) raw.learning_objectives = lo;

  const ncf = get(3);
  if (ncf) raw.ncf_competency_alignment = ncf;

  const prior = get(4);
  if (prior) raw.prior_knowledge_diagnostic = prior;

  const intro = get(5);
  if (intro) raw.introduction_warmup = intro;

  const strategy = get(6);
  if (strategy) raw.teaching_strategy = strategy;

  const acts = linesToOrderedList(get(7));
  if (acts.length) raw.teaching_activities = acts;

  const talk = linesToList(get(8));
  if (talk.length) raw.teacher_talk_points = talk;

  const tasks = linesToList(get(9));
  if (tasks.length) raw.student_tasks = tasks;

  const formative = linesToList(get(10));
  if (formative.length) raw.formative_assessment_questions = formative;

  const diff = get(11);
  if (diff) raw.differentiation_plan = diff;

  const hw = get(12);
  if (hw) raw.homework_practice = hw;

  const aids = linesToList(get(13));
  if (aids.length) raw.teaching_aids_required = aids;

  const closure = get(14);
  if (closure) raw.closure_exit_ticket = closure;

  return raw;
}

/** @deprecated use rawRecordFromStudyScheduleSectionMap */
function rawRecordFromSectionMap(
  lessonName: string,
  sectionMap: Map<number, string>,
  idx: number,
): Record<string, unknown> {
  return rawRecordFromStudyScheduleSectionMap(lessonName, sectionMap, idx);
}

export function normalizeLesson(raw: Record<string, unknown>, idx: number): NormalizedLesson {
  const o = raw || {};
  const intro = o.introduction as { activities?: string[]; time_minutes?: number } | undefined;
  const presentation = o.presentation as {
    methods?: string[];
    key_vocabulary?: string[];
  } | undefined;
  const explanation = o.explanation_discussion as { discussion_points?: string[] } | undefined;
  const classBlock = o.activities as { class_activities?: string[] } | undefined;

  const introActs = coalesceLines(intro?.activities);
  const presMethods = coalesceLines(presentation?.methods);
  const discussPoints = coalesceLines(explanation?.discussion_points);
  const classActs = coalesceLines(classBlock?.class_activities);

  const introductionWarmup =
    coalesceText(o.introduction_warmup || o.warmup || o.warm_up) ||
    (introActs.length ? introActs.join('\n') : '');

  const teachingStrategy =
    coalesceText(o.teaching_strategy || o.pedagogy || o.methodology_summary) ||
    (presMethods.length ? presMethods.join('\n') : '');

  const teacherTalkPoints = coalesceLines(
    o.teacher_talk_points || o.teacher_instructions || o.teacher_talk,
  );
  const teacherTalk = teacherTalkPoints.length > 0 ? teacherTalkPoints : discussPoints;

  const classroomActivities = coalesceLines(
    o.teaching_activities ||
      o.classroom_activities ||
      o.activities ||
      o.step_by_step_procedure ||
      o.lesson_procedure,
  );
  const activitiesOut = classroomActivities.length > 0 ? classroomActivities : classActs;

  const formativeQuestions = coalesceLines(o.formative_assessment_questions || o.formative_questions);
  const evaluation = coalesceLines(o.evaluation);
  const formative =
    formativeQuestions.length > 0
      ? formativeQuestions
      : evaluation.length > 0
        ? evaluation
        : coalesceText(o.assessment)
          ? [coalesceText(o.assessment)]
          : [];

  const teachingAids = coalesceLines(
    o.teaching_aids_required ||
      o.materials_required ||
      o.materials ||
      o.teaching_learning_materials,
  );

  const priorKnowledge =
    coalesceText(o.prior_knowledge_diagnostic || o.diagnostic_question) ||
    coalesceLines(o.previous_knowledge).join('\n');

  let timeline = coalesceLines(o.timeline || o.schedule);
  timeline = mergeTimelineLists(timeline, linesFromTimeSlots(o.time_slots ?? o.timeSlots));
  const closureSplit = splitClosureAndTimeline(
    coalesceText(o.closure_exit_ticket || o.reflection_exit_ticket || o.exit_ticket),
  );
  const closure = closureSplit.closure;
  timeline = mergeTimelineLists(timeline, closureSplit.extraTimeline);

  const studyGoalSubtopicLink = coalesceText(
    o.study_goal_subtopic_link || o.studyGoalSubtopicLink || o.subtopic_link || o.topic,
  );
  const priorKnowledgeReadiness =
    coalesceText(
      o.prior_knowledge_readiness_check ||
        o.priorKnowledgeReadinessCheck ||
        o.prior_knowledge_diagnostic ||
        o.diagnostic_question,
    ) || priorKnowledge;

  let studyPlanTable = coalesceLines(o.study_plan_table ?? o.studyPlanTable);
  if (!studyPlanTable.length) {
    studyPlanTable = mergeTimelineLists([], timeline);
  }
  if (!studyPlanTable.length) {
    const numberedActivities = activitiesOut.map((a, i) => `${i + 1}. ${a}`).slice(0, 40);
    if (numberedActivities.length) studyPlanTable = numberedActivities;
  }

  const conceptLearningSlot =
    coalesceText(o.concept_learning_slot || o.conceptLearningSlot) ||
    [introductionWarmup, teachingStrategy, ...activitiesOut.slice(0, 12)].filter(Boolean).join('\n\n');

  const practiceSlot =
    coalesceText(o.practice_slot || o.practiceSlot) ||
    [coalesceText(o.homework_practice || o.homework), ...coalesceLines(o.student_tasks || o.student_instructions)]
      .filter(Boolean)
      .join('\n\n');

  const breaksFocusTips = coalesceText(o.breaks_focus_tips || o.breaksFocusTips || o.warmup || o.warm_up);

  const selfAssessmentCheckpoint =
    coalesceText(o.self_assessment_checkpoint || o.selfAssessmentCheckpoint) ||
    (formative.length ? formative.join('\n') : '');

  const supportExtensionPlan = coalesceText(
    o.support_extension_plan || o.supportExtensionPlan || o.differentiation_plan || o.differentiation,
  );

  const expectedLearningOutcomes = coalesceLines(
    o.expected_learning_outcomes || o.expectedLearningOutcomes || o.learning_outcomes,
  );

  const reflectionExitTicket =
    coalesceText(
      o.reflection_exit_ticket || o.reflectionExitTicket || o.closure_exit_ticket || o.exit_ticket,
    ) || closure;

  if (!studyPlanTable.length) {
    studyPlanTable = synthesizeStudyPlanTableRows({
      studyGoalSubtopicLink,
      conceptLearningSlot,
      practiceSlot,
      breaksFocusTips,
      selfAssessmentCheckpoint,
    });
  }

  return {
    sl: Number(o.sl_no) || idx + 1,
    lessonName: String(
      o.study_schedule_title ||
        o.studyScheduleTitle ||
        o.lesson_name ||
        o.title ||
        o.name ||
        `Study Schedule ${idx + 1}`,
    ).trim(),
    subjectArea: String(o.subject_area || o.subject || '').trim(),
    durationLabel: durationLabelFrom(o),
    studyGoalSubtopicLink,
    priorKnowledgeReadiness,
    learningObjectives: coalesceLines(o.learning_objectives || o.objectives || o.learningObjectives),
    ncfAlignment: coalesceNcf(o.ncf_competency_alignment || o.competencies || o.ncf_alignment),
    studyPlanTable,
    conceptLearningSlot,
    practiceSlot,
    breaksFocusTips,
    selfAssessmentCheckpoint,
    supportExtensionPlan,
    expectedLearningOutcomes,
    reflectionExitTicket,
    priorKnowledge,
    introductionWarmup,
    teachingStrategy,
    keyVocabulary: coalesceLines(presentation?.key_vocabulary || o.key_vocabulary),
    classroomActivities: activitiesOut,
    teacherTalkPoints: teacherTalk,
    studentTasks: coalesceLines(o.student_tasks || o.student_instructions),
    formativeQuestions: formative,
    differentiationPlan: coalesceText(o.differentiation_plan || o.differentiation),
    homeworkPractice: coalesceText(o.homework_practice || o.homework),
    teachingAids,
    closureExitTicket: closure,
    timeline,
    valuesAndMoral: coalesceLines(o.values_and_moral),
  };
}

function pickList(a: string[], b: string[]): string[] {
  return a.length >= b.length ? a : b;
}

function pickText(a: string, b: string): string {
  return a.length >= b.length ? a : b;
}

export function mergeLessons(base: NormalizedLesson, md: NormalizedLesson, idx: number): NormalizedLesson {
  const merged = normalizeLesson(
    {
      sl_no: md.sl || base.sl || idx + 1,
      study_schedule_title: pickText(md.lessonName, base.lessonName),
      lesson_name: pickText(md.lessonName, base.lessonName),
      subject_area: pickText(md.subjectArea, base.subjectArea),
      study_goal_subtopic_link: pickText(md.studyGoalSubtopicLink, base.studyGoalSubtopicLink),
      prior_knowledge_readiness_check: pickText(md.priorKnowledgeReadiness, base.priorKnowledgeReadiness),
      learning_objectives: pickList(md.learningObjectives, base.learningObjectives),
      ncf_competency_alignment:
        md.ncfAlignment.length >= base.ncfAlignment.length ? md.ncfAlignment : base.ncfAlignment,
      study_plan_table: pickList(md.studyPlanTable, base.studyPlanTable),
      concept_learning_slot: pickText(md.conceptLearningSlot, base.conceptLearningSlot),
      practice_slot: pickText(md.practiceSlot, base.practiceSlot),
      breaks_focus_tips: pickText(md.breaksFocusTips, base.breaksFocusTips),
      self_assessment_checkpoint: pickText(md.selfAssessmentCheckpoint, base.selfAssessmentCheckpoint),
      support_extension_plan: pickText(md.supportExtensionPlan, base.supportExtensionPlan),
      expected_learning_outcomes: pickList(md.expectedLearningOutcomes, base.expectedLearningOutcomes),
      reflection_exit_ticket: pickText(md.reflectionExitTicket, base.reflectionExitTicket),
      prior_knowledge_diagnostic: pickText(md.priorKnowledge, base.priorKnowledge),
      introduction_warmup: pickText(md.introductionWarmup, base.introductionWarmup),
      teaching_strategy: pickText(md.teachingStrategy, base.teachingStrategy),
      key_vocabulary: pickList(md.keyVocabulary, base.keyVocabulary),
      teaching_activities: pickList(md.classroomActivities, base.classroomActivities),
      teacher_talk_points: pickList(md.teacherTalkPoints, base.teacherTalkPoints),
      student_tasks: pickList(md.studentTasks, base.studentTasks),
      formative_assessment_questions: pickList(md.formativeQuestions, base.formativeQuestions),
      differentiation_plan: pickText(md.differentiationPlan, base.differentiationPlan),
      homework_practice: pickText(md.homeworkPractice, base.homeworkPractice),
      teaching_aids_required: pickList(md.teachingAids, base.teachingAids),
      closure_exit_ticket: pickText(md.closureExitTicket, base.closureExitTicket),
      timeline: pickList(md.timeline, base.timeline),
      values_and_moral: pickList(md.valuesAndMoral, base.valuesAndMoral),
    },
    idx,
  );
  return merged;
}

export function lessonHasVisibleContent(lesson: NormalizedLesson): boolean {
  return (
    !!lesson.studyGoalSubtopicLink ||
    !!lesson.priorKnowledgeReadiness ||
    lesson.learningObjectives.length > 0 ||
    lesson.ncfAlignment.length > 0 ||
    lesson.studyPlanTable.length > 0 ||
    !!lesson.conceptLearningSlot ||
    !!lesson.practiceSlot ||
    !!lesson.breaksFocusTips ||
    !!lesson.selfAssessmentCheckpoint ||
    !!lesson.supportExtensionPlan ||
    lesson.expectedLearningOutcomes.length > 0 ||
    !!lesson.reflectionExitTicket ||
    !!lesson.priorKnowledge ||
    !!lesson.introductionWarmup ||
    !!lesson.teachingStrategy ||
    lesson.keyVocabulary.length > 0 ||
    lesson.classroomActivities.length > 0 ||
    lesson.teacherTalkPoints.length > 0 ||
    lesson.studentTasks.length > 0 ||
    lesson.formativeQuestions.length > 0 ||
    !!lesson.differentiationPlan ||
    !!lesson.homeworkPractice ||
    lesson.teachingAids.length > 0 ||
    !!lesson.closureExitTicket ||
    lesson.timeline.length > 0 ||
    lesson.valuesAndMoral.length > 0
  );
}

function parseLessonBlock(
  block: string,
  index: number,
  format: 'lesson-planner' | 'study-schedule-maker' = 'study-schedule-maker',
): NormalizedLesson | null {
  const trimmed = htmlToPlainText(block).trim();
  if (!trimmed) return null;

  const titleMatch = trimmed.match(/^##\s*Lesson\s*(\d+)\s*:\s*(.+?)(?:\n|$)/im);
  const h2Match = trimmed.match(/^##\s+(.+?)(?:\n|$)/m);
  const h3Match = trimmed.match(/^###\s+(.+?)(?:\n|$)/m);

  const sl = titleMatch ? Number(titleMatch[1]) : index + 1;
  let lessonName = titleMatch
    ? titleMatch[2].trim()
    : h2Match
      ? h2Match[1].replace(/^Lesson\s*\d+\s*:\s*/i, '').trim()
      : h3Match
        ? h3Match[1].trim()
        : `Lesson ${sl}`;

  if (/^lesson\s+planner$/i.test(lessonName)) {
    lessonName = `Lesson ${sl}`;
  }

  const bodyStart = titleMatch
    ? trimmed.slice(titleMatch.index! + titleMatch[0].length)
    : h2Match
      ? trimmed.slice(h2Match.index! + h2Match[0].length)
      : h3Match
        ? trimmed.slice(h3Match.index! + h3Match[0].length)
        : trimmed;

  const resolvedFormat =
    format === 'lesson-planner'
      ? 'lesson-planner'
      : detectLessonPlannerFormat(bodyStart) === 'lesson-planner'
        ? 'lesson-planner'
        : 'study-schedule-maker';

  const sectionMap = splitNumberedSections(bodyStart, resolvedFormat);
  const raw =
    resolvedFormat === 'lesson-planner'
      ? rawRecordFromTeacherLessonSectionMap(lessonName, sectionMap, index)
      : rawRecordFromStudyScheduleSectionMap(lessonName, sectionMap, index);
  return normalizeLesson(raw, index);
}

export function parseLessonsFromMarkdown(
  content: string,
  format: LessonPlannerToolKind = 'auto',
): NormalizedLesson[] {
  const text = htmlToPlainText(String(content || '').replace(/\r\n/g, '\n')).trim();
  if (!text) return [];

  const resolvedFormat: 'lesson-planner' | 'study-schedule-maker' =
    format === 'lesson-planner'
      ? 'lesson-planner'
      : format === 'study-schedule-maker'
        ? 'study-schedule-maker'
        : detectLessonPlannerFormat(text) === 'lesson-planner'
          ? 'lesson-planner'
          : 'study-schedule-maker';

  let blocks: string[] = [];
  if (/__LESSON_CARD_START__/i.test(text)) {
    blocks = text
      .split(/__LESSON_CARD_(?:START|END)__/i)
      .map((b) => b.trim())
      .filter((b) => b.length > 20 && !/^END\s*$/i.test(b));
  }

  if (blocks.length === 0) {
    blocks = text.split(/(?=^##\s+Lesson\s+\d+)/im).filter((b) => b.trim());
  }
  if (blocks.length <= 1 && /^##\s+/im.test(text)) {
    const parts = text.split(/(?=^##\s+)/im).filter((b) => b.trim());
    if (parts.length > 1) blocks = parts.filter((p) => !/^##\s*📚/i.test(p) && !/^##\s*lesson\s+planner/i.test(p));
  }

  if (blocks.length >= 1) {
    const parsed = blocks
      .map((b, i) => parseLessonBlock(b, i, resolvedFormat))
      .filter((l): l is NormalizedLesson => !!l && lessonHasVisibleContent(l));
    if (parsed.length) return parsed;
    const titled = blocks
      .map((b, i) => parseLessonBlock(b, i, resolvedFormat))
      .filter((l): l is NormalizedLesson => !!l);
    if (titled.length) return titled;
  }

  if (/^\d+\.\s+/m.test(text) || /^#{1,3}\s*\d+\./m.test(text)) {
    const single = parseLessonBlock(text, 0, resolvedFormat);
    return single ? [single] : [];
  }

  const h2 = text.match(/^##\s+(.+)$/m);
  if (h2) {
    const single = parseLessonBlock(text, 0, resolvedFormat);
    return single ? [single] : [normalizeLesson({ lesson_name: h2[1].trim() }, 0)];
  }

  return [];
}

/** Pull lesson rows from API raw payloads (object, array, or single lesson). */
export function extractLessonRecords(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) {
    return raw
      .filter((x) => x && typeof x === 'object')
      .map((x) => unwrapAiToolPayload(x as Record<string, unknown>));
  }
  if (!raw || typeof raw !== 'object') return [];

  const o = raw as Record<string, unknown>;
  const unwrapped = unwrapAiToolPayload(o);

  for (const key of ['lessons', 'lesson_plans', 'lessonPlans', 'lesson_plan', 'items', 'plans']) {
    const v = o[key];
    if (Array.isArray(v) && v.length) {
      return v
        .filter((x) => x && typeof x === 'object')
        .map((x) => unwrapAiToolPayload(x as Record<string, unknown>));
    }
  }

  if (
    unwrapped.lesson_name ||
    unwrapped.title ||
    unwrapped.name ||
    unwrapped.study_schedule_title ||
    unwrapped.studyScheduleTitle ||
    unwrapped.learning_objectives ||
    unwrapped.objectives ||
    unwrapped.teaching_activities ||
    unwrapped.introduction_warmup ||
    unwrapped.introductionWarmup ||
    unwrapped.teaching_strategy ||
    unwrapped.teachingStrategy ||
    unwrapped.study_plan_table ||
    unwrapped.studyPlanTable ||
    unwrapped.concept_learning_slot ||
    unwrapped.conceptLearningSlot
  ) {
    return [unwrapped];
  }

  if (o.raw && typeof o.raw === 'object') return extractLessonRecords(o.raw);
  if (o.data && typeof o.data === 'object') return extractLessonRecords(o.data);

  return [];
}

function structuredLessonHasTeacherBody(record: Record<string, unknown>): boolean {
  const keys = [
    'introduction_warmup',
    'introductionWarmup',
    'teaching_strategy',
    'teachingStrategy',
    'teaching_activities',
    'activities',
    'teacher_talk_points',
    'teacherTalkPoints',
    'student_tasks',
    'studentTasks',
    'formative_assessment_questions',
    'formativeAssessmentQuestions',
    'differentiation_plan',
    'differentiationPlan',
    'homework_practice',
    'homeworkPractice',
    'teaching_aids_required',
    'teachingAids',
    'closure_exit_ticket',
    'closureExitTicket',
  ];
  return keys.some((k) => {
    const v = record[k];
    if (Array.isArray(v)) return v.length > 0;
    return String(v ?? '').trim().length > 0;
  });
}

export function lessonPlannerDisplayMarkdown(content: string, rawContent?: unknown): string | null {
  try {
    const d = JSON.parse(content) as { formatted?: string; markdown?: string };
    if (d.formatted != null && String(d.formatted).trim()) return String(d.formatted);
    if (d.markdown != null && String(d.markdown).trim()) return String(d.markdown);
  } catch {
    /* plain text */
  }
  if (rawContent && typeof rawContent === 'object' && rawContent !== null) {
    const m = String((rawContent as { markdown?: string }).markdown || '').trim();
    if (m) return m;
  }
  const t = String(content || '').trim();
  if (!t.startsWith('{') && !t.startsWith('[')) return t.length > 0 ? t : null;
  return null;
}

export function resolveLessonsFromPayload(
  content: string,
  rawContent?: unknown,
  options?: { toolKind?: LessonPlannerToolKind },
): ResolvedLessonPlanner {
  let formatted = '';
  let book = '';
  let className = '';
  let rawRecords: Record<string, unknown>[] = [];

  const toolKind = options?.toolKind ?? 'auto';
  const markdownFormat: LessonPlannerToolKind =
    toolKind === 'auto' ? 'auto' : toolKind;

  const absorbMeta = (v: Record<string, unknown>) => {
    if (v.book) book = String(v.book);
    if (v.class) className = String(v.class);
    if (v.className) className = className || String(v.className);
    if (v.classLabel) className = className || String(v.classLabel);
  };

  const absorbRaw = (v: unknown) => {
    const extracted = extractLessonRecords(v);
    if (extracted.length) rawRecords = extracted;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      absorbMeta(v as Record<string, unknown>);
    }
  };

  const text = String(content || '').trim();

  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (Array.isArray(parsed)) {
      absorbRaw(parsed);
    } else {
      if (parsed.formatted != null) formatted = String(parsed.formatted);
      if (parsed.markdown) formatted = formatted || String(parsed.markdown);
      if (parsed.raw) absorbRaw(parsed.raw);
      if (!rawRecords.length) absorbRaw(parsed);
      absorbMeta(parsed);
    }
  } catch {
    formatted = text;
  }

  if (rawContent) absorbRaw(rawContent);

  let fromMd = formatted.trim() ? parseLessonsFromMarkdown(formatted, markdownFormat) : [];
  if (!fromMd.length && text && !text.startsWith('{')) {
    fromMd = parseLessonsFromMarkdown(text, markdownFormat);
  }

  const fromRaw = rawRecords.map((r, i) => normalizeLesson(r, i));
  const displayMd = formatted || lessonPlannerDisplayMarkdown(content, rawContent);
  if (!fromMd.length && displayMd) {
    fromMd = parseLessonsFromMarkdown(displayMd, markdownFormat);
  }

  let lessons: NormalizedLesson[] = [];
  if (fromRaw.length && fromMd.length) {
    const n = Math.max(fromRaw.length, fromMd.length);
    lessons = Array.from({ length: n }, (_, i) =>
      mergeLessons(
        fromRaw[i] ?? fromRaw[fromRaw.length - 1],
        fromMd[i] ?? fromMd[fromMd.length - 1],
        i,
      ),
    );
  } else if (fromRaw.length) {
    lessons = fromRaw;
  } else if (fromMd.length) {
    lessons = fromMd;
  }

  let mdFallback: string | null = null;

  if (!lessons.length) {
    mdFallback = displayMd;
  } else if (!lessons.some(lessonHasVisibleContent) && displayMd) {
    mdFallback = displayMd;
  }

  return { lessons, book, className, markdownFallback: mdFallback };
}
