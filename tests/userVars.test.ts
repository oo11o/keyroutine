import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { runRoutine, StepError } from "../src/content/runner";
import { resolve, seedVars, type RunContext } from "../src/core/context";
import { present } from "../src/content/presenter";
import type { Routine } from "../src/core/schema";

// The values from the Variables tab: stored once, read as $<name>. They were
// called secrets and carried a "secret_" prefix until 0.7 — see
// core/context.ts for why neither survived.

let open: ReturnType<typeof vi.spyOn>;

function syncRoutine(url: string): Routine {
  return {
    id: "sync",
    name: "Sync Tender",
    binding: { code: "Digit3", ctrl: true, alt: true, shift: false, meta: false },
    enabled: true,
    steps: [
      { id: "s1", type: "readBySelector", selector: "#tender_id" },
      { id: "s2", type: "openUrlInNewTab", url }
    ]
  };
}

beforeEach(() => {
  document.body.innerHTML = "";
  open = vi.spyOn(window, "open").mockReturnValue({} as Window);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("seedVars", () => {
  it("seeds each variable under its own bare name", () => {
    const ctx: RunContext = new Map();
    seedVars(ctx, { runToken: "abc123" });

    expect(resolve("run=$runToken", ctx)).toBe("run=abc123");
  });

  it("leaves the context untouched when there are none", () => {
    const ctx: RunContext = new Map();
    seedVars(ctx, {});
    expect(ctx.size).toBe(0);
  });
});

describe("variables in a routine", () => {
  it("substitutes one into an openUrlInNewTab template", async () => {
    document.body.innerHTML = `<input id="tender_id" value="T-42" />`;

    await runRoutine(syncRoutine("http://dzo.lh/sync.php?id=$s1&run=$runToken"), undefined, {
      runToken: "ksdjfgnsaerhtoiaerhg"
    });

    expect(open.mock.calls[0][0]).toBe("http://dzo.lh/sync.php?id=T-42&run=ksdjfgnsaerhtoiaerhg");
  });

  it("fails loudly when a referenced variable has not been set", async () => {
    document.body.innerHTML = `<input id="tender_id" value="T-42" />`;

    const err = await runRoutine(syncRoutine("http://dzo.lh/sync.php?run=$missing")).catch((e) => e);

    expect(err).toBeInstanceOf(StepError);
    expect(err.message).toMatch(/unknown variable "\$missing"/);
    expect(open).not.toHaveBeenCalled();
  });

  it("does not charge seeded variables against the step variable budget", async () => {
    document.body.innerHTML = `<input id="tender_id" value="T-42" />`;
    const many = Object.fromEntries(Array.from({ length: 80 }, (_, i) => [`k${i}`, `v${i}`]));

    // 80 variables is well past MAX_VARS (64); only what steps *write* counts.
    await expect(
      runRoutine(syncRoutine("http://dzo.lh/sync.php?id=$s1"), undefined, many)
    ).resolves.toBeDefined();
  });

  // Seeded after the builtins, so this is what a collision does. The Variables
  // tab refuses a builtin's name for exactly this reason, but a config can
  // still be imported or hand-written.
  it("lets a variable shadow a builtin of the same name", async () => {
    document.body.innerHTML = `<input id="field" />`;
    const routine = syncRoutine("http://dzo.lh/x");
    routine.steps = [{ id: "s1", type: "inputToSelector", selector: "#field", value: "$url" }];

    await runRoutine(routine, undefined, { url: "not-this-page" });

    expect(document.querySelector<HTMLInputElement>("#field")!.value).toBe("not-this-page");
  });
});

describe("present", () => {
  const settings = { debug: false, toast: "max" as const };
  const routine = syncRoutine("http://dzo.lh/sync.php?run=$runToken");

  function toastText(): string {
    const host = document.getElementById("keyroutine-toast-host");
    return host?.shadowRoot?.querySelector(".detail")?.textContent ?? "";
  }

  // Values used to be masked here. They are not any more: a variable is an
  // ordinary value now, and seeing what a step actually did is worth more than
  // hiding a token that is already in plaintext on this machine.
  it("shows the step note as it was written, value and all", () => {
    const outcome = {
      ok: true as const,
      notes: ['read "T-42"', "opened http://dzo.lh/sync.php?run=ksdjfgnsaerhtoiaerhg"]
    };

    present("Ctrl+Alt+3", routine, outcome, settings);

    expect(toastText()).toContain("ksdjfgnsaerhtoiaerhg");
  });
});
