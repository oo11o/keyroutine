// Waiting on the clock.

// The cap lives in core/limits.ts, where the builder form can read it
// without importing a DOM-touching module. Re-exported here so handlers keep
// importing their waiting policy from the same place as their waiting code.
export { MAX_WAIT_MS } from "../core/limits";

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
