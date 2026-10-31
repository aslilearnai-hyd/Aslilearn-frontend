import { useEffect, useState, type ReactNode } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, Search, Trash2, Plus, ArrowLeft } from 'lucide-react';
import { API_BASE_URL } from '@/lib/api-config';
import { getAuthToken } from '@/lib/auth-utils';
import { useToast } from '@/hooks/use-toast';
import ExamMathText from '@/components/exam/ExamMathText';

export interface QuizQuestionRow {
  _id: string;
  sourceId?: string;
  questionText: string;
  options: Array<{ text: string; isCorrect: boolean }>;
  correctAnswer?: unknown;
  explanation?: string;
  difficulty?: string;
  classNumber?: string;
  category?: string;
  subject?: { _id: string; name: string } | string;
  bankSource?: string;
}

export type QuizQuestionsTarget =
  | { kind: 'quiz'; quizId: string; title: string; classNumber?: string }
  | { kind: 'bank'; classNumber: number };

const BANK_CLASSES = ['6', '7', '8', '9', '10'];
const PAGE_SIZE = 25;

function authHeaders(json = false): HeadersInit {
  return {
    Authorization: `Bearer ${getAuthToken()}`,
    ...(json ? { 'Content-Type': 'application/json' } : {}),
  };
}

function QuestionCard({
  q,
  index,
  action,
}: {
  q: QuizQuestionRow;
  index: number;
  action?: ReactNode;
}) {
  const correctText = typeof q.correctAnswer === 'string' ? q.correctAnswer : '';
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-start gap-2">
        {action}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="text-sm font-medium text-slate-900">
              {index}. <ExamMathText text={q.questionText} />
            </p>
            <div className="flex shrink-0 flex-wrap gap-1">
              {q.sourceId ? (
                <Badge variant="outline" className="border-slate-200 text-[10px] text-slate-600">
                  {q.sourceId}
                </Badge>
              ) : null}
              {q.category ? (
                <Badge variant="outline" className="border-teal-200 text-[10px] text-teal-800">
                  {q.category}
                </Badge>
              ) : null}
              {q.difficulty ? (
                <Badge variant="secondary" className="text-[10px] capitalize">
                  {q.difficulty}
                </Badge>
              ) : null}
            </div>
          </div>
          <ol className="mt-2 grid gap-1 sm:grid-cols-2">
            {(q.options || []).map((opt, i) => {
              const correct = opt.isCorrect || (correctText && opt.text === correctText);
              return (
                <li
                  key={i}
                  className={`rounded-md px-2 py-1 text-xs ${
                    correct ? 'border border-emerald-300 bg-emerald-50 text-emerald-900' : 'bg-slate-50 text-slate-700'
                  }`}
                >
                  <span className="mr-1 font-semibold">{String.fromCharCode(65 + i)}.</span>
                  <ExamMathText text={opt.text} />
                </li>
              );
            })}
          </ol>
          {q.explanation ? <p className="mt-2 text-xs text-slate-500"><ExamMathText text={q.explanation} /></p> : null}
        </div>
      </div>
    </div>
  );
}

/** Paginated daily-quiz bank, optionally with checkboxes for picking into a quiz. */
function BankBrowser({
  initialClass,
  lockClass,
  selectable,
  excludeIds,
  onAdd,
}: {
  initialClass: string;
  lockClass?: boolean;
  selectable?: boolean;
  excludeIds?: Set<string>;
  onAdd?: (ids: string[]) => Promise<void>;
}) {
  const [classNumber, setClassNumber] = useState(BANK_CLASSES.includes(initialClass) ? initialClass : '6');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('__all__');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<QuizQuestionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams({
          classNumber,
          page: String(page),
          limit: String(PAGE_SIZE),
        });
        if (query) params.set('search', query);
        if (category !== '__all__') params.set('category', category);
        const res = await fetch(
          `${API_BASE_URL}/api/super-admin/iq-rank-activities/bank-questions?${params.toString()}`,
          { headers: authHeaders() },
        );
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) throw new Error(json?.message || 'Could not load the question bank');
        if (cancelled) return;
        setRows(Array.isArray(json.data) ? json.data : []);
        setTotal(Number(json.total) || 0);
        setCategories(Array.isArray(json.categories) ? json.categories : []);
      } catch (e) {
        if (!cancelled) {
          setRows([]);
          setTotal(0);
          setError(e instanceof Error ? e.message : 'Could not load the question bank');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [classNumber, query, category, page]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        {!lockClass ? (
          <Select
            value={classNumber}
            onValueChange={(v) => {
              setClassNumber(v);
              setCategory('__all__');
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BANK_CLASSES.map((c) => (
                <SelectItem key={c} value={c}>
                  Class {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        <Select
          value={category}
          onValueChange={(v) => {
            setCategory(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <form
          className="flex min-w-[200px] flex-1 gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(search.trim());
            setPage(1);
          }}
        >
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search question text or Q_ID" />
          <Button type="submit" variant="outline" size="icon" aria-label="Search">
            <Search className="h-4 w-4" />
          </Button>
        </form>
      </div>

      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          {total} question{total === 1 ? '' : 's'} in the Class {classNumber} bank
        </span>
        {selectable && onAdd ? (
          <Button
            size="sm"
            disabled={selected.size === 0 || adding}
            onClick={async () => {
              setAdding(true);
              try {
                await onAdd([...selected]);
                setSelected(new Set());
              } finally {
                setAdding(false);
              }
            }}
            className="bg-teal-600 text-white hover:bg-teal-700"
          >
            {adding ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1 h-3.5 w-3.5" />}
            Add {selected.size || ''} to quiz
          </Button>
        ) : null}
      </div>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : error ? (
        <p className="py-6 text-center text-sm text-red-600">{error}</p>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">
          No bank questions for Class {classNumber}
          {query || category !== '__all__' ? ' match these filters' : ' yet — use “Upload question bank”'}.
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((q, i) => {
            const already = excludeIds?.has(String(q._id));
            return (
              <QuestionCard
                key={q._id}
                q={q}
                index={(page - 1) * PAGE_SIZE + i + 1}
                action={
                  selectable ? (
                    <Checkbox
                      className="mt-0.5"
                      disabled={already}
                      checked={already || selected.has(String(q._id))}
                      onCheckedChange={(v) => {
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (v === true) next.add(String(q._id));
                          else next.delete(String(q._id));
                          return next;
                        });
                      }}
                      aria-label="Select question"
                    />
                  ) : undefined
                }
              />
            );
          })}
        </div>
      )}

      {pages > 1 ? (
        <div className="flex items-center justify-end gap-2 text-xs text-slate-600">
          <Button size="sm" variant="outline" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span>
            Page {page} of {pages}
          </span>
          <Button size="sm" variant="outline" disabled={page >= pages || loading} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export default function QuizQuestionsDialog({
  target,
  onOpenChange,
  onChanged,
}: {
  target: QuizQuestionsTarget | null;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
}) {
  const { toast } = useToast();
  const [questions, setQuestions] = useState<QuizQuestionRow[]>([]);
  const [meta, setMeta] = useState<{ source: string; isBankQuiz: boolean; missingIds: number; dailyPickCount?: number }>({
    source: 'quiz',
    isBankQuiz: false,
    missingIds: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [view, setView] = useState<'list' | 'bank'>('list');
  const [busyId, setBusyId] = useState('');

  const quizId = target?.kind === 'quiz' ? target.quizId : '';
  const quizClass =
    target?.kind === 'quiz'
      ? String(target.classNumber || '').match(/\d+/)?.[0] || ''
      : String(target?.classNumber ?? '');

  const loadQuiz = async (id: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/super-admin/iq-rank-activities/${id}/questions`, {
        headers: authHeaders(),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || 'Could not load quiz questions');
      setQuestions(Array.isArray(json.data) ? json.data : []);
      setMeta({
        source: String(json.source || 'quiz'),
        isBankQuiz: Boolean(json.isBankQuiz),
        missingIds: Number(json.missingIds) || 0,
        dailyPickCount: Number(json.quiz?.dailyPickCount) || undefined,
      });
    } catch (e) {
      setQuestions([]);
      setError(e instanceof Error ? e.message : 'Could not load quiz questions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setView(target?.kind === 'bank' ? 'bank' : 'list');
    if (quizId) void loadQuiz(quizId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizId, target?.kind]);

  const updateQuestions = async (body: { add?: string[]; remove?: string[] }) => {
    const res = await fetch(`${API_BASE_URL}/api/super-admin/iq-rank-activities/${quizId}/questions`, {
      method: 'PUT',
      headers: authHeaders(true),
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) throw new Error(json?.message || 'Could not update quiz questions');
    await loadQuiz(quizId);
    onChanged?.();
    return json.data;
  };

  const ownIds = new Set(meta.source === 'quiz' ? questions.map((q) => String(q._id)) : []);

  return (
    <Dialog open={Boolean(target)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {target?.kind === 'bank' ? `Question bank · Class ${target.classNumber}` : target?.title || 'Quiz questions'}
          </DialogTitle>
          <DialogDescription>
            {target?.kind === 'bank'
              ? 'Daily quiz questions uploaded for this class. Each learner gets a fresh set from here every day.'
              : meta.isBankQuiz
                ? `Daily quiz: each learner gets ${meta.dailyPickCount || 5} questions picked from the Class ${quizClass || '—'} bank every day.`
                : 'Questions learners get when they open this quiz.'}
          </DialogDescription>
        </DialogHeader>

        {target?.kind === 'bank' ? (
          <BankBrowser initialClass={String(target.classNumber)} />
        ) : view === 'bank' ? (
          <div className="space-y-3">
            <Button variant="ghost" size="sm" onClick={() => setView('list')}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              Back to quiz questions
            </Button>
            <BankBrowser
              initialClass={quizClass}
              selectable={!meta.isBankQuiz}
              excludeIds={ownIds}
              onAdd={async (ids) => {
                try {
                  const keep = meta.source === 'subject' ? questions.map((q) => String(q._id)) : [];
                  const data = await updateQuestions({ add: [...keep, ...ids] });
                  toast({ title: 'Questions added', description: `This quiz now has ${data?.totalQuestions ?? ''} questions.` });
                  setView('list');
                } catch (e) {
                  toast({
                    title: 'Could not add questions',
                    description: e instanceof Error ? e.message : '',
                    variant: 'destructive',
                  });
                }
              }}
            />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-slate-500">
                {meta.isBankQuiz
                  ? 'Questions are picked automatically from the bank.'
                  : `${questions.length} question${questions.length === 1 ? '' : 's'}${
                      meta.source === 'subject' ? ' found for this class and subject (none attached to the quiz yet)' : ''
                    }`}
                {meta.missingIds > 0 ? ` · ${meta.missingIds} attached question(s) no longer exist` : ''}
              </p>
              <Button variant="outline" size="sm" onClick={() => setView('bank')} className="border-teal-200 text-teal-800">
                {meta.isBankQuiz ? 'Browse bank' : (
                  <>
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Add from bank
                  </>
                )}
              </Button>
            </div>
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : error ? (
              <p className="py-6 text-center text-sm text-red-600">{error}</p>
            ) : meta.isBankQuiz ? null : questions.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">
                This quiz has no questions yet. Add some from the bank, or use “Add Questions” on the class card to
                generate them.
              </p>
            ) : (
              <div className="space-y-2">
                {questions.map((q, i) => (
                  <QuestionCard
                    key={q._id}
                    q={q}
                    index={i + 1}
                    action={
                      meta.source === 'quiz' ? (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 shrink-0"
                          disabled={busyId === q._id}
                          aria-label="Remove from quiz"
                          onClick={async () => {
                            setBusyId(q._id);
                            try {
                              await updateQuestions({ remove: [q._id] });
                            } catch (e) {
                              toast({
                                title: 'Could not remove question',
                                description: e instanceof Error ? e.message : '',
                                variant: 'destructive',
                              });
                            } finally {
                              setBusyId('');
                            }
                          }}
                        >
                          {busyId === q._id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5 text-red-600" />
                          )}
                        </Button>
                      ) : undefined
                    }
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
