import {
  PICK_MESSAGE_TYPE,
  PROBE_MESSAGE_TYPE,
  type PickResponse,
  type ProbeResponse
} from "../core/builderProtocol";
import { pickElement } from "../page/pickElement";

// The page's side of the builder's two questions (see core/builderProtocol).
// All of it is read-only or explicitly asked for: nothing here touches the page
// unless the options page sends a message, and the options page only sends one
// when the user presses Pick or Test. Running a stack is the hotkey's job.

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
