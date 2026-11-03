/**
 * Splits extracted book text into lines and markdown tables for the
 * super-admin "Extracted text preview".
 *
 * Rendering the whole preview as one string ran separate equation lines
 * together ("1 × 36 = 36 4 × 9 = 36"), let an unclosed `$` on one line turn
 * the following lines into maths, and showed tables as raw `| :--- |` rows.
 */

export type BookTextBlock =
  | { kind: 'line'; text: string }
  | { kind: 'table'; header: string[]; rows: string[][] };

const SEPARATOR_CELL = /^:?\s*-{2,}\s*:?$/;

function cellsOf(row: string): string[] {
  const inner = row.trim().replace(/^\|/, '').replace(/\|$/, '');
  return inner.split('|').map((c) => c.trim());
}

const isSeparatorRow = (cells: string[]) => cells.length > 0 && cells.every((c) => SEPARATOR_CELL.test(c));

/** A line that is (or ends with) a markdown table row: at least two cells. */
function tableStart(line: string): number {
  const first = line.indexOf('|');
  if (first < 0) return -1;
  const tail = line.slice(first).trim();
  if (!tail.endsWith('|') || (tail.match(/\|/g) || []).length < 3) return -1;
  return first;
}

export function bookTextBlocks(text: string): BookTextBlock[] {
  const blocks: BookTextBlock[] = [];
  let table: { header: string[]; rows: string[][] } | null = null;
  const closeTable = () => {
    if (table) blocks.push({ kind: 'table', ...table });
    table = null;
  };

  for (const raw of String(text ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    const at = tableStart(raw);
    if (at < 0) {
      closeTable();
      if (raw.trim()) blocks.push({ kind: 'line', text: raw.trim() });
      continue;
    }
    const before = raw.slice(0, at).trim();
    if (before) {
      // "observations are given below: | Number | Factors |" — text, then a new table.
      closeTable();
      blocks.push({ kind: 'line', text: before });
    }
    let rowText = raw.slice(at).trim();
    // Rows glued together on one line ("|1|1|1||4|1, 2, 4|3|") once the header
    // tells us how many columns a row has.
    const width = table?.header.length ?? 0;
    const glued = width > 0 && cellsOf(rowText).length > width + 1 ? rowText.split(/\|\s*\|/) : [rowText];
    for (const piece of glued) {
      rowText = `|${piece.replace(/^\|/, '').replace(/\|$/, '')}|`;
      const cells = cellsOf(rowText);
      if (isSeparatorRow(cells)) continue;
      if (!table) table = { header: cells, rows: [] };
      else table.rows.push(cells);
    }
  }
  closeTable();
  return blocks;
}
