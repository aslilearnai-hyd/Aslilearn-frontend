import { formatLabeledMcqOptions } from '@/lib/parse-exam-question-paper';
import { sanitizeAiDisplayText } from '@/lib/sanitize-ai-display-text';
import { viewerPayloadFromRecord } from '@/lib/resolve-ai-structured-content';

export type StudyGuideKeyConcept = { name: string; explanation: string };
export type StudyGuideDefinition = { term: string; definition: string };
export type StudyGuideFormula = { name: string; formula: string; note: string };
export type StudyGuidePracticeQuestion = {
  question: string;
  type: 'objective' | 'subjective';
  answer: string;
  options: string[];
};

export type StudyGuideContent = {
  title: string;
  chapterOverview: string;
  learningObjectives: string[];
  priorKnowledge: string[];
  keyConcepts: StudyGuideKeyConcept[];
  definitions: StudyGuideDefinition[];
  formulae: StudyGuideFormula[];
  conceptFlow: string;
  realLifeExamples: string[];
  quickRevisionNotes: string[];
  practiceQuestions: StudyGuidePracticeQuestion[];
  improvementTips: string[];
};

const PLACEHOLDER_SECTION_RE =
  /^(n\/?a|not included|to be added|placeholder|—+)$/i;

function hasText(value: string, min = 3): boolean {
  const t = value.trim();
  return t.length >= min && !PLACEHOLDER_SECTION_RE.test(t);
}

function hasList(items: string[], min = 1): boolean {
  return items.filter((x) => hasText(x)).length >= min;
}

const STUDY_GUIDE_SECTION_CHECKS: Array<{
  label: string;
  filled: (guide: StudyGuideContent) => boolean;
}> = [
  { label: 'Study Guide Title', filled: (g) => hasText(g.title, 4) },
  { label: 'Chapter and Subtopic Overview', filled: (g) => hasText(g.chapterOverview, 8) },
  { label: 'Learning Objectives', filled: (g) => hasList(g.learningObjectives) },
  { label: 'Prior Knowledge Required', filled: (g) => hasList(g.priorKnowledge) },
  {
    label: 'Key Concepts Explained',
    filled: (g) => g.keyConcepts.some((c) => hasText(c.name) && hasText(c.explanation, 8)),
  },
  {
    label: 'Important Definitions and Formulae',
    filled: (g) =>
      g.definitions.some((d) => hasText(d.term) && hasText(d.definition, 4)) ||
      g.formulae.some((f) => hasText(f.formula, 2) || hasText(f.name)),
  },
  { label: 'Concept Flow / Mind Map', filled: (g) => hasText(g.conceptFlow, 8) },
  { label: 'Real-life Examples', filled: (g) => hasList(g.realLifeExamples) },
  { label: 'Quick Revision Notes', filled: (g) => hasList(g.quickRevisionNotes) },
  {
    label: 'Practice Questions',
    filled: (g) => g.practiceQuestions.some((q) => hasText(q.question, 4)),
  },
  { label: 'Tips for Further Improvement', filled: (g) => hasList(g.improvementTips) },
];

/** True only when every Smart Study Guide section has real content (student dashboard gate). */
export function isStudyGuideComplete(guide: StudyGuideContent): boolean {
  return getMissingStudyGuideSections(guide).length === 0;
}

export function getMissingStudyGuideSections(guide: StudyGuideContent): string[] {
  return STUDY_GUIDE_SECTION_CHECKS.filter((check) => !check.filled(guide)).map(
    (check) => check.label,
  );
}

export function studyGuideHasVisibleBody(guide: StudyGuideContent): boolean {
  return (
    hasText(guide.chapterOverview, 4) ||
    hasList(guide.learningObjectives) ||
    hasList(guide.priorKnowledge) ||
    guide.keyConcepts.some((c) => hasText(c.name) && hasText(c.explanation)) ||
    guide.definitions.length > 0 ||
    guide.formulae.length > 0 ||
    hasText(guide.conceptFlow, 4) ||
    hasList(guide.realLifeExamples) ||
    hasList(guide.quickRevisionNotes) ||
    guide.practiceQuestions.some((q) => hasText(q.question)) ||
    hasList(guide.improvementTips)
  );
}

function cleanText(value: unknown): string {
  return sanitizeAiDisplayText(value);
}

/** MCQ option lines / answer keys are not study guide titles. */
export function isMcqOrAnswerTitleBlob(text: string): boolean {
  const t = cleanText(text).replace(/\s+/g, ' ');
  if (!t) return false;
  if (/\*\*Answer:\*\*/i.test(t) || /\bAnswer:\s*[A-D]\b/i.test(t)) return true;
  const optionHits = (t.match(/\b[A-D][\).:\-]\s+/gi) || []).length;
  if (optionHits >= 2) return true;
  if (optionHits >= 1 && /\b(?:objective|subjective|mcq)\b/i.test(t)) return true;
  if (optionHits >= 1 && t.length > 80) return true;
  if (/^\d+\.\s*\[(?:objective|subjective|mcq)\]/i.test(t)) return true;
  return false;
}

export function sanitizeStudyGuideTitle(raw: string, fallback = 'Study Guide'): string {
  const t = cleanText(raw).replace(/\s+/g, ' ').trim();
  if (!t || isMcqOrAnswerTitleBlob(t)) return fallback;
  if (/^(study guide|untitled)$/i.test(t)) return fallback;
  if (t.length > 140) return fallback;
  return t;
}

const STUDY_GUIDE_SECTION_HINTS: Record<number, RegExp> = {
  1: /study\s*guide\s*title|^title$/i,
  2: /chapter|subtopic|overview/i,
  3: /learning\s+objectives?/i,
  4: /prior\s+knowledge/i,
  5: /key\s+concepts/i,
  6: /definitions?|formulae|formulas/i,
  7: /concept\s+flow|mind\s*map/i,
  8: /real[-\s]?life|examples?|applications?/i,
  9: /quick\s+revision|revision\s+notes/i,
  10: /practice\s+questions?/i,
  11: /tips|improvement/i,
};

function sectionNumberFromHeading(lineNum: number, heading: string): number | null {
  const h = cleanText(heading);
  const hint = STUDY_GUIDE_SECTION_HINTS[lineNum];
  if (hint?.test(h)) return lineNum;
  for (const [num, re] of Object.entries(STUDY_GUIDE_SECTION_HINTS)) {
    if (re.test(h)) return Number(num);
  }
  return null;
}

function toList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => cleanText(v)).filter(Boolean);
  const s = cleanText(value);
  if (!s) return [];
  return s
    .split(/\n|;/)
    .map((line) => line.replace(/^\s*[-*•]\s*|\s*\d+[\).\s]+/i, '').trim())
    .filter(Boolean);
}

function parseNumberedSections(markdown: string): Map<number, string> {
  const lines = String(markdown || '').split('\n');
  const sections = new Map<number, string[]>();
  let current = 0;

  for (const raw of lines) {
    const line = raw.trim();
    const match = line.match(/^(?:#{1,3}\s*)?(\d{1,2})\.\s*(.+)$/);
    if (match) {
      const mapped = sectionNumberFromHeading(Number(match[1]), match[2]);
      if (mapped == null) continue;
      current = mapped;
      if (!sections.has(current)) sections.set(current, []);
      continue;
    }
    if (current > 0 && sections.has(current)) {
      sections.get(current)!.push(raw);
    }
  }

  const result = new Map<number, string>();
  for (const [num, body] of sections.entries()) {
    result.set(num, cleanText(body.join('\n')));
  }
  return result;
}

function extractTitleFromMarkdown(markdown: string): string {
  const lines = String(markdown || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (/^#\s+/.test(line) && !/^##\s+/.test(line)) {
      const t = sanitizeStudyGuideTitle(cleanText(line.replace(/^#+\s*/, '')), '');
      if (t) return t;
    }
    if (/^##\s+/.test(line) && !/^###/.test(line)) {
      const t = sanitizeStudyGuideTitle(cleanText(line.replace(/^#+\s*/, '')), '');
      if (t) return t;
    }
    const sec1 = line.match(/^(?:#{1,3}\s*)?1\.\s*Study\s*Guide\s*Title\s*$/i);
    if (sec1) {
      const idx = lines.indexOf(line);
      if (idx >= 0 && lines[idx + 1]) {
        const t = sanitizeStudyGuideTitle(lines[idx + 1], '');
        if (t) return t;
      }
    }
  }
  return '';
}

function parseKeyConceptsBlock(text: string): StudyGuideKeyConcept[] {
  const out: StudyGuideKeyConcept[] = [];
  for (const line of String(text || '').split('\n')) {
    const t = line.trim().replace(/^\s*[-*•]\s*/, '');
    const m = t.match(/^(?:\d+\.\s+)?\*\*(.+?)\*\*\s*[-—–:]\s*(.*)$/);
    if (m) {
      out.push({ name: cleanText(m[1]), explanation: cleanText(m[2]) });
      continue;
    }
    const m2 = t.match(/^(?:\d+\.\s+)?(.+?)\s*[-—–]\s*(.+)$/);
    if (m2) out.push({ name: cleanText(m2[1]), explanation: cleanText(m2[2]) });
  }
  return out;
}

function parseDefinitionsFormulaeBlock(text: string): {
  definitions: StudyGuideDefinition[];
  formulae: StudyGuideFormula[];
} {
  const definitions: StudyGuideDefinition[] = [];
  const formulae: StudyGuideFormula[] = [];
  for (const line of String(text || '').split('\n')) {
    const t = line.trim().replace(/^\s*[-*•]\s*/, '');
    const def = t.match(/^(?:\d+\.\s+)?\*\*(.+?)\*\*\s*[-—–:]\s*(.*)$/);
    if (def) {
      definitions.push({ term: cleanText(def[1]), definition: cleanText(def[2]) });
      continue;
    }
    const defPlain = t.match(/^(?:\d+\.\s+)?(.+?)\s*[-—–]\s*(.+)$/);
    if (defPlain && !/:/.test(defPlain[1])) {
      definitions.push({ term: cleanText(defPlain[1]), definition: cleanText(defPlain[2]) });
      continue;
    }
    const fm = t.match(/^(?:\d+\.\s+)?(.+?):\s*(.+?)(?:\s*\((.+)\))?$/);
    if (fm) {
      formulae.push({
        name: cleanText(fm[1]),
        formula: cleanText(fm[2]),
        note: cleanText(fm[3] || ''),
      });
    }
  }
  return { definitions, formulae };
}

function parsePracticeQuestionsBlock(text: string): StudyGuidePracticeQuestion[] {
  const out: StudyGuidePracticeQuestion[] = [];
  let current: StudyGuidePracticeQuestion | null = null;

  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim();
    const qMatch = line.match(/^\d+\.\s+\[(objective|subjective|mcq)\]\s*(.+)$/i);
    if (qMatch) {
      if (current) out.push(current);
      const type = /objective|mcq/i.test(qMatch[1]) ? 'objective' : 'subjective';
      current = { question: cleanText(qMatch[2]), type, answer: '', options: [] };
      continue;
    }
    const qPlain = line.match(/^\d+\.\s+(.+)$/);
    if (qPlain && !/^[A-D][\).:\-]/i.test(qPlain[1])) {
      if (current) out.push(current);
      current = { question: cleanText(qPlain[1]), type: 'subjective', answer: '', options: [] };
      continue;
    }
    if (!current) continue;
    const opt = line.match(/^[A-D][\).:\-]\s+(.+)$/i);
    if (opt) {
      current.options.push(cleanText(opt[0]));
      continue;
    }
    const ans = line.match(/^\*\*Answer:\*\*\s*(.+)$/i);
    if (ans) current.answer = cleanText(ans[1]);
  }
  if (current) out.push(current);

  return out.map((q) => ({
    ...q,
    options: q.options.length >= 2 ? formatLabeledMcqOptions(q.options) : q.options,
  }));
}

function normalizePracticeQuestions(raw: unknown): StudyGuidePracticeQuestion[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((q) => {
      if (q && typeof q === 'object') {
        const row = q as Record<string, unknown>;
        const typeRaw = cleanText(row.type).toLowerCase();
        const type =
          typeRaw === 'objective' || typeRaw === 'mcq' ? ('objective' as const) : ('subjective' as const);
        const options = Array.isArray(row.options)
          ? row.options.map((o) => cleanText(o)).filter(Boolean)
          : [];
        return {
          question: cleanText(row.question),
          type,
          answer: cleanText(row.answer),
          options: options.length >= 2 ? formatLabeledMcqOptions(options) : options,
        };
      }
      return {
        question: cleanText(q),
        type: 'subjective' as const,
        answer: '',
        options: [],
      };
    })
    .filter((q) => q.question);
}

/** First clause of a text, at most 6 words. */
function shortLabel(text: string): string {
  const clause = String(text || '').split(/[.;:]/)[0].trim();
  const words = clause.split(/\s+/).filter(Boolean);
  return words.length <= 6 ? clause : `${words.slice(0, 6).join(' ')}…`;
}

function normalizeKeyConcepts(raw: unknown): StudyGuideKeyConcept[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((c) => {
      if (c && typeof c === 'object') {
        const row = c as Record<string, unknown>;
        const name = cleanText(row.name || row.concept);
        const explanation = cleanText(row.explanation);
        // Older guides paired an unrelated key-point SENTENCE with each
        // explanation; label the card from its own explanation instead.
        const sentenceName = name.split(/\s+/).length > 8;
        return { name: sentenceName && explanation ? shortLabel(explanation) : name, explanation };
      }
      return { name: cleanText(c), explanation: '' };
    })
    .filter((c) => c.name);
}

/**
 * Older guides used the whole title ("Mathematics: Advanced Analysis of …")
 * or the first comma-fragment of a key point ("A number ending in 1") as a
 * "term". Strip the subject prefix and drop fragment terms.
 */
function cleanDefinitions(rows: StudyGuideDefinition[]): StudyGuideDefinition[] {
  return rows
    .map((d) => ({ ...d, term: d.term.replace(/^[^:]{2,30}:\s*/, '').trim() }))
    .filter((d) => {
      if (!d.term || !d.definition) return false;
      const term = d.term.toLowerCase();
      const def = d.definition.toLowerCase();
      const isFragment = def.startsWith(term) && def.length > term.length + 3;
      return !isFragment;
    });
}

function extractSources(rawContent?: unknown): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const push = (v: unknown) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) out.push(v as Record<string, unknown>);
  };
  push(rawContent);
  if (rawContent && typeof rawContent === 'object' && !Array.isArray(rawContent)) {
    const r = rawContent as Record<string, unknown>;
    push(r.metadata);
    if (r.metadata && typeof r.metadata === 'object') {
      push((r.metadata as Record<string, unknown>).structuredContent);
    }
    push(r.structuredContent);
    if (r.raw && typeof r.raw === 'object') push(r.raw);
  }
  return out;
}

function fromStructured(sources: Record<string, unknown>[]): StudyGuideContent {
  const pick = (...keys: string[]) => {
    for (const src of sources) {
      for (const k of keys) {
        const v = src[k];
        const t = cleanText(v);
        if (t && !isMcqOrAnswerTitleBlob(t)) return t;
      }
    }
    return '';
  };
  const pickList = (...keys: string[]) => {
    for (const src of sources) {
      for (const k of keys) {
        const rows = toList(src[k]);
        if (rows.length) return rows;
      }
    }
    return [];
  };

  let keyConcepts: StudyGuideKeyConcept[] = [];
  let definitions: StudyGuideDefinition[] = [];
  let formulae: StudyGuideFormula[] = [];
  let practiceQuestions: StudyGuidePracticeQuestion[] = [];

  for (const src of sources) {
    if (!keyConcepts.length) keyConcepts = normalizeKeyConcepts(src.key_concepts ?? src.concepts);
    if (!definitions.length && Array.isArray(src.definitions)) {
      definitions = src.definitions
        .map((d) => {
          if (d && typeof d === 'object') {
            const row = d as Record<string, unknown>;
            return { term: cleanText(row.term || row.name), definition: cleanText(row.definition) };
          }
          return { term: cleanText(d), definition: '' };
        })
        .filter((d) => d.term);
    }
    const fmRaw = src.formulae ?? src.formulas;
    if (!formulae.length && Array.isArray(fmRaw)) {
      formulae = fmRaw
        .map((f) => {
          if (f && typeof f === 'object') {
            const row = f as Record<string, unknown>;
            return {
              name: cleanText(row.name),
              formula: cleanText(row.formula),
              note: cleanText(row.note),
            };
          }
          return { name: '', formula: cleanText(f), note: '' };
        })
        .filter((f) => f.formula || f.name);
    }
    if (!practiceQuestions.length) {
      practiceQuestions = normalizePracticeQuestions(src.practice_questions ?? src.questions);
    }
  }

  return {
    title: sanitizeStudyGuideTitle(pick('title', 'study_guide_title'), 'Study Guide'),
    chapterOverview: pick('chapter_subtopic_overview', 'chapter_overview', 'overview'),
    learningObjectives: pickList('learning_objectives', 'learningObjectives', 'objectives'),
    priorKnowledge: pickList('prior_knowledge_required', 'prior_knowledge'),
    keyConcepts,
    definitions: cleanDefinitions(definitions),
    formulae,
    conceptFlow: pick('concept_flow_mind_map', 'concept_flow', 'mind_map'),
    realLifeExamples: pickList('real_life_examples', 'real_life_applications', 'examples'),
    quickRevisionNotes: pickList('quick_revision_notes', 'revision_checklist', 'quick_review'),
    practiceQuestions,
    improvementTips: pickList('improvement_tips', 'study_tips', 'tips'),
  };
}

function pickRicherText(a: string, b: string): string {
  const aa = cleanText(a);
  const bb = cleanText(b);
  return bb.length > aa.length ? bb : aa;
}

function pickRicherList(a: string[], b: string[]): string[] {
  return b.length > a.length ? b : a;
}

function pickRicherConcepts(a: StudyGuideKeyConcept[], b: StudyGuideKeyConcept[]): StudyGuideKeyConcept[] {
  return b.length > a.length ? b : a;
}

function pickStudyGuideTitle(...candidates: string[]): string {
  for (const c of candidates) {
    const t = sanitizeStudyGuideTitle(c, '');
    if (t) return t;
  }
  return 'Study Guide';
}

function mergeGuide(base: StudyGuideContent, patch: Partial<StudyGuideContent>): StudyGuideContent {
  return {
    title: pickStudyGuideTitle(base.title, patch.title || ''),
    chapterOverview: pickRicherText(base.chapterOverview, patch.chapterOverview || ''),
    learningObjectives: pickRicherList(base.learningObjectives, patch.learningObjectives || []),
    priorKnowledge: pickRicherList(base.priorKnowledge, patch.priorKnowledge || []),
    keyConcepts: pickRicherConcepts(base.keyConcepts, patch.keyConcepts || []),
    definitions: base.definitions.length >= (patch.definitions?.length || 0) ? base.definitions : patch.definitions || base.definitions,
    formulae: base.formulae.length >= (patch.formulae?.length || 0) ? base.formulae : patch.formulae || base.formulae,
    conceptFlow: pickRicherText(base.conceptFlow, patch.conceptFlow || ''),
    realLifeExamples: pickRicherList(base.realLifeExamples, patch.realLifeExamples || []),
    quickRevisionNotes: pickRicherList(base.quickRevisionNotes, patch.quickRevisionNotes || []),
    practiceQuestions:
      base.practiceQuestions.length >= (patch.practiceQuestions?.length || 0)
        ? base.practiceQuestions
        : patch.practiceQuestions || base.practiceQuestions,
    improvementTips: pickRicherList(base.improvementTips, patch.improvementTips || []),
  };
}

export function resolveStudyGuideFromPayload(
  content: string,
  rawContent?: unknown,
): { guide: StudyGuideContent; markdownFallback: string | null } {
  const sources = extractSources(rawContent);
  try {
    const t = String(content || '').trim();
    if (t.startsWith('{')) {
      const j = JSON.parse(t) as Record<string, unknown>;
      if (j.structuredContent && typeof j.structuredContent === 'object') {
        sources.push(j.structuredContent as Record<string, unknown>);
      }
    }
  } catch {
    /* ignore */
  }

  let guide = fromStructured(sources);
  const numbered = parseNumberedSections(content);
  const mdTitle =
    extractTitleFromMarkdown(content) ||
    sanitizeStudyGuideTitle(cleanText(numbered.get(1) || ''), '');

  const fromMd: Partial<StudyGuideContent> = {
    title: sanitizeStudyGuideTitle(mdTitle, 'Study Guide'),
    chapterOverview: cleanText(numbered.get(2) || ''),
    learningObjectives: toList(numbered.get(3) || ''),
    priorKnowledge: toList(numbered.get(4) || ''),
    keyConcepts: parseKeyConceptsBlock(numbered.get(5) || ''),
    ...parseDefinitionsFormulaeBlock(numbered.get(6) || ''),
    conceptFlow: cleanText(numbered.get(7) || ''),
    realLifeExamples: toList(numbered.get(8) || ''),
    quickRevisionNotes: toList(numbered.get(9) || ''),
    practiceQuestions: parsePracticeQuestionsBlock(numbered.get(10) || ''),
    improvementTips: toList(numbered.get(11) || ''),
  };

  guide = mergeGuide(guide, fromMd);

  const hasBody = studyGuideHasVisibleBody(guide);

  return {
    guide,
    markdownFallback: hasBody ? null : content || null,
  };
}

export function studyGuideViewerPayloadFromRecord(
  record?: {
    generatedContent?: string;
    content?: string;
    structuredContent?: unknown;
    metadata?: { structuredContent?: unknown };
  } | null,
): { content: string; rawContent?: unknown } {
  const p = viewerPayloadFromRecord(record);
  return { content: p.content, rawContent: p.rawContent };
}

export function looksLikeStudyGuideContent(text: string): boolean {
  const sample = String(text || '').slice(0, 14000);
  if (!sample.trim()) return false;
  if (
    /chapter\s*summary\s*creator|chapter\s*summary\s*title|overview of the chapter|important concepts and explanations|practice recall questions|concept connections/i.test(
      sample,
    )
  ) {
    return false;
  }
  const hasGuideLabel = /smart\s*study\s*guide|study\s*guide\s*title/i.test(sample);
  const hasSections =
    /(?:^|\n)\s*#{1,3}\s*\d{1,2}\.\s*(Chapter and Subtopic|Prior Knowledge|Key Concepts Explained|Practice Questions|Tips for Further)/im.test(
      sample,
    ) || /key\s*concepts\s*explained/i.test(sample);
  return hasGuideLabel || (hasSections && /quick\s*revision/i.test(sample));
}
