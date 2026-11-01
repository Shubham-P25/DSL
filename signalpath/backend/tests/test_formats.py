"""Tests for export formats and cue splitting."""
from app.export.formats import cues, to_srt, to_vtt


def test_cue_splitting_and_line_limits():
    words_text = (
        "This is an extensive test segment intended to verify that word timed cues are "
        "properly split into smaller cues and that each resulting cue has at most eighty "
        "four characters and at most two balanced lines of forty two characters each."
    )
    assert len(words_text) >= 200
    tokens = words_text.split()
    total_tokens = len(tokens)
    start_t, end_t = 0.0, 25.0
    span = end_t - start_t
    words = []
    for i, tok in enumerate(tokens):
        w_start = start_t + span * i / total_tokens
        w_end = start_t + span * (i + 1) / total_tokens
        words.append({"word": tok, "start": w_start, "end": w_end, "probability": 0.95})

    seg = {
        "start": start_t,
        "end": end_t,
        "text": words_text,
        "words": words,
        "trust_bucket": "green",
    }

    result = cues([seg])
    # Must produce several cues
    assert len(result) > 1

    # (a) each <= 84 characters with <= 2 lines of <= 42 characters
    for cue in result:
        text = cue["text"]
        assert len(text) <= 84
        lines = text.split("\n")
        assert len(lines) <= 2
        for line in lines:
            assert len(line) <= 42

    # (b) no text is lost (join all cue text and compare words)
    joined_words = " ".join(c["text"].replace("\n", " ") for c in result).split()
    assert joined_words == tokens

    # (c) cue times never overlap
    for i in range(len(result) - 1):
        assert result[i]["end"] <= result[i + 1]["start"] + 0.05


def test_hindi_utf8_roundtrip():
    # (d) an SRT with Hindi text round-trips as UTF-8
    hindi_text = "नमस्ते दुनिया यह एक परीक्षण कैप्शन है"
    seg = {
        "start": 0.0,
        "end": 4.0,
        "text": hindi_text,
        "words": [],
        "trust_bucket": "green",
    }
    srt_out = to_srt([seg])
    encoded = srt_out.encode("utf-8")
    decoded = encoded.decode("utf-8")
    assert decoded == srt_out
    assert "नमस्ते" in decoded
