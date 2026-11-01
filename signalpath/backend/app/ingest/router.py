"""Ingest router: selects platform adapter by URL host or handles direct uploads."""
import logging
from pathlib import Path
from app.core.config import settings
from app.core.errors import AppError
from app.ingest.audio import load_audio
from app.ingest.base import MediaResult, PlatformAdapter
from app.ingest.facebook import FacebookAdapter
from app.ingest.generic import GenericAdapter
from app.ingest.instagram import InstagramAdapter
from app.ingest.youtube import YouTubeAdapter

log = logging.getLogger(__name__)

_ADAPTERS: list[PlatformAdapter] = [
    YouTubeAdapter(),
    InstagramAdapter(),
    FacebookAdapter(),
    GenericAdapter(),
]


def get_adapter(url: str) -> PlatformAdapter:
    for adapter in _ADAPTERS:
        if adapter.match(url):
            return adapter
    return GenericAdapter()


def fetch(job, upload_path: str | Path | None = None, cancel=None, progress=None) -> MediaResult:
    """Fetch media from uploaded file or platform adapter with degradation ladder."""
    warnings: list[str] = []

    # Direct file upload branch
    if upload_path:
        path = Path(upload_path)
        if not path.exists():
            raise AppError("NOT_FOUND", "Uploaded media file not found.", http_status=404)
        log.info("Processing uploaded media from %s", path)
        if progress:
            progress(0.5)
        try:
            audio = load_audio(path)
        finally:
            # Clean up uploaded raw file once decoded into memory
            try:
                path.unlink(missing_ok=True)
            except Exception:
                pass

        duration = len(audio) / 16000.0 if audio is not None else 0.0
        if duration > settings.max_video_minutes * 60:
            raise AppError(
                "DURATION_EXCEEDED",
                f"Video is {duration/60:.1f} minutes long; limit is {settings.max_video_minutes} minutes.",
                http_status=422,
            )

        if progress:
            progress(1.0)
        return MediaResult(
            audio=audio,
            duration=duration,
            title=job.title or job.file_name or "Uploaded Video",
            uploader=None,
            thumbnail=None,
            platform="upload",
            video_id=None,
            native_captions=None,
            native_caption_kind=None,
            method="direct_upload",
            warnings=warnings,
        )

    # URL branch
    url = job.source_url
    if not url:
        raise AppError("URL_INVALID", "No source URL provided.", http_status=422)

    adapter = get_adapter(url)
    log.info("Using ingest adapter '%s' for URL: %s", adapter.name, url)

    if progress:
        progress(0.2)
    media = adapter.fetch(url, cancel=cancel, warnings=warnings)

    if media.duration and media.duration > settings.max_video_minutes * 60:
        raise AppError(
            "DURATION_EXCEEDED",
            f"Video is {media.duration/60:.1f} minutes long; limit is {settings.max_video_minutes} minutes.",
            http_status=422,
        )

    if progress:
        progress(1.0)
    return media
