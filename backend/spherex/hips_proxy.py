"""Relay a few IRSA-hosted HiPS sky surveys to the browser, with CORS + a disk cache.

Why: Aladin Lite (WebGL) needs CORS headers on every tile. IRSA's HiPS copies of
2MASS / AllWISE / DSS2 do not send them, and the CDS originals (Strasbourg) are not
reachable from every network. Our backend already sends CORS, so it can relay IRSA.

Safety: this is NOT an open proxy. Only the surveys in ALLOWED are relayed, and only
paths made of plain file-name characters (no "..", no query strings).
Survey list source: https://irsa.ipac.caltech.edu/data/hips/list (checked 2026-11-05).
"""

from __future__ import annotations

import re
import urllib.error
import urllib.request
from pathlib import Path

from .cache import CACHE_DIR

IRSA_HIPS = "https://irsa.ipac.caltech.edu/data/hips/"
ALLOWED = {
    "CDS/2MASS/Color",
    "CDS/AllWISE/RGB-W4-W2-W1",
    "CDS/DSS2/color",
}
SAFE_PATH = re.compile(r"^[A-Za-z0-9_\-./]+$")
HIPS_CACHE = CACHE_DIR / "hips"
TIMEOUT_S = 20
USER_AGENT = "SPHEREx-Blink/0.8 (NASA Space Apps 2026 project)"

CONTENT_TYPES = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
                 ".fits": "application/fits", "": "text/plain; charset=utf-8"}


class NotAllowed(Exception):
    pass


def resolve(path: str) -> tuple[str, Path]:
    """Validate a requested path; return (upstream URL, cache file)."""
    if not SAFE_PATH.match(path) or ".." in path or path.startswith("/"):
        raise NotAllowed("bad path")
    survey = next((s for s in ALLOWED if path == s or path.startswith(s + "/")), None)
    if survey is None:
        raise NotAllowed("survey not in allowlist")
    rest = path[len(survey):].lstrip("/") or "properties"
    return IRSA_HIPS + survey + "/" + rest, HIPS_CACHE / survey / rest


def fetch(path: str) -> tuple[bytes, str]:
    """Return (content, content_type). Raises NotAllowed, FileNotFoundError or OSError."""
    url, cached = resolve(path)
    ctype = CONTENT_TYPES.get(cached.suffix.lower(), "application/octet-stream")
    if cached.exists():
        return cached.read_bytes(), ctype
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    for attempt in (1, 2):                            # IRSA is occasionally slow: retry once
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT_S / 2) as resp:
                data = resp.read()
            break
        except urllib.error.HTTPError as exc:
            if exc.code == 404:
                raise FileNotFoundError(path) from exc   # normal: tiles outside the survey footprint
            if attempt == 2 or exc.code < 500:
                raise
        except OSError:                                  # timeout / connection reset
            if attempt == 2:
                raise
    cached.parent.mkdir(parents=True, exist_ok=True)
    tmp = cached.with_name(cached.name + ".tmp")
    tmp.write_bytes(data)
    tmp.replace(cached)
    return data, ctype
