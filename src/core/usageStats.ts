// How often each routine actually runs, so the Statistics tab can show which
// hotkeys earn their keep and which don't. Counted per site, per routine,
// bucketed by calendar month — only the most recent MONTHS_KEPT months are
// kept, so a profile that has been in use for a year does not grow this
// key forever.
//
// Common routines are never recorded here: a Common routine fires on every
// site, so there is no single site a use could be attributed to, and
// "attribute it to every site" would make every site's count include every
// Common hotkey press, drowning out what is actually specific to that site.
// recordUse's caller (content/routineExecutor.ts) is what enforces this —
// this module just never refuses a siteId, Common or not.
export const USAGE_STATS_KEY = "usageStats";
export const MONTHS_KEPT = 3;

// What a use is assumed to be worth, in seconds, until the person looking at
// the Statistics tab says otherwise for a particular routine — see
// secondsSavedByRoutine below. Deliberately not a Routine field: it is a
// display preference about how to read the numbers, not part of what the
// routine does, so it has no business in the builder or in Export/Import.
export const DEFAULT_SECONDS_SAVED = 5;

const ROUTINE_SECONDS_KEY = "secondsSavedByRoutine"; // routineId -> seconds

export type MonthlyUsage = Record<string, Record<string, number>>; // siteId -> routineId -> count
export type UsageStats = Record<string, MonthlyUsage>; // "YYYY-MM" -> MonthlyUsage

export function monthKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

async function readStats(): Promise<UsageStats> {
  const stored = (await chrome.storage.local.get(USAGE_STATS_KEY)) as Record<string, unknown>;
  return (stored[USAGE_STATS_KEY] as UsageStats | undefined) ?? {};
}

// "YYYY-MM" sorts chronologically as a plain string, so the most recent
// MONTHS_KEPT keys are just the last ones once sorted.
function pruneOldMonths(stats: UsageStats): UsageStats {
  const kept = Object.keys(stats).sort().slice(-MONTHS_KEPT);
  const pruned: UsageStats = {};
  for (const key of kept) pruned[key] = stats[key];
  return pruned;
}

export async function recordUse(siteId: string, routineId: string): Promise<void> {
  const stats = await readStats();
  const key = monthKey();
  const month = { ...stats[key] };
  const site = { ...month[siteId] };
  site[routineId] = (site[routineId] ?? 0) + 1;
  month[siteId] = site;
  stats[key] = month;
  await chrome.storage.local.set({ [USAGE_STATS_KEY]: pruneOldMonths(stats) });
}

export async function currentMonthUsage(): Promise<MonthlyUsage> {
  const stats = await readStats();
  return stats[monthKey()] ?? {};
}

// Every override anyone has typed into the Statistics tab, routineId ->
// seconds. A routine missing here just means nobody has changed it from
// DEFAULT_SECONDS_SAVED yet.
export async function secondsSavedByRoutine(): Promise<Record<string, number>> {
  const stored = (await chrome.storage.local.get(ROUTINE_SECONDS_KEY)) as Record<string, unknown>;
  return (stored[ROUTINE_SECONDS_KEY] as Record<string, number> | undefined) ?? {};
}

export async function setSecondsSaved(routineId: string, seconds: number): Promise<void> {
  const map = { ...(await secondsSavedByRoutine()) };
  map[routineId] = seconds;
  await chrome.storage.local.set({ [ROUTINE_SECONDS_KEY]: map });
}
