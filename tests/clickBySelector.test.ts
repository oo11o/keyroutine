import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { runRoutine, StepError } from "../src/content/runner";
import type { Routine, Step } from "../src/core/schema";

// Scoped to a site: several step types here are site-only now (anything
// that names a selector, since a selector written for one page's markup
// means nothing, or the wrong thing, on every other page a Common routine
// would also fire on) — see siteOnly in core/stepMeta.ts.
function routineOf(...steps: Step[]): Routine {
  return {
    id: "login",
    name: "Log in",
    binding: { code: "Digit9", ctrl: true, alt: true, shift: false, meta: false },
    enabled: true,
    siteId: "site",
    steps
  };
}

const click = (selector: string): Step => ({ id: "s1", type: "clickBySelector", selector });

beforeEach(() => {
  document.body.innerHTML = `<button id="submit">Send</button><input id="after" value="" />`;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("clickBySelector", () => {
  it("clicks the element the selector matches", async () => {
    const onClick = vi.fn();
    document.querySelector("#submit")!.addEventListener("click", onClick);

    const notes = await runRoutine(routineOf(click("#submit")));

    expect(onClick).toHaveBeenCalledOnce();
    expect(notes).toEqual(['clicked "#submit"']);
  });

  it("dispatches a bubbling click, so delegated handlers see it", async () => {
    // This is what makes it work on React, whose listener sits at the root
    // container rather than on the button itself.
    const onDocument = vi.fn();
    document.addEventListener("click", onDocument);

    await runRoutine(routineOf(click("#submit")));

    expect(onDocument).toHaveBeenCalledOnce();
    expect(onDocument.mock.calls[0][0].target).toBe(document.querySelector("#submit"));
    document.removeEventListener("click", onDocument);
  });

  it("fails the step when nothing matches, rather than clicking nothing", async () => {
    const onDocument = vi.fn();
    document.addEventListener("click", onDocument);

    const err = await runRoutine(routineOf(click("#nope"))).catch((e) => e);

    expect(err).toBeInstanceOf(StepError);
    expect(err.message).toBe('No element for "#nope"');
    expect(onDocument).not.toHaveBeenCalled();
    document.removeEventListener("click", onDocument);
  });

  it("keeps running the routine when the click does not navigate", async () => {
    const routine = routineOf(click("#submit"), {
      id: "s2",
      type: "inputToSelector",
      selector: "#after",
      value: "ran"
    });

    const notes = await runRoutine(routine);

    expect(document.querySelector<HTMLInputElement>("#after")!.value).toBe("ran");
    expect(notes).toHaveLength(2);
  });

  describe("parking ahead of a navigating click", () => {
    beforeEach(() => {
      vi.stubGlobal("chrome", { runtime: { sendMessage: vi.fn().mockResolvedValue({}) } });
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("parks before clicking a submit button inside a form", async () => {
      document.body.innerHTML = `<form><button id="submit" type="submit">Send</button></form>`;
      const sendMessage = vi.mocked(chrome.runtime.sendMessage);

      const routine = routineOf(click("#submit"), { id: "s2", type: "saveValue", saveAs: "x", value: "done" });
      await runRoutine(routine);

      const [request] = sendMessage.mock.calls[0];
      expect(request).toMatchObject({
        type: "keyroutine-save-resume",
        record: { routineId: "login", nextStep: 1 }
      });
    });

    it("parks before clicking a plain link", async () => {
      document.body.innerHTML = `<a id="submit" href="/next">Go</a>`;
      const sendMessage = vi.mocked(chrome.runtime.sendMessage);

      const routine = routineOf(click("#submit"), { id: "s2", type: "saveValue", saveAs: "x", value: "done" });
      await runRoutine(routine);

      expect(sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: "keyroutine-save-resume" })
      );
    });

    it("does not park for a plain button with no form and no href", async () => {
      // #submit in the top-level fixture is a bare <button>, outside any form.
      const sendMessage = vi.mocked(chrome.runtime.sendMessage);

      await runRoutine(routineOf(click("#submit"), { id: "s2", type: "saveValue", saveAs: "x", value: "done" }));

      expect(sendMessage).not.toHaveBeenCalled();
    });

    it("does not park when the navigating click is the routine's last step", async () => {
      document.body.innerHTML = `<form><button id="submit" type="submit">Send</button></form>`;
      const sendMessage = vi.mocked(chrome.runtime.sendMessage);

      await runRoutine(routineOf(click("#submit")));

      expect(sendMessage).not.toHaveBeenCalled();
    });
  });
});
