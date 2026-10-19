/**
 * Exam scores are shown as marks ("12 / 20"), not percentages. Decimals only
 * when an average needs them ("12.5 / 20").
 */
export function formatMarks(obtained: unknown, total: unknown): string | null {
  const o = Number(obtained);
  const t = Number(total);
  if (!Number.isFinite(o) || !Number.isFinite(t) || t <= 0) return null;
  const fmt = (v: number) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10));
  return `${fmt(o)} / ${fmt(t)}`;
}

export type MarksPair = { obtained?: number; total?: number } | null | undefined;

export function formatMarksPair(pair: MarksPair): string | null {
  return pair ? formatMarks(pair.obtained, pair.total) : null;
}
