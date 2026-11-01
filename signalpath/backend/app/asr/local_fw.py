"""Local batched faster-whisper ASR provider."""
import logging
import numpy as np
from faster_whisper import WhisperModel, BatchedInferencePipeline
from app.core.config import settings
from app.asr.base import Seg, Word

log = logging.getLogger(__name__)

_model: WhisperModel | None = None
_batched: BatchedInferencePipeline | None = None


def _load() -> tuple[WhisperModel, BatchedInferencePipeline]:
    global _model, _batched
    if _model is None:
        log.info(
            "Loading local faster-whisper model '%s' (device=%s, compute=%s, cpu_threads=%d)...",
            settings.whisper_model,
            settings.whisper_device,
            settings.whisper_compute,
            settings.cpu_threads,
        )
        _model = WhisperModel(
            settings.whisper_model,
            device=settings.whisper_device,
            compute_type=settings.whisper_compute,
            cpu_threads=settings.cpu_threads if settings.cpu_threads > 0 else 4,
        )
        _batched = BatchedInferencePipeline(model=_model)
    return _model, _batched


def warmup() -> None:
    """Warm the model at startup with a 1-second silent array to avoid cold-start penalty."""
    try:
        _, batched = _load()
        silence = np.zeros(16000, dtype=np.float32)
        list(batched.transcribe(silence, language="en", batch_size=1, beam_size=1))
        log.info("Whisper model warmup completed.")
    except Exception as exc:
        log.debug("Whisper model warmup skipped/failed: %s", exc)


def transcribe(audio: np.ndarray, lang: str, on_seg, cancel) -> None:
    """Batched faster-whisper transcription with word timestamps.
    Does NOT use initial_prompt or condition_on_previous_text=True to prevent looping on non-English audio.
    """
    _, batched = _load()
    gen, info = batched.transcribe(
        audio,
        language=lang,
        batch_size=settings.asr_batch,
        beam_size=settings.beam_size,
        word_timestamps=True,
    )
    total = max(len(audio) / 16000.0, 1.0)
    for s in gen:
        if cancel and hasattr(cancel, "is_set") and cancel.is_set():
            raise InterruptedError("Transcription cancelled")
        words = [
            Word(w.word.strip(), float(w.start), float(w.end), float(w.probability))
            for w in (s.words or [])
            if w.word.strip()
        ]
        seg = Seg(
            start=float(s.start),
            end=float(s.end),
            text=s.text.strip(),
            words=words,
            lang=lang,
            avg_logprob=float(s.avg_logprob) if s.avg_logprob is not None else None,
            no_speech_prob=float(s.no_speech_prob) if s.no_speech_prob is not None else None,
            compression_ratio=float(s.compression_ratio) if s.compression_ratio is not None else None,
        )
        on_seg(seg, float(s.end) / total)
