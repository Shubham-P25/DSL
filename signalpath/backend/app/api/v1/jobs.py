"""Job API: create from URL, create from upload, poll, edit, delete, export."""
import hashlib
import re
import uuid
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel
from sqlmodel import Session, select
from app.auth import current_user
from app.core.config import settings
from app.core.db import get_session
from app.core.errors import AppError
from app.export.captions import render_export
from app.ingest.urls import normalize_url
from app.langs.registry import LANGS
from app.models_db.tables import Job, Segment
from app.pipeline import runner
from app.pipeline.ingest.upload import save_upload
from app.translate import service as translate_service

router = APIRouter(prefix="/jobs", tags=["jobs"])
SEG_FIELDS = {"id", "idx", "start", "end", "text", "final_text", "correction", "correction_status", "trust_score", "trust_bucket", "human_edited", "translations", "words"}
JOB_EXCLUDE = {"cache_key", "timings"}


class JobCreate(BaseModel):
    url: str
    source_lang: str = "en"
    target_lang: str = "en"
    correct: bool = True


class SegmentEdit(BaseModel):
    text: str


class TranslateRequest(BaseModel):
    lang: str


def _owned(session: Session, job_id: str, user: str) -> Job:
    job = session.get(Job, job_id)
    if not job or (settings.auth_required and job.user_id != user):
        raise AppError("NOT_FOUND", "Job not found.", http_status=404)
    return job


def _segments(session: Session, job_id: str) -> list[Segment]:
    return list(session.exec(select(Segment).where(Segment.job_id == job_id).order_by(Segment.idx)).all())


def _ready_langs(rows: list[tuple]) -> list[str]:
    """rows = [(final_text, text, translations)]. A language is ready only when EVERY non-empty cue has it."""
    need = [(t or {}) for f, x, t in rows if (f or x or "").strip()]
    if not need:
        return []
    langs = set().union(*[set(t.keys()) for t in need])
    return sorted(l for l in langs if all((t.get(l) or {}).get("text") for t in need))


@router.post("", status_code=202)
def create_job(body: JobCreate, user: str = Depends(current_user), session: Session = Depends(get_session)) -> dict:
    url = normalize_url(body.url)
    target = body.target_lang or "en"
    if target not in LANGS:
        raise AppError("LANG_UNSUPPORTED", f"Language '{target}' is not supported.", http_status=400)
    if body.source_lang and body.source_lang != "auto" and body.source_lang not in LANGS:
        raise AppError("LANG_UNSUPPORTED", f"Source language '{body.source_lang}' is not supported.", http_status=400)
    key = hashlib.sha256(f"{user}|{url}|{body.source_lang}|{target}|{body.correct}".encode()).hexdigest()
    cutoff = datetime.now(timezone.utc) - timedelta(hours=settings.cache_ttl_h)
    cached = session.exec(select(Job).where(Job.cache_key == key, Job.status == "done", Job.finished_at >= cutoff)).first()
    if cached:
        return {"job_id": cached.id, "cached": True}
    job = Job(id=str(uuid.uuid4()), user_id=user, source_url=url, source_kind="url", source_lang=body.source_lang,
              target_langs=[target], options={"correct": body.correct, "target_lang": target}, status="queued", stage="queued", cache_key=key)
    session.add(job)
    session.commit()
    runner.submit(job.id)
    return {"job_id": job.id, "cached": False}


@router.post("/upload", status_code=202)
async def create_upload(file: UploadFile = File(...), source_lang: str = Form("en"), target_lang: str = Form("en"), correct: bool = Form(True),
                        user: str = Depends(current_user), session: Session = Depends(get_session)) -> dict:
    target = target_lang or "en"
    if target not in LANGS:
        raise AppError("LANG_UNSUPPORTED", f"Language '{target}' is not supported.", http_status=400)
    if source_lang and source_lang != "auto" and source_lang not in LANGS:
        raise AppError("LANG_UNSUPPORTED", f"Source language '{source_lang}' is not supported.", http_status=400)
    path = await save_upload(file)
    job = Job(id=str(uuid.uuid4()), user_id=user, source_kind="upload", file_name=file.filename, title=file.filename,
              source_lang=source_lang, target_langs=[target], options={"correct": correct, "target_lang": target}, status="queued", stage="queued")
    session.add(job)
    session.commit()
    runner.submit(job.id, str(path))
    return {"job_id": job.id, "cached": False}


@router.get("")
def list_jobs(user: str = Depends(current_user), session: Session = Depends(get_session)) -> list[dict]:
    query = select(Job).order_by(Job.created_at.desc()).limit(100)
    if settings.auth_required:
        query = query.where(Job.user_id == user)
    return [job.model_dump(exclude=JOB_EXCLUDE) for job in session.exec(query).all()]


@router.get("/{job_id}")
def get_job(job_id: str, user: str = Depends(current_user), session: Session = Depends(get_session)) -> dict:
    job = _owned(session, job_id, user)
    segs, rows = [], []
    for s in _segments(session, job_id):
        d = s.model_dump(include=SEG_FIELDS)
        d["acc"] = s.trust_score
        segs.append(d)
        rows.append((s.final_text, s.text, s.translations))
    job_dict = job.model_dump(exclude=JOB_EXCLUDE)
    ready = set(_ready_langs(rows))
    if job.source_lang in LANGS:
        ready.add(job.source_lang)              # the spoken language needs no translation
    job_dict["translations_ready"] = sorted(ready)
    job_dict["translation_status"] = translate_service.job_statuses(job_id)
    return {"job": job_dict, "segments": segs}


@router.patch("/{job_id}/segments/{segment_id}")
def edit_segment(job_id: str, segment_id: int, body: SegmentEdit, user: str = Depends(current_user), session: Session = Depends(get_session)) -> dict:
    _owned(session, job_id, user)
    segment = session.get(Segment, segment_id)
    if not segment or segment.job_id != job_id:
        raise AppError("NOT_FOUND", "Caption not found.", http_status=404)
    segment.final_text, segment.human_edited = body.text.strip(), True
    segment.translations = {}                  # stale once the source text changes
    translate_service.invalidate(job_id)       # lets the UI re-translate the active language
    session.add(segment)
    session.commit()
    return segment.model_dump(include=SEG_FIELDS)


@router.delete("/{job_id}")
def delete_job(job_id: str, user: str = Depends(current_user), session: Session = Depends(get_session)) -> dict:
    job = _owned(session, job_id, user)
    runner.cancel(job_id)
    for segment in _segments(session, job_id):
        session.delete(segment)
    session.delete(job)
    session.commit()
    return {"deleted": True}


@router.post("/{job_id}/translate", status_code=202)
def request_translation(job_id: str, body: TranslateRequest, user: str = Depends(current_user),
                        session: Session = Depends(get_session)) -> dict:
    job = _owned(session, job_id, user)
    if job.status != "done":
        raise AppError("NOT_READY", "Captions are not finished yet.", http_status=409)
    if body.lang not in LANGS:
        raise AppError("LANG_UNSUPPORTED", f"Language '{body.lang}' is not supported.", http_status=400)
    st = translate_service.enqueue(job_id, body.lang)
    return {"job_id": job_id, "lang": body.lang, "status": st.get("state"), "done": st.get("done", 0),
            "total": st.get("total", 0), "error": st.get("error")}


@router.get("/{job_id}/translate/{lang}")
def translation_status(job_id: str, lang: str, user: str = Depends(current_user),
                       session: Session = Depends(get_session)) -> dict:
    job = _owned(session, job_id, user)
    if lang not in LANGS:
        raise AppError("LANG_UNSUPPORTED", f"Language '{lang}' is not supported.", http_status=400)
    rows = session.exec(select(Segment.final_text, Segment.text, Segment.translations)
                        .where(Segment.job_id == job_id)).all()
    ready = lang == job.source_lang or lang in _ready_langs([tuple(r) for r in rows])
    st = translate_service.get_status(job_id, lang) or {"state": "idle", "done": 0, "total": 0, "error": None}
    return {"state": "done" if ready else st["state"], "done": st.get("done", 0), "total": st.get("total", 0),
            "error": None if ready else st.get("error"), "ready": ready}


@router.get("/{job_id}/export")
def export_job(job_id: str, format: str = "srt", lang: str = "en", variant: str = "final", mark_low_trust: bool = False, bom: bool = False,
               user: str = Depends(current_user), session: Session = Depends(get_session)) -> Response:
    job = _owned(session, job_id, user)
    if job.status != "done":
        raise AppError("NOT_READY", "Captions are not finished yet.", "Wait until the job is done.", 409)
    if format not in {"srt", "vtt", "txt", "json"}:
        raise AppError("VALIDATION", "Unsupported format.", "Use srt, vtt or txt.", 422)
    src = (job.source_lang or "en").lower()
    if lang != src:
        rows = [(s.final_text, s.text, s.translations) for s in _segments(session, job_id)]
        if lang not in _ready_langs(rows):
            raise AppError("TRANSLATION_NOT_READY", f"{lang} captions are not finished yet.",
                           "Pick the language in the viewer first and wait for it to finish.", 409)
    segments = [s.model_dump(include=SEG_FIELDS | {"words"}) for s in _segments(session, job_id)]
    body, media_type = render_export(segments, format, lang, variant, mark_low_trust, source_lang=src)
    if bom:
        body = "\ufeff" + body
    name = re.sub(r"[^A-Za-z0-9_-]+", "_", (job.title or "signalpath")[:60]).strip("_") or "signalpath"
    filename = f"{name}_{lang}.{format}" if lang != src else f"{name}.{format}"
    return Response(body.encode("utf-8"), media_type=f"{media_type}; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{filename}"'})
