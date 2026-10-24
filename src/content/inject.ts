import { resolveRoutine, isConfigError } from "./routineResolver";
import { executeRoutine } from "./routineExecutor";
import { resumePending } from "./resumePending";
import { showConfigErrorToast } from "../ui/toast";
import { watchConfigChanges } from "../core/configStore";
import { listenForBuilder } from "./builderBridge";

declare global {
  interface Window {
    __keyroutineInjected?: boolean;
  }
}

// A grant made just now reaches an already-open tab via a one-shot
// chrome.scripting.executeScript (background/contentScripts.ts), on top of
// the dynamic registration that covers every load after it. Both can fire on
// the same page in that one case — this keeps the second a no-op instead of
// a second keydown listener double-running every routine.
if (!window.__keyroutineInjected) {
  window.__keyroutineInjected = true;

  // The config is memoized after the first keydown; this is what makes a Save
  // in the builder take effect on the next keystroke instead of on the next
  // reload.
  watchConfigChanges();

  // Pick / Test / Run in the builder reach the page through here.
  listenForBuilder();

  document.addEventListener(
    "keydown",
    async (e) => {
      const result = await resolveRoutine(e);
      if (!result) return;

      if (isConfigError(result)) {
        // Deliberately no preventDefault: without a config we cannot know this
        // chord was ever ours, so the page keeps its keystroke. We only report.
        showConfigErrorToast(result.configError);
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      await executeRoutine(result.routine, result.sections);
    },
    true
  );

  // Not awaited: a routine this page is continuing must not delay the keydown
  // listener above being registered.
  void resumePending();
}
