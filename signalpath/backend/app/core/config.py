"""Settings and filesystem locations for SignalPath."""

from pathlib import Path
from typing import Any
from pydantic import AliasChoices, Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]

class Settings(BaseSettings):
    """Environment-backed configuration with safe local defaults."""
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", extra="ignore", protected_namespaces=("settings_",))
    env: str = "dev"
    api_prefix: str = "/api/v1"
    cors_origins: list[str] = Field(default_factory=lambda: [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "http://localhost:3002",
        "http://127.0.0.1:3002",
    ])
    data_dir: Path = BACKEND_DIR / "data"
    db_path: Path = BACKEND_DIR / "data" / "signalpath.db"
    index_dir: Path = BACKEND_DIR / "data" / "indexes"
    model_dir: Path = BACKEND_DIR / "app" / "ml" / "artifacts"
    asr_provider: str = "auto"          # auto | groq | local | gemini
    whisper_model: str = Field(default="small", validation_alias=AliasChoices("WHISPER_MODEL", "WHISPER_MODEL_SIZE"))
    whisper_compute: str = "int8"
    whisper_device: str = "cpu"
    asr_batch: int = 8
    beam_size: int = 2
    cpu_threads: int = 0
    groq_api_key: str = ""
    groq_model: str = "whisper-large-v3-turbo"
    max_crosscheck_segs: int = 40
    window_s: float = 30.0
    window_overlap_s: float = 1.5
    max_video_minutes: int = 60
    max_upload_mb: int = 500
    job_workers: int = 2
    cache_ttl_h: int = 168
    ffmpeg_path: str = "ffmpeg"
    ytdlp_cookies_file: str = "cookies.txt"
    ytdlp_cookies_from_browser: str = ""
    auth_required: bool = False
    clerk_issuer: str = ""
    clerk_jwks_url: str = ""
    ytdlp_sleep_s: float = 1.0
    gemini_api_key: str = ""
    gemini_api_key_backup: str = Field(default="", validation_alias=AliasChoices("GEMINI_API_KEY_BACKUP", "GEMINI_BACKUP_API_KEY"))
    gemini_model: str = "gemini-flash-lite-latest"
    hf_token: str = ""
    diarize: str = "off"
    embed_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    embed_model_multi: str = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
    tmp_dir: Path = BACKEND_DIR / "data" / "tmp"
    log_level: str = "INFO"
    gemini_rpm: int = 10
    max_corrections_per_job: int = 300
    translator: str = "google"      # google (fast, default) | gemini (higher quality, slower)
    max_backtrans_per_job: int = 200
    chunk_min_s: float = 45.0
    chunk_max_s: float = 60.0
    summary_min_support: float = 0.40
    ask_min_score: float = 0.30
    event_retention_days: int = 7
    llm_cache_path: Path = BACKEND_DIR / "data" / "llm_cache.sqlite"

    @model_validator(mode="after")
    def resolve_paths(self):
        for name in ("data_dir", "db_path", "index_dir", "model_dir", "tmp_dir", "llm_cache_path"):
            value = getattr(self, name)
            if not value.is_absolute():
                if name == "db_path" and value.parent == Path("."):
                    value = self.data_dir / value
                else:
                    value = BACKEND_DIR / value
                setattr(self, name, value.resolve())
        return self

    def ensure_directories(self) -> None:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.index_dir.mkdir(parents=True, exist_ok=True)
        self.model_dir.mkdir(parents=True, exist_ok=True)
        self.tmp_dir.mkdir(parents=True, exist_ok=True)

    def model_dump_for_log(self) -> dict[str, Any]:
        values = self.model_dump()
        values["gemini_api_key"] = "<set>" if self.gemini_api_key else "<unset>"
        values["hf_token"] = "<set>" if self.hf_token else "<unset>"
        return values

settings = Settings()
