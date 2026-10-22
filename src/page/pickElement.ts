// The element picker: the page under a crosshair, and a click that comes back
// as a CSS selector. It exists because the alternative is DevTools › Copy ›
// Copy selector, which produces things like
// `body > div:nth-child(3) > div > form > input` — correct, unreadable, and
// broken by the next layout change.

// Classes that describe a moment rather than a thing. A selector built on
// "is-active" stops matching the instant the element loses focus.
const STATE_CLASS = /^(is-|has-|js-is-)|(active|focus|hover|selected|open|show|hidden|disabled)$/i;

// Generated class names — hashes, utility soup, anything with a run of digits.
// They are stable until the page is rebuilt, which is not stable enough.
const NOISY_CLASS = /\d{3,}|^[_-]|^[a-z]+-[0-9a-f]{6,}$|^css-/i;

function isPlainIdent(value: string): boolean {
  return /^[A-Za-z][\w-]*$/.test(value);
}

function usefulClasses(el: Element): string[] {
  return [...el.classList]
    .filter((c) => isPlainIdent(c) && !STATE_CLASS.test(c) && !NOISY_CLASS.test(c))
    .slice(0, 2);
}

function unique(selector: string, root: Document | ShadowRoot): boolean {
  try {
    return root.querySelectorAll(selector).length === 1;
  } catch {
    return false;
  }
}

// One element as a selector segment, without its ancestors: the most specific
// thing that is still about the element itself — a test id, then an id, then a
// tag with up to two real classes, and :nth-of-type only when the tag alone
// cannot tell it from its siblings.
function segment(el: Element): string {
  const tag = el.tagName.toLowerCase();
  for (const attr of ["data-testid", "data-test-id", "data-qa", "name"]) {
    const value = el.getAttribute(attr);
    if (value && isPlainIdent(value)) return `${tag}[${attr}="${value}"]`;
  }
  if (el.id && isPlainIdent(el.id)) return `${tag}#${el.id}`;

  const classes = usefulClasses(el);
  let base = tag + classes.map((c) => `.${c}`).join("");
  const siblings = [...(el.parentElement?.children ?? [])].filter(
    (s) => s.tagName === el.tagName
  );
  if (siblings.length > 1 && classes.length === 0) {
    base += `:nth-of-type(${siblings.indexOf(el) + 1})`;
  }
  return base;
}

// A selector for this element: the shortest ancestor path that matches it and
// nothing else. Walks up only as far as it has to, so a page with an id on the
// element gets `#report_id` rather than a chain down from <body>.
export function cssSelectorFor(el: Element, root: Document = document): string {
  if (el.id && isPlainIdent(el.id) && unique(`#${el.id}`, root)) return `#${el.id}`;

  const parts: string[] = [];
  let node: Element | null = el;
  while (node && node !== root.documentElement) {
    parts.unshift(segment(node));
    const path = parts.join(" > ");
    if (unique(path, root)) return path;
    node = node.parentElement;
  }
  // Nothing made it unique — return the full path anyway. A selector matching
  // three elements is still a starting point the user can narrow by hand, and
  // the Test button will say how many it hit.
  return parts.join(" > ");
}

const OVERLAY_ID = "keystack-picker";

// Resolves with a selector for whatever the user clicks, or null if they press
// Escape. The highlight is pointer-events:none and every mouse event is taken
// in the capture phase, so the page sees the hover it would normally see and
// none of the click — picking an element must not also submit the form it is in.
export function pickElement(): Promise<string | null> {
  return new Promise((resolve) => {
    const host = document.createElement("div");
    host.id = OVERLAY_ID;
    host.style.cssText =
      "position:fixed;inset:0;z-index:2147483647;pointer-events:none;" +
      "font:12px/1.4 ui-sans-serif,system-ui,sans-serif";

    const box = document.createElement("div");
    box.style.cssText =
      "position:fixed;border:2px solid #7aadff;background:rgba(122,173,255,.14);" +
      "border-radius:3px;transition:all .04s linear;display:none";

    const label = document.createElement("div");
    label.style.cssText =
      "position:fixed;left:50%;bottom:16px;transform:translateX(-50%);max-width:80vw;" +
      "padding:7px 12px;border-radius:8px;background:#1a1a1d;color:#ededf0;" +
      "border:1px solid #3c3c45;box-shadow:0 8px 28px rgba(0,0,0,.45);white-space:nowrap;" +
      "overflow:hidden;text-overflow:ellipsis";
    label.textContent = "Keystack: click an element to pick it — Esc to cancel";

    host.append(box, label);
    document.documentElement.append(host);

    const previousCursor = document.documentElement.style.cursor;
    document.documentElement.style.cursor = "crosshair";

    let hovered: Element | null = null;

    const done = (selector: string | null): void => {
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("mousedown", swallow, true);
      document.removeEventListener("mouseup", swallow, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKey, true);
      document.documentElement.style.cursor = previousCursor;
      host.remove();
      resolve(selector);
    };

    function onMove(e: MouseEvent): void {
      const target = e.target as Element | null;
      if (!target || target === host || host.contains(target)) return;
      hovered = target;
      const rect = target.getBoundingClientRect();
      box.style.display = "block";
      box.style.left = `${rect.left}px`;
      box.style.top = `${rect.top}px`;
      box.style.width = `${rect.width}px`;
      box.style.height = `${rect.height}px`;
      label.textContent = cssSelectorFor(target);
    }

    function swallow(e: Event): void {
      e.preventDefault();
      e.stopPropagation();
    }

    function onClick(e: MouseEvent): void {
      e.preventDefault();
      e.stopPropagation();
      const target = (hovered ?? e.target) as Element | null;
      done(target ? cssSelectorFor(target) : null);
    }

    function onKey(e: KeyboardEvent): void {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      done(null);
    }

    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("mousedown", swallow, true);
    document.addEventListener("mouseup", swallow, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey, true);
  });
}
