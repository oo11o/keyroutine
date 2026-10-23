import { loadConfig } from "../core/configStore";
import { applicableSections, applicableRoutines } from "../core/match";
import { executeRoutine } from "./routineExecutor";
import { takeResume } from "../background/client";

// Runs once per page load, before any keystroke: if the previous page in
// this tab suspended a routine by navigating here, pick it up where it left
// off. This is the other half of the navigation boundary — the content
// script that started the routine died with its page, so a fresh one finishes
// the job.
//
// Silent when there is nothing to resume, which is the overwhelmingly
// common case: one message to the worker per page load, no config fetch.
export async function resumePending(): Promise<void> {
  const record = await takeResume();
  if (!record) return;

  const config = await loadConfig().catch(() => null);
  if (!config) return; // config unreadable — nothing to resume against

  // The routine may have been renamed, disabled, deleted or re-scoped while the
  // page was loading. Dropping the record is the right answer: half a routine is
  // worse than none, and the record is already consumed.
  //
  // Resolved against what applies on *this* URL, not the whole config: the
  // navigation may have landed somewhere the routine was never scoped to, and
  // finishing it there is exactly what site scoping exists to prevent.
  const applicable = applicableRoutines(config, location.href);
  const routine = applicable.find((s) => s.id === record.routineId);
  if (!routine) return;
  if (record.nextStep >= routine.steps.length) return; // edited out from under us

  await executeRoutine(routine, applicableSections(config, location.href), record);
}
