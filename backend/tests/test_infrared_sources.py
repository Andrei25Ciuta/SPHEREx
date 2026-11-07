"""Synthetic unit tests for spatial infrared source detection."""
import unittest
import numpy as np
from spherex.infrared_sources import detect_sources


class InfraredDetectionTests(unittest.TestCase):
    def test_detects_stationary_bright_peak(self):
        rng = np.random.default_rng(7)
        image = rng.normal(0, 1, (51, 51))
        image[25, 28] += 25
        result = detect_sources(image, threshold_sigma=6)
        self.assertTrue(any(s["x"] == 28 and s["y"] == 25 for s in result["sources"]))

    def test_ignores_flagged_peak(self):
        image = np.zeros((31, 31))
        image[15, 15] = 100
        mask = np.zeros_like(image, dtype=bool)
        mask[15, 15] = True
        result = detect_sources(image, mask)
        self.assertEqual(result["sources"], [])

    def test_rejects_flat_field(self):
        result = detect_sources(np.ones((20, 20)))
        self.assertEqual(result["sources"], [])

    def test_bad_dimensions(self):
        with self.assertRaises(ValueError):
            detect_sources(np.ones((2, 3, 4)))


if __name__ == "__main__":
    unittest.main()
