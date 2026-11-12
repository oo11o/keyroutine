import type { Handler } from "./types";
import { resolve } from "../core/context";
import { selectOption } from "../page/dom";

export const selectOptionStep: Handler = async (step, ctx) => {
  if (step.type !== "selectOption") throw new Error("wrong handler");
  const el = document.querySelector(step.selector);
  if (!el) throw new Error(`No element for "${step.selector}"`);
  if (!(el instanceof HTMLSelectElement)) {
    throw new Error(`Element "${step.selector}" is not a <select>`);
  }
  const match = resolve(step.value, ctx);
  const option = selectOption(el, match);
  return { note: `chose "${option.text.trim()}" in "${step.selector}"` };
};
