/**
 * Answer keys arrive in several shapes from the model:
 *   "QSection A, Q1. B) (14, 25)"   "QMCQ 1. C) Non-parallel"
 *   "Q11. Simple bars (Points: 1+1.)"   "1 mark: They meet at a point"
 * Normalise them to "A1. B) (14, 25)" / "MCQ 1. C) …" and drop marking
 * annotations, which belong in a rubric, not in the key a teacher reads out.
 */

const MARKING_NOTE_RE = /\s*\((?:full\s+points?[^)]*|points?\s*:[^)]*|\d+\s*marks?\s*each[^)]*)\)/gi;
const MARKS_PREFIX_RE = /^\s*\d+(?:\.\d+)?\s*marks?\s*[:\-–]\s*/i;

/** One answer cell: no "1 mark:" prefix, no "(Points: 1+1.)" notes. */
export function cleanAnswerText(answer: string): string {
  return String(answer || '')
    .replace(MARKS_PREFIX_RE, '')
    .replace(MARKING_NOTE_RE, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function cleanLabel(line: string): string {
  return line
    // "QSection A, Q1." / "Section A Q1:" / "Section A - 1." → "A1."
    .replace(/^\s*Q?\s*Section\s*([A-G])\s*[,.\-–:]?\s*Q?\s*(\d+)\s*[.):\-–]?\s*/i, (_m, s: string, n: string) => `${s.toUpperCase()}${n}. `)
    // "QMCQ 1." / "QFIB 2." → "MCQ 1." / "FIB 2."
    .replace(/^\s*Q\s*(?=(?:MCQ|FIB|VSA|SA|LA|HOTS|CASE|TF)\s*\d)/i, '')
    // "QA1." → "A1."
    .replace(/^\s*Q\s*(?=[A-G]\d+\b)/, '');
}

/** Whole answer-key text block, line by line. */
export function cleanAnswerKeyText(text: string): string {
  return String(text || '')
    .split('\n')
    .map((line) => {
      const labelled = cleanLabel(line);
      // Marks prefix right after the label: "A3. 1 mark: They meet" → "A3. They meet".
      const m = labelled.match(/^(\s*(?:[A-G]?\d+|(?:MCQ|FIB|VSA|SA|LA)\s*\d+|Q\d+)[.)]\s*)(.*)$/i);
      return m ? `${m[1]}${cleanAnswerText(m[2])}` : cleanAnswerText(labelled) || labelled.trim();
    })
    .join('\n');
}
