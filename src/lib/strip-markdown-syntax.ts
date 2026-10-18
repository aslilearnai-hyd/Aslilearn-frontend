/** "2 * 14 * 9" / "3*4" are multiplication, not *italics*: keep them as ×. */
export function protectMultiplication(text: string): string {
  return String(text || "")
    .replace(/(\S)[ \t]+\*[ \t]+(?=\S)/g, "$1 × ")
    .replace(/([0-9)\]])\*(?=[0-9([])/g, "$1×");
}

/** Remove markdown markers so AI tool content reads as normal plain text. */
export function stripMarkdownSyntax(text: string): string {
  let s = protectMultiplication(String(text || "").replace(/\r\n/g, "\n"));

  for (let i = 0; i < 6; i += 1) {
    const prev = s;
    s = s
      .replace(/\*\*(.*?)\*\*/gs, "$1")
      .replace(/__(.*?)__/gs, "$1")
      .replace(/(?<!\*)\*(?!\*)([^*\n]+?)(?<!\*)\*(?!\*)/g, "$1")
      // "_note_" is italics; "a_1 + a_2" is subscripts and must survive.
      .replace(/(?<![A-Za-z0-9_])_(?!_)([^_\n]+?)(?<!_)_(?![A-Za-z0-9_])/g, "$1");
    if (s === prev) break;
  }

  s = s.replace(/\*\*/g, "").replace(/__/g, "");

  s = s
    .split("\n")
    .map((line) => {
      let l = line
        .replace(/^#{1,6}\s+/, "")
        .replace(/^>\s?/, "")
        .replace(/^[-*+]\s+/, "• ")
        .replace(/`+/g, "");
      l = l.replace(/^\*+\s*/, "").replace(/\s*\*+$/, "");
      return l.trimEnd();
    })
    .join("\n");

  return s
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/!\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/^[-*_]{3,}\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function deepStripMarkdownValues<T>(value: T): T {
  if (value == null) return value;
  if (typeof value === "string") return stripMarkdownSyntax(value) as T;
  if (Array.isArray(value)) return value.map((item) => deepStripMarkdownValues(item)) as T;
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      out[key] = deepStripMarkdownValues(nested);
    }
    return out as T;
  }
  return value;
}
