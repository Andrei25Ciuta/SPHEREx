// main.js – entry point of the app. It wires the UI to the other modules.
//
//   form + quick picks  -> getCutouts()  -> detector select + overview
//                                         -> BlinkPlayer (blink / difference / stack / trail)
//   click on the image  -> measure.js    -> spectrum + light curve
//   "Show sky map"      -> skyContext.js -> Aladin Lite + SIMBAD
//   save / record / copy link -> exporters.js

import { parseRA, parseDec, formatRA, formatDec } from "./coords.js";
import { TARGETS, positionAtEpoch, SPHEREX_REF_EPOCH, targetsInField, totalProperMotion } from "./targets.js";
import { skyToCanvas, mjdToYear } from "./geometry.js";
import { readUrlState, writeUrlState } from "./urlState.js";
import { getCutouts, listDetectors } from "./data/getCutouts.js";
import { DATA_SOURCE } from "./config.js";
import { BlinkPlayer, MODES, loadImage, meanImageData } from "./player.js";
import { canvasToSky, measureAndPlot, clearMeasurement, APERTURE_RADIUS_PX } from "./features/measure.js";
import { SkyContext } from "./features/skyContext.js";
import { setupFullscreen } from "./features/fullscreen.js";
import { savePng, recordBlink, canRecord, copyLink } from "./features/exporters.js";

// Small helper: document.getElementById is long, so we alias it.
const $ = (id) => document.getElementById(id);

const form = $("search-form");
const raInput = $("ra-input");
const decInput = $("dec-input");
const fovInput = $("fov-input");
const speedInput = $("speed-input");
const detSelect = $("det-select");
const canvas = $("blink-canvas");

// Detector asked for in the URL. The <select> is only filled once data arrives,
// so we remember the wish here and apply it then.
let requestedDetector = null;

// FOV limits – must match min/max of the slider in index.html.
const FOV_MIN = 1, FOV_MAX = 30;
// "Skip flagged frames" threshold.
const MAX_FLAGGED_FRACTION = 0.01;

// ---------------------------------------------------------------
// Data state
// ---------------------------------------------------------------
let allFrames = [];       // every frame returned for the current position
let currentFrames = [];   // frames of the selected detector only (time-ordered)
let currentDetector = null;
let currentQuery = null;  // { ra, dec, fov } of the loaded data
let loadToken = 0;        // increases on every load; protects against out-of-order responses
let lastQuery = null;     // remembered so "Try again" can repeat the failed request

// ---------------------------------------------------------------
// Slider labels
// ---------------------------------------------------------------
fovInput.addEventListener("input", () => { $("fov-value").textContent = fovInput.value; });
speedInput.addEventListener("input", () => {
  $("speed-value").textContent = speedInput.value;
  player.setFps(speedInput.value);
});

// "change" fires when the user RELEASES the slider (not on every pixel of movement),
// so we don't rewrite the URL dozens of times per second.
fovInput.addEventListener("change", () => {
  writeUrlState({ fov: fovInput.value });
  if (allFrames.length) form.requestSubmit();          // reload with the new FOV
});
detSelect.addEventListener("change", () => selectDetector(detSelect.value));

/** Switch detector without a new search. Images can still fail to load -> catch. */
function selectDetector(det) {
  requestedDetector = det;
  detSelect.value = det;
  writeUrlState({ det });
  showDetector(det).catch((err) => {
    console.error(err);
    showOverlay("Could not load images", err.message, { error: true });
  });
}

// ---------------------------------------------------------------
// Field validation helpers
// ---------------------------------------------------------------
// Remember the original help texts so we can restore them.
const defaultHelp = { ra: $("ra-help").textContent, dec: $("dec-help").textContent };

/** Show or clear an error under one input (and mark it invalid for screen readers). */
function setFieldError(input, errorEl, message) {
  errorEl.textContent = message || "";
  if (message) input.setAttribute("aria-invalid", "true");
  else input.removeAttribute("aria-invalid");
}

/** Live preview under the field: shows how we understood the input, in both formats. */
function updatePreview(which) {
  const input = which === "ra" ? raInput : decInput;
  const helpEl = $(`${which}-help`);
  const result = which === "ra" ? parseRA(input.value) : parseDec(input.value);

  if (input.value.trim() && result.ok) {
    const sexa = which === "ra" ? formatRA(result.deg) : formatDec(result.deg);
    helpEl.textContent = `→ ${result.deg.toFixed(5)}°  =  ${sexa}`;
  } else {
    helpEl.textContent = defaultHelp[which];
  }
  // While the user types we clear old errors; they reappear on submit if still wrong.
  setFieldError(input, $(`${which}-error`), "");
}
raInput.addEventListener("input", () => updatePreview("ra"));
decInput.addEventListener("input", () => updatePreview("dec"));

/**
 * Read + validate the whole form.
 * Returns { ra, dec, fov } in degrees/arcmin, or null if something is invalid.
 */
function readForm() {
  const ra = parseRA(raInput.value);
  const dec = parseDec(decInput.value);
  setFieldError(raInput, $("ra-error"), ra.ok ? "" : ra.error);
  setFieldError(decInput, $("dec-error"), dec.ok ? "" : dec.error);

  if (!ra.ok) { raInput.focus(); return null; }      // move focus to the first bad field
  if (!dec.ok) { decInput.focus(); return null; }

  return { ra: ra.deg, dec: dec.deg, fov: Number(fovInput.value) };
}

// ---------------------------------------------------------------
// Quick-pick buttons for the test objects
// ---------------------------------------------------------------
function renderQuickPicks() {
  const list = $("quick-pick-list");
  for (const target of TARGETS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip";
    btn.textContent = target.label;
    btn.title = `${target.kind} – position propagated to ${SPHEREX_REF_EPOCH} (SIMBAD J2000 + proper motion)`;
    btn.dataset.targetId = target.id;
    btn.setAttribute("aria-pressed", "false");
    btn.addEventListener("click", () => selectTarget(target));
    list.appendChild(btn);
  }
}

/** Fill RA/Dec with the target's position at the SPHEREx epoch, then submit. */
function selectTarget(target) {
  const { ra, dec } = positionAtEpoch(target);
  raInput.value = ra.toFixed(5);
  decInput.value = dec.toFixed(5);
  updatePreview("ra");
  updatePreview("dec");

  // Visually mark which chip is active.
  document.querySelectorAll("#quick-pick-list .chip").forEach((chip) => {
    chip.setAttribute("aria-pressed", String(chip.dataset.targetId === target.id));
  });

  // requestSubmit() triggers the same "submit" handler as clicking the button.
  form.requestSubmit();
}

// If the user edits coordinates by hand, no chip is "active" anymore.
[raInput, decInput].forEach((el) => el.addEventListener("input", () => {
  document.querySelectorAll("#quick-pick-list .chip").forEach((c) => c.setAttribute("aria-pressed", "false"));
}));

// ---------------------------------------------------------------
// Stage overlay + status helpers (empty / loading / error states)
// ---------------------------------------------------------------
const overlay = $("stage-overlay");
const overlayProgress = $("overlay-progress");
const retryBtn = $("retry-btn");

/**
 * Show the overlay on top of the image.
 *  - error: red title + "Try again" button (focused, so keyboard users land on it)
 *  - progress: number 0..1 shows a progress bar; null hides it
 */
function showOverlay(title, sub = "", { error = false, progress = null } = {}) {
  overlay.querySelector(".overlay-title").textContent = title;
  overlay.querySelector(".overlay-sub").textContent = sub;
  overlay.classList.toggle("error", error);
  overlayProgress.hidden = progress === null;
  if (progress !== null) overlayProgress.value = progress;
  retryBtn.hidden = !(error && lastQuery);
  overlay.classList.remove("hidden");
  overlay.removeAttribute("aria-hidden");
  if (error && lastQuery) retryBtn.focus();
}
const hideOverlay = () => {
  overlay.classList.add("hidden");
  // Invisible (opacity 0) is not enough: screen readers would still read the old text.
  overlay.setAttribute("aria-hidden", "true");
};
retryBtn.addEventListener("click", () => { if (lastQuery) loadData(lastQuery); });

const setStatus = (text) => { $("status-msg").textContent = text || ""; };

function setLoading(isLoading) {
  const btn = $("load-btn");
  btn.disabled = isLoading;
  btn.classList.toggle("is-loading", isLoading);
  btn.querySelector(".btn-label").textContent = isLoading ? "Loading…" : "Load images";
  $("stage").setAttribute("aria-busy", String(isLoading));
}

/** Fill the detector <select> from the data, and pick which one to show. */
function populateDetectors(frames) {
  const detectors = listDetectors(frames);
  detSelect.innerHTML = "";
  for (const d of detectors) {
    const opt = document.createElement("option");
    opt.value = d.detector;
    opt.textContent = `${d.detector} · ${d.wlMin.toFixed(2)}–${d.wlMax.toFixed(2)} µm · ${d.count} frame${d.count === 1 ? "" : "s"}`;
    detSelect.appendChild(opt);
  }
  detSelect.disabled = detectors.length === 0;

  // Prefer the detector from the URL; otherwise the one with the most frames.
  const wanted = detectors.find((d) => d.detector === requestedDetector);
  const best = [...detectors].sort((a, b) => b.count - a.count)[0];
  if (requestedDetector && !wanted && best) {
    setStatus(`Detector ${requestedDetector} has no images here – showing ${best.detector} instead.`);
  }
  return (wanted || best)?.detector ?? null;
}

// ---------------------------------------------------------------
// Blink player + its controls
// ---------------------------------------------------------------
const playBtn = $("play-btn");
const frameSlider = $("frame-slider");

const player = new BlinkPlayer(canvas, {
  onFrameChange: updateFrameInfo,
  onPlayStateChange: (playing) => {
    playBtn.setAttribute("aria-label", playing ? "Pause" : "Play");
    playBtn.querySelector("span").className = playing ? "icon-pause" : "icon-play";
  },
});
player.setFps(speedInput.value);

const fmtDate = (iso) => iso.slice(0, 16).replace("T", " ") + " UTC";

/** Update counter, date, slider and metadata for the frame being shown. */
function updateFrameInfo(i, frame) {
  frameSlider.value = String(i);
  frameSlider.setAttribute("aria-valuetext", `Frame ${i + 1} of ${player.length}, ${frame.dateISO.slice(0, 10)}`);
  $("meta-det").textContent = frame.detector;
  $("meta-mjd").textContent = frame.mjd.toFixed(3);

  if (player.isAnimated) {
    $("frame-counter").textContent = `Frame ${i + 1} / ${player.length}`;
    $("frame-date").textContent = fmtDate(frame.dateISO);
    $("meta-wl").textContent = `${frame.wavelengthMinUm.toFixed(2)}–${frame.wavelengthMaxUm.toFixed(2)} µm`;
    $("meta-flags").textContent = !frame.flags ? "n/a"
      : frame.flags.anyFlagged ? `⚠ ${(frame.flags.fractionFlagged * 100).toFixed(1)} % px` : "Clean";
    canvas.setAttribute("aria-label",
      `SPHEREx ${frame.detector} ${player.mode === "diff" ? "difference image" : "image"} taken ${frame.dateISO.slice(0, 10)}, frame ${i + 1} of ${player.length}`);
  } else {
    // Stack / trail: one image made from all frames.
    const f0 = player.frames[0], f1 = player.frames.at(-1);
    const wlMin = Math.min(...player.frames.map((f) => f.wavelengthMinUm));
    const wlMax = Math.max(...player.frames.map((f) => f.wavelengthMaxUm));
    $("frame-counter").textContent = `${player.mode === "mean" ? "Stack" : "Trail"} of ${player.length}`;
    $("frame-date").textContent = `${f0.dateISO.slice(0, 10)} → ${f1.dateISO.slice(0, 10)}`;
    $("meta-wl").textContent = `${wlMin.toFixed(2)}–${wlMax.toFixed(2)} µm`;
    const flagged = player.frames.filter((f) => f.flags?.anyFlagged).length;
    $("meta-flags").textContent = flagged ? `⚠ ${flagged} of ${player.length} frames` : "Clean";
    $("meta-mjd").textContent = `${f0.mjd.toFixed(1)}–${f1.mjd.toFixed(1)}`;
    canvas.setAttribute("aria-label",
      `SPHEREx ${f0.detector} ${player.mode === "mean" ? "average" : "maximum (trail)"} of ${player.length} images, ${f0.dateISO.slice(0, 10)} to ${f1.dateISO.slice(0, 10)}`);
  }
}

/** Enable/disable the player controls according to frames + mode. */
function setPlayerEnabled(enabled) {
  const animated = enabled && player.isAnimated && player.length > 1;
  playBtn.disabled = !animated;
  frameSlider.disabled = !animated;
  speedInput.disabled = !animated;
  $("save-png-btn").disabled = !enabled;
  $("record-btn").disabled = !animated || !canRecord();
  // Modes that combine frames need at least 2 of them.
  document.querySelectorAll('#mode-switch input:not([value="blink"])')
    .forEach((r) => { r.disabled = !enabled || player.length < 2; });
  $("show-flags").disabled = !enabled || !player.hasFlagMasks;
}

playBtn.addEventListener("click", () => player.toggle());

// Dragging the slider = manual control, so we pause the animation.
frameSlider.addEventListener("input", () => {
  player.pause();
  player.goTo(Number(frameSlider.value));
});

// Keyboard shortcuts: Space = play/pause, ←/→ = previous/next frame.
// Ignored while typing in a field / using a select or slider (they need these keys).
// On a focused button, Space already "clicks" it, so we only take over the arrows there.
document.addEventListener("keydown", (e) => {
  if (e.target.closest("input, select, textarea, summary, .skymap") || !player.length) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;    // leave browser shortcuts alone
  if (e.key === "Escape" && player.marker) { clearMarker(); return; }
  if (!player.isAnimated) return;
  const onButton = !!e.target.closest("button");
  if (e.key === " " && !onButton) { e.preventDefault(); player.toggle(); }
  else if (e.key === "ArrowRight") { player.pause(); player.next(); }
  else if (e.key === "ArrowLeft") { player.pause(); player.prev(); }
});

// Users who asked their OS for less motion don't get auto-play.
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------------------------------------------------------------
// View modes
// ---------------------------------------------------------------
const MODE_HELP = {
  blink: "Images from different dates, one after another. Most stars stay put – look for a dot that <strong>jumps</strong>.",
  diff: 'Each image minus the median of the images from <em>other</em> dates: still stars vanish. <span class="swatch" style="background:#ff9e33"></span> brighter than usual – the object is here now · <span class="swatch" style="background:#409eff"></span> fainter than usual.',
  mean: "Average of all images: deeper and less noisy. Moving objects get smeared or fade out.",
  max: "Brightest value of every pixel over all dates: a moving object leaves a <strong>trail of dots</strong>, a still star stays one dot.",
};

function setMode(mode, { updateUrl = true } = {}) {
  if (!MODES.includes(mode)) mode = "blink";
  const radio = document.querySelector(`#mode-switch input[value="${mode}"]`);
  if (radio.disabled) mode = "blink";
  document.querySelector(`#mode-switch input[value="${mode}"]`).checked = true;
  player.setMode(mode);
  $("mode-help").innerHTML = MODE_HELP[mode];
  if (updateUrl) writeUrlState({ mode: mode === "blink" ? null : mode });
  if (player.length) {
    setPlayerEnabled(true);
    updateFrameInfo(player.index, player.frames[player.index]);
    if (player.isAnimated && !player.playing && !prefersReducedMotion && player.length > 1) player.play();
  }
}
document.querySelectorAll('#mode-switch input').forEach((r) =>
  r.addEventListener("change", () => setMode(r.value)));

// ---------------------------------------------------------------
// Flags
// ---------------------------------------------------------------
$("show-flags").addEventListener("change", (e) => player.setShowFlags(e.target.checked));
$("skip-flagged").addEventListener("change", () => { if (currentDetector) selectDetector(currentDetector); });

/** Frames of one detector, without the badly flagged ones if the user asked so. */
function framesFor(detector) {
  const frames = allFrames.filter((f) => f.detector === detector);
  if (!$("skip-flagged").checked) return { frames, skipped: 0 };
  const kept = frames.filter((f) => !f.flags || f.flags.fractionFlagged <= MAX_FLAGGED_FRACTION);
  return { frames: kept, skipped: frames.length - kept.length };
}

// ---------------------------------------------------------------
// Predicted track of known objects (SIMBAD position + proper motion, per frame date)
// ---------------------------------------------------------------
$("show-track").addEventListener("change", (e) => player.setShowTracks(e.target.checked));

/**
 * For every known test object inside the field: where SHOULD it be on each frame's date?
 * If the object sits on the green ticks in every frame, the whole chain (archive query,
 * cutout, orientation, timing) is right. It also tells how far it moves – in pixels.
 */
function updateTracks() {
  const info = $("track-info");
  const box = $("show-track");
  if (!currentQuery || !currentFrames.length || !player.naturalSize) {
    player.setTracks([]); info.textContent = ""; box.disabled = true; return;
  }
  const n = player.naturalSize;
  const scaleArcsec = currentFrames[0].pixelScaleArcsec ?? (currentQuery.fov * 60) / n;
  const geo = { ra: currentQuery.ra, dec: currentQuery.dec, n, scaleArcsec };
  const midYear = mjdToYear((currentFrames[0].mjd + currentFrames.at(-1).mjd) / 2);
  const found = targetsInField(currentQuery.ra, currentQuery.dec, currentQuery.fov, midYear);

  player.setTracks(found.map((t) => ({
    label: t.label,
    points: currentFrames.map((f) => {
      const p = positionAtEpoch(t, mjdToYear(f.mjd));
      return skyToCanvas(p.ra, p.dec, geo);
    }),
  })));
  box.disabled = found.length === 0;

  info.textContent = found.map((t) => {
    const pm = totalProperMotion(t);
    const years = (currentFrames.at(-1).mjd - currentFrames[0].mjd) / 365.25;
    const spanPx = (pm * years) / scaleArcsec;
    let line = `${t.label}: catalogue motion ${pm.toFixed(2)}″/yr = ${(pm / scaleArcsec).toFixed(2)} px/yr ` +
      `→ ${spanPx.toFixed(1)} px between the first and last ${currentDetector} frame (${years.toFixed(1)} yr).`;
    if (spanPx < 0.3) line += " Practically still – look for brightness changes instead.";
    else if (spanPx < 2) line += " Less than 2 pixels: use Difference and step with ← → to see it.";
    return line;
  }).join(" ");
}

/** Show only the frames of one detector in the player. */
async function showDetector(detector) {
  const token = loadToken;               // if a new load starts while we wait, give up
  currentDetector = detector;
  const { frames, skipped } = framesFor(detector);
  currentFrames = frames;
  player.setTracks([]);                  // old track has the wrong number of points
  player.pause();
  setPlayerEnabled(false);
  markOverview(detector);
  setStatus(skipped ? `${skipped} ${detector} frame(s) hidden because more than 1 % of their pixels are flagged.` : "");

  if (currentFrames.length === 0) {
    showOverlay("No frames for this combination",
      skipped ? `All ${detector} images here are flagged – untick “Skip frames…”.` : `There are no ${detector} images at this position.`);
    return;
  }
  const n = currentFrames.length;
  // Preload all images; the bar shows how many are ready.
  await player.setFrames(currentFrames, (done) => {
    if (token === loadToken) showOverlay("Preparing frames…", `${done} / ${n} ${detector} images ready`, { progress: done / n });
  });
  if (token !== loadToken) return;

  frameSlider.max = String(currentFrames.length - 1);
  hideOverlay();
  setPlayerEnabled(true);
  updateTracks();
  // Re-apply the mode: it may need ≥ 2 frames, and the info line depends on it.
  setMode(player.mode, { updateUrl: false });

  if (currentFrames.length === 1) {
    setStatus(`Only one ${detector} image here – nothing to blink. Try another detector.`);
    return;
  }
  if (player.isAnimated && !prefersReducedMotion) player.play();
  else if (prefersReducedMotion) setStatus("Auto-play is off because your system asks for reduced motion – press Play or use ← →.");
}

// ---------------------------------------------------------------
// Detector overview ("All"): one averaged thumbnail per detector
// ---------------------------------------------------------------
async function renderOverview(frames, token) {
  const box = $("overview"), grid = $("overview-grid");
  grid.innerHTML = "";
  const detectors = listDetectors(frames);
  if (detectors.length < 2) { box.hidden = true; return; }
  box.hidden = false;

  for (const d of detectors) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "overview-item";
    btn.dataset.det = d.detector;
    btn.setAttribute("aria-pressed", String(d.detector === currentDetector));
    btn.setAttribute("aria-label", `${d.detector}, ${d.wlMin.toFixed(2)} to ${d.wlMax.toFixed(2)} micrometres, ${d.count} frames. Show in the player.`);
    btn.innerHTML = `<canvas width="1" height="1" aria-hidden="true"></canvas>
      <span class="ov-name">${d.detector}</span>
      <span class="ov-sub">${d.wlMin.toFixed(2)}–${d.wlMax.toFixed(2)} µm · ${d.count}×</span>`;
    btn.addEventListener("click", () => selectDetector(d.detector));
    grid.appendChild(btn);

    // Draw the average image (async; a failure just leaves the thumbnail black).
    const images = await Promise.all(frames.filter((f) => f.detector === d.detector)
      .map((f) => loadImage(f.imageUrl, f).catch(() => null)));
    if (token !== loadToken) return;
    const data = meanImageData(images.filter(Boolean));
    if (data) {
      const c = btn.querySelector("canvas");
      c.width = data.width; c.height = data.height;
      c.getContext("2d").putImageData(data, 0, 0);
    }
  }
}
function markOverview(detector) {
  document.querySelectorAll(".overview-item").forEach((b) =>
    b.setAttribute("aria-pressed", String(b.dataset.det === detector)));
}

// ---------------------------------------------------------------
// Measure: click on the image -> spectrum + light curve
// ---------------------------------------------------------------
const measureEls = {
  pos: $("measure-pos"), charts: $("charts"), note: $("measure-note"),
  tableWrap: $("measure-table-wrap"), table: $("measure-table"),
  spectrum: $("spectrum-chart"), lightcurve: $("lightcurve-chart"),
};
let measureToken = 0;

canvas.addEventListener("click", async (e) => {
  if (!player.length || !currentQuery) return;
  const rect = canvas.getBoundingClientRect();
  const fx = (e.clientX - rect.left) / rect.width;
  const fy = (e.clientY - rect.top) / rect.height;
  const n = player.naturalSize;
  const scaleArcsec = currentFrames[0].pixelScaleArcsec ?? (currentQuery.fov * 60) / n;
  const sky = canvasToSky(fx, fy, { ra: currentQuery.ra, dec: currentQuery.dec, n, scaleArcsec });

  player.setMarker({ fx, fy, rPx: APERTURE_RADIUS_PX });
  const token = ++measureToken;
  try {
    await measureAndPlot({ query: currentQuery, sky, els: measureEls, isCurrent: () => token === measureToken });
  } catch (err) {
    console.error(err);
    if (token === measureToken) measureEls.pos.textContent = `Could not measure: ${err.message}`;
  }
});

function clearMarker() {
  measureToken++;
  player.setMarker(null);
  clearMeasurement(measureEls);
}

// ---------------------------------------------------------------
// Sky context (Aladin Lite)
// ---------------------------------------------------------------
const sky = new SkyContext($("aladin-box"), $("aladin-status"));
setupFullscreen($("sky-frame"), $("sky-full-btn"));   // map + its controls fill the screen
$("aladin-btn").addEventListener("click", async () => {
  const q = currentQuery || readForm();
  if (!q) { $("aladin-status").textContent = "Enter coordinates first."; return; }
  $("aladin-btn").disabled = true;
  await sky.open(q, $("survey-select").value);
  $("aladin-btn").disabled = false;
  $("aladin-btn").textContent = "Re-centre sky map";
  $("sky-full-btn").hidden = !sky.isOpen;             // nothing to enlarge until the map is open
});
$("survey-select").addEventListener("change", (e) => sky.setSurvey(e.target.value));

// ---------------------------------------------------------------
// Save / record / share
// ---------------------------------------------------------------
const fileBase = () => {
  const f = player.frames[player.index];
  const tag = player.isAnimated ? `${player.mode}_${f.dateISO.slice(0, 10)}` : player.mode;
  return `spherex-blink_${currentQuery.ra.toFixed(4)}_${currentQuery.dec.toFixed(4)}_${f.detector}_${tag}`;
};
$("save-png-btn").addEventListener("click", () => { if (player.length) savePng(player, fileBase()); });

$("record-btn").addEventListener("click", async () => {
  const btn = $("record-btn");
  if (!player.length || btn.classList.contains("recording")) return;
  btn.classList.add("recording");
  btn.disabled = true;
  try {
    await recordBlink(player, fileBase().replace(/_\d{4}-\d{2}-\d{2}$/, ""), {
      onTick: (s) => { btn.textContent = `Recording… ${s}s`; },
    });
    setStatus("Video saved to your downloads.");
  } catch (err) {
    setStatus(`Recording failed: ${err.message}`);
  } finally {
    btn.classList.remove("recording");
    btn.textContent = "Record video";
    btn.disabled = false;
  }
});

$("copy-link-btn").addEventListener("click", async () => {
  const ok = await copyLink();
  const btn = $("copy-link-btn");
  if (ok) { btn.textContent = "Link copied ✓"; setTimeout(() => { btn.textContent = "Copy link"; }, 1800); }
});

// ---------------------------------------------------------------
// Loading data
// ---------------------------------------------------------------
/** Fetch frames for a query and show them. */
async function loadData(query) {
  const token = ++loadToken;
  lastQuery = query;
  setLoading(true);
  setStatus("");
  player.pause();
  setPlayerEnabled(false);
  clearMarker();
  player.setTracks([]);
  $("track-info").textContent = "";
  $("overview").hidden = true;
  showOverlay("Loading images…", `RA ${formatRA(query.ra)}  Dec ${formatDec(query.dec)}  ·  ${query.fov}′ field`);

  try {
    const frames = await getCutouts({ ra: query.ra, dec: query.dec, fovArcmin: query.fov, detector: "all" });
    if (token !== loadToken) return;                   // a newer request started meanwhile – ignore this one

    allFrames = frames;
    currentQuery = query;
    if (sky.isOpen) sky.update(query);
    if (frames.length === 0) {
      detSelect.innerHTML = '<option value="">No data</option>';
      detSelect.disabled = true;
      showOverlay("No SPHEREx images found here", "Try another position or a test object.");
      return;
    }
    const det = populateDetectors(frames);
    detSelect.value = det;
    writeUrlState({ det });
    currentDetector = det;
    renderOverview(frames, token);                     // runs in the background
    await showDetector(det);
    console.log(`Loaded ${frames.length} frames`, listDetectors(frames));
  } catch (err) {
    if (token !== loadToken) return;
    console.error(err);
    allFrames = [];
    detSelect.innerHTML = '<option value="">No data</option>';
    detSelect.disabled = true;
    showOverlay("Could not load images", err.message || "Unknown error.", { error: true });
  } finally {
    if (token === loadToken) setLoading(false);
  }
}

// ---------------------------------------------------------------
// Submit
// ---------------------------------------------------------------
form.addEventListener("submit", (event) => {
  event.preventDefault();            // a <form> would otherwise reload the page
  const query = readForm();
  if (!query) return;

  // Save the VALID query in the URL. We always store degrees (5 decimals ≈ 0.04″),
  // even if the user typed sexagesimal – one canonical format is easier to share/parse.
  writeUrlState({ ra: query.ra.toFixed(5), dec: query.dec.toFixed(5), fov: query.fov });

  loadData(query);
});

// ---------------------------------------------------------------
// Startup: restore state from the URL
// ---------------------------------------------------------------
function applyUrlState() {
  const state = readUrlState();

  // FOV: must be a number; clamp it into the slider range.
  if (state.fov !== undefined) {
    const fov = Number(state.fov);
    if (Number.isFinite(fov)) {
      fovInput.value = String(Math.min(FOV_MAX, Math.max(FOV_MIN, Math.round(fov))));
      $("fov-value").textContent = fovInput.value;
    }
  }

  if (state.det) requestedDetector = state.det;
  if (state.mode && MODES.includes(state.mode)) {
    player.setMode(state.mode);
    document.querySelector(`#mode-switch input[value="${state.mode}"]`).checked = true;
  }
  $("mode-help").innerHTML = MODE_HELP[player.mode];

  // RA/Dec: put the raw text in the inputs. If both are present, load right away.
  // If they are invalid, readForm() will show the normal error messages – no crash.
  if (state.ra !== undefined) { raInput.value = state.ra; updatePreview("ra"); }
  if (state.dec !== undefined) { decInput.value = state.dec; updatePreview("dec"); }
  if (state.ra !== undefined && state.dec !== undefined) form.requestSubmit();
}

// Show which data source is active in the header badge.
const badge = $("data-source-badge");
badge.textContent = DATA_SOURCE === "api" ? "Live data" : "Mock data";
badge.classList.toggle("real", DATA_SOURCE === "api");

if (!canRecord()) $("record-btn").title = "Your browser cannot record canvas video.";
renderQuickPicks();
applyUrlState();
console.log("SPHEREx Blink: loaded OK");
