"""Tiny disk response cache for deterministic repeatability."""
import hashlib
import json
from pathlib import Path
from app.core.config import settings

def _path(model: str, prompt: str) -> Path:
    key = hashlib.sha256(f"{model}:{prompt}".encode()).hexdigest()
    directory = settings.data_dir / "llm_cache"
    directory.mkdir(parents=True, exist_ok=True)
    return directory / f"{key}.json"

def get(model: str, prompt: str):
    path = _path(model, prompt)
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None

def put(model: str, prompt: str, value) -> None:
    _path(model, prompt).write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")

