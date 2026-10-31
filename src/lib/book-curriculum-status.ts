/**
 * Display helpers for the Book Knowledge Base curriculum-mapping badge and
 * labels. Pure (no React) so they can be unit tested with `node --test`.
 */

export type MappingGate = { key: string; label: string; pass: boolean; detail?: string };

export type MappingStatusLike = {
  status?: string;
  statusReason?: string;
  failingGates?: string[];
  gates?: MappingGate[];
  mappedSubtopics?: number;
  totalSubtopics?: number;
  mathQa?: { applicable?: boolean; flaggedSections?: number } | null;
};

/** Gates that only ask for a text check; the curriculum mapping itself is complete. */
const QUALITY_ONLY_GATES = new Set(["math_qa"]);

export type MappingStatusReason = "" | "mapping" | "formula_check";

/** Why a book is not ready. Older summaries lack `statusReason`, so derive it from the gates. */
export function mappingStatusReason(mapping?: MappingStatusLike | null): MappingStatusReason {
  if (!mapping || mapping.status !== "needs_review") return "";
  if (mapping.statusReason === "mapping" || mapping.statusReason === "formula_check") return mapping.statusReason;
  const failing = (mapping.gates || []).filter((g) => !g.pass).map((g) => g.key);
  return failing.length && failing.every((k) => QUALITY_ONLY_GATES.has(k)) ? "formula_check" : "mapping";
}

export function failingGates(mapping?: MappingStatusLike | null): MappingGate[] {
  return (mapping?.gates || []).filter((g) => !g.pass);
}

const STATUS_LABEL: Record<string, string> = {
  ready: "Mapped",
  needs_review: "Needs review",
  unmapped: "Unmapped",
  no_curriculum: "No curriculum",
  not_mapped: "Not mapped",
};

export type MappingBadgeInfo = {
  /** Badge text after "Curriculum: ". */
  text: string;
  tone: "ready" | "warn" | "error" | "neutral";
  /** Hover / screen-reader explanation of the failing gate(s). */
  explanation: string;
};

export function mappingBadgeInfo(mapping?: MappingStatusLike | null): MappingBadgeInfo {
  const status = mapping?.status || "not_mapped";
  const subtopics =
    mapping?.totalSubtopics && status !== "no_curriculum" ? `${mapping.mappedSubtopics || 0}/${mapping.totalSubtopics}` : "";
  const failing = failingGates(mapping);
  const gateText = failing.map((g) => `${g.label}${g.detail ? `: ${g.detail}` : ""}`).join("; ");
  const reason = mappingStatusReason(mapping);
  if (reason === "formula_check") {
    const n = Number(mapping?.mathQa?.flaggedSections) || 0;
    const check = n ? `${n} formula section${n === 1 ? "" : "s"} to check` : "formulas to check";
    return {
      text: ["Mapped", subtopics, check].filter(Boolean).join(" · "),
      tone: "warn",
      explanation:
        `Curriculum mapping is complete. Only the Maths notation gate fails${gateText ? ` (${gateText})` : ""}. ` +
        "Open the mapping to exclude those sections or reindex a fixed PDF.",
    };
  }
  const label = STATUS_LABEL[status] || status;
  return {
    text: [label, subtopics ? `${subtopics} subtopics` : ""].filter(Boolean).join(" · "),
    tone: status === "ready" ? "ready" : status === "needs_review" ? "warn" : status === "unmapped" ? "error" : "neutral",
    explanation:
      status === "needs_review"
        ? `Failing readiness gate${failing.length === 1 ? "" : "s"}: ${gateText || "see the mapping dialog"}.`
        : status === "ready"
          ? "Every readiness gate passed."
          : label,
  };
}

const FFFD = "\uFFFD";
const DASHES = "\\-\u2010\u2011\u2012\u2013\u2014\u2015\u2212";

/**
 * Repair labels damaged by an encoding round-trip (mirrors the backend's
 * utils/text-mojibake-repair.js): "Baudhāyana�-Pythagoras" → "Baudhāyana–Pythagoras".
 */
export function cleanCurriculumLabel(value?: string | null): string {
  let s = String(value ?? "").normalize("NFC");
  if (!s.includes(FFFD) && !/(^|[\s\p{P}])\p{M}/u.test(s)) return s;
  s = s
    .replace(new RegExp(`${FFFD}+\\s?[${DASHES}]+|[${DASHES}]+\\s?${FFFD}+`, "g"), "\u2013")
    .replace(new RegExp(`(\\S) ${FFFD}+ (?=\\S)`, "gu"), "$1 \u2013 ")
    .replace(new RegExp(`(\\p{L})${FFFD}(s|t|d|ll|re|ve|m)\\b`, "gu"), "$1\u2019$2")
    .replace(/(^|[\s\p{P}])\p{M}+/gu, "$1")
    .replace(new RegExp(`${FFFD}+`, "g"), " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ ([,.;:)])/g, "$1");
  return s.trim();
}

/** Plain-language names for the maths-QA hit kinds. */
export const NOTATION_HIT_LABEL: Record<string, string> = {
  pdf_glyph: "unreadable PDF glyphs",
  lost_exponent: "lost superscripts (x 2 for x²)",
  stacked_operator: "lost square roots (× × left behind)",
  lost_radical: "lost square roots (3 2 for 3√2)",
  broken_root: "empty √ signs",
  doubled_math_letter: "doubled maths letters",
};
