"""Core job, segment, summary, and library tables."""
from datetime import datetime, timezone
from typing import Any, Optional
from sqlmodel import Column, Field, JSON, SQLModel

def utc_now() -> datetime:
    return datetime.now(timezone.utc)

class Job(SQLModel, table=True):
    id: str = Field(primary_key=True)
    user_id: str = Field(default="anon", index=True)
    source_url: Optional[str] = None
    source_kind: str = "url"
    platform: Optional[str] = None
    title: Optional[str] = None
    uploader: Optional[str] = None
    thumbnail_url: Optional[str] = None
    duration_s: Optional[float] = None
    mode: str = "transcribe"
    source_lang: str = "auto"
    target_langs: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    options: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    file_name: Optional[str] = None
    method: Optional[str] = None
    status: str = "queued"
    stage: str = "queued"
    progress: float = 0.0
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    error_hint: Optional[str] = None
    warnings: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    timings: dict[str, float] = Field(default_factory=dict, sa_column=Column(JSON))
    cache_key: Optional[str] = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)
    finished_at: Optional[datetime] = None

    @property
    def job_id(self) -> str:
        return self.id

    @property
    def stage_text(self) -> str:
        return self.stage

class Segment(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    job_id: str = Field(index=True, foreign_key="job.id")
    idx: int = 0
    start: float
    end: float
    text: str
    words: list[dict[str, Any]] = Field(default_factory=list, sa_column=Column(JSON))
    trust_score: Optional[float] = None
    trust_bucket: str = "yellow"
    features: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    correction: Optional[str] = None
    correction_evidence: list[dict[str, Any]] = Field(default_factory=list, sa_column=Column(JSON))
    correction_status: str = "none"
    final_text: Optional[str] = None
    translations: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    speaker: Optional[str] = None
    human_edited: bool = False
    human_approved: bool = False

class Summary(SQLModel, table=True):
    job_id: str = Field(primary_key=True, foreign_key="job.id")
    tldr: str = ""
    key_points: list[dict[str, Any]] = Field(default_factory=list, sa_column=Column(JSON))
    chapters: list[dict[str, Any]] = Field(default_factory=list, sa_column=Column(JSON))
    keywords: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    grounding_score: Optional[float] = None
    method: str = "extractive"
    model: Optional[str] = None
    translations: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=utc_now)

class Chunk(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    job_id: str = Field(index=True, foreign_key="job.id")
    idx: int
    start_s: float
    end_s: float
    text: str
    embedding: bytes | None = None

class VideoLibraryEntry(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    job_id: str = Field(index=True, foreign_key="job.id")
    video_title: str = ""
    chunk_text: str
    timestamp: float = 0.0


class TranslationCache(SQLModel, table=True):
    key: str = Field(primary_key=True)
    text: str
    created_at: datetime = Field(default_factory=utc_now)
