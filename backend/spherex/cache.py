"""Disk cache for finished responses: cache/<key>.json + cache/<key>_<i>.png.

The key covers the query AND the exact input files (path + modification time) AND the
stretch version, so a changed file or algorithm never serves a stale image.
URLs are stored RELATIVE ("cutouts/<file>.png"); app.py adds the server address.
"""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path

CACHE_DIR = Path(os.environ.get("SPHEREX_CACHE_DIR", Path(__file__).resolve().parents[1] / "cache"))
CACHE_DIR.mkdir(parents=True, exist_ok=True)


def make_key(*parts) -> str:
    return hashlib.sha1(json.dumps(parts, sort_keys=True, default=str).encode()).hexdigest()[:20]


def load(key: str):
    p = CACHE_DIR / f"{key}.json"
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def save_png(key: str, i: int | str, png: bytes) -> str:
    name = f"{key}_{i}.png"
    (CACHE_DIR / name).write_bytes(png)
    return f"cutouts/{name}"


def save(key: str, frames: list[dict]):
    tmp = CACHE_DIR / f"{key}.json.tmp"
    tmp.write_text(json.dumps(frames), encoding="utf-8")
    tmp.replace(CACHE_DIR / f"{key}.json")      # atomic: never a half-written file
