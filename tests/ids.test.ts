import { describe, it, expect } from "vitest";
import { freshId, newId } from "../src/core/ids";

// Ids identify, names name. These are the properties the rest of the config
// leans on: an id says nothing about what it points at, and never repeats.

describe("newId", () => {
  it("is eight lowercase base-36 characters", () => {
    expect(newId()).toMatch(/^[a-z0-9]{8}$/);
  });

  it("does not repeat across a config's worth of ids", () => {
    const ids = new Set(Array.from({ length: 2000 }, () => newId()));
    expect(ids.size).toBe(2000);
  });

  it("carries nothing of the thing it identifies — it is not derived at all", () => {
    // Two ids for the same name differ; that is the whole point of generating
    // them rather than slugging a name that the user may change later.
    expect(newId()).not.toBe(newId());
  });
});

describe("freshId", () => {
  it("avoids an id already in use", () => {
    const taken = new Set<string>();
    for (let i = 0; i < 50; i++) taken.add(freshId(taken));
    expect(taken.size).toBe(50);
  });
});
