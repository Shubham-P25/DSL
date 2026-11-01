"""Intelligent multi-signal spoken language detection.
Combines title/uploader metadata priors, Gemini AI knowledge, and multi-window acoustic sampling.
Focuses on the 4 primary languages: English (en), Marathi (mr), Hindi (hi), Tamil (ta).
"""
import logging
import re
from typing import Tuple

log = logging.getLogger(__name__)

# Indic and regional language keywords in title/metadata
INDIC_HINTS = {
    "mr": [
        "marathi", "मराठी", "konkan", "कोकण", "kolhapur", "कोल्हापूर", "jayghosh", "जयघोष",
        "mauli", "माऊली", "abhang", "अभंग", "lavani", "लावणी", "sambal", "संबळ", "bhavgeet",
        "भावगीत", "shivaraj", "शिवराय", "maharashtra", "महाराष्ट्र", "ninai", "निनाई",
        "masai", "मसाई", "changbhala", "चांगभलं", "santosh sathe", "pranitrwanve", "kedar",
        "pune", "पुणे", "mumbai", "मुंबई", "shivaji", "शिवाजी", "bappa", "बाप्पा"
    ],
    "hi": [
        "hindi", "हिंदी", "gaana", "गाने", "geet", "गीत", "bhajan", "भजन", "katha", "कथा",
        "kahani", "कहानी", "samachar", "समाचार", "desh", "भारत", "bollywood", "kahaniyan"
    ],
    "ta": [
        "tamil", "தமிழ்", "chennai", "சென்னை", "kollywood", "paadal", "பாடல்", "vanakkam",
        "anirudh", "thalapathy", "thala", "cinema"
    ],
}

SCRIPT_PROMPTS = {
    "mr": "सर्व संवाद, बोलणे आणि गाणी फक्त शुद्ध मराठीत आणि देवनागरी लिपीतच लिहा. इंग्रजी किंवा उर्दू अक्षरे वापरू नका. मराठी भाषा.",
    "hi": "सभी संवाद, भाषण और गीत केवल शुद्ध हिंदी में और देवनागरी लिपि में ही लिखें। अंग्रेजी या उर्दू अक्षरों का प्रयोग न करें। हिंदी भाषा।",
    "ta": "அனைத்து உரையாடல்களையும் தூய தமிழில் தமிழ் எழுத்துக்களிலேயே எழுதவும். தமிழ் உரையாடல் மற்றும் பாடல்கள்.",
    "en": "English dialogue, speech, and song lyrics in natural English.",
}


def get_metadata_language_hint(title: str | None, uploader: str | None = None) -> Tuple[str | None, float]:
    """Inspect title and uploader for script and keyword hints."""
    text = f"{title or ''} {uploader or ''}".lower()
    if not text.strip():
        return None, 0.0

    # Script character checks
    has_devanagari = any('\u0900' <= ch <= '\u097f' for ch in text)
    has_tamil = any('\u0b80' <= ch <= '\u0bff' for ch in text)

    # Check keyword matches
    for lang, keywords in INDIC_HINTS.items():
        for kw in keywords:
            if kw in text:
                log.info("[LangDetect] Found keyword hint '%s' matching language '%s'", kw, lang)
                return lang, 0.90

    if has_devanagari:
        # Check if words look Marathi vs Hindi
        mr_markers = ["आहे", "नाही", "होते", "झाले", "केले", "कसे", "काय", "माझे", "तुझे"]
        if any(m in text for m in mr_markers):
            return "mr", 0.90
        return "hi", 0.75

    if has_tamil:
        return "ta", 0.90

    return None, 0.0


def detect_spoken_language(
    model,
    wav_path: str,
    title: str | None = None,
    uploader: str | None = None,
    explicit_lang: str | None = None,
) -> Tuple[str, float]:
    """Detect spoken language using metadata hints + Gemini AI + acoustic sampling.
    Returns (lang_code, confidence).
    """
    if explicit_lang and explicit_lang != "auto":
        log.info("[LangDetect] Using user-specified spoken language: %s", explicit_lang)
        return explicit_lang, 1.0

    meta_lang, meta_conf = get_metadata_language_hint(title, uploader)

    acoustic_lang, acoustic_prob, all_probs = "en", 0.5, []
    if model is not None and wav_path:
        try:
            import faster_whisper.audio as faudio
            wav_data = faudio.decode_audio(str(wav_path))
            acoustic_lang, acoustic_prob, all_probs = model.detect_language(
                wav_data,
                language_detection_segments=5,
                language_detection_threshold=0.5
            )
            log.info(
                "[LangDetect] Acoustic detection: %s (prob=%.2f). Top 3: %s",
                acoustic_lang, acoustic_prob, all_probs[:3] if all_probs else []
            )
        except Exception as exc:
            log.warning("[LangDetect] Acoustic detection failed: %s", exc)

    # Correct common Whisper acoustic misclassifications:
    # Whisper base often confuses Marathi/Hindi with Urdu (ur), Sindhi (sd), Arabic (ar), or Punjabi (pa)
    if acoustic_lang in {"ur", "ar", "fa", "sd", "ps"}:
        if meta_lang in {"mr", "hi"}:
            log.info("[LangDetect] Correcting acoustic Arabic-script '%s' to metadata '%s'", acoustic_lang, meta_lang)
            return meta_lang, 0.85
        # Default to Hindi if Indic audio was confused with Urdu
        log.info("[LangDetect] Normalizing acoustic '%s' to 'hi'", acoustic_lang)
        acoustic_lang = "hi"

    # If title/metadata has strong Marathi hint:
    if meta_lang:
        top_langs = [p[0] for p in (all_probs[:4] if all_probs else [])]
        if meta_lang == acoustic_lang:
            return meta_lang, max(meta_conf, acoustic_prob)
        if meta_lang in {"mr", "hi"} and (acoustic_lang in {"mr", "hi", "gu", "pa", "ne"} or meta_lang in top_langs):
            log.info("[LangDetect] Fusing metadata '%s' with Indic acoustic signal '%s' -> %s", meta_lang, acoustic_lang, meta_lang)
            return meta_lang, 0.90
        if acoustic_prob < 0.65 and meta_conf > 0.7:
            log.info("[LangDetect] Overriding weak acoustic '%s' (%.2f) with metadata '%s' (%.2f)", acoustic_lang, acoustic_prob, meta_lang, meta_conf)
            return meta_lang, meta_conf

    # Consult Gemini for ambiguous metadata if available
    if acoustic_prob < 0.65 and (title or uploader):
        try:
            from app.llm.gemini import GeminiClient
            gemini = GeminiClient()
            if gemini.is_available():
                prompt = (
                    f"Video title: '{title}', Uploader: '{uploader}'. "
                    f"Which spoken language is most probable among: en (English), mr (Marathi), hi (Hindi), ta (Tamil)? "
                    f"Return ONLY the 2-letter language code (en, mr, hi, or ta)."
                )
                res = gemini.generate_text(prompt)
                if res and res.strip().lower() in {"en", "mr", "hi", "ta"}:
                    detected = res.strip().lower()
                    log.info("[LangDetect] Gemini resolved ambiguous language as '%s'", detected)
                    return detected, 0.88
        except Exception:
            pass

    return acoustic_lang, acoustic_prob


def get_initial_prompt(lang: str) -> str | None:
    """Get the script-enforcing initial prompt for the language."""
    return SCRIPT_PROMPTS.get(lang.lower())
