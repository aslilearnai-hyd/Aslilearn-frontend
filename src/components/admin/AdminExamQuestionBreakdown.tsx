import { CheckCircle2, CircleDashed, FileQuestion, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ClassQuestionStat } from '@/lib/exam-analytics-handoff';

type Props = {
  questions: ClassQuestionStat[];
  examTitle?: string;
};

export function AdminExamQuestionBreakdown({ questions, examTitle }: Props) {
  if (!questions.length) return null;

  const hardest = [...questions]
    .filter((q) => q.attempted > 0)
    .sort((a, b) => a.classCorrectPct - b.classCorrectPct)[0];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <FileQuestion className="h-5 w-5 text-indigo-600" />
          Class question breakdown
        </CardTitle>
        <p className="text-xs text-slate-500 font-normal">
          For each question on{examTitle ? ` “${examTitle}”` : ' this paper'}: how many students got it
          correct, wrong, or left blank (best attempt per student). Same insight as the Excel sheets —
          on screen.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {hardest ? (
          <div className="rounded-xl border border-amber-100 bg-amber-50/80 px-3 py-2.5 text-xs sm:text-sm text-amber-900">
            <span className="font-semibold">Toughest question:</span> Q{hardest.questionNumber} —{' '}
            {hardest.correct} correct · {hardest.wrong} wrong · {hardest.unattempted} blank among{' '}
            {hardest.totalStudents} students
            {hardest.questionText ? (
              <span data-no-title-case className="block mt-1 text-amber-800/80 line-clamp-2">{hardest.questionText}</span>
            ) : null}
          </div>
        ) : null}

        <ul className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
          {questions.map((q) => {
            const total = Math.max(1, q.totalStudents);
            const correctPct = (q.correct / total) * 100;
            const wrongPct = (q.wrong / total) * 100;
            const unPct = (q.unattempted / total) * 100;
            return (
              <li
                key={`${q.questionId}-${q.index}`}
                className="rounded-xl border border-slate-100 bg-white px-3 py-3 sm:px-4"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-bold text-indigo-700">
                        Q{q.questionNumber}
                      </span>
                      {q.subject ? (
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {q.subject}
                        </Badge>
                      ) : null}
                    </div>
                    <p data-no-title-case className="mt-1.5 text-sm text-slate-800 line-clamp-2">{q.questionText}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-slate-900">{q.classCorrectPct}%</p>
                    <p className="text-[10px] text-slate-500">class correct</p>
                  </div>
                </div>

                <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100 mb-2.5">
                  <div className="bg-emerald-500" style={{ width: `${correctPct}%` }} />
                  <div className="bg-rose-400" style={{ width: `${wrongPct}%` }} />
                  <div className="bg-slate-300" style={{ width: `${unPct}%` }} />
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="flex items-center gap-1.5 text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      <span className="font-semibold">{q.correct}</span> correct
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-rose-600">
                    <XCircle className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      <span className="font-semibold">{q.wrong}</span> wrong
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-600">
                    <CircleDashed className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      <span className="font-semibold">{q.unattempted}</span> blank
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

export default AdminExamQuestionBreakdown;
