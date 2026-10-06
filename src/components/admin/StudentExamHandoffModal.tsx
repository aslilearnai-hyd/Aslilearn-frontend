import { useMemo, useState } from 'react';
import { CheckCircle2, CircleDashed, XCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  buildHandoffQuestionRows,
  formatHandoffNumber,
  formatHandoffPct,
  type ClassQuestionStat,
  type HandoffIndividualReport,
} from '@/lib/exam-analytics-handoff';
import type { SchoolAnalysisExamResult } from '@/lib/school-performance-analysis-data';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  individual: HandoffIndividualReport | null;
  examTitle?: string;
  /** Raw attempt row — used for question-by-question detail. */
  attemptResult?: SchoolAnalysisExamResult | null;
  /** Class-level counts per question (same paper / cohort). */
  classQuestionStats?: ClassQuestionStat[];
};

type TabId = 'snapshot' | 'questions' | 'subjects' | 'behaviour' | 'actions';

const TABS: { id: TabId; label: string }[] = [
  { id: 'snapshot', label: 'Snapshot' },
  { id: 'questions', label: 'Questions' },
  { id: 'subjects', label: 'Subjects' },
  { id: 'behaviour', label: 'Behaviour' },
  { id: 'actions', label: 'Actions' },
];

function behaviourDisplay(value: string | number, metric: string) {
  if (typeof value !== 'number') return value;
  const m = metric.toLowerCase();
  if (m.includes('time')) return `${formatHandoffNumber(value)}s`;
  if (m.includes('correct')) return formatHandoffNumber(value, 2);
  return formatHandoffPct(value);
}

function statusMeta(status: 'correct' | 'wrong' | 'not_answered') {
  if (status === 'correct') {
    return {
      label: 'Correct',
      className: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      Icon: CheckCircle2,
    };
  }
  if (status === 'wrong') {
    return {
      label: 'Wrong',
      className: 'bg-rose-50 text-rose-800 border-rose-200',
      Icon: XCircle,
    };
  }
  return {
    label: 'Unattempted',
    className: 'bg-slate-100 text-slate-700 border-slate-200',
    Icon: CircleDashed,
  };
}

export function StudentExamHandoffModal({
  open,
  onOpenChange,
  individual,
  examTitle,
  attemptResult = null,
  classQuestionStats = [],
}: Props) {
  const [tab, setTab] = useState<TabId>('questions');

  const questionRows = useMemo(() => {
    if (!individual) return [];
    if ((individual.questions?.length ?? 0) > 0) return individual.questions;
    return buildHandoffQuestionRows(attemptResult);
  }, [individual, attemptResult]);

  const classByNumber = useMemo(() => {
    const map = new Map<number, ClassQuestionStat>();
    for (const row of classQuestionStats) map.set(row.questionNumber, row);
    return map;
  }, [classQuestionStats]);

  if (!individual) return null;
  const { student, subjectDiagnostics, behaviour, actions } = individual;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setTab('questions');
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[94vh] overflow-hidden flex flex-col sm:max-w-5xl p-0 gap-0">
        <div className="px-4 pt-4 sm:px-6 sm:pt-5 border-b border-slate-100 pb-3">
          <DialogHeader>
            <DialogTitle className="text-left uppercase tracking-wide">
              {student.name} · Individual exam analysis
            </DialogTitle>
            {examTitle ? <p className="text-xs text-slate-500 text-left">{examTitle}</p> : null}
          </DialogHeader>

          <div className="flex flex-wrap gap-2 mt-3">
            <Badge variant="outline">Rank #{student.rank}</Badge>
            <Badge variant="outline">Percentile {formatHandoffNumber(student.percentile, 2)}</Badge>
            <Badge className="bg-sky-100 text-sky-800 hover:bg-sky-100">{student.cohortBand}</Badge>
            <Badge variant="secondary">{student.paceAccuracyProfile}</Badge>
            <Badge variant="outline">{student.attemptLabel}</Badge>
            <Badge variant="outline">Completed {student.completedAt}</Badge>
          </div>

          <div className="flex flex-wrap gap-1.5 mt-3">
            {TABS.map((item) => (
              <Button
                key={item.id}
                type="button"
                size="sm"
                variant={tab === item.id ? 'default' : 'outline'}
                className="rounded-lg h-8 text-xs"
                onClick={() => setTab(item.id)}
              >
                {item.label}
              </Button>
            ))}
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            Same sections as the Excel individual student sheet — view them here without downloading.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5 text-sm space-y-4">
          {tab === 'snapshot' ? (
            <section>
              <div className="mb-2 rounded-md bg-slate-800 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-white">
                Performance snapshot
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  ['Total', student.total],
                  ['Correct', student.correct],
                  ['Wrong', student.wrong],
                  ['Recorded left', student.left],
                  ['Accuracy', formatHandoffPct(student.accuracy)],
                  ['Attempt rate', formatHandoffPct(student.attemptRate)],
                  ['Precision', formatHandoffPct(student.precision)],
                  ['Avg time/Q', `${formatHandoffNumber(student.avgTimeSec)}s`],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-lg border bg-slate-50 px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase text-slate-500">{label}</p>
                    <p className="text-base font-bold text-slate-900">{value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-600">
                <div className="rounded-lg border px-3 py-2">
                  Strongest subject: <span className="font-semibold text-slate-900">{student.strongestSubject || '—'}</span>
                </div>
                <div className="rounded-lg border px-3 py-2">
                  Weakest subject: <span className="font-semibold text-slate-900">{student.weakestSubject || '—'}</span>
                </div>
              </div>
            </section>
          ) : null}

          {tab === 'questions' ? (
            <section>
              <div className="mb-2 rounded-md bg-slate-800 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-white">
                Question-by-question
              </div>
              {questionRows.length === 0 ? (
                <p className="text-sm text-slate-500 rounded-lg border border-dashed px-3 py-4">
                  No per-question detail was saved for this attempt yet. Overall counts in Snapshot still
                  apply.
                </p>
              ) : (
                <>
                  <p className="text-xs text-slate-500 mb-3">
                    This student’s answer on each question, plus how the class did on the same item
                    (correct / wrong / blank).
                  </p>
                  <ul className="space-y-2.5">
                    {questionRows.map((q) => {
                      const meta = statusMeta(q.status);
                      const Icon = meta.Icon;
                      const classStat = classByNumber.get(q.questionNumber);
                      return (
                        <li
                          key={`${q.questionId}-${q.questionNumber}`}
                          className="rounded-xl border border-slate-100 bg-white px-3 py-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="inline-flex rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-bold text-indigo-700">
                                  Q{q.questionNumber}
                                </span>
                                <Badge variant="outline" className={`text-[10px] ${meta.className}`}>
                                  <Icon className="mr-1 h-3 w-3" />
                                  {meta.label}
                                </Badge>
                                {q.subject ? (
                                  <span className="text-[10px] text-slate-500 capitalize">
                                    {q.subject}
                                  </span>
                                ) : null}
                                {q.timeTaken != null ? (
                                  <span className="text-[10px] text-slate-400">{q.timeTaken}s</span>
                                ) : null}
                              </div>
                              <p className="mt-1.5 text-sm text-slate-800 line-clamp-3">
                                {q.questionText}
                              </p>
                              {q.chapter ? (
                                <p className="mt-0.5 text-[11px] text-slate-500 truncate">
                                  {q.chapter}
                                </p>
                              ) : null}
                            </div>
                          </div>

                          {classStat ? (
                            <div className="mt-2.5 rounded-lg bg-slate-50 border border-slate-100 px-2.5 py-2">
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5">
                                Class on this question ({classStat.totalStudents} students)
                              </p>
                              <div className="grid grid-cols-3 gap-2 text-xs">
                                <span className="text-emerald-700">
                                  <span className="font-semibold">{classStat.correct}</span> correct
                                </span>
                                <span className="text-rose-600">
                                  <span className="font-semibold">{classStat.wrong}</span> wrong
                                </span>
                                <span className="text-slate-600">
                                  <span className="font-semibold">{classStat.unattempted}</span> blank
                                </span>
                              </div>
                              <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-slate-200 mt-2">
                                <div
                                  className="bg-emerald-500"
                                  style={{
                                    width: `${(classStat.correct / Math.max(1, classStat.totalStudents)) * 100}%`,
                                  }}
                                />
                                <div
                                  className="bg-rose-400"
                                  style={{
                                    width: `${(classStat.wrong / Math.max(1, classStat.totalStudents)) * 100}%`,
                                  }}
                                />
                                <div
                                  className="bg-slate-400/60"
                                  style={{
                                    width: `${(classStat.unattempted / Math.max(1, classStat.totalStudents)) * 100}%`,
                                  }}
                                />
                              </div>
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </section>
          ) : null}

          {tab === 'subjects' ? (
            <section>
              <div className="mb-2 rounded-md bg-slate-800 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-white">
                Subject diagnostic
              </div>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left">Subject</th>
                      <th className="px-3 py-2 text-left">Marks</th>
                      <th className="px-3 py-2 text-left">Student</th>
                      <th className="px-3 py-2 text-left">Class</th>
                      <th className="px-3 py-2 text-left">Gap</th>
                      <th className="px-3 py-2 text-left">Rank</th>
                      <th className="px-3 py-2 text-left">Position</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subjectDiagnostics.map((row) => (
                      <tr key={row.subjectKey} className="border-t">
                        <td className="px-3 py-2 font-medium">{row.label}</td>
                        <td className="px-3 py-2">{formatHandoffNumber(row.studentMarks)}</td>
                        <td className="px-3 py-2">{formatHandoffPct(row.studentAccuracy)}</td>
                        <td className="px-3 py-2">{formatHandoffPct(row.classAccuracy)}</td>
                        <td className="px-3 py-2">{formatHandoffPct(row.gap)}</td>
                        <td className="px-3 py-2">#{row.subjectRank}</td>
                        <td className="px-3 py-2">{row.position}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {tab === 'behaviour' ? (
            <section>
              <div className="mb-2 rounded-md bg-slate-800 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-white">
                Exam behaviour
              </div>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[520px] text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left">Metric</th>
                      <th className="px-3 py-2 text-left">Student</th>
                      <th className="px-3 py-2 text-left">Class</th>
                      <th className="px-3 py-2 text-left">Reading</th>
                    </tr>
                  </thead>
                  <tbody>
                    {behaviour.map((row) => (
                      <tr key={row.metric} className="border-t">
                        <td className="px-3 py-2 font-medium">{row.metric}</td>
                        <td className="px-3 py-2">{behaviourDisplay(row.student, row.metric)}</td>
                        <td className="px-3 py-2">
                          {behaviourDisplay(row.classValue, row.metric)}
                        </td>
                        <td className="px-3 py-2 text-slate-600">{row.reading}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {tab === 'actions' ? (
            <section>
              <div className="mb-2 rounded-md bg-slate-800 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-white">
                Priority action plan
              </div>
              <ol className="space-y-2">
                {actions.map((action) => (
                  <li
                    key={action.priority}
                    className="rounded-lg border border-amber-100 bg-amber-50/60 px-3 py-2"
                  >
                    <p className="font-semibold text-amber-900">
                      {action.priority}. {action.focus}
                    </p>
                    <p className="text-slate-700 mt-0.5">{action.action}</p>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default StudentExamHandoffModal;
