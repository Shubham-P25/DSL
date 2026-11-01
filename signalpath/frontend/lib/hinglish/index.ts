/**
 * Main Hinglish conversion engine.
 * Converts tokens with tier classification (dict | rule | passthrough)
 * and trust levels (high | mid | low).
 */
import { normalizeHindiText, tokenizeHindiText, isLatinToken } from "./normalize";
import { getDictionarySpelling } from "./lexicon";
import { transliterateByRules } from "./rules";

export type WordTier = "dict" | "rule" | "passthrough";
export type WordTrust = "high" | "mid" | "low";

export interface HinglishWord {
  hindi: string;
  hinglish: string;
  tier: WordTier;
  trust: WordTrust;
}

// In-memory memoization cache for token conversions
const tokenCache = new Map<string, HinglishWord>();

/**
 * Converts a single Hindi token to Hinglish.
 * Memoized in-memory for instant lookups (<1ms).
 */
export function toHinglish(rawToken: string): HinglishWord {
  const token = rawToken.trim();
  if (!token) {
    return { hindi: "", hinglish: "", tier: "passthrough", trust: "high" };
  }

  // Check memoized cache
  const cached = tokenCache.get(token);
  if (cached) return cached;

  let result: HinglishWord;

  // 1. Latin alphanumeric tokens pass through directly
  if (isLatinToken(token)) {
    result = {
      hindi: token,
      hinglish: token,
      tier: "passthrough",
      trust: "high",
    };
  } else {
    // 2. Check curated dictionary
    const dictSpelling = getDictionarySpelling(token);
    if (dictSpelling) {
      result = {
        hindi: token,
        hinglish: dictSpelling,
        tier: "dict",
        trust: "high",
      };
    } else {
      // 3. Fallback to rules engine
      const ruleRes = transliterateByRules(token);
      result = {
        hindi: token,
        hinglish: ruleRes.text,
        tier: "rule",
        trust: ruleRes.isSuspicious ? "low" : "mid",
      };
    }
  }

  tokenCache.set(token, result);
  return result;
}

/**
 * Converts full recognized text into an array of HinglishWords.
 */
export function convertHindiSentence(rawText: string): HinglishWord[] {
  if (!rawText) return [];
  const tokens = tokenizeHindiText(rawText);
  return tokens.map(toHinglish);
}

/**
 * Converts and joins tokens into a plain Hinglish string.
 */
export function convertHindiToHinglishText(rawText: string): string {
  const words = convertHindiSentence(rawText);
  return words.map((w) => w.hinglish).join(" ");
}

/**
 * Clears the conversion memoization cache.
 */
export function clearHinglishCache(): void {
  tokenCache.clear();
}

