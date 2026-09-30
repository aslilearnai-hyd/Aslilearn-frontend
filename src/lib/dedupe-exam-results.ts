/**
 * Merge duplicate exam result rows from the API so the Attempted Exams grid
 * does not show the same submission multiple times.
 *
 * Handles:
 * - Repeated Mongo _id in the payload
 * - Multiple DB rows for the same (exam, attemptNumber)
 * - Near-identical rows (same score breakdown + time) within a short window — typical double-submit
 */
export function dedupeStudentExamResults(
  rows: unknown[],
  getExamIdFromResult: (result: any) => string | null
): any[] {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const sorted: any[] = [...rows].sort(
    (a: any, b: any) =>
      new Date(b?.completedAt || 0).getTime() - new Date(a?.completedAt || 0).getTime()
  );

  let list = sorted;

  const idSeen = new Set<string>();
  list = list.filter((r: any) => {
    const id = r?._id != null ? String(r._id) : '';
    if (!id) return true;
    if (idSeen.has(id)) return false;
    idSeen.add(id);
    return true;
  });

  const attemptSeen = new Set<string>();
  list = list.filter((r: any) => {
    const eid = getExamIdFromResult(r);
    if (!eid) return true;
    const att = Number(r.attemptNumber) >= 1 ? Number(r.attemptNumber) : 1;
    const k = `${eid}::${att}`;
    if (attemptSeen.has(k)) return false;
    attemptSeen.add(k);
    return true;
  });

  const perfKey = (r: any) =>
    [
      Number(r?.correctAnswers) || 0,
      Number(r?.wrongAnswers) || 0,
      Number(r?.unattempted) || 0,
      Number(r?.obtainedMarks) || 0,
      Number(r?.totalMarks) || 0,
      Number(r?.timeTaken) || 0,
    ].join('|');

  const out: any[] = [];
  /** Collapse duplicate writes within this window (ms) with identical stats */
  const PROX_MS = 90_000;

  for (const r of list) {
    const eid = getExamIdFromResult(r);
    if (!eid) {
      out.push(r);
      continue;
    }
    const fp = perfKey(r);
    const t = new Date(r?.completedAt || 0).getTime();
    const nearDup = out.some((x) => {
      const xe = getExamIdFromResult(x);
      if (xe !== eid) return false;
      if (perfKey(x) !== fp) return false;
      const xt = new Date(x?.completedAt || 0).getTime();
      return Math.abs(xt - t) <= PROX_MS;
    });
    if (nearDup) continue;
    out.push(r);
  }

  return out.sort(
    (a, b) =>
      new Date(b?.completedAt || 0).getTime() - new Date(a?.completedAt || 0).getTime()
  );
}
