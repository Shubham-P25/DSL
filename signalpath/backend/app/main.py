import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1 import jobs, system, ocr, languages
from app.core.config import settings
from app.core.db import init_db
from app.core.errors import AppError, app_error_handler, unhandled_error_handler
from app.core.logging import configure_logging


@asynccontextmanager
async def lifespan(_: FastAPI):
    configure_logging()
    settings.ensure_directories()
    init_db()
    if settings.asr_provider in ("auto", "local"):
        try:
            from app.asr.local_fw import warmup
            warmup()
        except Exception as exc:
            logging.getLogger(__name__).debug("Whisper warmup skipped: %s", exc)
    logging.getLogger(__name__).info("SignalPath started: %s", settings.model_dump_for_log())
    yield


def create_app() -> FastAPI:
    app = FastAPI(title="SignalPath API", version="4.0.0", lifespan=lifespan)
    app.add_exception_handler(AppError, app_error_handler)
    app.add_exception_handler(Exception, unhandled_error_handler)
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
        allow_origins=list(settings.cors_origins) + ["http://localhost:3001", "http://127.0.0.1:3001", "http://localhost:3000", "http://127.0.0.1:3000"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(system.router, prefix=settings.api_prefix)
    app.include_router(jobs.router, prefix=settings.api_prefix)
    app.include_router(languages.router, prefix=settings.api_prefix)
    app.include_router(ocr.router, prefix=settings.api_prefix)
    return app


app = create_app()
