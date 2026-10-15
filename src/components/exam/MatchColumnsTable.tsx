import { cn } from '@/lib/utils';
import ExamMathText from '@/components/exam/ExamMathText';

export type MatchColumnCell = {
  key?: string;
  text?: string;
};

type Props = {
  columnI?: MatchColumnCell[] | null;
  columnII?: MatchColumnCell[] | null;
  /** Optional formatter for cell text (e.g. chemistry notation). */
  formatText?: (text: string) => string;
  className?: string;
};

/**
 * Renders Match-the-Following Column I / II as a single bordered exam-style table
 * (same layout as Word/PDF question papers), not as two separate cards.
 */
export function MatchColumnsTable({
  columnI = [],
  columnII = [],
  formatText = (t) => t,
  className,
}: Props) {
  const left = Array.isArray(columnI) ? columnI : [];
  const right = Array.isArray(columnII) ? columnII : [];
  const rowCount = Math.max(left.length, right.length);
  if (rowCount === 0) return null;

  return (
    <div className={cn('mb-4 overflow-x-auto', className)}>
      <table className="w-full min-w-[280px] border-collapse border border-slate-800 text-sm text-slate-900">
        <thead>
          <tr className="bg-slate-200">
            <th className="w-1/2 border border-slate-800 px-3 py-2 text-left font-bold">
              Column I
            </th>
            <th className="w-1/2 border border-slate-800 px-3 py-2 text-left font-bold">
              Column II
            </th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rowCount }, (_, i) => {
            const a = left[i];
            const b = right[i];
            const leftKey = String(a?.key || String.fromCharCode(65 + i)).replace(/\.$/, '');
            const rightKey = String(b?.key || String(i + 1)).replace(/\.$/, '');
            const leftText = formatText(String(a?.text || '').trim());
            const rightText = formatText(String(b?.text || '').trim());
            return (
              <tr key={i} className="bg-white">
                <td className="border border-slate-800 px-3 py-2 align-top">
                  {a ? (
                    <>
                      <span className="font-semibold">{leftKey}.</span>
                      {leftText ? <>{' '}<ExamMathText text={leftText} /></> : null}
                    </>
                  ) : null}
                </td>
                <td className="border border-slate-800 px-3 py-2 align-top">
                  {b ? (
                    <>
                      <span className="font-semibold">{rightKey}.</span>
                      {rightText ? <>{' '}<ExamMathText text={rightText} /></> : null}
                    </>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
