// Blind validation of "Find movers" on REAL SPHEREx data served by our backend.
//
//   node scratch/validate_real.mjs --api http://localhost:8002 --ra 269.4462 --dec 4.769 --fov 5 --det D2
//
// The detector is NOT told what to look for. It works on the real (float) pixels of every image of
// one detector. Afterwards the result is compared with SIMBAD: which catalogued objects that should
// move across this field did it recover, how well does the measured motion match the catalogue
// (RA*cos(dec) and Dec, arcsec/yr), and which candidates are not in the catalogue?
// Prints a Markdown report (paste it into docs/VALIDATION.md).

import { detectSources, findMovers, describeMover, matchKnownObject, passIndices } from "../frontend/js/features/movers.js";
import { fetchCatalogue, catalogueTracks, totalMotion } from "../frontend/js/features/catalogue.js";

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
const api = args.api ?? "http://localhost:8001";
const ra = Number(args.ra), dec = Number(args.dec), fov = Number(args.fov ?? 5), det = args.det ?? "D2";
if (!Number.isFinite(ra) || !Number.isFinite(dec)) { console.error("usage: node scratch/validate_real.mjs --api URL --ra DEG --dec DEG [--fov ARCMIN] [--det D2]"); process.exit(2); }

const get = async (url, kind) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
  return kind === "json" ? r.json() : r.arrayBuffer();
};

const { frames } = await get(`${api}/api/cutouts?ra=${ra}&dec=${dec}&fov=${fov}&det=${det}`, "json");
if (!frames.length) { console.log("No frames here."); process.exit(0); }
frames.sort((a, b) => a.mjd - b.mjd);
const arrays = await Promise.all(frames.map(async (f) => new Float32Array(await get(f.dataUrl, "bin"))));
const n = Math.round(Math.sqrt(arrays[0].length));
const scale = frames[0].pixelScaleArcsec;
const geo = { ra, dec, n, scaleArcsec: scale };
const passes = passIndices(frames.map((f) => f.mjd)).at(-1) + 1;

// ---- 1) blind detection + linking
const t0 = performance.now();
const detected = frames.map((f, k) => ({ mjd: f.mjd, sources: detectSources(arrays[k], n, { sigmaFloor: 1e-9 }) }));
const { candidates, stats, reason } = findMovers(detected);
const seconds = ((performance.now() - t0) / 1000).toFixed(1);

// ---- 2) what the catalogue says should be moving here
let objects = [], simbadNote = "";
try { objects = await fetchCatalogue(ra, dec, fov); } catch (e) { simbadNote = e.message; }
const tracks = catalogueTracks(objects, frames, geo);
const expected = objects.filter((o) => totalMotion(o) >= 1 && tracks.some((t) => t.label === o.label));

const years = (frames.at(-1).mjd - frames[0].mjd) / 365.25;
const described = candidates.map((c) => ({ c, d: describeMover(c, geo) }));

console.log(`# Blind test of Find movers on real SPHEREx data\n`);
console.log(`- Field: RA ${ra}, Dec ${dec}, ${fov}' square, detector ${det}; backend ${api}`);
console.log(`- Images: ${frames.length} (${passes} survey passes), ${frames[0].dateISO.slice(0, 10)} to ${frames.at(-1).dateISO.slice(0, 10)} (${years.toFixed(2)} yr); pixel ${scale}" ; ${n} x ${n} px`);
console.log(`- Pixels: real float values served by the backend (not the 8-bit pictures)`);
console.log(`- Dots per image: ${stats.dotsPerFrame.join(", ")}; still stars linked: ${stats.stillDots}; search time ${seconds} s`);
if (reason) console.log(`- Search did not run: ${reason}`);
console.log(`- SIMBAD: ${objects.length} objects around the field${simbadNote ? ` (${simbadNote})` : ""}; ${expected.length} of them move more than 1"/yr across it\n`);

console.log(`## Candidates found (blind): ${described.length}\n`);
console.log(`| # | speed "/yr | toward | RA*cos(dec) "/yr | Dec "/yr | images | significance | catalogue match |`);
console.log(`|---|---|---|---|---|---|---|---|`);
described.forEach(({ c, d }, k) => {
  const hit = matchKnownObject(c, geo, objects, { maxDistPx: 3 });
  console.log(`| ${k + 1} | ${d.speedArcsecPerYear.toFixed(2)} | ${d.compass} | ${d.pmEastArcsecPerYear.toFixed(2)} | ${d.pmNorthArcsecPerYear.toFixed(2)} | ${c.nDet} of ${c.nFrames} | ${c.significance.toFixed(0)} sigma | ${hit ? hit.target.label : "none within 18\""} |`);
});

console.log(`\n## Catalogued movers in the field (SIMBAD, > 1"/yr): ${expected.length}\n`);
console.log(`| object | catalogue "/yr (RA*cos dec, Dec) | recovered? | measured "/yr (RA*cos dec, Dec) | difference "/yr |`);
console.log(`|---|---|---|---|---|`);
let recovered = 0;
for (const o of expected) {
  const found = described.find(({ c }) => matchKnownObject(c, geo, [o], { maxDistPx: 3 }));
  const cat = [(o.pmra ?? 0) / 1000, (o.pmdec ?? 0) / 1000];
  if (found) {
    recovered++;
    const m = [found.d.pmEastArcsecPerYear, found.d.pmNorthArcsecPerYear];
    console.log(`| ${o.label} | ${cat[0].toFixed(2)}, ${cat[1].toFixed(2)} | yes | ${m[0].toFixed(2)}, ${m[1].toFixed(2)} | ${Math.hypot(m[0] - cat[0], m[1] - cat[1]).toFixed(2)} |`);
  } else console.log(`| ${o.label} | ${cat[0].toFixed(2)}, ${cat[1].toFixed(2)} | **no** | | |`);
}
const unmatched = described.filter(({ c }) => !matchKnownObject(c, geo, objects, { maxDistPx: 3 })).length;
console.log(`\n**Recovered ${recovered} of ${expected.length} catalogued movers; ${unmatched} candidate(s) without a SIMBAD match.**`);
