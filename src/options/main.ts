import { clear, h } from "./el";
import * as store from "./store";
import { renderSites } from "./sitesPane";
import { renderStacks } from "./stacksPane";
import { renderSteps } from "./stepsPane";
import { loadSecretNames, renderSecrets } from "./secretsPane";
import { openExport, openImport } from "./portJson";

// The builder's entry point: boot the draft, draw the three columns, and keep
// the top bar honest about whether there is anything unsaved.

const builder = document.getElementById("builder") as HTMLElement;
const secrets = document.getElementById("secrets") as HTMLElement;
const tabs = document.getElementById("tabs") as HTMLElement;
const topActions = document.getElementById("topbar-actions") as HTMLElement;

const status = h("span", { class: "status" });
const dirtyDot = h("span", { class: "dirty", text: "● unsaved", hidden: true });
const saveButton = h("button", { type: "button", class: "primary", text: "Save", disabled: true });
const problems = h("div", { class: "problems", hidden: true });

type Tab = "builder" | "secrets";
let tab: Tab = "builder";

/* ── the three columns ─────────────────────────────────────────────────── */

function render(): void {
  const focus = captureFocus();
  clear(builder);

  const sites = h("section");
  const stacks = h("section");
  const steps = h("section");
  renderSites(sites);
  renderStacks(stacks);
  renderSteps(steps);
  builder.append(sites, stacks, steps);

  dirtyDot.hidden = !store.isDirty();
  saveButton.disabled = !store.isDirty();
  restoreFocus(focus);
}

// Every edit redraws the columns, which would otherwise take the caret out of
// the field being typed into. Every editable control has a stable id, so putting
// the caret back is a lookup — and it is why the panes can stay this simple.
type Focus = { id: string; start: number | null; end: number | null } | null;

function captureFocus(): Focus {
  const el = document.activeElement;
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return null;
  if (!el.id || !builder.contains(el)) return null;
  return { id: el.id, start: el.selectionStart, end: el.selectionEnd };
}

function restoreFocus(focus: Focus): void {
  if (!focus) return;
  const el = document.getElementById(focus.id);
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
  el.focus();
  if (focus.start !== null && focus.end !== null && el.type !== "number") {
    // A number input rejects setSelectionRange outright.
    el.setSelectionRange(focus.start, focus.end);
  }
}

/* ── top bar ───────────────────────────────────────────────────────────── */

function renderTabs(): void {
  clear(tabs);
  const button = (id: Tab, label: string) =>
    h("button", {
      type: "button",
      text: label,
      "aria-selected": tab === id ? "true" : "false",
      onClick: () => void selectTab(id)
    });
  tabs.append(button("builder", "Builder"), button("secrets", "Secrets"));
}

async function selectTab(next: Tab): Promise<void> {
  tab = next;
  builder.hidden = next !== "builder";
  secrets.hidden = next !== "secrets";
  renderTabs();
  if (next === "secrets") {
    await renderSecrets(secrets, (names) => {
      // A deleted secret must stop being offered by the variable picker, and a
      // new one must start.
      void store.init(store.getPageUrl(), names);
    });
  }
}

function setStatus(text: string, isError = false): void {
  status.textContent = text;
  status.className = isError ? "status error" : "status";
  if (text && !isError) setTimeout(() => (status.textContent = ""), 2500);
}

async function save(): Promise<void> {
  const result = await store.save();
  if (result.ok) {
    problems.hidden = true;
    setStatus("Saved — your hotkeys are live");
    return;
  }
  problems.replaceChildren(
    h("strong", { text: "Not saved:" }),
    h("ul", {}, ...result.problems.map((p) => h("li", { text: p.message })))
  );
  problems.hidden = false;
  setStatus(`${result.problems.length} problem${result.problems.length === 1 ? "" : "s"}`, true);
}

saveButton.addEventListener("click", () => void save());

topActions.append(
  status,
  dirtyDot,
  h("button", { type: "button", text: "Export…", onClick: () => openExport() }),
  h("button", { type: "button", text: "Import…", onClick: () => openImport(() => setStatus("Loaded into the draft — Save to apply")) }),
  saveButton
);

/* ── boot ──────────────────────────────────────────────────────────────── */

// The URL of the tab the builder was opened from, for the "This site" row. It
// is absent when the options page is opened from chrome://extensions, which is
// ordinary, not an error.
async function currentPageUrl(): Promise<string | null> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const url = tab?.url ?? null;
    // An extension or chrome:// page is not a site anyone binds hotkeys on.
    return url && /^https?:/i.test(url) ? url : null;
  } catch {
    return null;
  }
}

async function boot(): Promise<void> {
  renderTabs();
  builder.before(problems);
  store.subscribe(render);
  const [url, secretNames] = await Promise.all([currentPageUrl(), loadSecretNames()]);
  await store.init(url, secretNames);
}

// Leaving with unsaved edits loses them, and the browser's own prompt is the
// only one that can interrupt a navigation.
window.addEventListener("beforeunload", (e) => {
  if (!store.isDirty()) return;
  e.preventDefault();
});

void boot();
