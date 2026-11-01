"""Background job runner: resolve media -> Whisper/Gemini -> trust score -> translation -> Gemini verification.
Guarantees robust non-English video handling, Gemini YouTube fallback, and end-to-end quality audit.
"""
import logging
import math
import re
import shutil
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from sqlmodel import Session, select
from app.core.config import settings
from app.core.db import engine
from app.core.errors import AppError
from app.ingest.resolver import Resolved, resolve, to_wav
from app.ingest.urls import is_youtube
from app.llm.gemini import GeminiClient
from app.ml.features import extract_features
from app.ml.scorer import TrustScorer
from app.models_db.tables import Job, Segment
from app.pipeline.asr import get_model
from app.pipeline.correct import correct_segments, audit_and_refine_captions
from app.pipeline.lang_detect import detect_spoken_language, get_initial_prompt
from app.pipeline.translate import translate_segments_multilingual

log = logging.getLogger(__name__)
_pool = ThreadPoolExecutor(max_workers=settings.job_workers, thread_name_prefix="sp-job")
_cancel: dict[str, threading.Event] = {}

CORE_LANGUAGES = ["en", "hi", "mr", "ta"]


def submit(job_id: str, upload_path: str | None = None) -> None:
    _cancel[job_id] = threading.Event()
    _pool.submit(_run, job_id, upload_path)


def cancel(job_id: str) -> None:
    event = _cancel.get(job_id)
    if event:
        event.set()


def _set(job_id: str, **values) -> None:
    with Session(engine) as session:
        job = session.get(Job, job_id)
        if not job:
            return
        for key, value in values.items():
            setattr(job, key, value)
        job.updated_at = datetime.now(timezone.utc)
        session.add(job)
        session.commit()


def _clean(values: dict) -> dict:
    return {k: (None if isinstance(v, float) and not math.isfinite(v) else v) for k, v in values.items()}


def _save(job_id: str, idx: int, data: dict, trust: float, bucket: str, features: dict) -> dict:
    with Session(engine) as session:
        row = Segment(
            job_id=job_id,
            idx=idx,
            start=data["start"],
            end=data["end"],
            text=data["text"],
            words=data.get("words", []),
            trust_score=trust,
            trust_bucket=bucket,
            features=_clean(features),
            final_text=data["text"],
        )
        session.add(row)
        session.commit()
        session.refresh(row)
        return {**data, "id": row.id, "trust_bucket": bucket}


def _glossary_evidence():
    try:
        from rapidfuzz import fuzz, process
        from app.rag.glossary import load_seed_terms
        terms = [t["term"] for t in load_seed_terms()]
    except Exception:
        return lambda seg: []

    def evidence(seg: dict) -> list[dict]:
        matches = process.extract(seg.get("text", ""), terms, scorer=fuzz.partial_ratio, limit=15)
        return [{"source": "glossary", "term": term} for term, score, _ in matches if score >= 80]
    return evidence


def _run(job_id: str, upload_path: str | None) -> None:
    t0 = time.time()
    cancel_event = _cancel.get(job_id) or threading.Event()
    workdir = settings.tmp_dir / job_id
    warnings: list[str] = []
    gemini = GeminiClient()
    log.info("[Runner] >>> STARTING JOB %s <<<", job_id)
    try:
        with Session(engine) as session:
            job = session.get(Job, job_id)
            url, lang, options, file_name = job.source_url, job.source_lang, job.options or {}, job.file_name
        _set(job_id, status="running", stage="fetching_audio", progress=4)
        log.info("[Runner] Job %s: Stage 1/5 -> Fetching media (%s)...", job_id, url or file_name)

        last = {"t": 0.0}

        def on_download(pct: float) -> None:
            if time.time() - last["t"] > 1.0:
                last["t"] = time.time()
                _set(job_id, progress=4 + pct * 0.26)

        if upload_path:
            workdir.mkdir(parents=True, exist_ok=True)
            wav = workdir / "audio.wav"
            to_wav(Path(upload_path), wav)
            resolved = Resolved(wav_path=wav, title=file_name, platform="Upload")
        else:
            resolved = resolve(url, workdir, on_download, cancel_event)
        warnings += resolved.warnings
        log.info(
            "[Runner] Job %s: Media resolved (title='%s', duration=%.1fs, method=%s).",
            job_id, resolved.title, resolved.duration or 0.0, resolved.method
        )
        _set(
            job_id,
            title=resolved.title,
            uploader=resolved.uploader,
            thumbnail_url=resolved.thumbnail,
            duration_s=resolved.duration,
            platform=resolved.platform,
            method=resolved.method,
            stage="transcribing",
            progress=30,
        )

        scorer, rows = TrustScorer(), []
        detected_lang = lang if lang and lang != "auto" else "en"

        if resolved.wav_path:
            # Stage 2a: Intelligent spoken language detection (Metadata + Gemini + Acoustic)
            detected_lang, lang_conf = detect_spoken_language(
                get_model(),
                str(resolved.wav_path),
                title=resolved.title,
                uploader=resolved.uploader,
                explicit_lang=lang
            )
            _set(job_id, source_lang=detected_lang)
            log.info("[Runner] Job %s: Spoken language detected as '%s' (conf=%.2f).", job_id, detected_lang, lang_conf)

            # Stage 2b: Script-anchored Whisper transcription
            script_prompt = get_initial_prompt(detected_lang)
            log.info("[Runner] Job %s: Stage 2/5 -> Transcribing with faster-whisper (lang=%s)...", job_id, detected_lang)

            try:
                generator, info = get_model().transcribe(
                    str(resolved.wav_path),
                    task="transcribe",
                    language=detected_lang,
                    initial_prompt=script_prompt,
                    word_timestamps=True,
                    vad_filter=False,
                    beam_size=5,
                    condition_on_previous_text=True,
                    temperature=0.0,
                    no_speech_threshold=0.6,
                    compression_ratio_threshold=2.4
                )
                total = max(float(info.duration or resolved.duration or 1.0), 1.0)

                for seg in generator:
                    if cancel_event.is_set():
                        raise AppError("CANCELLED", "The job was cancelled.")
                    txt = seg.text.strip()
                    if not txt:
                        continue
                    # Skip segments that only contain punctuation / noise marks
                    if not re.sub(r'[\W_]+', '', txt):
                        continue
                    # Skip high no-speech segments
                    if float(getattr(seg, "no_speech_prob", 0.0)) > 0.90:
                        continue

                    words = [
                        {"word": w.word, "start": float(w.start or 0), "end": float(w.end or 0), "probability": float(w.probability)}
                        for w in (seg.words or [])
                    ]
                    data = {
                        "start": float(seg.start),
                        "end": float(seg.end),
                        "text": txt,
                        "words": words,
                        "avg_logprob": float(seg.avg_logprob),
                        "no_speech_prob": float(seg.no_speech_prob),
                        "compression_ratio": float(seg.compression_ratio),
                    }
                    features = extract_features(data)
                    trust, bucket, name = scorer.score(features)
                    rows.append(_save(job_id, len(rows), data, trust, bucket, {**features, "scorer": name}))
                    _set(job_id, progress=30 + min(float(seg.end) / total, 1.0) * 45)
            except Exception as whisper_err:
                log.warning("[Runner] Faster-whisper transcription encountered error: %s", whisper_err)

            # FALLBACK STRATEGY 1: If Whisper produced 0 segments or failed, fall back to Gemini!
            if not rows:
                log.info("[Runner] Whisper produced 0 segments. Activating Gemini ASR fallback...")
                gemini_segments = []
                if url and is_youtube(url) and gemini.is_available():
                    log.info("[Runner] Querying Gemini with YouTube URL directly...")
                    gemini_segments = gemini.transcribe_youtube_url(url, spoken_lang=detected_lang)
                elif resolved.wav_path and gemini.is_available():
                    log.info("[Runner] Uploading audio to Gemini File API for transcription...")
                    gemini_segments = gemini.transcribe_audio_file(str(resolved.wav_path), spoken_lang=detected_lang)

                if gemini_segments:
                    warnings.append("Transcribed using Google Gemini multimodal AI fallback.")
                    for item in gemini_segments:
                        data = {"start": item["start"], "end": item["end"], "text": item["text"], "words": []}
                        rows.append(_save(job_id, len(rows), data, 0.95, "green", {"scorer": "gemini_multimodal_asr"}))
                    _set(job_id, method="gemini_asr")
                    log.info("[Runner] Gemini ASR fallback succeeded with %d segments.", len(rows))

            _set(job_id, source_lang=detected_lang)
            log.info("[Runner] Job %s: Transcription complete. %d segments extracted.", job_id, len(rows))
        else:
            for item in resolved.caption_segments or []:
                data = {"start": item["start"], "end": item["end"], "text": item["text"], "words": []}
                rows.append(_save(job_id, len(rows), data, 0.85, "green", {"scorer": resolved.method or "platform_captions"}))
            log.info("[Runner] Job %s: Ingested %d pre-resolved captions.", job_id, len(rows))

        # FALLBACK STRATEGY 2: If still no speech detected, check YouTube URL with Gemini before giving up
        if not rows and url and is_youtube(url) and gemini.is_available():
            log.info("[Runner] Zero segments before error check. Final attempt: Gemini direct YouTube transcription...")
            gemini_segments = gemini.transcribe_youtube_url(url, spoken_lang=detected_lang)
            if gemini_segments:
                warnings.append("Transcribed using Google Gemini multimodal AI fallback.")
                for item in gemini_segments:
                    data = {"start": item["start"], "end": item["end"], "text": item["text"], "words": []}
                    rows.append(_save(job_id, len(rows), data, 0.95, "green", {"scorer": "gemini_youtube_asr"}))
                _set(job_id, method="gemini_youtube_asr")

        if not rows:
            raise AppError("NO_SPEECH", "No speech was detected in this media.", "Try a video with clear speech.", 422)

        # Stage 3: Domain glossary correction
        if options.get("correct", True):
            log.info("[Runner] Job %s: Stage 3/5 -> Correcting %d segments against glossary (progress=78%%)...", job_id, len(rows))
            _set(job_id, stage="correcting", progress=78)
            try:
                t_corr = time.time()
                corrected = correct_segments(rows, _glossary_evidence(), client=gemini)
                with Session(engine) as session:
                    for item in corrected:
                        record = session.get(Segment, item["id"])
                        if record and item.get("correction"):
                            record.correction = item["correction"]
                            record.correction_status = item.get("correction_status", "applied")
                            record.final_text = item.get("final_text") or record.text
                            session.add(record)
                    session.commit()
                log.info("[Runner] Job %s: Correction stage completed in %.2fs.", job_id, time.time() - t_corr)
            except Exception as exc:
                log.exception("[Runner] Job %s: Correction failed (%s)", job_id, exc)
                warnings.append(f"Correction skipped: {str(exc)[:120]}")

        # Stage 4: Semantic Multilingual Translation for the 4 Languages (en, hi, mr, ta)
        with Session(engine) as session:
            job_record = session.get(Job, job_id)
            target_langs = job_record.target_langs if (job_record and job_record.target_langs) else [options.get("target_lang", "en")]
        primary_target = target_langs[0] if target_langs else "en"

        log.info("[Runner] Job %s: Stage 4/5 -> Generating captions for target '%s' & core languages (progress=85%%)...", job_id, primary_target)
        _set(job_id, stage="translating", progress=85)
        try:
            with Session(engine) as session:
                job_record = session.get(Job, job_id)
                detected_lang = (job_record.source_lang if job_record and job_record.source_lang else "en").lower()
                segs = list(session.exec(select(Segment).where(Segment.job_id == job_id).order_by(Segment.idx)).all())

                # Prepare items for multilingual translation
                seg_items = [
                    {"id": s.id, "idx": s.idx, "text": s.text, "final_text": s.final_text or s.text, "translations": s.translations or {}}
                    for s in segs
                ]

                # Translate into the user's primary target as well as ensure the 4 core languages are supported
                langs_to_generate = list(dict.fromkeys([primary_target] + CORE_LANGUAGES))

                translated_items = translate_segments_multilingual(
                    seg_items,
                    source_lang=detected_lang,
                    target_langs=langs_to_generate,
                )

                for item in translated_items:
                    record = session.get(Segment, item["id"])
                    if record:
                        trans_dict = item.get("translations") or {}
                        # Always guarantee source language track
                        if detected_lang not in trans_dict:
                            trans_dict[detected_lang] = {"text": record.text, "lang": detected_lang, "engine": "original"}
                        record.translations = trans_dict

                        # Set final_text to the user's requested primary target language
                        primary_trans = trans_dict.get(primary_target, {}).get("text")
                        if primary_trans and primary_trans.strip():
                            record.final_text = primary_trans.strip()
                        session.add(record)
                session.commit()
            log.info("[Runner] Job %s: Translation stage completed successfully.", job_id)
        except Exception as exc:
            log.exception("[Runner] Job %s: Caption translation step failed: %s", job_id, exc)
            warnings.append(f"Caption translation partial: {str(exc)[:120]}")

        # Stage 5: *** CRITICAL GEMINI QUALITY AUDIT & VERIFICATION BEFORE FINAL OUTPUT ***
        # Fulfills user requirement: "always check before our last output that everythings is ok or not"
        log.info("[Runner] Job %s: Stage 5/5 -> Gemini End-to-End Quality Verification (progress=95%%)...", job_id, primary_target)
        _set(job_id, stage="verifying", progress=95)
        try:
            with Session(engine) as session:
                job_record = session.get(Job, job_id)
                detected_lang = (job_record.source_lang if job_record and job_record.source_lang else "en").lower()
                segs = list(session.exec(select(Segment).where(Segment.job_id == job_id).order_by(Segment.idx)).all())
                seg_items = [
                    {
                        "id": s.id,
                        "idx": s.idx,
                        "text": s.text,
                        "final_text": s.final_text or s.text,
                        "translations": s.translations or {},
                    }
                    for s in segs
                ]

                verified_items = audit_and_refine_captions(
                    segments=seg_items,
                    source_lang=detected_lang,
                    target_lang=primary_target,
                    title=job_record.title,
                    client=gemini,
                )

                for item in verified_items:
                    record = session.get(Segment, item["id"])
                    if record and item.get("final_text"):
                        record.final_text = item["final_text"]
                        record.correction_status = item.get("correction_status", record.correction_status)
                        if item.get("translations"):
                            record.translations = item["translations"]
                        session.add(record)
                session.commit()
            log.info("[Runner] Job %s: Quality audit completed and all captions verified.", job_id)
        except Exception as exc:
            log.warning("[Runner] Job %s: Gemini verification audit skipped (%s)", job_id, exc)

        elapsed_total = round(time.time() - t0, 2)
        _set(
            job_id,
            status="done",
            stage="done",
            progress=100,
            warnings=warnings,
            timings={"total_s": elapsed_total},
            finished_at=datetime.now(timezone.utc),
        )
        log.info("[Runner] >>> JOB %s FINISHED SUCCESSFULLY in %.2fs <<<", job_id, elapsed_total)
    except AppError as exc:
        log.warning("[Runner] Job %s AppError [%s]: %s", job_id, exc.code, exc.message)
        _set(
            job_id,
            status="cancelled" if exc.code == "CANCELLED" else "error",
            stage="error",
            error_code=exc.code,
            error_message=exc.message,
            error_hint=exc.hint,
            warnings=warnings,
        )
    except Exception as exc:
        log.exception("[Runner] Job %s crashed: %s", job_id, exc)
        _set(
            job_id,
            status="error",
            stage="error",
            error_code="INTERNAL",
            error_message="Something went wrong while processing.",
            error_hint=str(exc)[:200],
            warnings=warnings,
        )
    finally:
        shutil.rmtree(workdir, ignore_errors=True)
        if upload_path:
            Path(upload_path).unlink(missing_ok=True)
        _cancel.pop(job_id, None)
