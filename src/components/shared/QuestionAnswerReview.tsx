import { CheckCircle2, CircleDashed, XCircle } from 'lucide-react';
import {
  examOptionsAsText,
  extractExamAnswerText,
  resolveAnswerAgainstOptions,
  resolveAnswerListForQuestion,
  type ExamAnswerOption,
} from '@/lib/exam-answer-resolve';

/**
 * One question of a student's attempt, as shown to the student, their teacher
 * and the school admin: status, question, every option with the student's pick
 * (red when wrong) and the correct one (green). Numeric / text questions show
 * "Answer: X · Correct: Y".
 */
export type QuestionAnswerReviewItem = {
  questionNumber: number;
  questionId?: string;
  status: 'correct' | 'wrong' | 'not_answered';
  questionText: string;
  assertionText?: string;
  reasonText?: string;
  questionType?: string;
  options?: ExamAnswerOption[];
  /** What the student submitted (option text, letter, index or a typed value). */
  selectedAnswer?: unknown;
  correctAnswer?: unknown;
  subject?: string;
  chapter?: string;
  timeTaken?: number;
};

type Props = {
  items: QuestionAnswerReviewItem[];
  /** "Student's answer" for teacher/admin, "Your answer" for the student. */
  answerLabel?: string;
  className?: string;
};

const STATUS_META = {
  correct: {
    label: 'Correct',
    card: 'border-emerald-200',
    badge: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    Icon: CheckCircle2,
  },
  wrong: {
    label: 'Wrong',
    card: 'border-rose-200',
    badge: 'bg-rose-50 text-rose-800 border-rose-200',
    Icon: XCircle,
  },
  not_answered: {
    label: 'Unattempted',
    card: 'border-slate-200',
    badge: 'bg-slate-100 text-slate-700 border-slate-200',
    Icon: CircleDashed,
  },
} as const;

function hasAnswer(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (Array.isArray(value)) return value.some((v) => extractExamAnswerText(v) !== '');
  return extractExamAnswerText(value) !== '';
}

/** Human-readable answer: option text when it resolves to an option, else the raw value. */
function displayAnswer(value: unknown, options: string[]): string {
  const list = Array.isArray(value) ? value : [value];
  return list
    .map((v) => resolveAnswerAgainstOptions(v, options))
    .filter(Boolean)
    .join(', ');
}

function QuestionAnswerCard({
  item,
  answerLabel,
}: {
  item: QuestionAnswerReviewItem;
  answerLabel: string;
}) {
  const meta = STATUS_META[item.status] || STATUS_META.not_answered;
  const options = examOptionsAsText(item.options);
  const question = { questionType: item.questionType, options: item.options };
  const correctTokens = hasAnswer(item.correctAnswer)
    ? resolveAnswerListForQuestion(question, item.correctAnswer)
    : [];
  const pickedTokens = hasAnswer(item.selectedAnswer)
    ? resolveAnswerListForQuestion(question, item.selectedAnswer)
    : [];
  const answered = item.status !== 'not_answered';
  const pickedText = hasAnswer(item.selectedAnswer) ? displayAnswer(item.selectedAnswer, options) : '';
  const correctText = hasAnswer(item.correctAnswer) ? displayAnswer(item.correctAnswer, options) : '';

  return (
    <li className={`rounded-xl border bg-white px-3 py-3 sm:px-4 ${meta.card}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-bold text-indigo-700">
          Q{item.questionNumber}
        </span>
        <span
          className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${meta.badge}`}
        >
          <meta.Icon className="h-3 w-3" />
          {meta.label}
        </span>
        {item.subject ? (
          <span className="text-[10px] text-slate-500 capitalize">{item.subject}</span>
        ) : null}
        {item.timeTaken != null && item.timeTaken > 0 ? (
          <span className="text-[10px] text-slate-400">{item.timeTaken}s</span>
        ) : null}
      </div>

      <p data-no-title-case className="mt-2 text-sm text-slate-900 whitespace-pre-wrap break-words">
        {item.questionText || `Question ${item.questionNumber}`}
      </p>
      {item.assertionText && item.assertionText !== item.questionText ? (
        <p data-no-title-case className="mt-1 text-xs text-slate-700">
          <span className="font-semibold text-slate-500">Assertion: </span>
          {item.assertionText}
        </p>
      ) : null}
      {item.reasonText ? (
        <p data-no-title-case className="mt-1 text-xs text-slate-700">
          <span className="font-semibold text-slate-500">Reason: </span>
          {item.reasonText}
        </p>
      ) : null}
      {item.chapter ? (
        <p className="mt-0.5 text-[11px] text-slate-500 truncate">{item.chapter}</p>
      ) : null}

      {options.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {options.map((optionText, index) => {
            const norm = optionText.trim().toLowerCase();
            const isRight = correctTokens.includes(norm);
            const isPicked = pickedTokens.includes(norm);
            let cls = 'border-slate-200 bg-slate-50 text-slate-700';
            if (isRight) cls = 'border-emerald-400 bg-emerald-50 text-emerald-900 font-medium';
            else if (isPicked) cls = 'border-rose-400 bg-rose-50 text-rose-900 font-medium';
            return (
              <li
                key={`${item.questionId || item.questionNumber}-${index}`}
                className={`flex items-center gap-2 rounded-lg border-2 px-2.5 py-1.5 text-xs sm:text-sm ${cls}`}
              >
                <span className="w-5 shrink-0 text-xs font-semibold opacity-70">
                  {String.fromCharCode(65 + index)}.
                </span>
                <span data-no-title-case className="flex-1 min-w-0 break-words">
                  {optionText}
                </span>
                {isPicked ? (
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                      isRight ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {answerLabel}
                  </span>
                ) : null}
                {isRight ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : null}
                {isPicked && !isRight ? <XCircle className="h-4 w-4 shrink-0 text-rose-600" /> : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      <p className="mt-2.5 text-xs text-slate-700">
        <span className="font-semibold">{answerLabel}: </span>
        {answered ? (
          <span data-no-title-case className={item.status === 'wrong' ? 'text-rose-700' : 'text-emerald-700'}>
            {pickedText || 'Not recorded'}
          </span>
        ) : (
          <span className="text-slate-500">Not attempted</span>
        )}
        <span className="mx-1.5 text-slate-300">·</span>
        <span className="font-semibold">Correct: </span>
        <span data-no-title-case className="text-emerald-700">{correctText || '—'}</span>
      </p>
    </li>
  );
}

export function QuestionAnswerReview({ items, answerLabel = "Student's answer", className }: Props) {
  if (!items.length) return null;
  return (
    <ul className={`space-y-2.5 ${className || ''}`}>
      {items.map((item) => (
        <QuestionAnswerCard
          key={`${item.questionId || 'q'}-${item.questionNumber}`}
          item={item}
          answerLabel={answerLabel}
        />
      ))}
    </ul>
  );
}

export default QuestionAnswerReview;
