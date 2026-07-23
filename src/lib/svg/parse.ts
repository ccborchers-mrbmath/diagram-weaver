// SVG parsing + drag update helpers. Single source of truth is the SVG string.

export function parseSvg(source: string): SVGSVGElement | null {
  if (typeof window === "undefined") return null;
  try {
    const doc = new DOMParser().parseFromString(source, "image/svg+xml");
    const err = doc.querySelector("parsererror");
    if (err) return null;
    const root = doc.documentElement;
    if (!root || root.tagName.toLowerCase() !== "svg") return null;
    return root as unknown as SVGSVGElement;
  } catch {
    return null;
  }
}

export function serializeSvg(root: SVGSVGElement): string {
  return new XMLSerializer().serializeToString(root);
}

export function collectDraggableIds(root: SVGSVGElement): string[] {
  const ids: string[] = [];
  root.querySelectorAll("[id]").forEach((el) => {
    const id = el.getAttribute("id");
    if (id) ids.push(id);
  });
  return ids;
}

/** Apply a translation delta (in SVG user units) to the element with `id`.
 *  Returns the new serialized SVG string, or null if no update possible. */
export function translateElementById(
  source: string,
  id: string,
  dx: number,
  dy: number,
): string | null {
  const root = parseSvg(source);
  if (!root) return null;
  const el = root.querySelector(`#${cssEscape(id)}`);
  if (!el) return null;

  const tag = el.tagName.toLowerCase();
  const num = (name: string) => parseFloat(el.getAttribute(name) || "0") || 0;
  const set = (name: string, v: number) =>
    el.setAttribute(name, roundStr(v));

  switch (tag) {
    case "text":
    case "tspan":
    case "rect":
    case "image":
    case "use":
    case "foreignobject":
      set("x", num("x") + dx);
      set("y", num("y") + dy);
      break;
    case "circle":
    case "ellipse":
      set("cx", num("cx") + dx);
      set("cy", num("cy") + dy);
      break;
    case "line":
      set("x1", num("x1") + dx);
      set("y1", num("y1") + dy);
      set("x2", num("x2") + dx);
      set("y2", num("y2") + dy);
      break;
    default: {
      // Fallback: merge into transform="translate(...)"
      const existing = el.getAttribute("transform") || "";
      const match = existing.match(/translate\(\s*(-?[\d.]+)[ ,]+(-?[\d.]+)\s*\)/);
      let tx = 0;
      let ty = 0;
      let rest = existing;
      if (match) {
        tx = parseFloat(match[1]);
        ty = parseFloat(match[2]);
        rest = existing.replace(match[0], "").trim();
      }
      const next = `translate(${roundStr(tx + dx)}, ${roundStr(ty + dy)})${
        rest ? " " + rest : ""
      }`;
      el.setAttribute("transform", next);
    }
  }
  return serializeSvg(root);
}

function roundStr(n: number): string {
  return (Math.round(n * 100) / 100).toString();
}

function cssEscape(id: string): string {
  if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(id);
  return id.replace(/([^a-zA-Z0-9_-])/g, "\\$1");
}
