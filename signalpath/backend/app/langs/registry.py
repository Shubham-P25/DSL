"""Single source of truth for languages. No other file may hard-code a language list."""
import re
import unicodedata
from dataclasses import dataclass

try:
    import wordfreq
    _WF_AVAILABLE = set(wordfreq.available_languages().keys())
except Exception:
    _WF_AVAILABLE = set()


@dataclass(frozen=True)
class Lang:
    code: str
    name: str
    native: str
    script_re: str          # regex matching ONE character of the expected script
    whisper: str            # Whisper language code
    mt: str                 # machine-translation code
    wordfreq: str | None    # wordfreq code, None = lexicon signal unavailable
    tokenize: str = "space" # "space" | "char"
    font: str = "Noto Sans"


_LAT, _DEV = r"[A-Za-z\u00C0-\u024F]", r"[\u0900-\u097F]"


def _wf(code: str | None) -> str | None:
    return code if (code and code in _WF_AVAILABLE) else None


LANGS: dict[str, Lang] = {
    l.code: l for l in [
        Lang("en", "English",   "English",   _LAT, "en", "en", _wf("en")),
        Lang("hi", "Hindi",     "हिन्दी",      _DEV, "hi", "hi", _wf("hi")),
        Lang("mr", "Marathi",   "मराठी",      _DEV, "mr", "mr", _wf("mr")),
        Lang("pa", "Punjabi",   "ਪੰਜਾਬੀ",     r"[\u0A00-\u0A7F]", "pa", "pa", _wf("pa"), font="Noto Sans Gurmukhi"),
        Lang("ta", "Tamil",     "தமிழ்",       r"[\u0B80-\u0BFF]", "ta", "ta", _wf("ta"), font="Noto Sans Tamil"),
        Lang("kn", "Kannada",   "ಕನ್ನಡ",       r"[\u0C80-\u0CFF]", "kn", "kn", _wf("kn"), font="Noto Sans Kannada"),
        Lang("ru", "Russian",   "Русский",   r"[\u0400-\u04FF]", "ru", "ru", _wf("ru")),
        Lang("de", "German",    "Deutsch",   _LAT, "de", "de", _wf("de")),
        Lang("ja", "Japanese",  "日本語",      r"[\u3040-\u30FF\u4E00-\u9FFF]", "ja", "ja", _wf("ja"), "char", "Noto Sans JP"),
        Lang("zh", "Chinese",   "中文",        r"[\u4E00-\u9FFF]", "zh", "zh-CN", _wf("zh"), "char", "Noto Sans SC"),
        # extras Whisper already supports:
        Lang("bn", "Bengali",   "বাংলা",       r"[\u0980-\u09FF]", "bn", "bn", _wf("bn"), font="Noto Sans Bengali"),
        Lang("te", "Telugu",    "తెలుగు",      r"[\u0C00-\u0C7F]", "te", "te", _wf("te"), font="Noto Sans Telugu"),
        Lang("gu", "Gujarati",  "ગુજરાતી",    r"[\u0A80-\u0AFF]", "gu", "gu", _wf("gu"), font="Noto Sans Gujarati"),
        Lang("ml", "Malayalam", "മലയാളം",    r"[\u0D00-\u0D7F]", "ml", "ml", _wf("ml"), font="Noto Sans Malayalam"),
        Lang("ur", "Urdu",      "اردو",        r"[\u0600-\u06FF]", "ur", "ur", _wf("ur"), font="Noto Sans Arabic"),
        Lang("es", "Spanish",   "Español",    _LAT, "es", "es", _wf("es")),
        Lang("fr", "French",    "Français",   _LAT, "fr", "fr", _wf("fr")),
        Lang("ar", "Arabic",    "العربية",     r"[\u0600-\u06FF]", "ar", "ar", _wf("ar"), font="Noto Sans Arabic"),
        Lang("ko", "Korean",    "한국어",      r"[\uAC00-\uD7AF\u1100-\u11FF]", "ko", "ko", _wf("ko"), "space", "Noto Sans KR"),
    ]
}


def get(code: str) -> Lang:
    """Get language definition by code. Raises KeyError loudly if unsupported; never silently falls back to 'en'."""
    return LANGS[code]


def script_ratio(text: str, code: str) -> float:
    """Share of letters (incl. combining marks) that belong to the expected script. 1.0 if no letters."""
    pat = re.compile(LANGS[code].script_re)
    letters = [c for c in text if unicodedata.category(c)[0] in "LM"]
    return sum(bool(pat.match(c)) for c in letters) / len(letters) if letters else 1.0
