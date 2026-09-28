import type { Handler } from "./types";
import { MAX_WAIT_MS, sleep } from "../page/wait";

// A flat pause. Prefer waitForSelector when what you are actually waiting
// for is an element — a fixed delay is a guess that is either too short on
// a slow day or wasted time on a fast one.
export const wait: Handler = async (step) => {
  if (step.type !== "wait") throw new Error("wrong handler");
  const ms = step.ms;
  if (!Number.isFinite(ms) || ms < 0) throw new Error(`wait needs a positive ms, got ${ms}`);
  if (ms > MAX_WAIT_MS) throw new Error(`wait is capped at ${MAX_WAIT_MS}ms, got ${ms}`);
  await sleep(ms);
  return { note: `waited ${ms}ms` };
};
