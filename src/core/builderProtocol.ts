import type { Stack } from "./schema";

// The messages the builder sends into a page, so a stack can be checked where
// it will actually run. The options page is an extension page with no DOM of
// the site in it — it can only ask the content script, and these are the three
// questions worth asking: how many elements match this selector, which element
// did the user just click, and what happens if we run this stack right now.
//
// Kept in core alongside background/protocol.ts (which covers the worker
// messages) so the two sides cannot drift on the `type` strings.

export const PROBE_MESSAGE_TYPE = "keystack-probe";
export const PICK_MESSAGE_TYPE = "keystack-pick";
export const TRY_MESSAGE_TYPE = "keystack-try";

export type ProbeRequest = { type: typeof PROBE_MESSAGE_TYPE; selector: string };

// `count` is what document.querySelectorAll found; `error` is a selector the
// browser refuses to parse, which is a different thing from no matches.
export type ProbeResponse = { count: number } | { error: string };

export type PickRequest = { type: typeof PICK_MESSAGE_TYPE };

// `selector` is absent when the user pressed Escape instead of clicking.
export type PickResponse = { selector: string | null } | { error: string };

// A draft stack, straight out of the builder and not necessarily saved — that
// is the point: a run is how you check an action before committing it to a
// hotkey.
export type TryRequest = { type: typeof TRY_MESSAGE_TYPE; stack: Stack };

// What became of each action, in the stack's own order. "skip" is every action
// after a failure: they never ran, and saying "skipped" is honest where a blank
// node would look like a success.
export type ActionOutcome = "ok" | "fail" | "skip";

export type ActionResult = { outcome: ActionOutcome; note: string };

export type TryResponse = { results: ActionResult[] } | { error: string };
