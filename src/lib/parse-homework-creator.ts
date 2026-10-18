/**
 * Parse Homework Creator payloads into the 10-section homework model.
 */

import { coerceHomeworkText } from '@/lib/coerce-homework-text';
import {
  stripAiGeneratorLeakage,
  stripVariantScaffoldFromQuestionText,
} from '@/lib/strip-ai-tool-metadata';
import { isHomeworkSectionHeaderLine, isValidQuestionLine } from '@/lib/ai-tool-section-header';
import {
  formatMatchAnswerKey,
  isMatchStemText,
  normalizeMatchPairs,
} from '@/lib/match-following';
export type HomeworkPracticeQuestion = {
  questionNumber?: number;
  question: string;
  options: string[];
  answer: string;
  explanation?: string;
  marks?: number;
  type?: string;
  imageUrl?: string;
  imagePrompt?: string;
  needsDiagram?: boolean;
  matchPairs?: { left: string; right: string; leftKey?: string; rightKey?: string }[];
};

export type NormalizedHomework = {
  title: string;
  instructions: string;
  practiceQuestions: HomeworkPracticeQuestion[];
  applicationTasks: string[];
  creativeThinkingQuestion: string;
  realLifeObservationTask: string;
  challengeQuestion: string;
  supportHint: string;
  answerHints: string;
  parentNote: string;
};

export type ResolvedHomework = {
  homework: NormalizedHomework | null;
  markdownFallback: string | null;
};

function normalizeForKey(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function practiceQuestionKey(q: HomeworkPracticeQuestion): string {
  return [
    normalizeForKey(q.question),
    q.options.map((o) => normalizeForKey(o)).join('|'),
    normalizeForKey(q.answer),
  ].join('||');
}

function dedupePracticeQuestions(items: HomeworkPracticeQuestion[]): HomeworkPracticeQuestion[] {
  const seen = new Set<string>();
  const out: HomeworkPracticeQuestion[] = [];
  for (const q of items) {
    const key = practiceQuestionKey(q);
    if (!key.replace(/\|/g, '').trim()) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(q);
  }
  return out;
}

function dedupeByQuestionText(items: HomeworkPracticeQuestion[]): HomeworkPracticeQuestion[] {
  const seen = new Set<string>();
  return dedupePracticeQuestions(items).filter((q) => {
    const key = normalizeForKey(q.question);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function stripOrderedPrefix(line: string): string {
  return String(line || '')
    .replace(/^\s*\d+[\).\s]+/i, '')
    .replace(/^\s*[-*•]\s*/, '')
    .trim();
}

function coalesceLines(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v
      .map((x) => {
        // Saved records can hold the literal "[object Object]" (objects that
        // were stringified on save); coerceHomeworkText drops it.
        return stripOrderedPrefix(coerceHomeworkText(x));
      })
      .filter(Boolean);
  }
  const text = coerceHomeworkText(v);
  if (!text) return [];
  return text.split(/\n+/).map(stripOrderedPrefix).filter(Boolean);
}

function normalizeOptions(entry: Record<string, unknown>): string[] {
  if (!Array.isArray(entry?.options)) return [];
  return (entry.options as unknown[])
    .map((opt) => String(opt || '').trim())
    .filter(Boolean);
}

function toPracticeQuestions(value: unknown): HomeworkPracticeQuestion[] {
  const rows = Array.isArray(value) ? value : [];
  const out: HomeworkPracticeQuestion[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') {
      const q = coerceHomeworkText(row);
      if (q && isValidQuestionLine(q) && !isHomeworkSectionHeaderLine(q)) {
        out.push({ question: q, options: [], answer: '' });
      }
      continue;
    }
    const entry = row as Record<string, unknown>;
    const question = stripAiGeneratorLeakage(
      stripVariantScaffoldFromQuestionText(
        coerceHomeworkText(
          entry.question ||
            entry.prompt ||
            entry.text ||
            entry.statement ||
            entry.stem ||
            entry.task ||
            entry.q,
        ),
      ),
    );
    if (!question || isHomeworkSectionHeaderLine(question) || !isValidQuestionLine(question)) continue;
    const marksRaw = entry.marks ?? entry.mark ?? entry.marks_allotted;
    const marksParsed =
      marksRaw != null && !Number.isNaN(Number(marksRaw)) ? Number(marksRaw) : undefined;
    const marks = Number.isFinite(marksParsed) ? marksParsed : 1;
    const imageUrl = String(entry.imageUrl || entry.image_url || entry.questionImage || '').trim();
    const imagePrompt = String(entry.imagePrompt || entry.image_prompt || entry.figurePrompt || '').trim();
    const needsDiagramRaw = entry.needsDiagram ?? entry.needs_diagram ?? entry.needsFigure;
    const needsDiagram =
      needsDiagramRaw === true ||
      needsDiagramRaw === 1 ||
      ['true', '1', 'yes'].includes(String(needsDiagramRaw || '').trim().toLowerCase());
    const matchPairs = normalizeMatchPairs(entry);
    const type =
      coerceHomeworkText(entry.type || entry.question_type || entry.difficulty || entry.bloom_level) ||
      (matchPairs.length >= 2 || isMatchStemText(question) ? 'MATCH' : 'Practice');
    const answer =
      coerceHomeworkText(entry.answer || entry.correctAnswer) ||
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
      explanation: coerceHomeworkText(entry.explanation || entry.solution) || undefined,
      marks,
      type,
      ...(imageUrl ? { imageUrl } : {}),
      ...(imagePrompt ? { imagePrompt } : {}),
      ...(needsDiagram ? { needsDiagram: true } : {}),
      ...(matchPairs.length >= 2 ? { matchPairs } : {}),
    });
  }
  return dedupePracticeQuestions(out);
}

const HOMEWORK_SECTION_HINT: Record<number, RegExp> = {
  1: /homework\s+title|^title$/i,
  2: /clear\s+student\s+instructions|^instructions/i,
  3: /practice\s+questions/i,
  4: /application/i,
  5: /creative|thinking\s+question/i,
  6: /real[\s-]*life|observation/i,
  7: /challenge/i,
  8: /support\s+hint/i,
  9: /answer\s+hints|key\s+points/i,
  10: /parent\s+note/i,
};

const SECTION_HEADING_MD_RE = /^#{1,3}\s+(\d{1,2})\.\s*(.+?)\s*$/i;
const SECTION_HEADING_BOLD_RE = /^\*\*(\d{1,2})\.\s*(.+?)\*\*\s*$/i;
const SECTION_PLAIN_RE = /^(\d{1,2})\.\s+(.+?)\s*$/i;

function templateSectionNumberFromLine(line: string): number | null {
  const trimmed = line.trim();
  let m = trimmed.match(SECTION_HEADING_MD_RE);
  if (m) {
    const n = Number(m[1]);
    if (n >= 1 && n <= 10) return n;
  }
  m = trimmed.match(SECTION_HEADING_BOLD_RE);
  if (m) {
    const n = Number(m[1]);
    if (n >= 1 && n <= 10) return n;
  }
  m = trimmed.match(SECTION_PLAIN_RE);
  if (m) {
    const n = Number(m[1]);
    const hint = HOMEWORK_SECTION_HINT[n];
    if (n >= 1 && n <= 10 && hint?.test(m[2])) return n;
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

function linesToList(body: string): string[] {
  return body
    .split(/\n+/)
    .map((line) => stripOrderedPrefix(line))
    .filter(Boolean);
}

function linesToPracticeQuestions(body: string): HomeworkPracticeQuestion[] {
  const lines = body.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const out: HomeworkPracticeQuestion[] = [];
  let current: HomeworkPracticeQuestion | null = null;
  let optionBuf: string[] = [];

  const flush = () => {
    if (!current) return;
    if (!current.options.length && optionBuf.length >= 2) {
      current.options = optionBuf.slice(0, 8);
    }
    optionBuf = [];
    if (current.question) out.push(current);
    current = null;
  };

  for (const line of lines) {
    const qMatch =
      line.match(/^(?:\*\*)?Q(?:uestion)?\s*(\d+)?\s*[\).:\-]?\s*(.+)$/i) ||
      line.match(/^(\d+)\.\s+(.+)$/);
    if (qMatch) {
      flush();
      const qNum = qMatch[1] ? Number(qMatch[1]) : undefined;
      current = {
        questionNumber: Number.isFinite(qNum) ? qNum : undefined,
        question: coerceHomeworkText(qMatch[2]),
        options: [],
        answer: '',
      };
      continue;
    }
    const ansMatch = line.match(/^(?:\*\*)?Answer\s*[:\-]\s*(.+)$/i);
    if (ansMatch && current) {
      current.answer = coerceHomeworkText(ansMatch[1]);
      continue;
    }
    if (current && /^[A-D][\).]\s+/i.test(line)) {
      optionBuf.push(line);
      continue;
    }
    if (current) {
      current.question = `${current.question}\n${line}`.trim();
    }
  }
  flush();
  return out;
}

function materializeHomework(raw: Record<string, unknown>): NormalizedHomework {
  // The same questions arrive under several keys (V2 sends `practice_questions`
  // as strings AND `questions` as objects): concatenating them showed
  // "40 practice questions" for a 20-question homework. Use the richest list.
  const lists = [raw.questions, raw.practice_questions, raw.practiceQuestions].filter(
    (v): v is unknown[] => Array.isArray(v) && v.length > 0,
  );
  const practiceRaw = lists[0] || [];

  return {
    title: coerceHomeworkText(raw.title || raw.homework_title || raw.name || 'Homework'),
    instructions: coerceHomeworkText(
      raw.instructions || raw.student_instructions || raw.homework_instructions,
    ),
    practiceQuestions: dedupeByQuestionText(toPracticeQuestions(practiceRaw)),
    applicationTasks: (() => {
      const tasks = coalesceLines(raw.application_tasks || raw.applicationTasks);
      if (tasks.length) return tasks;
      // Old records whose tasks were all "[object Object]": use the
      // application / short-answer questions they were built from.
      return (Array.isArray(raw.questions) ? raw.questions : [])
        .filter((q: any) => q && typeof q === 'object' && /^(SA|APPLICATION)$/i.test(String(q.type || '')))
        .map((q: any) => coerceHomeworkText(q.question))
        .filter(Boolean);
    })(),
    creativeThinkingQuestion: coerceHomeworkText(
      raw.creative_thinking_question || raw.creativeThinkingQuestion || raw.creative_question,
    ),
    realLifeObservationTask: coerceHomeworkText(
      raw.real_life_observation_task || raw.realLifeObservationTask || raw.observation_task,
    ),
    challengeQuestion: coerceHomeworkText(raw.challenge_question || raw.challengeQuestion),
    supportHint: coerceHomeworkText(raw.support_hint || raw.supportHint || raw.hints),
    answerHints: coerceHomeworkText(raw.answer_hints || raw.answerHints || raw.answer_key),
    parentNote: coerceHomeworkText(raw.parent_note || raw.parentNote),
  };
}

function rawFromSectionMap(sectionMap: Map<number, string>): Record<string, unknown> {
  const raw: Record<string, unknown> = {};
  const get = (n: number) => sectionMap.get(n) || '';

  const title = get(1);
  if (title) raw.title = title;

  const ins = get(2);
  if (ins) raw.instructions = ins;

  const pq = linesToPracticeQuestions(get(3));
  if (pq.length) raw.practice_questions = pq;

  const app = linesToList(get(4));
  if (app.length) raw.application_tasks = app;

  const creative = get(5);
  if (creative) raw.creative_thinking_question = creative;

  const obs = get(6);
  if (obs) raw.real_life_observation_task = obs;

  const challenge = get(7);
  if (challenge) raw.challenge_question = challenge;

  const hint = get(8);
  if (hint) raw.support_hint = hint;

  const answers = get(9);
  if (answers) raw.answer_hints = answers;

  const parent = get(10);
  if (parent) raw.parent_note = parent;

  return raw;
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
  if (meta?.renderContent && typeof meta.renderContent === 'object') {
    return absorbRawRecords(meta.renderContent);
  }
  if (o.structuredContent && typeof o.structuredContent === 'object') {
    return absorbRawRecords(o.structuredContent);
  }
  if (o.renderContent && typeof o.renderContent === 'object') {
    return absorbRawRecords(o.renderContent);
  }
  if (o.title || o.instructions || o.questions || o.practice_questions) return [o];
  if (o.question || o.prompt) return [o];
  if (o.raw && typeof o.raw === 'object') return absorbRawRecords(o.raw);
  if (o.data && typeof o.data === 'object') return absorbRawRecords(o.data);
  return [];
}

function isQuestionOnlyRow(r: Record<string, unknown>): boolean {
  const hasQuestion = Boolean(
    String(r.question || r.prompt || r.text || '').trim(),
  );
  const hasShell = Boolean(
    String(r.title || r.homework_title || '').trim() ||
      String(r.instructions || '').trim() ||
      coerceHomeworkText(r.creative_thinking_question) ||
      coerceHomeworkText(r.real_life_observation_task) ||
      coerceHomeworkText(r.challenge_question) ||
      coerceHomeworkText(r.parent_note) ||
      coerceHomeworkText(r.support_hint),
  );
  return hasQuestion && !hasShell;
}

function mergeHomeworkRecords(records: Record<string, unknown>[]): Record<string, unknown> {
  if (!records.length) return {};
  if (records.length === 1) return records[0];

  const full = records.find(
    (r) =>
      String(r.title || r.homework_title || '').trim() &&
      !/^homework\s+\d+$/i.test(String(r.title || r.homework_title || '').trim()),
  );
  const withSections = records.find(
    (r) =>
      String(r.instructions || '').trim() ||
      coerceHomeworkText(r.creative_thinking_question) ||
      coerceHomeworkText(r.parent_note),
  );
  const base: Record<string, unknown> = {
    ...(withSections || full || records[0]),
  };

  const questions: HomeworkPracticeQuestion[] = [];
  for (const r of records) {
    if (Array.isArray(r.practice_questions)) {
      questions.push(...toPracticeQuestions(r.practice_questions));
    }
    if (Array.isArray(r.questions)) {
      questions.push(...toPracticeQuestions(r.questions));
    }
    if (isQuestionOnlyRow(r)) {
      questions.push(...toPracticeQuestions([r]));
    }
  }
  const uniqueQuestions = dedupePracticeQuestions(questions);
  if (uniqueQuestions.length) {
    base.practice_questions = uniqueQuestions;
    base.questions = uniqueQuestions;
  }

  if (!String(base.title || '').trim() || /^homework\s+\d+$/i.test(String(base.title || ''))) {
    const named = records
      .map((r) => String(r.title || r.homework_title || '').trim())
      .find((t) => t && !/^homework\s+\d+$/i.test(t));
    if (named) base.title = named;
  }

  return base;
}

export function homeworkHasVisibleContent(h: NormalizedHomework): boolean {
  return (
    !!h.instructions ||
    h.practiceQuestions.length > 0 ||
    h.applicationTasks.length > 0 ||
    !!h.creativeThinkingQuestion ||
    !!h.realLifeObservationTask ||
    !!h.challengeQuestion ||
    !!h.supportHint ||
    !!h.answerHints ||
    !!h.parentNote
  );
}

function mergeNormalizedHomeworks(items: NormalizedHomework[]): NormalizedHomework | null {
  if (!items.length) return null;
  if (items.length === 1) return items[0];

  const title =
    items
      .map((h) => h.title)
      .find((t) => t && !/^homework\s+\d+$/i.test(t)) || items[0].title || 'Homework';

  const pickFirst = (fn: (h: NormalizedHomework) => string) => {
    for (const h of items) {
      const v = fn(h).trim();
      if (v) return v;
    }
    return '';
  };

  const practiceQuestions = dedupePracticeQuestions(items.flatMap((h) => h.practiceQuestions));
  const applicationTasks = [...new Set(items.flatMap((h) => h.applicationTasks))];

  return {
    title,
    instructions: pickFirst((h) => h.instructions),
    practiceQuestions,
    applicationTasks,
    creativeThinkingQuestion: pickFirst((h) => h.creativeThinkingQuestion),
    realLifeObservationTask: pickFirst((h) => h.realLifeObservationTask),
    challengeQuestion: pickFirst((h) => h.challengeQuestion),
    supportHint: pickFirst((h) => h.supportHint),
    answerHints: pickFirst((h) => h.answerHints),
    parentNote: pickFirst((h) => h.parentNote),
  };
}

function parseHomeworkChunk(chunk: string, fallbackTitle: string): NormalizedHomework | null {
  const trimmed = String(chunk || '').trim();
  if (!trimmed) return null;

  const h2 = trimmed.match(/^##\s+(.+?)(?:\n|$)/m);
  let title = h2 ? h2[1].replace(/^\d+\.\s*/, '').trim() : fallbackTitle;
  const bodyStart = h2 ? trimmed.slice(h2.index! + h2[0].length) : trimmed;
  const sectionMap = splitNumberedSections(bodyStart);
  if (!sectionMap.size) return null;

  const raw = rawFromSectionMap(sectionMap);
  if (!raw.title) raw.title = title;
  const hw = materializeHomework(raw);
  return homeworkHasVisibleContent(hw) ? hw : null;
}

function parseHomeworkFromMarkdown(text: string): NormalizedHomework | null {
  const body = String(text || '').trim();
  if (!body) return null;

  const chunks = body.split(/(?=^##\s+)/m).map((c) => c.trim()).filter(Boolean);
  const parsed: NormalizedHomework[] = [];

  if (chunks.length > 1) {
    for (const chunk of chunks) {
      const hw = parseHomeworkChunk(chunk, 'Homework');
      if (hw) parsed.push(hw);
    }
    const merged = mergeNormalizedHomeworks(parsed);
    if (merged && homeworkHasVisibleContent(merged)) return merged;
  }

  const single = parseHomeworkChunk(body, 'Homework');
  if (single) return single;

  const sectionMap = splitNumberedSections(body);
  if (sectionMap.size) {
    const raw = rawFromSectionMap(sectionMap);
    const hw = materializeHomework(raw);
    return homeworkHasVisibleContent(hw) ? hw : null;
  }

  return null;
}

export function resolveHomeworkFromPayload(
  content?: string,
  rawContent?: unknown,
): ResolvedHomework {
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

  const displayMarkdown =
    formattedText && !formattedText.startsWith('{') ? formattedText : null;

  let homework: NormalizedHomework | null = null;
  if (rawRecords.length) {
    homework = materializeHomework(mergeHomeworkRecords(rawRecords));
  }

  if (displayMarkdown) {
    const fromMd = parseHomeworkFromMarkdown(displayMarkdown);
    if (fromMd) {
      if (!homework || !homeworkHasVisibleContent(homework)) {
        homework = fromMd;
      } else {
        const merged = mergeNormalizedHomeworks([homework, fromMd]);
        homework = merged || homework;
      }
    }
  }

  let markdownFallback: string | null = null;
  if (!homework || !homeworkHasVisibleContent(homework)) {
    if (displayMarkdown) markdownFallback = displayMarkdown;
  }

  return { homework, markdownFallback };
}
