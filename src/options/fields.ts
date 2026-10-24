import { h } from "./el";
import { icon } from "./icons";
import type { FieldSpec } from "../core/stepMeta";
import type { AvailableVar } from "../core/vars";
import { referencedVars } from "../core/vars";
import * as probe from "./probe";

// One FieldSpec becomes one labelled control. Every action form in the builder
// is this function in a loop — which is the point of core/stepMeta.ts: a new
// step type gets a working editor without a line of UI written for it.
//
// Three shapes, because three different things go wrong in them. A selector is
// wrong when the page has no such element, so it gets Pick and Test. A template
// is wrong when it names a variable nothing produces, so it gets the list of
// variables that exist at that point. Everything else is just a value.

const MULTILINE: FieldSpec["kind"][] = ["multiline"];
// Values that routinely outrun the width of the column: a URL with a query
// string, a selector with three attributes. In a one-line input the text
// scrolls sideways under the caret, so editing the middle of a URL hides both
// of its ends. These wrap and grow the box instead — the field moves, the
// value does not.
const WRAPPED: FieldSpec["kind"][] = ["selector", "url", "template"];
const INTERPOLATED: FieldSpec["kind"][] = ["template", "url", "multiline"];
const MONO: FieldSpec["kind"][] = ["selector", "url", "template", "multiline", "key", "varName"];

export type FieldContext = {
  value: unknown;
  onChange(value: string): void;
  // Only consulted for interpolated fields, and lazily — the list depends on
  // where the action sits, which can change while the form is open.
  vars(): AvailableVar[];
  // Identifies this field's selector test (see options/probe.ts). Results are
  // per field, not per action: an action can have two selectors.
  testKey: string;
};

export function renderField(spec: FieldSpec, ctx: FieldContext): HTMLElement {
  const field = h("div", { class: "field" });
  const id = `f-${spec.name}`;
  field.append(h("label", { class: "label", for: id, text: spec.label }));

  const current = ctx.value === undefined || ctx.value === null ? "" : String(ctx.value);
  const mono = MONO.includes(spec.kind) ? "input mono" : "input";
  const input = MULTILINE.includes(spec.kind)
    ? h("textarea", { id, class: mono, value: current, placeholder: spec.placeholder ?? "", rows: 6 })
    : WRAPPED.includes(spec.kind)
    ? oneLineBox(id, mono, current, spec.placeholder ?? "")
    : h("input", {
        id,
        class: mono,
        type: spec.kind === "number" ? "number" : "text",
        value: current,
        placeholder: spec.placeholder ?? "",
        min: spec.min,
        max: spec.max
      });

  const problem = h("div", { class: "errtext", hidden: true });

  // Two different wrongs share one red border: a value that breaks the field's
  // own rules, and a $name nothing produces. The second is spelled out next to
  // the chips that fix it rather than here, but the input still has to look it.
  const check = (): void => {
    const message = validate(spec, input.value);
    problem.textContent = message ?? "";
    problem.hidden = message === null;
    const unknown =
      INTERPOLATED.includes(spec.kind) && unknownIn(input.value, ctx.vars()).length > 0;
    input.classList.toggle("is-err", message !== null || unknown);
  };

  input.addEventListener("input", () => {
    ctx.onChange(input.value);
    check();
  });

  if (spec.kind === "selector") {
    // A test result is about one spelling of the selector; editing it makes the
    // result a statement about the past.
    input.addEventListener("input", () => probe.forgetTest(ctx.testKey));
    field.append(selectorControls(input, ctx));
    field.append(problem);
    const result = probe.testResult(ctx.testKey);
    if (result) field.append(matchPill(result));
    field.append(h("span", { class: "hint", text: spec.help ?? "" }));
    check();
    return field;
  }

  field.append(input, problem);

  if (INTERPOLATED.includes(spec.kind)) field.append(variableRow(input, ctx));

  if (spec.help) field.append(h("span", { class: "hint", text: spec.help }));
  check();
  return field;
}

/* ── selectors ─────────────────────────────────────────────────────────── */

// A textarea pretending to be a single-line field: it wraps, and `field-sizing`
// grows it to whatever it holds. The pretence has to be kept up at the two
// places a textarea would otherwise show through — Enter, which here means
// nothing, and a pasted newline, which would be stored in the value.
function oneLineBox(
  id: string,
  cls: string,
  value: string,
  placeholder: string
): HTMLTextAreaElement {
  const box = h("textarea", { id, class: `${cls} wrapbox`, value, placeholder, rows: 1 });
  box.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Enter") e.preventDefault();
  });
  box.addEventListener("input", () => {
    if (!box.value.includes("\n")) return;
    const caret = box.selectionStart;
    box.value = box.value.replace(/\r?\n/g, "");
    box.setSelectionRange(caret, caret);
  });
  return box;
}

function selectorControls(input: HTMLInputElement | HTMLTextAreaElement, ctx: FieldContext): HTMLElement {
  // Picking means the user is on the other tab, so the label says so until they
  // come back. Testing is a round trip measured in milliseconds and needs no
  // such ceremony — but neither should start while the other is in flight.
  const picking = probe.isBusy(`pick:${ctx.testKey}`);
  const testing = probe.isBusy(`test:${ctx.testKey}`);
  return h(
    "div",
    { class: "fieldrow" },
    input,
    h(
      "button",
      {
        type: "button",
        class: "btn",
        disabled: picking || testing,
        onClick: () =>
          void probe.pickSelector(ctx.testKey, (selector) => ctx.onChange(selector))
      },
      icon("crosshair", 16),
      picking ? "Waiting for your click…" : "Pick"
    ),
    h("button", {
      type: "button",
      class: "btn",
      text: testing ? "Testing…" : "Test",
      disabled: picking || testing,
      onClick: () => void probe.testSelector(ctx.testKey, input.value)
    })
  );
}

// How many elements the selector hit, on the page the user is actually working
// on. One is the answer they want; the other two are the two ways a selector is
// wrong, and they are worth different words.
function matchPill(result: probe.TestResult): HTMLElement {
  if ("error" in result) {
    return h("span", { class: "res res-err" }, icon("close", 14), result.error);
  }
  if (result.count === 1) {
    return h("span", { class: "res res-ok" }, icon("check", 14), "1 match on this page");
  }
  if (result.count === 0) {
    return h("span", { class: "res res-err" }, icon("close", 14), "Nothing on this page matches");
  }
  return h(
    "span",
    { class: "res res-warn" },
    icon("warn", 14),
    `${result.count} matches — make the selector more specific`
  );
}

/* ── variables ─────────────────────────────────────────────────────────── */

function unknownIn(value: string, vars: AvailableVar[]): string[] {
  const known = new Set(vars.map((v) => v.name));
  return referencedVars(value).filter((name) => !known.has(name));
}

// The variables that exist by the time this action runs, as chips that insert
// themselves. It replaces remembering that the fetch two actions up was called
// "response" — which is exactly the kind of thing a builder should know on the
// user's behalf.
function variableRow(
  input: HTMLInputElement | HTMLTextAreaElement,
  ctx: FieldContext
): HTMLElement {
  const available = ctx.vars();
  const unknown = unknownIn(input.value, available);
  const wrap = h("div", { class: "field" });

  if (unknown.length > 0) {
    wrap.append(
      h("span", {
        class: "errtext",
        text: `$${unknown[0]} isn't set by any action above. Pick one of the variables below.`
      })
    );
  }

  const row = h("div", { class: "varrow" }, h("span", { class: "hint", text: "Available here:" }));
  if (available.length === 0) {
    row.append(
      h("span", {
        class: "hint",
        text: "nothing yet — actions above that return a result add variables here."
      })
    );
  }
  for (const v of available) {
    row.append(
      h("button", {
        type: "button",
        class: "varchip mono",
        text: `$${v.name}`,
        title: v.note,
        "aria-label": `Insert $${v.name}`,
        onClick: () => insertAtCaret(input, `$${v.name}`)
      })
    );
  }
  wrap.append(row);
  return wrap;
}

// Inserts at the caret rather than appending: a URL is usually edited in the
// middle, and the value belongs where the cursor is.
function insertAtCaret(input: HTMLInputElement | HTMLTextAreaElement, text: string): void {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? start;
  input.value = input.value.slice(0, start) + text + input.value.slice(end);
  const caret = start + text.length;
  input.setSelectionRange(caret, caret);
  input.focus();
  // The field's own listener is what writes to the draft, so the edit has to
  // look like typing.
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

/* ── per-field rules ───────────────────────────────────────────────────── */

// Per-field feedback as you type. The authority is still core/configStore.ts's
// parseConfig at save time — this is the same rules, said earlier and next to
// the thing that is wrong. Unknown $vars are deliberately not here: they are
// reported next to the chips that fix them.
function validate(spec: FieldSpec, value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === "") return spec.required ? `${spec.label} is required` : null;

  if (spec.kind === "number") {
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return "must be a number";
    if (spec.min !== undefined && n < spec.min) return `must be at least ${spec.min}`;
    if (spec.max !== undefined && n > spec.max) return `capped at ${spec.max}`;
    return null;
  }

  if (spec.kind === "varName" && !/^\w+$/.test(trimmed)) {
    // $my-var would resolve as $my — core/context.ts's regex is \w+.
    return "letters, digits and _ only, so it can be used as $name";
  }

  if (spec.kind === "url") {
    // The template is checked, not the result: $vars are unknown until the
    // routine runs, so anything but a clearly wrong scheme has to be allowed.
    const looksTemplated = referencedVars(value).length > 0;
    if (!looksTemplated && !/^https?:\/\//i.test(trimmed)) return "must start with http:// or https://";
    if (looksTemplated && !/^(https?:\/\/|\$)/i.test(trimmed)) {
      return "must start with http:// or https:// (or a $value that supplies it)";
    }
  }

  return null;
}
