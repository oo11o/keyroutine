import type { Step } from "./schema";
import { DEFAULT_TIMEOUT_MS, MAX_WAIT_MS } from "./limits";

// What each step type looks like *as a form*. Until now a step's parameters
// existed only as an arm of the `Step` union plus prose comments, and their
// rules only as imperative checks inside the handler — neither of which a UI
// can read. This is the machine-readable half, and the single place a new step
// type registers itself with the builder.
//
// It does not replace the handlers' own validation: a step can arrive from an
// imported JSON file that never went through a form, so the handler stays the
// last word. What this buys is catching the mistake while it is being made.

// How the field is edited and how it is read back.
//   selector  — a CSS selector; text input, no $vars (a selector is structure,
//               not data, and no step resolves one through a template today)
//   text      — a short literal
//   template  — short text that may contain $vars
//   url       — a template that must end up an http(s) URL
//   multiline — a textarea that may contain $vars (popup bodies)
//   number    — coerced to a number, bounded by min/max
//   key       — a KeyboardEvent.key name, e.g. "Enter"
//   varName   — the name a value is stored under, so \w+ only (it is read back
//               as $<name>, and core/context.ts's template regex is \w+)
export type FieldKind =
  | "selector"
  | "text"
  | "template"
  | "url"
  | "multiline"
  | "number"
  | "key"
  | "varName";

export type FieldSpec = {
  name: string;
  label: string;
  kind: FieldKind;
  required: boolean;
  // Collapsed behind the form's "advanced" disclosure. Optional-and-rarely-set
  // rather than merely optional: a popup's title is advanced, a saveAs name is
  // advanced, but nothing required ever is.
  advanced?: boolean;
  placeholder?: string;
  help?: string;
  default?: string | number;
  min?: number;
  max?: number;
};

export type StepGroup = "read" | "write" | "wait" | "show" | "navigate";

export type StepMeta = {
  label: string;
  group: StepGroup;
  help: string;
  // True when the step feeds the context: the runner binds $value, $<step.id>
  // and $<saveAs> from its result (see content/runner.ts). The builder uses
  // this to work out which $vars a later step may reference.
  produces: boolean;
  // One line for the step list. Must tolerate a half-filled step — the
  // builder renders it while the user is still typing.
  summary(step: Step): string;
  fields: FieldSpec[];
};

// Reads a field off a step without the union narrowing every call site: the
// builder edits steps generically, and a step being built is legitimately
// incomplete.
function field(step: Step, name: string): unknown {
  return (step as unknown as Record<string, unknown>)[name];
}

function text(step: Step, name: string, fallback = "…"): string {
  const value = field(step, name);
  return value === undefined || value === "" ? fallback : String(value);
}

const selectorField: FieldSpec = {
  name: "selector",
  label: "Selector",
  kind: "selector",
  required: true,
  placeholder: "#tender_id",
  help: "CSS selector, as DevTools › Copy › Copy selector gives it."
};

const saveAsField: FieldSpec = {
  name: "saveAs",
  label: "Save as",
  kind: "varName",
  required: false,
  advanced: true,
  placeholder: "tender",
  help: "A name for the result, used later as $<name>. The step is always reachable as $<its id> anyway."
};

const titleField: FieldSpec = {
  name: "title",
  label: "Title",
  kind: "template",
  required: false,
  advanced: true,
  placeholder: "Sync result"
};

// Record<Step["type"], …> on purpose: adding an arm to the union without
// adding an entry here is a compile error, the same discipline steps/index.ts
// uses for handlers.
export const STEP_META: Record<Step["type"], StepMeta> = {
  readBySelector: {
    label: "Read element",
    group: "read",
    help: "Reads an element's value or text into the context, without touching the clipboard.",
    produces: true,
    summary: (s) => `read ${text(s, "selector")}`,
    fields: [selectorField, saveAsField]
  },
  copyBySelector: {
    label: "Copy element to clipboard",
    group: "read",
    help: "Reads an element and writes it to the system clipboard. Produces nothing the stack can read back.",
    produces: false,
    summary: (s) => `copy ${text(s, "selector")}`,
    fields: [selectorField]
  },
  fetchUrl: {
    label: "Fetch URL",
    group: "read",
    help: "Requests a URL through the service worker, so the page's CORS rules do not apply. JSON comes back pretty-printed. One request at a time.",
    produces: true,
    summary: (s) => `fetch ${text(s, "url")}`,
    fields: [
      {
        name: "url",
        label: "URL",
        kind: "url",
        required: true,
        placeholder: "https://api.example.com/items/$s1",
        help: "http(s) only. Each substituted value is URL-encoded, so a value with & cannot add a parameter."
      },
      saveAsField
    ]
  },
  inputToSelector: {
    label: "Set field value",
    group: "write",
    help: "Sets an input's value through the native setter and fires input/change, so React-style forms notice. Instant — use Type text when the page watches individual keystrokes.",
    produces: false,
    summary: (s) => `set ${text(s, "selector")} = ${text(s, "value", '""')}`,
    fields: [
      selectorField,
      {
        name: "value",
        label: "Value",
        kind: "template",
        required: true,
        placeholder: "$s1"
      }
    ]
  },
  typeToSelector: {
    label: "Type text",
    group: "write",
    help: "Types character by character with real key events. Slower than Set field value, but it is what a page driving autocomplete off keydown expects.",
    produces: false,
    summary: (s) => `type ${text(s, "value", '""')} into ${text(s, "selector")}`,
    fields: [
      selectorField,
      {
        name: "value",
        label: "Text",
        kind: "template",
        required: true,
        placeholder: "$secret_email"
      }
    ]
  },
  focusBySelector: {
    label: "Focus element",
    group: "write",
    help: "Puts the keyboard focus on an element — pair it with Press key, which goes to whatever has focus.",
    produces: false,
    summary: (s) => `focus ${text(s, "selector")}`,
    fields: [selectorField]
  },
  clickBySelector: {
    label: "Click element",
    group: "write",
    help: "Clicks an element. If the click navigates away, the rest of the stack is lost — put a Wait for element on the next page instead of assuming.",
    produces: false,
    summary: (s) => `click ${text(s, "selector")}`,
    fields: [selectorField]
  },
  pressKey: {
    label: "Press key",
    group: "write",
    help: "Sends one key to whatever currently has focus. Aim it with Focus element first.",
    produces: false,
    summary: (s) => `press ${text(s, "key")}`,
    fields: [
      {
        name: "key",
        label: "Key",
        kind: "key",
        required: true,
        placeholder: "Enter",
        help: "A KeyboardEvent.key name: Enter, Escape, Tab, ArrowDown, a…"
      }
    ]
  },
  wait: {
    label: "Wait (fixed)",
    group: "wait",
    help: "A flat pause. Prefer Wait for element — a fixed delay is a guess that is either too short on a slow day or wasted time on a fast one.",
    produces: false,
    summary: (s) => `wait ${text(s, "ms", "?")}ms`,
    fields: [
      {
        name: "ms",
        label: "Milliseconds",
        kind: "number",
        required: true,
        placeholder: "500",
        min: 0,
        max: MAX_WAIT_MS
      }
    ]
  },
  waitForSelector: {
    label: "Wait for element",
    group: "wait",
    help: "Blocks until the element exists in the DOM. This is what makes a stack survive a page that renders after it loads.",
    produces: false,
    summary: (s) => `wait for ${text(s, "selector")}`,
    fields: [
      selectorField,
      {
        name: "timeoutMs",
        label: "Timeout (ms)",
        kind: "number",
        required: false,
        advanced: true,
        default: DEFAULT_TIMEOUT_MS,
        min: 1,
        max: MAX_WAIT_MS,
        help: `Fails the step if the element never appears. Defaults to ${DEFAULT_TIMEOUT_MS}.`
      }
    ]
  },
  popup: {
    label: "Show popup",
    group: "show",
    help: "An in-page panel that blocks the stack until dismissed, so a popup mid-stack is a checkpoint. On success it replaces the toast.",
    produces: false,
    summary: (s) => `popup ${text(s, "title", text(s, "body"))}`,
    fields: [
      titleField,
      {
        name: "body",
        label: "Body",
        kind: "multiline",
        required: true,
        placeholder: "$syncResult"
      }
    ]
  },
  popupJson: {
    label: "Show popup (JSON)",
    group: "show",
    help: "The same panel with a live, path-aware line filter — for bodies that run to hundreds of lines.",
    produces: false,
    summary: (s) => `popup json ${text(s, "title", text(s, "body"))}`,
    fields: [
      titleField,
      {
        name: "body",
        label: "Body",
        kind: "multiline",
        required: true,
        placeholder: "$tender"
      }
    ]
  },
  openUrlInNewTab: {
    label: "Open URL in a new tab",
    group: "navigate",
    help: "Opens a tab and leaves this page alone, so the rest of the stack keeps running here.",
    produces: false,
    summary: (s) => `open ${text(s, "url")} in a new tab`,
    fields: [
      {
        name: "url",
        label: "URL",
        kind: "url",
        required: true,
        placeholder: "https://example.com/t/$s1"
      }
    ]
  },
  openUrlInCurrentTab: {
    label: "Go to URL (this tab)",
    group: "navigate",
    help: "Leaves this page. The rest of the stack is parked and picked up by the next page in this tab, within 15 seconds.",
    produces: false,
    summary: (s) => `go to ${text(s, "url")}`,
    fields: [
      {
        name: "url",
        label: "URL",
        kind: "url",
        required: true,
        placeholder: "http://dzo.lh/cabinet/logout"
      }
    ]
  }
};

// The order the "Add step" menu offers, and the heading each group gets.
export const STEP_GROUPS: { group: StepGroup; label: string }[] = [
  { group: "read", label: "Read" },
  { group: "write", label: "Act on the page" },
  { group: "wait", label: "Wait" },
  { group: "show", label: "Show" },
  { group: "navigate", label: "Navigate" }
];

export function isStepType(type: unknown): type is Step["type"] {
  return typeof type === "string" && Object.prototype.hasOwnProperty.call(STEP_META, type);
}

export const STEP_TYPES = Object.keys(STEP_META) as Step["type"][];

// Fields whose value may contain $vars — where the builder shows the variable
// picker, and what the unknown-variable check has to look at.
export function templateFields(type: Step["type"]): FieldSpec[] {
  return STEP_META[type].fields.filter(
    (f) => f.kind === "template" || f.kind === "url" || f.kind === "multiline"
  );
}

// A new step of this type, with every default filled in and nothing else.
// Ids are the caller's business — only it knows which are taken.
export function blankStep(type: Step["type"], id: string): Step {
  const step: Record<string, unknown> = { id, type };
  for (const f of STEP_META[type].fields) {
    if (f.default !== undefined) step[f.name] = f.default;
    else if (f.required) step[f.name] = f.kind === "number" ? 0 : "";
  }
  return step as unknown as Step;
}
