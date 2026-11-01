# SignalPath implementation architecture

SignalPath is split into a Next.js frontend and a FastAPI backend. The backend owns URL probing, media acquisition, platform-caption fallback, transcription, correction, trust scoring, translation, summaries, exports, caching, and SQLite persistence. The frontend consumes `/api/v1` and polls job state until the backend exposes an SSE-compatible event stream.

The processing path is intentionally staged:

`probe → acquire → transcribe/caption fallback → normalize → correct → trust score → translate → summary → persist/export`

Retrieval is layered: glossary and translation-memory lookup are combined with video-memory and library retrieval. Embedding providers are lazy-loaded, so missing optional model packages produce a clear preflight/model error instead of breaking API startup.

Evaluation is kept separate from production execution. `notebook/02_eval_pipeline.ipynb` and `backend/scripts/bench_rtf.py` consume real supplied inputs and report pending/unknown values when those inputs or optional packages are unavailable.
