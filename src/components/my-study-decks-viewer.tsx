import { type AiTool3dIconName } from '@/components/ai-tool-3d-icons';
import {
  AiToolStackedList,
  AiToolStackedSection,
} from '@/components/ai-tool-stacked-section';
import { useMemo, type ReactElement, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { viewerPayloadFromRecord } from '@/lib/resolve-ai-structured-content';
import {
  FlashcardViewer,
  getFlashcardsFromContent,
  type Flashcard,
} from '@/components/flashcard-viewer';
import { ExpandableText, SelfCheckList } from '@/components/ai-tool-interactive';
import ExamMathText from '@/components/exam/ExamMathText';

const BLOOM_FALLBACK_LEVELS = ['Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate', 'Create'];

/** Merge per-card fields from raw JSON and gentle fallbacks when the model omits tags. */
export function enrichStudyDeckCards(cards: Flashcard[], rawContent?: unknown): Flashcard[] {
  const raw =
    rawContent && typeof rawContent === 'object' && !Array.isArray(rawContent)
      ? (rawContent as Record<string, unknown>)
      : null;
  const nested =
    raw?.structuredContent &&
    typeof raw.structuredContent === 'object' &&
    !Array.isArray(raw.structuredContent)
      ? (raw.structuredContent as Record<string, unknown>)
      : null;
  const cardRoots = [raw, nested].filter(Boolean) as Record<string, unknown>[];
  const rawList: Record<string, unknown>[] = [];
  for (const root of cardRoots) {
    for (const key of [
      'cards',
      'flashcards',
      'flashcard_set',
      'application_hots_cards',
      'application_cards',
      'deck_cards',
    ]) {
      if (Array.isArray(root[key])) {
        for (const item of root[key] as Record<string, unknown>[]) {
          if (item && typeof item === 'object') rawList.push(item);
        }
      }
    }
  }

  let base = cards;
  if (!base.length && raw) {
    const fromEnvelope = getFlashcardsFromContent(JSON.stringify({ raw }));
    if (fromEnvelope.length) base = fromEnvelope;
  }

  return base.map((card, i) => {
    const r = rawList[i];
    const difficultyFromRaw = r
      ? String(
          r.difficulty_tag_for_each_card ||
            r.difficulty_tag ||
            r.difficultyTagForEachCard ||
            r.skill_focus ||
            '',
        ).trim()
      : '';
    const memoryFromRaw = r
      ? String(r.memory_hook_quick_tip || r.memory_cue || r.memoryCue || '').trim()
      : '';
    const selfCheckFromRaw = r
      ? String(r.self_check_round || r.selfCheckRound || r.peer_prompt || '').trim()
      : '';

    const difficultyTag =
      card.difficultyTag ||
      card.skillFocus ||
      difficultyFromRaw ||
      BLOOM_FALLBACK_LEVELS[i % BLOOM_FALLBACK_LEVELS.length];

    const memoryHookQuickTip =
      card.memoryHookQuickTip ||
      card.memoryCue ||
      memoryFromRaw ||
      (card.back ? `Remember: ${card.back.split(/[.!?]/)[0]?.trim().slice(0, 120)}` : '');

    const selfCheckRound =
      card.selfCheckRound ||
      card.peerPrompt ||
      selfCheckFromRaw ||
      selfCheckPrompt(card.front || '');

    return {
      ...card,
      difficultyTag,
      memoryHookQuickTip,
      memoryCue: memoryHookQuickTip,
      selfCheckRound,
    };
  });
}

export type StudentDeckMeta = {
  title: string;
  subtopicLinkPriorKnowledge: string;
  learningObjectives: string[];
  ncfAlignment: string;
  selfCheckRound: string;
  commonMistakesToAvoid: string[];
  expectedLearningOutcomes: string[];
  realLifeApplication: string;
  reflectionExitTicket: string;
};

function toStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v ?? '').trim()).filter(Boolean);
  const s = String(value ?? '').trim();
  if (!s) return [];
  return s
    .split(/\n|;/)
    .map((v) => v.trim())
    .filter(Boolean);
}

function pickText(sources: Record<string, unknown>[], ...keys: string[]): string {
  for (const src of sources) {
    for (const k of keys) {
      const v = src[k];
      if (v != null && String(v).trim()) return String(v).trim();
    }
  }
  return '';
}

function pickList(sources: Record<string, unknown>[], ...keys: string[]): string[] {
  for (const src of sources) {
    for (const k of keys) {
      const rows = toStringList(src[k]);
      if (rows.length) return rows;
    }
  }
  return [];
}

/** Unwrap Super Admin / student API record into viewer props. */
export function deckViewerPayloadFromRecord(
  record?: {
    generatedContent?: string;
    content?: string;
    metadata?: { structuredContent?: unknown };
    structuredContent?: unknown;
  } | null,
): { content: string; rawContent: unknown } {
  const p = viewerPayloadFromRecord(record);
  return { content: p.content, rawContent: p.rawContent ?? null };
}

function parseDeckMetaFromFormatted(text: string): Partial<StudentDeckMeta> {
  const body = String(text || '').trim();
  if (!body) return {};

  const pickBlock = (labelPattern: string): string => {
    const re = new RegExp(
      `\\*\\*${labelPattern}:?\\*\\*\\s*([\\s\\S]*?)(?=\\n\\n\\*\\*|\\n\\*\\*Flashcard Set|\\n##\\s*Card|$)`,
      'i',
    );
    const m = body.match(re);
    return m ? m[1].trim() : '';
  };

  const objectivesBlock = pickBlock('Learning Objectives[^*]*');
  const mistakesBlock = pickBlock('Common Mistakes to Avoid');
  const outcomesBlock = pickBlock('Expected Learning Outcomes');

  const listFromBlock = (block: string) =>
    block
      .split(/\n+/)
      .map((l) => l.replace(/^\s*[-*•]\s*/, '').trim())
      .filter(Boolean);

  return {
    title: pickBlock('Deck Title').replace(/^#+\s*/, '') || undefined,
    subtopicLinkPriorKnowledge: pickBlock('Subtopic Link and Prior Knowledge Required') || undefined,
    learningObjectives: objectivesBlock ? listFromBlock(objectivesBlock) : undefined,
    ncfAlignment: pickBlock('NCF Competency[^*]*') || undefined,
    commonMistakesToAvoid: mistakesBlock ? listFromBlock(mistakesBlock) : undefined,
    expectedLearningOutcomes: outcomesBlock ? listFromBlock(outcomesBlock) : undefined,
    realLifeApplication: pickBlock('Real-life Application') || undefined,
    reflectionExitTicket: pickBlock('Reflection[^*]*') || undefined,
  };
}

export function resolveStudentDeckMeta(content: string, rawContent?: unknown): StudentDeckMeta {
  const sources: Record<string, unknown>[] = [];
  if (rawContent && typeof rawContent === 'object' && !Array.isArray(rawContent)) {
    sources.push(rawContent as Record<string, unknown>);
  }
  const trimmed = String(content || '').trim();
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      if (parsed.raw && typeof parsed.raw === 'object') {
        sources.push(parsed.raw as Record<string, unknown>);
      }
      sources.push(parsed);
    } catch {
      /* plain text */
    }
  }

  const fromFormatted = parseDeckMetaFromFormatted(content);

  const title =
    pickText(sources, 'deck_title', 'deckTitle', 'title', 'studyScheduleTitle') ||
    fromFormatted.title ||
    'My Study Deck';

  const learningObjectives =
    pickList(sources, 'learningObjectives', 'learning_objectives', 'objectives').length > 0
      ? pickList(sources, 'learningObjectives', 'learning_objectives', 'objectives')
      : fromFormatted.learningObjectives || [];

  const commonMistakesToAvoid =
    pickList(sources, 'commonMistakesToAvoid', 'common_mistakes_to_avoid', 'common_mistakes').length > 0
      ? pickList(sources, 'commonMistakesToAvoid', 'common_mistakes_to_avoid', 'common_mistakes')
      : fromFormatted.commonMistakesToAvoid || [];

  const expectedLearningOutcomes =
    pickList(sources, 'expectedLearningOutcomes', 'expected_learning_outcomes').length > 0
      ? pickList(sources, 'expectedLearningOutcomes', 'expected_learning_outcomes')
      : fromFormatted.expectedLearningOutcomes || [];

  return {
    title,
    subtopicLinkPriorKnowledge:
      pickText(
        sources,
        'subtopicLinkPriorKnowledgeRequired',
        'subtopic_link_prior_knowledge_required',
        'prior_knowledge_required',
        'subtopic_link',
      ) || fromFormatted.subtopicLinkPriorKnowledge || '',
    learningObjectives,
    ncfAlignment:
      pickText(
        sources,
        'ncfCompetencyAlignment',
        'ncf_competency_alignment',
        'learning_outcome_alignment',
      ) || fromFormatted.ncfAlignment || '',
    selfCheckRound: pickText(
      sources,
      'selfCheckRound',
      'self_check_round',
      'self_check_rapid_recall_round',
      'peer_prompt',
    ),
    commonMistakesToAvoid,
    expectedLearningOutcomes,
    realLifeApplication:
      pickText(
        sources,
        'realLifeApplication',
        'real_life_application',
        'example_use',
        'real_life_link',
      ) || fromFormatted.realLifeApplication || '',
    reflectionExitTicket:
      pickText(
        sources,
        'reflectionExitTicket',
        'reflection_exit_ticket',
        'reflection',
        'reflection_prompt',
      ) || fromFormatted.reflectionExitTicket || '',
  };
}

function DeckSectionCard({
  sectionNum,
  title,
  iconName,
  children,
}: {
  sectionNum: string;
  title: string;
  iconName: AiTool3dIconName;
  children: ReactNode;
}) {
  return (
    <AiToolStackedSection num={sectionNum} title={title} iconName={iconName}>
      {children}
    </AiToolStackedSection>
  );
}

/** "Numerical Answer Type: Evaluate …" → "Evaluate …" (the question-type label is noise on a card). */
const QUESTION_TYPE_LABEL_RE =
  /^\s*(?:assertion\s*[-–&]?\s*reason|numerical(?:\s+answer)?(?:\s+type)?|integer(?:\s+answer)?(?:\s+type)?|paragraph(?:\s+type)?|comprehension|single\s+correct(?:\s+answer)?(?:\s+type)?|multi(?:ple)?\s+correct(?:\s+answers?)?(?:\s+type)?|matrix\s+match|match\s+the\s+following|mcq|fib|true\s*\/\s*false|case[- ]based)\s*(?:type)?\s*[:\-–]\s*/i;

function stripQuestionTypeLabel(text: string): string {
  return String(text || '').replace(QUESTION_TYPE_LABEL_RE, '').trim();
}

/** Self-check line: questions are answered from memory, terms are explained. */
/** Saved prompts still carry the label: "Without looking, explain: Paragraph: …". */
function cleanSelfCheckText(text: string): string {
  const m = String(text || '').match(/^(Without looking, explain:|Answer from memory:)\s*([\s\S]*)$/);
  return m ? `${m[1]} ${stripQuestionTypeLabel(m[2])}` : String(text || '');
}

function selfCheckPrompt(front: string): string {
  const text = stripQuestionTypeLabel(front);
  if (!text) return '';
  const isQuestion = /\?\s*$/.test(text) ||
    /^(?:evaluate|find|calculate|solve|simplify|what|which|why|how|if|consider|prove|show|determine|assertion)\b/i.test(text);
  return isQuestion ? `Answer from memory: ${text}` : `Without looking, explain: ${text}`;
}

function PerCardList({
  cards,
  pick,
  label,
}: {
  cards: Flashcard[];
  pick: (c: Flashcard, i: number) => string;
  label: (i: number) => string;
}) {
  const rows = cards
    .map((c, i) => ({ i, text: pick(c, i).trim() }))
    .filter((r) => r.text.length > 0);
  if (!rows.length) return null;
  return (
    <ul className="space-y-1">
      {rows.map(({ i, text }) => (
        <li key={i} className="rounded-md border border-violet-100 bg-violet-50/40 px-2 py-1 text-base text-slate-800 leading-snug">
          <span className="text-micro font-bold uppercase tracking-wide text-violet-700">
            {label(i)}
          </span>
          <p className="mt-0 whitespace-pre-wrap">
            <ExamMathText text={cleanSelfCheckText(text)} />
          </p>
        </li>
      ))}
    </ul>
  );
}

interface MyStudyDecksViewerProps {
  content: string;
  rawContent?: unknown;
  className?: string;
}

type DeckSectionDef = {
  num: number;
  title: string;
  iconName: AiTool3dIconName;
  body: ReactElement;
  hasContent: boolean;
};

function renderDeckSection(sec: DeckSectionDef, displayNum: number) {
  return (
    <DeckSectionCard
      key={sec.num}
      sectionNum={String(displayNum)}
      title={sec.title}
      iconName={sec.iconName}
    >
      {sec.body}
    </DeckSectionCard>
  );
}

export function MyStudyDecksViewer({ content, rawContent, className }: MyStudyDecksViewerProps) {
  const payload = useMemo(() => {
    if (rawContent != null) {
      const text = String(content || '').trim();
      if (text.startsWith('{')) {
        try {
          const parsed = JSON.parse(text) as Record<string, unknown>;
          const formatted = String(parsed.formatted ?? parsed.markdown ?? '').trim();
          if (formatted) {
            return { content: formatted, rawContent };
          }
        } catch {
          /* use as-is */
        }
      }
      return { content, rawContent };
    }
    return deckViewerPayloadFromRecord({ generatedContent: content });
  }, [content, rawContent]);

  const meta = useMemo(
    () => resolveStudentDeckMeta(payload.content, payload.rawContent),
    [payload.content, payload.rawContent],
  );
  const cards = useMemo(() => {
    let parsed: Flashcard[] = [];
    const fromFormatted = getFlashcardsFromContent(payload.content);
    if (fromFormatted.length) parsed = fromFormatted;
    else {
      const fromEnvelope = getFlashcardsFromContent(content);
      if (fromEnvelope.length) parsed = fromEnvelope;
      else if (payload.rawContent && typeof payload.rawContent === 'object') {
        parsed = getFlashcardsFromContent(
          JSON.stringify({ formatted: payload.content, raw: payload.rawContent }),
        );
      }
    }
    return enrichStudyDeckCards(parsed, payload.rawContent);
  }, [payload.content, payload.rawContent, content]);

  const flashcardSessionContent = useMemo(() => {
    if (cards.length > 0) return payload.content || content;
    const trimmed = String(content || '').trim();
    if (trimmed.startsWith('{')) return trimmed;
    if (payload.rawContent) {
      return JSON.stringify({ formatted: payload.content, raw: payload.rawContent });
    }
    return payload.content || content;
  }, [cards.length, payload.content, payload.rawContent, content]);

  const hasDifficulty = cards.some((c) => (c.difficultyTag || c.skillFocus || '').trim());
  const hasMemory = cards.some((c) => (c.memoryHookQuickTip || c.memoryCue || '').trim());
  const hasSelfCheck = cards.some((c) => (c.selfCheckRound || c.peerPrompt || c.reflection || '').trim());

  const orderedSections: DeckSectionDef[] = [
    {
      num: 2,
      title: 'Subtopic Link and Prior Knowledge Required',
      iconName: 'openBook',
      hasContent: !!meta.subtopicLinkPriorKnowledge,
      body: <ExpandableText text={meta.subtopicLinkPriorKnowledge} />,
    },
    {
      num: 3,
      title: "Learning Objectives - Bloom's Taxonomy Aligned",
      iconName: 'target',
      hasContent: meta.learningObjectives.length > 0,
      body: <SelfCheckList items={meta.learningObjectives} tone="violet" />,
    },
    {
      num: 4,
      title: 'NCF Competency / Learning Outcome Alignment',
      iconName: 'graduation',
      hasContent: !!meta.ncfAlignment,
      body: <ExpandableText text={meta.ncfAlignment} />,
    },
    {
      num: 5,
      title: 'Flashcard Set',
      iconName: 'rocket',
      hasContent: true,
      body: (
        <div className="mx-auto w-full max-w-lg">
          <FlashcardViewer
            content={flashcardSessionContent}
            rawContent={payload.rawContent}
            variant="student"
            embedded
          />
        </div>
      ),
    },
    {
      num: 6,
      title: 'Difficulty Tag for Each Card',
      iconName: 'chart',
      hasContent: hasDifficulty,
      body: (
        <PerCardList
          cards={cards}
          pick={(c) => c.difficultyTag || c.skillFocus || ''}
          label={(i) => `Card ${i + 1}`}
        />
      ),
    },
    {
      num: 7,
      title: 'Memory Hook / Quick Tip',
      iconName: 'lightbulb',
      hasContent: hasMemory,
      body: (
        <PerCardList
          cards={cards}
          pick={(c) => c.memoryHookQuickTip || c.memoryCue || ''}
          label={(i) => `Card ${i + 1}`}
        />
      ),
    },
    {
      num: 8,
      title: 'Self-Check Round',
      iconName: 'checklist',
      hasContent: !!meta.selfCheckRound || hasSelfCheck,
      body: (
        <>
          {meta.selfCheckRound ? (
            <p className="text-base whitespace-pre-wrap text-slate-800 mb-1">{meta.selfCheckRound}</p>
          ) : null}
          {hasSelfCheck ? (
            <PerCardList
              cards={cards}
              pick={(c) => c.selfCheckRound || c.peerPrompt || c.reflection || ''}
              label={(i) => `Card ${i + 1}`}
            />
          ) : null}
        </>
      ),
    },
    {
      num: 9,
      title: 'Common Mistakes to Avoid',
      iconName: 'shield',
      hasContent: meta.commonMistakesToAvoid.length > 0,
      body: <SelfCheckList items={meta.commonMistakesToAvoid} tone="rose" prompt="Tap each one you'll watch out for" />,
    },
    {
      num: 10,
      title: 'Expected Learning Outcomes',
      iconName: 'diploma',
      hasContent: meta.expectedLearningOutcomes.length > 0,
      body: <SelfCheckList items={meta.expectedLearningOutcomes} tone="teal" />,
    },
    {
      num: 11,
      title: 'Real-life Application',
      iconName: 'globe',
      hasContent: !!meta.realLifeApplication,
      body: <ExpandableText text={meta.realLifeApplication} />,
    },
    {
      num: 12,
      title: 'Reflection / Exit Ticket',
      iconName: 'memo',
      hasContent: !!meta.reflectionExitTicket,
      body: <ExpandableText text={meta.reflectionExitTicket} />,
    },
  ];

  const visibleSections = orderedSections.filter((sec) => sec.hasContent);

  return (
    <div className={cn('w-full space-y-5', className)}>
      {cards.length > 0 ? (
        <p className="text-sm font-semibold text-violet-800">{cards.length} flashcards in deck</p>
      ) : null}
      <AiToolStackedList>
        {visibleSections.map((sec, i) => renderDeckSection(sec, i + 1))}
      </AiToolStackedList>
    </div>
  );
}
