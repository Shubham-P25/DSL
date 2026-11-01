"""Honest reference WER calculations."""
from app.pipeline.text_norm import normalize
def reference_metrics(reference: str, raw: str, corrected: str) -> dict:
    try:
        from jiwer import cer, wer
        return {"method": "reference_wer", "normalization": "v1", "raw_wer": wer(normalize(reference), normalize(raw)), "corrected_wer": wer(normalize(reference), normalize(corrected)), "raw_cer": cer(normalize(reference), normalize(raw)), "corrected_cer": cer(normalize(reference), normalize(corrected))}
    except ImportError:
        raise RuntimeError("jiwer is required for reference metrics")

