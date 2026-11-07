// Tests for frontend/js/features/skyGeo.js (which country is a sky point straight above?).  Run: node scratch/test_skygeo.mjs
// The world map here is a tiny invented one (four "countries" made of squares), so nothing is downloaded. The real
// world-atlas file is checked in the browser (docs/VALIDATION.md section 9).
import { julianDate, gmstDeg, normLon, precessToDate, overheadPoint, decodeCountries, locate, describeLocation, overheadAt, distToSegment, countryName } from "../frontend/js/features/skyGeo.js";

let failed = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  – " + detail : ""}`);
  if (!ok) failed++;
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const D2R = Math.PI / 180;

// ---- time
check("Julian date of J2000.0 (2000-01-01 12:00 UTC)", julianDate(new Date("2000-01-01T12:00:00Z")) === 2451545.0);
check("GMST at J2000.0 is 18h41m50.55s = 280.4606 degrees", near(gmstDeg(new Date("2000-01-01T12:00:00Z")), 280.4606, 0.0005), String(gmstDeg(new Date("2000-01-01T12:00:00Z"))));
check("GMST at 0h UT on 2000-01-01 is 6h39m52.27s = 99.9678 degrees", near(gmstDeg(new Date("2000-01-01T00:00:00Z")), 99.9678, 0.0005), String(gmstDeg(new Date("2000-01-01T00:00:00Z"))));
check("GMST of Meeus' example 12.a (1987-04-10 0h UT) is 13h10m46.3668s = 197.693195 degrees", near(gmstDeg(new Date("1987-04-10T00:00:00Z")), 197.693195, 0.0005), String(gmstDeg(new Date("1987-04-10T00:00:00Z"))));
{
  const t0 = new Date("2026-11-07T00:00:00Z"), t1 = new Date("2026-11-07T01:00:00Z");
  const rate = ((gmstDeg(t1) - gmstDeg(t0) + 360) % 360);
  check("the sky turns 15.04 degrees an hour (one sidereal hour)", near(rate, 15.0411, 0.001), rate.toFixed(4));
}
check("longitudes wrap into -180..180", normLon(190) === -170 && normLon(-190) === 170 && normLon(0) === 0 && normLon(540) === -180 && normLon(359) === -1);

// ---- precession and the overhead point
{
  const j2000 = new Date("2000-01-01T12:00:00Z");
  const same = precessToDate(123.4, -5.6, j2000);
  check("no precession at J2000.0 itself", near(same.ra, 123.4, 1e-9) && near(same.dec, -5.6, 1e-9));
  const p = precessToDate(0, 0, new Date("2026-11-07T00:00:00Z"));
  check("precession since J2000 at (0, 0): about 0.34 degrees in RA and 0.15 in Dec (46.1 and 20.0 arcsec a year, 26.85 years)", near(p.ra, 0.344, 0.01) && near(p.dec, 0.1495, 0.01), `${p.ra.toFixed(4)}, ${p.dec.toFixed(4)}`);
  const o = overheadPoint(gmstDeg(j2000), 33.3, j2000);
  check("a sky point whose RA equals the sidereal time is on the Greenwich meridian, at latitude = Dec", near(o.lon, 0, 1e-6) && near(o.lat, 33.3, 1e-9), JSON.stringify(o));
  const a = overheadPoint(100, 20, new Date("2026-11-07T00:00:00Z")), b = overheadPoint(100, 20, new Date("2026-11-07T06:00:00Z"));
  const moved = normLon(b.lon - a.lon);
  check("six hours later the same sky point is 90.2 degrees further west (15.04 degrees an hour)", near(moved, -90.25, 0.05) && near(a.lat, b.lat, 1e-5), moved.toFixed(3));
  check("the place is always inside -180..180 / -90..90", [0, 90, 180, 270, 359.9].every((ra) => { const q = overheadPoint(ra, -89.9, new Date("2026-06-01T03:00:00Z")); return q.lon >= -180 && q.lon < 180 && q.lat >= -90 && q.lat <= 90; }));
}

// ---- a tiny invented world (TopoJSON, quantised: delta-encoded arcs, scale 1, translate 0)
const topo = {
  type: "Topology",
  transform: { scale: [1, 1], translate: [0, 0] },
  arcs: [
    [[0, 0], [10, 0], [0, 10], [-10, 0], [0, -10]],            // 0 Alpha: lon 0..10, lat 0..10
    [[20, 0], [10, 0], [0, 10], [-10, 0], [0, -10]],           // 1 Beta outer: lon 20..30, lat 0..10
    [[24, 4], [0, 2], [2, 0], [0, -2], [-2, 0]],               // 2 Beta's hole (and Gamma, reversed): lon 24..26, lat 4..6
    [[-10, -5], [5, 0], [0, 5], [-5, 0], [0, -5]],             // 3 an island of Beta: lon -10..-5, lat -5..0
    [[40, 0], [10, 0], [0, 10]],                               // 4 Delta, first half
    [[50, 10], [-10, 0], [0, -10]],                            // 5 Delta, second half: lon 40..50, lat 0..10
  ],
  objects: { countries: { type: "GeometryCollection", geometries: [
    { type: "Polygon", arcs: [[0]], id: "1", properties: { name: "Alpha" } },
    { type: "MultiPolygon", arcs: [[[1], [2]], [[3]]], id: "2", properties: { name: "Beta" } },
    { type: "Polygon", arcs: [[-3]], id: "3", properties: { name: "Dem. Rep. Congo" } },
    { type: "Polygon", arcs: [[4, 5]], id: "4", properties: { name: "Delta" } },
  ] } },
};
const world = decodeCountries(topo);
const at = (lat, lon) => locate(world, lat, lon);

check("four countries decoded, an abbreviated name is spelled out", world.length === 4 && world[2].name === "Democratic Republic of the Congo" && countryName("Czechia") === "Czechia" && countryName("Dominican Rep.") === "Dominican Republic");
check("a ring of two arcs is joined without repeating the shared point", world[3].polygons[0].outer.length === 5, String(world[3].polygons[0].outer.length));
check("a reversed arc (negative index) gives the other winding", JSON.stringify(world[2].polygons[0].outer[1]) === JSON.stringify([26, 4]));
check("a point inside a country gets its name", at(5, 5).name === "Alpha" && at(2, 22).name === "Beta" && at(5, 45).name === "Delta");
check("a second polygon of a multi-polygon country (an island) counts", at(-2, -7).name === "Beta");
check("a hole in one country belongs to the country that fills it", at(5, 25).name === "Democratic Republic of the Congo" && at(5.9, 24.1).name === "Democratic Republic of the Congo");
check("just outside the edges is water", at(5, 10.5).kind === "water" && at(-0.5, 5).kind === "water" && at(5, -1).kind === "water");
{
  const w = at(5, 12.5);
  const expected = Math.asin(Math.cos(5 * D2R) * Math.sin(2.5 * D2R)) * 6371;     // distance of the point to the great circle of the meridian lon = 10
  check("water: nearest country and its distance to a straight (meridian) coast", w.kind === "water" && w.nearest === "Alpha" && near(w.km, expected, 1), `${w.nearest} ${w.km?.toFixed(1)} km, expected ${expected.toFixed(1)}`);
  const corner = at(15, 55);
  const hav = (la1, lo1, la2, lo2) => { const dla = (la2 - la1) * D2R, dlo = (lo2 - lo1) * D2R; return 2 * Math.asin(Math.sqrt(Math.sin(dla / 2) ** 2 + Math.cos(la1 * D2R) * Math.cos(la2 * D2R) * Math.sin(dlo / 2) ** 2)); };
  check("water beyond a corner: the distance is to the corner", corner.nearest === "Delta" && near(corner.km, hav(15, 55, 10, 50) * 6371, 1), `${corner.nearest} ${corner.km?.toFixed(1)} km`);
  const p = (lon, lat) => [Math.cos(lat * D2R) * Math.cos(lon * D2R), Math.cos(lat * D2R) * Math.sin(lon * D2R), Math.sin(lat * D2R)];
  check("distance to a segment: a point on it is 0, a degenerate segment is a point", near(distToSegment(p(5, 0), p(0, 0), p(10, 0)), 0, 1e-9) && near(distToSegment(p(3, 4), p(0, 0), p(0, 0)), Math.acos(Math.cos(4 * D2R) * Math.cos(3 * D2R)), 1e-9));
}
check("an empty map gives water with no nearest country", (() => { const l = locate([], 0, 0); return l.kind === "water" && l.nearest === null && describeLocation(l) === "water"; })());

// ---- the text
check("a country is just its name", describeLocation({ kind: "country", name: "Romania" }) === "Romania");
check("water: distance rounded (10 km under 100, 50 km under 1000, 100 km above) with a thousands separator",
  describeLocation({ kind: "water", nearest: "Chile", km: 8 }) === "water, about 10 km from Chile" && describeLocation({ kind: "water", nearest: "Chile", km: 47 }) === "water, about 50 km from Chile"
  && describeLocation({ kind: "water", nearest: "Chile", km: 349 }) === "water, about 350 km from Chile" && describeLocation({ kind: "water", nearest: "Chile", km: 1234 }) === "water, about 1,200 km from Chile");

// ---- all together: a sky point whose overhead place is inside Alpha
{
  const when = new Date("2026-11-07T12:00:00Z");
  // choose the sky point that is overhead at lat 5, lon 5 at this moment: RA of date = GMST + lon; go back to J2000 by trial (precession is a small shift)
  let ra = gmstDeg(when) + 5, dec = 5;
  for (let i = 0; i < 5; i++) { const q = precessToDate(ra, dec, when); ra += (gmstDeg(when) + 5) - q.ra; dec += 5 - q.dec; }
  const r = overheadAt(world, ra, dec, when);
  check("overheadAt: the sky point chosen to be above (lat 5, lon 5) is reported over Alpha", near(r.lat, 5, 1e-3) && near(r.lon, 5, 1e-3) && r.text === "Alpha", JSON.stringify(r));
}

console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
