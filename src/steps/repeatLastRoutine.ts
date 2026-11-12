import type { Handler } from "./types";
import { loadConfig } from "../core/configStore";
import { applicableRoutines, applicableSections } from "../core/match";
import { loadVars } from "../content/vars";
import { getLastRoutineId } from "../content/lastRoutine";
import { runRoutine } from "../content/runner";

// Recurses into content/runner.ts's runRoutine rather than signalling the
// outer runner to do it — that keeps runRoutine's own return shape (and the
// many tests asserting on it) untouched, at the cost of this one step
// knowing about the routine system instead of just the page.
//
// This can never loop: routineExecutor.ts only ever remembers a routine as
// "last" when that routine does NOT itself contain a repeatLastRoutine step,
// so whatever this fetches is guaranteed step-for-step ordinary — it cannot
// hand back a chain that leads here again.
export const repeatLastRoutine: Handler = async (step) => {
  if (step.type !== "repeatLastRoutine") throw new Error("wrong handler");

  const host = location.hostname;
  const routineId = await getLastRoutineId(host);
  if (!routineId) throw new Error(`nothing has run on ${host} yet — there is nothing to repeat`);

  const config = await loadConfig();
  // The same scoping a hotkey press would get: enabled, the right site, the
  // right page. A routine that no longer qualifies — deleted, disabled,
  // edited to a different site — is refused rather than guessed at.
  const routine = applicableRoutines(config, location.href).find((r) => r.id === routineId);
  if (!routine) throw new Error("the last routine here no longer applies to this page");

  const sections = applicableSections(config, location.href);
  const vars = await loadVars();
  await runRoutine(routine, sections, vars);
  return { note: `repeated "${routine.name}"` };
};
