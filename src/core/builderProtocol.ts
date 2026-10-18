// The messages the builder sends into a page, so a selector can be checked
// where it will actually be used. The options page is an extension page with no
// DOM of the site in it — it can only ask the content script, and there are two
// questions worth asking: how many elements match this selector, and which
// element did the user just click.
//
// Kept in core alongside background/protocol.ts (which covers the worker
// messages) so the two sides cannot drift on the `type` strings.

export const PROBE_MESSAGE_TYPE = "keystack-probe";
export const PICK_MESSAGE_TYPE = "keystack-pick";

export type ProbeRequest = { type: typeof PROBE_MESSAGE_TYPE; selector: string };

// `count` is what document.querySelectorAll found; `error` is a selector the
// browser refuses to parse, which is a different thing from no matches.
export type ProbeResponse = { count: number } | { error: string };

export type PickRequest = { type: typeof PICK_MESSAGE_TYPE };

// `selector` is absent when the user pressed Escape instead of clicking.
export type PickResponse = { selector: string | null } | { error: string };
