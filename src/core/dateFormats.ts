// Every shape Add time can produce. Named exactly as the value stored in the
// step (so a saved routine, and this switch, read as English rather than a
// code), and the dropdown's label is this name plus a live example — see
// core/stepMeta.ts, which builds that label from formatDate(new Date(), …).
//
// Only "ISO 8601" and "ISO 8601 (no milliseconds)" are UTC, because their own
// trailing Z says so — showing anything else there would be a lie about what
// the string means. "Unix seconds" needs no timezone at all: an epoch count
// is the same instant everywhere. Every other format is read by a person at
// the browser that ran the routine (filled into a form, shown in a popup), so
// it uses that browser's own local time — a Kyiv user filling in "18:18" when
// their clock reads 20:03 is the bug this fixed, not a feature.
export type DateFormatName =
  | "ISO 8601"
  | "ISO 8601 (no milliseconds)"
  | "SQL datetime"
  | "SQL date"
  | "DD/MM/YYYY"
  | "DD/MM/YYYY HH:mm"
  | "DD.MM.YYYY"
  | "DD.MM.YYYY HH:mm"
  | "MM/DD/YYYY"
  | "MM/DD/YYYY hh:mm A"
  | "DD MMM YYYY"
  | "MMM DD, YYYY"
  | "HH:mm"
  | "Unix seconds";

export const DATE_FORMAT_NAMES: DateFormatName[] = [
  "ISO 8601",
  "ISO 8601 (no milliseconds)",
  "SQL datetime",
  "SQL date",
  "DD/MM/YYYY",
  "DD/MM/YYYY HH:mm",
  "DD.MM.YYYY",
  "DD.MM.YYYY HH:mm",
  "MM/DD/YYYY",
  "MM/DD/YYYY hh:mm A",
  "DD MMM YYYY",
  "MMM DD, YYYY",
  "HH:mm",
  "Unix seconds"
];

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// `undefined` is an older config, from before this field existed — the same
// "ISO" it always produced.
export function formatDate(date: Date, name: DateFormatName | undefined): string {
  // Local, not UTC — see the comment on DateFormatName for why every format
  // but the two ISO ones and Unix seconds reads the browser's own timezone.
  const Y = date.getFullYear();
  const M = date.getMonth() + 1;
  const D = date.getDate();
  const h = date.getHours();
  const m = date.getMinutes();
  const s = date.getSeconds();

  switch (name) {
    case "ISO 8601 (no milliseconds)":
      return date.toISOString().replace(/\.\d{3}Z$/, "Z");
    case "SQL datetime":
      return `${Y}-${pad(M)}-${pad(D)} ${pad(h)}:${pad(m)}:${pad(s)}`;
    case "SQL date":
      return `${Y}-${pad(M)}-${pad(D)}`;
    case "DD/MM/YYYY":
      return `${pad(D)}/${pad(M)}/${Y}`;
    case "DD/MM/YYYY HH:mm":
      return `${pad(D)}/${pad(M)}/${Y} ${pad(h)}:${pad(m)}`;
    case "DD.MM.YYYY":
      return `${pad(D)}.${pad(M)}.${Y}`;
    case "DD.MM.YYYY HH:mm":
      return `${pad(D)}.${pad(M)}.${Y} ${pad(h)}:${pad(m)}`;
    case "MM/DD/YYYY":
      return `${pad(M)}/${pad(D)}/${Y}`;
    case "MM/DD/YYYY hh:mm A": {
      const h12 = h % 12 === 0 ? 12 : h % 12;
      return `${pad(M)}/${pad(D)}/${Y} ${pad(h12)}:${pad(m)} ${h < 12 ? "AM" : "PM"}`;
    }
    case "DD MMM YYYY":
      return `${pad(D)} ${MONTH_ABBR[M - 1]} ${Y}`;
    case "MMM DD, YYYY":
      return `${MONTH_ABBR[M - 1]} ${pad(D)}, ${Y}`;
    case "HH:mm":
      return `${pad(h)}:${pad(m)}`;
    case "Unix seconds":
      return String(Math.floor(date.getTime() / 1000));
    case "ISO 8601":
    default:
      return date.toISOString();
  }
}
