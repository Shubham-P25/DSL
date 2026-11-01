"""Optional fast cloud Whisper provider using Groq's OpenAI-compatible API."""
import io
import wave
import httpx
import numpy as np
from app.core.config import settings
from app.asr.base import Seg, Word

URL = "https://api.groq.com/openai/v1/audio/transcriptions"
CHUNK_S = 480  # Keep each chunk under 25MB upload limit


def _wav_bytes(x: np.ndarray) -> bytes:
    b = io.BytesIO()
    with wave.open(b, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(16000)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype("<i2").tobytes())
    return b.getvalue()


def transcribe(audio: np.ndarray, lang: str, on_seg, cancel) -> None:
    if not settings.groq_api_key:
        raise ValueError("GROQ_API_KEY is not configured")

    total_len = len(audio)
    for off in range(0, total_len, CHUNK_S * 16000):
        if cancel and hasattr(cancel, "is_set") and cancel.is_set():
            raise InterruptedError("Transcription cancelled")
        base = off / 16000.0
        chunk_pcm = audio[off : off + CHUNK_S * 16000]
        if len(chunk_pcm) < 1600:  # less than 0.1s
            continue

        r = httpx.post(
            URL,
            headers={"Authorization": f"Bearer {settings.groq_api_key}"},
            files={"file": ("chunk.wav", _wav_bytes(chunk_pcm), "audio/wav")},
            data={
                "model": settings.groq_model,
                "language": lang,
                "response_format": "verbose_json",
                "timestamp_granularities[]": ["word", "segment"],
                "temperature": 0,
            },
            timeout=180.0,
        )
        r.raise_for_status()
        j = r.json()

        words = [
            Word(
                text=w["word"].strip(),
                start=base + float(w["start"]),
                end=base + float(w["end"]),
                prob=None,  # Groq verbose_json does not return word probabilities
            )
            for w in j.get("words", [])
            if w.get("word", "").strip()
        ]

        for s in j.get("segments", []):
            s_start = base + float(s["start"])
            s_end = base + float(s["end"])
            ws = [w for w in words if s_start - 0.05 <= w.start <= s_end + 0.05]
            seg = Seg(
                start=s_start,
                end=s_end,
                text=s.get("text", "").strip(),
                words=ws,
                lang=lang,
                avg_logprob=s.get("avg_logprob"),
                no_speech_prob=s.get("no_speech_prob"),
                compression_ratio=s.get("compression_ratio"),
            )
            on_seg(seg, min(s_end / (total_len / 16000.0), 1.0))

