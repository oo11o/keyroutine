import { h } from "./el";
import * as store from "./store";

// Export and Import. The config used to be a file you edited by hand, and this
// is what keeps that possible: a way to read the whole thing out, keep a copy,
// diff it, or paste an edited one back. Import goes through the same
// parseConfig as everything else, so a bad paste is refused with reasons rather
// than half-applied.

function dialog(title: string, blurb: string): {
  el: HTMLDialogElement;
  body: HTMLElement;
  actions: HTMLElement;
} {
  const body = h("div");
  const actions = h("div", { class: "actions" });
  const el = h(
    "dialog",
    {},
    h("h2", { text: title }),
    h("p", { text: blurb }),
    body,
    actions
  ) as HTMLDialogElement;
  actions.append(h("button", { type: "button", text: "Close", onClick: () => el.close() }));
  el.addEventListener("close", () => el.remove());
  document.body.append(el);
  return { el, body, actions };
}

export function openExport(): void {
  const text = store.exportJson();
  const area = h("textarea", { class: "mono", value: text, readOnly: true });
  const { el, body, actions } = dialog(
    "Export",
    "The whole config — stacks, steps and sites. Copy it somewhere safe, or edit it and paste it back through Import."
  );
  body.append(area);
  actions.prepend(
    h("button", {
      type: "button",
      class: "primary",
      text: "Copy to clipboard",
      onClick: () => {
        void navigator.clipboard.writeText(text);
        area.select();
      }
    })
  );
  el.showModal();
  area.focus();
  area.select();
}

export function openImport(onDone: () => void): void {
  const area = h("textarea", { class: "mono", placeholder: '{ "schemaVersion": 2, "stacks": [], "sites": [] }' });
  const problems = h("div", { class: "problems", hidden: true });
  const { el, body, actions } = dialog(
    "Import",
    "Replaces the draft with this config. Nothing is stored until you Save, so a mistake here is still undoable."
  );
  body.append(problems, area);
  actions.prepend(
    h("button", {
      type: "button",
      class: "primary",
      text: "Load into the draft",
      onClick: () => {
        let raw: unknown;
        try {
          raw = JSON.parse(area.value);
        } catch (err) {
          show(problems, [`that is not valid JSON — ${(err as Error).message}`]);
          return;
        }
        const result = store.replaceDraft(raw);
        if (!result.ok) {
          show(problems, result.problems.map((p) => p.message));
          return;
        }
        el.close();
        onDone();
      }
    })
  );
  el.showModal();
  area.focus();
}

function show(host: HTMLElement, messages: string[]): void {
  host.replaceChildren(
    h("strong", { text: "Not imported:" }),
    h("ul", {}, ...messages.map((m) => h("li", { text: m })))
  );
  host.hidden = false;
}
