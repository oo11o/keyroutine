import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { runStack, StepError } from "../src/content/runner";
import type { Stack, Step } from "../src/core/schema";

function stackOf(...steps: Step[]): Stack {
  return {
    id: "login",
    name: "Log in",
    binding: { code: "Digit9", ctrl: true, alt: true, shift: false, meta: false },
    enabled: true,
    steps
  };
}

const type = (selector: string, value: string): Step => ({
  id: "s1",
  type: "typeToSelector",
  selector,
  value
});

function field(): HTMLInputElement {
  return document.querySelector<HTMLInputElement>("#email")!;
}

beforeEach(() => {
  document.body.innerHTML = `<input id="email" value="" /><div id="notafield"></div>`;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("typeToSelector", () => {
  it("leaves the field holding the whole value", async () => {
    const notes = await runStack(stackOf(type("#email", "buyer_test@dzo.com.ua")));

    expect(field().value).toBe("buyer_test@dzo.com.ua");
    expect(notes).toEqual(['typed into "#email"']);
  });

  it("fires a full key sequence per character, which is the whole point", async () => {
    const seen: string[] = [];
    for (const name of ["keydown", "keypress", "input", "keyup"]) {
      field().addEventListener(name, () => seen.push(name));
    }

    await runStack(stackOf(type("#email", "ab")));

    expect(seen).toEqual([
      "keydown", "keypress", "input", "keyup",
      "keydown", "keypress", "input", "keyup"
    ]);
  });

  it("reports the character it is typing, so key handlers can read it", async () => {
    const keys: string[] = [];
    field().addEventListener("keydown", (e) => keys.push((e as KeyboardEvent).key));

    await runStack(stackOf(type("#email", "T-42")));

    expect(keys).toEqual(["T", "-", "4", "2"]);
  });

  it("grows the value one character at a time, not in one jump", async () => {
    const snapshots: string[] = [];
    field().addEventListener("input", () => snapshots.push(field().value));

    await runStack(stackOf(type("#email", "abc")));

    // A field whose handler reformats per keystroke depends on this.
    expect(snapshots).toEqual(["a", "ab", "abc"]);
  });

  it("bubbles, so a delegated handler on the form sees it", async () => {
    const onForm = vi.fn();
    document.body.addEventListener("input", onForm);

    await runStack(stackOf(type("#email", "ab")));

    expect(onForm).toHaveBeenCalledTimes(2);
    document.body.removeEventListener("input", onForm);
  });

  it("replaces what was already there rather than appending to it", async () => {
    field().value = "stale@example.com";

    await runStack(stackOf(type("#email", "new@example.com")));

    expect(field().value).toBe("new@example.com");
  });

  it("focuses the field first, as typing into an unfocused input cannot happen", async () => {
    await runStack(stackOf(type("#email", "a")));

    expect(document.activeElement).toBe(field());
  });

  it("substitutes $vars from earlier steps", async () => {
    document.body.innerHTML += `<input id="tender_id" value="T-42" />`;

    await runStack(
      stackOf({ id: "s1", type: "readBySelector", selector: "#tender_id" }, {
        id: "s2",
        type: "typeToSelector",
        selector: "#email",
        value: "$s1@dzo.com.ua"
      })
    );

    expect(field().value).toBe("T-42@dzo.com.ua");
  });

  it("fails the step when nothing matches", async () => {
    const err = await runStack(stackOf(type("#nope", "x"))).catch((e) => e);

    expect(err).toBeInstanceOf(StepError);
    expect(err.message).toBe('No element for "#nope"');
  });

  it("refuses an element that cannot hold text", async () => {
    const err = await runStack(stackOf(type("#notafield", "x"))).catch((e) => e);

    expect(err).toBeInstanceOf(StepError);
    expect(err.message).toMatch(/not an input or textarea/);
  });

  it("types nothing, and breaks nothing, for an empty value", async () => {
    field().value = "stale";
    const onKey = vi.fn();
    field().addEventListener("keydown", onKey);

    await runStack(stackOf(type("#email", "")));

    expect(field().value).toBe("");
    expect(onKey).not.toHaveBeenCalled();
  });
});
