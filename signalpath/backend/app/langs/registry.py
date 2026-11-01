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
        Lang("en", "English", "English", _LAT, "en", "en", _wf("en")),
        Lang("hi", "Hindi",   "हिन्दी",    _DEV, "hi", "hi", _wf("hi"), font="Noto Sans Devanagari"),
        Lang("de", "German",  "Deutsch", _LAT, "de", "de", _wf("de")),
        Lang("nl", "Dutch",   "Nederlands", _LAT, "nl", "nl", _wf("nl")),
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

