import { columnHead, h, row } from "./el";
import { icon } from "./icons";
import { chordText } from "../core/keys";
import type { Routine } from "../core/schema";
import * as store from "./store";
import { COMMON } from "./store";
import { hotkeyField, keyCaps } from "./chordInput";
import { siteOnlyReason } from "../core/stepMeta";

// Column 2 — when. Every routine in the selected scope, each a card that expands
// in place into its own editor: a routine is a hotkey plus a name plus where it
// runs, and that is little enough to edit where it sits rather than in a
// separate panel further down the page.

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function renderRoutines(pane: HTMLElement): void {
  const scope = store.getScope();
  const routines = store.routinesInScope();
  const current = store.currentRoutine();
  const relations = store.chordRelations();
  pane.className = "c-routine";

  const scopeLabel =
    scope.kind === "common" ? "Common" : store.siteName(scope.siteId);

  pane.append(
    columnHead({
      id: "h-routines",
      tone: "routine",
      glyph: "layers",
      eyebrow: "2 · When",
      title: "Routines",
      count: routines.length,
      sub: ["A hotkey that runs a sequence of actions"]
    })
  );

  pane.append(
    h("div", {
      class: "sectionlabel",
      text: scope.kind === "common" ? "Routines in Common" : `Routines on ${scopeLabel}`
    })
  );

  if (routines.length === 0) {
    pane.append(h("div", { class: "empty", text: "No routines here yet." }));
  }

  for (const routine of routines) {
    const selected = current?.id === routine.id;
    const relation = relations.find((r) => r.routineId === routine.id);
    // Only a same-level pair is a clash. One level apart is precedence doing
    // its job, and the note below says which way round it goes.
    const clash = relation && relation.conflicts.length > 0 ? relation : undefined;
    const card = h("div", {
      class: `card ${selected ? "is-sel" : ""} ${routine.enabled ? "" : "is-off"}`.trim()
    });

    card.append(
      h(
        "div",
        { class: "routinerow" },
        h(
          "button",
          {
            type: "button",
            class: "routinepick",
            "aria-expanded": selected ? "true" : "false",
            onClick: () => store.toggleRoutine(routine.id)
          },
          h(
            "span",
            { class: "steptext" },
            h("span", { class: "routinename", text: routine.name }),
            h("span", {
              class: "rowsub",
              style: "margin:0",
              text: `${plural(routine.steps.length, "action")} · ${routine.enabled ? "on" : "off"}`
            })
          ),
          keyCaps(routine.binding, clash ? "is-conflict" : "")
        ),
        h("button", {
          type: "button",
          class: `switch ${routine.enabled ? "is-on" : ""}`.trim(),
          "aria-pressed": routine.enabled ? "true" : "false",
          "aria-label": `Enabled: ${routine.name}`,
          onClick: () => store.patchRoutine(routine.id, { enabled: !routine.enabled })
        })
      )
    );

    if (clash) {
      card.append(
        h(
          "div",
          { class: "conflict" },
          icon("warn", 16),
          h(
            "span",
            {},
            "Same hotkey as ",
            h("strong", { text: rivalNames(routine.siteId ?? null, clash.conflicts) })
          )
        )
      );
    }

    // The same chord one level apart: worth saying, because the card cannot
    // otherwise explain why pressing it here does something else.
    for (const note of precedenceNotes(routine, relation)) card.append(note);

    if (selected) card.append(routineEditor(clash !== undefined));
    pane.append(card);
  }

  pane.append(
    h(
      "button",
      {
        type: "button",
        class: "btn btn-dashed",
        onClick: () => store.addRoutine("New routine")
      },
      icon("plus"),
      "New routine"
    )
  );

  // On a site, the routines that also work here but live in Common. Not listed
  // inline: they are not this site's, and showing them as if they were would
  // make "delete" and "move" ambiguous.
  if (scope.kind === "site") {
    const common = store.routineCount(COMMON);
    if (common > 0) {
      pane.append(
        row(
          { class: "is-dashed", onClick: () => store.selectScope(COMMON) },
          h("span", { class: "avatar avatar-globe" }, icon("globe")),
          h(
            "span",
            { class: "rowbody" },
            h("span", { class: "rowtitle", style: "font-size:14px", text: `+${common} more from Common` }),
            h("span", { class: "rowsub", text: "These also work on this site" })
          ),
          icon("chevronRight")
        )
      );
    }
  }
}

// "Paste test password (Common)" — the site is only named when it is not the
// one being looked at, because there it is the only thing that distinguishes
// the two routines.
function rivalNames(siteId: string | null, rivals: store.Rival[]): string {
  return rivals
    .map((r) => (r.siteId === siteId ? r.name : `${r.name} (${r.siteName})`))
    .join(", ");
}

// Which routine wins where both apply, said from this card's point of view. A
// narrower routine beats a wider one — this URL, then this domain, then
// everywhere — so these read as "instead of", never as a problem.
function precedenceNotes(
  routine: Routine,
  relation: store.ChordRelations | undefined
): HTMLElement[] {
  if (!relation) return [];
  const mine = routine.siteId ?? null;
  const notes: HTMLElement[] = [];
  if (relation.overrides.length > 0) {
    notes.push(
      h(
        "div",
        { class: "precedence" },
        icon("check", 16),
        h(
          "span",
          {},
          "Runs here instead of ",
          h("strong", { text: rivalNames(mine, relation.overrides) })
        )
      )
    );
  }
  if (relation.overriddenBy.length > 0) {
    notes.push(
      h(
        "div",
        { class: "precedence" },
        icon("navigate", 16),
        h(
          "span",
          {},
          h("strong", { text: rivalNames(mine, relation.overriddenBy) }),
          " runs instead on the pages it covers"
        )
      )
    );
  }
  return notes;
}

function routineEditor(conflicted: boolean): HTMLElement {
  const routine = store.currentRoutine()!;
  const config = store.getConfig();
  const body = h("div", { class: "cardbody" });

  const name = h("input", { id: "routine-name", class: "input", type: "text", value: routine.name });
  name.addEventListener("input", () => store.patchRoutine(routine.id, { name: name.value }));
  body.append(h("label", { class: "field" }, h("span", { class: "label", text: "Name" }), name));

  const hotkey = hotkeyField(
    routine.binding,
    (binding) => store.patchRoutine(routine.id, { binding }),
    (binding) =>
      // A chord with no modifier would eat an ordinary keypress on every page
      // this routine applies to: the resolver only steps aside for text fields.
      store.isBareKey(binding)
        ? "no modifier — this would swallow that key on every page the routine applies to"
        : null
  );
  if (conflicted) {
    hotkey.append(
      h("span", {
        class: "errtext",
        text: "Pressing it may run the wrong routine. Record a different hotkey for one of them."
      })
    );
  }
  body.append(hotkey);

  // A routine holding a site-only action (Fetch URL) cannot move to Common, so
  // the option is not offered rather than accepted and then refused on save.
  const blockers = store.blocksCommon(routine.id);
  const site = h(
    "select",
    { id: "routine-site", class: "input" },
    h("option", {
      value: "",
      text: "Common (all sites)",
      selected: routine.siteId == null,
      disabled: blockers.length > 0
    }),
    ...config.sites.map((s) =>
      h("option", { value: s.id, text: s.name, selected: routine.siteId === s.id })
    )
  );
  site.addEventListener("change", () => {
    const siteId = site.value === "" ? null : site.value;
    store.patchRoutine(routine.id, { siteId });
    // The routine has left the column it was in; follow it, or the selection
    // would land on a routine the user never asked for.
    store.selectScope(siteId == null ? COMMON : { kind: "site", siteId });
    store.selectRoutine(routine.id);
  });
  body.append(
    h(
      "label",
      { class: "field" },
      h("span", { class: "label", text: "Site" }),
      site,
      h("span", {
        class: blockers.length > 0 ? "errtext" : "hint",
        text:
          blockers.length > 0
            ? `This routine cannot move to Common: ${siteOnlyReason(blockers[0].type)}`
            : "Pick another site here to move this routine."
      })
    )
  );

  body.append(
    h(
      "div",
      { class: "rowline" },
      h("button", {
        type: "button",
        class: "btn btn-sm",
        text: "Duplicate",
        onClick: () => store.duplicateRoutine(routine.id)
      }),
      h("div", { class: "spacer" }),
      h("button", {
        type: "button",
        class: "btn btn-danger btn-sm",
        text: "Delete routine",
        onClick: () => {
          const what = `${routine.steps.length} action${routine.steps.length === 1 ? "" : "s"}`;
          if (confirm(`Delete the routine "${routine.name}" and its ${what}?`)) {
            store.deleteRoutine(routine.id);
          }
        }
      })
    )
  );

  // The spelled-out chord is in the hotkey field; this is the one place the
  // whole routine is described in a sentence, for a screen reader reaching the
  // editor without having seen the keycaps.
  body.setAttribute("aria-label", `${routine.name}, ${chordText(routine.binding)}`);
  return body;
}
