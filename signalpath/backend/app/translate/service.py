"""Fast lazy translation service.

Design:
  * Google (deep-translator) is the DEFAULT engine: cues are packed into ~3.8k-char newline-joined
    requests, so 100 cues = 2-3 HTTP calls, run in parallel. Typical time: 1-4 s per language.
  * Gemini is used only if TRANSLATOR=gemini (quality mode) or as a fallback when Google fails.
  * Failures are NEVER cached and NEVER written as a "translation" (the old code stored the
    untranslated source text and marked it as translated).
  * In-memory status per (job, lang) so the UI can show queued / running / done / failed + progress.
  * In-flight de-duplication: clicking a language twice does not start two jobs.
"""
import concurrent.futures
import hashlib
import json
import logging
import threading
import time
from datetime import datetime, timezone

from sqlmodel import Session, select

from app.core.config import settings
from app.core.db import engine, init_db
from app.core.errors import AppError
from app.langs.registry import LANGS
from app.models_db.tables import Job, Segment, TranslationCache

log = logging.getLogger(__name__)

_POOL = concurrent.futures.ThreadPoolExecutor(max_workers=4, thread_name_prefix="sp-trans-")
_HTTP_POOL = concurrent.futures.ThreadPoolExecutor(max_workers=8, thread_name_prefix="sp-trans-http-")
_LOCK = threading.Lock()
_STATUS: dict[tuple[str, str], dict] = {}
_TABLE_CHECKED = False

MAX_CHARS = 3800     # deep-translator's Google limit is 5000 chars per request
MAX_CUES = 60        # keep chunks small enough that Google keeps one output line per input line


# ───────────────────────── status helpers ─────────────────────────
def _set_status(job_id: str, lang: str, **kw) -> dict:
    with _LOCK:
        st = _STATUS.setdefault((job_id, lang), {"state": "queued", "done": 0, "total": 0, "error": None})
        st.update(kw, updated=time.time())
        return dict(st)


def get_status(job_id: str, lang: str) -> dict | None:
    with _LOCK:
        st = _STATUS.get((job_id, lang))
        return dict(st) if st else None


def job_statuses(job_id: str) -> dict[str, dict]:
    with _LOCK:
        return {l: dict(v) for (j, l), v in _STATUS.items() if j == job_id}


def invalidate(job_id: str) -> None:
    """Call after a human edit: forget finished/failed status so the language can be re-translated."""
    with _LOCK:
        for key in [k for k in _STATUS if k[0] == job_id and _STATUS[k]["state"] in ("done", "failed")]:
            _STATUS.pop(key, None)


# ───────────────────────── cache ─────────────────────────
def _ensure_cache_table() -> None:
    global _TABLE_CHECKED
    if not _TABLE_CHECKED:
        init_db()
        _TABLE_CHECKED = True


def _cache_key(src: str, tgt: str, text: str) -> str:
    # engine-independent key (old code mixed "gemini"/"google"/"fallback" and so missed its own cache)
    return hashlib.sha256(f"{src.lower()}|{tgt.lower()}|{text.strip()}".encode("utf-8")).hexdigest()


def _cache_get_many(session: Session, keys: list[str]) -> dict[str, str]:
    _ensure_cache_table()
    if not keys:
        return {}
    rows = session.exec(select(TranslationCache).where(TranslationCache.key.in_(keys))).all()
    return {r.key: r.text for r in rows}


def _cache_put_many(session: Session, items: dict[str, str]) -> None:
    for k, v in items.items():
        session.merge(TranslationCache(key=k, text=v, created_at=datetime.now(timezone.utc)))


# ───────────────────────── engines ─────────────────────────
def _mt_code(code: str) -> str:
    return LANGS[code].mt if code in LANGS else code


def _pack(texts: list[str]) -> list[list[int]]:
    groups, cur, size = [], [], 0
    for i, t in enumerate(texts):
        add = len(t) + 1
        if cur and (size + add > MAX_CHARS or len(cur) >= MAX_CUES):
            groups.append(cur)
            cur, size = [], 0
        cur.append(i)
        size += add
    if cur:
        groups.append(cur)
    return groups


def _google_call(text: str, src: str, tgt: str) -> str | None:
    from deep_translator import GoogleTranslator
    for attempt in range(3):
        try:
            out = GoogleTranslator(source=src, target=tgt).translate(text)
            if out and out.strip():
                return out
        except Exception as exc:
            log.debug("Google translate attempt %d failed: %s", attempt + 1, exc)
        time.sleep(0.4 * (attempt + 1))
    return None


def _google_group(texts: list[str], src: str, tgt: str) -> list[str | None]:
    """Translate a group with ONE request (newline-joined). Verify line count, else per-cue fallback."""
    clean = [" ".join(t.split()) for t in texts]
    out = _google_call("\n".join(clean), src, tgt)
    if out is not None:
        parts = [p.strip() for p in out.split("\n")]
        if len(parts) == len(clean) and all(parts):
            return parts
    log.info("Packed translate mismatch/failed (%d cues) → per-cue fallback", len(clean))
    futs = [_HTTP_POOL.submit(_google_call, t, src, tgt) for t in clean]
    return [(f.result() or "").strip() or None for f in futs]


def _gemini_batch(items: list[tuple[int, str]], src_name: str, tgt_name: str) -> dict[int, str]:
    from app.llm.gemini import GeminiClient
    gem = GeminiClient()
    if not gem.is_available() or not items:
        return {}
    payload = [{"id": i, "text": t} for i, t in items]
    prompt = (
        f"You are a professional subtitle translator. Translate these cues from {src_name} to natural, "
        f"idiomatic {tgt_name}. Translate meaning, never phonetic transliteration. Keep names and numbers. "
        'Return ONLY a JSON array: [{"id": <id>, "translation": "<text>"}].\n\n'
        + json.dumps(payload, ensure_ascii=False)
    )
    try:
        res = gem.generate_json(prompt)
    except Exception as exc:
        log.warning("Gemini batch failed: %s", exc)
        return {}
    out: dict[int, str] = {}
    if isinstance(res, list):
        for it in res:
            if isinstance(it, dict) and isinstance(it.get("translation"), str) and it.get("id") is not None:
                out[int(it["id"])] = it["translation"].strip()
    return out


def translate_texts(texts: list[str], src: str, tgt: str, on_group_done=None) -> list[tuple[str | None, str]]:
    """Returns [(translation_or_None, engine)] aligned with `texts`. None = failed (caller must not store it)."""
    res: list[tuple[str | None, str]] = [(None, "none")] * len(texts)
    src_mt = "auto" if src not in LANGS else _mt_code(src)
    tgt_mt = _mt_code(tgt)
    use_gemini_first = settings.translator == "gemini"

    def run_google(idx_list: list[int]) -> None:
        for gi in _pack([texts[i] for i in idx_list]):
            real = [idx_list[j] for j in gi]
            outs = _google_group([texts[i] for i in real], src_mt, tgt_mt)
            for i, o in zip(real, outs):
                if o:
                    res[i] = (o, "google")
            if on_group_done:
                on_group_done(sum(1 for r in res if r[0]))

    def run_gemini(idx_list: list[int]) -> None:
        src_name = LANGS[src].name if src in LANGS else src
        tgt_name = LANGS[tgt].name if tgt in LANGS else tgt
        for gi in _pack([texts[i] for i in idx_list]):
            real = [idx_list[j] for j in gi]
            got = _gemini_batch([(i, texts[i]) for i in real], src_name, tgt_name)
            for i, o in got.items():
                if 0 <= i < len(texts) and o:
                    res[i] = (o, "gemini")
            if on_group_done:
                on_group_done(sum(1 for r in res if r[0]))

    all_idx = list(range(len(texts)))
    (run_gemini if use_gemini_first else run_google)(all_idx)
    missing = [i for i, r in enumerate(res) if not r[0]]
    if missing:                                   # second chance with the other engine
        (run_google if use_gemini_first else run_gemini)(missing)
    return res


# ───────────────────────── public API ─────────────────────────
def translate_text_semantic(text: str, src_lang: str, tgt_lang: str) -> str:
    """Single-string helper kept for backwards compatibility."""
    if not text.strip() or src_lang == tgt_lang:
        return text.strip()
    out = translate_texts([text], src_lang, tgt_lang)[0][0]
    return out or text.strip()


def translate_segments_multilingual(segments: list[dict], source_lang: str = "en",
                                    target_langs: list[str] | None = None, on_progress=None) -> list[dict]:
    targets = target_langs or list(LANGS.keys())
    src = (source_lang or "en").lower()
    for tgt in targets:
        if tgt not in LANGS:
            raise AppError("LANG_UNSUPPORTED", f"Target language '{tgt}' is not supported.")
        todo = [(s, (s.get("final_text") or s.get("text", ""))) for s in segments]
        for s, text in todo:
            s.setdefault("translations", {})
            if tgt == src:
                s["translations"][tgt] = {"text": text, "engine": "original", "verified": True}
        if tgt != src:
            outs = translate_texts([t for _, t in todo], src, tgt)
            for (s, _), (o, eng) in zip(todo, outs):
                if o:
                    s["translations"][tgt] = {"text": o, "engine": eng, "verified": False}
    return segments


def translate_job_language(job_id: str, tgt_lang: str) -> None:
    if tgt_lang not in LANGS:
        raise AppError("LANG_UNSUPPORTED", f"Target language '{tgt_lang}' is not supported.", http_status=400)

    st = get_status(job_id, tgt_lang)
    if st and st["state"] == "running":
        return
    _set_status(job_id, tgt_lang, state="running", done=0, total=0, error=None)
    t0 = time.time()
    try:
        with Session(engine) as session:
            job = session.get(Job, job_id)
            if not job:
                _set_status(job_id, tgt_lang, state="failed", error="Job not found")
                return
            src = (job.source_lang or "auto").lower()
            rows = session.exec(select(Segment.id, Segment.final_text, Segment.text, Segment.translations)
                                .where(Segment.job_id == job_id).order_by(Segment.idx)).all()

        todo: list[tuple[int, str]] = []          # (segment_id, text) that still need a translation
        already = 0
        for sid, final_text, text, trans in rows:
            body = (final_text or text or "").strip()
            if not body:
                continue
            if (trans or {}).get(tgt_lang, {}).get("text"):
                already += 1
                continue
            todo.append((sid, body))
        total = already + len(todo)
        _set_status(job_id, tgt_lang, total=total, done=already)

        if not todo:
            _set_status(job_id, tgt_lang, state="done", done=total)
            return

        updates: dict[int, dict] = {}
        if src == tgt_lang:
            updates = {sid: {"text": t, "engine": "original", "verified": True} for sid, t in todo}
        else:
            with Session(engine) as session:
                keys = [_cache_key(src, tgt_lang, t) for _, t in todo]
                hits = _cache_get_many(session, keys)
            need_idx = []
            for n, ((sid, t), k) in enumerate(zip(todo, keys)):
                if k in hits:
                    updates[sid] = {"text": hits[k], "engine": "cache", "verified": False}
                else:
                    need_idx.append(n)
            _set_status(job_id, tgt_lang, done=already + len(updates))

            if need_idx:
                base = already + len(updates)
                outs = translate_texts([todo[n][1] for n in need_idx], src, tgt_lang,
                                       on_group_done=lambda d: _set_status(job_id, tgt_lang, done=base + d))
                new_cache: dict[str, str] = {}
                for n, (o, eng) in zip(need_idx, outs):
                    if o:                                         # only real translations are stored
                        updates[todo[n][0]] = {"text": o, "engine": eng, "verified": False}
                        new_cache[keys[n]] = o
                if new_cache:
                    with Session(engine) as session:
                        _cache_put_many(session, new_cache)
                        session.commit()

        # one write transaction, fresh objects (no expired-instance N+1 reloads)
        with Session(engine) as session:
            for sid, tr in updates.items():
                seg = session.get(Segment, sid)
                if seg:
                    seg.translations = {**(seg.translations or {}), tgt_lang: tr}
                    session.add(seg)
            session.commit()

        missing = len(todo) - len(updates)
        if missing:
            _set_status(job_id, tgt_lang, state="failed", done=already + len(updates),
                        error=f"{missing} of {total} captions could not be translated. Check internet / API quota and retry.")
        else:
            _set_status(job_id, tgt_lang, state="done", done=total)
        log.info("Translated job %s → %s: %d new cues in %.1fs", job_id, tgt_lang, len(updates), time.time() - t0)
    except Exception as exc:
        log.exception("translate_job_language crashed")
        _set_status(job_id, tgt_lang, state="failed", error=str(exc)[:200])


def enqueue(job_id: str, tgt_lang: str) -> dict:
    """Idempotent: returns current status; starts work only if not already running/done."""
    if not tgt_lang or tgt_lang not in LANGS:
        return {"state": "failed", "error": "Unsupported language"}
    with _LOCK:
        st = _STATUS.get((job_id, tgt_lang))
        if st and st["state"] in ("queued", "running", "done"):
            return dict(st)
        _STATUS[(job_id, tgt_lang)] = {"state": "queued", "done": 0, "total": 0, "error": None, "updated": time.time()}
    _POOL.submit(translate_job_language, job_id, tgt_lang)
    return get_status(job_id, tgt_lang) or {}
