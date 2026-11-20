import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { InlineMath } from "react-katex";
import "katex/dist/katex.min.css";
import { SECTION_LABELS, mathTokenParts, normalizeChatStructure, splitInline, type InlinePart } from "./chat-text-normalize";

export { normalizeChatStructure };

function renderFormula(token: string, key: string): ReactNode {
  const { expression, display } = mathTokenParts(token);
  return (
    <span key={key} className={display ? "my-2 block max-w-full overflow-x-auto overflow-y-hidden py-1" : "inline-block max-w-full overflow-x-auto overflow-y-hidden px-0.5 py-0.5 align-middle"}>
      <InlineMath math={expression.trim()} renderError={() => <code className="break-words">{expression}</code>} />
    </span>
  );
}

function renderParts(parts: InlinePart[], keyPrefix: string): ReactNode[] {
  return parts.map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (part.kind === "math") return renderFormula(part.token, key);
    if (part.kind === "bold") {
      return (
        <strong key={key} className="font-semibold text-inherit">
          {renderParts(part.parts, key)}
        </strong>
      );
    }
    return <Fragment key={key}>{part.text}</Fragment>;
  });
}

/** Bold and maths in one line (bold may contain formulas). */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  return renderParts(splitInline(text), keyPrefix);
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
