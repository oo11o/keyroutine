import type { Handler } from "./types";
import { resolve } from "../core/context";
import { showPromptInput } from "../ui/promptInput";

export const promptInput: Handler = async (step, ctx) => {
  if (step.type !== "promptInput") throw new Error("wrong handler");
  // The title falls back to the running routine's name, same as popup.
  const title = resolve(step.title ?? "$routineName", ctx);
  const body = resolve(step.body, ctx);
  const value = await showPromptInput(title, body); // blocks until answered
  if (value === null) return { stop: true, note: `${body}: cancelled` };
  return { value, note: `${body}: ${value}` };
};
