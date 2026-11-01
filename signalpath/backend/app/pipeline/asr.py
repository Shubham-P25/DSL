"""Lazy faster-whisper window transcription."""
from dataclasses import dataclass
from typing import Any
from app.core.config import settings

_model = None

@dataclass
class RawSegment:
    start: float
    end: float
    text: str
    words: list[dict[str, Any]]
    avg_logprob: float
    no_speech_prob: float
    compression_ratio: float

def get_model():
    global _model
    if _model is None:
        try:
            from faster_whisper import WhisperModel
            _model = WhisperModel(settings.whisper_model, device=settings.whisper_device, compute_type=settings.whisper_compute)
        except Exception as exc:
            from app.core.errors import AppError
            raise AppError("MODEL_MISSING", "The speech recognition model is unavailable.", "Install faster-whisper and download the configured model.", retryable=True) from exc
    return _model

def transcribe_window(window, language: str = "auto") -> list[RawSegment]:
    segments, _info = get_model().transcribe(window.samples, language=None if language == "auto" else language, word_timestamps=True, vad_filter=True, beam_size=1, condition_on_previous_text=False)
    result: list[RawSegment] = []
    for segment in segments:
        no_speech = float(getattr(segment, "no_speech_prob", 0.0))
        if no_speech > 0.8:
            continue
        words = [{"word": word.word, "start": float(word.start or 0) + window.offset_s, "end": float(word.end or 0) + window.offset_s, "probability": float(word.probability)} for word in (getattr(segment, "words", None) or [])]
        result.append(RawSegment(float(segment.start) + window.offset_s, float(segment.end) + window.offset_s, segment.text.strip(), words, float(getattr(segment, "avg_logprob", 0.0)), no_speech, float(getattr(segment, "compression_ratio", 1.0))))
    return result

