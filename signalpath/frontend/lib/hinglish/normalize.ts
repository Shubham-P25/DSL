/**
 * Unicode normalization and tokenization for Hindi speech recognition output.
 */

// Strip danda, double danda, punctuation, symbols while preserving alphanumeric tokens
const PUNCT_REGEX = /[।॥.,\/#!$%\^&\*;:{}=\-_`~()?"'<>@\[\]\\+]/g;

export function normalizeHindiText(text: string): string {
  if (!text) return "";
  return text
    .normalize("NFC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "") // Remove zero-width spaces, ZWJ, ZWNJ
    .replace(PUNCT_REGEX, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenizeHindiText(text: string): string[] {
  const normalized = normalizeHindiText(text);
  if (!normalized) return [];
  return normalized.split(" ").filter(Boolean);
}

export function isDevanagari(text: string): boolean {
  return /[\u0900-\u097F]/.test(text);
}

export function isLatinToken(text: string): boolean {
  return /^[A-Za-z0-9]+$/.test(text);
}

