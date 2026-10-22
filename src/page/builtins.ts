import type { Stack } from "../core/schema";
import type { StackSection } from "../core/match";
import type { RunContext } from "../core/context";
import { formatBinding } from "../core/keys";

// The cheatsheet, in the order a user asks the question in: what works
// everywhere, then what this domain adds, then what only these URLs add. The
// sections come from core/match.ts — the same function the resolver uses to pick
// a chord — so the popup cannot claim a hotkey the runtime would not run.
//
//   Everywhere
//     Ctrl(⌃)+Opt(⌥)+1  Copy Report
//
//   This domain · example.com
//     Ctrl(⌃)+Opt(⌥)+3  Sync Report (local)
//
//   This URL · new report form
//     Ctrl(⌃)+Opt(⌥)+8  logoutLogin
//
// Chords are padded to one width across every section, so the names line up
// down the whole popup rather than per group.
export function formatStackList(sections: StackSection[]): string {
  const groups = sections
    .map((section) => ({
      label: section.label,
      rows: section.stacks
        .filter((s) => s.enabled)
        .map((s) => [formatBinding(s.binding), s.name] as const)
    }))
    .filter((group) => group.rows.length > 0);

  const width = groups.reduce(
    (max, group) => group.rows.reduce((m, [chord]) => Math.max(m, chord.length), max),
    0
  );

  // One section needs no heading — there is nothing to tell it apart from, and a
  // lone "Everywhere" above a list is noise. The headings earn their space only
  // once the list is actually divided.
  const heading = groups.length > 1;

  return groups
    .map((group) => {
      const rows = group.rows.map(
        ([chord, name]) => `${heading ? "  " : ""}${chord.padEnd(width)}  ${name}`
      );
      return heading ? [group.label, ...rows].join("\n") : rows.join("\n");
    })
    .join("\n\n");
}

// Built-in variables, seeded before step 1 so every step can read them and
// the popup step needs no content mechanism of its own — its `title` and `body`
// are just templates like any other value. A producer with `saveAs: "url"`
// deliberately shadows one; that is allowed, the builtins are only defaults.
//
// Reads location/document/window directly, which is why this lives in
// page/ rather than core/context.ts — it cannot run outside a page (e.g. in
// a future service worker).
export function seedBuiltins(ctx: RunContext, sections: StackSection[], current?: Stack): void {
  ctx.set("url", location.href);
  ctx.set("title", document.title);
  ctx.set("selection", window.getSelection()?.toString() ?? "");
  ctx.set("stacks", formatStackList(sections));
  ctx.set("stackName", current?.name ?? "");
}
