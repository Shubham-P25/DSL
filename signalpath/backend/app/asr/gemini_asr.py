"""Gemini ASR wrapper provider."""
import io
import tempfile
import wave
from pathlib import Path
import numpy as np
from app.asr.base import Seg, Word
from app.llm.gemini import GeminiClient


def _write_temp_wav(audio: np.ndarray) -> Path:
    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    tmp_path = Path(tmp.name)
    with wave.open(str(tmp_path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(16000)
        w.writeframes((np.clip(audio, -1, 1) * 32767).astype("<i2").tobytes())
    return tmp_path


def transcribe(audio: np.ndarray, lang: str, on_seg, cancel) -> None:
    client = GeminiClient()
    if not client.is_available():
        raise RuntimeError("Gemini API key is not configured or available")

    wav_path = _write_temp_wav(audio)
    try:
        raw_segs = client.transcribe_audio_file(wav_path, target_lang=lang)
        total = max(len(audio) / 16000.0, 1.0)
        for s in raw_segs:
            if cancel and hasattr(cancel, "is_set") and cancel.is_set():
                raise InterruptedError("Transcription cancelled")
            text = s.get("text", "").strip()
            start = float(s.get("start", 0.0))
            end = float(s.get("end", start + 2.0))
            # Rough word approximation if gemini returns raw text
            words_tokens = text.split()
            step = (end - start) / max(len(words_tokens), 1)
            words = [
                Word(
                    text=t,
                    start=start + i * step,
                    end=start + (i + 1) * step,
                    prob=0.85,
                )
                for i, t in enumerate(words_tokens)
            ]
            seg = Seg(
                start=start,
                end=end,
                text=text,
                words=words,
                lang=lang,
            )
            on_seg(seg, min(end / total, 1.0))
    finally:
        try:
            wav_path.unlink(missing_ok=True)
        except Exception:
            pass
