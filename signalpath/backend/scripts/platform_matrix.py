"""Run probe and record outcomes for URLs listed in docs/test_urls.txt."""
from __future__ import annotations
import json, sys
from pathlib import Path
from urllib.request import Request, urlopen

def main() -> int:
    root = Path(__file__).resolve().parents[2]; source = root / "docs" / "test_urls.txt"; rows = []
    for line in source.read_text(encoding="utf-8").splitlines() if source.exists() else []:
        url, _, comment = line.partition("#"); url = url.strip()
        if not url: continue
        try:
            request = Request("http://127.0.0.1:8000/api/v1/url/probe", data=json.dumps({"url": url}).encode(), headers={"Content-Type": "application/json"}, method="POST")
            with urlopen(request, timeout=15) as response: value = json.loads(response.read()); rows.append((comment.strip() or value.get("platform", "unknown"), "PASS", "not run", "not run", value.get("title", "")))
        except Exception as exc: rows.append((comment.strip() or "unknown", "FAIL", "not run", "not run", str(exc)))
    output = ["# Platform support", "", "| Platform | Probe | Stream | ASR | Notes |", "|---|---|---|---|---|"]
    output += [f"| {platform} | {probe} | {stream} | {asr} | {notes.replace('|', '/') } |" for platform, probe, stream, asr, notes in rows]
    (root / "docs" / "platform_support.md").write_text("\n".join(output) + "\n", encoding="utf-8"); print((root / "docs" / "platform_support.md")); return 0
if __name__ == "__main__": raise SystemExit(main())

