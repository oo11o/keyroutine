import {
  PICK_MESSAGE_TYPE,
  PROBE_MESSAGE_TYPE,
  TRY_MESSAGE_TYPE,
  type ActionResult,
  type PickResponse,
  type ProbeResponse,
  type TryRequest,
  type TryResponse
} from "../core/builderProtocol";
import { pickElement } from "../page/pickElement";
import { runStack, StepError } from "./runner";
import { loadSecrets } from "./secrets";

// The page's side of the builder's three questions (see core/builderProtocol).
// All of it is read-only or explicitly asked for: nothing here runs unless the
// options page sends a message, and the options page only sends one when the
// user presses Pick, Test or Run.

export function listenForBuilder(): void {
  chrome.runtime.onMessage.addListener((message: unknown, _sender, respond) => {
    const type = (message as { type?: string } | null)?.type;

    if (type === PROBE_MESSAGE_TYPE) {
      const selector = (message as { selector: string }).selector;
      respond(probe(selector));
      return false; // answered synchronously
    }

    if (type === PICK_MESSAGE_TYPE) {
      void pickElement().then(
        (selector) => respond({ selector } satisfies PickResponse),
        (err: Error) => respond({ error: err.message } satisfies PickResponse)
      );
      return true; // the answer arrives when the user clicks
    }

    if (type === TRY_MESSAGE_TYPE) {
      void tryStack(message as TryRequest).then(
        (result) => respond(result),
        (err: Error) => respond({ error: err.message } satisfies TryResponse)
      );
      return true;
    }

    return false; // not ours — the worker's messages come through here too
  });
}

function probe(selector: string): ProbeResponse {
  if (selector.trim() === "") return { error: "no selector yet" };
  try {
    return { count: document.querySelectorAll(selector).length };
  } catch {
    // An unparseable selector is a different mistake from one that matches
    // nothing, and the builder says so differently.
    return { error: "that is not a CSS selector the browser understands" };
  }
}

// Runs a draft stack here and now, and reports what became of each action.
// Deliberately the same runStack the hotkey uses — a test run that went through
// a different code path would be worth very little.
async function tryStack({ stack }: TryRequest): Promise<TryResponse> {
  const results: ActionResult[] = stack.steps.map(() => ({ outcome: "skip", note: "" }));
  const secrets = await loadSecrets();

  const observe = (index: number, note: string): void => {
    results[index] = { outcome: "ok", note: note || "done" };
  };

  try {
    await runStack(stack, undefined, secrets, undefined, observe);
  } catch (err) {
    if (err instanceof StepError) {
      results[err.stepIndex] = { outcome: "fail", note: err.message };
      // Everything after the failure keeps its "skip", which is what actually
      // happened: runStack stops at the first error.
      return { results };
    }
    return { error: (err as Error).message };
  }
  return { results };
}
