import { h, clear, iconButton } from "./el";
import { icon } from "./icons";
import { BUILTINS } from "../core/context";
import { VARS_KEY } from "../content/vars";

// The variables editor. A variable is a value you store once and reference by
// name: $example, $apiBase, $testPassword. The builder's variable picker
// offers the names from here, so the two belong on one page.
//
// They were called secrets and read as $secret_<name> until 0.7. The prefix
// bought nothing — the value is plaintext on the machine either way — and cost
// legibility in every template that used one. See core/context.ts.

const rows = h("div", { id: "var-rows" });
const status = h("span", { class: "status" });

// Values arrive hidden behind the eye toggle. Not because the page is a threat
// — it is the one place they are legitimately edited — but because a builder is
// a thing people screen share and screenshot, and a token on display is a token
// out in the open.
function addRow(name = "", value = ""): void {
  const nameEl = h("input", { class: "name input mono", type: "text", placeholder: "example", value: name });
  const valueEl = h("input", {
    class: "value input mono",
    type: "password",
    placeholder: "value",
    value
  });

  const reveal = iconButton("eye", "Show value", () => {
    const hidden = valueEl.type === "password";
    valueEl.type = hidden ? "text" : "password";
    reveal.title = hidden ? "Hide value" : "Show value";
    reveal.setAttribute("aria-label", reveal.title);
    reveal.setAttribute("aria-pressed", hidden ? "true" : "false");
    reveal.replaceChildren(icon(hidden ? "eyeOff" : "eye"));
  });
  reveal.setAttribute("aria-pressed", "false");

  const row = h("div", { class: "var-row" }, nameEl, valueEl, reveal);
  row.append(iconButton("close", "Remove", () => row.remove()));
  rows.append(row);
}

function setStatus(text: string, isError: boolean): void {
  status.textContent = text;
  status.className = isError ? "status error" : "status";
  if (text) setTimeout(() => (status.textContent = ""), 2000);
}

export async function loadVarNames(): Promise<string[]> {
  return Object.keys(await read());
}

// The rename is finished on the way in, not by a migration pass: whatever the
// values were stored under, they are edited here and written back under the
// new key.
async function read(): Promise<Record<string, string>> {
  const stored = (await chrome.storage.local.get([VARS_KEY, "secrets"])) as {
    vars?: Record<string, string>;
    secrets?: Record<string, string>;
  };
  return stored.vars ?? stored.secrets ?? {};
}

async function save(onSaved: (names: string[]) => void): Promise<void> {
  const vars: Record<string, string> = {};
  for (const row of rows.querySelectorAll(".var-row")) {
    const name = (row.querySelector(".name") as HTMLInputElement).value.trim();
    const value = (row.querySelector(".value") as HTMLInputElement).value;
    if (!name) continue; // a blank name is an unfilled row, not an error
    // $<name> is resolved by the \w+ in core/context.ts's template regex, so
    // anything outside [A-Za-z0-9_] could never be referenced.
    if (!/^\w+$/.test(name)) {
      setStatus(`"${name}" must use letters, digits, or _ only`, true);
      return;
    }
    // Without the old prefix a variable can collide with a builtin, and it
    // would win — $url would stop describing the page. Refused here rather
    // than left to be discovered in a routine that quietly does the wrong thing.
    if ((BUILTINS as readonly string[]).includes(name)) {
      setStatus(`"${name}" is a built-in variable — pick another name`, true);
      return;
    }
    vars[name] = value;
  }
  await chrome.storage.local.set({ [VARS_KEY]: vars });
  setStatus("Saved", false);
  onSaved(Object.keys(vars));
}

// `onSaved` hands the names back to the builder so the variable picker stops
// offering a variable that was just deleted, and starts offering a new one.
export async function renderVars(pane: HTMLElement, onSaved: (names: string[]) => void): Promise<void> {
  clear(pane);
  clear(rows);

  const entries = Object.entries(await read());
  if (entries.length === 0) addRow();
  else for (const [name, value] of entries) addRow(name, value);

  pane.append(
    h("h2", { text: "Variables" }),
    h(
      "p",
      { class: "lede" },
      "Reusable values that routines can reference using ",
      h("code", { text: "$name" }),
      ", such as ",
      h("code", { text: "$username" }),
      " or ",
      h("code", { text: "$companyCode" }),
      "."
    ),
    h(
      "p",
      { class: "lede" },
      "Define a value once and reuse it across routines without changing their configuration. " +
        "When you share a routine, its variable references are preserved, but your personal " +
        "values are not included."
    ),
    h("p", {
      class: "notice",
      text:
        "Variables are stored locally in your browser and are not encrypted. Anyone with " +
        "sufficient access to your browser profile or developer tools may be able to read them. " +
        "Do not store highly sensitive secrets."
    }),
    rows,
    h(
      "div",
      { class: "actions" },
      h("button", { type: "button", class: "btn", text: "Add variable", onClick: () => addRow() }),
      h("button", { type: "button", class: "btn btn-primary", text: "Save", onClick: () => void save(onSaved) }),
      status
    )
  );
}
