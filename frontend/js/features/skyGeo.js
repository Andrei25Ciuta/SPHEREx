// skyGeo.js – which country is a point of the sky straight above, right now?
//
// Every point of the sky (RA, Dec) is exactly overhead (at the zenith) at one place on Earth at any moment:
//     latitude  = declination
//     longitude = right ascension - Greenwich sidereal time        (east positive)
// The Earth turns 15 degrees an hour, so that place moves west and the country changes during the day.
//
// This is not where SPHEREx or the telescope is, and not where the object "belongs": it is only a way to put a country
// next to a sky coordinate. Country borders come from Natural Earth through the `world-atlas` package (TopoJSON, 110 m
// scale = about 1:110 million), loaded by skyContext.js when the map opens. At that scale borders are only good to tens
// of kilometres, and small countries are missing, so a point near a coast or border may get a neighbour.
//
// Everything here is a pure function of its arguments (no DOM, no network), so scratch/test_skygeo.mjs tests it in Node.

export const WORLD_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json";

const D2R = Math.PI / 180;
const EARTH_KM = 6371;

// ---------- time and coordinates ----------

export const julianDate = (date) => date.getTime() / 86400000 + 2440587.5;
export const normLon = (lon) => (((lon + 180) % 360) + 360) % 360 - 180;

/** Greenwich mean sidereal time in degrees (Meeus, Astronomical Algorithms, eq. 12.4; UTC stands in for UT1: < 1 s). */
export function gmstDeg(date) {
  const d = julianDate(date) - 2451545.0, T = d / 36525;
  const g = 280.46061837 + 360.98564736629 * d + 0.000387933 * T * T - T ** 3 / 38710000;
  return ((g % 360) + 360) % 360;
}

/**
 * Coordinates of J2000 (ICRS) moved to the equinox of the date, by the first-order precession of Meeus (21.1):
 * sidereal time is measured against the equinox of the date, so the right ascension must be too. About 0.34 degrees
 * in 2026 (40 km on the ground). Nutation (17 arcsec) and aberration are ignored. Not meant for the poles.
 */
export function precessToDate(raDeg, decDeg, date) {
  const t = (julianDate(date) - 2451545.0) / 365.25;                          // Julian years since J2000
  const m = 46.124 / 3600, n = 20.043 / 3600;                                   // degrees per year
  const a = raDeg * D2R, d = decDeg * D2R;
  const ra = raDeg + (m + n * Math.sin(a) * Math.tan(d)) * t;
  const dec = decDeg + n * Math.cos(a) * t;
  return { ra: ((ra % 360) + 360) % 360, dec: Math.max(-90, Math.min(90, dec)) };
}

/** The place on Earth that has the sky point (RA, Dec in ICRS, degrees) straight overhead at `date`. */
export function overheadPoint(raDeg, decDeg, date = new Date()) {
  const p = precessToDate(raDeg, decDeg, date);
  return { lat: p.dec, lon: normLon(p.ra - gmstDeg(date)) };
}

// ---------- the world map (TopoJSON -> countries) ----------

const NAMES = {
  "Dem. Rep. Congo": "Democratic Republic of the Congo", "Dominican Rep.": "Dominican Republic", "Central African Rep.": "Central African Republic",
  "Eq. Guinea": "Equatorial Guinea", "S. Sudan": "South Sudan", "Bosnia and Herz.": "Bosnia and Herzegovina", "Solomon Is.": "Solomon Islands",
  "Falkland Is.": "Falkland Islands", "Fr. S. Antarctic Lands": "French Southern and Antarctic Lands", "W. Sahara": "Western Sahara",
  "N. Cyprus": "Northern Cyprus", "United States of America": "United States", "eSwatini": "Eswatini",
};
export const countryName = (raw) => NAMES[raw] ?? raw;

/** Decode the arcs of a TopoJSON topology (delta-encoded and scaled only when it has a `transform`). */
function decodeArcs(topo) {
  const tf = topo.transform;
  return topo.arcs.map((arc) => {
    if (!tf) return arc.map((p) => [p[0], p[1]]);
    let x = 0, y = 0;
    return arc.map(([dx, dy]) => { x += dx; y += dy; return [x * tf.scale[0] + tf.translate[0], y * tf.scale[1] + tf.translate[1]]; });
  });
}
/** Join the arcs of one ring (a negative index ~i means arc i reversed). */
function joinRing(indexes, arcs) {
  const pts = [];
  for (const i of indexes) {
    const a = i >= 0 ? arcs[i] : arcs[~i].slice().reverse();
    for (let k = pts.length ? 1 : 0; k < a.length; k++) pts.push(a[k]);          // the first point of each arc repeats the last of the one before
  }
  return pts;
}
const ringBox = (ring) => { let w = 180, e = -180, s = 90, n = -90; for (const [x, y] of ring) { if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y; } return [w, s, e, n]; };

/** Countries of a world-atlas topology: [{ name, polygons: [{ outer, holes, box, vecs }] }]. */
export function decodeCountries(topo) {
  const arcs = decodeArcs(topo);
  const out = [];
  for (const g of topo.objects.countries.geometries) {
    const polys = g.type === "Polygon" ? [g.arcs] : g.type === "MultiPolygon" ? g.arcs : [];
    const polygons = polys.map((rings) => {
      const outer = joinRing(rings[0], arcs);
      return { outer, holes: rings.slice(1).map((r) => joinRing(r, arcs)), box: ringBox(outer), vecs: outer.map(([lon, lat]) => toVec(lon, lat)) };
    });
    if (polygons.length) out.push({ name: countryName(g.properties?.name ?? `#${g.id}`), polygons });
  }
  return out;
}

// ---------- point in polygon, and the nearest country for a point on the water ----------

function inRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function toVec(lon, lat) {
  const c = Math.cos(lat * D2R);
  return [c * Math.cos(lon * D2R), c * Math.sin(lon * D2R), Math.sin(lat * D2R)];
}
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const angle = (a, b) => Math.acos(Math.max(-1, Math.min(1, dot(a, b))));

/** Great-circle distance (radians) from the unit vector p to the segment a-b. */
export function distToSegment(p, a, b) {
  const nRaw = cross(a, b), len = Math.hypot(...nRaw);
  if (len < 1e-12) return angle(p, a);
  const n = nRaw.map((v) => v / len);
  const q = [p[0] - dot(p, n) * n[0], p[1] - dot(p, n) * n[1], p[2] - dot(p, n) * n[2]];     // p projected on the plane of the great circle
  if (dot(cross(a, q), n) >= 0 && dot(cross(q, b), n) >= 0) return Math.asin(Math.min(1, Math.abs(dot(p, n))));
  return Math.min(angle(p, a), angle(p, b));
}

/**
 * What is at (lat, lon)?  { kind: "country", name }  or  { kind: "water", nearest, km } (km to the nearest coast of `nearest`).
 * Land inside a polygon but inside one of its holes (a lake, or a country inside another) is left to the other polygon.
 */
export function locate(countries, lat, lon) {
  for (const c of countries) {
    for (const poly of c.polygons) {
      const [w, s, e, n] = poly.box;
      if (lon < w || lon > e || lat < s || lat > n) continue;
      if (inRing(lon, lat, poly.outer) && !poly.holes.some((h) => inRing(lon, lat, h))) return { kind: "country", name: c.name };
    }
  }
  const p = toVec(lon, lat);
  let best = Infinity, nearest = null;
  for (const c of countries) {
    for (const poly of c.polygons) {
      const v = poly.vecs;
      for (let i = 1; i < v.length; i++) {
        const d = distToSegment(p, v[i - 1], v[i]);
        if (d < best) { best = d; nearest = c.name; }
      }
    }
  }
  return nearest === null ? { kind: "water", nearest: null, km: null } : { kind: "water", nearest, km: best * EARTH_KM };
}

const roundKm = (km) => (km < 100 ? Math.max(10, Math.round(km / 10) * 10) : km < 1000 ? Math.round(km / 50) * 50 : Math.round(km / 100) * 100);
/** "Romania", or "water, about 350 km from Chile". */
export function describeLocation(loc) {
  if (loc.kind === "country") return loc.name;
  if (loc.nearest === null) return "water";
  return `water, about ${roundKm(loc.km).toLocaleString("en-US")} km from ${loc.nearest}`;
}

/** Everything the sky map shows next to a coordinate: where on Earth it is overhead, and a short text for it. */
export function overheadAt(countries, raDeg, decDeg, date = new Date()) {
  const { lat, lon } = overheadPoint(raDeg, decDeg, date);
  const loc = locate(countries, lat, lon);
  return { lat, lon, loc, text: describeLocation(loc) };
}
