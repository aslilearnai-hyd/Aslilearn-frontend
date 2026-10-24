import { formatClassroomScienceText } from '@/lib/exam-text-normalize';

/**
 * Plain-text maths for Word / TXT downloads. On screen KaTeX renders $…$;
 * downloads showed raw "$\sqrt[3]{\frac{125}{343}}$", "2sqrt(19)", "x^2" and
 * "(5)/(9)". Convert LaTeX to readable Unicode, then apply the same symbol
 * clean-up the screen uses. Layout (line breaks) is kept.
 */

const SUPERSCRIPT: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', n: 'ⁿ', i: 'ⁱ', x: 'ˣ', y: 'ʸ',
};
const SUBSCRIPT: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎',
};
const SYMBOLS: Array<[RegExp, string]> = [
  [/\\times/g, '×'], [/\\div/g, '÷'], [/\\cdot/g, '·'], [/\\pm/g, '±'], [/\\mp/g, '∓'],
  [/\\leq?/g, '≤'], [/\\geq?/g, '≥'], [/\\neq?/g, '≠'], [/\\approx/g, '≈'], [/\\infty/g, '∞'],
  [/\\pi/g, 'π'], [/\\theta/g, 'θ'], [/\\alpha/g, 'α'], [/\\beta/g, 'β'], [/\\gamma/g, 'γ'],
  [/\\delta/g, 'δ'], [/\\lambda/g, 'λ'], [/\\mu/g, 'μ'], [/\\sigma/g, 'σ'], [/\\omega/g, 'ω'],
  [/\\Delta/g, 'Δ'], [/\\angle/g, '∠'], [/\\degree|\^\{?\\circ\}?/g, '°'], [/\\rightarrow|\\to/g, '→'],
  [/\\Rightarrow/g, '⇒'], [/\\therefore/g, '∴'], [/\\because/g, '∵'], [/\\%/g, '%'],
];

const script = (text: string, map: Record<string, string>, mark: string) => {
  const chars = [...text];
  return chars.every((c) => map[c]) ? chars.map((c) => map[c]).join('') : `${mark}(${text})`;
};

/** Innermost-first: \frac{a}{b}, \sqrt[n]{x}, \sqrt{x}, ^{…}, _{…}. */
function latexToText(latex: string): string {
  let s = latex;
  for (let i = 0; i < 6; i += 1) {
    const before = s;
    s = s.replace(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, (_m, a: string, b: string) => {
      const wrap = (v: string) => (/^[\w.√∛²³⁻]+$/.test(v.trim()) ? v.trim() : `(${v.trim()})`);
      return `${wrap(a)}/${wrap(b)}`;
    });
    s = s.replace(/\\sqrt\[3\]\{([^{}]*)\}/g, (_m, x: string) => `∛(${x})`);
    s = s.replace(/\\sqrt\[4\]\{([^{}]*)\}/g, (_m, x: string) => `∜(${x})`);
    s = s.replace(/\\sqrt\[([^\]]+)\]\{([^{}]*)\}/g, (_m, n: string, x: string) => `${script(n, SUPERSCRIPT, '^')}√(${x})`);
    s = s.replace(/\\sqrt\{([^{}]*)\}/g, (_m, x: string) => (/^\w+$/.test(x) ? `√${x}` : `√(${x})`));
    s = s.replace(/\^\{([^{}]*)\}/g, (_m, x: string) => script(x, SUPERSCRIPT, '^'));
    s = s.replace(/_\{([^{}]*)\}/g, (_m, x: string) => script(x, SUBSCRIPT, '_'));
    if (s === before) break;
  }
  s = s.replace(/\^([0-9a-z+-])/gi, (_m, x: string) => SUPERSCRIPT[x] || `^${x}`);
  s = s.replace(/_([0-9])/g, (_m, x: string) => SUBSCRIPT[x] || `_${x}`);
  for (const [re, sym] of SYMBOLS) s = s.replace(re, sym);
  return s
    .replace(/\\(?:left|right|displaystyle|mathrm|text|operatorname)\b/g, '')
    .replace(/\\[,;: ]/g, ' ')
    .replace(/[{}]/g, '')
    .replace(/\\/g, '')
    .replace(/\s{2,}/g, ' ');
}

export function exportMathText(text: string): string {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => {
      if (!line.trim()) return line;
      // $$…$$, $…$, \(…\), \[…\] → readable text (keep surrounding spacing).
      const unwrapped = line
        .replace(/\$\$([^$]+)\$\$/g, (_m, m: string) => latexToText(m))
        .replace(/\\\((.+?)\\\)|\\\[(.+?)\\\]/g, (_m, a: string, b: string) => latexToText(a || b))
        .replace(/\$([^$\n]+)\$/g, (_m, m: string) => latexToText(m));
      return formatClassroomScienceText(unwrapped);
    })
    .join('\n');
}
