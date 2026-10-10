import { h } from "./el";
import type { Binding } from "../core/schema";
import { formatBinding } from "../core/keys";

// Recording a chord rather than typing one. A binding is a KeyboardEvent.code
// plus four booleans, and nobody should have to know that "the 1 key" is
// "Digit1" — which is also the thing that makes these hotkeys survive a layout
// switch (see core/keys.ts).

// Pressing Ctrl alone is not a chord, it is the user on their way to one.
const MODIFIER_CODES = /^(Control|Alt|Shift|Meta)(Left|Right)$/;

export function chordInput(
  binding: Binding,
  onChange: (binding: Binding) => void,
  warn?: (binding: Binding) => string | null
): HTMLElement {
  const field = h("div", { class: "field" });
  field.append(h("label", { text: "Hotkey" }));

  const label = h("span", { class: "chord", text: formatBinding(binding) });
  const problem = h("div", { class: "bad", hidden: true });
  let recording = false;

  const record = h("button", { type: "button", text: "Record…" });

  const showWarning = (b: Binding): void => {
    const message = warn?.(b) ?? null;
    problem.textContent = message ?? "";
    problem.hidden = message === null;
  };

  const stop = (): void => {
    recording = false;
    record.textContent = "Record…";
    document.removeEventListener("keydown", onKeydown, true);
  };

  function onKeydown(e: KeyboardEvent): void {
    // Capture phase and preventDefault, or the page's own shortcuts — and the
    // browser's — fire while the user is trying to record one.
    e.preventDefault();
    e.stopPropagation();
    if (e.code === "Escape") return stop();
    if (MODIFIER_CODES.test(e.code)) return;

    const next: Binding = {
      code: e.code,
      ctrl: e.ctrlKey,
      alt: e.altKey,
      shift: e.shiftKey,
      meta: e.metaKey
    };
    label.textContent = formatBinding(next);
    showWarning(next);
    onChange(next);
    stop();
  }

  record.addEventListener("click", () => {
    if (recording) return stop();
    recording = true;
    record.textContent = "Press a chord… (Esc to cancel)";
    document.addEventListener("keydown", onKeydown, true);
  });

  field.append(h("div", { class: "control" }, label, record), problem);
  showWarning(binding);
  return field;
}
