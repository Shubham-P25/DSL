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

def coalesce_cues(
    cues: list[CaptionSegment],
    max_words: int = 10,
    max_chars: int = 50,
    max_duration: float = 4.5,
    max_gap: float = 1.0,
) -> list[CaptionSegment]:
    """Coalesce choppy or single-word rolling subtitle cues into natural sentence blocks."""
    if not cues:
        return []
    merged: list[CaptionSegment] = []
    curr_start = cues[0].start
    curr_end = cues[0].end
    curr_texts: list[str] = [cues[0].text]

    for next_cue in cues[1:]:
        text_candidate = " ".join(curr_texts + [next_cue.text])
        word_count = len(text_candidate.split())
        char_count = len(text_candidate)
        duration = next_cue.end - curr_start
        gap = next_cue.start - curr_end

        last_ends_sentence = curr_texts[-1].rstrip().endswith((".", "!", "?", "।"))

        if (
            last_ends_sentence
            or gap > max_gap
            or word_count > max_words
            or char_count > max_chars
            or duration > max_duration
        ):
            merged.append(CaptionSegment(round(curr_start, 2), round(curr_end, 2), " ".join(curr_texts).strip()))
            curr_start = next_cue.start
            curr_end = next_cue.end
            curr_texts = [next_cue.text]
        else:
            curr_end = max(curr_end, next_cue.end)
            curr_texts.append(next_cue.text)

    if curr_texts:
        merged.append(CaptionSegment(round(curr_start, 2), round(curr_end, 2), " ".join(curr_texts).strip()))

    return merged


def parse_vtt(path: Path) -> list[CaptionSegment]:
    content = path.read_text(encoding="utf-8", errors="replace")
    pattern = re.compile(r"(\d{2}:\d{2}(?::\d{2})?[.,]\d{3})\s+-->\s+(\d{2}:\d{2}(?::\d{2})?[.,]\d{3})\s*\n(.*?)(?=\n[ \t]*\n|\Z)", re.DOTALL)
    result, previous = [], ""
    for start, end, text in pattern.findall(content):
        clean = re.sub(r"<[^>]+>", "", text).strip()
        clean = re.sub(r"\s+", " ", clean).strip()
        if clean.startswith(previous) and previous:
            clean = clean[len(previous):].strip()
        if clean:
            result.append(CaptionSegment(_seconds(start), _seconds(end), clean))
        previous = text.strip()
    return coalesce_cues(result)

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

