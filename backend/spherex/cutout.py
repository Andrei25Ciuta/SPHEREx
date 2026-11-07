"""Cut a square, NORTH-UP patch around (ra, dec) out of one frame.

Why not just astropy's Cutout2D? Each SPHEREx exposure can be rotated differently on the
sky. Cutout2D keeps the native orientation, so the stars would spin around between frames
and the blink would be useless. Instead we define ONE target grid (north up, east left,
same pixel scale) and sample every frame onto it. Nearest-neighbour sampling keeps the
original pixel values (no smoothing) – good enough for a blink, and honest about the
~6"/px resolution.
"""

from __future__ import annotations

import math

import numpy as np
from astropy.io import fits
from astropy.wcs import WCS

from .flags import bad_mask
from .query import FrameFile


def target_wcs(ra: float, dec: float, fov_arcmin: float, pixel_scale_arcsec: float) -> tuple[WCS, int]:
    """North-up TAN grid centred on (ra, dec). Returns (wcs, npix)."""
    npix = max(8, math.ceil(fov_arcmin * 60 / pixel_scale_arcsec))
    w = WCS(naxis=2)
    w.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    w.wcs.crval = [ra, dec]
    w.wcs.crpix = [(npix + 1) / 2, (npix + 1) / 2]          # FITS is 1-based
    s = pixel_scale_arcsec / 3600
    w.wcs.cd = [[-s, 0.0], [0.0, s]]                        # east to the left
    return w, npix


def _bilinear(data: np.ndarray, sx: np.ndarray, sy: np.ndarray) -> np.ndarray:
    """Sample `data` at fractional pixel positions (0-based, pixel centres at integers).

    NaN-aware: a neighbour that is NaN or outside the frame gets no weight and the rest are
    re-normalised; no usable neighbour gives NaN. Keeps star positions to a small fraction of a
    pixel, where nearest-neighbour sampling moves every star by up to +-0.5 px (random from frame
    to frame, because each exposure is rotated differently) - enough to hide a slow mover.
    """
    ny, nx = data.shape
    sx = np.where(np.isfinite(sx), sx, -10.0)
    sy = np.where(np.isfinite(sy), sy, -10.0)
    x0 = np.floor(sx).astype(np.int64)
    y0 = np.floor(sy).astype(np.int64)
    fx, fy = sx - x0, sy - y0
    num = np.zeros(sx.shape)
    den = np.zeros(sx.shape)
    for dx, dy, w in ((0, 0, (1 - fx) * (1 - fy)), (1, 0, fx * (1 - fy)), (0, 1, (1 - fx) * fy), (1, 1, fx * fy)):
        xi, yi = x0 + dx, y0 + dy
        ok = (xi >= 0) & (xi < nx) & (yi >= 0) & (yi < ny)
        vals = np.full(sx.shape, np.nan)
        vals[ok] = data[yi[ok], xi[ok]]
        good = ok & np.isfinite(vals)
        num[good] += w[good] * vals[good]
        den[good] += w[good]
    out = np.full(sx.shape, np.nan, dtype=np.float32)
    has = den > 1e-9
    out[has] = (num[has] / den[has]).astype(np.float32)
    return out


def cutout(frame: FrameFile, tgt: WCS, npix: int, method: str = "bilinear") -> tuple[np.ndarray, np.ndarray | None]:
    """Return (image, flags) on the target grid. Pixels outside the frame are NaN / -1.

    method "bilinear" (default) keeps sub-pixel positions; "nearest" copies original pixel values
    (flags are always copied, never interpolated).
    """
    yy, xx = np.mgrid[0:npix, 0:npix]
    ra, dec = tgt.all_pix2world(xx.ravel(), yy.ravel(), 0)
    sx, sy = frame.wcs.all_world2pix(ra, dec, 0)
    ix = np.rint(sx).astype(np.int64)
    iy = np.rint(sy).astype(np.int64)
    ny, nx = frame.shape
    inside = (ix >= 0) & (ix < nx) & (iy >= 0) & (iy < ny) & np.isfinite(sx) & np.isfinite(sy)

    with fits.open(frame.path, memmap=True) as hdul:
        data = hdul[frame.image_hdu].data
        if data.ndim > 2:                                   # e.g. (1, ny, nx)
            data = data.reshape(data.shape[-2:])
        if method == "nearest":
            img = np.full(npix * npix, np.nan, dtype=np.float32)
            img[inside] = data[iy[inside], ix[inside]]
        else:
            img = _bilinear(np.asarray(data), sx, sy)
            img[~inside] = np.nan                           # same coverage as nearest-neighbour

        flags = None
        if frame.flags_hdu is not None:
            fdata = hdul[frame.flags_hdu].data
            if fdata is not None and fdata.shape[-2:] == (ny, nx):
                fdata = fdata.reshape(fdata.shape[-2:])
                flags = np.full(npix * npix, -1, dtype=np.int64)
                flags[inside] = fdata[iy[inside], ix[inside]]
                flags = flags.reshape(npix, npix)

    return img.reshape(npix, npix), flags


def flag_summary(flags: np.ndarray | None) -> dict | None:
    """Contract field `flags`: share of valid pixels with a BAD flag bit (see spherex/flags.py)."""
    if flags is None:
        return None
    valid = flags >= 0
    if not valid.any():
        return {"anyFlagged": False, "fractionFlagged": 0.0}
    frac = float(np.count_nonzero(bad_mask(flags)) / valid.sum())
    return {"anyFlagged": frac > 0, "fractionFlagged": round(frac, 5)}
