"""URL -> 16 kHz mono wav (audio only, temp folder) through a fallback chain.
Order: each yt-dlp strategy -> captions-only fallback -> typed AppError."""
import logging
import re
import subprocess
import time
from dataclasses import dataclass, field
from pathlib import Path
import yt_dlp
from app.core.config import settings
from app.core.errors import AppError
from app.ingest.captions_fallback import fetch_caption_segments
from app.ingest.urls import is_youtube, youtube_id
from app.ingest.ytdlp_opts import attempts_for, base_opts

log = logging.getLogger(__name__)
FORMAT = "bestaudio[ext=m4a]/bestaudio/best[height<=720]/best/bestvideo+bestaudio"

AUTH_PAT = re.compile(r"sign in to confirm|not a bot|login required|log in|checkpoint_required|requires? (?:authentication|login)|--cookies|members-only|age[- ]restricted|age verification|private video", re.I)
GONE_PAT = re.compile(r"video unavailable|has been removed|does not exist|no longer available|http error 404", re.I)


@dataclass
class Resolved:
    wav_path: Path | None = None
    caption_segments: list[dict] | None = None
    title: str | None = None
    uploader: str | None = None
    thumbnail: str | None = None
    duration: float | None = None
    platform: str | None = None
    embed_url: str | None = None
    method: str = "whisper"
    warnings: list[str] = field(default_factory=list)


def classify(message: str) -> AppError:
    if AUTH_PAT.search(message):
        return AppError("AUTH_REQUIRED", "The site asked for sign-in (bot check).",
                        "Refresh backend/cookies.txt, switch to a mobile hotspot, or use the Upload tab.", 403)
    if re.search(r"unsupported url", message, re.I):
        return AppError("URL_UNSUPPORTED", "This link is not a video page we can read.", "Open the video page itself, or upload the file.", 422)
    if GONE_PAT.search(message):
        return AppError("PRIVATE_OR_REMOVED", "This video is private, removed or unavailable.", "Check that it plays in a private window.", 404)
    if re.search(r"not available in your country|geo.?restrict", message, re.I):
        return AppError("GEO_BLOCKED", "This video is blocked in your region.", "Upload the file instead.", 451)
    return AppError("INGEST_FAILED", "Could not fetch this video.", "Run pip install -U yt-dlp and retry, or upload the file.", 502, True)


def _guard(info: dict) -> None:
    if info.get("is_live") or info.get("live_status") in {"is_live", "post_live"}:
        raise AppError("LIVE_UNSUPPORTED", "Live streams are not supported.", "Use the recording after the stream ends.")
    duration = info.get("duration")
    if duration and duration > settings.max_video_minutes * 60:
        raise AppError("TOO_LONG", "This video is longer than the limit.", f"Keep videos under {settings.max_video_minutes} minutes.")


def to_wav(src: Path, dst: Path) -> None:
    try:
        subprocess.run([settings.ffmpeg_path, "-y", "-nostdin", "-loglevel", "error", "-i", str(src),
                        "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", str(dst)],
                       check=True, capture_output=True, timeout=900)
    except FileNotFoundError as exc:
        raise AppError("FFMPEG_MISSING", "ffmpeg is not installed.", "winget install Gyan.FFmpeg, then reopen the terminal.") from exc
    except subprocess.CalledProcessError as exc:
        raise AppError("UPLOAD_INVALID", "Could not read audio from this media.", exc.stderr.decode(errors="ignore")[-200:]) from exc


def _percent(data: dict) -> float | None:
    total = data.get("total_bytes") or data.get("total_bytes_estimate")
    done = data.get("downloaded_bytes")
    return (done / total * 100.0) if total and done is not None else None


def _attempt(url: str, workdir: Path, attempt: dict, progress):
    opts = base_opts(client=attempt["client"], use_cookies=attempt["cookies"])

    def hook(data: dict) -> None:
        if progress and data.get("status") == "downloading":
            pct = _percent(data)
            if pct is not None:
                progress(pct)

    opts.update({"format": FORMAT, "outtmpl": str(workdir / "%(id)s.%(ext)s"), "overwrites": True, "progress_hooks": [hook]})
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=False)
        if info.get("entries"):
            info = next(e for e in info["entries"] if e)
        _guard(info)
        ydl.process_ie_result(info, download=True)
    files = [p for p in workdir.iterdir() if p.is_file() and p.suffix not in {".part", ".ytdl", ".wav"}]
    if not files:
        raise RuntimeError("download produced no file")
    return info, max(files, key=lambda p: p.stat().st_size)


def resolve(url: str, workdir: Path, progress=None, cancel=None) -> Resolved:
    workdir.mkdir(parents=True, exist_ok=True)
    errors: list[str] = []
    for index, attempt in enumerate(attempts_for(url)):
        if cancel is not None and cancel.is_set():
            raise AppError("CANCELLED", "The job was cancelled.")
        try:
            info, src = _attempt(url, workdir, attempt, progress)
            wav = workdir / "audio.wav"
            to_wav(src, wav)
            src.unlink(missing_ok=True)
            vid = info.get("id")
            result = Resolved(
                wav_path=wav, title=info.get("title"), uploader=info.get("uploader"), thumbnail=info.get("thumbnail"),
                duration=info.get("duration"), platform=info.get("extractor_key"),
                embed_url=f"https://www.youtube.com/embed/{vid}" if is_youtube(url) and vid else None)
            if index > 0:
                result.warnings.append(f"Used fallback strategy #{index + 1}.")
            return result
        except AppError:
            raise
        except Exception as exc:
            errors.append(str(exc))
            log.warning("ingest attempt %s failed: %s", attempt, exc)
            time.sleep(settings.ytdlp_sleep_s)
    # User fallback: If media download fails, give YouTube URL directly to Gemini model
    if is_youtube(url):
        try:
            from app.llm.gemini import GeminiClient
            gemini = GeminiClient()
            if gemini.is_available():
                log.info("[Resolver] Audio blocked or download failed. Using Gemini direct YouTube ASR fallback...")
                gemini_segments = gemini.transcribe_youtube_url(url)
                if gemini_segments:
                    vid = youtube_id(url)
                    return Resolved(
                        caption_segments=gemini_segments,
                        method="gemini_youtube_asr",
                        platform="YouTube",
                        title=f"Video {vid}" if vid else "YouTube Video",
                        embed_url=f"https://www.youtube.com/embed/{vid}" if vid else None,
                        warnings=["Audio was restricted by site; transcribed directly using Gemini Multimodal AI."]
                    )
        except Exception as exc:
            log.warning("Gemini YouTube fallback error: %s", exc)

    try:
        segments = fetch_caption_segments(url)
    except Exception as exc:
        log.warning("caption fallback failed: %s", exc)
        segments = []
    if segments:
        vid = youtube_id(url)
        return Resolved(
            caption_segments=segments, method="platform_captions", platform="YouTube" if vid else None,
            title=f"Video {vid}" if vid else None, embed_url=f"https://www.youtube.com/embed/{vid}" if vid else None,
            warnings=["Audio was blocked by the site, so the platform's own captions were used. Upload the file for full AI captioning."])
    raise classify(" | ".join(errors[-3:]))
