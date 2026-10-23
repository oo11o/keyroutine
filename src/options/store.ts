import type { Binding, Config, Site, Routine, Step } from "../core/schema";
import { SCHEMA_VERSION } from "../core/schema";
import { isParsed, parseConfig, saveConfig, seedIfEmpty } from "../core/configStore";
import { isCommon, siteFor, siteScope, sitesOverlap } from "../core/match";
import { STEP_META, blankStep, siteOnlyReason, siteOnlySteps, templateFields } from "../core/stepMeta";
import { referencedVars, unknownVars } from "../core/vars";

// The builder's draft. Edits land here, not in storage: a half-typed selector
// must not go live on a hotkey, and a write per keystroke would be wasteful.
// Saving is an explicit act, and it validates.

// The Sites column's selection. "common" is not a site — it is the absence of
// one — so it cannot be an id.
export type Scope = { kind: "common" } | { kind: "site"; siteId: string };

export const COMMON: Scope = { kind: "common" };

export function scopeKey(scope: Scope): string {
  return scope.kind === "common" ? "common" : `site:${scope.siteId}`;
}

export function sameScope(a: Scope, b: Scope): boolean {
  return scopeKey(a) === scopeKey(b);
}

// Every change redraws the three columns. That is affordable — the config is a
// few kilobytes and there is nothing to diff — and main.ts puts the caret back
// where it was afterwards, so it is also invisible while typing.
type Listener = () => void;

let config: Config = { schemaVersion: SCHEMA_VERSION, routines: [], sites: [] };
let saved = JSON.stringify(config);
let scope: Scope = COMMON;
let routineId: string | null = null;
let stepId: string | null = null;
let varNames: string[] = [];
// The URL of the tab the builder was opened from, for the "This site" row.
let pageUrl: string | null = null;
const listeners: Listener[] = [];

export function subscribe(listener: Listener): void {
  listeners.push(listener);
}

function announce(): void {
  for (const listener of listeners) listener();
}

export function getConfig(): Config {
  return config;
}

export function isDirty(): boolean {
  return JSON.stringify(config) !== saved;
}

export function getScope(): Scope {
  return scope;
}

export function getPageUrl(): string | null {
  return pageUrl;
}

export function getVarNames(): string[] {
  return varNames;
}

export async function init(url: string | null, vars: string[]): Promise<void> {
  pageUrl = url;
  varNames = vars;
  // seedIfEmpty rather than loadConfig: opening the builder on a profile whose
  // storage was cleared should show the bundled routines, not an empty page.
  config = await seedIfEmpty();
  saved = JSON.stringify(config);
  // Start where the user is: if the page they came from belongs to a site, open
  // that site rather than making them find it.
  const site = pageUrl ? siteFor(pageUrl, config.sites) : null;
  scope = site ? { kind: "site", siteId: site.id } : COMMON;
  // Nothing is open to begin with. Opening a routine means opening its editor,
  // and the builder has no business guessing which routine out of ten the user
  // came to edit — the column reads as a list until they pick one.
  clearSelection();
  announce();
}

/* ── selection ─────────────────────────────────────────────────────────── */

export function selectScope(next: Scope): void {
  scope = next;
  // These are a different site's routines, and none of them was asked for.
  clearSelection();
  announce();
}

export function selectRoutine(id: string | null): void {
  routineId = id;
  // Opening a routine opens its pipeline, not one of its actions: the same
  // reason nothing is open on arrival holds one level down.
  stepId = null;
  announce();
}

// Only one routine editor is open at a time — clicking the open one closes it,
// the same way an action card works.
export function toggleRoutine(id: string): void {
  if (routineId === id) {
    clearSelection();
    announce();
    return;
  }
  selectRoutine(id);
}

export function selectStep(id: string | null): void {
  stepId = id;
  announce();
}

// Only one action card is open at a time — clicking the open one closes it.
export function toggleStep(id: string): void {
  stepId = stepId === id ? null : id;
  announce();
}

function clearSelection(): void {
  routineId = null;
  stepId = null;
}

export function routinesInScope(): Routine[] {
  return config.routines.filter((s) =>
    scope.kind === "common" ? s.siteId == null : s.siteId === scope.siteId
  );
}

export function currentRoutine(): Routine | null {
  return config.routines.find((s) => s.id === routineId) ?? null;
}

export function currentStep(): Step | null {
  return currentRoutine()?.steps.find((s) => s.id === stepId) ?? null;
}

export function routineCount(scopeOf: Scope): number {
  return config.routines.filter((s) =>
    scopeOf.kind === "common" ? s.siteId == null : s.siteId === scopeOf.siteId
  ).length;
}

/* ── ids ───────────────────────────────────────────────────────────────── */

// Ids end up in URLs, in resume records and — for steps — in $<id>, so they are
// kept to \w and - and are never silently reused.
function slug(text: string, fallback: string): string {
  const base = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base === "" ? fallback : base;
}

function freeId(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

// A step's id is also the name its result is read back by ($<id>), so a
// producer gets one named after what it holds — $text, $response — and only a
// step with no result falls back to s1, s2. First free rather than
// steps.length + 1: after a delete that would reuse a name an earlier template
// may still point at.
function freeStepId(routine: Routine, type: Step["type"]): string {
  const taken = new Set(routine.steps.map((s) => s.id));
  const base = STEP_META[type].varName;
  if (base && !taken.has(base)) return base;
  for (let n = base ? 2 : 1; ; n++) {
    const candidate = base ? `${base}${n}` : `s${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/* ── sites ─────────────────────────────────────────────────────────────── */

export function addSite(name: string, patterns: string[]): Site {
  const site: Site = {
    id: freeId(slug(name, "site"), new Set(config.sites.map((s) => s.id))),
    name: name.trim() === "" ? "Site" : name.trim(),
    patterns: cleanPatterns(patterns)
  };
  config.sites = [...config.sites, site];
  scope = { kind: "site", siteId: site.id };
  clearSelection();
  announce();
  return site;
}

export function patchSite(siteId: string, patch: Partial<Omit<Site, "id">>): void {
  config.sites = config.sites.map((s) =>
    s.id === siteId
      ? { ...s, ...patch, patterns: patch.patterns ? cleanPatterns(patch.patterns) : s.patterns }
      : s
  );
  announce();
}

// `keepRoutines` moves this site's routines to common; without it they go with the
// site. Asked out loud in the UI rather than guessed — either answer loses
// something the other keeps.
export function deleteSite(siteId: string, keepRoutines: boolean): void {
  config.sites = config.sites.filter((s) => s.id !== siteId);
  config.routines = keepRoutines
    ? config.routines.map((s) => (s.siteId === siteId ? { ...s, siteId: null } : s))
    : config.routines.filter((s) => s.siteId !== siteId);
  scope = COMMON;
  clearSelection();
  announce();
}

// "Common" is not a site, so it has no name of its own — but every label that
// names where a routine runs needs one word for it.
export function siteName(siteId: string | null): string {
  if (siteId == null) return "Common";
  return config.sites.find((s) => s.id === siteId)?.name ?? siteId;
}

export function cleanPatterns(patterns: string[]): string[] {
  return patterns.map((p) => p.trim()).filter((p) => p !== "");
}

/* ── routines ────────────────────────────────────────────────────────────── */

const DEFAULT_BINDING: Binding = {
  code: "Digit1",
  ctrl: true,
  alt: true,
  shift: false,
  meta: false
};

export function addRoutine(name: string): Routine {
  const routine: Routine = {
    id: freeId(slug(name, "routine"), new Set(config.routines.map((s) => s.id))),
    name: name.trim() === "" ? "New routine" : name.trim(),
    binding: freeBinding(),
    enabled: true,
    steps: [],
    siteId: scope.kind === "common" ? null : scope.siteId
  };
  config.routines = [...config.routines, routine];
  routineId = routine.id;
  stepId = null;
  announce();
  return routine;
}

// ⌃⌥1…⌃⌥9, ⌃⌥0, then whatever is left: a new routine should arrive with a chord
// that works, not one that silently shadows an existing routine.
function freeBinding(): Binding {
  const used = new Set(
    config.routines
      .filter((s) => (scope.kind === "common" ? s.siteId == null : s.siteId === scope.siteId))
      .map((s) => s.binding.code)
  );
  const codes = ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8", "Digit9", "Digit0"];
  const free = codes.find((code) => !used.has(code));
  return { ...DEFAULT_BINDING, code: free ?? "KeyK" };
}

export function patchRoutine(id: string, patch: Partial<Omit<Routine, "id" | "steps">>): void {
  config.routines = config.routines.map((s) => (s.id === id ? { ...s, ...patch } : s));
  announce();
}

// Whether this routine could be moved to Common at all: it could not while it
// holds an action that only a site-scoped routine may run. The Sites select
// asks before offering the move, rather than letting it through and failing
// on save — see routinesPane.
export function blocksCommon(id: string): Step[] {
  const routine = config.routines.find((s) => s.id === id);
  if (!routine) return [];
  return siteOnlySteps({ ...routine, siteId: null });
}

export function deleteRoutine(id: string): void {
  config.routines = config.routines.filter((s) => s.id !== id);
  if (routineId === id) clearSelection();
  announce();
}

export function duplicateRoutine(id: string): void {
  const source = config.routines.find((s) => s.id === id);
  if (!source) return;
  const copy: Routine = {
    ...structuredClone(source),
    id: freeId(`${source.id}-copy`, new Set(config.routines.map((s) => s.id))),
    name: `${source.name} (copy)`,
    // Not the same chord: two enabled routines on one chord means the second is
    // dead weight, and a copy is almost never meant to replace the original.
    enabled: false
  };
  config.routines = [...config.routines, copy];
  routineId = copy.id;
  announce();
}

/* ── steps ─────────────────────────────────────────────────────────────── */

function withSteps(id: string, fn: (steps: Step[]) => Step[]): void {
  config.routines = config.routines.map((s) => (s.id === id ? { ...s, steps: fn(s.steps) } : s));
  announce();
}

export function addStep(type: Step["type"]): void {
  const routine = currentRoutine();
  if (!routine) return;
  const step = blankStep(type, freeStepId(routine, type));
  withSteps(routine.id, (steps) => [...steps, step]);
  stepId = step.id;
  announce();
}

export function patchStep(id: string, patch: Record<string, unknown>): void {
  const routine = currentRoutine();
  if (!routine) return;
  withSteps(routine.id, (steps) =>
    steps.map((step) => {
      if (step.id !== id) return step;
      const next = { ...step, ...patch } as Record<string, unknown>;
      // An optional field cleared is an absent field, not an empty one — the
      // handlers read `timeoutMs ?? DEFAULT`, which an empty string defeats.
      for (const spec of STEP_META[step.type].fields) {
        if (!spec.required && next[spec.name] === "") delete next[spec.name];
      }
      return next as unknown as Step;
    })
  );
}

// Renaming a step id is renaming a variable: $<old id> in a later template
// stops resolving. Reported by the caller, which has the list from renamesBreak.
export function setStepId(oldId: string, newId: string): void {
  const routine = currentRoutine();
  if (!routine) return;
  withSteps(routine.id, (steps) =>
    steps.map((step) => (step.id === oldId ? ({ ...step, id: newId } as Step) : step))
  );
  if (stepId === oldId) stepId = newId;
  announce();
}

export function deleteStep(id: string): void {
  const routine = currentRoutine();
  if (!routine) return;
  const index = routine.steps.findIndex((s) => s.id === id);
  withSteps(routine.id, (steps) => steps.filter((s) => s.id !== id));
  const after = currentRoutine();
  stepId = after?.steps[Math.max(0, index - 1)]?.id ?? null;
  announce();
}

export function duplicateStep(id: string): void {
  const routine = currentRoutine();
  if (!routine) return;
  const index = routine.steps.findIndex((s) => s.id === id);
  if (index < 0) return;
  const copy = {
    ...structuredClone(routine.steps[index]),
    id: freeStepId(routine, routine.steps[index].type)
  } as Step;
  withSteps(routine.id, (steps) => [...steps.slice(0, index + 1), copy, ...steps.slice(index + 1)]);
  stepId = copy.id;
  announce();
}

export function moveStep(id: string, delta: number): void {
  const routine = currentRoutine();
  if (!routine) return;
  const from = routine.steps.findIndex((s) => s.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= routine.steps.length) return;
  withSteps(routine.id, (steps) => {
    const next = [...steps];
    [next[from], next[to]] = [next[to], next[from]];
    return next;
  });
}

/* ── warnings the user should see before saving ────────────────────────── */

export type Problem = { message: string; routineId?: string; stepId?: string; rivals?: Rival[] };

// The other routine on the same chord, named the way the UI has to name it: a
// rival on another site is only identifiable with the site said out loud.
export type Rival = { id: string; name: string; siteId: string | null; siteName: string };

// Two enabled routines on one chord that can both apply on some URL. Which of
// them fires is not a toss-up: the resolver takes the narrowest scope that
// claims the page — this URL, then this domain, then everywhere — so a shared
// chord is only a problem when the two sit at the *same* level. Then the first
// one in the config wins and the other is simply dead.
//
// Across levels it is the point rather than a problem: one chord that does the
// usual thing everywhere and something sharper on /contracts. The builder says
// which way round it will go and leaves it alone.
export type ChordRelations = {
  routineId: string;
  conflicts: Rival[]; // same level — one of these never fires
  overrides: Rival[]; // this routine wins where both apply
  overriddenBy: Rival[]; // the other one wins where both apply
};

// How narrowly a routine aims, which is how the resolver ranks it. null means it
// points at a site that no longer exists, so it applies nowhere and can neither
// clash with nor override anything.
function level(routine: Routine): 0 | 1 | 2 | null {
  if (isCommon(routine)) return 0;
  const site = config.sites.find((s) => s.id === routine.siteId);
  if (!site) return null;
  return siteScope(site) === "domain" ? 1 : 2;
}

// Is there a page where both apply? A common routine meets everything; two site
// routines meet only where their patterns do.
function canCollide(a: Routine, b: Routine): boolean {
  const [levelA, levelB] = [level(a), level(b)];
  if (levelA === null || levelB === null) return false;
  if (levelA === 0 || levelB === 0) return true;
  const siteA = config.sites.find((s) => s.id === a.siteId);
  const siteB = config.sites.find((s) => s.id === b.siteId);
  return siteA !== undefined && siteB !== undefined && sitesOverlap(siteA, siteB);
}

export function chordRelations(): ChordRelations[] {
  const found: ChordRelations[] = [];
  const enabled = config.routines.filter((s) => s.enabled);
  for (const routine of enabled) {
    const mine = level(routine);
    if (mine === null) continue;
    const relations: ChordRelations = {
      routineId: routine.id,
      conflicts: [],
      overrides: [],
      overriddenBy: []
    };
    for (const other of enabled) {
      if (other.id === routine.id) continue;
      if (!sameChord(other.binding, routine.binding)) continue;
      if (!canCollide(routine, other)) continue;
      const theirs = level(other) as 0 | 1 | 2;
      const bucket =
        theirs === mine
          ? relations.conflicts
          : theirs < mine
            ? relations.overrides
            : relations.overriddenBy;
      bucket.push(rivalOf(other));
    }
    const total =
      relations.conflicts.length + relations.overrides.length + relations.overriddenBy.length;
    if (total > 0) found.push(relations);
  }
  return found;
}

function rivalOf(routine: Routine): Rival {
  return {
    id: routine.id,
    name: routine.name,
    siteId: routine.siteId ?? null,
    siteName: siteName(routine.siteId ?? null)
  };
}

// The subset worth warning about, in the shape the save status and the routine
// cards already speak.
export function chordConflicts(): Problem[] {
  return chordRelations()
    .filter((r) => r.conflicts.length > 0)
    .map((r) => ({
      routineId: r.routineId,
      rivals: r.conflicts,
      message: `shares its chord with ${r.conflicts.map((c) => `"${c.name}"`).join(", ")}`
    }));
}

function sameChord(a: Binding, b: Binding): boolean {
  return (
    a.code === b.code &&
    a.ctrl === b.ctrl &&
    a.alt === b.alt &&
    a.shift === b.shift &&
    a.meta === b.meta
  );
}

// A chord with no modifier at all would swallow an ordinary keypress on every
// page the routine applies to — the resolver only steps aside for text fields.
export function isBareKey(binding: Binding): boolean {
  return !binding.ctrl && !binding.alt && !binding.meta;
}

// Which later steps a step-id rename would break. Offered before the rename,
// not after: the templates are the user's, and rewriting them silently is worse
// than telling them.
export function renamesBreak(routine: Routine, oldId: string): Problem[] {
  return unknownVars({ ...routine, steps: routine.steps.map((s) => (s.id === oldId ? { ...s, id: " " } : s)) })
    .filter((v) => v.name === oldId)
    .map((v) => ({
      routineId: routine.id,
      stepId: v.stepId,
      message: `the action "${v.stepId}" still uses $${oldId}`
    }));
}

/* ── saving ────────────────────────────────────────────────────────────── */

export type SaveResult = { ok: true } | { ok: false; problems: Problem[] };

// Actions a routine's own scope may not run — a Fetch URL left in a Common
// routine. Not in parseConfig on purpose: a stored config that trips this still
// has to load, or the builder could not be opened to fix it (the runner
// refuses the action meanwhile). Shared by Save and Import so the two cannot
// disagree about what is admissible.
function scopeProblems(routines: Routine[]): Problem[] {
  return routines.flatMap((routine) =>
    siteOnlySteps(routine).map((step) => ({
      routineId: routine.id,
      stepId: step.id,
      message: `"${routine.name}", action ${step.id}: ${siteOnlyReason(step.type)}`
    }))
  );
}

export async function save(): Promise<SaveResult> {
  const problems: Problem[] = [];

  const result = parseConfig(config);
  if (!isParsed(result)) {
    problems.push(...result.errors.map((message) => ({ message })));
  }
  // The check the runtime cannot make until the hotkey is pressed: a $name
  // nothing will have produced by then.
  for (const routine of config.routines) {
    for (const unknown of unknownVars(routine, varNames)) {
      problems.push({
        routineId: routine.id,
        stepId: unknown.stepId,
        message: `"${routine.name}", action ${unknown.stepId}: $${unknown.name} is not a value this routine has — check the ${unknown.field} field`
      });
    }
  }
  // A popup is where a routine ends. The builder will not let one be put
  // anywhere else, but an imported or hand-written config can still arrive
  // with actions queued behind a panel nobody will see until it is dismissed.
  for (const routine of config.routines) {
    const last = routine.steps.length - 1;
    for (const [index, step] of routine.steps.entries()) {
      if (index === last || !STEP_META[step.type].endsRoutine) continue;
      problems.push({
        routineId: routine.id,
        stepId: step.id,
        message: `"${routine.name}", action ${step.id}: ${STEP_META[step.type].label} has to be the last action — nothing may follow it`
      });
    }
  }
  problems.push(...scopeProblems(config.routines));
  if (problems.length > 0) return { ok: false, problems };

  const parsed = (result as { config: Config }).config;
  await saveConfig(parsed);
  config = parsed;
  saved = JSON.stringify(config);
  announce();
  return { ok: true };
}

// Replaces the draft wholesale — Import, and the Revert button. Returns the
// problems instead of applying anything when the incoming config is broken.
export function replaceDraft(raw: unknown): SaveResult {
  const result = parseConfig(raw);
  if (!isParsed(result)) return { ok: false, problems: result.errors.map((message) => ({ message })) };
  // Refused here rather than accepted and failed on Save: an import is one
  // deliberate act with its own dialog to report into, so the message belongs
  // where the paste happened. Nothing is touched, so the draft survives.
  const scoped = scopeProblems(result.config.routines);
  if (scoped.length > 0) return { ok: false, problems: scoped };
  config = result.config;
  scope = COMMON;
  clearSelection();
  announce();
  return { ok: true };
}

export function exportJson(): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}
