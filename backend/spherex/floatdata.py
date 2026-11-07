"""The cutout pixels as real numbers, for detection (the PNG is only 8 bits).

A 8-bit picture clips bright stars into flat blobs and rounds faint ones away. "Find movers" gets
better positions from the float values: background-subtracted, little-endian float32, rows flipped
exactly like the PNG (row 0 = north), NaN where the cutout has no data.
"""

from __future__ import annotations

import numpy as np

from .flags import bad_mask


def mask_cutout_bytes(flags: np.ndarray | None, shape: tuple[int, int]) -> bytes:
    """One byte per pixel, same orientation as the float file (row 0 = north): 1 = a BAD flag bit is set (overflow, transient,
    SUR error, hot/cold pixel ...), 0 = usable. A saturated star has its core marked, so the frontend can fit its position on the
    wings only (real Barnard's Star: 3.7"/yr off with all pixels, 0.5"/yr with the marked ones left out). No flags = all zero."""
    bad = np.zeros(shape, dtype=bool) if flags is None else bad_mask(flags)
    return np.ascontiguousarray(np.flipud(bad)).astype(np.uint8).tobytes()


def float_cutout_bytes(img: np.ndarray) -> bytes:
    """Raw bytes of the float32 image (n*n values). The frontend reads them with `new Float32Array(buffer)`."""
    median = float(np.nanmedian(img)) if np.isfinite(img).any() else 0.0
    sub = np.asarray(img, dtype=np.float64) - median
    return np.ascontiguousarray(np.flipud(sub)).astype("<f4").tobytes()
