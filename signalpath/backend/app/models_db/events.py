"""Persisted job events used by reconnectable SSE streams."""
from datetime import datetime, timezone
from typing import Any, Optional
from sqlmodel import Column, Field, JSON, SQLModel

class JobEvent(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    job_id: str = Field(index=True, foreign_key="job.id")
    type: str
    payload: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    ts: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

