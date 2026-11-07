// A FAIR blind test of Planet X mode on a real body: Makemake in 30-arcmin SPHEREx cutouts that are NOT centred on it.
//
//   node scratch/blind_planet_x.mjs --api http://localhost:8003 --det D1 [--nulls 20] [--variants A,B,C]
//
// Data: scratch/fetch_body_cutouts.py downloaded 12 D1 images (4 from each of 3 survey passes, chosen by date only), each cut
// 30' wide around Makemake's JPL Horizons position PLUS a random offset of 3-8 arcmin in each axis, so the body is somewhere in a
// field of ~300 dots per image and no dot is special by its place. scratch/blind_Makemake_truth.json holds Horizons' positions; they
// are read here ONLY to grade the candidates (and to say, afterwards, in how many images a dot sits on the body).
//
// The search is findDistantMovers of the app (features/parallax.js) on the dots detectSources finds (the app's default threshold),
// with the app's default options (variant A), with more seed dots (B), and loosened as scratch/real_parallax.mjs did (C).
// Registration is off in all variants: the cutouts lie on different bits of sky (a mosaic), where the app's pointing-error step
// has nothing to align. The plane of the search is centred on the mean of the cutout centres (not on the body).
//
// Control (--nulls): every image is rotated/mirrored and moved at random (as in calibrate_real.mjs) before detection: no body, no
// field star is where it was, so any candidate is a false alarm. The share of such sets that give a candidate says how often the
// mode would cry wolf at this dot density.

import { detectSources, apertureSnr } from "../frontend/js/features/movers.js";
import { findDistantMovers, describeDistant } from "../frontend/js/features/parallax.js";
import { skyToCanvas } from "../frontend/js/geometry.js";
import { mulberry32, parseArgs, dihedral, wrapShift } from "./lib_real.mjs";
import { readFileSync } from "node:fs";

const args = parseArgs();
const api = args.api ?? "http://localhost:8003";
const det = args.det ?? "D1";
const nulls = Number(args.nulls ?? 20);
const variants = (args.variants ?? "A,B,C").split(",");
const detectSigma = Number(args.sigma ?? 5);
const skipReal = args.skipReal === "1";                       // only the control (to run several copies of it in parallel with --seed)
const controlSeed = Number(args.seed ?? 11);
const truth = JSON.parse(readFileSync(new URL(`./blind_${args.name ?? "Makemake"}_truth.json`, import.meta.url), "utf8"));
const RAD = Math.PI / 180, ARCSEC = 206264.806;

const OPTIONS = {
  A: { register: false },
  B: { register: false, maxSeedDots: 250 },
  C: { register: false, minParallaxFraction: 0.5, minPerPass: 1, maxParallaxRmsPx: 1.5, maxRmsPx: 3, matchRadiusPx: 2.5, seedResidualPx: 4, minParallaxSigma: 4, maxSpeedPxPerYear: 1000, maxSeedDots: 250 },
};

// ---- 1) the images
const images = truth.images.filter((p) => p.band.endsWith(det)).sort((a, b) => a.mjd - b.mjd);
const loaded = [];
for (const p of images) {
  const r = await fetch(`${api}/api/cutouts?ra=${p.centreRa}&dec=${p.centreDec}&fov=${truth.sizeArcmin}&det=${det}`);
  if (!r.ok) { console.log(`${p.date}: backend HTTP ${r.status}`); continue; }
  const { frames } = await r.json();
  const f = frames.reduce((b, x) => (!b || Math.abs(x.mjd - p.mjd) < Math.abs(b.mjd - p.mjd) ? x : b), null);
  if (!f || Math.abs(f.mjd - p.mjd) > 2e-3) { console.log(`${p.date}: no frame for MJD ${p.mjd} (the backend has not got the file?)`); continue; }
  const img = new Float32Array(await (await fetch(f.dataUrl)).arrayBuffer());
  const mask = f.maskUrl ? new Uint8Array(await (await fetch(f.maskUrl)).arrayBuffer()) : null;
  const n = Math.round(Math.sqrt(img.length));
  loaded.push({ p, mjd: f.mjd, img, mask, n, geo: { ra: p.centreRa, dec: p.centreDec, n, scaleArcsec: f.pixelScaleArcsec } });
}
if (loaded.length < 3) { console.log("fewer than 3 images are available: nothing to do"); process.exit(0); }
const scale = loaded[0].geo.scaleArcsec;

const plane = {
  ra: loaded.reduce((s, l) => s + l.p.centreRa, 0) / loaded.length, dec: loaded.reduce((s, l) => s + l.p.centreDec, 0) / loaded.length,
  n: 4000, scaleArcsec: scale,
};
const toPlane = (ra, dec) => {                                    // gnomonic position of a sky point in the search plane (the search uses the same projection)
  const a = (ra - plane.ra) * RAD, d = dec * RAD, d0 = plane.dec * RAD;
  const D = Math.sin(d0) * Math.sin(d) + Math.cos(d0) * Math.cos(d) * Math.cos(a);
  return { x: plane.n / 2 - (Math.cos(d) * Math.sin(a) / D) * ARCSEC / scale, y: plane.n / 2 - ((Math.cos(d0) * Math.sin(d) - Math.sin(d0) * Math.cos(d) * Math.cos(a)) / D) * ARCSEC / scale };
};

console.log(`# Fair blind test of Planet X mode: ${truth.body} in ${loaded.length} ${det} cutouts of ${truth.sizeArcmin}' (${loaded[0].n} px), not centred on the body\n`);
const passes = new Set(loaded.map((l) => Math.round(l.mjd / 100))).size;
console.log(`- Images: ${loaded.map((l) => l.p.date).join(", ")}`);
console.log(`- Detection threshold ${detectSigma} sigma (the app's default); search plane centred on the mean of the cutout centres (RA ${plane.ra.toFixed(3)}, Dec ${plane.dec.toFixed(3)})`);

// ---- 2) dots, and where the body is (for grading only)
const detectAll = (arrays, masks) => loaded.map((l, k) => ({ mjd: l.mjd, sources: detectSources(arrays[k], l.n, { sigmaFloor: 1e-9, mask: masks[k], detectSigma }), geo: l.geo }));
const frames = detectAll(loaded.map((l) => l.img), loaded.map((l) => l.mask));
const bodyPx = loaded.map((l) => { const { fx, fy } = skyToCanvas(l.p.bodyRa, l.p.bodyDec, l.geo); return { x: fx * l.n, y: fy * l.n }; });
let found = 0;
console.log(`\n| image | dots | body at pixel (from Horizons) | offset from the cutout centre | nearest dot | S/N of that dot | aperture S/N at the body |`);
console.log(`|---|---|---|---|---|---|---|`);
loaded.forEach((l, k) => {
  const b = bodyPx[k], near = frames[k].sources.map((s) => ({ ...s, r: Math.hypot(s.x - b.x, s.y - b.y) })).sort((x, y) => x.r - y.r)[0];
  const hit = near && near.r <= 2;
  if (hit) found++;
  const ap = apertureSnr(l.img, l.n, b.x, b.y, 2);
  console.log(`| ${l.p.date} | ${frames[k].sources.length} | (${b.x.toFixed(0)}, ${b.y.toFixed(0)}) | ${(Math.hypot(b.x - l.n / 2, b.y - l.n / 2) * scale / 60).toFixed(1)}' | ${near ? near.r.toFixed(1) + " px" : "-"}${hit ? " (the body)" : ""} | ${near ? near.snr.toFixed(1) : "-"} | ${ap ? ap.snr.toFixed(1) : "-"} |`);
});
console.log(`\nThe body is detected as a dot in **${found} of ${loaded.length}** images (within 2 px of its Horizons position).`);

// ---- 3) the blind search, graded against Horizons
function grade(result, framesUsed) {
  const out = [];
  for (const c of result.candidates) {
    const memberErr = c.points.map((p) => { const tr = toPlane(loaded[p.frame].p.bodyRa, loaded[p.frame].p.bodyDec); return Math.hypot(p.x - tr.x, p.y - tr.y); });
    const onBody = memberErr.filter((e) => e <= 4).length;
    out.push({ c, onBody, members: c.points.length, isBody: onBody === c.points.length });
  }
  return out;
}
for (const v of skipReal ? [] : variants) {
  const t0 = performance.now();
  const result = findDistantMovers(frames, plane, OPTIONS[v]);
  const seconds = ((performance.now() - t0) / 1000).toFixed(1);
  const graded = grade(result, frames);
  console.log(`\n## Variant ${v}${v === "A" ? " (the app's default options)" : v === "B" ? " (default options, 250 seed dots per image)" : " (loosened, as in real_parallax.mjs)"}: ${result.reason ?? `${result.candidates.length} candidate(s)`}, ${seconds} s`);
  console.log(`- Dots per image ${result.stats.dotsPerFrame.join(", ")}; dots that are not still stars ${result.stats.movingDots}; seeds ${result.stats.seeds}; triples ${result.stats.triples}${result.stats.truncated ? " (TRUNCATED: the triple limit was reached)" : ""}`);
  graded.forEach(({ c, onBody, members, isBody }) => {
    const d = describeDistant(c, plane);
    console.log(`  - ${c.distanceAU.toFixed(1)} AU (${c.distanceRangeAU.map((x) => x.toFixed(1)).join("-")}), dots in ${c.nDet} of ${c.nFrames} images, rms ${c.rms.toFixed(2)} px, ${c.parallaxSigma.toFixed(0)} sigma better than a straight line, own speed ${d.ownVelocityKms.toFixed(1)} km/s (escape ${d.escapeKms.toFixed(1)}): ${onBody} of ${members} dots on the Horizons position -> ${isBody ? "**THE BODY**" : onBody >= 2 ? "partly the body" : "chance combination"}`);
  });
  console.log(`  => ${graded.filter((g) => g.isBody).length} of ${graded.length} candidates are the body (all their dots on its Horizons position); the true distance is ${truth.images.reduce((s, p) => s + p.deltaAu, 0) / truth.images.length | 0}-${Math.ceil(Math.max(...truth.images.map((p) => p.deltaAu)))} AU (Horizons, geocentric)`);
}

// ---- 4) control: scrambled images, no body
if (nulls > 0) {
  const rng = mulberry32(controlSeed);
  const counts = Object.fromEntries(variants.map((v) => [v, 0]));
  const t0 = performance.now();
  for (let r = 0; r < nulls; r++) {
    const arrays = [], masks = [];
    loaded.forEach((l) => {
      const d = Math.floor(rng() * 8), sx = Math.floor(rng() * l.n), sy = Math.floor(rng() * l.n);
      const a = wrapShift(dihedral(l.img.length === l.n * l.n ? l.img : l.img, l.n, d), l.n, sx, sy);
      arrays.push(a); masks.push(l.mask ? wrapShift(dihedral(l.mask, l.n, d), l.n, sx, sy) : null);
    });
    const scrambled = detectAll(arrays, masks);
    for (const v of variants) {
      const cands = findDistantMovers(scrambled, plane, OPTIONS[v]).candidates;
      if (cands.length) counts[v]++;
      console.log(`  control copy ${r + 1} (seed ${controlSeed}), variant ${v}: ${cands.length} candidate(s), most dots in one candidate: ${cands.length ? Math.max(...cands.map((c) => c.nDet)) : 0} of ${scrambled.length}, rms of those with the most dots: ${cands.length ? cands.filter((c) => c.nDet === Math.max(...cands.map((x) => x.nDet))).map((c) => c.rms.toFixed(2)).join("/") : "-"}`);
    }
  }
  console.log(`\n## Control: ${nulls} scrambled copies of the same ${loaded.length} images (no body; ${((performance.now() - t0) / 1000).toFixed(0)} s)`);
  console.log(`Share of copies that give at least one candidate: ${variants.map((v) => `variant ${v}: ${counts[v]} of ${nulls}`).join("; ")}.`);
}
void passes;
