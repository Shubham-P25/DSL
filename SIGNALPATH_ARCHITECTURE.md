# SignalPath v3 — Improved Architecture & Bot Build Spec

> **Audience:** the VS Code coding bot (GP5.6 Luna). **Owner:** pp (Shubham), DSL mini-project.
> **How to read this file:** Part A (sections 0–5, Steps 1–5) = the backend core. Part B (Steps 6–10) = translation, summary RAG, export/benchmark, frontend, tests, run commands.
> Part A is self-sufficient: if you only have Part A, the backend will already work end-to-end for URL → live captions + trust scores + RAG correction.

---

## 0. RULES FOR THE BOT (read first, obey always)

1. Read this whole file before writing any code. Build **one step at a time**, in order. After each step, run that step's **Acceptance checks** and fix failures before moving on.
2. Project root is `D:\DSL\signalpath` (Windows, Python 3.11, Node 18+). Never use `/tmp`, never use hard-coded `/` paths. Use `pathlib.Path` and paths derived from `Path(__file__)`.
3. **No fake outputs.** Never return placeholder translations like `[HI] text`, never fabricate metrics, never append fake text like `(context: X)`. If a stage fails, return `null` + a clear `warning`/`error_code`. Honesty is a project requirement.
4. **No heavy work at import time.** Loading models (Whisper, embedder, LightGBM) happens lazily or in the app `lifespan`, never at module import. An import error must never crash the API.
5. **Never store whole videos.** Audio is streamed in memory. Only a temporary *audio-only* fallback file is allowed and it MUST be deleted in a `finally` block.
6. Every long operation runs in the job runner (Step 4), never inside an HTTP request handler.
7. One SQLAlchemy/SQLModel engine and one `get_session` dependency — no `create_engine` inside routers.
8. All config comes from `app/core/config.py` (pydantic-settings) + `.env`. Provide `.env.example`. No secrets in code.
9. Type-hint everything, use Pydantic models for all API I/O, keep functions small and testable, add docstrings for each module.
10. Keep files UTF-8. (Hindi/Marathi strings in the old `translate.py` and the `layout.tsx` title were mojibake — do not copy them.)
11. Do not delete the existing `notebook/`, `frontend/` components, or `backend/app/models/*.json` unless a step says so. Refactor by moving/renaming, keep git history (`git mv`).
12. Ask **no** questions unless a step is impossible; make the most reasonable choice and note it in `docs/DECISIONS.md`.

---

## 1. AUDIT — WHY THE CURRENT BACKEND BREAKS (root causes)

| # | Finding (file) | Impact | Fix (step) |
|---|---|---|---|
| 1 | `routers/jobs.py::create_job` calls `download_youtube_audio` **synchronously inside the HTTP request** | Request hangs for minutes; browser/proxy times out → "can't paste YouTube URL". Any yt-dlp error becomes an `alert()` | Async job + instant URL probe (2, 4) |
| 2 | Full audio is downloaded to `tempfile.mkdtemp` and **never deleted** | Disk fills; violates low-storage goal | Streamed in-memory ingestion, `finally` cleanup (2) |
| 3 | ffmpeg is required (yt-dlp FFmpegExtractAudio + Whisper) but **never checked** | Silent failure on Windows | Preflight check + clear error code (1, 2) |
| 4 | Only YouTube supported (`download_youtube_audio`, YouTube-only embed, YouTube-only benchmark) | No Facebook/X/Instagram/TikTok/etc. | Generic yt-dlp extractor layer + platform table (2) |
| 5 | Uploads saved to `/tmp/signalpath_...` | Path doesn't exist on Windows → upload crashes | Cross-platform temp handling (2) |
| 6 | `SentenceTransformer(...)` and 3 seeded FAISS stores are created **at import time** (`store.py`, `glossary_correct.py`, …) | Slow start; if model download fails the whole app dies at import | Lazy embedder + lazy stores (5) |
| 7 | `trust_score.py` uses `pseudo_perplexity = 10 + wps*8` and a 7-word jargon set; the model was trained on **purely synthetic** data generated from a formula | Trust score is circular/meaningless; can't defend in viva | Real features + real labels from LibriSpeech/TED-LIUM WER (3) |
| 8 | `translate.py` is a 4-word dictionary with mojibake, else returns `[HI] text` | Translation is fake | Real translation + real translation-trust (Part B, 6) |
| 9 | `benchmark.py` returns **hard-coded/fabricated WER** (`wer_sp = wer_yt*0.45`, fallback constants) and slices raw VTT text by character count | Dishonest evidence | Honest benchmark (Part B, 8) |
| 10 | `summarize.py` sends the whole transcript to Gemini; result is **never stored**; `JobStatus.summary` never filled; not RAG | Summary feature doesn't exist really | Chunked, cited, verified RAG summary (Part B, 7) |
| 11 | `google-generativeai` (deprecated SDK) + `gemini-1.5-flash` (retired name); per-segment sequential LLM calls | Rate-limit + slow + will break | `google-genai` SDK, model from env, batched JSON calls (5) |
| 12 | `library.py` rebuilds a FAISS index over **all** rows on **every request**; only first 5 segments saved | Slow, poor search | Persistent index, all chunks (Part B, 7) |
| 13 | Heavy deps: `torch`, `pyannote.audio`, `openai-whisper`, `librosa`, `accelerate`, `faiss-cpu`, `numpy<2` | 3–5 GB install, slow, brittle on Windows | `faster-whisper` (int8, no torch), `fastembed` (ONNX), numpy index; torch/pyannote optional extras (1) |
| 14 | Relative paths (`app/models/...`, `app/rag_indexes`, `signalpath.db`) depend on the CWD | Works only if uvicorn is started from one folder | Absolute paths from `Path(__file__)` (1) |
| 15 | `@app.on_event("startup")`, `CORS *` + credentials, no error model, no logging, no tests | Deprecated / unsafe / undebuggable | lifespan, strict CORS, error taxonomy, logging, pytest (1, 10) |
| 16 | Frontend hard-codes `http://localhost:8000`, no polling/SSE, `processing/[jobId]` and `results/[jobId]` pages are **empty**, `VideoPlayer` only embeds YouTube | User can never see results | API client + SSE + real pages (Part B, 9) |
| 17 | Dump shows markdown-corrupted strings in `page.tsx` (input placeholder) and `VideoPlayer.tsx` (`src=` template = `[https://…](https://…)`) | May break the URL input and iframe if real | Verify in the real files and rewrite (9) |
| 18 | venv lives inside `backend/env`; no `.gitignore`, no `.env.example`, requirements unpinned | Repo pollution, unreproducible | Step 1 |

---

## 2. TARGET ARCHITECTURE

### 2.1 Principles
- **Stream, don't store.** URL → yt-dlp resolves a direct audio URL → ffmpeg decodes to 16 kHz mono PCM **through a pipe** → 30 s windows → ASR. Nothing hits disk.
- **Progressive results.** Captions appear in the UI while the video is still being processed (SSE).
- **Honest scoring.** Every number shown to the user comes from a real computation with a documented method.
- **Graceful degradation.** No Gemini key? Deterministic fallbacks (fuzzy glossary match, extractive summary). No HF token? Diarization off. Never a 500 for a missing optional dependency.
- **Lightweight.** CPU-only laptop, `base`/`small` Whisper int8, ONNX embeddings, numpy vector search, SQLite (WAL).

### 2.2 System diagram

```
                    ┌──────────────────────────── Next.js 14 (frontend) ───────────────────────────┐
                    │ Home(URL probe) · Dashboard · Job live view · Review · Library · Glossary ·   │
                    │ Benchmark · Settings          lib/api.ts (typed) · useJobStream (SSE)         │
                    └───────────────▲────────────────────────────────────────────┬─────────────────┘
                          REST /api/v1  +  SSE /api/v1/jobs/{id}/events           │
┌───────────────────────────────────┴────────────────────────────────────────────▼─────────────────┐
│ FastAPI                                                                                             │
│  routers/  jobs · segments · export · summary · library · glossary · stats · system(health/probe)  │
│  core/     config · logging · errors · db(session) · events(bus)                                   │
│                                                                                                     │
│  services/job_runner.py  ── ThreadPool(1-2 workers) ── cancel flags ── event bus (SSE + DB log)     │
│        │                                                                                            │
│        ▼  PIPELINE (each stage = pure module with typed I/O, timed, individually testable)          │
│  [1 probe]→[2 stream-ingest]→[3 ASR windows]→[4 trust score]─live segments→ SSE                     │
│                                                    │                                                │
│                              green segs → VideoMemory (numpy index)                                 │
│                                                    ▼                                                │
│  [5 RAG correction: yellow/red only] → [6 translate+trust] → [7 chunk+summary(RAG,cited,verified)]  │
│                                                    ▼                                                │
│                    [8 persist → SQLite] + [library index] + [translation memory]                    │
│                                                                                                     │
│  rag/  embedder(lazy, fastembed) · VectorIndex(numpy) · BM25 · glossary · video_memory · TM         │
│  ml/   features.py (shared with notebook) · scorer.py (LightGBM+calibration) · model artifacts      │
│  llm/  gemini client (google-genai) · JSON-mode · batching · cache · backoff                        │
└────────────────────────────────────────────────────────────────────────────────────────────────────┘
        SQLite (WAL): jobs, segments, summaries, chunks, glossary_terms, translation_memory,
                      job_events, benchmark_results, schema_version
```

### 2.3 Platform support (via yt-dlp generic layer)
Works by URL (no login) when the platform allows: YouTube, Vimeo, Dailymotion, Twitter/X video posts, TikTok, Reddit videos, Twitch VODs, direct `.mp4/.mp3/.m3u8/.mpd` links. **Facebook and Instagram** frequently need cookies — support an optional `YTDLP_COOKIES_FILE` (Netscape `cookies.txt`) and `YTDLP_COOKIES_FROM_BROWSER`. Return `AUTH_REQUIRED` with a human remedy when blocked. Live streams: reject with `LIVE_UNSUPPORTED` (out of scope; noted as future work).

### 2.4 Job lifecycle
`queued → probing → ingesting_asr → correcting → translating → summarizing → done` (any stage → `error` | `cancelled`).
Progress is 0–100 float, weighted: probe 3 · ASR+score 50 · correct 15 · translate 15 · summary 12 · finalize 5.

---

## 3. FINAL FOLDER STRUCTURE (create exactly this)

```
signalpath/
├─ README.md
├─ .gitignore                      # env/, .venv/, node_modules/, .next/, *.db, data/indexes/, .env
├─ docs/
│  ├─ ARCHITECTURE.md              # this design, trimmed
│  ├─ DECISIONS.md                 # bot logs any choice it had to make
│  └─ API.md                       # generated from OpenAPI
├─ backend/
│  ├─ .env.example
│  ├─ requirements.txt             # core (light)
│  ├─ requirements-extras.txt      # optional: pyannote, torch, faiss, transformers
│  ├─ pytest.ini
│  ├─ data/
│  │   ├─ glossaries/{general,tech,medical,legal}.json
│  │   └─ indexes/                 # gitignored: library/TM vectors (.npy)
│  ├─ tests/                       # pytest (Step 10)
│  └─ app/
│     ├─ main.py                   # app factory + lifespan
│     ├─ core/{config,logging,errors,db,events}.py
│     ├─ models_db/                # SQLModel tables (one file per table group)
│     ├─ schemas/                  # Pydantic API models (jobs, segments, summary, library, stats, common)
│     ├─ api/v1/{jobs,segments,export,summary,library,glossary,stats,system}.py
│     ├─ services/{job_runner,cache}.py
│     ├─ pipeline/
│     │   ├─ orchestrator.py       # runs stages, emits events, handles cancel
│     │   ├─ ingest/{probe,stream,upload,errors}.py
│     │   ├─ asr.py                # faster-whisper windows
│     │   ├─ diarize.py            # optional, off by default
│     │   ├─ score.py              # calls ml.scorer
│     │   ├─ correct.py            # RAG correction + guardrails
│     │   ├─ translate.py
│     │   ├─ translation_trust.py
│     │   ├─ summarize.py
│     │   └─ chunking.py
│     ├─ rag/{embedder,index,bm25,glossary,video_memory,translation_memory,retrieve}.py
│     ├─ ml/{features,scorer}.py + artifacts/{trust_model.joblib,feature_schema.json}
│     ├─ llm/{gemini,prompts,cache}.py
│     └─ export/{captions,formats}.py
├─ frontend/                        # Step 9 (Next.js 14 App Router, TS, Tailwind)
└─ notebook/
   ├─ 01_train_trust_model.ipynb    # real labels, calibration, exports artifacts
   └─ 02_eval_pipeline.ipynb        # true WER: raw ASR vs +RAG correction; plots
```

---

## 4. DATA CONTRACTS (source of truth — implement exactly)

### 4.1 SQLite tables (SQLModel). Enable `PRAGMA journal_mode=WAL; foreign_keys=ON`.

**job**: `id (uuid str PK)`, `source_url TEXT NULL`, `source_kind ('url'|'upload')`, `platform TEXT NULL`, `title`, `uploader`, `thumbnail_url`, `duration_s FLOAT`, `mode ('transcribe'|'audit_platform_captions')`, `source_lang` (detected or given), `target_langs JSON list`, `status`, `stage TEXT`, `progress FLOAT`, `error_code NULL`, `error_message NULL`, `warnings JSON list`, `timings JSON`, `scorer_version`, `cache_key TEXT INDEX`, `created_at`, `updated_at`, `finished_at NULL`.

**segment**: `id INT PK`, `job_id FK INDEX`, `idx INT`, `start FLOAT`, `end FLOAT`, `text` (raw ASR), `words JSON` (word, start, end, prob), `trust_score FLOAT`, `trust_bucket ('green'|'yellow'|'red')`, `features JSON`, `domain_drift BOOL`, `correction TEXT NULL`, `correction_evidence JSON NULL` (list of `{source:'glossary'|'video'|'metadata', text, score}`), `correction_status ('none'|'applied'|'rejected'|'human')`, `final_text TEXT` (= human_text or correction or text), `translations JSON` → `{ "hi": {"text":..., "trust":0.83, "bucket":"green", "signals":{...}, "status":"ok"|"failed"} }`, `speaker TEXT NULL`, `human_edited BOOL`, `human_approved BOOL`.

**summary**: `job_id PK`, `tldr`, `key_points JSON [{text, chunk_ids[], start_s, grounded:bool, support:float}]`, `chapters JSON [{title,start_s}]`, `keywords JSON`, `grounding_score FLOAT`, `method ('rag_llm'|'extractive')`, `model TEXT`, `created_at`.

**chunk**: `id PK`, `job_id FK INDEX`, `idx`, `start_s`, `end_s`, `text`, `embedding BLOB (float32)`. (Library + summary retrieval source; ~45–60 s windows.)

**glossary_term**: `id`, `domain`, `term`, `definition`, `aliases JSON`, `do_not_translate BOOL`, `sense_hints JSON NULL` (e.g. `{"bank":["river bank","financial bank"]}`), `embedding BLOB NULL`, `source ('seed'|'user'|'video_metadata')`, `job_id NULL`.

**translation_memory**: `id`, `src_lang`, `tgt_lang`, `src_text`, `tgt_text`, `embedding BLOB`, `verified BOOL`, `created_at`. (Seeded from human approvals only — never from unverified model output.)

**job_event**: `id INT PK`, `job_id INDEX`, `type`, `payload JSON`, `ts`. (Lets SSE clients reconnect with `Last-Event-ID`.)

**benchmark_result**: `id`, `job_id NULL`, `kind ('offline'|'platform_disagreement'|'reference_wer')`, `metrics JSON`, `created_at`.

**schema_version**: `version INT`. On startup `create_all`; if version differs, log a warning (Alembic optional, not required).

### 4.2 REST API (all under `/api/v1`, JSON, consistent error body)

Error body: `{"error": {"code": "AUTH_REQUIRED", "message": "human readable", "hint": "what the user can do", "retryable": false}}`

| Method & path | Purpose |
|---|---|
| `POST /url/probe` `{url}` | Fast (≤8 s) metadata check without downloading: `{ok, platform, title, uploader, thumbnail_url, duration_s, is_live, has_platform_captions, langs_with_captions[], needs_auth, embed_url?}`. Called on paste for instant feedback. |
| `POST /jobs` JSON `{url, target_langs:["hi","mr"], mode, source_lang:"auto", options:{correct:true, summarize:true, diarize:false}}` **or** multipart with `file` | Creates job, returns `202 {job_id}` immediately. Uses cache if identical `cache_key` finished < `CACHE_TTL_H`. |
| `GET /jobs?limit&cursor&status` | Dashboard list. |
| `GET /jobs/{id}` | Job + progress + counts (no heavy payload). |
| `GET /jobs/{id}/events` | **SSE**. Events: `snapshot`, `stage`, `progress`, `segment` (new/updated), `warning`, `summary_ready`, `done`, `error`. Supports `Last-Event-ID`. |
| `GET /jobs/{id}/segments?after_idx=` | Segments (paged). |
| `POST /jobs/{id}/cancel`, `POST /jobs/{id}/retry`, `DELETE /jobs/{id}` | Control. |
| `PATCH /segments/{id}` `{human_text?, approved?}` | Human-in-the-loop edit; on approve, feed translation memory. |
| `GET /review/queue?limit` | Red/yellow segments not yet reviewed. |
| `GET /jobs/{id}/export?format=srt\|vtt\|txt\|json&lang=en\|hi\|mr&variant=final\|original&mark_low_trust=true` | Downloads. |
| `GET /jobs/{id}/summary`, `POST /jobs/{id}/summary/regenerate` `{style, length}` | RAG summary. |
| `POST /jobs/{id}/ask` `{question}` | Grounded Q&A with timestamp citations (bonus, reuses summary retrieval). |
| `GET /library/search?q&k` , `GET /library/videos` | Semantic search across all processed videos → `{job_id,title,start_s,text,score}`. |
| `GET/POST/PATCH/DELETE /glossary` | Domain glossary CRUD (+ CSV/JSON import). |
| `GET /stats` | Dashboard aggregates (jobs, minutes processed, avg trust, % corrected, bucket distribution, avg latency/real-time factor). |
| `GET /health`, `GET /preflight` | Preflight: ffmpeg found, yt-dlp version, models present, Gemini key present, DB writable, disk free. |

### 4.3 SSE event payloads
```
event: stage     data: {"stage":"ingesting_asr","label":"Transcribing (window 3/12)"}
event: progress  data: {"progress":41.5}
event: segment   data: {SegmentOut}                # raw ASR + score first; re-sent when corrected/translated
event: warning   data: {"code":"LLM_UNAVAILABLE","message":"..."}
event: done      data: {"job_id":"...","summary_ready":true}
event: error     data: {ErrorBody}
```

---

## 5. BUILD STEPS — PART A (backend core)

Each step = **Goal · Files · Bot prompt (copy verbatim to yourself) · Acceptance checks.**

---

### STEP 1 — Foundation: repo hygiene, config, DB, errors, logging, preflight

**Goal:** a clean, reproducible backend skeleton that starts on Windows from any folder and reports what is missing instead of crashing.

**Files:** `.gitignore`, `backend/.env.example`, `requirements.txt`, `requirements-extras.txt`, `pytest.ini`, `app/main.py`, `app/core/{config,logging,errors,db,events}.py`, `app/api/v1/system.py`, `docs/DECISIONS.md`.

**Bot prompt:**
> Create the foundation described in sections 0–4 of SIGNALPATH_ARCHITECTURE.md.
> 1. Move the virtualenv out of `backend/env`: create `backend/.venv` instructions in README; add a root `.gitignore` covering `.venv/ env/ node_modules/ .next/ __pycache__/ *.db *.db-wal *.db-shm .env backend/data/indexes/`.
> 2. `requirements.txt` (core, no upper pin on numpy): `fastapi, uvicorn[standard], python-multipart, pydantic-settings, sqlmodel, httpx, yt-dlp, faster-whisper, numpy, scikit-learn, lightgbm, joblib, fastembed, rank-bm25, rapidfuzz, jellyfish, wordfreq, jiwer, google-genai, deep-translator, pytest, pytest-asyncio`. `requirements-extras.txt`: `pyannote.audio, torch, transformers, faiss-cpu`. After the first successful install, run `pip freeze > requirements.lock.txt`.
> 3. `core/config.py`: a `Settings(BaseSettings)` reading `.env` located next to `backend/` (use `Path(__file__).resolve().parents[2]`). Fields (with defaults): `ENV=dev`, `API_PREFIX=/api/v1`, `CORS_ORIGINS=["http://localhost:3000"]`, `DB_PATH=<backend>/data/signalpath.db`, `DATA_DIR`, `INDEX_DIR`, `MODEL_DIR=app/ml/artifacts`, `WHISPER_MODEL=base`, `WHISPER_COMPUTE=int8`, `WHISPER_DEVICE=cpu`, `WINDOW_S=30`, `WINDOW_OVERLAP_S=1.5`, `MAX_VIDEO_MINUTES=60`, `MAX_UPLOAD_MB=500`, `JOB_WORKERS=1`, `CACHE_TTL_H=168`, `FFMPEG_PATH=ffmpeg`, `YTDLP_COOKIES_FILE=""`, `YTDLP_COOKIES_FROM_BROWSER=""`, `GEMINI_API_KEY=""`, `GEMINI_MODEL="gemini-2.5-flash"` (env-overridable, never hard-coded elsewhere), `HF_TOKEN=""`, `DIARIZE=off`, `EMBED_MODEL="sentence-transformers/all-MiniLM-L6-v2"`, `EMBED_MODEL_MULTI="sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"` (verify both names against `fastembed.TextEmbedding.list_supported_models()` at startup and log a warning if unsupported), `TRUST_HIGH/TRUST_MEDIUM` are read from `feature_schema.json`, not from env. Create directories on startup.
> 4. `core/db.py`: one engine (`check_same_thread=False`, WAL pragma via event listener), `get_session()` FastAPI dependency, `init_db()`.
> 5. `core/errors.py`: `class AppError(Exception)` with `code, message, hint, http_status, retryable`; the full code list from section 6 of this file; a FastAPI exception handler returning the standard error body. Also a catch-all handler that logs the traceback and returns `INTERNAL`.
> 6. `core/logging.py`: structured console logging with job_id in context (use `contextvars`).
> 7. `core/events.py`: an in-process `EventBus` — `publish(job_id, type, payload)` persists to `job_event` and fans out to subscriber `asyncio.Queue`s using `loop.call_soon_threadsafe` (publishers run in worker threads). `subscribe(job_id, last_event_id)` returns an async generator that first replays persisted events after `last_event_id`.
> 8. `main.py`: app factory with `lifespan` (init dirs, init DB, start JobRunner placeholder, kick off a **background thread** that warms models but never blocks startup or raises). CORS uses `settings.CORS_ORIGINS`, methods/headers explicit. Mount `api/v1/system.py`.
> 9. `api/v1/system.py`: `GET /health` (fast) and `GET /preflight` returning a list of checks `{name, ok, detail, fix}`: ffmpeg (`shutil.which` / run `-version`), yt-dlp version, JS-runtime note for YouTube (check yt-dlp's README for the current requirement; report as advisory), faster-whisper importable, model cache present, embedder loadable (lazy try), Gemini key set (advisory), DB writable, free disk ≥ 2 GB, `trust_model.joblib` present (advisory).
> 10. Write `docs/DECISIONS.md` with any choices you made.

**Acceptance checks:**
- `cd backend && python -m venv .venv && .venv\Scripts\activate && pip install -r requirements.txt` succeeds.
- `uvicorn app.main:app --reload` (run from `backend/`) AND `python -m uvicorn backend.app.main:app` from repo root both start (absolute paths).
- `GET http://localhost:8000/api/v1/health` → `{"status":"ok"}` in < 200 ms even if no models are downloaded.
- `GET /api/v1/preflight` lists ffmpeg status with a `fix` string like `winget install Gyan.FFmpeg`.
- Starting with a missing `.env` works using defaults.

---

### STEP 2 — Ingestion: probe + streaming audio (no video stored) + upload

**Goal:** paste any supported URL → instant metadata preview → audio streamed to PCM in memory.

**Files:** `app/pipeline/ingest/{probe,stream,upload,errors}.py`, `app/api/v1/system.py` (add `/url/probe`).

**Bot prompt:**
> Implement ingestion exactly as follows.
> **probe.py** — `probe_url(url) -> ProbeResult`. Validate scheme (http/https only; block `file:`, `localhost`, private IP ranges → `URL_INVALID` to prevent SSRF). Use `yt_dlp.YoutubeDL({"quiet":True,"skip_download":True,"noplaylist":True,"socket_timeout":10,"extract_flat":False, cookies options from settings})` and `extract_info(url, download=False)`. Return: platform (`info["extractor_key"]`), title, uploader, thumbnail, duration, is_live, description (first 4000 chars), tags, chapters, list of subtitle languages (`subtitles` + `automatic_captions`), `webpage_url`, and an `embed_url` only for platforms with a known embed pattern (YouTube `https://www.youtube.com/embed/{id}`, Vimeo `https://player.vimeo.com/video/{id}`); otherwise `null`. Map yt-dlp exceptions to `AppError` codes using message inspection: "Sign in"/"login"/"cookies"/"age" → `AUTH_REQUIRED`; "private"/"unavailable"/"removed" → `PRIVATE_OR_REMOVED`; "not available in your country" → `GEO_BLOCKED`; "Unsupported URL" → `URL_UNSUPPORTED`; signature/nsig/HTTP 403/“Requested format is not available” → `EXTRACTOR_OUTDATED` with hint `pip install -U yt-dlp` (and JS runtime hint for YouTube); live → `LIVE_UNSUPPORTED`; duration > `MAX_VIDEO_MINUTES` → `TOO_LONG`.
> **stream.py** — `stream_audio_windows(url, cancel_event) -> Iterator[AudioWindow]` where `AudioWindow = (index, offset_s, samples: np.ndarray float32 mono 16 kHz)`. Strategy tiers:
> - **Tier 1 (default, zero disk):** use yt-dlp with `format: "bestaudio[abr<=128]/bestaudio/best"` and `download=False` to get the selected format's direct `url` and `http_headers`. Launch ffmpeg via `subprocess.Popen([ffmpeg, "-nostdin","-loglevel","error","-headers", "<Key: Value\r\n...>", "-i", direct_url, "-vn","-ac","1","-ar","16000","-f","s16le","pipe:1"], stdout=PIPE)`. Read the pipe in fixed-size byte blocks; convert `int16 -> float32/32768`; yield windows of `WINDOW_S` seconds with `WINDOW_OVERLAP_S` overlap (keep the tail of the previous window). Always terminate the process in `finally` and when `cancel_event` is set.
> - **Tier 2 (fallback if tier 1 fails to start or yields 0 bytes):** download **audio only** to a `tempfile.TemporaryDirectory()` using yt-dlp (`format: "worstaudio/bestaudio"`, no postprocessors needed), decode with the same ffmpeg command reading from the file, and let the context manager delete the folder in all cases.
> - If ffmpeg is missing (`FileNotFoundError`) raise `FFMPEG_MISSING` with hint `winget install Gyan.FFmpeg` then restart the terminal.
> - Enforce `MAX_VIDEO_MINUTES` while streaming as a hard stop (`TOO_LONG`).
> **upload.py** — `open_upload(file: UploadFile) -> Iterator[AudioWindow]`: stream the upload into a `tempfile.NamedTemporaryFile(delete=False, dir=settings.TMP_DIR)` in 1 MB chunks, abort with `TOO_LONG`/413 above `MAX_UPLOAD_MB`, decode with the same ffmpeg reader, and **always** unlink the file in `finally`. Accept audio and video containers; extension whitelist + ffprobe sanity check.
> **errors.py** — the yt-dlp→AppError mapper (single place).
> **Endpoint:** `POST /api/v1/url/probe` (body `{url}`) wraps `probe_url` in `run_in_threadpool` and returns the ProbeResult or the standard error body. Add a small in-memory TTL cache (10 min) keyed by URL.
> Add a `platform_support.md` table in `docs/` listing which platforms were actually tested and their result (fill in during Step 10).

**Acceptance checks:**
- `POST /url/probe` with a normal YouTube URL returns title/duration/thumbnail in < 8 s.
- Probing `http://127.0.0.1/x` returns `URL_INVALID`.
- Probing a bogus URL returns `URL_UNSUPPORTED` (not a 500).
- A pytest that mocks `subprocess.Popen` verifies windows have the right sample counts and overlap.
- After streaming a 2-min video, no file larger than a few KB exists under the temp dir (`dir` listing check in a test).

---

### STEP 3 — ASR + real Trust Engine (features, scorer, retraining notebook)

**Goal:** real transcription in windows, real features, a calibrated LightGBM trust score trained on real labels, with **identical feature code** in training and serving.

**Files:** `app/pipeline/asr.py`, `app/pipeline/diarize.py`, `app/pipeline/score.py`, `app/ml/{features,scorer}.py`, `notebook/01_train_trust_model.ipynb`, `app/ml/artifacts/`.

**Bot prompt:**
> **asr.py** — Lazy singleton `get_model()` → `faster_whisper.WhisperModel(settings.WHISPER_MODEL, device=..., compute_type=settings.WHISPER_COMPUTE)`. `transcribe_window(window, language) -> list[RawSegment]` calls `model.transcribe(window.samples, language=None if auto else language, word_timestamps=True, vad_filter=True, beam_size=1, condition_on_previous_text=False)`. Keep the **real Whisper signals** per segment: `avg_logprob`, `no_speech_prob`, `compression_ratio`, and per-word `probability`. Shift timestamps by `window.offset_s`. **De-duplicate the overlap region**: drop any segment whose midpoint lies inside the overlap already covered by the previous window's final segment. Skip segments with `no_speech_prob > 0.8`. Detect language once from the first window (`info.language`, `info.language_probability`) and store in `job.source_lang`. Include an optional `initial_prompt` built from probe metadata (title + tags + top glossary terms, ≤ 200 chars) — this is a free accuracy boost for jargon.
> **ml/features.py** — `extract_features(seg: RawSegment, glossary_terms: set[str]) -> dict[str,float]` returning exactly these keys (schema v2): `word_count, duration, speech_rate, avg_word_prob, min_word_prob, std_word_prob, low_conf_ratio` (share of words with prob < 0.5), `avg_logprob, no_speech_prob, compression_ratio, mean_zipf` (mean `wordfreq.zipf_frequency(w,'en')`), `oov_ratio` (zipf == 0), `rare_ratio` (zipf < 3.0), `surprisal` (mean of `−log10` of word frequency proxy from wordfreq), `repetition_ratio` (share of repeated adjacent tokens/bigrams), `glossary_hit_ratio`. Pure function, no I/O, no global state, handles empty words (fills NaN — LightGBM handles NaN).
> **ml/scorer.py** — `TrustScorer` loads `trust_model.joblib` + `feature_schema.json` lazily. `schema` contains `version, feature_cols, thresholds {green, yellow}, calibrated: true, trained_on, auc, ece`. `score(features) -> (trust, bucket, scorer_name)` where `trust = 1 − calibrated_error_probability`. Validate that `feature_cols` equals `features.py`'s `FEATURE_COLS` constant; on mismatch log an error and use fallback. **Fallback heuristic** if artifacts are missing: a monotonic formula from `avg_word_prob, min_word_prob, avg_logprob, no_speech_prob, compression_ratio, oov_ratio` — and set `scorer_name="heuristic"` so the UI shows a "heuristic scorer" badge. Never silently pretend the ML model ran.
> **Domain-drift flag** (`score.py`): after scoring, compute the cosine between the segment embedding and the running video-memory centroid (Step 5) once ≥ 5 green segments exist; if `< 0.15` set `domain_drift=True` and, if bucket is green, demote to yellow. Skip when the embedder isn't available.
> **diarize.py** — `DIARIZE=off` (default) returns `None` and the UI hides speaker chips. `DIARIZE=pyannote` runs `pyannote/speaker-diarization-3.1` on the **in-memory waveform** (`{"waveform": tensor, "sample_rate": 16000}`) after ASR, needs `HF_TOKEN` and `requirements-extras.txt`; failures add a `warning`, never an exception. Do **not** fake "Speaker 1" for every segment.
> **Notebook `01_train_trust_model.ipynb`** (runs in Colab or locally):
> 1. Load ~1,500 utterances from LibriSpeech `test-other`/`dev-other` (+ a TED-LIUM slice if available) with HF `datasets` in streaming mode.
> 2. Augment a random 50%: add Gaussian noise at SNR 5–20 dB and random 0.9–1.1 speed, so errors actually occur.
> 3. Transcribe with the **same** faster-whisper config as the backend using `whisper tiny` and `base` (mixed) to get varied error rates.
> 4. Label = `1` if `jiwer.wer(normalize(ref), normalize(hyp)) > 0.10` (normalization: lowercase, strip punctuation, expand numbers off).
> 5. Features via `sys.path.append("../backend"); from app.ml.features import extract_features, FEATURE_COLS` — **do not reimplement features in the notebook**.
> 6. Group-aware split (by speaker/utterance source), train `LGBMClassifier`, calibrate with `CalibratedClassifierCV(method="isotonic", cv=3)`.
> 7. Report ROC-AUC, PR-AUC, ECE, calibration curve, feature importance, confusion at thresholds; choose `green` = largest threshold such that observed error rate among "green" ≤ 5%, `yellow` = threshold giving ≤ 20%. Save plots to `docs/figures/`.
> 8. Export `trust_model.joblib` and `feature_schema.json` (`version:2`, cols, thresholds, metrics, date) into `backend/app/ml/artifacts/`.
> Delete the old synthetic-formula training cells (keep the file as `00_legacy_synthetic.ipynb` only if pp wants it; otherwise remove).

**Acceptance checks:**
- pytest: `extract_features` returns all keys, no exceptions on empty word lists, deterministic.
- pytest: scorer falls back to heuristic when artifacts are missing and says so.
- Notebook prints ROC-AUC on held-out **real** data and writes both artifacts; backend loads them and `feature_cols` validation passes.
- ASR on a 60 s clip yields segments with `avg_logprob` set and monotonically increasing, de-duplicated timestamps.

---

### STEP 4 — Job runner, orchestrator, SSE, Jobs API

**Goal:** the API responds instantly; work happens in a controlled worker; UI receives live progress + live segments.

**Files:** `app/services/{job_runner,cache}.py`, `app/pipeline/orchestrator.py`, `app/api/v1/{jobs,segments}.py`, `app/schemas/*`, `app/models_db/*`.

**Bot prompt:**
> Implement the tables in section 4.1 with SQLModel (split into `models_db/job.py, segment.py, summary.py, chunk.py, glossary.py, tm.py, event.py, benchmark.py`), and matching Pydantic schemas in `schemas/` (never return DB models directly).
> **JobRunner:** a `ThreadPoolExecutor(max_workers=settings.JOB_WORKERS)`; `submit(job_id)`; a dict of `threading.Event` cancel flags; on startup mark any `job.status` in non-terminal states as `error` with code `INTERNAL`/"interrupted by restart" (or requeue if `retry` is enabled).
> **Cache:** `cache_key = sha256(normalized_url + mode + sorted(target_langs) + WHISPER_MODEL + scorer_version)`; if a `done` job with that key is newer than `CACHE_TTL_H`, `POST /jobs` returns that job's id with `cached: true` instead of recomputing. Normalize URLs (strip tracking params, canonical YouTube id).
> **Orchestrator** (`run_job(job_id)`): stages — `probing` → `ingesting_asr` (loop over `stream_audio_windows`; for each window: ASR → features → score → save segments → `publish("segment", ...)` + progress by `offset_s/duration_s`) → `correcting` (Step 5, only yellow/red) → `translating` (Part B) → `summarizing` (Part B) → `finalize` (compute `final_text`, build chunks + library embeddings, timings, `done`). Each stage is wrapped in a helper that records elapsed time into `job.timings`, checks the cancel flag between windows/batches, and converts exceptions into `AppError` codes. **Non-critical stages (correct/translate/summarize) must not fail the job**: on error publish a `warning`, leave fields null, continue. Only probe/ingest/ASR failures set `status=error`.
> **Modes:** `transcribe` (default) and `audit_platform_captions` — fetch the platform's subtitle track via yt-dlp (`skip_download`, `writeautomaticsub`/`writesubtitles`, VTT), parse into segments (de-duplicate the rolling-caption repeats of YouTube auto-subs), treat them as the hypothesis, and score them with only the features available without Whisper signals (uses the same `TrustScorer` with NaN for missing Whisper features). Also run ASR only if `options.compare=true`.
> **Endpoints:** implement `POST /jobs` (JSON or multipart; validate `url` via probe-lite or trust the later stage), `GET /jobs`, `GET /jobs/{id}`, `GET /jobs/{id}/segments`, `GET /jobs/{id}/events` (StreamingResponse `text/event-stream`, `Cache-Control: no-cache`, heartbeat comment every 15 s, `id:` field = `job_event.id`, honors `Last-Event-ID`), `POST /jobs/{id}/cancel`, `POST /jobs/{id}/retry`, `DELETE /jobs/{id}` (cascade segments/chunks/summary), `PATCH /segments/{id}`.
> Keep all handlers thin: validation → service call → response.

**Acceptance checks:**
- `POST /jobs` returns `202` in < 300 ms with a `job_id`; the status moves through stages; killing the client does not stop the job.
- `curl -N http://localhost:8000/api/v1/jobs/<id>/events` prints `segment` events **while** the video is still being processed.
- A second identical POST within the TTL returns `cached: true`.
- Cancel stops ffmpeg (no orphan `ffmpeg.exe` in Task Manager).
- Forced failure in the correction stage yields a `warning` event and the job still ends `done`.

---

### STEP 5 — RAG core + guarded RAG correction

**Goal:** lightweight, lazy, persistent retrieval and corrections that cannot hallucinate.

**Files:** `app/rag/*`, `app/pipeline/correct.py`, `app/llm/{gemini,prompts,cache}.py`, `backend/data/glossaries/*.json`.

**Bot prompt:**
> **rag/embedder.py** — lazy `get_embedder(multilingual: bool=False)` using `fastembed.TextEmbedding`; `embed(texts) -> np.ndarray float32 (L2-normalized)`; batch size 32; thread-safe lock; if the model can't load raise `MODEL_MISSING` (callers catch and degrade).
> **rag/index.py** — `VectorIndex` class: holds `np.ndarray` matrix + payload list; `add()`, `search(q_vec, k) -> [(payload, score)]` via matrix multiply + `argpartition`; `save(path)/load(path)` as `.npy` + `.jsonl`. No FAISS in core (add `FaissIndex` behind the same interface only if `faiss` is importable and `n > 50_000`).
> **rag/bm25.py** — thin `rank_bm25.BM25Okapi` wrapper with a simple tokenizer (lowercase, `\w+`).
> **rag/retrieve.py** — `hybrid_search(query, dense_index, bm25, k)` combining dense + BM25 with Reciprocal Rank Fusion (k=60); optional MMR re-ranking helper `mmr(query_vec, cand_vecs, lambda=0.6, k)` (reused by summary in Part B).
> **rag/glossary.py** — loads `data/glossaries/*.json` (schema: `[{"term","definition","aliases":[...],"do_not_translate":false,"sense_hints":{...}}]`) + DB user terms; builds one dense index + BM25 lazily and rebuilds when the glossary table changes (version counter). Ship seed glossaries (≥ 40 terms each for general, tech/ML/cloud, medical, legal) written by you, accurate, no copyrighted text. Add `glossary_terms_from_metadata(title, description, tags, chapters)` which extracts capitalized multi-word phrases, acronyms and quoted terms from the probe metadata — these become **per-video glossary terms** (`source='video_metadata'`) and are the strongest free signal for names/jargon in that video.
> **rag/video_memory.py** — per-job `VectorIndex` living only in RAM during the job: add every **green** segment (text + timestamp); expose `search`, `centroid()`, and `recurring_terms()` (tokens/bigrams appearing ≥ 3 times among green segments, not in a stoplist). Delete at job end (`finally`).
> **rag/translation_memory.py** — persistent `VectorIndex` (multilingual embedder) over `translation_memory` rows where `verified=True`; `add_pair`, `nearest(src_text, tgt_lang, k)`.
> **llm/gemini.py** — one `GeminiClient` using `from google import genai`: `client = genai.Client(api_key=...)`, `generate_json(prompt, schema, model=settings.GEMINI_MODEL)` using `response_mime_type="application/json"`; retries with exponential backoff + jitter on 429/5xx (max 4), overall timeout, a global rate limiter (`GEMINI_RPM` env, default 10), and a disk-backed response cache (`llm/cache.py`, key = sha256(model+prompt), SQLite table or `diskcache`-style JSON files). If no key: `is_available()` is False and every caller must use its deterministic fallback.
> **pipeline/correct.py** — `correct_job_segments(job_id, segments, memory, glossary, emit)`:
> 1. Select candidates: bucket in {yellow, red} only (limit by `MAX_CORRECTIONS_PER_JOB`, default 300, worst first).
> 2. For each candidate build evidence: top-3 glossary hits (hybrid), top-2 video-memory hits from **other** segments, video-metadata terms, recurring terms; keep the evidence list with scores.
> 3. **With LLM:** batch 6–8 candidates per call, including 1 neighbour segment before/after as context (marked read-only). Prompt (in `llm/prompts.py`): *"You fix speech-recognition errors in captions. Change a segment only if the evidence clearly shows a mis-heard term or name. Keep meaning, order, punctuation style and length. Never add facts, numbers or names that are not in the segment or evidence. Return JSON `[{id, corrected, changed:boolean, evidence_ids:[...], confidence:0-1}]`."* Use temperature 0.
> 4. **Without LLM (deterministic fallback):** for each low-trust word/bigram find the nearest glossary/recurring term with `rapidfuzz.fuzz.ratio ≥ 85` OR equal `jellyfish.metaphone` codes with edit-distance ≤ 2, and replace only that token. No text is ever appended to the caption.
> 5. **Guardrails (apply to both paths) — reject and keep original if:** char-level edit ratio > 0.35; the correction introduces a number, URL or capitalized entity absent from both the original and evidence; token count changes by > 30%; `confidence < 0.6`; result is empty. Rejected → `correction_status='rejected'` (kept for the audit trail), accepted → `'applied'`.
> 6. Store `correction`, `correction_evidence`, publish updated `segment` events, then re-score? **No** — keep the original trust score; UI shows "corrected" as a separate badge.
> Provide `correct_text(text, evidence)` as a pure function for unit tests.

**Acceptance checks:**
- Importing any `app.rag.*` module does **not** load a model or the network (verify by test with monkeypatch).
- Library-style search over 10k random vectors < 30 ms.
- Unit tests: guardrails reject a correction that adds a new number; fallback path fixes "cubernetes" → "Kubernetes" without LLM key.
- With `GEMINI_API_KEY` unset the job still finishes and shows deterministic corrections; with the key set, LLM calls per 100 segments ≤ 15 (batched) — log the count.
- Repeating the same job hits the LLM cache (0 new calls).

---

## END OF PART A
Continue with PART B below (Steps 6–10, run/test commands, skill usage guide, architecture summary).
