import type { Handler } from "./types";
import { DEFAULT_TIMEOUT_MS, MAX_WAIT_MS, waitForElement } from "../page/wait";

// Blocks the stack until the element exists. This is what makes a stack
// survive a page that renders after it loads: the content script starts at
// document_idle, which says the HTML is parsed, not that a framework has
// finished mounting. Without this, a step aimed at a client-rendered form
// fails with "No element for ..." purely because it arrived first.
//
// Waits for presence in the DOM, not visibility — an element can be there
// and still be hidden behind a spinner.
export const waitForSelector: Handler = async (step) => {
  if (step.type !== "waitForSelector") throw new Error("wrong handler");
  const timeout = step.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(timeout) || timeout <= 0) {
    throw new Error(`waitForSelector needs a positive timeoutMs, got ${timeout}`);
  }
  if (timeout > MAX_WAIT_MS) {
    throw new Error(`waitForSelector is capped at ${MAX_WAIT_MS}ms, got ${timeout}`);
  }
  const started = Date.now();
  await waitForElement(step.selector, timeout);
  return { note: `waited ${Date.now() - started}ms for "${step.selector}"` };
};
