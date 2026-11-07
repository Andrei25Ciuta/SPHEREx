// movers.js – "Find movers": look for dots that change position between dates.
//
// Pure maths on grey images (no DOM), so it also runs in Node tests.
//
//   1. detectSources()  per image: bright local peaks (>= 5 sigma after a light smoothing),
//                       each centred to sub-pixel accuracy.
//   2. findMovers()     every pair of dots from two DIFFERENT survey passes proposes a straight
//                       line  position(t) = p0 + v * t.  A line is kept when dots from at least
//                       3 passes lie close to it, and is then re-fitted by least squares.
//                       Still stars come out as lines with v ~ 0, movers as lines whose velocity
//                       is significantly different from 0.
//
// What it does NOT do (v1, on purpose):
//   * It uses POSITIONS only, never brightness: through SPHEREx's variable filter the same star
//     has a different brightness in every image, so brightness says nothing about motion.
//   * Motion smaller than ~1 pixel (6") over the whole observed period looks like a still star.
//   * A mover that blends with a bright star, or moves faster than maxSpeedPxPerYear, is missed.
//   * It needs images of ONE detector from at least 3 survey passes (about 6 months apart), and
//     works on the 8-bit pictures the player shows.

import { canvasToSky, skyToCanvas, mjdToYear } from "../geometry.js";
import { positionAtEpoch } from "../targets.js";

export const DEFAULTS = {
  detectSigma: 5,           // a dot must stand this many sigma above the background
  edgeMargin: 2,            // px: peaks closer to the border have unreliable centres
  matchRadiusPx: 1.5,       // a dot supports a line if it is this close to the predicted spot
  staticRadiusPx: 1.2,      // dots this close in two passes are tried first (still stars, slow movers)
  minPassGapDays: 30,       // images less than this apart are one survey pass
  maxSpeedPxPerYear: 60,    // fastest motion we look for (60 px/yr = 370"/yr)
  minDetections: 3,         // a line needs this many dots ... and at least half of the images
  maxRmsPx: 0.8,            // the dots must lie this close to their fitted line (rms)
  minMotionPx: 0.8,         // total motion over the observed period (about 5")
  minSignificance: 6,       // speed divided by its uncertainty
  centroidFloorPx: 0.15,    // never trust a dot's position better than this
};
const GRID_CELL = 8;        // px, for the neighbour lookup

// ------------------------------------------------------------------ 1) detection

/** [1 2 1]/4 smoothing in x then y (a tiny matched filter for stars about 2 px wide). */
function smooth(grey, n) {
  const tmp = new Float32Array(n * n);
  const out = new Float32Array(n * n);
  for (let y = 0; y < n; y++) {
    const row = y * n;
    for (let x = 0; x < n; x++) {
      tmp[row + x] = (grey[row + Math.max(0, x - 1)] + 2 * grey[row + x] + grey[row + Math.min(n - 1, x + 1)]) / 4;
    }
  }
  for (let y = 0; y < n; y++) {
    const up = Math.max(0, y - 1) * n, mid = y * n, down = Math.min(n - 1, y + 1) * n;
    for (let x = 0; x < n; x++) out[mid + x] = (tmp[up + x] + 2 * tmp[mid + x] + tmp[down + x]) / 4;
  }
  return out;
}

/**
 * Background level and noise of an image, from about 20 000 sample pixels.
 * Noise = 84th percentile minus median ("upper-half sigma"): stars hardly move it, and it is
 * not fooled by the dark end being clipped at 0 in 8-bit pictures.
 */
function backgroundStats(img) {
  const step = Math.max(1, Math.floor(img.length / 20000));
  const sample = [];
  for (let i = 0; i < img.length; i += step) sample.push(img[i]);
  sample.sort((a, b) => a - b);
  const q = (p) => sample[Math.min(sample.length - 1, Math.floor(p * sample.length))];
  const median = q(0.5);
  return { median, sigma: Math.max(0.5, q(0.8413) - median) };
}

/** Is pixel (x, y) the top of its 3x3 neighbourhood? Ties go to the first pixel in reading order. */
function isLocalMax(img, n, x, y, v) {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const u = img[(y + dy) * n + x + dx];
      const earlier = dy < 0 || (dy === 0 && dx < 0);
      if (earlier ? u >= v : u > v) return false;
    }
  }
  return true;
}

/**
 * Centre of a star: brightness-weighted mean of the pixels around it, with a Gaussian window that is
 * re-centred on the previous answer 6 times (the usual "windowed centroid"). Pixel i covers [i, i+1).
 * A plain 5x5 box centred on the peak pixel was 0.8 px off for very bright stars, which saturate the
 * 8-bit picture into a flat-topped blob with wide wings: enough to hide a mover on real data.
 */
function centroid(grey, n, px, py, background) {
  const RADIUS = 3, SIGMA = 1.3;           // tight enough not to mix in a neighbouring star
  let cx = px + 0.5, cy = py + 0.5;
  for (let pass = 0; pass < 6; pass++) {
    const ix = Math.floor(cx), iy = Math.floor(cy);
    let sw = 0, sx = 0, sy = 0;
    for (let dy = -RADIUS; dy <= RADIUS; dy++) {
      for (let dx = -RADIUS; dx <= RADIUS; dx++) {
        const x = ix + dx, y = iy + dy;
        if (x < 0 || y < 0 || x >= n || y >= n) continue;
        const w0 = grey[y * n + x] - background;
        if (w0 <= 0) continue;
        const ex = x + 0.5 - cx, ey = y + 0.5 - cy;
        const w = w0 * Math.exp(-(ex * ex + ey * ey) / (2 * SIGMA * SIGMA));
        sw += w; sx += w * (x + 0.5); sy += w * (y + 0.5);
      }
    }
    if (sw <= 0) return pass ? { x: cx, y: cy } : null;
    cx = sx / sw; cy = sy / sw;
  }
  return { x: cx, y: cy };
}

/**
 * Dots in one grey image (n x n, values 0..255, row 0 = top).
 * Returns [{ x, y, snr }] with x, y in "edge" pixel coordinates (centre of pixel 0 = 0.5).
 */
export function detectSources(grey, n, { detectSigma = DEFAULTS.detectSigma, edgeMargin = DEFAULTS.edgeMargin } = {}) {
  if (!grey || grey.length !== n * n || n < 2 * edgeMargin + 3) return [];
  const sm = smooth(grey, n);
  const { median, sigma } = backgroundStats(sm);
  const threshold = median + detectSigma * sigma;
  const found = [];
  for (let y = edgeMargin; y < n - edgeMargin; y++) {
    for (let x = edgeMargin; x < n - edgeMargin; x++) {
      const v = sm[y * n + x];
      if (v < threshold || !isLocalMax(sm, n, x, y, v)) continue;
      const c = centroid(grey, n, x, y, median);
      if (c) found.push({ x: c.x, y: c.y, snr: (v - median) / sigma });
    }
  }
  return found;
}

// ------------------------------------------------------------------ 2) linking

/** Spatial hash so "which dots are near here?" does not scan every dot. */
function makeGrid(dots) {
  const cells = new Map();
  const key = (cx, cy) => cx * 100003 + cy;
  for (const d of dots) {
    const k = key(Math.floor(d.x / GRID_CELL), Math.floor(d.y / GRID_CELL));
    if (!cells.has(k)) cells.set(k, []);
    cells.get(k).push(d);
  }
  const each = (x, y, r, visit) => {
    const c0 = Math.floor((x - r) / GRID_CELL), c1 = Math.floor((x + r) / GRID_CELL);
    const r0 = Math.floor((y - r) / GRID_CELL), r1 = Math.floor((y + r) / GRID_CELL);
    for (let cx = c0; cx <= c1; cx++) {
      for (let cy = r0; cy <= r1; cy++) {
        const list = cells.get(key(cx, cy));
        if (!list) continue;
        for (const d of list) if (!d.used && Math.hypot(d.x - x, d.y - y) <= r) visit(d);
      }
    }
  };
  return {
    each,
    /** Closest unused dot within r of (x, y), or null. */
    nearest(x, y, r) {
      let best = null, bestDist = Infinity;
      each(x, y, r, (d) => {
        const dist = Math.hypot(d.x - x, d.y - y);
        if (dist < bestDist) { best = d; bestDist = dist; }
      });
      return best;
    },
  };
}

/** Least-squares straight line through dots (one per image): position = p0 + v * (t - tRef). */
function fitLine(members, t) {
  const m = members.length;
  let tm = 0, mx = 0, my = 0;
  for (const d of members) { tm += t[d.k]; mx += d.x; my += d.y; }
  tm /= m; mx /= m; my /= m;
  let sxx = 0, sxt = 0, syt = 0;
  for (const d of members) {
    const dt = t[d.k] - tm;
    sxx += dt * dt; sxt += dt * (d.x - mx); syt += dt * (d.y - my);
  }
  const ok = sxx > 1e-9;
  return { x0: mx, y0: my, vx: ok ? sxt / sxx : 0, vy: ok ? syt / sxx : 0, tRef: tm, sxx };
}
const lineAt = (line, time) => ({
  x: line.x0 + line.vx * (time - line.tRef),
  y: line.y0 + line.vy * (time - line.tRef),
});

/** Survey-pass number (0, 1, 2 ...) of each image: images less than minGapDays apart share a pass. */
export function passIndices(mjds, minGapDays = DEFAULTS.minPassGapDays) {
  const out = [];
  let pass = 0;
  mjds.forEach((mjd, k) => {
    if (k && mjd - mjds[k - 1] >= minGapDays) pass++;
    out.push(pass);
  });
  return out;
}

/**
 * Find movers among dots already detected.
 * frames: [{ mjd, sources: [{ x, y, snr }] }] in TIME ORDER (the order of the blink player).
 * Returns { candidates, stats, reason? }. Each candidate:
 *   { x, y, vx, vy, mjdRef,           position (px) at mjdRef and velocity (px per year)
 *     speedPx, motionPx,              |v| and total motion over the dots used
 *     nDet, nFrames, rms, significance, snr,
 *     points: [{ frame, x, y }] }     the dots that belong to it
 * sorted best first (largest significance).
 */
export function findMovers(frames, options = {}) {
  const o = { ...DEFAULTS, ...options };
  const N = frames.length;
  const stats = { frames: N, passes: 0, dotsPerFrame: frames.map((f) => f.sources.length), stillDots: 0 };
  if (N < 3) return { candidates: [], stats, reason: "needs at least 3 images" };
  for (let k = 1; k < N; k++) if (frames[k].mjd < frames[k - 1].mjd) throw new Error("frames must be in time order");

  const t0 = frames[0].mjd;
  const t = frames.map((f) => (f.mjd - t0) / 365.25);                 // years since the first image
  const mjdRef = (t0 + frames[N - 1].mjd) / 2;
  const tRef = (mjdRef - t0) / 365.25;

  // Survey passes ("epochs"): images less than minPassGapDays apart belong to the same pass.
  // Two dots from two passes ALWAYS define a line; only a third pass can prove it is real.
  const epoch = passIndices(frames.map((f) => f.mjd), o.minPassGapDays);
  const nEpochs = epoch[N - 1] + 1;
  stats.passes = nEpochs;
  if (nEpochs < 3) {
    return { candidates: [], stats, reason: `needs images from at least 3 survey passes (found ${nEpochs})` };
  }
  const minEpochs = Math.min(nEpochs, Math.max(3, Math.ceil(nEpochs / 2)));
  const minDet = Math.max(o.minDetections, Math.ceil(N / 2));
  const epochsOf = (members) => new Set(members.map((d) => epoch[d.k])).size;

  const dots = frames.map((f, k) => f.sources.map((s) => ({ k, x: s.x, y: s.y, snr: s.snr ?? 0, used: false })));
  const grids = dots.map(makeGrid);
  const candidates = [];

  // The closest unused dot to the line's predicted spot, image by image.
  const collect = (line) => {
    const members = [];
    for (let k = 0; k < N; k++) {
      const p = lineAt(line, t[k]);
      const hit = grids[k].nearest(p.x, p.y, o.matchRadiusPx);
      if (hit) members.push(hit);
    }
    return members;
  };

  /** Does the pair (a, b) start a real line? If so, record it (mover or still star) and say true. */
  const tryLine = (a, b) => {
    const dt = t[b.k] - t[a.k];
    // 1) the straight line through the pair, and the dots that agree with it
    let line = { x0: a.x, y0: a.y, vx: (b.x - a.x) / dt, vy: (b.y - a.y) / dt, tRef: t[a.k] };
    let members = collect(line);
    if (members.length < minDet || epochsOf(members) < minEpochs) return false;
    // 2) refine: fit all those dots, look again (picks up images the two-point line missed)
    for (let pass = 0; pass < 2; pass++) {
      line = fitLine(members, t);
      const again = collect(line);
      if (again.length < minDet || epochsOf(again) < minEpochs) return false;
      members = again;
    }
    line = fitLine(members, t);

    // 3) quality of the fit
    let ss = 0, snrSum = 0;
    for (const d of members) {
      const p = lineAt(line, t[d.k]);
      ss += (d.x - p.x) ** 2 + (d.y - p.y) ** 2;
      snrSum += d.snr;
    }
    const m = members.length;
    const rms = Math.sqrt(ss / (2 * Math.max(1, m - 2)));
    if (rms > o.maxRmsPx) return false;

    // 4) accept the line; is it a still star or a mover?
    for (const d of members) d.used = true;
    const sigmaPos = Math.max(rms, o.centroidFloorPx);
    const speed = Math.hypot(line.vx, line.vy);
    const first = Math.min(...members.map((d) => t[d.k])), last = Math.max(...members.map((d) => t[d.k]));
    const motion = speed * (last - first);
    const significance = speed / (sigmaPos / Math.sqrt(line.sxx));
    if (significance < o.minSignificance || motion < o.minMotionPx) { stats.stillDots += 1; return true; }

    const at = lineAt(line, tRef);
    candidates.push({
      x: at.x, y: at.y, vx: line.vx, vy: line.vy, mjdRef,
      speedPx: speed, motionPx: motion,
      nDet: m, nFrames: N, rms, significance, snr: snrSum / m,
      points: members.map((d) => ({ frame: d.k, x: d.x, y: d.y })),
    });
    return true;
  };

  // Pairs of dots from two different passes, closest partner first.
  //   Round 1 (slowOnly): partners within staticRadiusPx = still stars and slow movers. A dot that has
  //     a partner but no valid line (probably a faint star seen in only two passes) is set aside.
  //   Round 2: whatever is left, partners up to maxSpeedPxPerYear = fast movers.
  // Stars go first so they cannot be mistaken for the ends of a fast line.
  const search = (radiusFor, setAside) => {
    for (let i = 0; i < N - 1; i++) {
      for (let j = i + 1; j < N; j++) {
        if (epoch[i] === epoch[j]) continue;
        const dt = t[j] - t[i];
        for (const a of dots[i]) {
          if (a.used) continue;
          const near = [];
          grids[j].each(a.x, a.y, radiusFor(dt), (b) => near.push(b));
          near.sort((p, q) => Math.hypot(p.x - a.x, p.y - a.y) - Math.hypot(q.x - a.x, q.y - a.y));
          for (const b of near) {
            if (a.used) break;
            if (!b.used && tryLine(a, b)) break;
          }
          if (setAside && !a.used && near.length) {
            a.used = true;
            const b = near.find((d) => !d.used);
            if (b) b.used = true;
          }
        }
      }
    }
  };
  search(() => o.staticRadiusPx, true);
  search((dt) => o.maxSpeedPxPerYear * dt, false);

  candidates.sort((p, q) => q.significance - p.significance);
  return { candidates, stats };
}

/** Detect dots in every image, then link them. frames: [{ mjd, grey }] in time order. */
export function findMoversInImages(frames, n, options = {}) {
  const detected = frames.map((f) => ({ mjd: f.mjd, sources: detectSources(f.grey, n, options) }));
  return findMovers(detected, options);
}

// ------------------------------------------------------------------ 3) describing a candidate

/** Where is the candidate (pixels) on a given date? */
export function moverPositionAtMjd(c, mjd) {
  const years = (mjd - c.mjdRef) / 365.25;
  return { x: c.x + c.vx * years, y: c.y + c.vy * years };
}

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

/**
 * Sky position and motion of a candidate.
 * geo = { ra, dec, n, scaleArcsec }: the cutout the pixels belong to (north up, east LEFT).
 */
export function describeMover(c, geo) {
  const east = -c.vx * geo.scaleArcsec;        // image right = west, so east is -x
  const north = -c.vy * geo.scaleArcsec;       // image down = south, so north is -y
  const pa = (Math.atan2(east, north) * 180 / Math.PI + 360) % 360;
  const sky = canvasToSky(c.x / geo.n, c.y / geo.n, geo);
  return {
    ra: sky.ra, dec: sky.dec,
    speedArcsecPerYear: Math.hypot(east, north),
    pmEastArcsecPerYear: east, pmNorthArcsecPerYear: north,
    positionAngleDeg: pa,
    compass: COMPASS[Math.round(pa / 45) % 8],
  };
}

/**
 * A catalogue test object that sits where the candidate is, on the candidate's reference date
 * (SIMBAD position + proper motion). Returns { target, distPx } or null.
 */
export function matchKnownObject(c, geo, targets, { maxDistPx = 3 } = {}) {
  const year = mjdToYear(c.mjdRef);
  let best = null;
  for (const target of targets) {
    if (target.type && target.type !== "mover") continue;      // test objects have a type; catalogue objects have none
    const p = positionAtEpoch(target, year);
    const { fx, fy } = skyToCanvas(p.ra, p.dec, geo);
    const distPx = Math.hypot(fx * geo.n - c.x, fy * geo.n - c.y);
    if (distPx <= maxDistPx && (!best || distPx < best.distPx)) best = { target, distPx };
  }
  return best;
}
