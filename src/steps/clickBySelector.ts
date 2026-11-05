import type { Step } from "../core/schema";
import type { Handler } from "./types";

// el.click() rather than a synthesised MouseEvent: the native method
// dispatches a real, bubbling click, which is what delegated handlers —
// React's root-level listener among them — are waiting for. Nothing here
// needs the native-setter trick writeValue() has to do for inputs.
//
// If the click leaves the page — a submit button, a link — the content
// script dies with it. The runner (see runner.ts) predicts that from the
// element itself via clickMayNavigate() and parks the rest of the routine
// *before* calling this handler, the same way openUrlInCurrentTab parks
// before navigating itself. A wrong prediction just leaves an unclaimed
// park to expire under RESUME_TTL_MS, same as any navigation that never
// lands — so this only needs to be a good guess, not a guarantee.
export const clickBySelector: Handler = async (step) => {
  if (step.type !== "clickBySelector") throw new Error("wrong handler");
  const el = document.querySelector(step.selector);
  if (!el) throw new Error(`No element for "${step.selector}"`);
  if (!(el instanceof HTMLElement)) {
    throw new Error(`Element "${step.selector}" is not clickable`);
  }
  el.click();
  return { note: `clicked "${step.selector}"` };
};

// Would clicking this step's element trigger the browser's own navigation —
// a real link, or a control that submits the form it lives in? Checked
// ahead of the click (not after) because the park has to land before the
// element is actually clicked, exactly like openUrlInCurrentTab's own park-
// then-navigate order.
export function clickMayNavigate(step: Step): boolean {
  if (step.type !== "clickBySelector") return false;
  const el = document.querySelector(step.selector);
  if (!(el instanceof HTMLElement)) return false;
  if (el instanceof HTMLAnchorElement) return el.href !== "";
  return el.closest("form") !== null && isSubmitControl(el);
}

function isSubmitControl(el: HTMLElement): boolean {
  if (el instanceof HTMLButtonElement) {
    return (el.getAttribute("type") ?? "submit").toLowerCase() === "submit";
  }
  if (el instanceof HTMLInputElement) {
    return el.type.toLowerCase() === "submit" || el.type.toLowerCase() === "image";
  }
  return false;
}
