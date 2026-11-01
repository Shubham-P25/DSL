try:
    import whisper
except Exception:  # The optional ASR dependency may be unavailable until setup is complete.
    whisper = None
from app.config import settings

_model = None

def get_whisper():
    global _model
    if whisper is None:
        raise RuntimeError("openai-whisper is not installed correctly. Install backend/requirements.txt in the backend virtual environment.")
    if _model is None:
        _model = whisper.load_model(settings.whisper_model_size, device=settings.device)
    return _model

def transcribe(audio_path: str) -> list[dict]:
    model = get_whisper()
    result = model.transcribe(audio_path, word_timestamps=True)
    segments = []
    for s in result.get("segments", []):
        words = []
        for w in s.get("words", []):
            words.append({
                "word": w.get("word", ""),
                "start": w.get("start", 0.0),
                "end": w.get("end", 0.0),
                "probability": float(w.get("probability", 0.8))
            })
        segments.append({
            "start": float(s["start"]),
            "end": float(s["end"]),
            "text": s["text"].strip(),
            "words": words
        })
    return segments
