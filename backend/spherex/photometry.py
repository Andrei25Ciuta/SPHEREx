"""Aperture photometry at one sky position, on every frame that covers it.

Same algorithm as aperturePhotometry() in frontend/js/data/mockSource.js, so mock and
real behave alike: sum inside a circle of radius r (pixels) minus the median background
of a ring from r+2 to r+5 pixels; error from the ring's scatter. Units = image units
(BUNIT) times pixels – NOT a calibrated flux. Good enough to compare frames.
"""

from __future__ import annotations

import numpy as np

from .cutout import cutout, target_wcs
from .flags import bad_mask
from .query import FrameFile


def aperture(img: np.ndarray, x: float, y: float, r: float):
    """x, y in 'edge' pixel coordinates (pixel i spans [i, i+1)). Returns (flux, err) or None."""
    ny, nx = img.shape
    yy, xx = np.mgrid[0:ny, 0:nx]
    d = np.hypot(xx + 0.5 - x, yy + 0.5 - y)
    finite = np.isfinite(img)
    inside = img[(d <= r) & finite]
    ring = img[(d >= r + 2) & (d <= r + 5) & finite]
    if inside.size == 0 or ring.size < 5:
        return None
    bg = float(np.median(ring))
    flux = float(inside.sum() - bg * inside.size)
    err = float(np.std(ring, ddof=1) * np.sqrt(inside.size))
    return round(flux, 4), round(err, 4)


def measure(frames: list[FrameFile], ra: float, dec: float, radius_px: float = 2.0) -> list[dict]:
    points = []
    for f in frames:
        size = int(2 * (radius_px + 6))                      # just big enough for the ring
        tgt, npix = target_wcs(ra, dec, size * f.pixel_scale_arcsec / 60, f.pixel_scale_arcsec)
        img, flags = cutout(f, tgt, npix)
        res = aperture(img, npix / 2, npix / 2, radius_px)   # target is exactly in the centre
        c = npix // 2
        flagged = bool(flags is not None and np.any(bad_mask(flags[c - 2:c + 3, c - 2:c + 3])))
        points.append({
            "mjd": round(f.mjd, 6),
            "dateISO": f.date_iso,
            "detector": f.detector,
            "wavelengthUm": round((f.wave_min_um + f.wave_max_um) / 2, 4),
            "wavelengthMinUm": round(f.wave_min_um, 4),
            "wavelengthMaxUm": round(f.wave_max_um, 4),
            "flux": res[0] if res else None,
            "fluxErr": res[1] if res else None,
            "flagged": flagged,
        })
    return points
