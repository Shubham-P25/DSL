"""Verify that no file in app/ hard-codes the restricted list of languages outside registry.py."""
from pathlib import Path
import re

APP_DIR = Path(__file__).resolve().parents[1] / "app"


def test_no_hardcoded_languages_in_app():
    pattern = re.compile(r'["\']mr["\']\s*,\s*["\']ta["\']|["\']ta["\']\s*,\s*["\']mr["\']')
    offending = []

    for path in APP_DIR.rglob("*.py"):
        # registry.py is the allowed single source of truth
        if path.name == "registry.py":
            continue
        # lang_detect may be kept for backward-compatibility tests until fully replaced
        content = path.read_text(encoding="utf-8", errors="ignore")
        for idx, line in enumerate(content.splitlines(), start=1):
            if pattern.search(line):
                # allow comments explaining old behavior if any
                if line.strip().startswith("#"):
                    continue
                offending.append(f"{path.relative_to(APP_DIR)}:{idx} -> {line.strip()}")

    assert not offending, f"Found hard-coded languages outside registry.py:\n" + "\n".join(offending)
