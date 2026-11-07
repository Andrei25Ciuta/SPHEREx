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


def cutout(frame: FrameFile, tgt: WCS, npix: int) -> tuple[np.ndarray, np.ndarray | None]:
    """Return (image, flags) on the target grid. Pixels outside the frame are NaN / -1."""
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
        img = np.full(npix * npix, np.nan, dtype=np.float32)
        img[inside] = data[iy[inside], ix[inside]]

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
