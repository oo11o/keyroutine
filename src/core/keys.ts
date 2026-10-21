import type { Binding } from "./schema";

// Exact equality on all four modifiers, so ⌃⌥1 does not also fire on ⌃⌥⇧1.
export function matches(e: KeyboardEvent, b: Binding): boolean {
  return (
    e.code === b.code &&
    e.ctrlKey === b.ctrl &&
    e.altKey === b.alt &&
    e.shiftKey === b.shift &&
    e.metaKey === b.meta
  );
}

// "Digit1" -> "1", "KeyA" -> "A"; anything else (F1, Space, ...) passes through as-is.
function keyLabel(code: string): string {
  const digit = code.match(/^Digit(\d)$/);
  if (digit) return digit[1];
  const letter = code.match(/^Key([A-Z])$/);
  if (letter) return letter[1];
  return code;
}

export function isMacPlatform(): boolean {
  return typeof navigator !== "undefined" && /Mac/i.test(navigator.platform ?? "");
}

// Mac convention: each modifier as "Word(symbol)", joined by "+" —
// e.g. "Ctrl(⌃)+Opt(⌥)+2". Everywhere else: word modifiers joined by "+" —
// e.g. "Ctrl+Alt+2". `mac` defaults to detecting the current platform but
// takes an explicit value so callers (and tests) aren't at the mercy of
// navigator.platform.
export function formatBinding(b: Binding, mac: boolean = isMacPlatform()): string {
  const parts: string[] = [];
  if (mac) {
    if (b.ctrl) parts.push("Ctrl(⌃)");
    if (b.alt) parts.push("Opt(⌥)");
    if (b.shift) parts.push("Shift(⇧)");
    if (b.meta) parts.push("Cmd(⌘)");
  } else {
    if (b.ctrl) parts.push("Ctrl");
    if (b.alt) parts.push("Alt");
    if (b.shift) parts.push("Shift");
    if (b.meta) parts.push("Meta");
  }
  parts.push(keyLabel(b.code));
  return parts.join("+");
}

// The chord as separate keys, for the builder's <kbd> rendering: ["⌃","⌥","O"]
// on a Mac, ["Ctrl","Alt","O"] elsewhere. Separate from formatBinding because
// one is a string for a toast and the other is a list of keycaps.
export function bindingKeys(b: Binding, mac: boolean = isMacPlatform()): string[] {
  const keys: string[] = [];
  if (b.ctrl) keys.push(mac ? "⌃" : "Ctrl");
  if (b.alt) keys.push(mac ? "⌥" : "Alt");
  if (b.shift) keys.push(mac ? "⇧" : "Shift");
  if (b.meta) keys.push(mac ? "⌘" : "Meta");
  keys.push(keyLabel(b.code));
  return keys;
}

// The spelled-out form shown next to the keycaps — "Ctrl+Option+O". Named
// modifiers rather than symbols, so the chord can be read out loud and typed
// into a bug report.
export function chordText(b: Binding, mac: boolean = isMacPlatform()): string {
  const parts: string[] = [];
  if (b.ctrl) parts.push("Ctrl");
  if (b.alt) parts.push(mac ? "Option" : "Alt");
  if (b.shift) parts.push("Shift");
  if (b.meta) parts.push(mac ? "Command" : "Meta");
  parts.push(keyLabel(b.code));
  return parts.join("+");
}
