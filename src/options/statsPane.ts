import { h, clear } from "./el";
import { getConfig } from "./store";
import {
  currentMonthUsage,
  DEFAULT_SECONDS_SAVED,
  secondsSavedByRoutine,
  setSecondsSaved
} from "../core/usageStats";

// How often each hotkey actually ran this month, grouped by site and sorted
// busiest-first — the question this answers is "which of these earn their
// keep, and which don't." Common routines never appear: see
// core/usageStats.ts for why there is no site to attribute their uses to.
//
// "Seconds saved per use" is editable right here, per routine, rather than a
// field in the builder — it is a reading of the numbers below, not part of
// what the routine does, and the builder has enough fields already.

function formatSavedTime(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 60) {
    const seconds = totalSeconds % 60;
    return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins ? `${hours}h ${mins}m` : `${hours}h`;
}

type RoutineRow = { id: string; name: string; count: number; seconds: number };
type SiteGroup = { name: string; rows: RoutineRow[]; total: number };

export async function renderStats(pane: HTMLElement): Promise<void> {
  clear(pane);
  const config = getConfig();
  const [usage, secondsByRoutine] = await Promise.all([currentMonthUsage(), secondsSavedByRoutine()]);

  const groups: SiteGroup[] = [];
  for (const site of config.sites) {
    const siteUsage = usage[site.id];
    if (!siteUsage) continue;
    const rows: RoutineRow[] = config.routines
      .filter((r) => r.siteId === site.id && (siteUsage[r.id] ?? 0) > 0)
      .map((r) => ({
        id: r.id,
        name: r.name,
        count: siteUsage[r.id],
        seconds: secondsByRoutine[r.id] ?? DEFAULT_SECONDS_SAVED
      }))
      .sort((a, b) => b.count - a.count);
    if (rows.length === 0) continue;
    const total = rows.reduce((sum, r) => sum + r.count, 0);
    groups.push({ name: site.name, rows, total });
  }
  groups.sort((a, b) => b.total - a.total);

  pane.append(
    h("h2", { text: "Statistics" }),
    h(
      "p",
      { class: "lede" },
      "How often you've actually used each hotkey this month, by site. Common routines aren't " +
        "counted here — they fire on every site, so there is no single one to credit a use to."
    )
  );

  if (groups.length === 0) {
    pane.append(h("p", { class: "lede" }, "No site-scoped hotkey has run yet this month."));
    return;
  }

  const grandTotal = groups.reduce(
    (sum, g) => sum + g.rows.reduce((s, r) => s + r.count * r.seconds, 0),
    0
  );
  pane.append(h("p", { class: "notice", text: `Estimated time saved this month: ${formatSavedTime(grandTotal)}.` }));

  for (const group of groups) {
    pane.append(
      h("h3", { text: `${group.name} — ${group.total} use${group.total === 1 ? "" : "s"}` }),
      h(
        "table",
        { class: "stats-table" },
        h(
          "thead",
          {},
          h(
            "tr",
            {},
            h("th", { text: "Routine" }),
            h("th", { text: "Uses" }),
            h("th", { text: "Sec/use" }),
            h("th", { text: "Time saved" })
          )
        ),
        h("tbody", {}, ...group.rows.map((r) => statRow(r, () => void renderStats(pane))))
      )
    );
  }
}

function statRow(r: RoutineRow, onChanged: () => void): HTMLTableRowElement {
  const savedCell = h("td", { text: formatSavedTime(r.count * r.seconds) });
  const secondsInput = h("input", {
    type: "number",
    class: "input mono stats-seconds",
    min: "0",
    value: String(r.seconds),
    title: "Seconds saved per use — just this routine, just how it reads here",
    onChange: () => void commit()
  });

  async function commit(): Promise<void> {
    const n = Math.max(0, Math.round(Number(secondsInput.value)));
    secondsInput.value = String(n); // normalizes a blank/negative/fractional typing back to what was saved
    await setSecondsSaved(r.id, n);
    onChanged(); // recalculates this row's and the month's total from the new value
  }

  return h(
    "tr",
    {},
    h("td", { text: r.name }),
    h("td", { text: String(r.count) }),
    h("td", {}, secondsInput),
    savedCell
  );
}
