/**
 * Rules engine for Hindi -> Hinglish transliteration.
 * Follows Design.md Section 2.5:
 * Step A: Pre-processing on Devanagari word (NFC, remove ZWJ/ZWNJ, nukta handling, schwa markers)
 * Step B: Transliterate with Sanscript (devanagari -> itrans)
 * Step C: 12-rule ordered cleanup table (lowercase, ksh/gy, retroflex, anusvara, long vowels, etc.)
 */
// @ts-ignore
import Sanscript from "@indic-transliteration/sanscript";

export interface TransliterationResult {
  text: string;
  isSuspicious: boolean;
}

/**
 * Pre-processes Devanagari characters:
 * - Normalizes Unicode (NFC)
 * - Removes zero-width joiners / non-joiners
 * - Handles nuktas: ज़ -> z, फ़ -> f, क़ ख़ ग़ -> k kh g, ड़ -> r, ढ़ -> rh
 */
export function preprocessDevanagari(raw: string): string {
  if (!raw) return "";
  let w = raw.normalize("NFC").replace(/[\u200B-\u200D\uFEFF]/g, "");

  // Replace composed and decomposed nukta characters with placeholders
  w = w
    .replace(/ज़|ज़|\u091C\u093C/g, "___Z___")
    .replace(/फ़|फ़|\u092B\u093C/g, "___F___")
    .replace(/क़|क़|\u0915\u093C/g, "क")
    .replace(/ख़|ख़|\u0916\u093C/g, "ख")
    .replace(/ग़|ग़|\u0917\u093C/g, "ग")
    .replace(/ड़|ड़|\u0921\u093C/g, "___R___")
    .replace(/ढ़|ढ़|\u0922\u093C/g, "___RH___");

  return w;
}

/**
 * Transliterates a single Hindi word token into Hinglish using the rules engine.
 */
export function transliterateByRules(token: string): TransliterationResult {
  if (!token) return { text: "", isSuspicious: false };

  // If already Latin or symbols without letters, handle cleanly
  if (/^[A-Za-z0-9]+$/.test(token)) {
    return { text: token.toLowerCase(), isSuspicious: false };
  }
  if (!/[\u0900-\u097FA-Za-z0-9]/.test(token)) {
    return { text: "", isSuspicious: false };
  }

  // Step A: Preprocess Devanagari
  const prep = preprocessDevanagari(token);

  // Step B: Sanscript transliteration
  let t = "";
  try {
    t = Sanscript.t(prep, "devanagari", "itrans");
  } catch (err) {
    t = prep;
  }

  // Restore nukta placeholders
  t = t
    .replace(/___Z___a/g, "z")
    .replace(/___Z___/g, "z")
    .replace(/___F___a/g, "f")
    .replace(/___F___/g, "f")
    .replace(/___RH___a/g, "rh")
    .replace(/___RH___/g, "rh")
    .replace(/___R___a/g, "r")
    .replace(/___R___/g, "r");

  // Step C: Ordered cleanup table
  // 1. Lowercase everything except capitals used for distinction (A, T, D, etc.)
  // 2. kSh / x -> ksh; j~n -> gy
  t = t.replace(/kSh|x/gi, "ksh").replace(/j~n/gi, "gy");

  // 3. Ch (छ) -> chh; ch stays ch
  t = t.replace(/Ch/g, "chh");

  // 4. Retroflex capitals -> plain: T, Th, D, Dh, N -> t, th, d, dh, n
  t = t
    .replace(/Th/g, "th")
    .replace(/T/g, "t")
    .replace(/Dh/g, "dh")
    .replace(/D/g, "d")
    .replace(/N/g, "n");

  // 5. sh/Sh (श, ष) -> sh
  t = t.replace(/Sh|sh/gi, "sh");

  // 6. Vocalic R^i / RRi -> ri
  t = t.replace(/RRi|R\^i|R_i/gi, "ri");

  // 7. Anusvara / chandrabindu (M, .N, ~):
  // m before p, b, m, y; n elsewhere and at word end
  t = t.replace(/M([pbmy])/gi, "m$1").replace(/[M~]|\.N/g, "n");

  // 8. Drop visarga and any leftover non-letter symbols
  t = t.replace(/H|[\|\^]/g, "");

  // Schwa deletion:
  // (a) Final inherent 'a' dropped in multi-syllable Hindi words
  // e.g. kamala -> kamal, samajha -> samajh, dosta -> dost, samaya -> samay
  // Note: keep 'tra' (e.g. mitra, patra)
  if (t.endsWith("tra")) {
    // keep e.g. mitra
  } else if (
    t.length > 2 &&
    t.endsWith("a") &&
    !t.endsWith("aa") &&
    !t.endsWith("Aa")
  ) {
    t = t.slice(0, -1);
  }

  // (b) Medial schwa deletion:
  // e.g. sarakAra -> sarkAra -> sarkar; chalanA -> chalnA -> chalna; bachapan -> bachpan
  const C = "(?:ch|sh|kh|gh|jh|th|dh|ph|bh|[bcdfghjklmnpqrstvwxyz])";
  const medialSchwaPat = new RegExp(`([aeiou])(${C})a(${C})([aeiouA])`, "gi");
  t = t.replace(medialSchwaPat, (match, v1, c1, c2, v2, offset, fullStr) => {
    const afterC2 = fullStr.slice(offset + match.length - 1);
    const beforeC1 = fullStr.slice(0, offset + 1);
    if (/^[stnrlmd]/i.test(afterC2) && !/^[aeiou]/i.test(afterC2)) {
      return match;
    }
    if (/[nd]$/i.test(beforeC1)) {
      return match;
    }
    return `${v1}${c1}${c2}${v2}`;
  });

  // Hinglish 'v' -> 'w' in common conversational contexts (hawa, darwaza, diwar)
  t = t.replace(/([aeiou])v/gi, "$1w").replace(/v([aou])/gi, "w$1");

  // 9. Long vowels: aa -> a in the middle or end, but KEEP aa at start
  if (t.startsWith("A") || t.startsWith("aa")) {
    t = "aa" + t.replace(/^[Aa]+/, "").replace(/A|aa/g, "a");
  } else {
    t = t.replace(/A|aa/g, "a");
  }

  // 10. ii -> i, uu -> u
  t = t.replace(/ii|I/g, "i").replace(/uu|U/g, "u");

  // 11. Keep ai, au, e, o as is (preserved by standard Sanscript)

  // 12. Collapse any run of 3 or more of the same letter to 2
  t = t.replace(/(.)\1{2,}/g, "$1$1");

  // Final clean lowercase
  t = t.toLowerCase();

  // Suspicious output check:
  // Suspicious if: no vowel (a, e, i, o, u), over 14 characters, or contains leftover ITRANS symbols
  const hasVowel = /[aeiou]/.test(t);
  const tooLong = t.length > 14;
  const hasItransLeftover = /[~^|_\.]/.test(t);
  const isSuspicious = !hasVowel || tooLong || hasItransLeftover;

  return { text: t, isSuspicious };
}
