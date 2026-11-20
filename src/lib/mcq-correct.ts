/**
 * Which MCQ options are correct. JEE papers mix single-correct and
 * multiple-correct MCQs; a multiple-correct answer lists every correct option
 * ("A) 2; C) 5") and the backend marks the row multiCorrect: true.
 */

/** Option labels an answer names: "A) 2; C) 5" → ['A', 'C']. Same rule as the backend. */
export function mcqAnswerLabels(answer: string): string[] {
  const labels: string[] = [];
  for (const m of String(answer ?? '').matchAll(/(?:^|[;,]\s*|\band\s+)\(?([A-Z])\)/g)) {
    if (!labels.includes(m[1])) labels.push(m[1]);
  }
  return labels;
}

export type MarkedOption = { label: string; text: string; correct: boolean };

export function markMcqOptions(
  options: string[],
  answer: string,
  multiCorrect = false,
): { options: MarkedOption[]; multiCorrect: boolean } {
  const parsed = options.map((t) => ({
    label: t.match(/^([A-D])\)/)?.[1] ?? '',
    text: t.replace(/^[A-D]\)\s*/, ''),
  }));
  const named = mcqAnswerLabels(answer).filter((l) => parsed.some((o) => o.label === l));
  const multi = multiCorrect || named.length >= 2;
  const single = answer.replace(/^[A-D]\)\s*/, '').trim();
  return {
    multiCorrect: multi,
    options: parsed.map((o) => ({
      ...o,
      correct: multi ? named.includes(o.label) : single === o.text.trim(),
    })),
  };
}
