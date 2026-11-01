"""Independent verification signals for word accuracy scoring."""
from app.langs.registry import LANGS, script_ratio

try:
    from wordfreq import zipf_frequency
except Exception:
    def zipf_frequency(token, lang):
        return 0.0


def s_prob(w) -> float | None:
    """Whisper engine probability, or None for cloud ASR engines."""
    return w.prob


def s_script(w, lang: str) -> float:
    """Script check: 1.0 if token mostly matches expected Unicode script, else 0.0."""
    return 1.0 if script_ratio(w.text, lang) >= 0.7 else 0.0


def s_lexicon(w, lang: str, glossary: set[str]) -> float | None:
    """Lexicon lookup using wordfreq and domain glossaries. None if language has no wordfreq database."""
    cfg = LANGS.get(lang)
    if not cfg:
        return None

    token = w.text.strip(" .,!?;:\"'()[]{}/*-_+=`~").lower()
    if not token or token.isdigit():
        return None

    if token in glossary:
        return 1.0

    if not cfg.wordfreq:
        return None  # No lexicon for this language: skip cleanly, don't penalize

    try:
        freq = zipf_frequency(token, cfg.wordfreq)
        return min(freq / 4.0, 1.0)  # Zipf >= 4 counts as common word
    except Exception:
        return None
