// Types now, so v0.2+ doesn't need a rewrite — see .claude/plan/plan.md.

export type Binding = {
  code: string; // KeyboardEvent.code, e.g. "Digit1" — NOT .key (layout-independent)
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
};

export type Step =
  | { id: string; type: "readBySelector"; selector: string; saveAs?: string }
  | { id: string; type: "inputToSelector"; selector: string; value: string }
  | { id: string; type: "focusBySelector"; selector: string }
  | { id: string; type: "clickBySelector"; selector: string }
  // Goes to whatever has focus — pair with focusBySelector to aim it.
  | { id: string; type: "pressKey"; key: string }
  | { id: string; type: "wait"; ms: number }
  | { id: string; type: "popup"; title?: string; body: string }
  | { id: string; type: "popupJson"; title?: string; body: string }
  | { id: string; type: "openUrlInNewTab"; url: string }
  | { id: string; type: "openUrlInCurrentTab"; url: string }
  | { id: string; type: "fetchUrl"; url: string; saveAs?: string };

// A named set of URL patterns. Stacks point at one of these to stop being
// global — see core/match.ts for what a pattern may look like.
export type Site = {
  id: string;
  name: string; // "test.example.com", "partner-api" — the label shown in the builder
  patterns: string[]; // ["https://test.example.com/*", "*://*.partner-api.com/*"]
};

export type Stack = {
  id: string;
  name: string;
  binding: Binding;
  enabled: boolean;
  steps: Step[]; // array from day one, even though v0 runs exactly one
  // Which site this stack belongs to; absent or null means "common" — it
  // applies everywhere. One site, not a list: a site-scoped stack beats a
  // common one on the same chord, and that precedence is only decidable
  // while each stack has a single owner.
  siteId?: string | null;
};

export const SCHEMA_VERSION = 2;

export type Config = {
  schemaVersion: typeof SCHEMA_VERSION;
  stacks: Stack[];
  sites: Site[];
};

export type ToastVerbosity = "none" | "min" | "max";

export type Settings = {
  debug: boolean; // gates the "[Keystack] chord -> stack" console.log
  toast: ToastVerbosity; // "none": no toast. "min": chord + name (+ reason on failure). "max": full step list
};

export const DEFAULT_SETTINGS: Settings = { debug: false, toast: "max" };
