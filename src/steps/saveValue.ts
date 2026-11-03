import type { Handler } from "./types";
import { resolve } from "../core/context";

// Pure context work — no page, no network. Lets a routine stash a literal
// or a combination of earlier $vars under a name of its own, so a later
// action can read it back as $value / $<saveAs> without repeating the
// template that built it.
export const saveValue: Handler = async (step, ctx) => {
  if (step.type !== "saveValue") throw new Error("wrong handler");
  const value = resolve(step.value, ctx);
  return { value, note: `saved "${value}"` };
};
