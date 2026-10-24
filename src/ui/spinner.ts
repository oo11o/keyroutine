// A lightweight "working" indicator for a step that takes a moment (a
// background fetch) and would otherwise leave the screen blank until it
// resolves. Distinct from the toast in what it says — this only ever means
// "in progress", never a result — but it shares the toast's own zone and
// sits in its own slot there (see ./toast): stacked below whatever toast is
// currently up, rather than a separate element pinned to the identical fixed
// coordinates, which used to render on top of the toast and bury it instead
// of appearing alongside it.
import { getSpinnerSlot } from "./toast";

// Shows the indicator and returns a function that hides it. Only one spinner
// is ever up — showing a second while the first is up replaces it, the same
// "latest wins" rule the toast follows, now scoped to just this slot: the
// toast slot next to it is untouched either way.
export function showSpinner(text: string): () => void {
  const slot = getSpinnerSlot();
  slot.replaceChildren();

  const el = document.createElement("div");
  el.className = "spinner";
  const dot = document.createElement("span");
  dot.className = "dot";
  const label = document.createElement("span");
  label.textContent = text;
  el.append(dot, label);
  slot.appendChild(el);

  let hidden = false;
  return () => {
    if (hidden) return; // safe to call more than once (e.g. finally + an early return)
    hidden = true;
    el.remove();
  };
}
