import type { Settings, Routine } from "../core/schema";
import type { RoutineSection } from "../core/match";
import { DEFAULT_SETTINGS } from "../core/schema";
import { formatBinding } from "../core/keys";
import { runRoutine, StepError, type Resume } from "./runner";
import { logDebug } from "./debugLog";
import { present } from "./presenter";
import { loadVars } from "./vars";
import { loadSettingsFromBackground } from "../background/client";
import { showStartedToast, type RunOutcome } from "../ui/toast";

// Asked of the worker rather than fetched here directly — see
// background/protocol.ts for why: a content script fetching its own
// extension's bundled file needs it listed in web_accessible_resources,
// which exposes it to every page's own script, not just this one.
async function loadSettings(): Promise<Settings> {
  try {
    return { ...DEFAULT_SETTINGS, ...(await loadSettingsFromBackground()) };
  } catch {
    return DEFAULT_SETTINGS; // worker missing/unreachable — fall back quietly
  }
}

// Runs a routine and maps the result (or thrown StepError) to a RunOutcome.
// Pure with respect to presentation: no logging, no toast.
async function resolveOutcome(
  routine: Routine,
  sections: RoutineSection[],
  vars: Record<string, string>,
  resume?: Resume
): Promise<RunOutcome> {
  try {
    const notes = await runRoutine(routine, sections, vars, resume);
    return { ok: true, notes };
  } catch (err) {
    if (err instanceof StepError) {
      return {
        ok: false,
        notes: err.notes,
        stepIndex: err.stepIndex,
        stepType: err.step.type,
        message: err.message
      };
    }
    return { ok: false, notes: [], stepIndex: -1, stepType: "error", message: (err as Error).message };
  }
}

// Runs an already-resolved routine end to end: debug logging, an immediate
// "this is what fired" toast, execution, and — only on failure — the
// detailed report. A successful run leaves the started toast as the only one
// shown: a second toast replacing it the instant the run finishes would cut
// its 3 seconds short for no reason, and a popup step (or a page it changed)
// is already the confirmation of what the routine found.
export async function executeRoutine(
  routine: Routine,
  sections: RoutineSection[],
  resume?: Resume
): Promise<void> {
  const [settings, vars] = await Promise.all([loadSettings(), loadVars()]);
  const chord = formatBinding(routine.binding);
  logDebug(chord, routine, settings.debug);

  // Not for a resumed run: there was no keypress on *this* page, so nothing
  // to acknowledge here — the routine already got its toast on the page that
  // started it, before the navigation that parked it.
  if (!resume) showStartedToast(chord, routine.name, settings.toast);

  const outcome = await resolveOutcome(routine, sections, vars, resume);
  if (!outcome.ok) present(chord, routine, outcome, settings);
}
