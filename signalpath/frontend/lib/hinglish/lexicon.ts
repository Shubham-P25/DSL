/**
 * Runtime lexicon loader and cache for Hindi -> Hinglish dictionary.
 * Caches in module scope. Non-blocking asynchronous loading.
 */

let lexiconCache: Map<string, string> | null = null;
let loadPromise: Promise<boolean> | null = null;
let isLoaded = false;
let loadFailed = false;

export async function loadLexicon(): Promise<boolean> {
  if (isLoaded && lexiconCache) return true;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      const res = await fetch("/lexicon/hi-hinglish.v1.json", { cache: "force-cache" });
      if (!res.ok) {
        console.warn(`[Hinglish Lexicon] Failed to load dictionary (HTTP ${res.status}). Using rules only.`);
        loadFailed = true;
        return false;
      }
      const data = await res.json();
      lexiconCache = new Map(Object.entries(data));
      isLoaded = true;
      loadFailed = false;
      console.log(`[Hinglish Lexicon] Loaded ${lexiconCache.size} words into memory.`);
      return true;
    } catch (err) {
      console.warn("[Hinglish Lexicon] Error loading dictionary. Falling back to rules:", err);
      loadFailed = true;
      return false;
    }
  })();

  return loadPromise;
}

export function getDictionarySpelling(token: string): string | null {
  if (!lexiconCache || !token) return null;
  return lexiconCache.get(token) || null;
}

export function isLexiconReady(): boolean {
  return isLoaded && lexiconCache !== null;
}

export function hasLexiconFailed(): boolean {
  return loadFailed;
}

export function getLexiconSize(): number {
  return lexiconCache ? lexiconCache.size : 0;
}

