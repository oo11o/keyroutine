import { describe, it, expect } from "vitest";
import { renderField } from "../src/options/fields";
import type { FieldSpec } from "../src/core/stepMeta";

const URL_SPEC: FieldSpec = { name: "url", label: "URL", kind: "url", required: true };

function fieldFor(spec: FieldSpec, value: string) {
  const field = renderField(spec, {
    value: "",
    onChange: () => {},
    vars: () => [],
    testKey: "t"
  });
  const input = field.querySelector("input, textarea") as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  return { field, input, error: field.querySelector(".errtext") as HTMLElement };
}

describe("validate — url field", () => {
  it("accepts an absolute http(s) URL", () => {
    const { error, input } = fieldFor(URL_SPEC, "https://example.com/items");
    expect(error.hidden).toBe(true);
    expect(input.classList.contains("is-err")).toBe(false);
  });

  // page/navigate.ts's toHttpUrl resolves a leading "/" or "?" against the
  // current page — the exact case that surfaced this bug: "?accelerator=$input"
  // used to be flagged even though the runtime has always accepted it.
  it("accepts a path-relative URL starting with /", () => {
    const { error } = fieldFor(URL_SPEC, "/cron/sync.php?id=$s1");
    expect(error.hidden).toBe(true);
  });

  it("accepts a query-only URL starting with ?", () => {
    const { error } = fieldFor(URL_SPEC, "?accelerator=$input");
    expect(error.hidden).toBe(true);
  });

  it("accepts a $var that is expected to supply the scheme", () => {
    const { error } = fieldFor(URL_SPEC, "$startUrl");
    expect(error.hidden).toBe(true);
  });

  it("rejects a bare domain with no scheme and no leading / or ?", () => {
    const { error, input } = fieldFor(URL_SPEC, "example.com/items");
    expect(error.hidden).toBe(false);
    expect(error.textContent).toMatch(/must start with/);
    expect(input.classList.contains("is-err")).toBe(true);
  });
});
