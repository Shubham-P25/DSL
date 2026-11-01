"""Generic media ingest adapter using yt-dlp."""
import logging
import tempfile
from pathlib import Path
import yt_dlp
from app.core.errors import AppError
from app.ingest.audio import load_audio
from app.ingest.base import MediaResult
from app.ingest.ytdlp_opts import base_opts

log = logging.getLogger(__name__)


class GenericAdapter:
    name = "generic"

    def match(self, url: str) -> bool:
        return True

    def fetch(self, url: str, cancel=None, warnings: list[str] | None = None) -> MediaResult:
        warnings = warnings if warnings is not None else []

        for use_cookies in (False, True):
            if cancel and hasattr(cancel, "is_set") and cancel.is_set():
                raise InterruptedError("Download cancelled")

            with tempfile.TemporaryDirectory(prefix="sp-gen-") as tmpdir:
                opts = base_opts(use_cookies=use_cookies)
                out_path = Path(tmpdir) / "media.%(ext)s"
                opts["outtmpl"] = str(out_path)

                try:
                    with yt_dlp.YoutubeDL(opts) as ydl:
                        info = ydl.extract_info(url, download=True)
                        meta = {
                            "title": info.get("title") or "Online Video",
                            "uploader": info.get("uploader"),
                            "duration": info.get("duration"),
                            "thumbnail": info.get("thumbnail"),
                        }
                    downloaded = list(Path(tmpdir).glob("media.*"))
                    if downloaded:
                        audio = load_audio(downloaded[0])
                        return MediaResult(
                            audio=audio,
                            duration=meta.get("duration"),
                            title=meta.get("title"),
                            uploader=meta.get("uploader"),
                            thumbnail=meta.get("thumbnail"),
                            platform="other",
                            video_id=None,
                            native_captions=None,
                            native_caption_kind=None,
                            method=f"generic_{'cookies' if use_cookies else 'direct'}",
                            warnings=warnings,
                        )
                except Exception as exc:
                    warnings.append(f"Generic attempt (cookies={use_cookies}): {str(exc)[:100]}")
                    log.debug("Generic attempt failed: %s", exc)

        raise AppError(
            "DOWNLOAD_FAILED",
            "Could not fetch media from URL.",
            "Site blocked download or requires credentials: add cookies.txt or upload the file directly.",
            http_status=422,
        )

