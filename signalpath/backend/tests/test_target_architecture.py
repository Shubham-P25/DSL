"""Unit tests for the new target architecture: language registry, word-level verification,
audio loader without ffmpeg binary, and language API endpoint.
"""
import numpy as np
import pytest
from app.asr.base import Word, Seg
from app.ingest.audio import ffmpeg_path, load_audio
from app.langs.registry import LANGS, get as get_lang, script_ratio
from app.verify.signals import s_prob, s_script, s_lexicon
from app.verify.scorer import word_accuracy, flags, bucket, segment_accuracy, hallucination_risk


def test_language_registry_contracts():
    assert "en" in LANGS
    assert "hi" in LANGS
    assert "mr" in LANGS
    assert "pa" in LANGS
    assert "ta" in LANGS
    assert "kn" in LANGS
    assert "ru" in LANGS
    assert "de" in LANGS
    assert "ja" in LANGS
    assert "zh" in LANGS

    # get() raises KeyError on unsupported languages rather than falling back to en
    with pytest.raises(KeyError):
        get_lang("unsupported_xyz")


def test_script_ratio_accuracy():
    assert script_ratio("Hello World", "en") == 1.0
    assert script_ratio("नमस्ते भारत", "hi") == 1.0
    assert script_ratio("शुभ सकाळ", "mr") == 1.0
    assert script_ratio("வணக்கம்", "ta") == 1.0
    assert script_ratio("Hello World", "hi") == 0.0


def test_word_accuracy_scoring_and_flags():
    w_good = Word("hello", 0.0, 0.5, prob=0.95)
    sig_good = {"prob": s_prob(w_good), "lex": 0.8, "script": s_script(w_good, "en"), "agree": 1.0}
    acc_good = word_accuracy(sig_good)
    assert acc_good >= 0.85
    assert bucket(acc_good) == "green"
    assert flags(sig_good) == []

    # Word with low prob and script violation
    w_bad = Word("xyz123", 1.0, 1.5, prob=0.20)
    sig_bad = {"prob": s_prob(w_bad), "lex": 0.0, "script": 0.0, "agree": 0.0}
    acc_bad = word_accuracy(sig_bad)
    assert acc_bad <= 0.30
    assert bucket(acc_bad) == "red"
    f = flags(sig_bad)
    assert "low_prob" in f
    assert "wrong_script" in f
    assert "asr_disagree" in f


def test_hallucination_risk_detection():
    # Repetitive ngram looping
    seg_looping = Seg(0.0, 5.0, "thank you for watching thank you for watching thank you for watching", [], "en")
    assert hallucination_risk(seg_looping) is True

    # High compression ratio
    seg_compressed = Seg(0.0, 5.0, "normal caption", [], "en", compression_ratio=2.8)
    assert hallucination_risk(seg_compressed) is True

    # Normal caption
    seg_normal = Seg(0.0, 3.0, "This is a normal sentence.", [Word("This", 0, 1, 0.9)], "en", compression_ratio=1.2, no_speech_prob=0.01)
    assert hallucination_risk(seg_normal) is False


def test_ffmpeg_fallback_finds_bundled_binary():
    # Bundled imageio_ffmpeg must locate an executable on Windows without system ffmpeg
    path = ffmpeg_path()
    assert path is not None
    assert "ffmpeg" in path.lower()
