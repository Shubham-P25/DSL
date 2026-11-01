"""Run: pytest tests/test_translate_service.py -q   (no network, no API keys needed)"""
import uuid
import pytest
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

import app.translate.service as svc
from app.models_db.tables import Job, Segment, TranslationCache


@pytest.fixture()
def db(monkeypatch):
    eng = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(eng)
    monkeypatch.setattr(svc, "engine", eng)
    monkeypatch.setattr(svc, "_TABLE_CHECKED", True)
    svc._STATUS.clear()
    return eng


def make_job(eng, n, src="en"):
    jid = str(uuid.uuid4())
    with Session(eng) as s:
        s.add(Job(id=jid, source_lang=src, status="done", target_langs=["en"]))
        for i in range(n):
            s.add(Segment(job_id=jid, idx=i, start=i, end=i + 1, text=f"Hello {i}", final_text=f"Hello {i}"))
        s.commit()
    return jid


def fake_ok(text, src, tgt):
    return "\n".join("T:" + line for line in text.split("\n"))


def test_batches_into_few_requests(db, monkeypatch):
    calls = []
    monkeypatch.setattr(svc, "_google_call", lambda *a: calls.append(1) or fake_ok(*a))
    jid = make_job(db, 150)
    svc.translate_job_language(jid, "hi")
    assert svc.get_status(jid, "hi")["state"] == "done"
    assert len(calls) <= 4                      # 150 cues → ~3 requests, not 150
    with Session(db) as s:
        segs = s.exec(select(Segment).where(Segment.job_id == jid)).all()
        assert all(x.translations["hi"]["text"].startswith("T:") for x in segs)


def test_failure_is_not_stored_or_cached(db, monkeypatch):
    monkeypatch.setattr(svc, "_google_call", lambda *a: None)
    monkeypatch.setattr(svc, "_gemini_batch", lambda *a, **k: {})
    jid = make_job(db, 5)
    svc.translate_job_language(jid, "de")
    assert svc.get_status(jid, "de")["state"] == "failed"
    with Session(db) as s:
        assert all(not x.translations for x in s.exec(select(Segment)).all())
        assert s.exec(select(TranslationCache)).all() == []


def test_line_count_mismatch_falls_back_per_cue(db, monkeypatch):
    monkeypatch.setattr(svc, "_google_call", lambda t, s, g: t.replace("\n", " ") if "\n" in t else "X:" + t)
    jid = make_job(db, 4)
    svc.translate_job_language(jid, "nl")
    assert svc.get_status(jid, "nl")["state"] == "done"


def test_enqueue_is_idempotent_and_retry_after_failure(db, monkeypatch):
    monkeypatch.setattr(svc, "_google_call", lambda *a: None)
    monkeypatch.setattr(svc, "_gemini_batch", lambda *a, **k: {})
    jid = make_job(db, 3)
    svc.translate_job_language(jid, "hi")
    assert svc.get_status(jid, "hi")["state"] == "failed"
    monkeypatch.setattr(svc, "_google_call", fake_ok)
    svc.translate_job_language(jid, "hi")        # retry allowed after failure
    assert svc.get_status(jid, "hi")["state"] == "done"


def test_unknown_source_language_uses_auto(db, monkeypatch):
    seen = {}
    monkeypatch.setattr(svc, "_google_call", lambda t, s, g: seen.setdefault("src", s) and fake_ok(t, s, g))
    jid = make_job(db, 2, src="mr")              # "mr" is not in the 4-language registry
    svc.translate_job_language(jid, "en")
    assert seen["src"] == "auto"
    assert svc.get_status(jid, "en")["state"] == "done"
