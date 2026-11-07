// Tests for the pure parts of frontend/js/features/tour.js.  Run: node scratch/test_tour.mjs
import { nextIndex, stepLabel, placeCard, clipToView, WORKSPACE_STEPS } from "../frontend/js/features/tour.js";
import { readFileSync } from "node:fs";

let failed = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  – " + detail : ""}`);
  if (!ok) failed++;
}

// ---- stepping
check("next moves forward", nextIndex(0, 5, 1) === 1 && nextIndex(3, 5, 1) === 4);
check("past the last step the tour is finished (-1)", nextIndex(4, 5, 1) === -1);
check("back stops at the first step", nextIndex(0, 5, -1) === 0 && nextIndex(2, 5, -1) === 1);
check("one step: next finishes", nextIndex(0, 1, 1) === -1);
check("the label counts from 1", stepLabel(0, 8) === "1 / 8" && stepLabel(7, 8) === "8 / 8");

// ---- where the card goes
const VIEW = { width: 1200, height: 800 }, CARD = { width: 340, height: 200 };
{
  const top = placeCard({ top: 100, left: 400, width: 200, height: 60 }, CARD, VIEW);
  check("below the target when there is room, centred on it", top.placement === "below" && top.top === 172 && top.left === 500 - 170, JSON.stringify(top));
  const low = placeCard({ top: 650, left: 400, width: 200, height: 100 }, CARD, VIEW);
  check("above the target when there is no room below", low.placement === "above" && low.top === 650 - 12 - 200, JSON.stringify(low));
  const tall = placeCard({ top: 0, left: 300, width: 600, height: 800 }, CARD, VIEW);
  check("a target as tall as the screen: the card sits inside its bottom edge", tall.placement === "inside" && tall.top === 800 - 200 - 8, JSON.stringify(tall));
  const edge = placeCard({ top: 100, left: 0, width: 50, height: 40 }, CARD, VIEW);
  check("never leaves the screen on the left ...", edge.left === 8, String(edge.left));
  const right = placeCard({ top: 100, left: 1150, width: 50, height: 40 }, CARD, VIEW);
  check("... or on the right", right.left === 1200 - 340 - 8, String(right.left));
  const phone = placeCard({ top: 100, left: 20, width: 300, height: 60 }, { width: 340, height: 220 }, { width: 375, height: 700 });
  check("on a phone it is a full-width sheet at the bottom", phone.placement === "sheet" && phone.width === 375 - 16 && phone.top === 700 - 220 - 8, JSON.stringify(phone));
  const tiny = placeCard({ top: 0, left: 0, width: 10, height: 10 }, { width: 340, height: 900 }, { width: 800, height: 300 });
  check("a card taller than the screen is still pinned to the top margin, not off-screen", tiny.top >= 8, String(tiny.top));
}

// ---- the highlighted part
{
  check("a rectangle fully on screen is unchanged", JSON.stringify(clipToView({ top: 10, left: 20, width: 100, height: 50 }, VIEW)) === JSON.stringify({ top: 10, left: 20, width: 100, height: 50 }));
  const c = clipToView({ top: -300, left: 50, width: 400, height: 1500 }, VIEW);
  check("a tall element is highlighted only where it is visible", c.top === 0 && c.height === 800 && c.left === 50 && c.width === 400, JSON.stringify(c));
  check("an element entirely off screen has no area", clipToView({ top: 900, left: 0, width: 50, height: 50 }, VIEW).height === 0);
}

// ---- the steps point at things that exist in index.html
{
  const html = readFileSync(new URL("../frontend/index.html", import.meta.url), "utf8");
  const missing = WORKSPACE_STEPS.filter((s) => !new RegExp(`id="${s.target.slice(1)}"`).test(html));
  check("every step targets an id that exists in index.html", missing.length === 0, missing.map((s) => s.target).join(", "));
  check("every step has a title and a text", WORKSPACE_STEPS.every((s) => s.title && s.text.length > 40));
  check("the tour is a minute long: 8 steps or fewer, short texts", WORKSPACE_STEPS.length <= 8 && WORKSPACE_STEPS.every((s) => s.text.length < 330));
}

console.log(failed ? `\n${failed} check(s) FAILED` : "\nAll checks passed");
process.exitCode = failed ? 1 : 0;
