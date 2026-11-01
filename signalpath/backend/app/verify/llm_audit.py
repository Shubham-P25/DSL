"""LLM linguistic auditor for flagged low-confidence words only."""
import json
import logging
from app.langs.registry import LANGS
from app.llm.gemini import GeminiClient

log = logging.getLogger(__name__)

AUDIT_PROMPT = """You review speech-to-text output in {lang_name}. For each item decide if the target word is
probably a mis-hearing given its context. Return JSON only: [{{"id":0,"suspect":true,"suggestion":"...","reason":"..."}}].
Suggest a replacement only if you are confident; otherwise suggestion = null. Never rewrite the sentence."""


def run_llm_audit(risky_segs: list, lang: str) -> None:
    """Audit suspect words across risky segments using batched LLM calls (up to 60 items per call)."""
    gemini = GeminiClient()
    if not gemini.is_available() or not risky_segs:
        return

    items = []
    word_ptrs = []
    item_id = 0

    for seg in risky_segs:
        words = seg.words
        for i, w in enumerate(words):
            if (w.acc or 1.0) < 0.70:
                before = " ".join(words[j].text for j in range(max(0, i - 3), i))
                after = " ".join(words[j].text for j in range(i + 1, min(len(words), i + 4)))
                items.append({
                    "id": item_id,
                    "before": before,
                    "word": w.text,
                    "after": after,
                })
                word_ptrs.append(w)
                item_id += 1
                if item_id >= 60:
                    break
        if item_id >= 60:
            break

    if not items:
        return

    lang_name = LANGS.get(lang, None)
    lang_label = lang_name.name if lang_name else lang

    prompt = AUDIT_PROMPT.format(lang_name=lang_label) + "\n\nItems to inspect:\n" + json.dumps(items, ensure_ascii=False)

    try:
        res = gemini.generate_json(prompt)
        if isinstance(res, list):
            for row in res:
                idx = row.get("id")
                if isinstance(idx, int) and 0 <= idx < len(word_ptrs):
                    w = word_ptrs[idx]
                    if row.get("suspect") is True:
                        if "llm_suspect" not in w.flags:
                            w.flags.append("llm_suspect")
                        sug = row.get("suggestion")
                        if sug and isinstance(sug, str) and sug.strip() and sug.strip() != w.text:
                            w.alt = sug.strip()
    except Exception as exc:
        log.debug("LLM word audit failed (non-fatal): %s", exc)
