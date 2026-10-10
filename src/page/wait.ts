// Waiting — for the clock, or for the DOM to catch up. Touches `document`,
// so it lives in page/ alongside dom.ts and keyboard.ts.

// The caps live in core/limits.ts, where the builder form can read them
// without importing a DOM-touching module. Re-exported here so handlers keep
// importing their waiting policy from the same place as their waiting code.
export { MAX_WAIT_MS, DEFAULT_TIMEOUT_MS } from "../core/limits";

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Resolves once the selector matches, or rejects when the budget runs out.
// Polls rather than using a MutationObserver: a framework can swap a whole
// subtree in one mutation and the element the stack wants may arrive in a
// later paint anyway, so "look again shortly" is both simpler and no less
// correct. Checks once up front, so an element already present costs nothing.
export async function waitForElement(
  selector: string,
  timeoutMs: number,
  pollMs = 50
): Promise<Element> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const el = document.querySelector(selector);
    if (el) return el;
    if (Date.now() >= deadline) {
      throw new Error(`Timed out after ${timeoutMs}ms waiting for "${selector}"`);
    }
    await sleep(pollMs);
  }
}
