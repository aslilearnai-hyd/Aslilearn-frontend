export const GENERATION_QUALITY_TIERS = [
  {
    id: "premium" as const,
    label: "Premium",
    description: "Gemini 3.1 Flash-Lite — strict validation with cost-capped retries",
  },
  {
    id: "balanced" as const,
    label: "Balanced",
    description: "Gemini 3.1 Flash-Lite — best cost/quality for most book batches",
  },
  {
    id: "fast" as const,
    label: "Fast",
    description: "Gemini 3.1 Flash-Lite — lowest cost, minimal retries",
  },
];

export type GenerationQualityTierId = (typeof GENERATION_QUALITY_TIERS)[number]["id"];

export const DEFAULT_GENERATION_QUALITY_TIER: GenerationQualityTierId = "premium";

/**
 * Book Generator only: the same Premium settings answered through the Gemini Batch API
 * (half price, results later). Maths/science only; other subjects, or Batch off on the server,
 * run as live Premium.
 */
export const BOOK_GENERATOR_QUALITY_TIERS = [
  ...GENERATION_QUALITY_TIERS,
  {
    id: "premium-batch" as const,
    label: "Premium · half price (results later)",
    description:
      "Maths & science: same Premium quality at half the Gemini cost; results usually arrive in minutes (at most 24 h) and appear in the records list — you can leave this page. Other subjects run as normal Premium.",
  },
];

export type BookGeneratorQualityTierId = (typeof BOOK_GENERATOR_QUALITY_TIERS)[number]["id"];
