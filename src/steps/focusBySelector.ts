import type { Handler } from "./types";

// Puts the caret in a field without writing anything to it. inputToSelector
// and writeValue() deliberately never focus — they set the value and fire
// input/change — which is enough for most pages but not for one that only
// starts validating a field after it has been focused, or that shows its
// autocomplete on focus rather than on keystroke.
//
// Focusing something unfocusable is silently a no-op in the DOM, so this
// checks afterwards rather than reporting a success that did not happen.
export const focusBySelector: Handler = async (step) => {
  if (step.type !== "focusBySelector") throw new Error("wrong handler");
  const el = document.querySelector(step.selector);
  if (!el) throw new Error(`No element for "${step.selector}"`);
  if (!(el instanceof HTMLElement)) {
    throw new Error(`Element "${step.selector}" cannot be focused`);
  }
  el.focus();
  if (document.activeElement !== el) {
    throw new Error(`Element "${step.selector}" did not take focus (is it disabled or hidden?)`);
  }
  return { note: `focused "${step.selector}"` };
};
