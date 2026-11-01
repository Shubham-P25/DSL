"""Audio loading and decoding using PyAV. No external ffmpeg binary required."""
import logging
import shutil
from pathlib import Path
import numpy as np
from faster_whisper.audio import decode_audio  # uses PyAV shipped with faster-whisper

log = logging.getLogger(__name__)


def load_audio(path: str | Path) -> np.ndarray:
    """Decode audio directly into float32 16kHz mono NumPy array using PyAV."""
    return decode_audio(str(path), sampling_rate=16000)


def ffmpeg_path() -> str | None:
    """Return path to ffmpeg executable: system path first, then bundled imageio_ffmpeg."""
    p = shutil.which("ffmpeg")
    if p:
        return p
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return None

