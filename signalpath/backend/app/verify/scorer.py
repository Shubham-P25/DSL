"""Honest accuracy scoring, risk capping, and flag generator."""
import re

WEIGHTS = {
    "prob": 0.45,
    "lex": 0.15,
    "agree": 0.30,
    "script": 0.10,
}


def word_accuracy(sig: dict) -> float:
    """Calculate estimated accuracy 0..1 from available independent signals."""
    avail = {k: v for k, v in sig.items() if v is not None}
    if not avail:
        return 0.50

    total_weight = sum(WEIGHTS.get(k, 0.1) for k in avail)
    if total_weight <= 0:
        return 0.50

    acc = sum(WEIGHTS.get(k, 0.1) * v for k, v in avail.items()) / total_weight

    # Hard penalties for critical signal violations
    if sig.get("script") == 0:
        acc = min(acc, 0.30)
    if sig.get("agree") == 0:
        acc = min(acc, 0.60)

    return round(float(acc), 3)


def flags(sig: dict) -> list[str]:
    """Human-readable reasons shown in UI inspection tooltip."""
    f = []
    if sig.get("prob") is not None and sig["prob"] < 0.50:
        f.append("low_prob")
    if sig.get("lex") is not None and sig["lex"] < 0.25:
        f.append("lexicon_miss")
    if sig.get("script") == 0:
        f.append("wrong_script")
    if sig.get("agree") == 0:
        f.append("asr_disagree")
    return f


def bucket(acc: float | None) -> str:
    """UI confidence bucket color."""
    if acc is None:
        return "yellow"
    if acc >= 0.80:
        return "green"
    if acc >= 0.55:
        return "yellow"
    return "red"


def segment_accuracy(words: list) -> float | None:
    """Segment accuracy combining average word confidence with weakest word."""
    a = [w.acc for w in words if w.acc is not None]
    if not a:
        return None
    return round(0.7 * (sum(a) / len(a)) + 0.3 * min(a), 3)


def repeated_ngram(text: str, n: int = 3, times: int = 3) -> bool:
    """Detect repetitive looping typical of Whisper hallucinations."""
    tokens = text.strip().split()
    if len(tokens) < n * times:
        return False
    ngrams = [" ".join(tokens[i : i + n]) for i in range(len(tokens) - n + 1)]
    for ng in ngrams:
        if ngrams.count(ng) >= times:
            return True
    return False


def hallucination_risk(seg) -> bool:
    """Guard for classic Whisper looping and high-compression hallucinations."""
    return bool(
        (seg.compression_ratio or 0) > 2.4
        or ((seg.no_speech_prob or 0) > 0.6 and (seg.avg_logprob or 0) < -1.0)
        or repeated_ngram(seg.text, n=3, times=3)
    )


def cap_segment(seg) -> None:
    """Cap words and segment confidence on hallucination risk."""
    for w in seg.words:
        w.acc = min(w.acc or 0.40, 0.40)
        if "hallucination_risk" not in w.flags:
            w.flags.append("hallucination_risk")
    seg.acc = min(seg.acc or 0.40, 0.40)
