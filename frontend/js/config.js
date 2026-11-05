// config.js – the ONLY place you change to switch between fake and real data.
//
//   "mock" -> synthetic star fields generated in the browser (js/data/mockSource.js)
//   "api"  -> our own Python backend (backend/app.py, step 7) via js/data/apiSource.js
export const DATA_SOURCE = "mock";

// Base URL of our backend (only used when DATA_SOURCE === "api").
// Empty string = same origin as the page (e.g. FastAPI also serves the frontend).
export const API_BASE = "http://localhost:8001";
