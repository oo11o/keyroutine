import type { Routine } from "../core/schema";

export function logDebug(chord: string, routine: Routine, debug: boolean): void {
  if (debug) console.log(`[KeyRoutine] ${chord} → "${routine.name}" (${routine.id})`);
}
