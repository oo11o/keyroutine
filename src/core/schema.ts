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
  | { id: string; type: "saveValue"; value: string; saveAs?: string }
  | { id: string; type: "regexExtract"; input: string; pattern: string; group?: number; saveAs?: string }
  | { id: string; type: "inputToSelector"; selector: string; value: string }
  // Matches value against an <option>'s value or its visible text — see
  // page/dom.ts's selectOption.
  | { id: string; type: "selectOption"; selector: string; value: string }
  | { id: string; type: "focusBySelector"; selector: string }
  | { id: string; type: "clickBySelector"; selector: string }
  // Goes to whatever has focus — pair with focusBySelector to aim it.
  | { id: string; type: "pressKey"; key: string }
  | { id: string; type: "wait"; ms: number }
  | { id: string; type: "waitForSelector"; selector: string; timeoutMs: number }
  | { id: string; type: "popup"; title?: string; body: string }
  | { id: string; type: "popupJson"; title?: string; body: string }
  // Pauses for a line of text typed into an in-page panel. Esc/Cancel/×
  // stops the routine here — see promptInput's StepResult.stop in
  // steps/types.ts.
  | { id: string; type: "promptInput"; title?: string; body: string; saveAs?: string }
  | { id: string; type: "openUrlInNewTab"; url: string }
  | { id: string; type: "openUrlInCurrentTab"; url: string }
  | { id: string; type: "fetchUrl"; url: string; saveAs?: string }
  // Re-runs whatever routine last ran on this host — see
  // content/lastRoutine.ts and steps/repeatLastRoutine.ts. No fields: there
  // is nothing to configure, it always means "that, again."
  | { id: string; type: "repeatLastRoutine" };

// A domain. Routines point at one of these to stop being global — which
// page(s) of it they fire on is the routine's own `pages`, not the site's:
// one host can carry several routines, each scoped to a different page, and
// a site itself only ever answers "which domain."
export type Site = {
  id: string;
  name: string; // "test.example.com", "partner-api" — the label shown in the builder
  host: string; // "test.example.com" — no scheme, no path
  includeSubdomains: boolean; // true: also every *.host
};

export type Routine = {
  id: string;
  name: string;
  binding: Binding;
  enabled: boolean;
  steps: Step[]; // array from day one, even though v0 runs exactly one
  // Which site this routine belongs to; absent or null means "common" — it
  // applies everywhere. One site, not a list: a site-scoped routine beats a
  // common one on the same chord, and that precedence is only decidable
  // while each routine has a single owner.
  siteId?: string | null;
  // Which page(s) of that site it fires on; empty means every page of it.
  // Several entries is one routine answering to more than one page — not a
  // list of sites, since the site is already fixed by siteId.
  pages: string[];
};

export const SCHEMA_VERSION = 3;

export type Config = {
  schemaVersion: typeof SCHEMA_VERSION;
  routines: Routine[];
  sites: Site[];
};

export type ToastVerbosity = "none" | "min" | "max";

export type Settings = {
  debug: boolean; // gates the "[KeyRoutine] chord -> routine" console.log
  toast: ToastVerbosity; // "none": no toast. "min": chord + name (+ reason on failure). "max": full step list
};

export const DEFAULT_SETTINGS: Settings = { debug: false, toast: "max" };
