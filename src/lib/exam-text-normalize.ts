/**
 * Normalize exam question/option text for display: fix common mojibake and
 * lossy CSV damage (Excel ANSI export turns θ → ?, √ sometimes appears as "v3/2").
 */

const MOJIBAKE: Record<string, string> = {
  'âˆš': '√',
  'â‰¥': '≥',
  'â‰¤': '≤',
  'â‰ ': '≠',
  'âˆž': '∞',
  'âˆ†': '∆',
  'â€²': "'",
  'â€³': '"',
  'â€“': '-',
  'â€”': '-',
  'â€˜': "'",
  'â€™': "'",
  'â€œ': '"',
  'â€�': '"',
  'Â°': '°',
};

/** Recover √ and θ lost in lossy CSV / manual entry (aligned with ASLI-STUD-BACK/utils/csv-encoding.js). */
export function repairLossyMathSymbols(text: string): string {
  let s = text;
  // Square root written as "v" + fraction (e.g. v3/2) or v(n)
  s = s.replace(/\bv(\d+)\/(\d+)/g, '√$1/$2');
  s = s.replace(/\bv\((\d+)\)/g, '√($1)');
  // θ lost as "?" after sin², tan², etc. (no space before ?)
  s = s.replace(/(?<![A-Za-z])(sin|cos|tan|cot|sec|cosec|csc)([²³\u00B2\u00B3])\?/gi, '$1$2 θ');
  s = s.replace(/\band\s+\?\s+is\s+(acute|obtuse|right)\b/gi, 'and θ is $1');
  s = s.replace(/(?<![A-Za-z])(sin|cos|tan|cot|sec|cosec|csc)\s*\?/gi, '$1 θ');
  // Legacy: ? before exponent digits (narrow use)
  s = s.replace(/\?\s*(\^?\d+)/g, 'θ$1');
  return s;
}

export function normalizeExamDisplayText(value: unknown): string {
  if (value === undefined || value === null) return '';
  let text = String(value);

  if (typeof window !== 'undefined' && text.includes('&')) {
    const parser = document.createElement('textarea');
    parser.innerHTML = text;
    text = parser.value || text;
  }

  Object.entries(MOJIBAKE).forEach(([from, to]) => {
    text = text.split(from).join(to);
  });

  text = repairLossyMathSymbols(text);

  // Gemini / OCR often verbalizes roots — show classroom symbols (do not rewrite LaTeX \sqrt)
  text = text.replace(/\bcube\s*roots?\s+of\s*\(/gi, '∛(');
  text = text.replace(/\bcuberoot\s*\(/gi, '∛(');
  text = text.replace(/\bsquare\s*roots?\s+of\s*\(/gi, '√(');
  text = text.replace(/(?<!\\)\bsqrt\s*\(/gi, '√(');
  text = text.replace(/(?<!\\)\bsqrt\s+(\d+)/gi, '√$1');

  const monthToNumber: Record<string, string> = {
    jan: '1',
    feb: '2',
    mar: '3',
    apr: '4',
    may: '5',
    jun: '6',
    jul: '7',
    aug: '8',
    sep: '9',
    oct: '10',
    nov: '11',
    dec: '12',
  };
  text = text.replace(
    /^(\d{1,2})\s*-\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)$/i,
    (_m, day, mon) => `${String(day)}-${monthToNumber[String(mon).toLowerCase()] || mon}`
  );

  text = text
    .replace(/(^|[\s,(=])\?(?=\d)/g, '$1-')
    .replace(/(^|[\s,(=])\uFFFD(?=\d)/g, '$1-');

  text = text.replace(/[\uFFFD]/g, '?');
  // Soft hyphens / zero-width chars from PDF/OCR cause mid-word gaps on mobile wrap
  text = text.replace(/[\u00AD\u200B\u200C\u200D\uFEFF]/g, '');
  text = text.replace(/\s{2,}/g, ' ').trim();

  return text;
}

/** Unicode subscripts for chemistry formulas (aligned with super-admin exam-management). */
const SUBSCRIPT_DIGITS: Record<string, string> = {
  '0': '₀',
  '1': '₁',
  '2': '₂',
  '3': '₃',
  '4': '₄',
  '5': '₅',
  '6': '₆',
  '7': '₇',
  '8': '₈',
  '9': '₉',
};

const SUPERSCRIPT_DIGITS: Record<string, string> = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
  '+': '⁺',
  '-': '⁻',
  '−': '⁻',
  '(': '⁽',
  ')': '⁾',
};

const GREEK_WORD_MAP: Array<[RegExp, string]> = [
  [/\btheta\b/gi, 'θ'],
  [/\balpha\b/gi, 'α'],
  [/\bbeta\b/gi, 'β'],
  [/\bgamma\b/gi, 'γ'],
  [/\bdelta\b/gi, 'δ'],
  [/\bpi\b/gi, 'π'],
  [/\bomega\b/gi, 'ω'],
  [/\bphi\b/gi, 'φ'],
  [/\blambda\b/gi, 'λ'],
  [/\bmu\b/gi, 'μ'],
  [/\bsigma\b/gi, 'σ'],
];

function toSuperscriptRun(raw: string): string {
  return String(raw || '')
    .split('')
    .map((ch) => SUPERSCRIPT_DIGITS[ch] ?? ch)
    .join('');
}

function toSubscriptRun(raw: string): string {
  return String(raw || '')
    .split('')
    .map((ch) => SUBSCRIPT_DIGITS[ch] ?? ch)
    .join('');
}

function isChemOrScienceSubject(subject?: string): boolean {
  const s = String(subject || '')
    .trim()
    .toLowerCase();
  return /chem|science|biology|bio|physics/.test(s);
}

/**
 * Convert ASCII caret powers (sin^2, (...)^2, 25^2) and greek words (theta)
 * into classroom Unicode so students never see computer-style math.
 */
export function formatAsciiMathToUnicode(text: string): string {
  let s = text === null || text === undefined ? '' : String(text);
  if (!s) return '';

  // Preserve $...$ / $$...$$ math for KaTeX — format only plain segments.
  const parts = s.split(/(\$\$[\s\S]*?\$\$|\$[^$\n]+?\$)/g);
  return parts
    .map((part) => {
      if (!part) return part;
      if (part.startsWith('$')) return part;
      let out = part;
      for (const [re, sym] of GREEK_WORD_MAP) out = out.replace(re, sym);

      out = out.replace(/\^\{([^{}]+)\}/g, (_m, body: string) => toSuperscriptRun(body));
      out = out.replace(/\^(-?\d+)/g, (_m, digits: string) => toSuperscriptRun(digits));
      out = out.replace(/\^([A-Za-z])/g, (_m, letter: string) => {
        const mapped = SUPERSCRIPT_DIGITS[letter];
        return mapped || `^${letter}`;
      });

      out = out.replace(/_\{([^{}]+)\}/g, (_m, body: string) => toSubscriptRun(body));
      out = out.replace(/_(\d+)/g, (_m, digits: string) => toSubscriptRun(digits));

      return out;
    })
    .join('');
}

/**
 * Render chemical formulas with Unicode subscripts (H2O → H₂O, CO2 → CO₂).
 * Safe for maths: only matches Element-like tokens that contain digits.
 */
export function formatChemicalFormulasInText(text: string): string {
  const s = text === null || text === undefined ? '' : String(text);
  if (!s) return '';
  // Keep the token match linear and bounded; nested repetitions here can cause ReDoS.
  return s.replace(/\b([A-Z][A-Za-z0-9]{1,63})\b/g, (token) => {
    if (!/\d/.test(token)) return token;
    // Avoid rewriting short codes like IIT6 / NEET2
    if (/^[A-Z]{3,}\d+$/.test(token) && token.length <= 6) return token;
    return token.replace(/([A-Za-z\)])(\d+)/g, (_m, prefix: string, digits: string) => {
      return `${prefix}${toSubscriptRun(digits)}`;
    });
  });
}

/**
 * Chemistry / science subscripts. Always runs formula-pattern pass;
 * subject-gated aggressive digit pass for chemistry/science boards.
 */
export function formatChemistryDisplayText(text: string, subject?: string): string {
  const s = text === null || text === undefined ? '' : String(text);
  let out = formatChemicalFormulasInText(s);
  if (isChemOrScienceSubject(subject)) {
    out = out.replace(/([A-Za-z\)])(\d+)/g, (_match, prefix: string, digits: string) => {
      return `${prefix}${toSubscriptRun(digits)}`;
    });
  }
  return out;
}

/** Classroom display: mojibake repair + Unicode math powers + chemistry subscripts. */
export function formatClassroomScienceText(value: unknown, subject?: string): string {
  const base = normalizeExamDisplayText(value);
  return formatChemistryDisplayText(formatAsciiMathToUnicode(base), subject);
}

/** Full student-facing pipeline: mojibake/math repair + chemistry subscripts when applicable. */
export function normalizeAndFormatExamDisplayText(value: unknown, subject?: string): string {
  return formatClassroomScienceText(value, subject);
}

/** Parse a stem like `A: … R: …` into assertion / reason parts. */
export function parseAssertionReasonStem(
  text: unknown
): { assertion: string; reason: string } | null {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const m = raw.match(/^\s*A\s*[:：]\s*([\s\S]+?)\s+R\s*[:：]\s*([\s\S]+?)\s*$/i);
  if (!m) return null;
  const assertion = m[1].trim();
  const reason = m[2].trim();
  if (!assertion || !reason) return null;
  return { assertion, reason };
}

function stripArLabel(value: string, label: 'A' | 'R'): string {
  const re = label === 'A' ? /^A\s*[:：]\s*/i : /^R\s*[:：]\s*/i;
  return String(value || '').replace(re, '').trim();
}

/**
 * One clean A/R block for exam UI. Hides questionText when it only repeats the same stem.
 */
export function resolveAssertionReasonDisplay(q: {
  assertionText?: string | null;
  reasonText?: string | null;
  questionText?: string | null;
}): {
  assertion: string;
  reason: string;
  showQuestionText: boolean;
  questionText: string;
} {
  let assertion = stripArLabel(String(q.assertionText || '').trim(), 'A');
  let reason = stripArLabel(String(q.reasonText || '').trim(), 'R');
  const questionText = String(q.questionText || '').trim();

  if ((!assertion || !reason) && questionText) {
    const parsed = parseAssertionReasonStem(questionText);
    if (parsed) {
      if (!assertion) assertion = parsed.assertion;
      if (!reason) reason = parsed.reason;
    }
  }

  // assertionText sometimes holds the full "A: … R: …" blob alone
  if (assertion && !reason) {
    const parsed = parseAssertionReasonStem(
      /^A\s*[:：]/i.test(String(q.assertionText || '').trim())
        ? String(q.assertionText || '').trim()
        : `A: ${assertion}`
    );
    if (parsed) {
      assertion = parsed.assertion;
      reason = parsed.reason;
    }
  }

  let showQuestionText = Boolean(questionText);
  if (assertion && reason && questionText) {
    const parsedQt = parseAssertionReasonStem(questionText);
    if (parsedQt) {
      showQuestionText = false;
    } else {
      const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
      const a = norm(assertion);
      const r = norm(reason);
      const qt = norm(questionText);
      const aKey = a.slice(0, Math.min(48, a.length));
      const rKey = r.slice(0, Math.min(48, r.length));
      if (aKey && rKey && qt.includes(aKey) && qt.includes(rKey)) {
        showQuestionText = false;
      }
    }
  }

  return { assertion, reason, showQuestionText, questionText };
}
