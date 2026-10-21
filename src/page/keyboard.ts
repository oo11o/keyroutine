// Synthesising keystrokes at whatever currently has focus. Touches
// `document`, so it lives in page/ alongside dom.ts.

// Plenty of older form code still branches on the deprecated `keyCode`
// (`if (e.keyCode === 13)` for Enter is everywhere in jQuery-era pages), and
// the KeyboardEvent constructor will not set it — it is a readonly getter,
// so it has to be defined onto the instance afterwards.
const NAMED_KEY_CODES: Record<string, number> = {
  Enter: 13,
  Tab: 9,
  Escape: 27,
  Backspace: 8,
  Delete: 46,
  ArrowUp: 38,
  ArrowDown: 40,
  ArrowLeft: 37,
  ArrowRight: 39,
  Home: 36,
  End: 35,
  PageUp: 33,
  PageDown: 34,
  " ": 32
};

function keyCodeFor(key: string): number {
  if (key in NAMED_KEY_CODES) return NAMED_KEY_CODES[key];
  return key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0;
}

// `code` is the physical key, `key` the character it produced — the same
// distinction the hotkey matcher relies on (core/keys.ts). For named keys
// the two spellings coincide; for characters they do not.
function codeFor(key: string): string {
  if (key.length !== 1) return key;
  if (key >= "0" && key <= "9") return `Digit${key}`;
  if (/[a-z]/i.test(key)) return `Key${key.toUpperCase()}`;
  return "";
}

function keyEvent(type: string, key: string): KeyboardEvent {
  const e = new KeyboardEvent(type, {
    key,
    code: codeFor(key),
    bubbles: true,
    cancelable: true
  });
  const legacy = keyCodeFor(key);
  Object.defineProperty(e, "keyCode", { get: () => legacy });
  Object.defineProperty(e, "which", { get: () => legacy });
  return e;
}

// Sends one keystroke to whatever has focus, as keydown → keypress → keyup.
// keypress is omitted for keys that never produced one (arrows, Tab, Escape)
// — a page counting keypresses would otherwise see events a real keyboard
// never sends.
//
// Returns false if a handler called preventDefault() on the keydown, which
// is how a page signals it consumed the key.
export function pressKeyAtFocus(key: string): boolean {
  const target: EventTarget = document.activeElement ?? document.body;
  const notDefaultPrevented = target.dispatchEvent(keyEvent("keydown", key));
  if (key.length === 1 || key === "Enter") target.dispatchEvent(keyEvent("keypress", key));
  target.dispatchEvent(keyEvent("keyup", key));
  return notDefaultPrevented;
}
