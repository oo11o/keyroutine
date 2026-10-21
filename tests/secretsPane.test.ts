import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { stubChromeStorage, type FakeStorage } from "./fakeChrome";
import { renderSecrets } from "../src/options/secretsPane";

// The Variables tab. The values are the one thing in the builder that must not
// render in the clear, so that is what this covers: how they arrive, how a
// deliberate reveal works, and that masking never gets in the way of saving.

let storage: FakeStorage;
let pane: HTMLElement;

function rows(): HTMLElement[] {
  return [...pane.querySelectorAll<HTMLElement>(".secret-row")];
}

function valueInput(index = 0): HTMLInputElement {
  return rows()[index].querySelector(".value") as HTMLInputElement;
}

function clickIn(row: HTMLElement, label: string): void {
  const el = row.querySelector(`[aria-label="${label}"]`);
  if (!el) throw new Error(`no "${label}" in that row`);
  (el as HTMLElement).click();
}

beforeEach(async () => {
  storage = stubChromeStorage({ secrets: { runToken: "s3cr3t", apiKey: "abc123" } });
  pane = document.createElement("main");
  document.body.replaceChildren(pane);
  await renderSecrets(pane, () => {});
});

afterEach(() => vi.unstubAllGlobals());

describe("the Variables tab", () => {
  it("calls them variables, while the reference stays $secret_<name>", () => {
    expect(pane.querySelector("h2")?.textContent).toBe("Variables");
    // Renaming the prefix would break every config already written.
    expect(pane.querySelector(".lede")?.textContent).toContain("$secret_<name>");
  });

  it("renders a stored value masked, not as text", () => {
    expect(rows()).toHaveLength(2);
    expect(valueInput().type).toBe("password");
    // The value is there to be saved back — masked is how it is shown, not a
    // claim that the page never holds it.
    expect(valueInput().value).toBe("s3cr3t");
  });

  it("reveals one value on request, and hides it again", () => {
    clickIn(rows()[0], "Show value");
    expect(valueInput(0).type).toBe("text");
    // One row at a time: revealing one says nothing about the other.
    expect(valueInput(1).type).toBe("password");

    clickIn(rows()[0], "Hide value");
    expect(valueInput(0).type).toBe("password");
  });

  it("saves an edited value whether or not it was revealed", async () => {
    valueInput(0).value = "rotated";
    clickIn(rows()[1], "Show value");
    valueInput(1).value = "also-rotated";

    (pane.querySelector(".actions .btn-primary") as HTMLElement).click();
    await vi.waitFor(() =>
      expect(storage.data.secrets).toEqual({ runToken: "rotated", apiKey: "also-rotated" })
    );
  });

  it("refuses a name that could never be referenced", async () => {
    (rows()[0].querySelector(".name") as HTMLInputElement).value = "run-token";

    (pane.querySelector(".actions .btn-primary") as HTMLElement).click();
    await vi.waitFor(() => expect(pane.querySelector(".status.error")?.textContent).toContain("run-token"));
    // Nothing was written: $secret_run-token stops at the hyphen, so saving it
    // would store a variable no stack could ever reach.
    expect(storage.data.secrets).toEqual({ runToken: "s3cr3t", apiKey: "abc123" });
  });
});
