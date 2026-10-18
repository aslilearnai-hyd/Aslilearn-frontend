/**
 * Generated instructions are written before questions are trimmed or repaired,
 * so "Attempt all 20 questions. Section A: 8 MCQs … Total: 35 marks" drifted
 * from what the student actually sees. Rewrite those numbers from the paper.
 */
export function reconcileInstructionCounts(
  text: string,
  { total = 0, totalMarks = 0, perSection = {} }: { total?: number; totalMarks?: number; perSection?: Record<string, number> } = {},
): string {
  let out = String(text || '');
  if (!out) return out;
  if (total > 0) {
    out = out
      .replace(/\b((?:attempt|answer|solve)\s+all(?:\s+the)?\s+)\d+(\s+questions?)/gi, `$1${total}$2`)
      .replace(/\b(total\s+(?:no\.?\s+of\s+)?questions?\s*[:=-]?\s*)\d+/gi, `$1${total}`);
  }
  if (totalMarks > 0) {
    out = out
      .replace(/((?:total|max(?:imum)?)\s+marks?\s*[:=-]?\s*)\d+(?:\.\d+)?/gi, `$1${totalMarks}`)
      .replace(/(\btotal\s*[:=-]\s*)\d+(?:\.\d+)?(\s*marks?)/gi, `$1${totalMarks}$2`);
  }
  out = out.replace(/(\bsection\s+([A-G])\s*(?:\([^)]{0,30}\))?\s*[:\-–]\s*)(\d+)/gi, (match, lead: string, letter: string) => {
    const n = perSection[String(letter).toUpperCase()];
    return Number.isFinite(n) && n > 0 ? `${lead}${n}` : match;
  });
  return out;
}

/** "Section B – Fill in the blanks" → "B"; falls back to position (A, B, C…). */
export function sectionLetter(label: string | undefined, index: number): string {
  const m = String(label || '').match(/\bsection\s+([A-G])\b/i);
  return m ? m[1].toUpperCase() : String.fromCharCode(65 + index);
}
