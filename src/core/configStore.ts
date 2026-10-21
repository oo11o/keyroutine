import type { Binding, Config, Site, Stack, Step } from "./schema";
import { SCHEMA_VERSION } from "./schema";
import { MAX_WAIT_MS } from "./limits";
import { STEP_META, isStepType } from "./stepMeta";

// Where the config lives, and the only place it is validated.
//
// Until now stacks were a bundled file re-fetched over HTTP on every keydown,
// which made them unwritable by the extension and cost a request per
// keystroke. They now live in chrome.storage.local — reachable directly from a
// content script (as secrets already are), writable by the builder, and cheap
// enough to read that a keydown no longer touches the network. The bundled
// config/stacks.json survives as the first-run seed, nothing more.

export const CONFIG_KEY = "config";

export const EMPTY_CONFIG: Config = { schemaVersion: SCHEMA_VERSION, stacks: [], sites: [] };

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
// whole config — and with it every stack, including the ones that never used
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

function parseStack(raw: unknown, index: number, siteIds: Set<string>, errors: string[]): Stack | null {
  const where = `stack #${index + 1}`;
  if (!isRecord(raw)) {
    errors.push(`${where}: not a stack`);
    return null;
  }
  if (typeof raw.id !== "string" || raw.id === "") {
    errors.push(`${where}: needs an id`);
    return null;
  }
  const label = `stack "${raw.id}"`;
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
    // A site with no patterns matches nothing, so every stack scoped to it is
    // dead. Worth saying out loud rather than leaving the user to wonder.
    errors.push(`site "${raw.id}": needs at least one URL pattern`);
  }
  return {
    id: raw.id,
    name: typeof raw.name === "string" && raw.name !== "" ? raw.name : raw.id,
    patterns
  };
}

// Accepts both shapes: schemaVersion 1 (stacks only) and 2 (stacks + sites).
// A v1 config is a v2 config with no sites and every stack common, so the
// migration is additive and cannot lose anything.
export function parseConfig(raw: unknown): ParseResult {
  const errors: string[] = [];
  if (!isRecord(raw)) return { errors: ["the config is not an object"] };
  if (!Array.isArray(raw.stacks)) return { errors: ['no "stacks" array in the config'] };

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

  const stacks: Stack[] = [];
  const stackIds = new Set<string>();
  raw.stacks.forEach((rawStack, i) => {
    const stack = parseStack(rawStack, i, siteIds, errors);
    if (!stack) return;
    if (stackIds.has(stack.id)) {
      // A duplicate id breaks resume, which finds its stack by id.
      errors.push(`two stacks share the id "${stack.id}"`);
      return;
    }
    stackIds.add(stack.id);
    stacks.push(stack);
  });

  if (errors.length > 0) return { errors };
  return { config: { schemaVersion: SCHEMA_VERSION, stacks, sites } };
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
// that config/stacks.json is no longer web-accessible.
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
// extension context (the worker, the options page) — config/stacks.json is
// deliberately not web-accessible, so a content script cannot read it.
export async function readBundledConfig(): Promise<unknown> {
  try {
    const res = await fetch(chrome.runtime.getURL("config/stacks.json"), { cache: "no-store" });
    if (!res.ok) return undefined;
    return await res.json();
  } catch {
    return undefined;
  }
}

// Run from the worker's onInstalled, and again when the builder opens — the
// second is what covers a profile whose storage was cleared. Deliberately does
// nothing when storage already holds a config: the bundled file is a seed, not
// a default to be restored over the user's own stacks on every update.
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
