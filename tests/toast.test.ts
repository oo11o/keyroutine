import { describe, it, expect } from "vitest";
import { showResultToast } from "../src/ui/toast";

function getToastEl(): HTMLElement {
  const host = document.getElementById("keyroutine-toast-host")!;
  const container = host.shadowRoot!.getElementById("zone")!;
  return container.firstElementChild as HTMLElement;
}

describe("showResultToast", () => {
  it("min: success shows chord + name only, no step list", () => {
    showResultToast("Ctrl+Alt+1", "Routine", { ok: true, notes: ["did x"] }, "min");
    const el = getToastEl();
    expect(el.querySelector(".chord")!.textContent).toBe("Ctrl+Alt+1");
    expect(el.querySelector(".detail")!.textContent).toBe("✓ Routine");
  });

  it("min: failure shows chord + name + reason, no step list", () => {
    showResultToast(
      "Ctrl+Alt+2",
      "Routine",
      { ok: false, notes: ["did x"], stepIndex: 1, stepType: "inputToSelector", message: "boom" },
      "min"
    );
    const el = getToastEl();
    expect(el.querySelector(".detail")!.textContent).toBe("✗ Routine: boom");
  });

  it("max: success shows a numbered step list", () => {
    showResultToast("Ctrl+Alt+3", "Routine", { ok: true, notes: ["a", "b"] }, "max");
    const el = getToastEl();
    expect(el.querySelector(".detail")!.textContent).toBe("✓ Routine\n\n1. a\n2. b");
  });

  it("max: failure shows completed steps, a separator, then the failing step", () => {
    showResultToast(
      "Ctrl+Alt+4",
      "Routine",
      { ok: false, notes: ["a"], stepIndex: 1, stepType: "inputToSelector", message: "boom" },
      "max"
    );
    const el = getToastEl();
    expect(el.querySelector(".detail")!.textContent).toBe(
      "✗ Routine\n\n1. a\n\n-----------------------\n2. ✗ inputToSelector: boom"
    );
  });

  it("max: failure collapses a long run of completed steps to first 5 … last 3", () => {
    const notes = Array.from({ length: 14 }, (_, i) => `step ${i + 1}`); // 14 > the collapse threshold
    showResultToast(
      "Ctrl+Alt+6",
      "Routine",
      { ok: false, notes, stepIndex: 14, stepType: "inputToSelector", message: "boom" },
      "max"
    );
    const el = getToastEl();

    expect(el.querySelector(".detail")!.textContent).toBe(
      "✗ Routine\n\n" +
        "1. step 1\n2. step 2\n3. step 3\n4. step 4\n5. step 5\n" +
        "… 6 more\n" +
        "12. step 12\n13. step 13\n14. step 14\n\n" +
        "-----------------------\n15. ✗ inputToSelector: boom"
    );
  });

  it("max: failure lists every step in full once it's short enough that collapsing would save nothing", () => {
    const notes = Array.from({ length: 9 }, (_, i) => `step ${i + 1}`); // at the threshold, not over it
    showResultToast(
      "Ctrl+Alt+7",
      "Routine",
      { ok: false, notes, stepIndex: 9, stepType: "wait", message: "boom" },
      "max"
    );
    const el = getToastEl();

    expect(el.querySelector(".detail")!.textContent).toContain("1. step 1\n2. step 2");
    expect(el.querySelector(".detail")!.textContent).not.toContain("more");
  });

  it("none: leaves whatever toast is showing untouched", () => {
    showResultToast("Ctrl+Alt+3", "Routine", { ok: true, notes: ["a", "b"] }, "max");
    const before = getToastEl().querySelector(".detail")!.textContent;

    showResultToast("Ctrl+Alt+5", "Different", { ok: true, notes: ["z"] }, "none");
    const after = getToastEl().querySelector(".detail")!.textContent;

    expect(after).toBe(before);
  });
});
