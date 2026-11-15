import type { Handler } from "./types";
import { resolve } from "../core/context";

export const setText: Handler = async (step, ctx) => {
  if (step.type !== "setText") throw new Error("wrong handler");
  const el = document.querySelector(step.selector);
  if (!el) throw new Error(`No element for "${step.selector}"`);
  const value = resolve(step.value, ctx);
  el.textContent = value;
  return { note: `"${value}" → "${step.selector}"` };
};
