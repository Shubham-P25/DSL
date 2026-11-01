"""Languages endpoint exposing the single source of truth language registry."""
from fastapi import APIRouter
from app.langs.registry import LANGS

router = APIRouter(prefix="/languages", tags=["languages"])


@router.get("")
def list_languages() -> list[dict]:
    return [
        {
            "code": l.code,
            "name": l.name,
            "native": l.native,
            "font": l.font,
            "tokenize": l.tokenize,
        }
        for l in LANGS.values()
    ]
