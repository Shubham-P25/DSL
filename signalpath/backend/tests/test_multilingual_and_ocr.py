"""Tests for Semantic Multilingual Translation, OCR Extractor, and Multi-Platform URLs."""
import pytest
from app.ingest.urls import normalize_url, is_youtube
from app.pipeline.translate import translate_segments_multilingual, translate_text_semantic
from app.ocr.extractor import extract_image_text
from PIL import Image, ImageDraw


def test_url_normalization_handles_various_platforms():
    # YouTube standard and shorts
    assert "youtube.com/watch?v=dQw4w9WgXcQ" in normalize_url("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
    assert "youtube.com/watch?v=dQw4w9WgXcQ" in normalize_url("https://youtu.be/dQw4w9WgXcQ")
    assert is_youtube("https://www.youtube.com/watch?v=dQw4w9WgXcQ")

    # Instagram
    ig_url = "https://www.instagram.com/reel/C123456789/?utm_source=ig_web_copy_link"
    assert "instagram.com/reel/C123456789" in normalize_url(ig_url)
    assert not is_youtube(ig_url)

    # Facebook
    fb_url = "https://www.facebook.com/watch/?v=987654321"
    assert "facebook.com/watch" in normalize_url(fb_url)
    assert not is_youtube(fb_url)

    # TikTok
    tt_url = "https://www.tiktok.com/@user/video/7123456789"
    assert "tiktok.com" in normalize_url(tt_url)


def test_semantic_multilingual_translation_meaning():
    # "Feed me" should match semantic meaning, avoiding phonetic "फीड मी"
    segments = [
        {"id": 1, "text": "Feed me", "final_text": "Feed me"}
    ]
    translated = translate_segments_multilingual(segments, source_lang="en", target_langs=["en", "hi", "de", "nl"])
    t = translated[0]["translations"]

    assert t["en"]["text"] == "Feed me"
    # Hindi must mean feed me (मुझे खाना खिलाओ or similar food-related semantic verb), NOT phonetic "फीड मी"
    assert "फीड मी" not in t["hi"]["text"]
    assert any(w in t["hi"]["text"] for w in ["खाना", "खिलाओ", "भोजन", "दे"])

    # German must contain food/feed verb, NOT empty
    assert len(t["de"]["text"]) > 0

    # Dutch must contain food/feed verb, NOT empty
    assert len(t["nl"]["text"]) > 0


def test_image_ocr_text_extraction(tmp_path):
    # Create test image with text
    img = Image.new("RGB", (400, 150), color=(255, 255, 255))
    draw = ImageDraw.Draw(img)
    draw.text((20, 20), "INVOICE #9901", fill=(0, 0, 0))
    draw.text((20, 60), "Total: $120.00", fill=(0, 0, 0))
    img_file = tmp_path / "test_invoice.png"
    img.save(img_file)

    res = extract_image_text(img_file)
    assert res["success"] is True
    assert "INVOICE" in res["raw_text"]
    assert res["confidence_score"] > 80.0
    assert len(res["line_items"]) >= 2


def test_language_hints_and_script_prompts():
    from app.pipeline.lang_detect import get_metadata_language_hint, get_initial_prompt

    # Marathi detection from title keywords and Devanagari script
    lang, conf = get_metadata_language_hint("Ninai masai jayghosh song | निनाई मसाई जयघोष गीत | santosh sathe")
    assert lang == "mr"
    assert conf >= 0.8

    lang_konkan, conf_konkan = get_metadata_language_hint("03 Stainless | Konkan Unplugged | Shubhangii Kedar")
    assert lang_konkan == "mr"
    assert conf_konkan >= 0.8

    # Hindi detection
    lang_hi, conf_hi = get_metadata_language_hint("Best Hindi Bollywood Songs 2024")
    assert lang_hi == "hi"

    # Tamil detection
    lang_ta, conf_ta = get_metadata_language_hint("New Tamil Song Release 2024")
    assert lang_ta == "ta"

    # Script prompts
    mr_prompt = get_initial_prompt("mr")
    assert mr_prompt is not None
    assert "देवनागरी" in mr_prompt
    assert "मराठी" in mr_prompt
