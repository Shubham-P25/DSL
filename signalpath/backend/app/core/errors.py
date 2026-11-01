"""Typed application errors and consistent HTTP error responses."""
import logging
from fastapi import Request
from fastapi.responses import JSONResponse

class AppError(Exception):
    DEFAULTS = {
        "URL_INVALID": (400, False, "Paste a full public http(s) link."), "URL_UNSUPPORTED": (422, False, "Site not supported by yt-dlp."),
        "AUTH_REQUIRED": (403, False, "Configure cookies or upload the file."), "PRIVATE_OR_REMOVED": (404, False, "Video is private, deleted or unavailable."),
        "GEO_BLOCKED": (451, False, "This source is not available in this country."), "EXTRACTOR_OUTDATED": (502, True, "Run pip install -U yt-dlp."),
        "LIVE_UNSUPPORTED": (422, False, "Use the recording after the live stream ends."), "TOO_LONG": (413, False, "The source exceeds the configured limit."),
        "UPLOAD_INVALID": (415, False, "Upload a supported media file."), "FFMPEG_MISSING": (503, False, "Install ffmpeg and restart the terminal."),
        "MODEL_MISSING": (503, True, "Check internet access and retry."), "ASR_FAILED": (500, True, "Retry with a smaller Whisper model."),
        "NOT_READY": (409, True, "Wait for the requested stage to finish."), "NOT_FOUND": (404, False, "Unknown job, segment, or term."),
        "CANCELLED": (409, False, "The job was cancelled."), "VALIDATION": (422, False, "Check the request body."), "RATE_LIMITED": (429, True, "Wait and retry."),
        "INTERNAL": (500, True, "Check the server log."), "GEO_BLOCKED": (451, False, "Not available in this country."),
    }
    def __init__(self, code: str, message: str, hint: str = "", http_status: int = 400, retryable: bool = False):
        super().__init__(message)
        default_status, default_retry, default_hint = self.DEFAULTS.get(code, (http_status, retryable, ""))
        self.code, self.message, self.hint = code, message, hint
        self.http_status, self.retryable = (http_status if http_status != 400 or code not in self.DEFAULTS else default_status), (retryable or default_retry)
        if not self.hint:
            self.hint = default_hint

async def app_error_handler(_: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(status_code=exc.http_status, content={"error": {"code": exc.code, "message": exc.message, "hint": exc.hint, "retryable": exc.retryable}})

async def unhandled_error_handler(_: Request, exc: Exception) -> JSONResponse:
    logging.getLogger(__name__).exception("Unhandled application error", exc_info=exc)
    return JSONResponse(status_code=500, content={"error": {"code": "INTERNAL", "message": "The server could not complete the request.", "hint": "Check the backend logs and retry.", "retryable": True}})
