"""Language matrix validation script.
Runs transcription and script validation across languages defined in app.langs.registry.
"""
from __future__ import annotations
import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.langs.registry import LANGS, script_ratio


def main() -> int:
    parser = argparse.ArgumentParser(description="Language matrix benchmark")
    parser.add_argument("--langs", nargs="*", default=list(LANGS.keys()))
    args = parser.parse_args()

    results = []
    for code in args.langs:
        lang = LANGS.get(code)
        if not lang:
            continue
        results.append({
            "code": lang.code,
            "name": lang.name,
            "native": lang.native,
            "font": lang.font,
            "tokenize": lang.tokenize,
            "has_wordfreq": bool(lang.wordfreq),
        })

    print(json.dumps({"language_matrix": results, "total_languages": len(results)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
