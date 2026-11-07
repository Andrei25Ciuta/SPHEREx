"""spherex.cutout: every frame must be resampled onto ONE north-up, east-left grid.

Without that, a rotated exposure would make the stars spin around between frames.
"""

from __future__ import annotations

import io

import numpy as np
from PIL import Image

from spherex.cutout import cutout, flag_summary, target_wcs
from spherex.query import read_frame_file
from spherex.stretch import shared_stretch, to_png

RA, DEC = 150.0, 20.0


def star_at(north_arcsec=0.0, east_arcsec=0.0, flux=1000.0):
    """A star offset from (RA, DEC) by arcseconds on the sky."""
    return (RA + east_arcsec / 3600 / np.cos(np.radians(DEC)), DEC + north_arcsec / 3600, flux)


def peak(img):
    y, x = np.unravel_index(np.nanargmax(img), img.shape)
    return int(x), int(y)


def make_cutout(path, fov_arcmin=4.0):
    frame = read_frame_file(path)
    tgt, npix = target_wcs(RA, DEC, fov_arcmin, frame.pixel_scale_arcsec)
    img, flags = cutout(frame, tgt, npix)
    return img, flags, tgt, npix


def test_north_is_up_in_the_picture_the_browser_shows(write_frame):
    star = star_at(north_arcsec=40)
    path, _ = write_frame(ra=RA, dec=DEC, stars=[star])
    img, _, tgt, npix = make_cutout(path)
    ex, ey = tgt.all_world2pix([star[0]], [star[1]], 0)
    x, y = peak(img)
    assert abs(x - ex[0]) <= 1 and abs(y - ey[0]) <= 1       # where the target grid says it should be
    # In the array (FITS convention) row 0 is the SOUTH edge, so north is at LARGER rows ...
    assert y > npix / 2 + 3
    # ... and to_png() flips the rows, so in the PNG the browser shows, north is UP.
    png = np.array(Image.open(io.BytesIO(to_png(shared_stretch([img])[0]))))
    rows, cols = np.nonzero(png == 255)
    assert rows.mean() < npix / 2 - 3 and abs(cols.mean() - npix / 2) < 3


def test_east_is_left(write_frame):
    star = star_at(east_arcsec=40)
    path, _ = write_frame(ra=RA, dec=DEC, stars=[star])
    img, _, tgt, npix = make_cutout(path)
    ex, ey = tgt.all_world2pix([star[0]], [star[1]], 0)
    x, y = peak(img)
    assert abs(x - ex[0]) <= 1 and abs(y - ey[0]) <= 1
    assert x < npix / 2 - 3                                   # LEFT of the centre


def test_a_rotated_frame_gives_the_same_picture(write_frame):
    stars = [star_at(north_arcsec=30, east_arcsec=20), star_at(north_arcsec=-25, east_arcsec=-35, flux=600)]
    peaks, native = [], []
    for rot, d_ra, d_dec in [(0, 0.0, 0.0), (40, 0.004, -0.003)]:      # second frame: rotated + other pointing
        path, wcs = write_frame(ra=RA + d_ra, dec=DEC + d_dec, rot_deg=rot, npix=96, stars=stars)
        img, _, _, _ = make_cutout(path)
        peaks.append(peak(img))
        x, y = wcs.all_world2pix([stars[0][0]], [stars[0][1]], 0)
        native.append((float(x[0]), float(y[0])))
    assert abs(peaks[0][0] - peaks[1][0]) <= 1 and abs(peaks[0][1] - peaks[1][1]) <= 1
    # sanity: in the raw frames the star really is somewhere else, so this test would catch a missing resample
    assert np.hypot(native[0][0] - native[1][0], native[0][1] - native[1][1]) > 3


def test_pixels_outside_the_frame_are_nan(write_frame):
    path, _ = write_frame(ra=RA, dec=DEC, npix=32)                       # about 3.3 arcmin wide
    img, _, _, npix = make_cutout(path, fov_arcmin=8.0)                  # asks for a much bigger patch
    assert np.isnan(img[0, 0]) and np.isnan(img[-1, -1])
    assert np.isfinite(img[npix // 2, npix // 2])
    assert 0.1 < np.isnan(img).mean() < 0.9


def test_flags_outside_the_frame_are_minus_one_and_ignored_by_the_summary(write_frame):
    flags = np.zeros((32, 32), dtype=np.int32)
    flags[:8, :] = 4                                                     # a quarter of the frame is flagged
    path, _ = write_frame(ra=RA, dec=DEC, npix=32, flags=flags)
    _, grid_flags, _, _ = make_cutout(path, fov_arcmin=8.0)
    assert (grid_flags == -1).any()
    summary = flag_summary(grid_flags)
    assert summary["anyFlagged"] is True
    assert 0.2 < summary["fractionFlagged"] < 0.3


def test_flag_summary_edge_cases():
    assert flag_summary(None) is None
    assert flag_summary(np.zeros((4, 4), dtype=np.int64)) == {"anyFlagged": False, "fractionFlagged": 0.0}
    assert flag_summary(np.full((4, 4), -1, dtype=np.int64)) == {"anyFlagged": False, "fractionFlagged": 0.0}
