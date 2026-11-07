"""spherex.flags: only BAD bits count. On real SPHEREx cutouts EVERY pixel has bit 21 set
("associated with a known source"), so "any nonzero bit = flagged" would colour the whole image."""

from __future__ import annotations

import io

import numpy as np
import pytest
from PIL import Image

from spherex.cutout import flag_summary
from spherex.flags import BAD_BITS, BAD_MASK, bad_mask
from spherex.stretch import flags_to_png


@pytest.mark.parametrize("bit", BAD_BITS)
def test_every_documented_bad_bit_marks_a_pixel(bit):
    assert bad_mask(np.array([[1 << bit]]))[0, 0]


@pytest.mark.parametrize("bit", [12, 21])
def test_informative_bits_do_not_mark_a_pixel(bit):
    assert not bad_mask(np.array([[1 << bit]]))[0, 0]


def test_a_bad_bit_among_informative_ones_still_counts():
    assert bad_mask(np.array([[(1 << 21) | (1 << 12) | (1 << 10)]]))[0, 0]       # hot pixel + known source + history


def test_pixels_outside_the_frame_are_never_bad():
    assert not bad_mask(np.array([[-1, -1]])).any()
    assert BAD_MASK & (1 << 12) == 0 and BAD_MASK & (1 << 21) == 0


def test_a_real_looking_cutout_is_not_flagged_everywhere():
    flags = np.full((20, 20), 1 << 21, dtype=np.int64)                            # bit 21 on every pixel, as in real files
    assert flag_summary(flags) == {"anyFlagged": False, "fractionFlagged": 0.0}
    assert flags_to_png(flags) is None
    flags[:2, :] |= 1 << 10                                                       # 2 rows of hot pixels
    assert flag_summary(flags)["fractionFlagged"] == pytest.approx(0.1)
    rgba = np.array(Image.open(io.BytesIO(flags_to_png(flags))).convert("RGBA"))
    assert (rgba[..., 3] > 0).sum() == 40
