// targets.js – the 5 official test objects of the challenge.
//
// SOURCE: SIMBAD (CDS), queried 2026-11-05 via TAP on the Harvard mirror
//   https://simbad.harvard.edu/simbad/sim-tap/sync   (simbad.cds.unistra.fr timed out)
// ADQL:
//   SELECT i.id, b.main_id, b.ra, b.dec, b.pmra, b.pmdec, b.coo_bibcode
//   FROM basic AS b JOIN ident AS i ON i.oidref = b.oid
//   WHERE i.id IN ('NAME Barnard''s star','eps Ind B',
//                  'WISE J085510.83-071442.5','RW Aur','R Dra')
//
// Units (SIMBAD "basic" table):
//   ra, dec  -> degrees, ICRS, epoch J2000.0
//   pmra     -> mas/yr, ALREADY multiplied by cos(dec)  (i.e. mu_alpha*)
//   pmdec    -> mas/yr
//
// WHY PROPER MOTION MATTERS: SIMBAD positions are for the year 2000.
// SPHEREx observes in 2025+, so fast movers are far from their J2000 spot:
//   Barnard's Star ~4.5′, WISE 0855 ~3.5′, eps Ind B ~2.0′ (more than our 5′ default FOV/2!).
// So we propagate the position to the SPHEREx era before using it.

export const TARGETS = [
  {
    id: "barnard", type: "mover",
    label: "Barnard's Star",
    kind: "Nearby star, fastest proper motion known",
    simbadId: "NAME Barnard's star",
    ra: 269.4520769586187, dec: 4.693364966576667,
    pmra: -801.551, pmdec: 10362.394,
    coordRef: "2020yCat.1350....0G",
  },
  {
    id: "epsindb", type: "mover",
    label: "Epsilon Indi B",
    kind: "Brown dwarf binary",
    simbadId: "eps Ind B",
    ra: 331.04414658852124, dec: -56.782844195116105,
    pmra: 3981.977, pmdec: -2466.832,
    coordRef: "2020yCat.1350....0G",
  },
  {
    id: "wise0855", type: "mover",
    label: "WISE 0855",
    kind: "Coldest known brown dwarf",
    simbadId: "WISE J085510.83-071442.5",   // SIMBAD main_id: WISEA J085510.74-071442.5
    ra: 133.81890825, dec: -7.247048,
    pmra: -8123.7, pmdec: 673.2,
    coordRef: "2021ApJS..253....7K",
  },
  {
    id: "rwaur", type: "variable",
    label: "RW Aurigae",
    kind: "Variable young star",
    simbadId: "RW Aur",
    ra: 76.95652603458333, dec: 30.401438173888888,
    pmra: 7.23, pmdec: -20.33,
    coordRef: "2007A&A...474..653V",
  },
  {
    id: "rdra", type: "variable",
    label: "R Draconis",
    kind: "Mira variable star",
    simbadId: "R Dra",
    ra: 248.16761083295, dec: 66.75497941722,
    pmra: -20.643, pmdec: 6.149,
    coordRef: "2020yCat.1350....0G",
  },
];

// Reference epoch for the quick-pick buttons (decimal year).
// ASSUMPTION: middle of the SPHEREx data we expect (2025–2026). Over ±1 yr even
// Barnard's Star moves only ~10″ (< 2 SPHEREx pixels), so the exact value is not critical.
export const SPHEREX_REF_EPOCH = 2026.0;

const MAS_PER_DEG = 3.6e6;

/**
 * Linear proper-motion propagation from J2000 to `epoch` (decimal year).
 * Ignores parallax (< 1″ for these objects) and radial velocity – fine for a cutout center.
 * Returns { ra, dec } in degrees.
 */
export function positionAtEpoch(target, epoch = SPHEREX_REF_EPOCH) {
  const dt = epoch - 2000.0;                                   // years since J2000
  const dec = target.dec + (target.pmdec * dt) / MAS_PER_DEG;
  const meanDecRad = ((target.dec + dec) / 2) * (Math.PI / 180);
  // pmra already includes cos(dec), so divide it back out to get a change in RA.
  let ra = target.ra + (target.pmra * dt) / MAS_PER_DEG / Math.cos(meanDecRad);
  ra = ((ra % 360) + 360) % 360;                               // keep RA in [0, 360)
  return { ra, dec };
}

/** Total proper motion in arcsec/yr. */
export const totalProperMotion = (t) => Math.hypot(t.pmra, t.pmdec) / 1000;

/**
 * Known targets that fall inside a square field (side fovArcmin) centred on (ra, dec)
 * at the given epoch. A small margin keeps objects whose track only clips the edge.
 */
export function targetsInField(ra, dec, fovArcmin, epoch = SPHEREX_REF_EPOCH) {
  const half = (fovArcmin * 60) / 2 * 1.05;               // arcsec
  return TARGETS.filter((t) => {
    const p = positionAtEpoch(t, epoch);
    let dRa = p.ra - ra;
    if (dRa > 180) dRa -= 360; else if (dRa < -180) dRa += 360;
    const east = dRa * 3600 * Math.cos((dec * Math.PI) / 180);
    const north = (p.dec - dec) * 3600;
    return Math.abs(east) <= half && Math.abs(north) <= half;
  });
}
