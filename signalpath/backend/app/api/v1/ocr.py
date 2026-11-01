import uuid
import httpx
from fastapi import APIRouter, File, Form, UploadFile
from pydantic import BaseModel
from typing import Optional
from sqlmodel import Session
from app.core.db import engine
from app.core.errors import AppError
from app.models_db.tables import Job
from app.ocr.extractor import extract_image_text

router = APIRouter(prefix="/ocr", tags=["ocr"])

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/bmp", "image/tiff", "application/octet-stream"}


class UrlOcrRequest(BaseModel):
    image_url: str


@router.post("/extract")
async def extract_from_upload(
    file: Optional[UploadFile] = File(None),
    image_url: Optional[str] = Form(None),
):
    """Extract and intelligently structure text from an image file or public image URL."""
    img_bytes = None

    if file and file.filename:
        if file.content_type and file.content_type.lower() not in ALLOWED_TYPES:
            raise AppError("IMAGE_INVALID", "Unsupported image format.", "Upload a PNG, JPEG, WEBP, or BMP image.", 415)
        img_bytes = await file.read()
        if len(img_bytes) == 0:
            raise AppError("IMAGE_EMPTY", "Uploaded file is empty.", "Please select a valid image.", 400)
        if len(img_bytes) > 25 * 1024 * 1024:
            raise AppError("IMAGE_TOO_LARGE", "Image exceeds 25 MB limit.", "Resize or compress the image.", 413)

    elif image_url and image_url.strip():
        url = image_url.strip()
        try:
            async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
                resp = await client.get(url, headers={"User-Agent": "SignalPath-OCR/1.0"})
                if resp.status_code != 200:
                    raise AppError("FETCH_FAILED", f"Could not download image (HTTP {resp.status_code}).", "Check that the URL is public and direct.", 422)
                img_bytes = resp.content
        except AppError:
            raise
        except Exception as exc:
            raise AppError("FETCH_FAILED", "Could not fetch image from the provided URL.", str(exc), 422)

    else:
        raise AppError("MISSING_INPUT", "Please upload an image file or provide an image URL.", "Use the upload box.", 400)

    try:
        result = extract_image_text(img_bytes)

        # Persist to Library as an Image OCR record
        try:
            with Session(engine) as session:
                fname = file.filename if (file and file.filename) else (image_url.split("/")[-1].split("?")[0] if image_url else "image.png")
                title = fname or "Image Extraction"
                job_id = str(uuid.uuid4())
                ocr_job = Job(
                    id=job_id,
                    user_id="anon",
                    source_kind="image_ocr",
                    platform="Image OCR",
                    title=f"OCR: {title}",
                    file_name=fname,
                    status="done",
                    stage="done",
                    progress=100.0,
                    options={
                        "document_type": result.get("document_type", "General Document"),
                        "word_count": result.get("word_count", 0),
                        "line_count": result.get("line_count", 0),
                        "confidence_score": result.get("confidence_score", 0.9),
                        "detected_language": result.get("detected_language", "en"),
                        "full_text": result.get("full_text", ""),
                        "lines": result.get("lines", [])[:40],
                    }
                )
                session.add(ocr_job)
                session.commit()
                result["job_id"] = job_id
        except Exception:
            pass

        return result
    except Exception as exc:
        raise AppError("OCR_FAILED", "Failed to extract text from this image.", str(exc)[:200], 500)

