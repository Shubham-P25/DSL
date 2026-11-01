"""Thread-safe in-process event bus backed by SQLite event records."""
import asyncio
import json
import logging
import threading
from collections import defaultdict
from collections.abc import AsyncGenerator
from sqlmodel import Session, select
from app.core.db import engine
from app.models_db.events import JobEvent

class EventBus:
    def __init__(self) -> None:
        # Each queue is paired with its owning event loop so we can
        # schedule puts from background threads.
        self._queues: dict[str, set[tuple[asyncio.Queue[JobEvent], asyncio.AbstractEventLoop]]] = defaultdict(set)
        self._lock = threading.Lock()

    def publish(self, job_id: str, event_type: str, payload: dict) -> JobEvent:
        with Session(engine) as session:
            event = JobEvent(job_id=job_id, type=event_type, payload=payload)
            session.add(event)
            session.commit()
            session.refresh(event)
        with self._lock:
            pairs = list(self._queues.get(job_id, set()))
        for queue, loop in pairs:
            try:
                loop.call_soon_threadsafe(queue.put_nowait, event)
            except RuntimeError:
                logging.getLogger(__name__).debug("SSE loop already closed", exc_info=True)
        return event

    async def subscribe(self, job_id: str, last_event_id: int = 0) -> AsyncGenerator[JobEvent, None]:
        queue: asyncio.Queue[JobEvent] = asyncio.Queue()
        loop = asyncio.get_event_loop()
        with Session(engine) as session:
            replay = session.exec(select(JobEvent).where(JobEvent.job_id == job_id, JobEvent.id > last_event_id).order_by(JobEvent.id)).all()
        pair = (queue, loop)
        with self._lock:
            self._queues[job_id].add(pair)
        try:
            for event in replay:
                yield event
            while True:
                yield await queue.get()
        finally:
            with self._lock:
                self._queues[job_id].discard(pair)

event_bus = EventBus()

def sse_line(event: JobEvent) -> str:
    return f"id: {event.id}\nevent: {event.type}\ndata: {json.dumps(event.payload)}\n\n"
