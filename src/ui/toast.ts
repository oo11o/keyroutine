import type { ToastVerbosity } from "../core/schema";

// The result of one runRoutine() call, in a shape the UI can render without
// needing to know about StepError or the run context.
export type RunOutcome =
  | { ok: true; notes: string[] }
  | { ok: false; notes: string[]; stepIndex: number; stepType: string; message: string };

// A page's own CSS can otherwise leak into (or override) an injected element —
// e.g. a site with `div { color: red !important }` would clobber a plain div
// toast. Shadow DOM isolates the toast's styles from the page in both
// directions. Created lazily and reused for the life of the page; the host
// itself is still a light-DOM node, so it can't be made fully immune to a
// page that resets *all* elements, but that's a much rarer case than
// ordinary CSS leakage.
//
// One zone, two slots, stacked: the started toast and the fetch spinner
// (ui/spinner.ts) used to be entirely separate fixed-position elements
// pinned to the identical screen coordinates, so a fetch starting right
// after the hotkey's own toast fired rendered on top of it instead of beside
// it — which looked like the toast had vanished early, when really it was
// just buried. Now each gets its own slot in one flex column: a fetch
// starting leaves the toast where it is and adds the spinner below it, and
// the spinner clearing on completion leaves the toast exactly as it was.
// Exported for ui/spinner.ts; nothing outside ui/ reaches either slot.
let toastSlot: HTMLElement | null = null;
let spinnerSlot: HTMLElement | null = null;

function getZone(): { toastSlot: HTMLElement; spinnerSlot: HTMLElement } {
  if (toastSlot && spinnerSlot) return { toastSlot, spinnerSlot };
  const host = document.createElement("div");
  host.id = "keyroutine-toast-host";
  document.documentElement.appendChild(host);

  const shadowRoot = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `
    #zone {
      position: fixed;
      top: 24px;
      left: 24px;
      z-index: 2147483647;
      display: flex;
      flex-direction: column;
      gap: 8px;
      pointer-events: none;
    }
    /* Both children share one width, so replacing one with the other never
       resizes the box — a toast handing off to a spinner (a fetch step
       starting) or back should read as one continuing thing, not a flicker. */
    .toast, .spinner {
      pointer-events: auto;
      min-width: 320px;
      max-width: 320px;
      box-sizing: border-box;
      border-radius: 8px;
      font: 13px/1.4 -apple-system, system-ui, sans-serif;
      color: #fff;
      box-shadow: 0 4px 12px rgba(0, 0, 0, .25);
      word-break: break-word;
    }
    .toast {
      padding: 10px 16px;
      cursor: pointer;
    }
    .toast.ok { background: #1a7f37; }
    .toast.err { background: #c62828; }
    .toast.pinned { box-shadow: 0 0 0 2px rgba(255, 255, 255, .7), 0 4px 12px rgba(0, 0, 0, .25); }
    .toast .chord {
      display: block;
      font-size: 16px;
      font-weight: 700;
      letter-spacing: .02em;
    }
    .toast .detail {
      display: block;
      font-size: 12px;
      opacity: .85;
      white-space: pre-line;
    }
    .spinner {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 14px;
      background: #1f2328;
    }
    .spinner .dot {
      flex: none;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      border: 2px solid rgba(255, 255, 255, .3);
      border-top-color: #fff;
      animation: keyroutine-spin .7s linear infinite;
    }
    @keyframes keyroutine-spin { to { transform: rotate(360deg); } }
  `;
  shadowRoot.appendChild(style);

  const zone = document.createElement("div");
  zone.id = "zone";
  toastSlot = document.createElement("div");
  spinnerSlot = document.createElement("div");
  zone.append(toastSlot, spinnerSlot);
  shadowRoot.appendChild(zone);
  return { toastSlot, spinnerSlot };
}

// For ui/spinner.ts, which only ever touches its own slot.
export function getSpinnerSlot(): HTMLElement {
  return getZone().spinnerSlot;
}

const TOAST_DURATION_MS = 3000;
const SEPARATOR = "-----------------------";

function numberList(items: string[]): string[] {
  return items.map((item, i) => `${i + 1}. ${item}`);
}

// detail lines: [0] is the title (routine name + status), then a blank line,
// then one line per step. white-space: pre-line on .detail renders the \n's.
function showToast(chord: string, detailLines: string[], ok: boolean) {
  const { toastSlot } = getZone();
  toastSlot.replaceChildren(); // only the latest toast is ever shown, pinned or not

  const el = document.createElement("div");
  el.className = `toast ${ok ? "ok" : "err"}`;

  const chordEl = document.createElement("span");
  chordEl.className = "chord";
  chordEl.textContent = chord;

  const detailEl = document.createElement("span");
  detailEl.className = "detail";
  detailEl.textContent = detailLines.join("\n");

  el.append(chordEl, detailEl);
  toastSlot.appendChild(el);

  // Click once to pin (cancels auto-dismiss); click again to close it.
  let pinned = false;
  const timer = setTimeout(() => el.remove(), TOAST_DURATION_MS);
  el.addEventListener("click", () => {
    if (!pinned) {
      pinned = true;
      el.classList.add("pinned");
      clearTimeout(timer);
    } else {
      el.remove();
    }
  });
}

// A config that will not parse is a special kind of failure: no routine ran,
// so there is no chord, no routine name and no step list to report. It also
// deliberately ignores the toast verbosity setting — verbosity tunes how
// much detail a *run* reports, and here nothing can run at all. Silence is
// the exact failure mode this exists to remove: before it, one stray comma
// in routines.json made every hotkey dead with no feedback anywhere.
export function showConfigErrorToast(message: string): void {
  showToast("KeyRoutine", ["\u2717 config/routines.json could not be read", "", message], false);
}

// The instant acknowledgement: fired the moment a keypress is matched to a
// routine, before a single step has run — "none" aside, it doesn't vary with
// verbosity, because there is no result yet to vary it with. This is what a
// routine whose last step is a long fetch or a popup needs: without it, the
// only feedback was the detailed toast at the very end, which on a
// popup-ending routine meant nothing showed until the popup was dismissed —
// by which point the moment it would have mattered (confirming the right
// chord fired) had passed.
export function showStartedToast(chord: string, routineName: string, verbosity: ToastVerbosity): void {
  if (verbosity === "none") return;
  showToast(chord, [routineName], true);
}

// "none": show nothing. "min": chord + routine name, plus the failure reason
// if it failed — no per-step detail. "max": full numbered step list, with a
// separator before the failing step on failure.
export function showResultToast(
  chord: string,
  routineName: string,
  outcome: RunOutcome,
  verbosity: ToastVerbosity
): void {
  if (verbosity === "none") return;

  if (verbosity === "min") {
    if (outcome.ok) {
      showToast(chord, [`✓ ${routineName}`], true);
    } else {
      showToast(chord, [`✗ ${routineName}: ${outcome.message}`], false);
    }
    return;
  }

  // max
  if (outcome.ok) {
    showToast(chord, [`✓ ${routineName}`, "", ...numberList(outcome.notes)], true);
  } else {
    const lines = numberList(outcome.notes);
    lines.push("", SEPARATOR, `${outcome.stepIndex + 1}. ✗ ${outcome.stepType}: ${outcome.message}`);
    showToast(chord, [`✗ ${routineName}`, "", ...lines], false);
  }
}
