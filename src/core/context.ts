// Born on keypress, wiped when the run ends — see runRoutine() in
// content/runner.ts. There is no global store, so a value cannot leak
// between runs or between routines: there is nowhere for it to persist.
export type RunContext = Map<string, string>;

export const MAX_VARS = 64;

// `transform` is applied to each substituted value, never to the literal
// text around it — the URL steps pass encodeURIComponent so a value holding &
// or = lands as one query parameter instead of injecting another, while the
// &s the routine author typed in the template stay separators.
export function resolve(
  template: string,
  ctx: RunContext,
  transform: (value: string) => string = (v) => v
): string {
  return template.replace(/\$\$|\$(\w+)/g, (match, name: string | undefined) => {
    if (match === "$$") return "$"; // literal escape, not a value — not transformed
    if (!ctx.has(name!)) throw new Error(`unknown variable "$${name}"`);
    return transform(ctx.get(name!)!);
  });
}

// Names of the built-in variables seeded by page/builtins.ts. Declared here
// (not there) so anything needing the list doesn't have to import something
// DOM-touching.
export const BUILTINS = ["url", "title", "selection", "routines", "routineName"] as const;

// The variables you define in the Variables tab, seeded next to the builtins
// before step 1 and read as $<name> — a token, a base URL, a test password.
// Values come from chrome.storage.local (content/vars.ts), never from the
// config JSON: config/*.json is web-accessible to every page the extension
// runs on, so anything written there is readable by every site you visit.
//
// They used to carry a "secret_" prefix and be masked on their way to the
// screen. Neither survived contact with use: an extension has no server, so
// the value sits in plaintext on the machine either way, and the prefix only
// made every template that referenced one harder to read.
//
// Seeded after the builtins, so a variable named "url" would shadow $url —
// which is why the Variables tab refuses a builtin's name outright.
export function seedVars(ctx: RunContext, vars: Record<string, string>): void {
  for (const [name, value] of Object.entries(vars)) {
    ctx.set(name, value);
  }
}
