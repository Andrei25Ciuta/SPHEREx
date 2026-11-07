// What are the dots the detector finds in ONE real image? A first look at "see any object", without any new download.
//
//   node scratch/sources_vs_catalogues.mjs --api http://localhost:8003
//
// For one image of each real field and detector (the one with the most dots) the app's own detectSources finds the dots; each is
// converted to the sky and looked up in 2MASS (fp_psc) and AllWISE (allwise_p3as_psd) through IRSA's TAP service (epochs 1997-2001
// and 2010; the same tables as scratch/validate_photometry.py). A dot with a catalogue source within 8 arcsec (1.3 pixel) is
// "matched". What is left over is what the catalogues do not explain: a star that has moved since (Barnard's Star moved 270" since
// 2000), a very red or very faint object, a blend, an artefact, or something new. Every unmatched dot is listed with its flux.
// The catalogues are queried one at a time (IRSA drops parallel connections).

import { detectSources, apertureSnr } from "../frontend/js/features/movers.js";
import { canvasToSky } from "../frontend/js/geometry.js";
import { loadField, parseArgs } from "./lib_real.mjs";

const args = parseArgs();
const api = args.api ?? "http://localhost:8003";
const RADIUS_ARCSEC = Number(args.radius ?? 8);
const FIELDS = [
  ["Barnard's Star D2", 269.4462, 4.769, "D2"], ["Barnard's Star D6", 269.4462, 4.769, "D6"],
  ["Epsilon Indi B D2", 331.0965, -56.8006, "D2"], ["Epsilon Indi B D6", 331.0965, -56.8006, "D6"],
  ["WISE 0855 D2", 133.7598, -7.2422, "D2"], ["WISE 0855 D6", 133.7598, -7.2422, "D6"],
];

async function tap(query) {
  const r = await fetch(`https://irsa.ipac.caltech.edu/TAP/sync?${new URLSearchParams({ QUERY: query, LANG: "ADQL", FORMAT: "csv" })}`, { signal: AbortSignal.timeout(120000) });
  if (!r.ok) throw new Error(`TAP HTTP ${r.status}`);
  const [head, ...lines] = (await r.text()).trim().split("\n");
  const cols = head.split(",");
  return lines.filter(Boolean).map((l) => Object.fromEntries(l.split(",").map((v, i) => [cols[i], v === "" ? null : Number.isNaN(Number(v)) ? v : Number(v)])));
}
const sep = (ra1, dec1, ra2, dec2) => Math.hypot((ra1 - ra2) * Math.cos(dec1 * Math.PI / 180), dec1 - dec2) * 3600;

console.log(`# What the detector's dots are, in one real image of each field (matched within ${RADIUS_ARCSEC}" to 2MASS or AllWISE)\n`);
console.log(`| field | image date | dots | in 2MASS | in AllWISE | in either | **in neither** |`);
console.log(`|---|---|---|---|---|---|---|`);
const details = [];
const cache = new Map();                                                    // the two fields with two detectors share their catalogue query
for (const [name, ra, dec, det] of FIELDS) {
  const f = await loadField(api, ra, dec, 5, det);
  const counts = f.arrays.map((a, k) => detectSources(a, f.n, { sigmaFloor: 1e-9, mask: f.masks[k] }).length);
  const k = counts.indexOf(Math.max(...counts));
  const dots = detectSources(f.arrays[k], f.n, { sigmaFloor: 1e-9, mask: f.masks[k] });
  const key = `${ra},${dec}`;
  if (!cache.has(key)) {
    const circle = `CIRCLE('ICRS', ${ra}, ${dec}, 0.08)`;
    const two = await tap(`SELECT ra, dec, j_m, k_m FROM fp_psc WHERE 1=CONTAINS(POINT('ICRS', ra, dec), ${circle})`);
    const wise = await tap(`SELECT ra, dec, w1mpro, w2mpro FROM allwise_p3as_psd WHERE 1=CONTAINS(POINT('ICRS', ra, dec), ${circle})`);
    cache.set(key, { two, wise });
  }
  const { two, wise } = cache.get(key);
  let nTwo = 0, nWise = 0, nEither = 0;
  const omega = (f.scale / 206264.806) ** 2;
  for (const d of dots) {
    const sky = canvasToSky(d.x / f.n, d.y / f.n, f.geo);
    const mTwo = two.some((s) => sep(sky.ra, sky.dec, s.ra, s.dec) <= RADIUS_ARCSEC), mWise = wise.some((s) => sep(sky.ra, sky.dec, s.ra, s.dec) <= RADIUS_ARCSEC);
    nTwo += mTwo; nWise += mWise; nEither += mTwo || mWise;
    if (!mTwo && !mWise) {
      const ap = apertureSnr(f.arrays[k], f.n, d.x, d.y, 2);
      const near = (cat) => cat.reduce((m, c) => Math.min(m, sep(sky.ra, sky.dec, c.ra, c.dec)), Infinity);
      details.push({ name, date: f.frames[k].dateISO.slice(0, 10), ra: sky.ra, dec: sky.dec, snr: d.snr, nearTwo: near(two), nearWise: near(wise), mjy: ap ? ap.flux * omega * 1e9 : null, edge: Math.min(d.x, d.y, f.n - d.x, f.n - d.y) });
    }
  }
  console.log(`| ${name} | ${f.frames[k].dateISO.slice(0, 10)} | ${dots.length} | ${nTwo} | ${nWise} | ${nEither} | **${dots.length - nEither}** |`);
}
console.log(`\nDots in neither catalogue:\n`);
console.log(`| field | image | RA, Dec | detector S/N | aperture flux (mJy) | distance to the image edge (px) | nearest 2MASS / AllWISE source (arcsec) |`);
console.log(`|---|---|---|---|---|---|---|`);
for (const d of details) console.log(`| ${d.name} | ${d.date} | ${d.ra.toFixed(5)}, ${d.dec.toFixed(5)} | ${d.snr.toFixed(1)} | ${d.mjy === null ? "-" : d.mjy.toFixed(2)} | ${d.edge.toFixed(0)} | ${d.nearTwo.toFixed(0)} / ${d.nearWise.toFixed(0)} |`);
if (!details.length) console.log("| (none) | | | | | |");
