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


def coalesce_dicts(
    segments: list[dict],
    max_words: int = 10,
    max_chars: int = 50,
    max_duration: float = 4.5,
    max_gap: float = 1.0,
) -> list[dict]:
    """Coalesce choppy or single-word fragments into natural multi-word sentence cues."""
    if not segments:
        return []
    merged: list[dict] = []
    curr_start = float(segments[0]["start"])
    curr_end = float(segments[0]["end"])
    curr_texts: list[str] = [segments[0]["text"]]

    for next_seg in segments[1:]:
        t_next = next_seg["text"].strip()
        candidate = " ".join(curr_texts + [t_next])
        w_count = len(candidate.split())
        c_count = len(candidate)
        duration = float(next_seg["end"]) - curr_start
        gap = float(next_seg["start"]) - curr_end

        last_ends = curr_texts[-1].rstrip().endswith((".", "!", "?", "।"))

        if last_ends or gap > max_gap or w_count > max_words or c_count > max_chars or duration > max_duration:
            merged.append({"start": round(curr_start, 2), "end": round(curr_end, 2), "text": " ".join(curr_texts).strip()})
            curr_start = float(next_seg["start"])
            curr_end = float(next_seg["end"])
            curr_texts = [t_next]
        else:
            curr_end = max(curr_end, float(next_seg["end"]))
            curr_texts.append(t_next)

    if curr_texts:
        merged.append({"start": round(curr_start, 2), "end": round(curr_end, 2), "text": " ".join(curr_texts).strip()})

    return merged


def fetch_caption_segments(url: str) -> list[dict]:
    segments = _ytdlp_subs(url)
    if segments:
        return coalesce_dicts(segments)
    vid = youtube_id(url)
    raw = _transcript_api(vid) if vid else []
    return coalesce_dicts(raw)
