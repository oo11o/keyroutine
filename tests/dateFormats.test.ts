import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { DATE_FORMAT_NAMES, formatDate } from "../src/core/dateFormats";

// Pinned to a non-UTC, non-local-to-the-test-machine zone (Kyiv, UTC+2 in
// November/January — no DST active either month) so every format but the two
// ISO ones and Unix seconds is provably reading local time, not silently
// passing because the machine running the suite happens to be UTC. Reset
// afterwards — vitest isolates env per test file, but there is no reason to
// rely on that when restoring it costs nothing.
let previousTZ: string | undefined;
beforeAll(() => {
  previousTZ = process.env.TZ;
  process.env.TZ = "Europe/Kyiv";
});
afterAll(() => {
  process.env.TZ = previousTZ;
});

// A fixed instant, chosen to catch sloppy padding: a single-digit day, a
// single-digit hour, and an afternoon/morning boundary nowhere near it.
// 09:05:03 UTC is 11:05:03 in Kyiv — +2h, no date rollover.
const DATE = new Date("2026-01-05T09:05:03.000Z");

describe("formatDate", () => {
  it("formats every named shape correctly", () => {
    // The two ISO formats and Unix seconds are UTC/timezone-agnostic by
    // definition, so these three stay at the UTC wall-clock value.
    expect(formatDate(DATE, "ISO 8601")).toBe("2026-01-05T09:05:03.000Z");
    expect(formatDate(DATE, "ISO 8601 (no milliseconds)")).toBe("2026-01-05T09:05:03Z");
    expect(formatDate(DATE, "Unix seconds")).toBe(String(Math.floor(DATE.getTime() / 1000)));

    // Everything else reads Kyiv local time — 11:05:03, same calendar day.
    expect(formatDate(DATE, "SQL datetime")).toBe("2026-01-05 11:05:03");
    expect(formatDate(DATE, "SQL date")).toBe("2026-01-05");
    expect(formatDate(DATE, "DD/MM/YYYY")).toBe("05/01/2026");
    expect(formatDate(DATE, "DD/MM/YYYY HH:mm")).toBe("05/01/2026 11:05");
    expect(formatDate(DATE, "DD.MM.YYYY")).toBe("05.01.2026");
    expect(formatDate(DATE, "DD.MM.YYYY HH:mm")).toBe("05.01.2026 11:05");
    expect(formatDate(DATE, "MM/DD/YYYY")).toBe("01/05/2026");
    expect(formatDate(DATE, "MM/DD/YYYY hh:mm A")).toBe("01/05/2026 11:05 AM");
    expect(formatDate(DATE, "DD MMM YYYY")).toBe("05 Jan 2026");
    expect(formatDate(DATE, "MMM DD, YYYY")).toBe("Jan 05, 2026");
    expect(formatDate(DATE, "HH:mm")).toBe("11:05");
  });

  it("defaults to full ISO (UTC) for an older config with no format at all", () => {
    expect(formatDate(DATE, undefined)).toBe(DATE.toISOString());
  });

  it("crosses local noon/midnight correctly for the 12-hour format (12 AM/PM, not 0)", () => {
    // Each instant below is chosen so that +2h (Kyiv) lands exactly on the
    // boundary being tested, not on whatever the UTC clock happened to read.
    expect(formatDate(new Date("2025-12-31T22:00:00.000Z"), "MM/DD/YYYY hh:mm A")).toBe(
      "01/01/2026 12:00 AM" // local midnight
    );
    expect(formatDate(new Date("2026-01-01T10:00:00.000Z"), "MM/DD/YYYY hh:mm A")).toBe(
      "01/01/2026 12:00 PM" // local noon
    );
    expect(formatDate(new Date("2026-01-01T11:00:00.000Z"), "MM/DD/YYYY hh:mm A")).toBe(
      "01/01/2026 01:00 PM" // just past local noon
    );
  });

  it("has a format function for every name the builder offers, and vice versa", () => {
    // Every name actually changes the output from the default — if one fell
    // through to the "default" branch unintentionally, this would catch it.
    const outputs = new Set(DATE_FORMAT_NAMES.map((name) => formatDate(DATE, name)));
    expect(outputs.size).toBe(DATE_FORMAT_NAMES.length);
  });
});
