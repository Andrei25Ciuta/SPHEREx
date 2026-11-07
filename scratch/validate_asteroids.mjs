// Do the known asteroids SkyBoT lists in our REAL SPHEREx cutouts show up in the images, where and when predicted?
//
//   node scratch/validate_asteroids.mjs --api http://localhost:8002 --ra 269.4462 --dec 4.769 --fov 5 --det D2
//
// For every image date: SkyBoT lists the bodies inside the field. For each body, the backend measures the flux at
// its PREDICTED position on every image that covers that spot; a real detection shows as flux on the image of its
// own date and none on the others (the asteroid is somewhere else then). Prints a Markdown table.

import { fetchSkybotForFrames, asteroidPoints } from "../frontend/js/features/skybot.js";

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
const api = args.api ?? "http://localhost:8001";
const ra = Number(args.ra), dec = Number(args.dec), fov = Number(args.fov ?? 5), det = args.det ?? "D2";
if (!Number.isFinite(ra) || !Number.isFinite(dec)) { console.error("usage: node scratch/validate_asteroids.mjs --api URL --ra DEG --dec DEG [--fov ARCMIN] [--det D2]"); process.exit(2); }

const getJson = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`); return r.json(); };
const { frames } = await getJson(`${api}/api/cutouts?ra=${ra}&dec=${dec}&fov=${fov}&det=${det}`);
frames.sort((a, b) => a.mjd - b.mjd);
const bytes = (await (await fetch(frames[0].dataUrl)).arrayBuffer()).byteLength;
const n = Math.round(Math.sqrt(bytes / 4)), scale = frames[0].pixelScaleArcsec;
const geo = { ra, dec, n, scaleArcsec: scale };

console.log(`# Known asteroids (SkyBoT) in real SPHEREx cutouts\n`);
console.log(`- Field: RA ${ra}, Dec ${dec}, ${fov}' square (${n} x ${n} px of ${scale}"), detector ${det}, ${frames.length} images, ${frames[0].dateISO.slice(0, 10)} to ${frames.at(-1).dateISO.slice(0, 10)}`);

const t0 = performance.now();
const { perFrame, failures, firstError } = await fetchSkybotForFrames(frames, { ra, dec, fovArcmin: fov });
const pts = asteroidPoints(perFrame, geo, 0);
const total = pts.reduce((s, l) => s + (l?.length ?? 0), 0);
console.log(`- SkyBoT answered ${frames.length - failures} of ${frames.length} dates in ${((performance.now() - t0) / 1000).toFixed(1)} s${failures ? ` (${failures} failed: ${firstError})` : ""}; ${total} body-dates inside the image\n`);

const rows = [];
for (let k = 0; k < frames.length; k++) {
  for (const a of pts[k] ?? []) {
    // sky position of the body on this date
    const o = perFrame[k].find((x) => x.name === a.name);
    const photo = await getJson(`${api}/api/photometry?ra=${o.ra}&dec=${o.dec}&det=${det}&radius=2`);
    const own = photo.points.find((p) => Math.abs(p.mjd - frames[k].mjd) < 2e-4);
    const others = photo.points.filter((p) => Math.abs(p.mjd - frames[k].mjd) >= 2e-4 && p.flux !== null && p.fluxErr > 0);
    const snrOthers = others.map((p) => p.flux / p.fluxErr).sort((x, y) => x - y);
    rows.push({ date: frames[k].dateISO.slice(0, 10), name: a.name, v: a.vmag, cls: a.cls, rate: a.rateArcsecPerDay,
      snrOwn: own && own.fluxErr > 0 ? own.flux / own.fluxErr : null, snrOthersMedian: snrOthers.length ? snrOthers[Math.floor(snrOthers.length / 2)] : null, nOthers: others.length, flagged: own?.flagged });
  }
}
console.log(`| date | body | class | V mag | motion "/day | S/N on its own date | median S/N on the other ${"dates"} |`);
console.log(`|---|---|---|---|---|---|---|`);
for (const r of rows) console.log(`| ${r.date} | ${r.name} | ${r.cls} | ${r.v ?? "?"} | ${r.rate?.toFixed(0) ?? "?"} | ${r.snrOwn === null ? "-" : r.snrOwn.toFixed(1)}${r.flagged ? " (flagged)" : ""} | ${r.snrOthersMedian === null ? "-" : r.snrOthersMedian.toFixed(1)} (${r.nOthers}) |`);
if (!rows.length) console.log("| (none) | | | | | | |");
const bright = rows.filter((r) => r.v !== null && r.v < 20);
console.log(`\n**${rows.length} body-date(s) inside the image; ${bright.length} brighter than V = 20.**`);
