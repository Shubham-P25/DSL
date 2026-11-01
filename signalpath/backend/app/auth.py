"""Clerk session-token verification (RS256 via JWKS). AUTH_REQUIRED=false keeps demo-safe anonymous mode."""
from functools import lru_cache
import jwt
from fastapi import Header
from jwt import PyJWKClient
from app.core.config import settings
from app.core.errors import AppError


@lru_cache(maxsize=1)
def _jwks() -> PyJWKClient:
    return PyJWKClient(settings.clerk_jwks_url, cache_keys=True)


def _decode(token: str) -> dict:
    key = _jwks().get_signing_key_from_jwt(token).key
    return jwt.decode(token, key, algorithms=["RS256"], issuer=settings.clerk_issuer or None,
                      leeway=10, options={"verify_aud": False})


def current_user(authorization: str | None = Header(default=None)) -> str:
    token = authorization.split(" ", 1)[1] if authorization and authorization.lower().startswith("bearer ") else None
    if not token or not settings.clerk_jwks_url:
        if settings.auth_required:
            raise AppError("UNAUTHENTICATED", "Please sign in.", "Sign in and try again.", 401)
        return "anon"
    try:
        return _decode(token)["sub"]
    except Exception:
        if settings.auth_required:
            raise AppError("UNAUTHENTICATED", "Your session is invalid or expired.", "Sign in again.", 401)
        return "anon"
