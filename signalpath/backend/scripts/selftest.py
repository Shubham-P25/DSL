import shutil, sys, tempfile, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.ingest.resolver import resolve
from app.ingest.urls import normalize_url

for line in Path(__file__).with_name("test_urls.txt").read_text(encoding="utf-8").splitlines():
    if not line.strip() or line.startswith("#"):
        continue
    started, workdir = time.time(), Path(tempfile.mkdtemp(prefix="sp-test-"))
    try:
        r = resolve(normalize_url(line), workdir)
        print("OK  ", line, "|", r.method, f"| {time.time() - started:.1f}s", r.warnings)
    except Exception as exc:
        print("FAIL", line, "|", getattr(exc, "code", type(exc).__name__), "|", getattr(exc, "message", exc))
    finally:
        shutil.rmtree(workdir, ignore_errors=True)
