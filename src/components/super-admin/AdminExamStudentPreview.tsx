import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle,
  Clock,
  Edit,
  Eye,
  EyeOff,
  Flag,
  ImagePlus,
  Maximize2,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { AuthenticatedUploadImage } from '@/components/AuthenticatedUploadImage';
import ExamMathText from '@/components/exam/ExamMathText';
import { MatchColumnsTable } from '@/components/exam/MatchColumnsTable';
import { resolveAnswerAgainstOptions } from '@/lib/exam-answer-resolve';
import {
  normalizeAndFormatExamDisplayText,
  resolveAssertionReasonDisplay,
} from '@/lib/exam-text-normalize';

const SUBJECT_SECTION_LABELS: Record<string, string> = {
  maths: 'Maths',
  physics: 'Physics',
  chemistry: 'Chemistry',
  biology: 'Biology',
  science: 'Science',
  english: 'English',
  hindi: 'Hindi',
  social_science: 'Social Science',
};

const DEFAULT_AR_DIRECTIONS = `Directions: Each question below consists of an Assertion (A) and a Reason (R). Choose the correct option:
(a) Both A and R are true, and R is the correct explanation of A.
(b) Both A and R are true, but R is not the correct explanation of A.
(c) A is true, but R is false.
(d) A is false, but R is true.`;

export type AdminPreviewQuestion = {
  _id?: string;
  id?: string;
  questionText?: string;
  questionImage?: string;
  questionType?: string;
  options?: Array<string | { text?: string; isCorrect?: boolean; _id?: string }>;
  correctAnswer?: unknown;
  marks?: number;
  negativeMarks?: number;
  explanation?: string;
  subject?: string;
  displayOrder?: number;
  sectionHeading?: string;
  sharedMatterKind?: string;
  sharedMatterText?: string;
  passageText?: string;
  assertionText?: string;
  reasonText?: string;
  matchColumnI?: Array<{ key?: string; text?: string }>;
  matchColumnII?: Array<{ key?: string; text?: string }>;
};

type FigurePoolItem = { url: string; name?: string; order?: number; key?: string };

type Props = {
  open: boolean;
  examTitle: string;
  durationMinutes?: number;
  questions: AdminPreviewQuestion[];
  initialIndex?: number;
  onClose: () => void;
  onIndexChange?: (index: number) => void;
  /** When true, show the inline editor instead of the read view for the current Q */
  isEditingCurrent?: boolean;
  /** Full InlineQuestionEditor (or similar) from the parent */
  editorSlot?: ReactNode;
  /** Free paper figures for assign-from-strip */
  figurePool?: FigurePoolItem[];
  figureAssignActive?: boolean;
  onEditQuestion?: (question: AdminPreviewQuestion, index: number) => void;
  onCancelEdit?: () => void;
  onSelectPhoto?: (question: AdminPreviewQuestion) => void;
  onCancelSelectPhoto?: () => void;
  onAssignFigure?: (questionId: string, imageUrl: string) => void;
  onRemoveFigure?: (question: AdminPreviewQuestion) => void;
};

function qid(q: AdminPreviewQuestion, fallback: number): string {
  return String(q?._id || q?.id || `preview-${fallback}`);
}

function optionRaw(
  opt: string | { text?: string; isCorrect?: boolean; _id?: string } | undefined,
): string {
  if (opt == null) return '';
  if (typeof opt === 'string') return opt;
  return String(opt.text || opt._id || '');
}

function resolveSectionHeading(q?: AdminPreviewQuestion | null): string {
  if (!q) return '';
  const custom = String(q.sectionHeading || '').trim();
  if (custom) return custom;
  const key = String(q.subject || '').trim().toLowerCase();
  return SUBJECT_SECTION_LABELS[key] || (key ? key.charAt(0).toUpperCase() + key.slice(1) : '');
}

function looksLikeAr(q: AdminPreviewQuestion): boolean {
  const t = String(q.questionType || '').toLowerCase();
  if (t === 'assertion_reason') return true;
  if (String(q.assertionText || '').trim() && String(q.reasonText || '').trim()) return true;
  const stem = String(q.questionText || '');
  return /\bA\s*[:：]\s*\S/.test(stem) && /\bR\s*[:：]\s*\S/.test(stem);
}

function matterForQuestion(q: AdminPreviewQuestion): string {
  if (looksLikeAr(q)) {
    const raw = String(q.sharedMatterText || '').trim();
    const ok =
      /correct explanation of A/i.test(raw) ||
      (/Both A and R are true/i.test(raw) && /A is false,\s*but R is true/i.test(raw));
    return ok ? raw : DEFAULT_AR_DIRECTIONS;
  }
  return String(q.sharedMatterText || q.passageText || '').trim();
}

function normalizeCorrectTexts(q: AdminPreviewQuestion): string[] {
  const raw = q.correctAnswer;
  const opts = (q.options || []).map(optionRaw).filter(Boolean);
  const toText = (v: unknown): string => {
    if (v == null) return '';
    if (typeof v === 'object' && v && 'text' in (v as object)) {
      return resolveAnswerAgainstOptions((v as { text?: string }).text, opts);
    }
    return resolveAnswerAgainstOptions(v, opts);
  };
  if (Array.isArray(raw)) return raw.map(toText).filter(Boolean);
  const one = toText(raw);
  return one ? [one] : [];
}

function isOptionCorrect(q: AdminPreviewQuestion, optionValue: string): boolean {
  const correct = normalizeCorrectTexts(q).map((t) => t.toLowerCase());
  const v = String(optionValue || '').trim().toLowerCase();
  if (!v || !correct.length) return false;
  return correct.includes(v);
}

function formatDurationLabel(minutes?: number): string {
  const m = Math.max(0, Number(minutes) || 0);
  if (!m) return '—:—';
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return `${String(h).padStart(2, '0')}:${String(rem).padStart(2, '0')}:00`;
}

/**
 * Full-page Super Admin workspace: student exam layout + Edit / figure tools.
 * Rendered in a portal above the exam dialog so clicks and scroll work.
 */
export function AdminExamStudentPreview({
  open,
  examTitle,
  durationMinutes,
  questions,
  initialIndex = 0,
  onClose,
  onIndexChange,
  isEditingCurrent = false,
  editorSlot,
  figurePool = [],
  figureAssignActive = false,
  onEditQuestion,
  onCancelEdit,
  onSelectPhoto,
  onCancelSelectPhoto,
  onAssignFigure,
  onRemoveFigure,
}: Props) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [flagged, setFlagged] = useState<Set<number>>(new Set());
  const [showKey, setShowKey] = useState(true);

  useEffect(() => {
    if (!open) return;
    const start = Math.min(Math.max(0, initialIndex), Math.max(0, questions.length - 1));
    setIndex(start);
    setAnswers({});
    setFlagged(new Set());
    setShowKey(true);
  }, [open, initialIndex, questions]);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    const prevPointer = document.body.style.pointerEvents;
    document.body.style.overflow = 'hidden';
    // Radix dialog may leave body at pointer-events:none — restore for this overlay
    document.body.style.pointerEvents = 'auto';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (isEditingCurrent) onCancelEdit?.();
        else onClose();
      } else if (!isEditingCurrent && (e.key === 'ArrowRight' || e.key === 'ArrowDown')) {
        e.preventDefault();
        goTo(Math.min(index + 1, questions.length - 1));
      } else if (!isEditingCurrent && (e.key === 'ArrowLeft' || e.key === 'ArrowUp')) {
        e.preventDefault();
        goTo(Math.max(index - 1, 0));
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.pointerEvents = prevPointer;
      window.removeEventListener('keydown', onKey, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, index, questions.length, onClose, isEditingCurrent, onCancelEdit]);

  const goTo = (next: number) => {
    const clamped = Math.min(Math.max(0, next), Math.max(0, questions.length - 1));
    if (isEditingCurrent && clamped !== index) onCancelEdit?.();
    setIndex(clamped);
    onIndexChange?.(clamped);
  };

  const current = questions[index];
  const currentId = current ? qid(current, index) : '';
  const progress = questions.length ? ((index + 1) / questions.length) * 100 : 0;
  const arDisplay = useMemo(
    () => resolveAssertionReasonDisplay(current || {}),
    [current],
  );
  const matterText = current ? matterForQuestion(current) : '';
  const showImage = Boolean(current?.questionImage) && !looksLikeAr(current || {});
  const type = String(current?.questionType || 'mcq').toLowerCase();
  const isChoice =
    type === 'mcq' ||
    type === 'assertion_reason' ||
    type === 'match_following' ||
    looksLikeAr(current || {});
  const isMultiple = type === 'multiple';
  const isInteger = type === 'integer';
  const answeredCount = questions.filter((q, i) => {
    const raw = answers[qid(q, i)];
    if (raw == null) return false;
    if (Array.isArray(raw)) return raw.length > 0;
    return String(raw).trim() !== '';
  }).length;

  if (!open || typeof document === 'undefined') return null;

  const fmt = (v: unknown) =>
    normalizeAndFormatExamDisplayText(v, current?.subject);

  const heading = resolveSectionHeading(current);
  const prevHeading = resolveSectionHeading(questions[index - 1]);

  const body = (
    <div
      className="fixed inset-0 z-[400] flex flex-col bg-gray-50 pointer-events-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Fullscreen exam editor"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="sticky top-0 z-30 shrink-0 border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-800">
                Super Admin · Fullscreen editor
              </p>
              <h2 className="truncate text-base font-semibold text-gray-900 sm:text-lg">
                {examTitle || 'Exam'}
              </h2>
              <p className="text-xs text-stone-500">
                Student paper layout — Edit text, options, and figures without leaving this view.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700 sm:text-sm">
                <Clock className="h-3.5 w-3.5" />
                <span className="font-mono">{formatDurationLabel(durationMinutes)}</span>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8"
                onClick={() => setShowKey((v) => !v)}
              >
                {showKey ? <EyeOff className="mr-1 h-3.5 w-3.5" /> : <Eye className="mr-1 h-3.5 w-3.5" />}
                {showKey ? 'Hide key' : 'Show key'}
              </Button>
              <Button type="button" size="sm" variant="outline" className="h-8" onClick={onClose}>
                <X className="mr-1 h-3.5 w-3.5" />
                Exit fullscreen
              </Button>
            </div>
          </div>
          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between text-xs text-gray-600 sm:text-sm">
              <span>
                Question {questions.length ? index + 1 : 0} of {questions.length}
              </span>
              <span>{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        </div>
      </div>

      {figurePool.length > 0 ? (
        <div
          className={`shrink-0 border-b px-4 py-2 sm:px-6 lg:px-8 ${
            figureAssignActive
              ? 'border-sky-300 bg-sky-50'
              : 'border-violet-200 bg-violet-50/70'
          }`}
        >
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-violet-950">
              Paper figures ({figurePool.length} free)
              {figureAssignActive
                ? ' — click a figure to attach it to this question'
                : ' — click Select photo on the question first'}
            </p>
            {figureAssignActive ? (
              <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={onCancelSelectPhoto}>
                Cancel pick
              </Button>
            ) : null}
          </div>
          <div className="mx-auto mt-2 max-w-7xl overflow-x-auto pb-1">
            <div className="flex w-max gap-2">
              {figurePool.map((img, i) => (
                <button
                  key={img.key || img.url || i}
                  type="button"
                  className={`shrink-0 rounded-md border bg-white p-0.5 ${
                    figureAssignActive
                      ? 'cursor-pointer border-sky-300 hover:ring-2 hover:ring-sky-200'
                      : 'border-slate-200 opacity-80'
                  }`}
                  onClick={() => {
                    if (!figureAssignActive || !current) return;
                    const id = qid(current, index);
                    if (id) onAssignFigure?.(id, img.url);
                  }}
                >
                  <AuthenticatedUploadImage
                    src={img.url}
                    alt={img.name || `Figure ${i + 1}`}
                    wrapperClassName="h-14 w-20 p-0"
                    className="h-[52px] w-full object-contain"
                    fallbackLabel="—"
                  />
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
          {questions.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-stone-500">
                No questions to preview yet.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-4 lg:gap-6">
              <div className="order-2 lg:order-1 lg:col-span-1">
                <Card className="lg:sticky lg:top-4">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-sm font-semibold sm:text-base">
                      <BookOpen className="h-4 w-4 text-purple-600" />
                      Questions
                    </CardTitle>
                    <p className="mt-1 text-xs text-gray-500">
                      {answeredCount} of {questions.length} tried · click a number to jump
                    </p>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="rounded-xl border border-gray-200 bg-gradient-to-br from-gray-50 to-purple-50/30 p-3">
                      <div className="grid max-h-[50vh] grid-cols-5 gap-2 overflow-y-auto sm:grid-cols-6 lg:grid-cols-5">
                        {questions.map((q, i) => {
                          const raw = answers[qid(q, i)];
                          const isAnswered =
                            raw != null &&
                            (Array.isArray(raw) ? raw.length > 0 : String(raw).trim() !== '');
                          const isFlagged = flagged.has(i);
                          const isCurrent = i === index;
                          return (
                            <button
                              key={qid(q, i)}
                              type="button"
                              onClick={() => goTo(i)}
                              title={`Question ${i + 1}`}
                              className={`relative flex aspect-square w-full max-h-11 items-center justify-center rounded-xl border-2 text-xs font-bold transition sm:text-sm ${
                                isCurrent
                                  ? 'z-10 scale-110 border-purple-400 bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 text-white shadow-lg ring-2 ring-purple-300'
                                  : isFlagged
                                    ? 'border-yellow-400 bg-gradient-to-br from-yellow-300 to-yellow-400 text-yellow-900'
                                    : isAnswered
                                      ? 'border-emerald-400 bg-gradient-to-br from-emerald-500 to-teal-600 text-white'
                                      : 'border-gray-300 bg-white text-gray-600 hover:border-indigo-400 hover:bg-indigo-50'
                              }`}
                            >
                              {Number(q.displayOrder) > 0 ? Number(q.displayOrder) : i + 1}
                              {isAnswered && !isFlagged ? (
                                <CheckCircle className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-600 text-white" />
                              ) : null}
                              {isFlagged ? (
                                <Flag
                                  className="absolute -right-1 -top-1 h-3 w-3 text-amber-800"
                                  fill="currentColor"
                                />
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="order-1 lg:order-2 lg:col-span-3">
                {/* Super Admin actions */}
                <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                  <span className="rounded bg-amber-200/90 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-950">
                    Super Admin
                  </span>
                  <Badge variant="outline" className="font-semibold">
                    Q{Number(current?.displayOrder) > 0 ? Number(current?.displayOrder) : index + 1}
                  </Badge>
                  {isEditingCurrent ? (
                    <Button type="button" size="sm" variant="outline" className="h-8" onClick={onCancelEdit}>
                      Cancel edit
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 bg-sky-600 text-white hover:bg-sky-700"
                      onClick={() => current && onEditQuestion?.(current, index)}
                    >
                      <Edit className="mr-1 h-3.5 w-3.5" />
                      Edit question
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className={`h-8 ${figureAssignActive ? 'border-sky-500 bg-sky-50 text-sky-800' : ''}`}
                    disabled={isEditingCurrent || !current}
                    onClick={() => {
                      if (figureAssignActive) onCancelSelectPhoto?.();
                      else if (current) onSelectPhoto?.(current);
                    }}
                  >
                    <ImagePlus className="mr-1 h-3.5 w-3.5" />
                    {figureAssignActive ? 'Selecting…' : 'Select photo'}
                  </Button>
                  {current?.questionImage ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 text-red-700"
                      disabled={isEditingCurrent}
                      onClick={() => current && onRemoveFigure?.(current)}
                    >
                      Remove figure
                    </Button>
                  ) : null}
                </div>

                {isEditingCurrent && editorSlot ? (
                  <div className="mb-4">{editorSlot}</div>
                ) : (
                <Card className="border-0 bg-white shadow-lg">
                  <CardContent className="p-4 sm:p-6">
                    {heading && heading !== prevHeading ? (
                      <div className="mb-4 rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white">
                        {heading}
                      </div>
                    ) : null}

                    <div className="mb-4 flex items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className={`capitalize text-xs ${
                            current?.subject === 'maths'
                              ? 'bg-blue-100 text-blue-700'
                              : current?.subject === 'physics'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-purple-100 text-purple-700'
                          }`}
                        >
                          {current?.subject || 'Unknown'}
                        </Badge>
                        <Badge variant="secondary" className="text-xs">
                          {current?.marks || 0} marks
                        </Badge>
                        <Badge variant="outline" className="text-xs uppercase">
                          {type || 'mcq'}
                        </Badge>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className={`p-2 ${flagged.has(index) ? 'bg-yellow-100 text-yellow-600' : 'text-gray-400'}`}
                        onClick={() =>
                          setFlagged((prev) => {
                            const next = new Set(prev);
                            if (next.has(index)) next.delete(index);
                            else next.add(index);
                            return next;
                          })
                        }
                      >
                        <Flag className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="mb-6 flex items-start gap-3">
                      <span className="shrink-0 text-base font-bold text-gray-900 sm:text-lg">
                        Q
                        {Number(current?.displayOrder) > 0
                          ? Number(current?.displayOrder)
                          : index + 1}
                        .
                      </span>
                      <div className="min-w-0 flex-1">
                        {matterText ? (
                          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                              {looksLikeAr(current)
                                ? 'Assertion–Reason directions'
                                : current?.sharedMatterKind === 'match_following'
                                  ? 'Match the Following'
                                  : current?.sharedMatterKind === 'case'
                                    ? 'Case / Passage'
                                    : 'Shared matter'}
                            </div>
                            <p className="whitespace-pre-wrap leading-relaxed">
                              <ExamMathText text={fmt(matterText)} />
                            </p>
                          </div>
                        ) : null}

                        {(arDisplay.assertion || arDisplay.reason) && (
                          <div className="mb-4 space-y-2 rounded-lg border border-violet-100 bg-violet-50/70 p-3 text-sm text-gray-900">
                            {arDisplay.assertion ? (
                              <p>
                                <span className="font-semibold">A:</span>{' '}
                                <ExamMathText text={fmt(arDisplay.assertion)} />
                              </p>
                            ) : null}
                            {arDisplay.reason ? (
                              <p>
                                <span className="font-semibold">R:</span>{' '}
                                <ExamMathText text={fmt(arDisplay.reason)} />
                              </p>
                            ) : null}
                          </div>
                        )}

                        {((Array.isArray(current?.matchColumnI) && current.matchColumnI.length > 0) ||
                          (Array.isArray(current?.matchColumnII) &&
                            current.matchColumnII.length > 0)) &&
                          !showImage && (
                            <MatchColumnsTable
                              columnI={current?.matchColumnI}
                              columnII={current?.matchColumnII}
                              formatText={(t) => fmt(t)}
                            />
                          )}

                        {showImage ? (
                          <AuthenticatedUploadImage
                            src={current?.questionImage}
                            alt="Question figure"
                            wrapperClassName="mb-4 bg-gray-50 p-2"
                            className="rounded-lg"
                          />
                        ) : null}

                        {arDisplay.showQuestionText && arDisplay.questionText ? (
                          <p className="mb-4 text-sm leading-relaxed text-gray-900 sm:text-base">
                            <ExamMathText text={fmt(arDisplay.questionText)} />
                          </p>
                        ) : null}
                      </div>
                    </div>

                    {isChoice && Array.isArray(current?.options) && current.options.length > 0 ? (
                      <RadioGroup
                        value={
                          answers[currentId] != null && String(answers[currentId]).trim() !== ''
                            ? String(answers[currentId])
                            : undefined
                        }
                        onValueChange={(value) =>
                          setAnswers((prev) => ({ ...prev, [currentId]: value }))
                        }
                        className="mt-2 space-y-3"
                      >
                        {current.options.map((opt, oi) => {
                          const value = optionRaw(opt);
                          const correct = showKey && isOptionCorrect(current, value);
                          const selected = String(answers[currentId] || '') === value;
                          return (
                            <div
                              key={`${currentId}-opt-${oi}`}
                              className={`flex items-center space-x-3 rounded-lg border p-3 transition ${
                                correct
                                  ? 'border-emerald-400 bg-emerald-50 ring-2 ring-emerald-200'
                                  : selected
                                    ? 'border-blue-400 bg-blue-50'
                                    : 'border-gray-200 hover:bg-gray-50'
                              }`}
                            >
                              <RadioGroupItem value={value} id={`preview-${currentId}-${oi}`} />
                              <Label
                                htmlFor={`preview-${currentId}-${oi}`}
                                className="flex-1 cursor-pointer text-xs text-gray-700 sm:text-sm"
                              >
                                <ExamMathText text={fmt(value)} />
                                {correct ? (
                                  <span className="ml-2 text-[10px] font-semibold uppercase text-emerald-700">
                                    Correct
                                  </span>
                                ) : null}
                              </Label>
                            </div>
                          );
                        })}
                      </RadioGroup>
                    ) : null}

                    {isMultiple && Array.isArray(current?.options) ? (
                      <div className="mt-2 space-y-3">
                        {current.options.map((opt, oi) => {
                          const value = optionRaw(opt);
                          const selected = Array.isArray(answers[currentId])
                            ? (answers[currentId] as string[]).includes(value)
                            : false;
                          const correct = showKey && isOptionCorrect(current, value);
                          return (
                            <div
                              key={`${currentId}-msq-${oi}`}
                              className={`flex items-center space-x-3 rounded-lg border p-3 ${
                                correct
                                  ? 'border-emerald-400 bg-emerald-50'
                                  : selected
                                    ? 'border-green-400 bg-green-50'
                                    : 'border-gray-200'
                              }`}
                            >
                              <Checkbox
                                id={`preview-msq-${currentId}-${oi}`}
                                checked={selected}
                                onCheckedChange={(checked) => {
                                  setAnswers((prev) => {
                                    const cur = Array.isArray(prev[currentId])
                                      ? [...(prev[currentId] as string[])]
                                      : [];
                                    const next = checked
                                      ? [...cur, value]
                                      : cur.filter((x) => x !== value);
                                    const copy = { ...prev };
                                    if (next.length === 0) delete copy[currentId];
                                    else copy[currentId] = next;
                                    return copy;
                                  });
                                }}
                              />
                              <Label
                                htmlFor={`preview-msq-${currentId}-${oi}`}
                                className="flex-1 cursor-pointer text-xs sm:text-sm"
                              >
                                <ExamMathText text={fmt(value)} />
                                {correct ? (
                                  <span className="ml-2 text-[10px] font-semibold uppercase text-emerald-700">
                                    Correct
                                  </span>
                                ) : null}
                              </Label>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}

                    {isInteger ? (
                      <div className="mt-4 max-w-xs">
                        <Label className="mb-2 block text-xs font-medium text-gray-700 sm:text-sm">
                          Enter your answer:
                        </Label>
                        <Input
                          value={answers[currentId] != null ? String(answers[currentId]) : ''}
                          onChange={(e) =>
                            setAnswers((prev) => ({ ...prev, [currentId]: e.target.value }))
                          }
                          className="bg-white"
                          placeholder="Integer answer"
                        />
                        {showKey && normalizeCorrectTexts(current).length > 0 ? (
                          <p className="mt-2 text-xs text-emerald-700">
                            Correct: {normalizeCorrectTexts(current).join(', ')}
                          </p>
                        ) : null}
                      </div>
                    ) : null}

                    {showKey && current?.explanation ? (
                      <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-950 sm:text-sm">
                        <span className="font-semibold">Explanation: </span>
                        <ExamMathText text={fmt(current.explanation)} />
                      </div>
                    ) : null}

                    <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-4">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={index <= 0}
                        onClick={() => goTo(index - 1)}
                      >
                        <ArrowLeft className="mr-1 h-4 w-4" />
                        Previous
                      </Button>
                      <p className="text-[11px] text-stone-500">← → jump · Esc exit</p>
                      <Button
                        type="button"
                        className="bg-indigo-600 text-white hover:bg-indigo-700"
                        disabled={index >= questions.length - 1}
                        onClick={() => goTo(index + 1)}
                      >
                        Next
                        <ArrowRight className="ml-1 h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(body, document.body);
}

export function AdminExamPreviewTriggerButton({
  onClick,
  label = 'Fullscreen editor',
  className,
}: {
  onClick: () => void;
  label?: string;
  className?: string;
}) {
  return (
    <Button type="button" size="sm" variant="outline" className={className} onClick={onClick}>
      <Maximize2 className="mr-1.5 h-3.5 w-3.5" />
      {label}
    </Button>
  );
}
