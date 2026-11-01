"""Stage orchestrator: small, typed pipeline runner replacing runner.py.
Ingest -> ASR -> Verify -> Done -> (Lazy Translate)
"""
import logging
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from sqlmodel import Session, select
from app.asr import router as asr_router
from app.core.config import settings
from app.core.db import engine
from app.core.errors import AppError
from app.ingest import router as ingest_router
from app.models_db.tables import Job, Segment
from app.translate import service as translate_service
from app.verify import bucket, run_verify

log = logging.getLogger(__name__)

_pool = ThreadPoolExecutor(max_workers=max(1, settings.job_workers), thread_name_prefix="sp-orch-")
_cancel_events: dict[str, threading.Event] = {}


def cancel_event(job_id: str) -> threading.Event:
    if job_id not in _cancel_events:
        _cancel_events[job_id] = threading.Event()
    return _cancel_events[job_id]


def cancel(job_id: str) -> None:
    ev = _cancel_events.get(job_id)
    if ev:
        ev.set()


def submit(job_id: str, upload_path: str | None = None) -> None:
    cancel_event(job_id).clear()
    _pool.submit(run_job, job_id, upload_path)


def set_stage(job_id: str, stage: str, progress: float) -> None:
    with Session(engine) as session:
        job = session.get(Job, job_id)
        if job:
            job.stage = stage
            job.progress = round(progress, 1)
            job.status = "running"
            job.updated_at = datetime.now(timezone.utc)
            session.add(job)
            session.commit()


def set_progress(job_id: str, progress: float) -> None:
    with Session(engine) as session:
        job = session.get(Job, job_id)
        if job:
            job.progress = round(min(progress, 99.0), 1)
            job.updated_at = datetime.now(timezone.utc)
            session.add(job)
            session.commit()


def save_meta(job_id: str, media) -> None:
    with Session(engine) as session:
        job = session.get(Job, job_id)
        if job:
            if media.title and not job.title:
                job.title = media.title
            if media.uploader:
                job.uploader = media.uploader
            if media.thumbnail and not job.thumbnail_url:
                job.thumbnail_url = media.thumbnail
            if media.duration:
                job.duration_s = round(media.duration, 2)
            if media.platform:
                job.platform = media.platform
            job.updated_at = datetime.now(timezone.utc)
            session.add(job)
            session.commit()


def save_lang_method(job_id: str, lang: str, method: str) -> None:
    with Session(engine) as session:
        job = session.get(Job, job_id)
        if job:
            job.source_lang = lang
            job.method = method
            job.updated_at = datetime.now(timezone.utc)
            session.add(job)
            session.commit()


def persist_segment(job_id: str, idx: int, s) -> None:
    with Session(engine) as session:
        word_dicts = [w.to_dict() for w in s.words]
        seg = Segment(
            job_id=job_id,
            idx=idx,
            start=round(s.start, 2),
            end=round(s.end, 2),
            text=s.text.strip(),
            final_text=s.text.strip(),
            words=word_dicts,
            trust_score=s.acc if s.acc is not None else 0.85,
            trust_bucket=bucket(s.acc if s.acc is not None else 0.85),
        )
        session.add(seg)
        session.commit()


def coalesce_segs(segs: list, max_words: int = 10, max_chars: int = 50, max_dur: float = 4.5, max_gap: float = 1.0) -> list:
    """Coalesce choppy or single-word Seg objects into natural sentence cues."""
    if not segs:
        return []
    from app.asr.base import Seg
    out = []
    curr = segs[0]
    curr_words = list(curr.words or [])
    curr_text_parts = [curr.text.strip()]
    curr_start = curr.start
    curr_end = curr.end

    for nxt in segs[1:]:
        cand_text = " ".join(curr_text_parts + [nxt.text.strip()])
        w_count = len(cand_text.split())
        c_count = len(cand_text)
        dur = nxt.end - curr_start
        gap = nxt.start - curr_end
        ends = curr_text_parts[-1].rstrip().endswith((".", "!", "?", "।"))

        if ends or gap > max_gap or w_count > max_words or c_count > max_chars or dur > max_dur:
            merged_seg = Seg(
                start=round(curr_start, 2),
                end=round(curr_end, 2),
                text=" ".join(curr_text_parts).strip(),
                words=curr_words,
                lang=curr.lang,
                acc=curr.acc,
            )
            out.append(merged_seg)
            curr = nxt
            curr_start = nxt.start
            curr_end = nxt.end
            curr_words = list(nxt.words or [])
            curr_text_parts = [nxt.text.strip()]
        else:
            curr_end = max(curr_end, nxt.end)
            curr_text_parts.append(nxt.text.strip())
            curr_words.extend(nxt.words or [])

    if curr_text_parts:
        merged_seg = Seg(
            start=round(curr_start, 2),
            end=round(curr_end, 2),
            text=" ".join(curr_text_parts).strip(),
            words=curr_words,
            lang=curr.lang,
            acc=curr.acc,
        )
        out.append(merged_seg)
    return out


def persist_words(job_id: str, segs: list) -> None:
    with Session(engine) as session:
        existing = list(session.exec(select(Segment).where(Segment.job_id == job_id).order_by(Segment.idx)).all())
        for idx, s in enumerate(segs):
            word_dicts = [w.to_dict() for w in s.words]
            acc_val = s.acc if s.acc is not None else 0.85
            b_val = bucket(acc_val)
            if idx < len(existing):
                seg = existing[idx]
                seg.words = word_dicts
                seg.trust_score = acc_val
                seg.trust_bucket = b_val
                session.add(seg)
            else:
                seg = Segment(
                    job_id=job_id,
                    idx=idx,
                    start=round(s.start, 2),
                    end=round(s.end, 2),
                    text=s.text.strip(),
                    final_text=s.text.strip(),
                    words=word_dicts,
                    trust_score=acc_val,
                    trust_bucket=b_val,
                )
                session.add(seg)
        session.commit()


def finish(job_id: str, warnings: list[str]) -> None:
    with Session(engine) as session:
        job = session.get(Job, job_id)
        if job:
            job.status = "done"
            job.stage = "done"
            job.progress = 100.0
            job.warnings = list(dict.fromkeys(job.warnings + warnings))
            job.finished_at = datetime.now(timezone.utc)
            job.updated_at = datetime.now(timezone.utc)
            session.add(job)
            session.commit()


def fail(job_id: str, error: Exception, warnings: list[str]) -> None:
    with Session(engine) as session:
        job = session.get(Job, job_id)
        if job:
            job.status = "error"
            job.stage = "failed"
            job.error_code = getattr(error, "code", "INTERNAL")
            job.error_message = getattr(error, "message", str(error))
            job.error_hint = getattr(error, "hint", "Please retry or upload the file.")
            job.warnings = list(dict.fromkeys(job.warnings + warnings))
            job.finished_at = datetime.now(timezone.utc)
            job.updated_at = datetime.now(timezone.utc)
            session.add(job)
            session.commit()


def cleanup(job_id: str, upload_path: str | Path | None = None) -> None:
    _cancel_events.pop(job_id, None)
    if upload_path:
        try:
            Path(upload_path).unlink(missing_ok=True)
        except Exception:
            pass


def run_job(job_id: str, upload_path: str | None = None) -> None:
    """Execute pipeline: Ingest -> ASR -> Verify -> Done -> Lazy Translate."""
    cancel = cancel_event(job_id)
    warnings: list[str] = []

    with Session(engine) as session:
        job = session.get(Job, job_id)
        if not job:
            log.error("Job %s not found in database", job_id)
            return
        target_lang = job.target_langs[0] if job.target_langs else "en"
        source_lang_req = job.source_lang or "auto"

    try:
        # Stage 1: Ingest
        set_stage(job_id, "fetching_audio", 3.0)
        media = ingest_router.fetch(
            job,
            upload_path,
            cancel=cancel,
            progress=lambda p: set_progress(job_id, 3.0 + p * 17.0),
        )
        save_meta(job_id, media)

        if cancel.is_set():
            raise AppError("CANCELLED", "Job was cancelled by user.", http_status=499)

        # Stage 2: ASR
        set_stage(job_id, "transcribing", 20.0)
        collected_segs = []

        def _on_seg(s, prog=None):
            idx = len(collected_segs)
            collected_segs.append(s)
            persist_segment(job_id, idx, s)
            if prog is not None:
                set_progress(job_id, 20.0 + prog * 60.0)

        # Fast path if platform provided manual native captions or audio download was blocked
        if media.native_captions and (media.native_caption_kind in ("manual", "gemini_url") or media.audio is None):
            log.info("Using platform native captions directly (%d segments)", len(media.native_captions))
            from app.asr.base import Seg, Word
            lang = source_lang_req if source_lang_req != "auto" else "en"
            method = "platform_captions"
            for idx, c in enumerate(media.native_captions):
                tokens = c["text"].split()
                step = (c["end"] - c["start"]) / max(len(tokens), 1)
                words = [
                    Word(t, c["start"] + i * step, c["start"] + (i + 1) * step, prob=0.95)
                    for i, t in enumerate(tokens)
                ]
                s = Seg(c["start"], c["end"], c["text"], words, lang)
                _on_seg(s, idx / len(media.native_captions))
        else:
            lang, method, collected_segs = asr_router.run_asr(
                media,
                source_lang_req,
                _on_seg,
                cancel,
                warnings,
            )

        # Ensure segments are coalesced if choppy/word-level
        coalesced = coalesce_segs(collected_segs)
        if len(coalesced) != len(collected_segs):
            collected_segs = coalesced
            # Replace database segments with cleanly merged sentence segments
            with Session(engine) as session:
                existing = list(session.exec(select(Segment).where(Segment.job_id == job_id)).all())
                for old_s in existing:
                    session.delete(old_s)
                session.commit()
            for idx, s in enumerate(collected_segs):
                persist_segment(job_id, idx, s)

        save_lang_method(job_id, lang, method)

        if cancel.is_set():
            raise AppError("CANCELLED", "Job was cancelled by user.", http_status=499)

        # Stage 3: Verify
        set_stage(job_id, "verifying", 80.0)
        try:
            run_verify(
                media,
                lang,
                collected_segs,
                lambda p: set_progress(job_id, 80.0 + p * 18.0),
                warnings,
            )
        except Exception as exc:
            log.warning("Verification encountered issue (captions still delivered): %s", exc)
            warnings.append(f"Verification partly skipped: {str(exc)[:100]}")

        persist_words(job_id, collected_segs)

        # Stage 4: Finish (Job ready for viewing immediately!)
        finish(job_id, warnings)
        log.info("Job %s marked DONE successfully.", job_id)

        # Stage 5: Pre-translate all 4 core languages in background
        core_targets = [l for l in ["en", "hi", "de", "nl"] if l != (lang or "en").lower()]
        for t_lang in core_targets:
            translate_service.enqueue(job_id, t_lang)

    except AppError as e:
        log.warning("Job %s failed with AppError: %s", job_id, e)
        fail(job_id, e, warnings)
    except InterruptedError:
        log.info("Job %s was cancelled.", job_id)
        fail(job_id, AppError("CANCELLED", "Job was cancelled by user.", http_status=499), warnings)
    except Exception as e:
        log.exception("Job %s unexpected failure: %s", job_id, e)
        fail(job_id, AppError("INTERNAL", "Something went wrong.", str(e)[:200]), warnings)
    finally:
        cleanup(job_id, upload_path)

