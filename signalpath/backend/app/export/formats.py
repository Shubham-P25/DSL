"""Caption serialization: word-timed cue splitting, balanced 2-line wrapping, no lost text."""
MAX_CHARS, LINE, MAX_DUR, MIN_DUR = 80, 42, 6.0, 0.9


def timestamp(seconds: float, comma: bool = False) -> str:
    millis = int(round(max(seconds, 0) * 1000))
    hours, millis = divmod(millis, 3600000)
    minutes, millis = divmod(millis, 60000)
    secs, millis = divmod(millis, 1000)
    return f"{hours:02}:{minutes:02}:{secs:02}{',' if comma else '.'}{millis:03}"


def _tokens(segment: dict, text: str) -> list[tuple[str, float, float]]:
    tokens = text.split()
    if not tokens:
        return []
    start, end = float(segment["start"]), float(segment["end"])
    words = segment.get("words") or []
    if text.strip() == (segment.get("text") or "").strip() and len(words) == len(tokens):
        return [(tok, float(w["start"]), float(w["end"])) for tok, w in zip(tokens, words)]
    span, total, acc, out = max(end - start, 0.1), sum(len(t) + 1 for t in tokens), 0, []
    for tok in tokens:
        s = start + span * acc / total
        acc += len(tok) + 1
        out.append((tok, s, start + span * acc / total))
    return out


def _group(tokens: list[tuple[str, float, float]]) -> list[tuple[float, float, str]]:
    cues, current = [], []

    def flush() -> None:
        if current:
            cues.append((current[0][1], current[-1][2], " ".join(t for t, _, _ in current)))

    for token in tokens:
        if current:
            length = len(" ".join(t for t, _, _ in current)) + 1 + len(token[0])
            ends_sentence = current[-1][0].endswith((".", "?", "!", "।"))
            if length > MAX_CHARS or token[2] - current[0][1] > MAX_DUR or (ends_sentence and length > 30):
                flush()
                current.clear()
        current.append(token)
    flush()
    return cues


def _wrap(text: str) -> str:
    if len(text) <= LINE:
        return text
    spaces = [i for i, c in enumerate(text) if c == " "]
    if not spaces:
        return text
    cut = min(spaces, key=lambda i: abs(i - len(text) / 2))
    return text[:cut] + "\n" + text[cut + 1:]


def cues(segments: list[dict], lang: str = "en", variant: str = "final", mark_low_trust: bool = False) -> list[dict]:
    all_tokens: list[tuple[str, float, float, bool]] = []
    for seg in segments:
        text = (seg.get("final_text") or seg.get("text", "")) if variant == "final" else seg.get("text", "")
        if lang != "en":
            translation = (seg.get("translations") or {}).get(lang)
            if not translation or not translation.get("text"):
                continue
            text = translation["text"]
        text = " ".join(text.split())
        if not text:
            continue
        low = seg.get("trust_bucket") != "green"
        for tok, s, e in _tokens(seg, text):
            all_tokens.append((tok, s, e, low))

    if not all_tokens:
        return []

    out = []
    current: list[tuple[str, float, float, bool]] = []

    def flush() -> None:
        if current:
            c_start = current[0][1]
            c_end = current[-1][2]
            c_text = " ".join(t for t, _, _, _ in current)
            c_low = any(low for _, _, _, low in current)
            prefix = "[?] " if (mark_low_trust and c_low) else ""
            out.append({"start": c_start, "end": c_end, "text": prefix + c_text, "low_trust": c_low})

    for tok_item in all_tokens:
        tok, s, e, low = tok_item
        if current:
            gap = s - current[-1][2]
            candidate_text = " ".join(t for t, _, _, _ in current) + " " + tok
            ends_sentence = current[-1][0].endswith((".", "?", "!", "।"))
            duration = e - current[0][1]
            if len(candidate_text) > MAX_CHARS or duration > MAX_DUR or gap > 1.2 or (ends_sentence and len(candidate_text) > 30):
                flush()
                current.clear()
        current.append(tok_item)
    flush()

    out.sort(key=lambda c: c["start"])
    for i, cue in enumerate(out):
        cue["end"] = max(cue["end"], cue["start"] + MIN_DUR)
        if i + 1 < len(out):
            cue["end"] = min(cue["end"], max(out[i + 1]["start"] - 0.02, cue["start"] + 0.3))
        cue["text"] = _wrap(cue["text"])
    return out


def to_srt(segments: list[dict], **kwargs) -> str:
    body = "\n\n".join(f"{i}\n{timestamp(c['start'], True)} --> {timestamp(c['end'], True)}\n{c['text']}"
                       for i, c in enumerate(cues(segments, **kwargs), 1))
    return body + "\n"


def to_vtt(segments: list[dict], **kwargs) -> str:
    body = "\n\n".join(f"{i}\n{timestamp(c['start'])} --> {timestamp(c['end'])}\n{c['text']}"
                       for i, c in enumerate(cues(segments, **kwargs), 1))
    return "WEBVTT\n\n" + body + "\n"
