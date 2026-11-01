"""Acoustic language detection sampling 3 audio points, restricted to the registry."""
import logging
from app.langs.registry import LANGS

log = logging.getLogger(__name__)


def detect(model, audio, forced: str | None) -> tuple[str, float, list[str]]:
    """Detect language across 3 sample windows using Whisper acoustic features."""
    if forced and forced != "auto":
        if forced in LANGS:
            return forced, 1.0, []
        return forced, 1.0, [f"Requested language '{forced}' is not standard."]

    if model is None or audio is None or len(audio) < 16000:
        return "en", 0.0, ["Audio too short for language detection; defaulted to English."]

    allowed = set(LANGS.keys())
    votes: dict[str, float] = {}
    n, win = len(audio), 30 * 16000

    for frac in (0.2, 0.5, 0.8):  # three probe windows
        start_idx = int(n * frac)
        clip = audio[start_idx : start_idx + win]
        if len(clip) < 3 * 16000:
            continue
        try:
            _, _, probs = model.detect_language(clip)
            for code, p in probs:
                if code == "ur" and "ur" not in allowed:
                    code = "hi"  # Hindustani speech often reads as Urdu
                if code in allowed:
                    votes[code] = votes.get(code, 0.0) + p
        except Exception as exc:
            log.debug("Acoustic language detection probe at %.1f failed: %s", frac, exc)

    if not votes:
        return "en", 0.0, ["Language could not be detected; defaulted to English."]

    total = sum(votes.values())
    ranked = sorted(votes.items(), key=lambda kv: -kv[1])
    best, conf = ranked[0][0], ranked[0][1] / max(total, 1e-6)

    warn = (
        [f"Language uncertain: {ranked[0][0]} vs {ranked[1][0]}. Re-run with the language selected."]
        if conf < 0.6 and len(ranked) > 1
        else []
    )
    return best, round(conf, 3), warn

