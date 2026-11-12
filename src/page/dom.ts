// Reading from and writing to elements on the live page. Everything here
// touches `document`, so none of it can run in a service worker — that is
// the whole point of the page/ vs core/ split.

import { sleep } from "./wait";

export type TextField = HTMLInputElement | HTMLTextAreaElement;

// Polls rather than using a MutationObserver: a routine's selectors target
// arbitrary pages, and a plain poll needs no cleanup if the step times out
// or the tab navigates away mid-wait.
const POLL_MS = 100;

export async function waitForElement(selector: string, timeoutMs: number): Promise<Element> {
  const start = Date.now();
  while (true) {
    const el = document.querySelector(selector);
    if (el) return el;
    const elapsed = Date.now() - start;
    if (elapsed >= timeoutMs) {
      throw new Error(`No element for "${selector}" within ${timeoutMs}ms`);
    }
    await sleep(Math.min(POLL_MS, timeoutMs - elapsed));
  }
}

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

// Same reasoning as setNativeValue above, for <select>'s own value setter.
function setNativeSelectValue(el: HTMLSelectElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!;
  setter.call(el, value);
}

// Picks the <option> whose value or visible text matches — value first,
// since two options can show the same label but never the same value, and
// falling back to text is what makes a plain-language pattern ("United
// Kingdom") work on a select whose option values are codes ("GB") the
// routine's author never saw. Returns the option actually chosen, so the
// step can report what it picked rather than just the pattern it was given.
export function selectOption(el: HTMLSelectElement, match: string): HTMLOptionElement {
  const option =
    [...el.options].find((o) => o.value === match) ??
    [...el.options].find((o) => o.text.trim() === match);
  if (!option) throw new Error(`No option "${match}" in this select`);
  setNativeSelectValue(el, option.value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return option;
}
