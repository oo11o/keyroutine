// The builder's icons, as inline SVG. Inline rather than an icon font or a
// sprite sheet because an extension page may not load a remote font and a
// <symbol> sheet would need its own fetch — and because `stroke: currentColor`
// is what lets the same glyph sit on a purple tile and in a red strip.
//
// Each icon is a list of shapes on a 24×24 grid: "c cx cy r" is a circle,
// "r x y w h rx" a rect, anything else the `d` of a path.

export type IconName =
  | "globe"
  | "layers"
  | "play"
  | "bolt"
  | "plus"
  | "close"
  | "chevronDown"
  | "chevronRight"
  | "up"
  | "down"
  | "copy"
  | "trash"
  | "crosshair"
  | "check"
  | "minus"
  | "warn"
  | "key"
  | "keyboard"
  | "pointer"
  | "pencil"
  | "eye"
  | "clock"
  | "download"
  | "window"
  | "braces"
  | "newTab"
  | "navigate";

const SHAPES: Record<IconName, string[]> = {
  globe: ["c 12 12 9", "M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"],
  layers: ["M12 3 2 8l10 5 10-5z", "m2 13 10 5 10-5", "m2 18 10 5 10-5"],
  play: ["M7 4v16l13-8z"],
  bolt: ["M13 2 4 14h7l-1 8 9-12h-7z"],
  plus: ["M12 5v14M5 12h14"],
  close: ["M6 6l12 12M18 6 6 18"],
  chevronDown: ["m6 9 6 6 6-6"],
  chevronRight: ["m9 6 6 6-6 6"],
  up: ["M12 19V5M6 11l6-6 6 6"],
  down: ["M12 5v14M6 13l6 6 6-6"],
  copy: ["r 9 9 12 12 2", "M5 15V5a2 2 0 0 1 2-2h10"],
  trash: ["M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"],
  crosshair: ["c 12 12 7", "M12 2v4M12 18v4M2 12h4M18 12h4"],
  check: ["m5 12 5 5 9-10"],
  minus: ["M7 12h10"],
  warn: ["M12 3 2 20h20z", "M12 10v4M12 17h.01"],
  key: ["c 8 15 4", "M10.8 12.2 20 3M17 6l3 3M14 9l2 2"],
  keyboard: ["r 2 6 20 12 2", "M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"],
  pointer: ["M5 4l6.5 16 2.3-6.7L20.5 11z"],
  pencil: ["M4 20h4L20 8l-4-4L4 16z", "M14 6l4 4"],
  eye: ["M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z", "c 12 12 3"],
  clock: ["c 12 12 9", "M12 7v5l4 2"],
  download: ["M12 3v12M7 11l5 5 5-5", "M4 19h16"],
  window: ["r 3 4 18 16 2", "M3 9h18M7 6.5h.01"],
  braces: ["M8 3H7a3 3 0 0 0-3 3v3a3 3 0 0 1-2 3 3 3 0 0 1 2 3v3a3 3 0 0 0 3 3h1", "M16 3h1a3 3 0 0 1 3 3v3a3 3 0 0 0 2 3 3 3 0 0 0-2 3v3a3 3 0 0 1-3 3h-1"],
  newTab: ["M14 4h6v6", "M20 4 11 13", "M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"],
  navigate: ["M4 12h14M13 6l6 6-6 6"]
};

const NS = "http://www.w3.org/2000/svg";

export function icon(name: IconName, size?: number): SVGSVGElement {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "i");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  if (size !== undefined) {
    svg.setAttribute("width", String(size));
    svg.setAttribute("height", String(size));
  }
  for (const shape of SHAPES[name]) svg.append(shapeOf(shape));
  return svg;
}

function shapeOf(spec: string): SVGElement {
  const [kind, ...args] = spec.split(" ");
  if (kind === "c") {
    const el = document.createElementNS(NS, "circle");
    const [cx, cy, r] = args;
    el.setAttribute("cx", cx);
    el.setAttribute("cy", cy);
    el.setAttribute("r", r);
    return el;
  }
  if (kind === "r") {
    const el = document.createElementNS(NS, "rect");
    const [x, y, w, hh, rx] = args;
    el.setAttribute("x", x);
    el.setAttribute("y", y);
    el.setAttribute("width", w);
    el.setAttribute("height", hh);
    el.setAttribute("rx", rx);
    return el;
  }
  const el = document.createElementNS(NS, "path");
  el.setAttribute("d", spec);
  return el;
}
