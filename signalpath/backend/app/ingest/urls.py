"""URL cleaning and validation. Accepts messy input (no scheme, tracking params, shorts/live links)."""
import re
from ipaddress import ip_address
from urllib.parse import urlparse, urlunparse
from app.core.errors import AppError

_YT_ID = re.compile(r"(?:v=|youtu\.be/|/shorts/|/embed/|/live/|/v/)([A-Za-z0-9_-]{11})")


def _is_yt_host(host: str) -> bool:
    return host.endswith("youtube.com") or host == "youtu.be" or host.endswith("youtube-nocookie.com")


def is_youtube(url: str) -> bool:
    return _is_yt_host((urlparse(url).hostname or "").lower())


def youtube_id(url: str) -> str | None:
    match = _YT_ID.search(url)
    return match.group(1) if match else None


def normalize_url(raw: str) -> str:
    url = (raw or "").strip().strip("\"'")
    if not url:
        raise AppError("URL_INVALID", "Paste a video link.", "Copy the link from the address bar or share menu.")
    if not re.match(r"^https?://", url, re.I):
        url = "https://" + url
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    if "." not in host:
        raise AppError("URL_INVALID", "That does not look like a link.", "Paste a full link such as https://youtube.com/watch?v=...")
    if host == "localhost" or host.endswith(".local"):
        raise AppError("URL_INVALID", "Local addresses are not allowed.", "Use a public video link.")
    try:
        addr = ip_address(host)
        if addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_reserved:
            raise AppError("URL_INVALID", "Private network addresses are not allowed.", "Use a public video link.")
    except ValueError:
        pass
    if _is_yt_host(host):
        vid = youtube_id(url)
        if vid:
            return f"https://www.youtube.com/watch?v={vid}"
    return urlunparse(parsed._replace(fragment=""))
