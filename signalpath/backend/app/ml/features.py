"""Pure trust features shared by training and serving."""
import math
import re
from collections import Counter
from typing import Any
import numpy as np

FEATURE_COLS = ["word_count", "duration", "speech_rate", "avg_word_prob", "min_word_prob", "std_word_prob", "low_conf_ratio", "avg_logprob", "no_speech_prob", "compression_ratio", "mean_zipf", "oov_ratio", "rare_ratio", "surprisal", "repetition_ratio", "glossary_hit_ratio"]

def extract_features(segment: dict[str, Any], glossary_terms: set[str] | None = None) -> dict[str, float]:
    words = segment.get("words") or []
    text_tokens = re.findall(r"[A-Za-z][\w'-]*", segment.get("text", "").lower())
    probabilities = [float(word.get("probability", np.nan)) for word in words]
    probabilities = [value for value in probabilities if not math.isnan(value)]
    duration = max(float(segment.get("end", 0)) - float(segment.get("start", 0)), 1e-3)
    word_count = len(words) or len(text_tokens)
    try:
        from wordfreq import zipf_frequency
        zipfs = [zipf_frequency(token, "en") for token in text_tokens]
    except Exception:
        zipfs = [0.0] * len(text_tokens)
    repeated = sum(a == b for a, b in zip(text_tokens, text_tokens[1:]))
    glossary = {term.lower() for term in (glossary_terms or set())}
    hits = sum(token in glossary for token in text_tokens)
    return {
        "word_count": float(word_count), "duration": duration, "speech_rate": word_count / duration,
        "avg_word_prob": float(np.mean(probabilities)) if probabilities else np.nan,
        "min_word_prob": float(np.min(probabilities)) if probabilities else np.nan,
        "std_word_prob": float(np.std(probabilities)) if probabilities else np.nan,
        "low_conf_ratio": sum(value < 0.5 for value in probabilities) / len(probabilities) if probabilities else np.nan,
        "avg_logprob": float(segment.get("avg_logprob", np.nan)), "no_speech_prob": float(segment.get("no_speech_prob", np.nan)),
        "compression_ratio": float(segment.get("compression_ratio", np.nan)), "mean_zipf": float(np.mean(zipfs)) if zipfs else np.nan,
        "oov_ratio": sum(value == 0 for value in zipfs) / len(zipfs) if zipfs else np.nan,
        "rare_ratio": sum(value < 3 for value in zipfs) / len(zipfs) if zipfs else np.nan,
        "surprisal": float(np.mean([max(0.0, 8.0 - value) for value in zipfs])) if zipfs else np.nan,
        "repetition_ratio": repeated / max(1, len(text_tokens) - 1), "glossary_hit_ratio": hits / max(1, len(text_tokens)),
    }

