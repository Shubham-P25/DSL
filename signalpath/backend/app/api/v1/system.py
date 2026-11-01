import shutil
from fastapi import APIRouter
from app.core.config import settings
from app.ingest.audio import ffmpeg_path
from app.ingest.ytdlp_opts import cookie_opts

router = APIRouter(prefix="/system", tags=["system"])


@router.get("/health")
def health() -> dict:
    import yt_dlp
    cookies = cookie_opts()
    ff_bin = ffmpeg_path()
    return {
        "ok": True,
        "yt_dlp": yt_dlp.version.__version__,
        "ffmpeg": bool(ff_bin),
        "ffmpeg_binary": "Bundled v7.1" if (ff_bin and "imageio_ffmpeg" in ff_bin) else "System" if ff_bin else "Missing",
        "js_runtime": bool(shutil.which("deno") or shutil.which("node")),
        "cookies": "file" if "cookiefile" in cookies else "browser" if cookies else "none",
        "gemini": bool(settings.gemini_api_key),
        "whisper_model": settings.whisper_model,
        "auth_required": settings.auth_required,
    }
