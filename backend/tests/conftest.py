"""Shared helpers: tiny SYNTHETIC FITS frames with a known WCS (no real SPHEREx data needed).

Run all tests from the repository root:
    backend/.venv/Scripts/python.exe -m pytest backend
"""

from __future__ import annotations

import numpy as np
import pytest
from astropy.io import fits
from astropy.wcs import WCS

SCALE_ARCSEC = 6.2          # about SPHEREx's pixel size


def make_wcs(ra: float, dec: float, npix: int, rot_deg: float = 0.0, scale_arcsec: float = SCALE_ARCSEC) -> WCS:
    """TAN WCS centred on (ra, dec); rot_deg = 0 means north up, east left."""
    w = WCS(naxis=2)
    w.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    w.wcs.crval = [ra, dec]
    w.wcs.crpix = [(npix + 1) / 2, (npix + 1) / 2]
    c, s = np.cos(np.radians(rot_deg)), np.sin(np.radians(rot_deg))
    w.wcs.cd = (scale_arcsec / 3600) * np.array([[-c, s], [s, c]])
    return w


def add_star(img: np.ndarray, x: float, y: float, flux: float, sigma: float = 0.9) -> None:
    """Add a Gaussian star at pixel position (x, y) (0-based pixel centres), in place."""
    yy, xx = np.mgrid[0:img.shape[0], 0:img.shape[1]]
    img += (flux / (2 * np.pi * sigma ** 2) * np.exp(-((xx - x) ** 2 + (yy - y) ** 2) / (2 * sigma ** 2))).astype(img.dtype)


@pytest.fixture
def write_frame(tmp_path):
    """Factory: write one synthetic frame and return (path, wcs).

    stars = [(ra, dec, flux), ...] are placed through the frame's own WCS, so the same sky
    can be written with different pointings and rotations.
    """
    counter = {"n": 0}

    def _write(*, ra=150.0, dec=20.0, npix=64, rot_deg=0.0, mjd=60800.0, detector=1, stars=(),
               background=100.0, flags=None, header_extra=None, time_keyword=True, name=None):
        wcs = make_wcs(ra, dec, npix, rot_deg)
        img = np.full((npix, npix), background, dtype=np.float32)
        for s_ra, s_dec, flux in stars:
            x, y = wcs.all_world2pix([s_ra], [s_dec], 0)
            add_star(img, float(x[0]), float(y[0]), flux)
        hdr = wcs.to_header()
        if time_keyword:
            hdr["MJD-OBS"] = mjd
        hdr["DETECTOR"] = detector
        for key, value in (header_extra or {}).items():
            hdr[key] = value
        hdus = [fits.PrimaryHDU(), fits.ImageHDU(img, hdr, name="IMAGE")]
        if flags is not None:
            hdus.append(fits.ImageHDU(np.asarray(flags, dtype=np.int32), wcs.to_header(), name="FLAGS"))
        counter["n"] += 1
        path = tmp_path / (name or f"frame_{counter['n']:02d}.fits")
        fits.HDUList(hdus).writeto(path, overwrite=True)
        return path, wcs

    return _write
