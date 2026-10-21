import { describe, it, expect, beforeEach } from "vitest";
import { cssSelectorFor } from "../src/page/pickElement";

// The selector the picker hands back. The bar is not "a selector that matches":
// `body > div:nth-child(3) > form > input` matches too, and is the thing people
// paste out of DevTools and then cannot read. It has to be the shortest thing
// that is still unambiguous, and built out of parts that survive a re-render.

function set(html: string): void {
  document.body.innerHTML = html;
}

const pick = (selector: string) => cssSelectorFor(document.querySelector(selector)!);

beforeEach(() => set(""));

describe("cssSelectorFor", () => {
  it("uses an id when it identifies the element on its own", () => {
    set('<div><input id="tender_id"></div>');

    expect(pick("#tender_id")).toBe("#tender_id");
  });

  it("prefers a test id, which is there to be selected on", () => {
    set('<div><button data-testid="submit" class="btn">Go</button></div>');

    expect(pick("button")).toBe('button[data-testid="submit"]');
  });

  it("falls back to a class path, skipping state and generated classes", () => {
    set(`
      <div class="page">
        <span class="price is-active css-1x2y3z">42</span>
      </div>
    `);

    expect(pick("span")).toBe("span.price");
  });

  it("counts siblings only when the tag alone cannot tell them apart", () => {
    set("<ul><li>a</li><li>b</li></ul>");

    expect(pick("li:nth-of-type(2)")).toBe("li:nth-of-type(2)");
  });

  it("walks up only as far as it has to for the selector to be unique", () => {
    set(`
      <div class="left"><a class="more">x</a></div>
      <div class="right"><a class="more">y</a></div>
    `);

    expect(pick(".right .more")).toBe("div.right > a.more");
  });

  it("refuses to build on an id that is not a usable identifier", () => {
    // An id starting with a digit is legal HTML and an invalid selector, which
    // is a selector that throws rather than one that misses.
    set('<div><p id="2nd">x</p></div>');

    const selector = pick("p");
    expect(selector).not.toContain("#2nd");
    expect(document.querySelectorAll(selector)).toHaveLength(1);
  });
});
