// skyContext.js – Aladin Lite sky map: the same spot in other surveys + SIMBAD objects,
// with the blink field drawn as a dashed square. Loaded from the CDN only on demand.
//
// Where the pictures come from:
//   * with our backend (DATA_SOURCE = "api"): IRSA's copies of the surveys, relayed by
//     /api/hips (IRSA sends no CORS headers, and WebGL needs them);
//   * mock only: the CDS originals (Strasbourg) directly.
// Catalogue objects: SIMBAD via its Harvard mirror (TAP), which sends CORS headers.
// Older surveys are also handy for movers: a fast star sits somewhere ELSE in 2MASS (1999)!

import { DATA_SOURCE, API_BASE } from "../config.js";

const ALADIN_URL = "https://cdn.jsdelivr.net/npm/aladin-lite@3.6.5/dist/aladin.js";
const SIMBAD_TAP = "https://simbad.harvard.edu/simbad/sim-tap/sync";

const SURVEYS = {
  "2mass":   { cds: "P/2MASS/color",   irsa: "CDS/2MASS/Color" },
  "allwise": { cds: "P/allWISE/color", irsa: "CDS/AllWISE/RGB-W4-W2-W1" },
  "dss2":    { cds: "P/DSS2/color",    irsa: "CDS/DSS2/color" },
};
const viaBackend = DATA_SOURCE === "api";
/** Survey key -> what Aladin should load (a CDS id or a full HiPS URL). */
function surveyRef(key) {
  const s = SURVEYS[key] || SURVEYS["2mass"];
  return viaBackend ? `${API_BASE}/api/hips/${s.irsa}` : s.cds;
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
    if (!this.aladin) {
      this.aladin = this.A.aladin(this.container, {
        survey: surveyRef(this.survey),
        cooFrame: "ICRS",
        showReticle: true,
        showCooGridControl: true,
        showProjectionControl: false,
        showFullscreenControl: true,
        showLayersControl: true,
        showFrame: true,
      });
    }
    this.statusEl.textContent = viaBackend ? "Sky images: IRSA (via our backend)." :
      "Sky images: CDS. If the map stays grey, your network may block CDS – run the backend (IRSA copy).";
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
