import { describe, it, expect } from "vitest";
import { resolve, BUILTINS } from "../src/core/context";
import { formatBinding } from "../src/core/keys";
import type { Routine } from "../src/core/schema";
import type { RoutineSection } from "../src/core/match";
import { formatRoutineList, seedBuiltins } from "../src/page/builtins";

describe("seedBuiltins", () => {
  const routine = (id: string, name: string, code: string, enabled = true): Routine => ({
    id,
    name,
    binding: { code, ctrl: true, alt: true, shift: false, meta: false },
    enabled,
    steps: []
  });

  // $routines is grouped by scope, so what seedBuiltins takes is sections.
  const everywhere = (...routines: Routine[]): RoutineSection[] => [
    { level: "common", label: "Everywhere", routines }
  ];

  it("fills every builtin named in BUILTINS", () => {
    const ctx = new Map<string, string>();
    seedBuiltins(ctx, everywhere(routine("a", "A", "Digit1")));
    for (const name of BUILTINS) expect(ctx.has(name)).toBe(true);
  });

  it("$routines lists only enabled routines, chord first, names aligned", () => {
    const ctx = new Map<string, string>();
    seedBuiltins(
      ctx,
      everywhere(
        routine("a", "Copy Tender", "Digit1"),
        routine("b", "Sync", "Digit2"),
        routine("c", "Off", "Digit3", false)
      )
    );
    const lines = ctx.get("routines")!.split("\n");
    expect(lines).toHaveLength(2); // the disabled routine is not listed, and one section needs no heading
    expect(lines[0]).toBe(`${formatBinding(routine("a", "A", "Digit1").binding)}  Copy Tender`);
    expect(lines[0].indexOf("Copy Tender")).toBe(lines[1].indexOf("Sync")); // aligned
  });

  it("$routineName is the running routine's name", () => {
    const ctx = new Map<string, string>();
    const current = routine("a", "Copy Tender", "Digit1");
    seedBuiltins(ctx, everywhere(current), current);
    expect(resolve("$routineName", ctx)).toBe("Copy Tender");
  });

  it("a step can shadow a builtin by writing over it", () => {
    const ctx = new Map<string, string>();
    seedBuiltins(ctx, everywhere());
    ctx.set("url", "https://example.test/overridden"); // what saveAs: "url" would do
    expect(resolve("$url", ctx)).toBe("https://example.test/overridden");
  });
});

describe("formatRoutineList — the cheatsheet's three tiers", () => {
  const routine = (name: string, code: string, enabled = true): Routine => ({
    id: name,
    name,
    binding: { code, ctrl: true, alt: true, shift: false, meta: false },
    enabled,
    steps: []
  });

  const sections: RoutineSection[] = [
    { level: "url", label: "This URL · new tender", routines: [routine("logoutLogin", "Digit8")] },
    { level: "domain", label: "This domain · dzo.lh", routines: [routine("Sync", "Digit3")] },
    { level: "common", label: "Everywhere", routines: [routine("Copy Tender", "Digit1")] }
  ];

  it("heads each tier and keeps them in the order they were given — narrowest first", () => {
    const lines = formatRoutineList(sections).split("\n");

    expect(lines.filter((l) => !l.startsWith(" ") && l !== "")).toEqual([
      "This URL · new tender",
      "This domain · dzo.lh",
      "Everywhere"
    ]);
  });

  it("indents the routines under their heading and separates the tiers", () => {
    const text = formatRoutineList(sections);

    expect(text).toContain("\n\nThis domain · dzo.lh\n  ");
    expect(text.split("\n").filter((l) => l.includes("Sync"))[0].startsWith("  ")).toBe(true);
  });

  it("aligns names across every tier, not just within one", () => {
    // A long chord in one section still pushes the other sections' names over,
    // so the whole popup reads as one column.
    const wide = [
      {
        level: "url" as const,
        label: "This URL · x",
        routines: [routine("Long", "ArrowDown")]
      },
      ...sections.slice(-1)
    ];
    const lines = formatRoutineList(wide).split("\n").filter((l) => l.startsWith("  "));

    expect(lines[0].indexOf("Long")).toBe(lines[1].indexOf("Copy Tender"));
  });

  it("leaves out a tier with nothing enabled in it", () => {
    const withEmpty: RoutineSection[] = [
      { level: "domain", label: "This domain · dzo.lh", routines: [routine("Off", "Digit9", false)] },
      sections.at(-1)!
    ];

    // One section survives, so it is shown bare — no heading to tell it apart
    // from anything.
    expect(formatRoutineList(withEmpty)).toBe(formatRoutineList([sections.at(-1)!]));
    expect(formatRoutineList(withEmpty)).not.toContain("Everywhere");
  });

  it("is empty when nothing applies at all", () => {
    expect(formatRoutineList([])).toBe("");
  });
});
