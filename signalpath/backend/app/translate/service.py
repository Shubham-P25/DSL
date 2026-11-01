"""Lazy translation service with SQLite caching, 40-cue batching, and deep-translator fallback."""
import concurrent.futures
import hashlib
import json
import logging
from datetime import datetime, timezone
from sqlmodel import Session, select
from app.core.config import settings
from app.core.db import engine, init_db
from app.core.errors import AppError
from app.langs.registry import LANGS
from app.llm.gemini import GeminiClient
from app.models_db.tables import Job, Segment, TranslationCache

log = logging.getLogger(__name__)

_POOL = concurrent.futures.ThreadPoolExecutor(max_workers=2, thread_name_prefix="sp-trans-")
_TABLE_CHECKED = False


def _ensure_cache_table():
    global _TABLE_CHECKED
    if not _TABLE_CHECKED:
        init_db()
        _TABLE_CHECKED = True


def _cache_key(src: str, tgt: str, engine_name: str, text: str) -> str:
    raw = f"{src.lower()}|{tgt.lower()}|{engine_name.lower()}|{text.strip()}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _get_cached(session: Session, key: str) -> str | None:
    _ensure_cache_table()
    try:
        cached = session.get(TranslationCache, key)
        return cached.text if cached else None
    except Exception:
        init_db()
        cached = session.get(TranslationCache, key)
        return cached.text if cached else None


def _set_cached(session: Session, key: str, text: str) -> None:
    _ensure_cache_table()
    try:
        row = TranslationCache(key=key, text=text, created_at=datetime.now(timezone.utc))
        session.merge(row)
        session.commit()
    except Exception as exc:
        log.debug("Could not commit translation cache row: %s", exc)


def _deep_translate(text: str, src: str, tgt: str) -> tuple[str, str]:
    """Fallback translator using GoogleTranslator / MyMemory."""
    clean = text.strip()
    if not clean or src == tgt:
        return clean, "original"

    try:
        from deep_translator import GoogleTranslator
        src_code = "auto" if src == "auto" else src
        res = GoogleTranslator(source=src_code, target=tgt).translate(clean)
        if res and res.strip():
            return res.strip(), "google"
    except Exception as exc:
        log.debug("GoogleTranslator error: %s", exc)

    try:
        from deep_translator import MyMemoryTranslator
        res = MyMemoryTranslator(source=src, target=tgt).translate(clean)
        if res and res.strip():
            return res.strip(), "mymemory"
    except Exception as exc:
        log.debug("MyMemoryTranslator error: %s", exc)

    return clean, "fallback"


def translate_text_semantic(text: str, src_lang: str, tgt_lang: str) -> str:
    """Translate single string semantically."""
    if not text.strip() or src_lang == tgt_lang:
        return text.strip()
    with Session(engine) as session:
        k = _cache_key(src_lang, tgt_lang, "gemini", text)
        cached = _get_cached(session, k)
        if cached:
            return cached

    gemini = GeminiClient()
    src_name = LANGS[src_lang].name if src_lang in LANGS else src_lang
    tgt_name = LANGS[tgt_lang].name if tgt_lang in LANGS else tgt_lang

    if gemini.is_available():
        prompt = f"""You are a professional subtitle translator and localization expert.
Translate the following sentence from {src_name} into natural, idiomatic {tgt_name}.
CRITICAL RULES:
1. Translate the EXACT NATURAL SPOKEN MEANING for native speakers.
2. ABSOLUTELY NO PHONETIC TRANSLITERATION (Do not write English sounds using Devanagari/Tamil characters).
   Example: 'Feed me' -> Hindi: 'मुझे खाना खिलाओ', Marathi: 'मला खायला द्या', Tamil: 'எனக்கு உணவளியுங்கள்'.
3. Preserve proper nouns and numbers. Return only the translated sentence without quotes.

Sentence: {text}"""
        try:
            res = gemini.generate_text(prompt)
            if res and res.strip():
                ans = res.strip().strip('"').strip("'")
                with Session(engine) as session:
                    _set_cached(session, k, ans)
                return ans
        except Exception as exc:
            log.debug("Gemini single translate failed: %s", exc)

    translated, eng = _deep_translate(text, src_lang, tgt_lang)
    with Session(engine) as session:
        _set_cached(session, _cache_key(src_lang, tgt_lang, eng, text), translated)
    return translated


def translate_segments_multilingual(
    segments: list[dict],
    source_lang: str = "en",
    target_langs: list[str] | None = None,
    on_progress=None,
) -> list[dict]:
    """Synchronous translation for a list of segment dicts (for backwards compatibility)."""
    targets = target_langs or list(LANGS.keys())
    src = (source_lang or "en").lower()
    if src not in LANGS:
        raise AppError("LANG_UNSUPPORTED", f"Source language '{src}' is not supported.")

    for s in segments:
        text = s.get("final_text") or s.get("text", "")
        if "translations" not in s or not isinstance(s["translations"], dict):
            s["translations"] = {}
        for tgt in targets:
            if tgt not in LANGS:
                raise AppError("LANG_UNSUPPORTED", f"Target language '{tgt}' is not supported.")
            if tgt == src:
                s["translations"][tgt] = {"text": text, "engine": "original", "verified": True}
            elif tgt not in s["translations"]:
                res = translate_text_semantic(text, src, tgt)
                s["translations"][tgt] = {"text": res, "engine": "gemini", "verified": False}

    return segments


def translate_job_language(job_id: str, tgt_lang: str) -> None:
    """Translate all cues for a given job into tgt_lang using 40-cue batches and SQLite cache."""
    if tgt_lang not in LANGS:
        raise AppError("LANG_UNSUPPORTED", f"Target language '{tgt_lang}' is not supported.", http_status=400)

    with Session(engine) as session:
        job = session.get(Job, job_id)
        if not job:
            log.warning("translate_job_language: Job %s not found", job_id)
            return

        src_lang = (job.source_lang or "en").lower()
        if src_lang not in LANGS:
            src_lang = "en"

        segments = list(session.exec(select(Segment).where(Segment.job_id == job_id).order_by(Segment.idx)).all())
        if not segments:
            return

        # Prepare cues
        cues_to_translate: list[tuple[Segment, str]] = []
        for s in segments:
            # check if translation already present
            trans = s.translations or {}
            if tgt_lang in trans and trans[tgt_lang].get("text"):
                continue

            text = (s.final_text or s.text or "").strip()
            if not text:
                continue

            if src_lang == tgt_lang:
                trans[tgt_lang] = {"text": text, "engine": "original", "verified": True}
                s.translations = dict(trans)
                session.add(s)
                continue

            # Check SQLite cache
            k = _cache_key(src_lang, tgt_lang, "gemini", text)
            cached_text = _get_cached(session, k)
            if cached_text:
                trans[tgt_lang] = {"text": cached_text, "engine": "gemini", "verified": False}
                s.translations = dict(trans)
                session.add(s)
            else:
                cues_to_translate.append((s, text))

        session.commit()

        if not cues_to_translate:
            log.info("Job %s already has translation for '%s'", job_id, tgt_lang)
            return

        log.info(
            "Translating %d cues for job %s into '%s' in 40-cue batches...",
            len(cues_to_translate),
            job_id,
            tgt_lang,
        )

        gemini = GeminiClient()
        src_name = LANGS[src_lang].name
        tgt_name = LANGS[tgt_lang].name
        BATCH_SIZE = 40

        for b_start in range(0, len(cues_to_translate), BATCH_SIZE):
            chunk = cues_to_translate[b_start : b_start + BATCH_SIZE]
            chunk_items = [{"id": s.id, "text": text} for s, text in chunk]

            translations_got = {}
            if gemini.is_available():
                prompt = f"""You are a professional subtitle translator and localization expert.
Translate the following sequential subtitle dialogue cues from {src_name} ({src_lang}) into natural {tgt_name} ({tgt_lang}).

CRITICAL INSTRUCTIONS:
1. Translate the EXACT NATURAL SPOKEN MEANING for native speakers.
2. ABSOLUTELY NO PHONETIC TRANSLITERATION (Do not write English words using Devanagari/Tamil characters unless it is a proper brand name).
   - Marathi Example: 'Feed me' -> 'मला खायला द्या' (NOT 'फीड मी').
   - Hindi Example: 'Feed me' -> 'मुझे खाना खिलाओ' (NOT 'फीड मी').
   - Tamil Example: 'Feed me' -> 'எனக்கு உணவளியுங்கள்'.
3. Preserve proper nouns and numbers.
4. Return ONLY a valid JSON array of objects: [{{"id": <id>, "translation": "<translated text>"}}]

Cues to translate:
{json.dumps(chunk_items, ensure_ascii=False, indent=2)}"""
                try:
                    res = gemini.generate_json(prompt)
                    if isinstance(res, list):
                        for item in res:
                            cid = item.get("id")
                            t_val = item.get("translation")
                            if cid is not None and t_val and isinstance(t_val, str):
                                translations_got[cid] = (t_val.strip(), "gemini")
                except Exception as exc:
                    log.warning("Gemini 40-cue batch translation error: %s", exc)

            # Concurrent fallback translation for any items missing
            missing = [(s, text) for s, text in chunk if s.id not in translations_got]
            if missing:
                def _do_trans(item):
                    s_obj, txt = item
                    t_text, eng = _deep_translate(txt, src_lang, tgt_lang)
                    return s_obj.id, (t_text, eng)

                with concurrent.futures.ThreadPoolExecutor(max_workers=min(len(missing), 8)) as sub_pool:
                    for cid, (t_text, eng) in sub_pool.map(_do_trans, missing):
                        translations_got[cid] = (t_text, eng)

            for s, text in chunk:
                trans = s.translations or {}
                trans_text, engine_used = translations_got.get(s.id, (text, "original"))
                trans[tgt_lang] = {"text": trans_text, "engine": engine_used, "verified": False}
                s.translations = dict(trans)
                session.add(s)
                _set_cached(session, _cache_key(src_lang, tgt_lang, engine_used, text), trans_text)

            session.commit()

        log.info("Finished translating %d cues for job %s into '%s'", len(cues_to_translate), job_id, tgt_lang)


def enqueue(job_id: str, tgt_lang: str) -> None:
    """Submit lazy translation task to background worker pool."""
    if not tgt_lang or tgt_lang not in LANGS:
        return
    log.info("Enqueuing background lazy translation for job %s -> '%s'", job_id, tgt_lang)
    _POOL.submit(translate_job_language, job_id, tgt_lang)
