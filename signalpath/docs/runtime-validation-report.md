# Runtime Validation Report

**Generated:** 2026-09-30
**Target:** `D:\DSL\signalpath`

## Verdict

```yaml
environment:
  docker: UNAVAILABLE — docker info reports that the daemon is not responding
  node: AVAILABLE — v22.18.0
  playwright: UNVERIFIED — no Playwright project or browser install was attempted
  infra-tier: FALLBACK(embedded/in-memory) — Docker daemon unavailable
  browser-tier: UNVERIFIED — Next.js dependencies are incomplete
startup: PASS — uvicorn app.main:app; GET /api/v1/health returned 200
integration: UNVERIFIED — exit_code: 1; pytest is not installed in backend/env
e2e: UNVERIFIED — frontend next binary is absent
overall: NEEDS_SIGNOFF — backend starts and health/preflight work, but full pipeline validation is blocked by missing dependencies and unimplemented evaluation assets
```

## Checks performed

- Backend compilation: PASS.
- Backend startup: PASS.
- `GET /api/v1/health`: PASS.
- `GET /api/v1/preflight`: PASS; ffmpeg and yt-dlp available, faster-whisper unavailable.
- `POST /api/v1/url/probe` private-address rejection: PASS.
- Frontend `npm test`: NOT RUN; the project now invokes Playwright and requires the user-installed frontend dependencies/browser.
- Frontend production build: NOT RUN; `next` is absent from `node_modules/.bin`.

## Known gaps

- Install the backend requirements before running pytest or real ASR/translation/embedding flows.
- `docs/platform_support.md` contains no real platform results yet; only tested URLs may be added.
- Notebook 01/02, benchmark/latency scripts, and Playwright flows are present but require the user-installed packages and real inputs.
- Full frontend type/build validation remains pending until frontend dependencies are installed.
