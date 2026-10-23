import { describe, it, expect } from "vitest";
import { availableVars, referencedVars, unknownVars } from "../src/core/vars";
import type { Routine, Step } from "../src/core/schema";

// The user's own example: copy an id, fetch with it, show the JSON.
function jsonShow(): Routine {
  return {
    id: "jsonShow",
    name: "jsonShow",
    binding: { code: "Digit9", ctrl: true, alt: true, shift: false, meta: false },
    enabled: true,
    steps: [
      { id: "s1", type: "readBySelector", selector: "#tender_id", saveAs: "s1" },
      { id: "s2", type: "fetchUrl", url: "https://api.test/t/$s1", saveAs: "json" },
      { id: "s3", type: "popupJson", title: "Tender", body: "$json" }
    ]
  };
}

const names = (routine: Routine, at: number, vars: string[] = []) =>
  availableVars(routine, at, vars).map((v) => v.name);

describe("availableVars", () => {
  it("offers nothing from the routine itself to the first step", () => {
    expect(names(jsonShow(), 0)).toEqual(["url", "title", "selection", "routines", "routineName"]);
  });

  it("offers an earlier producer by the name in its Save as", () => {
    expect(names(jsonShow(), 1)).toContain("s1");
  });

  it("offers a producer by its name and never by its id", () => {
    const at3 = names(jsonShow(), 2);
    expect(at3).toContain("json"); // the fetch's Save as
    expect(at3).not.toContain("s2"); // its id, which nothing reads
  });

  it("does not offer a step its own output, or a later step's", () => {
    // $json at step 2 would be the value this step has not produced yet.
    expect(names(jsonShow(), 1)).not.toContain("json");
  });

  it("offers $value only for the most recent producer", () => {
    const vars = availableVars(jsonShow(), 2);
    const value = vars.find((v) => v.name === "value");
    expect(value?.note).toMatch(/\$json/);
  });

  it("does not offer $value before anything has produced one", () => {
    expect(names(jsonShow(), 0)).not.toContain("value");
  });

  it("skips steps that produce nothing", () => {
    const routine = jsonShow();
    routine.steps = [
      { id: "s1", type: "clickBySelector", selector: "#go" },
      { id: "s2", type: "wait", ms: 100 }
    ];
    expect(names(routine, 2)).not.toContain("s1");
  });

  it("offers the Variables tab's names as they are written", () => {
    expect(names(jsonShow(), 0, ["runToken"])).toContain("runToken");
  });

  it("offers a shadowed name once", () => {
    const routine = jsonShow();
    routine.steps = [
      { id: "s1", type: "readBySelector", selector: "#a", saveAs: "id" },
      { id: "s2", type: "readBySelector", selector: "#b", saveAs: "id" }
    ];
    expect(names(routine, 2).filter((n) => n === "id")).toEqual(["id"]);
  });
});

describe("referencedVars", () => {
  it("finds every $name", () => {
    expect(referencedVars("https://a.test/$s1?run=$token")).toEqual(["s1", "token"]);
  });

  it("ignores an escaped $$", () => {
    expect(referencedVars("costs $$5, id $s1")).toEqual(["s1"]);
  });

  it("finds nothing in plain text", () => {
    expect(referencedVars("#tender_id")).toEqual([]);
  });
});

describe("unknownVars", () => {
  it("passes the routine it was built for", () => {
    expect(unknownVars(jsonShow())).toEqual([]);
  });

  it("catches a typo, naming the step and the field it is in", () => {
    const routine = jsonShow();
    (routine.steps[2] as Extract<Step, { type: "popupJson" }>).body = "$jsno";

    expect(unknownVars(routine)).toEqual([
      { stepIndex: 2, stepId: "s3", field: "body", name: "jsno" }
    ]);
  });

  it("catches a forward reference — a value the step runs too early to have", () => {
    const routine = jsonShow();
    (routine.steps[0] as Extract<Step, { type: "readBySelector" }>).saveAs = "id";
    (routine.steps[1] as Extract<Step, { type: "fetchUrl" }>).url = "https://api.test/t/$json";

    expect(unknownVars(routine)).toMatchObject([{ stepId: "s2", name: "json" }]);
  });

  it("accepts a variable only when the Variables tab has one", () => {
    const routine = jsonShow();
    (routine.steps[1] as Extract<Step, { type: "fetchUrl" }>).url = "https://api.test/?run=$runToken";

    expect(unknownVars(routine)).toMatchObject([{ name: "runToken" }]);
    expect(unknownVars(routine, ["runToken"])).toEqual([]);
  });

  it("does not look for variables in a selector, which is never interpolated", () => {
    const routine = jsonShow();
    (routine.steps[0] as Extract<Step, { type: "readBySelector" }>).selector = "[data-id=$nope]";

    expect(unknownVars(routine)).toEqual([]);
  });
});
