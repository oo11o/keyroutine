import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  STEP_GROUPS,
  STEP_META,
  STEP_TYPES,
  blankStep,
  isStepType,
  formFields,
  templateFields
} from "../src/core/stepMeta";
import { handlers } from "../src/steps";
import { isParsed, parseConfig } from "../src/core/configStore";
import type { Step } from "../src/core/schema";

describe("STEP_META", () => {
  it("describes exactly the step types that have a handler", () => {
    // The two registries are the two halves of a step: one runs it, one edits
    // it. A type in only one of them is a step you can build and not run, or
    // run and not build.
    expect(STEP_TYPES.sort()).toEqual(Object.keys(handlers).sort());
  });

  it("gives every step a label, a help line and a group the menu knows", () => {
    const groups = STEP_GROUPS.map((g) => g.group);
    for (const type of STEP_TYPES) {
      const meta = STEP_META[type];
      expect(meta.label, type).toBeTruthy();
      expect(meta.help, type).toBeTruthy();
      expect(groups, type).toContain(meta.group);
    }
  });

  it("marks as producers exactly the steps the runner binds a value from", () => {
    // If this list grows, content/runner.ts's saveAs handling has to as well —
    // and the variable picker would be offering names that never exist.
    expect(STEP_TYPES.filter((t) => STEP_META[t].produces).sort()).toEqual([
      "fetchUrl",
      "readBySelector"
    ]);
  });

  it("offers saveAs on the producers and nowhere else", () => {
    for (const type of STEP_TYPES) {
      const hasSaveAs = STEP_META[type].fields.some((f) => f.name === "saveAs");
      expect(hasSaveAs, type).toBe(STEP_META[type].produces);
    }
  });

  it("gives every step an icon and a line about what it leaves behind", () => {
    for (const type of STEP_TYPES) {
      const meta = STEP_META[type];
      expect(meta.icon, type).toBeTruthy();
      expect(meta.outNote, type).toBeTruthy();
      // The variable name a producer's result arrives under, which is also the
      // step's default id. A step that produces nothing must not suggest one.
      expect(Boolean(meta.varName), type).toBe(meta.produces);
      if (meta.varName) expect(meta.varName, type).toMatch(/^\w+$/);
    }
  });

  it("keeps the result's own name out of the form fields", () => {
    // saveAs names the result rather than configuring the step, so the builder
    // edits it in the Result box. It stays in `fields` — an imported config may
    // carry one, and parseConfig reads this list.
    expect(formFields("fetchUrl").map((f) => f.name)).toEqual(["url"]);
    expect(STEP_META.fetchUrl.fields.map((f) => f.name)).toEqual(["url", "saveAs"]);
  });

  it("never marks a required field as advanced — nothing mandatory may hide", () => {
    for (const type of STEP_TYPES) {
      for (const f of STEP_META[type].fields) {
        expect(f.required && f.advanced, `${type}.${f.name}`).toBeFalsy();
      }
    }
  });

  it("names each field once per step", () => {
    for (const type of STEP_TYPES) {
      const names = STEP_META[type].fields.map((f) => f.name);
      expect(new Set(names).size, type).toBe(names.length);
    }
  });

  it("offers the variable picker on every field that is interpolated, and no selector", () => {
    expect(templateFields("fetchUrl").map((f) => f.name)).toEqual(["url"]);
    expect(templateFields("popupJson").map((f) => f.name)).toEqual(["title", "body"]);
    // A selector is structure, not data: no handler resolves one through a
    // template, so offering $vars there would be a lie.
    expect(templateFields("clickBySelector")).toEqual([]);
  });

  it("summarises a step in one line without throwing on a half-filled one", () => {
    for (const type of STEP_TYPES) {
      const empty = { id: "s1", type } as Step;
      expect(() => STEP_META[type].summary(empty), type).not.toThrow();
      expect(STEP_META[type].summary(empty), type).toBeTruthy();
    }
    // The summary sits under the action's title in a mono line, so it carries
    // the thing that varies and nothing else — the title already said "Fetch".
    expect(STEP_META.fetchUrl.summary({ id: "s2", type: "fetchUrl", url: "https://a.test/$s1" })).toBe(
      "https://a.test/$s1"
    );
    expect(
      STEP_META.typeToSelector.summary({ id: "s2", type: "typeToSelector", selector: "#q", value: "$text" })
    ).toBe("$text → #q");
  });

  it("recognises a step type only when it really is one", () => {
    expect(isStepType("fetchUrl")).toBe(true);
    expect(isStepType("openUrl")).toBe(false); // the v0.5 rename
    expect(isStepType(undefined)).toBe(false);
    expect(isStepType("toString")).toBe(false); // an inherited property is not a step type
  });
});

describe("blankStep", () => {
  it("fills in defaults and leaves optional fields out", () => {
    expect(blankStep("waitForSelector", "s3")).toEqual({
      id: "s3",
      type: "waitForSelector",
      selector: "",
      timeoutMs: 5000
    });
  });

  it("produces something the parser rejects for the right reason — a blank required field", () => {
    const stack = {
      id: "new",
      name: "New",
      binding: { code: "Digit9", ctrl: true, alt: true, shift: false, meta: false },
      enabled: true,
      steps: [blankStep("fetchUrl", "s1")]
    };
    const result = parseConfig({ stacks: [stack] });

    expect(isParsed(result)).toBe(false);
    expect(isParsed(result) ? [] : result.errors).toContain('stack "new" step #1: fetchUrl needs "URL"');
  });
});

describe("the bundled seed", () => {
  it("parses, so a fresh install is never seeded with something broken", () => {
    const raw = JSON.parse(readFileSync("public/config/stacks.json", "utf8"));

    const result = parseConfig(raw);

    expect(isParsed(result) ? [] : result.errors).toEqual([]);
  });
});
