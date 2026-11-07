"""Which FLAGS bits mean "do not trust this pixel"?

Found on REAL SPHEREx cutouts (7 Nov 2026): EVERY pixel has some bit set (bit 21, "associated with a
known source", is on everywhere), so "any nonzero bit = flagged" would paint the whole image red.
Bit meanings: docs/IRSA_FACTS.md section 5 (from IRSA's documentation).

  BAD          = documented as bad data: 0 transient, 1 overflow, 2 SUR error, 4 ghost, 5 reference
                 pixel, 6 permanently unusable, 9 data lost on board, 10 hot, 11 abnormally low (cold)
  INFORMATIVE  = 12 (full sample history available), 21 (associated with a known source): ignored
  UNDECIDED    = 7, 14, 15, 17, 19 (and bits above 21, not in the table we have): NOT counted for now.
                 Bit 19 (outlier) may hit moving objects; decide with real data, change ONE line below.
"""

from __future__ import annotations

import numpy as np

BAD_BITS = (0, 1, 2, 4, 5, 6, 9, 10, 11)
BAD_MASK = sum(1 << b for b in BAD_BITS)


def bad_mask(flags: np.ndarray) -> np.ndarray:
    """True where a pixel has at least one BAD bit. Negative values (= outside the frame) are never bad."""
    flags = np.asarray(flags)
    return (flags >= 0) & ((flags.astype(np.int64) & BAD_MASK) != 0)
