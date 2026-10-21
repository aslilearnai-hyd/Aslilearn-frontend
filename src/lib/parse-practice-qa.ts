import { filterUnsupportedQuestions, isUnsupportedQuestionStem } from './unsupported-question-filter';
/**
 * Parse Smart Q&A Practice Generator payloads (sections A–G + answer key).
 */

import { viewerPayloadFromRecord } from '@/lib/resolve-ai-structured-content';
import { sanitizeAiDisplayText } from '@/lib/sanitize-ai-display-text';
import { renumberQuestionList, renumberSectionQuestionLists } from '@/lib/renumber-questions';
import { isPracticeQaSectionHeaderLine, isValidQuestionLine } from '@/lib/ai-tool-section-header';
import {
  formatMatchAnswerKey,
  isMatchStemText,
  normalizeMatchPairs,
} from '@/lib/match-following';

export type PracticeQaQuestion = {
  questionNumber?: number;
  question: string;
  options: string[];
  answer: string;
  explanation?: string;
  marks?: number;
  type?: string;
  section?: string;
  bloomLevel?: string;
  difficultyTag?: string;
  imageUrl?: string;
  imagePrompt?: string;
  needsDiagram?: boolean;
  matchPairs?: { left: string; right: string; leftKey?: string; rightKey?: string }[];
};

export type PracticeQaSection = {
  id: string;
  order: number;
  label: string;
  displayLabel: string;
  questions: PracticeQaQuestion[];
};

export type NormalizedPracticeQa = {
  title: string;
  learningObjectives: string[];
  instructions: string;
  sections: PracticeQaSection[];
  realLifeQuestions: PracticeQaQuestion[];
  answerKey: string;
};

const LEGACY_SECTION_ALIASES: Record<string, string> = {
  'Section C: Match the Following': 'Section C: True or False',
};

export const PRACTICE_QA_SECTION_ORDER = [
  'Section A: MCQs',
  'Section B: Fill in the Blanks',
  'Section C: True or False',
  'Section D: Very Short Answer Questions',
  'Section E: Short Answer Questions',
  'Section F: Application / Case-based Questions',
  'Section G: HOTS / Analytical Questions',
] as const;

export const PRACTICE_QA_REAL_LIFE_SECTION = 'Real-life Problem-solving Questions';

const SECTION_META: Record<string, { id: string; order: number; displayPrefix: string }> = {
  'Section A: MCQs': { id: 'section_a', order: 4, displayPrefix: '4' },
  'Section B: Fill in the Blanks': { id: 'section_b', order: 5, displayPrefix: '5' },
  'Section C: True or False': { id: 'section_c', order: 6, displayPrefix: '6' },
  'Section D: Very Short Answer Questions': { id: 'section_d', order: 7, displayPrefix: '7' },
  'Section E: Short Answer Questions': { id: 'section_e', order: 8, displayPrefix: '8' },
  'Section F: Application / Case-based Questions': { id: 'section_f', order: 9, displayPrefix: '9' },
  'Section G: HOTS / Analytical Questions': { id: 'section_g', order: 10, displayPrefix: '10' },
};

function coalesceLines(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => sanitizeAiDisplayText(x)).filter(Boolean);
  if (typeof v === 'string' && v.trim()) {
    return v
      .split(/\n+/)
      .map((ln) => sanitizeAiDisplayText(ln.replace(/^\s*[-*•]\s*|\s*\d+[\).\s]+/i, '')))
      .filter(Boolean);
  }
  return [];
}

function coalesceText(v: unknown): string {
  if (Array.isArray(v)) return v.map((x) => sanitizeAiDisplayText(x)).filter(Boolean).join('\n');
  return sanitizeAiDisplayText(v);
}

function stripInlineMarkdown(text: string): string {
  let t = String(text || '');
  if (!t.trim()) return '';
  t = t.replace(/^#{1,6}\s+/gm, '');
  t = t.replace(/`([^`]+)`/g, '$1');
  t = t.replace(/\*\*([^*]+)\*\*/g, '$1');
  t = t.replace(/__([^_]+)__/g, '$1');
  t = t.replace(/\s+/g, ' ');
  return t.trim();
}

function normalizeOptions(entry: Record<string, unknown>): string[] {
  if (!Array.isArray(entry?.options)) return [];
  return (entry.options as unknown[])
    .map((opt: unknown, idx: number) => {
      const text = stripInlineMarkdown(String(opt || '').trim());
      if (!text) return '';
      if (/^[A-D][\).]/i.test(text)) return text.replace(/^([A-D])\./i, '$1)');
      return `${String.fromCharCode(65 + idx)}) ${text}`;
    })
    .filter(Boolean);
}

export function toPracticeQaQuestions(value: unknown): PracticeQaQuestion[] {
  const rows = Array.isArray(value) ? value : [];
  const out: PracticeQaQuestion[] = [];

  for (const row of rows) {
    if (typeof row === 'string') {
      const question = stripInlineMarkdown(row);
      if (
        question &&
        isValidQuestionLine(question) &&
        !isPracticeQaSectionHeaderLine(question) &&
        !isUnsupportedQuestionStem(question)
      ) {
        out.push({ question, options: [], answer: '' });
      }
      continue;
    }
    if (!row || typeof row !== 'object') continue;
    const entry = row as Record<string, unknown>;
    const question = stripInlineMarkdown(
      String(entry.question || entry.question_text || entry.prompt || entry.text || '').trim(),
    );
    if (!question || isPracticeQaSectionHeaderLine(question) || !isValidQuestionLine(question)) continue;
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
      bloomLevel:
        stripInlineMarkdown(String(entry.bloom_level || entry.bloomLevel || '').trim()) || undefined,
      difficultyTag:
        stripInlineMarkdown(
          String(entry.difficulty_tag || entry.difficultyTag || entry.difficulty || '').trim(),
        ) || undefined,
      ...(imageUrl ? { imageUrl } : {}),
      ...(imagePrompt ? { imagePrompt } : {}),
      ...(needsDiagram ? { needsDiagram: true } : {}),
      ...(matchPairs.length >= 2 ? { matchPairs } : {}),
    });
  }

  return out;
}

export function mapPracticeQaSectionName(name: string): string {
  const raw = String(name || '').trim();
  const aliased = LEGACY_SECTION_ALIASES[raw];
  if (aliased) return aliased;
  const n = raw;
  if (/^section\s*a|mcq|multiple\s*choice/i.test(n)) return PRACTICE_QA_SECTION_ORDER[0];
  if (/^section\s*b|fill|blank|fib/i.test(n)) return PRACTICE_QA_SECTION_ORDER[1];
  if (/^section\s*c|true\s*or\s*false|t\/?f\b|match/i.test(n)) return PRACTICE_QA_SECTION_ORDER[2];
  if (/^6\b|section\s*6/i.test(n) && /(match|true\s*or\s*false)/i.test(n)) return PRACTICE_QA_SECTION_ORDER[2];
  if (/^section\s*d|very\s*short|vsa/i.test(n)) return PRACTICE_QA_SECTION_ORDER[3];
  if (/^section\s*e|short\s*answer/i.test(n) && !/very/i.test(n)) return PRACTICE_QA_SECTION_ORDER[4];
  if (/^section\s*f|application|case/i.test(n)) return PRACTICE_QA_SECTION_ORDER[5];
  if (/^section\s*g|hots|analytical/i.test(n)) return PRACTICE_QA_SECTION_ORDER[6];
  if (/real[\s-]*life|problem[\s-]*solving/i.test(n)) return PRACTICE_QA_REAL_LIFE_SECTION;
  if ((PRACTICE_QA_SECTION_ORDER as readonly string[]).includes(n)) return n;
  return n || 'Questions';
}

function questionDedupeKey(q: PracticeQaQuestion): string {
  const n = q.questionNumber != null ? String(q.questionNumber) : '';
  const text = q.question.toLowerCase().replace(/\s+/g, ' ').trim();
  const sec = mapPracticeQaSectionName(q.section || '');
  // Same text under a new number is still the same question (HOTS showed Q1 and Q2 identical).
  return text ? `${sec}::${text}` : `${sec}::${n}::`;
}

function dedupePracticeQaQuestions(questions: PracticeQaQuestion[]): PracticeQaQuestion[] {
  const seen = new Map<string, number>();
  const out: PracticeQaQuestion[] = [];
  const richness = (q: PracticeQaQuestion) =>
    (q.answer ? 2 : 0) + (q.explanation ? 1 : 0) + ((q as { marks?: unknown }).marks != null ? 1 : 0) + (q.options?.length ? 1 : 0);
  for (const q of questions) {
    const key = questionDedupeKey(q);
    const at = key.endsWith('::') ? undefined : seen.get(key);
    if (at != null) {
      // Keep whichever copy carries the answer / marks.
      if (richness(q) > richness(out[at])) out[at] = { ...q, questionNumber: out[at].questionNumber };
      continue;
    }
    if (!key.endsWith('::')) seen.set(key, out.length);
    out.push(q);
  }
  return out;
}

function inferSectionForQuestion(q: PracticeQaQuestion): string {
  let sec = String(q.section || '').trim();
  const qType = String(q.type || '').trim().toUpperCase();
  if (qType === 'MCQ' || /multiple\s*choice/i.test(qType)) return PRACTICE_QA_SECTION_ORDER[0];
  if (qType === 'FIB' || /fill/i.test(qType)) return PRACTICE_QA_SECTION_ORDER[1];
  if (qType === 'TF' || qType === 'TRUE_FALSE' || qType === 'TRUEFALSE' || /true\s*or\s*false/i.test(qType)) return PRACTICE_QA_SECTION_ORDER[2];
  if (qType === 'VSA') return PRACTICE_QA_SECTION_ORDER[3];
  if (/short\s*answer/i.test(qType) && !/very/i.test(qType)) return PRACTICE_QA_SECTION_ORDER[4];
  if (qType === 'HOTS' || /analytical/i.test(qType)) return PRACTICE_QA_SECTION_ORDER[6];
  if (sec && sec !== 'Questions') return mapPracticeQaSectionName(sec);
  const qt = q.question;
  const words = qt.split(/\s+/).filter(Boolean).length;
  if (q.options.length >= 2) return PRACTICE_QA_SECTION_ORDER[0];
  if (/_{2,}/.test(qt)) return PRACTICE_QA_SECTION_ORDER[1];
  if (/true\s*or\s*false|^t\/?f\b/i.test(qt)) return PRACTICE_QA_SECTION_ORDER[2];
  if (/application|case[\s-]*based|competency/i.test(qt)) return PRACTICE_QA_SECTION_ORDER[5];
  if (/hots|analytical|higher[\s-]*order/i.test(qt)) return PRACTICE_QA_SECTION_ORDER[6];
  if (/\?/.test(qt) && words <= 22) return PRACTICE_QA_SECTION_ORDER[3];
  if (/\?/.test(qt)) return PRACTICE_QA_SECTION_ORDER[4];
  return PRACTICE_QA_SECTION_ORDER[3];
}

function buildSectionsFromQuestions(questions: PracticeQaQuestion[]): PracticeQaSection[] {
  const sectionMap = new Map<string, PracticeQaQuestion[]>();
  for (const q of filterUnsupportedQuestions(questions) as PracticeQaQuestion[]) {
    const key = inferSectionForQuestion(q);
    const prev = sectionMap.get(key) || [];
    sectionMap.set(key, [...prev, q]);
  }
  return PRACTICE_QA_SECTION_ORDER.map((label) => {
    const meta = SECTION_META[label];
    const qs = (sectionMap.get(label) || []).sort(
      (a, b) => Number(a.questionNumber || 0) - Number(b.questionNumber || 0),
    );
    return {
      id: meta.id,
      order: meta.order,
      label,
      displayLabel: `${meta.displayPrefix}. ${label}`,
      questions: qs,
    };
  });
}

function expandRawRecord(raw: Record<string, unknown>): Record<string, unknown> {
  const r = { ...raw };
  r.title = r.title ?? r.practice_set_title ?? r.name;
  r.learning_objectives = r.learning_objectives ?? r.learningObjectives ?? r.objectives;
  r.instructions = r.instructions ?? r.student_instructions;
  r.answer_key =
    r.answer_key ?? r.answerKey ?? r.answer_key_with_explanations ?? r.answerKeyWithExplanations;
  return r;
}

function materializePracticeQa(raw: Record<string, unknown>): NormalizedPracticeQa {
  const r = expandRawRecord(raw);
  const sectionMap = new Map<string, PracticeQaQuestion[]>();

  if (Array.isArray(r.sections)) {
    for (const sec of r.sections) {
      if (!sec || typeof sec !== 'object') continue;
      const s = sec as Record<string, unknown>;
      const name = mapPracticeQaSectionName(String(s.sectionName || s.title || s.name || 'Section'));
      const qs = filterUnsupportedQuestions(toPracticeQaQuestions(s.questions)) as PracticeQaQuestion[];
      const prev = sectionMap.get(name) || [];
      sectionMap.set(name, [...prev, ...qs]);
    }
  }

  const sectionKeyMap: Array<[string, string]> = [
    ['section_a_mcqs', PRACTICE_QA_SECTION_ORDER[0]],
    ['section_a', PRACTICE_QA_SECTION_ORDER[0]],
    ['section_b_fill_in_blanks', PRACTICE_QA_SECTION_ORDER[1]],
    ['section_b_fib', PRACTICE_QA_SECTION_ORDER[1]],
    ['fill_in_blanks', PRACTICE_QA_SECTION_ORDER[1]],
    ['section_c_true_false', PRACTICE_QA_SECTION_ORDER[2]],
    ['section_c_tf', PRACTICE_QA_SECTION_ORDER[2]],
    ['true_false', PRACTICE_QA_SECTION_ORDER[2]],
    ['section_c_match_following', PRACTICE_QA_SECTION_ORDER[2]],
    ['section_c_match', PRACTICE_QA_SECTION_ORDER[2]],
    ['match_following', PRACTICE_QA_SECTION_ORDER[2]],
    ['section_d_vsa', PRACTICE_QA_SECTION_ORDER[3]],
    ['section_d', PRACTICE_QA_SECTION_ORDER[3]],
    ['section_e_short_answer', PRACTICE_QA_SECTION_ORDER[4]],
    ['section_e_sa', PRACTICE_QA_SECTION_ORDER[4]],
    ['section_f_application', PRACTICE_QA_SECTION_ORDER[5]],
    ['section_f_case_based', PRACTICE_QA_SECTION_ORDER[5]],
    ['section_g_hots', PRACTICE_QA_SECTION_ORDER[6]],
    ['section_g_analytical', PRACTICE_QA_SECTION_ORDER[6]],
  ];
  for (const [key, sectionLabel] of sectionKeyMap) {
    const block = r[key];
    if (!block) continue;
    const rows = Array.isArray(block)
      ? block
      : block && typeof block === 'object'
        ? ((block as Record<string, unknown>).questions ??
          (block as Record<string, unknown>).items ??
          [])
        : [];
    const qs = toPracticeQaQuestions(rows).map((q) => ({ ...q, section: q.section || sectionLabel }));
    if (!qs.length) continue;
    const prev = sectionMap.get(sectionLabel) || [];
    sectionMap.set(sectionLabel, [...prev, ...qs]);
  }

  const sectionQuestionCount = [...sectionMap.values()].reduce((n, qs) => n + qs.length, 0);
  if (sectionQuestionCount === 0) {
    const flatQs = toPracticeQaQuestions(r.questions ?? r.practice_questions ?? r.mcqs ?? r.items);
    for (const q of flatQs) {
      const key = inferSectionForQuestion(q);
      const prev = sectionMap.get(key) || [];
      sectionMap.set(key, [...prev, q]);
    }
  }

  if (!sectionMap.size && String(r.question || '').trim()) {
    const single = toPracticeQaQuestions([r])[0];
    if (single) {
      const key = inferSectionForQuestion(single);
      sectionMap.set(key, [single]);
    }
  }

  const sections = PRACTICE_QA_SECTION_ORDER.map((label) => {
    const meta = SECTION_META[label];
    const qs = dedupePracticeQaQuestions(sectionMap.get(label) || []).sort(
      (a, b) => Number(a.questionNumber || 0) - Number(b.questionNumber || 0),
    );
    return {
      id: meta.id,
      order: meta.order,
      label,
      displayLabel: `${meta.displayPrefix}. ${label}`,
      questions: qs,
    };
  });

  const realLifeQuestions = toPracticeQaQuestions(
    r.real_life_problem_solving_questions ?? r.realLifeProblemSolvingQuestions ?? r.real_life_questions,
  ).map((q) => ({ ...q, section: PRACTICE_QA_REAL_LIFE_SECTION }));

  return {
    title: String(r.title || 'Practice Q&A').trim(),
    learningObjectives: coalesceLines(r.learning_objectives),
    instructions: coalesceText(r.instructions),
    sections: renumberSectionQuestionLists(sections),
    realLifeQuestions: renumberQuestionList(realLifeQuestions),
    answerKey: coalesceText(r.answer_key),
  };
}

function absorbRawRecords(raw: unknown, depth = 0): Record<string, unknown>[] {
  if (!raw || depth > 4) return [];
  if (Array.isArray(raw)) return raw.filter((x) => x && typeof x === 'object') as Record<string, unknown>[];
  if (typeof raw !== 'object') return [];
  const o = raw as Record<string, unknown>;

  const hasPracticeShape =
    o.kind === 'practiceQa' ||
    Array.isArray(o.sections) ||
    Array.isArray(o.questions) ||
    o.title ||
    o.practice_set_title;

  if (hasPracticeShape && !o.renderContent && !o.structuredContent) {
    return [o];
  }

  const out: Record<string, unknown>[] = [];
  if (o.structuredContent && typeof o.structuredContent === 'object') {
    out.push(...absorbRawRecords(o.structuredContent, depth + 1));
  } else if (o.renderContent && typeof o.renderContent === 'object') {
    const rc = o.renderContent as Record<string, unknown>;
    if (rc.kind === 'practiceQa' || Array.isArray(rc.sections)) {
      out.push(rc);
    } else {
      out.push(...absorbRawRecords(o.renderContent, depth + 1));
    }
  } else if (hasPracticeShape) {
    out.push(o);
  }
  return out;
}

function mergeSectionLists(
  base: PracticeQaSection[],
  patch: PracticeQaSection[],
): PracticeQaSection[] {
  const byLabel = new Map<string, PracticeQaQuestion[]>();
  for (const sec of [...base, ...patch]) {
    const prev = byLabel.get(sec.label) || [];
    byLabel.set(sec.label, dedupePracticeQaQuestions([...prev, ...sec.questions]));
  }
  return PRACTICE_QA_SECTION_ORDER.map((label) => {
    const meta = SECTION_META[label];
    const qs = (byLabel.get(label) || []).sort(
      (a, b) => Number(a.questionNumber || 0) - Number(b.questionNumber || 0),
    );
    return {
      id: meta.id,
      order: meta.order,
      label,
      displayLabel: `${meta.displayPrefix}. ${label}`,
      questions: qs,
    };
  });
}

function mergePracticeQa(base: NormalizedPracticeQa, patch: NormalizedPracticeQa): NormalizedPracticeQa {
  return {
    title: base.title || patch.title,
    learningObjectives: base.learningObjectives.length ? base.learningObjectives : patch.learningObjectives,
    instructions: base.instructions || patch.instructions,
    sections: mergeSectionLists(base.sections, patch.sections),
    realLifeQuestions: dedupePracticeQaQuestions(
      base.realLifeQuestions.length ? base.realLifeQuestions : patch.realLifeQuestions,
    ),
    answerKey: base.answerKey || patch.answerKey,
  };
}

function parseNumberedSections(markdown: string): Map<number, string> {
  const lines = String(markdown || '').split('\n');
  const sections = new Map<number, string[]>();
  let current = 0;

  for (const raw of lines) {
    const line = raw.trim();
    const match = line.match(/^(?:#{1,3}\s*)?(\d{1,2})\.\s*(.+)$/);
    if (match) {
      current = Number(match[1]);
      if (!sections.has(current)) sections.set(current, []);
      continue;
    }
    if (current > 0 && sections.has(current)) {
      sections.get(current)!.push(raw);
    }
  }

  const result = new Map<number, string>();
  for (const [num, body] of sections.entries()) {
    result.set(num, body.join('\n').trim());
  }
  return result;
}

function fromMarkdown(content: string): NormalizedPracticeQa {
  const numbered = parseNumberedSections(content);
  const title =
    numbered.get(1)?.replace(/^#+\s*/, '').trim() ||
    String(content || '')
      .split('\n')
      .map((l) => l.trim())
      .find((l) => /^#\s+/.test(l) && !/^##\s+/.test(l))
      ?.replace(/^#+\s*/, '') ||
    'Practice Q&A';

  const objectives = coalesceLines(numbered.get(2) || '');
  const instructions = coalesceText(numbered.get(3) || '');

  const sectionBodies: Record<string, string> = {};
  for (let i = 4; i <= 10; i++) {
    const body = numbered.get(i);
    if (body) {
      const label = PRACTICE_QA_SECTION_ORDER[i - 4];
      if (label) sectionBodies[label] = body;
    }
  }

  const allQuestions: PracticeQaQuestion[] = [];
  for (const label of PRACTICE_QA_SECTION_ORDER) {
    const body = sectionBodies[label];
    if (!body) continue;
    const lines = body.split('\n');
    let current: PracticeQaQuestion | null = null;
    for (const line of lines) {
      const t = line.trim();
      const qMatch = t.match(/^\*\*Q(\d+)\.\*\*\s*(.+)$/i) || t.match(/^Q(\d+)\.\s+(.+)$/i);
      if (qMatch) {
        if (current) allQuestions.push({ ...current, section: label });
        current = {
          questionNumber: Number(qMatch[1]),
          question: stripInlineMarkdown(qMatch[2]),
          options: [],
          answer: '',
          section: label,
        };
        continue;
      }
      if (/^[A-D][\).]\s+/i.test(t) && current) {
        current.options.push(normalizeOptions({ options: [t] })[0] || t);
        continue;
      }
      if (/^\*\*Answer:\*\*/i.test(t) && current) {
        current.answer = stripInlineMarkdown(t.replace(/^\*\*Answer:\*\*\s*/i, ''));
        continue;
      }
      if (/^\*\*Explanation:\*\*/i.test(t) && current) {
        current.explanation = stripInlineMarkdown(t.replace(/^\*\*Explanation:\*\*\s*/i, ''));
      }
    }
    if (current) allQuestions.push({ ...current, section: label });
  }

  const sections = buildSectionsFromQuestions(allQuestions);
  const answerKey = coalesceText(numbered.get(11) || '');

  return {
    title,
    learningObjectives: objectives,
    instructions,
    sections,
    realLifeQuestions: [],
    answerKey,
  };
}

export function countPracticeQaQuestions(practice: NormalizedPracticeQa): number {
  return (
    practice.sections.reduce((n, s) => n + s.questions.length, 0) + practice.realLifeQuestions.length
  );
}

export function practiceQaHasVisibleContent(practice: NormalizedPracticeQa): boolean {
  return (
    Boolean(practice.title && practice.title !== 'Practice Q&A') ||
    practice.learningObjectives.length > 0 ||
    Boolean(practice.instructions) ||
    countPracticeQaQuestions(practice) > 0 ||
    Boolean(practice.answerKey)
  );
}

export function resolvePracticeQaFromPayload(
  content: string,
  rawContent?: unknown,
): { practice: NormalizedPracticeQa | null; markdownFallback: string | null } {
  const records = absorbRawRecords(rawContent);
  let practice: NormalizedPracticeQa | null = null;

  for (const rec of records) {
    const next = materializePracticeQa(rec);
    practice = practice ? mergePracticeQa(practice, next) : next;
  }

  try {
    const t = String(content || '').trim();
    if (t.startsWith('{')) {
      const j = JSON.parse(t) as Record<string, unknown>;
      if (j.structuredContent && typeof j.structuredContent === 'object') {
        const next = materializePracticeQa(j.structuredContent as Record<string, unknown>);
        practice = practice ? mergePracticeQa(practice, next) : next;
      }
    }
  } catch {
    /* ignore */
  }

  const structuredCount = practice ? countPracticeQaQuestions(practice) : 0;
  const fromMd = fromMarkdown(content);
  if (practice) {
    if (structuredCount === 0) {
      practice = mergePracticeQa(practice, fromMd);
    } else {
      practice = {
        ...practice,
        title: practice.title || fromMd.title,
        learningObjectives: practice.learningObjectives.length
          ? practice.learningObjectives
          : fromMd.learningObjectives,
        instructions: practice.instructions || fromMd.instructions,
        answerKey: practice.answerKey || fromMd.answerKey,
      };
    }
  } else {
    practice = fromMd;
  }

  if (!practiceQaHasVisibleContent(practice)) {
    return { practice: null, markdownFallback: content || null };
  }

  return { practice, markdownFallback: null };
}

export function practiceQaViewerPayloadFromRecord(
  record?: {
    generatedContent?: string;
    content?: string;
    structuredContent?: unknown;
    metadata?: { structuredContent?: unknown };
    renderContent?: unknown;
  } | null,
): { content: string; rawContent?: unknown } {
  const p = viewerPayloadFromRecord(record);
  return { content: p.content, rawContent: p.rawContent ?? record?.renderContent };
}

export function looksLikePracticeQaContent(text: string): boolean {
  const sample = String(text || '').slice(0, 14000);
  if (!sample.trim()) return false;
  const hasTool =
    /smart\s*q\s*&?\s*a\s*practice/i.test(sample) ||
    /practice\s*q\s*&?\s*a/i.test(sample) ||
    /practice\s*set\s*title/i.test(sample);
  const hasSections =
    /section\s*a:\s*mcq/i.test(sample) ||
    /section\s*g:\s*hots/i.test(sample) ||
    /(?:^|\n)\s*#{0,3}\s*4\.\s*Section\s*A/i.test(sample);
  const hasQuestions = /\*\*Q\d+\.\*\*/i.test(sample) || /^Q\d+\./im.test(sample);
  return (hasTool || hasSections) && (hasSections || hasQuestions);
}
