# test.md — SignalPath translation audit + fixes (for the Antigravity bot)

**Scope:** `DSL-main.zip` → language switcher (🇬🇧 English · 🇮🇳 हिन्दी · 🇩🇪 Deutsch · 🇳🇱 Nederlands) and **Dual View** on `/jobs/[id]`.
**Goal:** translations must be fast, must never silently show the wrong language, and exports must match the language chosen.

## 0. Rules for the bot
1. Apply fixes in order: **P0 → P1 → P2**. Do not skip P0.
2. Where a section says **REPLACE FILE**, overwrite the whole file with the given code. Where it says **PATCH**, change only the quoted lines.
3. After each backend step run `cd signalpath/backend && pytest -q`. After the frontend steps run `cd signalpath/frontend && npx tsc --noEmit && npm run build`.
4. Do not add new languages, new pages or new dependencies. `deep-translator` is already in `requirements.txt`.
5. Never store a failed translation. Never show source-language text under a target-language label.

## 1. What I verified, and how
| Evidence | Result |
|---|---|
| Backend `compileall` | OK |
| `test_formats.py`, `test_part_b.py` | 6 passed |
| **Reproduced** with a fake job (no API key, no network) | Failed translation was stored as `{'hi': {'text': 'Hello world 0', 'engine': 'fallback'}}` and written to `TranslationCache` — English saved as "Hindi" and cached forever |
| **Reproduced** `GeminiClient.generate_json` on a cache hit, `GEMINI_RPM=10` | 3 cached calls took **12 s** (rate limiter sleeps before the cache is read) |
| **Reproduced** export for a Hindi-source job | `lang=hi` → **empty file**; `lang=en` → **Hindi text** |
| New fixed service + 5 new tests (`tests/test_translate_service.py`) | 150 cues translated in 3 requests (0.3 s with a fake engine); 5 passed |

**Not verified (be honest with the user):** I did not run the Next.js app (no `npm install`), did not run Whisper/yt-dlp, and had no Gemini key or internet to Google Translate. The frontend changes below are written from reading the code and are type-level untested. Run the build commands in §0.

## 2. Root causes of "translation not working / slow"
| # | Sev | Where | Bug | Effect |
|---|---|---|---|---|
| T1 | P0 | `translate/service.py` `_deep_translate` + `translate_job_language` | If Google/MyMemory/Gemini all fail it returns the **original text** with engine `"fallback"`, which is **stored as the translation and cached** | UI shows English under "हिन्दी"; retry never fixes it (cache hit) |
| T2 | P0 | `llm/gemini.py` `generate_json` | `_limiter.wait()` runs **before** the cache lookup and before `is_available()` | Every call, even a cache hit or no-key call, sleeps up to `60/GEMINI_RPM` s (6 s at 10 RPM) |
| T3 | P0 | `translate/service.py` | Gemini is the primary engine: 40-cue JSON batches at a shared 10 RPM limit, pool of 2 workers. Fallback translates **one cue per HTTP call** | 100 cues × 3 languages takes minutes |
| T4 | P0 | `pipeline/orchestrator.py` Stage 5 | Pre-translates en/hi/de/nl all at once into the same 2-worker pool and the same Gemini limiter, with no ordering | The language the user actually asked for is queued behind others |
| T5 | P0 | `jobs/[id]/page.tsx` `handleSelectLang` | Polls every 350 ms × 20 = **7 s**, then stops with no error | Slow translations "do nothing"; spinner disappears and source text stays |
| T6 | P0 | `jobs/[id]/page.tsx` + `api/v1/jobs.py` | "Ready" = **any one** segment has the language. Backend commits per 40-cue batch, so the first batch flips ready and polling stops | Only the first ~40 cues translate on screen; the rest appear only after a manual refresh |
| T7 | P0 | `jobs/[id]/page.tsx` | `setSelectedLang(prev => prev === "en" ? tLang : prev)` runs on **every** poll | If the job target is Hindi and the user clicks English, the page snaps back to Hindi on the next poll |
| T8 | P0 | `jobs/[id]/page.tsx` render | When a translation is missing, `currentText` falls back to the **source text** and is labelled "Hindi Caption" | Wrong-language text under a correct-looking label |
| T9 | P0 | `export/formats.py` `cues` | `lang != "en"` ⇒ look in `translations[lang]`, else `continue`. Source language is assumed to be English | Hindi-source video: export `hi` = empty file; export `en` = Hindi text |
| T10 | P1 | `llm/gemini.py` | `cache.get(models[0], …)` but `cache.put(selected_model, …)` | Any call that fell back to another model never hits its own cache |
| T11 | P1 | `translate/service.py` | Cache key includes the engine name; lookup always uses `"gemini"`, writes use `"google"/"fallback"` | Cache misses for everything not produced by Gemini |
| T12 | P1 | `translate/service.py` | After `session.commit()` the loop touches `s.id` / `s.translations` on **expired** instances; commit per cue for the cache | N+1 reloads and N commits per batch |
| T13 | P1 | `translate/service.py` + `jobs.py` | `enqueue` has no de-duplication and no status; exceptions inside the pool thread are swallowed | Double clicks start duplicate work; failures are invisible |
| T14 | P1 | `jobs/[id]/page.tsx` | `setInterval` ids are never cleared on unmount or on a second click | Leaked timers, state updates after unmount |
| T15 | P1 | `jobs/[id]/page.tsx` `isSource`, `sourceLangCode` | Compares against `job.source_lang \|\| "en"`; `"auto"` never matches | Source language shown as "needs translation" |
| T16 | P1 | `langs/registry.py` `script_ratio` | `LANGS[code]` raises `KeyError` if Whisper detects a language not in the 4-language registry (e.g. `mr`, `ta`, `ja`) | Job fails with a generic 500 `INTERNAL` after transcription |
| T17 | P1 | `jobs/[id]/page.tsx` Dual View | Clicking any language button resets Dual View to single; the left pane uses `seg.text` (ignores corrections and human edits) | Dual View feels broken; shows uncorrected text |
| T18 | P1 | `jobs/[id]/page.tsx` `coalesceDisplaySegments` | `curr = {...segs[0]}` is a shallow copy, then `curr.translations[l] = {...}` **mutates the original state object**. Every re-render appends the next cue's translation again | Translated text grows/duplicates on each render when avg words/cue ≤ 3. The backend already coalesces, so delete this function |
| T19 | P1 | `api/v1/jobs.py` `edit_segment` | Editing source text leaves old translations in place | Translations no longer match the corrected caption |

## 3. Backend fixes
### B1 (P0) — REPLACE FILE `signalpath/backend/app/translate/service.py`
Why it is fast: cues are packed into ~3.8 k-character newline-joined requests (≈ 40–60 cues per request), run in parallel, line count is verified, and any mismatch falls back to per-cue calls. Gemini is only used if `TRANSLATOR=gemini` or as a second chance. Failures are never stored or cached.

```python
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
```

### B2 (P0) — PATCH `signalpath/backend/app/llm/gemini.py` → `generate_json`
Move the limiter below the cache and availability checks, and write the cache under the same key you read from.

```python
    def generate_json(self, prompt: str, schema: dict | None = None, model: str | None = None, timeout: float = 45.0):
        models = self._get_models_to_try(model)
        cached = cache.get(models[0], prompt)
        if cached is not None:
            return cached                      # cache hit: no sleep, no network
        if not self.is_available():
            return None
        _limiter.wait()                        # only real API calls are rate limited
        ...
                    value = json.loads(response.text)
                    cache.put(models[0], prompt, value)   # was: cache.put(selected_model, ...)
                    return value
```
Also make `generate_text` call `_limiter.wait()` only after `is_available()` returns True.

### B3 (P0) — PATCH `signalpath/backend/app/api/v1/jobs.py`
1. Add import: `from app.translate import service as translate_service`
2. Add helpers below `_segments`:

```python
def _ready_langs(rows: list[tuple]) -> list[str]:
    """rows = [(final_text, text, translations)]. A language is ready only when EVERY non-empty cue has it."""
    need = [(t or {}) for f, x, t in rows if (f or x or "").strip()]
    if not need:
        return []
    langs = set().union(*[set(t.keys()) for t in need])
    return sorted(l for l in langs if all((t.get(l) or {}).get("text") for t in need))
```
3. In `get_job`, replace the `ready_langs` logic:

```python
    segs, rows = [], []
    for s in _segments(session, job_id):
        d = s.model_dump(include=SEG_FIELDS)
        d["acc"] = s.trust_score
        segs.append(d)
        rows.append((s.final_text, s.text, s.translations))
    job_dict = job.model_dump(exclude=JOB_EXCLUDE)
    ready = set(_ready_langs(rows))
    if job.source_lang in LANGS:
        ready.add(job.source_lang)              # the spoken language needs no translation
    job_dict["translations_ready"] = sorted(ready)
    job_dict["translation_status"] = translate_service.job_statuses(job_id)
    return {"job": job_dict, "segments": segs}
```
4. Replace `request_translation` and add a light status endpoint (the frontend polls this instead of the heavy `GET /jobs/{id}`):

```python
@router.post("/{job_id}/translate", status_code=202)
def request_translation(job_id: str, body: TranslateRequest, user: str = Depends(current_user),
                        session: Session = Depends(get_session)) -> dict:
    job = _owned(session, job_id, user)
    if job.status != "done":
        raise AppError("NOT_READY", "Captions are not finished yet.", http_status=409)
    if body.lang not in LANGS:
        raise AppError("LANG_UNSUPPORTED", f"Language '{body.lang}' is not supported.", http_status=400)
    st = translate_service.enqueue(job_id, body.lang)
    return {"job_id": job_id, "lang": body.lang, "status": st.get("state"), "done": st.get("done", 0),
            "total": st.get("total", 0), "error": st.get("error")}


@router.get("/{job_id}/translate/{lang}")
def translation_status(job_id: str, lang: str, user: str = Depends(current_user),
                       session: Session = Depends(get_session)) -> dict:
    job = _owned(session, job_id, user)
    if lang not in LANGS:
        raise AppError("LANG_UNSUPPORTED", f"Language '{lang}' is not supported.", http_status=400)
    rows = session.exec(select(Segment.final_text, Segment.text, Segment.translations)
                        .where(Segment.job_id == job_id)).all()
    ready = lang == job.source_lang or lang in _ready_langs([tuple(r) for r in rows])
    st = translate_service.get_status(job_id, lang) or {"state": "idle", "done": 0, "total": 0, "error": None}
    return {"state": "done" if ready else st["state"], "done": st.get("done", 0), "total": st.get("total", 0),
            "error": None if ready else st.get("error"), "ready": ready}
```
5. In `edit_segment`, after `segment.final_text, segment.human_edited = ...` add:

```python
    segment.translations = {}                  # stale once the source text changes
    translate_service.invalidate(job_id)       # lets the UI re-translate the active language
```
6. In `export_job`, pass the source language and refuse incomplete exports:

```python
    src = (job.source_lang or "en").lower()
    if lang != src:
        rows = [(s.final_text, s.text, s.translations) for s in _segments(session, job_id)]
        if lang not in _ready_langs(rows):
            raise AppError("TRANSLATION_NOT_READY", f"{lang} captions are not finished yet.",
                           "Pick the language in the viewer first and wait for it to finish.", 409)
    body, media_type = render_export(segments, format, lang, variant, mark_low_trust, source_lang=src)
```
(`render_export` signature is changed in B4.)

### B4 (P0) — PATCH export (already applied and tested in my copy)
`signalpath/backend/app/export/formats.py`:

```python
def cues(segments, lang="en", variant="final", mark_low_trust=False, source_lang="en"):
    ...
        if lang != source_lang:            # was: if lang != "en"
            translation = (seg.get("translations") or {}).get(lang)
```
`signalpath/backend/app/export/captions.py`:

```python
def render_export(segments, fmt, lang="en", variant="final", mark_low_trust=False, source_lang="en"):
    options = {"lang": lang, "variant": variant, "mark_low_trust": mark_low_trust, "source_lang": source_lang}
```
Result in my test: Hindi source → `hi` returns the Hindi captions, `en` returns the English translation; before the fix `hi` was empty and `en` was Hindi.

### B5 (P0) — PATCH `pipeline/orchestrator.py` Stage 5 (translate the user's language first)
```python
        # Stage 5: pre-translate in the background — user's chosen language first
        spoken = (lang or "en").lower()
        core = [l for l in ("en", "hi", "de", "nl") if l != spoken]
        order = ([target_lang] if target_lang in core else []) + [l for l in core if l != target_lang]
        for t_lang in order:
            translate_service.enqueue(job_id, t_lang)
```
With B1 this finishes in seconds, so pre-translating all three is cheap.

### B6 (P1) — PATCH `langs/registry.py`
Stop the `KeyError` crash when a detected language is not registered, and give the frontend a flag from one source of truth.

```python
def script_ratio(text: str, code: str) -> float:
    if code not in LANGS:
        return 1.0            # unknown script: do not reject the transcript
    ...
```
Add `flag: str = "🌐"` as the last field of `Lang` and set `flag="🇬🇧"`, `"🇮🇳"`, `"🇩🇪"`, `"🇳🇱"` in the four entries. In `api/v1/languages.py` add `"flag": l.flag` to the returned dict.

### B7 (P1) — PATCH `core/config.py` and `.env.example`
```python
    translator: str = "google"      # google (fast, default) | gemini (higher quality, slower)
```
`.env.example` is missing the keys the app needs. Add:
```
GEMINI_API_KEY=
GEMINI_API_KEY_BACKUP=
TRANSLATOR=google
AUTH_REQUIRED=false
CLERK_ISSUER=
CLERK_JWKS_URL=
JOB_WORKERS=2
```
Raise `GEMINI_RPM` to your key's real quota. 10 is a shared global gate for ASR fallback, correction, audit and translation.

### B8 (P1) — ADD `signalpath/backend/tests/test_translate_service.py`
Offline tests (no network or keys). Covers batching, no-store-on-failure, line-count mismatch fallback, retry after failure, unknown source language.

```python
"""Run: pytest tests/test_translate_service.py -q   (no network, no API keys needed)"""
import uuid
import pytest
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

import app.translate.service as svc
from app.models_db.tables import Job, Segment, TranslationCache


@pytest.fixture()
def db(monkeypatch):
    eng = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(eng)
    monkeypatch.setattr(svc, "engine", eng)
    monkeypatch.setattr(svc, "_TABLE_CHECKED", True)
    svc._STATUS.clear()
    return eng


def make_job(eng, n, src="en"):
    jid = str(uuid.uuid4())
    with Session(eng) as s:
        s.add(Job(id=jid, source_lang=src, status="done", target_langs=["en"]))
        for i in range(n):
            s.add(Segment(job_id=jid, idx=i, start=i, end=i + 1, text=f"Hello {i}", final_text=f"Hello {i}"))
        s.commit()
    return jid


def fake_ok(text, src, tgt):
    return "\n".join("T:" + line for line in text.split("\n"))


def test_batches_into_few_requests(db, monkeypatch):
    calls = []
    monkeypatch.setattr(svc, "_google_call", lambda *a: calls.append(1) or fake_ok(*a))
    jid = make_job(db, 150)
    svc.translate_job_language(jid, "hi")
    assert svc.get_status(jid, "hi")["state"] == "done"
    assert len(calls) <= 4                      # 150 cues → ~3 requests, not 150
    with Session(db) as s:
        segs = s.exec(select(Segment).where(Segment.job_id == jid)).all()
        assert all(x.translations["hi"]["text"].startswith("T:") for x in segs)


def test_failure_is_not_stored_or_cached(db, monkeypatch):
    monkeypatch.setattr(svc, "_google_call", lambda *a: None)
    monkeypatch.setattr(svc, "_gemini_batch", lambda *a, **k: {})
    jid = make_job(db, 5)
    svc.translate_job_language(jid, "de")
    assert svc.get_status(jid, "de")["state"] == "failed"
    with Session(db) as s:
        assert all(not x.translations for x in s.exec(select(Segment)).all())
        assert s.exec(select(TranslationCache)).all() == []


def test_line_count_mismatch_falls_back_per_cue(db, monkeypatch):
    monkeypatch.setattr(svc, "_google_call", lambda t, s, g: t.replace("\n", " ") if "\n" in t else "X:" + t)
    jid = make_job(db, 4)
    svc.translate_job_language(jid, "nl")
    assert svc.get_status(jid, "nl")["state"] == "done"


def test_enqueue_is_idempotent_and_retry_after_failure(db, monkeypatch):
    monkeypatch.setattr(svc, "_google_call", lambda *a: None)
    monkeypatch.setattr(svc, "_gemini_batch", lambda *a, **k: {})
    jid = make_job(db, 3)
    svc.translate_job_language(jid, "hi")
    assert svc.get_status(jid, "hi")["state"] == "failed"
    monkeypatch.setattr(svc, "_google_call", fake_ok)
    svc.translate_job_language(jid, "hi")        # retry allowed after failure
    assert svc.get_status(jid, "hi")["state"] == "done"


def test_unknown_source_language_uses_auto(db, monkeypatch):
    seen = {}
    monkeypatch.setattr(svc, "_google_call", lambda t, s, g: seen.setdefault("src", s) and fake_ok(t, s, g))
    jid = make_job(db, 2, src="mr")              # "mr" is not in the 4-language registry
    svc.translate_job_language(jid, "en")
    assert seen["src"] == "auto"
    assert svc.get_status(jid, "en")["state"] == "done"
```

## 4. Frontend fixes
### F1 (P0) — PATCH `signalpath/frontend/lib/api.ts`
```ts
export interface TranslationStatus {
  state: "idle" | "queued" | "running" | "done" | "failed";
  done: number; total: number; error?: string | null; ready?: boolean;
}
```
In `Job` add: `translation_status?: Record<string, TranslationStatus>;`

Replace `requestTranslation` and add `getTranslationStatus`:
```ts
export const requestTranslation = (g: GetToken, id: string, lang: string) =>
  request<{ status: TranslationStatus["state"]; job_id: string; lang: string; done?: number; total?: number; error?: string | null }>(
    `/jobs/${id}/translate`, g, { method: "POST", body: JSON.stringify({ lang }) });

export const getTranslationStatus = (g: GetToken, id: string, lang: string) =>
  request<TranslationStatus>(`/jobs/${id}/translate/${lang}`, g);
```
Delete both `console.log(...)` lines in `request()` that print every request and the full response payload (they run on every poll and dump all segments and words into the console). Keep `console.error`.

### F2 (P0) — PATCH `signalpath/frontend/app/jobs/[id]/page.tsx`
Line numbers refer to the uploaded file.

**a) Imports:** add `getTranslationStatus, TranslationStatus` to the `@/lib/api` import.

**b) State (near line 53–56):** add
```tsx
  const [transError, setTransError] = useState<string | null>(null);
  const [transProgress, setTransProgress] = useState<Record<string, { done: number; total: number }>>({});
  const pollers = useRef<Record<string, ReturnType<typeof setInterval>>>({});
  const langInit = useRef(false);
```
Delete the old `sourceLangCode` / `targetLangCode` constants (lines ~65–66) and use:
```tsx
  const sourceLang = (job?.source_lang && job.source_lang !== "auto" ? job.source_lang : "en").toLowerCase();
  const isReady = (code: string) => code === sourceLang || (job?.translations_ready ?? []).includes(code);
```
Remove the inner `const sourceLang = ...` inside the `displayedSegments.map` (line ~739); it now comes from the component scope.

**c) Fix T7 (snap-back).** In `fetchStatus`, replace the `if (data.job?.target_langs ...) { setSelectedLang(prev => ...) }` block with a one-time init:
```tsx
        if (!langInit.current && data.job.status === "done") {
          langInit.current = true;
          const t = (data.job.target_langs?.[0] ?? "en") as string;
          setSelectedLang(t);
          setExportLang(t);
          const spoken = (data.job.source_lang && data.job.source_lang !== "auto" ? data.job.source_lang : "en").toLowerCase();
          if (t !== spoken && !(data.job.translations_ready ?? []).includes(t)) {
            // fall through to the handler below once it is defined
            setTimeout(() => handleSelectLangRef.current?.(t), 0);
          }
        }
```
and declare `const handleSelectLangRef = useRef<(c: string) => void>();` next to the other refs; after `handleSelectLang` is defined add `handleSelectLangRef.current = handleSelectLang;`.

**d) Replace `handleSelectLang` (lines ~127–180) and add the poller + cleanup (fixes T5, T6, T13, T14, T15):**
```tsx
  const startPolling = (lang: string) => {
    if (!id || pollers.current[lang]) return;
    const startedAt = Date.now();
    pollers.current[lang] = setInterval(async () => {
      try {
        const st: TranslationStatus = await getTranslationStatus(getToken, id, lang);
        setTransProgress((p) => ({ ...p, [lang]: { done: st.done, total: st.total } }));
        const timedOut = Date.now() - startedAt > 180_000;
        if (st.ready || st.state === "failed" || timedOut) {
          clearInterval(pollers.current[lang]);
          delete pollers.current[lang];
          if (st.ready) {
            const data = await getJob(getToken, id);      // one full refresh, only when complete
            setJob(data.job);
            setSegments(data.segments);
          } else {
            setTransError(st.error || "Translation timed out. Please retry.");
          }
          setTranslatingLang((cur) => (cur === lang ? null : cur));
        }
      } catch {
        /* transient network error: keep polling */
      }
    }, 700);
  };

  useEffect(() => () => { Object.values(pollers.current).forEach(clearInterval); }, []);

  const handleSelectLang = async (code: string) => {
    setSelectedLang(code);
    setExportLang(code);
    setTransError(null);
    if (!id || job?.status !== "done" || isReady(code)) return;
    setTranslatingLang(code);
    try {
      await requestTranslation(getToken, id, code);      // idempotent on the server
      startPolling(code);
    } catch (e: any) {
      setTransError(e?.message ?? "Could not start translation.");
      setTranslatingLang(null);
    }
  };
  handleSelectLangRef.current = handleSelectLang;
```
Note: do **not** call `setViewMode("single")` here (old line 131). That was resetting Dual View on every language click (T17).

**e) Language chips (lines ~668–685):** use `isReady`, show progress and failure:
```tsx
const ready = isReady(l.code);
const busy = translatingLang === l.code && !ready;
const prog = transProgress[l.code];
...
{busy && (<span className="flex items-center gap-1 text-[10px]"><Loader2 className="w-2.5 h-2.5 animate-spin" />{prog?.total ? `${prog.done}/${prog.total}` : ""}</span>)}
{!ready && !busy && (<span className="w-1.5 h-1.5 rounded-full bg-amber-400" title="Click to translate" />)}
```
Add a dismissible error line under the switcher:
```tsx
{transError && (
  <div className="px-4 py-2 text-xs text-rose-600 bg-rose-500/10 border-b border-card-line flex items-center justify-between">
    <span>{transError}</span>
    <button type="button" className="font-bold underline" onClick={() => handleSelectLang(selectedLang)}>Retry</button>
  </div>
)}
```

**f) Dual View button (line ~705):**
```tsx
onClick={() => {
  const next = viewMode === "single" ? "sideBySide" : "single";
  setViewMode(next);
  if (next === "sideBySide" && selectedLang === sourceLang) {
    const other = availableLanguages.find((l) => l.code !== sourceLang);
    if (other) handleSelectLang(other.code);       // Dual View always compares source vs a second language
  }
}}
```
Language buttons should highlight in both modes: change the condition `selectedLang === l.code && viewMode === "single"` to `selectedLang === l.code`.

**g) Row text logic (lines ~739–741), fixes T8 and T17:**
```tsx
const nativeText = seg.final_text || seg.text;                 // corrected source text, not raw ASR
const isSourceView = selectedLang === sourceLang;
const translated = seg.translations?.[selectedLang]?.text;
const pending = !isSourceView && !translated;
const currentText = isSourceView ? nativeText : translated;
```
- In the Dual View branch (line ~832) replace `nativeSpokenText` with `nativeText`. For the right pane show `pending ? <span className="animate-pulse text-ink-3">Translating…</span> : currentText`. If `isSourceView`, show "Pick a second language" instead of repeating the same text.
- Word-level trust block (line ~855): change the condition to `seg.words && seg.words.length > 0 && isSourceView`.
- Translated caption block (line ~910): replace `{selectedLang !== sourceLang && currentText && (` with `{!isSourceView && (` and render `pending ? <div className="h-4 w-2/3 rounded bg-card-line/40 animate-pulse" /> : currentText`. Never render the source text there.
- Top-right badge (line ~755): `selectedLang !== "en"` → `selectedLang !== sourceLang`.

**h) Delete `coalesceDisplaySegments` (T18).** The backend already coalesces in `orchestrator.coalesce_segs`. Replace its call with `const displayedSegments = rawSegments;` and remove the function.

**i) After a successful edit (`handleSaveEdit`)** the server clears translations. Mirror that and re-translate the active language:
```tsx
      setSegments((prev) => prev.map((s) => (s.id === segId ? { ...s, ...updated, translations: {} } : s)));
      setJob((j) => (j ? { ...j, translations_ready: (j.translations_ready ?? []).filter((c) => c === sourceLang) } : j));
      setEditingSegId(null);
      if (selectedLang !== sourceLang) handleSelectLang(selectedLang);
```

## 5. Other bugs found (not translation-specific)
| Sev | Where | Problem | Fix |
|---|---|---|---|
| P1 | `jobs/[id]/page.tsx` `getStageIndex` / `stages` | Backend stage `"verifying"` (80–98 %) is not mapped, so the stepper jumps back to step 1 "Fetching Audio" | Add `{ key: "verifying", label: "Verifying" }` before `done` and map `case "verifying": return 3; case "done": return 4;` (and make the grid `grid-cols-5`) |
| P1 | `jobs/[id]/page.tsx` (2 places) | `Math.round((seg.trust_score \|\| 0.8) * 100)` shows a fake 80 % when the score is missing | `seg.trust_score == null ? "—" : Math.round(seg.trust_score * 100) + "%"` |
| P1 | `lib/api.ts` `request()` | Clerk `getToken()` is raced against a **400 ms** timeout; a slow token ⇒ request goes out with no `Authorization` ⇒ 401 when `AUTH_REQUIRED=true` | Raise to 3000 ms |
| P1 | `pipeline/orchestrator.py` | ASR detects `mr`/`ta`/`ja`; registry only has 4 languages, so those jobs have no translation path | Either add the languages to `langs/registry.py` (one place, per the existing test) or show "Translation unavailable for <lang>" |
| P2 | `backend/data/llm_cache/*.json` | Cached LLM responses (may contain user transcripts) are inside the zip. `.gitignore` already excludes them, so they were zipped from the folder, not from git | Exclude `data/llm_cache/` when zipping or sharing the project |
| P2 | `core/config.py` | `translator` was never read by the old code (now used by B1); `max_backtrans_per_job` is still unused anywhere | Delete `max_backtrans_per_job` or wire it up |
| P2 | Google engine | `deep-translator` calls Google's unofficial web endpoint; it can throttle | B1 retries 3× and falls back to Gemini. For production use the official Cloud Translation API |

## 6. Run and verify
```bash
# backend
cd signalpath/backend
pip install -r requirements.txt
pytest -q                                   # includes tests/test_translate_service.py
uvicorn app.main:app --reload --port 8000

# frontend
cd signalpath/frontend
npm install
npx tsc --noEmit
npm run build && npm run dev
```
Manual acceptance test (use any 60 s video):
1. Create a job, wait for **done**. Click **हिन्दी** → spinner shows `n/total`, finishes in a few seconds, **every** cue changes (scroll to the bottom to check).
2. Click **Deutsch**, then quickly **Nederlands**, then **English** → no snap-back, no duplicate requests (backend log shows one `Translated job … → de` line per language).
3. Turn off the internet and click an untranslated language → red error with **Retry**; no English text under a foreign label. Turn it back on, press Retry → succeeds.
4. **Dual View** → left = corrected source text, right = selected language; clicking languages keeps Dual View on.
5. Hindi-spoken video: export **SRT hi** → Hindi file, **SRT en** → English file, **SRT de** before it finished → 409 message, not an empty file.
6. Edit one caption → its translation is cleared and re-translated automatically.

## 7. Done when
- A 100-cue job translates to one language in under ~5 s with `TRANSLATOR=google`.
- No code path writes untranslated text into `translations`.
- `pytest -q` is green and `npm run build` passes.
