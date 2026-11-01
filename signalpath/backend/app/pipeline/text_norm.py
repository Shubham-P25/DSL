"""Versioned metric normalization."""
import re
import unicodedata
def normalize(text: str) -> str:
    return re.sub(r"\s+", " ", "".join(char.lower() if char.isalnum() or char.isspace() else " " for char in unicodedata.normalize("NFKC", text))).strip()

