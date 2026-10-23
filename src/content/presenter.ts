import type { Settings, Routine } from "../core/schema";
import { showResultToast, type RunOutcome } from "../ui/toast";

// Called only on failure now (see content/routineExecutor.ts) — a success
// already got its toast the instant the hotkey matched, before this step
// even ran. This one replaces it with the detail: which step broke, and (on
// "max") everything that ran before it.

export function present(
  chord: string,
  routine: Routine,
  outcome: RunOutcome,
  settings: Settings
): void {
  showResultToast(chord, routine.name, outcome, settings.toast);
}
