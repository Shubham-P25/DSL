"""Platform adapter protocol and MediaResult data contract."""
from dataclasses import dataclass, field
from typing import Protocol
import numpy as np


@dataclass
class MediaResult:
    audio: np.ndarray | None            # float32 mono 16 kHz, None if only captions were found
    duration: float | None
    title: str | None
    uploader: str | None
    thumbnail: str | None
    platform: str                        # "youtube" | "instagram" | "facebook" | "other" | "upload"
    video_id: str | None
    native_captions: list[dict] | None   # [{start,end,text}] if the platform already has them
    native_caption_kind: str | None      # "manual" | "auto" | None
    method: str                          # which ladder step worked
    warnings: list[str] = field(default_factory=list)


class PlatformAdapter(Protocol):
    name: str

    def match(self, url: str) -> bool:
        ...

    def fetch(self, url: str, cancel, warnings: list[str]) -> MediaResult:
        ...
