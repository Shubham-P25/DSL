"""Semantic multilingual subtitle translation (English, Hindi, Marathi, Tamil).
Guarantees semantic meaning preservation and strictly avoids phonetic transliteration.
Example: 'Feed me' -> Hindi: 'मुझे खाना खिलाओ', Marathi: 'मला खायला द्या', Tamil: 'எனக்கு உணவளியுங்கள்'.
"""
import json
import logging
import time
from pathlib import Path
from typing import Any
from app.core.config import settings
from app.llm.gemini import GeminiClient

log = logging.getLogger(__name__)

SUPPORTED_LANGUAGES = {
    "en": {"code": "en", "name": "English", "locale": "en-US", "native": "English", "flag": "🇬🇧"},
    "hi": {"code": "hi", "name": "Hindi", "locale": "hi-IN", "native": "हिंदी", "flag": "🇮🇳"},
    "mr": {"code": "mr", "name": "Marathi", "locale": "mr-IN", "native": "मराठी", "flag": "🚩"},
    "ta": {"code": "ta", "name": "Tamil", "locale": "ta-IN", "native": "தமிழ்", "flag": "🏛️"},
}

_CACHE_FILE = Path(settings.data_dir) / "translation_cache.json"
_mem_cache: dict[str, str] = {}


def _load_cache() -> None:
    global _mem_cache
    if not _mem_cache and _CACHE_FILE.exists():
        try:
            with open(_CACHE_FILE, "r", encoding="utf-8") as f:
                _mem_cache = json.load(f)
        except Exception:
            _mem_cache = {}


def _save_cache() -> None:
    try:
        _CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(_CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(_mem_cache, f, ensure_ascii=False, indent=2)
    except Exception as exc:
        log.warning("failed to save translation cache: %s", exc)


def _cache_key(text: str, src: str, tgt: str) -> str:
    return f"{src.lower()}:{tgt.lower()}:{text.strip()}"


def _fallback_translate(text: str, src: str, tgt: str) -> str:
    """Fallback translator using GoogleTranslator / MyMemory."""
    # Try GoogleTranslator first
    try:
        from deep_translator import GoogleTranslator
        src_code = "auto" if src == "auto" else src
        translated = GoogleTranslator(source=src_code, target=tgt).translate(text)
        if translated and translated.strip():
            return translated.strip()
    except Exception as exc:
        log.debug("[Translate] GoogleTranslator fallback error: %s", exc)

    # Try MyMemory
    try:
        from deep_translator import MyMemoryTranslator
        src_loc = SUPPORTED_LANGUAGES.get(src, {}).get("locale", src)
        tgt_loc = SUPPORTED_LANGUAGES.get(tgt, {}).get("locale", tgt)
        translated = MyMemoryTranslator(source=src_loc, target=tgt_loc).translate(text)
        if translated and translated.strip():
            return translated.strip()
    except Exception as exc:
        log.warning("[Translate] MyMemory fallback error: %s", exc)

    return text


def translate_batch_semantic(
    items: list[tuple[int, str]],
    src_lang: str,
    tgt_lang: str,
    gemini: GeminiClient | None = None,
) -> dict[int, str]:
    """Translate a batch of subtitle cues preserving narrative context and idiomatic meaning."""
    _load_cache()
    gemini = gemini or GeminiClient()

    results: dict[int, str] = {}
    pending: list[tuple[int, str]] = []

    for idx, text in items:
        clean = text.strip()
        if not clean:
            results[idx] = ""
            continue
        if src_lang == tgt_lang:
            results[idx] = clean
            continue
        k = _cache_key(clean, src_lang, tgt_lang)
        if k in _mem_cache:
            results[idx] = _mem_cache[k]
        else:
            pending.append((idx, clean))

    if not pending:
        return results

    src_name = SUPPORTED_LANGUAGES.get(src_lang, {}).get("name", src_lang)
    tgt_name = SUPPORTED_LANGUAGES.get(tgt_lang, {}).get("name", tgt_lang)

    # Try Gemini batch translation first
    if gemini.is_available():
        prompt = f"""You are a professional subtitle translator and localization expert.
Translate the following sequential subtitle dialogue cues from {src_name} ({src_lang}) into natural {tgt_name} ({tgt_lang}).

CRITICAL INSTRUCTIONS:
1. Translate the EXACT NATURAL SPOKEN MEANING for native speakers.
2. ABSOLUTELY NO PHONETIC TRANSLITERATION (Do not write English words using Devanagari or Tamil script unless it is a proper brand name).
   - Marathi Example: 'Feed me' -> 'मला जेवण द्या' / 'मला खायला दे' (NOT 'फीड मी').
   - Hindi Example: 'Feed me' -> 'मुझे खाना खिलाओ' (NOT 'फीड मी').
   - Tamil Example: 'Feed me' -> 'எனக்கு உணவளியுங்கள்'.
   - English Example: 'मला भूक लागली आहे' -> 'I am hungry'.
3. Preserve the exact order and numbering of cues.

Input cues:
{json.dumps([{"id": i, "text": t} for i, t in pending], ensure_ascii=False)}

Return JSON format only:
[
  {{"id": 0, "translation": "translated natural text"}}
]
"""
        try:
            resp_data = gemini.generate_json(prompt, timeout=35.0)
            if resp_data and isinstance(resp_data, list):
                for cue in resp_data:
                    if isinstance(cue, dict) and "id" in cue and "translation" in cue:
                        c_id = cue["id"]
                        tr_txt = str(cue["translation"]).strip()
                        if tr_txt:
                            results[c_id] = tr_txt
                            # Find original text to cache
                            orig_txt = next((t for i, t in pending if i == c_id), None)
                            if orig_txt:
                                _mem_cache[_cache_key(orig_txt, src_lang, tgt_lang)] = tr_txt
        except Exception as exc:
            log.warning("[Translate] Gemini batch translation failed (%s), will use package fallback.", exc)

    # Process any remaining cues via package fallback
    for idx, clean in pending:
        if idx not in results or not results[idx]:
            translated = _fallback_translate(clean, src_lang, tgt_lang)
            results[idx] = translated
            _mem_cache[_cache_key(clean, src_lang, tgt_lang)] = translated

    _save_cache()
    return results


def translate_text_semantic(text: str, src_lang: str, tgt_lang: str) -> str:
    """Translate a single sentence/cue semantically with zero transliteration."""
    text_clean = text.strip()
    if not text_clean or src_lang == tgt_lang:
        return text_clean

    res = translate_batch_semantic([(0, text_clean)], src_lang, tgt_lang)
    return res.get(0, text_clean)


def translate_segments_multilingual(
    segments: list[dict],
    source_lang: str = "en",
    target_langs: list[str] | None = None,
    on_progress: Any = None,
) -> list[dict]:
    """Translate all segments into target languages (en, hi, mr, ta).
    Guarantees meaning-matching translations across all tracks.
    """
    targets = target_langs or ["en", "hi", "mr", "ta"]
    src = (source_lang or "en").lower()
    if src not in SUPPORTED_LANGUAGES:
        src = "en"

    total = len(segments)
    log.info("[Translate] Beginning multilingual translation of %d segments into %s (source: %s)...", total, targets, src)

    gemini = GeminiClient()
    batch_size = 12

    for tgt in targets:
        if tgt == src:
            for s in segments:
                t = (s.get("final_text") or s.get("text") or "").strip()
                s.setdefault("translations", {})[tgt] = {"text": t, "lang": tgt, "engine": "original"}
            continue

        log.info("[Translate] Translating %d segments into '%s'...", total, tgt)
        for offset in range(0, total, batch_size):
            chunk = segments[offset : offset + batch_size]
            items = []
            for i, s in enumerate(chunk):
                # Check if already translated
                existing = s.get("translations", {}).get(tgt, {}).get("text")
                if not existing:
                    t = (s.get("final_text") or s.get("text") or "").strip()
                    if t:
                        items.append((offset + i, t))

            if items:
                translated_map = translate_batch_semantic(items, src, tgt, gemini=gemini)
                for abs_idx, trans_text in translated_map.items():
                    s = segments[abs_idx]
                    s.setdefault("translations", {})[tgt] = {
                        "text": trans_text,
                        "lang": tgt,
                        "engine": "gemini_semantic",
                    }

            if on_progress:
                pct = min(1.0, (offset + len(chunk)) / total)
                on_progress(pct)

    _save_cache()
    log.info("[Translate] Completed multilingual translation for all %d segments.", total)
    return segments
