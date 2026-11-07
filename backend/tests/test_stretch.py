"""spherex.stretch: one shared brightness scale for all frames of a detector, then 8-bit PNGs."""

from __future__ import annotations

import io

import numpy as np
from PIL import Image

from spherex.stretch import flags_to_png, shared_stretch, to_png


def gradient(n=32):
    return np.linspace(0.0, 100.0, n * n, dtype=np.float32).reshape(n, n)


def test_the_same_brightness_gets_the_same_grey_in_every_frame():
    a = gradient()
    out_a, out_b = shared_stretch([a, a[::-1, ::-1]])                      # same pixel values, other positions
    assert np.array_equal(out_b, out_a[::-1, ::-1])


def test_a_different_background_level_does_not_change_the_picture():
    a = gradient()
    out_a, out_b = shared_stretch([a, a + 1000.0])                         # e.g. brighter zodiacal light that epoch
    assert np.abs(out_a.astype(int) - out_b.astype(int)).max() <= 1


def test_brighter_pixels_never_get_a_darker_grey():
    a = gradient()
    (out,) = shared_stretch([a])
    ordered = out.ravel()[np.argsort(a.ravel())]
    assert np.all(np.diff(ordered.astype(int)) >= 0)


def test_output_is_uint8_with_the_same_shape_and_nan_becomes_black():
    a = gradient()
    a[0, 0] = np.nan
    (out,) = shared_stretch([a])
    assert out.dtype == np.uint8 and out.shape == a.shape
    assert out[0, 0] == 0


def test_an_all_nan_frame_does_not_crash():
    (out,) = shared_stretch([np.full((4, 4), np.nan, dtype=np.float32)])
    assert not out.any()


def test_png_is_flipped_so_that_fits_row_zero_is_the_bottom():
    arr = np.zeros((4, 4), dtype=np.uint8)
    arr[0, :] = 255                                                        # FITS row 0 = bottom of the picture
    img = np.array(Image.open(io.BytesIO(to_png(arr))))
    assert img[3].tolist() == [255] * 4 and img[0].tolist() == [0] * 4


def test_flag_mask_is_red_where_flagged_and_transparent_elsewhere():
    assert flags_to_png(None) is None
    assert flags_to_png(np.zeros((3, 3), dtype=np.int64)) is None
    flags = np.zeros((4, 4), dtype=np.int64)
    flags[0, 1] = 1
    rgba = np.array(Image.open(io.BytesIO(flags_to_png(flags))).convert("RGBA"))
    assert rgba[3, 1].tolist() == [255, 40, 60, 255]                       # flipped like the image
    assert rgba[0, 1, 3] == 0
