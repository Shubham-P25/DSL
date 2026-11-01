from app.pipeline.benchmark import reference_metrics
from app.pipeline.text_norm import normalize
from app.export.formats import to_vtt, to_srt, cues

def test_normalization_is_deterministic():
    assert normalize("  Hello, WORLD! ") == "hello world"

def test_cue_grouping_preserves_order():
    rows = [{"start": 0, "end": 2, "text": "one"}, {"start": 2, "end": 4, "text": "two"}]
    cue_items = cues(rows)
    assert len(cue_items) >= 1
    assert "one" in cue_items[0]["text"]

def test_caption_exports_have_expected_headers():
    rows = [{"start": 0, "end": 1.5, "text": "Hello"}]
    assert "WEBVTT" in to_vtt(rows)
    assert "00:00:00,000 --> 00:00:01,500" in to_srt(rows)

def test_reference_metric_reports_identical_transcript():
    result = reference_metrics("same words", "same words", "same words")
    assert result["raw_wer"] == 0
    assert result["corrected_wer"] == 0
