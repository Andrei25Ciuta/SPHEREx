// Real test of the Earth-parallax distance fit: Makemake (a dwarf planet 52 AU away) in real SPHEREx images.
//
//   node scratch/real_parallax.mjs --api http://localhost:8003
//
// Inputs (an experiment, not data of the app): 7 real D2 cutouts (5 arcmin, backend/data/real/asteroid_Makemake_*.fits), each
// centred on the position JPL Horizons gives for Makemake at that image's time (scratch/find_body_frames.py found the images,
// scratch/fetch_asteroid_cutout.py downloaded them). For each image: the dot nearest the cutout centre is measured, its position
// converted to the sky, and the set of positions fitted with  straight drift + Earth parallax  (features/parallax.js fitParallax).
// The fitted distance is compared with Horizons' own geocentric distance (delta). The ephemeris is used ONLY to say where to
// cut each image; the fit uses the measured positions.
//
// The 7 rows were typed from the output of find_body_frames.py (Horizons, geocentric, ICRF); the last column is Horizons' delta (AU).

import { detectSources } from "../frontend/js/features/movers.js";
import { fitParallax, findDistantMovers, describeDistant, logGrid, parallaxOffsetArcsec } from "../frontend/js/features/parallax.js";
import { canvasToSky } from "../frontend/js/geometry.js";

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
const api = args.api ?? "http://localhost:8003";
const ROWS = [   // mjd, RA, Dec at that time (Horizons), delta AU
  [60827.32163, 200.00676, 21.52277, 52.267], [60834.86410, 199.93729, 21.48510, 52.370], [60860.00764, 199.81978, 21.29442, 52.740],
  [61040.16488, 202.30080, 20.14061, 52.756], [61049.25866, 202.34957, 20.20221, 52.616], [61195.65318, 200.74359, 21.01326, 52.315],
  [61200.60870, 200.69920, 20.98785, 52.382],
];
const RAD = Math.PI / 180, ARCSEC = 206264.806;

const getJson = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`); return r.json(); };
const getBin = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`); return r.arrayBuffer(); };

// ---- 1) measure: the dot nearest the predicted position in each image
const measured = [];
const allFrames = [];                                              // every dot of every cutout, for the blind triple search below
for (const [mjd, ra, dec, delta] of ROWS) {
  const { frames } = await getJson(`${api}/api/cutouts?ra=${ra}&dec=${dec}&fov=5&det=D2`);
  const f = frames.find((x) => Math.abs(x.mjd - mjd) < 1e-3);
  if (!f) { console.log(`MJD ${mjd}: the backend has no cutout for it`); continue; }
  const img = new Float32Array(await getBin(f.dataUrl));
  const mask = f.maskUrl ? new Uint8Array(await getBin(f.maskUrl)) : null;
  const n = Math.round(Math.sqrt(img.length)), geo = { ra, dec, n, scaleArcsec: f.pixelScaleArcsec };
  const dots = detectSources(img, n, { sigmaFloor: 1e-9, mask, detectSigma: 4 });
  allFrames.push({ mjd, sources: dots, geo });
  const near = dots.map((d) => ({ ...d, r: Math.hypot(d.x - n / 2, d.y - n / 2) })).filter((d) => d.r <= 5).sort((a, b) => a.r - b.r)[0];
  if (!near) { console.log(`${f.dateISO.slice(0, 10)}  no dot within 5 px of the predicted position (${dots.length} dots in the image)`); continue; }
  const sky = canvasToSky(near.x / n, near.y / n, geo);
  measured.push({ mjd, ra: sky.ra, dec: sky.dec, delta, snr: near.snr, offsetArcsec: near.r * f.pixelScaleArcsec, date: f.dateISO.slice(0, 10) });
  console.log(`${f.dateISO.slice(0, 10)} MJD ${mjd.toFixed(3)}  dot ${near.r.toFixed(2)} px (${(near.r * f.pixelScaleArcsec).toFixed(1)}") from the ephemeris position, S/N ${near.snr.toFixed(1)}, ${dots.length} dots in the image`);
}
if (measured.length < 4) { console.log("too few measurements for the fit"); process.exit(0); }

// ---- 2) tangent-plane offsets (arcsec) from the position measured at the reference image (the one nearest the middle date)
measured.sort((a, b) => a.mjd - b.mjd);
const mid = (measured[0].mjd + measured.at(-1).mjd) / 2;
const ref = measured.reduce((b, m) => (Math.abs(m.mjd - mid) < Math.abs(b.mjd - mid) ? m : b));
const tangent = (ra, dec) => {                                    // gnomonic offsets from the reference direction, arcsec
  const a = (ra - ref.ra) * RAD, d = dec * RAD, d0 = ref.dec * RAD;
  const D = Math.sin(d0) * Math.sin(d) + Math.cos(d0) * Math.cos(d) * Math.cos(a);
  return { east: (Math.cos(d) * Math.sin(a) / D) * ARCSEC, north: ((Math.cos(d0) * Math.sin(d) - Math.sin(d0) * Math.cos(d) * Math.cos(a)) / D) * ARCSEC };
};
const SIGMA = Number(args.sigma ?? 4);                            // arcsec: ~0.65 px centroid error of a source of S/N 5-10, plus the WCS
const obs = measured.map((m) => ({ mjd: m.mjd, ...tangent(m.ra, m.dec), sigma: SIGMA }));
console.log(`\nreference image: ${ref.date} (MJD ${ref.mjd.toFixed(3)}); the model's parallax is zero there`);
console.log("offsets from the reference direction (arcsec east, north):", obs.map((o) => `(${o.east.toFixed(0)}, ${o.north.toFixed(0)})`).join(" "));

// ---- 3) fit
const fit = fitParallax(obs, { ra: ref.ra, dec: ref.dec, mjdRef: ref.mjd, distancesAU: logGrid(20, 3000, 700) });
const truth = ref.delta;                                          // Horizons' geocentric distance on the reference date
console.log(`\nFIT  distance ${fit.best.distanceAU.toFixed(1)} AU  (1 sigma range ${fit.rangeAU.map((v) => v.toFixed(1)).join(" - ")})   chi2 ${fit.best.chi2.toFixed(1)} for ${fit.dof} degrees of freedom`);
console.log(`     the best STRAIGHT line without parallax: chi2 ${fit.linear.chi2.toFixed(0)}  (worse by ${fit.deltaChi2.toFixed(0)})`);
console.log(`     own drift fitted: ${fit.muEast.toFixed(0)} east, ${fit.muNorth.toFixed(0)} north arcsec/yr`);
console.log(`TRUTH (Horizons geocentric distance on ${ref.date}): ${truth.toFixed(2)} AU  ->  fit / truth = ${(fit.best.distanceAU / truth).toFixed(3)}`);
// a finer grid around the best distance (the first grid is 0.7 % steps), and leave-one-out: does one point carry the result?
const fine = fitParallax(obs, { ra: ref.ra, dec: ref.dec, mjdRef: ref.mjd, distancesAU: logGrid(fit.best.distanceAU * 0.9, fit.best.distanceAU * 1.1, 800) });
console.log(`     finer grid: ${fine.best.distanceAU.toFixed(2)} AU, 1 sigma range ${fine.rangeAU.map((v) => v.toFixed(2)).join(" - ")} (statistical, sigma = ${SIGMA}")`);
for (let k = 0; k < obs.length; k++) {
  if (obs.length < 5) break;                                       // with 4 points, leaving one out leaves no degree of freedom
  const sub = obs.filter((_, j) => j !== k);
  const f2 = fitParallax(sub, { ra: ref.ra, dec: ref.dec, mjdRef: ref.mjd, distancesAU: logGrid(20, 3000, 700) });
  console.log(`     without ${measured[k].date}: ${f2.best.distanceAU.toFixed(1)} AU`);
}
for (const s of [2, 4, 8]) {
  const f3 = fitParallax(obs.map((o) => ({ ...o, sigma: s })), { ra: ref.ra, dec: ref.dec, mjdRef: ref.mjd, distancesAU: logGrid(20, 3000, 700) });
  console.log(`     assuming sigma = ${s}": ${f3.best.distanceAU.toFixed(1)} AU`);
}
// residuals of the best model, to see whether sigma was a fair guess
const model = (o) => { const p = parallaxOffsetArcsec(ref.ra, ref.dec, o.mjd, ref.mjd, fit.best.distanceAU); return p; };
const t0 = obs.reduce((s, o) => s + o.mjd, 0) / obs.length;
const lin = (key, mu, a0) => (o) => a0 + mu * (o.mjd - t0) / 365.25;
let mE = 0, mN = 0; obs.forEach((o) => { const p = model(o); mE += o.east - p.east; mN += o.north - p.north; }); mE /= obs.length; mN /= obs.length;
console.log("residuals of the best model (arcsec east, north):", obs.map((o) => { const p = model(o), y = (o.mjd - t0) / 365.25; return `(${(o.east - p.east - mE - fit.muEast * y).toFixed(1)}, ${(o.north - p.north - mN - fit.muNorth * y).toFixed(1)})`; }).join(" "));

// ---- 4) the BLIND search (features/parallax.js findDistantMovers): all the dots of all 7 cutouts, which lie at different places on the
// sky (2.5 degrees apart), are brought into one plane; no ephemeris is used in the search.
// RESULT (honest, negative): none of the candidates is Makemake (see the grading below). The test is also biased in a way that only
// makes it easier: every cutout is centred on the body, so ANY dot near a cutout's centre follows the body's parallax track, and the
// body is detected in only 4 of 7 images, so the 5-parameter model has 3 degrees of freedom left and chance dots fit as well.
// The ephemeris-guided fit above is the real result of this script; a blind search needs cutouts NOT centred on the body and more detections.
allFrames.sort((a, b) => a.mjd - b.mjd);
const plane = { ra: ref.ra, dec: ref.dec, n: 3600, scaleArcsec: allFrames[0].geo.scaleArcsec };
const t1 = performance.now();
const search = findDistantMovers(allFrames, plane, {
  minDistanceAU: 20, maxDistanceAU: 3000, minParallaxFraction: 0.5, minPerPass: 1, maxParallaxRmsPx: 1.5, maxRmsPx: 3, matchRadiusPx: 2.5,
  seedResidualPx: 4, minParallaxSigma: 4, maxSpeedPxPerYear: 1000, maxEscapeFactor: 1.5, register: false,
});
console.log(`\nBLIND SEARCH over ${allFrames.length} cutouts (${allFrames.reduce((s, f) => s + f.sources.length, 0)} dots in all; ${search.stats.seeds} seeds, ${((performance.now() - t1) / 1000).toFixed(1)} s): ${search.reason ?? search.candidates.length + " candidate(s)"}`);
for (const c of search.candidates) {
  const d = describeDistant(c, plane);
  console.log(`  distance ${c.distanceAU.toFixed(1)} AU (${c.distanceRangeAU.map((v) => v.toFixed(1)).join(" - ")}), seen in ${c.nDet} of ${c.nFrames} dates, rms ${c.rms.toFixed(2)} px, ${c.parallaxSigma.toFixed(0)} sigma better than a straight line; own speed ${d.ownVelocityKms.toFixed(1)} km/s (escape ${d.escapeKms.toFixed(1)}) bound=${d.bound}`);
}
// Which candidates are the body? Compare each candidate's predicted position, image by image, with where Horizons says Makemake was
// (brought into the same plane by the same projection). This uses the ephemeris only to GRADE the blind result, not to produce it.
const toPlane = (ra, dec) => {
  const a = (ra - plane.ra) * RAD, d = dec * RAD, d0 = plane.dec * RAD;
  const D = Math.sin(d0) * Math.sin(d) + Math.cos(d0) * Math.cos(d) * Math.cos(a);
  return { x: plane.n / 2 - (Math.cos(d) * Math.sin(a) / D) * ARCSEC / plane.scaleArcsec, y: plane.n / 2 - ((Math.cos(d0) * Math.sin(d) - Math.sin(d0) * Math.cos(d) * Math.cos(a)) / D) * ARCSEC / plane.scaleArcsec };
};
const truthOf = new Map(ROWS.map(([mjd, ra, dec]) => [mjd, toPlane(ra, dec)]));
let onBody = 0;
for (const c of search.candidates) {
  const errs = allFrames.map((f, k) => {
    const tr = truthOf.get(f.mjd), y = (f.mjd - c.mjdRef) / 365.25;
    return Math.hypot(c.x + c.vx * y + c.shifts[k].dx - tr.x, c.y + c.vy * y + c.shifts[k].dy - tr.y);
  });
  const memberErrs = c.points.map((p) => { const tr = truthOf.get(allFrames[p.frame].mjd); return Math.hypot(p.x - tr.x, p.y - tr.y); });
  const good = memberErrs.filter((e) => e <= 4).length;
  const isBody = good === c.points.length;
  if (isBody) onBody++;
  console.log(`  ${c.distanceAU.toFixed(1)} AU: model - Horizons per image (px): ${errs.map((e) => e.toFixed(1)).join(" ")}; ${good} of ${c.points.length} dots lie within 4 px of Horizons -> ${isBody ? "THE BODY" : "chance combination"}`);
}
console.log(`  => ${onBody} of ${search.candidates.length} candidates are the body (all their dots on its Horizons position)`);
if (args.points) for (const c of search.candidates) console.log(`  dist ${c.distanceAU.toFixed(1)} members (frame:x,y): ${c.points.map((p) => `${p.frame}:${p.x.toFixed(0)},${p.y.toFixed(0)}`).join("  ")}`);
