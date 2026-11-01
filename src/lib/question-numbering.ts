/**
 * Question numbers shown on screen and in the PDF come from the order the
 * questions are displayed. Old records also carry a number inside the text
 * ("19. Find …") and answer keys written as "Q19", "B3" or "Question 4", so a
 * question could show two different numbers, or an answer key could point at
 * the wrong question (BUG-01). These helpers line them up.
 */
import type { ContentBlock, SixSection } from '@/components/ai-v2/six-section-viewer';

const STEM_NUMBER = /^\s*(?:\(?\s*(?:Q(?:uestion)?\.?\s*(?:No\.?\s*)?)?(\d{1,3})\s*[.):]|Q(?:uestion)?\.?\s*(\d{1,3})\s*[:.)\-–]?)\s+(?=\S)/i;

/** "19. Find x" → { stem: "Find x", saved: 19 }. Text without a leading number is unchanged. */
export function stripSavedStemNumber(stem: string): { stem: string; saved: number | null } {
  const text = String(stem ?? '');
  const match = STEM_NUMBER.exec(text);
  if (!match) return { stem: text, saved: null };
  return { stem: text.slice(match[0].length), saved: Number(match[1] ?? match[2]) };
}

/**
 * Turn a saved answer-key label into the displayed question number.
 * `sectionStarts` maps a section letter to the number of its first question,
 * so "B3" becomes the third question of section B.
 */
export function answerKeyNumber(label: string, sectionStarts: Record<string, number> = {}): number | null {
  const text = String(label ?? '').trim();
  const plain = /^(?:Q(?:uestion)?\.?\s*(?:No\.?\s*)?)?(\d{1,3})\s*[.)]?$/i.exec(text);
  if (plain) return Number(plain[1]);
  const sectioned = /^(?:Section\s*)?([A-G])\s*[-.:/]?\s*(?:Q\.?\s*)?(\d{1,3})\s*[.)]?$/i.exec(text);
  if (sectioned) {
    const start = sectionStarts[sectioned[1].toUpperCase()];
    if (start !== undefined) return start + Number(sectioned[2]) - 1;
  }
  return null;
}

type Question = { n: string; stem: string };

function questionBlocks(sections: SixSection[]): Question[][] {
  const out: Question[][] = [];
  for (const section of sections) {
    for (const block of section.blocks) {
      if (block.kind === 'mcq' || block.kind === 'shortAnswer') out.push(block.questions);
    }
  }
  return out;
}

/**
 * Remove numbers saved inside question text (the displayed number is the
 * source of truth) and rewrite answer-key labels to the displayed numbers.
 * Answer keys are only relabelled when every label resolves to a different
 * displayed question; otherwise they are left exactly as saved.
 */
export function normalizeQuestionNumbering(
  sections: SixSection[],
  sectionStarts: Record<string, number> = {},
): SixSection[] {
  const savedToShown = new Map<number, string>();
  let savedNumbersUsable = true;
  const shownNumbers = new Set<string>();

  const cleaned = sections.map((section) => ({
    ...section,
    blocks: section.blocks.map((block): ContentBlock => {
      if (block.kind !== 'mcq' && block.kind !== 'shortAnswer') return block;
      const questions = block.questions.map((q) => {
        const { stem, saved } = stripSavedStemNumber(q.stem);
        shownNumbers.add(String(q.n));
        if (saved !== null) {
          if (savedToShown.has(saved)) savedNumbersUsable = false;
          savedToShown.set(saved, String(q.n));
        }
        return stem === q.stem ? q : { ...q, stem };
      });
      return { ...block, questions } as ContentBlock;
    }),
  }));

  const total = questionBlocks(cleaned).reduce((n, qs) => n + qs.length, 0);
  return cleaned.map((section) => ({
    ...section,
    blocks: section.blocks.map((block): ContentBlock => {
      if (block.kind !== 'answerKey' || !total) return block;
      const resolved = block.items.map((item) => answerKeyNumber(item.n, sectionStarts));
      if (resolved.some((n) => n === null)) return block;
      // When the question text carried its own numbers, the key was written
      // against those; otherwise the key's numbers are the displayed ones.
      let labels: string[] | null = null;
      if (savedNumbersUsable && savedToShown.size) {
        const viaSaved = resolved.map((n) => savedToShown.get(n as number) ?? '');
        if (viaSaved.every(Boolean) && new Set(viaSaved).size === viaSaved.length) labels = viaSaved;
      }
      if (!labels) {
        const direct = resolved.map((n) => String(n));
        if (direct.every((n) => shownNumbers.has(n)) && new Set(direct).size === direct.length) labels = direct;
      }
      if (!labels) return block;
      return { ...block, items: block.items.map((item, i) => ({ ...item, n: labels![i] })) };
    }),
  }));
}
