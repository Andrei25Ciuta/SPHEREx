// mockSource.js – FAKE data with the same shape as the real thing.
//
// It builds a synthetic star field around (ra, dec) and "observes" it at several
// dates, like SPHEREx would. One source near the center MOVES between dates and
// one star changes brightness (a variable), so you can test the blink player.
//
// EVERYTHING here is invented for testing. Numbers marked ASSUMPTION are only
// rough approximations of SPHEREx and must be checked against real data/docs.

// ---------- Mock "instrument" parameters ----------
const PIXEL_SCALE_ARCSEC = 6.2;   // ASSUMPTION: ~6″/px – real value comes from the FITS WCS
const PSF_SIGMA_PX = 0.9;         // star blur (Gaussian), in pixels
const NOISE_SIGMA = 1.0;          // background noise level (arbitrary units)

// At a RANDOM position the mock mover is EXAGGERATED (12 px/yr) so the blink effect is
// obvious. If the field contains one of the known test objects, the mover IS that object
// and moves with its REAL catalogue proper motion (WISE 0855: ~8″/yr ≈ 1.3 px/yr) – so the
// predicted-track overlay can be checked, and the demo is honest about real speeds.
const MOVER_SPEED_PX_PER_YEAR = 12;

// ASSUMPTION (mock only): approximate wavelength range per detector, in µm.
// 6 detectors × 17 channels = 102 bands, like SPHEREx.
const DETECTOR_RANGES_UM = {
  D1: [0.75, 1.09], D2: [1.10, 1.62], D3: [1.63, 2.41],
  D4: [2.42, 3.82], D5: [3.83, 4.41], D6: [4.42, 5.00],
};
const CHANNELS_PER_DETECTOR = 17;

// Detectors are observed in pairs. You saw D2+D5 and D3+D6 in the real data;
// D1+D4 is our ASSUMPTION for the third pair.
const DETECTOR_PAIRS = [["D1", "D4"], ["D2", "D5"], ["D3", "D6"]];

// ---------- Mock observing schedule ----------
const FIRST_MJD = 60800;          // = 2025-05-05, close to the real WISE 0855 t_min (60800.7) you saw
const SURVEY_PERIOD_DAYS = 182.6; // SPHEREx re-maps the sky every ~6 months
const N_SURVEYS = 3;
const VISITS_PER_SURVEY = 4;      // a few visits a couple of days apart in each survey
const FAKE_LATENCY_MS = 500;      // pretend we are waiting for a server

import { targetsInField, positionAtEpoch } from "../targets.js";
import { skyToCanvas, mjdToYear } from "../geometry.js";
import { parallaxOffsetArcsec } from "../features/parallax.js";

/**
 * SIMULATED, not a real object and not a prediction: a body 600 AU away, put in the mock sky so that the
 * parallax search (features/parallax.js) has something to find. Its apparent path is Earth's parallax swing
 * plus a slow drift of its own (65"/yr = 0.8 km/s at that distance, below the 1.7 km/s escape speed).
 * It sits at ecliptic longitude ~134 deg, where SPHEREx's 6-monthly passes see the largest swing (~110 px).
 * It only exists in a field centred on (ra, dec) that is wide enough to contain it (use 30 arcmin).
 */
export const PLANET_X_DEMO = { label: "Planet X (simulated)", ra: 136.5, dec: 16.6, distanceAU: 600, drift: { east: 60, north: -25 } };

// =================================================================
// Small helpers
// =================================================================

/** Seeded random generator (mulberry32): same seed -> same "random" numbers. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Turn a string into a 32-bit integer seed (FNV-1a hash). */
function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Normal-distributed random number (Box–Muller), mean 0, std 1. */
function gaussian(rng) {
  const u = 1 - rng(), v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** MJD -> ISO date string. MJD 40587 is 1970-01-01 (the Unix epoch). */
export function mjdToISO(mjd) {
  return new Date((mjd - 40587) * 86400000).toISOString();
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// =================================================================
// 1) Build the sky: a list of sources in PIXEL coordinates of the cutout
// =================================================================
function makeField(rng, size) {
  const stars = [];
  const nStars = Math.round(size * size * 0.012) + 3;   // more FOV -> more stars
  for (let i = 0; i < nStars; i++) {
    stars.push({
      x: rng() * size,
      y: rng() * size,
      // Few bright, many faint stars (power law), capped so nothing is absurd.
      flux: Math.min(400, 8 * Math.pow(rng(), -1.2)),
    });
  }

  // The moving object: passes close to the center (where the user pointed),
  // in a random direction.
  const angle = rng() * 2 * Math.PI;
  const mover = {
    x0: size / 2 + (rng() - 0.5) * 2,
    y0: size / 2 + (rng() - 0.5) * 2,
    vx: Math.cos(angle) * MOVER_SPEED_PX_PER_YEAR,   // px per year
    vy: Math.sin(angle) * MOVER_SPEED_PX_PER_YEAR,
    flux: 60,
  };

  // A variable star: fixed position, brightness changes with time.
  const variable = {
    x: size * (0.2 + 0.6 * rng()),
    y: size * (0.2 + 0.6 * rng()),
    flux: 50,
    periodDays: 120 + rng() * 200,
  };

  return { stars, mover, variable };
}

// =================================================================
// 2) "Observe" the field at one date -> array of pixel values
// =================================================================
/**
 * Pure function (no DOM), so it can be tested with Node.
 * yearsFromMid: time relative to the middle of the schedule, in years.
 * wavelengthUm: center wavelength of this frame (changes the mover's brightness).
 */
export function renderPixels(field, size, mjd, yearsFromMid, wavelengthUm, rng) {
  const img = new Float32Array(size * size);

  // Background noise.
  for (let i = 0; i < img.length; i++) img[i] = NOISE_SIGMA * gaussian(rng);

  // Add one Gaussian blob ("point spread function") at (x, y).
  const addPsf = (x, y, flux) => {
    const r = Math.ceil(PSF_SIGMA_PX * 4);
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const norm = flux / (2 * Math.PI * PSF_SIGMA_PX ** 2);
    for (let py = y0 - r; py <= y0 + r; py++) {
      if (py < 0 || py >= size) continue;
      for (let px = x0 - r; px <= x0 + r; px++) {
        if (px < 0 || px >= size) continue;
        const dx = px + 0.5 - x, dy = py + 0.5 - y;     // +0.5 = pixel center
        img[py * size + px] += norm * Math.exp(-(dx * dx + dy * dy) / (2 * PSF_SIGMA_PX ** 2));
      }
    }
  };

  for (const s of field.stars) addPsf(s.x, s.y, s.flux);

  // Variable star: ±60 % sinusoidal brightness change.
  const v = field.variable;
  addPsf(v.x, v.y, v.flux * (1 + 0.6 * Math.sin((2 * Math.PI * mjd) / v.periodDays)));

  // Mover: position = start + velocity × time. Like a cold brown dwarf, we make it
  // much brighter at long wavelengths (mock-only physics, just for fun/teaching).
  const m = field.mover;
  const colorBoost = 0.3 + 1.7 * Math.min(1, Math.max(0, (wavelengthUm - 1) / 3.5));
  const swing = m.wobble ? m.wobble(mjd) : { x: 0, y: 0 };        // only the simulated distant body swings (parallax)
  addPsf(m.x0 + m.vx * yearsFromMid + swing.x, m.y0 + m.vy * yearsFromMid + swing.y, m.flux * colorBoost);

  return img;
}

// =================================================================
// 3) Stretch: float pixels -> 0..255 grey levels (asinh, like real survey viewers)
// =================================================================
export function stretchAsinh(img, { lo = -1.5, hi = 80, soft = 4 } = {}) {
  const out = new Uint8ClampedArray(img.length);
  const top = Math.asinh((hi - lo) / soft);
  for (let i = 0; i < img.length; i++) {
    const v = Math.max(0, img[i] - lo);
    out[i] = 255 * Math.min(1, Math.asinh(v / soft) / top);
  }
  return out;
}

/** Grey levels -> PNG data: URL using an off-screen canvas (browser only). */
function toDataUrl(grey, size) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const imageData = ctx.createImageData(size, size);
  for (let i = 0; i < grey.length; i++) {
    imageData.data[4 * i] = imageData.data[4 * i + 1] = imageData.data[4 * i + 2] = grey[i];
    imageData.data[4 * i + 3] = 255;                   // fully opaque
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

// =================================================================
// 4) Build the observing schedule (pure, testable)
// =================================================================
export function makeSchedule(rng) {
  const visits = [];
  for (let s = 0; s < N_SURVEYS; s++) {
    for (let v = 0; v < VISITS_PER_SURVEY; v++) {
      const mjd = FIRST_MJD + s * SURVEY_PERIOD_DAYS + v * 1.7 + rng() * 0.3;
      const pair = DETECTOR_PAIRS[Math.floor(rng() * DETECTOR_PAIRS.length)];
      for (const detector of pair) {
        const [wMin, wMax] = DETECTOR_RANGES_UM[detector];
        const width = (wMax - wMin) / CHANNELS_PER_DETECTOR;
        const ch = Math.floor(rng() * CHANNELS_PER_DETECTOR);
        visits.push({ mjd, detector, wlMin: wMin + ch * width, wlMax: wMin + (ch + 1) * width });
      }
    }
  }
  return visits;
}

// =================================================================
// Shared "observation run" – used by both cutouts and photometry
// =================================================================
/**
 * Everything the mock knows about one query: field, schedule and the RAW float pixels
 * of every frame. Cached, so measuring a source does not re-render the sky.
 */
const runCache = new Map();
export function observe(ra, dec, fovArcmin) {       // exported for scratch/test_movers.mjs
  const key = `${ra.toFixed(3)},${dec.toFixed(3)},${fovArcmin}`;
  if (runCache.has(key)) return runCache.get(key);

  // Cutout size in pixels: FOV (arcmin → arcsec) / pixel scale.
  const size = Math.max(10, Math.min(400, Math.round((fovArcmin * 60) / PIXEL_SCALE_ARCSEC)));
  // Seed from the coordinates (rounded) -> the same position always gives the same sky.
  const seed = hashString(`${ra.toFixed(3)},${dec.toFixed(3)}`);
  const rng = mulberry32(seed);
  const field = makeField(rng, size);
  const schedule = makeSchedule(rng);
  const midMjd = (schedule[0].mjd + schedule[schedule.length - 1].mjd) / 2;
  const scale = (fovArcmin * 60) / size;
  placeKnownTargets(field, { ra, dec, size, scale, midMjd, fovArcmin });
  placePlanetXDemo(field, { ra, dec, size, scale, midMjd });

  const obs = schedule.map((o, i) => {
    const frameRng = mulberry32(seed + i + 1);          // separate noise per frame
    const yearsFromMid = (o.mjd - midMjd) / 365.25;
    const pixels = renderPixels(field, size, o.mjd, yearsFromMid, (o.wlMin + o.wlMax) / 2, frameRng);
    // Mock quality flags: ~15 % of frames have some flagged pixels (up to 10 %).
    const fractionFlagged = frameRng() < 0.15 ? Math.round(frameRng() * 1000) / 10000 : 0;
    const flagMask = makeFlagMask(size, fractionFlagged, frameRng);
    return { ...o, pixels, fractionFlagged, flagMask };
  });

  const run = { size, obs, scale, field };
  runCache.clear();                                      // keep memory small: last query only
  runCache.set(key, run);
  return run;
}

/**
 * If a known test object is inside the field, put it where the catalogue says:
 *   mover-type (Barnard, eps Ind B, WISE 0855): the mock mover follows its proper motion;
 *   variable-type (RW Aur, R Dra): the mock variable star sits at its position.
 * Pixel convention as everywhere: north up, east LEFT, edge coordinates (centre = size/2).
 */
function placeKnownTargets(field, { ra, dec, size, scale, midMjd, fovArcmin }) {
  const geo = { ra, dec, n: size, scaleArcsec: scale };
  for (const t of targetsInField(ra, dec, fovArcmin, mjdToYear(midMjd))) {
    const p = positionAtEpoch(t, mjdToYear(midMjd));
    const { fx, fy } = skyToCanvas(p.ra, p.dec, geo);
    if (t.type === "mover") {
      field.mover.x0 = fx * size;
      field.mover.y0 = fy * size;
      field.mover.vx = -(t.pmra / 1000) / scale;     // east (+pmra) = towards the LEFT
      field.mover.vy = -(t.pmdec / 1000) / scale;    // north (+pmdec) = UP
      field.mover.knownAs = t.label;
    } else {
      field.variable.x = fx * size;
      field.variable.y = fy * size;
      field.variable.knownAs = t.label;
    }
  }
}

/** If the simulated distant body (PLANET_X_DEMO) is inside the field, it replaces the mock mover. */
function placePlanetXDemo(field, { ra, dec, size, scale, midMjd }) {
  const { fx, fy } = skyToCanvas(PLANET_X_DEMO.ra, PLANET_X_DEMO.dec, { ra, dec, n: size, scaleArcsec: scale });
  if (fx < 0.05 || fx > 0.95 || fy < 0.05 || fy > 0.95) return;
  const m = field.mover;
  m.x0 = fx * size; m.y0 = fy * size;                              // where it is on the middle date, without the swing
  m.vx = -PLANET_X_DEMO.drift.east / scale;                        // east is LEFT
  m.vy = -PLANET_X_DEMO.drift.north / scale;                       // north is UP
  m.knownAs = PLANET_X_DEMO.label;
  m.wobble = (mjd) => {
    const p = parallaxOffsetArcsec(PLANET_X_DEMO.ra, PLANET_X_DEMO.dec, mjd, midMjd, PLANET_X_DEMO.distanceAU);
    return { x: -p.east / scale, y: -p.north / scale };
  };
}

/** Random flagged pixels (as a 0/1 array) matching the requested fraction. */
function makeFlagMask(size, fraction, rng) {
  const mask = new Uint8Array(size * size);
  const n = Math.round(fraction * mask.length);
  for (let k = 0; k < n; k++) mask[Math.floor(rng() * mask.length)] = 1;
  return mask;
}

/** 0/1 mask -> transparent PNG with red flagged pixels (browser only). */
function maskToDataUrl(mask, size) {
  if (!mask.some((v) => v)) return null;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const im = ctx.createImageData(size, size);
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    im.data[4 * i] = 255; im.data[4 * i + 1] = 40; im.data[4 * i + 2] = 60; im.data[4 * i + 3] = 255;
  }
  ctx.putImageData(im, 0, 0);
  return canvas.toDataURL("image/png");
}

// =================================================================
// Public entry points – same signatures as the real source
// =================================================================
export async function getCutoutsMock({ ra, dec, fovArcmin, detector = "all" }) {
  await sleep(FAKE_LATENCY_MS);
  const { size, obs, scale } = observe(ra, dec, fovArcmin);

  return obs
    .filter((o) => detector === "all" || o.detector === detector)
    .map((o) => ({
      mjd: Math.round(o.mjd * 1e5) / 1e5,
      dateISO: mjdToISO(o.mjd),
      detector: o.detector,
      wavelengthMinUm: Math.round(o.wlMin * 1000) / 1000,
      wavelengthMaxUm: Math.round(o.wlMax * 1000) / 1000,
      imageUrl: toDataUrl(stretchAsinh(o.pixels), size),
      flags: { anyFlagged: o.fractionFlagged > 0, fractionFlagged: o.fractionFlagged },
      flagsUrl: maskToDataUrl(o.flagMask, size),
      pixelScaleArcsec: Math.round(scale * 1000) / 1000,
    }));
}

/**
 * Aperture photometry at (ra, dec) on every mock frame.
 * The mock sky is defined relative to the cutout CENTER, so we also need the query center.
 * Same output shape as the backend's /api/photometry.
 */
export async function getPhotometryMock({ centerRa, centerDec, fovArcmin, ra, dec, radiusPx = 2, motion = null }) {
  await sleep(150);
  const { size, obs, scale } = observe(centerRa, centerDec, fovArcmin);
  // Sky -> pixel. Image convention (same as backend PNGs): north up, east LEFT, row 0 = top.
  const cosDec = Math.cos((centerDec * Math.PI) / 180);
  let dRa = ra - centerRa;
  if (dRa > 180) dRa -= 360; else if (dRa < -180) dRa += 360;
  const eastArcsec = dRa * cosDec * 3600, northArcsec = (dec - centerDec) * 3600;

  return obs.map((o) => {
    // A MOVING object (motion = { epochMjd, pmEast, pmNorth } in arcsec/yr) is at (ra, dec) on epochMjd
    // and elsewhere on the date of this frame: measure where it is THEN.
    const years = motion ? (o.mjd - motion.epochMjd) / 365.25 : 0;
    const x = size / 2 - (eastArcsec + (motion?.pmEast ?? 0) * years) / scale;
    const y = size / 2 - (northArcsec + (motion?.pmNorth ?? 0) * years) / scale;
    const m = aperturePhotometry(o.pixels, size, x, y, radiusPx);
    return {
      mjd: Math.round(o.mjd * 1e5) / 1e5,
      dateISO: mjdToISO(o.mjd),
      detector: o.detector,
      wavelengthUm: Math.round(((o.wlMin + o.wlMax) / 2) * 1000) / 1000,
      wavelengthMinUm: Math.round(o.wlMin * 1000) / 1000,
      wavelengthMaxUm: Math.round(o.wlMax * 1000) / 1000,
      flux: m ? m.flux : null,
      fluxErr: m ? m.err : null,
      flagged: o.fractionFlagged > 0,
    };
  });
}

/**
 * Sum inside a circle of radius r (pixels) minus the median background measured
 * in a ring from r+2 to r+5. Error from the ring's scatter. Pure, testable.
 * Pixel (px, py) covers [px, px+1) – so its center is at +0.5.
 */
export function aperturePhotometry(img, size, x, y, r) {
  const rIn = r + 2, rOut = r + 5;
  const inside = [], ring = [];
  for (let py = Math.floor(y - rOut); py <= Math.ceil(y + rOut); py++) {
    if (py < 0 || py >= size) continue;
    for (let px = Math.floor(x - rOut); px <= Math.ceil(x + rOut); px++) {
      if (px < 0 || px >= size) continue;
      const d = Math.hypot(px + 0.5 - x, py + 0.5 - y);
      const v = img[py * size + px];
      if (!Number.isFinite(v)) continue;
      if (d <= r) inside.push(v); else if (d >= rIn && d <= rOut) ring.push(v);
    }
  }
  if (!inside.length || ring.length < 5) return null;   // too close to the edge
  ring.sort((a, b) => a - b);
  const bg = ring[Math.floor(ring.length / 2)];
  const mean = ring.reduce((a, b) => a + b, 0) / ring.length;
  const sd = Math.sqrt(ring.reduce((a, b) => a + (b - mean) ** 2, 0) / (ring.length - 1));
  const flux = inside.reduce((a, b) => a + b, 0) - bg * inside.length;
  return { flux: Math.round(flux * 100) / 100, err: Math.round(sd * Math.sqrt(inside.length) * 100) / 100 };
}
