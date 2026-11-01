"""Intelligent Image Text Extractor (OCR & Structured Formatting).
Extracts every piece of text from images and structures it cleanly
(document type, key-values, tables, markdown, and confidence metrics).
"""
import re
import time
import logging
from pathlib import Path
from typing import Any
from PIL import Image
import numpy as np

log = logging.getLogger(__name__)

_ocr_engine = None


def get_ocr_engine():
    global _ocr_engine
    if _ocr_engine is None:
        try:
            from rapidocr_onnxruntime import RapidOCR
            _ocr_engine = RapidOCR()
        except Exception as exc:
            log.exception("RapidOCR initialization failed: %s", exc)
            raise RuntimeError(f"OCR engine could not be initialized: {exc}")
    return _ocr_engine


def _detect_doc_type(text_lower: str) -> str:
    if any(k in text_lower for k in ["invoice", "inv-", "inv #", "bill to", "due date", "amount due"]):
        return "Invoice"
    if any(k in text_lower for k in ["receipt", "cashier", "subtotal", "tax", "total change", "visa", "mastercard"]):
        return "Receipt"
    if any(k in text_lower for k in ["tel:", "phone:", "email:", "www.", "manager", "ceo", "director", "consultant"]):
        return "Business Card / Contact"
    if any(k in text_lower for k in ["stop", "speed limit", "caution", "danger", "warning", "exit", "way out"]):
        return "Signboard / Notice"
    if any(k in text_lower for k in ["passport", "license", "republic", "identity", "dob", "expiry"]):
        return "ID Document"
    if any(k in text_lower for k in ["table of contents", "chapter", "abstract", "summary", "introduction"]):
        return "Academic / Book Page"
    return "Standard Document"


def _extract_key_values(lines: list[str]) -> list[dict[str, str]]:
    kv_pairs: list[dict[str, str]] = []
    # Patterns for key-value extraction like "Key: Value" or "Key - Value" or "Key = Value"
    kv_pattern = re.compile(r"^([\w\s#/-]{2,30}?)\s*[:=–-]\s*(.+)$")

    for line in lines:
        cleaned = line.strip()
        match = kv_pattern.match(cleaned)
        if match:
            k, v = match.group(1).strip(), match.group(2).strip()
            if len(k) > 1 and len(v) > 0 and not k.lower().startswith("http"):
                kv_pairs.append({"key": k, "value": v})
        elif "$" in cleaned or "₹" in cleaned or "€" in cleaned or "£" in cleaned:
            # Check price or amount pattern
            amount_match = re.search(r"([A-Za-z\s]{3,20})\s*([$₹€£]\s*[\d,]+(?:\.\d{2})?)", cleaned)
            if amount_match:
                kv_pairs.append({"key": amount_match.group(1).strip(), "value": amount_match.group(2).strip()})

    return kv_pairs


def _build_markdown_presentation(doc_type: str, lines: list[str], kv: list[dict[str, str]]) -> str:
    md = []
    md.append(f"## 📄 {doc_type} Text Summary\n")

    if kv:
        md.append("### 🔑 Key Data Points\n")
        md.append("| Field | Value |")
        md.append("| :--- | :--- |")
        for item in kv:
            clean_k = item['key'].replace('|', '\\|')
            clean_v = item['value'].replace('|', '\\|')
            md.append(f"| **{clean_k}** | `{clean_v}` |")
        md.append("\n")

    md.append("### 📝 Full Extracted Content\n")
    for line in lines:
        if line.strip():
            md.append(f"- {line.strip()}")

    return "\n".join(md)


def extract_image_text(image_input: str | Path | bytes | Image.Image) -> dict[str, Any]:
    """Run OCR and parse structured formatting."""
    t0 = time.time()
    pil_img = None

    if isinstance(image_input, (str, Path)):
        pil_img = Image.open(str(image_input)).convert("RGB")
    elif isinstance(image_input, bytes):
        import io
        pil_img = Image.open(io.BytesIO(image_input)).convert("RGB")
    elif isinstance(image_input, Image.Image):
        pil_img = image_input.convert("RGB")
    else:
        raise ValueError("Unsupported image input type.")

    width, height = pil_img.size
    img_np = np.array(pil_img)

    engine = get_ocr_engine()
    results, elapse = engine(img_np)

    line_items: list[dict[str, Any]] = []
    raw_lines: list[str] = []
    confidences: list[float] = []

    if results:
        for idx, item in enumerate(results):
            # item format in RapidOCR: [box, text, score]
            box = item[0]
            text = str(item[1]).strip()
            score = float(item[2])
            if text:
                raw_lines.append(text)
                confidences.append(score)
                line_items.append({
                    "id": idx + 1,
                    "text": text,
                    "confidence": round(score * 100, 1),
                    "box": box if isinstance(box, list) else None,
                })

    full_text = "\n".join(raw_lines)
    full_text_lower = full_text.lower()
    doc_type = _detect_doc_type(full_text_lower)
    key_values = _extract_key_values(raw_lines)
    avg_conf = round(sum(confidences) / len(confidences) * 100, 1) if confidences else 0.0
    markdown_doc = _build_markdown_presentation(doc_type, raw_lines, key_values)

    elapsed_ms = round((time.time() - t0) * 1000)

    # Detect language simple heuristic
    has_devanagari = bool(re.search(r"[\u0900-\u097F]", full_text))
    has_tamil = bool(re.search(r"[\u0B80-\u0BFF]", full_text))
    detected_lang = "Hindi / Marathi (Devanagari)" if has_devanagari else "Tamil" if has_tamil else "English / Latin"

    return {
        "success": True,
        "document_type": doc_type,
        "detected_language": detected_lang,
        "confidence_score": avg_conf,
        "word_count": len(full_text.split()),
        "line_count": len(raw_lines),
        "image_dimensions": {"width": width, "height": height},
        "raw_text": full_text,
        "structured_key_values": key_values,
        "formatted_markdown": markdown_doc,
        "line_items": line_items,
        "processing_time_ms": elapsed_ms,
    }
