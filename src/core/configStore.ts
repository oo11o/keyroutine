import type { Binding, Config, Site, Routine, Step } from "./schema";
import { SCHEMA_VERSION } from "./schema";
import { MAX_WAIT_MS } from "./limits";
import { STEP_META, isStepType } from "./stepMeta";

// Where the config lives, and the only place it is validated.
//
// Until now routines were a bundled file re-fetched over HTTP on every keydown,
// which made them unwritable by the extension and cost a request per
// keystroke. They now live in chrome.storage.local — reachable directly from a
// content script (as the Variables tab's values already are), writable by the
// builder, and cheap enough to read that a keydown no longer touches the
// network. The bundled config/routines.json survives as the first-run seed,
// nothing more.

export const CONFIG_KEY = "config";

export const EMPTY_CONFIG: Config = { schemaVersion: SCHEMA_VERSION, routines: [], sites: [] };

// Errors are returned, not thrown: this runs inside a keydown listener on one
// side and inside a form on the other, and neither wants an exception. The
// builder shows the whole list; the content script shows the first line.
export type ParseResult = { config: Config } | { errors: string[] };

export function isParsed(result: ParseResult): result is { config: Config } {
  return "config" in result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseBinding(raw: unknown, where: string, errors: string[]): Binding | null {
  if (!isRecord(raw)) {
    errors.push(`${where}: no binding`);
    return null;
  }
  if (typeof raw.code !== "string" || raw.code === "") {
    errors.push(`${where}: binding needs a key code`);
    return null;
  }
  // Modifiers are coerced rather than rejected: a hand-written config that
  // omits "shift" means false, and refusing it would be pedantry.
  return {
    code: raw.code,
    ctrl: raw.ctrl === true,
    alt: raw.alt === true,
    shift: raw.shift === true,
    meta: raw.meta === true
  };
}

// Retiring a step type must not brick a profile. A stored config is parsed as
// one unit, so a single step of a type that no longer exists used to fail the
// whole config — and with it every routine, including the ones that never used
// it. These are rewritten on the way in instead, and written back in their new
// shape the next time the builder saves.
//
// The rewrite is lossy where the capability is gone, which is the honest
// outcome of dropping it: a config cannot keep doing something the extension
// no longer does.
function migrateStep(raw: Record<string, unknown>): Record<string, unknown> {
  // Typed a value key by key; inputToSelector sets the same field from the
  // same two fields, in one go.
  if (raw.type === "typeToSelector") return { ...raw, type: "inputToSelector" };

  // Put an element's text on the clipboard. KeyRoutine no longer writes to the
  // clipboard from a routine, so the nearest surviving action is the plain read
  // — the element is still read, and later steps can reference it as $<id>,
  // but nothing lands on the clipboard any more.
  if (raw.type === "copyBySelector") return { ...raw, type: "readBySelector" };

  // Waited for an element to appear. Nothing waits on a condition any more, so
  // the nearest thing is a flat pause of the budget it was given — slower than
  // it used to be when the element arrives early, and a guess where it used to
  // be a certainty.
  if (raw.type === "waitForSelector") {
    const budget = Number(raw.timeoutMs ?? 5000);
    const ms = Number.isFinite(budget) ? Math.min(Math.max(budget, 0), MAX_WAIT_MS) : 5000;
    return { id: raw.id, type: "wait", ms };
  }

  return raw;
}

// Variables lost their "secret_" prefix in 0.7, so a config written before
// then references $secret_example for what is now $example. The cheatsheet
// builtin was $stacks before the rename, for what is now $routines. Both are
// rewritten on the way in, next to migrateStep, and written back in the new
// spelling the next time the builder saves. "$$" is an escaped literal dollar
// and is left alone.
const LEGACY_VAR_RE = /\$\$|\$secret_(\w+)|\$stacks\b/g;

export function migrateTemplate(value: string): string {
  return value.replace(LEGACY_VAR_RE, (whole, name: string | undefined) => {
    if (whole === "$$") return whole;
    if (whole === "$stacks") return "$routines";
    return `$${name}`;
  });
}

function parseStep(rawStep: unknown, where: string, errors: string[]): Step | null {
  if (!isRecord(rawStep)) {
    errors.push(`${where}: not a step`);
    return null;
  }
  const raw = migrateStep(rawStep);
  if (!isStepType(raw.type)) {
    errors.push(`${where}: unknown step type "${String(raw.type)}"`);
    return null;
  }
  if (typeof raw.id !== "string" || raw.id === "") {
    errors.push(`${where}: a step needs an id`);
    return null;
  }
  const step: Record<string, unknown> = { id: raw.id, type: raw.type };
  // The name a producer's result is read back by. Not one of the step's form
  // fields — the builder edits it in its own Save as box — so it is carried
  // across by hand, under the same \w+ rule core/context.ts's resolve() needs
  // to be able to find it at all.
  //
  // Falling back to the id is the migration: an action's id *was* the name
  // ($<id>) before the two were separated, so a config written then keeps
  // every later template resolving, and is written back in the new shape the
  // next time the builder saves.
  if (STEP_META[raw.type].produces) {
    const name = typeof raw.saveAs === "string" && raw.saveAs !== "" ? raw.saveAs : raw.id;
    if (!/^\w+$/.test(name)) {
      errors.push(`${where}: "${name}" may only use letters, digits and _ — it is read back as $${name}`);
    } else {
      step.saveAs = name;
    }
  }
  for (const spec of STEP_META[raw.type].fields) {
    const value = raw[spec.name];
    if (value === undefined || value === "") {
      if (spec.required) errors.push(`${where}: ${raw.type} needs "${spec.label}"`);
      continue;
    }
    if (spec.kind === "number") {
      const n = Number(value);
      if (!Number.isFinite(n)) {
        errors.push(`${where}: "${spec.label}" must be a number, got ${String(value)}`);
        continue;
      }
      if (spec.min !== undefined && n < spec.min) {
        errors.push(`${where}: "${spec.label}" must be at least ${spec.min}`);
        continue;
      }
      if (spec.max !== undefined && n > spec.max) {
        errors.push(`${where}: "${spec.label}" is capped at ${spec.max}, got ${n}`);
        continue;
      }
      step[spec.name] = n;
      continue;
    }
    if (typeof value !== "string") {
      errors.push(`${where}: "${spec.label}" must be text`);
      continue;
    }
    // Every field a $var may appear in — the same three kinds templateFields
    // reports, so the rewrite reaches exactly what resolve() will read.
    if (spec.kind === "template" || spec.kind === "url" || spec.kind === "multiline") {
      step[spec.name] = migrateTemplate(value);
      continue;
    }
    // A name read back as $<name> has to survive core/context.ts's \w+ regex,
    // or it could never be referenced at all.
    if (spec.kind === "varName" && !/^\w+$/.test(value)) {
      errors.push(`${where}: "${spec.label}" may only use letters, digits and _`);
      continue;
    }
    step[spec.name] = value;
  }
  // Unknown extra keys are dropped rather than flagged: they are how an older
  // or newer config shape shows up, and a step that runs is better than a
  // config that does not load.
  return step as unknown as Step;
}

function parseRoutine(raw: unknown, index: number, siteIds: Set<string>, errors: string[]): Routine | null {
  const where = `routine #${index + 1}`;
  if (!isRecord(raw)) {
    errors.push(`${where}: not a routine`);
    return null;
  }
  if (typeof raw.id !== "string" || raw.id === "") {
    errors.push(`${where}: needs an id`);
    return null;
  }
  const label = `routine "${raw.id}"`;
  const binding = parseBinding(raw.binding, label, errors);
  if (!binding) return null;
  if (!Array.isArray(raw.steps)) {
    errors.push(`${label}: no "steps" array`);
    return null;
  }

  const steps: Step[] = [];
  const stepIds = new Set<string>();
  raw.steps.forEach((rawStep, i) => {
    const step = parseStep(rawStep, `${label} step #${i + 1}`, errors);
    if (!step) return;
    if (stepIds.has(step.id)) {
      // Duplicate ids are not cosmetic: $<id> would silently mean the later
      // one, so a template written against the first reads the wrong value.
      errors.push(`${label}: two steps share the id "${step.id}"`);
      return;
    }
    stepIds.add(step.id);
    steps.push(step);
  });

  let siteId: string | null = null;
  if (typeof raw.siteId === "string" && raw.siteId !== "") {
    if (!siteIds.has(raw.siteId)) {
      errors.push(`${label}: unknown site "${raw.siteId}"`);
    }
    siteId = raw.siteId;
  }

  return {
    id: raw.id,
    name: typeof raw.name === "string" && raw.name !== "" ? raw.name : raw.id,
    binding,
    enabled: raw.enabled !== false, // absent means enabled; only an explicit false disables
    steps,
    siteId
  };
}

function parseSite(raw: unknown, index: number, errors: string[]): Site | null {
  const where = `site #${index + 1}`;
  if (!isRecord(raw)) {
    errors.push(`${where}: not a site`);
    return null;
  }
  if (typeof raw.id !== "string" || raw.id === "") {
    errors.push(`${where}: needs an id`);
    return null;
  }
  const patterns = Array.isArray(raw.patterns)
    ? raw.patterns.filter((p): p is string => typeof p === "string" && p.trim() !== "")
    : [];
  if (patterns.length === 0) {
    // A site with no patterns matches nothing, so every routine scoped to it is
    // dead. Worth saying out loud rather than leaving the user to wonder.
    errors.push(`site "${raw.id}": needs at least one URL pattern`);
  }
  return {
    id: raw.id,
    name: typeof raw.name === "string" && raw.name !== "" ? raw.name : raw.id,
    patterns
  };
}

// Accepts both shapes: schemaVersion 1 (routines only) and 2 (routines + sites).
// A v1 config is a v2 config with no sites and every routine common, so the
// migration is additive and cannot lose anything.
export function parseConfig(raw: unknown): ParseResult {
  const errors: string[] = [];
  if (!isRecord(raw)) return { errors: ["the config is not an object"] };
  // Routines were called stacks until the rename, and that word was the
  // config's own key — so a config written before it, or exported from an
  // older build, says "stacks". Read either and write the new one, the same
  // way schemaVersion 1 is read and written as 2.
  const rawRoutines = Array.isArray(raw.routines) ? raw.routines : raw.stacks;
  if (!Array.isArray(rawRoutines)) return { errors: ['no "routines" array in the config'] };

  const sites: Site[] = [];
  const siteIds = new Set<string>();
  if (Array.isArray(raw.sites)) {
    raw.sites.forEach((rawSite, i) => {
      const site = parseSite(rawSite, i, errors);
      if (!site) return;
      if (siteIds.has(site.id)) {
        errors.push(`two sites share the id "${site.id}"`);
        return;
      }
      siteIds.add(site.id);
      sites.push(site);
    });
  } else if (raw.sites !== undefined) {
    errors.push('"sites" must be an array');
  }

  const routines: Routine[] = [];
  const routineIds = new Set<string>();
  rawRoutines.forEach((rawRoutine, i) => {
    const routine = parseRoutine(rawRoutine, i, siteIds, errors);
    if (!routine) return;
    if (routineIds.has(routine.id)) {
      // A duplicate id breaks resume, which finds its routine by id.
      errors.push(`two routines share the id "${routine.id}"`);
      return;
    }
    routineIds.add(routine.id);
    routines.push(routine);
  });

  if (errors.length > 0) return { errors };
  return { config: { schemaVersion: SCHEMA_VERSION, routines, sites } };
}

// Memoized, and invalidated by the storage change below — so a keydown reads a
// module variable in the common case, and a Save in the builder still takes
// effect on the very next keystroke with no reload.
let cached: Config | null = null;

export function clearCache(): void {
  cached = null;
}

// Called once at startup by whoever holds a long-lived cache — the content
// script. An explicit call rather than a side effect of importing this module:
// a module-level listener would fire in every context that touches the config
// (worker, options page, tests) whether or not it caches anything.
export function watchConfigChanges(): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && CONFIG_KEY in changes) clearCache();
  });
}

// A plain storage read — no seeding and no network, because this runs inside a
// keydown listener in a content script. Throws on a config that cannot be
// parsed, so the caller can tell "nothing configured" (an empty config, fine)
// from "your config is broken" (worth a toast). Seeding is the worker's job
// (seedIfEmpty below): only an extension context may read the bundled file now
// that config/routines.json is no longer web-accessible.
export async function loadConfig(): Promise<Config> {
  if (cached) return cached;
  const stored = (await chrome.storage.local.get(CONFIG_KEY)) as Record<string, unknown>;
  const raw = stored[CONFIG_KEY];
  if (raw === undefined) return (cached = EMPTY_CONFIG);
  const result = parseConfig(raw);
  if (!isParsed(result)) throw new Error(result.errors.join("; "));
  cached = result.config;
  return cached;
}

export async function saveConfig(config: Config): Promise<void> {
  await chrome.storage.local.set({ [CONFIG_KEY]: config });
  cached = config;
}

// The bundled file. Returns undefined rather than throwing when it is absent:
// a config that was never shipped is not an error. Only callable from an
// extension context (the worker, the options page) — config/routines.json is
// deliberately not web-accessible, so a content script cannot read it.
export async function readBundledConfig(): Promise<unknown> {
  try {
    const res = await fetch(chrome.runtime.getURL("config/routines.json"), { cache: "no-store" });
    if (!res.ok) return undefined;
    return await res.json();
  } catch {
    return undefined;
  }
}

// Run from the worker's onInstalled, and again when the builder opens — the
// second is what covers a profile whose storage was cleared. Deliberately does
// nothing when storage already holds a config: the bundled file is a seed, not
// a default to be restored over the user's own routines on every update.
//
// Returns what the config ended up as, so the builder can boot from it without
// a second read.
export async function seedIfEmpty(): Promise<Config> {
  const stored = (await chrome.storage.local.get(CONFIG_KEY)) as Record<string, unknown>;
  if (stored[CONFIG_KEY] !== undefined) return loadConfig();
  const raw = await readBundledConfig();
  if (raw === undefined) return EMPTY_CONFIG; // nothing shipped, nothing to seed
  const result = parseConfig(raw);
  // A bundled seed that fails to parse is a bug in the shipped file, not the
  // user's problem: leave storage untouched so the builder starts empty rather
  // than storing something known-broken.
  if (!isParsed(result)) return EMPTY_CONFIG;
  await saveConfig(result.config);
  return result.config;
}
