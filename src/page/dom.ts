// Reading from and writing to elements on the live page. Everything here
// touches `document`, so none of it can run in a service worker — that is
// the whole point of the page/ vs core/ split.

export type TextField = HTMLInputElement | HTMLTextAreaElement;

export function readText(selector: string): string {
  const el = document.querySelector(selector);
  if (!el) throw new Error(`No element for "${selector}"`);
  const text = (el as HTMLInputElement).value ?? el.textContent?.trim() ?? "";
  if (!text) throw new Error(`Element "${selector}" is empty`);
  return text;
}

// Assigning el.value directly does not notify React — it overrides the
// native setter, so React's state never learns the value changed and
// reverts it on the next render. Use the prototype's native setter instead.
function setNativeValue(el: TextField, value: string): void {
  const proto = el instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
  setter.call(el, value);
}

// Sets the field in one go. Enough for anything that watches `input`/
// `change` — React included, thanks to the native setter above.
export function writeValue(el: TextField, value: string): void {
  setNativeValue(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

// Types the value one character at a time, firing the full keydown →
// keypress → input → keyup sequence per character, the way a keyboard does.
//
// writeValue() is the right default and this is the fallback for fields it
// cannot move: anything driven by key handlers rather than by the value —
// masked/formatted inputs that reformat per keystroke, autocompletes that
// only open on a real key, and editors that ignore a value they did not see
// typed. The cost is that it is observably synthetic in one way: these are
// untrusted events, so they never produce default browser behaviour.
//
// The field is cleared first, so this replaces rather than appends — the
// same end state writeValue() gives, reached differently.
export function typeValue(el: TextField, value: string): void {
  el.focus();
  setNativeValue(el, "");
  for (const char of value) {
    const key = { key: char, bubbles: true, cancelable: true };
    el.dispatchEvent(new KeyboardEvent("keydown", key));
    el.dispatchEvent(new KeyboardEvent("keypress", key));
    setNativeValue(el, el.value + char);
    el.dispatchEvent(
      new InputEvent("input", { bubbles: true, inputType: "insertText", data: char })
    );
    el.dispatchEvent(new KeyboardEvent("keyup", key));
  }
  el.dispatchEvent(new Event("change", { bubbles: true }));
}
