import { h } from "./el";
import type { FieldSpec } from "../core/stepMeta";
import type { AvailableVar } from "../core/vars";
import { referencedVars } from "../core/vars";
import { varButton } from "./varPicker";

// One FieldSpec becomes one labelled control. Every step form in the builder is
// this function in a loop — which is the point of core/stepMeta.ts: a new step
// type gets a working editor without a line of UI written for it.

const MULTILINE: FieldSpec["kind"][] = ["multiline"];
const INTERPOLATED: FieldSpec["kind"][] = ["template", "url", "multiline"];
const MONO: FieldSpec["kind"][] = ["selector", "url", "template", "multiline", "key", "varName"];

export type FieldContext = {
  value: unknown;
  onChange(value: string): void;
  // Only consulted for interpolated fields, and lazily — the list depends on
  // where the step sits, which can change while the form is open.
  vars(): AvailableVar[];
};

export function renderField(spec: FieldSpec, ctx: FieldContext): HTMLElement {
  const field = h("div", { class: "field" });
  const id = `f-${spec.name}`;

  field.append(
    h(
      "label",
      { for: id },
      spec.label,
      spec.required ? h("span", { class: "req", text: " *" }) : null
    )
  );

  const current = ctx.value === undefined || ctx.value === null ? "" : String(ctx.value);
  const mono = MONO.includes(spec.kind) ? "mono" : "";
  const input = MULTILINE.includes(spec.kind)
    ? h("textarea", { id, class: mono, value: current, placeholder: spec.placeholder ?? "", rows: 6 })
    : h("input", {
        id,
        class: mono,
        type: spec.kind === "number" ? "number" : "text",
        value: current,
        placeholder: spec.placeholder ?? "",
        min: spec.min,
        max: spec.max
      });

  const problem = h("div", { class: "bad", hidden: true });

  const check = (): void => {
    const message = validate(spec, input.value, ctx.vars());
    problem.textContent = message ?? "";
    problem.hidden = message === null;
  };

  input.addEventListener("input", () => {
    ctx.onChange(input.value);
    check();
  });

  const control = h("div", { class: "control" }, input);
  if (INTERPOLATED.includes(spec.kind)) control.append(varButton(input, ctx.vars));
  field.append(control);

  if (spec.help) field.append(h("div", { class: "help", text: spec.help }));
  field.append(problem);
  check();
  return field;
}

// Per-field feedback as you type. The authority is still core/configStore.ts's
// parseConfig at save time — this is the same rules, said earlier and next to
// the thing that is wrong.
function validate(spec: FieldSpec, value: string, vars: AvailableVar[]): string | null {
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

  if (INTERPOLATED.includes(spec.kind)) {
    const known = new Set(vars.map((v) => v.name));
    const unknown = referencedVars(value).filter((name) => !known.has(name));
    if (unknown.length > 0) {
      return `${unknown.map((n) => `$${n}`).join(", ")} — no such value here`;
    }
  }

  if (spec.kind === "url") {
    // The template is checked, not the result: $vars are unknown until the
    // stack runs, so anything but a clearly wrong scheme has to be allowed.
    const looksTemplated = referencedVars(value).length > 0;
    if (!looksTemplated && !/^https?:\/\//i.test(trimmed)) return "must start with http:// or https://";
    if (looksTemplated && !/^(https?:\/\/|\$)/i.test(trimmed)) {
      return "must start with http:// or https:// (or a $value that supplies it)";
    }
  }

  return null;
}
