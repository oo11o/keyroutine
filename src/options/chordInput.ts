import { h } from "./el";
import type { Binding } from "../core/schema";
import { bindingKeys, chordText } from "../core/keys";

// Recording a chord rather than typing one. A binding is a KeyboardEvent.code
// plus four booleans, and nobody should have to know that "the 1 key" is
// "Digit1" — which is also the thing that makes these hotkeys survive a layout
// switch (see core/keys.ts).

// Pressing Ctrl alone is not a chord, it is the user on their way to one.
const MODIFIER_CODES = /^(Control|Alt|Shift|Meta)(Left|Right)$/;

// Chords the browser keeps for itself. Recording one is allowed — a page's own
// handler sometimes wins — but it is worth saying that it probably will not
// fire, because the alternative is a hotkey that silently does nothing.
const RESERVED = new Set([
  "KeyT",
  "KeyN",
  "KeyW",
  "KeyL",
  "KeyR",
  "KeyQ",
  "Tab",
  "KeyD"
]);

export function reservedChord(b: Binding): boolean {
  // Only the plain browser combinations — ⌘T, Ctrl+T, ⌘⇧N. Adding Alt is what
  // keeps Keystack's own ⌃⌥letter chords out of this.
  return !b.alt && (b.meta || b.ctrl) && RESERVED.has(b.code);
}

// The keycaps themselves, which the stack cards and the trigger row show too.
export function keyCaps(binding: Binding, extra = ""): HTMLElement {
  return h(
    "span",
    { class: `keys ${extra}`.trim() },
    ...bindingKeys(binding).map((key) => h("kbd", { text: key }))
  );
}

export function hotkeyField(
  binding: Binding,
  onChange: (binding: Binding) => void,
  warn?: (binding: Binding) => string | null
): HTMLElement {
  const field = h("div", { class: "field" });
  field.append(h("span", { class: "label", text: "Hotkey" }));

  const caps = keyCaps(binding, "keys-lg");
  const text = h("span", { class: "mono hint", text: chordText(binding) });
  const problem = h("div", { class: "errtext", hidden: true });
  let recording = false;

  const record = h("button", {
    type: "button",
    class: "btn btn-sm",
    style: "margin-left:auto",
    text: "Record new"
  });

  const showWarning = (b: Binding): void => {
    const message = warn?.(b) ?? (reservedChord(b) ? "the browser usually keeps this chord for itself" : null);
    problem.textContent = message ?? "";
    problem.hidden = message === null;
  };

  const stop = (): void => {
    recording = false;
    record.textContent = "Record new";
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
    showWarning(next);
    onChange(next);
    stop();
  }

  record.addEventListener("click", () => {
    if (recording) return stop();
    recording = true;
    record.textContent = "Press a chord… (Esc)";
    document.addEventListener("keydown", onKeydown, true);
  });

  field.append(h("div", { class: "rowline" }, caps, text, record), problem);
  showWarning(binding);
  return field;
}
