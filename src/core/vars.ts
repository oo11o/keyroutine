import type { Routine, Step } from "./schema";
import { BUILTINS } from "./context";
import { STEP_META, templateFields } from "./stepMeta";

// Which $names are legal at a given point in a routine, and which ones a routine
// references that are not. The runtime already answers the first question, but
// only by failing: resolve() throws `unknown variable "$typo"` when the hotkey
// is pressed. Answering it statically is what lets the builder offer a picker
// instead of a memory test, and refuse a typo at save time.

export type VarOrigin = "builtin" | "var" | "step";

export type AvailableVar = {
  name: string; // without the "$"
  origin: VarOrigin;
  note: string; // where it comes from, for the picker
};

// The same shape core/context.ts's resolve() uses, so what the builder counts
// as a variable reference is exactly what the runtime will try to substitute.
const VAR_RE = /\$\$|\$(\w+)/g;

export function referencedVars(template: string): string[] {
  const names: string[] = [];
  for (const [whole, name] of template.matchAll(VAR_RE)) {
    if (whole === "$$") continue; // an escaped literal $, not a reference
    names.push(name);
  }
  return names;
}

// Everything a step at `stepIndex` may read. Mirrors what content/runner.ts
// actually binds, and in the same order of interest: this routine's own
// producers first, then the page builtins, then your own variables.
//
// A producer writes three names — $value, $<its id> and $<saveAs> — so all
// three are offered. $value is only listed for the most recent producer,
// because that is the only step it still refers to by the time this one runs.
export function availableVars(
  routine: Routine,
  stepIndex: number,
  varNames: string[] = []
): AvailableVar[] {
  const vars: AvailableVar[] = [];
  const producers = routine.steps
    .slice(0, Math.max(0, stepIndex))
    .filter((step) => STEP_META[step.type]?.produces);

  for (const step of producers) {
    vars.push({ name: step.id, origin: "step", note: `${STEP_META[step.type].label} (step ${step.id})` });
    const saveAs = (step as { saveAs?: string }).saveAs;
    if (saveAs) {
      vars.push({ name: saveAs, origin: "step", note: `saved by step ${step.id}` });
    }
  }
  const last = producers[producers.length - 1];
  if (last) {
    vars.push({ name: "value", origin: "step", note: `whatever step ${last.id} produced` });
  }

  for (const name of BUILTINS) {
    vars.push({ name, origin: "builtin", note: "built in — describes this page" });
  }
  for (const name of varNames) {
    vars.push({ name, origin: "var", note: "from the Variables tab" });
  }
  return dedupe(vars);
}

// A later producer may legitimately reuse a saveAs name, shadowing the
// earlier one; the picker should offer it once.
function dedupe(vars: AvailableVar[]): AvailableVar[] {
  const seen = new Set<string>();
  return vars.filter((v) => (seen.has(v.name) ? false : (seen.add(v.name), true)));
}

export type UnknownVar = { stepIndex: number; stepId: string; field: string; name: string };

// Every $name a routine references that will not exist when it runs. This is
// the check that turns "the hotkey silently did nothing useful" into a
// message next to the field that caused it.
export function unknownVars(routine: Routine, varNames: string[] = []): UnknownVar[] {
  const found: UnknownVar[] = [];
  routine.steps.forEach((step: Step, stepIndex) => {
    if (!STEP_META[step.type]) return; // an unknown step type is a different error
    const known = new Set(availableVars(routine, stepIndex, varNames).map((v) => v.name));
    for (const spec of templateFields(step.type)) {
      const value = (step as unknown as Record<string, unknown>)[spec.name];
      if (typeof value !== "string") continue;
      for (const name of referencedVars(value)) {
        if (!known.has(name)) found.push({ stepIndex, stepId: step.id, field: spec.name, name });
      }
    }
  });
  return found;
}
