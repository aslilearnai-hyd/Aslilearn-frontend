/** Canonical board key for grouping/filtering (mirrors backend lockBoardKey). */
export function normalizeBoardKey(raw?: string | null): string {
  const s = String(raw ?? '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!s) return '';
  const compact = s.toUpperCase().replace(/[\s/\\-]+/g, '');
  if (compact === 'CBSE' || compact === 'CBSC') return 'CBSE';
  if (
    compact === 'STATE' ||
    compact === 'STATEBOARD' ||
    compact === 'STATEBOARDGENERIC'
  ) {
    return 'STATE';
  }
  if (compact.includes('IIT') || compact.includes('NEET') || compact.includes('JEE')) {
    return 'IIT/NEET';
  }
  if (compact === 'ASLIEXCLUSIVESCHOOLS' || compact === 'ASLIEXCLUSIVE') {
    return 'ASLI_EXCLUSIVE_SCHOOLS';
  }
  // UI labels turn stored board codes such as TG_BOARD into "Tg Board".
  // Canonicalize generic separators so the display label maps back to the
  // original code when classes are filtered after being added.
  return s.toUpperCase().replace(/[\s-]+/g, '_');
}

/** Short label for UI, e.g. "IIT/NEET" → "IIT". Hub code is hidden (show Class N only). */
export function displayBoardShort(board?: string | null): string {
  const key = normalizeBoardKey(board);
  if (!key) return '';
  if (key === 'IIT/NEET' || key === 'IIT') return 'IIT';
  // Internal hub — do not show "Asli Exclusive" on class/subject cards.
  if (key === 'ASLI_EXCLUSIVE_SCHOOLS') return '';
  if (key === 'STATE') return 'State Board';
  // Title-case multi-word codes like TELANGANA → Telangana (callers may pass full DB name separately)
  if (key.includes('_')) {
    return key
      .split('_')
      .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
      .join(' ');
  }
  if (key.length > 4 && key === key.toUpperCase()) {
    return key.charAt(0) + key.slice(1).toLowerCase();
  }
  return key;
}

export function formatClassBoardLabel(classNum: string, board?: string | null): string {
  const n = String(classNum || '').trim();
  if (!n) return '';
  const b = displayBoardShort(board);
  return b ? `Class ${n} (${b})` : `Class ${n}`;
}

export function parseClassBoardLabel(label: string): { classNum: string; board: string } {
  const raw = String(label || '').trim();
  const withBoard = raw.match(/^Class\s+(\d+)\s*\((.+)\)\s*$/i);
  if (withBoard) {
    const boardRaw = withBoard[2].trim();
    const board =
      /^iit$/i.test(boardRaw) || /^iit\s*\/\s*neet$/i.test(boardRaw)
        ? 'IIT/NEET'
        : /^asli\s*exclusive/i.test(boardRaw)
          ? 'ASLI_EXCLUSIVE_SCHOOLS'
          : normalizeBoardKey(boardRaw);
    return { classNum: withBoard[1], board };
  }
  const legacy = raw.match(/^Class\s+(\d+)\s*$/i);
  if (legacy) return { classNum: legacy[1], board: '' };
  return { classNum: '', board: '' };
}

export function classBoardFilterKey(classNum: string, board?: string | null): string {
  return `${String(classNum || '').trim()}|${normalizeBoardKey(board)}`;
}

export function parseClassBoardFilterKey(key: string): { classNum: string; board: string } | null {
  if (!key || key === 'all') return null;
  const pipe = key.indexOf('|');
  if (pipe === -1) {
    return { classNum: String(key).trim(), board: '' };
  }
  const classNum = key.slice(0, pipe).trim();
  const board = normalizeBoardKey(key.slice(pipe + 1));
  if (!classNum) return null;
  return { classNum, board };
}

export function formatClassBoardFilterLabel(classNum: string, board?: string | null): string {
  return formatClassBoardLabel(classNum, board);
}

export function boardsMatch(a?: string | null, b?: string | null): boolean {
  return normalizeBoardKey(a) === normalizeBoardKey(b);
}
