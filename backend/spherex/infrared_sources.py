"""Conservative 2-D infrared source candidates from calibrated FITS cutouts.

This is spatial source detection, NOT an astrophysical classification or a
claim of an uncatalogued object. Work on linear science pixels, never PNGs.
"""
from __future__ import annotations

import numpy as np


def detect_sources(image, bad_mask=None, *, threshold_sigma=5.0,
                   min_separation=3, max_sources=200, border=3):
    """Return bright local maxima with robust background/noise estimates.

    Parameters are in pixels, except threshold_sigma. This intentionally
    avoids interpolation over bad pixels and rejects peaks at masked pixels.
    The returned flux is a local background-subtracted 3x3 sum in native
    image units (not Jansky unless input was calibrated to Jy/pixel).
    """
    a = np.asarray(image, dtype=float)
    if a.ndim != 2:
        raise ValueError("Expected a 2-D science image")
    if not (3 <= threshold_sigma <= 30):
        raise ValueError("threshold_sigma must be between 3 and 30")
    if not (1 <= min_separation <= 30):
        raise ValueError("min_separation must be between 1 and 30")
    if not (1 <= max_sources <= 1000):
        raise ValueError("max_sources must be between 1 and 1000")
    if not (1 <= border <= 30):
        raise ValueError("border must be between 1 and 30")
    bad = ~np.isfinite(a)
    if bad_mask is not None:
        m = np.asarray(bad_mask)
        if m.shape != a.shape:
            raise ValueError("Bad-pixel mask must match image shape")
        bad |= m.astype(bool)
    valid = ~bad
    if valid.sum() < 25:
        return {"sources": [], "background": None, "noise": None,
                "valid_fraction": float(valid.mean())}
    sample = a[valid]
    bg = float(np.median(sample))
    mad = float(np.median(np.abs(sample - bg)))
    noise = 1.4826 * mad
    if not np.isfinite(noise) or noise <= 0:
        # A flat field is not evidence of detections.
        return {"sources": [], "background": bg, "noise": 0.0,
                "valid_fraction": float(valid.mean())}
    height, width = a.shape
    margin = max(border, 1)
    yy, xx = np.where(valid & (a > bg + threshold_sigma * noise))
    ranked = sorted(zip(yy.tolist(), xx.tolist()),
                    key=lambda p: float(a[p[0], p[1]]), reverse=True)
    selected = []
    radius2 = min_separation ** 2
    for y, x in ranked:
        if y < margin or x < margin or y >= height - margin or x >= width - margin:
            continue
        patch = a[y-1:y+2, x-1:x+2]
        patch_bad = bad[y-1:y+2, x-1:x+2]
        if patch_bad.any() or a[y, x] < np.max(patch):
            continue
        if any((x - s["x"])**2 + (y - s["y"])**2 < radius2 for s in selected):
            continue
        # Require an unmasked local aperture; do not invent missing flux.
        ap = a[y-1:y+2, x-1:x+2]
        flux = float(np.sum(ap - bg))
        if flux <= 0:
            continue
        selected.append({"x": int(x), "y": int(y),
                         "peak_snr": round(float((a[y, x] - bg) / noise), 2),
                         "aperture_flux_native": round(flux, 6)})
        if len(selected) >= max_sources:
            break
    return {"sources": selected, "background": bg, "noise": noise,
            "valid_fraction": float(valid.mean())}
