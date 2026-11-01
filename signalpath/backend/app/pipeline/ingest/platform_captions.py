"""Platform subtitle retrieval with rolling-caption de-duplication."""
from dataclasses import dataclass
from pathlib import Path
import re
import tempfile
import yt_dlp

@dataclass
class CaptionSegment:
    start: float
    end: float
    text: str

def _seconds(value: str) -> float:
    parts = value.replace(",", ".").split(":")
    return sum(float(part) * (60 ** (len(parts) - index - 1)) for index, part in enumerate(parts))

def parse_vtt(path: Path) -> list[CaptionSegment]:
    content = path.read_text(encoding="utf-8", errors="replace")
    pattern = re.compile(r"(\d{2}:\d{2}(?::\d{2})?[.,]\d{3})\s+-->\s+(\d{2}:\d{2}(?::\d{2})?[.,]\d{3})\s*\n(.*?)(?=\n[ \t]*\n|\Z)", re.DOTALL)
    result, previous = [], ""
    for start, end, text in pattern.findall(content):
        clean = re.sub(r"<[^>]+>", "", text).strip()
        # Ensure we remove newlines for clean representation or keep them?
        # Typically captions can have newlines. Let's keep them, or replace with space.
        clean = re.sub(r"\s+", " ", clean).strip()
        if clean.startswith(previous) and previous:
            clean = clean[len(previous):].strip()
        if clean:
            result.append(CaptionSegment(_seconds(start), _seconds(end), clean))
        previous = text.strip()
    return result

def fetch_platform_captions(url: str, lang: str = "en") -> list[CaptionSegment]:
    with tempfile.TemporaryDirectory(prefix="signalpath-captions-") as directory:
        options = {
            "quiet": True, 
            "skip_download": True, 
            "writesubtitles": True, 
            "writeautomaticsub": True, 
            "subtitleslangs": [lang], 
            "subtitlesformat": "vtt",
            "outtmpl": str(Path(directory) / "caption.%(ext)s")
        }
        with yt_dlp.YoutubeDL(options) as downloader:
            downloader.download([url])
        files = list(Path(directory).glob("*.vtt"))
        return parse_vtt(files[0]) if files else []

