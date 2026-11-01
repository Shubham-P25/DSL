"""Word and segment verification engine."""
import json
import logging
from pathlib import Path
from app.core.config import settings
from app.verify.crosscheck import align, second_opinion, tokens_for_lang
from app.verify.llm_audit import run_llm_audit
from app.verify.scorer import (
    bucket,
    cap_segment,
    flags,
    hallucination_risk,
    segment_accuracy,
    word_accuracy,
)
from app.verify.signals import s_lexicon, s_prob, s_script

log = logging.getLogger(__name__)

_GLOSSARY_CACHE: set[str] | None = None


def load_glossary_terms() -> set[str]:
    global _GLOSSARY_CACHE
    if _GLOSSARY_CACHE is not None:
        return _GLOSSARY_CACHE

    terms = set()
    glossary_dir = Path(settings.data_dir) / "glossaries"
    if glossary_dir.exists():
        for f in glossary_dir.glob("*.json"):
            try:
                data = json.loads(f.read_text(encoding="utf-8"))
                if isinstance(data, list):
                    for item in data:
                        if isinstance(item, dict) and "term" in item:
                            terms.add(str(item["term"]).strip().lower())
                        elif isinstance(item, str):
                            terms.add(item.strip().lower())
            except Exception as exc:
                log.debug("Could not read glossary %s: %s", f, exc)

    _GLOSSARY_CACHE = terms
    return _GLOSSARY_CACHE


def apply_agree(seg, agree_scores: list[float | None]) -> None:
    """Apply crosscheck agreement scores to words and recalculate accuracy."""
    for i, w in enumerate(seg.words):
        if i < len(agree_scores):
            score = agree_scores[i]
            if score is not None:
                sig = getattr(w, "_sig", {})
                sig["agree"] = score
                w.acc = word_accuracy(sig)
                w.flags = flags(sig)
    seg.acc = segment_accuracy(seg.words)


def run_verify(media, lang: str, segs: list, on_progress=None, warnings: list[str] | None = None) -> None:
    """Run 3-pass verification: cheap local signals -> cross-check second opinion -> LLM audit."""
    warnings = warnings if warnings is not None else []
    glossary = load_glossary_terms()

    # Pass 1: Cheap local signals for every cue
    total = len(segs)
    for idx, s in enumerate(segs):
        for w in s.words:
            sig = {
                "prob": s_prob(w),
                "lex": s_lexicon(w, lang, glossary),
                "script": s_script(w, lang),
                "agree": None,
            }
            w.acc = word_accuracy(sig)
            w.flags = flags(sig)
            w._sig = sig

        if hallucination_risk(s):
            cap_segment(s)
        s.acc = segment_accuracy(s.words)
        if on_progress and total:
            on_progress(0.4 * (idx / total))

    # Pass 2: Second opinion on risky segments (acc < 0.80)
    risky = sorted(
        [s for s in segs if (s.acc or 1.0) < 0.80],
        key=lambda s: s.acc if s.acc is not None else 0.0,
    )[: settings.max_crosscheck_segs]

    for idx, s in enumerate(risky):
        try:
            other_tokens = second_opinion(media, s, lang)
            if other_tokens:
                agree_scores = align(s.words, other_tokens)
                apply_agree(s, agree_scores)
        except Exception as exc:
            warnings.append(f"Crosscheck failed on segment: {str(exc)[:60]}")
        if on_progress and len(risky):
            on_progress(0.4 + 0.3 * (idx / len(risky)))

    # Pass 3: LLM audit on segments that are still low accuracy (acc < 0.70)
    audit_candidates = [s for s in risky if (s.acc or 1.0) < 0.70]
    if audit_candidates:
        try:
            run_llm_audit(audit_candidates, lang)
        except Exception as exc:
            warnings.append(f"LLM audit partly skipped: {str(exc)[:60]}")

    if on_progress:
        on_progress(1.0)


__all__ = [
    "run_verify",
    "load_glossary_terms",
    "word_accuracy",
    "flags",
    "bucket",
    "segment_accuracy",
    "hallucination_risk",
    "s_prob",
    "s_script",
    "s_lexicon",
]
