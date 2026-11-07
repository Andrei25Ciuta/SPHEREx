// skyContext.js – Aladin Lite sky map: the same spot in other surveys + SIMBAD objects,
// with the blink field drawn as a dashed square. Loaded from the CDN only on demand.
//
// Where the pictures come from (see SKY_TILES in config.js), first one that answers wins:
//   1. ESA's public mirror of the CDS surveys (skies.esac.esa.int, CORS open, no setup);
//   2. our backend, which relays IRSA's copies via /api/hips
//      (IRSA sends no CORS headers, and WebGL needs them);
//   3. the CDS originals (Strasbourg) directly - blocked on some networks,
//      in which case the map stays grey while the catalogue objects still show.
// Catalogue objects: SIMBAD via its Harvard mirror (TAP), which sends CORS headers.
// Older surveys are also handy for movers: a fast star sits somewhere ELSE in 2MASS (1999)!

import { SKY_TILES, API_BASE } from "../config.js";

const ALADIN_URL = "https://cdn.jsdelivr.net/npm/aladin-lite@3.6.5/dist/aladin.js";
const SIMBAD_TAP = "https://simbad.harvard.edu/simbad/sim-tap/sync";

const ESA_HIPS = "https://skies.esac.esa.int";   // same surveys as CDS (properties file says so)
const SURVEYS = {
  "2mass":   { cds: "P/2MASS/color",   esa: "2MASSColor",   irsa: "CDS/2MASS/Color" },
  "allwise": { cds: "P/allWISE/color", esa: "AllWISEColor", irsa: "CDS/AllWISE/RGB-W4-W2-W1" },
  "dss2":    { cds: "P/DSS2/color",    esa: "DSSColor",     irsa: "CDS/DSS2/color" },
};
const SOURCES = ["esa", "backend", "cds"];
const SOURCE_NOTE = {
  esa: "Sky images: ESA's mirror of the CDS surveys.",
  backend: "Sky images: IRSA (via our backend).",
  cds: "Sky images: CDS. If the map stays grey, your network may block CDS: start the backend (see the README), then press “Re-centre sky map”.",
};
// Where the pictures come from right now; decided again each time the map is opened.
let source = SOURCES.includes(SKY_TILES) ? SKY_TILES : "cds";
/** Survey key -> what Aladin should load (a CDS id or a full HiPS URL). */
function surveyRef(key) {
  const s = SURVEYS[key] || SURVEYS["2mass"];
  if (source === "esa") return `${ESA_HIPS}/${s.esa}`;
  if (source === "backend") return `${API_BASE}/api/hips/${s.irsa}`;
  return s.cds;
}

/** Does this URL answer quickly? (A blocked or slow host answers nothing.) */
async function answers(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(2500) });
    return r.ok;
  } catch {
    return false;
  }
}

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]", ""];
/**
 * A backend "on this machine" is only reachable from a page that is also on this machine.
 * On a public page (GitHub Pages) we must not poke at localhost: browsers may even ask the
 * visitor for permission to reach devices on their network.
 */
function backendMayExist() {
  let backendHost = location.hostname;                       // API_BASE = "" means the page's own server
  try { if (API_BASE) backendHost = new URL(API_BASE).hostname; } catch { /* keep the page's host */ }
  return !(LOCAL_HOSTS.includes(backendHost) && !LOCAL_HOSTS.includes(location.hostname));
}

/** First picture source that answers: ESA's mirror, then our backend (IRSA), then CDS. */
async function pickSource() {
  if (SKY_TILES !== "auto") return SOURCES.includes(SKY_TILES) ? SKY_TILES : "cds";
  if (await answers(`${ESA_HIPS}/DSSColor/properties`)) return "esa";
  if (backendMayExist() && await answers(`${API_BASE}/api/health`)) return "backend";
  return "cds";
}

/** SIMBAD objects in a circle, as a VOTable URL (ADQL on the Harvard TAP mirror). */
function simbadUrl(ra, dec, radiusDeg) {
  const adql = `SELECT TOP 300 main_id, ra, dec, otype, sp_type FROM basic
    WHERE CONTAINS(POINT('ICRS', ra, dec), CIRCLE('ICRS', ${ra.toFixed(6)}, ${dec.toFixed(6)}, ${radiusDeg.toFixed(4)})) = 1`;
  return `${SIMBAD_TAP}?${new URLSearchParams({ REQUEST: "doQuery", LANG: "ADQL", FORMAT: "votable", QUERY: adql })}`;
}

let loadPromise = null;
/** The npm build is an ES module (`export default A`), so we import() it on demand. */
function loadAladin() {
  loadPromise ??= import(ALADIN_URL)
    .then(async (mod) => {
      const A = mod.default;
      await A.init;                       // loads the WebAssembly core; needs WebGL2
      return A;
    })
    .catch((err) => {
      loadPromise = null;
      const msg = String(err?.message || err);
      throw new Error(msg.includes("WebGL") ? "The sky map needs WebGL2, which this browser does not offer."
                                            : "Could not load Aladin Lite (offline?).");
    });
  return loadPromise;
}

/** Corners of a north-up square of side fovArcmin around (ra, dec), in degrees. */
function squareCorners(ra, dec, fovArcmin) {
  const h = fovArcmin / 2 / 60;
  const c = Math.cos((dec * Math.PI) / 180);
  return [[ra + h / c, dec + h], [ra - h / c, dec + h], [ra - h / c, dec - h], [ra + h / c, dec - h]];
}

export class SkyContext {
  constructor(container, statusEl) {
    this.container = container;
    this.statusEl = statusEl;
    this.aladin = null;
    this.A = null;
    this.query = null;
    this.survey = "2mass";
  }

  get isOpen() { return !!this.aladin; }

  async open(query, survey) {
    this.survey = survey || this.survey;
    this.container.hidden = false;
    this.statusEl.textContent = "Loading sky map…";
    try {
      this.A = await loadAladin();
    } catch (err) {
      this.statusEl.textContent = err.message;
      this.container.hidden = true;
      return;
    }
    const before = source;
    source = await pickSource();
    if (!this.aladin) {
      this.aladin = this.A.aladin(this.container, {
        survey: surveyRef(this.survey),
        cooFrame: "ICRS",
        showReticle: true,
        showCooGridControl: true,
        showProjectionControl: false,
        showFullscreenControl: false,   // we have our own "Full screen" button (fullscreen.js)
        showLayersControl: true,
        showFrame: true,
        log: false,            // Aladin's default usage ping to CDS: off (it fails on networks that block CDS)
      });
    }
    // The source can change between two openings (e.g. the backend was started meanwhile).
    else if (before !== source) this.setSurvey(this.survey);
    this.statusEl.textContent = SOURCE_NOTE[source];
    this.update(query);
  }

  setSurvey(key) {
    this.survey = key;
    if (!this.aladin) return;
    const ref = surveyRef(key);
    // API name changed between 3.x releases – support both.
    if (typeof this.aladin.setImageSurvey === "function") this.aladin.setImageSurvey(ref);
    else this.aladin.setBaseImageLayer(ref);
  }

  /** Re-centre on a new query and redraw the field square + SIMBAD objects. */
  update(query) {
    this.query = query;
    if (!this.aladin || !query) return;
    const { A, aladin } = this;
    const { ra, dec, fov } = query;
    aladin.gotoRaDec(ra, dec);
    aladin.setFoV(Math.max(fov * 3, 6) / 60);          // show some context around the field

    if (this.overlay) this.overlay.removeAll();
    else {
      this.overlay = A.graphicOverlay({ color: "#22d3ee", lineWidth: 2, lineDash: [6, 4], name: "Blink field" });
      aladin.addOverlay(this.overlay);
    }
    this.overlay.add(A.polygon(squareCorners(ra, dec, fov)));

    // SIMBAD objects: drop the previous catalogue, load the new circle.
    if (this.simbad) { try { this.simbad.removeAll(); this.simbad.hide(); } catch { /* ignore */ } }
    const fail = () => { this.statusEl.textContent = "SIMBAD objects could not be loaded – the sky image still works."; };
    try {
      this.simbad = A.catalogFromURL(simbadUrl(ra, dec, (fov * 1.5) / 60), {
        name: "SIMBAD", color: "#f5b942", sourceSize: 14, shape: "circle", onClick: "showPopup",
      }, null, fail, false);                    // false = no CDS proxy (we have CORS)
      aladin.addCatalog(this.simbad);
    } catch (err) {
      console.warn("SIMBAD overlay failed", err);
      fail();
    }
  }
}
