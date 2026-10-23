import type { Settings, Routine } from "../core/schema";
import type { RoutineSection } from "../core/match";
import { DEFAULT_SETTINGS } from "../core/schema";
import { formatBinding } from "../core/keys";
import { runRoutine, StepError, type Resume } from "./runner";
import { logDebug } from "./debugLog";
import { present } from "./presenter";
import { loadVars } from "./vars";
import type { RunOutcome } from "../ui/toast";

async function loadSettings(): Promise<Settings> {
  try {
    const url = chrome.runtime.getURL("config/settings.json");
    const res = await fetch(url, { cache: "no-store" });
    return { ...DEFAULT_SETTINGS, ...(await res.json()) };
  } catch {
    return DEFAULT_SETTINGS; // settings.json missing/unreachable — fall back quietly
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

// Runs an already-resolved routine end to end: debug logging, execution, and
// presenting the outcome (toast) — unless a popup step already showed the
// confirmation.
export async function executeRoutine(
  routine: Routine,
  sections: RoutineSection[],
  resume?: Resume
): Promise<void> {
  const [settings, vars] = await Promise.all([loadSettings(), loadVars()]);
  const chord = formatBinding(routine.binding);
  logDebug(chord, routine, settings.debug);

  const outcome = await resolveOutcome(routine, sections, vars, resume);
  present(chord, routine, outcome, settings);
}
