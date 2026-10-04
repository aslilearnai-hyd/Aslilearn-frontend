import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { InlineMath } from "react-katex";
import "katex/dist/katex.min.css";

const SECTION_LABELS =
  "Shape|Uses|Rays|Type|Definition|Example|Examples|Worked example|Working|Check|Practice|Try this|Common mistake|Mistake|Recap|Image|Nature|Focus|Tip|Remember|Note|Key point|Key points|Real life|Real-life|Analogy";

/**
 * Turn flat Vidya replies (content is fine, markers buried mid-line) into
 * readable sections with real newlines — without changing the meaning.
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
  // Models sometimes wrap a display equation over several lines. Keep the
  // delimited expression together so the line-oriented renderer can parse it.
  text = text.replace(/\$([^$]*?(?:\\[A-Za-z]+|[_^])[^$]*?)\$/gs, (_m, formula) =>
    `$${String(formula).replace(/\s*\n\s*/g, " ")}$`
  );

  // Section rules / dividers
  text = text.replace(/\s*---+\s*/g, "\n\n");

  // Numbered concept sections: "1. Concave Mirror (...)"
  text = text.replace(
    /(?:^|[.!?)\]])\s*(\d{1,2})\.\s+(\*{0,2}[A-Za-z][^\n]{0,80}?)(?=\s+(?:Shape|Uses|Rays|Type|Definition|Example|Image|Nature|Focus|Tip|Remember|Note|•|●|\d{1,2}\.)|\s*$)/gi,
    (_m, num, title) => `\n\n${num}. ${String(title).trim()}\n`
  );
  text = text.replace(/([a-z.!?)])\s+(\d{1,2})\.\s+(\*{0,2}[A-Z])/g, "$1\n\n$2. $3");

  // Field labels → bullets (common in Physics/Chem explanations)
  const labelRe = new RegExp(
    `([\\w.!?)"'\\]])\\s+(${SECTION_LABELS})\\s*:`,
    "gi"
  );
  text = text.replace(labelRe, "$1\n• $2:");
  text = text.replace(new RegExp(`(?:^|\\n)\\s*(${SECTION_LABELS})\\s*:`, "gi"), "\n• $1:");

  // Mid-line bullets already present
  text = text.replace(/([^\n])\s+[•●]\s+/g, "$1\n• ");
  text = text.replace(/([^\n])\s+[-*]\s+(?=[A-Z(])/g, "$1\n• ");

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
  return text;
}

function renderBold(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = /(\*\*|__)(.+?)\1/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      nodes.push(
        <Fragment key={`${keyPrefix}-t-${i++}`}>{text.slice(last, match.index)}</Fragment>
      );
    }
    nodes.push(
      <strong key={`${keyPrefix}-b-${i++}`} className="font-semibold text-inherit">
        {match[2]}
      </strong>
    );
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    nodes.push(<Fragment key={`${keyPrefix}-t-${i++}`}>{text.slice(last)}</Fragment>);
  }
  return nodes.length ? nodes : [text];
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const math = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\$[^$\n]+\$|\\\([^\n]*?\\\))/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = math.exec(text)) !== null) {
    if (match.index > last) nodes.push(...renderBold(text.slice(last, match.index), `${keyPrefix}-p-${index}`));
    const token = match[0];
    const expression = token.startsWith("$$") ? token.slice(2, -2)
      : token.startsWith("$") ? token.slice(1, -1)
        : token.slice(2, -2);
    const display = token.startsWith("$$") || token.startsWith("\\[") || /\\(?:right)?arrow/.test(expression) || expression.length > 50;
    nodes.push(
      <span key={`${keyPrefix}-m-${index++}`} className={display ? "my-2 block max-w-full overflow-x-auto py-1" : "inline-block max-w-full overflow-x-auto align-middle"}>
        <InlineMath math={expression.trim()} renderError={() => <code className="break-words">{expression}</code>} />
      </span>
    );
    last = match.index + token.length;
  }
  if (last < text.length) nodes.push(...renderBold(text.slice(last), `${keyPrefix}-p-${index}`));
  return nodes.length ? nodes : renderBold(text, keyPrefix);
}

function isBulletLine(line: string) {
  return /^\s*[•●\-]\s+/.test(line) || /^\s*\*\s+[A-Za-z]/.test(line);
}

function isNumberedLine(line: string) {
  return /^\s*\d{1,2}[.)]\s+\S/.test(line);
}

function isLabelBullet(line: string) {
  return new RegExp(`^\\s*(?:[•●\\-]\\s*)?(${SECTION_LABELS})\\s*:`, "i").test(line);
}

function stripBullet(line: string) {
  return line.replace(/^\s*[•●\-]\s+/, "").replace(/^\s*\*\s+/, "").trim();
}

function stripNumber(line: string) {
  return line.replace(/^\s*\d{1,2}[.)]\s+/, "").trim();
}

function renderLine(line: string, key: string): ReactNode {
  if (/^sources?:?\s*$/i.test(line.trim())) {
    return (
      <p key={key} className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500 first:mt-0">
        Sources
      </p>
    );
  }

  if (isNumberedLine(line)) {
    const num = line.match(/^\s*(\d{1,2})/)?.[1] || "";
    const body = stripNumber(line);
    const heading = body.length < 90 || /^\*\*/.test(body);
    return (
      <div key={key} className="mt-3 flex gap-2 first:mt-0">
        <span className="shrink-0 font-bold text-indigo-700">{num}.</span>
        <span className={heading ? "min-w-0 font-bold leading-snug text-slate-900" : "min-w-0 leading-relaxed text-slate-800"}>
          {renderInline(body, key)}
        </span>
      </div>
    );
  }

  if (isBulletLine(line) || isLabelBullet(line)) {
    const body = isBulletLine(line) ? stripBullet(line) : line.trim();
    return (
      <div key={key} className="flex gap-2 py-0.5 pl-0.5">
        <span className="mt-1 shrink-0 text-slate-400">•</span>
        <span className="min-w-0 leading-relaxed text-slate-800">{renderInline(body, key)}</span>
      </div>
    );
  }

  if (/^#{1,3}\s+/.test(line)) {
    return (
      <p key={key} className="mt-2 font-bold leading-snug text-slate-900 first:mt-0">
        {renderInline(line.replace(/^#{1,3}\s+/, ""), key)}
      </p>
    );
  }

  return (
    <p key={key} className="leading-relaxed text-slate-800">
      {renderInline(line, key)}
    </p>
  );
}

function renderBlock(block: string, bi: number): ReactNode {
  const trimmed = block.trim();
  if (!trimmed) return null;

  const lines = trimmed
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.trim());

  if (lines.length === 1 && isNumberedLine(lines[0])) {
    return renderLine(lines[0], `sec-${bi}`);
  }

  if (lines.length > 0 && lines.every((l) => isBulletLine(l) || isLabelBullet(l))) {
    return (
      <div key={`ul-${bi}`} className="my-1 space-y-0.5 pl-1">
        {lines.map((line, li) => renderLine(line, `uli-${bi}-${li}`))}
      </div>
    );
  }

  return (
    <div key={`blk-${bi}`} className="space-y-1.5">
      {lines.map((line, li) => renderLine(line, `ln-${bi}-${li}`))}
    </div>
  );
}

/** Renders Vidya chat assistant text with clear sections — same content, better layout. */
export function ChatMessageContent({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const normalized = normalizeChatStructure(text);
  if (!normalized) return null;

  const blocks = normalized.split(/\n{2,}/);

  return (
    <div className={cn("space-y-2 text-left text-[15px] leading-relaxed [overflow-wrap:anywhere]", className)}>
      {blocks.map((block, i) => renderBlock(block, i))}
    </div>
  );
}

export default ChatMessageContent;
