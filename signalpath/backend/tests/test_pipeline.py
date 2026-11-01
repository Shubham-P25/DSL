from app.ml.features import FEATURE_COLS, extract_features
from app.ml.scorer import TrustScorer
from app.pipeline.correct import correct_text
from app.ingest.urls import normalize_url as validate_url
from app.core.errors import AppError

def test_features_are_complete_for_empty_words():
    values = extract_features({"text": "hello", "start": 0, "end": 1, "words": []})
    assert list(values) == FEATURE_COLS

def test_scorer_explicitly_falls_back_without_artifact(tmp_path, monkeypatch):
    monkeypatch.setattr("app.ml.scorer.settings.model_dir", tmp_path)
    trust, bucket, scorer = TrustScorer().score(extract_features({"text": "hello", "start": 0, "end": 1, "words": []}))
    assert scorer == "heuristic"
    assert 0 <= trust <= 1
    assert bucket in {"green", "yellow", "red"}

def test_deterministic_correction_does_not_append_context():
    assert correct_text("cubernetes is fast", [{"text": "Kubernetes"}]) == "Kubernetes is fast"

def test_private_urls_are_rejected():
    try:
        validate_url("http://127.0.0.1/video")
    except AppError as error:
        assert error.code == "URL_INVALID"
    else:
        raise AssertionError("private URL should be rejected")

