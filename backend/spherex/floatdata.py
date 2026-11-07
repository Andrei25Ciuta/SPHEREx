"""The cutout pixels as real numbers, for detection (the PNG is only 8 bits).

A 8-bit picture clips bright stars into flat blobs and rounds faint ones away. "Find movers" gets
better positions from the float values: background-subtracted, little-endian float32, rows flipped
exactly like the PNG (row 0 = north), NaN where the cutout has no data.
"""

from __future__ import annotations

import numpy as np


def float_cutout_bytes(img: np.ndarray) -> bytes:
    """Raw bytes of the float32 image (n*n values). The frontend reads them with `new Float32Array(buffer)`."""
    median = float(np.nanmedian(img)) if np.isfinite(img).any() else 0.0
    sub = np.asarray(img, dtype=np.float64) - median
    return np.ascontiguousarray(np.flipud(sub)).astype("<f4").tobytes()
