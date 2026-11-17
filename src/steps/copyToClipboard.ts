import type { Handler } from "./types";
import { resolve } from "../core/context";

export const copyToClipboard: Handler = async (step, ctx) => {
  if (step.type !== "copyToClipboard") throw new Error("wrong handler");
  const value = resolve(step.value, ctx);
  await navigator.clipboard.writeText(value);
  return { note: `copied "${value}"` };
};
