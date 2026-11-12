import { h, clear } from "./el";
import { getConfig } from "./store";
import { currentMonthUsage, SECONDS_SAVED_PER_USE } from "../core/usageStats";

// How often each hotkey actually ran this month, grouped by site and sorted
// busiest-first — the question this answers is "which of these earn their
// keep, and which don't." Common routines never appear: see
// core/usageStats.ts for why there is no site to attribute their uses to.

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

type RoutineRow = { name: string; count: number };
type SiteGroup = { name: string; rows: RoutineRow[]; total: number };

export async function renderStats(pane: HTMLElement): Promise<void> {
  clear(pane);
  const config = getConfig();
  const usage = await currentMonthUsage();

  const groups: SiteGroup[] = [];
  for (const site of config.sites) {
    const siteUsage = usage[site.id];
    if (!siteUsage) continue;
    const rows: RoutineRow[] = config.routines
      .filter((r) => r.siteId === site.id && (siteUsage[r.id] ?? 0) > 0)
      .map((r) => ({ name: r.name, count: siteUsage[r.id] }))
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

  const grandTotal = groups.reduce((sum, g) => sum + g.total, 0);
  pane.append(
    h("p", {
      class: "notice",
      text: `Estimated time saved this month: ${formatSavedTime(grandTotal * SECONDS_SAVED_PER_USE)} — assuming ${SECONDS_SAVED_PER_USE}s saved per use.`
    })
  );

  for (const group of groups) {
    pane.append(
      h("h3", { text: `${group.name} — ${group.total} use${group.total === 1 ? "" : "s"}` }),
      h(
        "table",
        { class: "stats-table" },
        h(
          "thead",
          {},
          h("tr", {}, h("th", { text: "Routine" }), h("th", { text: "Uses" }), h("th", { text: "Time saved" }))
        ),
        h(
          "tbody",
          {},
          ...group.rows.map((r) =>
            h(
              "tr",
              {},
              h("td", { text: r.name }),
              h("td", { text: String(r.count) }),
              h("td", { text: formatSavedTime(r.count * SECONDS_SAVED_PER_USE) })
            )
          )
        )
      )
    );
  }
}
