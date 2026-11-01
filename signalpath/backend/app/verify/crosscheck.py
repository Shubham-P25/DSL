"""Cross-check second opinion alignment using SequenceMatcher and RapidFuzz."""
from difflib import SequenceMatcher
import io
import wave
import numpy as np
from rapidfuzz.fuzz import ratio
from app.core.config import settings
from app.langs.registry import LANGS


def norm(t: str) -> str:
    return t.strip(" .,!?;:\"'()[]{}/*-_+=`~").lower()


def tokens_for_lang(text: str, lang: str) -> list[str]:
    cfg = LANGS.get(lang)
    if cfg and cfg.tokenize == "char":
        return [ch for ch in text if ch.strip()]
    return text.strip().split()


def align(words: list, other_tokens: list[str]) -> list[float | None]:
    """Align first-pass words with second-opinion tokens and suggest alts."""
    a = [norm(w.text) for w in words]
    b = [norm(t) for t in other_tokens]
    agree: list[float | None] = [None] * len(a)

    if not a or not b:
        return [0.0 if not b else None] * len(a)

    for tag, i1, i2, j1, j2 in SequenceMatcher(a=a, b=b, autojunk=False).get_opcodes():
        for k in range(i1, i2):
            if tag == "equal":
                agree[k] = 1.0
            elif tag == "replace":
                cand_idx = j1 + min(k - i1, max(j2 - j1 - 1, 0))
                cand = b[cand_idx] if cand_idx < len(b) else ""
                sim = ratio(a[k], cand) if (a[k] and cand) else 0
                agree[k] = 1.0 if sim >= 85 else 0.0
                if agree[k] == 0.0 and (j2 - j1) == (i2 - i1) and (j1 + k - i1) < len(other_tokens):
                    words[k].alt = other_tokens[j1 + k - i1]
            else:
                # "delete" / "insert"
                agree[k] = 0.0

    return agree


def get_audio_slice(audio: np.ndarray, start_s: float, end_s: float) -> np.ndarray:
    s = max(0, int((start_s - 1.0) * 16000))
    e = min(len(audio), int((end_s + 1.0) * 16000))
    return audio[s:e]


def second_opinion(media, seg, lang: str) -> list[str] | None:
    """Fetch second opinion from: (1) native auto-captions, (2) Groq audio slice, (3) Gemini audio."""
    # (1) Overlapping native captions if available
    if media.native_captions:
        overlapping = [
            c["text"]
            for c in media.native_captions
            if max(c["start"], seg.start) < min(c["end"], seg.end)
        ]
        if overlapping:
            full = " ".join(overlapping)
            return tokens_for_lang(full, lang)

    # (2) Groq on audio slice
    if settings.groq_api_key and media.audio is not None:
        try:
            from app.asr.groq import URL, _wav_bytes
            import httpx
            slice_pcm = get_audio_slice(media.audio, seg.start, seg.end)
            if len(slice_pcm) >= 16000:
                r = httpx.post(
                    URL,
                    headers={"Authorization": f"Bearer {settings.groq_api_key}"},
                    files={"file": ("slice.wav", _wav_bytes(slice_pcm), "audio/wav")},
                    data={"model": settings.groq_model, "language": lang, "temperature": 0},
                    timeout=15.0,
                )
                if r.status_code == 200:
                    text = r.json().get("text", "")
                    if text.strip():
                        return tokens_for_lang(text, lang)
        except Exception:
            pass

    return None
