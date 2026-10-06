/** Story & Passage / Reading Practice tools are limited to language subjects. */

import { extractPlainSubjectName } from '@/lib/subject-names';

export const STORY_PASSAGE_TOOL_ID = 'story-passage-creator';
export const READING_PRACTICE_TOOL_ID = 'reading-practice-room';

const STORY_LANGUAGE_TOOL_IDS = new Set([STORY_PASSAGE_TOOL_ID, READING_PRACTICE_TOOL_ID]);

/** Tools that must not be used with English, Hindi, or Telugu subjects. */
export const LANGUAGE_EXCLUDED_TOOL_IDS = [
  // worksheet-mcq-generator removed — language teachers want worksheets too.
  'short-notes-summaries-maker',
  'daily-class-plan-maker',
  'concept-breakdown-explainer',
  'chapter-summary-creator',
  'key-points-formula-extractor',
] as const;

const LANGUAGE_EXCLUDED_TOOL_ID_SET = new Set<string>(LANGUAGE_EXCLUDED_TOOL_IDS);

export const LANGUAGE_EXCLUDED_TOOL_ERROR =
  'This tool is not available for English, Hindi, or Telugu subjects.';

export function isStoryLanguageTool(toolType: string): boolean {
  return STORY_LANGUAGE_TOOL_IDS.has(String(toolType || '').trim());
}

export function isLanguageExcludedTool(toolType: string): boolean {
  return LANGUAGE_EXCLUDED_TOOL_ID_SET.has(String(toolType || '').trim());
}

const STORY_LANGUAGE_PLAIN_KEYS = new Set(['eng', 'english', 'hin', 'hindi', 'tel', 'telugu']);

export function isStoryPassageLanguageSubject(subject: string | undefined | null): boolean {
  const raw = String(subject || '').trim();
  if (!raw) return false;
  if (/(telugu|తెలుగు)/i.test(raw)) return true;
  if (/(hindi|हिंदी|हिन्दी)/i.test(raw)) return true;
  if (/english/i.test(raw)) return true;

  const plain = extractPlainSubjectName(raw).toLowerCase().trim();
  if (STORY_LANGUAGE_PLAIN_KEYS.has(plain)) return true;
  if (plain.includes('english') || plain.includes('hindi') || plain.includes('telugu')) return true;
  return false;
}

export function filterSubjectsForAiTool(_toolType: string, subjects: string[]): string[] {
  // Dashboard delivery: do not hide subjects by tool language rules.
  return Array.isArray(subjects) ? subjects.filter(Boolean) : [];
}

/** IIT / NEET / JEE boards in AI Tools — STEM only (matches AI Tool Topics + IIT-6 catalog). */
export function isIitAiToolBoard(board?: string | null): boolean {
  const compact = String(board || '')
    .toUpperCase()
    .replace(/[\s/\\-]+/g, '');
  return compact.includes('IIT') || compact.includes('NEET') || compact.includes('JEE');
}

/** CBSE / SSC / other school boards (not IIT tracks). */
export function isSchoolCurriculumBoard(board?: string | null): boolean {
  return Boolean(String(board || '').trim()) && !isIitAiToolBoard(board);
}

const SCIENCE_BRANCH_PLAIN_KEYS = new Set([
  'physics',
  'phy',
  'chemistry',
  'chem',
  'biology',
  'bio',
]);

/** Physics / Chemistry / Biology (branch textbooks under CBSE Science). */
export function isScienceBranchSubject(subject?: string | null): boolean {
  const raw = String(subject || '')
    .trim()
    .toLowerCase()
    .replace(/[/_.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!raw) return false;
  const plain = extractPlainSubjectName(raw).toLowerCase().trim();
  if (SCIENCE_BRANCH_PLAIN_KEYS.has(plain)) return true;
  const first = plain.split(/\s+/)[0];
  return Boolean(first && SCIENCE_BRANCH_PLAIN_KEYS.has(first));
}

export function scienceBranchDisplayLabel(subject?: string | null): string | null {
  const raw = String(subject || '')
    .trim()
    .toLowerCase();
  if (!raw) return null;
  if (/chem/i.test(raw)) return 'Chemistry';
  if (/phys|phy\b/i.test(raw)) return 'Physics';
  if (/bio/i.test(raw)) return 'Biology';
  return null;
}

/**
 * Map book metadata subject → AI Tool Topics curriculum subject.
 * CBSE-like boards: Physics/Chemistry/Biology textbooks use Science topics.
 * IIT boards keep Physics/Chemistry/Biology as separate subjects.
 */
export function curriculumSubjectForAiToolTopics(
  board: string | null | undefined,
  bookOrFormSubject: string | null | undefined,
): string {
  const subject = String(bookOrFormSubject || '').trim();
  if (!subject) return '';
  if (isIitAiToolBoard(board)) return subject;
  if (isScienceBranchSubject(subject) || /^science$/i.test(subject)) {
    return 'Science';
  }
  return subject;
}

/** Group key for book lists: CBSE Chem/Phy/Bio books sit under Science. */
export function bookListSubjectGroupKey(
  board: string | null | undefined,
  bookSubject: string | null | undefined,
): string {
  return curriculumSubjectForAiToolTopics(board, bookSubject) || String(bookSubject || 'Other').trim() || 'Other';
}

/**
 * CBSE / SSC teacher & student tool dropdowns: show one Science option.
 * Physics / Chemistry / Biology stay separate only on IIT boards.
 */
export function collapseSchoolBoardScienceSubjects(
  board: string | null | undefined,
  subjects: string[],
): string[] {
  const list = Array.isArray(subjects) ? subjects.filter(Boolean) : [];
  if (!list.length || isIitAiToolBoard(board)) return list;

  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const mapped = curriculumSubjectForAiToolTopics(board, raw) || String(raw).trim();
    if (!mapped) continue;
    const key = mapped.toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(mapped);
  }
  return out;
}

const IIT_STEM_PLAIN_KEYS = new Set([
  'physics',
  'phy',
  'chemistry',
  'chem',
  'maths',
  'math',
  'mathematics',
  'biology',
  'bio',
]);

export function isIitStemSubject(subject: string | undefined | null): boolean {
  const raw = String(subject || '')
    .trim()
    .toLowerCase()
    .replace(/\b(iit|neet|jee)\b/g, ' ')
    .replace(/[/_.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!raw) return false;
  const plain = extractPlainSubjectName(raw).toLowerCase().trim();
  if (IIT_STEM_PLAIN_KEYS.has(plain)) return true;
  const first = plain.split(/\s+/)[0];
  return Boolean(first && IIT_STEM_PLAIN_KEYS.has(first));
}

/** Drop CBSE-only subjects that leak into IIT board subject dropdowns. */
export function filterSubjectsForIitBoard(subjects: string[]): string[] {
  return subjects.filter(isIitStemSubject);
}

export function hasStoryPassageLanguageSubject(subjects: string[]): boolean {
  return subjects.some(isStoryPassageLanguageSubject);
}

export function hasNonLanguageSubject(subjects: string[]): boolean {
  return subjects.some((s) => !isStoryPassageLanguageSubject(s));
}

/** Whether a tool card should appear on Vidya dashboard for the user's assigned subjects. */
export function isAiToolVisibleForSubjects(toolId: string, subjectNames: string[]): boolean {
  const id = String(toolId || '').trim();
  if (isStoryLanguageTool(id)) {
    if (subjectNames.length === 0) return true;
    return hasStoryPassageLanguageSubject(subjectNames);
  }
  if (isLanguageExcludedTool(id)) {
    if (subjectNames.length === 0) return true;
    return hasNonLanguageSubject(subjectNames);
  }
  return true;
}

/** @deprecated Use isAiToolVisibleForSubjects */
export const isStudentToolVisibleForSubjects = isAiToolVisibleForSubjects;

/** @deprecated Use isAiToolVisibleForSubjects */
export const isTeacherToolVisibleForSubjects = isAiToolVisibleForSubjects;

export function filterVisibleAiTools<T extends { id: string }>(
  tools: T[],
  subjectNames: string[],
): T[] {
  return tools.filter((tool) => isAiToolVisibleForSubjects(tool.id, subjectNames));
}

export type CurriculumSubjectRow = { value: string; label: string };

export function filterSubjectRowsForAiTool(
  toolType: string,
  rows: CurriculumSubjectRow[],
): CurriculumSubjectRow[] {
  if (isStoryLanguageTool(toolType)) {
    return rows.filter(
      (r) => isStoryPassageLanguageSubject(r.label) || isStoryPassageLanguageSubject(r.value),
    );
  }
  if (isLanguageExcludedTool(toolType)) {
    return rows.filter(
      (r) =>
        !isStoryPassageLanguageSubject(r.label) && !isStoryPassageLanguageSubject(r.value),
    );
  }
  return rows;
}

export function subjectLabelFromRows(
  rows: CurriculumSubjectRow[],
  value: string,
): string {
  const row = rows.find((r) => r.value === value);
  return row?.label || value;
}
