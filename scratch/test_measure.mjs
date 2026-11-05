// Tests for measure.js pure helpers + mock photometry. Run: node scratch/test_measure.mjs
import { canvasToSky, groupIntoPasses } from "../frontend/js/features/measure.js";
import { aperturePhotometry } from "../frontend/js/data/mockSource.js";

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? "PASS " : "FAIL ") + msg); if (!cond) fails++; };

// Centre click -> exactly the query position.
let s = canvasToSky(0.5, 0.5, { ra: 133.7951, dec: -7.2451, n: 48, scaleArcsec: 6.25 });
ok(Math.abs(s.ra - 133.7951) < 1e-9 && Math.abs(s.dec + 7.2451) < 1e-9, "centre click = query position");
// One pixel to the RIGHT = 6.25" WEST = RA smaller; one pixel UP = NORTH = Dec larger.
s = canvasToSky(0.5 + 1 / 48, 0.5 - 1 / 48, { ra: 133.7951, dec: -7.2451, n: 48, scaleArcsec: 6.25 });
ok(Math.abs(s.eastArcsec + 6.25) < 1e-6 && Math.abs(s.northArcsec - 6.25) < 1e-6, "right = west, up = north (6.25\")");
ok(s.ra < 133.7951 && s.dec > -7.2451, "RA decreases to the right, Dec increases upward");
// RA wrap-around near 0.
s = canvasToSky(0, 0.5, { ra: 0.001, dec: 0, n: 100, scaleArcsec: 6 });
ok(s.ra > 0 && s.ra < 360, `RA stays in [0,360): ${s.ra.toFixed(4)}`);

// Survey passes: gaps > 30 days split.
const pts = [60800, 60801, 60805, 60983, 60985, 61166].map((mjd) => ({ mjd, dateISO: "2025-05-05T00:00:00Z" }));
ok(groupIntoPasses(pts).map((p) => p.points.length).join(",") === "3,2,1", "passes split at > 30 day gaps");

// Aperture photometry: a flat background + one bright pixel block.
const size = 30, img = new Float32Array(size * size).fill(10);
img[15 * size + 15] += 100; img[15 * size + 14] += 50;
const m = aperturePhotometry(img, size, 15.5, 15.5, 2);
ok(Math.abs(m.flux - 150) < 1e-6, `aperture recovers injected flux 150 (got ${m.flux})`);
ok(aperturePhotometry(img, size, 0.5, 0.5, 2) !== null, "works near (not over) the edge");
ok(aperturePhotometry(img, size, -20, -20, 2) === null, "returns null fully outside");
process.exit(fails ? 1 : 0);
