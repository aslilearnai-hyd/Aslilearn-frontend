/** Remove internal batch variant/scaffold metadata from question stems shown to users. */
export function stripVariantScaffoldFromQuestionText(text: string): string {
  let q = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!q) return '';

  for (let i = 0; i < 3; i += 1) {
    const next = q.replace(/^\[[^\]]{6,280}\]\s*/i, '').trim();
    if (next === q) break;
    q = next;
  }

  q = q.replace(/^(?:record|set)\s+\d+\s*:\s*/i, '').trim();
  // Trailing bank labels: "… Set: 13" / "… (Set 13)" / "… — Set: 13"
  q = q.replace(/\s*[—–-]\s*set\s*:?\s*\d+\s*$/i, '').trim();
  q = q.replace(/\s*\(\s*set\s*:?\s*\d+\s*\)\s*$/i, '').trim();
  q = q.replace(/\s+set\s*:\s*\d+\s*$/i, '').trim();
  q = q.replace(/\s+set\s+\d+\s*$/i, '').trim();
  q = q.replace(/\s*\((?:VSA|SA|LA|MCQ|HOTS|Q)\s*\d+\)\s*$/i, '').trim();
  q = q.replace(/\s*\(variant\s+\d+\)\s*$/i, '').trim();
  // Batch scaffold titles: "… — Practice Activity 883" / "Concept Mastery (Guide 12)"
  q = q.replace(/\s*[—–-]\s*practice\s+activity\s+\d+\s*$/i, '').trim();
  q = q.replace(/\s+practice\s+activity\s+\d+\s*$/i, '').trim();
  q = q.replace(/\s*[—–-]\s*concept\s+mastery\s*\(guide\s*\d+\)\s*$/i, '').trim();
  q = q.replace(/\s*\(guide\s*\d+\)\s*$/i, '').trim();
  q = q.replace(/^\s*variant\s+\d+\s*:\s*/i, '').trim();

  return q;
}

const PROMPT_LEAK_MARKERS: RegExp[] = [
  /\bNo filler content\b/i,
  /\bAll sections mandatory\b/i,
  /\bValid JSON output required\b/i,
  /\b(?:Only|Just)\s+JSON\b/i,
  /\bStart JSON construction\b/i,
  /\bFinal verification complete\b/i,
  /\bPlain JSON string only\b/i,
  /\bDo not fail validation\b/i,
  /\bExecution started\b/i,
  /\bFinal JSON block follows\b/i,
  /\bNo code fences\b/i,
  /\bReady for implementation\b/i,
  /\bTarget:\s*100%/i,
  /\bProfessional (?:tone|educational content)\b/i,
  /\bCorrected for CBSE standards\b/i,
  /\bAll constraints followed\b/i,
  /\bOne valid JSON object\b/i,
  /\bValid JSON object starts now\b/i,
  /\bready\.\s*proceed\.\s*execution\b/i,
  /\bExecution complete\b/i,
  /\bJSON production\b/i,
  /\bNo extra text outside the JSON\b/i,
];

const LESSON_PLAN_LABEL_MARKERS: RegExp[] = [
  /\bThis lesson requires\b/i,
  /\bSafety:\s*Wear\b/i,
  /\bTeacher:\s*['"]/i,
  /\bExpected Answer:\s*['"]/i,
  /\bTeacher Response:\s*['"]/i,
  /\bFocus:\s*Measuring\b/i,
  /\bBloom'?s Taxonomy:\s*Remember\b/i,
  /\bDuration:\s*\d+\s*minutes\b/i,
  /\bFormative Assessment:\s*Exit ticket\b/i,
  /\bBoard Alignment:\s*CBSE\b/i,
  /\bIndian Context:\s*Analysis\b/i,
  /\bScience Skill:\s*Measuring\b/i,
  /\bTeacher Move:\s*Use\b/i,
];

function truncateAtEarliestMarker(text: string, markers: RegExp[], minKeep = 24): string {
  let cut = text.length;
  for (const re of markers) {
    const m = re.exec(text);
    if (m && m.index !== undefined && m.index >= minKeep && m.index < cut) {
      cut = m.index;
    }
  }
  return cut < text.length ? text.slice(0, cut).trim() : text;
}

function stripPromptValidationLoops(text: string): string {
  let s = text;
  if (
    (/\bReady\b/i.test(s) && /\bProceed\b/i.test(s) && /\bValid\b/i.test(s) && /\bJSON\b/i.test(s)) ||
    (/\bReady\b/gi.test(s) && (s.match(/\bReady\b/gi)?.length || 0) >= 3)
  ) {
    const loopStart = s.search(/\bReady\b\.?\s*\bProceed\b/i);
    if (loopStart > 40) s = s.slice(0, loopStart).trim();
  }
  s = s.replace(/(?:\bReady\b\.?\s*\bProceed\b\.?\s*\bExecution\b\.?\s*){2,}[\s\S]*$/gi, '').trim();
  s = s.replace(/(?:\bValid\b\.?\s*\bJSON\b\.?\s*){3,}[\s\S]*$/gi, '').trim();
  s = s.replace(/(?:\bReady\b\.?\s*){3,}[\s\S]*$/gi, '').trim();
  return s;
}

/** Trim topic/subtopic labels that accidentally include full lesson-plan prose. */
export function stripLessonPlanLeakFromLabel(text: string): string {
  let s = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!s) return '';
  s = truncateAtEarliestMarker(s, LESSON_PLAN_LABEL_MARKERS, 16);
  s = truncateAtEarliestMarker(s, PROMPT_LEAK_MARKERS, 16);
  if (s.length > 280) {
    const sentence = s.match(/^[\s\S]{1,280}?[.!?](?=\s|$)/);
    if (sentence) s = sentence[0].trim();
    else s = `${s.slice(0, 277).trim()}…`;
  }
  return s;
}

/** True when a flashcard pair is generic backend/LLM scaffold, not real content. */
export function isScaffoldFlashcardPair(front: string, back: string): boolean {
  const f = String(front || '').trim();
  const b = String(back || '').trim();
  if (!f || !b) return false;
  if (
    /^What are the key ideas about .+\?$/i.test(f) &&
    /^Students should define the concept, give one example/i.test(b)
  ) {
    return true;
  }
  if (/^What is .+\?$/i.test(f) && f.replace(/^What is (.+)\?$/i, '$1') === b) return true;
  if (/— key idea \d+$/i.test(f) && /Summarize one key idea about/i.test(b)) return true;
  if (/explain how it connects to .+ in /i.test(b)) return true;
  if (/to short real-life examples\??$/i.test(f)) return true;
  if (
    /^Students should recall basic ideas about .+ before using this deck\.?$/i.test(f) ||
    /^Define and explain key ideas about /i.test(f)
  ) {
    return true;
  }
  return false;
}

/** True when deck narrative fields are generic scaffold lines. */
export function isScaffoldDeckMetaText(text: string): boolean {
  const s = String(text || '').trim();
  if (!s) return false;
  return (
    /^Students should recall basic ideas about .+ before using this deck\.?$/i.test(s) ||
    /^Define and explain key ideas about .+\.?$/i.test(s) ||
    /^Apply .+ to short real-life examples\.?$/i.test(s) ||
    /^NCF-aligned: conceptual understanding and application for .+ in .+\.?$/i.test(s) ||
    /^Link each .+ idea to a vivid daily-life image to remember the deck\.?$/i.test(s) ||
    /^Rapid recall: cover each card, then explain .+ in your own words\.?$/i.test(s) ||
    /^Support: use memory hooks and pair review\. Extension: create two new cards for .+\.?$/i.test(s) ||
    /^Relate each card to an observation from daily life linked to .+\.?$/i.test(s) ||
    /^Which card was hardest for .+, and why\?$/i.test(s) ||
    /^Mixing opinion with evidence when studying .+\.?$/i.test(s)
  );
}

/** Strip batch metadata, prompt leaks, and catalog paths from any AI tool text field. */
export function stripAiGeneratorLeakage(text: string): string {
  let s = stripVariantScaffoldFromQuestionText(String(text || '').replace(/\r\n/g, '\n'));
  if (!s) return '';

  s = truncateAtEarliestMarker(s, PROMPT_LEAK_MARKERS, 32);
  s = truncateAtEarliestMarker(
    s,
    [
      /\b(?:the\s+)?(?:alpha|beta|gamma)\s+version\s+of\s+asli\s+prep\s+foundation(?:\s+material)?\b/i,
      /\babout\s+asli\s+prep(?:\s+foundation)?\b/i,
      /\basli\s+prep\s+foundation\s+material\s+is\s+designed\b/i,
    ],
    16,
  );
  s = stripPromptValidationLoops(s);

  s = s.replace(
    /\bvolume-\d+\s*\|\s*chapter\s+\d+\s*[-—–:]\s*.*?(?=\s+(?:explain|describe|list|follow|design|students|complete|write|observe|in pairs|during|walk)\b)/gi,
    ' ',
  ).trim();
  s = s.replace(/\bvolume-\d+\s*\|\s*chapter\s+\d+\s*[-—–:]\s*[^|]+(?:\s*\|\s*[^|]+)?/gi, ' ').trim();
  s = s.replace(/(?:^|[\s(])(?:variant|set|record)\s+\d+\s*:\s*/gi, ' ').trim();
  s = s.replace(/\(\s*uniqueness\s+seed\s*:[^)]*\)/gi, ' ').trim();
  s = s.replace(/\bseed\s*:\s*[\w-]+/gi, ' ').trim();
  s = s.replace(/\b\d+\s+of\s+\d+\s+variant\b/gi, ' ').trim();
  s = s.replace(
    /\b(?:constraints|alignment|differentiation)\s*:[^.]{0,220}(?:foundation\s+level|provided|remember\s+through\s+create)[^.]*\.?/gi,
    ' ',
  ).trim();
  s = s.replace(
    /\b(?:no\s+markdown|plain\s+text\s+only|valid\s+json(?:\s+output)?\s+only|complete\s+fields\s+only|no\s+placeholders?|no\s+repetition|no\s+ai\s+fluff|100\s*percent\s+compliant)[^.]*\.?/gi,
    ' ',
  ).trim();
  s = s.replace(/\bready\s+to\s+export\s+as\s+json\b[^.]*\.?/gi, ' ').trim();
  s = s.replace(/(?:\b(?:success|done|ok)\b[\s.]*){2,}/gi, ' ').trim();
  s = s.replace(/\s*\|\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
  s = s.replace(/^[,;:\-\s.]+|[,;:\-\s.]+$/g, '').trim();
  return s;
}

/** Strip variant/uniqueness salts from flashcard topic link fields. */
export function sanitizeFlashcardTopicLink(text: string): string {
  let s = stripLessonPlanLeakFromLabel(stripAiGeneratorLeakage(String(text || '')));
  if (!s) return '';
  if (/classlevel|difficultylevel|bloom_level|bloomlevel/i.test(s)) return '';

  s = s
    .replace(/\bEdition-[\w-]*/gi, ' ')
    .replace(/\b\d{10,}-v\d+-a\d+-[a-z0-9][\w-]*/gi, ' ')
    .replace(/(?:[-\s]V\d+-A\d+-[A-Z0-9]+)+/gi, ' ')
    .replace(/\bFlashcard Deck\b/gi, ' ')
    .replace(/\bSecondary Education\b/gi, ' ')
    .replace(/\bTeacher Manual\b/gi, ' ')
    .replace(/\bCompetency\b/gi, ' ')
    .replace(/[,;]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  s = s.replace(/(?:\s*[—–-]\s*)+$/g, '').trim();
  s = s.replace(/\s*[—–-]\s*(?:V\d+|A\d+|[\w]{6,})\s*$/gi, '').trim();
  if (!s || /^[\s,—–-]+$/.test(s)) return '';

  if (s.length > 160 && !/\s[—–-]\s/.test(s)) return '';
  return s.replace(/\s*[—–-]\s*/g, ' — ').trim();
}

/** Avoid "Class Class 10" when class_level is stored for display chips. */
export function normalizeFlashcardClassLevel(text: string): string {
  const s = String(text || '').trim();
  if (!s) return '';
  const digits = s.match(/\d+/)?.[0];
  if (digits) return `Class ${digits}`;
  return s.replace(/^Class\s+Class\s+/i, 'Class ').trim();
}

const FLASHCARD_SECTION_LEAK_RE =
  /(?:^|\n)\s*(?:#{1,6}\s*)?(?:\d+\s*[.)·:\-]\s*)?(?:Study Aids|The Card Set|Application\s*&\s*HOTS|Wrap-?Up|Foundations|Context\s*&\s*Alignment|Memory Hook|Common Mistakes|NCF Competency|Learning Objectives)\b[\s\S]*$/i;

/**
 * Clean flashcard front/back for display (old + new generations):
 * - drop leaked markdown section headers (### 4. Study Aids)
 * - drop leftover ## / ### heading lines
 * - strip bold markers
 */
export function sanitizeFlashcardFieldText(text: string): string {
  let s = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!s) return '';

  // Cut at leaked next-section headers (common when model concatenates deck blocks)
  s = s.replace(FLASHCARD_SECTION_LEAK_RE, '').trim();
  s = s.replace(/(?:^|\n)\s*#{1,6}\s+\d+[.)]?\s*[^\n]*$/gm, '').trim();
  s = s.replace(/(?:^|\n)\s*#{1,6}\s+[^\n]+$/gm, '').trim();
  // Trailing bare heading without newline at end of field
  s = s.replace(/\s*#{1,6}\s*(?:\d+[.)]?\s*)?(?:Study Aids|Wrap-?Up|Foundations|Context\s*&\s*Alignment)\s*$/i, '').trim();
  s = s.replace(/\*\*/g, '').trim();
  s = s.replace(/\s{2,}/g, ' ').trim();
  return s;
}

/**
 * Teacher/student AI tools ask the model for plain text shaped like:
 * NAME OF THE TOOL / CLASS / SUBJECT / TOPIC / SUB TOPIC / CONTENT / ...
 * This returns only the part after the CONTENT header for display and export.
 */
export function stripStructuredAiToolMetadata(text: string): string {
  if (text == null || typeof text !== 'string') return '';
  const normalized = text.replace(/\r\n/g, '\n');
  const re = /(?:^|\n)\s*CONTENT\s*:?\s*\r?\n/i;
  const m = normalized.match(re);
  if (!m || m.index === undefined) return text;
  const start = m.index + m[0].length;
  const rest = normalized.slice(start).trimStart();
  return rest.length > 0 ? rest : text;
}
