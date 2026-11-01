"""Single SQLModel engine, session dependency, and SQLite pragmas."""
from collections.abc import Generator
from sqlalchemy import event
from sqlmodel import Session, SQLModel, create_engine
from app.core.config import settings

engine = create_engine(f"sqlite:///{settings.db_path}", connect_args={"check_same_thread": False})

@event.listens_for(engine, "connect")
def _sqlite_pragmas(dbapi_connection, _connection_record) -> None:
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()

def init_db() -> None:
    # Import models before create_all so direct callers and test fixtures register every table.
    import app.models_db.tables  # noqa: F401
    import app.models_db.events  # noqa: F401
    settings.ensure_directories()
    SQLModel.metadata.create_all(engine)

def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
