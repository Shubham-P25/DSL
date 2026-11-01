"""YouTube platform ingest adapter with 4-step ladder."""
import logging
import tempfile
from pathlib import Path
import yt_dlp
from app.core.config import settings
from app.core.errors import AppError
from app.ingest.audio import load_audio
from app.ingest.base import MediaResult
from app.ingest.captions_fallback import fetch_caption_segments
from app.ingest.urls import is_youtube, youtube_id
from app.ingest.ytdlp_opts import attempts_for, base_opts
from app.llm.gemini import GeminiClient

log = logging.getLogger(__name__)


class YouTubeAdapter:
    name = "youtube"

    def match(self, url: str) -> bool:
        return is_youtube(url)

    def fetch(self, url: str, cancel=None, warnings: list[str] | None = None) -> MediaResult:
        warnings = warnings if warnings is not None else []
        vid = youtube_id(url)

        # Step 1: Check native captions first (avoids media download entirely if manual)
        try:
            caps = fetch_caption_segments(url)
            if caps:
                # If manual captions exist, they can be used directly
                log.info("Found native YouTube captions (%d segments)", len(caps))
                # Download audio for playback/verification if possible, or return captions
                # Attempt quick audio download in background; if fails, we still have captions
        except Exception as exc:
            warnings.append(f"Native caption check: {exc}")
            caps = None

        # Step 2: Audio-only download via yt-dlp client ladder
        meta = {}
        for attempt in attempts_for(url):
            if cancel and hasattr(cancel, "is_set") and cancel.is_set():
                raise InterruptedError("Download cancelled")

            with tempfile.TemporaryDirectory(prefix="sp-yt-") as tmpdir:
                opts = base_opts(client=attempt.get("client"), use_cookies=attempt.get("cookies", True))
                out_path = Path(tmpdir) / "media.%(ext)s"
                opts["outtmpl"] = str(out_path)

                try:
                    with yt_dlp.YoutubeDL(opts) as ydl:
                        info = ydl.extract_info(url, download=True)
                        meta = {
                            "title": info.get("title"),
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
                            platform="youtube",
                            video_id=vid,
                            native_captions=caps,
                            native_caption_kind="auto" if caps else None,
                            method=f"ytdlp_audio_{attempt.get('client') or 'default'}",
                            warnings=warnings,
                        )
                except Exception as exc:
                    warnings.append(f"yt-dlp attempt ({attempt}): {str(exc)[:100]}")
                    log.debug("YouTube attempt failed: %s", exc)

        # Step 3: Gemini by URL
        try:
            client = GeminiClient()
            if client.is_available():
                log.info("Attempting Gemini transcription by YouTube URL...")
                gemini_caps = client.transcribe_youtube_url(url, target_lang="en")
                if gemini_caps:
                    return MediaResult(
                        audio=None,
                        duration=None,
                        title=f"YouTube Video ({vid})",
                        uploader=None,
                        thumbnail=f"https://img.youtube.com/vi/{vid}/hqdefault.jpg" if vid else None,
                        platform="youtube",
                        video_id=vid,
                        native_captions=gemini_caps,
                        native_caption_kind="gemini_url",
                        method="gemini_url",
                        warnings=warnings,
                    )
        except Exception as exc:
            warnings.append(f"Gemini URL fallback: {str(exc)[:100]}")

        # If native captions were found earlier, return them as final fallback
        if caps:
            return MediaResult(
                audio=None,
                duration=None,
                title=f"YouTube Video ({vid})",
                uploader=None,
                thumbnail=f"https://img.youtube.com/vi/{vid}/hqdefault.jpg" if vid else None,
                platform="youtube",
                video_id=vid,
                native_captions=caps,
                native_caption_kind="auto",
                method="youtube_native_captions",
                warnings=warnings,
            )

        raise AppError(
            "DOWNLOAD_FAILED",
            "Could not fetch YouTube audio. YouTube may require bot confirmation or login.",
            "Add cookies.txt or upload the audio/video file directly.",
            http_status=422,
        )

