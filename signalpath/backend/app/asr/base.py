"""Data contracts and protocol for speech recognition providers."""
from dataclasses import dataclass, field
from typing import Callable, Protocol
import numpy as np


@dataclass
class Word:
    text: str
    start: float
    end: float
    prob: float | None = None            # engine probability, 0..1
    acc: float | None = None             # filled by verify: estimated accuracy 0..1
    flags: list[str] = field(default_factory=list)   # "low_prob","lexicon_miss","wrong_script","asr_disagree","llm_suspect"
    alt: str | None = None               # suggested replacement, never auto-applied

    def to_dict(self) -> dict:
        return {
            "t": self.text,
            "s": round(self.start, 2),
            "e": round(self.end, 2),
            "p": round(self.prob, 3) if self.prob is not None else None,
            "acc": round(self.acc, 3) if self.acc is not None else None,
            "f": self.flags,
            "alt": self.alt,
            # Backwards-compatible aliases
            "text": self.text,
            "start": self.start,
            "end": self.end,
            "prob": self.prob,
        }


@dataclass
class Seg:
    start: float
    end: float
    text: str
    words: list[Word]
    lang: str
    avg_logprob: float | None = None
    no_speech_prob: float | None = None
    compression_ratio: float | None = None
    acc: float | None = None             # segment accuracy = f(word acc)

    def to_dict(self) -> dict:
        return {
            "start": round(self.start, 2),
            "end": round(self.end, 2),
            "text": self.text,
            "words": [w.to_dict() for w in self.words],
            "lang": self.lang,
            "acc": self.acc,
        }


class ASRProvider(Protocol):
    def transcribe(
        self,
        audio: np.ndarray,
        lang: str,
        on_seg: Callable[[Seg, float | None], None],
        cancel,
    ) -> None:
        ...

