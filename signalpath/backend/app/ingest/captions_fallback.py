"""Captions-only fallback when audio is blocked: platform subtitles via yt-dlp, then youtube-transcript-api."""
import logging
import tempfile
from pathlib import Path
import yt_dlp
from app.ingest.urls import youtube_id
from app.ingest.ytdlp_opts import base_opts
from app.langs.registry import LANGS
from app.pipeline.ingest.platform_captions import parse_vtt

log = logging.getLogger(__name__)
SUB_LANGS = list(LANGS.keys()) + ["en-orig"]


def _ytdlp_subs(url: str) -> list[dict]:
    with tempfile.TemporaryDirectory(prefix="sp-subs-") as directory:
        opts = base_opts(use_cookies=True)
        opts.update({"skip_download": True, "writesubtitles": True, "writeautomaticsub": True,
                     "subtitleslangs": SUB_LANGS, "subtitlesformat": "vtt",
                     "outtmpl": str(Path(directory) / "sub.%(ext)s")})
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                ydl.download([url])
        except Exception as exc:  # subtitles are best-effort
            log.warning("yt-dlp subtitles failed: %s", exc)
        files = sorted(Path(directory).glob("*.vtt"))
        if not files:
            return []
        return [{"start": c.start, "end": c.end, "text": c.text} for c in parse_vtt(files[0])]


def _transcript_api(video_id: str) -> list[dict]:
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
    except Exception:
        return []
    try:  # v1.x API
        items = YouTubeTranscriptApi().fetch(video_id, languages=SUB_LANGS)
        rows = [(i.text, i.start, i.duration) for i in items]
    except Exception:
        try:  # older API
            if hasattr(YouTubeTranscriptApi, "get_transcript"):
                items = YouTubeTranscriptApi.get_transcript(video_id, languages=SUB_LANGS)
                rows = [(i["text"], i["start"], i["duration"]) for i in items]
            else:
                return []
        except Exception as exc:
            log.warning("youtube-transcript-api failed: %s", exc)
            return []
    return [{"start": float(s), "end": float(s) + max(float(d), 0.5), "text": " ".join(t.split())} for t, s, d in rows if t.strip()]


def fetch_caption_segments(url: str) -> list[dict]:
    segments = _ytdlp_subs(url)
    if segments:
        return segments
    vid = youtube_id(url)
    return _transcript_api(vid) if vid else []
