import { formatIitCategoryLabel, normalizeIitCategory } from "@/lib/products";

/** Fields shared by Book Knowledge Base rows and Book-Based Generator options. */
export type BookLabelFields = {
  board?: string;
  class?: string;
  subject?: string;
  productCategory?: string;
  source?: string;
};

const SOURCE_LABELS: Record<string, string> = {
  textbook: "Textbook",
  coaching: "Coaching material",
  notes: "Notes",
  question_bank: "Question bank",
  proprietary: "Proprietary",
  other: "Other",
};

export function bookSourceLabel(source?: string): string {
  const key = String(source || "").trim().toLowerCase();
  return SOURCE_LABELS[key] || (key ? key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "");
}

/**
 * One description line for a book, identical on every screen:
 * "IIT / NEET · Class 7 · Biology · Alpha · Textbook".
 */
export function bookMetaLine(book: BookLabelFields, iitLabelMap?: Record<string, string>): string {
  const track = normalizeIitCategory(book.productCategory);
  return [
    String(book.board || "").trim(),
    String(book.class || "").trim(),
    String(book.subject || "").trim(),
    track ? formatIitCategoryLabel(track, iitLabelMap) : "",
    bookSourceLabel(book.source),
  ]
    .filter(Boolean)
    .join(" · ");
}
