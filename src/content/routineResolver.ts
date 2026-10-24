import type { Config, Routine } from "../core/schema";
import { matches } from "../core/keys";
import { loadConfig } from "../core/configStore";
import { applicableSections, applicableRoutines, type RoutineSection } from "../core/match";

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
}

// A matched routine plus what applies on this page, grouped into its three tiers
// (everywhere / this domain / these URLs). The sections are only for the $routines
// builtin — the cheatsheet popup shows them under those headings — and are
// carried alongside so the executor needs no second read of its own. Scoped to
// what applies here on purpose: a cheatsheet listing another site's chords is
// worse than no cheatsheet.
export type Route = { routine: Routine; sections: RoutineSection[] };

// The config could not be read at all, so no chord can match and every
// hotkey is dead. Returned as data rather than shown from here: resolving
// stays a pure lookup, and the caller decides what to do about it.
export type ConfigError = { configError: string };

export function isConfigError(r: Route | ConfigError | null): r is ConfigError {
  return r !== null && "configError" in r;
}

// Only worth reporting a broken config when the keystroke plausibly was a
// chord. Without this, every character typed on a page would raise a toast.
// Shift is excluded on purpose — Shift+letter is ordinary typing, not a hotkey.
function looksLikeChord(e: KeyboardEvent): boolean {
  return e.ctrlKey || e.altKey || e.metaKey;
}

// Resolves a keydown event to the routine it should run, if any. A pure
// lookup — no preventDefault, no logging, no side effects — so the caller
// decides what "claiming" the keystroke actually means.
export async function resolveRoutine(e: KeyboardEvent): Promise<Route | ConfigError | null> {
  if (isTypingTarget(e.target)) return null;

  let config: Config;
  try {
    // Reads chrome.storage.local, memoized in core/configStore.ts — a keydown
    // no longer costs a fetch. Invalid content throws; missing content is an
    // empty config, which simply matches nothing.
    config = await loadConfig();
  } catch (err) {
    // A stored config that cannot be parsed is a mistake worth showing. The
    // message carries the detail rather than the control flow.
    return looksLikeChord(e) ? { configError: (err as Error).message } : null;
  }

  // applicableRoutines() returns the narrowest scope first, which is what makes a
  // URL-specific routine beat a domain one and a domain one beat a common one on
  // the same chord — this lookup does not need to know that sites exist.
  const routine = applicableRoutines(config, location.href).find((s) => matches(e, s.binding));
  return routine ? { routine, sections: applicableSections(config, location.href) } : null;
}
