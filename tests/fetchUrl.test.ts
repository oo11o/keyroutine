import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { runRoutine, StepError } from "../src/content/runner";
import type { Routine } from "../src/core/schema";
import type { FetchResponse } from "../src/background/protocol";

// Every routine here is scoped to a site ("dzo"): Fetch URL is a site-only
// action, and the runner refuses it in a Common routine (see siteOnlySteps).
//
// The step never touches chrome.runtime directly — it goes through
// background/client.ts — so stubbing sendMessage is enough to exercise the
// handler without a real service worker in the test environment.
let sendMessage: ReturnType<typeof vi.fn>;

function stubResponse(response: FetchResponse) {
  sendMessage.mockResolvedValue(response);
}

function sentUrl(): string {
  return sendMessage.mock.calls[0][0].url as string;
}

function routineWith(url: string, saveAs?: string): Routine {
  return {
    id: "sync",
    name: "Sync Tender",
    binding: { code: "Digit6", ctrl: true, alt: true, shift: false, meta: false },
    enabled: true,
    siteId: "dzo",
    steps: [{ id: "s1", type: "fetchUrl", url, saveAs }]
  };
}

beforeEach(() => {
  sendMessage = vi.fn();
  vi.stubGlobal("chrome", { runtime: { sendMessage } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchUrl in a Common routine", () => {
  it("is refused by the runner, so a hand-edited config cannot sneak it in", async () => {
    stubResponse({ ok: true, status: 200, body: "done" });
    const common: Routine = { ...routineWith("http://dzo.lh/cron/sync.php"), siteId: null };

    await expect(runRoutine(common)).rejects.toThrow(/only available in a routine scoped to a site/);
    // Never reached the worker: the gate is before the handler, not inside it.
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("is refused the same way when the routine simply has no siteId at all", async () => {
    const { siteId: _dropped, ...noSite } = routineWith("http://dzo.lh/cron/sync.php");

    await expect(runRoutine(noSite as Routine)).rejects.toThrow(StepError);
    expect(sendMessage).not.toHaveBeenCalled();
  });
});

describe("fetchUrl", () => {
  it("sends the resolved URL to the background worker", async () => {
    stubResponse({ ok: true, status: 200, body: "done" });

    await runRoutine(routineWith("http://dzo.lh/cron/sync.php"));

    expect(sentUrl()).toBe("http://dzo.lh/cron/sync.php");
  });

  it("captures the response body as the step's value, usable via saveAs", async () => {
    stubResponse({ ok: true, status: 200, body: '{"synced":true}' });

    const routine: Routine = {
      id: "sync",
      name: "Sync Tender",
      binding: { code: "Digit6", ctrl: true, alt: true, shift: false, meta: false },
      enabled: true,
      siteId: "dzo",
      steps: [
        { id: "s1", type: "fetchUrl", url: "http://dzo.lh/cron/sync.php", saveAs: "syncResult" },
        { id: "s2", type: "popup", body: "$syncResult" }
      ]
    };

    const run = runRoutine(routine);
    // Several awaits sit between here and the popup opening (fetchInBackground
    // -> sendMessage -> the handler's own return); a macrotask flushes all of
    // them, where a single microtask (a bare `await Promise.resolve()`) would not.
    await new Promise((r) => setTimeout(r, 0));

    const host = document.getElementById("keyroutine-popup-host")!;
    // A JSON body is pretty-printed, not shown as the raw one-line string —
    // see the "decodes \uXXXX-escaped text" test below for why.
    expect(host.shadowRoot!.querySelector(".body")!.textContent).toBe(
      JSON.stringify({ synced: true }, null, 2)
    );

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(await run).toEqual(['fetched http://dzo.lh/cron/sync.php (200)', 'popup "Sync Tender"']);
  });

  it("percent-encodes a $var substituted into the URL", async () => {
    document.body.innerHTML = "";
    stubResponse({ ok: true, status: 200, body: "" });

    const routine: Routine = {
      id: "sync",
      name: "Sync",
      binding: { code: "Digit6", ctrl: true, alt: true, shift: false, meta: false },
      enabled: true,
      siteId: "dzo",
      steps: [
        { id: "s1", type: "readBySelector", selector: "#tender_id", saveAs: "s1" },
        { id: "s2", type: "fetchUrl", url: "http://dzo.lh/sync.php?id=$s1", saveAs: "s2" }
      ]
    };
    document.body.innerHTML = `<input id="tender_id" value="abc&run=evil" />`;

    await runRoutine(routine);

    expect(sentUrl()).toBe("http://dzo.lh/sync.php?id=abc%26run%3Devil");
  });

  it("decodes \\uXXXX-escaped non-ASCII text in a JSON body", async () => {
    // What the endpoint actually returns: valid JSON, but with the Cyrillic
    // message escaped as \uXXXX rather than sent as literal UTF-8 text.
    const raw = '{"message":"\\u0417\\u0430\\u043c\\u043e\\u0432\\u043d\\u0438\\u043a"}';
    expect(raw).toContain("\\u0417"); // the raw wire text is unreadable as-is
    stubResponse({ ok: true, status: 200, body: raw });

    const routine: Routine = {
      id: "sync",
      name: "Sync",
      binding: { code: "Digit6", ctrl: true, alt: true, shift: false, meta: false },
      enabled: true,
      siteId: "dzo",
      steps: [
        { id: "s1", type: "fetchUrl", url: "http://dzo.lh/cron/sync.php", saveAs: "result" },
        { id: "s2", type: "popup", body: "$result" }
      ]
    };

    const run = runRoutine(routine);
    await new Promise((r) => setTimeout(r, 0));

    const host = document.getElementById("keyroutine-popup-host")!;
    // The popup shows real Cyrillic text, not the escape sequences.
    expect(host.shadowRoot!.querySelector(".body")!.textContent).toBe(
      JSON.stringify({ message: "Замовник" }, null, 2)
    );

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await run;
  });

  it("leaves a non-JSON body (plain text, HTML) untouched", async () => {
    stubResponse({ ok: true, status: 200, body: "OK, synced 3 items" });

    const routine: Routine = {
      id: "sync",
      name: "Sync",
      binding: { code: "Digit6", ctrl: true, alt: true, shift: false, meta: false },
      enabled: true,
      siteId: "dzo",
      steps: [
        { id: "s1", type: "fetchUrl", url: "http://dzo.lh/cron/sync.php", saveAs: "result" },
        { id: "s2", type: "popup", body: "$result" }
      ]
    };

    const run = runRoutine(routine);
    await new Promise((r) => setTimeout(r, 0));

    const host = document.getElementById("keyroutine-popup-host")!;
    expect(host.shadowRoot!.querySelector(".body")!.textContent).toBe("OK, synced 3 items");

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await run;
  });

  it("fails the step on a non-2xx response, quoting a truncated body", async () => {
    stubResponse({ ok: false, status: 500, body: "x".repeat(500) });

    const err = await runRoutine(routineWith("http://dzo.lh/sync.php")).catch((e) => e);

    expect(err).toBeInstanceOf(StepError);
    expect(err.message).toMatch(/^fetchUrl 500: x+$/);
    expect(err.message.length).toBeLessThan(250); // the 500-char body got truncated
  });

  it("fails the step when the worker reports a network error", async () => {
    stubResponse({ error: "Failed to fetch" });

    const err = await runRoutine(routineWith("http://dzo.lh/sync.php")).catch((e) => e);

    expect(err).toBeInstanceOf(StepError);
    expect(err.message).toBe("Failed to fetch");
  });

  it("refuses a non-http scheme instead of sending it to the worker", async () => {
    const err = await runRoutine(routineWith("javascript:alert(1)")).catch((e) => e);

    expect(err).toBeInstanceOf(StepError);
    expect(err.message).toMatch(/only http\/https/);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("reports an unknown variable instead of sending a broken URL", async () => {
    const err = await runRoutine(routineWith("http://dzo.lh/sync.php?id=$nope")).catch((e) => e);

    expect(err).toBeInstanceOf(StepError);
    expect(err.message).toMatch(/unknown variable "\$nope"/);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  describe("concurrency guard", () => {
    it("rejects a second fetchUrl while the first is still in flight", async () => {
      let resolveFirst!: (r: FetchResponse) => void;
      sendMessage.mockReturnValueOnce(new Promise((r) => (resolveFirst = r)));

      const first = runRoutine(routineWith("http://dzo.lh/cron/sync.php"));
      await new Promise((r) => setTimeout(r, 0)); // let the first request actually start

      const err = await runRoutine(routineWith("http://dzo.lh/cron/other.php")).catch((e) => e);
      expect(err).toBeInstanceOf(StepError);
      expect(err.message).toMatch(/already in progress/);
      expect(sendMessage).toHaveBeenCalledTimes(1); // the second never reached the worker

      resolveFirst({ ok: true, status: 200, body: "done" });
      await first;
    });

    it("allows a new fetchUrl once the previous one has settled", async () => {
      stubResponse({ ok: true, status: 200, body: "done" });

      await runRoutine(routineWith("http://dzo.lh/cron/sync.php"));
      await expect(runRoutine(routineWith("http://dzo.lh/cron/sync.php"))).resolves.toBeDefined();

      expect(sendMessage).toHaveBeenCalledTimes(2);
    });

    it("releases the guard even when the request fails, not just on success", async () => {
      stubResponse({ error: "Failed to fetch" });

      await runRoutine(routineWith("http://dzo.lh/cron/sync.php")).catch(() => {});

      stubResponse({ ok: true, status: 200, body: "done" });
      await expect(runRoutine(routineWith("http://dzo.lh/cron/sync.php"))).resolves.toBeDefined();
    });
  });

  describe("the spinner", () => {
    function spinnerText(): string | null {
      const host = document.getElementById("keyroutine-spinner-host");
      return host?.shadowRoot?.querySelector(".spinner")?.textContent ?? null;
    }

    it("shows while the request is in flight and clears once it settles", async () => {
      let resolveFetch!: (r: FetchResponse) => void;
      sendMessage.mockReturnValue(new Promise((r) => (resolveFetch = r)));

      const run = runRoutine(routineWith("http://dzo.lh/cron/sync.php"));
      await new Promise((r) => setTimeout(r, 0)); // let the handler reach the await

      expect(spinnerText()).toContain("dzo.lh");

      resolveFetch({ ok: true, status: 200, body: "done" });
      await run;

      expect(spinnerText()).toBeNull();
    });

    it("clears on failure too, not just on success", async () => {
      stubResponse({ error: "Failed to fetch" });

      await runRoutine(routineWith("http://dzo.lh/cron/sync.php")).catch(() => {});

      expect(spinnerText()).toBeNull();
    });

    it("shows the origin and path only, never the query string", async () => {
      let resolveFetch!: (r: FetchResponse) => void;
      sendMessage.mockReturnValue(new Promise((r) => (resolveFetch = r)));

      // A $secret_* substituted into the query string is only masked at the
      // presentation boundary (core/redact.ts) — the spinner must not show
      // the raw query string at all, secret or not.
      const run = runRoutine(routineWith("http://dzo.lh/cron/sync.php?run=shouldNotAppear"));
      await new Promise((r) => setTimeout(r, 0));

      expect(spinnerText()).toBe("Fetching http://dzo.lh/cron/sync.php…");
      expect(spinnerText()).not.toContain("shouldNotAppear");

      resolveFetch({ ok: true, status: 200, body: "" });
      await run;
    });
  });
});
