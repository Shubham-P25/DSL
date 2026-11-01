# SignalPath API

The running FastAPI application is the source of truth for the OpenAPI document at `/openapi.json`.

Core routes are grouped under `/api/v1`:

- `GET /health`, `GET /preflight`, `POST /url/probe`
- `POST /jobs`, `GET /jobs`, `GET /jobs/{id}`, `GET /jobs/{id}/segments`
- `GET /jobs/{id}/events`, `POST /jobs/{id}/cancel`, `POST /jobs/{id}/retry`, `DELETE /jobs/{id}`
- `GET /jobs/{id}/summary`, `POST /jobs/{id}/summary/regenerate`, `POST /jobs/{id}/ask`
- `GET /jobs/{id}/export`
- `GET /library/search`, `GET /library/videos`
- `GET /review/queue`, `PATCH /review/{segment_id}`, `PATCH /segments/{segment_id}`
- `GET /glossary`, `GET /stats`, `POST /benchmark/jobs/{id}/reference`

Errors use `{ "error": { "code", "message", "hint", "retryable" } }`.

