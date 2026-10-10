// Numeric policy shared by a step handler and the builder form that edits it.
// Here rather than in page/wait.ts because core/ must stay DOM-free: the
// builder (an extension page) and core/stepMeta.ts both need these numbers,
// and neither should have to import a module that touches `document`.
// page/wait.ts re-exports them, so the handlers' imports are unchanged.

// Nothing in a hotkey macro should block the page for minutes: a typo like
// 600000 would otherwise wedge the stack with no way out but a reload.
export const MAX_WAIT_MS = 30_000;
export const DEFAULT_TIMEOUT_MS = 5_000;
