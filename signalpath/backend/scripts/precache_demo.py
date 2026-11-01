import time
from pathlib import Path
import requests

API = "http://localhost:8000/api/v1"
for line in Path(__file__).with_name("demo_urls.txt").read_text(encoding="utf-8").splitlines():
    if not line.strip() or line.startswith("#"):
        continue
    started = time.time()
    response = requests.post(f"{API}/jobs", json={"url": line.strip()}, timeout=60)
    data = response.json()
    if "job_id" not in data:
        print("FAIL", line, data)
        continue
    job_id = data["job_id"]
    cached = data.get("cached", False)
    while True:
        snap = requests.get(f"{API}/jobs/{job_id}", timeout=30).json()
        status = snap["job"]["status"]
        if status in {"done", "error", "cancelled"}:
            break
        time.sleep(2)
    print(status.upper(), f"[cached={cached}]", line, job_id, f"{time.time() - started:.0f}s", len(snap["segments"]), "segments", snap["job"].get("error_code") or "")
