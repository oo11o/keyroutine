import { h, iconButton, row } from "./el";
import type { Step } from "../core/schema";
import { STEP_GROUPS, STEP_META, STEP_TYPES } from "../core/stepMeta";
import { availableVars } from "../core/vars";
import * as store from "./store";
import { renderField } from "./fields";

// Group 3. The steps of the open stack, in run order, and the form for the one
// being edited. Nothing here knows what a step type is — the list of types comes
// from STEP_META and each form is its `fields` run through renderField, so a new
// step type appears here the moment it is registered.

export function renderSteps(pane: HTMLElement): void {
  const stack = store.currentStack();

  pane.append(
    h(
      "h2",
      { class: "group-head" },
      "Steps",
      stack ? h("span", { class: "sub", text: stack.name }) : null
    )
  );

  if (!stack) {
    pane.append(h("div", { class: "empty", text: "Pick a stack, or add one." }));
    return;
  }

  if (stack.steps.length === 0) {
    pane.append(h("div", { class: "empty", text: "No steps yet — a stack with no steps does nothing." }));
  }

  const current = store.currentStep();
  const rows = h("div", { class: "rows" });

  stack.steps.forEach((step, index) => {
    const meta = STEP_META[step.type];
    rows.append(
      row(
        {
          class: `step-row ${current?.id === step.id ? "selected" : ""}`.trim(),
          onClick: () => store.selectStep(step.id)
        },
        h("span", { class: "idx", text: String(index + 1) }),
        h(
          "span",
          { class: "body" },
          h("div", { class: "label", text: meta.label }),
          h("div", { class: "summary", text: meta.summary(step) }),
          // What this step makes available to the ones after it — the link
          // between "copy some id" and the $s1 in the next step's URL.
          meta.produces ? h("div", { class: "exposes", text: exposes(step) }) : null
        ),
        h(
          "span",
          { class: "step-tools" },
          iconButton("↑", "Move up", () => store.moveStep(step.id, -1)),
          iconButton("↓", "Move down", () => store.moveStep(step.id, 1)),
          iconButton("⧉", "Duplicate", () => store.duplicateStep(step.id)),
          iconButton("✕", "Delete", () => store.deleteStep(step.id))
        )
      )
    );
  });
  pane.append(rows);

  pane.append(addStepMenu(pane));
  if (current) pane.append(stepForm(current));
}

function exposes(step: Step): string {
  const saveAs = (step as { saveAs?: string }).saveAs;
  return `→ $${step.id}${saveAs ? `, $${saveAs}` : ""}, $value`;
}

// A disclosure rather than a <select>: the types are grouped and each carries a
// line of help, which is what makes the list browsable by someone who does not
// already know the vocabulary.
function addStepMenu(pane: HTMLElement): HTMLElement {
  const wrap = h("div", { class: "add" });
  const toggle = h("button", { type: "button", text: "+ Add step ▾" });
  let menu: HTMLElement | null = null;

  toggle.addEventListener("click", () => {
    if (menu) {
      menu.remove();
      menu = null;
      return;
    }
    menu = h("div", { class: "type-menu" });
    for (const { group, label } of STEP_GROUPS) {
      const types = STEP_TYPES.filter((t) => STEP_META[t].group === group);
      if (types.length === 0) continue;
      menu.append(h("div", { class: "cat", text: label }));
      for (const type of types) {
        menu.append(
          h(
            "button",
            { type: "button", onClick: () => store.addStep(type) },
            h("div", { text: STEP_META[type].label }),
            h("div", { class: "note", text: STEP_META[type].help })
          )
        );
      }
    }
    wrap.append(menu);
  });

  wrap.append(toggle);
  return wrap;
}

function stepForm(step: Step): HTMLElement {
  const stack = store.currentStack()!;
  const meta = STEP_META[step.type];
  const index = stack.steps.findIndex((s) => s.id === step.id);
  // Lazily, and per call: what a step may read depends on where it sits, and it
  // can be moved while its form is open.
  const vars = () => availableVars(stack, index, store.getSecretNames());

  const form = h(
    "div",
    { class: "editor" },
    h("h3", { text: meta.label }),
    h("div", { class: "help", text: meta.help })
  );

  const plain = meta.fields.filter((f) => !f.advanced);
  const advanced = meta.fields.filter((f) => f.advanced);

  for (const spec of plain) {
    form.append(
      renderField(spec, {
        value: (step as unknown as Record<string, unknown>)[spec.name],
        onChange: (value) => store.patchStep(step.id, { [spec.name]: coerce(spec.kind, value) }),
        vars
      })
    );
  }

  if (advanced.length > 0) {
    const details = h("details", { class: "advanced" }, h("summary", { text: "Advanced" }));
    // Open when something is set: an advanced field with a value must not hide.
    let anySet = false;
    for (const spec of advanced) {
      const value = (step as unknown as Record<string, unknown>)[spec.name];
      if (value !== undefined && value !== "" && value !== spec.default) anySet = true;
      details.append(
        renderField(spec, {
          value,
          onChange: (v) => store.patchStep(step.id, { [spec.name]: coerce(spec.kind, v) }),
          vars
        })
      );
    }
    if (anySet) details.open = true;
    form.append(details);
  }

  form.append(stepIdField(step));
  return form;
}

// The step's own id, editable but deliberately last: it is a variable name as
// well as a label ($<id>), so renaming it can break a later template. The
// rename is applied on blur, not per keystroke, or every intermediate spelling
// would count as a rename.
function stepIdField(step: Step): HTMLElement {
  const stack = store.currentStack()!;
  const input = h("input", { id: "step-id", class: "mono", type: "text", value: step.id });
  const problem = h("div", { class: "bad", hidden: true });

  const commit = (): void => {
    const next = input.value.trim();
    if (next === step.id) return;
    if (!/^\w+$/.test(next)) {
      problem.textContent = "letters, digits and _ only — it is used as $name";
      problem.hidden = false;
      input.value = step.id;
      return;
    }
    if (stack.steps.some((s) => s.id === next)) {
      problem.textContent = `step "${next}" already exists`;
      problem.hidden = false;
      input.value = step.id;
      return;
    }
    const breaks = store.renamesBreak(stack, step.id);
    if (breaks.length > 0) {
      const ok = confirm(
        `${breaks.map((b) => b.message).join("\n")}\n\n` +
          `Renaming this step will not update those. Rename anyway?`
      );
      if (!ok) {
        input.value = step.id;
        return;
      }
    }
    store.setStepId(step.id, next);
  };

  input.addEventListener("blur", commit);
  input.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Enter") input.blur();
  });

  return h(
    "div",
    { class: "field" },
    h("label", { for: "step-id", text: "Step id" }),
    input,
    h("div", { class: "help", text: `Later steps can read this step's result as $${step.id}.` }),
    problem
  );
}

function coerce(kind: string, value: string): string | number {
  if (kind !== "number") return value;
  const n = Number(value);
  // An unparseable number is left as the raw text so the field can say why;
  // parseConfig refuses it at save time either way.
  return value.trim() === "" || !Number.isFinite(n) ? value : n;
}
