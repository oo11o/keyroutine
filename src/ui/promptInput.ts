// An in-page overlay that shows a message and asks for a line of text,
// blocking the routine until it is answered. Save (or Enter) resolves with
// the typed value; Cancel, ×, Esc, or the backdrop resolve with null. Same
// Shadow DOM reasoning as popup.ts: a page's own CSS cannot reach inside, in
// either direction — and the head/× layout deliberately matches popup.ts so
// the two panels read as one family.

let host: HTMLElement | null = null;
let root: ShadowRoot | null = null;

// Only one prompt exists at a time; opening a second cancels the first, the
// same "latest wins" rule popup.ts and toast.ts follow.
let cancelCurrent: (() => void) | null = null;

function getRoot(): ShadowRoot {
  if (root) return root;
  host = document.createElement("div");
  host.id = "keyroutine-promptinput-host";
  document.documentElement.appendChild(host);

  root = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `
    .backdrop {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      background: rgba(0, 0, 0, .45);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .panel {
      display: flex;
      flex-direction: column;
      min-width: min(420px, 92vw);
      max-width: min(560px, 92vw);
      max-height: 80vh;
      background: #1f2328;
      color: #fff;
      border-radius: 10px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, .45);
      font: 13px/1.5 -apple-system, system-ui, sans-serif;
    }
    .head {
      flex: none;
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 14px 20px;
      border-bottom: 1px solid rgba(255, 255, 255, .12);
    }
    .title {
      flex: 1;
      font-size: 17px;
      font-weight: 700;
      word-break: break-word;
    }
    .close {
      flex: none;
      cursor: pointer;
      border: 0;
      background: transparent;
      color: inherit;
      opacity: .7;
      font-size: 20px;
      line-height: 1;
      padding: 2px 6px;
    }
    .close:hover { opacity: 1; }
    .body {
      flex: 1 1 auto;
      overflow-y: auto;
      padding: 16px 20px 4px;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .field {
      flex: none;
      padding: 12px 20px 16px;
    }
    input[type="text"] {
      width: 100%;
      box-sizing: border-box;
      font: inherit;
      color: inherit;
      background: rgba(255, 255, 255, .06);
      border: 1px solid rgba(255, 255, 255, .18);
      border-radius: 6px;
      padding: 7px 9px;
      outline: none;
    }
    input[type="text"]:focus { border-color: rgba(255, 255, 255, .45); }
    .foot {
      flex: none;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 10px 20px;
      border-top: 1px solid rgba(255, 255, 255, .12);
    }
    .hint {
      font-size: 11px;
      opacity: .6;
    }
    .actions { display: flex; gap: 8px; }
    button.action {
      font: inherit;
      border: 0;
      border-radius: 6px;
      padding: 7px 14px;
      cursor: pointer;
    }
    .cancel {
      background: transparent;
      color: inherit;
      opacity: .75;
    }
    .cancel:hover { opacity: 1; }
    .save {
      background: #3b82f6;
      color: #fff;
    }
    .save:hover { background: #2563eb; }
  `;
  root.appendChild(style);
  return root;
}

// Resolves with the typed text on Save/Enter, or null on Cancel/×/Esc/backdrop.
// Either way the panel is gone when it resolves.
export function showPromptInput(title: string, body: string): Promise<string | null> {
  cancelCurrent?.();

  const r = getRoot();

  const backdrop = document.createElement("div");
  backdrop.className = "backdrop";

  const panel = document.createElement("div");
  panel.className = "panel";

  const head = document.createElement("div");
  head.className = "head";
  const titleEl = document.createElement("span");
  titleEl.className = "title";
  titleEl.textContent = title;
  const closeBtn = document.createElement("button");
  closeBtn.className = "close";
  closeBtn.textContent = "×";
  closeBtn.setAttribute("aria-label", "Cancel");
  head.append(titleEl, closeBtn);

  const bodyEl = document.createElement("div");
  bodyEl.className = "body";
  bodyEl.textContent = body;

  const field = document.createElement("div");
  field.className = "field";
  const input = document.createElement("input");
  input.type = "text";
  field.appendChild(input);

  const foot = document.createElement("div");
  foot.className = "foot";
  const hint = document.createElement("span");
  hint.className = "hint";
  hint.textContent = "enter to save · esc to cancel";
  const actions = document.createElement("div");
  actions.className = "actions";
  const cancelBtn = document.createElement("button");
  cancelBtn.className = "action cancel";
  cancelBtn.textContent = "Cancel";
  const saveBtn = document.createElement("button");
  saveBtn.className = "action save";
  saveBtn.textContent = "Save";
  actions.append(cancelBtn, saveBtn);
  foot.append(hint, actions);

  panel.append(head, bodyEl, field, foot);
  backdrop.appendChild(panel);
  r.appendChild(backdrop);

  const previouslyFocused = document.activeElement as HTMLElement | null;
  input.focus();

  return new Promise<string | null>((resolve) => {
    let settled = false;

    const finish = (value: string | null) => {
      if (settled) return; // save, cancel, ×, esc and backdrop all land here; only the first wins
      settled = true;
      document.removeEventListener("keydown", onKeydown, true);
      backdrop.remove();
      if (cancelCurrent === cancel) cancelCurrent = null;
      previouslyFocused?.focus?.();
      resolve(value);
    };

    const save = () => finish(input.value);
    const cancel = () => finish(null);

    // Capture phase + stopPropagation, so a page with its own key handling
    // does not also react to the keys that close this panel.
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        cancel();
      } else if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        save();
      }
    };

    document.addEventListener("keydown", onKeydown, true);
    saveBtn.addEventListener("click", save);
    cancelBtn.addEventListener("click", cancel);
    closeBtn.addEventListener("click", cancel);
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) cancel(); // clicks inside the panel keep it open
    });

    cancelCurrent = cancel;
  });
}
