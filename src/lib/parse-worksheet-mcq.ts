/**
 * Parse Worksheet & MCQ Generator payloads into a 10-section worksheet model.
 */

import { renumberSectionQuestionLists } from '@/lib/renumber-questions';
import {
  cleanWorksheetQuestionText,
  filterWorksheetLearningObjectiveLine,
  isInvalidWorksheetTitle,
  isValidWorksheetQuestionInput,
  isWorksheetHeadingLine,
  isWorksheetPdfChrome,
  sanitizeWorksheetDisplayTitle,
  sanitizeWorksheetOptionLine,
} from '@/lib/worksheet-question-sanitize';
import { extractAiToolV2Context } from '@/lib/extract-ai-tool-v2-context';
import { isUnsupportedQuestionStem } from '@/lib/unsupported-question-filter';
import {
  formatMatchAnswerKey,
  isMatchQuestionType,
  isMatchStemText,
  normalizeMatchPairs,
} from '@/lib/match-following';

export type WorksheetQuestion = {
  questionNumber?: number;
  question: string;
  options: string[];
  answer: string;
  explanation?: string;
  marks?: number;
  type?: string;
  section?: string;
  imageUrl?: string;
  imagePrompt?: string;
  needsDiagram?: boolean;
  matchPairs?: { left: string; right: string; leftKey?: string; rightKey?: string }[];
};

export type WorksheetSection = {
  id: string;
  order: number;
  label: string;
  displayLabel: string;
  questions: WorksheetQuestion[];
};

export type NormalizedWorksheet = {
  title: string;
  learningObjectives: string[];
  instructions: string;
  sections: WorksheetSection[];
  answerKey: string;
  bloomLevel: string;
  difficultyTag: string;
};

export type ResolvedWorksheetMcq = {
  worksheet: NormalizedWorksheet | null;
  markdownFallback: string | null;
};

export const WORKSHEET_SECTION_ORDER = [
  'Section A: MCQs',
  'Section B: Fill in the Blanks',
  'Section C: Very Short Answer Questions',
  'Section D: Short Answer Questions',
  'Section E: Competency / Real-life Application Questions',
] as const;

const SECTION_META: Record<
  string,
  { id: string; order: number; displayPrefix: string }
> = {
  'Section A: MCQs': { id: 'section_a', order: 4, displayPrefix: '4' },
  'Section B: Fill in the Blanks': { id: 'section_b', order: 5, displayPrefix: '5' },
  'Section C: Very Short Answer Questions': { id: 'section_c', order: 6, displayPrefix: '6' },
  'Section D: Short Answer Questions': { id: 'section_d', order: 7, displayPrefix: '7' },
  'Section E: Competency / Real-life Application Questions': {
    id: 'section_e',
    order: 8,
    displayPrefix: '8',
  },
};

function coalesceLines(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v
      .map((x) => String(x ?? '').trim())
      .filter(Boolean)
      .filter(filterWorksheetLearningObjectiveLine);
  }
  if (typeof v === 'string' && v.trim()) {
    return v
      .split(/\n+/)
      .map((ln) => ln.replace(/^\s*[-*•]\s*|\s*\d+[\).\s]+/i, '').trim())
      .filter(Boolean)
      .filter(filterWorksheetLearningObjectiveLine);
  }
  return [];
}

function polishWorksheetQuestion(q: WorksheetQuestion): WorksheetQuestion | null {
  const question = cleanWorksheetQuestionText(q.question);
  if (Array.isArray(q.matchPairs) && q.matchPairs.length >= 2) {
    return {
      ...q,
      question: question || q.question || 'Match Column A with Column B',
      type: q.type || 'MATCH',
      options: [],
      matchPairs: q.matchPairs,
    };
  }
  const options = q.options
    .map((opt) => sanitizeWorksheetOptionLine(opt.replace(/^[A-D][\).]\s*/i, '')))
    .filter(Boolean)
    .map((text, idx) => `${String.fromCharCode(65 + idx)}) ${text}`);
  if (!isValidWorksheetQuestionInput(question, options)) return null;
  return {
    ...q,
    question,
    options,
  };
}

function polishWorksheetSections(sections: WorksheetSection[]): WorksheetSection[] {
  return sections.map((sec) => ({
    ...sec,
    questions: sec.questions
      .map((q) => polishWorksheetQuestion(q))
      .filter((q): q is WorksheetQuestion => q != null),
  }));
}

function coalesceText(v: unknown): string {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean).join('\n');
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return coalesceText(o.text ?? o.content ?? o.body ?? o.value);
  }
  return String(v ?? '').trim();
}

/** Remove backend merge marker and duplicate PDF answer-key tails from display. */
function sanitizeWorksheetAnswerKey(text: string): string {
  const raw = String(text || '').trim();
  if (!raw) return '';
  const parts = raw
    .split(/\n*---\s*PDF Answer Key\s*---\s*\n?/gi)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts[0] || raw;
}

/**
 * Some records carry a placeholder instead of an answer key
 * ("All questions. See sections above. (Step-by-step logic provided in each
 * section.)"). Teachers then see no answers at all.
 */
export function isPlaceholderAnswerKey(text: string): boolean {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return true;
  return (
    /\bsee\s+(?:the\s+)?(?:sections?|questions?|answers?)\s+above\b/i.test(t) ||
    /\bprovided\s+in\s+each\s+section\b/i.test(t) ||
    /^(?:q\s*)?all\s+questions\b/i.test(t) ||
    /\bsee\s+(?:core|model\s+answer)\b/i.test(t)
  ) && t.length < 400;
}

/** Answer key rebuilt from each question's own answer, section by section. */
export function buildAnswerKeyFromQuestions(sections: WorksheetSection[]): string {
  const blocks: string[] = [];
  for (const section of sections) {
    const lines = section.questions
      .filter((q) => String(q.answer || '').trim())
      .map((q, i) => {
        const n = q.questionNumber ?? i + 1;
        const why = String(q.explanation || '').trim();
        return `${n}. ${String(q.answer).trim()}${why ? ` — ${why}` : ''}`;
      });
    if (lines.length) blocks.push([section.displayLabel || section.label, ...lines].filter(Boolean).join('\n'));
  }
  return blocks.join('\n\n');
}

function stripInlineMarkdown(text: string): string {
  let t = String(text || '');
  if (!t.trim()) return '';
  // Basic inline cleanup: bold/italic/code + heading markers
  t = t.replace(/^#{1,6}\s+/gm, '');
  t = t.replace(/`([^`]+)`/g, '$1');
  t = t.replace(/\*\*([^*]+)\*\*/g, '$1');
  t = t.replace(/__([^_]+)__/g, '$1');
  t = t.replace(/(^|[^\*])\*([^*\n]+)\*/g, '$1$2');
  t = t.replace(/\s+/g, ' ');
  return t.trim();
}

function normalizeQuestionKeyText(text: string): string {
  return stripInlineMarkdown(text).toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 200);
}

function worksheetQuestionDedupeKey(q: WorksheetQuestion, sectionLabel?: string): string {
  const question = normalizeQuestionKeyText(q.question);
  if (!question) return '';
  const section = String(sectionLabel || q.section || '')
    .toLowerCase()
    .trim();
  return `${section}::${question}`;
}

function dedupeWorksheetQuestions(
  questions: WorksheetQuestion[],
  sectionLabel?: string,
): WorksheetQuestion[] {
  const seen = new Set<string>();
  const out: WorksheetQuestion[] = [];
  for (const q of questions) {
    const key = worksheetQuestionDedupeKey(q, sectionLabel);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    out.push(q);
  }
  return out;
}

function renumberWorksheetSectionQuestions(sections: WorksheetSection[]): WorksheetSection[] {
  return renumberSectionQuestionLists(
    sections.map((sec) => ({
      ...sec,
      questions: dedupeWorksheetQuestions(sec.questions, sec.label),
    })),
  );
}

function finalizeNormalizedWorksheet(worksheet: NormalizedWorksheet): NormalizedWorksheet {
  const polished = {
    ...worksheet,
    answerKey: sanitizeWorksheetAnswerKey(worksheet.answerKey),
    sections: polishWorksheetSections(worksheet.sections),
    learningObjectives: worksheet.learningObjectives.filter(filterWorksheetLearningObjectiveLine),
    instructions: isWorksheetHeadingLine(worksheet.instructions) ? '' : worksheet.instructions,
  };
  const sections = renumberWorksheetSectionQuestions(polished.sections);
  // Replace a placeholder answer key with the per-question answers we have.
  const rebuilt = isPlaceholderAnswerKey(polished.answerKey) ? buildAnswerKeyFromQuestions(sections) : '';
  return {
    ...polished,
    answerKey: rebuilt || polished.answerKey,
    sections,
  };
}

function sectionsArrayHasQuestions(sectionsRaw: unknown): boolean {
  if (!Array.isArray(sectionsRaw)) return false;
  return sectionsRaw.some((sec) => {
    if (!sec || typeof sec !== 'object') return false;
    const qs = (sec as Record<string, unknown>).questions;
    return Array.isArray(qs) && qs.length > 0;
  });
}

function cleanMcqOptionAnswerBleed(option: string, answer: string, index = 0): string {
  const raw = stripInlineMarkdown(String(option || '').trim());
  if (!raw) return '';
  const labeled = raw.match(/^([A-D])\s*[\).:\-]?\s*(.+)$/i);
  const letter = labeled?.[1]?.toUpperCase() || String.fromCharCode(65 + index);
  let text = (labeled?.[2] || raw.replace(/^[A-D][\).:\-\s]+/i, '')).trim();
  const ans = stripInlineMarkdown(answer)
    .replace(/^[A-D][\).:\-\s]+/i, '')
    .trim();
  if (ans.length >= 4 && text.endsWith(ans) && text.length > ans.length + 3) {
    text = text.slice(0, -ans.length).trim();
  }
  if (!text) return '';
  return `${letter}) ${text}`;
}

function normalizeOptions(entry: Record<string, unknown>): string[] {
  if (!Array.isArray(entry?.options)) return [];
  const answer = stripInlineMarkdown(String(entry.answer || entry.correctAnswer || '').trim());
  return (entry.options as unknown[])
    .map((opt: unknown, idx: number) => {
      const text = stripInlineMarkdown(String(opt || '').trim());
      if (!text) return '';
      const cleaned = sanitizeWorksheetOptionLine(text);
      if (!cleaned) return '';
      if (/^[A-D][\).]/i.test(cleaned)) {
        return cleanMcqOptionAnswerBleed(cleaned.replace(/^([A-D])\./i, '$1)'), answer, idx);
      }
      return cleanMcqOptionAnswerBleed(`${String.fromCharCode(65 + idx)}) ${cleaned}`, answer, idx);
    })
    .filter(Boolean);
}

function toWorksheetQuestions(value: unknown): WorksheetQuestion[] {
  const rows = Array.isArray(value) ? value : [];
  const out: WorksheetQuestion[] = [];

  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const entry = row as Record<string, unknown>;
    const question = cleanWorksheetQuestionText(
      stripInlineMarkdown(String(entry.question || entry.prompt || entry.text || '').trim()),
    );
    if (!question) continue;
    const options = normalizeOptions(entry);
    const type = stripInlineMarkdown(String(entry.type || entry.question_type || '').trim()) || undefined;
    const imageUrl = String(entry.imageUrl || entry.image_url || entry.questionImage || '').trim();
    const imagePrompt = String(entry.imagePrompt || entry.image_prompt || entry.figurePrompt || '').trim();
    const needsDiagramRaw = entry.needsDiagram ?? entry.needs_diagram ?? entry.needsFigure;
    const needsDiagram =
      needsDiagramRaw === true ||
      needsDiagramRaw === 1 ||
      ['true', '1', 'yes'].includes(String(needsDiagramRaw || '').trim().toLowerCase());
    const matchPairs = normalizeMatchPairs(entry);
    const resolvedType =
      type ||
      (matchPairs.length >= 2 || isMatchStemText(question) ? 'MATCH' : undefined);
    if (
      isUnsupportedQuestionStem(question, resolvedType || '', {
        hasImage: Boolean(imageUrl || imagePrompt || needsDiagram),
        hasMatch: matchPairs.length >= 2,
      })
    ) {
      continue;
    }
    // Match questions don't need MCQ-style option validation
    if (matchPairs.length < 2 && !isValidWorksheetQuestionInput(question, options)) continue;
    const marksRaw = entry.marks ?? entry.mark;
    const marks =
      marksRaw != null && !Number.isNaN(Number(marksRaw)) ? Number(marksRaw) : undefined;
    const answer =
      stripInlineMarkdown(String(entry.answer || entry.correctAnswer || '').trim()) ||
      (matchPairs.length >= 2 ? formatMatchAnswerKey(matchPairs) : '');
    out.push({
      questionNumber:
        entry.question_number != null
          ? Number(entry.question_number)
          : entry.questionNumber != null
            ? Number(entry.questionNumber)
            : undefined,
      question,
      options: matchPairs.length >= 2 ? [] : normalizeOptions(entry),
      answer,
      explanation:
        stripInlineMarkdown(String(entry.explanation || entry.solution || '').trim()) || undefined,
      marks: Number.isFinite(marks) ? marks : undefined,
      type: resolvedType,
      section:
        stripInlineMarkdown(String(entry.section || entry.sectionName || '').trim()) || undefined,
      ...(imageUrl ? { imageUrl } : {}),
      ...(imagePrompt ? { imagePrompt } : {}),
      ...(needsDiagram ? { needsDiagram: true } : {}),
      ...(matchPairs.length >= 2 ? { matchPairs } : {}),
    });
  }

  return out;
}

export function mapSectionName(name: string): string {
  const n = String(name || '').trim();
  if (/match\s+the\s+following/i.test(n)) return '';
  if (/^multiple\s*choice\s*questions?$/i.test(n)) return WORKSHEET_SECTION_ORDER[0];
  if (/^fill\s*in\s*the\s*blanks?$/i.test(n)) return WORKSHEET_SECTION_ORDER[1];
  if (/^very\s*short\s*answer\s*questions?$/i.test(n)) return WORKSHEET_SECTION_ORDER[2];
  if (/^short\s*answer\s*questions?$/i.test(n) && !/very/i.test(n)) return WORKSHEET_SECTION_ORDER[3];
  if (/^(?:section\s*a\b|mcqs?|multiple\s*choice)/i.test(n)) return WORKSHEET_SECTION_ORDER[0];
  if (/^(?:section\s*b\b|fill|blank|fib)/i.test(n)) return WORKSHEET_SECTION_ORDER[1];
  if (/^(?:section\s*c\b|very\s*short|vsa)/i.test(n)) return WORKSHEET_SECTION_ORDER[2];
  if (/^(?:section\s*d\b|short\s*answer)/i.test(n) && !/very/i.test(n)) return WORKSHEET_SECTION_ORDER[3];
  if (/^(?:section\s*[ef]\b|competency|real[\s-]*life|application)/i.test(n)) return WORKSHEET_SECTION_ORDER[4];
  if ((WORKSHEET_SECTION_ORDER as readonly string[]).includes(n)) return n;
  return n || 'Questions';
}

function inferSectionForQuestion(q: WorksheetQuestion): string {
  let sec = String(q.section || '').trim();
  const qType = String(q.type || '').trim();
  if (/multiple\s*choice/i.test(qType)) return WORKSHEET_SECTION_ORDER[0];
  if (/fill\s*in/i.test(qType)) return WORKSHEET_SECTION_ORDER[1];
  if (/very\s*short/i.test(qType)) return WORKSHEET_SECTION_ORDER[2];
  if (/short\s*answer/i.test(qType) && !/very/i.test(qType)) return WORKSHEET_SECTION_ORDER[3];
  if (sec && sec !== 'Questions') return mapSectionName(sec);
  const qt = q.question;
  const words = qt.split(/\s+/).filter(Boolean).length;
  const competencyCue =
    /(?:real[\s-]*life|application|competency|case[\s-]*based|scenario|daily\s+life|at\s+home|in\s+school|how\s+would\s+you|what\s+would\s+you\s+do|design|plan|investigate|experiment|observe|compare)\b/i.test(
      qt,
    );
  const looksPromptLike =
    /\?/.test(qt) ||
    /^(?:imagine|suppose|consider|how would you|what would you do|design|plan|investigate|observe|compare)\b/i.test(
      qt,
    );
  if (q.options.length > 0) return WORKSHEET_SECTION_ORDER[0];
  if (/_{2,}/.test(qt)) return WORKSHEET_SECTION_ORDER[1];
  if (competencyCue && looksPromptLike) {
    return WORKSHEET_SECTION_ORDER[4];
  }
  if (looksPromptLike && /(?:in your daily life|around you|at home|in school)\b/i.test(qt)) {
    return WORKSHEET_SECTION_ORDER[4];
  }
  const marks = q.marks;
  if (marks != null && marks >= 3) return WORKSHEET_SECTION_ORDER[3];
  if (marks != null && marks > 0 && marks <= 2) return WORKSHEET_SECTION_ORDER[2];
  if (/\?/.test(qt) && words <= 12) return WORKSHEET_SECTION_ORDER[2];
  if (/\?/.test(qt)) return WORKSHEET_SECTION_ORDER[3];
  if (words >= 10) return WORKSHEET_SECTION_ORDER[3];
  return WORKSHEET_SECTION_ORDER[2];
}

function isLikelyCompetencyQuestionText(text: string): boolean {
  const q = String(text || '').trim();
  if (!q) return false;
  return /(?:real[\s-]*life|application|competency|case[\s-]*based|scenario|daily\s+life|at\s+home|in\s+school|how\s+would\s+you|what\s+would\s+you\s+do|design|plan|investigate|experiment|observe|compare)/i.test(
    q,
  );
}

function balanceWorksheetSectionList(sections: WorksheetSection[]): WorksheetSection[] {
  const dKey = WORKSHEET_SECTION_ORDER[3];
  const cKey = WORKSHEET_SECTION_ORDER[2];
  const dSec = sections.find((s) => s.label === dKey);
  const cSec = sections.find((s) => s.label === cKey);
  if (!dSec || !cSec || dSec.questions.length > 0 || cSec.questions.length < 2) return sections;

  const longest = [...cSec.questions].sort(
    (a, b) =>
      String(b.question || '').split(/\s+/).filter(Boolean).length -
      String(a.question || '').split(/\s+/).filter(Boolean).length,
  )[0];
  if (!longest) return sections;

  return sections.map((sec) => {
    if (sec.label === cKey) {
      return { ...sec, questions: sec.questions.filter((q) => q !== longest) };
    }
    if (sec.label === dKey) {
      return { ...sec, questions: [{ ...longest, section: dKey }] };
    }
    return sec;
  });
}

function buildSectionsFromQuestions(questions: WorksheetQuestion[]): WorksheetSection[] {
  const sectionMap = new Map<string, WorksheetQuestion[]>();
  for (const q of questions) {
    const key = inferSectionForQuestion(q);
    const prev = sectionMap.get(key) || [];
    sectionMap.set(key, [...prev, q]);
  }
  const dKey = WORKSHEET_SECTION_ORDER[3];
  const eKey = WORKSHEET_SECTION_ORDER[4];
  const dQuestions = sectionMap.get(dKey) || [];
  const eQuestions = sectionMap.get(eKey) || [];
  if (eQuestions.length === 0 && dQuestions.length > 1) {
    const moveIdx = dQuestions.findIndex((q) => isLikelyCompetencyQuestionText(q.question));
    if (moveIdx >= 0) {
      const [moved] = dQuestions.splice(moveIdx, 1);
      sectionMap.set(dKey, dQuestions);
      sectionMap.set(eKey, [...eQuestions, moved]);
    }
  }
  if (dQuestions.length === 0 && eQuestions.length > 1) {
    const moveBackIdx = eQuestions.findIndex((q) => !isLikelyCompetencyQuestionText(q.question));
    const idx = moveBackIdx >= 0 ? moveBackIdx : eQuestions.length - 1;
    const [movedBack] = eQuestions.splice(idx, 1);
    if (movedBack) {
      sectionMap.set(dKey, [...dQuestions, movedBack]);
      sectionMap.set(eKey, eQuestions);
    }
  }
  return renumberWorksheetSectionQuestions(
    balanceWorksheetSectionList(
      WORKSHEET_SECTION_ORDER.map((label) => {
        const meta = SECTION_META[label];
        return {
          id: meta.id,
          order: meta.order,
          label,
          displayLabel: `${meta.displayPrefix}. ${label}`,
          questions: sectionMap.get(label) || [],
        };
      }),
    ),
  );
}

function expandRawRecord(raw: Record<string, unknown>): Record<string, unknown> {
  const r = { ...raw };
  const core = r.core;
  if (core && typeof core === 'object' && !Array.isArray(core)) {
    const c = core as Record<string, unknown>;
    r.title = r.title ?? c.title ?? c.worksheetTitle ?? c.worksheet_title;
    r.learning_objectives = r.learning_objectives ?? c.learningObjectives ?? c.objectives;
    r.instructions = r.instructions ?? c.instructions ?? c.student_instructions;
  }
  r.title = r.title ?? r.worksheet_title ?? r.name;
  r.learning_objectives = r.learning_objectives ?? r.learningObjectives ?? r.objectives;
  r.instructions = r.instructions ?? r.student_instructions;
  r.answer_key = r.answer_key ?? r.answerKey ?? r.answers;
  r.bloom_level = r.bloom_level ?? r.bloomLevel;
  r.difficulty_tag = r.difficulty_tag ?? r.difficultyTag ?? r.difficulty;
  return r;
}

function worksheetTitleFallback(rawContent?: unknown): string {
  const ctx = extractAiToolV2Context(rawContent);
  const fromTopic = [ctx.subtopic, ctx.topic].filter(Boolean).join(' — ');
  return fromTopic || ctx.subject || 'Worksheet';
}

function resolveWorksheetTitle(
  candidate: string,
  rawContent?: unknown,
): string {
  const fallback = worksheetTitleFallback(rawContent);
  return sanitizeWorksheetDisplayTitle(String(candidate || '').trim(), fallback);
}

function materializeWorksheet(raw: Record<string, unknown>, rawContent?: unknown): NormalizedWorksheet {
  const r = expandRawRecord(raw);
  const sectionMap = new Map<string, WorksheetQuestion[]>();

  const sectionsRaw = r.sections;
  const canonicalFromSections = sectionsArrayHasQuestions(sectionsRaw);
  if (Array.isArray(sectionsRaw)) {
    for (const sec of sectionsRaw) {
      if (!sec || typeof sec !== 'object') continue;
      const s = sec as Record<string, unknown>;
      const name = mapSectionName(String(s.sectionName || s.title || s.name || 'Section'));
      if (!name) continue;
      const qs = toWorksheetQuestions(s.questions);
      const prev = sectionMap.get(name) || [];
      sectionMap.set(name, [...prev, ...qs]);
    }
  }

  if (canonicalFromSections) {
    const sections = renumberWorksheetSectionQuestions(
      balanceWorksheetSectionList(
        WORKSHEET_SECTION_ORDER.map((label) => {
          const meta = SECTION_META[label];
          return {
            id: meta.id,
            order: meta.order,
            label,
            displayLabel: `${meta.displayPrefix}. ${label}`,
            questions: sectionMap.get(label) || [],
          };
        }),
      ),
    );
    return {
      title: resolveWorksheetTitle(String(r.title || r.worksheet_title || 'Worksheet').trim(), rawContent),
      learningObjectives: coalesceLines(r.learning_objectives),
      instructions: coalesceText(r.instructions),
      sections,
      answerKey: coalesceText(r.answer_key),
      bloomLevel: coalesceText(r.bloom_level),
      difficultyTag: coalesceText(r.difficulty_tag),
    };
  }

  const sectionKeyMap: Array<[string, string]> = [
    ['section_a', WORKSHEET_SECTION_ORDER[0]],
    ['section_a_mcqs', WORKSHEET_SECTION_ORDER[0]],
    ['section_b', WORKSHEET_SECTION_ORDER[1]],
    ['section_b_fib', WORKSHEET_SECTION_ORDER[1]],
    ['fill_in_blanks', WORKSHEET_SECTION_ORDER[1]],
    ['section_c', WORKSHEET_SECTION_ORDER[2]],
    ['section_c_vsa', WORKSHEET_SECTION_ORDER[2]],
    ['section_d', WORKSHEET_SECTION_ORDER[3]],
    ['section_d_sa', WORKSHEET_SECTION_ORDER[3]],
    ['section_e', WORKSHEET_SECTION_ORDER[4]],
    ['section_e_competency', WORKSHEET_SECTION_ORDER[4]],
    ['section_f', WORKSHEET_SECTION_ORDER[4]],
    ['section_f_competency', WORKSHEET_SECTION_ORDER[4]],
  ];
  for (const [key, sectionLabel] of sectionKeyMap) {
    const block = r[key];
    if (!block) continue;
    const rows = Array.isArray(block)
      ? block
      : block && typeof block === 'object'
        ? ((block as Record<string, unknown>).questions ??
          (block as Record<string, unknown>).items ??
          (block as Record<string, unknown>).data ??
          [])
        : [];
    const qs = toWorksheetQuestions(rows).map((q) => ({ ...q, section: q.section || sectionLabel }));
    if (!qs.length) continue;
    const prev = sectionMap.get(sectionLabel) || [];
    sectionMap.set(sectionLabel, [...prev, ...qs]);
  }

  const flatQs = toWorksheetQuestions(r.questions);
  if (flatQs.length) {
    for (const q of flatQs) {
      const key = inferSectionForQuestion(q);
      const prev = sectionMap.get(key) || [];
      sectionMap.set(key, [...prev, q]);
    }
  }

  if (!sectionMap.size && String(r.question || '').trim()) {
    const single = toWorksheetQuestions([r])[0];
    if (single) {
      const key = inferSectionForQuestion(single);
      sectionMap.set(key, [single]);
    }
  }

  const sections = renumberWorksheetSectionQuestions(
    balanceWorksheetSectionList(
      WORKSHEET_SECTION_ORDER.map((label) => {
        const meta = SECTION_META[label];
        return {
          id: meta.id,
          order: meta.order,
          label,
          displayLabel: `${meta.displayPrefix}. ${label}`,
          questions: sectionMap.get(label) || [],
        };
      }),
    ),
  );

  return {
    title: resolveWorksheetTitle(String(r.title || r.worksheet_title || 'Worksheet').trim(), rawContent),
    learningObjectives: coalesceLines(r.learning_objectives),
    instructions: coalesceText(r.instructions),
    sections,
    answerKey: coalesceText(r.answer_key),
    bloomLevel: coalesceText(r.bloom_level),
    difficultyTag: coalesceText(r.difficulty_tag),
  };
}

function absorbRawRecords(raw: unknown): Record<string, unknown>[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter((x) => x && typeof x === 'object') as Record<string, unknown>[];
  if (typeof raw !== 'object') return [];
  const o = raw as Record<string, unknown>;
  const meta = o.metadata as Record<string, unknown> | undefined;
  if (meta?.structuredContent && typeof meta.structuredContent === 'object') {
    return absorbRawRecords(meta.structuredContent);
  }
  if (Array.isArray(o.sections) && (o.title || o.questions || o.learning_objectives)) return [o];
  if (Array.isArray(o.questions) && (o.title || o.instructions)) return [o];
  if (o.raw && typeof o.raw === 'object') return absorbRawRecords(o.raw);
  if (o.data && typeof o.data === 'object') return absorbRawRecords(o.data);
  if (o.structuredContent && typeof o.structuredContent === 'object') {
    return absorbRawRecords(o.structuredContent);
  }
  if (o.title || o.worksheet_title || o.questions) return [o];
  return [];
}

function looksLikeJsonText(text: string): boolean {
  const t = String(text || '').trim();
  return (t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'));
}

function extractMarkdownSection(body: string, titlePattern: RegExp): string {
  const lines = body.split('\n');
  let capturing = false;
  const buf: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    const plain = stripInlineMarkdown(t);
    if (/^#{1,3}\s/.test(t) || /^\d{1,2}\.\s+[A-Z]/.test(plain)) {
      if (capturing) break;
      if (titlePattern.test(plain.replace(/^#+\s*|\d+\.\s*/i, ''))) {
        capturing = true;
        continue;
      }
    }
    if (capturing) buf.push(line);
  }
  return buf.join('\n').trim();
}

/** Split stored option text into letter badge + display text (matches web WorksheetMcqViewer). */
export function formatWorksheetOptionDisplay(
  option: string,
  index = 0,
): { letter: string; text: string } {
  const raw = stripInlineMarkdown(String(option || '').trim());
  if (!raw) return { letter: String.fromCharCode(65 + index), text: '' };
  const labeled = raw.match(/^([A-D])\s*[\).:\-]?\s*(.+)$/i);
  if (labeled) {
    return { letter: labeled[1].toUpperCase(), text: labeled[2].trim() };
  }
  return {
    letter: String.fromCharCode(65 + index),
    text: raw.replace(/^[A-D][\).]\s*/i, '').trim() || raw,
  };
}

function normalizeOptionLine(line: string, idx: number): string {
  const { letter, text } = formatWorksheetOptionDisplay(line, idx);
  if (!text) return '';
  return `${letter}) ${text}`;
}

function parseQuestionsFromLines(
  lines: string[],
  opts: { relaxedNumbered?: boolean } = {},
): WorksheetQuestion[] {
  const out: WorksheetQuestion[] = [];
  let current: WorksheetQuestion | null = null;
  let optionBuf: string[] = [];

  const flush = () => {
    if (!current) return;
    if (!current.options.length && optionBuf.length) {
      const opts = optionBuf
        .map((l) => l.trim())
        .filter(Boolean)
        .filter((l) => !isWorksheetHeadingLine(l) && !isWorksheetPdfChrome(l))
        .slice(0, 8)
        .map((l, i) => normalizeOptionLine(l, i))
        .map((l) => sanitizeWorksheetOptionLine(l))
        .filter(Boolean);
      if (opts.length >= 2) current.options = opts;
    }
    optionBuf = [];
    const polished = polishWorksheetQuestion(current);
    if (polished) out.push(polished);
    current = null;
  };

  for (const raw of lines) {
    const line = stripInlineMarkdown(String(raw || '').trim());
    if (!line) continue;

    const isTemplateHeading =
      /^section\s+[a-f]\b/i.test(line) ||
      /^\d{1,2}\.\s*(learning objectives|instructions to students|answer key|bloom'?s|difficulty)/i.test(
        line,
      ) ||
      /^(answer key|bloom'?s level)/i.test(line);

    if (isTemplateHeading) {
      // End current question before template headings so 9/10 never become fake options.
      flush();
      continue;
    }

    const qStart =
      line.match(/^(?:\*\*)?Q(?:uestion)?\s*(\d+)?\s*[\).:\-]?\s*(.+)$/i) ||
      (() => {
        const m = line.match(/^(\d+)\.\s+(.+)$/);
        if (!m) return null;
        const candidate = String(m[2] || '').trim();
        // Numeric line should look like a real question, not a section label.
        if (
          /^(section|answer key|bloom|difficulty|learning objectives|instructions)/i.test(candidate)
        ) {
          return null;
        }
        if (
          /\?$/.test(candidate) ||
          /^what|why|how|which|who|when|where|explain|define/i.test(candidate)
        ) {
          return m;
        }
        if (
          opts.relaxedNumbered &&
          candidate.length >= 15 &&
          candidate.split(/\s+/).filter(Boolean).length >= 4 &&
          !/^q?\d+[\).:\-]\s*[A-D]\)/i.test(candidate) &&
          !/^(?:expected term|short accurate point|clear explanation linking)\b/i.test(candidate)
        ) {
          return m;
        }
        return null;
      })();
    if (qStart) {
      flush();
      const qNum = qStart[1] ? Number(qStart[1]) : undefined;
      current = {
        questionNumber: Number.isFinite(qNum as number) ? (qNum as number) : undefined,
        question: stripInlineMarkdown(String(qStart[2] || '').trim()),
        options: [],
        answer: '',
      };
      continue;
    }

    const ansMatch = line.match(/^(?:\*\*)?Answer\s*[:\-]\s*(.+)$/i);
    if (ansMatch && current) {
      current.answer = stripInlineMarkdown(String(ansMatch[1] || '').trim());
      continue;
    }

    const expMatch = line.match(/^(?:\*\*)?Explanation\s*[:\-]\s*(.+)$/i);
    if (expMatch && current) {
      current.explanation = stripInlineMarkdown(String(expMatch[1] || '').trim());
      continue;
    }

    const marksMatch = line.match(/^(?:\*\*)?Marks?\s*[:\-]\s*(\d+)\b/i);
    if (marksMatch && current) {
      current.marks = Number(marksMatch[1]);
      continue;
    }

    const labeledOpt = line.match(/^([A-D])\s*[\).:\-]?\s*(.+)$/i);
    if (labeledOpt && current) {
      const normalized = normalizeOptionLine(line, current.options.length);
      const cleaned = normalized ? sanitizeWorksheetOptionLine(normalized) : '';
      if (cleaned) current.options.push(cleaned);
      continue;
    }

    if (!current) {
      // In explicit section parsing mode, treat bullet lines as standalone prompts.
      if (opts.relaxedNumbered) {
        const bulletMatch = line.match(/^[-*•]\s+(.+)$/);
        if (bulletMatch) {
          const polished = polishWorksheetQuestion({
            question: stripInlineMarkdown(String(bulletMatch[1] || '').trim()),
            options: [],
            answer: '',
          });
          if (polished) out.push(polished);
        }
      }
      continue;
    }

    // If the question line was short and the next lines look like options, buffer them.
    // This supports outputs where options are NOT labeled A/B/C/D (like your screenshot).
    optionBuf.push(line);
  }

  flush();
  return dedupeWorksheetQuestions(out);
}

function splitMarkdownIntoNamedBlocks(markdown: string): Array<{ heading: string; lines: string[] }> {
  const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
  const blocks: Array<{ heading: string; lines: string[] }> = [];
  let currentHeading = '';
  let buf: string[] = [];

  const flush = () => {
    if (!currentHeading && buf.length === 0) return;
    blocks.push({ heading: currentHeading, lines: buf });
    buf = [];
  };

  for (const line of lines) {
    const t = line.trim();
    const plain = stripInlineMarkdown(t);
    const sectionHeading = plain.match(
      /^#{0,3}\s*(?:\d+\.\s*)?(Section\s+[A-F]\s*:?.*)$/i,
    );
    const metaHeading = plain.match(
      /^#{0,2}\s*(?:\d+\.\s*)?(?:Answer\s*Key|Bloom'?s?\s*Level|Learning\s+Objectives?|Instructions?\s+to\s+Students?|Worksheet\s+Title)\b.*$/i,
    );
    if (sectionHeading || metaHeading) {
      flush();
      if (sectionHeading) {
        currentHeading = sectionHeading[1].replace(/\s+/g, ' ').trim();
      } else {
        currentHeading = '';
        buf = [];
      }
      continue;
    }
    buf.push(line);
  }
  flush();
  return blocks;
}

function extractWorksheetTitleFromMarkdown(body: string): string {
  const titleSection = extractMarkdownSection(body, /worksheet\s+title/i);
  if (titleSection) {
    const firstLine = titleSection
      .split('\n')
      .map((line) => stripInlineMarkdown(line.trim()))
      .find(Boolean);
    if (firstLine && !isInvalidWorksheetTitle(firstLine)) return firstLine;
  }

  const headingMatches = [...body.matchAll(/^#{1,2}\s+(.+?)(?:\n|$)/gm)];
  for (const match of headingMatches) {
    const candidate = String(match[1] || '')
      .replace(/^\d+\.\s*/, '')
      .trim();
    if (candidate && !isInvalidWorksheetTitle(candidate)) return candidate;
  }

  return '';
}

function parseWorksheetFromMarkdown(text: string, rawContent?: unknown): NormalizedWorksheet | null {
  const body = String(text || '').trim();
  if (!body) return null;

  const extractedTitle = extractWorksheetTitleFromMarkdown(body);
  const title = resolveWorksheetTitle(extractedTitle || 'Worksheet', rawContent);

  const objectivesBlock = extractMarkdownSection(body, /learning\s+objectives?/i);
  const instructionsBlock = extractMarkdownSection(body, /instructions?\s+to\s+students?/i);
  let answerKeyBlock = extractMarkdownSection(body, /answer\s+key/i);
  let bloomBlock = extractMarkdownSection(body, /bloom|difficulty\s+tag/i);

  // Fallback for plain numbered headings (e.g. "9. Answer Key", "10. Bloom's Level...")
  if (!answerKeyBlock) {
    const m = body.match(
      /(?:^|\n)(?:\*\*)?\s*9\.\s*Answer\s*Key(?:\*\*)?\s*\n+([\s\S]*?)(?=\n(?:\*\*)?\s*10\.\s*Bloom|\n#{1,3}\s|$)/i,
    );
    if (m) answerKeyBlock = m[1].trim();
  }
  if (!bloomBlock) {
    const m = body.match(
      /(?:^|\n)(?:\*\*)?\s*10\.\s*Bloom'?s?\s*Level.*?\n+([\s\S]*?)(?=\n#{1,3}\s|$)/i,
    );
    if (m) bloomBlock = m[1].trim();
  }

  // Prefer parsing by explicit Section A–F blocks (F is mapped to E).
  const blockSections = splitMarkdownIntoNamedBlocks(body);
  const sectionMap = new Map<string, WorksheetQuestion[]>();
  for (const block of blockSections) {
    const mapped = mapSectionName(block.heading);
    if (!/^section\s+[a-f]/i.test(mapped)) continue;
    const qs = parseQuestionsFromLines(block.lines, { relaxedNumbered: true });
    if (!qs.length) continue;
    const prev = sectionMap.get(mapped) || [];
    sectionMap.set(mapped, [...prev, ...qs]);
  }

  // Fallback: parse questions from entire body if no section blocks were found.
  let sections = buildSectionsFromQuestions([]);
  if (sectionMap.size) {
    sections = renumberWorksheetSectionQuestions(
      balanceWorksheetSectionList(
        WORKSHEET_SECTION_ORDER.map((label) => {
          const meta = SECTION_META[label];
          return {
            id: meta.id,
            order: meta.order,
            label,
            displayLabel: `${meta.displayPrefix}. ${label}`,
            questions: sectionMap.get(label) || [],
          };
        }),
      ),
    );
  } else {
    const qs = parseQuestionsFromLines(body.split('\n'));
    sections = buildSectionsFromQuestions(qs);
  }

  // If the markdown didn't provide a dedicated "Answer key" block, but individual
  // questions include answers, synthesize a compact key from those answers so the
  // "Answer key" section in the UI is not empty.
  if (!answerKeyBlock) {
    const allQuestions: WorksheetQuestion[] = [];
    for (const sec of sections) {
      allQuestions.push(...sec.questions);
    }
    const lines: string[] = [];
    allQuestions.forEach((q, i) => {
      const ans = String(q.answer || '').trim();
      if (!ans) return;
      const num =
        Number.isFinite(q.questionNumber as number) && (q.questionNumber as number) > 0
          ? (q.questionNumber as number)
          : i + 1;
      lines.push(`${num}. ${ans}`);
    });
    if (lines.length) {
      answerKeyBlock = lines.join('\n');
    }
  }

  const ws: NormalizedWorksheet = {
    title,
    learningObjectives: objectivesBlock ? coalesceLines(objectivesBlock) : [],
    instructions: instructionsBlock,
    sections,
    answerKey: answerKeyBlock,
    bloomLevel: bloomBlock,
    difficultyTag: '',
  };

  return worksheetHasVisibleContent(ws) ? ws : null;
}

function mergeWorksheetWithMarkdown(
  base: NormalizedWorksheet,
  fromMd: NormalizedWorksheet,
): NormalizedWorksheet {
  const pickTitle = () => {
    const baseOk = base.title && !isInvalidWorksheetTitle(base.title);
    const mdOk = fromMd.title && !isInvalidWorksheetTitle(fromMd.title);
    if (baseOk) return base.title;
    if (mdOk) return fromMd.title;
    return base.title || fromMd.title;
  };

  return finalizeNormalizedWorksheet({
    title: pickTitle(),
    learningObjectives: fromMd.learningObjectives.length
      ? fromMd.learningObjectives
      : base.learningObjectives,
    instructions: fromMd.instructions || base.instructions,
    // Prefer structured JSON sections when they already have real questions — markdown
    // must not overwrite them with answer-key fragments parsed from Section E tail.
    sections: WORKSHEET_SECTION_ORDER.map((label) => {
      const baseSec = base.sections.find((s) => s.label === label);
      const mdSec = fromMd.sections.find((s) => s.label === label);
      if (!baseSec) return mdSec || { id: '', order: 0, label, displayLabel: label, questions: [] };
      const baseCount = baseSec.questions.length;
      const mdCount = mdSec?.questions?.length || 0;
      const useMd =
        mdSec &&
        mdCount > 0 &&
        (baseCount === 0 || (mdCount >= baseCount && mdCount <= baseCount + 2));
      return {
        ...(useMd ? mdSec : baseSec),
        questions: useMd ? mdSec.questions : baseSec.questions,
      };
    }),
    // Prefer markdown extraction for these to prevent them being swallowed by question parsing.
    answerKey: fromMd.answerKey || base.answerKey,
    bloomLevel: fromMd.bloomLevel || base.bloomLevel,
    difficultyTag: fromMd.difficultyTag || base.difficultyTag,
  });
}

function worksheetQualityScore(w: NormalizedWorksheet | null): number {
  if (!w) return 0;
  let score = countWorksheetQuestions(w) * 10;
  score += w.learningObjectives.length * 2;
  if (w.instructions) score += 2;
  if (w.answerKey) score += 2;
  for (const sec of w.sections) {
    if (sec.questions.length > 0) score += 5;
  }
  return score;
}

export function worksheetHasVisibleContent(w: NormalizedWorksheet): boolean {
  return (
    !!w.title ||
    w.learningObjectives.length > 0 ||
    !!w.instructions ||
    w.sections.some((s) => s.questions.length > 0) ||
    !!w.answerKey ||
    !!w.bloomLevel ||
    !!w.difficultyTag
  );
}

export function countWorksheetQuestions(w: NormalizedWorksheet): number {
  return w.sections.reduce((n, s) => n + s.questions.length, 0);
}

export function resolveWorksheetFromPayload(
  content?: string,
  rawContent?: unknown,
): ResolvedWorksheetMcq {
  let formattedText = String(content || '').trim();
  const rawRecords: Record<string, unknown>[] = [];

  try {
    const parsed = JSON.parse(formattedText) as Record<string, unknown>;
    if (parsed.formatted != null) formattedText = String(parsed.formatted).trim();
    if (!formattedText && parsed.markdown) formattedText = String(parsed.markdown).trim();
    rawRecords.push(...absorbRawRecords(parsed.raw));
    if (!rawRecords.length) rawRecords.push(...absorbRawRecords(parsed));
  } catch {
    /* plain markdown */
  }

  if (!rawRecords.length) {
    try {
      rawRecords.push(...absorbRawRecords(JSON.parse(formattedText)));
    } catch {
      /* not json */
    }
  }

  rawRecords.push(...absorbRawRecords(rawContent));

  let worksheet: NormalizedWorksheet | null = null;
  if (rawRecords.length) {
    worksheet = materializeWorksheet(rawRecords[0], rawContent);
    for (let i = 1; i < rawRecords.length; i++) {
      const next = materializeWorksheet(rawRecords[i], rawContent);
      if (countWorksheetQuestions(next) > countWorksheetQuestions(worksheet)) {
        worksheet = next;
      }
    }
  }

  const displayMarkdown =
    formattedText && !looksLikeJsonText(formattedText) ? formattedText : null;

  if (displayMarkdown) {
    const fromMd = parseWorksheetFromMarkdown(displayMarkdown, rawContent);
    if (fromMd) {
      if (!worksheet || !worksheetHasVisibleContent(worksheet)) {
        worksheet = fromMd;
      } else {
        const baseScore = worksheetQualityScore(worksheet);
        const mdScore = worksheetQualityScore(fromMd);
        if (baseScore >= mdScore) {
          worksheet = mergeWorksheetWithMarkdown(worksheet, fromMd);
        } else {
          worksheet = mergeWorksheetWithMarkdown(fromMd, worksheet);
        }
      }
    }
  }

  let markdownFallback: string | null = null;
  if (!worksheet || !worksheetHasVisibleContent(worksheet)) {
    if (displayMarkdown) markdownFallback = displayMarkdown;
  } else {
    worksheet = finalizeNormalizedWorksheet(worksheet);
    if (isInvalidWorksheetTitle(worksheet.title)) {
      worksheet = {
        ...worksheet,
        title: resolveWorksheetTitle('', rawContent),
      };
    }
  }

  return { worksheet, markdownFallback };
}
