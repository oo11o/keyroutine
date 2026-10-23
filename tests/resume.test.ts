import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { runRoutine, type Resume } from "../src/content/runner";
import type { Routine } from "../src/core/schema";

vi.mock("../src/page/navigate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/page/navigate")>();
  return { ...actual, navigateHere: vi.fn() };
});

// The routine a suspended run comes back to: the navigation already happened
// on the previous page, so only s3 is left.
function routine(): Routine {
  return {
    id: "sync",
    name: "Sync Tender",
    binding: { code: "Digit8", ctrl: true, alt: true, shift: false, meta: false },
    enabled: true,
    steps: [
      { id: "s1", type: "readBySelector", selector: "#tender_id" },
      { id: "s2", type: "openUrlInCurrentTab", url: "http://dzo.lh/tenders/new" },
      { id: "s3", type: "inputToSelector", selector: "#field", value: "$s1" }
    ]
  };
}

beforeEach(() => {
  document.body.innerHTML = `<input id="field" value="" />`;
  vi.stubGlobal("chrome", { runtime: { sendMessage: vi.fn().mockResolvedValue({}) } });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("resuming a routine across a navigation", () => {
  it("continues from nextStep with the variables the earlier page produced", async () => {
    // #tender_id does not exist on this page — s1 would throw if it ran.
    await runRoutine(routine(), undefined, {}, {
      nextStep: 2,
      vars: [["s1", "T-42"]],
      notes: []
    });

    expect(document.querySelector<HTMLInputElement>("#field")!.value).toBe("T-42");
  });

  it("carries the earlier notes so the final toast covers the whole run", async () => {
    const notes = await runRoutine(routine(), undefined, {}, {
      nextStep: 2,
      vars: [["s1", "T-42"]],
      notes: ['read "T-42"', "went to http://dzo.lh/tenders/new"]
    });

    expect(notes).toEqual(['read "T-42"', "went to http://dzo.lh/tenders/new", 'filled "#field"']);
  });

  it("re-seeds builtins from the page it landed on, not the page it left", async () => {
    const s = routine();
    s.steps[2] = { id: "s3", type: "inputToSelector", selector: "#field", value: "$url" };

    await runRoutine(s, undefined, {}, { nextStep: 2, vars: [], notes: [] });

    // $url is this document's, not whatever it was when the routine started.
    expect(document.querySelector<HTMLInputElement>("#field")!.value).toBe(location.href);
  });

  it("re-seeds your variables, which are deliberately never persisted", async () => {
    const s = routine();
    s.steps[2] = { id: "s3", type: "inputToSelector", selector: "#field", value: "$runToken" };

    await runRoutine(s, undefined, { runToken: "hunter2" }, { nextStep: 2, vars: [], notes: [] });

    expect(document.querySelector<HTMLInputElement>("#field")!.value).toBe("hunter2");
  });

  it("lets a restored variable shadow a builtin, as it did before the navigation", async () => {
    const s = routine();
    s.steps[2] = { id: "s3", type: "inputToSelector", selector: "#field", value: "$url" };

    await runRoutine(s, undefined, {}, { nextStep: 2, vars: [["url", "saved-by-a-step"]], notes: [] });

    expect(document.querySelector<HTMLInputElement>("#field")!.value).toBe("saved-by-a-step");
  });

  it("drives a two-boundary routine to the end by replaying its own records", async () => {
    // The real logout routine: logout, then the new-tender page, then fill the
    // login form that page redirects to. Three steps, two navigations, three
    // separate content-script lifetimes — here each "page" is one runRoutine
    // call fed the record the previous one parked.
    const saved: Resume[] = [];
    vi.stubGlobal("chrome", {
      runtime: {
        sendMessage: vi.fn(async (msg: { record?: Resume }) => {
          if (msg.record) saved.push(msg.record);
          return {};
        })
      }
    });
    const s: Routine = {
      ...routine(),
      steps: [
        { id: "s1", type: "openUrlInCurrentTab", url: "http://dzo.lh/cabinet/logout" },
        { id: "s2", type: "openUrlInCurrentTab", url: "http://dzo.lh/tenders/new" },
        { id: "s3", type: "inputToSelector", selector: '[name="email"]', value: "buyer_test@dzo.com.ua" }
      ]
    };
    document.body.innerHTML = `<input name="email" value="" />`;

    await runRoutine(s); // page 1: logs out, parks s2+s3
    expect(saved.at(-1)!.nextStep).toBe(1);

    await runRoutine(s, undefined, {}, saved.at(-1)); // page 2: navigates, parks s3
    expect(saved.at(-1)!.nextStep).toBe(2);

    const notes = await runRoutine(s, undefined, {}, saved.at(-1)); // page 3: fills the form

    expect(document.querySelector<HTMLInputElement>('[name="email"]')!.value).toBe(
      "buyer_test@dzo.com.ua"
    );
    // One toast at the end, covering all three steps across all three pages.
    expect(notes).toEqual([
      "went to http://dzo.lh/cabinet/logout",
      "went to http://dzo.lh/tenders/new",
      'filled "[name=\"email\"]"'
    ]);
  });

  it("suspends again when the resumed half navigates too", async () => {
    const { navigateHere } = await import("../src/page/navigate");
    const s = routine();
    s.steps.push({ id: "s4", type: "openUrlInCurrentTab", url: "http://dzo.lh/step-two" });
    s.steps.push({ id: "s5", type: "popup", body: "done" });

    await runRoutine(s, undefined, {}, { nextStep: 2, vars: [["s1", "T-42"]], notes: [] });

    // Two boundaries in one routine is just the same mechanism twice.
    expect(vi.mocked(navigateHere)).toHaveBeenCalledWith("http://dzo.lh/step-two");
  });
});
