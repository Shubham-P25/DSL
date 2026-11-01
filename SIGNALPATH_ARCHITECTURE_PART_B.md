# SignalPath v3 — PART B (Steps 6–10 · run/test · skills guide · summary)

> **Audience:** the VS Code coding bot (GP5.6 Luna). **Owner:** pp (Shubham), DSL mini-project.
> **How to use:** this file continues `SIGNALPATH_ARCHITECTURE.md` (Part A, sections 0–5, Steps 1–5). Read Part A first; **all rules in section 0 of Part A still apply** (no fake outputs, lazy model loading, no stored videos, one engine/session, UTF-8).
> Part A gives a working URL → live captions + trust scores + RAG correction backend. Part B adds translation, summary RAG, library, export, honest benchmark, the frontend, tests and the run guide.
> If you already built Part A, start at section 6 (shared reference + amendments) and then Step 6.

---

## 6. SHARED REFERENCE (completes Part A)

### 6.1 Error code taxonomy (Part A, Step 1 refers to "section 6")

`AppError(code, message, hint, http_status, retryable)`. Define every code below in `core/errors.py`. **Warning-only** codes never fail a job: they are published as `warning` events and appended to `job.warnings`.

| Code | HTTP | Retry | Default hint |
|---|---|---|---|
| `URL_INVALID` | 400 | no | Paste a full public `http(s)` link. |
| `URL_UNSUPPORTED` | 422 | no | Site not supported by yt-dlp. Try a direct media link or upload the file. |
| `AUTH_REQUIRED` | 403 | no | Platform wants a login (common for Facebook/Instagram). Set `YTDLP_COOKIES_FILE` or `YTDLP_COOKIES_FROM_BROWSER`, or upload the file. |
| `PRIVATE_OR_REMOVED` | 404 | no | Video is private, deleted or unavailable. |
| `GEO_BLOCKED` | 451 | no | Not available in this country. |
| `EXTRACTOR_OUTDATED` | 502 | yes | Run `pip install -U yt-dlp` (YouTube may also need a JS runtime — see `/preflight`). |
| `LIVE_UNSUPPORTED` | 422 | no | Live streams are out of scope; use the recording after it ends. |
| `TOO_LONG` | 413 | no | Longer than `MAX_VIDEO_MINUTES` / `MAX_UPLOAD_MB`. |
| `UPLOAD_INVALID` | 415 | no | Unsupported or unreadable media file. |
| `FFMPEG_MISSING` | 503 | no | `winget install Gyan.FFmpeg`, then restart the terminal. |
| `MODEL_MISSING` | 503 | yes | First run downloads models; check internet, then retry. |
| `ASR_FAILED` | 500 | yes | Retry; try a smaller `WHISPER_MODEL`. |
| `NOT_READY` | 409 | yes | The requested data (translation/summary/export) is not finished yet. |
| `NOT_FOUND` | 404 | no | Unknown job/segment/term. |
| `CANCELLED` | 409 | no | Job was cancelled. |
| `VALIDATION` | 422 | no | Request body failed validation (details in message). |
| `RATE_LIMITED` | 429 | yes | Too many requests; wait and retry. |
| `INTERNAL` | 500 | yes | Unexpected error; the traceback is in the server log. |
| `LLM_UNAVAILABLE` (warning) | — | — | No `GEMINI_API_KEY` or quota hit; deterministic fallback used. |
| `TRANSLATION_FAILED` (warning) | — | — | Segment(s) left untranslated (`status:"failed"`). |
| `DIARIZE_UNAVAILABLE` (warning) | — | — | Speaker labels disabled. |

### 6.2 Amendments to Part A (apply now; they close gaps found while writing Part B)

- **A1** `job` table: add `options JSON` (`{correct, summarize, diarize, compare, style, length}`) and `file_name TEXT NULL` (display name of an upload; the file itself is never kept).
- **A2** `summary` table: add `translations JSON NULL` → `{"hi": {"tldr": "...", "key_points": ["..."]}}`.
- **A3** New file `app/pipeline/ingest/platform_captions.py`: `fetch_platform_captions(url, lang) -> list[RawSegment]` (yt-dlp `skip_download`, `writesubtitles`/`writeautomaticsub`, VTT, into a `TemporaryDirectory`, parse, **de-duplicate YouTube rolling captions**: when cue N+1's text starts with cue N's text, keep only the new suffix). Used by Step 4 (`audit_platform_captions`) and Step 8 (benchmark).
- **A4** New settings (`config.py` + `.env.example`): `TMP_DIR=<backend>/data/tmp`, `LOG_LEVEL=INFO`, `GEMINI_RPM=10`, `MAX_CORRECTIONS_PER_JOB=300`, `TRANSLATOR=auto` (`auto|gemini|google|indictrans2`), `MAX_BACKTRANS_PER_JOB=200`, `CHUNK_MIN_S=45`, `CHUNK_MAX_S=60`, `SUMMARY_MIN_SUPPORT=0.40`, `ASK_MIN_SCORE=0.30`, `EVENT_RETENTION_DAYS=7`, `LLM_CACHE_PATH=<data>/llm_cache.sqlite`.
- **A5** `app/ml/artifacts/` may also contain `translation_trust_schema.json` (+ optional `translation_trust_model.joblib`) produced by notebook 02 (Step 8).
- **A6** SQLite threading rule: worker threads open **short-lived sessions per unit of work** (`with Session(engine) as s:`); a Session is never shared across threads or held across a whole job. Prune `job_event` rows older than `EVENT_RETENTION_DAYS` at startup.
- **A7** `main.py` mounts one router per file listed in Part A section 3 (`api/v1/{jobs,segments,export,summary,library,glossary,stats,system}.py`) plus `review` (queue) and `benchmark`, all under `settings.API_PREFIX`.

---

## 7. BUILD STEPS — PART B

Same format as Part A: **Goal · Files · Bot prompt · Acceptance checks.** Build in order; run the acceptance checks before moving on.

---

### STEP 6 — Translation (English → Hindi / Marathi) + real translation trust

**Goal:** 1-to-1, timing-preserving translation with terminology protection and sense disambiguation, plus a translation trust score computed from real signals — never fake text.

**Files:** `app/pipeline/lang.py`, `app/pipeline/translate.py`, `app/pipeline/translation_trust.py`, additions to `app/llm/prompts.py`, `app/rag/translation_memory.py` (from Step 5), wiring in `orchestrator.py` stage `translating`.

**Bot prompt:**
> **lang.py** — a table `LANGS = {"en": {...}, "hi": {"name":"Hindi","script":"Devanagari","range":(0x0900,0x097F),"len_ratio":(0.8,1.6)}, "mr": {"name":"Marathi", same script, "len_ratio":(0.8,1.6)}}`. Adding a language must be one new row. Helpers: `script_ratio(text, lang)` (share of alphabetic chars inside the script range), `normalize_digits(text)` (Devanagari digits → ASCII for comparison only).
> **translate.py** — `translate_segments(job, segments, targets, memory, glossary, emit)`. Source text is always `segment.final_text`. For each target language:
> 1. **Protect terms.** Replace glossary terms flagged `do_not_translate`, video-metadata proper nouns, URLs and numbers-with-units by placeholders `⟦T1⟧, ⟦T2⟧…` (per segment). After translation verify **every placeholder is present exactly once**, then restore the original strings. A missing placeholder = segment translation `status:"failed"` for that attempt.
> 2. **Disambiguate senses.** For glossary hits with `sense_hints` (Step 5 schema), pick the sense whose hint text is closest (dense similarity) to the segment + video-memory centroid, and pass it as a term note ("bank = financial institution"). Never mutate the caption; notes only go into the prompt.
> 3. **Translation memory.** Retrieve up to 3 verified pairs with similarity ≥ 0.85 (`translation_memory.nearest`) as few-shot examples. If similarity ≥ 0.97 **and** `verified`, reuse the stored translation and mark `signals.tm_reuse=true`.
> 4. **Engine tiers** (`settings.TRANSLATOR`, `auto` = first available): (a) **Gemini** — batches of 10–15 segments with ids and 1 neighbour before/after as read-only context, JSON in/out `[{id, translation}]`, temperature 0, prompt: *"Translate these captions from {src} to {tgt}. One output per id, same order, no merging or splitting. Keep ⟦T#⟧ tokens unchanged. Use the term notes. Natural spoken register. No explanations."*; (b) **deep-translator** (`GoogleTranslator`, free, no key), segment by segment with a small thread pool and backoff; (c) **IndicTrans2** only if `requirements-extras.txt` is installed (`transformers`, `torch`) and `TRANSLATOR=indictrans2` — lazy-load, 1 model instance, batch 16. If no tier works: leave `translations[tgt]=null`, publish `TRANSLATION_FAILED` warning, continue.
> 5. Validate each result: non-empty, ids complete (retry missing ones once individually), placeholders intact. Write `segment.translations[tgt] = {"text","trust","bucket","signals","status","engine"}` and publish an updated `segment` event. Timing stays the source segment's start/end (1-to-1), so no re-alignment is needed.
> **translation_trust.py** — `score_translation(src, tgt, src_lang, tgt_lang, ctx) -> TransTrust` using **real, documented signals**: (1) `xling_cos`: cosine between multilingual-embedder vectors of source and translation; (2) `backtrans_cos`: translate the target back to English with a **different** engine tier when possible and compare to the source (dense cosine + `rapidfuzz` token ratio) — computed only for segments whose cheap score < 0.80, capped by `MAX_BACKTRANS_PER_JOB`; (3) `len_ratio_ok`: char-length ratio inside `LANGS[tgt].len_ratio`; (4) `script_ok`: `script_ratio ≥ 0.6` after removing protected terms/numbers; (5) `numbers_ok`: every number in the source appears (digit-normalized) in the target; (6) `tm_sim`: max similarity to verified TM pairs; (7) `cps_ok`: reading speed of the translation over the segment duration ≤ 20 chars/s.
> Combine: if `translation_trust_model.joblib` + schema exist (from notebook 02) use it (logistic regression on the signals, `scorer="fitted"`); otherwise a fixed weighted mean — `xling 0.40, backtrans 0.25, len 0.10, script 0.10, numbers 0.10, tm 0.05`, **renormalised over available signals**, `scorer="heuristic"`. Buckets use the schema thresholds, else 0.75/0.50 with the heuristic badge. Never claim more than the method supports.

**Acceptance checks:**
- pytest: placeholder round-trip restores terms; a translation missing a placeholder is rejected and retried.
- pytest: `numbers_ok` fails when "2019" disappears; `script_ok` fails when a Hindi output is Latin script.
- With no Gemini key the job still translates through tier (b); with all engines blocked (monkeypatched) segments have `translations.hi == null` and a `TRANSLATION_FAILED` warning — **no** `[HI]` placeholder text anywhere (grep test).
- Translation memory reuse is hit on a repeated verified sentence (`signals.tm_reuse`).
- Per 100 segments, Gemini calls ≤ 10 (batched); logged.

---

### STEP 7 — Chunking, grounded RAG summary, Q&A and the persistent library

**Goal:** a summary that is genuinely RAG (retrieval → generation → verification), cited to timestamps, honest about grounding; plus fast cross-video semantic search.

**Files:** `app/pipeline/chunking.py`, `app/pipeline/summarize.py`, `app/pipeline/summary_verify.py`, `app/api/v1/{summary,library}.py`, `app/rag/library_index.py`, prompts additions.

**Bot prompt:**
> **chunking.py** — `build_chunks(segments) -> list[Chunk]`: iterate by `idx`, accumulate `final_text` until duration ≥ `CHUNK_MIN_S`, close at the next sentence end (or at `CHUNK_MAX_S`); split on speaker change when diarization is on; overlap of 1 segment between neighbours. Embed all chunks in one batch; persist to `chunk` (embedding as float32 BLOB).
> **Chapters** — TextTiling-style: cosine between adjacent chunk embeddings smoothed over a window of 2; boundary where similarity < `mean − 0.5·std`; minimum 3 chunks per chapter; at most `ceil(minutes / 4)` and never more than 12 chapters. Chapter title = LLM (same call as key points) or, in fallback, top-3 distinct TF-IDF keywords of the chapter vs the whole video.
> **summarize.py** — `summarize_job(job, chunks, glossary, style, length)`:
> - **Retrieve:** for each chapter, query = chapter centroid → hybrid search (dense + BM25, RRF) inside this job's chunks → MMR (λ=0.6) to 4–6 diverse excerpts, numbered `[1]…[n]` with timestamps.
> - **Generate (LLM path):** prompt: *"Summarise using ONLY the numbered excerpts. Each key point must list the excerpt numbers that support it. If the excerpts don't support a claim, omit it. Do not add facts, numbers or names that are not in the excerpts. Return JSON `{chapter_title, key_points:[{text, excerpt_ids:[...]}]}`."* Then a **reduce** call builds `tldr` (≤ 3 sentences) from the verified key points only. `style ∈ {bullets, paragraph, study_notes, exec_brief}`, `length ∈ {short, medium, long}` control counts (3/6/10 key points). Temperature 0.2.
> - **Verify (`summary_verify.py`) — mandatory for LLM and fallback output:** for each key point compute `support = max cosine(point, cited chunks)`; require every number in the point to appear in a cited chunk and every capitalised entity to fuzzy-match (≥ 90) a cited chunk. `grounded = support ≥ SUMMARY_MIN_SUPPORT and checks pass`. Drop ungrounded points from the TL;DR; keep them in the list flagged `grounded:false` only if `options.show_ungrounded`. `grounding_score = mean(grounded)`. If `< 0.7`, regenerate once with a stricter prompt; if still `< 0.7`, keep only grounded points and add a warning.
> - **Extractive fallback (no LLM):** TextRank over chunk embeddings (centrality) + MMR, take the top-k *sentences verbatim*, ordered by time; `method="extractive"`; TL;DR = 3 most central sentences; keywords = TF-IDF ∪ video-memory `recurring_terms()` ∪ metadata terms. Fallback output is by construction grounded (verbatim).
> - Optionally translate `tldr`/key points into `job.target_langs` with the Step 6 translator (store in `summary.translations`).
> - Save to `summary`, publish `summary_ready`. Endpoints: `GET /jobs/{id}/summary` (404 `NOT_READY` until saved), `POST /jobs/{id}/summary/regenerate {style,length}` (queues a job-runner task, never runs inline), `POST /jobs/{id}/ask {question}`.
> **Ask (grounded Q&A)** — hybrid retrieval over the job's chunks (k=6); if best score `< ASK_MIN_SCORE` return `{answerable:false, answer:"This video doesn't seem to cover that."}` without calling the LLM; else LLM JSON `{answer, citations:[chunk_id]}` (verify the ids exist; run the same verifier) or, without LLM, return the top 3 passages with timestamps.
> **library_index.py** — one persistent `VectorIndex` at `INDEX_DIR/library.npy + library.jsonl` over **all** chunks of all done jobs (payload `job_id, chunk_id, start_s, title, platform`). Append on `finalize`, tombstone on `DELETE /jobs/{id}` and compact when tombstones > 10 %. If the files are missing/corrupt, rebuild from `chunk.embedding` BLOBs (source of truth) in the background. BM25 is rebuilt lazily by a version counter. **Never rebuild per request** (audit #12).
> **Endpoints:** `GET /library/search?q&k&platform&min_trust` → `[{job_id,title,thumbnail_url,start_s,text,score}]` (hybrid, k default 10); `GET /library/videos` (paged list with duration, avg trust, summary tldr snippet).

**Acceptance checks:**
- Chunks are 45–60 s (± one segment) and every segment belongs to exactly one primary chunk (test).
- Summary points each carry `chunk_ids`; a synthetic hallucinated point (number not in the source) is marked `grounded:false` (test).
- Summary works with `GEMINI_API_KEY` unset (`method:"extractive"`) and its `grounding_score` is 1.0.
- `GET /library/search` p95 < 100 ms with 5 videos × 200 chunks; the index is **not** rebuilt between two consecutive requests (log assertion).
- Asking an unrelated question returns `answerable:false` with **zero** LLM calls.

---

### STEP 8 — Export (SRT/VTT/TXT/JSON) + honest benchmark

**Goal:** professional caption files; benchmark numbers that come only from real computation, clearly labelled for what they measure.

**Files:** `app/export/{captions,formats}.py`, `app/api/v1/export.py`, `app/api/v1/benchmark.py`, `app/pipeline/benchmark.py`, `app/pipeline/text_norm.py`, `notebook/02_eval_pipeline.ipynb`, `scripts/platform_matrix.py`.

**Bot prompt:**
> **Export** — `GET /jobs/{id}/export?format=srt|vtt|txt|json&lang=en|hi|mr|en+hi&variant=final|original&mark_low_trust=false`. Caption cue rules in `captions.py`: max 2 lines × 42 characters, cue duration 1.0–7.0 s, minimum gap 80 ms, reading speed ≤ 17 chars/s (split before exceeding it). Long segments are split at real **word timestamps** for the source language; translations have no word timing, so split proportionally by character count and say so in `docs/DECISIONS.md`. `en+hi` = bilingual two-line cues. VTT: header, cue ids, optional `<c.lowtrust>` class spans when `mark_low_trust`; SRT: prefix `[?]` only when `mark_low_trust=true`. Missing translation for the requested `lang` → `NOT_READY` (never fall back silently to English). UTF-8, `Content-Disposition` with a slugified title, `StreamingResponse`. `json` = full segments + summary + job metadata + method/scorer versions.
> **text_norm.py** — one `normalize(text)` used everywhere metrics are computed (`v1`): Unicode NFKC, lowercase, strip punctuation, collapse whitespace, **no** number expansion (state this in the metric output as `"normalization":"v1"`).
> **Benchmark kinds** (store in `benchmark_result`, never invent numbers):
> 1. `reference_wer` — the user uploads a reference (`.txt`, `.srt` or `.vtt`) for a job (`POST /jobs/{id}/benchmark/reference`), or the job's `human_approved` segments serve as reference. Compute with `jiwer`: WER/CER for **raw ASR**, **+RAG-corrected** (`final_text` without human edits), and **platform captions** if fetched (A3); substitutions/insertions/deletions; per-minute WER when the reference is timed (words assigned by segment midpoint, not by character slicing); `correction_effect = {helped, hurt, neutral}` per segment. If the reference has < 200 words return `{"status":"insufficient_data"}`.
> 2. `platform_disagreement` — no reference available: fetch platform auto-captions, compute **disagreement** (WER between our transcript and theirs), per bucket (green/yellow/red), and `trust_auc_vs_disagreement` (does low trust predict disagreement?). Label everything **"agreement with platform captions — not accuracy"** in the API (`"interpretation"` field) and the UI.
> 3. `offline` — produced only by notebook 02 (below); the API serves the saved JSON from `docs/eval/results.json`.
> **Notebook 02** (Colab/local): (A) held-out LibriSpeech/TED-LIUM utterances with true references: WER raw vs +correction, correction precision (helped/hurt/neutral), trust-score ROC-AUC + ECE + reliability plot; (B) **translation-trust calibration**: on a small English→Hindi/Marathi parallel test set that is actually accessible (FLORES+/IN22 or similar — log the choice in `DECISIONS.md`), compute the Step 6 signals, label `chrF ≥ 50`, fit a logistic regression, export `translation_trust_model.joblib` + `translation_trust_schema.json`; (C) latency table (per-stage ms, real-time factor). Save figures to `docs/figures/` and numbers to `docs/eval/results.json`.
> **`scripts/platform_matrix.py`** — reads `docs/test_urls.txt` (one URL per line, `# platform` comments), runs probe → 30 s stream → ASR window, and writes `docs/platform_support.md` (columns: platform, probe, stream, ASR, notes/error code). Fill it with what really happened.

**Acceptance checks:**
- SRT/VTT open correctly in VLC and pass a parser round-trip test (cue count, monotonically increasing times, no overlaps, ≤ 2 lines, ≤ 42 chars).
- `reference_wer` on a 3-minute clip with a real reference returns numbers reproducible from `jiwer` in a test; identical reference and hypothesis ⇒ WER 0.
- Any benchmark response containing a metric without a `method`/`normalization` field fails a schema test.
- `grep -rn "0.45\|wer_yt" backend/app` finds no fabricated-metric constants.
- Notebook 02 runs top-to-bottom and writes `docs/eval/results.json`.

---

### STEP 9 — Frontend (Next.js 14 App Router, TypeScript, Tailwind, framer-motion)

**Goal:** an appealing light-theme dashboard with a live job view, review workflow, summary, library, glossary, benchmark and system pages. Keep the existing components where they are sound; **rewrite every file that shows mojibake or markdown-corrupted strings** (audit #17: `layout.tsx` title, `page.tsx` placeholder, `VideoPlayer.tsx` `src` template).

**Files (create/extend):**
```
frontend/
├─ app/  layout.tsx · globals.css · page.tsx (Home)
│  ├─ dashboard/page.tsx      ├─ processing/[jobId]/page.tsx   ├─ results/[jobId]/page.tsx
│  ├─ review/page.tsx         ├─ library/page.tsx              ├─ glossary/page.tsx
│  └─ benchmark/page.tsx      └─ settings/page.tsx
├─ components/{layout,probe,jobs,captions,summary,charts,ui}/…
├─ hooks/{useJobStream,useProbe,useJobs,useToast}.ts
├─ lib/{api,types,errors,format,avatar,wordDiff}.ts
├─ tailwind.config.ts · .env.local.example   (NEXT_PUBLIC_API_BASE=http://localhost:8000/api/v1)
```

**Bot prompt:**
> **Foundation.** `lib/types.ts` mirrors the backend Pydantic schemas (`SegmentOut, JobOut, ProbeResult, SummaryOut, ErrorBody…`). `lib/api.ts` is the only place that calls `fetch`: base URL from `NEXT_PUBLIC_API_BASE`, JSON helpers, multipart upload, an `ApiError` built from the standard error body, `AbortController` support. `lib/errors.ts` maps each error `code` to a friendly title + the backend `hint` + an icon. No hard-coded `localhost:8000` anywhere else. Dependencies: keep `framer-motion`, `lucide-react`; add `recharts`, `clsx`. Fonts via `next/font` (a distinctive display face for headings — e.g. Plus Jakarta Sans — and a mono face for timestamps). UTF-8 everywhere.
> **Design system (light theme, decided — log in DECISIONS.md).** Tokens in `tailwind.config.ts`: background `#F7F8FC`, surface `#FFFFFF`, ink `#0F1222`, muted `#5B6078`, primary indigo `#5B5BF0`, accent violet `#8B5CF6`, teal `#14B8A6`; trust colors green `#22C55E`, yellow `#F59E0B`, red `#F43F5E` (always paired with an icon/label, never colour alone). Radii 16–24 px, soft layered shadows, glass cards (white/70 + blur), hero gradient `#EEF0FF → #F5EEFF → #E6FBF6`. Motion: spring transitions, staggered list entrance, `layout` animations for new segments (slide-in + a 600 ms highlight flash), animated progress ring, count-up numbers, an SVG waveform that morphs into caption lines in the hero. **Respect `prefers-reduced-motion`.** Images/avatars: probe thumbnails, deterministic **gradient initial avatars** for speakers/users (`lib/avatar.ts`, hash → two gradient colours, no network), inline SVG illustrations for empty states. No image or asset from a third-party host at runtime.
> **Home `/`.** Big URL input with a debounced (600 ms, abortable) `POST /url/probe` (`useProbe`) → animated **preview card** (thumbnail, title, uploader, duration, platform chip, "platform captions available" chip, `needs_auth` warning with the cookie hint). Options: target languages (multi-select chips en/hi/mr), mode (Transcribe / Audit platform captions), toggles (RAG correction, summary). Upload dropzone as a second tab. "Start" → `POST /jobs` → router push to `/processing/{id}`. Supported-platform badges under the input. Errors render as inline banners from `errors.ts`, never `alert()`.
> **Processing `/processing/[jobId]`.** `useJobStream(jobId)`: `EventSource` on `/jobs/{id}/events` with reconnect (uses `Last-Event-ID` automatically); on 3 consecutive failures fall back to polling `GET /jobs/{id}` and `GET /jobs/{id}/segments?after_idx=` every 2 s. Shows `ProgressStages` (probing → transcribing → correcting → translating → summarising) with the label from `stage` events, the progress ring, elapsed time, a **live caption ticker** (new segments animate in, colour-coded), warnings as dismissible chips, Cancel button. On `done` → push to `/results/{id}`. Refreshing the page must work (state comes from the API, not only SSE).
> **Results `/results/[jobId]`** (the main workspace; `?t=<sec>` deep-links a timestamp). Left: `VideoPlayer` — YouTube via the IFrame API (`enablejsapi=1`) with time sync + click-to-seek; other embeddable platforms via `embed_url` without sync; platforms without embed show the thumbnail + an "Open original" link; uploads play from a **client-side object URL** (never sent back to the server). Right: tabs.
>  - **Captions:** language toggle (EN / HI / MR / side-by-side), "low-trust only" filter, search. Each cue: timestamp (mono), speaker avatar (only if diarization data exists), text, `ConfidenceBadge` (score + bucket + "heuristic" badge when `scorer=="heuristic"`), **corrected** badge with a word-level diff (`lib/wordDiff.ts`) and a hover card listing the evidence (glossary/video/metadata + scores), `domain_drift` icon, translation trust chip. Active cue follows playback. Inline edit → `PATCH /segments/{id}` `{human_text}`, approve button `{approved:true}`. Keyboard: `j/k` next/prev low-trust cue, `a` approve, `e` edit.
>  - **Summary:** TL;DR card, chapter timeline, key points with clickable timestamp chips and a "grounded 92 %" badge (`grounding_score`), ungrounded points visibly flagged, keywords, method badge (`rag_llm` / `extractive`), regenerate control (style/length), translated summary toggle.
>  - **Ask:** chat-style Q&A with citation chips (seek on click); "not covered" answers rendered as such.
>  - **Export:** format / language / variant / "mark low-trust" selectors → download links to the export endpoint.
>  - **Benchmark:** upload a reference, then bar charts (raw vs corrected vs platform WER), the correction-effect donut, and the trust-vs-error reliability plot; every chart carries its `interpretation` text.
> **Other pages.** `/dashboard`: `GET /stats` cards (jobs, minutes processed, avg trust, % corrected, real-time factor), recent-jobs table with status pills and thumbnails, bucket distribution donut, trust histogram (recharts). `/review`: queue from `GET /review/queue`, keyboard-driven approve/edit, progress bar for the queue. `/library`: semantic search box, result cards with thumbnail, highlighted snippet, "jump to moment" link `/results/{id}?t=…`, empty-state illustration. `/glossary`: table CRUD, domain filter, CSV/JSON import. `/benchmark`: cross-job summary and the offline results from `docs/eval/results.json`. `/settings`: renders `GET /preflight` as a checklist (ok/fail, detail, **copyable fix command**), API base URL, cookie instructions.
> **Quality rules.** Skeleton loaders for every async block; empty states with an illustration and next action; every request has an error state; responsive down to 375 px (results page collapses to stacked player + tabs); semantic HTML, focus rings, ARIA labels on icon buttons, colour-contrast ≥ 4.5:1; components ≤ ~200 lines; no `any` in `lib/`; ESLint + `tsc --noEmit` clean.

**Acceptance checks:**
- `npm run build` finishes with 0 type errors; `npm run lint` clean.
- Paste a YouTube URL → preview card in < 8 s; Start → live segments appear on `/processing/[jobId]` before the job finishes; killing the tab and reopening the URL restores the state.
- Backend stopped → friendly error banner (not a blank page or `alert`).
- Results page: clicking a caption seeks the YouTube player; editing a cue persists after refresh; the export link downloads a valid `.srt`.
- No text on any page contains `Ã`, `à¤`, `â€` sequences (mojibake grep over `frontend/`) or a markdown link inside a `src=`/`href=` value.
- Layout usable at 375 px width; animations disabled under `prefers-reduced-motion`.

---

### STEP 10 — Tests, hardening, latency measurement, docs and demo

**Goal:** prove it works, keep it working, and have honest numbers for the viva.

**Files:** `backend/tests/**`, `backend/scripts/{smoke,bench_rtf,platform_matrix}.py`, `frontend/e2e/*` (optional Playwright), `README.md`, `docs/{ARCHITECTURE,API,DECISIONS,platform_support}.md`.

**Bot prompt:**
> **Backend tests (pytest, no network by default; mark network tests `@pytest.mark.slow`).** Unit: `extract_features` (all keys, empty words, determinism); scorer fallback + schema mismatch; correction guardrails (new number rejected, edit ratio, empty result); fuzzy/phonetic fallback ("cubernetes" → "Kubernetes"); chunking; VTT rolling-caption de-dup; SSRF blocking (`127.0.0.1`, `localhost`, `10.x`, `file:`); yt-dlp error mapper; export cue rules; placeholder round-trip; summary verifier; benchmark maths. Integration with `TestClient`: a fixture generates a 5 s WAV with `numpy`+`wave`; `faster-whisper` and yt-dlp are monkeypatched to return canned data; assert the full lifecycle (`POST /jobs` → SSE events → `done` → segments → summary → export) and cancel/retry/delete/cache behaviour. Import-time test: importing every `app.*` module loads no model and does no network I/O.
> **Smoke script** `scripts/smoke.py --url <video>`: probe → create job → follow SSE → print segments/summary → download SRT; exits non-zero on any failure.
> **Latency measurement (`scripts/bench_rtf.py`)** — record on the real laptop and store in `stats`: real-time factor (processing time ÷ media duration) per Whisper model, time-to-first-caption, and **per-segment post-ASR latency** (features + LightGBM + drift check + deterministic correction). Report these as *measured* p50/p95. Note for the write-up: the "sub-500 ms" target applies to the **post-ASR scoring/correction latency per segment**; captions as a whole are delayed by the window length plus ASR time, and the report must say so honestly.
> **Hardening.** Global exception handler returns the standard error body; request-size limits on uploads; per-IP rate limit on `/url/probe` and `/jobs` (in-memory token bucket); yt-dlp/ffmpeg subprocesses always killed in `finally`; on startup remove stale files in `TMP_DIR`; log line per stage with timing; `GET /health` never touches heavy modules.
> **Docs.** `README.md` (Windows quickstart from section 8, architecture diagram, feature list, honest limitations), `docs/API.md` generated from `/openapi.json`, `docs/DECISIONS.md` finalised, `docs/platform_support.md` filled by `platform_matrix.py`.
> **Frontend checks.** `npm run build`, `npm run lint`, `tsc --noEmit`; optional Playwright flows: (1) paste URL → live captions → results, (2) edit + approve a cue, (3) library search → jump to moment.
> **Demo script** (`docs/DEMO.md`, 5 minutes): 1 short public YouTube video with technical jargon; the same clip through the platform-captions audit; show a green/yellow/red cue, an applied correction with its evidence, a rejected correction, Hindi/Marathi with translation trust, the grounded summary with a flagged claim, the library jump, and the benchmark page.

**Acceptance checks:**
- `pytest -q` green on a clean checkout (`-m "not slow"`), coverage of `app/pipeline`, `app/ml`, `app/rag`, `app/export` ≥ 70 % (`pytest --cov=app`).
- `python scripts/smoke.py --url <short video>` exits 0 and prints an SRT path.
- `docs/platform_support.md` lists only what was actually tested; `docs/eval/results.json` exists.
- No orphan `ffmpeg.exe`/`yt-dlp` processes after a cancelled job; `TMP_DIR` empty after all jobs finish.

---

## 8. RUN & TEST COMMANDS (Windows · PowerShell)

**Prerequisites:** Python 3.11, Node 18+, ffmpeg.
```powershell
winget install Gyan.FFmpeg          # then close and reopen the terminal
ffmpeg -version
```

**Backend**
```powershell
cd D:\DSL\signalpath\backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env               # then edit .env (keys below)
uvicorn app.main:app --reload --port 8000
# optional heavy extras (diarization, IndicTrans2, FAISS):
# pip install -r requirements-extras.txt
# keep yt-dlp fresh — most "video won't download" bugs are fixed by this:
pip install -U yt-dlp
```
Check it: open `http://localhost:8000/docs`, then
```powershell
curl.exe http://localhost:8000/api/v1/health
curl.exe http://localhost:8000/api/v1/preflight
Invoke-RestMethod -Method Post http://localhost:8000/api/v1/url/probe -ContentType "application/json" -Body '{"url":"https://www.youtube.com/watch?v=VIDEO_ID"}'
Invoke-RestMethod -Method Post http://localhost:8000/api/v1/jobs -ContentType "application/json" -Body '{"url":"https://www.youtube.com/watch?v=VIDEO_ID","target_langs":["hi","mr"],"mode":"transcribe","source_lang":"auto","options":{"correct":true,"summarize":true}}'
curl.exe -N http://localhost:8000/api/v1/jobs/JOB_ID/events      # live SSE (use curl.exe; plain `curl` is a PowerShell alias)
curl.exe -o out.srt "http://localhost:8000/api/v1/jobs/JOB_ID/export?format=srt&lang=hi"
```

**Frontend**
```powershell
cd D:\DSL\signalpath\frontend
npm install
copy .env.local.example .env.local   # NEXT_PUBLIC_API_BASE=http://localhost:8000/api/v1
npm run dev                          # http://localhost:3000
npm run build ; npm run lint ; npx tsc --noEmit
```

**Train the trust model (one time, Colab or local)**
Run `notebook/01_train_trust_model.ipynb` → copy `trust_model.joblib` + `feature_schema.json` into `backend\app\ml\artifacts\`. Optionally run `notebook/02_eval_pipeline.ipynb` for the offline metrics and the translation-trust model.

**Tests**
```powershell
cd D:\DSL\signalpath\backend
pytest -q -m "not slow"
pytest --cov=app -q
python scripts\smoke.py --url "https://www.youtube.com/watch?v=VIDEO_ID"
python scripts\bench_rtf.py
python scripts\platform_matrix.py
```

**Keys & config (`backend\.env`)**

| Key | Required? | Where to get it / what it does |
|---|---|---|
| `GEMINI_API_KEY` | Optional (recommended) | Free key from Google AI Studio. Enables LLM correction, translation, summary, Q&A. Without it everything falls back to deterministic methods. |
| `GEMINI_MODEL` | Optional | Defaults to `gemini-2.5-flash`; change here if Google renames/retires it. |
| `HF_TOKEN` | Only for diarization | Hugging Face token + accept the pyannote model terms; also set `DIARIZE=pyannote`. |
| `YTDLP_COOKIES_FILE` / `YTDLP_COOKIES_FROM_BROWSER` | Facebook/Instagram/age-gated | Netscape `cookies.txt` export, or a browser name such as `chrome`. |
| `WHISPER_MODEL` | Optional | `tiny`/`base`/`small`; `base` + `int8` is the CPU-laptop default. |
| `TRANSLATOR` | Optional | `auto` (default), `gemini`, `google`, `indictrans2`. |

---

## 9. SKILL USAGE GUIDE (using Claude skills to improve the frontend and deliverables)

You have Claude skills available in the Claude chat app (this VS Code bot may not have them — use the hand-off prompts below in a Claude chat, attach the relevant files or screenshots, and paste the result back into the repo).

| When | Skill | How to use it |
|---|---|---|
| Frontend looks generic or "template-like" | `frontend-design` | After Step 9 works, attach `globals.css`, `tailwind.config.ts` and 2–3 screenshots. Prompt: *"Use the frontend-design skill. Keep my tokens and component API. Improve typography, spacing rhythm, motion and empty states on the Home and Results pages. Return only changed files."* Ask for one page at a time. |
| A single page needs a big visual upgrade | `frontend-design` | Ask for a new aesthetic direction for **one** page (e.g. Home hero), then port the pattern to others yourself — keeps the design consistent. |
| Viva / demo slides | `pptx` | *"Make a 10-slide deck from `docs/ARCHITECTURE.md` and `docs/eval/results.json`: problem, architecture, trust engine, RAG correction, translation trust, summary grounding, results, limits, demo."* |
| Project report | `docx` or `pdf` | *"Create the DSL project report (Word) from README + ARCHITECTURE + eval results with the figures in `docs/figures/`."* |
| Result tables / cost-latency sheets | `xlsx` | Feed `docs/eval/results.json`; ask for a formatted benchmark workbook. |
| A repeated Claude task of yours | `skill-creator` | Turn your best prompt (e.g. "review my PR against these rules") into a reusable skill. |

Rules for hand-offs: give Claude the **real files** (not descriptions), ask for **minimal diffs**, and re-run `npm run build && npm run lint` after pasting changes back.

---

## 10. ARCHITECTURE SUMMARY (for README / viva)

SignalPath is a caption-trust middleware: a URL or upload is resolved by yt-dlp and streamed through ffmpeg as 16 kHz PCM in 30-second windows (no video is stored), transcribed by faster-whisper with real word-level confidences, and every segment is scored by a **calibrated LightGBM classifier** trained on LibriSpeech/TED-LIUM utterances (with noise/speed augmentation, labels from true WER, identical feature code in training and serving: acoustic confidence, Whisper logprob/no-speech/compression signals, word rarity via `wordfreq`, repetition, glossary hits) plus a **domain-drift** check against a per-video embedding memory. Yellow/red segments go through **RAG correction** — hybrid dense + BM25 retrieval (Reciprocal Rank Fusion) over a domain glossary, video-metadata terms and the video's own high-confidence segments — using a batched LLM or a deterministic fuzzy/phonetic fallback, always behind strict guardrails (edit-ratio, no new numbers/entities, confidence floor). Segments are translated 1-to-1 into Hindi/Marathi with term protection, sense disambiguation and a translation memory, and each translation gets its own trust score (cross-lingual embedding similarity, back-translation agreement, length/script/number checks). The transcript is chunked, chaptered (TextTiling) and summarised by retrieval → MMR → generation → **verification** (each point must be supported by cited chunks), with an extractive fallback and grounded Q&A; a persistent numpy vector index powers cross-video semantic search. Everything streams to a Next.js dashboard over SSE, humans can edit/approve low-trust cues (feeding the translation memory), and benchmarks report real WER/agreement with explicit interpretation. **Problems handled:** ASR errors on jargon and names, unreliable confidence scores, hallucinated corrections/summaries, fake translations, YouTube-only ingestion, disk usage, blocking requests, brittle installs, and dishonest metrics.

---

## 11. DEFINITION OF DONE

- [ ] Steps 1–10 acceptance checks all pass; `docs/DECISIONS.md` lists every choice made.
- [ ] Pasting a YouTube URL works end-to-end (probe → live captions → summary → export) and at least 3 other platforms are tested and recorded in `docs/platform_support.md` (Facebook/Instagram documented with the cookie requirement).
- [ ] No `[HI]`-style placeholders, no hard-coded metrics, no mojibake anywhere (grep tests pass).
- [ ] `notebook/01` and `02` run top-to-bottom; artifacts and `docs/eval/results.json` committed (large artifacts excluded via `.gitignore` if > 50 MB).
- [ ] Works with **no** API keys (deterministic fallbacks) and improves with `GEMINI_API_KEY`.
- [ ] README quickstart works from a clean clone on Windows in under 15 minutes (excluding model downloads).

## END OF PART B
