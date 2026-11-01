"""Structured logging helpers with job context."""
import contextvars
import logging

job_id_context: contextvars.ContextVar[str | None] = contextvars.ContextVar("job_id", default=None)

class JobContextFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.job_id = job_id_context.get() or "-"
        return True

def configure_logging() -> None:
    handler = logging.StreamHandler()
    handler.addFilter(JobContextFilter())
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s job=%(job_id)s %(name)s: %(message)s"))
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(logging.INFO)

