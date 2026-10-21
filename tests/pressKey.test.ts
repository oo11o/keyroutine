import { describe, it, expect, beforeEach, vi } from "vitest";
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

const press = (key: string, id = "s1"): Step => ({ id, type: "pressKey", key });
const focus = (selector: string, id = "s1"): Step => ({ id, type: "focusBySelector", selector });

function field(): HTMLInputElement {
  return document.querySelector<HTMLInputElement>("#email")!;
}

beforeEach(() => {
  document.body.innerHTML = `<form id="form"><input id="email" /></form>`;
});

describe("pressKey", () => {
  it("sends the key to whatever has focus", async () => {
    const keys: string[] = [];
    field().addEventListener("keydown", (e) => keys.push((e as KeyboardEvent).key));

    await runStack(stackOf(focus("#email", "s1"), press("Enter", "s2")));

    expect(keys).toEqual(["Enter"]);
  });

  it("fires keydown, keypress and keyup for Enter", async () => {
    const seen: string[] = [];
    for (const n of ["keydown", "keypress", "keyup"]) {
      field().addEventListener(n, () => seen.push(n));
    }

    await runStack(stackOf(focus("#email", "s1"), press("Enter", "s2")));

    expect(seen).toEqual(["keydown", "keypress", "keyup"]);
  });

  it("omits keypress for keys a real keyboard never sends one for", async () => {
    const seen: string[] = [];
    for (const n of ["keydown", "keypress", "keyup"]) {
      field().addEventListener(n, () => seen.push(n));
    }

    await runStack(stackOf(focus("#email", "s1"), press("ArrowDown", "s2")));

    expect(seen).toEqual(["keydown", "keyup"]);
  });

  it("sets the legacy keyCode, which older form code still branches on", async () => {
    const codes: number[] = [];
    field().addEventListener("keydown", (e) => codes.push((e as KeyboardEvent).keyCode));

    await runStack(stackOf(focus("#email", "s1"), press("Enter", "s2")));

    expect(codes).toEqual([13]); // if (e.keyCode === 13) is everywhere
  });

  it("sets `which` too, for the same reason", async () => {
    const which: number[] = [];
    field().addEventListener("keydown", (e) => which.push((e as KeyboardEvent).which));

    await runStack(stackOf(focus("#email", "s1"), press("Escape", "s2")));

    expect(which).toEqual([27]);
  });

  it("sets code as the physical key, not the character", async () => {
    const codes: string[] = [];
    field().addEventListener("keydown", (e) => codes.push((e as KeyboardEvent).code));

    await runStack(stackOf(focus("#email", "s1"), press("a", "s2")));

    expect(codes).toEqual(["KeyA"]);
  });

  it("bubbles, so a handler on the form sees the key", async () => {
    const onForm = vi.fn();
    document.querySelector("#form")!.addEventListener("keydown", onForm);

    await runStack(stackOf(focus("#email", "s1"), press("Enter", "s2")));

    expect(onForm).toHaveBeenCalledOnce();
  });

  it("goes to body when nothing is focused, and says so in the note", async () => {
    const onBody = vi.fn();
    document.body.addEventListener("keydown", onBody);

    const notes = await runStack(stackOf(press("Escape")));

    expect(onBody).toHaveBeenCalledOnce();
    expect(notes).toEqual(['pressed "Escape" (nothing focused)']);
  });

  it("names the key in the note on success", async () => {
    const notes = await runStack(stackOf(focus("#email", "s1"), press("Enter", "s2")));

    expect(notes[1]).toBe('pressed "Enter"');
  });

  it("fails the step when no key is given", async () => {
    const err = await runStack(stackOf({ id: "s1", type: "pressKey", key: "" })).catch((e) => e);

    expect(err).toBeInstanceOf(StepError);
    expect(err.message).toMatch(/needs a key/);
  });

  it("does not type text — a printable key inserts nothing", async () => {
    await runStack(stackOf(focus("#email", "s1"), press("a", "s2")));

    // Untrusted events carry no default behaviour; inputToSelector is the
    // step that actually puts text in a field.
    expect(field().value).toBe("");
  });
});
