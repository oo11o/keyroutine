// What "repeat last routine" repeats: the most recent routine actually
// dispatched on this host, one entry per host rather than one global value —
// so Repeat on this site never offers up something that last ran on a
// different one. A content script is the only context with both `location`
// and a reason to ask, so this lives here rather than in core/.
//
// A routine that itself contains a repeatLastRoutine step is never written
// here (see routineExecutor.ts) — only that exclusion is what keeps a chain
// of repeats from ever looping back on itself, see steps/repeatLastRoutine.ts.
const LAST_ROUTINE_KEY = "lastRoutineByHost";

type LastRoutineMap = Record<string, string>; // host -> routine id

async function readMap(): Promise<LastRoutineMap> {
  const stored = (await chrome.storage.local.get(LAST_ROUTINE_KEY)) as Record<string, unknown>;
  return (stored[LAST_ROUTINE_KEY] as LastRoutineMap | undefined) ?? {};
}

export async function getLastRoutineId(host: string): Promise<string | null> {
  const map = await readMap();
  return map[host] ?? null;
}

export async function rememberLastRoutine(host: string, routineId: string): Promise<void> {
  const map = await readMap();
  map[host] = routineId;
  await chrome.storage.local.set({ [LAST_ROUTINE_KEY]: map });
}
