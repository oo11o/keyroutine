import { h, clear, iconButton } from "./el";
import { icon } from "./icons";

// The variables editor, carried over from the old plain-JS options page. Same
// behaviour, now in TypeScript and sharing the page with the builder — the two
// belong together: a stack references $secret_<name>, and the variable picker
// offers those names from here.
//
// The tab says "Variables" because that is what they are to someone building a
// stack: a value you store once and reference by name. The reference itself is
// still $secret_<name>, and the storage key is still `secrets` — renaming
// either would break every config already written against them.

const rows = h("div", { id: "secret-rows" });
const status = h("span", { class: "status" });

// Values arrive masked. Not because the page is a threat — it is the one place
// they are legitimately edited — but because a builder is a thing people screen
// share and screenshot, and a token on display is a token out in the open.
function addRow(name = "", value = ""): void {
  const nameEl = h("input", { class: "name input mono", type: "text", placeholder: "runToken", value: name });
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

  const row = h("div", { class: "secret-row" }, nameEl, valueEl, reveal);
  row.append(iconButton("close", "Remove", () => row.remove()));
  rows.append(row);
}

function setStatus(text: string, isError: boolean): void {
  status.textContent = text;
  status.className = isError ? "status error" : "status";
  if (text) setTimeout(() => (status.textContent = ""), 2000);
}

export async function loadSecretNames(): Promise<string[]> {
  const stored = (await chrome.storage.local.get("secrets")) as { secrets?: Record<string, string> };
  return Object.keys(stored.secrets ?? {});
}

async function save(onSaved: (names: string[]) => void): Promise<void> {
  const secrets: Record<string, string> = {};
  for (const row of rows.querySelectorAll(".secret-row")) {
    const name = (row.querySelector(".name") as HTMLInputElement).value.trim();
    const value = (row.querySelector(".value") as HTMLInputElement).value;
    if (!name) continue; // a blank name is an unfilled row, not an error
    // $secret_<name> is resolved by the \w+ in core/context.ts's template
    // regex, so anything outside [A-Za-z0-9_] could never be referenced.
    if (!/^\w+$/.test(name)) {
      setStatus(`"${name}" must use letters, digits, or _ only`, true);
      return;
    }
    secrets[name] = value;
  }
  await chrome.storage.local.set({ secrets });
  setStatus("Saved", false);
  onSaved(Object.keys(secrets));
}

// `onSaved` hands the names back to the builder so the variable picker stops
// offering a variable that was just deleted, and starts offering a new one.
export async function renderSecrets(pane: HTMLElement, onSaved: (names: string[]) => void): Promise<void> {
  clear(pane);
  clear(rows);

  const stored = (await chrome.storage.local.get("secrets")) as { secrets?: Record<string, string> };
  const entries = Object.entries(stored.secrets ?? {});
  if (entries.length === 0) addRow();
  else for (const [name, value] of entries) addRow(name, value);

  pane.append(
    h("h2", { text: "Variables" }),
    h(
      "p",
      { class: "lede" },
      "Values a stack can reference as ",
      h("code", { text: "$secret_<name>" }),
      " — a name of ",
      h("code", { text: "runToken" }),
      " is used as ",
      h("code", { text: "$secret_runToken" }),
      ". They are masked in toasts, and they never touch the config."
    ),
    h("p", {
      class: "notice",
      text:
        "This is not encryption. An extension has no server, so these sit in plaintext on this " +
        "machine and anyone with devtools can read them. What it does buy: they stay out of git, " +
        "and no web page can fetch them."
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
