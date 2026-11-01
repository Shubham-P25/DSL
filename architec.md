# SignalPath: Architecture & Fix Plan (`architec.md`)

> **Audience:** the Antigravity bot that will edit the repo. **Author role:** senior developer review of `DSL-main.zip`.
> **How to use this file:** work top to bottom. Part A explains *why* things break (verified in the code). Part B is the target architecture. Part C is the ordered change list with code. If you only have budget for part of it, do **Part C steps 1-6 first**. They fix bugs 1, 2, 3, 8, 9 and make bug 4 possible.
> **Honesty rule for the whole project:** numbers marked *(target)* are goals to be measured with `scripts/bench_rtf.py`, not results. The repo's `docs/eval/results.json` still says `pending`. Do not present targets as measurements in the demo or the report.

---

## Part A. Diagnosis (what is actually wrong in the current code)

Every item below was found by reading the files in the zip. File names are real.

| # | Your bug | Root cause in code | Fix (see Part C) |
|---|----------|--------------------|------------------|
| 1 | Only English is good | `.env.example` and `config.py` default to Whisper **`base`** with `int8` on CPU. `base` is weak on Hindi/Marathi/Tamil and poor on Kannada/Punjabi. `runner.py` also forces `initial_prompt` (a script sentence) and `condition_on_previous_text=True`, which makes Whisper loop or hallucinate on non-English audio. | C2, C3 |
| 2 | Other languages show nothing | The code only knows **4 languages**. `translate.py`: `if src not in SUPPORTED_LANGUAGES: src = "en"` so a Russian/German/Japanese/Kannada source is silently treated as English. `lang_detect.py` asks Gemini to pick only from en/mr/hi/ta and remaps `ur/ar/fa` to Hindi. `jobs.py` coerces any target outside `{en,hi,mr,ta}` to `en`. `gemini.py` audit has the same 4-name map. The frontend loads **no Noto fonts** (`layout.tsx`, `globals.css`), so CJK/Indic text can render as boxes on some machines. | C1, C9 |
| 3 | `ffmpeg is not installed` | `resolver.to_wav()` shells out to an `ffmpeg` binary. Windows does not have it unless the user runs `winget`. | C4 (no binary needed) |
| 4 | Wrong words must be highlighted with an accuracy value | Scoring is **per segment** (`TrustScorer.score`), and the LightGBM artefact does not exist in the zip, so it falls back to a heuristic. Word probabilities **are stored** (`Segment.words`) but `jobs.py` `SEG_FIELDS` **does not return them**, so the UI cannot highlight a word. `features.py` uses English-only frequency (`[A-Za-z]` regex + `zipf_frequency(..., "en")`), so non-English text gets empty features. The Gemini "audit" overwrites `final_text` with no guard and labels it `verified_by_gemini`, which overstates what was verified. | C5, C6 |
| 5 | Switch caption language later | Translation runs **eagerly for all of en/hi/mr/ta** inside the job, so the job is slow and any one failure hurts the whole job. There is no endpoint to add a language afterwards. | C7 |
| 6 | Any video, many languages | Same as 1 and 2. Whisper itself supports all the languages you listed (en, hi, mr, pa, ta, kn, ru, de, ja, zh); the app code is what restricts them. | C1 |
| 7 | Architecture produces a bunch of errors | Dead and duplicate code: `pipeline/transcribe.py` imports `app.config` (does not exist) and the `openai-whisper` package; `pipeline/ingest/` duplicates `ingest/`. `requirements.txt` installs `pyannote.audio`, `torch`, `transformers`, `faiss-cpu`, `fastembed`, `rank-bm25`, `jellyfish` but **no module imports them** (grep count = 0). That is a multi-GB install and a long cold start for nothing. `runner.py` is one 400-line function that mixes ingest, ASR, scoring, correction, translation and audit, so one failure path touches everything. | C1, C10 |
| 8 | Support YouTube, Instagram, Facebook | One generic yt-dlp path with a YouTube-specific strategy list. No per-platform handling, no per-platform failure messages, cookies shared by hope. | C4 |
| 9 | Too slow | (a) full-quality download, (b) whole file decoded through a subprocess, (c) Whisper `beam_size=5`, `vad_filter=False`, one sequential pass, (d) then **3-4 translation passes x ceil(N/12) Gemini calls** plus an audit pass of ceil(N/15) calls, all serial, (e) `GEMINI_RPM=10` is only a config value: `gemini.py` has no rate limiter, only `sleep` on retry, so you get 429 errors and retries, (f) `translation_cache.json` is **rewritten in full after every batch**. For a 10-minute video (about 150 cues) that is roughly 50 sequential LLM calls *(estimate from the code, not measured)*. | C3, C7, C8 |

**What is already good and must be kept:** `ingest/urls.py` (URL cleaning, SSRF guard), `ingest/ytdlp_opts.py` (cookie-file-wins logic), `core/errors.py` (typed `AppError`), `export/formats.py`, `ocr/`, Clerk auth, the 14 pytest tests, the `Job`/`Segment` tables.

---

## Part B. Target architecture

### B1. Principles (the rules that stop the error pile-up)

1. **One language registry.** No file may hard-code a language list. Everything reads `app/langs/registry.py`.
2. **Small stages with typed inputs/outputs.** `Ingest -> ASR -> Verify -> (Ready) -> Translate(lazy)`. A stage can fail without destroying earlier results.
3. **Degradation ladder, not a crash.** Every stage has an ordered list of strategies. The job records which one worked (`method`) and why others failed (`warnings`).
4. **No ffmpeg binary dependency.** Decode audio with PyAV (already installed by `faster-whisper`). Optional bundled ffmpeg via `imageio-ffmpeg` for yt-dlp edge cases.
5. **Words are first-class.** Store and return per-word `{text, start, end, prob, acc, flags}`.
6. **Honest scoring.** "Accuracy" shown per word is an *estimated confidence* from several signals, not ground truth. The benchmark script produces the real WER numbers.
7. **Lazy and cached.** Translate only what the user asks for, in big batches, cached in SQLite.
8. **No full-video storage.** Download audio only, decode into memory, delete the temp file immediately.

### B2. Pipeline

```
URL / Upload
   |
   v
[1 INGEST]  adapter by host: YouTube | Instagram | Facebook | Generic
   |  ladder: native captions? -> audio-only download -> (YouTube) Gemini-by-URL -> ask for upload
   |  output: MediaResult{ pcm16k: np.float32[], meta, native_captions? }
   v
[2 ASR]     provider ladder: Groq Whisper (if key) -> local faster-whisper (batched) -> Gemini audio
   |  language ID: Whisper detect over 3 sample points, restricted to the registry
   |  script check: output must be mostly in the expected Unicode script, else retry/next provider
   |  output: Segment[] each with Word[] (start, end, prob)
   v
[3 VERIFY]  per-word accuracy from independent signals
   |  S1 whisper word prob      S2 lexicon check (wordfreq where the language exists)
   |  S3 script/garbage check   S4 second-opinion ASR on flagged segments only
   |  S5 LLM audit on flagged words only (optional, batched)
   |  output: Word.acc, Word.flags, Segment.acc, optional Word.alt (suggested fix)
   v
[READY]     job.status = "ready"  -> UI shows captions, highlights, SRT/VTT export
   |
   v
[4 TRANSLATE, lazy]  POST /jobs/{id}/translate {lang}  -> big batches, SQLite cache
```

Stages stream results: after each audio chunk is transcribed and verified it is written to the DB, so the UI shows captions while the rest is still processing.

### B3. Target folder structure

```
backend/app/
  core/            config.py  errors.py  db.py  logging.py        (keep)
  langs/
    registry.py    # NEW: the single source of truth for languages
  ingest/
    base.py        # NEW: PlatformAdapter protocol + MediaResult dataclass
    router.py      # NEW: pick adapter by host
    youtube.py  instagram.py  facebook.py  generic.py              # NEW adapters
    ytdlp_opts.py  urls.py  cookies.py                             # keep / small edits
    audio.py       # NEW: PyAV decode -> float32 16 kHz (replaces to_wav)
  asr/
    base.py        # NEW: ASRProvider protocol
    local_fw.py    # NEW: faster-whisper, batched pipeline
    groq.py        # NEW: optional cloud Whisper (fast)
    gemini_asr.py  # thin wrapper over existing llm/gemini.py methods
    langid.py      # NEW: replaces pipeline/lang_detect.py
    router.py      # NEW: provider ladder + script validation
  verify/
    signals.py  crosscheck.py  llm_audit.py  scorer.py             # NEW
  translate/
    service.py     # NEW: lazy translation + SQLite cache (replaces pipeline/translate.py)
  pipeline/
    orchestrator.py  # NEW: thin stage runner (replaces runner.py)
  api/v1/  jobs.py  translate.py  languages.py  export.py  ocr.py  system.py
  llm/ gemini.py (add rate limiter)  cache.py  prompts.py
  export/ formats.py captions.py                                   # keep
  ocr/ extractor.py                                                # keep

DELETE: pipeline/transcribe.py, pipeline/ingest/ (dupe), pipeline/lang_detect.py (after langid.py),
        pipeline/runner.py (after orchestrator.py), pipeline/translate.py (after translate/service.py),
        and unused deps from requirements.txt (see C10)
```

### B4. Data contracts (do not change these once written)

```python
# app/ingest/base.py
@dataclass
class MediaResult:
    audio: "np.ndarray | None"          # float32 mono 16 kHz, None if only captions were found
    duration: float | None
    title: str | None
    uploader: str | None
    thumbnail: str | None
    platform: str                        # "youtube" | "instagram" | "facebook" | "other" | "upload"
    video_id: str | None
    native_captions: list[dict] | None   # [{start,end,text}] if the platform already has them
    native_caption_kind: str | None      # "manual" | "auto" | None
    method: str                          # which ladder step worked
    warnings: list[str]

# app/asr/base.py
@dataclass
class Word:
    text: str; start: float; end: float
    prob: float | None = None            # engine probability, 0..1
    acc: float | None = None             # filled by verify: estimated accuracy 0..1
    flags: list[str] = field(default_factory=list)   # "low_prob","lexicon_miss","wrong_script","asr_disagree","llm_suspect"
    alt: str | None = None               # suggested replacement, never auto-applied

@dataclass
class Seg:
    start: float; end: float; text: str
    words: list[Word]
    lang: str
    avg_logprob: float | None = None
    no_speech_prob: float | None = None
    compression_ratio: float | None = None
    acc: float | None = None             # segment accuracy = f(word acc)
```

API shape for the UI (add `words` and `acc`, which are missing today):

```json
{
  "id": 12, "idx": 11, "start": 41.2, "end": 44.9,
  "text": "आज हम नया प्रोजेक्ट दिखाएँगे",
  "acc": 0.78,
  "words": [
    {"t": "आज", "s": 41.2, "e": 41.5, "p": 0.97, "acc": 0.96, "f": []},
    {"t": "प्रोजेक्ट", "s": 42.9, "e": 43.6, "p": 0.41, "acc": 0.52, "f": ["low_prob","asr_disagree"], "alt": "प्रोजेक्ट्स"}
  ],
  "translations": {"en": "Today we will show a new project"}
}
```

### B5. Language registry (single source of truth)

`app/langs/registry.py` holds one dict. Required fields per language: `code`, `name`, `native`, `script` (Unicode regex for the script check), `whisper` (Whisper code), `mt` (translation code), `wordfreq` (code or `None`), `tokenize` (`"space"` or `"char"`), `font` (CSS family).

Minimum set (your list): `en hi mr pa ta kn ru de ja zh`. Add `bn te gu ml ur es fr ar ko` for free, since Whisper supports them. Rules:

- `zh` and `ja` use `tokenize="char"` (no spaces). Accuracy for them uses CER (character error rate) in the benchmark, not WER.
- If `wordfreq` has no list for a language (or its tokenizer extra is not installed), set `wordfreq=None`. The lexicon signal is then **skipped for that language**, never treated as an error. Check with `wordfreq.available_languages()` at startup and log it.
- `GET /api/v1/languages` returns the registry so the frontend never keeps its own list.

---

## Part C. Ordered change list (do in this order)

Each step says **what to change**, **why**, and gives code. After each step run `pytest -q` and `python scripts/smoke.py`. Do not start step N+1 if step N breaks the tests.

### C1. Language registry (fixes bugs 2, 6, part of 7)

Create `app/langs/registry.py`:

```python
"""Single source of truth for languages. No other file may hard-code a language list."""
import re, unicodedata
from dataclasses import dataclass

@dataclass(frozen=True)
class Lang:
    code: str; name: str; native: str
    script_re: str          # regex matching ONE character of the expected script
    whisper: str            # Whisper language code
    mt: str                 # machine-translation code
    wordfreq: str | None    # wordfreq code, None = lexicon signal unavailable
    tokenize: str = "space" # "space" | "char"
    font: str = "Noto Sans"

_LAT, _DEV = r"[A-Za-z\u00C0-\u024F]", r"[\u0900-\u097F]"
LANGS: dict[str, Lang] = {l.code: l for l in [
    Lang("en", "English",  "English",   _LAT, "en", "en", "en"),
    Lang("hi", "Hindi",    "हिन्दी",      _DEV, "hi", "hi", "hi"),
    Lang("mr", "Marathi",  "मराठी",      _DEV, "mr", "mr", None),   # set after checking wordfreq.available_languages()
    Lang("pa", "Punjabi",  "ਪੰਜਾਬੀ",     r"[\u0A00-\u0A7F]", "pa", "pa", None, font="Noto Sans Gurmukhi"),
    Lang("ta", "Tamil",    "தமிழ்",       r"[\u0B80-\u0BFF]", "ta", "ta", None, font="Noto Sans Tamil"),
    Lang("kn", "Kannada",  "ಕನ್ನಡ",       r"[\u0C80-\u0CFF]", "kn", "kn", None, font="Noto Sans Kannada"),
    Lang("ru", "Russian",  "Русский",   r"[\u0400-\u04FF]", "ru", "ru", "ru"),
    Lang("de", "German",   "Deutsch",   _LAT, "de", "de", "de"),
    Lang("ja", "Japanese", "日本語",      r"[\u3040-\u30FF\u4E00-\u9FFF]", "ja", "ja", "ja", "char", "Noto Sans JP"),
    Lang("zh", "Chinese",  "中文",        r"[\u4E00-\u9FFF]", "zh", "zh-CN", "zh", "char", "Noto Sans SC"),
    # free extras Whisper already supports: add bn te gu ml ur es fr ar ko the same way
]}

def get(code: str) -> Lang:
    return LANGS[code]          # raise KeyError loudly; never silently fall back to "en"

def script_ratio(text: str, code: str) -> float:
    """Share of letters (incl. combining marks) that belong to the expected script. 1.0 if no letters."""
    pat = re.compile(LANGS[code].script_re)
    letters = [c for c in text if unicodedata.category(c)[0] in "LM"]
    return sum(bool(pat.match(c)) for c in letters) / len(letters) if letters else 1.0
```

Then:
- Replace **every** hard-coded list: `CORE_LANGUAGES` in `runner.py`, `SUPPORTED_LANGUAGES` in `translate.py`, `{"en","hi","mr","ta"}` in `jobs.py` (two places), `lang_names` in `gemini.py`, and the 4-language prompts in `lang_detect.py`. Use `LANGS` instead.
- Delete the line `if src not in SUPPORTED_LANGUAGES: src = "en"`. Unknown source language must raise `AppError("LANG_UNSUPPORTED", ...)`, never become English.
- Add `api/v1/languages.py`: `GET /languages` returns `[{code,name,native,font,tokenize}]`.
- Add a test `tests/test_no_hardcoded_langs.py` that greps `app/` for the pattern `"mr", "ta"` / `'mr','ta'` and fails if found outside `langs/registry.py`.

### C2. Config and model choice (fixes bug 1)

Edit `core/config.py` and `.env.example`:

```ini
ASR_PROVIDER=auto          # auto | groq | local | gemini
WHISPER_MODEL=small        # CPU laptop: small. GPU or 16 GB RAM: large-v3-turbo
WHISPER_COMPUTE=int8
WHISPER_DEVICE=cpu
ASR_BATCH=8
BEAM_SIZE=2
CPU_THREADS=0              # 0 = let the library decide
GROQ_API_KEY=
GROQ_MODEL=whisper-large-v3-turbo
GEMINI_RPM=10              # set to your real quota
MAX_CROSSCHECK_SEGS=40
MAX_VIDEO_MINUTES=60
YTDLP_COOKIES_FILE=cookies.txt
```

Add matching fields to `Settings` (`asr_provider`, `asr_batch`, `beam_size`, `cpu_threads`, `groq_api_key`, `groq_model`, `max_crosscheck_segs`). Default `whisper_model` changes from `base` to `small`.

Note: `small` int8 is clearly better than `base` on Indic languages but still weaker than `large-v3`. For the demo, the best quality/speed comes from the cloud provider (C3b). Do not promise specific accuracy numbers until `scripts/lang_matrix.py` (C11) has produced them.

### C3. ASR layer (fixes bugs 1, 6, 9)

**C3a. Local faster-whisper, batched.** Create `app/asr/local_fw.py`:

```python
from faster_whisper import WhisperModel, BatchedInferencePipeline
from app.core.config import settings
from app.asr.base import Seg, Word

_model = _batched = None

def _load():
    global _model, _batched
    if _model is None:
        _model = WhisperModel(settings.whisper_model, device=settings.whisper_device,
                              compute_type=settings.whisper_compute, cpu_threads=settings.cpu_threads)
        _batched = BatchedInferencePipeline(model=_model)     # needs faster-whisper >= 1.1
    return _model, _batched

def transcribe(audio, lang, on_seg, cancel):
    _, batched = _load()
    gen, info = batched.transcribe(
        audio, language=lang, batch_size=settings.asr_batch, beam_size=settings.beam_size,
        word_timestamps=True)               # batched mode applies VAD chunking itself
    total = max(len(audio) / 16000, 1.0)
    for s in gen:
        if cancel.is_set(): raise InterruptedError
        words = [Word(w.word.strip(), float(w.start), float(w.end), float(w.probability)) for w in (s.words or [])]
        on_seg(Seg(float(s.start), float(s.end), s.text.strip(), words, lang,
                   float(s.avg_logprob), float(s.no_speech_prob), float(s.compression_ratio)), float(s.end) / total)
```

Rules that replace the old behaviour in `runner.py`:
- **Remove** `initial_prompt=get_initial_prompt(...)` and `condition_on_previous_text=True`. They cause loops and hallucinations on non-English audio. Script correctness is enforced by the script check below, not by prompting.
- Keep the model object loaded once per process (already done with `_model`). Warm it at startup in `main.py` with a 1-second silent array so the first user does not pay the load time.

**C3b. Optional cloud Whisper (fast).** Create `app/asr/groq.py`. It uses the OpenAI-compatible endpoint, so `httpx` is enough:

```python
import io, wave, httpx, numpy as np
URL = "https://api.groq.com/openai/v1/audio/transcriptions"
CHUNK_S = 480                       # keep each upload well under the provider's file-size limit; verify current limits

def _wav_bytes(x: np.ndarray) -> bytes:
    b = io.BytesIO()
    with wave.open(b, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(16000)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype("<i2").tobytes())
    return b.getvalue()

def transcribe(audio, lang, on_seg, cancel):
    for off in range(0, len(audio), CHUNK_S * 16000):
        if cancel.is_set(): raise InterruptedError
        base = off / 16000
        r = httpx.post(URL, headers={"Authorization": f"Bearer {settings.groq_api_key}"},
            files={"file": ("a.wav", _wav_bytes(audio[off: off + CHUNK_S * 16000]), "audio/wav")},
            data={"model": settings.groq_model, "language": lang, "response_format": "verbose_json",
                  "timestamp_granularities[]": ["word", "segment"], "temperature": 0}, timeout=180)
        r.raise_for_status()
        j = r.json()
        words = [Word(w["word"].strip(), base + w["start"], base + w["end"], None) for w in j.get("words", [])]
        for s in j["segments"]:
            ws = [w for w in words if s["start"] + base - 0.05 <= w.start <= s["end"] + base + 0.05]
            on_seg(Seg(base + s["start"], base + s["end"], s["text"].strip(), ws, lang,
                       s.get("avg_logprob"), s.get("no_speech_prob"), s.get("compression_ratio")), None)
```

Notes: the cloud engine returns **no word probabilities**, so verify (C5) must renormalize its weights when `prob is None`. Cloud ASR sends the audio to a third party. Keep `ASR_PROVIDER=local` as a privacy mode and say so in the UI.

**C3c. Language ID (replaces `pipeline/lang_detect.py`).** Create `app/asr/langid.py`:

```python
from app.langs.registry import LANGS

def detect(model, audio, forced: str | None):
    if forced and forced != "auto":
        return forced, 1.0, []
    allowed, votes = set(LANGS), {}
    n, win = len(audio), 30 * 16000
    for frac in (0.2, 0.5, 0.8):                         # three probes, not just the start
        clip = audio[int(n * frac): int(n * frac) + win]
        if len(clip) < 3 * 16000: continue
        _, _, probs = model.detect_language(clip)       # [(code, prob), ...]
        for code, p in probs:
            if code == "ur" and "ur" not in allowed: code = "hi"    # Hindustani speech often reads as Urdu
            if code in allowed: votes[code] = votes.get(code, 0.0) + p
    if not votes: return "en", 0.0, ["Language could not be detected; defaulted to English."]
    total = sum(votes.values()); ranked = sorted(votes.items(), key=lambda kv: -kv[1])
    best, conf = ranked[0][0], ranked[0][1] / total
    warn = [f"Language uncertain: {ranked[0][0]} vs {ranked[1][0]}. Re-run with the language selected."] if conf < 0.6 and len(ranked) > 1 else []
    return best, conf, warn
```

Delete the title-keyword table (`INDIC_HINTS`). It matches **substrings** ("thala" matches "thalassemia", "desh" matches "bangladesh", "kedar", "cinema", "pune"), so it misdetects languages. If you want a metadata hint, use only the Unicode script of the title and only as a tie-breaker when `conf < 0.5`.

**C3d. Provider ladder + script check.** Create `app/asr/router.py`:

```python
def run_asr(media, lang_choice, on_seg, cancel, warnings):
    model, _ = local_fw._load() if settings.asr_provider in ("auto", "local") else (None, None)
    lang, conf, w = langid.detect(model, media.audio, lang_choice) if model else (lang_choice if lang_choice != "auto" else "en", 1.0, [])
    warnings += w
    ladder = []
    if settings.asr_provider in ("auto", "groq") and settings.groq_api_key: ladder.append(("groq", groq.transcribe))
    if settings.asr_provider in ("auto", "local"):                          ladder.append(("local", local_fw.transcribe))
    if settings.asr_provider in ("auto", "gemini") and gemini_ok():         ladder.append(("gemini", gemini_asr.transcribe))
    last = None
    for name, fn in ladder:
        got = []
        try:
            fn(media.audio, lang, lambda s, p=None: got.append(s), cancel)
        except Exception as exc:
            warnings.append(f"ASR '{name}' failed: {str(exc)[:100]}"); last = exc; continue
        text = " ".join(s.text for s in got)
        if got and script_ratio(text, lang) >= 0.7:                          # output must be in the expected script
            return lang, name, got
        warnings.append(f"ASR '{name}' output did not match the {lang} script; trying next provider.")
    raise AppError("NO_SPEECH", "No usable speech was found.", "Pick the spoken language manually or upload the file.", 422)
```

(Stream segments to the DB through `on_seg` in the real implementation. The list here is for clarity. If streaming, run the script check on the first ~10 segments and abort early on mismatch.)

### C4. Ingest: adapters, no ffmpeg binary (fixes bugs 3, 8 and part of 9)

**C4a. Kill the ffmpeg error.** Create `app/ingest/audio.py`:

```python
import shutil
from faster_whisper.audio import decode_audio      # uses PyAV, which ships with faster-whisper; no ffmpeg binary needed

def load_audio(path) -> "np.ndarray":
    return decode_audio(str(path), sampling_rate=16000)   # float32 mono; works on mp4/m4a/webm/opus

def ffmpeg_path() -> str | None:
    p = shutil.which("ffmpeg")
    if p: return p
    try:
        import imageio_ffmpeg; return imageio_ffmpeg.get_ffmpeg_exe()   # bundled binary, installed by pip
    except Exception:
        return None
```

- Delete `to_wav()` and the `.wav` temp file. Decode into memory, then `Path(src).unlink()` in a `finally`.
- In `ytdlp_opts.base_opts()` add `ffmpeg_location` when `ffmpeg_path()` is not `None`.
- Add `imageio-ffmpeg` to `requirements.txt`.
- Keep `AppError("FFMPEG_MISSING")` only for the rare case where PyAV cannot decode a file.

**C4b. Download less.** In the yt-dlp options use an audio-only, low-bitrate selector. This skips the video stream and needs no merging:

```python
FORMAT = "bestaudio[abr<=64]/worstaudio/bestaudio/worst"
```

Remove the `best[height<=720]/best/bestvideo+bestaudio` tail (it downloads video, which is the slow and storage-heavy path). For Instagram/Facebook some posts expose only a muxed mp4; the final `worst` handles that and PyAV extracts the audio.

**C4c. Adapter pattern.** Create `app/ingest/base.py` with the `MediaResult` dataclass from B4 and:

```python
class PlatformAdapter(Protocol):
    name: str
    def match(self, url: str) -> bool: ...
    def fetch(self, url: str, cancel) -> MediaResult: ...
```

`router.py` picks the adapter by host: `youtube.com`, `youtu.be`, `youtube-nocookie.com` -> YouTube; `instagram.com` -> Instagram; `facebook.com`, `fb.watch`, `fb.com`, `m.facebook.com` -> Facebook; anything else -> Generic (yt-dlp supports many sites).

Ladders (stop at the first success, record `method`, append every failure to `warnings`):

| Platform | Step 1 | Step 2 | Step 3 | Step 4 |
|----------|--------|--------|--------|--------|
| YouTube | Native captions via yt-dlp subs / `youtube-transcript-api` (no audio needed; **manual** captions are used directly, **auto** captions are kept only as a free second opinion for C6) | Audio-only download, existing client ladder (`tv/web_safari`, `mweb`, `android_vr`, `ios`) | Gemini by URL (existing `transcribe_youtube_url`) | Ask for upload |
| Instagram | Audio-only download without cookies | Same with `cookies.txt` | none | Ask for upload |
| Facebook | Audio-only download without cookies | Same with `cookies.txt` | none | Ask for upload |
| Generic | Audio-only download | with cookies | none | Ask for upload |

Bot-check error ("Sign in to confirm you're not a bot") on YouTube:
1. Prefer `cookies.txt` (Netscape format, exported once from a logged-in browser). `cookiesfrombrowser` commonly fails on Windows Chrome because the cookie store is locked or encrypted, so do not rely on it.
2. Run `pip install -U yt-dlp` first. Client names drift.
3. Install Node.js or Deno; `ytdlp_opts._js_runtimes()` already uses it if present.
4. Native captions (step 1) avoid the audio request completely, which is why they come first.

Be honest in the UI about Instagram and Facebook: public posts and Reels often work, but login-walled, private, or rate-limited posts need a cookie file and can still fail because those platforms change often. The guaranteed path on every platform is **Upload**. Add a platform-specific hint to `classify()` so the error message says "Instagram asked for login: add cookies.txt or upload the file". Put `cookies.txt` in `.gitignore`; it grants access to your account. Only process videos you are allowed to caption.

**C4d. Duration guard first.** Call `extract_info(download=False)` and enforce `MAX_VIDEO_MINUTES` and the live-stream guard **before** downloading (the existing `_guard` does this; keep it).

### C5. Word-level verification engine (fixes bug 4)

Create `app/verify/signals.py`. Each signal returns a value in `[0,1]` or `None` when it cannot be computed. `None` means "skip this signal", not "bad".

```python
from wordfreq import zipf_frequency
from app.langs.registry import LANGS, script_ratio

def s_prob(w):    return w.prob                                  # engine probability, None for cloud ASR
def s_script(w, lang): return 1.0 if script_ratio(w.text, lang) >= 0.7 else 0.0
def s_lexicon(w, lang, glossary: set[str]):
    cfg = LANGS[lang]
    token = w.text.strip(" .,!?;:\"'()[]").lower()
    if not token or token.isdigit(): return None
    if token in glossary: return 1.0
    if not cfg.wordfreq: return None                             # no lexicon for this language: skip
    return min(zipf_frequency(token, cfg.wordfreq) / 4.0, 1.0)   # zipf >= 4 counts as a common word
```

Create `app/verify/scorer.py`:

```python
WEIGHTS = {"prob": 0.45, "lex": 0.15, "agree": 0.30, "script": 0.10}   # starting values; tune on the eval set

def word_accuracy(sig: dict) -> float:
    avail = {k: v for k, v in sig.items() if v is not None}
    if not avail: return 0.5
    acc = sum(WEIGHTS[k] * v for k, v in avail.items()) / sum(WEIGHTS[k] for k in avail)   # renormalize
    if sig.get("script") == 0: acc = min(acc, 0.30)
    if sig.get("agree") == 0:  acc = min(acc, 0.60)
    return round(acc, 3)

def flags(sig):  # human-readable reasons shown in the tooltip
    f = []
    if sig.get("prob") is not None and sig["prob"] < 0.5: f.append("low_prob")
    if sig.get("lex") is not None and sig["lex"] < 0.25:  f.append("lexicon_miss")
    if sig.get("script") == 0: f.append("wrong_script")
    if sig.get("agree") == 0:  f.append("asr_disagree")
    return f

def bucket(acc): return "green" if acc >= 0.80 else "yellow" if acc >= 0.55 else "red"

def segment_accuracy(words):
    a = [w.acc for w in words if w.acc is not None]
    return round(0.7 * (sum(a) / len(a)) + 0.3 * min(a), 3) if a else None

def hallucination_risk(seg):   # whole-segment guard for classic Whisper failures
    return ((seg.compression_ratio or 0) > 2.4
            or ((seg.no_speech_prob or 0) > 0.6 and (seg.avg_logprob or 0) < -1.0)
            or repeated_ngram(seg.text, n=3, times=3))
```

If `hallucination_risk(seg)` is true, cap every word's `acc` at 0.40 and add the flag `hallucination_risk`.

Why a lexicon miss alone never turns a word red: names, brands and jargon are valid but rare. With the default weights a lexicon miss lowers accuracy but cannot push a word with high ASR probability below 0.55. The glossary files in `data/glossaries/` count as known words.

### C6. Second opinion and LLM audit, only where needed (fixes bug 4, protects bug 9)

Only segments whose first-pass accuracy is below 0.80 get extra checks. This is how "brutal testing" stays fast.

**C6a. Cross-check (`verify/crosscheck.py`).**

```python
from difflib import SequenceMatcher
from rapidfuzz.fuzz import ratio

def norm(t): return t.strip(" .,!?;:\"'()[]").lower()

def align(words, other_tokens):
    a = [norm(w.text) for w in words]; b = [norm(t) for t in other_tokens]
    agree = [None] * len(a)
    for tag, i1, i2, j1, j2 in SequenceMatcher(a=a, b=b, autojunk=False).get_opcodes():
        for k in range(i1, i2):
            if tag == "equal": agree[k] = 1.0
            elif tag == "replace":
                cand = b[j1 + min(k - i1, j2 - j1 - 1)]
                agree[k] = 1.0 if ratio(a[k], cand) >= 85 else 0.0
                if agree[k] == 0.0 and (j2 - j1) == (i2 - i1): words[k].alt = other_tokens[j1 + k - i1]
            else: agree[k] = 0.0     # "delete": the other engine heard nothing here
    return agree
```

Second-opinion sources, in order: (1) YouTube **auto** captions that overlap the segment (free, already fetched in C4); (2) Groq on the audio slice `[start-1s, end+1s]` if a key exists; (3) Gemini audio on the same slice. Process at most `MAX_CROSSCHECK_SEGS` segments, worst first. For `ja`/`zh` use `tokenize="char"` and compare characters. Disagreement does not prove which engine is right; it only marks the word as risky, and `alt` is a suggestion.

**C6b. LLM audit (`verify/llm_audit.py`), flagged words only.** Replace `GeminiClient.audit_and_verify_captions` (which rewrites every cue and marks it verified) with:

```python
PROMPT = """You review speech-to-text output in {lang_name}. For each item decide if the target word is
probably a mis-hearing given its context. Return JSON only: [{{"id":0,"suspect":true,"suggestion":"...","reason":"..."}}].
Suggest a replacement only if you are confident; otherwise suggestion = null. Never rewrite the sentence."""
# items = [{"id": n, "before": "3 words", "word": "...", "after": "3 words"}], up to 60 per call
```

Rules: never auto-apply a suggestion. Store it as `Word.alt` with flag `llm_suspect`. The UI lets the user accept it (a PATCH on the segment text). Accepting reuses the existing `_guard()` in `correct.py` (similarity, numbers, new proper nouns). Label the output "suggested", not "verified".

**C6c. Verify stage entry (`verify/__init__.py`).**

```python
def run_verify(media, lang, segs, on_progress, warnings):
    glossary = load_glossary_terms()                       # data/glossaries/*.json
    for s in segs:                                         # pass 1: cheap local signals
        for w in s.words:
            sig = {"prob": s_prob(w), "lex": s_lexicon(w, lang, glossary), "script": s_script(w, lang), "agree": None}
            w.acc, w.flags = word_accuracy(sig), flags(sig); w._sig = sig
        if hallucination_risk(s): cap_segment(s)
        s.acc = segment_accuracy(s.words)
    risky = sorted([s for s in segs if (s.acc or 1) < 0.80], key=lambda s: s.acc)[: settings.max_crosscheck_segs]
    for s in risky:                                        # pass 2: second opinion
        other = second_opinion(media, s, lang)
        if other: apply_agree(s, align(s.words, tokens(other, lang)))
    run_llm_audit([s for s in risky if (s.acc or 1) < 0.70], lang)    # pass 3: LLM, batched, optional
```

Any exception in pass 2 or 3 must be caught: add a warning and continue. **Captions are delivered even if verification partly fails.**

### C7. Lazy translation (fixes bugs 5, 9)

Create `app/translate/service.py` and delete `pipeline/translate.py`.

- Endpoint `POST /api/v1/jobs/{id}/translate` with `{"lang": "hi"}` returns 202 and runs on the job pool. `GET /jobs/{id}` includes `translations_ready: ["en","hi"]`. The UI polls this.
- Source text is `final_text or text`. Target is any code in the registry. If `src == tgt` return the original. Unknown codes raise `LANG_UNSUPPORTED`.
- **Batch 40 cues per LLM call** with 3 cues of context before and after (not 12 per call). Ask for JSON `[{id, translation}]`. On a missing id, translate that one cue with `deep-translator` (record `engine`).
- Cache in SQLite, not a JSON file:

```python
class TranslationCache(SQLModel, table=True):
    key: str = Field(primary_key=True)        # sha256(f"{src}|{tgt}|{engine}|{text}")
    text: str
    created_at: datetime
```

- Store the result in `Segment.translations[lang] = {"text":..., "engine":"gemini"|"google", "verified": False}`.
- The job's own primary target language is translated **after** the job is marked done, not before. The user sees captions immediately; the translation fills in.
- Prompt rules to keep (they are good): translate meaning, no phonetic transliteration, keep proper nouns, keep numbers.
- Rate limiting is mandatory (C8).

### C8. Rate limiter and orchestrator (fixes bugs 7, 9)

**Gemini limiter** in `llm/gemini.py`:

```python
import threading, time
class _Limiter:
    def __init__(self, rpm): self.gap, self.next, self.lock = 60.0 / max(rpm, 1), 0.0, threading.Lock()
    def wait(self):
        with self.lock:
            now = time.monotonic(); delay = max(0.0, self.next - now); self.next = max(now, self.next) + self.gap
        if delay: time.sleep(delay)
_limiter = _Limiter(settings.gemini_rpm)
# call _limiter.wait() at the top of generate_json / generate_text / transcribe_* ; on HTTP 429 back off 2,4,8 s then rotate key (already implemented)
```

**Orchestrator** `pipeline/orchestrator.py` replaces `runner.py`. It must stay small (about 120 lines) and only call stages:

```python
def run_job(job_id, upload_path=None):
    cancel = cancel_event(job_id); warnings = []
    try:
        set_stage(job_id, "fetching_audio", 3)
        media = ingest.fetch(job, upload_path, cancel, progress=lambda p: set_progress(job_id, 3 + p * 0.17))
        save_meta(job_id, media)
        set_stage(job_id, "transcribing", 20)
        if media.native_captions and media.native_caption_kind == "manual" and prefer_native:
            lang, method, segs = from_native(media)             # fast path, still verified below
        else:
            lang, method, segs = asr.run_asr(media, job.source_lang, persist_segment, cancel, warnings)
        save_lang_method(job_id, lang, method)
        set_stage(job_id, "verifying", 80)
        try:    verify.run_verify(media, lang, segs, lambda p: set_progress(job_id, 80 + p * 0.18), warnings)
        except Exception as exc: warnings.append(f"Verification partly skipped: {str(exc)[:100]}")
        persist_words(job_id, segs)
        finish(job_id, warnings)                                 # status="done"
        translate.enqueue(job_id, job.target_lang)               # lazy: after done
    except AppError as e:   fail(job_id, e, warnings)
    except Exception as e:  fail(job_id, AppError("INTERNAL", "Something went wrong.", str(e)[:200]), warnings)
    finally:                cleanup(job_id, upload_path)
```

Keep status values (`queued/running/done/error/cancelled`) so the current frontend does not break.

Other speed points:
- Cache by `(platform, video_id, asr_provider, whisper_model, lang)` in addition to the per-user cache, so a second user pasting the same video gets instant captions.
- Warm the model at startup.
- Set `JOB_WORKERS=1` on a laptop (two local Whisper jobs in parallel are slower than one at a time).
- Remove the full "audit all cues" Gemini pass (C6b replaces it).

**Targets to measure** *(targets, not results)*: on a 10-minute video, ingest under 15 s; ASR with the cloud provider under 30 s, local `small` int8 on CPU a few minutes (use `scripts/bench_rtf.py` to measure the real-time factor); verify under 15 s; total LLM calls for a first view about 0-6 instead of roughly 50.
