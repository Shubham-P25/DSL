"""ASR Provider Router and ladder executor with Unicode script validation."""
import logging
from app.asr import gemini_asr, groq, langid, local_fw
from app.core.config import settings
from app.core.errors import AppError
from app.langs.registry import script_ratio
from app.llm.gemini import GeminiClient

log = logging.getLogger(__name__)


def gemini_ok() -> bool:
    try:
        return GeminiClient().is_available()
    except Exception:
        return False


def run_asr(media, lang_choice: str, on_seg, cancel, warnings: list[str]) -> tuple[str, str, list]:
    """Execute ASR with the degradation ladder and validate Unicode script."""
    model = None
    if settings.asr_provider in ("auto", "local"):
        try:
            model, _ = local_fw._load()
        except Exception as exc:
            warnings.append(f"Could not initialize local Whisper model: {exc}")

    if model is not None and media.audio is not None:
        lang, conf, w = langid.detect(model, media.audio, lang_choice)
    else:
        lang = lang_choice if lang_choice and lang_choice != "auto" else "en"
        conf = 1.0
        w = []
    warnings.extend(w)

    ladder = []
    if settings.asr_provider in ("auto", "groq") and settings.groq_api_key:
        ladder.append(("groq", groq.transcribe))
    if settings.asr_provider in ("auto", "local"):
        ladder.append(("local", local_fw.transcribe))
    if settings.asr_provider in ("auto", "gemini") and gemini_ok():
        ladder.append(("gemini", gemini_asr.transcribe))

    if not ladder:
        ladder.append(("local", local_fw.transcribe))

    last_exc = None
    for name, fn in ladder:
        got = []

        def _collect(s, p=None):
            got.append(s)
            if on_seg:
                on_seg(s, p)

        try:
            log.info("Attempting ASR provider '%s' (lang=%s)...", name, lang)
            fn(media.audio, lang, _collect, cancel)
        except Exception as exc:
            log.warning("ASR provider '%s' failed: %s", name, exc)
            warnings.append(f"ASR '{name}' failed: {str(exc)[:100]}")
            last_exc = exc
            continue

        if not got:
            warnings.append(f"ASR '{name}' returned 0 segments; trying next provider.")
            continue

        full_text = " ".join(s.text for s in got).strip()
        # Script validation: output letters must mostly belong to expected script
        ratio = script_ratio(full_text, lang)
        if ratio >= 0.7:
            return lang, name, got

        warnings.append(
            f"ASR '{name}' output did not match the {lang} script (ratio={ratio:.2f}); trying next provider."
        )

    # If script mismatch happened on all providers but we got segments, return them with warning
    if got:
        warnings.append("ASR output script ratio was lower than expected but transcription succeeded.")
        return lang, ladder[-1][0], got

    raise AppError(
        "NO_SPEECH",
        "No usable speech was found.",
        "Pick the spoken language manually or upload the file.",
        http_status=422,
    )
