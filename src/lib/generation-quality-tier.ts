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
