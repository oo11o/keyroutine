import { describe, it, expect, afterEach, vi } from "vitest";
import {
  USAGE_STATS_KEY,
  MONTHS_KEPT,
  monthKey,
  recordUse,
  currentMonthUsage,
  secondsSavedByRoutine,
  setSecondsSaved
} from "../src/core/usageStats";
import { stubChromeStorage } from "./fakeChrome";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("usageStats", () => {
  it("starts empty when nothing has been recorded yet", async () => {
    stubChromeStorage();
    expect(await currentMonthUsage()).toEqual({});
  });

  it("records a use under the current month, site and routine", async () => {
    stubChromeStorage();
    await recordUse("site-a", "routine-1");
    expect(await currentMonthUsage()).toEqual({ "site-a": { "routine-1": 1 } });
  });

  it("accumulates repeated uses of the same routine, and keeps others separate", async () => {
    stubChromeStorage();
    await recordUse("site-a", "routine-1");
    await recordUse("site-a", "routine-1");
    await recordUse("site-a", "routine-2");
    await recordUse("site-b", "routine-3");

    expect(await currentMonthUsage()).toEqual({
      "site-a": { "routine-1": 2, "routine-2": 1 },
      "site-b": { "routine-3": 1 }
    });
  });

  it(`keeps only the most recent ${MONTHS_KEPT} months`, async () => {
    // Four months already on disk, all well in the past relative to any real
    // "now" — recordUse's write should prune down to MONTHS_KEPT total,
    // dropping the oldest first ("YYYY-MM" sorts chronologically as a string).
    const storage = stubChromeStorage({
      [USAGE_STATS_KEY]: {
        "2000-01": { "site-a": { r: 1 } },
        "2000-02": { "site-a": { r: 1 } },
        "2000-03": { "site-a": { r: 1 } },
        "2000-04": { "site-a": { r: 1 } }
      }
    });

    await recordUse("site-a", "routine-1");

    const stats = storage.data[USAGE_STATS_KEY] as Record<string, unknown>;
    expect(Object.keys(stats).sort()).toEqual(["2000-03", "2000-04", monthKey()].sort());
    expect(Object.keys(stats)).toHaveLength(MONTHS_KEPT);
  });
});

describe("secondsSavedByRoutine", () => {
  it("has no overrides until one is set", async () => {
    stubChromeStorage();
    expect(await secondsSavedByRoutine()).toEqual({});
  });

  it("remembers a per-routine override, leaving others at the default", async () => {
    stubChromeStorage();
    await setSecondsSaved("routine-1", 12);

    const overrides = await secondsSavedByRoutine();
    expect(overrides["routine-1"]).toBe(12);
    expect(overrides["routine-2"]).toBeUndefined(); // statsPane reads a missing entry as DEFAULT_SECONDS_SAVED
  });

  it("updates one routine's override without disturbing another's", async () => {
    stubChromeStorage();
    await setSecondsSaved("routine-1", 12);
    await setSecondsSaved("routine-2", 30);
    await setSecondsSaved("routine-1", 8);

    expect(await secondsSavedByRoutine()).toEqual({ "routine-1": 8, "routine-2": 30 });
  });
});
