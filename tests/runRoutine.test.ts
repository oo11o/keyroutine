import { describe, it, expect, beforeEach } from "vitest";
import { runRoutine, StepError } from "../src/content/runner";
import type { Routine } from "../src/core/schema";

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("runRoutine — $<step.id> auto-binding", () => {
  it("makes a producer's value reachable as $<its own id>, with no saveAs", () => {
    document.body.innerHTML = `
      <input id="tender_id" value="T-42" />
      <input id="search" />
    `;
    const routine: Routine = {
      id: "sync",
      name: "Sync",
      binding: { code: "Digit2", ctrl: true, alt: true, shift: false, meta: false },
      enabled: true,
      steps: [
        { id: "s1", type: "readBySelector", selector: "#tender_id" },
        { id: "s2", type: "inputToSelector", selector: "#search", value: "$s1" }
      ]
    };

    return runRoutine(routine).then(() => {
      const search = document.querySelector<HTMLInputElement>("#search")!;
      expect(search.value).toBe("T-42");
    });
  });

  it("still supports $value as the shorthand for the last produced value", () => {
    document.body.innerHTML = `
      <input id="tender_id" value="T-99" />
      <input id="search" />
    `;
    const routine: Routine = {
      id: "sync2",
      name: "Sync2",
      binding: { code: "Digit3", ctrl: true, alt: true, shift: false, meta: false },
      enabled: true,
      steps: [
        { id: "s1", type: "readBySelector", selector: "#tender_id" },
        { id: "s2", type: "inputToSelector", selector: "#search", value: "$value" }
      ]
    };

    return runRoutine(routine).then(() => {
      const search = document.querySelector<HTMLInputElement>("#search")!;
      expect(search.value).toBe("T-99");
    });
  });

  it("clears the context after the run — a later routine cannot see $s1", async () => {
    document.body.innerHTML = `<input id="a" value="X" />`;
    const producer: Routine = {
      id: "p",
      name: "Producer",
      binding: { code: "Digit4", ctrl: true, alt: true, shift: false, meta: false },
      enabled: true,
      steps: [{ id: "s1", type: "readBySelector", selector: "#a" }]
    };
    const consumer: Routine = {
      id: "c",
      name: "Consumer",
      binding: { code: "Digit5", ctrl: true, alt: true, shift: false, meta: false },
      enabled: true,
      steps: [{ id: "s2", type: "inputToSelector", selector: "#a", value: "$s1" }]
    };

    await runRoutine(producer);
    await expect(runRoutine(consumer)).rejects.toThrow('unknown variable "$s1"');
  });

  it("on failure, reports the notes from steps that already succeeded plus which step broke", async () => {
    document.body.innerHTML = `<input id="tender_id" value="T-42" />`; // #search is missing
    const routine: Routine = {
      id: "sync",
      name: "Sync",
      binding: { code: "Digit2", ctrl: true, alt: true, shift: false, meta: false },
      enabled: true,
      steps: [
        { id: "s1", type: "readBySelector", selector: "#tender_id" },
        { id: "s2", type: "inputToSelector", selector: "#search", value: "$s1" }
      ]
    };

    try {
      await runRoutine(routine);
      expect.unreachable("expected runRoutine to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(StepError);
      const stepErr = err as StepError;
      expect(stepErr.notes).toEqual(['read "T-42"']); // step 1 succeeded
      expect(stepErr.stepIndex).toBe(1); // step 2 (0-indexed) is the one that broke
      expect(stepErr.step.type).toBe("inputToSelector");
      expect(stepErr.message).toMatch(/No element for "#search"/);
    }
  });
});

describe("runRoutine — the popup step", () => {
  function getPopup() {
    const host = document.getElementById("keyroutine-popup-host");
    return host?.shadowRoot?.querySelector(".panel") ?? null;
  }

  function pressEscape() {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  }

  it("shows a value read by an earlier step, and blocks until dismissed", async () => {
    document.body.innerHTML = `<input id="tender_id" value="T-42" />`;
    const routine: Routine = {
      id: "show",
      name: "Show",
      binding: { code: "Digit6", ctrl: true, alt: true, shift: false, meta: false },
      enabled: true,
      steps: [
        { id: "s1", type: "readBySelector", selector: "#tender_id" },
        { id: "s2", type: "popup", body: "ID: $s1" }
      ]
    };

    let finished = false;
    const run = runRoutine(routine).then((notes) => {
      finished = true;
      return notes;
    });
    await Promise.resolve(); // let the two steps run up to the popup

    expect(getPopup()!.querySelector(".body")!.textContent).toBe("ID: T-42");
    expect(getPopup()!.querySelector(".title")!.textContent).toBe("Show"); // $routineName fallback
    expect(finished).toBe(false); // the run is parked on the popup

    pressEscape();
    expect(await run).toEqual(['read "T-42"', 'popup "Show"']);
  });

  it("lists the other routines via $routines", async () => {
    const hotkeys: Routine = {
      id: "hotkeys",
      name: "Hotkeys",
      binding: { code: "Digit0", ctrl: true, alt: true, shift: false, meta: false },
      enabled: true,
      steps: [{ id: "s1", type: "popup", title: "KeyRoutine hotkeys", body: "$routines" }]
    };
    const other: Routine = {
      id: "copy",
      name: "Copy Tender",
      binding: { code: "Digit1", ctrl: true, alt: true, shift: false, meta: false },
      enabled: true,
      steps: []
    };

    const run = runRoutine(hotkeys, [
      { level: "common", label: "Everywhere", routines: [other, hotkeys] }
    ]);
    await Promise.resolve();

    const text = getPopup()!.querySelector(".body")!.textContent!;
    expect(text.split("\n")).toHaveLength(2); // a single section carries no heading
    expect(text).toContain("Copy Tender");
    expect(text).toContain("Hotkeys");

    pressEscape();
    await run;
  });

  it("an unknown $var in the body fails as a normal step error", async () => {
    const routine: Routine = {
      id: "bad",
      name: "Bad",
      binding: { code: "Digit7", ctrl: true, alt: true, shift: false, meta: false },
      enabled: true,
      steps: [{ id: "s1", type: "popup", body: "$typo" }]
    };

    await expect(runRoutine(routine)).rejects.toThrow('unknown variable "$typo"');
    expect(getPopup()).toBeNull(); // nothing was shown
  });
});
