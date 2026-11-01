# SignalPath decisions

- The new API is mounted under `/api/v1`; legacy routes remain available only where they do not conflict with the new contract.
- SQLite paths are resolved from the backend directory so the application can be started from either the repository root or `backend/`.
- Optional model and LLM dependencies are imported lazily. A missing optional dependency produces a preflight warning or a typed application error rather than an import-time crash.
- Long-running work is submitted to a thread pool. The initial implementation keeps orchestration intentionally small so ingestion, ASR, correction, and summary stages can be added without coupling them to HTTP handlers.
- Part B translation uses verified translation-memory reuse first and deep-translator as the no-key engine tier; unavailable engines leave the translation null and emit a warning rather than inventing text.
- Exported translated captions are not silently replaced with English when a translation is missing; the API returns `NOT_READY`.
- The summary fallback is extractive and stores verbatim transcript sentences with grounding score 1.0. LLM summaries are not claimed until a verifier is added around the generated citations.
- Translation captions are split by character proportion because translated word timestamps do not exist; this is documented as an approximation.
