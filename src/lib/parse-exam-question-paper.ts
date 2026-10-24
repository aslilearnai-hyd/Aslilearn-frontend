import { stripVariantScaffoldFromQuestionText, stripAiGeneratorLeakage } from '@/lib/strip-ai-tool-metadata';

export type ExamQuestion = {
  questionNumber: string;
  question: string;
  options: string[];
  answer: string;
  explanation?: string;
  marks: number | null;
  internalChoiceGroup: string;
};

export type ExamSection = {
  id: string;
  title: string;
  questions: ExamQuestion[];
};

export type NormalizedExamPaper = {
  paperTitle: string;
  instructions: string;
  blueprint: string;
  sections: ExamSection[];
  internalChoices: string;
  answerKey: string;
  markingScheme: string;
  openEndedRubric: string;
};

export type ResolvedExamPaper = {
  paper: NormalizedExamPaper | null;
  markdownFallback: string | null;
};

export const EXAM_SECTION_DEFINITIONS: Array<{ id: string; title: string; keys: string[] }> = [
  { id: 'a', title: 'Section A - MCQs', keys: ['section_a', 'sectionA'] },
  { id: 'b', title: 'Section B - Very Short Answer', keys: ['section_b', 'sectionB'] },
  { id: 'c', title: 'Section C - Short Answer', keys: ['section_c', 'sectionC'] },
  { id: 'd', title: 'Section D - Long Answer', keys: ['section_d', 'sectionD'] },
  { id: 'e', title: 'Section E - Case-based / Competency', keys: ['section_e', 'sectionE'] },
];

const SECTION_META = EXAM_SECTION_DEFINITIONS;

function cleanText(value: unknown): string {
  return stripAiGeneratorLeakage(
    String(value ?? '')
      .replace(/\r\n/g, '\n')
      .replace(/\*\*/g, '')
      .replace(/\s+#+\s*/g, ' ')
      .trim(),
  );
}

// "A) -13" lost its minus sign (options showed 13, 13, 17, 17): only a real
// label separator is stripped, never the option's own leading "-".
const MCQ_OPTION_LABEL_RE = /^([A-Da-d])(?:\s*[\).:]\s*|\s+-\s+)/;

function stripEmbeddedExamTail(text: string): string {
  const raw = cleanText(text);
  if (!raw) return '';
  const boundaryRe =
    /(?:\s+#{1,3}\s*8\.\s*internal\s*choices\b|\s+8\.\s*internal\s*choices\b|\s+internal\s*choices\b|\s+complete\s*answer\s*key\b|\s+detailed\s*marking\s*scheme\b|\s+rubric\s*for\s*open[-\s]?ended\b|\s+0\s+questions\b)/i;
  const idx = raw.search(boundaryRe);
  if (idx > 12) return raw.slice(0, idx).trim();
  return raw;
}

/** Ensure MCQ choices display as A) B) C) D) (strips duplicate labels first). */
export function formatLabeledMcqOptions(options: string[], maxOptions = 4): string[] {
  const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
  const texts = options
    .map((o) => cleanText(o))
    .filter(Boolean)
    .map((o) => o.replace(MCQ_OPTION_LABEL_RE, '').trim())
    .filter(Boolean);
  return texts.slice(0, maxOptions).map((text, i) => `${letters[i]}) ${text}`);
}

/** Split "question stem - A) one - B) two" into stem + options (common in mock-test markdown). */
export function extractInlineMcqFromQuestionText(text: string): { question: string; options: string[] } {
  const raw = cleanText(text).replace(/\*\*/g, '');
  if (!raw) return { question: '', options: [] };

  const labelRe = /(?:^|\s+-\s+|\s+)([A-D])\)\s+/gi;
  const labels = [...raw.matchAll(labelRe)];
  if (labels.length < 2) return { question: raw, options: [] };

  const firstIdx = labels[0].index ?? 0;
  let question = cleanText(raw.slice(0, firstIdx).replace(/\s+-\s*$/, ''));
  const optionsBlob = raw.slice(firstIdx);

  const chunks = optionsBlob
    .split(/\s+-\s+(?=[A-D]\)\s)/i)
    .map((part) => cleanText(part))
    .filter(Boolean);

  const options = chunks
    .map((chunk) => chunk.replace(MCQ_OPTION_LABEL_RE, '').trim())
    .filter(Boolean);

  if (options.length < 2) return { question: raw, options: [] };
  return { question, options: formatLabeledMcqOptions(options) };
}

function normalizeOption(input: unknown): string {
  if (typeof input === 'string') return cleanText(input);
  if (input && typeof input === 'object') {
    const row = input as Record<string, unknown>;
    const key = cleanText(row.key || row.label || row.option || '');
    const value = cleanText(row.value || row.text || row.optionText || '');
    if (key && value) return `${key}. ${value}`;
    return key || value;
  }
  return '';
}

function normalizeOptions(value: unknown): string[] {
  let raw: string[] = [];
  if (Array.isArray(value)) {
    raw = value.map(normalizeOption).filter(Boolean);
  } else if (value && typeof value === 'object') {
    const row = value as Record<string, unknown>;
    const ordered: string[] = [];
    for (const letter of ['A', 'B', 'C', 'D', 'E', 'F']) {
      const v =
        row[letter] ??
        row[letter.toLowerCase()] ??
        row[`option_${letter}`] ??
        row[`option_${letter.toLowerCase()}`] ??
        row[`option${letter}`];
      if (v != null && cleanText(v)) ordered.push(cleanText(v));
    }
    if (ordered.length >= 2) {
      raw = ordered;
    } else {
      raw = Object.entries(row)
        .map(([, v]) => cleanText(v))
        .filter(Boolean);
    }
  }
  if (raw.length >= 2) return formatLabeledMcqOptions(raw);
  return raw;
}

function parseMarks(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const maybe = Number.parseFloat(String(value ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(maybe) ? maybe : null;
}

function collectOptionsFromRow(row: Record<string, unknown>): string[] {
  const fromArray = normalizeOptions(row.options);
  if (fromArray.length >= 2) return fromArray;
  const loose: string[] = [];
  for (const letter of ['A', 'B', 'C', 'D', 'E', 'F']) {
    const v =
      row[letter] ??
      row[letter.toLowerCase()] ??
      row[`option_${letter}`] ??
      row[`option_${letter.toLowerCase()}`] ??
      row[`option${letter}`];
    if (v != null && cleanText(v)) loose.push(cleanText(v));
  }
  if (loose.length >= 2) return formatLabeledMcqOptions(loose);
  return fromArray;
}

/** CBSE-style defaults when the model omits marks on a question. */
const DEFAULT_SECTION_MARKS: Record<string, number> = {
  a: 1,
  b: 1,
  c: 2,
  d: 3,
  e: 4,
};

function normalizeQuestion(
  value: unknown,
  idx: number,
  sectionId?: string,
): ExamQuestion {
  const row = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  let question = stripVariantScaffoldFromQuestionText(
    stripEmbeddedExamTail(cleanText(row.question || row.prompt || row.statement || '')),
  );
  let options = collectOptionsFromRow(row);
  if (options.length < 2) {
    const inline = extractInlineMcqFromQuestionText(question);
    if (inline.options.length >= 2) {
      question = inline.question;
      options = inline.options;
    }
  }
  const parsedMarks = parseMarks(row.marks ?? row.mark ?? row.marks_allotted);
  const fallbackMarks =
    sectionId && DEFAULT_SECTION_MARKS[sectionId] != null
      ? DEFAULT_SECTION_MARKS[sectionId]
      : null;
  return {
    questionNumber: cleanText(row.question_number || row.qNo || row.id || `${idx + 1}`),
    question,
    options,
    answer: cleanText(row.answer || row.correct_answer || row.answer_key || ''),
    explanation: cleanText(row.explanation || row.solution || row.step_by_step || ''),
    marks: parsedMarks != null ? parsedMarks : fallbackMarks,
    internalChoiceGroup: cleanText(row.internal_choice_group || row.internalChoiceGroup || ''),
  };
}

function pickFirstKey(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] != null) return record[key];
  }
  return undefined;
}

function examQuestionDedupeKey(q: ExamQuestion): string {
  const stem = cleanText(q.question).toLowerCase().replace(/\s+/g, ' ');
  const opts = q.options.map((o) => cleanText(o).toLowerCase()).join('|');
  return `${stem}|${opts}`;
}

function dedupeExamQuestions(questions: ExamQuestion[]): ExamQuestion[] {
  const seen = new Set<string>();
  const out: ExamQuestion[] = [];
  for (const q of questions) {
    const key = examQuestionDedupeKey(q);
    if (!stemHasContent(key) || seen.has(key)) continue;
    seen.add(key);
    out.push({ ...q, questionNumber: String(out.length + 1) });
  }
  return out;
}

function stemHasContent(key: string): boolean {
  const stem = key.split('|')[0] || '';
  return stem.trim().length > 8;
}

function sectionKeysWithContent(record: Record<string, unknown>): Set<string> {
  const filled = new Set<string>();
  for (const sec of SECTION_META) {
    const raw = pickFirstKey(record, sec.keys);
    if (Array.isArray(raw) && raw.length > 0) filled.add(sec.id);
  }
  return filled;
}

function normalizeSection(record: Record<string, unknown>, id: string, title: string, keys: string[]): ExamSection {
  const raw = pickFirstKey(record, keys);
  const list = Array.isArray(raw) ? raw : [];
  return {
    id,
    title,
    questions: dedupeExamQuestions(
      list
        .map((q, i) => normalizeQuestion(q, i, id))
        .filter((q) => q.question || q.options.length > 0),
    ),
  };
}

function isLikelyExamRecord(record: Record<string, unknown>): boolean {
  return (
    SECTION_META.some((sec) => pickFirstKey(record, sec.keys) != null) ||
    Boolean(cleanText(record.mock_test_title || record.mockTestTitle)) ||
    Array.isArray(record.sections) ||
    Array.isArray(record.question_paper) ||
    (record.question_paper != null && typeof record.question_paper === 'object') ||
    Boolean(cleanText(record.question_paper || record.questionPaper))
  );
}

function groupFlatQuestionsIntoSections(questions: ExamQuestion[]): ExamSection[] {
  const sections = SECTION_META.map((m) => getSectionById(m.id));
  if (!questions.length) return sections;
  const counts = { a: 4, b: 3, c: 3, d: 2, e: 1 };
  let idx = 0;
  const take = (n: number, sectionId: string) => {
    const slice = questions.slice(idx, idx + n).map((q) => ({
      ...q,
      marks: q.marks != null ? q.marks : DEFAULT_SECTION_MARKS[sectionId] ?? q.marks,
    }));
    idx += n;
    const si = sections.findIndex((s) => s.id === sectionId);
    if (si >= 0 && slice.length) {
      sections[si] = { ...sections[si], questions: slice };
    }
  };
  take(counts.a, 'a');
  take(counts.b, 'b');
  take(counts.c, 'c');
  take(counts.d, 'd');
  if (idx < questions.length) {
    const eIdx = sections.findIndex((s) => s.id === 'e');
    if (eIdx >= 0) {
      sections[eIdx] = {
        ...sections[eIdx],
        questions: questions.slice(idx).map((q) => ({
          ...q,
          marks: q.marks != null ? q.marks : DEFAULT_SECTION_MARKS.e ?? q.marks,
        })),
      };
    }
  }
  return sections;
}

function normalizeExam(record: Record<string, unknown>): NormalizedExamPaper {
  const sections = SECTION_META.map((sec) => normalizeSection(record, sec.id, sec.title, sec.keys));
  const filledFromKeys = sectionKeysWithContent(record);
  if (Array.isArray(record.sections) && record.sections.length) {
    for (const sec of record.sections) {
      if (!sec || typeof sec !== 'object') continue;
      const row = sec as Record<string, unknown>;
      const name = cleanText(row.sectionName || row.name || row.title || '').toLowerCase();
      const questions = dedupeExamQuestions(
        (Array.isArray(row.questions) ? row.questions : [])
          .map((q, i) => normalizeQuestion(q, i))
          .filter((q) => q.question || q.options.length > 0),
      );
      if (!questions.length) continue;
      const target =
        /^section\s*a|mcq/.test(name)
          ? 'a'
          : /^section\s*b|very\s*short|vsa/.test(name)
            ? 'b'
            : /^section\s*c|short\s*answer/.test(name) && !/very\s*short|vsa/.test(name)
              ? 'c'
              : /^section\s*d|long\s*answer|essay/.test(name)
                ? 'd'
                : /^section\s*e|case|competency/.test(name)
                  ? 'e'
                  : '';
      if (target) {
        const idx = sections.findIndex((s) => s.id === target);
        if (idx >= 0) {
          if (filledFromKeys.has(target) && sections[idx].questions.length > 0) continue;
          sections[idx] = {
            ...sections[idx],
            title: cleanText(row.sectionName || row.name || sections[idx].title),
            questions:
              sections[idx].questions.length > 0
                ? dedupeExamQuestions([...sections[idx].questions, ...questions])
                : questions,
          };
        }
      }
    }
  }
  let mergedSections = sections;
  const questionPaperRaw = record.question_paper ?? record.questionPaper;
  if (typeof questionPaperRaw === 'string' && questionPaperRaw.trim()) {
    mergedSections = mergeExamSections(mergedSections, parseMockTestQuestionPaperBody(questionPaperRaw));
  } else if (Array.isArray(questionPaperRaw) && questionPaperRaw.length) {
    mergedSections = mergeExamSections(
      mergedSections,
      groupFlatQuestionsIntoSections(
        questionPaperRaw.map((q, i) => normalizeQuestion(q, i)).filter((q) => q.question || q.options.length > 0),
      ),
    );
  } else if (questionPaperRaw && typeof questionPaperRaw === 'object' && !Array.isArray(questionPaperRaw)) {
    const qp = questionPaperRaw as Record<string, unknown>;
    if (Array.isArray(qp.sections) && qp.sections.length) {
      for (const sec of qp.sections) {
        if (!sec || typeof sec !== 'object') continue;
        const row = sec as Record<string, unknown>;
        const name = cleanText(row.sectionName || row.name || row.title || '').toLowerCase();
        const questions = (Array.isArray(row.questions) ? row.questions : [])
          .map((q, i) => normalizeQuestion(q, i))
          .filter((q) => q.question || q.options.length > 0);
        if (!questions.length) continue;
        const target =
          /^section\s*a|mcq/.test(name)
            ? 'a'
            : /^section\s*b|very\s*short|vsa/.test(name)
              ? 'b'
              : /^section\s*c|short\s*answer/.test(name) && !/very\s*short|vsa/.test(name)
                ? 'c'
                : /^section\s*d|long\s*answer|essay/.test(name)
                  ? 'd'
                  : /^section\s*e|case|competency/.test(name)
                    ? 'e'
                    : '';
        if (target) {
          const idx = mergedSections.findIndex((s) => s.id === target);
          if (idx >= 0) {
            mergedSections[idx] = {
              ...mergedSections[idx],
              title: cleanText(row.sectionName || row.name || mergedSections[idx].title),
              questions: [...mergedSections[idx].questions, ...questions],
            };
          }
        }
      }
    }
    for (const sec of SECTION_META) {
      const block = qp[sec.keys[0]] ?? qp[sec.keys[1]];
      if (Array.isArray(block) && block.length) {
        const idx = mergedSections.findIndex((s) => s.id === sec.id);
        if (idx >= 0) {
          const questions = block
            .map((q, i) => normalizeQuestion(q, i))
            .filter((q) => q.question || q.options.length > 0);
          if (questions.length) {
            mergedSections[idx] = {
              ...mergedSections[idx],
              questions: [...mergedSections[idx].questions, ...questions],
            };
          }
        }
      }
    }
  }

  const blueprint = sanitizeBlueprintText(record.blueprint || record.design_grid);
  const computedTotalMarks = mergedSections.reduce(
    (sum, section) =>
      sum + section.questions.reduce((sectionSum, question) => sectionSum + (question.marks ?? 0), 0),
    0,
  );
  const rawInstructions = cleanText(record.instructions);
  const instructions = computedTotalMarks > 0
    ? rawInstructions
        .replace(/(total\s*(?:marks?)?\s*[:=-]?\s*)\d+(?:\.\d+)?(?=\s*(?:marks?)?\b)/gi, `$1${computedTotalMarks}`)
        .replace(/(maximum\s+marks\s*[:=-]?\s*)\d+(?:\.\d+)?/gi, `$1${computedTotalMarks}`)
    : rawInstructions;
  const paper: NormalizedExamPaper = {
    paperTitle: cleanText(
      record.paper_title || record.title || record.mock_test_title || record.mockTestTitle || 'Exam Question Paper',
    ),
    instructions,
    blueprint,
    sections: mergedSections.map((s) => ({
      ...s,
      questions: dedupeExamQuestions(s.questions),
    })),
    internalChoices: cleanText(record.internal_choices),
    answerKey: cleanText(record.answer_key),
    markingScheme: cleanText(record.marking_scheme),
    openEndedRubric: cleanText(record.open_ended_rubric),
  };
  return redistributeExamPaperSections(paper, blueprint);
}

export function examPaperHasQuestions(paper: NormalizedExamPaper | null): boolean {
  return Boolean(paper?.sections.some((s) => s.questions.length > 0));
}

function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function getSectionById(id: string): ExamSection {
  const meta = SECTION_META.find((s) => s.id === id);
  return { id, title: meta?.title || `Section ${id.toUpperCase()}`, questions: [] };
}

function parseQuestionBlockLines(
  lines: string[],
  qNo: string,
  qTextStart: string,
): ExamQuestion | null {
  const options: string[] = [];
  let answer = '';
  let marks: number | null = null;
  let internalChoiceGroup = '';
  const questionBody: string[] = qTextStart ? [qTextStart] : [];

  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^[A-D][\).:\-]\s+/i.test(line)) {
      options.push(line.replace(MCQ_OPTION_LABEL_RE, '').trim());
      continue;
    }
    if (/^Answer\s*:/i.test(line)) {
      answer = cleanText(line.replace(/^Answer\s*:/i, ''));
      continue;
    }
    if (/^Marks?\s*:/i.test(line)) {
      marks = parseMarks(line);
      continue;
    }
    if (/^Internal\s*Choice/i.test(line)) {
      internalChoiceGroup = cleanText(line.replace(/^Internal\s*Choice\s*:?/i, ''));
      continue;
    }
    questionBody.push(line);
  }

  const joined = stripVariantScaffoldFromQuestionText(
    stripEmbeddedExamTail(cleanText([qTextStart, ...questionBody].join(' ').trim())),
  );
  let question =
    stripVariantScaffoldFromQuestionText(stripEmbeddedExamTail(cleanText(questionBody.join(' ').trim()))) ||
    joined;
  let finalOptions = options.length >= 2 ? formatLabeledMcqOptions(options) : options;

  if (finalOptions.length < 2) {
    const inline = extractInlineMcqFromQuestionText(joined || question);
    if (inline.options.length >= 2) {
      question = inline.question;
      finalOptions = inline.options;
    }
  }

  if (!question && !finalOptions.length) return null;

  return {
    questionNumber: qNo,
    question,
    options: finalOptions,
    answer,
    marks,
    internalChoiceGroup,
  };
}

function isJunkExamQuestion(q: ExamQuestion): boolean {
  const t = stripVariantScaffoldFromQuestionText(stripEmbeddedExamTail(String(q.question || '').trim()));
  if (!t) return true;
  if (/^Q\s*\d+\s*$/i.test(t)) return true;
  if (/^Q\s*\d+\s*\([^)]*\)\s*:/i.test(t) && t.length < 48) return true;
  if (/^section\s*[a-e]\s*:/i.test(t) && /\d+\s*marks?/i.test(t)) return true;
  if (/^#{1,3}\s*\d+\./.test(t)) return true;
  if (/^(internal\s*choices|complete\s*answer\s*key|detailed\s*marking\s*scheme|rubric\s*for\s*open[-\s]?ended)/i.test(t)) {
    return true;
  }
  return false;
}

export function parseBlueprintCounts(blueprint = ''): { a: number; b: number; c: number; d: number; e: number } {
  const defaults = { a: 4, b: 3, c: 3, d: 2, e: 1 };
  const text = String(blueprint || '');
  const pick = (letter: string) => {
    const m = text.match(new RegExp(`section\\s*${letter}[^\\d]*(\\d+)`, 'i'));
    return m ? Math.max(0, Number(m[1])) : 0;
  };
  const parsed = { a: pick('a'), b: pick('b'), c: pick('c'), d: pick('d'), e: pick('e') };
  if (parsed.a + parsed.b + parsed.c + parsed.d + parsed.e === 0) return defaults;
  return {
    a: parsed.a || defaults.a,
    b: parsed.b || defaults.b,
    c: parsed.c || defaults.c,
    d: parsed.d || defaults.d,
    e: parsed.e || defaults.e,
  };
}

function sanitizeBlueprintText(value: unknown): string {
  const raw = cleanText(value);
  if (!raw) return '';
  const stopRe =
    /(?:\n|^)\s*(?:#{1,4}\s*)?section\s*a\s*:\s*mcq|(?:\n|^)\s*\*?\*?q\s*1[\).:\-]/i;
  const idx = raw.search(stopRe);
  if (idx > 0) return raw.slice(0, idx).trim();
  return raw;
}

/** Split a flat question list into Sections A–E using blueprint counts. */
export function redistributeExamPaperSections(
  paper: NormalizedExamPaper,
  blueprint = '',
): NormalizedExamPaper {
  const allQs = paper.sections.flatMap((s) => s.questions).filter((q) => !isJunkExamQuestion(q));
  const active = paper.sections.filter((s) => s.questions.length > 0);
  const counts = parseBlueprintCounts(blueprint);
  const expectedById: Record<string, number> = {
    a: counts.a,
    b: counts.b,
    c: counts.c,
    d: counts.d,
    e: counts.e,
  };
  const deficit = paper.sections.reduce((sum, s) => {
    const expected = expectedById[s.id] || 0;
    return sum + Math.max(0, expected - s.questions.length);
  }, 0);
  const overflow = paper.sections.reduce((sum, s) => {
    const expected = expectedById[s.id] || 0;
    return sum + Math.max(0, s.questions.length - expected);
  }, 0);
  const expectedTotal = counts.a + counts.b + counts.c + counts.d + counts.e;
  const needs =
    allQs.length >= 3 &&
    (active.length === 1 ||
      active.some((s) => /^questions?$/i.test(s.title)) ||
      (active.length === 1 && active[0].id === 'a' && allQs.length >= 4));
  const shouldRebalanceByBlueprint =
    expectedTotal > 0 && allQs.length >= Math.min(3, expectedTotal) && deficit > 0 && overflow > 0;

  if (!needs && !shouldRebalanceByBlueprint) {
    return {
      ...paper,
      sections: paper.sections.map((s) => ({
        ...s,
        questions: s.questions.filter((q) => !isJunkExamQuestion(q)),
      })),
    };
  }

  const sorted = [...allQs].sort(
    (a, b) => Number(a.questionNumber || 0) - Number(b.questionNumber || 0),
  );
  let idx = 0;
  const take = (n: number): ExamQuestion[] => {
    const slice = sorted.slice(idx, idx + n);
    idx += n;
    return slice.map((q, i) => ({
      ...q,
      questionNumber: q.questionNumber || String(idx - slice.length + i + 1),
    }));
  };

  const sections: ExamSection[] = SECTION_META.map((m, i) => {
    const count = [counts.a, counts.b, counts.c, counts.d, counts.e][i];
    return {
      ...getSectionById(m.id),
      title: m.title,
      questions: take(count).filter((q) => !isJunkExamQuestion(q)),
    };
  });
  if (idx < sorted.length) {
    const eIdx = sections.findIndex((s) => s.id === 'e');
    if (eIdx >= 0) {
      sections[eIdx] = {
        ...sections[eIdx],
        questions: [
          ...sections[eIdx].questions,
          ...sorted.slice(idx).filter((q) => !isJunkExamQuestion(q)),
        ],
      };
    }
  }

  return { ...paper, sections };
}

function parseQuestionBlock(block: string, fallbackIndex: number): ExamQuestion | null {
  const lines = block
    .split('\n')
    .map((l) => l.replace(/\*\*/g, '').trim())
    .filter(Boolean);
  if (!lines.length) return null;
  const first = lines[0];

  const qDot = first.match(/^Q\.\s*(.+)$/i);
  if (qDot) {
    return parseQuestionBlockLines(lines, String(fallbackIndex + 1), cleanText(qDot[1]));
  }

  const qMatch = first.match(/^Q(?:uestion)?\s*([A-Za-z0-9]+)[\).:\-]?\s*(.*)$/i);
  if (qMatch) {
    return parseQuestionBlockLines(
      lines,
      cleanText(qMatch[1] || `${fallbackIndex + 1}`),
      cleanText(qMatch[2]),
    );
  }

  const numMatch = first.match(/^(\d+)[\).:\-]\s*(.*)$/);
  if (numMatch) {
    return parseQuestionBlockLines(lines, cleanText(numMatch[1]), cleanText(numMatch[2]));
  }

  return null;
}

function splitQuestionBlocks(cleaned: string, pattern: RegExp): string[] {
  const starts: number[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
  while ((m = re.exec(cleaned)) !== null) {
    const label = m[2] || m[1];
    const idx = m.index + m[0].indexOf(label);
    starts.push(idx);
  }
  if (!starts.length) return [];
  const blocks: string[] = [];
  for (let i = 0; i < starts.length; i += 1) {
    const start = starts[i];
    const end = i + 1 < starts.length ? starts[i + 1] : cleaned.length;
    blocks.push(cleaned.slice(start, end).trim());
  }
  return blocks;
}

function parseQuestionsFromSectionText(sectionBody: string): ExamQuestion[] {
  const cleaned = cleanText(sectionBody).replace(/\*\*/g, '');
  if (!cleaned) return [];

  const qBlocks = splitQuestionBlocks(
    cleaned,
    /(^|\n)\s*(Q(?:uestion)?\s*(?:[A-Za-z0-9]+|\.)[\).:\-]?\s*)/i,
  );
  if (qBlocks.length) {
    return qBlocks
      .map((block, i) => parseQuestionBlock(block, i))
      .filter((q): q is ExamQuestion => q != null && !isJunkExamQuestion(q));
  }

  const numBlocks = splitQuestionBlocks(cleaned, /(^|\n)\s*(\d+[\).:\-]\s+)/);
  return numBlocks
    .map((block, i) => parseQuestionBlock(block, i))
    .filter((q): q is ExamQuestion => q != null);
}

function sectionIdFromHeading(heading: string): string {
  const h = heading.toLowerCase();
  if (/section\s*a\b|\bmcq|multiple\s*choice/.test(h)) return 'a';
  if (/section\s*b\b|very\s*short|vsa/.test(h)) return 'b';
  if (/section\s*c\b|short\s*answer/.test(h) && !/very\s*short|vsa/.test(h)) return 'c';
  if (/section\s*d\b|long\s*answer|essay/.test(h)) return 'd';
  if (/section\s*e\b|case|competency|competence/.test(h)) return 'e';
  return '';
}

/** Parse mock-test Section 6 body (### Section A… + Q1 / 1. numbered items). */
export function parseMockTestQuestionPaperBody(body: string): ExamSection[] {
  const sections = SECTION_META.map((m) => getSectionById(m.id));
  const text = cleanText(body).replace(/\*\*/g, '');
  if (!text) return sections;

  const subChunks = text
    .split(/(?=(?:^|\n)\s*#{2,4}\s*Section\s*[A-E])/gim)
    .map((c) => c.trim())
    .filter(Boolean);
  let assigned = false;

  for (const chunk of subChunks) {
    const headerLine = chunk.split('\n').find((l) => /section\s*[a-e]/i.test(l)) || '';
    const sectionId = sectionIdFromHeading(headerLine);
    const questions = parseQuestionsFromSectionText(chunk);
    if (!questions.length) continue;
    assigned = true;
    const idx = sections.findIndex((s) => s.id === (sectionId || 'a'));
    const target = idx >= 0 ? idx : 0;
    sections[target] = {
      ...sections[target],
      title: headerLine.replace(/^#{1,3}\s*/, '').trim() || sections[target].title,
      questions: [...sections[target].questions, ...questions],
    };
  }

  if (!assigned) {
    const all = parseQuestionsFromSectionText(text).filter(
      (q): q is ExamQuestion => q != null && !isJunkExamQuestion(q),
    );
    if (all.length) {
      const counts = { a: 4, b: 3, c: 3, d: 2, e: 1 };
      let idx = 0;
      const take = (n: number, sectionId: string) => {
        const slice = all.slice(idx, idx + n);
        idx += n;
        const si = sections.findIndex((s) => s.id === sectionId);
        if (si >= 0) {
          sections[si] = {
            ...sections[si],
            questions: slice.map((q, i) => ({
              ...q,
              questionNumber: q.questionNumber || String(idx - slice.length + i + 1),
            })),
          };
        }
      };
      take(counts.a, 'a');
      take(counts.b, 'b');
      take(counts.c, 'c');
      take(counts.d, 'd');
      take(counts.e, 'e');
      if (idx < all.length) {
        const eIdx = sections.findIndex((s) => s.id === 'e');
        if (eIdx >= 0) {
          sections[eIdx] = {
            ...sections[eIdx],
            questions: [...sections[eIdx].questions, ...all.slice(idx)],
          };
        }
      }
    }
  }

  return sections;
}

function collectNumberedMarkdownSections(markdown: string): {
  headingMap: Record<number, string>;
  bodies: Map<number, string>;
} {
  const lines = String(markdown || '').split('\n');
  const numberedSections = new Map<number, string[]>();
  const headingMap: Record<number, string> = {};
  let currentSection = 0;

  for (const raw of lines) {
    const line = raw.trim();
    const secMatch = line.match(/^(?:#{1,3}\s*)?(\d{1,2})\.\s*(.+)$/);
    if (secMatch) {
      currentSection = Number(secMatch[1]);
      headingMap[currentSection] = cleanText(secMatch[2]);
      if (!numberedSections.has(currentSection)) numberedSections.set(currentSection, []);
      continue;
    }
    if (currentSection > 0 && numberedSections.has(currentSection)) {
      numberedSections.get(currentSection)!.push(raw);
    }
  }

  const bodies = new Map<number, string>();
  for (const [num, body] of numberedSections.entries()) {
    bodies.set(num, cleanText(body.join('\n')));
  }
  return { headingMap, bodies };
}

/** 12-section mock test markdown → exam sections (section 6 = question paper). */
export function parseMockTestMarkdown(markdown: string): NormalizedExamPaper | null {
  const { headingMap, bodies } = collectNumberedMarkdownSections(markdown);
  const isMock =
    /question\s*paper/i.test(headingMap[6] || '') ||
    /mock\s*test/i.test(headingMap[1] || '') ||
    Boolean(bodies.get(6)?.trim());
  if (!isMock) return null;

  const questionSections = parseMockTestQuestionPaperBody(bodies.get(6) || '');
  const hasQuestions = questionSections.some((s) => s.questions.length > 0);
  if (!hasQuestions) return null;

  const legacy13 =
    bodies.has(13) || /self[\s-]*analysis|performance\s+self/i.test(headingMap[9] || '');
  const reflectionN = legacy13 ? 13 : 12;

  return {
    paperTitle: cleanText(bodies.get(1) || headingMap[1] || 'Mock Test'),
    instructions: cleanText(bodies.get(5) || ''),
    blueprint: '',
    sections: questionSections,
    internalChoices: '',
    answerKey: cleanText(bodies.get(7) || ''),
    markingScheme: '',
    openEndedRubric: cleanText(bodies.get(reflectionN) || ''),
  };
}

function mergeExamSections(base: ExamSection[], extra: ExamSection[]): ExamSection[] {
  return base.map((sec) => {
    const add = extra.find((e) => e.id === sec.id);
    if (!add?.questions.length) return sec;
    return {
      ...sec,
      title: sec.questions.length ? sec.title : add.title || sec.title,
      questions: sec.questions.length ? sec.questions : add.questions,
    };
  });
}

export function mergeExamPapers(
  base: NormalizedExamPaper | null,
  extra: NormalizedExamPaper | null,
): NormalizedExamPaper | null {
  if (!extra) return base;
  if (!base) return extra;
  return {
    ...base,
    paperTitle: base.paperTitle || extra.paperTitle,
    instructions: base.instructions || extra.instructions,
    blueprint: base.blueprint || extra.blueprint,
    sections: mergeExamSections(base.sections, extra.sections),
    internalChoices: base.internalChoices || extra.internalChoices,
    answerKey: base.answerKey || extra.answerKey,
    markingScheme: base.markingScheme || extra.markingScheme,
    openEndedRubric: base.openEndedRubric || extra.openEndedRubric,
  };
}

function parseMarkdownExam(markdown: string): NormalizedExamPaper | null {
  const lines = String(markdown || '').split('\n');
  const numberedSections = new Map<number, string[]>();
  let currentSection = 0;
  const headingMap: Record<number, string> = {};

  for (const raw of lines) {
    const line = raw.trim();
    const secMatch = line.match(/^(?:#{1,3}\s*)?(\d{1,2})\.\s*(.+)$/);
    if (secMatch) {
      currentSection = Number(secMatch[1]);
      headingMap[currentSection] = cleanText(secMatch[2]);
      if (!numberedSections.has(currentSection)) numberedSections.set(currentSection, []);
      continue;
    }
    if (currentSection > 0 && numberedSections.has(currentSection)) {
      numberedSections.get(currentSection)!.push(raw);
    }
  }

  const sec1 = cleanText((numberedSections.get(1) || []).join('\n'));
  const sec2 = cleanText((numberedSections.get(2) || []).join('\n'));
  const sec8 = cleanText((numberedSections.get(8) || []).join('\n'));
  const sec9 = cleanText((numberedSections.get(9) || []).join('\n'));
  const sec10 = cleanText((numberedSections.get(10) || []).join('\n'));
  const sec11 = cleanText((numberedSections.get(11) || []).join('\n'));
  const titleFromTop = cleanText(String(lines.find((l) => l.trim() && !/^\d+\./.test(l.trim())) || ''));

  const paper: NormalizedExamPaper = {
    paperTitle: titleFromTop || 'Exam Question Paper',
    instructions: sec1,
    blueprint: sec2,
    sections: SECTION_META.map((m) => getSectionById(m.id)),
    internalChoices: sec8,
    answerKey: sec9,
    markingScheme: sec10,
    openEndedRubric: sec11,
  };

  for (let i = 0; i < SECTION_META.length; i += 1) {
    const blockNum = i + 3; // numbered headings: 3..7 map to Section A..E
    const sectionBody = cleanText((numberedSections.get(blockNum) || []).join('\n'));
    const parsedQuestions = parseQuestionsFromSectionText(sectionBody);
    if (parsedQuestions.length) {
      paper.sections[i].questions = parsedQuestions;
    }
    const heading = headingMap[blockNum];
    if (heading) {
      paper.sections[i].title = heading;
    }
  }

  const questionPaperBlob = markdown.match(
    /###\s*3[–-]7\.?\s*Question\s*Paper\s*Sections([\s\S]*?)(?=^#{1,3}\s*\d+\.\s*8\.|^#{1,3}\s*8\.|\n8\.\s*Internal|\Z)/im,
  );
  if (questionPaperBlob?.[1]) {
    const subSections = parseMockTestQuestionPaperBody(questionPaperBlob[1]);
    paper.sections = mergeExamSections(paper.sections, subSections);
  } else if (!examPaperHasQuestions(paper)) {
    const subSections = parseMockTestQuestionPaperBody(markdown);
    if (subSections.some((s) => s.questions.length > 0)) {
      paper.sections = mergeExamSections(paper.sections, subSections);
    }
  }

  if (sec9) paper.answerKey = sec9;
  if (sec10) paper.markingScheme = sec10;
  if (sec11) paper.openEndedRubric = sec11;

  const titleLine = lines.find((l) => /^##\s+/.test(l.trim()));
  if (titleLine) {
    paper.paperTitle = cleanText(titleLine.replace(/^##\s+/, ''));
  }

  const redistributed = redistributeExamPaperSections(paper, paper.blueprint);
  if (!examPaperHasVisibleContent(redistributed)) return null;
  return redistributed;
}

function extractObjectCandidates(payload: unknown): Record<string, unknown>[] {
  if (!payload) return [];
  if (Array.isArray(payload)) {
    return payload.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object');
  }
  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>;
    if (obj.raw && typeof obj.raw === 'object') {
      return extractObjectCandidates(obj.raw);
    }
    if (Array.isArray(obj.items)) return extractObjectCandidates(obj.items);
    return [obj];
  }
  return [];
}

/** True when markdown follows the 11-section Exam Question Paper template (not Mock Test). */
export function looksLikeExamPaperContent(text: string): boolean {
  const sample = String(text || '').slice(0, 15000);
  if (!sample.trim()) return false;
  if (/mock\s*test\s*title/i.test(sample) && /test\s*purpose\s*and\s*subtopic/i.test(sample)) {
    return false;
  }
  return (
    /paper\s*title\s*and\s*general\s*instructions/i.test(sample) ||
    /blueprint\s*\/\s*design\s*grid/i.test(sample) ||
    /rubric\s*for\s*open[-\s]?ended/i.test(sample) ||
    /detailed\s*marking\s*scheme/i.test(sample) ||
    (/section\s*a:\s*mcq/i.test(sample) && /complete\s*answer\s*key/i.test(sample))
  );
}

export function examPaperHasVisibleContent(paper: NormalizedExamPaper | null): boolean {
  if (!paper) return false;
  const hasSections = paper.sections.some((s) => s.questions.length > 0);
  return Boolean(
    hasSections ||
      paper.instructions ||
      paper.blueprint ||
      paper.answerKey ||
      paper.markingScheme ||
      paper.openEndedRubric,
  );
}

export function resolveExamPaperFromPayload(content: string, rawContent?: unknown): ResolvedExamPaper {
  const candidates: Record<string, unknown>[] = [];
  candidates.push(...extractObjectCandidates(rawContent));

  const parsed = tryParseJson(String(content || '').trim());
  candidates.push(...extractObjectCandidates(parsed));

  let paper: NormalizedExamPaper | null = null;
  for (const candidate of candidates) {
    if (!isLikelyExamRecord(candidate)) continue;
    const normalized = normalizeExam(candidate);
    if (examPaperHasVisibleContent(normalized)) {
      paper = mergeExamPapers(paper, normalized);
    }
  }

  const markdown = String(content || '').trim();
  const isExamTemplate = looksLikeExamPaperContent(markdown);

  if (isExamTemplate) {
    const parsedFromMarkdown = parseMarkdownExam(markdown);
    if (parsedFromMarkdown) {
      paper = mergeExamPapers(paper, parsedFromMarkdown);
    }
  }

  if (!isExamTemplate) {
    const mockPaper = parseMockTestMarkdown(markdown);
    if (mockPaper) {
      paper = mergeExamPapers(paper, mockPaper);
    }
  }

  if (!examPaperHasQuestions(paper)) {
    const parsedFromMarkdown = parseMarkdownExam(markdown);
    if (parsedFromMarkdown) {
      paper = mergeExamPapers(paper, parsedFromMarkdown);
    }
    if (!examPaperHasQuestions(paper)) {
      const mockPaper = parseMockTestMarkdown(markdown);
      if (mockPaper) {
        paper = mergeExamPapers(paper, mockPaper);
      }
    }
  }

  if (paper && examPaperHasVisibleContent(paper)) {
    const blueprint =
      paper.blueprint ||
      cleanText(
        (candidates[0]?.blueprint as string) ||
          (candidates[0]?.design_grid as string) ||
          '',
      );
    const finalPaper = redistributeExamPaperSections(paper, blueprint);
    return { paper: finalPaper, markdownFallback: null };
  }
  return { paper: null, markdownFallback: markdown || null };
}

export type ExamBlueprintRow = {
  sectionId: string;
  sectionLabel: string;
  questionType: string;
  questionCount: number;
  marks: number;
  percent: number;
};

const EXAM_SECTION_TYPE_LABELS: Record<string, string> = {
  a: 'MCQ',
  b: 'Very Short Answer',
  c: 'Short Answer',
  d: 'Long Answer',
  e: 'Case-based / Competency',
};

export function buildExamBlueprintRows(
  sections: ExamSection[],
  blueprint = '',
): ExamBlueprintRow[] {
  const active = sections.filter((s) => s.questions.length > 0);
  const totalMarks = active.reduce(
    (sum, s) => sum + s.questions.reduce((m, q) => m + (q.marks != null ? q.marks : 0), 0),
    0,
  );
  return active.map((s) => {
    const marks = s.questions.reduce((m, q) => m + (q.marks != null ? q.marks : 0), 0);
    return {
      sectionId: s.id,
      sectionLabel: s.title,
      questionType: EXAM_SECTION_TYPE_LABELS[s.id] || 'Questions',
      questionCount: s.questions.length,
      marks,
      percent: totalMarks > 0 ? Math.round((marks / totalMarks) * 100) : 0,
    };
  });
}

export type ExamAnswerKeyRow = {
  qNo: string;
  sectionId: string;
  answer: string;
  marks: number | null;
};

export function synthesizeExamAnswerKeyRows(sections: ExamSection[]): ExamAnswerKeyRow[] {
  const rows: ExamAnswerKeyRow[] = [];
  for (const sec of sections) {
    let inSection = 0;
    for (const q of sec.questions) {
      inSection += 1;
      const answer = cleanText(q.answer);
      if (!answer) continue;
      // "A1", "B2"… like the paper, never a bare "1" repeated in every section.
      const own = cleanText(q.questionNumber).replace(/^[A-G]/i, '');
      rows.push({
        qNo: `${sec.id.toUpperCase()}${own && /^\d+$/.test(own) ? own : inSection}`,
        sectionId: sec.id.toUpperCase(),
        answer,
        marks: q.marks,
      });
    }
  }
  return rows;
}

export type ExamPaperContext = {
  className: string;
  subject: string;
  topic: string;
  subtopic: string;
  board: string;
  bloomLevel: string;
  duration: string;
  nepNcfFocus: string;
};

function pickRecordString(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const v = record[key];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return '';
}

function collectExamRecordCandidates(rawContent?: unknown): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  if (!rawContent || typeof rawContent !== 'object' || Array.isArray(rawContent)) return out;
  const root = rawContent as Record<string, unknown>;
  out.push(root);
  const meta = root.metadata;
  if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
    out.push(meta as Record<string, unknown>);
    const extra = (meta as Record<string, unknown>).extraParams;
    if (extra && typeof extra === 'object' && !Array.isArray(extra)) {
      out.push(extra as Record<string, unknown>);
    }
    const structured = (meta as Record<string, unknown>).structuredContent;
    if (structured && typeof structured === 'object' && !Array.isArray(structured)) {
      out.push(structured as Record<string, unknown>);
    }
  }
  const structured = root.structuredContent;
  if (structured && typeof structured === 'object' && !Array.isArray(structured)) {
    out.push(structured as Record<string, unknown>);
  }
  const render = root.renderContent;
  if (render && typeof render === 'object' && !Array.isArray(render)) {
    out.push(render as Record<string, unknown>);
  }
  return out;
}

export function extractExamPaperContext(rawContent?: unknown): ExamPaperContext {
  const candidates = collectExamRecordCandidates(rawContent);
  const pick = (...keys: string[]) => {
    for (const c of candidates) {
      const v = pickRecordString(c, keys);
      if (v) return v;
    }
    return '';
  };
  const bloomLevel =
    pick('bloomLevel', 'bloom_level', 'bloom') ||
    pick('bloom_mapping', 'bloomMapping', 'learning_outcome_mapping', 'learningOutcomeMapping');
  const nepNcfFocus =
    pick('nepNcfFocus', 'nep_ncf_focus', 'ncf_competency_alignment', 'ncfCompetencyAlignment') ||
    pick('competency_mapping', 'competencyMapping', 'ncf_alignment', 'ncfAlignment');
  return {
    className: pick('classLabel', 'className', 'class_name', 'class_level', 'class'),
    subject: pick('subject', 'subjectName', 'subject_name'),
    topic: pick('topic', 'topicName', 'topic_name', 'chapter', 'chapterName'),
    subtopic: pick('subtopic', 'subTopic', 'subtopicName', 'sub_topic', 'sub_topic_name'),
    board: pick('board', 'boardName', 'board_name'),
    bloomLevel,
    duration: pick('duration', 'estimated_time', 'estimatedTime', 'time'),
    nepNcfFocus,
  };
}

export type BloomDistributionRow = {
  level: string;
  marks: number;
  percent: number;
};

const BLOOM_BY_EXAM_SECTION: Record<string, string> = {
  a: 'Remember',
  b: 'Understand',
  c: 'Apply',
  d: 'Analyze',
  e: 'Analyze',
};

export function buildBloomDistributionFromExamSections(
  sections: ExamSection[],
): BloomDistributionRow[] {
  const totals: Record<string, number> = {};
  for (const sec of sections) {
    if (!sec.questions.length) continue;
    const level = BLOOM_BY_EXAM_SECTION[sec.id] || 'Understand';
    const marks = sec.questions.reduce((m, q) => m + (q.marks != null ? q.marks : 0), 0);
    totals[level] = (totals[level] || 0) + marks;
  }
  const total = Object.values(totals).reduce((a, b) => a + b, 0);
  const order = ['Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate', 'Create'];
  return order
    .map((level) => ({
      level,
      marks: totals[level] || 0,
      percent: total > 0 ? Math.round(((totals[level] || 0) / total) * 100) : 0,
    }))
    .filter((r) => r.marks > 0);
}

export function parseCompetencyFocusItems(rawContent?: unknown): string[] {
  const candidates = collectExamRecordCandidates(rawContent);
  const pick = (...keys: string[]) => {
    for (const c of candidates) {
      const v = pickRecordString(c, keys);
      if (v) return v;
    }
    return '';
  };
  const raw = pick('competency_mapping', 'competencyMapping', 'competency_focus', 'competencyFocus');
  if (!raw) return [];
  return raw
    .split(/\n|;/)
    .map((s) => s.replace(/^[-•*]\s*/, '').trim())
    .filter(Boolean);
}

export function examViewerPayloadFromRecord(record: Record<string, unknown>): {
  content: string;
  rawContent: unknown;
} {
  const generatedContent = String(record.generatedContent || record.content || '');
  const structured =
    record.structuredContent ??
    (record.metadata as { structuredContent?: unknown } | undefined)?.structuredContent;
  return {
    content: generatedContent,
    rawContent: structured || record,
  };
}

