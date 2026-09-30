/**
 * Match-the-Following helpers for AI tool viewers/parsers.
 */

export type MatchPair = {
  left: string;
  right: string;
  leftKey?: string;
  rightKey?: string;
};

function cleanItem(value: unknown): string {
  return String(value || '')
    .replace(/^\s*[A-Za-z0-9]+[\).:\-]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => {
      if (typeof v === 'string') return cleanItem(v);
      if (v && typeof v === 'object') {
        const o = v as Record<string, unknown>;
        return cleanItem(o.left || o.right || o.term || o.item || o.text || o.label || o.a || o.b || '');
      }
      return '';
    })
    .filter(Boolean);
}

export function normalizeMatchPairs(entry: Record<string, unknown> | null | undefined): MatchPair[] {
  if (!entry || typeof entry !== 'object') return [];

  const rawPairs =
    entry.matchPairs ||
    entry.match_pairs ||
    entry.pairs ||
    entry.matches ||
    entry.matchingPairs ||
    entry.columnPairs;

  if (Array.isArray(rawPairs) && rawPairs.length) {
    return rawPairs.reduce<MatchPair[]>((pairs, row, i) => {
        if (!row || typeof row !== 'object') return pairs;
        const r = row as Record<string, unknown>;
        const left = cleanItem(r.left || r.a || r.columnA || r.term || r.item || r.key || '');
        const right = cleanItem(
          r.right || r.b || r.columnB || r.match || r.value || r.definition || r.answer || '',
        );
        if (!left || !right) return pairs;
        pairs.push({
          left,
          right,
          leftKey: String(r.leftKey || i + 1),
          rightKey: String(r.rightKey || String.fromCharCode(97 + i)),
        });
        return pairs;
      }, []);
  }

  const columnA = asStringList(entry.columnA || entry.column_a || entry.leftItems || entry.listA);
  const columnB = asStringList(entry.columnB || entry.column_b || entry.rightItems || entry.listB);
  if (columnA.length && columnB.length && columnA.length === columnB.length) {
    const answer = String(entry.answer || entry.correctAnswer || '').trim();
    const map = new Map<number, string>();
    const pairRe = /(\d+)\s*[-:=)>]\s*([A-Za-z])/g;
    let m: RegExpExecArray | null;
    while ((m = pairRe.exec(answer))) {
      map.set(Number(m[1]), m[2].toLowerCase());
    }
    if (map.size === columnA.length) {
      return columnA.map((left, i) => {
        const letter = map.get(i + 1) || String.fromCharCode(97 + i);
        const rightIdx = letter.charCodeAt(0) - 97;
        return {
          left,
          right: columnB[rightIdx] || columnB[i],
          leftKey: String(i + 1),
          rightKey: letter,
        };
      });
    }
    return columnA.map((left, i) => ({
      left,
      right: columnB[i],
      leftKey: String(i + 1),
      rightKey: String.fromCharCode(97 + i),
    }));
  }

  return [];
}

export function isMatchQuestionType(type?: string | null): boolean {
  const t = String(type || '')
    .trim()
    .toUpperCase()
    .replace(/[\s_-]+/g, '');
  return t === 'MATCH' || t === 'MATCHING' || t === 'MATCHTHEFOLLOWING' || t === 'MATCHFOLLOWING';
}

export function isMatchStemText(text?: string | null): boolean {
  const q = String(text || '').trim();
  if (!q) return false;
  return /\bmatch\s+(?:the\s+)?following\b|\bcolumn\s*a\b[\s\S]{0,120}\bcolumn\s*b\b|\bmatch\s+(?:each|these|the)\s+(?:items?|terms?|words?)\b/i.test(
    q,
  );
}

export function questionHasMatchPayload(entry: Record<string, unknown> | null | undefined): boolean {
  return normalizeMatchPairs(entry).length >= 2;
}

export function formatMatchAnswerKey(pairs: MatchPair[]): string {
  return (Array.isArray(pairs) ? pairs : [])
    .map((p, i) => {
      const left = p.leftKey || String(i + 1);
      const right = p.rightKey || String.fromCharCode(97 + i);
      return `${left} → ${right}`;
    })
    .join(', ');
}

export function shuffleCopy<T>(items: T[]): T[] {
  const arr = Array.isArray(items) ? items.slice() : [];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
