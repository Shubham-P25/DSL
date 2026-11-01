"""Export facade."""
import json
from app.export.formats import to_srt, to_vtt, cues
def render_export(segments: list[dict], fmt: str, lang: str = "en", variant: str = "final", mark_low_trust: bool = False) -> tuple[str, str]:
    options = {"lang": lang, "variant": variant, "mark_low_trust": mark_low_trust}
    if fmt == "srt": return to_srt(segments, **options), "application/x-subrip"
    if fmt == "vtt": return to_vtt(segments, **options), "text/vtt"
    if fmt == "txt": return "\n".join(c["text"].replace("\n", " ") for c in cues(segments, **options)), "text/plain"
    if fmt == "json": return json.dumps({"segments": segments}, ensure_ascii=False), "application/json"
    raise ValueError("unsupported export format")

