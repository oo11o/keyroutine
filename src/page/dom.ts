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
