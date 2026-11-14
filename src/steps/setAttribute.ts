import type { Handler } from "./types";
import { resolve } from "../core/context";

export const setAttribute: Handler = async (step, ctx) => {
  if (step.type !== "setAttribute") throw new Error("wrong handler");
  const el = document.querySelector(step.selector);
  if (!el) throw new Error(`No element for "${step.selector}"`);
  // An optional field left blank is omitted entirely by the builder and by
  // configStore.ts (see patchStep/parseStep), not stored as "" — both mean
  // the same thing here: remove the attribute.
  const value = step.value === undefined ? "" : resolve(step.value, ctx);
  if (value === "") {
    el.removeAttribute(step.attribute);
    return { note: `removed "${step.attribute}" from "${step.selector}"` };
  }
  el.setAttribute(step.attribute, value);
  return { note: `${step.attribute}="${value}" on "${step.selector}"` };
};
