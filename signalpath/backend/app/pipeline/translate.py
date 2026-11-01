"""Shim forwarding to new lazy translation service in app.translate."""
from app.translate.service import (
    translate_job_language,
    translate_segments_multilingual,
    translate_text_semantic,
)

__all__ = [
    "translate_job_language",
    "translate_segments_multilingual",
    "translate_text_semantic",
]
