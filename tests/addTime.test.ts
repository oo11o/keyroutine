import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { runRoutine, StepError } from "../src/content/runner";
import type { Routine, Step } from "../src/core/schema";
import type { DateFormatName } from "../src/core/dateFormats";

// Pinned so the format spot-checks below actually exercise local-time
// formatting (not just happen to pass because the test machine is UTC) —
// see the same comment in dateFormats.test.ts. Kyiv is UTC+2 in November,
// no DST active.
let previousTZ: string | undefined;
beforeAll(() => {
  previousTZ = process.env.TZ;
  process.env.TZ = "Europe/Kyiv";
});
afterAll(() => {
  process.env.TZ = previousTZ;
});

function routineOf(...steps: Step[]): Routine {
  return {
    id: "r",
    name: "R",
    binding: { code: "Digit9", ctrl: true, alt: true, shift: false, meta: false },
    enabled: true,
    steps
  };
}

const addTime = (
  base: string,
  amount: number,
  unit: "seconds" | "minutes" | "hours" | "days",
  id = "s1"
): Step => ({ id, type: "addTime", base, amount, unit });

const addTimeFormatted = (base: string, format: DateFormatName, id = "s1"): Step => ({
  id,
  type: "addTime",
  base,
  amount: 0,
  unit: "minutes",
  format
});

describe("addTime", () => {
  it("shifts a fixed date forward by minutes", async () => {
    const routine = routineOf(addTime("2026-11-13T12:00:00.000Z", 15, "minutes", "s1"));
    const notes = await runRoutine(routine);

    expect(notes).toEqual(['2026-11-13T12:00:00.000Z +15 minutes → 2026-11-13T12:15:00.000Z']);
  });

  it("shifts backward with a negative amount", async () => {
    const routine = routineOf(addTime("2026-11-13T12:00:00.000Z", -7, "days", "s1"));
    const notes = await runRoutine(routine);

    expect(notes).toEqual(['2026-11-13T12:00:00.000Z -7 days → 2026-11-06T12:00:00.000Z']);
  });

  it("resolves $now (or any earlier $var) as the base, through the template", async () => {
    const routine = routineOf(
      { id: "s1", type: "saveValue", value: "2026-01-01T00:00:00.000Z", saveAs: "base" },
      addTime("$base", 1, "hours", "s2")
    );
    const notes = await runRoutine(routine);

    expect(notes[1]).toContain("2026-01-01T01:00:00.000Z");
  });

  it("covers every unit", async () => {
    const seconds = await runRoutine(routineOf(addTime("2026-01-01T00:00:00.000Z", 30, "seconds")));
    expect(seconds[0]).toContain("2026-01-01T00:00:30.000Z");

    const hours = await runRoutine(routineOf(addTime("2026-01-01T00:00:00.000Z", 2, "hours")));
    expect(hours[0]).toContain("2026-01-01T02:00:00.000Z");
  });

  it("fails when the base cannot be parsed as a date", async () => {
    const err = await runRoutine(routineOf(addTime("not a date", 5, "minutes"))).catch((e) => e);

    expect(err).toBeInstanceOf(StepError);
    expect(err.message).toBe('"not a date" is not a date addTime can parse');
  });

  it("defaults to a full ISO string, including for an older config with no format field", async () => {
    const withFormat = routineOf(addTimeFormatted("2026-11-13T15:30:00.000Z", "ISO 8601"));
    expect((await runRoutine(withFormat))[0]).toContain("2026-11-13T15:30:00.000Z");

    const noFormatField = routineOf(addTime("2026-11-13T15:30:00.000Z", 0, "minutes"));
    expect((await runRoutine(noFormatField))[0]).toContain("2026-11-13T15:30:00.000Z");
  });

  // One spot check per format here (the full behavior of each is covered by
  // dateFormats.test.ts) — this just proves the step actually wires `format`
  // through to formatDate rather than ignoring it. The base is 15:30 UTC,
  // which is 17:30 in the pinned Kyiv zone — every non-UTC, non-epoch format
  // below reflects that local time, not the UTC base.
  const cases: [DateFormatName, string][] = [
    ["ISO 8601 (no milliseconds)", "2026-11-13T15:30:00Z"],
    ["SQL datetime", "2026-11-13 17:30:00"],
    ["SQL date", "2026-11-13"],
    ["DD/MM/YYYY", "13/11/2026"],
    ["DD/MM/YYYY HH:mm", "13/11/2026 17:30"],
    ["DD.MM.YYYY", "13.11.2026"],
    ["DD.MM.YYYY HH:mm", "13.11.2026 17:30"],
    ["MM/DD/YYYY", "11/13/2026"],
    ["MM/DD/YYYY hh:mm A", "11/13/2026 05:30 PM"],
    ["DD MMM YYYY", "13 Nov 2026"],
    ["MMM DD, YYYY", "Nov 13, 2026"],
    ["HH:mm", "17:30"],
    ["Unix seconds", String(Math.floor(Date.parse("2026-11-13T15:30:00.000Z") / 1000))]
  ];
  it.each(cases)("formats as %s", async (format, expected) => {
    const routine = routineOf(addTimeFormatted("2026-11-13T15:30:00.000Z", format));
    const notes = await runRoutine(routine);

    expect(notes[0]).toContain(`→ ${expected}`);
  });
});
