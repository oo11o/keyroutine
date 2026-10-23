import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { executeRoutine } from "../src/content/routineExecutor";
import { showStartedToast } from "../src/ui/toast";
import { stubChromeStorage } from "./fakeChrome";
import type { Routine } from "../src/core/schema";
import type { ResumeRecord } from "../src/background/protocol";

// executeRoutine wires three things together: the instant "this is what
// fired" toast, running the routine, and — only on failure — the detailed
// report. loadSettings() falls back to DEFAULT_SETTINGS here: fetching
// chrome-extension://x/config/settings.json isn't stubbed, so it rejects and
// the catch does the same thing a missing file does for real — which needs a
// real macrotask turn to settle, not just a microtask.
const settle = () => new Promise((r) => setTimeout(r, 0));

function toastDetail(): string | undefined {
  const host = document.getElementById("keyroutine-toast-host");
  return host?.shadowRoot?.querySelector(".detail")?.textContent ?? undefined;
}

function toastClass(): string | undefined {
  const host = document.getElementById("keyroutine-toast-host");
  return host?.shadowRoot?.querySelector(".toast")?.className;
}

beforeEach(() => {
  stubChromeStorage();
  document.body.innerHTML = "";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("executeRoutine", () => {
  it("toasts the routine's name the instant it starts, before any step finishes", async () => {
    const routine: Routine = {
      id: "slow",
      name: "Slow Sync",
      binding: { code: "Digit7", ctrl: true, alt: true, shift: false, meta: false },
      enabled: true,
      steps: [{ id: "s1", type: "wait", ms: 0 }]
    };

    const run = executeRoutine(routine, []);
    await settle();

    expect(toastDetail()).toBe("Slow Sync");
    expect(toastClass()).toContain("ok");

    await run;
  });

  it("leaves the started toast as the only one shown on success — nothing replaces it", async () => {
    const routine: Routine = {
      id: "ok",
      name: "Works Fine",
      binding: { code: "Digit8", ctrl: true, alt: true, shift: false, meta: false },
      enabled: true,
      steps: [{ id: "s1", type: "popup", body: "done" }]
    };

    const run = executeRoutine(routine, []);
    await settle();
    expect(toastDetail()).toBe("Works Fine");

    // Dismiss the popup the routine opened, so the run can finish.
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await run;

    expect(toastDetail()).toBe("Works Fine"); // unchanged by a successful finish
  });

  it("replaces the started toast with the failure once the run breaks", async () => {
    const routine: Routine = {
      id: "broken",
      name: "Broken Thing",
      binding: { code: "Digit9", ctrl: true, alt: true, shift: false, meta: false },
      enabled: true,
      steps: [{ id: "s1", type: "clickBySelector", selector: "#missing" }]
    };

    // clickBySelector fails synchronously (a DOM query, no network), so
    // there is no meaningful gap to catch the started toast in before it is
    // replaced — only the end state is worth asserting here.
    await executeRoutine(routine, []);

    expect(toastDetail()).toContain("Broken Thing");
    expect(toastDetail()).toContain("No element");
  });

  it("shows no started toast for a resumed run — there was no keypress on this page", async () => {
    // A known baseline, so "nothing changed" is verifiable without assuming
    // this is the first toast ever shown in the process.
    showStartedToast("Ctrl+Alt+0", "Baseline", "max");
    expect(toastDetail()).toBe("Baseline");

    const routine: Routine = {
      id: "resumed",
      name: "Picked Up Here",
      binding: { code: "Digit1", ctrl: true, alt: true, shift: false, meta: false },
      enabled: true,
      steps: [{ id: "s1", type: "wait", ms: 0 }]
    };
    const resume: Pick<ResumeRecord, "nextStep" | "vars" | "notes"> = {
      nextStep: 0,
      vars: [],
      notes: []
    };

    await executeRoutine(routine, [], resume);

    expect(toastDetail()).toBe("Baseline"); // still the baseline — nothing fired
  });
});
