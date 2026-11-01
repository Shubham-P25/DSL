"""Upload ingestion with bounded temporary audio-only storage."""
from pathlib import Path
import tempfile
from fastapi import UploadFile
from app.core.config import settings
from app.core.errors import AppError

async def save_upload(file: UploadFile) -> Path:
    suffix = Path(file.filename or "upload.bin").suffix.lower()
    if suffix not in {".mp3", ".wav", ".m4a", ".mp4", ".webm", ".mov", ".mkv", ".ogg"}:
        raise AppError("UPLOAD_INVALID", "This file type is not supported.", "Upload an audio or video media file.")
    target_dir = Path(tempfile.gettempdir()) / "signalpath"
    target_dir.mkdir(parents=True, exist_ok=True)
    target = Path(tempfile.NamedTemporaryFile(delete=False, suffix=suffix, dir=target_dir).name)
    size = 0
    try:
        with target.open("wb") as output:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > settings.max_upload_mb * 1024 * 1024:
                    raise AppError("UPLOAD_TOO_LARGE", "The upload exceeds the configured size limit.", f"Keep uploads under {settings.max_upload_mb} MB.", 413)
                output.write(chunk)
        return target
    except Exception:
        target.unlink(missing_ok=True)
        raise

