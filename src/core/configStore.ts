import type { Binding, Config, Site, Routine, Step } from "./schema";
import { SCHEMA_VERSION } from "./schema";
import { STEP_META, isStepType, siteOnlySteps } from "./stepMeta";
import { newId } from "./ids";
import { isLegacySite, mergeDuplicateHostSites, migrateLegacySites } from "./migrateSites";

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
//
// `errors` is fatal — the input is not a usable config at all (not an object,
// no routines array, a schema from the future) and nothing is returned.
// `warnings` is the opposite: one step (or routine, or site) did not parse —
// commonly an unknown step type left behind by a renamed/removed one — and it
// was dropped, but `config` is still everything else, because a config that
// loads with one action missing beats a builder that cannot open at all (see
// the scopeProblems comment on save() for why this codebase already leans
// that way). loadConfig/seedIfEmpty ignore warnings; the builder's own Save
// and Import treat them as problems, since silently dropping a step on an
// explicit user action would be a surprise there in a way it is not on load.
export type ParseResult = { config: Config; warnings: string[] } | { errors: string[] };

export function isParsed(result: ParseResult): result is { config: Config; warnings: string[] } {
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

// Problems pushed here are recoverable: the step is dropped and parsing
// continues, rather than the whole config being refused — see ParseResult.
function parseStep(rawStep: unknown, where: string, warnings: string[]): Step | null {
  if (!isRecord(rawStep)) {
    warnings.push(`${where}: not a step`);
    return null;
  }
  const raw = rawStep;
  if (!isStepType(raw.type)) {
    warnings.push(`${where}: unknown step type "${String(raw.type)}"`);
    return null;
  }
  // Generated rather than required: a hand-written or exported-elsewhere
  // config commonly has no id at all, and that is not a reason to refuse the
  // whole step — ids are opaque now (see core/ids.ts) and nothing a person
  // writing one by hand could usefully have chosen anyway.
  const id = typeof raw.id === "string" && raw.id !== "" ? raw.id : newId();
  const step: Record<string, unknown> = { id, type: raw.type };
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
    const name = typeof raw.saveAs === "string" && raw.saveAs !== "" ? raw.saveAs : id;
    if (!/^\w+$/.test(name)) {
      warnings.push(`${where}: "${name}" may only use letters, digits and _ — it is read back as $${name}`);
    } else {
      step.saveAs = name;
    }
  }
  for (const spec of STEP_META[raw.type].fields) {
    const value = raw[spec.name];
    if (value === undefined || value === "") {
      if (spec.required) warnings.push(`${where}: ${raw.type} needs "${spec.label}"`);
      continue;
    }
    if (spec.kind === "number") {
      const n = Number(value);
      if (!Number.isFinite(n)) {
        warnings.push(`${where}: "${spec.label}" must be a number, got ${String(value)}`);
        continue;
      }
      if (spec.min !== undefined && n < spec.min) {
        warnings.push(`${where}: "${spec.label}" must be at least ${spec.min}`);
        continue;
      }
      if (spec.max !== undefined && n > spec.max) {
        warnings.push(`${where}: "${spec.label}" is capped at ${spec.max}, got ${n}`);
        continue;
      }
      step[spec.name] = n;
      continue;
    }
    if (typeof value !== "string") {
      warnings.push(`${where}: "${spec.label}" must be text`);
      continue;
    }
    // Every field a $var may appear in — the same three kinds templateFields
    // reports, so the rewrite reaches exactly what resolve() will read.
    if (spec.kind === "template" || spec.kind === "url" || spec.kind === "multiline") {
      step[spec.name] = value;
      continue;
    }
    // A name read back as $<name> has to survive core/context.ts's \w+ regex,
    // or it could never be referenced at all.
    if (spec.kind === "varName" && !/^\w+$/.test(value)) {
      warnings.push(`${where}: "${spec.label}" may only use letters, digits and _`);
      continue;
    }
    step[spec.name] = value;
  }
  // Unknown extra keys are dropped rather than flagged: they are how an older
  // or newer config shape shows up, and a step that runs is better than a
  // config that does not load.
  return step as unknown as Step;
}

function parseRoutine(
  raw: unknown,
  index: number,
  siteIds: Set<string>,
  errors: string[],
  warnings: string[]
): Routine | null {
  const where = `routine #${index + 1}`;
  if (!isRecord(raw)) {
    errors.push(`${where}: not a routine`);
    return null;
  }
  const id = typeof raw.id === "string" && raw.id !== "" ? raw.id : newId();
  const label = `routine "${id}"`;
  const binding = parseBinding(raw.binding, label, errors);
  if (!binding) return null;
  if (!Array.isArray(raw.steps)) {
    errors.push(`${label}: no "steps" array`);
    return null;
  }

  const steps: Step[] = [];
  const stepIds = new Set<string>();
  raw.steps.forEach((rawStep, i) => {
    const step = parseStep(rawStep, `${label} step #${i + 1}`, warnings);
    if (!step) return;
    if (stepIds.has(step.id)) {
      // Duplicate ids are not cosmetic: $<id> would silently mean the later
      // one, so a template written against the first reads the wrong value.
      // Recoverable the same way an unparseable step is: drop this one, keep
      // the rest running.
      warnings.push(`${label}: two steps share the id "${step.id}" — the second was dropped`);
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

  // Each entry is a path under siteId's domain; empty means every page of it.
  // Normalized to a leading "/" — the same shape patternPath() has always
  // produced — so a hand-written config that typed "contracts" still matches.
  const pages = Array.isArray(raw.pages)
    ? raw.pages
        .filter((p): p is string => typeof p === "string" && p.trim() !== "")
        .map((p) => (p.startsWith("/") ? p : `/${p}`))
    : [];

  return {
    id,
    name: typeof raw.name === "string" && raw.name !== "" ? raw.name : id,
    binding,
    enabled: raw.enabled !== false, // absent means enabled; only an explicit false disables
    steps,
    siteId,
    pages
  };
}

function parseSite(raw: unknown, index: number, errors: string[]): Site | null {
  const where = `site #${index + 1}`;
  if (!isRecord(raw)) {
    errors.push(`${where}: not a site`);
    return null;
  }
  const id = typeof raw.id === "string" && raw.id !== "" ? raw.id : newId();
  const host = typeof raw.host === "string" ? raw.host.trim().toLowerCase() : "";
  if (host === "") {
    // A site with no host matches nothing, so every routine scoped to it is
    // dead. Worth saying out loud rather than leaving the user to wonder.
    errors.push(`site "${id}": needs a domain`);
  }
  return {
    id,
    name: typeof raw.name === "string" && raw.name !== "" ? raw.name : id,
    host,
    includeSubdomains: raw.includeSubdomains === true
  };
}

// Accepts v1 (routines only), v2 (routines + path-carrying `Site.patterns`)
// and v3 (domain-only `Site.host` + `Routine.pages`) shapes — each additive
// over the last, so the migration cannot lose anything. A schemaVersion newer
// than this build understands is refused outright (below) rather than risking
// a silent misread of fields this build does not know about yet.
export function parseConfig(raw: unknown): ParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isRecord(raw)) return { errors: ["the config is not an object"] };
  if (typeof raw.schemaVersion === "number" && raw.schemaVersion > SCHEMA_VERSION) {
    return {
      errors: [
        `this config was saved by a newer version of KeyRoutine (schema ${raw.schemaVersion}) — update the extension to open it`
      ]
    };
  }
  // Routines were called stacks until the rename, and that word was the
  // config's own key — so a config written before it, or exported from an
  // older build, says "stacks". Read either and write the new one, the same
  // way schemaVersion 1 is read and written as the current version.
  const rawRoutines = Array.isArray(raw.routines) ? raw.routines : raw.stacks;
  if (!Array.isArray(rawRoutines)) return { errors: ['no "routines" array in the config'] };

  let rawSites: unknown[] = [];
  if (Array.isArray(raw.sites)) {
    rawSites = raw.sites;
  } else if (raw.sites !== undefined) {
    errors.push('"sites" must be an array');
  }

  let siteInputs = rawSites;
  let routineInputs: unknown[] = rawRoutines;
  if (rawSites.some(isLegacySite)) {
    const migrated = migrateLegacySites(rawSites, rawRoutines);
    siteInputs = migrated.sites;
    routineInputs = migrated.routines;
  }

  const sites: Site[] = [];
  const siteIds = new Set<string>();
  siteInputs.forEach((rawSite, i) => {
    const site = parseSite(rawSite, i, errors);
    if (!site) return;
    if (siteIds.has(site.id)) {
      errors.push(`two sites share the id "${site.id}"`);
      return;
    }
    siteIds.add(site.id);
    sites.push(site);
  });

  const routines: Routine[] = [];
  const routineIds = new Set<string>();
  routineInputs.forEach((rawRoutine, i) => {
    const routine = parseRoutine(rawRoutine, i, siteIds, errors, warnings);
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
  const merged = mergeDuplicateHostSites(sites, routines);
  return { config: { schemaVersion: SCHEMA_VERSION, routines: merged.routines, sites: merged.sites }, warnings };
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
  // A bundled seed that fails to parse, or holds a site-only action (Read
  // element, Fetch URL, ...) in a Common routine, is a bug in the shipped
  // file, not the user's problem: leave storage untouched so the builder
  // starts empty rather than storing something the runner would refuse to
  // run the first time its hotkey is pressed. The builder's own Save and
  // Import already check this (scopeProblems in options/store.ts); a seed
  // bypasses both by going straight through parseConfig, so it needs the
  // same check made here instead.
  if (!isParsed(result)) return EMPTY_CONFIG;
  if (result.config.routines.some((routine) => siteOnlySteps(routine).length > 0)) return EMPTY_CONFIG;
  await saveConfig(result.config);
  return result.config;
}
