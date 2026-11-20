/**
 * Text clean-up for Vidya chat replies, before they are drawn. Pure functions
 * (no React) so the backend eval can run exactly what the screen runs.
 */

const SECTION_LABELS =
  "Shape|Uses|Rays|Type|Definition|Example|Examples|Worked example|Working|Check|Practice|Try this|Common mistake|Mistake|Recap|Image|Nature|Focus|Tip|Remember|Note|Key point|Key points|Real life|Real-life|Analogy";

export { SECTION_LABELS };

/** Inline maths spans the renderer draws with KaTeX. */
export const MATH_SPAN_RE = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\$[^$\n]+\$|\\\([^\n]*?\\\))/g;

function flattenMarkdownTables(raw: string): string {
  const lines = raw.split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const header = lines[i];
    const divider = lines[i + 1] || "";
    if (/^\s*\|.*\|\s*$/.test(header) && /^\s*\|(?:\s*:?-{3,}:?\s*\|)+\s*$/.test(divider)) {
      const headings = header.split("|").slice(1, -1).map((cell) => cell.trim().replace(/\*\*/g, ""));
      i += 1;
      while (i + 1 < lines.length && /^\s*\|.*\|\s*$/.test(lines[i + 1])) {
        const cells = lines[i + 1].split("|").slice(1, -1).map((cell) => cell.trim().replace(/\*\*/g, ""));
        const values = cells
          .map((cell, index) => (cell ? `${headings[index] || `Field ${index + 1}`}: ${cell}` : ""))
          .filter(Boolean);
        if (values.length) out.push(`• ${values.join(" · ")}`);
        i += 1;
      }
      continue;
    }
    out.push(header);
  }
  return out.join("\n");
}

/**
 * Multi-line display maths ($$...$$, \[...\], \(...\)) arrives over several
 * lines; the renderer works line by line and showed raw "$$" and backslashes.
 * Put every formula on one line as $...$.
 */
export function joinMultilineMath(raw: string): string {
  const oneLine = (s: string) => String(s).replace(/\s*\n\s*/g, " ").trim();
  return raw
    .replace(/\$\$([\s\S]+?)\$\$/g, (_m, f) => `$${oneLine(f)}$`)
    .replace(/\\\[([\s\S]+?)\\\]/g, (_m, f) => `$${oneLine(f)}$`)
    .replace(/\\\(([\s\S]+?)\\\)/g, (_m, f) => `$${oneLine(f)}$`)
    .replace(/\$([^$]*?(?:\\[A-Za-z]+|[_^])[^$]*?)\$/gs, (_m, f) => `$${oneLine(f)}$`);
}

/**
 * Turn flat Vidya replies (content is fine, markers buried mid-line) into
 * readable sections with real newlines — without changing the meaning.
 * Formulas are set aside first: the bullet and line-break rules below used to
 * cut "$a - (b + c)$" in half, leaving raw "$" on screen.
 */
export function normalizeChatStructure(raw: string): string {
  if (!raw) return "";
  let text = String(raw).replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  // Retrieval evidence remains attached to the message metadata/history, but
  // the student-facing lesson should not end with a long technical appendix.
  text = text.replace(/\n\s*(?:#{1,4}\s*)?(?:sources?|retrieved sources?|textbook sections retrieved)\s*:?[ \t]*\n[\s\S]*$/i, "");
  text = text.replace(/\s*\[B\d+\](?=[\s.,;:!?)]|$)/gi, "");
  // Platform evidence IDs belong to the server audit payload, not the visible chat.
  text = text.replace(/\s*\[Q:[^\]\r\n]{1,100}\](?=[\s.,;:!?)]|$)/gi, "");
  text = flattenMarkdownTables(text);
  text = joinMultilineMath(text);

  // Set formulas aside so the layout rules below cannot split them.
  const formulas: string[] = [];
  text = text.replace(MATH_SPAN_RE, (m) => `\u0000${formulas.push(m) - 1}\u0000`);

  // Section rules / dividers ("---", and "***" / "___" on their own line, which showed as raw stars)
  text = text.replace(/\s*---+\s*/g, "\n\n");
  text = text.replace(/^[ \t]*(?:\*[ \t]*){3,}$|^[ \t]*(?:_[ \t]*){3,}$/gm, "\n");

  // Line-breaking rules must not fire inside bold text: "**Worked example:**" and
  // "2. **Worked Example**" were split before "example", showing raw "**".
  const insideBold = (whole: string, at: number) => {
    const lineStart = whole.lastIndexOf("\n", at - 1) + 1;
    return ((whole.slice(lineStart, at).match(/\*\*/g) || []).length % 2) === 1;
  };
  const unlessBold = (replacement: (...groups: string[]) => string) =>
    (m: string, ...rest: unknown[]) => {
      const groups = rest.slice(0, -2) as string[];
      const at = rest[rest.length - 2] as number;
      const whole = rest[rest.length - 1] as string;
      return insideBold(whole, at + m.length) ? m : replacement(...groups);
    };

  // Numbered concept sections: "1. Concave Mirror (...)"
  text = text.replace(
    /(?:^|[.!?)\]])\s*(\d{1,2})\.\s+(\*{0,2}[A-Za-z][^\n]{0,80}?)(?=\s+(?:Shape|Uses|Rays|Type|Definition|Example|Image|Nature|Focus|Tip|Remember|Note|•|●|\d{1,2}\.)|\s*$)/gi,
    unlessBold((num, title) => `\n\n${num}. ${String(title).trim()}\n`)
  );
  // "...mirrors 1. Concave 2. Convex" → one item per line. Only for a real sequence:
  // "The answer is 5. Example: ..." was broken into "The answer is" + a "5." list item.
  text = text.replace(/([a-z.!?)])\s+(\d{1,2})\.\s+(\*{0,2}[A-Z])/g, (m, before, num, after, at, whole) => {
    const n = Number(num);
    const isList = n === 1
      ? /\s2\.\s+\*{0,2}[A-Z]/.test(whole.slice(at + m.length))
      : new RegExp(`(?:^|\\s)${n - 1}\\.\\s+\\*{0,2}[A-Z]`).test(whole.slice(0, at + 1));
    return isList ? `${before}\n\n${num}. ${after}` : m;
  });

  // Field labels → bullets (common in Physics/Chem explanations)
  const labelRe = new RegExp(`([\\w.!?)"'\\]])\\s+(${SECTION_LABELS})\\s*:`, "gi");
  text = text.replace(labelRe, unlessBold((a, b) => `${a}\n• ${b}:`));
  text = text.replace(new RegExp(`(?:^|\\n)\\s*(${SECTION_LABELS})\\s*:`, "gi"), unlessBold((a) => `\n• ${a}:`));

  // Mid-line bullets already present
  text = text.replace(/([^\n])\s+[•●]\s+/g, unlessBold((a) => `${a}\n• `));
  text = text.replace(/([^\n])\s+[-*]\s+(?=[A-Z(])/g, unlessBold((a) => `${a}\n• `));

  // Soft-wrap long opener prose into short paragraphs (keep meaning)
  const parts = text.split(/\n{2,}/);
  text = parts
    .map((block) => {
      const b = block.trim();
      if (!b) return "";
      if (b.includes("\n") || /^\d{1,2}\./.test(b) || b.startsWith("•")) return b;
      if (b.length < 220) return b;
      return b.replace(/([.!?])\s+(?=[A-Z"'])/g, "$1\n\n");
    })
    .filter(Boolean)
    .join("\n\n");

  text = text.replace(/\n{3,}/g, "\n\n").trim();
  // Put the formulas back exactly as they were.
  return text.replace(/\u0000(\d+)\u0000/g, (_m, i) => formulas[Number(i)] ?? "");
}

export type InlinePart =
  | { kind: "text"; text: string }
  | { kind: "math"; token: string }
  | { kind: "bold"; parts: InlinePart[] };

function textAndFormulas(text: string, formulas: string[]): InlinePart[] {
  return text
    .split(/\u0000(\d+)\u0000/)
    .map((part, i): InlinePart | null =>
      i % 2 === 1 ? { kind: "math", token: formulas[Number(part)] ?? "" } : part ? { kind: "text", text: part } : null
    )
    .filter((p): p is InlinePart => p !== null);
}

/**
 * One line split into text, formulas and bold. Bold pairs are found first, with
 * formulas set aside: "**Cotangent ($\cot \theta$):**" used to be split at the
 * formula first, so neither half had a full ** pair and both "**" showed.
 */
export function splitInline(text: string): InlinePart[] {
  const formulas: string[] = [];
  const masked = text.replace(new RegExp(MATH_SPAN_RE.source, "g"), (m) => `\u0000${formulas.push(m) - 1}\u0000`);
  const parts: InlinePart[] = [];
  const re = /(\*\*|__)(.+?)\1/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(masked)) !== null) {
    if (match.index > last) parts.push(...textAndFormulas(masked.slice(last, match.index), formulas));
    parts.push({ kind: "bold", parts: textAndFormulas(match[2], formulas) });
    last = match.index + match[0].length;
  }
  if (last < masked.length) parts.push(...textAndFormulas(masked.slice(last), formulas));
  return parts;
}

/** The formula inside a math token, and whether it is drawn as a block. */
export function mathTokenParts(token: string): { expression: string; display: boolean } {
  const expression = token.startsWith("$$") ? token.slice(2, -2)
    : token.startsWith("$") ? token.slice(1, -1)
      : token.slice(2, -2);
  const display = token.startsWith("$$") || token.startsWith("\\[") || /\\(?:right)?arrow/.test(expression) || expression.length > 50;
  return { expression: expression.trim(), display };
}
