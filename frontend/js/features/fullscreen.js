// fullscreen.js – make one element fill the whole screen.
//
// Uses the browser's Fullscreen API. Where it does not work for ordinary elements
// (iPhone Safari), falls back to a CSS "cover the viewport" mode. Esc leaves either mode.
// Styling hooks: the frame gets `is-fullscreen` (both modes) and `is-fallback` (CSS mode only).

/** @param {HTMLElement} frame what goes full screen  @param {HTMLButtonElement} button its toggle */
export function setupFullscreen(frame, button) {
  const current = () => document.fullscreenElement || document.webkitFullscreenElement || null;
  let fallback = false;
  const isOn = () => current() === frame || fallback;

  function render() {
    const on = isOn();
    frame.classList.toggle("is-fullscreen", on);
    frame.classList.toggle("is-fallback", fallback);
    // backdrop-filter on the panel would trap `position: fixed` inside it
    frame.closest(".panel")?.classList.toggle("no-blur", fallback);
    document.documentElement.classList.toggle("fs-locked", fallback);   // no page scroll behind
    button.textContent = on ? "Exit full screen" : "Full screen";
  }

  async function enter() {
    const request = frame.requestFullscreen || frame.webkitRequestFullscreen;
    if (request) {
      try {
        // Some embedded browsers never answer the request: do not leave the button dead.
        const answered = await Promise.race([
          Promise.resolve(request.call(frame)).then(() => true),
          new Promise((resolve) => setTimeout(() => resolve(false), 1500)),
        ]);
        if (answered) return;
      } catch { /* refused: use the CSS version */ }
    }
    fallback = true;
    render();
  }

  async function exit() {
    fallback = false;
    if (current() === frame) {
      try { await (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch { /* ignore */ }
    }
    render();
  }

  button.addEventListener("click", () => (isOn() ? exit() : enter()));
  for (const ev of ["fullscreenchange", "webkitfullscreenchange"]) document.addEventListener(ev, render);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && fallback) exit(); });
  render();
}
