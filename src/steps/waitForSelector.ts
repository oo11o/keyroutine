import type { Handler } from "./types";
import { waitForElement } from "../page/dom";
import { MAX_WAIT_MS } from "../page/wait";

// Polls for an element to show up instead of guessing a fixed delay — the
// right tool when a page's render time varies and `wait` would need either
// a timeout-sized guess or constant retuning.
export const waitForSelector: Handler = async (step) => {
  if (step.type !== "waitForSelector") throw new Error("wrong handler");
  const { timeoutMs } = step;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0) {
    throw new Error(`waitForSelector needs a positive timeoutMs, got ${timeoutMs}`);
  }
  if (timeoutMs > MAX_WAIT_MS) {
    throw new Error(`waitForSelector is capped at ${MAX_WAIT_MS}ms, got ${timeoutMs}`);
  }
  await waitForElement(step.selector, timeoutMs);
  return { note: `found "${step.selector}"` };
};
