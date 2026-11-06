// config.js – the ONLY place you change to switch between fake and real data.
//
//   "mock" -> synthetic star fields generated in the browser (js/data/mockSource.js)
//   "api"  -> our own Python backend (backend/app.py, step 7) via js/data/apiSource.js
export const DATA_SOURCE = "mock";

// Base URL of our backend (used when DATA_SOURCE === "api", and by the sky map's tile proxy).
// Empty string = same origin as the page (e.g. FastAPI also serves the frontend).
export const API_BASE = "http://localhost:8001";

// Where the sky map (Aladin) gets its survey pictures:
//   "auto"    -> the first of these that answers within 2.5 s: "esa", then "backend", then "cds"
//   "esa"     -> ESA's public mirror of the CDS surveys (skies.esac.esa.int)
//   "backend" -> our backend's relay of IRSA's copies (needs the backend running)
//   "cds"     -> CDS (Strasbourg) directly; may be blocked on some networks
export const SKY_TILES = "auto";
