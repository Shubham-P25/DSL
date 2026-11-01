"""One place that builds yt-dlp options: cookies (file OR browser, never both), JS runtime, client fallbacks."""
import shutil
from pathlib import Path
from app.core.config import settings, BACKEND_DIR
from app.ingest.urls import is_youtube


def cookie_opts() -> dict:
    """cookies.txt wins. Browser cookies only if no file exists. Never both."""
    file_value = (settings.ytdlp_cookies_file or "").strip()
    if file_value:
        path = Path(file_value)
        path = path if path.is_absolute() else BACKEND_DIR / path
        if path.exists():
            return {"cookiefile": str(path)}
    browser = (settings.ytdlp_cookies_from_browser or "").strip()
    if browser:
        name, _, profile = browser.partition(":")
        return {"cookiesfrombrowser": (name, profile or None)}
    return {}


def _js_runtimes() -> dict:
    runtimes = {}
    for name in ("deno", "node"):
        found = shutil.which(name)
        if found:
            runtimes[name] = {"path": found}
    return runtimes


def base_opts(client: list[str] | None = None, use_cookies: bool = True) -> dict:
    opts = {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "socket_timeout": 30,
        "retries": 3,
        "extractor_retries": 3,
        "geo_bypass": True,
        "http_headers": {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Sec-Fetch-Mode": "navigate",
        },
    }
    runtimes = _js_runtimes()
    if runtimes:
        opts["js_runtimes"] = runtimes
    if use_cookies:
        opts.update(cookie_opts())
    if client:
        opts["extractor_args"] = {"youtube": {"player_client": client}}
    return opts


def attempts_for(url: str) -> list[dict]:
    """Ordered strategies. Client names can drift as YouTube changes; update yt-dlp first if all fail."""
    has_cookies = bool(cookie_opts())
    if is_youtube(url):
        plan = [(None, True), (["tv", "web_safari"], True), (["mweb"], True),
                (["android_vr"], False), (["ios"], False), (None, False)]
    else:
        plan = [(None, True), (None, False)]
    seen, attempts = set(), []
    for client, wants_cookies in plan:
        use = wants_cookies and has_cookies
        key = (tuple(client or []), use)
        if key in seen:
            continue
        seen.add(key)
        attempts.append({"client": client, "cookies": use})
    return attempts
