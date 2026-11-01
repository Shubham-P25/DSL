"""End-to-end smoke test for a running SignalPath backend."""
from __future__ import annotations
import argparse, json, sys, time
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

def call(base: str, path: str, method: str = "GET", body: dict | None = None):
    data = json.dumps(body).encode() if body is not None else None
    request = Request(base.rstrip("/") + path, data=data, method=method, headers={"Content-Type": "application/json"})
    try:
        with urlopen(request, timeout=15) as response: return response.status, json.loads(response.read())
    except HTTPError as error:
        try:
            payload = json.loads(error.read())
        except json.JSONDecodeError:
            payload = {"error": {"message": error.reason}}
        return error.code, payload

def main() -> int:
    parser = argparse.ArgumentParser(); parser.add_argument("--url", required=True); parser.add_argument("--base", default="http://127.0.0.1:8000/api/v1"); args = parser.parse_args()
    status, probe = call(args.base, "/url/probe", "POST", {"url": args.url})
    if status != 200 or not probe.get("ok"): print(f"probe failed: {status} {probe}", file=sys.stderr); return 1
    _, created = call(args.base, "/jobs", "POST", {"url": args.url, "target_langs": ["hi", "mr"], "options": {"correct": True, "summarize": True}})
    job_id = created["job_id"]; print(f"job_id={job_id}")
    deadline = time.time() + 3600
    while time.time() < deadline:
        _, value = call(args.base, f"/jobs/{job_id}")
        job = value["job"]
        print(f"stage={job['stage']} progress={job['progress']}")
        if job["status"] in {"done", "error", "cancelled"}: break
        time.sleep(2)
    if job["status"] != "done": print(f"job did not finish: {job}", file=sys.stderr); return 1
    _, summary = call(args.base, f"/jobs/{job_id}/summary")
    print(json.dumps({"segments": len(value["segments"]), "summary_method": summary.get("method")}))
    output = Path(f"signalpath-{job_id[:8]}.srt")
    request = Request(args.base.rstrip("/") + f"/jobs/{job_id}/export?format=srt&lang=en")
    with urlopen(request, timeout=15) as response: output.write_bytes(response.read())
    print(f"srt={output.resolve()}"); return 0

if __name__ == "__main__": raise SystemExit(main())

