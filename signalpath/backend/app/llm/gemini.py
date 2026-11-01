"""Lazy Google GenAI client with automatic backup key rotation, resilient model fallback,
direct YouTube/audio transcription, and end-to-end caption verification.
"""
import json
import logging
import re
import threading
import time
from pathlib import Path
from typing import Any
from app.core.config import settings
from app.llm import cache

log = logging.getLogger(__name__)


class _Limiter:
    """Enforces request-per-minute rate limit for Gemini API calls to prevent 429 quota exhaustion."""
    def __init__(self, rpm: int):
        self.gap = 60.0 / max(rpm, 1)
        self.next = 0.0
        self.lock = threading.Lock()

    def wait(self):
        with self.lock:
            now = time.monotonic()
            delay = max(0.0, self.next - now)
            self.next = max(now, self.next) + self.gap
        if delay > 0:
            time.sleep(delay)


_limiter = _Limiter(settings.gemini_rpm)

# Key rotation state: 0 = primary key, 1 = backup key
_active_key_index = 0
_rotated_to_backup = False

# Robust model fallback list in order of preference
MODEL_CANDIDATES = [
    "gemini-flash-lite-latest",
    "gemini-3-flash-preview",
    "gemini-flash-latest",
]


def get_active_gemini_key() -> str:
    global _active_key_index
    keys = [settings.gemini_api_key.strip(), settings.gemini_api_key_backup.strip()]
    if _active_key_index == 1 and keys[1]:
        return keys[1]
    if keys[0]:
        return keys[0]
    return keys[1] if keys[1] else ""


def rotate_gemini_key() -> bool:
    """Shift from primary to backup key if backup exists. Returns True if successfully switched."""
    global _active_key_index, _rotated_to_backup
    backup = settings.gemini_api_key_backup.strip()
    if backup and _active_key_index == 0:
        _active_key_index = 1
        _rotated_to_backup = True
        banner = (
            "\n" + "=" * 65 + "\n"
            "[Gemini API] WARNING: Primary Gemini API key exhausted or rate-limited!\n"
            "[Gemini API] >>> SWITCHED TO BACKUP GEMINI API KEY <<<\n"
            + "=" * 65 + "\n"
        )
        print(banner, flush=True)
        log.warning(banner)
        return True
    return False


def _parse_time_sec(val: Any) -> float:
    """Parse time represented as float, int or string 'HH:MM:SS.mmm' / 'MM:SS' into seconds."""
    if isinstance(val, (int, float)):
        return max(0.0, float(val))
    val_str = str(val).strip()
    try:
        return float(val_str)
    except ValueError:
        pass
    parts = val_str.split(":")
    try:
        if len(parts) == 3:
            return float(parts[0]) * 3600 + float(parts[1]) * 60 + float(parts[2])
        if len(parts) == 2:
            return float(parts[0]) * 60 + float(parts[1])
    except Exception:
        pass
    return 0.0


def _parse_transcript_text(text: str) -> list[dict]:
    """Parse subtitle segments from raw text formatted like [MM:SS - MM:SS] text or similar."""
    segments = []
    pattern = re.compile(
        r'\[?(\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?)\s*(?:-|–|—|->|to)\s*(\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?)]?\s*[:\-]?\s*(.+)',
        re.MULTILINE
    )
    for m in pattern.finditer(text):
        s_str, e_str, seg_txt = m.group(1), m.group(2), m.group(3).strip()
        if seg_txt:
            start = _parse_time_sec(s_str)
            end = max(start + 1.0, _parse_time_sec(e_str))
            segments.append({"start": round(start, 2), "end": round(end, 2), "text": seg_txt})
    return segments


class GeminiClient:
    def __init__(self) -> None:
        self._client = None
        self._last_key = None
        self._timeout = 45.0

    def is_available(self) -> bool:
        return bool(get_active_gemini_key())

    def _get_client(self, timeout: float = 45.0):
        curr_key = get_active_gemini_key()
        if not curr_key:
            return None
        if self._client is None or self._last_key != curr_key or self._timeout != timeout:
            import httpx
            from google import genai
            from google.genai import types
            try:
                custom_httpx = httpx.Client(
                    timeout=httpx.Timeout(timeout, connect=15.0)
                )
                self._client = genai.Client(
                    api_key=curr_key,
                    http_options=types.HttpOptions(httpx_client=custom_httpx)
                )
                self._last_key = curr_key
                self._timeout = timeout
            except Exception as exc:
                log.warning("failed to initialize genai client: %s", exc)
                return None
        return self._client

    def _get_models_to_try(self, model: str | None = None) -> list[str]:
        chosen = model or settings.gemini_model
        models = [chosen]
        for m in MODEL_CANDIDATES:
            if m not in models:
                models.append(m)
        return models

    def generate_json(self, prompt: str, schema: dict | None = None, model: str | None = None, timeout: float = 45.0):
        models = self._get_models_to_try(model)
        cached = cache.get(models[0], prompt)
        if cached is not None:
            return cached
        if not self.is_available():
            return None
        _limiter.wait()

        from google.genai import types

        for selected_model in models:
            for attempt in range(2):
                client = self._get_client(timeout=timeout)
                if not client:
                    return None
                try:
                    response = client.models.generate_content(
                        model=selected_model,
                        contents=prompt,
                        config=types.GenerateContentConfig(response_mime_type="application/json")
                    )
                    value = json.loads(response.text)
                    cache.put(models[0], prompt, value)
                    return value
                except Exception as exc:
                    err_text = str(exc).lower()
                    is_quota = any(kw in err_text for kw in ["429", "resource_exhausted", "quota", "overloaded", "503", "limit"])
                    if is_quota and rotate_gemini_key():
                        continue
                    if "404" in err_text or "not_found" in err_text:
                        log.debug("Gemini model %s 404, falling back to next candidate", selected_model)
                        break
                    log.debug("Gemini attempt %d on %s failed: %s", attempt + 1, selected_model, exc)
                    if attempt < 1:
                        time.sleep(1.0)

        log.warning("Gemini JSON request failed across candidate models.")
        return None

    def generate_text(self, prompt: str, model: str | None = None, timeout: float = 45.0) -> str | None:
        if not self.is_available():
            return None
        _limiter.wait()
        models = self._get_models_to_try(model)

        for selected_model in models:
            for attempt in range(2):
                client = self._get_client(timeout=timeout)
                if not client:
                    return None
                try:
                    response = client.models.generate_content(
                        model=selected_model,
                        contents=prompt,
                    )
                    return response.text.strip()
                except Exception as exc:
                    err_text = str(exc).lower()
                    is_quota = any(kw in err_text for kw in ["429", "resource_exhausted", "quota", "overloaded", "503", "limit"])
                    if is_quota and rotate_gemini_key():
                        continue
                    if "404" in err_text or "not_found" in err_text:
                        break
                    if attempt < 1:
                        time.sleep(1.0)
        return None

    def transcribe_youtube_url(self, youtube_url: str, spoken_lang: str = "auto", timeout: float = 120.0) -> list[dict]:
        """Direct multimodal YouTube transcription with timestamps via Gemini.
        Returns list of segments: [{'start': float, 'end': float, 'text': str}].
        """
        if not self.is_available():
            return []
        _limiter.wait()

        from google.genai import types

        lang_instruction = (
            f"The spoken language is '{spoken_lang}'. Transcribe in that authentic script (Devanagari for Marathi/Hindi, Tamil for Tamil, English for English)."
            if spoken_lang and spoken_lang != "auto"
            else "Automatically detect the spoken language and transcribe in the authentic spoken script."
        )

        prompt = f"""You are a professional audio/video transcriber.
Transcribe all speech in this YouTube video accurately from start to finish.
{lang_instruction}

Format requirements:
Return a JSON list of subtitle segments:
[
  {{"start": 0.0, "end": 4.5, "text": "transcribed speech here"}},
  {{"start": 4.5, "end": 8.2, "text": "next spoken cue here"}}
]
Rules:
- Provide accurate start and end timestamps in seconds (float).
- Keep each segment natural and concise (2 to 7 seconds duration).
- Include all spoken speech faithfully without skipping words or summarizing.
- Strictly return JSON only.
"""

        models = self._get_models_to_try()
        for selected_model in models:
            for attempt in range(2):
                client = self._get_client(timeout=timeout)
                if not client:
                    return []
                try:
                    log.info("[Gemini ASR] Transcribing YouTube URL via %s...", selected_model)
                    response = client.models.generate_content(
                        model=selected_model,
                        contents=[
                            types.Part.from_uri(file_uri=youtube_url, mime_type="video/*"),
                            prompt
                        ],
                        config=types.GenerateContentConfig(response_mime_type="application/json")
                    )
                    raw_text = response.text.strip()
                    segments = []
                    try:
                        data = json.loads(raw_text)
                        if isinstance(data, list):
                            for item in data:
                                if isinstance(item, dict) and "text" in item:
                                    s = _parse_time_sec(item.get("start", 0))
                                    e = _parse_time_sec(item.get("end", s + 2.0))
                                    t = str(item.get("text", "")).strip()
                                    if t:
                                        segments.append({"start": round(s, 2), "end": round(max(e, s + 0.8), 2), "text": t})
                        elif isinstance(data, dict):
                            items = data.get("segments") or data.get("subtitles") or data.get("captions") or []
                            for item in items:
                                s = _parse_time_sec(item.get("start", 0))
                                e = _parse_time_sec(item.get("end", s + 2.0))
                                t = str(item.get("text", "")).strip()
                                if t:
                                    segments.append({"start": round(s, 2), "end": round(max(e, s + 0.8), 2), "text": t})
                    except Exception:
                        segments = _parse_transcript_text(raw_text)

                    if segments:
                        log.info("[Gemini ASR] Successfully extracted %d segments from YouTube URL via Gemini.", len(segments))
                        return segments
                except Exception as exc:
                    err_text = str(exc).lower()
                    is_quota = any(kw in err_text for kw in ["429", "resource_exhausted", "quota", "overloaded", "503", "limit"])
                    if is_quota and rotate_gemini_key():
                        continue
                    if "404" in err_text:
                        break
                    log.warning("[Gemini ASR] Attempt on %s failed: %s", selected_model, exc)
                    if attempt < 1:
                        time.sleep(2.0)

        log.warning("[Gemini ASR] Direct YouTube transcription failed across all candidate models.")
        return []

    def transcribe_audio_file(self, audio_path: str, spoken_lang: str = "auto", timeout: float = 120.0) -> list[dict]:
        """Upload and transcribe local audio file using Gemini Multimodal Files API."""
        _limiter.wait()
        if not self.is_available() or not Path(audio_path).exists():
            return []

        client = self._get_client(timeout=timeout)
        if not client:
            return []

        uploaded_file = None
        try:
            log.info("[Gemini ASR] Uploading audio file '%s' to Gemini File API...", audio_path)
            uploaded_file = client.files.upload(file=str(audio_path), mime_type="audio/wav")
            log.info("[Gemini ASR] Audio uploaded successfully (name=%s, uri=%s).", uploaded_file.name, uploaded_file.uri)

            from google.genai import types

            lang_instruction = (
                f"The spoken language is '{spoken_lang}'. Transcribe in that authentic script (Devanagari for Marathi/Hindi, Tamil for Tamil, English for English)."
                if spoken_lang and spoken_lang != "auto"
                else "Detect spoken language and transcribe in the authentic spoken script."
            )

            prompt = f"""You are a professional audio transcriber.
Transcribe all speech in this audio recording accurately into sequential subtitle cues.
{lang_instruction}

Format: Return a JSON array:
[
  {{"start": 0.0, "end": 4.0, "text": "transcribed speech here"}},
  {{"start": 4.0, "end": 8.5, "text": "next spoken cue here"}}
]
Ensure accurate timestamps in seconds (float). Keep segments 2-7 seconds. Strictly JSON.
"""
            models = self._get_models_to_try()
            for selected_model in models:
                try:
                    response = client.models.generate_content(
                        model=selected_model,
                        contents=[uploaded_file, prompt],
                        config=types.GenerateContentConfig(response_mime_type="application/json")
                    )
                    data = json.loads(response.text.strip())
                    segments = []
                    items = data if isinstance(data, list) else data.get("segments") or []
                    for item in items:
                        s = _parse_time_sec(item.get("start", 0))
                        e = _parse_time_sec(item.get("end", s + 2.0))
                        t = str(item.get("text", "")).strip()
                        if t:
                            segments.append({"start": round(s, 2), "end": round(max(e, s + 0.8), 2), "text": t})
                    if segments:
                        log.info("[Gemini ASR] Extracted %d segments from uploaded audio file via Gemini.", len(segments))
                        return segments
                except Exception as exc:
                    log.warning("[Gemini ASR] Audio transcription on %s failed: %s", selected_model, exc)
        except Exception as exc:
            log.warning("[Gemini ASR] Audio file upload / transcription error: %s", exc)
        finally:
            if uploaded_file and hasattr(uploaded_file, "name"):
                try:
                    client.files.delete(name=uploaded_file.name)
                except Exception:
                    pass
        return []

    def audit_and_verify_captions(
        self,
        segments: list[dict],
        source_lang: str = "en",
        target_lang: str = "en",
        title: str | None = None,
    ) -> list[dict]:
        """Audits all captions before final delivery:
        - Validates semantic accuracy and naturalness in target language (English, Marathi, Hindi, Tamil)
        - Corrects speech-to-text recognition errors and hallucinations
        - Ensures true meaning without phonetic transliteration
        """
        if not self.is_available() or not segments:
            return segments

        from app.langs.registry import LANGS
        src_name = LANGS[source_lang].name if source_lang in LANGS else source_lang
        tgt_name = LANGS[target_lang].name if target_lang in LANGS else target_lang

        batch_size = 15
        total_batches = (len(segments) + batch_size - 1) // batch_size
        log.info(
            "[Caption Audit] Running Gemini quality verification on %d segments (%s -> %s)...",
            len(segments), src_name, tgt_name
        )

        for b_idx in range(total_batches):
            batch_slice = segments[b_idx * batch_size : (b_idx + 1) * batch_size]
            items_to_audit = [
                {
                    "idx": s.get("idx", i),
                    "original": s.get("text", ""),
                    "current": s.get("final_text") or s.get("text", ""),
                }
                for i, s in enumerate(batch_slice)
            ]

            prompt = f"""You are a senior subtitle quality inspector and linguistic auditor.
A video titled '{title or "Untitled Video"}' was transcribed (original: {src_name}) and captioned in {tgt_name}.
Audit these subtitle cues to ensure 100% correctness and naturalness.

Audit Checklist:
1. Fix any speech recognition typos or misheard words.
2. Remove any repetitive loops or hallucinated filler words.
3. If {tgt_name} is Marathi, Hindi, or Tamil:
   - Ensure the meaning matches the natural, spoken native phrasing.
   - Strictly avoid literal phonetic transliteration (e.g. English words written in Devanagari/Tamil letters).
4. Preserve segment boundaries and tone.

Input segments:
{json.dumps(items_to_audit, ensure_ascii=False)}

Return a JSON array of objects:
[
  {{"idx": 0, "verified_text": "audited perfected text", "changed": false}}
]
"""
            result = self.generate_json(prompt, timeout=35.0)
            if result and isinstance(result, list):
                audit_map = {item.get("idx"): item.get("verified_text") for item in result if isinstance(item, dict) and "idx" in item and item.get("verified_text")}
                for s in batch_slice:
                    s_idx = s.get("idx")
                    verified = audit_map.get(s_idx)
                    if verified and verified.strip():
                        s["final_text"] = verified.strip()
                        s["correction_status"] = "verified_by_gemini"
                        if "translations" in s and target_lang in s["translations"]:
                            s["translations"][target_lang]["text"] = verified.strip()
                            s["translations"][target_lang]["verified"] = True

        log.info("[Caption Audit] Gemini quality audit completed successfully.")
        return segments
