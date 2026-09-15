import { useState, useEffect, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { getAuthToken, authBearerHeaders } from '@/lib/auth-utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useConfirm } from '@/hooks/use-confirm';
import { API_BASE_URL } from '@/lib/api-config';
import { cn } from '@/lib/utils';
import { getExamClassStrings, normalizeClassNumber } from '@/lib/exam-classes';
import {
  normalizeAndFormatExamDisplayText,
  parseAssertionReasonStem,
  resolveAssertionReasonDisplay,
} from '@/lib/exam-text-normalize';
import { AuthenticatedUploadImage } from '@/components/AuthenticatedUploadImage';
import { MatchColumnsTable } from '@/components/exam/MatchColumnsTable';
import {
  AdminExamPreviewTriggerButton,
  AdminExamStudentPreview,
} from '@/components/super-admin/AdminExamStudentPreview';
import { Plus, Trash2, Edit, Eye, Calendar, Clock, BookOpen, FileQuestion, X, Upload, Download, School, GraduationCap, Loader2, ChevronUp, ChevronDown, Save, Search, Maximize2 } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

type ExamSubjectValue =
  | 'maths'
  | 'physics'
  | 'chemistry'
  | 'biology'
  | 'science'
  | 'english'
  | 'hindi'
  | 'social_science';

interface Exam {
  _id: string;
  title: string;
  description: string;
  examType: 'weekend' | 'mains' | 'advanced' | 'practice';
  classNumber?: string;
  subject: ExamSubjectValue;
  subjects?: ExamSubjectValue[];
  maxAttempts: number;
  assignedClasses?: string[];
  board: string;
  duration: number;
  totalQuestions: number;
  totalMarks: number;
  instructions: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  questions?: string[];
  targetSchools?: Array<{ _id: string; schoolName?: string; fullName?: string; email?: string }>;
  schoolId?: string;
  isSchoolSpecific?: boolean;
  isAllBoards?: boolean;
  createdAt: string;
  updatedAt?: string;
}

function examTargetSchoolLabel(school: {
  _id?: string;
  id?: string;
  schoolName?: string;
  name?: string;
  fullName?: string;
  email?: string;
}) {
  return (
    String(school.schoolName || school.name || school.fullName || '').trim() ||
    String(school.email || '').trim() ||
    'Unnamed school'
  );
}

/** Badge that lists specific schools on hover or click. */
function SpecificSchoolsBadge({
  targetSchools,
  schoolDirectory,
}: {
  targetSchools?: Array<{
    _id?: string;
    id?: string;
    schoolName?: string;
    name?: string;
    fullName?: string;
    email?: string;
  }>;
  schoolDirectory?: Array<{ id: string; name?: string; schoolName?: string; email?: string }>;
}) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearCloseTimer = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const scheduleClose = () => {
    clearCloseTimer();
    closeTimer.current = setTimeout(() => setOpen(false), 160);
  };

  const openNow = () => {
    clearCloseTimer();
    setOpen(true);
  };

  const names = useMemo(() => {
    const dir = new Map(
      (schoolDirectory || []).map((s) => [
        String(s.id),
        String(s.name || s.schoolName || s.email || '').trim(),
      ]),
    );
    const list = (targetSchools || []).map((s) => {
      const id = String(s._id || s.id || '');
      const fromExam = examTargetSchoolLabel(s);
      if (fromExam && fromExam !== 'Unnamed school') return fromExam;
      return dir.get(id) || fromExam;
    });
    return Array.from(new Set(list.filter(Boolean))).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' }),
    );
  }, [targetSchools, schoolDirectory]);

  const count = names.length || targetSchools?.length || 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-mini font-medium text-amber-900 outline-none transition hover:bg-amber-100 focus-visible:ring-2 focus-visible:ring-amber-300"
          onMouseEnter={openNow}
          onMouseLeave={scheduleClose}
          onFocus={openNow}
          onBlur={scheduleClose}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            clearCloseTimer();
            setOpen((v) => !v);
          }}
          aria-label={
            count > 0
              ? `Specific schools: ${names.join(', ')}`
              : 'Specific schools'
          }
        >
          Specific schools{count > 0 ? ` · ${count}` : ''}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72 p-3"
        onMouseEnter={openNow}
        onMouseLeave={scheduleClose}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <p className="mb-2 text-xs font-semibold text-slate-800">
          Assigned schools{count > 0 ? ` (${count})` : ''}
        </p>
        {names.length === 0 ? (
          <p className="text-xs text-slate-500">No school names available.</p>
        ) : (
          <ul className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
            {names.map((name) => (
              <li
                key={name}
                className="rounded-md bg-amber-50/80 px-2 py-1.5 text-xs text-slate-800"
              >
                {name}
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

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

const DEFAULT_ASSERTION_REASON_DIRECTIONS = `Directions: Each question below consists of an Assertion (A) and a Reason (R). Choose the correct option:
(a) Both A and R are true, and R is the correct explanation of A.
(b) Both A and R are true, but R is not the correct explanation of A.
(c) A is true, but R is false.
(d) A is false, but R is true.`;

function looksLikeArDirectionsText(text?: string) {
  const t = String(text || '').trim();
  if (!t) return false;
  // Reject PDF page dumps that merely contain the a/b/c/d lines somewhere
  if (t.length > 550) return false;
  if (/\bCODE\s*:/i.test(t)) return false;
  if (/www\.asliprep\.com/i.test(t)) return false;
  if (/--\s*\d+\s*of\s*\d+\s*--/i.test(t)) return false;
  if (/Case\s*[-–]?\s*Based/i.test(t)) return false;
  if (/Integer\s+Type|Single\s+Correct|Match\s+the\s+Following/i.test(t)) return false;
  const qStems = t.match(/(?:^|\n)\s*\d{1,3}\.\s+\S/g);
  if (qStems && qStems.length >= 2) return false;
  return (
    /correct explanation of A/i.test(t) ||
    (/Both A and R are true/i.test(t) && /A is false,\s*but R is true/i.test(t))
  );
}

function questionLooksLikeAssertionReason(q: {
  questionType?: string;
  assertionText?: string;
  reasonText?: string;
  questionText?: string;
  options?: Array<string | { text?: string }>;
  option1?: string;
  option2?: string;
  option3?: string;
  option4?: string;
}) {
  const stem = String(q.questionText || '');
  // Must have A:/R: in the stem — do not trust type alone (Gemini mis-tags MCQs)
  if (/\bA\s*[:：]\s*\S/.test(stem) && /\bR\s*[:：]\s*\S/.test(stem)) return true;
  if (String(q.assertionText || '').trim() && String(q.reasonText || '').trim()) return true;
  return false;
}

/** Normalize extract rows in the browser so AR directions always show even if API is old. */
function stripDuplicateMatterFromStemClient(stem: string, matter: string) {
  let s = String(stem || '').trim();
  const m = String(matter || '').trim();
  if (!s || !m || m.length < 20) return s;
  const sLower = s.toLowerCase();
  const mLower = m.toLowerCase();
  if (sLower.startsWith(mLower)) {
    return s.slice(m.length).replace(/^[\s\n:;.\-–—]+/, '').trim() || s;
  }
  if (/^Case\s*(?:I{1,3}|IV|\d+)/i.test(m) && /^Case\s*(?:I{1,3}|IV|\d+)/i.test(s)) {
    const qStart = s.search(
      /\b(?:Using|According|For|Which|What|Calculate|Find|The magnitude|In the|Based on|From the)\b/i,
    );
    if (qStart > 40) return s.slice(qStart).trim();
  }
  return s;
}

function stripPaperDirectionsClient(stem: string) {
  let s = String(stem || '').trim();
  if (!s) return s;
  s = s.replace(
    /^(?:Directions\s*:\s*)?Each\s+question\s+has\s+four\s+choices[\s\S]*?(?:Choose\s+the\s+correct\s+answer\.?\s*)+/i,
    '',
  );
  s = s.replace(
    /^(?:Directions\s*:\s*)?(?:Each\s+question\s+(?:below\s+consists\s+of|is\s+followed\s+by)[\s\S]*?(?:A is false,\s*but R is true\.?\s*)+)/i,
    '',
  );
  s = s.replace(
    /^(?:Directions\s*:\s*)?Following\s+questions\s+have\s+(?:four\s+statements|statements)[\s\S]*?(?:choose\s+the\s+correct\s+matching[^\n]*\n?)/i,
    '',
  );
  return s.trim();
}

function normalizeExtractedPdfRows(rows: any[]): any[] {
  return (rows || []).map((row, idx) => {
    const stemRaw = stripPaperDirectionsClient(String(row.questionText || ''));
    const isAr = questionLooksLikeAssertionReason({ ...row, questionText: stemRaw });
    const isRealMatch =
      row.questionType === 'match_following' ||
      (/Column\s*I\b/i.test(stemRaw) && /Column\s*II\b/i.test(stemRaw)) ||
      /match\s+(?:the\s+following|each|physical|the\s+branch|the\s+scientific|the\s+steps|the\s+invention)/i.test(
        stemRaw,
      );

    // Drop false Match matter / flags stamped onto normal MCQs
    let next = { ...row, row: row.row || idx + 1, questionText: stemRaw };
    if (!isRealMatch && (next.sharedMatterKind === 'match_following' || /Match table columns missing/i.test(String(next.validationNote || '')))) {
      const flags = (next.validationFlags || []).filter((f: string) => f !== 'needs_figure');
      next = {
        ...next,
        sharedMatterKind: next.sharedMatterKind === 'match_following' ? '' : next.sharedMatterKind,
        sharedMatterText:
          next.sharedMatterKind === 'match_following' ? '' : next.sharedMatterText,
        sharedMatterId: next.sharedMatterKind === 'match_following' ? '' : next.sharedMatterId,
        validationFlags: flags,
        validationNote: flags.length ? next.validationNote : '',
        solvable: flags.length === 0 && next.answerConflict !== true,
      };
    }

    // Demote false Assertion–Reason (Single Correct that got AR Directions)
    if (
      !isAr &&
      (next.questionType === 'assertion_reason' ||
        next.sharedMatterKind === 'assertion_reason' ||
        looksLikeArDirectionsText(next.sharedMatterText))
    ) {
      const clearAr =
        next.sharedMatterKind === 'assertion_reason' ||
        looksLikeArDirectionsText(next.sharedMatterText);
      next = {
        ...next,
        questionType: next.questionType === 'assertion_reason' ? 'mcq' : next.questionType,
        assertionText: '',
        reasonText: '',
        sharedMatterKind: clearAr ? '' : next.sharedMatterKind,
        sharedMatterText: clearAr ? '' : next.sharedMatterText,
        sharedMatterId: clearAr ? '' : next.sharedMatterId,
      };
    }

    // Case card already shows the passage — strip it from the question body
    const matter = String(next.sharedMatterText || next.passageText || '').trim();
    if (
      matter &&
      !isAr &&
      (next.sharedMatterKind === 'case' ||
        next.sharedMatterKind === 'match_following' ||
        next.passageId ||
        /^Case\s*(?:I{1,3}|IV|\d+)/i.test(matter))
    ) {
      next = {
        ...next,
        questionText: stripDuplicateMatterFromStemClient(String(next.questionText || ''), matter),
      };
    }

    if (!isAr) return next;

    const flags = (next.validationFlags || []).filter((f: string) => f !== 'needs_figure');

    return {
      ...next,
      questionType: 'assertion_reason',
      sharedMatterKind: 'assertion_reason',
      sharedMatterId: next.sharedMatterId || 'AR1',
      sharedMatterText: DEFAULT_ASSERTION_REASON_DIRECTIONS,
      questionImage: '',
      hasFigure: false,
      validationFlags: flags,
      validationNote:
        flags.length === 0
          ? ''
          : flags.includes('missing_answer')
            ? 'Correct answer missing'
            : String(next.validationNote || '').replace(/Match table columns missing.*/i, '').trim(),
      solvable: flags.length === 0 && next.answerConflict !== true,
    };
  });
}

function arDirectionsForQuestion(q: {
  questionType?: string;
  sharedMatterText?: string;
  passageText?: string;
  assertionText?: string;
  reasonText?: string;
  questionText?: string;
  options?: Array<string | { text?: string }>;
  option1?: string;
  option2?: string;
  option3?: string;
  option4?: string;
}) {
  if (!questionLooksLikeAssertionReason(q)) {
    return String(q.sharedMatterText || q.passageText || '').trim();
  }
  const raw = String(q.sharedMatterText || '').trim();
  return looksLikeArDirectionsText(raw) ? raw : DEFAULT_ASSERTION_REASON_DIRECTIONS;
}
function subjectSectionLabel(subject?: string) {
  const key = String(subject || '').trim().toLowerCase();
  return SUBJECT_SECTION_LABELS[key] || (key ? key.charAt(0).toUpperCase() + key.slice(1) : 'General');
}

function resolveQuestionSectionHeading(q: { sectionHeading?: string; subject?: string }) {
  const custom = String(q?.sectionHeading || '').trim();
  return custom || subjectSectionLabel(q?.subject);
}

const EMPTY_QUESTION_FORM = {
  questionText: '',
  questionImage: '',
  questionType: 'mcq' as 'mcq' | 'multiple' | 'integer' | 'assertion_reason' | 'match_following',
  subject: 'maths',
  marks: '1',
  negativeMarks: '0',
  explanation: '',
  options: ['', '', '', ''],
  correctAnswer: '',
  /** Preferred option index for single-choice UI (avoids double-select when two options share text). */
  correctOptionIndex: -1,
  correctAnswers: [] as string[],
  integerAnswer: '',
  sharedMatterId: '',
  sharedMatterText: '',
  sharedMatterKind: '' as '' | 'case' | 'assertion_reason' | 'match_following',
  assertionText: '',
  reasonText: '',
  matchColumnIText: '',
  matchColumnIIText: '',
};

function optionText(opt: unknown): string {
  if (typeof opt === 'string') return opt;
  if (opt && typeof opt === 'object' && 'text' in opt) {
    return String((opt as { text?: unknown }).text ?? '');
  }
  return '';
}

function firstMatchingOptionIndex(options: string[], answer: unknown): number {
  const a = String(answer ?? '').trim().toLowerCase();
  if (!a) return -1;
  return options.findIndex((o) => o.trim().toLowerCase() === a);
}

function hasDuplicateOptionTexts(options: string[]): boolean {
  const seen = new Set<string>();
  for (const o of options) {
    const t = o.trim().toLowerCase();
    if (!t) continue;
    if (seen.has(t)) return true;
    seen.add(t);
  }
  return false;
}

/**
 * Map a stored answer (option text, 0/1 index, or a/b/c/d) onto an option's text.
 * Uploaded papers often store letters — the edit form must resolve those or Save fails.
 */
function resolveAnswerAgainstOptions(rawAnswer: unknown, options: string[]): string {
  const raw = String(rawAnswer ?? '').trim();
  if (!raw || !Array.isArray(options) || options.length === 0) return raw;
  const byText = options.find((o) => o.trim().toLowerCase() === raw.toLowerCase());
  if (byText) return byText.trim();

  // a/b/c/d or A)/(b) style keys from paper extract / answer key
  const letter = raw.replace(/^[(\[]?\s*/, '').replace(/[)\].:\s].*$/, '').trim();
  if (/^[a-dA-D]$/.test(letter)) {
    const idx = letter.toLowerCase().charCodeAt(0) - 97;
    if (idx >= 0 && idx < options.length && options[idx]?.trim()) {
      return options[idx].trim();
    }
  }

  if (/^\d+$/.test(raw)) {
    const idx = parseInt(raw, 10);
    // Accept both 0-based and 1-based indices
    if (idx >= 0 && idx < options.length && options[idx]?.trim()) return options[idx].trim();
    if (idx >= 1 && idx <= options.length && options[idx - 1]?.trim()) {
      return options[idx - 1].trim();
    }
  }
  return raw;
}

function formatMatchColumnLines(
  cols: Array<{ key?: string; text?: string }> | undefined,
): string {
  if (!Array.isArray(cols) || cols.length === 0) return '';
  return cols
    .map((c) => {
      const key = String(c?.key || '').trim();
      const text = String(c?.text || '').trim();
      if (!text) return '';
      return key ? `${key}. ${text}` : text;
    })
    .filter(Boolean)
    .join('\n');
}

function parseMatchColumnLines(raw: string): Array<{ key: string; text: string }> {
  return String(raw || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^([A-D]|\d{1,2})\s*[.):\-]?\s*(.*)$/i);
      if (m) return { key: m[1], text: String(m[2] || '').trim() };
      return { key: '', text: line };
    })
    .filter((x) => x.text);
}

function SharedMatterCard({
  text,
  kind,
  subject,
}: {
  text?: string;
  kind?: string;
  subject?: string;
}) {
  const matter = String(text || '').trim();
  if (!matter) return null;
  const label =
    kind === 'assertion_reason'
      ? 'Assertion–Reason directions'
      : kind === 'match_following'
        ? 'Match the Following'
        : kind === 'case'
          ? 'Case / Passage'
          : 'Shared matter';
  return (
    <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
        {label}
      </div>
      <div className="whitespace-pre-wrap leading-relaxed">
        {formatChemistryText(matter, subject)}
      </div>
    </div>
  );
}

/**
 * Edits a question where it sits in the paper, instead of sending the user to a
 * form elsewhere on the page. Saving goes through the same handler the main
 * form uses, so add and edit stay in sync.
 */
/** Stem for AR: dedicated A/R fields, or parseable "A: … R: …" in question text. */
function resolveArStemFields(form: typeof EMPTY_QUESTION_FORM): {
  assertionText: string;
  reasonText: string;
} {
  let assertionText = String(form.assertionText || '').trim();
  let reasonText = String(form.reasonText || '').trim();
  if (!assertionText || !reasonText) {
    const parsed = parseAssertionReasonStem(form.questionText);
    if (parsed) {
      if (!assertionText) assertionText = parsed.assertion;
      if (!reasonText) reasonText = parsed.reason;
    }
  }
  return { assertionText, reasonText };
}

function InlineQuestionEditor({
  form,
  setForm,
  saving,
  onSave,
  onCancel,
  onUploadImage,
  onRemoveImage,
  uploadingImage,
  imageFileName,
  paperImages = [],
}: {
  form: typeof EMPTY_QUESTION_FORM;
  setForm: React.Dispatch<React.SetStateAction<typeof EMPTY_QUESTION_FORM>>;
  saving: boolean;
  onSave: (form: typeof EMPTY_QUESTION_FORM) => void;
  onCancel: () => void;
  onUploadImage: (file: File) => void;
  onRemoveImage: () => void;
  uploadingImage: boolean;
  imageFileName?: string | null;
  paperImages?: Array<{ url: string; name?: string; order?: number; key?: string }>;
}) {
  const patch = (p: Partial<typeof EMPTY_QUESTION_FORM>) => setForm((prev) => ({ ...prev, ...p }));
  const isChoice =
    form.questionType === 'mcq' ||
    form.questionType === 'multiple' ||
    form.questionType === 'assertion_reason' ||
    form.questionType === 'match_following';

  const changeQuestionType = (value: typeof EMPTY_QUESTION_FORM.questionType) => {
    setForm((prev) => {
      const next: typeof EMPTY_QUESTION_FORM = {
        ...prev,
        questionType: value,
        correctAnswer: '',
        correctOptionIndex: -1,
        correctAnswers: [],
        integerAnswer: value === 'integer' ? prev.integerAnswer : '',
      };
      // Keep option slots ready when switching into a choice type
      if (value !== 'integer') {
        const opts = [...prev.options];
        while (opts.length < 4) opts.push('');
        next.options = opts.slice(0, Math.max(4, opts.length));
      }
      if (value === 'assertion_reason') {
        if (!String(prev.sharedMatterText || '').trim()) {
          next.sharedMatterText = DEFAULT_ASSERTION_REASON_DIRECTIONS;
          next.sharedMatterKind = 'assertion_reason';
        }
        // Prefer dedicated A/R cells; backfill from question text when switching type
        const parsed = parseAssertionReasonStem(prev.questionText);
        if (parsed) {
          if (!String(prev.assertionText || '').trim()) next.assertionText = parsed.assertion;
          if (!String(prev.reasonText || '').trim()) next.reasonText = parsed.reason;
        }
      }
      if (value !== 'assertion_reason' && prev.sharedMatterKind === 'assertion_reason') {
        // leave shared matter text; admin can clear manually
      }
      if (value === 'match_following') {
        next.sharedMatterKind = next.sharedMatterKind || 'match_following';
      }
      return next;
    });
  };

  return (
    <div className="space-y-4 rounded-lg border-2 border-sky-300 bg-sky-50/50 p-3 sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-sky-800">
          Editing this question
        </span>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            className="bg-sky-600 text-white hover:bg-sky-700"
            onClick={() => onSave(form)}
            disabled={saving || uploadingImage}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            <span className="ml-1">Save</span>
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label className="text-xs">Question type</Label>
          <Select value={form.questionType} onValueChange={(v) => changeQuestionType(v as typeof form.questionType)}>
            <SelectTrigger className="mt-1 h-9 bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mcq">Single MCQ</SelectItem>
              <SelectItem value="multiple">Multiple MCQ</SelectItem>
              <SelectItem value="integer">Integer Type</SelectItem>
              <SelectItem value="assertion_reason">Assertion–Reason</SelectItem>
              <SelectItem value="match_following">Match the Following</SelectItem>
            </SelectContent>
          </Select>
          <p className="mt-1 text-[10px] text-slate-500">
            Change type here (e.g. Integer → MCQ), fill the new fields, then Save.
          </p>
        </div>
        <div>
          <Label className="text-xs">Subject</Label>
          <Select
            value={form.subject}
            onValueChange={(value) => patch({ subject: value })}
          >
            <SelectTrigger className="mt-1 h-9 bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EXAM_SUBJECTS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label className="text-xs">Shared matter (shown on every linked question)</Label>
        <Textarea
          className="mt-1 bg-white"
          rows={3}
          value={form.sharedMatterText}
          placeholder="Case passage / AR directions / Match directions"
          onChange={(e) => patch({ sharedMatterText: e.target.value })}
        />
        {form.sharedMatterId ? (
          <p className="mt-1 text-[10px] text-slate-500">
            Group id: {form.sharedMatterId} — saving updates this text for all questions in the group.
          </p>
        ) : null}
      </div>

      {(form.questionType === 'assertion_reason' || form.assertionText || form.reasonText) && (
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <Label className="text-xs">Assertion (A)</Label>
            <Textarea
              className="mt-1 bg-white"
              rows={2}
              value={form.assertionText}
              onChange={(e) => patch({ assertionText: e.target.value })}
            />
          </div>
          <div>
            <Label className="text-xs">Reason (R)</Label>
            <Textarea
              className="mt-1 bg-white"
              rows={2}
              value={form.reasonText}
              onChange={(e) => patch({ reasonText: e.target.value })}
            />
          </div>
        </div>
      )}

      {(form.questionType === 'match_following' || form.matchColumnIText || form.matchColumnIIText) && (
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <Label className="text-xs">Column I (one per line)</Label>
            <Textarea
              className="mt-1 bg-white"
              rows={4}
              value={form.matchColumnIText}
              onChange={(e) => patch({ matchColumnIText: e.target.value })}
            />
          </div>
          <div>
            <Label className="text-xs">Column II (one per line)</Label>
            <Textarea
              className="mt-1 bg-white"
              rows={4}
              value={form.matchColumnIIText}
              onChange={(e) => patch({ matchColumnIIText: e.target.value })}
            />
          </div>
        </div>
      )}

      <div>
        <Label className="text-xs">
          Question text
          {form.questionType === 'assertion_reason' ? (
            <span className="ml-1 font-normal text-slate-500">(optional — A & R above are enough)</span>
          ) : null}
        </Label>
        <Textarea
          className="mt-1 bg-white"
          rows={4}
          value={form.questionText}
          placeholder={
            form.questionType === 'assertion_reason'
              ? 'Optional. Leave blank if Assertion and Reason are filled above.'
              : undefined
          }
          onChange={(e) => patch({ questionText: e.target.value })}
        />
      </div>

      <div>
        <Label className="text-xs">Figure / question image</Label>
        {paperImages.length > 0 ? (
          <div className="mt-2 space-y-2">
            <p className="text-[10px] text-slate-600">
              Pick from this paper ({paperImages.length}) — preferred over uploading a new file.
            </p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {paperImages.map((img, i) => {
                const selected = form.questionImage === img.url;
                return (
                  <button
                    key={img.key || img.url || i}
                    type="button"
                    disabled={saving || uploadingImage}
                    className={`relative shrink-0 rounded-md border bg-white p-1 ${
                      selected
                        ? 'border-sky-500 ring-2 ring-sky-200'
                        : 'border-slate-200 hover:border-sky-300'
                    }`}
                    onClick={() => patch({ questionImage: img.url })}
                    title={img.name || `Figure ${i + 1}`}
                  >
                    <AuthenticatedUploadImage
                      src={img.url}
                      alt={img.name || `Paper figure ${i + 1}`}
                      wrapperClassName="h-16 w-24 p-0"
                      className="h-[60px] w-full object-contain"
                      fallbackLabel="—"
                    />
                    {selected ? (
                      <span className="absolute right-1 top-1 rounded bg-sky-600 px-1 text-[9px] font-semibold text-white">
                        selected
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
        <Input
          className="mt-2 bg-white"
          type="file"
          accept="image/*"
          disabled={saving || uploadingImage}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onUploadImage(file);
            e.target.value = '';
          }}
        />
        {uploadingImage ? (
          <p className="mt-1 text-xs text-blue-600">Uploading image...</p>
        ) : (
          <p className="mt-1 text-[10px] text-slate-500">
            {paperImages.length
              ? 'Or upload a file if the figure is missing from the paper pool. Click Save after changing.'
              : 'Replace or remove the figure here. Click Save after removing so the change is stored.'}
          </p>
        )}
        {form.questionImage ? (
          <div className="mt-2 space-y-2">
            <AuthenticatedUploadImage
              src={form.questionImage}
              alt="Question figure preview"
              className="max-h-48"
              wrapperClassName="p-2 max-w-md bg-white"
            />
            <div className="flex flex-wrap items-center gap-2">
              {imageFileName ? (
                <span className="text-xs text-gray-600">{imageFileName}</span>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-red-200 text-red-700 hover:bg-red-50"
                disabled={saving || uploadingImage}
                onClick={onRemoveImage}
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" />
                Remove image
              </Button>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-xs text-slate-500">No figure attached.</p>
        )}
      </div>

      {isChoice ? (
        <div className="space-y-2">
          <Label className="text-xs">
            Options — click the circle to mark the correct one
            {form.questionType === 'multiple' ? ' (toggle several)' : ''}
          </Label>
          {hasDuplicateOptionTexts(form.options) ? (
            <p className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">
              Two or more options have the same text — only one can be marked correct. Edit the
              duplicate option text so each choice is unique.
            </p>
          ) : null}
          {form.options.map((opt, i) => {
            const letter = String.fromCharCode(97 + i);
            const selectedIdx =
              form.correctOptionIndex >= 0
                ? form.correctOptionIndex
                : firstMatchingOptionIndex(form.options, form.correctAnswer);
            const checked =
              form.questionType === 'multiple'
                ? form.correctAnswers.includes(opt) && Boolean(opt.trim())
                : Boolean(opt.trim()) && selectedIdx === i;
            return (
              <div
                key={i}
                className={`flex items-center gap-2 rounded-md px-1 py-0.5 ${
                  checked ? 'bg-emerald-50/80' : ''
                }`}
              >
                <button
                  type="button"
                  title={`Mark ${letter}) correct`}
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-bold ${
                    checked
                      ? 'border-emerald-600 bg-emerald-600 text-white'
                      : 'border-slate-400 bg-white text-slate-600'
                  }`}
                  onClick={() => {
                    if (!opt.trim()) return;
                    if (form.questionType === 'multiple') {
                      const next = form.correctAnswers.includes(opt)
                        ? form.correctAnswers.filter((a) => a !== opt)
                        : [...form.correctAnswers, opt];
                      patch({ correctAnswers: next });
                    } else {
                      patch({ correctAnswer: opt, correctOptionIndex: i });
                    }
                  }}
                >
                  {letter}
                </button>
                <Input
                  className="h-9 bg-white"
                  value={opt}
                  placeholder={`Option ${letter}`}
                  onChange={(e) => {
                    const nextOptions = form.options.map((o, j) => (j === i ? e.target.value : o));
                    const nextPatch: Partial<typeof EMPTY_QUESTION_FORM> = { options: nextOptions };
                    if (form.questionType === 'multiple') {
                      if (form.correctAnswers.includes(opt)) {
                        nextPatch.correctAnswers = form.correctAnswers.map((a) =>
                          a === opt ? e.target.value : a,
                        );
                      }
                    } else if (
                      form.correctOptionIndex === i ||
                      (form.correctOptionIndex < 0 && form.correctAnswer === opt)
                    ) {
                      nextPatch.correctAnswer = e.target.value;
                      nextPatch.correctOptionIndex = i;
                    }
                    patch(nextPatch);
                  }}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <div>
          <Label className="text-xs">Correct answer (integer)</Label>
          <Input
            className="mt-1 h-9 max-w-xs bg-white"
            value={form.integerAnswer}
            onChange={(e) => patch({ integerAnswer: e.target.value })}
          />
        </div>
      )}

      <div>
        <Label className="text-xs">Explanation</Label>
        <Textarea
          className="mt-1 bg-white"
          rows={2}
          value={form.explanation}
          onChange={(e) => patch({ explanation: e.target.value })}
        />
      </div>
    </div>
  );
}

function buildQuestionFormFromExisting(q: any): typeof EMPTY_QUESTION_FORM {
  const rawOptions = Array.isArray(q?.options) ? q.options : [];
  const options = rawOptions.map(optionText);
  while (options.length < 4) options.push('');

  const type = ([
    'mcq',
    'multiple',
    'integer',
    'assertion_reason',
    'match_following',
  ].includes(String(q?.questionType))
    ? q.questionType
    : 'mcq') as typeof EMPTY_QUESTION_FORM.questionType;

  let correctAnswer = '';
  let correctAnswers: string[] = [];
  let integerAnswer = '';

  if (type === 'integer') {
    integerAnswer =
      q?.correctAnswer === null || q?.correctAnswer === undefined ? '' : String(q.correctAnswer);
  } else if (type === 'multiple') {
    const answers = Array.isArray(q?.correctAnswer)
      ? q.correctAnswer
      : q?.correctAnswer != null && q?.correctAnswer !== ''
        ? [q.correctAnswer]
        : [];
    correctAnswers = answers
      .map((ans: unknown) => resolveAnswerAgainstOptions(ans, options))
      .filter(Boolean);
    if (correctAnswers.length === 0) {
      rawOptions.forEach((opt: any, i: number) => {
        if (opt?.isCorrect && options[i]) correctAnswers.push(options[i]);
      });
    }
  } else {
    const ans = q?.correctAnswer;
    correctAnswer = resolveAnswerAgainstOptions(ans, options);
    if (!correctAnswer) {
      const flagged = rawOptions.findIndex((opt: any) => opt?.isCorrect);
      if (flagged >= 0) correctAnswer = options[flagged];
    }
  }

  const flaggedIdx = rawOptions.findIndex((opt: any) => opt?.isCorrect);
  const correctOptionIndex =
    type === 'integer' || type === 'multiple'
      ? -1
      : flaggedIdx >= 0
        ? flaggedIdx
        : firstMatchingOptionIndex(options, correctAnswer);

  return {
    questionText: String(q?.questionText || ''),
    questionImage: String(q?.questionImage || ''),
    questionType: type,
    subject: String(q?.subject || 'maths').toLowerCase() || 'maths',
    marks: String(q?.marks ?? 1),
    negativeMarks: String(q?.negativeMarks ?? 0),
    explanation: String(q?.explanation || ''),
    options,
    correctAnswer,
    correctOptionIndex,
    correctAnswers,
    integerAnswer,
    sharedMatterId: String(q?.sharedMatterId || q?.passageId || ''),
    sharedMatterText: String(q?.sharedMatterText || q?.passageText || ''),
    sharedMatterKind: (['case', 'assertion_reason', 'match_following'].includes(
      String(q?.sharedMatterKind || ''),
    )
      ? q.sharedMatterKind
      : '') as typeof EMPTY_QUESTION_FORM.sharedMatterKind,
    assertionText: String(q?.assertionText || ''),
    reasonText: String(q?.reasonText || ''),
    matchColumnIText: formatMatchColumnLines(q?.matchColumnI),
    matchColumnIIText: formatMatchColumnLines(q?.matchColumnII),
  };
}

const BOARDS = [
  { value: 'ASLI_EXCLUSIVE_SCHOOLS', label: 'Asli Prep (exclusive)' },
  { value: 'IIT', label: 'IIT' },
  { value: 'CBSE', label: 'CBSE' },
  { value: 'SSC', label: 'SSC / State Board' },
  { value: 'STATE', label: 'State Board (generic)' },
  { value: 'ICSE', label: 'ICSE' },
  { value: 'IB', label: 'IB' },
  { value: 'CAMBRIDGE', label: 'Cambridge (CAIE)' },
];

const EXAM_TYPES = [
  { value: 'mains', label: 'Mains' },
  { value: 'advanced', label: 'Advanced' },
  { value: 'weekend', label: 'Weekend' },
  { value: 'practice', label: 'Practice' }
];

const EXAM_SUBJECTS = [
  { value: 'maths', label: 'Mathematics' },
  { value: 'physics', label: 'Physics' },
  { value: 'chemistry', label: 'Chemistry' },
  { value: 'biology', label: 'Biology' },
  { value: 'science', label: 'Science' },
  { value: 'english', label: 'English' },
  { value: 'hindi', label: 'Hindi' },
  { value: 'social_science', label: 'Social Science' },
];

const DEFAULT_CLASS_OPTIONS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];

function mergeClassOptionLists(...lists: Array<string[] | undefined>): string[] {
  const collected = new Set<string>();
  for (const list of lists) {
    for (const raw of list || []) {
      const value = normalizeClassNumber(String(raw || '').trim());
      if (!value || /^unassigned$/i.test(value)) continue;
      collected.add(value);
    }
  }
  return [...collected].sort((a, b) => {
    const numA = parseInt(a, 10);
    const numB = parseInt(b, 10);
    const aNum = !Number.isNaN(numA) && String(numA) === a;
    const bNum = !Number.isNaN(numB) && String(numB) === b;
    if (aNum && bNum) return numA - numB;
    if (aNum) return -1;
    if (bNum) return 1;
    return a.localeCompare(b, undefined, { sensitivity: 'base' });
  });
}

type FilterType = 'all-schools' | 'specific-schools' | 'all-boards';
type BulkQuestionUploadMode = 'csv' | 'pdf';
type PdfQuestionRow = {
  row: number;
  questionNumber?: number;
  questionText: string;
  questionType: 'mcq' | 'multiple' | 'integer' | 'assertion_reason' | 'match_following';
  subject: string;
  marks: number;
  option1: string;
  option2: string;
  option3: string;
  option4: string;
  correctAnswer: string;
  explanation: string;
  questionImage?: string;
  hasFigure?: boolean;
  passageId?: string;
  passageText?: string;
  sharedMatterId?: string;
  sharedMatterText?: string;
  sharedMatterKind?: '' | 'case' | 'assertion_reason' | 'match_following';
  assertionText?: string;
  reasonText?: string;
  matchColumnI?: Array<{ key?: string; text?: string }>;
  matchColumnII?: Array<{ key?: string; text?: string }>;
  solvable?: boolean;
  validationFlags?: string[];
  validationNote?: string;
};

/** Canonical subject for PDF rows / upload (no exam default). */
function normalizePdfRowSubjectSlug(
  raw: string,
): '' | ExamSubjectValue {
  const t = String(raw || '').trim().toLowerCase();
  if (!t) return '';
  const map: Record<string, ExamSubjectValue> = {
    maths: 'maths',
    mathematics: 'maths',
    math: 'maths',
    physics: 'physics',
    chemistry: 'chemistry',
    biology: 'biology',
    biological: 'biology',
    science: 'science',
    english: 'english',
    hindi: 'hindi',
    social_science: 'social_science',
    'social science': 'social_science',
    sst: 'social_science',
  };
  if (map[t]) return map[t];
  if (
    t === 'maths' ||
    t === 'physics' ||
    t === 'chemistry' ||
    t === 'biology' ||
    t === 'science' ||
    t === 'english' ||
    t === 'hindi' ||
    t === 'social_science'
  ) {
    return t;
  }
  return '';
}

const normalizeDisplayText = (value?: string) =>
  (value || '')
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const formatChemistryText = (value: unknown, subject?: string) =>
  normalizeAndFormatExamDisplayText(value, subject);

const toIsoFromDateTimeLocal = (value: string) => {
  if (!value) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
};

const toDateTimeLocalInput = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const sanitizeMarksInput = (value: string) => {
  if (value.trim() === '') return '';
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '';
  return String(Math.max(0, parsed));
};

// Keep negative-marking as positive magnitude in UI/backend; deduction logic applies it as negative.
const sanitizeNegativeMarksInput = (value: string) => {
  if (value.trim() === '') return '';
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '';
  return String(Math.max(0, Math.abs(parsed)));
};

const examDisplayDedupKey = (exam: Exam) => {
  const classKey = getExamClassStrings(exam)
    .map((c) => String(c).trim())
    .filter(Boolean)
    .sort()
    .join('|');
  const targetSchoolsKey = (exam.targetSchools || [])
    .map((s: any) => (typeof s === 'string' ? s : s?._id))
    .filter(Boolean)
    .map((id: any) => String(id))
    .sort()
    .join('|');

  return [
    (exam.title || '').trim().toLowerCase(),
    (exam.description || '').trim().toLowerCase(),
    exam.examType || '',
    classKey,
    String(exam.duration || ''),
    String(exam.totalQuestions || ''),
    String(exam.totalMarks || ''),
    exam.startDate || '',
    exam.endDate || '',
    exam.isSchoolSpecific ? 'school-specific' : 'all-schools',
    targetSchoolsKey,
  ].join('::');
};

const getExamSubjects = (exam: Partial<Exam>) => {
  const fromArray = Array.isArray(exam.subjects) ? exam.subjects : [];
  const merged = [...fromArray, exam.subject].filter(Boolean) as ExamSubjectValue[];
  return Array.from(new Set(merged.map((s) => String(s).trim().toLowerCase() as ExamSubjectValue))).filter(Boolean) as ExamSubjectValue[];
};

const getExamTimestamp = (exam: Partial<Exam>) => {
  const raw = exam.updatedAt || exam.createdAt || '';
  const ts = new Date(raw).getTime();
  return Number.isNaN(ts) ? 0 : ts;
};

export default function ExamManagement() {
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const [exams, setExams] = useState<Exam[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedSchool, setSelectedSchool] = useState('all-schools');
  const [selectedClass, setSelectedClass] = useState('all-classes');
  const [schoolFilterSearch, setSchoolFilterSearch] = useState('');
  const [formSchoolSearch, setFormSchoolSearch] = useState('');
  const [classOptions, setClassOptions] = useState<string[]>(DEFAULT_CLASS_OPTIONS);
  const [classPickerSearch, setClassPickerSearch] = useState('');
  const [schools, setSchools] = useState<any[]>([]);
  const [isLoadingSchools, setIsLoadingSchools] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingExamId, setEditingExamId] = useState<string | null>(null);
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null);
  const [isQuestionDialogOpen, setIsQuestionDialogOpen] = useState(false);
  const [studentPreviewOpen, setStudentPreviewOpen] = useState(false);
  const [studentPreviewIndex, setStudentPreviewIndex] = useState(0);
  const [isAddingQuestion, setIsAddingQuestion] = useState(false);
  const [questions, setQuestions] = useState<any[]>([]);
  const [savingQuestionId, setSavingQuestionId] = useState<string | null>(null);
  const [isReorderingQuestions, setIsReorderingQuestions] = useState(false);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(false);
  const [questionCsvFile, setQuestionCsvFile] = useState<File | null>(null);
  const [questionPdfFile, setQuestionPdfFile] = useState<File | null>(null);
  const [bulkQuestionUploadMode, setBulkQuestionUploadMode] = useState<BulkQuestionUploadMode>('csv');
  const [isUploadingQuestionCsv, setIsUploadingQuestionCsv] = useState(false);
  const [isExtractingPdfQuestions, setIsExtractingPdfQuestions] = useState(false);
  const [isUploadingExtractedQuestions, setIsUploadingExtractedQuestions] = useState(false);
  const [isDeletingAllQuestions, setIsDeletingAllQuestions] = useState(false);
  const [questionCsvUploadResults, setQuestionCsvUploadResults] = useState<{ success: number; errors: string[] } | null>(null);
  const [pdfQuestionRows, setPdfQuestionRows] = useState<PdfQuestionRow[]>([]);
  const [pdfPaperImages, setPdfPaperImages] = useState<
    Array<{ url: string; name?: string; order?: number; key?: string }>
  >([]);
  /** Unassigned paper figures for the open exam (persisted on Exam.figurePool). */
  const [examFigurePool, setExamFigurePool] = useState<
    Array<{ url: string; name?: string; order?: number; key?: string }>
  >([]);
  const [pdfAssignTargetIdx, setPdfAssignTargetIdx] = useState<number | null>(null);
  const [figureAssignQuestionId, setFigureAssignQuestionId] = useState<string | null>(null);
  const [pdfAnswerKeyMeta, setPdfAnswerKeyMeta] = useState<{
    found?: boolean;
    applied?: boolean;
    agreedPct?: number | null;
    conflictCount?: number;
    reason?: string;
  } | null>(null);
  const [pdfPreviewPage, setPdfPreviewPage] = useState(1);
  const [pdfShowFlaggedOnly, setPdfShowFlaggedOnly] = useState(false);
  const [isDraggingQuestionFile, setIsDraggingQuestionFile] = useState(false);
  /** Shared by the file picker and the drop zone so both reset the same state. */
  const selectQuestionPaperFile = (file: File | null) => {
    setQuestionPdfFile(file);
    setPdfQuestionRows([]);
    setPdfPaperImages([]);
    setPdfAssignTargetIdx(null);
    setPdfAnswerKeyMeta(null);
    setPdfShowFlaggedOnly(false);
    setPdfPreviewPage(1);
  };
  const pdfFlaggedRows = useMemo(
    () => pdfQuestionRows.filter((r) => r.solvable === false),
    [pdfQuestionRows],
  );
  /** Rows to render, each paired with its index in the full list so edits write back correctly. */
  const pdfVisibleRows = useMemo(() => {
    const withIndex = pdfQuestionRows.map((row, idx) => ({ row, idx }));
    return pdfShowFlaggedOnly ? withIndex.filter(({ row }) => row.solvable === false) : withIndex;
  }, [pdfQuestionRows, pdfShowFlaggedOnly]);
  const pdfPreviewTotalPages = Math.max(1, Math.ceil(pdfVisibleRows.length / 10));
  const updatePdfRow = (index: number, patch: Partial<PdfQuestionRow>) =>
    setPdfQuestionRows((prev) => prev.map((x, j) => (j === index ? { ...x, ...patch } : x)));
  const assignPaperImageToPdfRow = (index: number, url: string) => {
    updatePdfRow(index, { questionImage: url });
    setPdfAssignTargetIdx(null);
  };
  const paperImageUsageCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of pdfQuestionRows) {
      const u = String(row.questionImage || '').trim();
      if (!u) continue;
      counts.set(u, (counts.get(u) || 0) + 1);
    }
    for (const q of questions) {
      const u = String(q?.questionImage || '').trim();
      if (!u) continue;
      counts.set(u, (counts.get(u) || 0) + 1);
    }
    return counts;
  }, [pdfQuestionRows, questions]);

  /** Pool images not yet stuck on any preview row or saved question — assigned ones leave the strip. */
  const availablePreviewPaperImages = useMemo(
    () => pdfPaperImages.filter((img) => !paperImageUsageCount.has(String(img.url || '').trim())),
    [pdfPaperImages, paperImageUsageCount],
  );

  const persistExamFigurePool = async (
    examId: string,
    pool: Array<{ url: string; name?: string; order?: number; key?: string }>,
  ) => {
    const response = await fetch(`${API_BASE_URL}/api/super-admin/exams/${examId}/figure-pool`, {
      method: 'PUT',
      credentials: 'include',
      headers: {
        ...authBearerHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ figurePool: pool }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.success) {
      throw new Error(data?.message || 'Failed to save figure pool');
    }
    const next = Array.isArray(data.figurePool)
      ? data.figurePool
      : Array.isArray(data.data)
        ? data.data
        : pool;
    setExamFigurePool(
      next
        .map((img: any, i: number) => ({
          url: String(img?.url || '').trim(),
          name: String(img?.name || '').trim() || `Fig ${i + 1}`,
          order: Number.isFinite(Number(img?.order)) ? Number(img.order) : i,
          key: String(img?.key || '').trim() || undefined,
        }))
        .filter((img: { url: string }) => Boolean(img.url)),
    );
  };

  const handleAssignFigureToSavedQuestion = async (questionId: string, imageUrl: string) => {
    if (!selectedExam?._id || !questionId || !imageUrl) return;
    try {
      // Never persist ?exp=&sig= — signatures expire and then student figures break.
      let bareUrl = String(imageUrl || '').trim();
      try {
        if (bareUrl.startsWith('http')) {
          const u = new URL(bareUrl);
          if (u.pathname.startsWith('/uploads/')) bareUrl = u.pathname;
        } else {
          bareUrl = bareUrl.split('?')[0];
        }
      } catch {
        bareUrl = bareUrl.split('?')[0];
      }
      const token = getAuthToken();
      const response = await fetch(
        `${API_BASE_URL}/api/super-admin/exams/${selectedExam._id}/questions/${questionId}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ questionImage: bareUrl }),
        },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) {
        throw new Error(data?.message || 'Failed to assign figure');
      }
      patchLocalQuestion(questionId, { questionImage: bareUrl });
      const nextPool = examFigurePool.filter((img) => {
        const u = String(img.url || '').split('?')[0];
        return u !== bareUrl && String(img.url) !== imageUrl;
      });
      setExamFigurePool(nextPool);
      setFigureAssignQuestionId(null);
      // Best-effort sync pool on server (updateQuestion also $pulls)
      try {
        await persistExamFigurePool(selectedExam._id, nextPool);
      } catch {
        /* local state already updated */
      }
      toast({ title: 'Figure assigned', description: 'This image is removed from the free pool.' });
    } catch (error: any) {
      toast({
        title: 'Assign failed',
        description: error?.message || 'Could not assign figure',
        variant: 'destructive',
      });
    }
  };
  /**
   * Choosing an answer resolves an "answer needs checking" flag — a human just
   * decided it. Any other flag on the row (missing figure/passage) stays.
   */
  const setPdfRowAnswer = (index: number, value: string) =>
    setPdfQuestionRows((prev) =>
      prev.map((x, j) => {
        if (j !== index) return x;
        const flags = (x.validationFlags || []).filter((f) => f !== 'answer_conflict');
        return {
          ...x,
          correctAnswer: value,
          validationFlags: flags,
          validationNote: flags.length ? x.validationNote : '',
          solvable: flags.length === 0 ? true : x.solvable,
        };
      }),
    );
  const [pendingDeleteQuestion, setPendingDeleteQuestion] = useState<{ id: string; index: number } | null>(null);
  // Default ON: duplicate rows are uploaded instead of skipped.
  const [allowDuplicateQuestionsInCsv, setAllowDuplicateQuestionsInCsv] = useState(true);
  const pdfRowsMissingSubject = useMemo(
    () => pdfQuestionRows.length > 0 && pdfQuestionRows.some((r) => !String(r.subject || '').trim()),
    [pdfQuestionRows],
  );
  const pdfSubjectInvalidForUpload = useMemo(
    () => pdfQuestionRows.length > 0 && pdfQuestionRows.some((r) => !normalizePdfRowSubjectSlug(r.subject)),
    [pdfQuestionRows],
  );
  const [questionImageFile, setQuestionImageFile] = useState<File | null>(null);
  const [isUploadingQuestionImage, setIsUploadingQuestionImage] = useState(false);
  const [isCsvDialogOpen, setIsCsvDialogOpen] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [isUploadingCsv, setIsUploadingCsv] = useState(false);
  const [csvUploadResults, setCsvUploadResults] = useState<{ success: number; errors: string[] } | null>(null);
  const [questionFormData, setQuestionFormData] = useState(() => ({ ...EMPTY_QUESTION_FORM }));
  const questionFormDataLiveRef = useRef(questionFormData);
  questionFormDataLiveRef.current = questionFormData;
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const availableExamFigurePool = useMemo(() => {
    const editingImage = editingQuestionId
      ? String(questionFormData.questionImage || '').trim()
      : '';
    return examFigurePool.filter((img) => {
      const url = String(img.url || '').trim();
      if (!url) return false;
      if (paperImageUsageCount.has(url)) return false;
      if (editingImage && url === editingImage) return false;
      return true;
    });
  }, [examFigurePool, paperImageUsageCount, editingQuestionId, questionFormData.questionImage]);
  const questionFormRef = useRef<HTMLDivElement | null>(null);
  const questionsPanelScrollRef = useRef<HTMLDivElement | null>(null);
  const pendingScrollQuestionIdRef = useRef<string | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    examType: 'mains' as 'mains' | 'advanced' | 'weekend' | 'practice',
    classNumber: '',
    assignedClasses: [] as string[],
    subjects: [] as ExamSubjectValue[],
    maxAttempts: '1',
    board: 'ASLI_EXCLUSIVE_SCHOOLS',
    filterType: 'all-schools' as FilterType,
    selectedSchools: [] as string[],
    duration: '',
    totalQuestions: '',
    totalMarks: '',
    instructions: '',
    startDate: '',
    endDate: ''
  });

  useEffect(() => {
    fetchExams();
    fetchClassOptions();
  }, []);

  useEffect(() => {
    const raw = sessionStorage.getItem('examCalendarPrefill');
    if (!raw) return;
    try {
      const p = JSON.parse(raw) as {
        startDate?: string;
        endDate?: string;
        filterType?: FilterType;
        selectedSchools?: string[];
      };
      sessionStorage.removeItem('examCalendarPrefill');
      setFormData((prev) => ({
        ...prev,
        startDate: p.startDate ?? prev.startDate,
        endDate: p.endDate ?? prev.endDate,
        filterType: p.filterType ?? prev.filterType,
        selectedSchools: Array.isArray(p.selectedSchools) ? p.selectedSchools : prev.selectedSchools,
      }));
      setIsDialogOpen(true);
    } catch {
      sessionStorage.removeItem('examCalendarPrefill');
    }
  }, []);

  useEffect(() => {
    fetchSchools();
  }, []);

  const fetchQuestions = async (
    examId: string,
    opts?: { silent?: boolean; keepScrollToQuestionId?: string | null },
  ) => {
    const scrollEl = questionsPanelScrollRef.current;
    const savedScrollTop = scrollEl?.scrollTop ?? null;
    const focusQuestionId =
      opts?.keepScrollToQuestionId != null
        ? String(opts.keepScrollToQuestionId)
        : pendingScrollQuestionIdRef.current;

    if (!opts?.silent) {
      setIsLoadingQuestions(true);
    }
    try {
      const response = await fetch(`${API_BASE_URL}/api/super-admin/exams/${examId}/questions`, {
        credentials: 'include',
        headers: {
          ...authBearerHeaders(),
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          // Fill AR directions client-side so older saved questions still show them
          const raw = Array.isArray(data.data) ? data.data : [];
          setQuestions(
            raw.map((q: any) => {
              if (!questionLooksLikeAssertionReason(q)) return q;
              return {
                ...q,
                questionType: 'assertion_reason',
                sharedMatterKind: 'assertion_reason',
                sharedMatterId: q.sharedMatterId || 'AR1',
                sharedMatterText: arDirectionsForQuestion(q),
              };
            }),
          );
          const pool = Array.isArray(data.figurePool)
            ? data.figurePool
            : Array.isArray(data.meta?.figurePool)
              ? data.meta.figurePool
              : [];
          setExamFigurePool(
            pool
              .map((img: any, i: number) => ({
                url: String(img?.url || '').trim(),
                name: String(img?.name || '').trim() || `Fig ${i + 1}`,
                order: Number.isFinite(Number(img?.order)) ? Number(img.order) : i,
                key: String(img?.key || '').trim() || undefined,
              }))
              .filter((img: { url: string }) => Boolean(img.url)),
          );
          setFigureAssignQuestionId(null);

          // After edit/save, stay on the same question instead of jumping down the sheet.
          requestAnimationFrame(() => {
            if (focusQuestionId) {
              const target = document.getElementById(`exam-question-${focusQuestionId}`);
              if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                pendingScrollQuestionIdRef.current = null;
                return;
              }
            }
            if (scrollEl && savedScrollTop != null) {
              scrollEl.scrollTop = savedScrollTop;
            }
          });
        }
      } else {
        // If endpoint doesn't exist, fetch exam and get questions from there
        const examResponse = await fetch(`${API_BASE_URL}/api/super-admin/exams/${examId}`, {
          credentials: 'include',
          headers: {
            ...authBearerHeaders(),
            'Content-Type': 'application/json',
          },
        });
        if (examResponse.ok) {
          const examData = await examResponse.json();
          if (examData.success && examData.data.questions) {
            setQuestions(examData.data.questions);
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch questions:', error);
    } finally {
      if (!opts?.silent) {
        setIsLoadingQuestions(false);
      }
    }
  };

  const patchLocalQuestion = (questionId: string, patch: Record<string, unknown>) => {
    setQuestions((prev) =>
      prev.map((q) => (String(q._id) === String(questionId) ? { ...q, ...patch } : q))
    );
  };

  /** Click an option in the preview card to set (and persist) the correct answer. */
  const handleSetCorrectOption = async (question: any, optionTextValue: string) => {
    if (!selectedExam?._id || !question?._id) return;
    const text = String(optionTextValue || '').trim();
    if (!text) return;
    if (editingQuestionId) {
      toast({
        title: 'Finish editing first',
        description: 'Save or cancel the open editor, then click an option to change the answer.',
      });
      return;
    }
    const questionId = String(question._id);
    const qType = String(question.questionType || 'mcq');
    const rawOptions = Array.isArray(question.options) ? question.options : [];
    const optionTexts = rawOptions
      .map((o: unknown) => optionText(o).trim())
      .filter(Boolean);

    setSavingQuestionId(questionId);
    try {
      const token = getAuthToken();
      let correctAnswer: string | string[] = text;
      if (qType === 'multiple') {
        const prev = Array.isArray(question.correctAnswer)
          ? question.correctAnswer.map((a: unknown) => String(a ?? '').trim()).filter(Boolean)
          : question.correctAnswer != null && question.correctAnswer !== ''
            ? [String(question.correctAnswer).trim()]
            : [];
        const lower = text.toLowerCase();
        correctAnswer = prev.some((a: string) => a.toLowerCase() === lower)
          ? prev.filter((a: string) => a.toLowerCase() !== lower)
          : [...prev, text];
        if ((correctAnswer as string[]).length === 0) {
          toast({
            title: 'Keep at least one',
            description: 'Multiple-choice questions need at least one correct option.',
            variant: 'destructive',
          });
          return;
        }
      }

      const response = await fetch(
        `${API_BASE_URL}/api/super-admin/exams/${selectedExam._id}/questions/${questionId}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            questionType: qType,
            options: optionTexts.map((t: string) => ({ text: t, isCorrect: false })),
            correctAnswer,
          }),
        },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.success === false) {
        throw new Error(data.message || 'Failed to update correct answer');
      }
      if (Array.isArray(data.questions) && data.questions.length > 0) {
        setQuestions(data.questions);
      } else {
        await fetchQuestions(selectedExam._id, { silent: true });
      }
      toast({
        title: 'Correct answer updated',
        description:
          qType === 'multiple'
            ? 'Toggled correct option(s).'
            : `Marked “${text}” as correct.`,
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update correct answer',
        variant: 'destructive',
      });
    } finally {
      setSavingQuestionId(null);
    }
  };

  const handleSaveQuestionMeta = async (question: any) => {
    if (!selectedExam?._id || !question?._id) return;
    const questionId = String(question._id);
    setSavingQuestionId(questionId);
    try {
      const token = getAuthToken();
      const response = await fetch(
        `${API_BASE_URL}/api/super-admin/exams/${selectedExam._id}/questions/${questionId}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            displayOrder: Math.max(1, Number(question.displayOrder) || 1),
            sectionHeading: String(question.sectionHeading || '').trim(),
            subject: question.subject,
          }),
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.success === false) {
        throw new Error(data.message || 'Failed to update question');
      }
      if (Array.isArray(data.questions) && data.questions.length > 0) {
        setQuestions(data.questions);
        requestAnimationFrame(() => {
          document
            .getElementById(`exam-question-${questionId}`)
            ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
      } else if (data.data) {
        patchLocalQuestion(questionId, data.data);
        await fetchQuestions(selectedExam._id, {
          silent: true,
          keepScrollToQuestionId: questionId,
        });
      } else {
        await fetchQuestions(selectedExam._id, {
          silent: true,
          keepScrollToQuestionId: questionId,
        });
      }
      toast({
        title: 'Saved',
        description:
          data.message ||
          `Q${data.data?.displayOrder || question.displayOrder} updated (order + section).`,
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update question',
        variant: 'destructive',
      });
    } finally {
      setSavingQuestionId(null);
    }
  };

  const handleReorderQuestions = async (orderedIds: string[]) => {
    if (!selectedExam?._id || orderedIds.length === 0) return;
    setIsReorderingQuestions(true);
    try {
      const token = getAuthToken();
      const response = await fetch(
        `${API_BASE_URL}/api/super-admin/exams/${selectedExam._id}/questions/reorder`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ orderedIds }),
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.success === false) {
        throw new Error(data.message || 'Failed to reorder questions');
      }
      setQuestions(Array.isArray(data.data) ? data.data : questions);
      toast({ title: 'Order updated', description: 'Question display order saved.' });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to reorder',
        variant: 'destructive',
      });
      if (selectedExam?._id) await fetchQuestions(selectedExam._id, { silent: true });
    } finally {
      setIsReorderingQuestions(false);
    }
  };

  const handleMoveQuestion = async (index: number, direction: -1 | 1) => {
    const next = index + direction;
    if (next < 0 || next >= questions.length) return;
    const reordered = [...questions];
    const [item] = reordered.splice(index, 1);
    reordered.splice(next, 0, item);
    setQuestions(reordered.map((q, i) => ({ ...q, displayOrder: i + 1 })));
    await handleReorderQuestions(reordered.map((q) => String(q._id)));
  };

  const handleApplySubjectAsSection = async (question: any) => {
    const heading = subjectSectionLabel(question.subject);
    patchLocalQuestion(String(question._id), { sectionHeading: heading });
    await handleSaveQuestionMeta({ ...question, sectionHeading: heading });
  };

  const handleDownloadQuestionTemplate = () => {
    // Create CSV template for questions (questionCategory + difficulty feed Advanced analytics tables)
    const headers = [
      'questionText',
      'questionImage',
      'questionType',
      'subject',
      'displayOrder',
      'sectionHeading',
      'marks',
      'negativeMarks',
      'chapter',
      'difficulty',
      'questionCategory',
      'conceptType',
      'explanation',
      'option1',
      'option2',
      'option3',
      'option4',
      'correctAnswer',
      'correctAnswers',
      'integerAnswer',
    ];

    const mcqExample = [
      'Define electric current.',
      '',
      'mcq',
      'physics',
      '1',
      'Physics',
      '4',
      '1',
      'Current Electricity',
      'moderate',
      'Theory',
      'Concept',
      'Definition based',
      'Rate of flow of charge',
      'Rate of flow of energy',
      'Rate of flow of mass',
      'Rate of flow of momentum',
      '1',
      '',
      '',
    ];

    const multipleExample = [
      'Which are prime numbers?',
      '',
      'multiple',
      'maths',
      '2',
      'Maths',
      '2',
      '0.5',
      'Number Theory',
      'easy',
      'Theory',
      'Concept',
      'Prime numbers are divisible only by 1 and themselves',
      '2',
      '3',
      '4',
      '5',
      '',
      '0,1,3',
      '',
    ];

    const integerExample = [
      'Find the value of x when 2x = 10',
      '',
      'integer',
      'maths',
      '3',
      'Maths',
      '4',
      '1',
      'Algebra',
      'moderate',
      'Numerical',
      'Application',
      'Solve for x',
      '',
      '',
      '',
      '',
      '',
      '',
      '5',
    ];

    const diagramExample = [
      'Identify the labeled part in the circuit diagram',
      '',
      'mcq',
      'physics',
      '4',
      'Physics',
      '4',
      '1',
      'Electromagnetic Induction',
      'difficult',
      'Diagram',
      'Application',
      'Refer to figure in question paper',
      'Resistor',
      'Capacitor',
      'Inductor',
      'Battery',
      '2',
      '',
      '',
    ];
    
    const csvContent = [
      headers.join(','),
      mcqExample.join(','),
      multipleExample.join(','),
      integerExample.join(','),
      diagramExample.join(','),
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'question_template.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast({
      title: 'Template Downloaded',
      description:
        'Includes questionCategory (Numerical, Theory, Formula, Diagram, …) and difficulty (easy, moderate, difficult, highly_difficult) for Advanced analytics.',
    });
  };

  const handleQuestionCsvUpload = async () => {
    if (!questionCsvFile || !selectedExam) {
      toast({
        title: 'Validation Error',
        description: 'Please select a CSV file and ensure an exam is selected',
        variant: 'destructive'
      });
      return;
    }

    setIsUploadingQuestionCsv(true);
    setQuestionCsvUploadResults(null);
    
    try {
      const token = getAuthToken();
      const formData = new FormData();
      formData.append('file', questionCsvFile);
      formData.append('allowDuplicates', allowDuplicateQuestionsInCsv ? 'true' : 'false');

      const response = await fetch(`${API_BASE_URL}/api/super-admin/exams/${selectedExam._id}/questions/bulk-upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setQuestionCsvUploadResults({
          success: data.created || data.data?.length || 0,
          errors: data.errors || []
        });
        toast({
          title: 'Success',
          description: `Successfully created ${data.created || data.data?.length || 0} question(s)${data.errors?.length > 0 ? ` with ${data.errors.length} error(s)` : ''}`,
        });
        fetchQuestions(selectedExam._id);
        fetchExams(); // Refresh exam list to update question count
        // Reset file input
        setQuestionCsvFile(null);
        // Close dialog after 3 seconds if successful
        if (!data.errors || data.errors.length === 0) {
          setTimeout(() => {
            setQuestionCsvUploadResults(null);
          }, 3000);
        }
      } else {
        toast({
          title: 'Error',
          description: data.message || 'Failed to upload CSV file',
          variant: 'destructive'
        });
        setQuestionCsvUploadResults({
          success: 0,
          errors: [data.message || 'Upload failed']
        });
      }
    } catch (error) {
      console.error('Failed to upload question CSV:', error);
      toast({
        title: 'Error',
        description: 'Failed to upload CSV file. Please try again.',
        variant: 'destructive'
      });
      setQuestionCsvUploadResults({
        success: 0,
        errors: ['Network error: Failed to upload file']
      });
    } finally {
      setIsUploadingQuestionCsv(false);
    }
  };

  const mapPdfRowToQuestionPayload = (row: PdfQuestionRow) => {
    const optionTexts = [row.option1, row.option2, row.option3, row.option4]
      .map((x) => String(x || '').trim())
      .filter(Boolean);
    const options = optionTexts.map((text) => ({ text, isCorrect: false }));
    let type = row.questionType;
    const looksAr = questionLooksLikeAssertionReason({
      questionType: type,
      questionText: row.questionText,
      assertionText: row.assertionText,
      reasonText: row.reasonText,
      option1: row.option1,
      option2: row.option2,
      option3: row.option3,
      option4: row.option4,
    });
    if (looksAr) type = 'assertion_reason';

    const imageUrl = String(row.questionImage || '').trim();
    let sharedMatterText = String(row.sharedMatterText || row.passageText || '').trim();
    let sharedMatterId = String(row.sharedMatterId || row.passageId || '').trim();
    let sharedMatterKind = String(row.sharedMatterKind || '').trim();
    if (looksAr) {
      sharedMatterText = looksLikeArDirectionsText(sharedMatterText)
        ? sharedMatterText
        : DEFAULT_ASSERTION_REASON_DIRECTIONS;
      sharedMatterKind = 'assertion_reason';
      sharedMatterId = sharedMatterId || 'AR1';
    }
    const base = {
      questionText: String(row.questionText || '').trim(),
      questionType: type,
      subject: String(row.subject || availableQuestionSubjects[0] || 'maths').trim().toLowerCase(),
      marks: Number(row.marks || 1) || 1,
      negativeMarks: 0,
      explanation: String(row.explanation || '').trim() || undefined,
      board: selectedExam?.board,
      sharedMatterId: sharedMatterId || undefined,
      sharedMatterText: sharedMatterText || undefined,
      sharedMatterKind: sharedMatterKind || undefined,
      assertionText: String(row.assertionText || '').trim() || undefined,
      reasonText: String(row.reasonText || '').trim() || undefined,
      matchColumnI: Array.isArray(row.matchColumnI) && row.matchColumnI.length ? row.matchColumnI : undefined,
      matchColumnII: Array.isArray(row.matchColumnII) && row.matchColumnII.length ? row.matchColumnII : undefined,
      ...(imageUrl && type !== 'assertion_reason'
        ? {
            questionImage: imageUrl.startsWith('http')
              ? imageUrl.replace(API_BASE_URL, '')
              : imageUrl,
          }
        : {}),
      ...(Number.isFinite(Number(row.questionNumber))
        ? { displayOrder: Math.floor(Number(row.questionNumber)) }
        : {}),
    } as any;

    if (type === 'integer') {
      const raw = String(row.correctAnswer ?? row.integerAnswer ?? '').trim();
      const m = raw.replace(/,/g, '').match(/[+-]?\d+/);
      const n = m ? parseInt(m[0], 10) : Number.NaN;
      const needsReview = !Number.isFinite(n);
      const note = needsReview
        ? `⚠ Integer answer needs review (extracted: "${raw || 'empty'}").`
        : '';
      return {
        ...base,
        options: [],
        correctAnswer: needsReview ? 0 : n,
        explanation: [String(row.explanation || base.explanation || '').trim(), note]
          .filter(Boolean)
          .join('\n') || undefined,
      };
    }

    const answerText = String(row.correctAnswer || '').trim();
    if (type === 'multiple') {
      const answerSet = new Set(
        answerText
          .split(',')
          .map((x) => x.trim().toLowerCase())
          .filter(Boolean),
      );
      options.forEach((opt) => {
        if (answerSet.has(String(opt.text || '').trim().toLowerCase())) opt.isCorrect = true;
      });
      return {
        ...base,
        options,
        correctAnswer: options.filter((o) => o.isCorrect).map((o) => o.text),
      };
    }

    // mcq / assertion_reason / match_following
    const idx = options.findIndex((o) => String(o.text || '').trim().toLowerCase() === answerText.toLowerCase());
    if (idx >= 0) options[idx].isCorrect = true;
    else {
      // letter answer a/b/c/d
      const letter = answerText.match(/^([a-dA-D])(?:[\).:]|$)/)?.[1];
      if (letter) {
        const li = letter.toUpperCase().charCodeAt(0) - 65;
        if (li >= 0 && li < options.length) options[li].isCorrect = true;
      }
    }
    return {
      ...base,
      options,
      correctAnswer: options.find((o) => o.isCorrect)?.text || answerText,
    };
  };

  const handleExtractQuestionsFromPdf = async () => {
    if (!selectedExam || !questionPdfFile) {
      toast({
        title: 'Validation Error',
        description: 'Please select a PDF or Word (.docx) file and an exam.',
        variant: 'destructive'
      });
      return;
    }
    setIsExtractingPdfQuestions(true);
    setPdfQuestionRows([]);
    setPdfPaperImages([]);
    setPdfAssignTargetIdx(null);
    setPdfAnswerKeyMeta(null);
    setPdfShowFlaggedOnly(false);
    setPdfPreviewPage(1);
    try {
      const form = new FormData();
      form.append('file', questionPdfFile);
      // Fast extract by default (photos still captured). Append thoroughMode=true for slower verify.
      form.append('fastMode', 'true');
      const headers = authBearerHeaders();
      const examId = selectedExam._id;
      const startUrl = `${API_BASE_URL}/api/super-admin/exams/${examId}/questions/pdf-convert`;
      const startUrlAlt = `${API_BASE_URL}/api/super-admin/protected/exams/${examId}/questions/pdf-convert`;

      let res: Response = await fetch(startUrl, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: form,
      });
      let usedProtected = false;
      if (res.status === 404) {
        usedProtected = true;
        res = await fetch(startUrlAlt, {
          method: 'POST',
          headers,
          credentials: 'include',
          body: form,
        });
      }

      const parseJson = async (response: Response) => {
        const raw = await response.text();
        try {
          return raw ? JSON.parse(raw) : null;
        } catch {
          return { success: false, message: raw || `Request failed (${response.status})` };
        }
      };

      let data: any = await parseJson(res);
      if (!res.ok || !data?.success) {
        if (res.status === 504 || res.status === 502 || res.status === 408) {
          throw new Error(
            `Gateway timed out (${res.status}). Redeploy the API with async pdf-convert, or raise nginx proxy_read_timeout.`,
          );
        }
        throw new Error(data?.message || `Failed to extract questions from PDF (${res.status})`);
      }

      // Async job (202): short POST + poll — avoids the ~5 min nginx 504.
      if (data?.async && data?.jobId) {
        const jobId = String(data.jobId);
        const jobBase = usedProtected
          ? `${API_BASE_URL}/api/super-admin/protected/exams/${examId}/questions/pdf-convert/jobs/${jobId}`
          : `${API_BASE_URL}/api/super-admin/exams/${examId}/questions/pdf-convert/jobs/${jobId}`;
        const deadline = Date.now() + 30 * 60 * 1000;
        while (Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 2500));
          const pollRes = await fetch(jobBase, {
            method: 'GET',
            headers: authBearerHeaders(),
            credentials: 'include',
          });
          const poll = await parseJson(pollRes);
          if (pollRes.status === 404) {
            throw new Error(poll?.message || 'Extraction job expired. Please try again.');
          }
          if (poll?.status === 'failed' || poll?.success === false) {
            throw new Error(poll?.message || 'Extraction failed');
          }
          if (poll?.status === 'completed' && Array.isArray(poll?.data)) {
            data = poll;
            break;
          }
        }
        if (data?.status !== 'completed' && !Array.isArray(data?.data)) {
          throw new Error('Extraction is still running after 30 minutes. Check API logs and try again.');
        }
      }

      const rows = normalizeExtractedPdfRows(Array.isArray(data?.data) ? data.data : []);
      if (rows.length === 0) {
        throw new Error('No extractable questions found in this PDF. Please try a clearer PDF or different pages.');
      }
      setPdfQuestionRows(rows);
      const paperImages = Array.isArray(data?.meta?.paperImages)
        ? data.meta.paperImages
            .map((img: any) => ({
              url: String(img?.url || '').trim(),
              name: String(img?.name || '').trim() || undefined,
              order: Number.isFinite(Number(img?.order)) ? Number(img.order) : undefined,
              key: String(img?.key || '').trim() || undefined,
            }))
            .filter((img: { url: string }) => Boolean(img.url))
        : [];
      setPdfPaperImages(paperImages);
      setPdfAssignTargetIdx(null);
      const answerKeyMeta = data?.meta?.answerKey || null;
      setPdfAnswerKeyMeta(answerKeyMeta);
      const flagged = rows.filter((r: PdfQuestionRow) => r.solvable === false).length;
      const assigned = rows.filter((r: PdfQuestionRow) => String(r.questionImage || '').trim()).length;
      const keyUnusable = answerKeyMeta?.found && !answerKeyMeta?.applied;
      toast({
        title: keyUnusable ? 'Extracted — check the answers' : 'Extraction complete',
        description:
          `Extracted ${rows.length} question(s)` +
          (paperImages.length
            ? `, ${paperImages.length} figure(s) ready — assign from the strip above`
            : '') +
          (assigned ? `, ${assigned} already assigned` : '') +
          (flagged ? `, ${flagged} need review` : '') +
          '. ' +
          (keyUnusable ? `The printed answer key was not used: ${answerKeyMeta?.reason}. ` : '') +
          'Not saved yet — assign figures, then click Upload These Questions.',
        variant: keyUnusable ? 'destructive' : undefined,
      });
    } catch (error: any) {
      const raw = String(error?.message || '').trim();
      const isNetwork =
        /failed to fetch|networkerror|load failed|network request failed/i.test(raw) ||
        (error?.name === 'TypeError' && /fetch/i.test(raw));
      toast({
        title: 'Extraction failed',
        description: isNetwork
          ? 'Could not reach the API during upload/poll. Confirm api.aslilearn.ai is up, then redeploy the backend (async pdf-convert) if this still hits a 5-minute gateway timeout.'
          : raw || 'Gemini failed to extract questions.',
        variant: 'destructive',
      });
    } finally {
      setIsExtractingPdfQuestions(false);
    }
  };

  const handleDownloadExtractedCsv = () => {
    if (pdfQuestionRows.length === 0) return;
    const headers = [
      'questionText',
      'questionType',
      'subject',
      'marks',
      'option1',
      'option2',
      'option3',
      'option4',
      'correctAnswer',
      'explanation',
      'questionImage',
      'displayOrder',
    ];
    const sanitizeCsvCell = (v: unknown) =>
      String(v ?? '')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/\t/g, ' ')
        .trim();
    const escapeCsv = (v: unknown) => `"${sanitizeCsvCell(v).replace(/"/g, '""')}"`;
    const body = pdfQuestionRows.map((r, idx) => {
      const qn = Number(r.questionNumber);
      return [
        r.questionText,
        r.questionType,
        r.subject,
        r.marks,
        r.option1,
        r.option2,
        r.option3,
        r.option4,
        r.correctAnswer,
        r.explanation,
        r.questionImage || '',
        Number.isFinite(qn) && qn >= 1 ? Math.floor(qn) : idx + 1,
      ]
        .map(escapeCsv)
        .join(',');
    });
    const csv = [headers.join(','), ...body].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `pdf-extracted-questions-${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleUploadExtractedQuestions = async () => {
    if (!selectedExam || pdfQuestionRows.length === 0) return;
    if (pdfSubjectInvalidForUpload) {
      toast({
        title: 'Subject required',
        description:
          'Each question must have a valid subject: maths, physics, chemistry, or biology. Fill empty cells in the preview table.',
        variant: 'destructive',
      });
      return;
    }
    const shouldUpload = await confirm({
      title: 'Upload extracted questions?',
      description: `Upload ${pdfQuestionRows.length} extracted question(s) to this exam now?\n\nThis will immediately save them to the database (including figures and Assertion–Reason directions).`,
      confirmLabel: 'Upload',
    });
    if (!shouldUpload) return;
    setIsUploadingExtractedQuestions(true);
    try {
      // IMPORTANT: do NOT route through CSV bulk-upload — that path only accepts
      // mcq/multiple/integer and drops sharedMatter / assertion / match / images.
      const rows = normalizeExtractedPdfRows(pdfQuestionRows);
      const errors: string[] = [];
      let created = 0;
      const headers = {
        ...authBearerHeaders(),
        'Content-Type': 'application/json',
      };

      // Upload in small batches so we keep figures + AR fields without hammering the API
      const CONCURRENCY = 4;
      for (let i = 0; i < rows.length; i += CONCURRENCY) {
        const chunk = rows.slice(i, i + CONCURRENCY);
        const results = await Promise.all(
          chunk.map(async (row, chunkIdx) => {
            const idx = i + chunkIdx;
            try {
              const rowType = String(row.questionType || '').trim().toLowerCase();
              const hasArStem =
                rowType === 'assertion_reason' &&
                Boolean(String(row.assertionText || '').trim()) &&
                Boolean(String(row.reasonText || '').trim());
              if (
                !String(row.questionText || '').trim() &&
                !String(row.questionImage || '').trim() &&
                !hasArStem
              ) {
                return {
                  ok: false,
                  error: `Row ${idx + 1}: questionText, image, or Assertion+Reason required`,
                };
              }
              const payload = mapPdfRowToQuestionPayload(row as PdfQuestionRow);
              let res = await fetch(`${API_BASE_URL}/api/super-admin/exams/${selectedExam._id}/questions`, {
                method: 'POST',
                credentials: 'include',
                headers,
                body: JSON.stringify(payload),
              });
              if (res.status === 404) {
                res = await fetch(
                  `${API_BASE_URL}/api/super-admin/protected/exams/${selectedExam._id}/questions`,
                  {
                    method: 'POST',
                    credentials: 'include',
                    headers,
                    body: JSON.stringify(payload),
                  },
                );
              }
              const data = await res.json().catch(() => null);
              if (!res.ok || !data?.success) {
                return {
                  ok: false,
                  error: `Row ${idx + 1}: ${data?.message || `failed (${res.status})`}`,
                };
              }
              const warn =
                payload?.questionType === 'integer' &&
                /Integer answer needs review/i.test(String(payload?.explanation || ''))
                  ? `Row ${idx + 1}: Integer answer missing/invalid — saved as 0 (needs review)`
                  : undefined;
              return { ok: true, warn };
            } catch (e: any) {
              return { ok: false, error: `Row ${idx + 1}: ${e?.message || 'network error'}` };
            }
          }),
        );
        for (const r of results) {
          if (r.ok) {
            created += 1;
            if (r.warn) errors.push(r.warn);
          } else if (r.error) {
            errors.push(r.error);
          }
        }
      }

      setQuestionCsvUploadResults({ success: created, errors });
      let remainingPoolCount = 0;
      if (created > 0) {
        const assignedUrls = new Set(
          pdfQuestionRows
            .map((r) => String(r.questionImage || '').trim())
            .filter(Boolean),
        );
        const remainingPool = pdfPaperImages.filter(
          (img) => img.url && !assignedUrls.has(img.url),
        );
        remainingPoolCount = remainingPool.length;
        try {
          await persistExamFigurePool(selectedExam._id, remainingPool);
        } catch (poolErr: any) {
          console.warn('figure pool save failed', poolErr);
          setExamFigurePool(remainingPool);
        }
        setPdfQuestionRows([]);
        setPdfPaperImages([]);
        setPdfAssignTargetIdx(null);
      }
      await fetchQuestions(selectedExam._id);
      await fetchExams();
      toast({
        title: created > 0 ? 'Upload complete' : 'Upload failed',
        description:
          `Created ${created} question(s)${errors.length ? `, ${errors.length} error(s)` : ''}.` +
          (remainingPoolCount
            ? ` ${remainingPoolCount} figure(s) are at the top — click Select photo on a question, then pick an image.`
            : ''),
        variant: created > 0 ? 'default' : 'destructive',
      });
    } catch (error: any) {
      toast({
        title: 'Upload failed',
        description: error?.message || 'Could not upload extracted questions.',
        variant: 'destructive',
      });
    } finally {
      setIsUploadingExtractedQuestions(false);
    }
  };

  const handleDeleteQuestion = async () => {
    if (!selectedExam || !pendingDeleteQuestion) return;
    try {
      const token = getAuthToken();
      let res = await fetch(
        `${API_BASE_URL}/api/super-admin/exams/${selectedExam._id}/questions/${pendingDeleteQuestion.id}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        },
      );
      if (res.status === 404) {
        res = await fetch(
          `${API_BASE_URL}/api/super-admin/protected/exams/${selectedExam._id}/questions/${pendingDeleteQuestion.id}`,
          {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          },
        );
      }
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.message || 'Delete failed');
      setQuestions((prev) => prev.filter((q) => String(q._id) !== String(pendingDeleteQuestion.id)));
      setPendingDeleteQuestion(null);
      toast({
        title: 'Question deleted',
        description: 'Question deleted. Questions renumbered.',
      });
      await fetchExams();
    } catch (error: any) {
      toast({
        title: 'Delete failed',
        description: error?.message || 'Could not delete question.',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteAllQuestions = async () => {
    if (!selectedExam) return;
    if (questions.length === 0) {
      toast({
        title: 'No questions to delete',
        description: 'This exam does not have any questions yet.',
      });
      return;
    }

    const shouldDelete = await confirm({
      title: 'Delete all questions?',
      description: `Are you sure you want to delete all ${questions.length} question(s)? This cannot be undone.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!shouldDelete) return;

    setIsDeletingAllQuestions(true);
    try {
      const token = getAuthToken();
      let res = await fetch(`${API_BASE_URL}/api/super-admin/exams/${selectedExam._id}/questions`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 404) {
        res = await fetch(`${API_BASE_URL}/api/super-admin/protected/exams/${selectedExam._id}/questions`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
      }
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        throw new Error(data?.message || 'Failed to delete all questions');
      }

      setQuestions([]);
      setPendingDeleteQuestion(null);
      toast({
        title: 'All questions deleted',
        description: data?.message || 'All questions removed successfully.',
      });
      await fetchExams();
    } catch (error: any) {
      toast({
        title: 'Delete failed',
        description: error?.message || 'Could not delete all questions.',
        variant: 'destructive',
      });
    } finally {
      setIsDeletingAllQuestions(false);
    }
  };

  const parseCSVLine = (line: string) => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];
      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result.map((v) => v.replace(/^"|"$/g, ''));
  };

  const prefillQuestionFormFromCsv = async (file: File) => {
    try {
      // Prefill only works for plain-text CSV. .xlsx / .xls are binary zip
      // archives, so skip prefill for those — the server handles them fine.
      const nameLower = (file.name || '').toLowerCase();
      if (nameLower.endsWith('.xlsx') || nameLower.endsWith('.xls')) return;

      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((line) => line.trim());
      if (lines.length < 2) return;

      const normalizeHeader = (header: string) =>
        String(header || '')
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '');
      const headers = parseCSVLine(lines[0]).map((h) => normalizeHeader(h));
      const values = parseCSVLine(lines[1]);
      if (values.length !== headers.length) return;

      const row: Record<string, string> = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx] || '';
      });

      const getRowValue = (...keys: string[]) => {
        for (const key of keys) {
          const normalizedKey = normalizeHeader(key);
          if (row[normalizedKey] !== undefined && row[normalizedKey] !== '') {
            return row[normalizedKey];
          }
        }
        return '';
      };

      const questionTypeRaw = getRowValue('questionType', 'question_type', 'type').toLowerCase();
      const questionType = (questionTypeRaw === 'multiple' || questionTypeRaw === 'integer' || questionTypeRaw === 'mcq'
        ? questionTypeRaw
        : 'mcq') as 'mcq' | 'multiple' | 'integer';

      const optionValues = [
        getRowValue('option1', 'option_1', 'option 1', 'optiona', 'option_a', 'a'),
        getRowValue('option2', 'option_2', 'option 2', 'optionb', 'option_b', 'b'),
        getRowValue('option3', 'option_3', 'option 3', 'optionc', 'option_c', 'c'),
        getRowValue('option4', 'option_4', 'option 4', 'optiond', 'option_d', 'd'),
      ];
      const hasAnyOption = optionValues.some((opt) => String(opt || '').trim() !== '');
      const normalizedOptions = optionValues.map((opt) => String(opt || '').trim().toLowerCase());

      const toOptionIndexString = (token: string) => {
        const normalizedToken = String(token || '').trim().toLowerCase();
        if (!normalizedToken) return '';

        if (/^\d+$/.test(normalizedToken)) {
          const numeric = parseInt(normalizedToken, 10);
          if (numeric >= 0 && numeric < optionValues.length) return String(numeric);
          if (numeric >= 1 && numeric <= optionValues.length) return String(numeric - 1);
        }

        if (/^[a-z]$/.test(normalizedToken)) {
          const idx = normalizedToken.charCodeAt(0) - 97;
          if (idx >= 0 && idx < optionValues.length) return String(idx);
        }

        const optionMatch = normalizedToken.match(/^option\s*([a-z0-9])$/);
        if (optionMatch) {
          const optionToken = optionMatch[1];
          if (/^\d$/.test(optionToken)) {
            const n = parseInt(optionToken, 10);
            if (n >= 1 && n <= optionValues.length) return String(n - 1);
            if (n >= 0 && n < optionValues.length) return String(n);
          }
          if (/^[a-z]$/.test(optionToken)) {
            const idx = optionToken.charCodeAt(0) - 97;
            if (idx >= 0 && idx < optionValues.length) return String(idx);
          }
        }

        const textIndex = normalizedOptions.findIndex((opt) => opt !== '' && opt === normalizedToken);
        return textIndex >= 0 ? String(textIndex) : '';
      };

      const csvSubject = getRowValue('subject').trim().toLowerCase();
      const subject = availableQuestionSubjects.includes(csvSubject as any)
        ? csvSubject
        : (availableQuestionSubjects[0] || 'maths');

      let correctAnswer = '';
      let correctAnswers: string[] = [];
      let integerAnswer = '';
      if (questionType === 'multiple') {
        correctAnswers = (getRowValue('correctAnswers', 'correct_answers', 'correctanswer', 'answer') || '')
          .split(/[;,]/)
          .map((x) => toOptionIndexString(x))
          .filter((x) => x !== '');
        correctAnswers = Array.from(new Set(correctAnswers));
      } else if (questionType === 'integer') {
        integerAnswer = getRowValue('integerAnswer', 'integer_answer', 'correctanswer', 'answer');
      } else {
        correctAnswer = toOptionIndexString(getRowValue('correctanswer', 'correct_answer', 'answer'));
      }

      const resolvedQuestionType: 'mcq' | 'multiple' | 'integer' =
        questionType === 'mcq' && !hasAnyOption && integerAnswer
          ? 'integer'
          : questionType;

      setQuestionFormData((prev) => ({
        ...prev,
        questionText: getRowValue('questionText', 'question_text') || '',
        questionImage: getRowValue('questionImage', 'question_image') || '',
        questionType: resolvedQuestionType,
        subject,
        marks: getRowValue('marks') || '1',
        negativeMarks: getRowValue('negativeMarks', 'negative_marks') || '0',
        explanation: getRowValue('explanation') || '',
        options: optionValues,
        correctAnswer,
        correctAnswers,
        integerAnswer,
      }));
      toast({
        title: 'CSV Preview Loaded',
        description: 'First CSV row auto-filled in question form',
      });
    } catch (error) {
      console.error('Failed to prefill question form from CSV:', error);
    }
  };

  const resetQuestionForm = () => {
    setQuestionFormData({ ...EMPTY_QUESTION_FORM });
    setQuestionImageFile(null);
    setEditingQuestionId(null);
  };

  /**
   * Opens the editor inside the question's own card. It deliberately does not
   * scroll to the bottom add form — editing stays on this card only.
   */
  const handleEditQuestion = (q: any) => {
    if (!q?._id) return;
    const id = String(q._id);
    if (editingQuestionId === id) {
      handleCancelEditQuestion();
      return;
    }
    setEditingQuestionId(id);
    setQuestionFormData(buildQuestionFormFromExisting(q));
    setQuestionImageFile(null);
  };

  const handleRemoveQuestionImage = () => {
    setQuestionImageFile(null);
    setQuestionFormData((prev) => ({ ...prev, questionImage: '' }));
  };

  const handleCancelEditQuestion = () => {
    resetQuestionForm();
  };

  const handleAddQuestion = async (formOverride?: typeof EMPTY_QUESTION_FORM) => {
    if (!selectedExam) return;

    // Prefer explicit form from the inline editor. Ignore click-event accidental args.
    const form =
      formOverride &&
      typeof formOverride === 'object' &&
      'questionType' in formOverride &&
      'assertionText' in formOverride
        ? formOverride
        : questionFormDataLiveRef.current;

    // In PDF upload mode, treat "Add Question" as final save action
    // for extracted rows so users can confirm before persistence.
    if (!editingQuestionId && bulkQuestionUploadMode === 'pdf' && pdfQuestionRows.length > 0) {
      await handleUploadExtractedQuestions();
      return;
    }

    const isAr = String(form.questionType || '').toLowerCase() === 'assertion_reason';
    const arStem = resolveArStemFields(form);

    // Assertion–Reason: question text + image are both optional.
    // The stem is Assertion (A) + Reason (R) (or A:/R: inside question text).
    if (isAr) {
      if (!arStem.assertionText || !arStem.reasonText) {
        toast({
          title: 'Validation Error',
          description:
            'Fill Assertion (A) and Reason (R). Question text and image are optional for Assertion–Reason.',
          variant: 'destructive',
        });
        return;
      }
    } else if (String(form.questionType || '').toLowerCase() === 'match_following') {
      const colI = parseMatchColumnLines(form.matchColumnIText);
      const colII = parseMatchColumnLines(form.matchColumnIIText);
      if (!colI.length || !colII.length) {
        toast({
          title: 'Validation Error',
          description: 'Fill Column I and Column II (one item per line) for Match the Following.',
          variant: 'destructive',
        });
        return;
      }
    } else if (!String(form.questionText || '').trim() && !String(form.questionImage || '').trim()) {
      toast({
        title: 'Validation Error',
        description:
          'Add question text, or upload a question image (scroll to Question Image File). At least one is required.',
        variant: 'destructive',
      });
      return;
    }

    if (
      (form.questionType === 'mcq' ||
        form.questionType === 'multiple' ||
        form.questionType === 'assertion_reason' ||
        form.questionType === 'match_following') &&
      form.options.every((opt) => !opt.trim())
    ) {
      toast({
        title: 'Validation Error',
        description: 'At least one option is required for MCQ questions',
        variant: 'destructive',
      });
      return;
    }

    // Validate and format correct answer — always send option TEXT (not ambiguous parseInt indices)
    let correctAnswer: any;
    if (form.questionType === 'integer') {
      correctAnswer = parseInt(form.integerAnswer);
      if (isNaN(correctAnswer)) {
        toast({
          title: 'Validation Error',
          description: 'Please enter a valid integer answer',
          variant: 'destructive',
        });
        return;
      }
    } else if (form.questionType === 'multiple') {
      const selectedAnswers = form.correctAnswers
        .map((ans) => resolveAnswerAgainstOptions(ans, form.options))
        .filter(Boolean);
      if (selectedAnswers.length === 0) {
        toast({
          title: 'Validation Error',
          description: 'Please select at least one correct answer',
          variant: 'destructive',
        });
        return;
      }
      correctAnswer = selectedAnswers;
    } else {
      // Single MCQ / AR / Match — resolve to option text (supports a/b/c/d from uploads)
      const raw = String(form.correctAnswer || '').trim();
      if (!raw) {
        toast({
          title: 'Validation Error',
          description: 'Please select a correct answer',
          variant: 'destructive',
        });
        return;
      }
      correctAnswer = resolveAnswerAgainstOptions(raw, form.options) || raw;
      if (!correctAnswer) {
        toast({
          title: 'Validation Error',
          description: 'Please select a correct answer',
          variant: 'destructive',
        });
        return;
      }
    }

    // Format options for MCQ/Multiple - keep as array of objects with text
    const formattedOptions =
      form.questionType === 'integer'
        ? []
        : form.options
            .filter((opt) => opt.trim() !== '')
            .map((opt) => ({ text: opt.trim(), isCorrect: false }));

    const buildQuestionPayload = (replaceDuplicate = false) => {
      const editingRow = editingQuestionId
        ? questions.find((q: any) => String(q._id) === String(editingQuestionId))
        : null;
      const sectionHeading =
        String(editingRow?.sectionHeading || '').trim() || subjectSectionLabel(form.subject);
      const displayOrder = editingRow
        ? Math.max(1, Number(editingRow.displayOrder) || 1)
        : undefined;

      return {
        // AR may save with empty questionText — stem lives in assertionText / reasonText
        questionText: String(form.questionText || '').trim(),
        questionImage: String(form.questionImage || '').trim(),
        questionType: form.questionType,
        options: formattedOptions,
        correctAnswer,
        marks: Math.max(0, Number(form.marks) || 1),
        negativeMarks: Math.max(0, Math.abs(Number(form.negativeMarks) || 0)),
        explanation: form.explanation.trim() || undefined,
        subject: form.subject,
        sectionHeading,
        ...(displayOrder != null ? { displayOrder } : {}),
        board: selectedExam.board,
        sharedMatterId: form.sharedMatterId.trim() || undefined,
        sharedMatterText:
          form.sharedMatterText.trim() ||
          (form.questionType === 'assertion_reason' ? DEFAULT_ASSERTION_REASON_DIRECTIONS : '') ||
          undefined,
        sharedMatterKind: form.sharedMatterKind || undefined,
        assertionText: isAr ? arStem.assertionText : form.assertionText.trim() || undefined,
        reasonText: isAr ? arStem.reasonText : form.reasonText.trim() || undefined,
        matchColumnI: parseMatchColumnLines(form.matchColumnIText),
        matchColumnII: parseMatchColumnLines(form.matchColumnIIText),
        applySharedMatterToGroup: Boolean(form.sharedMatterId.trim()),
        replaceDuplicate,
      };
    };

    const handleQuestionSaved = (savedQuestionId?: string | null) => {
      const focusId = savedQuestionId ? String(savedQuestionId) : editingQuestionId;
      resetQuestionForm();
      if (focusId) pendingScrollQuestionIdRef.current = focusId;
      fetchQuestions(selectedExam._id, {
        silent: Boolean(focusId) || questions.length > 0,
        keepScrollToQuestionId: focusId,
      });
      fetchExams(); // Refresh exam list to update question count
    };

    setIsAddingQuestion(true);
    try {
      const token = getAuthToken();
      const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      };
      const isEditing = Boolean(editingQuestionId);
      const editingIdSnapshot = editingQuestionId ? String(editingQuestionId) : null;
      const endpoint = isEditing
        ? `${API_BASE_URL}/api/super-admin/exams/${selectedExam._id}/questions/${editingQuestionId}`
        : `${API_BASE_URL}/api/super-admin/exams/${selectedExam._id}/questions`;

      const response = await fetch(endpoint, {
        method: isEditing ? 'PUT' : 'POST',
        headers,
        body: JSON.stringify(buildQuestionPayload(false))
      });

      const data = await response.json();

      if (response.ok && data.success) {
        toast({
          title: 'Success',
          description: isEditing ? 'Question updated successfully' : 'Question added successfully'
        });
        if (isEditing) {
          handleQuestionSaved(editingIdSnapshot);
        } else {
          const createdId =
            data?.data?._id ||
            data?.question?._id ||
            (Array.isArray(data?.questions)
              ? data.questions[data.questions.length - 1]?._id
              : null);
          handleQuestionSaved(createdId ? String(createdId) : null);
        }
      } else if (
        !isEditing &&
        response.status === 409 &&
        String(data.message || '').toLowerCase().includes('duplicate')
      ) {
        const shouldReplace = await confirm({
          title: 'Replace duplicate question?',
          description:
            'A question with the same text AND image already exists for this exam/subject.\n\n' +
            'Confirm = DELETE the existing question and save this one.\n' +
            'Cancel = keep the existing question and do not save.\n\n' +
            'Different image questions are not duplicates — cancel if you meant to add a new question.',
          confirmLabel: 'Replace',
          destructive: true,
        });

        if (!shouldReplace) {
          return;
        }

        const replaceResponse = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(buildQuestionPayload(true))
        });
        const replaceData = await replaceResponse.json();

        if (replaceResponse.ok && replaceData.success) {
          toast({
            title: 'Success',
            description: 'Duplicate question replaced successfully'
          });
          const replacedId =
            replaceData?.data?._id ||
            replaceData?.question?._id ||
            null;
          handleQuestionSaved(replacedId ? String(replacedId) : null);
        } else {
          toast({
            title: 'Error',
            description: replaceData.message || 'Failed to replace duplicate question',
            variant: 'destructive'
          });
        }
      } else {
        toast({
          title: 'Error',
          description: data.message || (isEditing ? 'Failed to update question' : 'Failed to add question'),
          variant: 'destructive'
        });
      }
    } catch (error) {
      console.error('Failed to save question:', error);
      toast({
        title: 'Error',
        description: editingQuestionId ? 'Failed to update question' : 'Failed to add question',
        variant: 'destructive'
      });
    } finally {
      setIsAddingQuestion(false);
    }
  };

  const handleQuestionImageUpload = async (file: File) => {
    if (!file) return;

    setQuestionImageFile(file);
    setIsUploadingQuestionImage(true);
    try {
      const token = getAuthToken();
      const formData = new FormData();
      formData.append('image', file);

      const response = await fetch(`${API_BASE_URL}/api/super-admin/upload-question-image`, {
        method: 'POST',
        credentials: 'include',
        headers: authBearerHeaders(),
        body: formData
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to upload image');
      }

      // Prefer relative /uploads path so auth image loader can normalize consistently
      let storedUrl = String(data.imageUrl || '').trim();
      try {
        if (storedUrl.startsWith('http')) {
          const u = new URL(storedUrl);
          if (u.pathname.startsWith('/uploads/')) storedUrl = u.pathname;
        }
      } catch {
        /* keep as-is */
      }

      setQuestionFormData((prev) => ({
        ...prev,
        questionImage: storedUrl
      }));

      toast({
        title: 'Image uploaded',
        description: 'Question image saved successfully.'
      });
    } catch (error: any) {
      setQuestionImageFile(null);
      setQuestionFormData((prev) => ({ ...prev, questionImage: '' }));
      toast({
        title: 'Upload Error',
        description: error?.message || 'Failed to upload question image',
        variant: 'destructive'
      });
    } finally {
      setIsUploadingQuestionImage(false);
    }
  };

  const fetchClassOptions = async () => {
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE_URL}/api/super-admin/classes`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) return;
      const data = await response.json();
      const fromApi = Array.isArray(data?.data)
        ? data.data.map((c: unknown) => String(c || '').trim()).filter(Boolean)
        : [];
      setClassOptions((prev) => mergeClassOptionLists(DEFAULT_CLASS_OPTIONS, prev, fromApi));
    } catch (error) {
      console.error('Failed to fetch class options:', error);
    }
  };

  const fetchSchools = async () => {
    setIsLoadingSchools(true);
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE_URL}/api/super-admin/admins`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        const adminsList = Array.isArray(data) ? data : (data.data || []);
        const mappedSchools = adminsList
          .map((admin: any) => ({
            id: admin.id || admin._id,
            name: admin.schoolName || admin.name,
            email: admin.email,
            board: admin.board
          }))
          .sort((a: any, b: any) =>
            normalizeDisplayText(a.name).localeCompare(
              normalizeDisplayText(b.name),
              undefined,
              { sensitivity: 'base' }
            )
          );
        setSchools(mappedSchools);
      }
    } catch (error) {
      console.error('Failed to fetch schools:', error);
    } finally {
      setIsLoadingSchools(false);
    }
  };

  const fetchExams = async () => {
    setIsLoading(true);
    try {
      const token = getAuthToken();
      let url = `${API_BASE_URL}/api/super-admin/exams`;
      
      console.log('🌐 Fetching exams from:', url);
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          const raw = (data.data || []) as Exam[];
          const fetchedExams = raw.map((ex) => {
            const labels = getExamClassStrings(ex);
            const normalizedSubjects = getExamSubjects(ex);
            return {
              ...ex,
              assignedClasses: labels,
              classNumber: labels[0] ?? ex.classNumber ?? '',
              subject: (normalizedSubjects[0] || ex.subject || 'maths') as ExamSubjectValue,
              subjects: normalizedSubjects.length > 0 ? normalizedSubjects : [(ex.subject || 'maths') as ExamSubjectValue],
            };
          });

          const examClassLabels = fetchedExams.flatMap((ex) => getExamClassStrings(ex));
          setClassOptions((prev) =>
            mergeClassOptionLists(DEFAULT_CLASS_OPTIONS, prev, examClassLabels),
          );

          // Note: Backend already filters by schoolIds, so no additional frontend filtering needed
          // The backend returns exams that are either:
          // 1. Available to all schools (isSchoolSpecific: false)
          // 2. Available to the selected schools (isSchoolSpecific: true AND targetSchools includes selected schools)

          setExams(fetchedExams);
        }
      } else {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
        console.error(
          '[exams] request failed',
          response.status,
          response.statusText,
          errorData,
          { hasToken: !!token }
        );
        const hint =
          response.status === 401 || response.status === 400
            ? ' Try logging out and logging in again on this site (production uses a different session than localhost).'
            : '';
        toast({
          title: 'Error',
          description: (errorData.message || `Failed to fetch exams (${response.status})`) + hint,
          variant: 'destructive'
        });
      }
    } catch (error: any) {
      console.error('Failed to fetch exams:', error);
      
      // Handle network errors specifically
      let errorMessage = 'Failed to fetch exams';
      
      if (error instanceof TypeError) {
        if (error.message === 'Failed to fetch' || error.message.includes('ERR_NAME_NOT_RESOLVED') || error.message.includes('ERR_NETWORK')) {
          errorMessage = 'Network error: Cannot connect to server. Please check your internet connection and try again.';
        } else {
          errorMessage = `Network error: ${error.message}`;
        }
      } else if (error instanceof Error) {
        errorMessage = error.message || 'Failed to fetch exams';
      }
      
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveExam = async () => {
    if (!formData.title || formData.assignedClasses.length === 0 || formData.subjects.length === 0 || !formData.maxAttempts || !formData.duration || !formData.totalQuestions || !formData.totalMarks || !formData.startDate || !formData.endDate) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in all required fields',
        variant: 'destructive'
      });
      return;
    }

    if ((parseInt(formData.maxAttempts, 10) || 0) < 1) {
      toast({
        title: 'Validation Error',
        description: 'No. of Attempts must be at least 1',
        variant: 'destructive'
      });
      return;
    }

    if ((parseInt(formData.duration, 10) || 0) < 1) {
      toast({
        title: 'Validation Error',
        description: 'Duration must be at least 1 minute',
        variant: 'destructive',
      });
      return;
    }

    if (!formData.board) {
      toast({
        title: 'Validation Error',
        description: 'Please select a board for school visibility',
        variant: 'destructive',
      });
      return;
    }

    if (formData.filterType === 'specific-schools' && formData.selectedSchools.length === 0) {
      toast({
        title: 'Validation Error',
        description: 'Please select at least one school',
        variant: 'destructive'
      });
      return;
    }

    setIsCreating(true);
    try {
      const token = getAuthToken();
      const normalizedSubjects = Array.from(
        new Set(
          formData.subjects
            .map((s) => String(s).trim().toLowerCase())
            .filter(Boolean)
        )
      ) as ExamSubjectValue[];

      // Prepare shared payload fields
      const payload: any = {
        title: formData.title,
        description: formData.description,
        examType: formData.examType,
        classNumber: formData.assignedClasses[0],
        assignedClasses: formData.assignedClasses,
        subject: normalizedSubjects[0],
        subjects: normalizedSubjects,
        maxAttempts: parseInt(formData.maxAttempts, 10),
        board: formData.board,
        duration: parseInt(formData.duration),
        totalQuestions: parseInt(formData.totalQuestions),
        totalMarks: parseInt(formData.totalMarks),
        instructions: formData.instructions,
        startDate: toIsoFromDateTimeLocal(formData.startDate),
        endDate: toIsoFromDateTimeLocal(formData.endDate)
      };
      console.log('🧾 Exam save payload:', payload);

      // Targeting:
      // - all-schools → every school on THIS exam board (isAllBoards=false)
      // - all-boards → every board (isAllBoards=true)
      // - specific-schools → listed school admin ids only
      if (formData.filterType === 'specific-schools' && formData.selectedSchools.length > 0) {
        payload.targetSchools = formData.selectedSchools;
        payload.isSchoolSpecific = true;
        payload.isAllBoards = false;
      } else if (formData.filterType === 'all-boards') {
        payload.isSchoolSpecific = false;
        payload.isAllBoards = true;
        payload.targetSchools = [];
      } else {
        payload.isSchoolSpecific = false;
        payload.isAllBoards = false;
        payload.targetSchools = [];
      }

      const endpoint = isEditing && editingExamId
        ? `${API_BASE_URL}/api/super-admin/exams/${editingExamId}`
        : `${API_BASE_URL}/api/super-admin/exams`;
      console.log('🌐 Exam save endpoint:', endpoint, 'method:', isEditing ? 'PUT' : 'POST');

      const response = await fetch(endpoint, {
        method: isEditing ? 'PUT' : 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      console.log('📦 Exam save response:', { status: response.status, ok: response.ok, data });

      if (response.ok && data.success) {
        toast({
          title: 'Success',
          description: isEditing ? 'Exam updated successfully' : 'Exam created successfully'
        });
        setIsDialogOpen(false);
        setIsEditing(false);
        setEditingExamId(null);
        setClassPickerSearch('');
        setFormSchoolSearch('');
        setFormData({
          title: '',
          description: '',
          examType: 'mains',
          classNumber: '',
          assignedClasses: [],
          subjects: [],
          maxAttempts: '1',
          board: 'ASLI_EXCLUSIVE_SCHOOLS',
          filterType: 'all-schools',
          selectedSchools: [],
          duration: '',
          totalQuestions: '',
          totalMarks: '',
          instructions: '',
          startDate: '',
          endDate: ''
        });
        await fetchExams();
      } else {
        toast({
          title: 'Error',
          description: data.message || 'Failed to save exam',
          variant: 'destructive'
        });
      }
    } catch (error) {
      console.error('Failed to create exam:', error);
      toast({
        title: 'Error',
        description: 'Failed to save exam',
        variant: 'destructive'
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleDownloadTemplate = () => {
    // Create CSV template
    const headers = [
      'title',
      'description',
      'examType',
      'classNumber',
      'subject',
      'maxAttempts',
      'board',
      'duration',
      'totalQuestions',
      'totalMarks',
      'instructions',
      'startDate',
      'endDate',
      'filterType',
      'targetSchools'
    ];
    
    const exampleRow = [
      'JEE Mains Mock Test 2024',
      'Mock test for JEE Mains preparation',
      'mains',
      '10',
      'maths',
      '1',
      'ASLI_EXCLUSIVE_SCHOOLS',
      '180',
      '90',
      '360',
      'Read all instructions carefully',
      '2024-12-25T10:00:00',
      '2024-12-25T13:00:00',
      'all-schools',
      ''
    ];
    
    const csvContent = [
      headers.join(','),
      exampleRow.join(',')
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'exam_template.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast({
      title: 'Template Downloaded',
      description: 'CSV template downloaded successfully. Fill it with your exam data and upload it.',
    });
  };

  const handleCsvUpload = async () => {
    if (!csvFile) {
      toast({
        title: 'Validation Error',
        description: 'Please select a CSV file',
        variant: 'destructive'
      });
      return;
    }

    setIsUploadingCsv(true);
    setCsvUploadResults(null);
    
    try {
      const token = getAuthToken();
      const formData = new FormData();
      formData.append('file', csvFile);

      const response = await fetch(`${API_BASE_URL}/api/super-admin/exams/bulk-upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setCsvUploadResults({
          success: data.created || data.data?.length || 0,
          errors: data.errors || []
        });
        toast({
          title: 'Success',
          description: `Successfully created ${data.created || data.data?.length || 0} exam(s)${data.errors?.length > 0 ? ` with ${data.errors.length} error(s)` : ''}`,
        });
        fetchExams();
        // Reset file input
        setCsvFile(null);
        // Close dialog after 3 seconds if successful
        if (!data.errors || data.errors.length === 0) {
          setTimeout(() => {
            setIsCsvDialogOpen(false);
            setCsvUploadResults(null);
          }, 3000);
        }
      } else {
        toast({
          title: 'Error',
          description: data.message || 'Failed to upload CSV file',
          variant: 'destructive'
        });
        setCsvUploadResults({
          success: 0,
          errors: [data.message || 'Upload failed']
        });
      }
    } catch (error) {
      console.error('Failed to upload CSV:', error);
      toast({
        title: 'Error',
        description: 'Failed to upload CSV file. Please try again.',
        variant: 'destructive'
      });
      setCsvUploadResults({
        success: 0,
        errors: ['Network error: Failed to upload file']
      });
    } finally {
      setIsUploadingCsv(false);
    }
  };

  const handleDeleteExam = async (examId: string) => {
    const ok = await confirm({
      title: 'Delete this exam?',
      description: 'Are you sure you want to delete this exam? This will also delete all associated questions.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;

    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE_URL}/api/super-admin/exams/${examId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setExams((prev) => prev.filter((exam) => exam._id !== examId));
        toast({
          title: 'Success',
          description: 'Exam deleted successfully'
        });
        fetchExams();
      } else {
        toast({
          title: 'Error',
          description: data.message || 'Failed to delete exam',
          variant: 'destructive'
        });
      }
    } catch (error) {
      console.error('Failed to delete exam:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete exam',
        variant: 'destructive'
      });
    }
  };

  const getExamTypeBadgeColor = (type: string) => {
    switch (type) {
      case 'mains': return 'bg-blue-100 text-blue-800';
      case 'advanced': return 'bg-purple-100 text-purple-800';
      case 'weekend': return 'bg-green-100 text-green-800';
      case 'practice': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getBoardBadgeColor = (board: string) => {
    switch (board) {
      case 'ASLI_EXCLUSIVE_SCHOOLS': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const filteredExams = exams.filter((exam) => {
    const schoolMatches = selectedSchool === 'all-schools'
      ? true
      : (!exam.isSchoolSpecific || (exam.targetSchools || []).some((school: any) => {
          const schoolId = typeof school === 'string' ? school : school._id;
          return schoolId === selectedSchool;
        }));

    const examClasses = getExamClassStrings(exam);
    const classMatches =
      selectedClass === 'all-classes'
        ? true
        : examClasses.map((c) => String(c)).includes(String(selectedClass));

    return schoolMatches && classMatches;
  });

  const filterSchoolOptions = useMemo(() => {
    const q = schoolFilterSearch.trim().toLowerCase();
    if (!q) return schools;
    return schools.filter((school) =>
      String(school.name || school.schoolName || '')
        .toLowerCase()
        .includes(q),
    );
  }, [schools, schoolFilterSearch]);

  const formSchoolOptions = useMemo(() => {
    const q = formSchoolSearch.trim().toLowerCase();
    const selected = new Set(formData.selectedSchools.map(String));
    const filtered = !q
      ? schools
      : schools.filter((school) =>
          String(school.name || school.schoolName || '')
            .toLowerCase()
            .includes(q),
        );
    const byName = (a: any, b: any) =>
      normalizeDisplayText(a.name || a.schoolName || '').localeCompare(
        normalizeDisplayText(b.name || b.schoolName || ''),
        undefined,
        { sensitivity: 'base' },
      );
    const checked = filtered.filter((s) => selected.has(String(s.id))).sort(byName);
    const unchecked = filtered.filter((s) => !selected.has(String(s.id))).sort(byName);
    return [...checked, ...unchecked];
  }, [schools, formSchoolSearch, formData.selectedSchools]);

  const filteredClassPickerOptions = useMemo(() => {
    const q = classPickerSearch.trim().toLowerCase();
    const base = mergeClassOptionLists(classOptions, formData.assignedClasses);
    if (!q) return base;
    return base.filter(
      (cls) =>
        cls.toLowerCase().includes(q) || `class ${cls}`.toLowerCase().includes(q),
    );
  }, [classOptions, formData.assignedClasses, classPickerSearch]);

  const dedupedFilteredExams = (() => {
    const byKey = new Map<string, Exam>();
    filteredExams.forEach((exam) => {
      const key = examDisplayDedupKey(exam);
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, exam);
        return;
      }

      const existingSubjectCount = getExamSubjects(existing).length;
      const nextSubjectCount = getExamSubjects(exam).length;
      if (nextSubjectCount > existingSubjectCount) {
        byKey.set(key, exam);
        return;
      }

      if (nextSubjectCount === existingSubjectCount && getExamTimestamp(exam) > getExamTimestamp(existing)) {
        byKey.set(key, exam);
      }
    });
    return Array.from(byKey.values());
  })();
  const groupedExams = dedupedFilteredExams.reduce((acc, exam) => {
    const examClassLabels = getExamClassStrings(exam);
    const classBuckets = examClassLabels.length > 0 ? examClassLabels : ['unassigned'];

    classBuckets.forEach((classKey) => {
      if (!acc[classKey]) {
        acc[classKey] = [];
      }
      acc[classKey].push(exam);
    });

    return acc;
  }, {} as Record<string, Exam[]>);
  Object.keys(groupedExams).forEach((classKey) => {
    groupedExams[classKey].sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  });
  const classSectionKeys = Object.keys(groupedExams).sort((a, b) => {
    if (a === 'unassigned') return 1;
    if (b === 'unassigned') return -1;
    const numA = parseInt(a, 10);
    const numB = parseInt(b, 10);
    const aNum = !Number.isNaN(numA) && String(numA) === a;
    const bNum = !Number.isNaN(numB) && String(numB) === b;
    if (aNum && bNum) return numA - numB;
    if (aNum) return -1;
    if (bNum) return 1;
    return a.localeCompare(b, undefined, { sensitivity: 'base' });
  });

  const classWiseStats = classOptions
    .map((cls) => {
      const count = exams.filter((exam) => {
        const classes = getExamClassStrings(exam);
        return classes.map((c) => String(c)).includes(String(cls));
      }).length;
      return { cls, count };
    })
    .filter((x) => x.count > 0);
  const availableQuestionSubjects = useMemo(() => {
    if (!selectedExam) {
      return EXAM_SUBJECTS.map((s) => s.value);
    }
    const subjects = getExamSubjects(selectedExam);
    return subjects.length > 0 ? subjects : EXAM_SUBJECTS.map((s) => s.value);
  }, [selectedExam]);

  useEffect(() => {
    if (!selectedExam) return;
    if (!availableQuestionSubjects.includes(questionFormData.subject as any)) {
      setQuestionFormData((prev) => ({
        ...prev,
        subject: availableQuestionSubjects[0] || 'maths',
      }));
    }
  }, [selectedExam, availableQuestionSubjects, questionFormData.subject]);

  const openCreateExamDialog = () => {
    setIsEditing(false);
    setEditingExamId(null);
    setClassPickerSearch('');
    setFormSchoolSearch('');
    setFormData({
      title: '',
      description: '',
      examType: 'mains',
      classNumber: '',
      assignedClasses: [],
      subjects: [],
      maxAttempts: '1',
      board: 'ASLI_EXCLUSIVE_SCHOOLS',
      filterType: 'all-schools',
      selectedSchools: [],
      duration: '',
      totalQuestions: '',
      totalMarks: '',
      instructions: '',
      startDate: '',
      endDate: ''
    });
    setIsDialogOpen(true);
  };

  const openEditExamDialog = (exam: Exam) => {
    const assigned = getExamClassStrings(exam);
    setIsEditing(true);
    setEditingExamId(exam._id);
    setClassPickerSearch('');
    setFormSchoolSearch('');
    setFormData({
      title: exam.title || '',
      description: exam.description || '',
      examType: exam.examType || 'mains',
      classNumber: assigned[0] || '',
      assignedClasses: assigned,
      subjects: getExamSubjects(exam),
      maxAttempts: String(exam.maxAttempts || 1),
      board: exam.board || 'ASLI_EXCLUSIVE_SCHOOLS',
      filterType: exam.isSchoolSpecific
        ? 'specific-schools'
        : exam.isAllBoards
          ? 'all-boards'
          : 'all-schools',
      selectedSchools: exam.targetSchools?.map((s: any) => s._id || s).filter(Boolean) || [],
      duration: String(exam.duration || ''),
      totalQuestions: String(exam.totalQuestions || ''),
      totalMarks: String(exam.totalMarks || ''),
      instructions: exam.instructions || '',
      startDate: toDateTimeLocalInput(exam.startDate),
      endDate: toDateTimeLocalInput(exam.endDate)
    });
    if (exam.isSchoolSpecific && schools.length === 0) {
      fetchSchools();
    }
    setIsDialogOpen(true);
  };

  return (
    <div className="p-3 sm:p-6 space-y-3 sm:space-y-4 lg:space-y-6">
      {ConfirmDialog}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl sm:text-2xl sm:text-3xl font-bold text-gray-900 break-words">Exam Management</h2>
          <p className="text-gray-600 mt-1">Create and manage exams</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <Dialog open={isCsvDialogOpen} onOpenChange={setIsCsvDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="border-green-500 text-green-600 hover:bg-green-50 w-full sm:w-auto">
                <Upload className="mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                Upload CSV
              </Button>
            </DialogTrigger>
            <DialogContent
              className="max-w-2xl w-[calc(100vw-1.5rem)] p-4 sm:p-8"
              onOpenAutoFocus={(e) => e.preventDefault()}
            >
              <DialogHeader className="pr-12 text-left">
                <DialogTitle className="text-base sm:text-lg leading-snug break-words">
                  Bulk Upload Exams via CSV
                </DialogTitle>
                <DialogDescription className="text-left text-xs sm:text-sm leading-relaxed break-words">
                  Upload a CSV file to create multiple exams at once. Download the template to see the required format.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 min-w-0">
                <div className="flex flex-col gap-3 p-3 sm:p-4 bg-blue-50 rounded-lg sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm">Need a template?</p>
                    <p className="text-xs text-gray-600 leading-relaxed break-words">
                      Download the CSV template with example data
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleDownloadTemplate}
                    className="w-full sm:w-auto shrink-0 border-blue-500 text-blue-600 hover:bg-blue-100"
                  >
                    <Download className="mr-2 h-4 w-4 shrink-0" />
                    Download Template
                  </Button>
                </div>
                
                <div className="min-w-0">
                  <Label htmlFor="csvFile" className="break-words">
                    Select Excel (.xlsx) or CSV File *
                  </Label>
                  <Input
                    id="csvFile"
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setCsvFile(file);
                        setCsvUploadResults(null);
                      }
                    }}
                    className="mt-1 max-w-full cursor-pointer file:mr-3 file:rounded-md file:border-0 file:bg-blue-100 file:px-3 file:py-2 file:text-xs sm:file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-200"
                  />
                  <p className={`text-xs mt-1 break-all ${csvFile ? 'text-blue-700 font-medium' : 'text-gray-500'}`}>
                    {csvFile ? `Selected file: ${csvFile.name}` : 'No file selected yet'}
                  </p>
                  <p className="text-xs text-gray-500 mt-1 break-words leading-relaxed">
                    File should contain: title, description, examType, classNumber, subject, maxAttempts, board, duration, totalQuestions, totalMarks, instructions, startDate, endDate, filterType (all-schools | all-boards | specific-schools), targetSchools
                  </p>
                  <p className="text-xs text-blue-700 mt-1 break-words leading-relaxed">
                    Tip: upload the original .xlsx file to keep characters like °, ², ³, θ, π, √, Δ, ≤, ≥. Plain CSV exports from Excel drop these.
                  </p>
                </div>

                {csvUploadResults && (
                  <div className={`p-4 rounded-lg ${csvUploadResults.errors.length > 0 ? 'bg-yellow-50 border border-yellow-200' : 'bg-green-50 border border-green-200'}`}>
                    <p className="font-semibold text-xs sm:text-sm mb-2">
                      {csvUploadResults.success > 0 ? `✅ Successfully created ${csvUploadResults.success} exam(s)` : '❌ No exams created'}
                    </p>
                    {csvUploadResults.errors.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs font-semibold text-yellow-800 mb-1">Errors:</p>
                        <ul className="text-xs text-yellow-700 list-disc list-inside space-y-1 max-h-32 overflow-y-auto">
                          {csvUploadResults.errors.map((error, idx) => (
                            <li key={idx}>{error}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => {
                  setIsCsvDialogOpen(false);
                  setCsvFile(null);
                  setCsvUploadResults(null);
                }}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleCsvUpload} 
                  disabled={isUploadingCsv || !csvFile}
                  className="bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white"
                >
                  {isUploadingCsv ? 'Uploading...' : 'Upload CSV'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreateExamDialog} className="bg-gradient-to-r from-sky-300 to-teal-400 hover:from-sky-400 hover:to-teal-500 text-white w-full sm:w-auto">
                <Plus className="mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                Create Exam
              </Button>
            </DialogTrigger>
          <DialogContent
            className="max-w-2xl max-h-[90vh] overflow-y-auto"
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <DialogHeader>
              <DialogTitle>{isEditing ? 'Edit Exam' : 'Create New Exam'}</DialogTitle>
              <DialogDescription>
                Create a new exam for students. You can make it available to all schools or specific schools only. Exams can be Mains, Advanced, Weekend, or Practice type.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="title">Exam Title *</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g., JEE Mains Mock Test 2024"
                />
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Brief description of the exam"
                  rows={3}
                />
              </div>
                <div>
                <Label htmlFor="filterType">Exam Visibility *</Label>
                  <Select
                  value={formData.filterType}
                  onValueChange={(value: FilterType) => {
                    setFormData({ 
                      ...formData, 
                      filterType: value,
                      selectedSchools: value !== 'specific-schools' ? [] : formData.selectedSchools
                    });
                    if (value === 'specific-schools' && schools.length === 0) {
                      fetchSchools();
                    }
                  }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                    <SelectItem value="all-schools">All schools on this board</SelectItem>
                    <SelectItem value="all-boards">All boards (every school)</SelectItem>
                    <SelectItem value="specific-schools">Specific schools only</SelectItem>
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-slate-500">
                  &quot;All schools on this board&quot; uses the Board below. Pick{' '}
                  <strong>CBSE</strong> (etc.) for curriculum schools, or{' '}
                  <strong>Asli Prep</strong> for exclusive Prep schools. Use{' '}
                  <strong>Specific schools</strong> to target by name.
                </p>
              </div>

              <div>
                <Label htmlFor="board">Board *</Label>
                <Select
                  value={formData.board}
                  onValueChange={(value) => setFormData({ ...formData, board: value })}
                  disabled={formData.filterType === 'all-boards'}
                >
                  <SelectTrigger id="board">
                    <SelectValue placeholder="Select board" />
                  </SelectTrigger>
                  <SelectContent>
                    {BOARDS.map((b) => (
                      <SelectItem key={b.value} value={b.value}>
                        {b.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {formData.filterType === 'all-boards' ? (
                  <p className="mt-1 text-xs text-slate-500">
                    All-boards exams appear for every school regardless of board.
                  </p>
                ) : null}
              </div>

              {formData.filterType === 'specific-schools' && (
                <div>
                  <Label htmlFor="schools">Select Schools *</Label>
                  <p className="mb-1 text-xs text-slate-500">
                    Selected schools stay at the top (A–Z within selected and unselected).
                  </p>
                  {isLoadingSchools ? (
                    <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs sm:text-sm text-gray-600">
                      <Loader2 className="h-3 w-3 sm:h-4 sm:w-4 animate-spin text-gray-500" />
                      <span>Loading schools...</span>
                    </div>
                  ) : (
                    <div className="space-y-2 rounded-md border p-3">
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                        <Input
                          id="schools"
                          value={formSchoolSearch}
                          onChange={(e) => setFormSchoolSearch(e.target.value)}
                          placeholder="Search schools..."
                          className="h-9 pl-8 text-xs sm:text-sm"
                        />
                      </div>
                      <div className="max-h-40 space-y-2 overflow-y-auto">
                        {schools.length === 0 ? (
                          <p className="text-xs sm:text-sm text-gray-500">No schools available</p>
                        ) : formSchoolOptions.length === 0 ? (
                          <p className="text-xs sm:text-sm text-gray-500">No schools match your search</p>
                        ) : (
                          formSchoolOptions.map((school) => {
                            const checked = formData.selectedSchools.includes(school.id);
                            return (
                            <div
                              key={school.id}
                              className={cn(
                                'flex items-center space-x-2 rounded-md px-1.5 py-1',
                                checked && 'bg-amber-50',
                              )}
                            >
                              <input
                                type="checkbox"
                                id={`school-${school.id}`}
                                checked={checked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setFormData({
                                      ...formData,
                                      selectedSchools: [...formData.selectedSchools, school.id],
                                    });
                                  } else {
                                    setFormData({
                                      ...formData,
                                      selectedSchools: formData.selectedSchools.filter(
                                        (id) => id !== school.id,
                                      ),
                                    });
                                  }
                                }}
                                className="h-3 w-3 rounded border border-gray-400 accent-orange-500 sm:h-4 sm:w-4"
                              />
                              <Label
                                htmlFor={`school-${school.id}`}
                                className="cursor-pointer text-xs sm:text-sm"
                              >
                                {school.name}
                              </Label>
                            </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}
                  {formData.filterType === 'specific-schools' && formData.selectedSchools.length === 0 && (
                    <p className="text-xs text-yellow-600 mt-1">⚠️ Please select at least one school</p>
                  )}
                </div>
              )}


              <div>
                <Label htmlFor="examType">Exam Type *</Label>
                <Select
                  value={formData.examType}
                  onValueChange={(value: any) => setFormData({ ...formData, examType: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXAM_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor="exam-class-select">Assigned Classes *</Label>
                  <Select
                    onValueChange={(cls) => {
                      if (!cls || formData.assignedClasses.includes(cls)) return;
                      const next = [...formData.assignedClasses, cls];
                      setFormData({ ...formData, assignedClasses: next, classNumber: next[0] || '' });
                      setClassPickerSearch('');
                    }}
                    onOpenChange={(open) => {
                      if (!open) setClassPickerSearch('');
                    }}
                  >
                    <SelectTrigger id="exam-class-select">
                      <SelectValue placeholder="Add a class from school classes…" />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      <div className="sticky top-0 z-10 border-b border-gray-100 bg-popover p-2">
                        <div className="relative">
                          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                          <Input
                            value={classPickerSearch}
                            onChange={(e) => setClassPickerSearch(e.target.value)}
                            placeholder="Search classes…"
                            className="h-8 pl-8 text-xs"
                            onKeyDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                      </div>
                      {filteredClassPickerOptions.length === 0 ? (
                        <div className="px-2 py-3 text-center text-xs text-gray-500">
                          No classes found
                        </div>
                      ) : (
                        filteredClassPickerOptions.map((cls) => (
                          <SelectItem
                            key={cls}
                            value={cls}
                            disabled={formData.assignedClasses.includes(cls)}
                          >
                            {`Class ${cls}`}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <p className="min-h-[2.5rem] text-xs leading-snug text-slate-500">
                    Includes classes created in school dashboards, plus grades 1–12.
                  </p>
                  <div className="flex min-h-[1.75rem] flex-wrap gap-2">
                    {formData.assignedClasses.map((cls) => (
                      <Badge key={cls} className="bg-sky-100 text-sky-700 font-semibold rounded-full">
                        {`Class ${cls}`}
                        <X className="ml-1 h-3 w-3 cursor-pointer" onClick={() => {
                          const next = formData.assignedClasses.filter((c) => c !== cls);
                          setFormData({ ...formData, assignedClasses: next, classNumber: next[0] || '' });
                        }} />
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor="exam-subject-select">Subjects *</Label>
                  {/* Pick-and-tag, matching Assigned Classes above. This used to
                      be a checkbox list inside a 128px box you had to scroll. */}
                  <Select
                    onValueChange={(value) => {
                      if (!value || formData.subjects.includes(value as any)) return;
                      setFormData({ ...formData, subjects: [...formData.subjects, value as any] });
                    }}
                  >
                    <SelectTrigger id="exam-subject-select">
                      <SelectValue placeholder="Add a subject from the list…" />
                    </SelectTrigger>
                    <SelectContent className="max-h-64">
                      {EXAM_SUBJECTS.map((subject) => (
                        <SelectItem
                          key={subject.value}
                          value={subject.value}
                          disabled={formData.subjects.includes(subject.value as any)}
                        >
                          {subject.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="min-h-[2.5rem] text-xs leading-snug text-slate-500">
                    Multiple subjects are saved under a single exam.
                  </p>
                  <div className="flex min-h-[1.75rem] flex-wrap gap-2">
                    {formData.subjects.map((value) => (
                      <Badge
                        key={value}
                        className="bg-orange-100 text-orange-700 font-semibold rounded-full"
                      >
                        {EXAM_SUBJECTS.find((s) => s.value === value)?.label || value}
                        <X
                          className="ml-1 h-3 w-3 cursor-pointer"
                          onClick={() =>
                            setFormData({
                              ...formData,
                              subjects: formData.subjects.filter((s) => s !== value),
                            })
                          }
                        />
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-start">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor="maxAttempts" className="text-sm font-semibold leading-none">
                    No. of Attempts *
                  </Label>
                  <Input
                    id="maxAttempts"
                    type="number"
                    min={1}
                    value={formData.maxAttempts}
                    onChange={(e) => setFormData({ ...formData, maxAttempts: e.target.value })}
                    placeholder="1"
                  />
                  <p className="min-h-[2.5rem] text-xs leading-snug text-slate-500">
                    How many times a student can take this exam.
                  </p>
                </div>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor="duration" className="text-sm font-semibold leading-none">
                    Duration (minutes) *
                  </Label>
                  <Input
                    id="duration"
                    type="number"
                    min={1}
                    step={1}
                    value={formData.duration}
                    onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                    placeholder="180"
                  />
                  <p className="min-h-[2.5rem] text-xs leading-snug text-slate-500">
                    Time limit once the student starts.
                  </p>
                </div>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor="totalQuestions" className="text-sm font-semibold leading-none">
                    Total Questions *
                  </Label>
                  <Input
                    id="totalQuestions"
                    type="number"
                    min={1}
                    value={formData.totalQuestions}
                    onChange={(e) => setFormData({ ...formData, totalQuestions: e.target.value })}
                    placeholder="90"
                  />
                  <p className="min-h-[2.5rem] text-xs leading-snug text-slate-500">
                    Maximum questions this exam may contain.
                  </p>
                </div>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor="totalMarks" className="text-sm font-semibold leading-none">
                    Total Marks *
                  </Label>
                  <Input
                    id="totalMarks"
                    type="number"
                    min={1}
                    value={formData.totalMarks}
                    onChange={(e) => setFormData({ ...formData, totalMarks: e.target.value })}
                    placeholder="360"
                  />
                  <p className="min-h-[2.5rem] text-xs leading-snug text-slate-500">
                    Maximum total marks across all questions.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:items-start">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor="startDate" className="text-sm font-semibold leading-none">
                    Start Date *
                  </Label>
                  <Input
                    id="startDate"
                    type="datetime-local"
                    className="asli-date-input !h-11 !min-h-[2.75rem] py-1.5 text-base"
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  />
                </div>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor="endDate" className="text-sm font-semibold leading-none">
                    End Date *
                  </Label>
                  <Input
                    id="endDate"
                    type="datetime-local"
                    className="asli-date-input !h-11 !min-h-[2.75rem] py-1.5 text-base"
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="instructions">Instructions</Label>
                <Textarea
                  id="instructions"
                  value={formData.instructions}
                  onChange={(e) => setFormData({ ...formData, instructions: e.target.value })}
                  placeholder="Exam instructions and guidelines"
                  rows={4}
                />
              </div>
            </div>
            <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              {isEditing && editingExamId ? (
                <Button
                  type="button"
                  variant="outline"
                  className="border-teal-200 text-teal-800 hover:bg-teal-50"
                  onClick={() => {
                    const exam =
                      exams.find((e) => String(e._id) === String(editingExamId)) ||
                      ({ _id: editingExamId, title: formData.title } as Exam);
                    setIsDialogOpen(false);
                    setSelectedExam(exam);
                    resetQuestionForm();
                    setEditingQuestionId(null);
                    setIsQuestionDialogOpen(true);
                    fetchQuestions(String(editingExamId));
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Questions
                </Button>
              ) : null}
              <Button onClick={handleSaveExam} disabled={isCreating} className="bg-gradient-to-r from-sky-300 to-teal-400 hover:from-sky-400 hover:to-teal-500 text-white">
                {isCreating ? (isEditing ? 'Updating...' : 'Creating...') : (isEditing ? 'Update Exam' : 'Create Exam')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      </div>

      {classWiseStats.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {classWiseStats.map((item) => (
            <Badge key={item.cls} className="bg-sky-100 text-sky-700 font-semibold rounded-full">
              {`Class ${item.cls} -> ${item.count} Exams`}
            </Badge>
          ))}
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-3">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 items-center">
          {/* Quick Add Questions Option */}
          {dedupedFilteredExams.length > 0 ? (
            <Select
              value=""
              onValueChange={(examId) => {
                const exam = dedupedFilteredExams.find(e => e._id === examId);
                if (exam) {
                  setSelectedExam(exam);
                  setIsQuestionDialogOpen(true);
                  fetchQuestions(exam._id);
                }
              }}
            >
              <SelectTrigger className="h-10 rounded-md border border-gray-300 bg-white text-xs sm:text-sm">
                <SelectValue placeholder="Quick Add Questions" />
              </SelectTrigger>
              <SelectContent>
                {dedupedFilteredExams.map((exam) => (
                  <SelectItem key={exam._id} value={exam._id}>
                    <div className="flex items-center gap-2">
                      <FileQuestion className="h-3.5 w-3.5" />
                      <span className="truncate">{exam.title}</span>
                      {exam.questions && exam.questions.length > 0 && (
                        <Badge variant="outline" className="ml-1 text-micro">
                          {exam.questions.length} Q
                        </Badge>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div />
          )}

          <Select
            value={selectedSchool}
            onValueChange={setSelectedSchool}
            onOpenChange={(open) => {
              if (!open) setSchoolFilterSearch('');
            }}
          >
            <SelectTrigger className="h-10 rounded-md border border-gray-300 bg-white text-xs sm:text-sm">
              <div className="flex min-w-0 items-center gap-2">
                <School className="h-3.5 w-3.5 shrink-0 text-gray-600" />
                <SelectValue placeholder="All Schools" />
              </div>
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <div className="sticky top-0 z-10 border-b border-gray-100 bg-popover p-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                  <Input
                    value={schoolFilterSearch}
                    onChange={(e) => setSchoolFilterSearch(e.target.value)}
                    placeholder="Search schools..."
                    className="h-8 pl-8 text-xs"
                    onKeyDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              </div>
              <SelectItem value="all-schools">All Schools</SelectItem>
              {filterSchoolOptions.length === 0 ? (
                <div className="px-2 py-3 text-center text-xs text-gray-500">No schools found</div>
              ) : (
                filterSchoolOptions.map((school) => (
                  <SelectItem key={school.id} value={school.id}>
                    {school.name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>

          <Select
            value={selectedClass}
            onValueChange={setSelectedClass}
            onOpenChange={(open) => {
              if (!open) setClassPickerSearch('');
            }}
          >
            <SelectTrigger className="h-10 rounded-md border border-gray-300 bg-white text-xs sm:text-sm">
              <div className="flex items-center gap-2">
                <GraduationCap className="h-3.5 w-3.5 text-gray-600" />
                <SelectValue placeholder="All Classes" />
              </div>
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <div className="sticky top-0 z-10 border-b border-gray-100 bg-popover p-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                  <Input
                    value={classPickerSearch}
                    onChange={(e) => setClassPickerSearch(e.target.value)}
                    placeholder="Search classes…"
                    className="h-8 pl-8 text-xs"
                    onKeyDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              </div>
              <SelectItem value="all-classes">All Classes</SelectItem>
              {(classPickerSearch.trim()
                ? classOptions.filter(
                    (cls) =>
                      cls.toLowerCase().includes(classPickerSearch.trim().toLowerCase()) ||
                      `class ${cls}`
                        .toLowerCase()
                        .includes(classPickerSearch.trim().toLowerCase()),
                  )
                : classOptions
              ).map((cls) => (
                <SelectItem key={cls} value={cls}>
                  {`Class ${cls}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex xl:justify-end">
            <Badge variant="outline" className="w-fit bg-white">
              {dedupedFilteredExams.length} {dedupedFilteredExams.length === 1 ? 'Exam' : 'Exams'}
            </Badge>
          </div>
        </div>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center gap-3 text-gray-600">
              <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 lg:h-6 lg:w-6 animate-spin text-orange-500" />
              <p className="text-xs sm:text-sm font-medium">Loading exams...</p>
            </div>
          </CardContent>
        </Card>
      ) : dedupedFilteredExams.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <BookOpen className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">No exams found</p>
            <p className="text-xs sm:text-sm text-gray-400 mt-2">
              Create your first exam to get started
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4 sm:space-y-6 lg:space-y-8">
          {classSectionKeys.map((classKey) => {
            const classLabel = classKey === 'unassigned' ? 'Unassigned Class' : `Class ${classKey}`;
            const classExams = groupedExams[classKey];

            return (
              <section key={classKey} className="space-y-5">
                <div className="border-b border-gray-200 pb-2">
                  <h3 className="text-base sm:text-lg font-semibold text-gray-900">{classLabel}</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                  {classExams.map((exam) => {
                        const examClassLabels = getExamClassStrings(exam);
                        const examSubjects = getExamSubjects(exam);

                        return (
                          <div
                            key={exam._id}
                            className="flex h-full flex-col rounded-xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md"
                          >
                            {/* Header — title + badges */}
                            <div className="px-4 pt-3 pb-2">
                              <p className="mb-1.5 text-sm font-bold leading-tight text-gray-900 line-clamp-2">{exam.title}</p>
                              <div className="flex flex-wrap gap-1">
                                <Badge className={`${getExamTypeBadgeColor(exam.examType)} border text-mini`}>
                                  {EXAM_TYPES.find(t => t.value === exam.examType)?.label}
                                </Badge>
                                {exam.isActive ? (
                                  <Badge className="bg-green-100 text-green-700 border border-green-200 text-mini">Active</Badge>
                                ) : (
                                  <Badge className="bg-gray-100 text-gray-600 border border-gray-200 text-mini">Inactive</Badge>
                                )}
                                {exam.isAllBoards ? (
                                  <Badge className="border border-violet-200 bg-violet-50 text-mini text-violet-800">All boards</Badge>
                                ) : exam.isSchoolSpecific ? (
                                  <SpecificSchoolsBadge
                                    targetSchools={exam.targetSchools}
                                    schoolDirectory={schools}
                                  />
                                ) : (
                                  <Badge className={`${getBoardBadgeColor(exam.board)} border text-mini`}>
                                    {BOARDS.find((b) => b.value === exam.board)?.label || exam.board || 'Board'}
                                  </Badge>
                                )}
                              </div>
                            </div>

                            {/* Body — grows to fill card height */}
                            <div className="flex flex-1 flex-col gap-2 px-4 pb-3">
                              {exam.description && (
                                <p className="text-xs text-gray-600 line-clamp-2">{exam.description}</p>
                              )}
                              <div className="space-y-1 text-xs text-gray-600">
                                <div className="flex items-center gap-1.5">
                                  <Clock className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                                  <span>{Number.isFinite(Number(exam.duration)) && Number(exam.duration) > 0 ? `${exam.duration} min` : 'Duration not set'}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <BookOpen className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                                  <span>
                                    {typeof exam.actualQuestionCount === 'number' ? `${exam.actualQuestionCount}/${exam.totalQuestions}` : exam.totalQuestions} questions · {typeof exam.actualMarksSum === 'number' ? `${exam.actualMarksSum}/${exam.totalMarks}` : exam.totalMarks} marks
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <Eye className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                                  <span>{exam.maxAttempts || 1} attempt(s)</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <Calendar className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                                  <span>{new Date(exam.startDate).toLocaleDateString()} – {new Date(exam.endDate).toLocaleDateString()}</span>
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {examSubjects.map((subj) => (
                                  <Badge key={`${exam._id}-s-${subj}`} variant="outline" className="text-micro bg-blue-50 text-blue-700 border-blue-200">
                                    {EXAM_SUBJECTS.find((x) => x.value === subj)?.label || normalizeDisplayText(subj)}
                                  </Badge>
                                ))}
                                {examClassLabels.length > 0
                                  ? examClassLabels.map((cls: string, idx: number) => (
                                      <Badge key={`${exam._id}-c-${idx}`} variant="outline" className="text-micro bg-gray-50">Class {cls}</Badge>
                                    ))
                                  : <Badge variant="outline" className="text-micro bg-gray-50">No Class Assigned</Badge>
                                }
                              </div>

                              {/* Spacer pushes buttons to bottom */}
                              <div className="flex-1" />

                              {/* Action buttons — always at bottom */}
                              <div className="flex items-center gap-1.5 border-t border-gray-100 pt-2.5 select-none">
                                <Button
                                  type="button"
                                  size="sm"
                                  className="h-7 flex-1 justify-center gap-1 bg-indigo-600 px-2 text-xs font-medium text-white hover:bg-indigo-700"
                                  onClick={() => openEditExamDialog(exam)}
                                >
                                  <Edit className="h-3 w-3 shrink-0" />
                                  Edit
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  className="h-7 flex-1 justify-center gap-1 bg-teal-600 px-2 text-xs font-medium text-white hover:bg-teal-700"
                                  onClick={() => {
                                    setSelectedExam(exam);
                                    resetQuestionForm();
                                    setEditingQuestionId(null);
                                    setIsQuestionDialogOpen(true);
                                    fetchQuestions(exam._id);
                                  }}
                                >
                                  <Plus className="h-3 w-3 shrink-0" />
                                  Add
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  className="h-7 flex-1 justify-center gap-1 border border-red-200 bg-red-50 px-2 text-xs font-medium text-red-600 hover:bg-red-100"
                                  onClick={() => handleDeleteExam(exam._id)}
                                >
                                  <Trash2 className="h-3 w-3 shrink-0" />
                                  Delete
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* Question Management Dialog — hide while fullscreen editor is open so it doesn't trap clicks */}
      <Dialog
        open={isQuestionDialogOpen && !studentPreviewOpen}
        onOpenChange={(open) => {
          // Opening fullscreen unmounts this dialog; ignore that so editor state is kept.
          if (!open && studentPreviewOpen) {
            return;
          }
          setIsQuestionDialogOpen(open);
          if (!open) {
            setQuestionCsvFile(null);
            setQuestionPdfFile(null);
            setQuestionCsvUploadResults(null);
            setPdfQuestionRows([]);
            setPdfPaperImages([]);
            setPdfAssignTargetIdx(null);
            setExamFigurePool([]);
            setFigureAssignQuestionId(null);
            setPdfAnswerKeyMeta(null);
            setPdfShowFlaggedOnly(false);
            setPdfPreviewPage(1);
            setBulkQuestionUploadMode('csv');
            setPendingDeleteQuestion(null);
            resetQuestionForm();
            setStudentPreviewOpen(false);
          }
        }}
      >
        <DialogContent
          className="!flex h-[min(96vh,920px)] max-h-[96vh] w-[calc(100vw-1rem)] max-w-[min(96vw,80rem)] flex-col gap-3 overflow-hidden !overflow-y-hidden rounded-2xl p-4 sm:gap-4 sm:p-6 lg:max-w-[min(96vw,80rem)]"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader className="shrink-0 space-y-1.5 text-left pr-12">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-800">
                  Super Admin Exam Editor
                </p>
                <DialogTitle className="text-xl sm:text-2xl">
                  {selectedExam?.title || 'Exam'}
                </DialogTitle>
                <DialogDescription className="text-sm text-stone-600">
                  Student exam layout with Super Admin controls — edit order, section, text, answers, and figures.
                </DialogDescription>
              </div>
              {questions.length > 0 ? (
                <AdminExamPreviewTriggerButton
                  className="shrink-0 border-indigo-300 bg-indigo-50 text-indigo-900 hover:bg-indigo-100"
                  label="Fullscreen editor"
                  onClick={() => {
                    setStudentPreviewIndex(0);
                    setStudentPreviewOpen(true);
                  }}
                />
              ) : null}
            </div>
          </DialogHeader>

          {availableExamFigurePool.length > 0 ? (
            <div
              className={`min-w-0 shrink-0 rounded-lg border px-3 py-2 ${
                figureAssignQuestionId
                  ? 'border-sky-400 bg-sky-50/90 ring-2 ring-sky-100'
                  : 'border-violet-200 bg-violet-50/50'
              }`}
            >
              <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-violet-950">
                    Paper figures — assign from here ({availableExamFigurePool.length} free)
                  </p>
                  <p className="text-[11px] text-violet-800">
                    {figureAssignQuestionId
                      ? 'Click a figure to attach it to the selected question. It will leave this strip.'
                      : 'Click Select photo on a question below, then pick a figure. Assigned images do not come back.'}
                    {availableExamFigurePool.length > 4 ? (
                      <span className="ml-1 font-medium text-violet-900">
                        Scroll sideways to see all figures →
                      </span>
                    ) : null}
                  </p>
                </div>
                {figureAssignQuestionId ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 shrink-0 text-xs"
                    onClick={() => setFigureAssignQuestionId(null)}
                  >
                    Cancel pick
                  </Button>
                ) : null}
              </div>
              <div
                className="w-full min-w-0 overflow-x-auto overflow-y-hidden overscroll-x-contain pb-1 [-webkit-overflow-scrolling:touch] [scrollbar-width:thin] [scrollbar-color:#a78bfa_#ede9fe]"
                style={{ WebkitOverflowScrolling: 'touch' }}
              >
                <div className="flex w-max min-w-full gap-2 pr-1">
                {availableExamFigurePool.map((img, i) => (
                  <button
                    key={img.key || img.url || i}
                    type="button"
                    className={`relative shrink-0 rounded-md border bg-white p-0.5 transition ${
                      figureAssignQuestionId
                        ? 'cursor-pointer border-sky-300 hover:border-sky-500 hover:ring-2 hover:ring-sky-200'
                        : 'border-slate-200'
                    }`}
                    title={img.name || `Figure ${i + 1}`}
                    onClick={() => {
                      if (!figureAssignQuestionId) {
                        toast({
                          title: 'Pick a question first',
                          description: 'Click Select photo on a question card, then select an image here.',
                        });
                        return;
                      }
                      void handleAssignFigureToSavedQuestion(figureAssignQuestionId, img.url);
                    }}
                  >
                    <AuthenticatedUploadImage
                      src={img.url}
                      alt={img.name || `Paper figure ${i + 1}`}
                      wrapperClassName="h-14 w-20 p-0"
                      className="h-[52px] w-full object-contain"
                      fallbackLabel="—"
                    />
                    <span className="mt-0.5 block max-w-[5rem] truncate text-[9px] leading-tight text-slate-600">
                      {img.name || `Fig ${i + 1}`}
                    </span>
                  </button>
                ))}
                </div>
              </div>
            </div>
          ) : null}

          <div
            ref={questionsPanelScrollRef}
            className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pr-1 [-webkit-overflow-scrolling:touch]"
          >
            {/* CSV Upload Section */}
            <div className="border-t pt-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Bulk Upload Questions via CSV</h3>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleDownloadQuestionTemplate}
                    className="border-blue-500 text-blue-600 hover:bg-blue-100"
                  >
                    <Download className="mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                    Download Template
                  </Button>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={bulkQuestionUploadMode === 'csv' ? 'default' : 'outline'}
                  onClick={() => setBulkQuestionUploadMode('csv')}
                >
                  Upload CSV/XLSX
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={bulkQuestionUploadMode === 'pdf' ? 'default' : 'outline'}
                  onClick={() => setBulkQuestionUploadMode('pdf')}
                >
                  Upload from PDF / Word
                </Button>
              </div>
              {bulkQuestionUploadMode === 'csv' ? (
              <div className="p-4 bg-blue-50 rounded-lg space-y-3">
                <div>
                  <Label htmlFor="questionCsvFile">Select Excel (.xlsx) or CSV File *</Label>
                  <Input
                    id="questionCsvFile"
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setQuestionCsvFile(file);
                        setQuestionCsvUploadResults(null);
                        prefillQuestionFormFromCsv(file);
                      }
                    }}
                    className="mt-1 cursor-pointer file:mr-3 file:rounded-md file:border-0 file:bg-blue-100 file:px-3 file:py-2 file:text-xs sm:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-200"
                  />
                  <p className={`text-xs mt-1 ${questionCsvFile ? 'text-blue-700 font-medium' : 'text-gray-500'}`}>
                    {questionCsvFile ? `Selected file: ${questionCsvFile.name}` : 'No file selected yet'}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Required: questionText (or questionImage), questionType (mcq | multiple | integer), subject, marks, answers.
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    <span className="font-semibold text-slate-700">questionCategory</span> (for Question-Type matrix): Numerical, Theory, Formula, Diagram, Graph, Assertion/Reason, Comprehension, Match the Following.
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    <span className="font-semibold text-slate-700">difficulty</span> (for Difficulty + Time Intelligence): easy, moderate, difficult, highly_difficult.
                  </p>
                  <p className="text-xs text-blue-700 mt-1">
                    Tip: upload the original .xlsx to preserve x², x³, θ, π, √, Δ, ≤, ≥. A plain Excel CSV export silently replaces these with "?".
                  </p>
                </div>
                <label className="flex items-center gap-2 text-xs sm:text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={allowDuplicateQuestionsInCsv}
                    onChange={(e) => setAllowDuplicateQuestionsInCsv(e.target.checked)}
                    className="h-3 w-3 sm:h-4 sm:w-4 rounded border border-gray-400 accent-orange-500"
                  />
                  Allow duplicate questions in this upload
                </label>
                {questionCsvUploadResults && (
                  <div className={`p-3 rounded-lg ${questionCsvUploadResults.errors.length > 0 ? 'bg-yellow-50 border border-yellow-200' : 'bg-green-50 border border-green-200'}`}>
                    <p className="font-semibold text-xs sm:text-sm mb-2">
                      {questionCsvUploadResults.success > 0 ? `✅ Successfully created ${questionCsvUploadResults.success} question(s)` : '❌ No questions created'}
                    </p>
                    {questionCsvUploadResults.errors.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs font-semibold text-yellow-800 mb-1">Errors:</p>
                        <ul className="text-xs text-yellow-700 list-disc list-inside space-y-1 max-h-24 overflow-y-auto">
                          {questionCsvUploadResults.errors.map((error, idx) => (
                            <li key={idx}>{error}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
                <Button
                  type="button"
                  onClick={handleQuestionCsvUpload}
                  disabled={isUploadingQuestionCsv || !questionCsvFile}
                  className="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white"
                >
                  {isUploadingQuestionCsv ? 'Uploading...' : 'Upload Questions CSV'}
                </Button>
              </div>
              ) : (
                <div className="p-4 bg-blue-50 rounded-lg space-y-3">
                  <div>
                    <Label htmlFor="questionPdfFile">Select question paper (PDF or Word) *</Label>
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsDraggingQuestionFile(true);
                      }}
                      onDragLeave={() => setIsDraggingQuestionFile(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setIsDraggingQuestionFile(false);
                        const dropped = e.dataTransfer.files?.[0];
                        if (dropped) selectQuestionPaperFile(dropped);
                      }}
                      className={`mt-1 rounded-lg border-2 border-dashed px-3 py-4 transition-colors ${
                        isDraggingQuestionFile
                          ? 'border-blue-500 bg-blue-100'
                          : 'border-blue-200 bg-white/60'
                      }`}
                    >
                      <p className="mb-2 text-center text-xs text-blue-800">
                        Drag &amp; drop a PDF or Word file here, or choose one below
                      </p>
                      <Input
                        id="questionPdfFile"
                        type="file"
                        accept=".pdf,application/pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        onChange={(e) => selectQuestionPaperFile(e.target.files?.[0] || null)}
                        className="cursor-pointer file:mr-3 file:rounded-md file:border-0 file:bg-blue-100 file:px-3 file:py-2 file:text-xs sm:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-200"
                      />
                    </div>
                    <p className={`text-xs mt-1 ${questionPdfFile ? 'text-blue-700 font-medium' : 'text-gray-500'}`}>
                      {questionPdfFile ? `Selected file: ${questionPdfFile.name}` : 'No file selected yet'}
                    </p>
                  </div>
                  <Button
                    type="button"
                    onClick={handleExtractQuestionsFromPdf}
                    disabled={isExtractingPdfQuestions || !questionPdfFile}
                    className="w-full bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-600 hover:to-blue-700 text-white"
                  >
                    {isExtractingPdfQuestions ? (
                      <span className="inline-flex items-center justify-center gap-2">
                        <Loader2 className="h-3 w-3 sm:h-4 sm:w-4 shrink-0 animate-spin" aria-hidden />
                        <span>Extracting questions from PDF/Word...</span>
                      </span>
                    ) : (
                      'Extract Questions from PDF or Word'
                    )}
                  </Button>
                  <p className="text-xs text-slate-500">
                    Tip: leave this tab open. PDF and Word (.docx) both work. Figures from the paper
                    appear in a strip at the top — use <span className="font-semibold">Select photo</span>{' '}
                    on each question to assign. Flagged rows need review before upload.
                  </p>

                  {pdfQuestionRows.length > 0 && (
                    <div className="space-y-3 rounded-md border border-blue-200 bg-white p-3">
                      <p className="text-xs text-blue-700">
                        Preview only: extracted questions are not saved until you click <span className="font-semibold">Upload These Questions</span>.
                      </p>
                      {availablePreviewPaperImages.length > 0 ? (
                        <div
                          className={`rounded-md border p-3 ${
                            pdfAssignTargetIdx != null
                              ? 'border-sky-400 bg-sky-50/80 ring-2 ring-sky-100'
                              : 'border-violet-200 bg-violet-50/40'
                          }`}
                        >
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="text-xs font-semibold text-violet-950">
                                Images from this paper ({availablePreviewPaperImages.length} free)
                              </p>
                              <p className="text-[11px] text-violet-800">
                                {pdfAssignTargetIdx != null
                                  ? `Click a figure to assign it to Q${
                                      Number(pdfQuestionRows[pdfAssignTargetIdx]?.questionNumber) > 0
                                        ? pdfQuestionRows[pdfAssignTargetIdx].questionNumber
                                        : pdfAssignTargetIdx + 1
                                    }. Assigned images leave this strip.`
                                  : 'Click Select photo on a question row, then pick a figure here. Once assigned, it will not show again.'}
                              </p>
                            </div>
                            {pdfAssignTargetIdx != null ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={() => setPdfAssignTargetIdx(null)}
                              >
                                Cancel pick
                              </Button>
                            ) : null}
                          </div>
                          <div className="flex gap-2 overflow-x-auto pb-1">
                            {availablePreviewPaperImages.map((img, i) => {
                              return (
                                <button
                                  key={img.key || img.url || i}
                                  type="button"
                                  title={
                                    pdfAssignTargetIdx != null
                                      ? `Assign to selected question`
                                      : img.name || `Figure ${i + 1}`
                                  }
                                  className={`relative shrink-0 rounded-md border bg-white p-1 transition ${
                                    pdfAssignTargetIdx != null
                                      ? 'cursor-pointer border-sky-300 hover:border-sky-500 hover:ring-2 hover:ring-sky-200'
                                      : 'border-slate-200'
                                  }`}
                                  onClick={() => {
                                    if (pdfAssignTargetIdx == null) {
                                      toast({
                                        title: 'Pick a question first',
                                        description:
                                          'Click “Select photo” on a row in the table, then select an image here.',
                                      });
                                      return;
                                    }
                                    assignPaperImageToPdfRow(pdfAssignTargetIdx, img.url);
                                  }}
                                >
                                  <AuthenticatedUploadImage
                                    src={img.url}
                                    alt={img.name || `Paper figure ${i + 1}`}
                                    wrapperClassName="h-20 w-28 p-0"
                                    className="h-[76px] w-full object-contain"
                                    fallbackLabel="—"
                                  />
                                  <span className="mt-0.5 block truncate text-[10px] text-slate-600">
                                    {img.name || `Fig ${i + 1}`}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ) : pdfPaperImages.length > 0 ? (
                        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                          All paper figures are assigned to questions.
                        </p>
                      ) : (
                        <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                          No figures were found in this paper. You can still upload an image per question if needed.
                        </p>
                      )}
                      {pdfAnswerKeyMeta?.found && !pdfAnswerKeyMeta?.applied && (
                        <div
                          role="alert"
                          className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-900"
                        >
                          <span className="font-semibold">Printed answer key was NOT used.</span>{' '}
                          {pdfAnswerKeyMeta.reason}. The answers below were worked out from the
                          questions themselves, so check them before uploading — especially any row
                          marked ⚠.
                        </div>
                      )}
                      {pdfAnswerKeyMeta?.applied && (pdfAnswerKeyMeta.conflictCount || 0) > 0 && (
                        <div
                          role="status"
                          className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950"
                        >
                          Printed answer key applied. On {pdfAnswerKeyMeta.conflictCount} question(s)
                          it disagrees with the answer read from the question — those rows are marked ⚠.
                        </div>
                      )}
                      {pdfRowsMissingSubject && (
                        <div
                          role="status"
                          className="rounded-md border border-yellow-300 bg-yellow-50 px-3 py-2 text-xs text-yellow-900"
                        >
                          Some questions have no subject detected. Please review and fill in the subject before
                          uploading.
                        </div>
                      )}
                      {pdfQuestionRows.some((r) => r.solvable === false) && (
                        <div
                          role="status"
                          className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950"
                        >
                          {(() => {
                            const answers = pdfFlaggedRows.filter((r) =>
                              (r.validationFlags || []).includes('answer_conflict'),
                            ).length;
                            const context = pdfFlaggedRows.length - answers;
                            const parts = [
                              answers ? `${answers} where the answer needs checking` : '',
                              context ? `${context} missing a case passage or diagram` : '',
                            ].filter(Boolean);
                            const numbers = pdfFlaggedRows
                              .map((r, i) => (Number(r.questionNumber) > 0 ? `Q${r.questionNumber}` : `row ${i + 1}`))
                              .join(', ');
                            return (
                              <>
                                <span className="font-semibold">
                                  {pdfFlaggedRows.length} question(s) need review
                                </span>{' '}
                                ({parts.join(', ')}): <span className="font-semibold">{numbers}</span>. Fix
                                them right here in the table below — the Answer column is editable.
                              </>
                            );
                          })()}
                          <button
                            type="button"
                            className="ml-2 underline underline-offset-2 font-semibold"
                            onClick={() => {
                              setPdfShowFlaggedOnly((v) => !v);
                              setPdfPreviewPage(1);
                            }}
                          >
                            {pdfShowFlaggedOnly ? 'Show all questions' : 'Show only these'}
                          </button>
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs sm:text-sm font-semibold text-slate-800">
                          Preview ({pdfQuestionRows.length} question{pdfQuestionRows.length === 1 ? '' : 's'}
                          {availablePreviewPaperImages.length
                            ? `, ${availablePreviewPaperImages.length} free figure${availablePreviewPaperImages.length === 1 ? '' : 's'}`
                            : ''}
                          {pdfQuestionRows.filter((r) => r.questionImage).length
                            ? `, ${pdfQuestionRows.filter((r) => r.questionImage).length} assigned`
                            : ''}
                          )
                        </p>
                        <div className="flex gap-2">
                          <Button type="button" size="sm" variant="outline" onClick={handleDownloadExtractedCsv}>
                            <Download className="mr-1 h-3.5 w-3.5" />
                            Download as CSV
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            onClick={handleUploadExtractedQuestions}
                            disabled={isUploadingExtractedQuestions || pdfSubjectInvalidForUpload}
                            className="bg-green-600 hover:bg-green-700 text-white"
                          >
                            {isUploadingExtractedQuestions ? 'Uploading...' : 'Upload These Questions'}
                          </Button>
                        </div>
                      </div>
                      <div className="overflow-x-auto border rounded-md">
                        <table className="w-full text-xs">
                          <thead className="bg-slate-50">
                            <tr>
                              <th className="text-left p-2">#</th>
                              <th className="text-left p-2">Question</th>
                              <th className="text-left p-2">Figure</th>
                              <th className="text-left p-2">Type</th>
                              <th className="text-left p-2">Subject</th>
                              <th className="text-left p-2">Marks</th>
                              <th className="text-left p-2">Answer</th>
                            </tr>
                          </thead>
                          <tbody>
                            {pdfVisibleRows
                              .slice((pdfPreviewPage - 1) * 10, pdfPreviewPage * 10)
                              .map(({ row, idx: globalIdx }) => {
                              const imgSrc = String(row.questionImage || '').trim();
                              const flagged = row.solvable === false;
                              return (
                              <tr
                                key={`${row.row}-${globalIdx}`}
                                className={`border-t ${flagged ? 'bg-amber-50/80' : ''}`}
                              >
                                <td className="p-2 whitespace-nowrap align-top">
                                  {/* the paper's printed number, so it matches the PDF */}
                                  {Number(row.questionNumber) > 0 ? `Q${row.questionNumber}` : globalIdx + 1}
                                  {flagged ? <span className="ml-1 text-amber-700">⚠</span> : null}
                                </td>
                                <td className="p-2 max-w-[360px]">
                                  <div className="truncate" title={row.questionText}>
                                    {row.passageText ? (
                                      <span className="text-[10px] uppercase tracking-wide text-blue-600 mr-1">
                                        [case]
                                      </span>
                                    ) : null}
                                    {row.questionText}
                                  </div>
                                  {flagged && row.validationNote ? (
                                    <div className="mt-1 text-[11px] font-medium text-amber-800">
                                      ⚠ {row.validationNote}
                                    </div>
                                  ) : null}
                                </td>
                                <td className="p-2 align-top min-w-[140px]">
                                  <div className="space-y-1.5">
                                    {imgSrc ? (
                                      <AuthenticatedUploadImage
                                        src={imgSrc}
                                        alt={`Q${row.questionNumber || globalIdx + 1} figure`}
                                        wrapperClassName="h-14 w-20 p-0.5"
                                        className="h-12 w-full object-contain"
                                        fallbackLabel="—"
                                      />
                                    ) : (
                                      <span className="text-slate-400">—</span>
                                    )}
                                    <div className="flex flex-wrap gap-1">
                                      {availablePreviewPaperImages.length > 0 ? (
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant={
                                            pdfAssignTargetIdx === globalIdx ? 'default' : 'outline'
                                          }
                                          className={`h-6 px-1.5 text-[10px] ${
                                            pdfAssignTargetIdx === globalIdx
                                              ? 'bg-sky-600 text-white hover:bg-sky-700'
                                              : ''
                                          }`}
                                          onClick={() =>
                                            setPdfAssignTargetIdx((prev) =>
                                              prev === globalIdx ? null : globalIdx,
                                            )
                                          }
                                        >
                                          {pdfAssignTargetIdx === globalIdx ? 'Selecting…' : 'Select photo'}
                                        </Button>
                                      ) : null}
                                      {imgSrc ? (
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="ghost"
                                          className="h-6 px-1.5 text-[10px] text-red-600"
                                          onClick={() =>
                                            updatePdfRow(globalIdx, { questionImage: '' })
                                          }
                                        >
                                          Clear
                                        </Button>
                                      ) : null}
                                    </div>
                                    <label className="block cursor-pointer text-[10px] text-slate-500 underline underline-offset-2">
                                      Upload file…
                                      <input
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={async (e) => {
                                          const file = e.target.files?.[0];
                                          e.target.value = '';
                                          if (!file) return;
                                          try {
                                            const token = getAuthToken();
                                            const formData = new FormData();
                                            formData.append('image', file);
                                            const response = await fetch(
                                              `${API_BASE_URL}/api/super-admin/upload-question-image`,
                                              {
                                                method: 'POST',
                                                credentials: 'include',
                                                headers: authBearerHeaders(),
                                                body: formData,
                                              },
                                            );
                                            const data = await response.json();
                                            if (!response.ok || !data.success) {
                                              throw new Error(data.message || 'Upload failed');
                                            }
                                            let storedUrl = String(data.imageUrl || '').trim();
                                            try {
                                              if (storedUrl.startsWith('http')) {
                                                const u = new URL(storedUrl);
                                                if (u.pathname.startsWith('/uploads/')) {
                                                  storedUrl = u.pathname;
                                                }
                                              }
                                            } catch {
                                              /* keep */
                                            }
                                            updatePdfRow(globalIdx, { questionImage: storedUrl });
                                          } catch (err: any) {
                                            toast({
                                              title: 'Upload failed',
                                              description: err?.message || 'Could not upload image',
                                              variant: 'destructive',
                                            });
                                          }
                                        }}
                                      />
                                    </label>
                                  </div>
                                </td>
                                <td className="p-2">{String(row.questionType || '').toUpperCase()}</td>
                                <td className="p-1 align-middle min-w-[120px]">
                                  <Input
                                    type="text"
                                    className="h-8 text-xs"
                                    value={row.subject}
                                    placeholder="e.g. maths"
                                    title="Click to edit subject (maths, physics, chemistry, biology)"
                                    onChange={(e) => updatePdfRow(globalIdx, { subject: e.target.value })}
                                  />
                                </td>
                                <td className="p-2">{row.marks}</td>
                                <td className="p-1 align-middle min-w-[200px]">
                                  {(() => {
                                    const opts = [row.option1, row.option2, row.option3, row.option4]
                                      .map((o) => String(o || '').trim())
                                      .filter(Boolean);
                                    // MCQ has exactly one right option, so pick it from a list —
                                    // free text here is how wrong answers get typed in.
                                    if (row.questionType === 'mcq' && opts.length >= 2) {
                                      const current = String(row.correctAnswer || '');
                                      return (
                                        <select
                                          className="h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-xs"
                                          value={current}
                                          title="Correct answer — change it here if it is wrong"
                                          onChange={(e) => setPdfRowAnswer(globalIdx, e.target.value)}
                                        >
                                          {!opts.includes(current) && (
                                            <option value={current}>{current || '— not set —'}</option>
                                          )}
                                          {opts.map((o, k) => (
                                            <option key={k} value={o}>
                                              {String.fromCharCode(97 + k)}) {o}
                                            </option>
                                          ))}
                                        </select>
                                      );
                                    }
                                    return (
                                      <Input
                                        type="text"
                                        className="h-8 text-xs"
                                        value={String(row.correctAnswer || '')}
                                        title="Correct answer — edit if wrong"
                                        onChange={(e) => setPdfRowAnswer(globalIdx, e.target.value)}
                                      />
                                    );
                                  })()}
                                </td>
                              </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      {pdfVisibleRows.length > 10 && (
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={pdfPreviewPage <= 1}
                            onClick={() => setPdfPreviewPage((p) => Math.max(1, p - 1))}
                          >
                            Prev
                          </Button>
                          <span className="text-xs text-slate-600">
                            Page {pdfPreviewPage} / {pdfPreviewTotalPages}
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={pdfPreviewPage >= pdfPreviewTotalPages}
                            onClick={() => setPdfPreviewPage((p) => p + 1)}
                          >
                            Next
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                  {questionCsvUploadResults && (
                    <div className={`p-3 rounded-lg ${questionCsvUploadResults.errors.length > 0 ? 'bg-yellow-50 border border-yellow-200' : 'bg-green-50 border border-green-200'}`}>
                      <p className="font-semibold text-xs sm:text-sm mb-2">
                        {questionCsvUploadResults.success > 0 ? `✅ Successfully created ${questionCsvUploadResults.success} question(s)` : '❌ No questions created'}
                      </p>
                      {questionCsvUploadResults.errors.length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs font-semibold text-yellow-800 mb-1">Row issues:</p>
                          <ul className="text-xs text-yellow-700 list-disc list-inside space-y-1 max-h-36 overflow-y-auto">
                            {questionCsvUploadResults.errors.map((error, idx) => (
                              <li key={idx}>{error}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Student paper + Super Admin edit controls */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-amber-200/80 bg-amber-50/50 px-4 py-3">
                <div>
                  <h3 className="text-base font-semibold text-stone-900">
                    Student paper view · {questions.length} questions
                  </h3>
                  <p className="mt-0.5 text-xs text-stone-600">
                    Same layout students see. Use the amber toolbar on each question to edit Super Admin details.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="text-red-600 border-red-200 hover:bg-red-50"
                  onClick={handleDeleteAllQuestions}
                  disabled={isDeletingAllQuestions || questions.length === 0}
                >
                  <Trash2 className="mr-1 h-3 w-3 sm:h-4 sm:w-4" />
                  {isDeletingAllQuestions ? 'Deleting...' : 'Delete All Questions'}
                </Button>
              </div>
              {isLoadingQuestions ? (
                <div className="text-center py-4 sm:py-6 lg:py-8">
                  <div className="w-6 h-6 sm:w-7 sm:h-7 lg:w-8 lg:h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                  <p className="text-gray-500">Loading questions...</p>
                </div>
              ) : questions.length === 0 ? (
                <div className="text-center py-4 sm:py-6 lg:py-8 text-gray-500">
                  <FileQuestion className="h-12 w-12 mx-auto mb-2 text-gray-400" />
                  <p>No questions added yet</p>
                  <p className="text-xs sm:text-sm mt-1">Upload a CSV file or add questions manually below</p>
                </div>
              ) : (
                <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-100/80 p-3 sm:p-4">
                  <p className="text-xs text-slate-600">
                    Set <strong>Order</strong> then Save. Use ↑↓ for one-step moves. Figures appear under the question text when attached.
                  </p>
                  {questions.map((q: any, idx: number) => {
                    const prev = idx > 0 ? questions[idx - 1] : null;
                    const heading = resolveQuestionSectionHeading(q);
                    const prevHeading = prev ? resolveQuestionSectionHeading(prev) : null;
                    const showSection = !prev || heading !== prevHeading;
                    const orderValue = Number(q.displayOrder) > 0 ? Number(q.displayOrder) : idx + 1;
                    const isEditingThis = editingQuestionId === String(q._id);
                    return (
                      <div
                        key={q._id || idx}
                        id={q._id ? `exam-question-${q._id}` : undefined}
                        className="space-y-2 scroll-mt-4"
                      >
                        {showSection && (
                          <div className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
                            {heading}
                          </div>
                        )}
                        <Card
                          className={`overflow-hidden border shadow-sm ${
                            isEditingThis
                              ? 'border-sky-400 ring-2 ring-sky-100'
                              : 'border-slate-200'
                          }`}
                        >
                          {/* Super Admin edit toolbar */}
                          <div className="border-b border-amber-100 bg-amber-50/90 px-3 py-2.5 sm:px-4">
                            <div className="mb-2 flex flex-wrap items-center gap-1.5">
                              <span className="rounded bg-amber-200/90 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-950">
                                Super Admin edit
                              </span>
                              <Badge variant="outline" className="font-semibold">
                                Q{orderValue}
                              </Badge>
                              <Badge
                                variant="outline"
                                className={
                                  q.questionType === 'mcq'
                                    ? 'bg-blue-100 text-blue-800'
                                    : q.questionType === 'multiple'
                                      ? 'bg-purple-100 text-purple-800'
                                      : 'bg-green-100 text-green-800'
                                }
                              >
                                {q.questionType?.toUpperCase() || 'MCQ'}
                              </Badge>
                              <Badge variant="outline" className="capitalize">
                                {q.subject || 'maths'}
                              </Badge>
                              <Badge variant="secondary">
                                {q.marks || 0} mark{q.marks !== 1 ? 's' : ''}
                              </Badge>
                              {q.questionImage ? (
                                <Badge variant="outline" className="bg-violet-100 text-violet-800">
                                  Figure attached
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="bg-slate-100 text-slate-600">
                                  No figure
                                </Badge>
                              )}
                              {q.negativeMarks > 0 && (
                                <Badge variant="destructive">
                                  -{q.negativeMarks} for wrong
                                </Badge>
                              )}
                            </div>
                            <div className="flex flex-wrap items-end gap-2">
                              <div className="w-20">
                                <Label className="text-[10px] text-stone-500">Order</Label>
                                <Input
                                  type="number"
                                  min={1}
                                  max={Math.max(1, questions.length)}
                                  value={orderValue}
                                  className="h-8 bg-white"
                                  disabled={Boolean(savingQuestionId) || isReorderingQuestions}
                                  onChange={(e) =>
                                    patchLocalQuestion(String(q._id), {
                                      displayOrder: Math.min(
                                        Math.max(1, questions.length),
                                        Math.max(1, parseInt(e.target.value, 10) || 1)
                                      ),
                                    })
                                  }
                                />
                              </div>
                              <div className="min-w-[140px] flex-1">
                                <Label className="text-[10px] text-stone-500">Section heading</Label>
                                <Input
                                  value={q.sectionHeading ?? ''}
                                  placeholder={subjectSectionLabel(q.subject)}
                                  className="h-8 bg-white"
                                  disabled={Boolean(savingQuestionId) || isReorderingQuestions}
                                  onChange={(e) =>
                                    patchLocalQuestion(String(q._id), {
                                      sectionHeading: e.target.value,
                                    })
                                  }
                                />
                              </div>
                              <div className="w-36">
                                <Label className="text-[10px] text-stone-500">Subject</Label>
                                <Select
                                  value={q.subject || 'maths'}
                                  onValueChange={(value) =>
                                    patchLocalQuestion(String(q._id), { subject: value })
                                  }
                                  disabled={Boolean(savingQuestionId) || isReorderingQuestions}
                                >
                                  <SelectTrigger className="h-8 bg-white">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {(availableQuestionSubjects.length
                                      ? availableQuestionSubjects
                                      : ['maths', 'physics', 'chemistry', 'biology']
                                    ).map((s) => (
                                      <SelectItem key={s} value={s}>
                                        {subjectSectionLabel(s)}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="flex flex-wrap items-center gap-1 pb-0.5">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-8"
                                  disabled={
                                    idx === 0 || Boolean(savingQuestionId) || isReorderingQuestions
                                  }
                                  onClick={() => handleMoveQuestion(idx, -1)}
                                  title="Move up"
                                >
                                  <ChevronUp className="h-4 w-4" />
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-8"
                                  disabled={
                                    idx === questions.length - 1 ||
                                    Boolean(savingQuestionId) ||
                                    isReorderingQuestions
                                  }
                                  onClick={() => handleMoveQuestion(idx, 1)}
                                  title="Move down"
                                >
                                  <ChevronDown className="h-4 w-4" />
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  className="h-8"
                                  disabled={Boolean(savingQuestionId) || isReorderingQuestions}
                                  onClick={() => handleApplySubjectAsSection(q)}
                                  title="Use subject name as section"
                                >
                                  Subject→Section
                                </Button>
                                {availableExamFigurePool.length > 0 ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className={`h-8 ${
                                      figureAssignQuestionId === String(q._id)
                                        ? 'border-sky-500 bg-sky-50 text-sky-700'
                                        : ''
                                    }`}
                                    disabled={Boolean(savingQuestionId) || isReorderingQuestions}
                                    onClick={() =>
                                      setFigureAssignQuestionId((prev) =>
                                        prev === String(q._id) ? null : String(q._id),
                                      )
                                    }
                                    title="Select a photo from the pool at the top"
                                  >
                                    {figureAssignQuestionId === String(q._id)
                                      ? 'Selecting…'
                                      : 'Select photo'}
                                  </Button>
                                ) : null}
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-8 border-indigo-200 text-indigo-800 hover:bg-indigo-50"
                                  disabled={Boolean(savingQuestionId) || isReorderingQuestions}
                                  onClick={() => {
                                    setStudentPreviewIndex(idx);
                                    setStudentPreviewOpen(true);
                                  }}
                                  title="Open full-page editor (student layout + Edit / figures)"
                                >
                                  <Maximize2 className="h-4 w-4" />
                                  <span className="ml-1">Fullscreen</span>
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className={`h-8 ${
                                    isEditingThis
                                      ? 'border-sky-500 bg-sky-50 text-sky-700'
                                      : ''
                                  }`}
                                  disabled={Boolean(savingQuestionId) || isReorderingQuestions}
                                  onClick={() => handleEditQuestion(q)}
                                  title={
                                    isEditingThis
                                      ? 'Cancel editing'
                                      : 'Edit question content on this card'
                                  }
                                >
                                  <Edit className="h-4 w-4" />
                                  <span className="ml-1">{isEditingThis ? 'Editing…' : 'Edit'}</span>
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  className="h-8 bg-sky-600 text-white hover:bg-sky-700"
                                  disabled={
                                    savingQuestionId === String(q._id) ||
                                    isReorderingQuestions ||
                                    (isEditingThis && isAddingQuestion)
                                  }
                                  onClick={() => {
                                    // While editing content, Save must persist the form — not only order/section.
                                    if (isEditingThis) {
                                      void handleAddQuestion(questionFormDataLiveRef.current);
                                      return;
                                    }
                                    void handleSaveQuestionMeta(q);
                                  }}
                                >
                                  {savingQuestionId === String(q._id) ||
                                  (isEditingThis && isAddingQuestion) ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Save className="h-4 w-4" />
                                  )}
                                  <span className="ml-1">Save</span>
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 text-red-400 hover:text-red-600"
                                  onClick={() =>
                                    setPendingDeleteQuestion({ id: String(q._id), index: idx })
                                  }
                                  aria-label={`Delete question ${orderValue}`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </div>

                          {/* Student exam body */}
                          <CardContent className="bg-white p-4 sm:p-6 lg:p-8">
                            {q.needsReview && !isEditingThis ? (
                              <div
                                role="alert"
                                className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900"
                              >
                                <span className="font-semibold">⚠ Answer not verified.</span>
                                <span>{q.reviewNote || 'Imported without a usable answer key — please confirm.'}</span>
                                <Button
                                  type="button"
                                  size="sm"
                                  className="ml-auto h-7 bg-amber-600 text-white hover:bg-amber-700"
                                  onClick={() => handleEditQuestion(q)}
                                >
                                  Check now
                                </Button>
                              </div>
                            ) : null}
                            {isEditingThis ? (
                              <InlineQuestionEditor
                                form={questionFormData}
                                setForm={setQuestionFormData}
                                saving={isAddingQuestion}
                                onSave={handleAddQuestion}
                                onCancel={handleCancelEditQuestion}
                                onUploadImage={handleQuestionImageUpload}
                                onRemoveImage={handleRemoveQuestionImage}
                                uploadingImage={isUploadingQuestionImage}
                                imageFileName={questionImageFile?.name}
                                paperImages={availableExamFigurePool}
                              />
                            ) : (
                            <>
                            <div className="mb-4 flex flex-wrap items-center gap-2">
                              <Badge variant="outline" className="capitalize">
                                {q.subject || 'Unknown'}
                              </Badge>
                              <Badge variant="secondary">
                                {q.marks || 0} marks
                              </Badge>
                              {questionLooksLikeAssertionReason(q) ? (
                                <Badge className="bg-violet-100 text-violet-800 hover:bg-violet-100">
                                  Assertion–Reason
                                </Badge>
                              ) : null}
                              {q.questionType === 'match_following' ? (
                                <Badge className="bg-teal-100 text-teal-800 hover:bg-teal-100">
                                  Match the Following
                                </Badge>
                              ) : null}
                              {(q.negativeMarks || 0) > 0 && (
                                <Badge variant="destructive">
                                  -{q.negativeMarks} for wrong
                                </Badge>
                              )}
                            </div>

                            <div className="mb-6 flex items-start gap-3">
                              <span className="shrink-0 text-base font-semibold text-gray-900 sm:text-lg">
                                Q{orderValue}.
                              </span>
                              <div className="min-w-0 flex-1">
                                <SharedMatterCard
                                  text={
                                    questionLooksLikeAssertionReason(q)
                                      ? arDirectionsForQuestion(q)
                                      : q.sharedMatterText || q.passageText || ''
                                  }
                                  kind={
                                    questionLooksLikeAssertionReason(q)
                                      ? 'assertion_reason'
                                      : q.sharedMatterKind || (q.passageText ? 'case' : '')
                                  }
                                  subject={q.subject}
                                />

                                {(() => {
                                  const arPrev = resolveAssertionReasonDisplay(q);
                                  if (!(arPrev.assertion || arPrev.reason)) return null;
                                  return (
                                  <div className="mb-4 space-y-2 rounded-md border border-violet-100 bg-violet-50/60 p-3 text-sm text-slate-900">
                                    {arPrev.assertion ? (
                                      <p>
                                        <span className="font-semibold">A:</span>{' '}
                                        {formatChemistryText(arPrev.assertion, q.subject)}
                                      </p>
                                    ) : null}
                                    {arPrev.reason ? (
                                      <p>
                                        <span className="font-semibold">R:</span>{' '}
                                        {formatChemistryText(arPrev.reason, q.subject)}
                                      </p>
                                    ) : null}
                                  </div>
                                  );
                                })()}

                                {(Array.isArray(q.matchColumnI) && q.matchColumnI.length > 0) ||
                                (Array.isArray(q.matchColumnII) && q.matchColumnII.length > 0)
                                  ? !q.questionImage && (
                                  <MatchColumnsTable
                                    columnI={q.matchColumnI}
                                    columnII={q.matchColumnII}
                                    formatText={(t) => formatChemistryText(t, q.subject)}
                                  />
                                )
                                  : null}

                                {q.questionImage && !questionLooksLikeAssertionReason(q) ? (
                                  <div className="mb-4">
                                    <AuthenticatedUploadImage
                                      src={q.questionImage}
                                      alt={
                                        q.questionType === 'match_following'
                                          ? `Question ${orderValue} match table`
                                          : `Question ${orderValue} figure`
                                      }
                                      wrapperClassName="p-2 border-gray-200 bg-gray-50"
                                      className="max-h-[420px]"
                                      fallbackLabel="Figure failed to load"
                                    />
                                  </div>
                                ) : !questionLooksLikeAssertionReason(q) &&
                                  !q.questionImage &&
                                  (q.questionType === 'match_following' ||
                                    q.hasFigure ||
                                    (Array.isArray(q.validationFlags) &&
                                      q.validationFlags.includes('needs_figure')) ||
                                    /\b(diagram|figure|graph|vernier|calliper|caliper|screw\s*gauge|shown\s+below|as\s+shown|velocity[- ]time|Column\s*I|match\s+the\s+following)\b/i.test(
                                      String(q.questionText || ''),
                                    )) ? (
                                  <div className="mb-4 flex h-24 items-center justify-center rounded-lg border border-dashed border-amber-300 bg-amber-50 text-center text-xs text-amber-800">
                                    {q.questionType === 'match_following'
                                      ? 'Match table expected — click Edit to upload if it did not extract'
                                      : 'Diagram expected — click Edit to upload the figure if it did not extract'}
                                  </div>
                                ) : null}
                                {(() => {
                                  const arPrev = resolveAssertionReasonDisplay(q);
                                  return arPrev.showQuestionText && arPrev.questionText ? (
                                  <p className="mb-4 text-base text-gray-900 sm:text-lg">
                                    {formatChemistryText(arPrev.questionText, q.subject)}
                                  </p>
                                  ) : null;
                                })()}

                                {(() => {
                                  const arPrev = resolveAssertionReasonDisplay(q);
                                  return !arPrev.assertion &&
                                    !arPrev.reason &&
                                    !arPrev.questionText &&
                                    !q.questionImage ? (
                                  <div className="mb-4 flex h-24 items-center justify-center rounded-lg border border-gray-200 bg-gray-100 text-sm text-gray-500">
                                    No question content available
                                  </div>
                                  ) : null;
                                })()}

                                {(q.questionType === 'mcq' ||
                                  q.questionType === 'multiple' ||
                                  q.questionType === 'assertion_reason' ||
                                  q.questionType === 'match_following') &&
                                  q.options &&
                                  q.options.length > 0 && (
                                    <div className="space-y-3">
                                      <p className="text-[11px] text-slate-500">
                                        Click an option to mark it correct
                                        {q.questionType === 'multiple' ? ' (toggle)' : ''}.
                                      </p>
                                      {hasDuplicateOptionTexts(
                                        (q.options || []).map((o: any) =>
                                          String(o?.text ?? o ?? '').trim(),
                                        ),
                                      ) ? (
                                        <p className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">
                                          Duplicate option text detected — edit the question and make
                                          each option unique so only one answer highlights.
                                        </p>
                                      ) : null}
                                      {q.options.map((option: any, optIdx: number) => {
                                        const optText = String(option?.text ?? option ?? '').trim();
                                        const allTexts = (q.options || []).map((o: any) =>
                                          String(o?.text ?? o ?? '').trim(),
                                        );
                                        const answers = Array.isArray(q.correctAnswer)
                                          ? q.correctAnswer
                                          : q.correctAnswer != null && q.correctAnswer !== ''
                                            ? [q.correctAnswer]
                                            : [];
                                        const answerStrs = answers
                                          .map((ans: unknown) => String(ans ?? '').trim())
                                          .filter(Boolean);
                                        const isMulti = q.questionType === 'multiple';
                                        // Single-choice: only highlight the FIRST matching option
                                        // so duplicate option texts don't look like two answers selected.
                                        const firstTextMatchIdx =
                                          !isMulti && answerStrs.length === 1
                                            ? allTexts.findIndex(
                                                (t: string) =>
                                                  t.toLowerCase() === answerStrs[0].toLowerCase(),
                                              )
                                            : -1;
                                        const answerMatchesSomeOption = answerStrs.some((raw) =>
                                          allTexts.some(
                                            (t: string) => t.toLowerCase() === raw.toLowerCase(),
                                          ),
                                        );
                                        const isCorrect = answerStrs.length
                                          ? answerStrs.some((raw) => {
                                              if (raw.toLowerCase() === optText.toLowerCase()) {
                                                if (!isMulti && firstTextMatchIdx >= 0) {
                                                  return optIdx === firstTextMatchIdx;
                                                }
                                                return true;
                                              }
                                              if (answerMatchesSomeOption) return false;
                                              if (
                                                /^\d+$/.test(raw) &&
                                                parseInt(raw, 10) === optIdx
                                              ) {
                                                return true;
                                              }
                                              if (/^[a-d]$/i.test(raw)) {
                                                return (
                                                  raw.toLowerCase().charCodeAt(0) - 97 === optIdx
                                                );
                                              }
                                              return false;
                                            })
                                          : Boolean(option?.isCorrect);
                                        const letter = String.fromCharCode(65 + optIdx);
                                        const busy =
                                          Boolean(savingQuestionId) ||
                                          isReorderingQuestions ||
                                          Boolean(editingQuestionId);
                                        return (
                                          <button
                                            key={optIdx}
                                            type="button"
                                            disabled={busy || !optText}
                                            onClick={() => void handleSetCorrectOption(q, optText)}
                                            title={
                                              busy
                                                ? 'Wait until saving finishes'
                                                : `Mark ${letter} as correct`
                                            }
                                            className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                                              isCorrect
                                                ? 'border-emerald-300 bg-emerald-50'
                                                : 'border-transparent hover:border-slate-200 hover:bg-slate-50'
                                            } ${busy ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}
                                          >
                                            <span
                                              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-bold ${
                                                isCorrect
                                                  ? 'border-emerald-600 bg-emerald-600 text-white'
                                                  : 'border-slate-400 text-slate-600'
                                              }`}
                                            >
                                              {letter}
                                            </span>
                                            <span className="text-sm text-gray-900 sm:text-base">
                                              {formatChemistryText(optText, q.subject)}
                                            </span>
                                            {isCorrect ? (
                                              <Badge className="ml-auto shrink-0 bg-emerald-600 text-[10px] text-white">
                                                Correct
                                              </Badge>
                                            ) : null}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  )}

                                {q.questionType === 'integer' && (
                                  <div className="max-w-xs rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                                    <p className="text-xs font-semibold text-emerald-800">
                                      Correct answer
                                    </p>
                                    <p className="mt-1 text-base font-semibold text-emerald-950">
                                      {formatChemistryText(q.correctAnswer, q.subject)}
                                    </p>
                                  </div>
                                )}

                                {q.explanation ? (
                                  <div className="mt-4 rounded-lg border border-sky-100 bg-sky-50/80 px-3 py-2">
                                    <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-800">
                                      Explanation
                                    </p>
                                    <p className="mt-1 text-sm text-gray-700">{q.explanation}</p>
                                  </div>
                                ) : null}
                              </div>
                            </div>
                            </>
                            )}
                          </CardContent>
                        </Card>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Add new question only — edits happen inline on the question card */}
              <div ref={questionFormRef} className="border-t pt-6 space-y-4">
              {editingQuestionId ? (
                <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
                  <p className="font-medium">Editing a question in the list above</p>
                  <p className="mt-1 text-xs text-sky-800">
                    Change text, options, answer, or remove/replace the figure on that card, then click{' '}
                    <strong>Save</strong> there. The add-question form returns when you finish.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={handleCancelEditQuestion}
                  >
                    Cancel edit
                  </Button>
                </div>
              ) : null}
              {!editingQuestionId ? (
              <>
              <div className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-amber-100 bg-amber-50/60 px-3 py-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-900">
                    Super Admin · Add new question
                  </p>
                  <h3 className="font-semibold text-stone-900">
                    Add New Question (Single)
                  </h3>
                </div>
              </div>
              <div>
                <Label>Question Type *</Label>
                <Select
                  value={questionFormData.questionType}
                  onValueChange={(value: typeof EMPTY_QUESTION_FORM.questionType) => {
                    setQuestionFormData((prev) => {
                      const next: typeof EMPTY_QUESTION_FORM = {
                        ...prev,
                        questionType: value,
                        correctAnswer: '',
                        correctOptionIndex: -1,
                        correctAnswers: [],
                        integerAnswer: value === 'integer' ? prev.integerAnswer : '',
                      };
                      if (value !== 'integer') {
                        const opts = [...prev.options];
                        while (opts.length < 4) opts.push('');
                        next.options = opts.slice(0, Math.max(4, opts.length));
                      }
                      if (value === 'assertion_reason') {
                        if (!String(prev.sharedMatterText || '').trim()) {
                          next.sharedMatterText = DEFAULT_ASSERTION_REASON_DIRECTIONS;
                          next.sharedMatterKind = 'assertion_reason';
                        } else if (!prev.sharedMatterKind) {
                          next.sharedMatterKind = 'assertion_reason';
                        }
                        const parsed = parseAssertionReasonStem(prev.questionText);
                        if (parsed) {
                          if (!String(prev.assertionText || '').trim()) next.assertionText = parsed.assertion;
                          if (!String(prev.reasonText || '').trim()) next.reasonText = parsed.reason;
                        }
                      }
                      if (value === 'match_following') {
                        next.sharedMatterKind = prev.sharedMatterKind || 'match_following';
                      }
                      return next;
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mcq">Single MCQ</SelectItem>
                    <SelectItem value="multiple">Multiple MCQ</SelectItem>
                    <SelectItem value="integer">Integer Type</SelectItem>
                    <SelectItem value="assertion_reason">Assertion–Reason</SelectItem>
                    <SelectItem value="match_following">Match the Following</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Subject *</Label>
                <Select
                  value={questionFormData.subject}
                  onValueChange={(value) => setQuestionFormData({ ...questionFormData, subject: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableQuestionSubjects.map((subjectValue: string) => (
                      <SelectItem key={subjectValue} value={subjectValue}>
                        {EXAM_SUBJECTS.find((s) => s.value === subjectValue)?.label || normalizeDisplayText(subjectValue)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {(questionFormData.questionType === 'assertion_reason' ||
                questionFormData.questionType === 'match_following' ||
                questionFormData.sharedMatterText) && (
                <div>
                  <Label>Shared matter / directions (optional)</Label>
                  <Textarea
                    value={questionFormData.sharedMatterText}
                    onChange={(e) =>
                      setQuestionFormData({ ...questionFormData, sharedMatterText: e.target.value })
                    }
                    placeholder="Case passage / AR directions / Match directions"
                    rows={3}
                  />
                </div>
              )}

              {(questionFormData.questionType === 'assertion_reason' ||
                questionFormData.assertionText ||
                questionFormData.reasonText) && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label>Assertion (A) *</Label>
                    <Textarea
                      value={questionFormData.assertionText}
                      onChange={(e) =>
                        setQuestionFormData({ ...questionFormData, assertionText: e.target.value })
                      }
                      placeholder="Enter the Assertion statement"
                      rows={3}
                    />
                  </div>
                  <div>
                    <Label>Reason (R) *</Label>
                    <Textarea
                      value={questionFormData.reasonText}
                      onChange={(e) =>
                        setQuestionFormData({ ...questionFormData, reasonText: e.target.value })
                      }
                      placeholder="Enter the Reason statement"
                      rows={3}
                    />
                  </div>
                </div>
              )}

              {(questionFormData.questionType === 'match_following' ||
                questionFormData.matchColumnIText ||
                questionFormData.matchColumnIIText) && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label>Column I (one per line) *</Label>
                    <Textarea
                      value={questionFormData.matchColumnIText}
                      onChange={(e) =>
                        setQuestionFormData({ ...questionFormData, matchColumnIText: e.target.value })
                      }
                      placeholder={'A) Item one\nB) Item two'}
                      rows={4}
                    />
                  </div>
                  <div>
                    <Label>Column II (one per line) *</Label>
                    <Textarea
                      value={questionFormData.matchColumnIIText}
                      onChange={(e) =>
                        setQuestionFormData({ ...questionFormData, matchColumnIIText: e.target.value })
                      }
                      placeholder={'1) Match one\n2) Match two'}
                      rows={4}
                    />
                  </div>
                </div>
              )}

              <div>
                <Label>
                  {questionFormData.questionType === 'assertion_reason'
                    ? 'Question Text (Optional)'
                    : 'Question Text'}
                  {questionFormData.questionType === 'assertion_reason' ? (
                    <span className="ml-1 font-normal text-slate-500">— A & R fields are enough</span>
                  ) : questionFormData.questionType === 'match_following' ? (
                    <span className="ml-1 font-normal text-slate-500">— columns above + options</span>
                  ) : (
                    <span className="ml-1 font-normal text-slate-500">— text or image required</span>
                  )}
                </Label>
                <Textarea
                  value={questionFormData.questionText}
                  onChange={(e) => setQuestionFormData({ ...questionFormData, questionText: e.target.value })}
                  placeholder={
                    questionFormData.questionType === 'assertion_reason'
                      ? 'Optional. Leave blank if Assertion and Reason are filled above.'
                      : questionFormData.questionType === 'match_following'
                        ? 'Optional stem / instructions. Fill Column I and Column II above.'
                        : 'Enter the question text, or leave blank and upload a question image below...'
                  }
                  rows={4}
                />
                <p className="text-xs text-gray-500 mt-1">
                  {questionFormData.questionType === 'assertion_reason'
                    ? 'For Assertion–Reason, fill Assertion (A) and Reason (R) above; question text is optional.'
                    : questionFormData.questionType === 'match_following'
                      ? 'For Match the Following, fill Column I and Column II above, then pick the correct option.'
                      : 'Provide question text and/or a question image below. At least one is required for Single/Multiple MCQ and Integer questions.'}
                </p>
              </div>

              <div>
                <Label>
                  {questionFormData.questionType === 'assertion_reason'
                    ? 'Question Image File (Optional)'
                    : 'Question Image File'}
                  {questionFormData.questionType === 'assertion_reason' ? null : (
                    <span className="ml-1 font-normal text-slate-500">— use instead of or with text</span>
                  )}
                </Label>
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      handleQuestionImageUpload(file);
                    }
                  }}
                />
                <p className="text-xs text-gray-500 mt-1">
                  {questionFormData.questionType === 'assertion_reason'
                    ? 'Choose an image file. It will be uploaded and stored on your server.'
                    : 'Optional if question text is filled. Required if question text is empty.'}
                </p>
                {isUploadingQuestionImage && (
                  <p className="text-xs text-blue-600 mt-1">Uploading image...</p>
                )}
                {questionFormData.questionImage && (
                  <div className="mt-3 space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                      Figure preview
                    </p>
                    <AuthenticatedUploadImage
                      src={questionFormData.questionImage}
                      alt="Uploaded question preview"
                      className="max-h-48"
                      wrapperClassName="p-2 max-w-md"
                    />
                    <div className="flex items-center gap-2">
                      {questionImageFile?.name && (
                        <span className="text-xs text-gray-600">{questionImageFile.name}</span>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleRemoveQuestionImage}
                      >
                        Remove Image
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Options for MCQ/Multiple */}
              {(questionFormData.questionType === 'mcq' ||
                questionFormData.questionType === 'multiple' ||
                questionFormData.questionType === 'assertion_reason' ||
                questionFormData.questionType === 'match_following') && (
                <div className="space-y-3">
                  <Label>Options</Label>
                  {questionFormData.options.map((option, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Input
                        value={option}
                        onChange={(e) => {
                          const newOptions = [...questionFormData.options];
                          newOptions[index] = e.target.value;
                          setQuestionFormData({ ...questionFormData, options: newOptions });
                        }}
                        placeholder={`Option ${index + 1}`}
                      />
                      {(questionFormData.questionType === 'mcq' ||
                        questionFormData.questionType === 'assertion_reason' ||
                        questionFormData.questionType === 'match_following') && (
                        <input
                          type="radio"
                          name="correctAnswer"
                          checked={
                            questionFormData.correctAnswer === String(index) ||
                            questionFormData.correctAnswer === option
                          }
                          onChange={() =>
                            setQuestionFormData({
                              ...questionFormData,
                              correctAnswer: String(index),
                            })
                          }
                          className="h-3 w-3 sm:h-4 sm:w-4 border border-gray-400 accent-orange-500"
                        />
                      )}
                      {questionFormData.questionType === 'multiple' && (
                        <input
                          type="checkbox"
                          checked={questionFormData.correctAnswers.includes(String(index))}
                          onChange={(e) => {
                            const answers = e.target.checked
                              ? [...questionFormData.correctAnswers, String(index)]
                              : questionFormData.correctAnswers.filter((ans: string) => ans !== String(index));
                            setQuestionFormData({ ...questionFormData, correctAnswers: answers });
                          }}
                          className="h-3 w-3 sm:h-4 sm:w-4 rounded border border-gray-400 accent-orange-500"
                        />
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const newOptions = questionFormData.options.filter((_, i) => i !== index);
                          setQuestionFormData({ ...questionFormData, options: newOptions });
                        }}
                      >
                        <X className="h-3 w-3 sm:h-4 sm:w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setQuestionFormData({
                        ...questionFormData,
                        options: [...questionFormData.options, '']
                      });
                    }}
                  >
                    <Plus className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                    Add Option
                  </Button>
                </div>
              )}

              {/* Integer Answer */}
              {questionFormData.questionType === 'integer' && (
                <div>
                  <Label>Correct Answer (Integer) *</Label>
                  <Input
                    type="number"
                    value={questionFormData.integerAnswer}
                    onChange={(e) => setQuestionFormData({ ...questionFormData, integerAnswer: e.target.value })}
                    placeholder="Enter the integer answer"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <Label>Marks *</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.25"
                    value={questionFormData.marks}
                    onChange={(e) =>
                      setQuestionFormData({
                        ...questionFormData,
                        marks: sanitizeMarksInput(e.target.value),
                      })
                    }
                    placeholder="1"
                  />
                </div>
                <div>
                  <Label>Negative Marks</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.25"
                    value={questionFormData.negativeMarks}
                    onChange={(e) =>
                      setQuestionFormData({
                        ...questionFormData,
                        negativeMarks: sanitizeNegativeMarksInput(e.target.value),
                      })
                    }
                    placeholder="0"
                  />
                  <p className="text-mini text-gray-500 mt-1">
                    Enter positive value only. System applies it as deduction.
                  </p>
                </div>
              </div>

              <div>
                <Label>Explanation (Optional)</Label>
                <Textarea
                  value={questionFormData.explanation}
                  onChange={(e) => setQuestionFormData({ ...questionFormData, explanation: e.target.value })}
                  placeholder="Explain the correct answer..."
                  rows={3}
                />
              </div>
              </>
              ) : null}
            </div>
          </div>

          <DialogFooter className="shrink-0 border-t border-slate-200 bg-white pt-3 sm:pt-4">
            <Button variant="outline" onClick={() => setIsQuestionDialogOpen(false)}>
              Close
            </Button>
            {editingQuestionId ? (
              <>
                <Button variant="outline" onClick={handleCancelEditQuestion} disabled={isAddingQuestion}>
                  Cancel edit
                </Button>
                <Button onClick={() => void handleAddQuestion()} disabled={isAddingQuestion}>
                  {isAddingQuestion ? 'Saving...' : 'Save question'}
                </Button>
              </>
            ) : (
            <Button onClick={() => void handleAddQuestion()} disabled={isAddingQuestion}>
              {isAddingQuestion
                ? 'Adding...'
                : bulkQuestionUploadMode === 'pdf' && pdfQuestionRows.length > 0
                    ? 'Upload These Questions'
                    : 'Add Question'}
            </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!pendingDeleteQuestion} onOpenChange={(open) => !open && setPendingDeleteQuestion(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Question</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete Q{(pendingDeleteQuestion?.index ?? 0) + 1}? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={(e) => {
                e.preventDefault();
                handleDeleteQuestion();
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AdminExamStudentPreview
        open={studentPreviewOpen}
        examTitle={selectedExam?.title || 'Exam'}
        durationMinutes={Number(selectedExam?.duration) || undefined}
        questions={questions}
        initialIndex={studentPreviewIndex}
        onClose={() => {
          setFigureAssignQuestionId(null);
          if (editingQuestionId) handleCancelEditQuestion();
          setStudentPreviewOpen(false);
          // Restore the exam editor dialog underneath
          if (selectedExam?._id) setIsQuestionDialogOpen(true);
        }}
        onIndexChange={setStudentPreviewIndex}
        isEditingCurrent={Boolean(
          editingQuestionId &&
            questions[studentPreviewIndex] &&
            String(questions[studentPreviewIndex]._id) === String(editingQuestionId),
        )}
        editorSlot={
          editingQuestionId &&
          questions[studentPreviewIndex] &&
          String(questions[studentPreviewIndex]._id) === String(editingQuestionId) ? (
            <InlineQuestionEditor
              form={questionFormData}
              setForm={setQuestionFormData}
              saving={isAddingQuestion}
              onSave={handleAddQuestion}
              onCancel={handleCancelEditQuestion}
              onUploadImage={handleQuestionImageUpload}
              onRemoveImage={handleRemoveQuestionImage}
              uploadingImage={isUploadingQuestionImage}
              imageFileName={questionImageFile?.name}
              paperImages={availableExamFigurePool}
            />
          ) : null
        }
        figurePool={availableExamFigurePool}
        figureAssignActive={Boolean(figureAssignQuestionId)}
        onEditQuestion={(q) => {
          handleEditQuestion(q);
        }}
        onCancelEdit={handleCancelEditQuestion}
        onSelectPhoto={(q) => {
          const id = String(q._id || '');
          if (!id) return;
          setFigureAssignQuestionId(id);
        }}
        onCancelSelectPhoto={() => setFigureAssignQuestionId(null)}
        onAssignFigure={(questionId, imageUrl) => {
          void handleAssignFigureToSavedQuestion(questionId, imageUrl);
        }}
        onRemoveFigure={(q) => {
          const id = String(q._id || '');
          if (!id || !selectedExam?._id) return;
          void (async () => {
            try {
              const token = getAuthToken();
              const res = await fetch(
                `${API_BASE_URL}/api/super-admin/exams/${selectedExam._id}/questions/${id}`,
                {
                  method: 'PUT',
                  headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({ questionImage: '' }),
                },
              );
              const data = await res.json().catch(() => null);
              if (!res.ok || !data?.success) {
                toast({
                  title: 'Error',
                  description: data?.message || 'Failed to remove figure',
                  variant: 'destructive',
                });
                return;
              }
              patchLocalQuestion(id, { questionImage: '' });
              toast({ title: 'Figure removed' });
              await fetchQuestions(selectedExam._id, {
                silent: true,
                keepScrollToQuestionId: id,
              });
            } catch {
              toast({
                title: 'Error',
                description: 'Failed to remove figure',
                variant: 'destructive',
              });
            }
          })();
        }}
      />
    </div>
  );
}

