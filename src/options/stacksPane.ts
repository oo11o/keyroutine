import { h, iconButton, row } from "./el";
import { formatBinding } from "../core/keys";
import * as store from "./store";
import { chordInput } from "./chordInput";

// Group 2. The stacks in the selected scope, and the header editor for the one
// that is open: its name, its chord, whether it is on, and which site it belongs
// to — the last being how a stack is moved between Common and a site.

export function renderStacks(pane: HTMLElement): void {
  const scope = store.getScope();
  const config = store.getConfig();
  const stacks = store.stacksInScope();
  const current = store.currentStack();
  const conflicts = store.chordConflicts();

  const scopeName =
    scope.kind === "common"
      ? "common"
      : (config.sites.find((s) => s.id === scope.siteId)?.name ?? "site");

  pane.append(
    h("h2", { class: "group-head" }, "Stacks", h("span", { class: "sub", text: scopeName }))
  );

  if (stacks.length === 0) {
    pane.append(h("div", { class: "empty", text: "No stacks here yet." }));
  }

  const rows = h("div", { class: "rows" });
  for (const stack of stacks) {
    const clash = conflicts.find((c) => c.stackId === stack.id);
    rows.append(
      row(
        {
          class: `${current?.id === stack.id ? "selected" : ""} ${stack.enabled ? "" : "off"}`.trim(),
          title: clash ? `⚠ ${clash.message}` : undefined,
          onClick: () => store.selectStack(stack.id)
        },
        h("span", { class: "chord", text: formatBinding(stack.binding) }),
        h("span", { class: "grow", text: stack.name }),
        clash ? h("span", { class: "mark", text: "⚠", title: clash.message }) : null,
        h("span", { class: "count", text: `${stack.steps.length}` })
      )
    );
  }
  pane.append(rows);

  pane.append(
    h(
      "div",
      { class: "add" },
      h("button", { type: "button", text: "+ Add stack", onClick: () => store.addStack("New stack") })
    )
  );

  if (current) pane.append(stackEditor());
}

function stackEditor(): HTMLElement {
  const stack = store.currentStack()!;
  const config = store.getConfig();
  const editor = h("div", { class: "editor" }, h("h3", { text: "Stack" }));

  const name = h("input", { id: "stack-name", type: "text", value: stack.name });
  name.addEventListener("input", () => store.patchStack(stack.id, { name: name.value }));
  editor.append(h("div", { class: "field" }, h("label", { for: "stack-name", text: "Name" }), name));

  editor.append(
    chordInput(
      stack.binding,
      (binding) => store.patchStack(stack.id, { binding }),
      (binding) =>
        // A chord with no modifier would eat an ordinary keypress on every page
        // this stack applies to: the resolver only steps aside for text fields.
        store.isBareKey(binding)
          ? "no modifier — this would swallow that key on every page the stack applies to"
          : null
    )
  );

  const site = h(
    "select",
    { id: "stack-site" },
    h("option", { value: "", text: "Common (all sites)", selected: stack.siteId == null }),
    ...config.sites.map((s) =>
      h("option", { value: s.id, text: s.name, selected: stack.siteId === s.id })
    )
  );
  site.addEventListener("change", () =>
    store.patchStack(stack.id, { siteId: site.value === "" ? null : site.value })
  );
  editor.append(h("div", { class: "field" }, h("label", { for: "stack-site", text: "Runs on" }), site));

  const enabled = h("input", { id: "stack-enabled", type: "checkbox", checked: stack.enabled });
  enabled.addEventListener("change", () => store.patchStack(stack.id, { enabled: enabled.checked }));
  editor.append(
    h(
      "div",
      { class: "field check" },
      enabled,
      h("label", { for: "stack-enabled", text: "Enabled" })
    )
  );

  const clash = store.chordConflicts().find((c) => c.stackId === stack.id);
  if (clash) {
    editor.append(
      h("div", {
        class: "notice",
        text: `This stack ${clash.message}. Whichever comes first in the config wins; the other never runs.`
      })
    );
  }

  editor.append(
    h(
      "div",
      { class: "editor-actions" },
      h("button", { type: "button", text: "Duplicate", onClick: () => store.duplicateStack(stack.id) }),
      h("button", {
        type: "button",
        text: "Delete",
        onClick: () => {
          if (confirm(`Delete the stack "${stack.name}" and its ${stack.steps.length} step(s)?`)) {
            store.deleteStack(stack.id);
          }
        }
      })
    )
  );

  return editor;
}
