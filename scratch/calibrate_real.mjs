// How good is "Find movers" really, measured on REAL SPHEREx frames?  Two experiments that need no new download.
//
//   node scratch/calibrate_real.mjs --api http://localhost:8003 --field "Barnard D2" --mode both --trials 40 --nulls 300 --seed 1
//
// Run it against a backend that serves ONLY the real files (SPHEREX_DATA_DIR=backend/data/real). Fields: see FIELDS below.
//
// 1. INJECTION AND RECOVERY (--mode inject).  A fake mover (a Gaussian star, sigma set by --sigma, default 0.9 px) is added to the real frames along a straight
//    path with a known speed, then the unchanged detector (detectSources + findMovers, default rules) is run. The real frames
//    supply the real noise, background, pointing errors and star crowding. Per image the source is placed where the field stars
//    of that image are shifted (registerShifts of the uninjected frames), as a real object would be. Reports, per speed and
//    brightness: the fraction of fakes recovered, the single-image detection fraction, and the false candidates besides the fake.
//    The brightness is given three ways: as a multiple of the pixel noise, as the S/N of a 2-pixel aperture (apertureSnr), and in mJy
//    (MJy/sr x pixel solid angle). The fake's flux is the same in every image unless --wobble 1 (each image x 0.6-1.4,
//    a rough stand-in for the variable filter).
//
// 2. EMPTY-SKY CALIBRATION OF THE FALSE-ALARM NUMBER (--mode null).  Every real frame is rotated/mirrored at random and moved
//    by a random whole number of pixels (wrapping at the edges), independently of the others. Real noise, real star counts and
//    real fluxes stay; every correspondence between images is destroyed, so any candidate is a false alarm by construction. If the
//    "chance lines expected" number (falseAlarm) were exact, a fraction f of such fields would show a candidate with falseAlarm <= f.
//    Reports that fraction for several f. What it does NOT cover: real variable stars, real clustering of faint sources,
//    and anything the scrambling keeps in common between images (a star at the very centre stays near the centre).

import { detectSources, findMovers, registerShifts, moverPositionAtMjd, apertureSnr, passIndices } from "../frontend/js/features/movers.js";
import { loadField, mulberry32, parseArgs, dihedral, wrapShift, pixelNoise, wilson } from "./lib_real.mjs";

export const FIELDS = {
  "Barnard D2": { ra: 269.4462, dec: 4.769, det: "D2" },
  "Barnard D6": { ra: 269.4462, dec: 4.769, det: "D6" },
  "Epsilon Indi B D2": { ra: 331.0965, dec: -56.8006, det: "D2" },
  "Epsilon Indi B D6": { ra: 331.0965, dec: -56.8006, det: "D6" },
  "WISE 0855 D2": { ra: 133.7598, dec: -7.2422, det: "D2" },
  "WISE 0855 D6": { ra: 133.7598, dec: -7.2422, det: "D6" },
};
// Total flux of the fake (the sum of its pixel values, MJy/sr x px) in units of the DETECTOR'S OWN noise (the "upper-half sigma" of
// the smoothed image that detectSources compares with: 5 sigma is its threshold). On real frames that noise is 0.6-3.5 x the plain
// pixel noise, depending on how much structure (a bright star's halo, a sky gradient) the field has, so a grid in pixel-noise units
// would not be comparable between fields. The columns of the report translate it to the S/N of a 2-pixel aperture and to mJy.
const AMPS = [6, 9, 12, 15, 18, 22, 26, 32, 40, 50];
const SPEEDS = [1, 2, 4, 10, 30, 100];                                 // arcsec per year
const SNR_BINS = [0, 2, 4, 6, 8, 10, 12, 15, 20, 30, 50, Infinity];    // per-image aperture S/N bins for the single-image detection fraction
const MARGIN = 4;                                                      // px kept free around the fake's path

const args = parseArgs();
const api = args.api ?? "http://localhost:8003";
const mode = args.mode ?? "both";
const trials = Number(args.trials ?? 40), nulls = Number(args.nulls ?? 300), seed = Number(args.seed ?? 1), wobble = args.wobble === "1";
const field = FIELDS[args.field];
if (!field) { console.error(`--field must be one of: ${Object.keys(FIELDS).join(", ")}`); process.exit(2); }

// Effective width of a star: a Gaussian with the FWHM the FITS headers give (median PSF_FWHM over our files, read 7 Nov 2026: D2 5.15", D6 6.61"),
// INTEGRATED over each pixel (the pixel value is the light that falls inside it). Check on real data: a faint source (Makemake in D2) has a peak pixel of
// 11-16 sigma with neighbours of 3-5 sigma, as this gives. Two earlier runs used a Gaussian of sigma 1.3 px and 0.9 px sampled at pixel centres: both too broad.
const FWHM_ARCSEC = { D2: 5.15, D6: 6.61 };
const SIGMA_PSF = args.sigma ? Number(args.sigma) : FWHM_ARCSEC[field.det] / 2.3548 / 6.14;
const erf = (x) => { const a = Math.abs(x), t = 1 / (1 + 0.3275911 * a); const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a); return x < 0 ? -y : y; };
const boxShare = (lo, hi, mu) => 0.5 * (erf((hi - mu) / (SIGMA_PSF * Math.SQRT2)) - erf((lo - mu) / (SIGMA_PSF * Math.SQRT2)));
/** Share of the star's light (centre x, y; pixel edges at integers) that falls in pixel (i, j). */
const pixelShare = (i, j, x, y) => boxShare(i, i + 1, x) * boxShare(j, j + 1, y);

const { frames, arrays, masks, n, scale } = await loadField(api, field.ra, field.dec, 5, field.det);
const N = frames.length;
const mjds = frames.map((f) => f.mjd);
const omega = (scale / 206264.806) ** 2;                               // sr per pixel
const mjyFromSum = omega * 1e9;                                        // a pixel sum in MJy/sr -> mJy
const detect = (imgs, ms) => imgs.map((a, k) => ({ mjd: mjds[k], sources: detectSources(a, n, { sigmaFloor: 1e-9, mask: ms[k] }) }));
const rule = args.rule ? { maxFalseAlarm: Number(args.rule) } : {};

const baseDots = detect(arrays, masks);
const base = findMovers(baseDots, { area: n * n, ...rule });
const shifts = registerShifts(baseDots).map((s) => (Math.abs(s.dx) > 0.05 || Math.abs(s.dy) > 0.05 ? s : { dx: 0, dy: 0 }));
const pixNoise = arrays.map((a) => pixelNoise(a).sigma);
/** The noise the detector uses: 84th percentile minus median of the [1 2 1]/4-smoothed image (same as backgroundStats in movers.js). */
function detectorNoise(img) {
  const g = Float32Array.from(img, (v) => (Number.isFinite(v) ? v : 0)), tmp = new Float32Array(n * n), sm = new Float32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) tmp[y * n + x] = (g[y * n + Math.max(0, x - 1)] + 2 * g[y * n + x] + g[y * n + Math.min(n - 1, x + 1)]) / 4;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) sm[y * n + x] = (tmp[Math.max(0, y - 1) * n + x] + 2 * tmp[y * n + x] + tmp[Math.min(n - 1, y + 1) * n + x]) / 4;
  const s = Array.from(sm).sort((a, b) => a - b);
  return s[Math.floor(0.8413 * s.length)] - s[Math.floor(0.5 * s.length)];
}
const noise = arrays.map(detectorNoise);
const passes = passIndices(mjds).at(-1) + 1;

console.log(`## ${args.field}: ${N} images, ${passes} survey passes, ${n} x ${n} px of ${scale}", seed ${seed}`);
console.log(`- Dots per image: ${baseDots.map((d) => d.sources.length).join(", ")}`);
console.log(`- Noise per pixel (1.4826 x MAD) ${Math.min(...pixNoise).toExponential(2)}-${Math.max(...pixNoise).toExponential(2)} MJy/sr; the detector's own noise ${Math.min(...noise).toExponential(2)}-${Math.max(...noise).toExponential(2)} MJy/sr (median ratio ${(noise.map((v, k) => v / pixNoise[k]).sort((a, b) => a - b)[Math.floor(N / 2)]).toFixed(2)}); stars: Gaussian of sigma ${SIGMA_PSF.toFixed(2)} px integrated over the pixels; 1 MJy/sr x px = ${mjyFromSum.toFixed(3)} mJy`);
console.log(`- Uninjected frames, default rule: ${base.candidates.length} candidate(s)${base.candidates.length ? " (" + base.candidates.map((c) => `${(Math.hypot(c.vx, c.vy) * scale).toFixed(1)}"/yr, ${c.nDet}/${c.nFrames} images, chance ${c.falseAlarm.toExponential(0)}`).join("; ") + ")" : ""}\n`);

const samePath = (c, truth, tol = 1.5) => {
  const d = truth.map((p, k) => { const q = moverPositionAtMjd(c, mjds[k]); return Math.hypot(q.x - p.x, q.y - p.y); }).sort((a, b) => a - b);
  return d[Math.floor(d.length / 2)] <= tol;
};

// ------------------------------------------------------------------ 1) injection and recovery
function runInjection() {
  const rng = mulberry32(seed);
  const midMjd = (mjds[0] + mjds[N - 1]) / 2;
  const t = mjds.map((m) => (m - midMjd) / 365.25);
  const cell = AMPS.map(() => SPEEDS.map(() => ({ trials: 0, found: 0, extra: 0, skipped: 0, snr: [], mjy: [] })));
  const perImage = SNR_BINS.slice(1).map(() => ({ hit: 0, all: 0 }));
  const apErr = [];
  const shares = [];                                                    // share of a fake's light inside the 2-pixel aperture
  const blendCount = { all: 0, blended: 0 };

  for (let ai = 0; ai < AMPS.length; ai++) {
    for (let si = 0; si < SPEEDS.length; si++) {
      const c = cell[ai][si];
      const vpx = SPEEDS[si] / scale;                                       // px per year
      for (let trial = 0; trial < trials; trial++) {
        // a straight path that stays inside the image (with the pointing shifts of every image) at every date
        let truth = null, vx = 0, vy = 0;
        for (let tries = 0; tries < 300 && !truth; tries++) {
          const th = rng() * 2 * Math.PI;
          vx = vpx * Math.cos(th); vy = vpx * Math.sin(th);
          const x0 = MARGIN + rng() * (n - 2 * MARGIN), y0 = MARGIN + rng() * (n - 2 * MARGIN);
          const path = t.map((tk, k) => ({ x: x0 + vx * tk, y: y0 + vy * tk, sx: shifts[k].dx, sy: shifts[k].dy }));
          if (path.every((p) => p.x + p.sx >= MARGIN && p.x + p.sx <= n - MARGIN && p.y + p.sy >= MARGIN && p.y + p.sy <= n - MARGIN)) truth = path;
        }
        if (!truth) { c.skipped++; continue; }
        const imgs = arrays.map((a, k) => {
          const img = Float32Array.from(a);
          const flux = AMPS[ai] * noise[k] * (wobble ? 0.6 + 0.8 * rng() : 1);
          const px = truth[k].x + truth[k].sx, py = truth[k].y + truth[k].sy;
          for (let j = Math.max(0, Math.floor(py - 4)); j <= Math.min(n - 1, Math.ceil(py + 4)); j++) {
            for (let i = Math.max(0, Math.floor(px - 4)); i <= Math.min(n - 1, Math.ceil(px + 4)); i++) img[j * n + i] += flux * pixelShare(i, j, px, py);
          }
          truth[k].flux = flux;
          return img;
        });
        const detected = detect(imgs, masks);
        // S/N of the fake alone: the sum of its own light inside a 2-pixel circle over the noise of that spot in the UNINJECTED image
        // (a neighbouring real star adds to the flux of apertureSnr(imgs) but not to the fake's signal)
        const snrs = truth.map((p, k) => {
          const x = p.x + p.sx, y = p.y + p.sy, ref = apertureSnr(arrays[k], n, x, y, 2);
          if (!ref || !(ref.err > 0)) return null;
          let sum = 0;
          for (let j = Math.floor(y - 2); j <= Math.ceil(y + 2); j++) for (let i = Math.floor(x - 2); i <= Math.ceil(x + 2); i++) {
            if (Math.hypot(i + 0.5 - x, j + 0.5 - y) <= 2) sum += p.flux * pixelShare(i, j, x, y);
          }
          return { snr: sum / ref.err, err: ref.err, share: sum / p.flux };
        });
        const goodSnr = snrs.filter(Boolean);
        goodSnr.forEach((g) => shares.push(g.share));
        if (goodSnr.length) { c.snr.push(goodSnr.map((s) => s.snr).sort((a, b) => a - b)[Math.floor(goodSnr.length / 2)]); apErr.push(goodSnr[0].err * mjyFromSum); }
        c.mjy.push(truth.map((p) => p.flux * mjyFromSum).sort((a, b) => a - b)[Math.floor(N / 2)]);
        truth.forEach((p, k) => {                                           // single-image detection: a dot within 1.5 px of the fake
          const x = p.x + p.sx, y = p.y + p.sy;
          const hit = detected[k].sources.some((s) => Math.hypot(s.x - x, s.y - y) <= 1.5);
          const s = snrs[k]?.snr;
          if (s === undefined || s === null) return;
          const alone = !baseDots[k].sources.some((d) => Math.hypot(d.x - x, d.y - y) <= 3);   // no real dot within 3 px: the fake is not blended
          blendCount.all++; if (!alone) blendCount.blended++;
          if (!alone) return;                                               // blended fakes are left out of the single-image table (they merge with the real star)
          const b = SNR_BINS.findIndex((edge, i) => i > 0 && s < edge && s >= SNR_BINS[i - 1]);
          if (b > 0) { perImage[b - 1].all++; if (hit) perImage[b - 1].hit++; }
        });
        const result = findMovers(detected, { area: n * n, ...rule });
        c.trials++;
        if (result.candidates.some((cand) => samePath(cand, truth))) c.found++;
        c.extra += result.candidates.filter((cand) => !samePath(cand, truth) && !base.candidates.some((b0) => samePath(b0, truth.map((_, k) => moverPositionAtMjd(cand, mjds[k]))))).length;
      }
    }
  }

  const med = (v) => (v.length ? [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)] : NaN);
  console.log(`### Injection and recovery${wobble ? " (brightness wobbles 0.6-1.4 x from image to image)" : " (same flux in every image)"}: ${trials} fakes per cell\n`);
  console.log(`Per-image aperture noise: ${med(apErr).toFixed(3)} mJy (2-pixel aperture, from the ring around the fake).\n`);
  console.log(`| total flux / detector noise | median S/N per image | flux mJy | ${SPEEDS.map((v) => `${v}"/yr`).join(" | ")} |`);
  console.log(`|---|---|---|${SPEEDS.map(() => "---").join("|")}|`);
  AMPS.forEach((a, ai) => {
    const row = cell[ai].map((c) => (c.trials ? `${Math.round((100 * c.found) / c.trials)} % (${c.found}/${c.trials})` : "n/a"));
    console.log(`| ${a} | ${med(cell[ai].flatMap((c) => c.snr)).toFixed(1)} | ${med(cell[ai].flatMap((c) => c.mjy)).toFixed(2)} | ${row.join(" | ")} |`);
  });
  const extra = cell.flat().reduce((s, c) => s + c.extra, 0), total = cell.flat().reduce((s, c) => s + c.trials, 0);
  console.log(`\nFalse candidates besides the fake: ${extra} in ${total} runs (${(extra / Math.max(1, total)).toFixed(3)} per run) with the rule maxFalseAlarm = ${rule.maxFalseAlarm ?? 1}.`);
  console.log(`\nSingle-image detection (a dot within 1.5 px of the fake) against the S/N of the fake's own light in a 2-pixel aperture, for fakes with no real dot within 3 px. ${blendCount.blended} of ${blendCount.all} placements (${(100 * blendCount.blended / Math.max(1, blendCount.all)).toFixed(0)} %) were blended with a real dot: they are left out of this table and count in the recovery table above.\n`);
  console.log(`| S/N bin | ${SNR_BINS.slice(1).map((e, i) => `${SNR_BINS[i]}-${Number.isFinite(e) ? e : "+"}`).join(" | ")} |`);
  console.log(`|---|${SNR_BINS.slice(1).map(() => "---").join("|")}|`);
  console.log(`| detected | ${perImage.map((b) => (b.all ? `${Math.round((100 * b.hit) / b.all)} % (${b.hit}/${b.all})` : "-")).join(" | ")} |`);
  // S/N at which a single image detects the fake 50 % and 90 % of the time (linear interpolation between the centres of the bins)
  const centres = perImage.map((b, i) => ({ s: Number.isFinite(SNR_BINS[i + 1]) ? (SNR_BINS[i] + SNR_BINS[i + 1]) / 2 : SNR_BINS[i] * 1.2, p: b.all >= 30 ? b.hit / b.all : null })).filter((c) => c.p !== null);
  const crossing = (level) => { for (let i = 1; i < centres.length; i++) if (centres[i - 1].p < level && centres[i].p >= level) return centres[i - 1].s + ((level - centres[i - 1].p) / (centres[i].p - centres[i - 1].p)) * (centres[i].s - centres[i - 1].s); return NaN; };
  const s50 = crossing(0.5), s90 = crossing(0.9);
  console.log(`\nSingle-image detection reaches 50 % at S/N ~ ${s50.toFixed(1)} and 90 % at ~ ${s90.toFixed(1)} (aperture flux ${(s50 * med(apErr)).toFixed(2)} and ${(s90 * med(apErr)).toFixed(2)} mJy; ${(100 * med(shares)).toFixed(0)} % of a star's light falls inside the aperture, so the TOTAL flux of the star is ${(s50 * med(apErr) / med(shares)).toFixed(2)} and ${(s90 * med(apErr) / med(shares)).toFixed(2)} mJy).`);
  const jsonCells = AMPS.map((a, ai) => ({ fluxOverNoise: a, snr: med(cell[ai].flatMap((c) => c.snr)), mjy: med(cell[ai].flatMap((c) => c.mjy)), recovered: cell[ai].map((c) => (c.trials ? c.found / c.trials : null)) }));
  console.log(`\nJSON ${JSON.stringify({ field: args.field, apertureNoiseMjy: med(apErr), apertureShare: med(shares), sigmaPsfPx: SIGMA_PSF, speeds: SPEEDS, cells: jsonCells, perImage: perImage.map((b, i) => ({ snr: [SNR_BINS[i], SNR_BINS[i + 1]], hit: b.hit, all: b.all })) })}`);
}

// ------------------------------------------------------------------ 2) empty-sky calibration
function runNull() {
  const rng = mulberry32(seed + 7919);
  const thresholds = [1e-4, 1e-3, 1e-2, 0.1, 1, Infinity];                  // Infinity = no false-alarm limit at all
  const minFa = [];
  const dotsNull = [];
  let withCandidate = 0;
  for (let r = 0; r < nulls; r++) {
    const imgs = [], ms = [];
    for (let k = 0; k < N; k++) {
      const d = Math.floor(rng() * 8), sx = Math.floor(rng() * n), sy = Math.floor(rng() * n);
      imgs.push(wrapShift(dihedral(arrays[k], n, d), n, sx, sy));
      ms.push(masks[k] ? wrapShift(dihedral(masks[k], n, d), n, sx, sy) : null);
    }
    const detected = detect(imgs, ms);
    dotsNull.push(detected.reduce((s, f) => s + f.sources.length, 0) / N);
    const result = findMovers(detected, { area: n * n, maxFalseAlarm: Infinity, ...(args.minfrac ? { minDetectionFraction: Number(args.minfrac) } : {}) });
    const lowest = result.candidates.length ? Math.min(...result.candidates.map((c) => c.falseAlarm)) : Infinity;
    minFa.push(lowest);
    if (lowest <= 1) withCandidate++;
  }
  console.log(`### Empty-sky calibration${args.minfrac ? ` with minDetectionFraction = ${args.minfrac} (the ORIGINAL rule used 0.5)` : ""}: ${nulls} scrambled copies of the field (mean ${(dotsNull.reduce((a, b) => a + b, 0) / nulls).toFixed(1)} dots per image; the real field has ${(baseDots.reduce((s, f) => s + f.sources.length, 0) / N).toFixed(1)})\n`);
  console.log(`| a candidate with chance lines expected <= f | ${thresholds.map((f) => (Number.isFinite(f) ? `f = ${f}` : "no limit")).join(" | ")} |`);
  console.log(`|---|${thresholds.map(() => "---").join("|")}|`);
  const cells = thresholds.map((f) => { const k = minFa.filter((v) => Number.isFinite(v) && v <= f).length; const [lo, hi] = wilson(k, nulls); return `${(100 * k / nulls).toFixed(1)} % (${k}/${nulls}; 95 % CI ${(100 * lo).toFixed(1)}-${(100 * hi).toFixed(1)} %)`; });
  console.log(`| share of scrambled fields that show one | ${cells.join(" | ")} |`);
  console.log(`| what an exact number would give | ${thresholds.map((f) => (Number.isFinite(f) ? `<= ${(100 * f).toFixed(2)} %` : "-")).join(" | ")} |`);
  console.log(`\nWith the default rule (kept when <= 1) ${withCandidate} of ${nulls} scrambled fields (${(100 * withCandidate / nulls).toFixed(1)} %) would have listed at least one false candidate.`);
  console.log(`\nJSON ${JSON.stringify({ field: args.field, nulls, thresholds, share: thresholds.map((f) => minFa.filter((v) => Number.isFinite(v) && v <= f).length / nulls), meanDots: dotsNull.reduce((a, b) => a + b, 0) / nulls })}`);
}

if (mode === "inject" || mode === "both") runInjection();
if (mode === "null" || mode === "both") runNull();
