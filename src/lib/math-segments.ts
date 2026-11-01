/**
 * Split AI-generated text into plain-text and maths parts.
 *
 * Saved records mix every LaTeX style: `$…$`, `$$…$$`, `\(…\)`, `\[…\]`,
 * maths that wraps onto a second line, and bare commands such as
 * `\frac{3}{4}` or `\sqrt{144}` with no delimiters at all. The old splitter
 * only matched single-line delimited maths, so the rest showed as raw LaTeX
 * and an unmatched `$` was printed as a stray dollar sign (BUG-02).
 */
export type MathSegment = { math: boolean; value: string; display?: boolean };

const ESCAPED_DOLLAR = '\u0000ESCDOLLAR\u0000';
const MAX_INLINE_MATH = 400;

const DELIMITED = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$((?:[^$\n]|\n(?!\s*\n))+?)\$/g;

// Commands that are maths on their own; argument counts drive brace matching.
const COMMAND_ARGS: Record<string, number> = {
  frac: 2, dfrac: 2, tfrac: 2, binom: 2,
  sqrt: 1, overline: 1, underline: 1, vec: 1, hat: 1, bar: 1, mathrm: 1, mathbf: 1, text: 1, boxed: 1,
};
const SYMBOL_COMMANDS = new Set([
  'times', 'div', 'pm', 'mp', 'cdot', 'le', 'leq', 'ge', 'geq', 'neq', 'ne', 'approx', 'equiv', 'propto',
  'infty', 'degree', 'circ', 'angle', 'triangle', 'parallel', 'perp', 'therefore', 'because',
  'pi', 'theta', 'alpha', 'beta', 'gamma', 'delta', 'Delta', 'lambda', 'mu', 'sigma', 'Sigma', 'omega', 'Omega', 'phi', 'rho', 'epsilon',
  'rightarrow', 'leftarrow', 'Rightarrow', 'leftrightarrow', 'to', 'sum', 'int', 'lim',
]);

function readGroup(text: string, open: number): number {
  if (text[open] !== '{') return -1;
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

/** End index of a bare command starting at `start` (a backslash), or -1 when it is not maths. */
function bareCommandEnd(text: string, start: number): number {
  const name = /^\\([A-Za-z]+)/.exec(text.slice(start));
  if (!name) return -1;
  const command = name[1];
  let end = start + name[0].length;
  const args = COMMAND_ARGS[command];
  if (args !== undefined) {
    if (command === 'sqrt' && text[end] === '[') {
      const close = text.indexOf(']', end);
      if (close < 0) return -1;
      end = close + 1;
    }
    for (let n = 0; n < args; n += 1) {
      while (text[end] === ' ') end += 1;
      const groupEnd = readGroup(text, end);
      if (groupEnd < 0) return -1;
      end = groupEnd;
    }
  } else if (!SYMBOL_COMMANDS.has(command)) {
    return -1;
  }
  // Trailing powers / subscripts: \pi r^2, \sqrt{x}^{3}
  for (;;) {
    const sup = /^[\^_](\{|[A-Za-z0-9])/.exec(text.slice(end));
    if (!sup) break;
    if (sup[1] === '{') {
      const groupEnd = readGroup(text, end + 1);
      if (groupEnd < 0) break;
      end = groupEnd;
    } else {
      end += 2;
    }
  }
  return end;
}

/** Plain text may still hold bare LaTeX; pull those runs out as maths. */
function splitBareLatex(text: string, out: MathSegment[]) {
  let plainStart = 0;
  let i = 0;
  while (i < text.length) {
    if (text[i] !== '\\') {
      i += 1;
      continue;
    }
    const end = bareCommandEnd(text, i);
    if (end < 0) {
      i += 1;
      continue;
    }
    // Absorb a simple operand right before it (the "2" in "2\times 3") and chain
    // neighbouring commands joined by short operands ("\frac{1}{2} + \frac{1}{3}").
    let start = i;
    const lead = /(?:^|[^A-Za-z0-9.])((?:\d[\d.]*|[A-Za-z])\s*)$/.exec(text.slice(plainStart, i));
    if (lead) start = i - lead[1].length;
    let stop = end;
    for (;;) {
      const link = /^(\s*[-+=×÷*/<>]?\s*(?:\d[\d.]*|[A-Za-z](?![A-Za-z]))?\s*[-+=×÷*/<>]?\s*)\\/.exec(text.slice(stop));
      if (!link) break;
      const next = bareCommandEnd(text, stop + link[1].length);
      if (next < 0) break;
      stop = next;
    }
    // Operators such as \times take the operand after them ("\times 3 = 6").
    const operand = /^(\s*(?:\d[\d.]*|[A-Za-z](?![A-Za-z])))/.exec(text.slice(stop));
    if (operand && /[^}]$/.test(text.slice(i, stop))) stop += operand[1].length;
    for (;;) {
      const tail = /^(\s*[-+=×÷*/<>]\s*(?:\d[\d.]*|[A-Za-z](?![A-Za-z])))/.exec(text.slice(stop));
      if (!tail) break;
      stop += tail[1].length;
    }
    if (start > plainStart) out.push({ math: false, value: text.slice(plainStart, start) });
    out.push({ math: true, value: text.slice(start, stop).trim() });
    plainStart = stop;
    i = stop;
  }
  if (plainStart < text.length) out.push({ math: false, value: text.slice(plainStart) });
}

/** A `$` left over after pairing is a typo unless it is money ("$5"). */
function dropOrphanDollars(text: string): string {
  return text.replace(/\$(?!\s?\d)/g, '');
}

export function splitMathSegments(input: string): MathSegment[] {
  const text = String(input ?? '').replace(/\\\$/g, ESCAPED_DOLLAR);
  const out: MathSegment[] = [];
  const pushPlain = (value: string) => {
    if (!value) return;
    splitBareLatex(dropOrphanDollars(value), out);
  };
  let last = 0;
  DELIMITED.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = DELIMITED.exec(text))) {
    const body = match[1] ?? match[2] ?? match[3] ?? match[4] ?? '';
    const inlineDollar = match[4] !== undefined;
    // "$5 and $10" is money, not maths; overly long single-dollar runs are a missing close.
    if (inlineDollar && (/^\s?\d[\d,.]*\s+(?:and|or|to|for|each|per)\b/i.test(body) || body.length > MAX_INLINE_MATH || !body.trim())) {
      continue;
    }
    pushPlain(text.slice(last, match.index));
    out.push({ math: true, value: body.replace(/\s*\n\s*/g, ' ').trim(), display: match[1] !== undefined || match[2] !== undefined });
    last = match.index + match[0].length;
  }
  pushPlain(text.slice(last));
  const restored = out
    .map((part) => ({ ...part, value: part.value.split(ESCAPED_DOLLAR).join(part.math ? '\\$' : '$') }))
    .filter((part) => part.value !== '');
  // Merge neighbouring plain parts so callers see clean runs.
  const merged: MathSegment[] = [];
  for (const part of restored) {
    const prev = merged[merged.length - 1];
    if (prev && !prev.math && !part.math) prev.value += part.value;
    else merged.push({ ...part });
  }
  return merged;
}

/** Readable plain text for places that cannot render KaTeX (PDF text fallback). */
export function mathToReadableText(input: string): string {
  return splitMathSegments(input)
    .map((part) => (part.math ? latexToReadable(part.value) : part.value))
    .join('');
}

const SUPERSCRIPTS: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '+': '⁺', '-': '⁻', n: 'ⁿ' };
const SYMBOLS: Record<string, string> = {
  times: '×', div: '÷', pm: '±', mp: '∓', cdot: '·', le: '≤', leq: '≤', ge: '≥', geq: '≥', neq: '≠', ne: '≠', approx: '≈', equiv: '≡',
  propto: '∝', infty: '∞', degree: '°', circ: '°', angle: '∠', triangle: '△', parallel: '∥', perp: '⊥', therefore: '∴', because: '∵',
  pi: 'π', theta: 'θ', alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', Delta: 'Δ', lambda: 'λ', mu: 'μ', sigma: 'σ', Sigma: 'Σ',
  omega: 'ω', Omega: 'Ω', phi: 'φ', rho: 'ρ', epsilon: 'ε', rightarrow: '→', to: '→', leftarrow: '←', Rightarrow: '⇒', leftrightarrow: '↔',
  sum: 'Σ', int: '∫', lim: 'lim', quad: ' ', qquad: ' ',
};

function superscript(value: string): string {
  const chars = value.split('').map((c) => SUPERSCRIPTS[c]);
  return chars.every(Boolean) ? chars.join('') : `^(${value})`;
}

export function latexToReadable(expression: string): string {
  let text = String(expression ?? '');
  const atom = (v: string) => (/^[A-Za-z0-9.]+$/.test(v.trim()) ? v.trim() : `(${v.trim()})`);
  for (let pass = 0; pass < 8; pass += 1) {
    const next = text
      .replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, (_, a, b) => `${atom(a)}/${atom(b)}`)
      .replace(/\\sqrt\s*\[3\]\s*\{([^{}]*)\}/g, (_, a) => `∛${atom(a)}`)
      .replace(/\\sqrt\s*\[([^\]]+)\]\s*\{([^{}]*)\}/g, (_, n, a) => `${n}√${atom(a)}`)
      .replace(/\\sqrt\s*\{([^{}]*)\}/g, (_, a) => `√${atom(a)}`)
      .replace(/\\(?:text|mathrm|mathbf|boxed|overline|underline|vec|hat|bar)\s*\{([^{}]*)\}/g, '$1')
      .replace(/\^\{([^{}]*)\}/g, (_, e) => superscript(e))
      .replace(/_\{([^{}]*)\}/g, '_$1');
    if (next === text) break;
    text = next;
  }
  return text
    .replace(/\^([0-9n])/g, (_, e) => superscript(e))
    .replace(/\\left|\\right/g, '')
    .replace(/\\([A-Za-z]+)/g, (m, name) => SYMBOLS[name] ?? name)
    .replace(/\\[,;!:]/g, ' ')
    .replace(/[{}]/g, '')
    .replace(/\s{2,}/g, ' ');
}
