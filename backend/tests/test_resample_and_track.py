"""Bilinear cutouts (sub-pixel star positions), the float pixel file, and photometry that follows a moving object."""

from __future__ import annotations

import numpy as np
import pytest

from spherex.cache import CACHE_DIR, save_bytes
from spherex.cutout import _bilinear, cutout, target_wcs
from spherex.floatdata import float_cutout_bytes, mask_cutout_bytes
from spherex.photometry import jansky_per_image_unit, measure, position_at
from spherex.query import read_frame_file

RA, DEC = 150.0, 20.0


def centroid(img, half=4):
    """Flux-weighted centre around the brightest pixel (pixel-centre coordinates)."""
    y0, x0 = np.unravel_index(np.nanargmax(img), img.shape)
    ys, xs = slice(max(0, y0 - half), y0 + half + 1), slice(max(0, x0 - half), x0 + half + 1)
    sub = np.nan_to_num(img[ys, xs]) - np.median(img[np.isfinite(img)])
    yy, xx = np.mgrid[ys, xs]
    return float((sub * xx).sum() / sub.sum()), float((sub * yy).sum() / sub.sum())


def test_bilinear_keeps_star_positions_to_a_fraction_of_a_pixel(write_frame):
    star = (RA + 0.0021, DEC + 0.0013, 3000.0)                           # lands between pixel centres
    errors = {"bilinear": [], "nearest": []}
    for rot, d_ra, d_dec in [(0, 0.0, 0.0), (23, 0.001, -0.0007), (61, -0.0012, 0.0009), (140, 0.0004, 0.0011)]:
        path, _ = write_frame(ra=RA + d_ra, dec=DEC + d_dec, rot_deg=rot, npix=80, stars=[star])
        frame = read_frame_file(path)
        tgt, npix = target_wcs(RA, DEC, 4.0, frame.pixel_scale_arcsec)
        ex, ey = tgt.all_world2pix([star[0]], [star[1]], 0)
        for method in errors:
            img, _ = cutout(frame, tgt, npix, method=method)
            cx, cy = centroid(img)
            errors[method].append(float(np.hypot(cx - ex[0], cy - ey[0])))
    assert max(errors["bilinear"]) < 0.2                                  # sub-pixel in every orientation
    assert np.mean(errors["bilinear"]) <= np.mean(errors["nearest"])      # and no worse than copying pixels


def test_bilinear_is_nan_aware_and_keeps_the_coverage_of_nearest(write_frame):
    path, _ = write_frame(ra=RA, dec=DEC, npix=32)
    frame = read_frame_file(path)
    tgt, npix = target_wcs(RA, DEC, 8.0, frame.pixel_scale_arcsec)       # bigger than the frame
    near, _ = cutout(frame, tgt, npix, method="nearest")
    bil, _ = cutout(frame, tgt, npix, method="bilinear")
    assert np.array_equal(np.isnan(near), np.isnan(bil))                  # the same pixels are empty
    assert np.isfinite(bil[npix // 2, npix // 2])


def test_a_nan_pixel_does_not_spread_through_the_interpolation():
    data = np.full((6, 6), 10.0)
    data[2, 2] = np.nan
    out = _bilinear(data, np.array([2.5, 4.0]), np.array([2.5, 4.0]))
    assert out[0] == pytest.approx(10.0) and out[1] == pytest.approx(10.0)  # neighbours re-normalised, not NaN


def test_the_float_file_is_north_up_background_subtracted_little_endian():
    img = np.full((4, 4), 100.0, dtype=np.float32)
    img[0, 1] = 160.0                                                     # FITS row 0 = south edge
    img[3, 2] = np.nan
    data = np.frombuffer(float_cutout_bytes(img), dtype="<f4").reshape(4, 4)
    assert data[3, 1] == pytest.approx(60.0)                              # flipped like the PNG
    assert np.isnan(data[0, 2])                                           # the NaN moved to the top row too
    assert np.nanmedian(data) == pytest.approx(0.0)


def test_the_mask_file_marks_bad_pixels_north_up_and_never_marks_the_outside():
    flags = np.zeros((4, 4), dtype=np.int32)
    flags[0, 1] = 1 << 1                                                  # overflow (a BAD bit) at FITS row 0 = south edge
    flags[1, 1] = 1 << 21                                                 # "known source": informational, not bad
    flags[2, 2] = -1                                                      # outside the frame: never bad
    mask = np.frombuffer(mask_cutout_bytes(flags, (4, 4)), dtype=np.uint8).reshape(4, 4)
    assert mask[3, 1] == 1                                                # flipped like the float file
    assert mask.sum() == 1                                                # only that pixel
    assert np.frombuffer(mask_cutout_bytes(None, (4, 4)), dtype=np.uint8).sum() == 0     # no flags at all: nothing masked


def test_binary_side_files_are_saved_next_to_the_png_files():
    url = save_bytes("testkey_abc", 3, b"\x00\x01", "f32")
    assert url == "cutouts/testkey_abc_3.f32"
    path = CACHE_DIR / "testkey_abc_3.f32"
    assert path.read_bytes() == b"\x00\x01"
    path.unlink()


def test_a_moving_object_is_followed_from_frame_to_frame(write_frame):
    pm_east = 36.0                                                        # arcsec/yr: 5.8 px/yr, so ~3 px in 6 months
    paths = []
    for mjd in (60800.0, 60983.0, 61166.0):
        years = (mjd - 60983.0) / 365.25
        star = (RA + pm_east * years / 3600 / np.cos(np.radians(DEC)), DEC, 1000.0)
        path, _ = write_frame(stars=[star], mjd=mjd, ra=RA, dec=DEC, npix=64)
        paths.append(path)
    frames = [read_frame_file(p) for p in paths]
    motion = {"epoch_mjd": 60983.0, "pm_east": pm_east, "pm_north": 0.0}
    followed = measure(frames, RA, DEC, motion=motion)
    fixed = measure(frames, RA, DEC)
    assert all(p["flux"] > 500 for p in followed)                         # the aperture goes where the star goes
    assert fixed[0]["flux"] < 0.6 * followed[0]["flux"]                   # a fixed aperture loses it on the other dates


def test_position_at_moves_with_proper_motion_and_not_without():
    assert position_at(10.0, 20.0, None, 60000.0) == (10.0, 20.0)
    ra, dec = position_at(10.0, 0.0, {"epoch_mjd": 60000.0, "pm_east": 3.6, "pm_north": -7.2}, 60000.0 + 365.25)
    assert ra == pytest.approx(10.0 + 3.6 / 3600) and dec == pytest.approx(-7.2 / 3600)


def test_flux_in_jansky_only_for_surface_brightness_files(write_frame):
    path, _ = write_frame(header_extra={"BUNIT": "MJy / sr"})
    frame = read_frame_file(path)
    expected = 1e6 * (frame.pixel_scale_arcsec / 206264.806) ** 2        # MJy/sr x pixel solid angle -> Jy per image unit
    assert jansky_per_image_unit(frame) == pytest.approx(expected)
    plain, _ = write_frame(name="plain.fits")
    assert jansky_per_image_unit(read_frame_file(plain)) is None
    assert measure([read_frame_file(plain)], RA, DEC)[0]["fluxJy"] is None
