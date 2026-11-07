// Shared helpers of the scripts that work on REAL cutouts served by our backend (run the backend with SPHEREX_DATA_DIR=backend/data/real).
// Not part of the app: only scratch/*.mjs import it.

/** Small seeded random generator (mulberry32): the same seed gives the same experiment. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Command-line arguments as { name: value } for "--name value" pairs. */
export const parseArgs = (argv = process.argv.slice(2)) =>
  Object.fromEntries(argv.reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1] ?? "1"]] : acc), []));

const getBytes = async (url) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
  return r.arrayBuffer();
};

/**
 * All images of one detector around a sky position, in time order, with their real float pixels (MJy/sr) and bad-pixel masks.
 * Returns { frames, arrays: Float32Array[], masks: (Uint8Array|null)[], n, scale, geo }.
 */
export async function loadField(api, ra, dec, fov, det) {
  const r = await fetch(`${api}/api/cutouts?ra=${ra}&dec=${dec}&fov=${fov}&det=${det}`);
  if (!r.ok) throw new Error(`cutouts of ${det}: HTTP ${r.status}`);
  const { frames } = await r.json();
  frames.sort((a, b) => a.mjd - b.mjd);
  const arrays = await Promise.all(frames.map(async (f) => new Float32Array(await getBytes(f.dataUrl))));
  const masks = await Promise.all(frames.map(async (f) => (f.maskUrl ? new Uint8Array(await getBytes(f.maskUrl)) : null)));
  const n = frames.length ? Math.round(Math.sqrt(arrays[0].length)) : 0;
  const scale = frames[0]?.pixelScaleArcsec ?? 6.14;
  return { frames, arrays, masks, n, scale, geo: { ra, dec, n, scaleArcsec: scale } };
}

/** One of the 8 symmetries of a square image (rotations by 90 degrees, with or without a mirror): k = 0..7. Works on any typed array. */
export function dihedral(src, n, k) {
  const out = new src.constructor(src.length);
  const rot = k & 3, flip = (k & 4) !== 0;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      let sx = flip ? n - 1 - x : x, sy = y;
      for (let r = 0; r < rot; r++) { const t = sx; sx = n - 1 - sy; sy = t; }          // one more quarter turn
      out[y * n + x] = src[sy * n + sx];
    }
  }
  return out;
}

/** The image moved by (sx, sy) whole pixels, wrapping around at the edges. */
export function wrapShift(src, n, sx, sy) {
  const out = new src.constructor(src.length);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) out[((y + sy) % n) * n + ((x + sx) % n)] = src[y * n + x];
  return out;
}

/** Robust per-pixel noise (1.4826 x MAD) of an image, ignoring non-finite values. */
export function pixelNoise(img) {
  const v = [];
  for (let i = 0; i < img.length; i++) if (Number.isFinite(img[i])) v.push(img[i]);
  v.sort((a, b) => a - b);
  const med = v[Math.floor(v.length / 2)];
  const dev = v.map((x) => Math.abs(x - med)).sort((a, b) => a - b);
  return { median: med, sigma: 1.4826 * dev[Math.floor(dev.length / 2)] };
}

/** Wilson score interval for k successes in n trials (95 %). */
export function wilson(k, n, z = 1.96) {
  if (!n) return [0, 1];
  const p = k / n, d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d, h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}
