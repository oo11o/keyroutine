import type { Handler } from "./types";
import { resolve } from "../core/context";

// Pure context work, same as saveValue — no page, no network. Pulls a piece
// out of a larger value (a URL, a block of read text) without needing a
// selector for it: "orders/(\d+)/edit" against $url, saved as the id alone.
export const regexExtract: Handler = async (step, ctx) => {
  if (step.type !== "regexExtract") throw new Error("wrong handler");
  const input = resolve(step.input, ctx);
  let re: RegExp;
  try {
    re = new RegExp(step.pattern);
  } catch (e) {
    throw new Error(`"${step.pattern}" is not a valid regular expression: ${(e as Error).message}`);
  }
  const match = re.exec(input);
  if (!match) throw new Error(`"${step.pattern}" did not match`);
  // Left blank, group 1 is the natural answer whenever the pattern bothered
  // to capture one — that capture is almost always the point of writing the
  // pattern at all, same as "$url" is the point of reading an element rather
  // than its raw text.
  const index = step.group ?? (match.length > 1 ? 1 : 0);
  const value = match[index];
  if (value === undefined) throw new Error(`group ${index} is not in "${step.pattern}"`);
  return { value, note: `matched "${value}"` };
};
