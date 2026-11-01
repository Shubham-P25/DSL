import shutil
from fastapi import APIRouter
from app.core.config import settings
from app.ingest.ytdlp_opts import cookie_opts

router = APIRouter(prefix="/system", tags=["system"])


@router.get("/health")
def health() -> dict:
    import yt_dlp
    cookies = cookie_opts()
    return {
        "ok": True,
        "yt_dlp": yt_dlp.version.__version__,
        "ffmpeg": bool(shutil.which(settings.ffmpeg_path)),
        "js_runtime": bool(shutil.which("deno") or shutil.which("node")),
        "cookies": "file" if "cookiefile" in cookies else "browser" if cookies else "none",
        "gemini": bool(settings.gemini_api_key),
        "whisper_model": settings.whisper_model,
        "auth_required": settings.auth_required,
    }
