import { AiToolStackedSection } from '@/components/ai-tool-stacked-section';
import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Layers,
  Lightbulb,
  Target,
  Sparkles,
  Users,
  MessageCircle,
  RotateCcw,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { stripAiGeneratorLeakage, isScaffoldFlashcardPair, isScaffoldDeckMetaText, stripLessonPlanLeakFromLabel, sanitizeFlashcardTopicLink, normalizeFlashcardClassLevel, sanitizeFlashcardFieldText } from '@/lib/strip-ai-tool-metadata';
import { formatClassroomScienceText } from '@/lib/exam-text-normalize';
import { SelfCheckList } from '@/components/ai-tool-interactive';
import ExamMathText from '@/components/exam/ExamMathText';

function cleanFlashcardText(text: string): string {
  return formatClassroomScienceText(
    sanitizeFlashcardFieldText(stripAiGeneratorLeakage(String(text || ''))),
  );
}

function cleanFlashcardLabel(text: string): string {
  return stripLessonPlanLeakFromLabel(cleanFlashcardText(text));
}

function filterDisplayFlashcards(cards: Flashcard[]): Flashcard[] {
  const seen = new Set<string>();
  const out: Flashcard[] = [];
  for (const card of cards) {
    if (!card.front || !card.back || isScaffoldFlashcardPair(card.front, card.back)) continue;
    const key = card.front.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 240);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(card);
  }
  return out;
}

// Add CSS for 3D flip effect
const flashcardStyles = `
  .perspective-1000 {
    perspective: 1000px;
  }
  .preserve-3d {
    transform-style: preserve-3d;
  }
  .backface-hidden {
    backface-visibility: hidden;
    -webkit-backface-visibility: hidden;
  }
  .rotate-y-180 {
    transform: rotateY(180deg);
  }
`;

if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style');
  styleSheet.type = 'text/css';
  styleSheet.innerText = flashcardStyles;
  if (!document.head.querySelector('style[data-flashcard-styles]')) {
    styleSheet.setAttribute('data-flashcard-styles', 'true');
    document.head.appendChild(styleSheet);
  }
}

type CardType = 'question' | 'note' | 'fact';

export interface Flashcard {
  front: string;
  back: string;
  options?: string[];
  type?: CardType;
  cardCategory?: string;
  difficultyTag?: string;
  memoryHookQuickTip?: string;
  memoryCue?: string;
  skillFocus?: string;
  exampleUse?: string;
  peerPrompt?: string;
  selfCheckRound?: string;
  reflection?: string;
}

type TeacherDeckMeta = {
  title: string;
  topic: string;
  subtopic: string;
  topicAndSubtopicLink: string;
  classLevel: string;
  difficultyLevel: string;
  bloomLevel: string;
  priorKnowledgeRequired: string;
  learningObjectives: string[];
  ncfCompetencyAlignment: string;
  deckMemoryHook: string;
  selfCheckRapidRecallRound: string;
  commonMistakesToAvoid: string[];
  differentiationSupport: string;
  realLifeConnection: string;
  reflectionExitTicket: string;
};

interface FlashcardViewerProps {
  content: string;
  rawContent?: unknown;
  /** Premium immersive layout for student tools; teacher = 5-block deck */
  variant?: 'default' | 'student' | 'teacher';
  /** When true with variant student, renders only the flip session (inside MyStudyDecksViewer). */
  embedded?: boolean;
}

function ProgressRing({ current, total }: { current: number; total: number }) {
  const pct = total > 0 ? current / total : 0;
  const r = 26;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - pct * circumference;
  return (
    <div className="relative h-[72px] w-[72px] shrink-0">
      <svg className="h-full w-full -rotate-90" viewBox="0 0 64 64" aria-hidden>
        <circle cx="32" cy="32" r={r} className="stroke-white/15" strokeWidth="5" fill="none" />
        <circle
          cx="32"
          cy="32"
          r={r}
          className="stroke-violet-400 transition-all duration-500"
          strokeWidth="5"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
        <span className="text-lg font-bold leading-none">{current}</span>
        <span className="text-micro text-white/60">of {total}</span>
      </div>
    </div>
  );
}

const STUDY_FIELD_META = [
  {
    key: 'difficultyTag' as const,
    label: 'Difficulty',
    icon: Target,
    chip: 'bg-amber-50 text-amber-800 border-amber-200',
    iconBg: 'bg-amber-100 text-amber-700',
  },
  {
    key: 'memoryHookQuickTip' as const,
    label: 'Memory hook',
    icon: Lightbulb,
    chip: 'bg-yellow-50 text-yellow-900 border-yellow-200',
    iconBg: 'bg-yellow-100 text-yellow-800',
  },
  {
    key: 'selfCheckRound' as const,
    label: 'Self-check',
    icon: MessageCircle,
    chip: 'bg-teal-50 text-teal-800 border-teal-200',
    iconBg: 'bg-teal-100 text-teal-700',
  },
  {
    key: 'memoryCue' as const,
    label: 'Memory Cue',
    icon: Lightbulb,
    chip: 'bg-amber-50 text-amber-800 border-amber-200',
    iconBg: 'bg-amber-100 text-amber-700',
  },
  {
    key: 'skillFocus' as const,
    label: 'Skill Focus',
    icon: Target,
    chip: 'bg-violet-50 text-violet-800 border-violet-200',
    iconBg: 'bg-violet-100 text-violet-700',
  },
  {
    key: 'exampleUse' as const,
    label: 'Example Use',
    icon: Sparkles,
    chip: 'bg-sky-50 text-sky-800 border-sky-200',
    iconBg: 'bg-sky-100 text-sky-700',
  },
  {
    key: 'peerPrompt' as const,
    label: 'Peer Prompt',
    icon: Users,
    chip: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    iconBg: 'bg-emerald-100 text-emerald-700',
  },
  {
    key: 'reflection' as const,
    label: 'Reflection',
    icon: MessageCircle,
    chip: 'bg-rose-50 text-rose-800 border-rose-200',
    iconBg: 'bg-rose-100 text-rose-700',
  },
];

function StudyFieldTile({
  label,
  value,
  icon: Icon,
  sectionNum = '1',
}: {
  label: string;
  value: string;
  icon: typeof Lightbulb;
  chip?: string;
  iconBg?: string;
  sectionNum?: string;
}) {
  return (
    <AiToolStackedSection num={sectionNum} title={label} icon={Icon}>
      <p className="text-base leading-relaxed text-slate-800">{value}</p>
    </AiToolStackedSection>
  );
}

type TeacherCardCategory = 'all' | 'concept' | 'formula' | 'application' | 'visual';

function DualFaceCardPair({
  front,
  back,
  taskLabel = 'Task',
  solutionLabel = 'Solution',
}: {
  front: string;
  back: string;
  taskLabel?: string;
  solutionLabel?: string;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="relative min-h-[160px] min-w-0 overflow-hidden rounded-2xl border-2 border-violet-300 bg-white p-4 sm:p-5 shadow-sm">
        <div
          className="pointer-events-none absolute -left-6 -top-6 h-24 w-24 rounded-full bg-violet-200/50"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-8 -right-4 h-20 w-28 rounded-[40%] bg-violet-100/70"
          aria-hidden
        />
        <p className="relative mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-violet-700">
          {taskLabel}
        </p>
        <p className="relative text-base font-semibold leading-relaxed text-slate-900 break-words [overflow-wrap:anywhere] sm:text-[17px]">
          <ExamMathText text={front} />
        </p>
      </div>
      <div className="relative min-h-[160px] min-w-0 overflow-hidden rounded-2xl border-2 border-emerald-300/90 bg-white p-4 sm:p-5 shadow-sm">
        <div
          className="pointer-events-none absolute right-3 top-3 h-8 w-8 rounded-full border border-emerald-200 bg-emerald-50"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-6 -left-4 h-16 w-24 rounded-[45%] bg-emerald-50"
          aria-hidden
        />
        <p className="relative mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-700">
          {solutionLabel}
        </p>
        <p className="relative text-base leading-relaxed text-slate-800 break-words [overflow-wrap:anywhere] sm:text-lg">
          <ExamMathText text={back} />
        </p>
      </div>
    </div>
  );
}

function DecorativeFrontBackPair({ front, back }: { front: string; back: string }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <div className="flex flex-col items-center gap-2">
        <span className="rounded-md bg-indigo-800 px-4 py-1 text-xs font-bold uppercase tracking-widest text-white">
          Front
        </span>
        <div className="relative w-full min-h-[200px] overflow-hidden rounded-xl border-[3px] border-indigo-800 bg-white px-5 py-8 text-center shadow-md">
          <div className="pointer-events-none absolute left-0 top-0 h-16 w-20 bg-[radial-gradient(circle_at_0_0,rgba(49,46,129,0.25),transparent_70%)]" />
          <div className="pointer-events-none absolute bottom-0 right-0 h-16 w-20 bg-[radial-gradient(circle_at_100%_100%,rgba(49,46,129,0.2),transparent_70%)]" />
          <div className="mx-auto mb-4 flex w-full max-w-[85%] items-center gap-2">
            <div className="h-px flex-1 bg-indigo-300" />
            <span className="text-indigo-500 text-xs">✦</span>
            <div className="h-px flex-1 bg-indigo-300" />
          </div>
          <p className="font-serif text-lg font-bold leading-snug text-indigo-950 sm:text-xl">
            <ExamMathText text={front} />
          </p>
          <div className="mx-auto mt-4 flex w-full max-w-[85%] items-center gap-2">
            <div className="h-px flex-1 bg-indigo-300" />
            <span className="text-indigo-500 text-xs">✦</span>
            <div className="h-px flex-1 bg-indigo-300" />
          </div>
        </div>
      </div>
      <div className="flex flex-col items-center gap-2">
        <span className="rounded-md bg-emerald-700 px-4 py-1 text-xs font-bold uppercase tracking-widest text-white">
          Back
        </span>
        <div className="relative w-full min-h-[200px] overflow-hidden rounded-xl border-[3px] border-emerald-700 bg-white px-5 py-8 text-center shadow-md">
          <div className="pointer-events-none absolute inset-2 rounded-lg border border-dashed border-emerald-300/80" />
          <div className="relative mb-3 flex justify-center text-emerald-700" aria-hidden>
            <BookOpen className="h-5 w-5" />
          </div>
          <div className="mx-auto mb-3 flex w-full max-w-[85%] items-center gap-2">
            <div className="h-px flex-1 bg-emerald-300" />
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <div className="h-px flex-1 bg-emerald-300" />
          </div>
          <p className="relative font-serif text-base leading-relaxed text-slate-800 sm:text-lg">
            <ExamMathText text={back} />
          </p>
          <div className="mx-auto mt-3 flex w-full max-w-[85%] items-center gap-2">
            <div className="h-px flex-1 bg-emerald-300" />
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <div className="h-px flex-1 bg-emerald-300" />
          </div>
        </div>
      </div>
    </div>
  );
}

function FlashcardListView({ cards }: { cards: Flashcard[] }) {
  return (
    <div className="space-y-6 rounded-xl border border-slate-200 bg-white px-4 py-5 sm:px-6">
      {cards.map((card, idx) => (
        <div key={`${idx}-${card.front.slice(0, 24)}`} className="space-y-1.5">
          <p className="text-lg font-semibold text-sky-600">Card {idx + 1}</p>
          <p className="text-base leading-relaxed text-slate-900">
            <span className="font-bold">Front:</span> {card.front}
          </p>
          <p className="text-base leading-relaxed text-slate-800">
            <span className="font-bold">Back:</span> {card.back}
          </p>
        </div>
      ))}
    </div>
  );
}

function CardSetPager({
  currentIndex,
  total,
  onPrev,
  onNext,
  onJump,
}: {
  currentIndex: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  onJump: (idx: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={currentIndex === 0}
        onClick={onPrev}
        className="rounded-full border-slate-300 px-4 disabled:opacity-40"
      >
        <ChevronLeft className="h-4 w-4" />
        Previous
      </Button>
      <div className="flex flex-1 flex-wrap justify-center gap-1.5 px-2">
        {Array.from({ length: total }, (_, idx) => (
          <button
            key={idx}
            type="button"
            aria-label={`Card ${idx + 1}`}
            aria-current={idx === currentIndex}
            onClick={() => onJump(idx)}
            className={`rounded-full transition-all ${
              idx === currentIndex
                ? 'h-2.5 w-7 bg-violet-600'
                : 'h-2.5 w-2.5 bg-violet-200 hover:bg-violet-400'
            }`}
          />
        ))}
      </div>
      <Button
        variant="outline"
        size="sm"
        disabled={currentIndex >= total - 1}
        onClick={onNext}
        className="rounded-full border-slate-300 px-4 disabled:opacity-40"
      >
        Next
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

export function FlashcardViewer({
  content,
  rawContent,
  variant = 'default',
  embedded = false,
}: FlashcardViewerProps) {
  const [allCards, setAllCards] = useState<Flashcard[]>([]);
  const [deckTitle, setDeckTitle] = useState('');
  const [teacherMeta, setTeacherMeta] = useState<TeacherDeckMeta | null>(null);
  const [activeType, setActiveType] = useState<CardType | 'all'>('all');
  const [activeCategory, setActiveCategory] = useState<TeacherCardCategory>('all');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  /** study = Task/Solution; print = decorative FRONT/BACK; list = Front/Back stack; flip = classic */
  const [viewMode, setViewMode] = useState<'study' | 'print' | 'list' | 'flip'>('study');
  const cards =
    variant === 'teacher' && activeCategory !== 'all'
      ? allCards.filter((card) => card.cardCategory === activeCategory)
      : activeType === 'all'
        ? allCards
        : allCards.filter((card) => card.type === activeType);
  
  // Count cards by type
  const questionCount = allCards.filter(c => c.type === 'question').length;
  const noteCount = allCards.filter(c => c.type === 'note').length;
  const factCount = allCards.filter(c => c.type === 'fact').length;

  const conceptCount = allCards.filter((c) => c.cardCategory === 'concept').length;
  const formulaCount = allCards.filter((c) => c.cardCategory === 'formula').length;
  const applicationCount = allCards.filter((c) => c.cardCategory === 'application').length;
  const visualCount = allCards.filter((c) => c.cardCategory === 'visual').length;

  useEffect(() => {
    let parsedCards = parseFlashcards(content);
    // Prefer structured rawData from Super Admin / AI Tool Data when markdown parse is empty.
    if (
      !parsedCards.length &&
      rawContent &&
      typeof rawContent === 'object' &&
      !Array.isArray(rawContent)
    ) {
      parsedCards = parseFlashcards(JSON.stringify({ raw: rawContent }));
    }
    const cleanedCards = filterDisplayFlashcards(
      parsedCards.map((card) => ({
        ...card,
        front: cleanFlashcardText(card.front),
        back: cleanFlashcardText(card.back),
      })),
    );
    setDeckTitle(cleanFlashcardText(
      tryParseDeckTitle(content) ||
        String(
          (rawContent as Record<string, unknown> | null | undefined)?.flashcard_deck_title ||
            (rawContent as Record<string, unknown> | null | undefined)?.deck_title ||
            (rawContent as Record<string, unknown> | null | undefined)?.title ||
            '',
        ).trim(),
    ));
    const parsedMeta = variant === 'teacher' ? tryParseTeacherDeckMeta(content, rawContent) : null;
    let formattedMarkdown = '';
    if (content.trim().startsWith('{')) {
      try {
        const envelope = JSON.parse(content) as { formatted?: string };
        formattedMarkdown = String(envelope.formatted || '').trim();
      } catch {
        formattedMarkdown = '';
      }
    } else if (!content.trim().startsWith('{')) {
      formattedMarkdown = content.trim();
    }
    const formattedMeta =
      variant === 'teacher' && formattedMarkdown
        ? parseTeacherDeckMetaFromFormatted(formattedMarkdown)
        : {};
    const mergedMeta = mergeTeacherDeckMeta(parsedMeta, formattedMeta);
    setTeacherMeta(
      mergedMeta
        ? {
            ...mergedMeta,
            title: cleanFlashcardText(mergedMeta.title || ''),
            priorKnowledgeRequired: isScaffoldDeckMetaText(mergedMeta.priorKnowledgeRequired || '')
              ? ''
              : cleanFlashcardText(mergedMeta.priorKnowledgeRequired || ''),
            ncfCompetencyAlignment: isScaffoldDeckMetaText(mergedMeta.ncfCompetencyAlignment || '')
              ? ''
              : cleanFlashcardText(mergedMeta.ncfCompetencyAlignment || ''),
            learningObjectives: (mergedMeta.learningObjectives || [])
              .map(cleanFlashcardText)
              .filter((line) => line && !isScaffoldDeckMetaText(line)),
            topic: sanitizeFlashcardTopicLabel(mergedMeta.topic || ''),
            subtopic: sanitizeFlashcardTopicLabel(mergedMeta.subtopic || ''),
            topicAndSubtopicLink: sanitizeFlashcardTopicLabel(mergedMeta.topicAndSubtopicLink || ''),
            deckMemoryHook: isScaffoldDeckMetaText(mergedMeta.deckMemoryHook || '')
              ? ''
              : cleanFlashcardText(mergedMeta.deckMemoryHook || ''),
            selfCheckRapidRecallRound: isScaffoldDeckMetaText(
              mergedMeta.selfCheckRapidRecallRound || '',
            )
              ? ''
              : cleanFlashcardText(mergedMeta.selfCheckRapidRecallRound || ''),
            commonMistakesToAvoid: (mergedMeta.commonMistakesToAvoid || [])
              .map(cleanFlashcardText)
              .filter((line) => line && !isScaffoldDeckMetaText(line)),
            differentiationSupport: isScaffoldDeckMetaText(mergedMeta.differentiationSupport || '')
              ? ''
              : cleanFlashcardText(mergedMeta.differentiationSupport || ''),
            realLifeConnection: isScaffoldDeckMetaText(mergedMeta.realLifeConnection || '')
              ? ''
              : cleanFlashcardText(mergedMeta.realLifeConnection || ''),
            reflectionExitTicket: isScaffoldDeckMetaText(mergedMeta.reflectionExitTicket || '')
              ? ''
              : cleanFlashcardText(mergedMeta.reflectionExitTicket || ''),
          }
        : null,
    );
    setAllCards(cleanedCards);
    setActiveCategory('all');
    setCurrentIndex(0);
    setIsFlipped(false);
    
    // Auto-select first available type if current type has no cards
    if (activeType !== 'all' && parsedCards.length > 0) {
      const hasType = parsedCards.some(c => c.type === activeType);
      if (!hasType) {
        // Switch to first available type
        if (parsedCards.some(c => c.type === 'question')) {
          setActiveType('question');
        } else if (parsedCards.some(c => c.type === 'note')) {
          setActiveType('note');
        } else if (parsedCards.some(c => c.type === 'fact')) {
          setActiveType('fact');
        } else {
          setActiveType('all');
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, variant, rawContent]);
  
  useEffect(() => {
    // Reset to first card when type changes
    setCurrentIndex(0);
    setIsFlipped(false);
  }, [activeType, activeCategory]);

  useEffect(() => {
    // Reset flip when card changes
    setIsFlipped(false);
  }, [currentIndex]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        e.preventDefault();
        setIsFlipped(!isFlipped);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (currentIndex > 0) {
          setCurrentIndex(currentIndex - 1);
        }
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (currentIndex < cards.length - 1) {
          setCurrentIndex(currentIndex + 1);
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [isFlipped, currentIndex, cards.length]);

  if (allCards.length === 0) {
    return (
      <div className="w-full max-w-3xl mx-auto rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-14 text-center">
        <Layers className="mx-auto h-10 w-10 text-slate-300 mb-3" aria-hidden />
        <p className="text-base font-medium text-slate-700">No flashcards in this content</p>
        <p className="text-xs text-slate-500 mt-1">Generate or upload a deck with front and back on each card.</p>
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="w-full max-w-3xl mx-auto rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-14 text-center">
        <p className="text-base font-medium text-slate-700">No {activeType} cards in this filter</p>
        <p className="text-xs text-slate-500 mt-1">Try another category above.</p>
      </div>
    );
  }

  const currentCard = cards[currentIndex];
  const progress = ((currentIndex + 1) / cards.length) * 100;
  
  // Get card styling based on type
  const getCardStyles = (type?: CardType) => {
    switch (type) {
      case 'question':
        return {
          front: 'from-violet-50 via-indigo-50 to-blue-50 border-violet-200/90',
          back: 'from-indigo-50 via-purple-50 to-violet-100 border-purple-200/90',
          label: 'text-violet-600',
          labelText: 'Front'
        };
      case 'note':
        return {
          front: 'from-green-50 to-emerald-100 border-green-200',
          back: 'from-emerald-50 to-teal-100 border-emerald-200',
          label: 'text-green-600',
          labelText: 'Important Note'
        };
      case 'fact':
        return {
          front: 'from-orange-50 to-amber-100 border-orange-200',
          back: 'from-amber-50 to-yellow-100 border-amber-200',
          label: 'text-orange-600',
          labelText: 'Quick Fact'
        };
      default:
        return {
          front: 'from-violet-50 via-indigo-50 to-blue-50 border-violet-200/90',
          back: 'from-indigo-50 via-purple-50 to-violet-100 border-purple-200/90',
          label: 'text-violet-600',
          labelText: 'Front'
        };
    }
  };
  
  const cardStyles = getCardStyles(currentCard.type);
  const showLegacyTypeTabs = noteCount > 0 || factCount > 0;
  const studyFieldEntries = STUDY_FIELD_META.map((meta) => ({
    ...meta,
    value: String(currentCard[meta.key] || '').trim(),
  })).filter((f) => f.value.length > 0);
  const showStudyPanel = studyFieldEntries.length > 0 || !showLegacyTypeTabs;

  if (variant === 'student' && !embedded) {
    return null;
  }

  if (variant === 'student' && embedded) {
    const embeddedExtras = [
      currentCard.difficultyTag
        ? { label: 'Difficulty', value: currentCard.difficultyTag, className: 'bg-amber-100 text-amber-900' }
        : null,
      currentCard.memoryHookQuickTip || currentCard.memoryCue
        ? {
            label: 'Memory hook',
            value: currentCard.memoryHookQuickTip || currentCard.memoryCue || '',
            className: 'bg-yellow-100 text-yellow-900',
          }
        : null,
      currentCard.selfCheckRound
        ? { label: 'Self-check', value: currentCard.selfCheckRound, className: 'bg-teal-100 text-teal-900' }
        : null,
    ].filter(Boolean) as { label: string; value: string; className: string }[];

    return (
      <div className="w-full space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <Badge variant="secondary" className="bg-violet-100 text-violet-900 hover:bg-violet-100 text-xs">
            Card {currentIndex + 1} of {cards.length}
          </Badge>
          <span className="text-mini text-slate-500">Tap or Space to flip</span>
        </div>

        <div className="relative w-full" style={{ perspective: '900px' }}>
          <motion.div
            className="relative h-[200px] sm:h-[220px] w-full"
            style={{ transformStyle: 'preserve-3d' }}
          >
            <motion.div
              className="relative h-full w-full"
              animate={{ rotateY: isFlipped ? 180 : 0 }}
              transition={{ duration: 0.45, type: 'spring', stiffness: 200, damping: 24 }}
              style={{ transformStyle: 'preserve-3d' }}
            >
              <motion.div
                className="absolute inset-0 flex flex-col overflow-hidden rounded-xl border border-violet-200 bg-white shadow-md cursor-pointer"
                onClick={() => setIsFlipped(!isFlipped)}
                style={{
                  backfaceVisibility: 'hidden',
                  WebkitBackfaceVisibility: 'hidden',
                  transform: 'rotateY(0deg)',
                }}
              >
                <div className="border-b border-violet-100 bg-violet-50 px-3 py-2 text-center">
                  <span className="text-micro font-bold uppercase tracking-wider text-violet-700">
                    Question
                  </span>
                </div>
                <div className="flex flex-1 items-center justify-center px-3 py-2 text-center min-h-0">
                  <p className="text-base font-semibold text-slate-900 leading-snug overflow-y-auto max-h-full line-clamp-6">
                    {currentCard.front}
                  </p>
                </div>
                <div className="border-t border-violet-100 py-2 flex justify-center" onClick={(e) => e.stopPropagation()}>
                  <Button
                    type="button"
                    size="sm"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsFlipped(true);
                    }}
                    className="h-8 rounded-full bg-violet-600 hover:bg-violet-700 text-white text-xs px-4"
                  >
                    <BookOpen className="mr-1 h-3 w-3" />
                    Show answer
                  </Button>
                </div>
              </motion.div>

              <motion.div
                className="absolute inset-0 flex flex-col overflow-hidden rounded-xl border border-indigo-200 bg-gradient-to-b from-indigo-50 to-white shadow-md"
                style={{
                  backfaceVisibility: 'hidden',
                  WebkitBackfaceVisibility: 'hidden',
                  transform: 'rotateY(180deg)',
                }}
              >
                <div className="border-b border-indigo-100 bg-indigo-50 px-3 py-2 text-center">
                  <span className="text-micro font-bold uppercase tracking-wider text-indigo-700">
                    Answer
                  </span>
                </div>
                <div
                  className="flex flex-1 flex-col items-center justify-center gap-2 px-3 py-2 text-center min-h-0 cursor-pointer overflow-y-auto"
                  onClick={() => setIsFlipped(!isFlipped)}
                >
                  <p className="text-base font-semibold text-slate-900 leading-snug line-clamp-5">
                    <ExamMathText text={String(currentCard.back ?? '')} />
                  </p>
                  {embeddedExtras.length > 0 ? (
                    <div className="flex flex-wrap justify-center gap-1.5 w-full">
                      {embeddedExtras.map((chip) => (
                        <span
                          key={chip.label}
                          className={`rounded-full px-2 py-0.5 text-micro font-semibold ${chip.className}`}
                          title={chip.value}
                        >
                          {chip.label}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="border-t border-indigo-100 py-2 flex justify-center">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsFlipped(false);
                    }}
                    className="h-8 rounded-full border-indigo-200 text-indigo-800 text-xs px-3"
                  >
                    <RotateCcw className="mr-1 h-3 w-3" />
                    Back
                  </Button>
                </div>
              </motion.div>
            </motion.div>
          </motion.div>
        </div>

        <div className="flex items-center gap-1.5 rounded-lg border border-violet-100 bg-violet-50/60 p-1.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={currentIndex === 0}
            onClick={() => {
              setCurrentIndex((p) => p - 1);
              setIsFlipped(false);
            }}
            className="h-8 w-8 shrink-0 rounded-full text-violet-800 hover:bg-violet-100 disabled:opacity-30"
            aria-label="Previous card"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex flex-1 justify-center gap-1 flex-wrap px-1">
            {cards.map((_, idx) => (
              <button
                key={idx}
                type="button"
                aria-label={`Card ${idx + 1}`}
                aria-current={idx === currentIndex}
                onClick={() => {
                  setCurrentIndex(idx);
                  setIsFlipped(false);
                }}
                className={`rounded-full transition-all ${
                  idx === currentIndex
                    ? 'h-2 w-6 bg-violet-600'
                    : 'h-2 w-2 bg-violet-300 hover:bg-violet-400'
                }`}
              />
            ))}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={currentIndex >= cards.length - 1}
            onClick={() => {
              setCurrentIndex((p) => p + 1);
              setIsFlipped(false);
            }}
            className="h-8 w-8 shrink-0 rounded-full text-violet-800 hover:bg-violet-100 disabled:opacity-30"
            aria-label="Next card"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  if (variant === 'teacher') {
    const meta = teacherMeta;
    const displayTitle = meta?.title || deckTitle || 'Flashcard deck';
    const topicLabel =
      sanitizeFlashcardTopicLabel(meta?.topic || '') ||
      (meta?.topicAndSubtopicLink
        ? sanitizeFlashcardTopicLabel(meta.topicAndSubtopicLink.split(/\s*[—–\-:]\s*/)[0]?.trim() || '')
        : '');
    const subtopicLabel =
      sanitizeFlashcardTopicLabel(meta?.subtopic || '') ||
      (meta?.topicAndSubtopicLink
        ? sanitizeFlashcardTopicLabel(
            meta.topicAndSubtopicLink.split(/\s*[—–\-:]\s*/).slice(1).join(' — ').trim(),
          )
        : '');

    const hasFoundations =
      Boolean(meta?.priorKnowledgeRequired) ||
      Boolean(meta?.learningObjectives?.length) ||
      Boolean(meta?.ncfCompetencyAlignment);
    const hasStudyAids =
      Boolean(meta?.deckMemoryHook) ||
      Boolean(meta?.commonMistakesToAvoid?.length) ||
      Boolean(meta?.selfCheckRapidRecallRound);
    const hasWrapUp =
      Boolean(meta?.realLifeConnection) ||
      Boolean(meta?.differentiationSupport) ||
      Boolean(meta?.reflectionExitTicket);
    const hasCards = cards.length > 0;

    const contextChips = [
      topicLabel ? { label: 'Topic', value: topicLabel } : null,
      subtopicLabel ? { label: 'Subtopic', value: subtopicLabel } : null,
      meta?.classLevel ? { label: 'Class', value: meta.classLevel } : null,
      meta?.difficultyLevel ? { label: 'Difficulty', value: meta.difficultyLevel } : null,
      meta?.bloomLevel ? { label: "Bloom's", value: meta.bloomLevel } : null,
    ].filter(Boolean) as { label: string; value: string }[];

    const cardExtras = [
      currentCard?.difficultyTag
        ? { label: 'Difficulty', value: currentCard.difficultyTag }
        : null,
      currentCard?.memoryHookQuickTip || currentCard?.memoryCue
        ? {
            label: 'Memory Hook',
            value: currentCard.memoryHookQuickTip || currentCard.memoryCue || '',
          }
        : null,
    ].filter(Boolean) as { label: string; value: string }[];

    // Only number / show sections that actually have content.
    const trail: string[] = ['Context'];
    if (hasFoundations) trail.push('Foundations');
    if (hasCards) trail.push('HOTS');
    if (hasStudyAids) trail.push('Study Aids');
    if (hasWrapUp) trail.push('Wrap-Up');
    let sectionNum = 1;
    const contextNum = sectionNum++;
    const foundationsNum = hasFoundations ? sectionNum++ : 0;
    const cardsNum = hasCards ? sectionNum++ : 0;
    const studyAidsNum = hasStudyAids ? sectionNum++ : 0;
    const wrapUpNum = hasWrapUp ? sectionNum++ : 0;

    const blockClass =
      'rounded-2xl border border-indigo-100/90 bg-white shadow-sm overflow-hidden';
    const blockHead =
      'px-4 py-2.5 sm:px-5 border-b border-indigo-50 bg-gradient-to-r from-indigo-50/80 to-violet-50/50';
    const blockTitle = 'text-xs font-bold uppercase tracking-wide text-indigo-700';

    return (
      <div className="w-full max-w-4xl mx-auto space-y-4">
        {trail.length > 1 ? (
          <div className="flex flex-wrap items-center gap-2 text-indigo-600 text-xs font-semibold uppercase tracking-wide">
            {trail.map((label, i) => (
              <span key={label} className="inline-flex items-center gap-2">
                {i > 0 ? <span className="h-px w-4 sm:w-8 bg-indigo-100" /> : null}
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-indigo-500" />
                  {label}
                </span>
              </span>
            ))}
          </div>
        ) : null}

        <section className={blockClass}>
          <div className={blockHead}>
            <p className={blockTitle}>
              {contextNum} · Context &amp; Alignment
            </p>
          </div>
          <div className="p-4 sm:p-5 space-y-3">
            <h3 className="text-lg font-semibold text-slate-900">{displayTitle}</h3>
            {contextChips.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {contextChips.map((chip) => (
                  <Badge
                    key={chip.label}
                    variant="secondary"
                    className="bg-indigo-50 text-indigo-900 border border-indigo-100 font-normal px-3 py-1"
                  >
                    <span className="font-semibold mr-1">{chip.label}:</span>
                    {chip.value}
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>
        </section>

        {hasFoundations ? (
          <section className={blockClass}>
            <div className={blockHead}>
              <p className={blockTitle}>{foundationsNum} · Foundations</p>
            </div>
            <div className="p-4 sm:p-5 space-y-3 text-base text-slate-800">
              {meta?.priorKnowledgeRequired ? (
                <div>
                  <p className="text-mini font-semibold uppercase text-slate-500">Prior Knowledge</p>
                  <p className="mt-1 leading-relaxed">{meta.priorKnowledgeRequired}</p>
                </div>
              ) : null}
              {meta?.learningObjectives?.length ? (
                <div>
                  <p className="text-mini font-semibold uppercase text-slate-500">Learning Objectives</p>
                  <div className="mt-1">
                    <SelfCheckList items={meta.learningObjectives} tone="violet" />
                  </div>
                </div>
              ) : null}
              {meta?.ncfCompetencyAlignment ? (
                <div>
                  <p className="text-mini font-semibold uppercase text-slate-500">NCF Competency</p>
                  <p className="mt-1 leading-relaxed">{meta.ncfCompetencyAlignment}</p>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {hasCards && currentCard ? (
        <section className="rounded-2xl border border-violet-200/80 bg-white shadow-md overflow-hidden">
          <div className="border-b border-violet-100 bg-white px-4 py-3.5 sm:px-6 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-base sm:text-lg font-bold uppercase tracking-wide text-violet-700">
                {cardsNum} · The Card Set: Application &amp; HOTS
              </p>
              <p className="text-base text-slate-500 mt-0.5">
                {allCards.length} task{allCards.length === 1 ? '' : 's'}
              </p>
            </div>
            <Badge
              variant="outline"
              className="rounded-full border-violet-300 bg-white px-3 py-1 text-violet-700 font-medium"
            >
              Card {currentIndex + 1} of {cards.length}
            </Badge>
          </div>
          <div className="p-4 sm:p-6 space-y-5">
            <DualFaceCardPair front={currentCard.front} back={currentCard.back} />
            {cardExtras.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {cardExtras.map((chip) => (
                  <span
                    key={chip.label}
                    className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-1.5 text-xs text-amber-950"
                  >
                    <span className="font-semibold">{chip.label}: </span>
                    {chip.value}
                  </span>
                ))}
              </div>
            ) : null}
            <CardSetPager
              currentIndex={currentIndex}
              total={cards.length}
              onPrev={() => setCurrentIndex((i) => Math.max(0, i - 1))}
              onNext={() => setCurrentIndex((i) => Math.min(cards.length - 1, i + 1))}
              onJump={(idx) => setCurrentIndex(idx)}
            />
          </div>
        </section>
        ) : null}

        {hasStudyAids ? (
          <section className={blockClass}>
            <div className={blockHead}>
              <p className={blockTitle}>{studyAidsNum} · Study Aids</p>
            </div>
            <div className="p-4 sm:p-5 space-y-3 text-base text-slate-800">
              {meta?.deckMemoryHook ? (
                <div className="flex gap-3 rounded-lg border border-amber-100 bg-amber-50/60 p-3">
                  <Lightbulb className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" aria-hidden />
                  <div>
                    <p className="text-mini font-semibold uppercase text-amber-800">Memory Hook</p>
                    <p className="mt-1">{meta.deckMemoryHook}</p>
                  </div>
                </div>
              ) : null}
              {meta?.commonMistakesToAvoid?.length ? (
                <div>
                  <p className="text-mini font-semibold uppercase text-slate-500">Common Mistakes</p>
                  <div className="mt-1">
                    <SelfCheckList items={meta.commonMistakesToAvoid} tone="rose" prompt="Tap each one you'll watch out for" />
                  </div>
                </div>
              ) : null}
              {meta?.selfCheckRapidRecallRound ? (
                <div className="flex gap-3 rounded-lg border border-teal-100 bg-teal-50/60 p-3">
                  <Zap className="h-5 w-5 shrink-0 text-teal-600 mt-0.5" aria-hidden />
                  <div>
                    <p className="text-mini font-semibold uppercase text-teal-800">Rapid Recall</p>
                    <p className="mt-1">{meta.selfCheckRapidRecallRound}</p>
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {hasWrapUp ? (
          <section className={blockClass}>
            <div className={blockHead}>
              <p className={blockTitle}>{wrapUpNum} · Wrap-Up</p>
            </div>
            <div className="p-4 sm:p-5 grid gap-3 sm:grid-cols-3 text-base text-slate-800">
              {meta?.realLifeConnection ? (
                <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-3">
                  <p className="text-mini font-semibold uppercase text-slate-500">Real-life</p>
                  <p className="mt-1 leading-relaxed">{meta.realLifeConnection}</p>
                </div>
              ) : null}
              {meta?.differentiationSupport ? (
                <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-3">
                  <p className="text-mini font-semibold uppercase text-slate-500">Differentiation</p>
                  <p className="mt-1 leading-relaxed">{meta.differentiationSupport}</p>
                </div>
              ) : null}
              {meta?.reflectionExitTicket ? (
                <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-3">
                  <p className="text-mini font-semibold uppercase text-slate-500">Exit Ticket</p>
                  <p className="mt-1 leading-relaxed">{meta.reflectionExitTicket}</p>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}
      </div>
    );
  }

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="overflow-hidden rounded-2xl border border-violet-200/70 bg-white shadow-lg">
        <div className="border-b border-violet-100 bg-white px-4 py-3.5 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-base font-bold uppercase tracking-wide text-violet-700">
                The Card Set: Application &amp; HOTS
              </p>
              <h3 className="mt-0.5 truncate text-base font-semibold text-slate-900 sm:text-lg">
                {deckTitle || 'Study cards'}
              </h3>
              <p className="mt-0.5 text-base text-slate-500">
                {allCards.length} task{allCards.length === 1 ? '' : 's'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-full border border-violet-200 bg-violet-50/80 p-0.5 text-xs">
                {(
                  [
                    { id: 'study' as const, label: 'Study' },
                    { id: 'print' as const, label: 'Print' },
                    { id: 'list' as const, label: 'List' },
                    { id: 'flip' as const, label: 'Flip' },
                  ] as const
                ).map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setViewMode(mode.id)}
                    className={`rounded-full px-3 py-1 font-medium transition-colors ${
                      viewMode === mode.id
                        ? 'bg-violet-600 text-white shadow-sm'
                        : 'text-violet-700 hover:bg-violet-100'
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
              {viewMode !== 'list' ? (
                <Badge
                  variant="outline"
                  className="rounded-full border-violet-300 bg-white px-3 py-1 font-medium text-violet-700"
                >
                  Card {currentIndex + 1} of {cards.length}
                </Badge>
              ) : null}
            </div>
          </div>
        </div>

        <div className="space-y-5 p-4 sm:p-6">
          {showLegacyTypeTabs ? (
            <div className="flex flex-wrap justify-center gap-2">
              {(
                [
                  { id: 'all' as const, label: 'All', count: allCards.length },
                  { id: 'question' as const, label: 'Questions', count: questionCount },
                  { id: 'note' as const, label: 'Important Notes', count: noteCount },
                  { id: 'fact' as const, label: 'Facts', count: factCount },
                ] as const
              ).map((tab) => (
                <Button
                  key={tab.id}
                  variant={activeType === tab.id ? 'default' : 'outline'}
                  size="sm"
                  disabled={tab.id !== 'all' && tab.count === 0}
                  onClick={() => setActiveType(tab.id)}
                >
                  {tab.label}
                  <span className="ml-2 text-xs opacity-75">({tab.count})</span>
                </Button>
              ))}
            </div>
          ) : null}

          {viewMode === 'list' ? (
            <FlashcardListView cards={cards} />
          ) : viewMode === 'study' ? (
            <>
              <DualFaceCardPair front={currentCard.front} back={currentCard.back} />
              <CardSetPager
                currentIndex={currentIndex}
                total={cards.length}
                onPrev={() => {
                  setCurrentIndex((p) => p - 1);
                  setIsFlipped(false);
                }}
                onNext={() => {
                  setCurrentIndex((p) => p + 1);
                  setIsFlipped(false);
                }}
                onJump={(idx) => {
                  setCurrentIndex(idx);
                  setIsFlipped(false);
                }}
              />
            </>
          ) : viewMode === 'print' ? (
            <>
              <DecorativeFrontBackPair front={currentCard.front} back={currentCard.back} />
              <CardSetPager
                currentIndex={currentIndex}
                total={cards.length}
                onPrev={() => {
                  setCurrentIndex((p) => p - 1);
                  setIsFlipped(false);
                }}
                onNext={() => {
                  setCurrentIndex((p) => p + 1);
                  setIsFlipped(false);
                }}
                onJump={(idx) => {
                  setCurrentIndex(idx);
                  setIsFlipped(false);
                }}
              />
            </>
          ) : (
            <>
              <p className="text-center text-xs text-slate-500">
                <kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px]">Space</kbd>{' '}
                flip · arrows navigate
              </p>
              <div className="relative w-full" style={{ perspective: '1000px' }}>
                <motion.div
                  className="relative h-[min(420px,65vh)] min-h-[320px] w-full"
                  style={{ transformStyle: 'preserve-3d' }}
                >
                  <motion.div
                    className="relative h-full w-full"
                    animate={{ rotateY: isFlipped ? 180 : 0 }}
                    transition={{ duration: 0.55, type: 'spring', stiffness: 200, damping: 22 }}
                    style={{ transformStyle: 'preserve-3d' }}
                  >
                    <motion.div
                      className={`absolute inset-0 flex cursor-pointer flex-col overflow-hidden rounded-2xl border bg-gradient-to-br p-5 shadow-xl ${cardStyles.front}`}
                      onClick={() => setIsFlipped(!isFlipped)}
                      style={{
                        backfaceVisibility: 'hidden',
                        WebkitBackfaceVisibility: 'hidden',
                        transform: 'rotateY(0deg)',
                      }}
                    >
                      <div className="mb-3 flex justify-center">
                        <span
                          className={`rounded-full border border-violet-200 bg-white/90 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest ${cardStyles.label}`}
                        >
                          {cardStyles.labelText}
                        </span>
                      </div>
                      <div className="flex flex-1 items-center justify-center overflow-y-auto px-2 text-center text-base font-medium leading-relaxed text-slate-900 sm:text-lg">
                        <ExamMathText text={String(currentCard.front ?? '')} />
                      </div>
                      <div className="pt-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <Button type="button" variant="outline" className="rounded-full" onClick={() => setIsFlipped(true)}>
                          Reveal answer
                        </Button>
                      </div>
                    </motion.div>
                    <motion.div
                      className={`absolute inset-0 flex flex-col overflow-hidden rounded-2xl border bg-gradient-to-br p-5 shadow-xl ${cardStyles.back}`}
                      style={{
                        backfaceVisibility: 'hidden',
                        WebkitBackfaceVisibility: 'hidden',
                        transform: 'rotateY(180deg)',
                      }}
                    >
                      <div className="mb-3 flex justify-center">
                        <span
                          className={`rounded-full border border-indigo-200 bg-white/90 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest ${cardStyles.label}`}
                        >
                          Back
                        </span>
                      </div>
                      <div
                        className="flex flex-1 cursor-pointer items-center justify-center overflow-y-auto px-2 text-center text-base font-medium leading-relaxed text-slate-900 sm:text-lg"
                        onClick={() => setIsFlipped(!isFlipped)}
                      >
                        <ExamMathText text={String(currentCard.back ?? '')} />
                      </div>
                      <div className="pt-3 text-center">
                        <Button type="button" variant="outline" className="rounded-full" onClick={() => setIsFlipped(false)}>
                          <RotateCcw className="mr-2 h-3.5 w-3.5" />
                          Show front
                        </Button>
                      </div>
                    </motion.div>
                  </motion.div>
                </motion.div>
              </div>
              <CardSetPager
                currentIndex={currentIndex}
                total={cards.length}
                onPrev={() => {
                  setCurrentIndex((p) => p - 1);
                  setIsFlipped(false);
                }}
                onNext={() => {
                  setCurrentIndex((p) => p + 1);
                  setIsFlipped(false);
                }}
                onJump={(idx) => {
                  setCurrentIndex(idx);
                  setIsFlipped(false);
                }}
              />
            </>
          )}

          {viewMode !== 'list' && showStudyPanel && studyFieldEntries.length > 0 ? (
            <div className="space-y-3 border-t border-violet-100 pt-4">
              <p className="text-center text-[10px] font-semibold uppercase tracking-wider text-violet-600">
                Study boosters
              </p>
              <div className="flex w-full flex-col gap-4">
                {studyFieldEntries.map((field, i) => (
                  <StudyFieldTile
                    key={field.key}
                    sectionNum={String(i + 1)}
                    label={field.label}
                    value={field.value}
                    icon={field.icon}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function stripMdBold(s: string): string {
  return sanitizeFlashcardFieldText(s.replace(/\*\*/g, '').trim());
}

const TEMPLATE_FIELD_LABELS = [
  'Difficulty Tag for Each Card',
  'Memory Hook / Quick Tip',
  'Self-Check Round',
  'Memory Cue',
  'Skill Focus',
  'Example Use',
  'Peer Prompt',
  'Reflection',
] as const;

function pickLabeledField(block: string, label: string): string {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const stopLabels = ['Front', 'Back', ...TEMPLATE_FIELD_LABELS]
    .filter((l) => l.toLowerCase() !== label.toLowerCase())
    .map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  const re = new RegExp(
    `\\*\\*${escaped}:?\\*\\*\\s*([\\s\\S]*?)(?=\\n\\s*\\*\\*(?:${stopLabels}):|\\n+---|\\n+##|$)`,
    'i',
  );
  const m = block.match(re);
  return m ? stripMdBold(m[1].trim()) : '';
}

function pickFirstLabeledField(block: string, labels: string[]): string {
  for (const label of labels) {
    const v = pickLabeledField(block, label);
    if (v) return v;
  }
  return '';
}

/** Front/Back or Task/Solution template blocks */
function parseSevenFieldTemplateBlock(block: string): Flashcard | null {
  const hasFace =
    /\*\*(?:Front|Task):\*\*/i.test(block) ||
    /###\s*(?:Front|Task):/i.test(block) ||
    /\bTask:/i.test(block);
  if (!hasFace) return null;

  let front = '';
  let back = '';

  const taskBold = block.match(/\*\*Task:\*\*\s*([\s\S]*?)(?=\n\s*\*\*Solution:\*\*)/i);
  const solutionBold = block.match(
    /\*\*Solution:\*\*\s*([\s\S]*?)(?=\n\s*\*\*(?:Difficulty|Memory Hook|Memory Cue|Self-Check|Front|Back|Task)[^*]*:\*|\n+---|\n+#{1,6}\s*(?:\d+[.)]?\s*)?(?:Study Aids|Card|Flashcard|Wrap)|$)/i,
  );
  if (taskBold && solutionBold) {
    front = stripMdBold(taskBold[1].trim());
    back = stripMdBold(solutionBold[1].trim());
  }

  const frontBold = block.match(/\*\*Front:\*\*\s*([\s\S]*?)(?=\n\s*\*\*Back:\*\*)/i);
  const backBold = block.match(
    /\*\*Back:\*\*\s*([\s\S]*?)(?=\n\s*\*\*(?:Difficulty Tag|Memory Hook|Memory Cue|Self-Check Round|Skill Focus|Example Use|Peer Prompt|Reflection|Task|Solution)[^*]*:\*|\n+---|\n+##\s*(?:Card|Flashcard)|$)/i,
  );
  if (!front && frontBold && backBold) {
    front = stripMdBold(frontBold[1].trim());
    back = stripMdBold(backBold[1].trim());
  } else if (!front) {
    const frontH = block.match(/###\s*Front:\s*\n+([\s\S]*?)(?=\n+\s*###\s*Back:)/i);
    const backH = block.match(
      /###\s*Back:\s*\n+([\s\S]*?)(?=\n+\*\*(?:Memory Cue|Skill Focus)|\n+---|\n+##|$)/i,
    );
    if (frontH && backH) {
      front = stripMdBold(frontH[1].trim());
      back = stripMdBold(backH[1].trim());
    }
  }

  if (!front || !back) return null;

  const difficultyTag = pickFirstLabeledField(block, [
    'Difficulty Tag for Each Card',
    'Difficulty Tag',
    'Skill Focus',
  ]);
  const memoryHookQuickTip = pickFirstLabeledField(block, [
    'Memory Hook / Quick Tip',
    'Memory Hook',
    'Memory Cue',
  ]);
  const selfCheckRound = pickFirstLabeledField(block, [
    'Self-Check Round',
    'Peer Prompt',
    'Reflection',
  ]);

  return {
    front,
    back,
    difficultyTag,
    memoryHookQuickTip,
    memoryCue: memoryHookQuickTip || pickLabeledField(block, 'Memory Cue'),
    skillFocus: pickLabeledField(block, 'Skill Focus'),
    selfCheckRound,
    exampleUse: pickLabeledField(block, 'Example Use'),
    peerPrompt: pickLabeledField(block, 'Peer Prompt'),
    reflection: pickLabeledField(block, 'Reflection'),
    type: 'question',
  };
}

function parseSevenFieldDeckMarkdown(text: string): Flashcard[] {
  const cards: Flashcard[] = [];
  const bySeparator = text
    .split(/\n---\n+/)
    .map((c) => c.trim())
    .filter(Boolean);
  for (const chunk of bySeparator) {
    const card = parseSevenFieldTemplateBlock(chunk);
    if (card) cards.push(card);
  }
  if (cards.length) return cards;

  const byCardHeading = text.split(/(?=\n?##\s*Card\s+\d+)/i).map((c) => c.trim()).filter(Boolean);
  for (const chunk of byCardHeading) {
    const card = parseSevenFieldTemplateBlock(chunk);
    if (card) cards.push(card);
  }
  if (cards.length) return cards;

  const byFront = text.split(/(?=\*\*Front:\*\*)/i).map((c) => c.trim()).filter(Boolean);
  for (const chunk of byFront) {
    const card = parseSevenFieldTemplateBlock(chunk);
    if (card) cards.push(card);
  }
  return cards;
}

function sanitizeFlashcardTopicLabel(value: string): string {
  const s = sanitizeFlashcardTopicLink(cleanFlashcardLabel(value));
  if (!s) return '';
  if (/classlevel|difficultylevel|bloom_level|bloomlevel/i.test(s)) return '';
  return s;
}

function pickMarkdownSection(text: string, headingPattern: string): string {
  const re = new RegExp(
    `(?:^|\\n)#{1,3}\\s*${headingPattern}[^\\n]*\\n+([\\s\\S]*?)(?=\\n#{1,3}\\s*\\d+\\.|\\n#{1,3}\\s*The Card Set|$)`,
    'i',
  );
  const m = String(text || '').match(re);
  return m ? m[1].trim() : '';
}

function pickLabeledMarkdownLine(block: string, label: string): string {
  const re = new RegExp(`(?:^|\\n)${label}\\s*:?\\s*([^\\n]+)`, 'i');
  const m = String(block || '').match(re);
  return m ? cleanFlashcardText(m[1].trim()) : '';
}

function parseTeacherDeckMetaFromFormatted(text: string): Partial<TeacherDeckMeta> {
  const body = String(text || '').trim();
  if (!body) return {};

  const contextBlock = pickMarkdownSection(body, '1\\.\\s*Context');
  const foundationsBlock = pickMarkdownSection(body, '2\\.\\s*Foundations');
  const studyAidsBlock = pickMarkdownSection(body, '4\\.\\s*Study Aids');
  const wrapUpBlock = pickMarkdownSection(body, '5\\.\\s*Wrap-Up');

  const objectivesBlock = foundationsBlock.match(
    /Learning Objectives:\s*\n([\s\S]*?)(?=\n[A-Z][^\n]*:|$)/i,
  );
  const mistakesBlock = studyAidsBlock.match(
    /Common Mistakes to Avoid:\s*\n([\s\S]*?)(?=\n[A-Z][^\n]*:|$)/i,
  );

  const listFromBlock = (block: string) =>
    block
      .split(/\n+/)
      .map((l) => l.replace(/^\s*[-*•]\s*/, '').trim())
      .filter(Boolean);

  return {
    title:
      pickLabeledMarkdownLine(contextBlock, 'Deck Title') ||
      (body.match(/^##\s+(.+)$/m)?.[1] || '').trim(),
    topic: sanitizeFlashcardTopicLabel(pickLabeledMarkdownLine(contextBlock, 'Topic')),
    subtopic: sanitizeFlashcardTopicLabel(pickLabeledMarkdownLine(contextBlock, 'Subtopic')),
    classLevel: normalizeFlashcardClassLevel(pickLabeledMarkdownLine(contextBlock, 'Class')),
    difficultyLevel: pickLabeledMarkdownLine(contextBlock, 'Difficulty'),
    bloomLevel: pickLabeledMarkdownLine(contextBlock, "Bloom'?s? Level"),
    priorKnowledgeRequired: pickLabeledMarkdownLine(foundationsBlock, 'Prior Knowledge Required'),
    learningObjectives: objectivesBlock ? listFromBlock(objectivesBlock[1]) : [],
    ncfCompetencyAlignment: pickLabeledMarkdownLine(
      foundationsBlock,
      'NCF Competency[^\\n]*',
    ),
    deckMemoryHook:
      pickLabeledMarkdownLine(studyAidsBlock, 'Memory Hook') ||
      pickLabeledMarkdownLine(studyAidsBlock, 'Deck Memory Hook'),
    commonMistakesToAvoid: mistakesBlock ? listFromBlock(mistakesBlock[1]) : [],
    selfCheckRapidRecallRound:
      pickLabeledMarkdownLine(studyAidsBlock, 'Rapid Recall') ||
      pickLabeledMarkdownLine(studyAidsBlock, 'Self-Check'),
    realLifeConnection:
      pickLabeledMarkdownLine(wrapUpBlock, 'Real-life Connection') ||
      pickLabeledMarkdownLine(wrapUpBlock, 'Real-life'),
    differentiationSupport: pickLabeledMarkdownLine(wrapUpBlock, 'Differentiation'),
    reflectionExitTicket:
      pickLabeledMarkdownLine(wrapUpBlock, 'Exit Ticket') ||
      pickLabeledMarkdownLine(wrapUpBlock, 'Reflection'),
  };
}

function mergeTeacherDeckMeta(
  fromRaw: TeacherDeckMeta | null,
  fromFormatted: Partial<TeacherDeckMeta>,
): TeacherDeckMeta | null {
  if (!fromRaw && !Object.values(fromFormatted).some(Boolean)) return null;
  const base = fromRaw || {
    title: 'Flashcard deck',
    topic: '',
    subtopic: '',
    topicAndSubtopicLink: '',
    classLevel: '',
    difficultyLevel: '',
    bloomLevel: '',
    priorKnowledgeRequired: '',
    learningObjectives: [],
    ncfCompetencyAlignment: '',
    deckMemoryHook: '',
    selfCheckRapidRecallRound: '',
    commonMistakesToAvoid: [],
    differentiationSupport: '',
    realLifeConnection: '',
    reflectionExitTicket: '',
  };
  return {
    ...base,
    title: base.title || fromFormatted.title || 'Flashcard deck',
    topic: base.topic || fromFormatted.topic || '',
    subtopic: base.subtopic || fromFormatted.subtopic || '',
    classLevel: normalizeFlashcardClassLevel(base.classLevel || fromFormatted.classLevel || ''),
    difficultyLevel: base.difficultyLevel || fromFormatted.difficultyLevel || '',
    bloomLevel: base.bloomLevel || fromFormatted.bloomLevel || '',
    priorKnowledgeRequired:
      base.priorKnowledgeRequired || fromFormatted.priorKnowledgeRequired || '',
    learningObjectives:
      base.learningObjectives?.length ? base.learningObjectives : fromFormatted.learningObjectives || [],
    ncfCompetencyAlignment:
      base.ncfCompetencyAlignment || fromFormatted.ncfCompetencyAlignment || '',
    deckMemoryHook: base.deckMemoryHook || fromFormatted.deckMemoryHook || '',
    selfCheckRapidRecallRound:
      base.selfCheckRapidRecallRound || fromFormatted.selfCheckRapidRecallRound || '',
    commonMistakesToAvoid:
      base.commonMistakesToAvoid?.length
        ? base.commonMistakesToAvoid
        : fromFormatted.commonMistakesToAvoid || [],
    differentiationSupport:
      base.differentiationSupport || fromFormatted.differentiationSupport || '',
    realLifeConnection: base.realLifeConnection || fromFormatted.realLifeConnection || '',
    reflectionExitTicket: base.reflectionExitTicket || fromFormatted.reflectionExitTicket || '',
  };
}


function tryParseDeckTitle(content: string): string {
  const trimmed = String(content || '').trim();
  if (!trimmed.startsWith('{')) return '';
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const raw = parsed.raw as Record<string, unknown> | undefined;
    const title = String(
      raw?.flashcard_deck_title ||
        raw?.deck_title ||
        raw?.title ||
        parsed.flashcard_deck_title ||
        parsed.deck_title ||
        parsed.title ||
        '',
    ).trim();
    return title;
  } catch {
    return '';
  }
}

function toStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v || '').trim()).filter(Boolean);
  const s = String(value || '').trim();
  if (!s) return [];
  return s
    .split(/\n|;/)
    .map((v) => v.trim())
    .filter(Boolean);
}

function rawRecordFromContent(
  content: string,
  rawContent?: unknown,
): Record<string, unknown> | null {
  if (rawContent && typeof rawContent === 'object' && !Array.isArray(rawContent)) {
    return rawContent as Record<string, unknown>;
  }
  const trimmed = String(content || '').trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    return (parsed.raw as Record<string, unknown> | undefined) || parsed;
  } catch {
    return null;
  }
}

function tryParseTeacherDeckMeta(content: string, rawContent?: unknown): TeacherDeckMeta | null {
  const raw = rawRecordFromContent(content, rawContent);
  if (!raw) return null;
  const title = String(raw.flashcard_deck_title || raw.deck_title || raw.title || '').trim();
  const topic = sanitizeFlashcardTopicLabel(stripLessonPlanLeakFromLabel(String(raw.topic || '').trim()));
  const subtopic = sanitizeFlashcardTopicLabel(
    stripLessonPlanLeakFromLabel(String(raw.subtopic || raw.sub_topic || '').trim()),
  );
  const topicLink = sanitizeFlashcardTopicLink(
    String(raw.topic_and_subtopic_link || raw.subtopic_link || '').trim(),
  );
  if (!title && !topic && !subtopic && !topicLink) return null;
  return {
    title: title || 'Flashcard deck',
    topic,
    subtopic,
    topicAndSubtopicLink: topicLink,
    classLevel: normalizeFlashcardClassLevel(
      String(raw.class_level || raw.classLabel || raw.class || '').trim(),
    ),
    difficultyLevel: String(raw.difficulty_level || raw.difficulty || 'Medium').trim(),
    bloomLevel: String(raw.bloom_level || raw.bloom || 'Apply / Analyze').trim(),
    priorKnowledgeRequired: String(raw.prior_knowledge_required || '').trim(),
    learningObjectives: toStringList(raw.learning_objectives || raw.objectives),
    ncfCompetencyAlignment: String(
      raw.ncf_competency_alignment || raw.learning_outcome_alignment || '',
    ).trim(),
    deckMemoryHook: String(
      raw.deck_memory_hook || raw.memory_hook_quick_tip || raw.memory_cue || '',
    ).trim(),
    selfCheckRapidRecallRound: String(
      raw.self_check_rapid_recall_round || raw.self_check_round || '',
    ).trim(),
    commonMistakesToAvoid: toStringList(raw.common_mistakes_to_avoid),
    differentiationSupport: String(raw.differentiation_support || '').trim(),
    realLifeConnection: String(raw.real_life_connection || raw.real_life_application || '').trim(),
    reflectionExitTicket: String(raw.reflection_exit_ticket || raw.reflection || '').trim(),
  };
}

function collectCardsFromRaw(raw: Record<string, unknown>): Record<string, unknown>[] {
  const nested =
    raw.structuredContent && typeof raw.structuredContent === 'object' && !Array.isArray(raw.structuredContent)
      ? (raw.structuredContent as Record<string, unknown>)
      : null;
  const roots = [raw, nested].filter(Boolean) as Record<string, unknown>[];
  const lists: unknown[] = [];
  for (const root of roots) {
    lists.push(
      root.application_hots_cards,
      root.application_cards,
      root.cards,
      root.flashcard_set,
      root.flashcards,
      root.concept_and_definition_cards,
      root.formula_rule_cards,
      root.formula_cards,
      root.visual_diagram_suggestion_cards,
      root.visual_cards,
      root.deck_cards,
    );
  }
  const out: Record<string, unknown>[] = [];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const item of list as Record<string, unknown>[]) {
      if (item && typeof item === 'object') out.push(item);
    }
  }
  return out;
}

/** Normalize objects from JSON / API into { front, back, type? } */
function cardFromLooseObject(item: Record<string, unknown>): Flashcard | null {
  const front =
    (item.front as string) ||
    (item.Front as string) ||
    (item.task as string) ||
    (item.Task as string) ||
    (item.question as string) ||
    (item.Question as string) ||
    (item.term as string) ||
    (item.Term as string) ||
    (item.title as string) ||
    (item.prompt as string);
  const back =
    (item.back as string) ||
    (item.Back as string) ||
    (item.solution as string) ||
    (item.Solution as string) ||
    (item.correct_answer as string) ||
    (item.answer as string) ||
    (item.Answer as string) ||
    (item.content as string) ||
    (item.explanation as string) ||
    (item.definition as string);
  if (!front || !back) return null;
  const typeRaw = (item.type as string) || 'question';
  const type =
    typeRaw === 'note' || typeRaw === 'fact' || typeRaw === 'question'
      ? (typeRaw as CardType)
      : 'question';
  const backStr = stripMdBold(String(back));
  const frontStr = stripMdBold(String(front));
  const cardCategory = String(item.card_category || item.cardCategory || '').trim().toLowerCase();
  let card: Flashcard = {
    front: frontStr,
    back: backStr,
    type,
    cardCategory: cardCategory || undefined,
    difficultyTag: stripMdBold(
      String(
        item.difficulty_tag_for_each_card ||
          item.difficulty_tag ||
          item.difficultyTag ||
          item.skill_focus ||
          '',
      ),
    ),
    memoryHookQuickTip: stripMdBold(
      String(item.memory_hook_quick_tip || item.memory_hook || item.memory_cue || item.hint || ''),
    ),
    memoryCue: stripMdBold(
      String(item.memory_cue || item.memoryCue || item.hint || ''),
    ),
    skillFocus: stripMdBold(
      String(item.skill_focus || item.skillFocus || item.bloom_level || ''),
    ),
    exampleUse: stripMdBold(
      String(item.example_use || item.exampleUse || item.real_life_link || ''),
    ),
    peerPrompt: stripMdBold(String(item.peer_prompt || item.peerPrompt || '')),
    selfCheckRound: stripMdBold(
      String(item.self_check_round || item.selfCheckRound || item.peer_prompt || ''),
    ),
    reflection: stripMdBold(
      String(item.reflection || item.reflection_prompt || item.self_check || ''),
    ),
  };
  if (
    !card.memoryCue &&
    /\*\*(?:Memory Cue|Skill Focus):/i.test(backStr)
  ) {
    const parsed = parseSevenFieldTemplateBlock(
      `**Front:** ${frontStr}\n\n**Back:** ${backStr}`,
    );
    if (parsed) card = { ...parsed, type: card.type || parsed.type };
  }
  return card;
}

/** Legacy saves: multiple `{ formatted, raw }` objects concatenated with blank lines. */
function tryParseConcatenatedFlashcardEnvelopes(content: string): Flashcard[] | null {
  const trimmed = content.trim();
  if (!trimmed.startsWith('{')) return null;
  const chunks = trimmed
    .split(/\n\n+/)
    .map((s) => s.trim())
    .filter((s) => s.startsWith('{'));
  if (chunks.length <= 1) return null;
  const merged: Flashcard[] = [];
  for (const chunk of chunks) {
    const parsed = tryParseSingleJsonFlashcardEnvelope(chunk);
    if (parsed?.length) merged.push(...parsed);
  }
  return merged.length ? merged : null;
}

/** JSON shapes: { raw: { flashcards } }, { cards }, { flashcards: [] }, etc. */
function tryParseSingleJsonFlashcardEnvelope(content: string): Flashcard[] | null {
  let text = content.trim();
  if (!text.startsWith('{') && !text.startsWith('[')) return null;
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (parsed.formatted && typeof parsed.formatted === 'string') {
      const fromFormatted = parseSevenFieldDeckMarkdown(parsed.formatted as string);
      if (fromFormatted.length) return fromFormatted;
      const nested = tryParseJsonFlashcards(parsed.formatted as string);
      if (nested?.length) return nested;
      text = parsed.formatted as string;
    }
    const raw = parsed.raw as Record<string, unknown> | undefined;
    if (raw) {
      const merged = collectCardsFromRaw(raw);
      if (merged.length) {
        const out: Flashcard[] = [];
        for (const item of merged) {
          const c = cardFromLooseObject(item);
          if (c) out.push(c);
        }
        if (out.length) return out;
      }
    }
    const rawList = raw?.cards ?? raw?.flashcards;
    if (Array.isArray(rawList)) {
      const out: Flashcard[] = [];
      for (const item of rawList as Record<string, unknown>[]) {
        const c = cardFromLooseObject(item);
        if (c) out.push(c);
      }
      return out.length ? out : null;
    }
    if (Array.isArray(parsed.cards)) {
      const out: Flashcard[] = [];
      for (const item of parsed.cards as Record<string, unknown>[]) {
        const c = cardFromLooseObject(item);
        if (c) out.push(c);
      }
      return out.length ? out : null;
    }
    const fc = parsed.flashcards;
    if (Array.isArray(fc)) {
      const out: Flashcard[] = [];
      for (const item of fc as Record<string, unknown>[]) {
        const c = cardFromLooseObject(item);
        if (c) out.push(c);
      }
      return out.length ? out : null;
    }
    if (fc && typeof fc === 'object' && !Array.isArray(fc)) {
      const grouped = fc as {
        questions?: Record<string, unknown>[];
        important_notes?: { title?: string; content?: string }[];
        facts?: { fact?: string }[];
      };
      const out: Flashcard[] = [];
      for (const q of grouped.questions || []) {
        const c = cardFromLooseObject(q);
        if (c) out.push(c);
      }
      for (const n of grouped.important_notes || []) {
        if (n.title && n.content) {
          out.push({
            front: stripMdBold(n.title),
            back: stripMdBold(n.content),
            type: 'note',
          });
        }
      }
      for (const f of grouped.facts || []) {
        if (f.fact) {
          out.push({
            front: 'Quick fact',
            back: stripMdBold(f.fact),
            type: 'fact',
          });
        }
      }
      return out.length ? out : null;
    }
  } catch {
    return null;
  }
  return null;
}

function tryParseJsonFlashcards(content: string): Flashcard[] | null {
  const multi = tryParseConcatenatedFlashcardEnvelopes(content);
  if (multi?.length) return multi;
  return tryParseSingleJsonFlashcardEnvelope(content);
}

function parseOneStructuredSection(section: string): Flashcard | null {
  if (!section.trim()) return null;

  const typeMatch = section.match(/\*\*Type:\*\*\s*(question|note|fact)/i);
  const cardType = typeMatch ? (typeMatch[1].toLowerCase() as CardType) : 'question';

  const frontMatch = section.match(/###\s*Front:\s*\n+([\s\S]*?)(?=\n+\s*###\s*Back:)/i);
  let front = frontMatch ? frontMatch[1].trim() : '';

  const optionsMatch = section.match(/\*\*Options:\*\*\s*\n((?:- [^\n]+\n?)+)/);
  const options = optionsMatch
    ? optionsMatch[1]
        .split('\n')
        .filter((line) => line.trim().startsWith('-'))
        .map((line) => line.replace(/^-\s*/, '').trim())
    : undefined;

  if (options && optionsMatch) {
    front = front.replace(/\*\*Options:\*\*\s*\n((?:- [^\n]+\n?)+)/, '').trim();
  }

  const backMatch = section.match(
    /###\s*Back:\s*\n+(?:\*\*Answer:\*\*\s*\n*)?([\s\S]*?)(?=\n+---|\n+##\s*(?:Flashcard|Card)\s*\d|\n*$)/i,
  );
  const back = backMatch ? backMatch[1].trim() : '';

  if (front && back) {
    return {
      front: stripMdBold(front),
      back: stripMdBold(back),
      options,
      type: cardType,
    };
  }
  return null;
}

/** **Front:** ... **Back:** pairs (7-field template) */
function parseFrontBackPairs(content: string): Flashcard[] {
  return parseSevenFieldDeckMarkdown(content);
}

function parseTaskSolutionPairs(content: string): Flashcard[] {
  const cards: Flashcard[] = [];
  const chunks = content.split(/(?=\*\*Card\s*\d+\*\*)/i).map((c) => c.trim()).filter(Boolean);
  for (const chunk of chunks) {
    const card = parseSevenFieldTemplateBlock(chunk);
    if (card) cards.push(card);
  }
  if (cards.length) return cards;

  const re =
    /\*\*Task:\*\*\s*([\s\S]*?)\n+\*\*Solution:\*\*\s*([\s\S]*?)(?=\n+\*\*Task:|\n+---|\n#{1,6}\s*[345]\.|\n#{1,6}\s*Study Aids|\n+\*\*Card\s*\d+|\n+##\s*(?:Card|Flashcard|Study)|$)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const front = stripMdBold(m[1].trim());
    const back = stripMdBold(m[2].trim());
    if (front && back) cards.push({ front, back, type: 'question' });
  }
  return cards;
}

function parseQuestionAnswerPairs(content: string): Flashcard[] {
  const cards: Flashcard[] = [];
  const re =
    /\*\*Question:\*\*\s*\n*([\s\S]*?)\n+\*\*Answer:\*\*\s*\n*([\s\S]*?)(?=\n\n\*\*Question:|\n\n##|\n##\s*(?:Flashcard|Card)|$)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const front = stripMdBold(m[1]);
    const back = stripMdBold(m[2]);
    if (front && back) cards.push({ front, back, type: 'question' });
  }
  return cards;
}

/**
 * Common Gemini / template output: "Card 1 Front: ... Back: ..." (repeated per card).
 * Splits on each "Card N" block and extracts Front/Back fields.
 */
function parseCardNumberFrontBackTemplate(text: string): Flashcard[] {
  const t = text.trim();
  if (!/\bCard\s*\d+\b/i.test(t) || !/Front:/i.test(t) || !/Back:/i.test(t)) {
    return [];
  }

  const cards: Flashcard[] = [];
  const chunks = t.split(/(?=\bCard\s*\d+\b)/i).map((c) => c.trim()).filter(Boolean);

  for (const chunk of chunks) {
    if (!/^Card\s*\d+/i.test(chunk)) continue;
    const afterCard = chunk.replace(/^Card\s*\d+\s*/i, '').trim();
    const fb = afterCard.match(/Front:\s*([\s\S]*?)\s*Back:\s*([\s\S]*)$/i);
    if (fb) {
      const front = stripMdBold(fb[1].trim());
      const back = stripMdBold(fb[2].trim());
      if (front && back) {
        cards.push({ front, back, type: 'question' });
      }
    }
  }

  return cards;
}

function parseFlashcards(content: string): Flashcard[] {
  const jsonCards = tryParseJsonFlashcards(content);
  if (jsonCards?.length) return jsonCards;

  let text = content;
  try {
    const p = JSON.parse(content) as { formatted?: string };
    if (p?.formatted && typeof p.formatted === 'string') {
      text = p.formatted;
    }
  } catch {
    /* use content */
  }

  const cards: Flashcard[] = [];

  let sections = text.split(/##\s*Flashcard\s*\d+/gi);
  if (sections.length <= 1) {
    sections = text.split(/##\s*Card\s*\d+/gi);
  }

  for (let i = 1; i < sections.length; i++) {
    const card =
      parseSevenFieldTemplateBlock(sections[i]) || parseOneStructuredSection(sections[i]);
    if (card) cards.push(card);
  }

  if (cards.length === 0) {
    const sevenField = parseSevenFieldDeckMarkdown(text);
    if (sevenField.length) return sevenField;
  }

  if (cards.length === 0) {
    const taskSolution = parseTaskSolutionPairs(text);
    if (taskSolution.length) return taskSolution;
  }

  if (cards.length === 0) {
    const templateCards = parseCardNumberFrontBackTemplate(text);
    if (templateCards.length) return templateCards;
  }

  if (cards.length === 0) {
    const pairs = parseFrontBackPairs(text);
    if (pairs.length) return pairs;
  }

  if (cards.length === 0) {
    const qa = parseQuestionAnswerPairs(text);
    if (qa.length) return qa;
  }

  if (cards.length === 0) {
    const lines = text.split('\n');
    let currentCard: Partial<Flashcard> = {};
    let inFront = false;
    let inBack = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (/Flashcard\s*\d|###\s*Front:/i.test(line)) {
        if (currentCard.front && currentCard.back) {
          cards.push({
            ...currentCard,
            front: stripMdBold(String(currentCard.front)),
            back: stripMdBold(String(currentCard.back)),
          } as Flashcard);
        }
        currentCard = {};
        inFront = true;
        inBack = false;
        continue;
      }

      if (/###\s*Back:/i.test(line) || /\*\*Answer:\*\*/i.test(line)) {
        inFront = false;
        inBack = true;
        if (/\*\*Answer:\*\*/i.test(line)) {
          currentCard.back = line.replace(/\*\*Answer:\*\*\s*/i, '').trim();
        }
        continue;
      }

      if (inFront && line.trim() && !line.startsWith('**Options:**')) {
        if (!currentCard.front) {
          currentCard.front = line.trim();
        } else {
          currentCard.front += ' ' + line.trim();
        }
      }

      if (inBack && line.trim() && !/\*\*Answer:\*\*/i.test(line)) {
        if (!currentCard.back) {
          currentCard.back = line.trim();
        } else {
          currentCard.back += ' ' + line.trim();
        }
      }

      if (line.includes('**Options:**')) {
        const optionLines: string[] = [];
        let j = i + 1;
        while (j < lines.length && lines[j].trim().startsWith('-')) {
          optionLines.push(lines[j].trim().replace(/^-\s*/, ''));
          j++;
        }
        if (optionLines.length > 0) {
          currentCard.options = optionLines;
        }
        i = j - 1;
      }
    }

    if (currentCard.front && currentCard.back) {
      cards.push({
        ...currentCard,
        front: stripMdBold(String(currentCard.front)),
        back: stripMdBold(String(currentCard.back)),
      } as Flashcard);
    }
  }

  return cards;
}

export function getFlashcardsFromContent(content: string): Flashcard[] {
  return parseFlashcards(content);
}
