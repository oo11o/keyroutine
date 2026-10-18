import type { Handler } from "./types";
import { pressKeyAtFocus } from "../page/keyboard";

// Presses one key — "Enter", "Tab", "Escape", "ArrowDown" — at whatever has
// focus. No selector of its own: pair it with focusBySelector when the key
// needs a particular target, which keeps each step one verb.
//
// This presses a key; it does not type text. A printable character sent here
// fires the key events but inserts nothing, because these are untrusted
// events and never carry default browser behaviour. Use inputToSelector to
// put text in a field, and this for the keys that mean something to a page's
// own handlers — submitting on Enter, opening a dropdown, closing a modal.
//
// That same untrusted-ness is the limit worth knowing: "Enter" reaches a
// page's keydown handler, but it will not submit a form the way a real
// Enter does. If the form has no key handler, click its submit button.
export const pressKey: Handler = async (step) => {
  if (step.type !== "pressKey") throw new Error("wrong handler");
  if (!step.key) throw new Error("pressKey needs a key, e.g. \"Enter\"");
  const target = document.activeElement;
  pressKeyAtFocus(step.key);
  const where = target instanceof HTMLElement && target !== document.body ? "" : " (nothing focused)";
  return { note: `pressed "${step.key}"${where}` };
};
