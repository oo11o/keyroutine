import { describe, it, expect, afterEach, vi } from "vitest";
import { ensureEverywhere, ensureOrigin, hasEverywhere, hasOrigin } from "../src/options/grant";
import { stubChromePermissions } from "./fakeChrome";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ensureOrigin", () => {
  it("requests the pattern's host-wide origin when it is not already granted", async () => {
    const fake = stubChromePermissions();

    expect(await hasOrigin("stage.dzo.com.ua/tenders")).toBe(false);
    expect(await ensureOrigin("stage.dzo.com.ua/tenders")).toBe(true);

    expect(fake.requested).toEqual([["*://stage.dzo.com.ua/*"]]);
    expect(await hasOrigin("stage.dzo.com.ua")).toBe(true); // same host, already covered
  });

  it("does not re-request an origin that is already granted", async () => {
    const fake = stubChromePermissions(["*://stage.dzo.com.ua/*"]);

    expect(await ensureOrigin("stage.dzo.com.ua")).toBe(true);

    expect(fake.requested).toEqual([]);
  });

  it("has no origin to request for a blank pattern", async () => {
    stubChromePermissions();

    expect(await ensureOrigin("  ")).toBe(false);
  });
});

describe("ensureEverywhere", () => {
  it("requests <all_urls> specifically, not a per-host origin", async () => {
    const fake = stubChromePermissions();

    expect(await hasEverywhere()).toBe(false);
    expect(await ensureEverywhere()).toBe(true);

    expect(fake.requested).toEqual([["<all_urls>"]]);
  });
});
