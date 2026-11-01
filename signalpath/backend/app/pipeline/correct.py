"""Evidence-constrained caption correction with deterministic fallback."""
import logging
import math
import re
import time
from difflib import SequenceMatcher
from rapidfuzz.fuzz import ratio
from app.llm.gemini import GeminiClient
from app.llm.prompts import CORRECTION_PROMPT

log = logging.getLogger(__name__)


def _terms(evidence: list[dict]) -> list[str]:
    return [str(item.get("text") or item.get("term") or "").strip() for item in evidence if str(item.get("text") or item.get("term") or "").strip()]


def _guard(original: str, corrected: str, evidence: list[dict], confidence: float) -> bool:
    if not corrected or confidence < 0.6:
        return False
    if SequenceMatcher(None, original, corrected).ratio() < 0.65:
        return False
    if abs(len(corrected.split()) - len(original.split())) > max(1, int(len(original.split()) * 0.3)):
        return False
    allowed = original + " " + " ".join(_terms(evidence))
    if set(re.findall(r"\b\d+(?:\.\d+)?\b", corrected)) - set(re.findall(r"\b\d+(?:\.\d+)?\b", allowed)):
        return False
    new_entities = set(re.findall(r"\b[A-Z][A-Za-z0-9-]{2,}\b", corrected)) - set(re.findall(r"\b[A-Z][A-Za-z0-9-]{2,}\b", allowed))
    return not new_entities


def correct_text(text: str, evidence: list[dict], confidence: float = 0.8) -> str | None:
    terms = _terms(evidence)
    best = text
    for token in re.findall(r"\b\w[\w-]*\b", text):
        candidate = max(terms, key=lambda term: ratio(token.lower(), term.lower())) if terms else ""
        if candidate and ratio(token.lower(), candidate.lower()) >= 85 and token.lower() != candidate.lower():
            best = re.sub(rf"\b{re.escape(token)}\b", candidate, best, count=1)
    return best if best != text and _guard(text, best, evidence, confidence) else None


def correct_segments(segments: list[dict], evidence_for: callable, client: GeminiClient | None = None) -> list[dict]:
    t0 = time.time()
    client = client or GeminiClient()

    # Pre-populate defaults
    for seg in segments:
        seg.setdefault("correction", None)
        seg.setdefault("correction_status", "none")
        seg.setdefault("correction_evidence", [])
        seg.setdefault("final_text", seg.get("text", ""))

    # Find candidates: yellow/red confidence that have actual domain evidence to correct against
    candidates_with_evidence: list[tuple[dict, list[dict]]] = []
    for seg in segments:
        if seg.get("trust_bucket") in {"yellow", "red"}:
            ev = evidence_for(seg)
            if ev:
                candidates_with_evidence.append((seg, ev))

    total_low_trust = sum(1 for s in segments if s.get("trust_bucket") in {"yellow", "red"})
    log.info(
        "[Correction] Evaluated %d segments: %d low-trust (yellow/red), %d matched glossary evidence.",
        len(segments),
        total_low_trust,
        len(candidates_with_evidence),
    )

    if not candidates_with_evidence:
        log.info("[Correction] No segments matched glossary evidence. Skipping LLM correction (took %.2fs).", time.time() - t0)
        return segments

    batch_size = 8
    total_batches = math.ceil(len(candidates_with_evidence) / batch_size)
    applied_count = 0

    for batch_idx, offset in enumerate(range(0, len(candidates_with_evidence), batch_size), 1):
        batch_items = candidates_with_evidence[offset:offset + batch_size]
        batch_segs = [item[0] for item in batch_items]
        batch_evs = {item[0].get("id"): item[1] for item in batch_items}

        request = [{"id": s.get("id"), "text": s.get("text", ""), "evidence": batch_evs.get(s.get("id"), [])} for s in batch_segs]

        results = None
        if client.is_available():
            try:
                log.info("[Correction] Batch %d/%d: Querying Gemini for %d segments...", batch_idx, total_batches, len(batch_segs))
                results = client.generate_json(CORRECTION_PROMPT + "\n" + str(request))
            except Exception as exc:
                log.warning("[Correction] Batch %d/%d Gemini call failed (%s). Falling back to local fuzzy match.", batch_idx, total_batches, exc)
                results = None
        else:
            log.info("[Correction] Batch %d/%d: Gemini unavailable, using deterministic local fuzzy match.", batch_idx, total_batches)

        by_id = {item.get("id"): item for item in (results or []) if isinstance(item, dict)}

        for seg in batch_segs:
            evidence = batch_evs.get(seg.get("id"), [])
            item = by_id.get(seg.get("id"))
            corrected = item.get("corrected") if item and item.get("changed") else None
            confidence = float(item.get("confidence", 0.0)) if item else 0.8

            if corrected and not _guard(seg.get("text", ""), corrected, evidence, confidence):
                log.debug("[Correction] Guard rejected LLM suggestion for segment %s: '%s'", seg.get("id"), corrected)
                corrected = None

            if not corrected:
                corrected = correct_text(seg.get("text", ""), evidence, confidence)

            if corrected:
                applied_count += 1
                log.info("[Correction] Corrected seg #%s: '%s' -> '%s'", seg.get("idx", seg.get("id")), seg.get("text", "")[:40], corrected[:40])

            seg["correction"] = corrected
            seg["correction_status"] = "applied" if corrected else "rejected" if evidence else "none"
            seg["correction_evidence"] = evidence
            seg["final_text"] = corrected or seg.get("text", "")

    log.info("[Correction] Finished in %.2fs: %d corrections applied across %d segments.", time.time() - t0, applied_count, len(segments))
    return segments


def audit_and_refine_captions(
    segments: list[dict],
    source_lang: str = "en",
    target_lang: str = "en",
    title: str | None = None,
    client: GeminiClient | None = None,
) -> list[dict]:
    """Verification step before final output:
    Audits the generated and translated captions using Gemini to guarantee
    grammatical correctness, semantic fidelity (especially for mr, hi, ta),
    and removal of Whisper hallucinations or ASR errors.
    """
    client = client or GeminiClient()
    if not client.is_available():
        log.info("[Verification] Gemini not available; skipping final LLM audit.")
        return segments

    try:
        return client.audit_and_verify_captions(
            segments=segments,
            source_lang=source_lang,
            target_lang=target_lang,
            title=title,
        )
    except Exception as exc:
        log.warning("[Verification] Caption audit encountered error: %s", exc)
        return segments



