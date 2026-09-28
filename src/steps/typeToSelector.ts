import type { Handler } from "./types";
import { resolve } from "../core/context";
import { typeValue } from "../page/dom";

// inputToSelector's sibling for fields that ignore a value they were simply
// given. Same fields, same templating; the difference is entirely in how the
// value arrives — one assignment versus a full key sequence per character.
//
// Reach for this only when inputToSelector leaves the field looking filled
// but the page behaving as though it is empty: a masked input that never
// reformats, a search box whose dropdown never opens, a form whose submit
// button stays disabled.
export const typeToSelector: Handler = async (step, ctx) => {
  if (step.type !== "typeToSelector") throw new Error("wrong handler");
  const el = document.querySelector(step.selector);
  if (!el) throw new Error(`No element for "${step.selector}"`);
  if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) {
    throw new Error(`Element "${step.selector}" is not an input or textarea`);
  }
  const value = resolve(step.value, ctx);
  typeValue(el, value);
  return { note: `typed into "${step.selector}"` };
};
