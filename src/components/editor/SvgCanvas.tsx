import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Circle,
  Maximize2,
  Minus,
  MousePointer2,
  Plus,
  Slash,
  Square,
  type LucideIcon,
} from "lucide-react";
import { ensureIdsOnSvg, parseSvg } from "@/lib/svg/parse";

type Props = {
  svgSource: string;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (nextSvg: string) => void;
};

type BBox = { x: number; y: number; width: number; height: number };

type Transform = { scale: number; tx: number; ty: number };
const MIN_SCALE = 0.25;
const MAX_SCALE = 8;
const IDENTITY: Transform = { scale: 1, tx: 0, ty: 0 };
const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

type Popup = { x: number; y: number; below: boolean };
// A draggable geometry handle, positioned in container pixels. `role` tells the
// drag handler which attribute(s) of the element to rewrite.
type HandleRole =
  | { kind: "line"; point: "x1y1" | "x2y2" }
  | { kind: "vertex"; index: number }
  | { kind: "rect"; corner: "nw" | "ne" | "sw" | "se" }
  | { kind: "circle-r" }
  | { kind: "ellipse-rx" }
  | { kind: "ellipse-ry" };
type Handle = { id: string; x: number; y: number; role: HandleRole };
type Tool = "select" | "line" | "rect" | "ellipse";
type Draft = { x1: number; y1: number; x2: number; y2: number };
const RESIZE_STEP = 1.12; // per-click enlarge/shrink factor for the mini-toolbar
const round2 = (n: number): string => (Math.round(n * 100) / 100).toString();

const DRAW_STROKE = "#0f172a";
const DRAW_WIDTH = "2";
const TOOLS: { tool: Tool; icon: LucideIcon; label: string }[] = [
  { tool: "select", icon: MousePointer2, label: "Select" },
  { tool: "line", icon: Slash, label: "Line" },
  { tool: "rect", icon: Square, label: "Rectangle" },
  { tool: "ellipse", icon: Circle, label: "Ellipse" },
];

/** Map a client (screen) point into the SVG's user coordinates (viewBox space),
 *  accounting for the viewBox mapping and the CSS zoom/pan transform. */
function clientToUser(svg: SVGSVGElement, clientX: number, clientY: number): DOMPoint | null {
  const m = svg.getScreenCTM();
  if (!m) return null;
  return new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
}

function parsePoints(s: string): [number, number][] {
  const nums = (s.trim().match(/-?[\d.]+/g) || []).map(Number);
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) out.push([nums[i], nums[i + 1]]);
  return out;
}
function serializePoints(pts: [number, number][]): string {
  return pts.map(([x, y]) => `${round2(x)},${round2(y)}`).join(" ");
}

// Geometry handles for the selected element, positioned in container pixels and
// honouring the element's own transform via getScreenCTM. Lines get endpoint
// handles; polylines/polygons a handle per vertex; rects four corners; circles
// a radius handle; ellipses one per axis.
function computeHandles(el: SVGGraphicsElement, cr: DOMRect): Handle[] {
  const scm = el.getScreenCTM();
  if (!scm) return [];
  const at = (a: string) => parseFloat(el.getAttribute(a) || "0");
  const toPx = (lx: number, ly: number) => {
    const p = new DOMPoint(lx, ly).matrixTransform(scm);
    return { x: p.x - cr.left, y: p.y - cr.top };
  };
  const h = (id: string, lx: number, ly: number, role: HandleRole): Handle => ({
    id,
    ...toPx(lx, ly),
    role,
  });
  switch (el.tagName.toLowerCase()) {
    case "line":
      return [
        h("p1", at("x1"), at("y1"), { kind: "line", point: "x1y1" }),
        h("p2", at("x2"), at("y2"), { kind: "line", point: "x2y2" }),
      ];
    case "polyline":
    case "polygon":
      return parsePoints(el.getAttribute("points") || "").map(([x, y], i) =>
        h(`v${i}`, x, y, { kind: "vertex", index: i }),
      );
    case "rect": {
      const x = at("x");
      const y = at("y");
      const w = at("width");
      const hgt = at("height");
      return [
        h("nw", x, y, { kind: "rect", corner: "nw" }),
        h("ne", x + w, y, { kind: "rect", corner: "ne" }),
        h("sw", x, y + hgt, { kind: "rect", corner: "sw" }),
        h("se", x + w, y + hgt, { kind: "rect", corner: "se" }),
      ];
    }
    case "circle":
      return [h("r", at("cx") + at("r"), at("cy"), { kind: "circle-r" })];
    case "ellipse":
      return [
        h("rx", at("cx") + at("rx"), at("cy"), { kind: "ellipse-rx" }),
        h("ry", at("cx"), at("cy") + at("ry"), { kind: "ellipse-ry" }),
      ];
    default:
      return [];
  }
}
// Shapes whose stroke should stay a fixed weight when the element is scaled.
const STROKED_TAGS = new Set(["path", "line", "polyline", "polygon", "circle", "ellipse", "rect"]);

// Bounding box of `el` in the SVG root's user coordinate system, including the
// element's own transform. getBBox() alone is local (pre-transform), which is
// wrong once the mini-toolbar has scaled/translated the element.
function userSpaceBBox(svg: SVGSVGElement, el: SVGGraphicsElement): BBox | null {
  try {
    const bb = el.getBBox();
    const screen = el.getScreenCTM();
    const root = svg.getScreenCTM();
    if (!screen || !root) return { x: bb.x, y: bb.y, width: bb.width, height: bb.height };
    const m = root.inverse().multiply(screen);
    const corners = [
      [bb.x, bb.y],
      [bb.x + bb.width, bb.y],
      [bb.x, bb.y + bb.height],
      [bb.x + bb.width, bb.y + bb.height],
    ].map(([x, y]) => {
      const p = svg.createSVGPoint();
      p.x = x;
      p.y = y;
      return p.matrixTransform(m);
    });
    const xs = corners.map((p) => p.x);
    const ys = corners.map((p) => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
  } catch {
    return null;
  }
}

export function SvgCanvas({ svgSource, selectedId, onSelect, onChange }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewBox, setViewBox] = useState<string>("0 0 400 300");
  const [selectionBox, setSelectionBox] = useState<BBox | null>(null);
  const [popup, setPopup] = useState<Popup | null>(null);
  const [handles, setHandles] = useState<Handle[]>([]);
  const [transform, setTransform] = useState<Transform>(IDENTITY);
  const [tool, setTool] = useState<Tool>("select");
  const [draft, setDraft] = useState<Draft | null>(null);
  const draggingRef = useRef(false);

  // Fine nudge step in user units (~0.4% of the smaller viewBox dimension) for
  // micro-adjustments; hold Shift while clicking for a coarser move.
  const nudgeStep = useMemo(() => {
    const p = viewBox.split(/[\s,]+/).map(Number);
    const w = p[2] || 400;
    const h = p[3] || 300;
    return Math.max(1, Math.round(Math.min(w, h) * 0.004));
  }, [viewBox]);

  // Shift held while clicking a nudge arrow moves in coarser steps.
  const step = (e: React.MouseEvent) => nudgeStep * (e.shiftKey ? 6 : 1);

  // Zoom toward a screen anchor (cursor or viewport centre), keeping the point
  // under the anchor fixed. getScreenCTM() reflects this CSS transform, so
  // element dragging stays pixel-accurate at any zoom.
  const zoomAt = useCallback((anchorClientX: number, anchorClientY: number, factor: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ax = anchorClientX - rect.left;
    const ay = anchorClientY - rect.top;
    setTransform((prev) => {
      const nextScale = clampScale(prev.scale * factor);
      const k = nextScale / prev.scale;
      return {
        scale: nextScale,
        tx: ax - (ax - prev.tx) * k,
        ty: ay - (ay - prev.ty) * k,
      };
    });
  }, []);

  const zoomByFactor = useCallback(
    (factor: number) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor);
    },
    [zoomAt],
  );

  const resetZoom = useCallback(() => setTransform(IDENTITY), []);

  // Mini-toolbar operations. Both compose an SVG matrix transform onto the
  // selected element (works uniformly for arcs, labels, lines, groups) and push
  // the serialized result back up, so the change lands in the code editor too.
  const applyToSelected = useCallback(
    (build: (svg: SVGSVGElement, el: SVGGraphicsElement, base: DOMMatrix) => DOMMatrix) => {
      const host = hostRef.current;
      if (!host || !selectedId) return;
      const svg = host.querySelector("svg") as SVGSVGElement | null;
      const el = host.querySelector(`#${cssEscape(selectedId)}`) as SVGGraphicsElement | null;
      if (!svg || !el) return;
      const consolidated = el.transform?.baseVal?.consolidate?.();
      const base = consolidated ? DOMMatrix.fromMatrix(consolidated.matrix) : new DOMMatrix();
      const m = build(svg, el, base);
      el.setAttribute("transform", `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e} ${m.f})`);
      onChange(new XMLSerializer().serializeToString(svg));
    },
    [selectedId, onChange],
  );

  // Translate in the SVG root's user space (+y is down). Pre-multiplying keeps
  // the nudge in screen orientation regardless of the element's own transform.
  const nudge = useCallback(
    (dx: number, dy: number) => {
      applyToSelected((_svg, _el, base) => new DOMMatrix().translate(dx, dy).multiply(base));
    },
    [applyToSelected],
  );

  // Scale about the element's current visual centre, so it grows in place.
  // Note: the legacy SVGPoint.matrixTransform rejects a DOMMatrix, so map the
  // centre with DOMMatrix.transformPoint instead.
  const resizeBy = useCallback(
    (factor: number) => {
      applyToSelected((_svg, el, base) => {
        // Keep line weight constant when scaling arcs / lines / outlines — the
        // transform would otherwise stretch the stroke too.
        if (STROKED_TAGS.has(el.tagName.toLowerCase())) {
          el.setAttribute("vector-effect", "non-scaling-stroke");
        }
        const bb = el.getBBox();
        const vc = base.transformPoint(new DOMPoint(bb.x + bb.width / 2, bb.y + bb.height / 2));
        return new DOMMatrix()
          .translate(vc.x, vc.y)
          .scale(factor)
          .translate(-vc.x, -vc.y)
          .multiply(base);
      });
    },
    [applyToSelected],
  );

  // Drag a geometry handle. The pointer is mapped from screen space into the
  // element's local coordinates via getScreenCTM (which includes any transform),
  // so it works at any zoom/pan and after a resize. `role` decides which
  // attribute(s) to rewrite.
  const startHandleDrag = (e: React.PointerEvent, handle: Handle) => {
    e.stopPropagation();
    e.preventDefault();
    const host = hostRef.current;
    const container = containerRef.current;
    if (!host || !container || !selectedId) return;
    const svg = host.querySelector("svg") as SVGSVGElement | null;
    const el = host.querySelector(`#${cssEscape(selectedId)}`) as SVGGraphicsElement | null;
    if (!svg || !el) return;
    const role = handle.role;
    const at = (a: string) => parseFloat(el.getAttribute(a) || "0");

    // A rect corner resizes about the fixed opposite corner, snapshotted here.
    let rectAnchor: { x: number; y: number } | null = null;
    if (role.kind === "rect") {
      const x = at("x");
      const y = at("y");
      const w = at("width");
      const hgt = at("height");
      rectAnchor = {
        x: role.corner === "nw" || role.corner === "sw" ? x + w : x,
        y: role.corner === "nw" || role.corner === "ne" ? y + hgt : y,
      };
    }

    draggingRef.current = true;
    setPopup(null);

    const onMove = (ev: PointerEvent) => {
      const scm = el.getScreenCTM();
      if (!scm) return;
      const p = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(scm.inverse());
      const set = (a: string, v: number) => el.setAttribute(a, round2(v));
      switch (role.kind) {
        case "line":
          if (role.point === "x1y1") {
            set("x1", p.x);
            set("y1", p.y);
          } else {
            set("x2", p.x);
            set("y2", p.y);
          }
          break;
        case "vertex": {
          const pts = parsePoints(el.getAttribute("points") || "");
          if (role.index < pts.length) {
            pts[role.index] = [p.x, p.y];
            el.setAttribute("points", serializePoints(pts));
          }
          break;
        }
        case "rect":
          if (rectAnchor) {
            set("x", Math.min(rectAnchor.x, p.x));
            set("y", Math.min(rectAnchor.y, p.y));
            set("width", Math.abs(p.x - rectAnchor.x));
            set("height", Math.abs(p.y - rectAnchor.y));
          }
          break;
        case "circle-r":
          set("r", Math.hypot(p.x - at("cx"), p.y - at("cy")));
          break;
        case "ellipse-rx":
          set("rx", Math.abs(p.x - at("cx")));
          break;
        case "ellipse-ry":
          set("ry", Math.abs(p.y - at("cy")));
          break;
      }
      setHandles(computeHandles(el, container.getBoundingClientRect()));
      setSelectionBox(userSpaceBBox(svg, el));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      draggingRef.current = false;
      onChange(new XMLSerializer().serializeToString(svg));
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  // ----- shape drawing tools -----
  const selectTool = (t: Tool) => {
    onSelect(null);
    setDraft(null);
    setTool(t);
  };

  // Escape leaves any draw tool and returns to Select.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setTool("select");
        setDraft(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const insertShape = (svg: SVGSVGElement, d: Draft) => {
    const ns = "http://www.w3.org/2000/svg";
    const id = `draw-${Math.random().toString(36).slice(2, 8)}`;
    let el: SVGElement;
    if (tool === "line") {
      el = document.createElementNS(ns, "line");
      el.setAttribute("x1", round2(d.x1));
      el.setAttribute("y1", round2(d.y1));
      el.setAttribute("x2", round2(d.x2));
      el.setAttribute("y2", round2(d.y2));
    } else if (tool === "rect") {
      el = document.createElementNS(ns, "rect");
      el.setAttribute("x", round2(Math.min(d.x1, d.x2)));
      el.setAttribute("y", round2(Math.min(d.y1, d.y2)));
      el.setAttribute("width", round2(Math.abs(d.x2 - d.x1)));
      el.setAttribute("height", round2(Math.abs(d.y2 - d.y1)));
      el.setAttribute("fill", "none");
    } else {
      el = document.createElementNS(ns, "ellipse");
      el.setAttribute("cx", round2((d.x1 + d.x2) / 2));
      el.setAttribute("cy", round2((d.y1 + d.y2) / 2));
      el.setAttribute("rx", round2(Math.abs(d.x2 - d.x1) / 2));
      el.setAttribute("ry", round2(Math.abs(d.y2 - d.y1) / 2));
      el.setAttribute("fill", "none");
    }
    el.setAttribute("id", id);
    el.setAttribute("stroke", DRAW_STROKE);
    el.setAttribute("stroke-width", DRAW_WIDTH);
    svg.appendChild(el);
    onChange(new XMLSerializer().serializeToString(svg));
  };

  const onDrawPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || tool === "select") return; // let pan / select through
    e.preventDefault();
    const host = hostRef.current;
    if (!host) return;
    const svg = host.querySelector("svg") as SVGSVGElement | null;
    if (!svg) return;
    const start = clientToUser(svg, e.clientX, e.clientY);
    if (!start) return;
    onSelect(null);
    setDraft({ x1: start.x, y1: start.y, x2: start.x, y2: start.y });

    const onMove = (ev: PointerEvent) => {
      const p = clientToUser(svg, ev.clientX, ev.clientY);
      if (p) setDraft((d) => (d ? { ...d, x2: p.x, y2: p.y } : d));
    };
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      const p = clientToUser(svg, ev.clientX, ev.clientY);
      setDraft(null);
      if (!p) return;
      // Ignore an accidental click (no drag).
      if (Math.abs(p.x - start.x) < 2 && Math.abs(p.y - start.y) < 2) return;
      insertShape(svg, { x1: start.x, y1: start.y, x2: p.x, y2: p.y });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  // Keep the latest transform in a ref so the pan gesture can snapshot it at
  // pointer-down without re-subscribing.
  const transformRef = useRef(transform);
  transformRef.current = transform;

  // Middle-button drag pans the canvas from anywhere, including over elements
  // (their handlers ignore non-primary buttons, so the event reaches here).
  const panRef = useRef(false);
  const onContainerPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 1 || panRef.current) return;
    e.preventDefault();
    const el = containerRef.current;
    if (!el) return;
    panRef.current = true;
    el.style.cursor = "grabbing";
    const startX = e.clientX;
    const startY = e.clientY;
    const base = transformRef.current;

    const onMove = (ev: PointerEvent) => {
      setTransform({
        scale: base.scale,
        tx: base.tx + (ev.clientX - startX),
        ty: base.ty + (ev.clientY - startY),
      });
    };
    const onUp = () => {
      panRef.current = false;
      el.style.cursor = "";
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }, []);

  // Ctrl + wheel (and trackpad pinch, which also sets ctrlKey) zooms toward the
  // cursor. Registered non-passive so we can preventDefault the browser zoom.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.1 : 1 / 1.1);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  // Validate incoming source; keep last valid rendered string so typing invalid
  // XML in the code editor doesn't blow away the canvas.
  const lastValidRef = useRef<string>(svgSource);
  const renderSource = useMemo(() => {
    const parsed = parseSvg(svgSource);
    if (parsed) {
      lastValidRef.current = svgSource;
      const vb = parsed.getAttribute("viewBox");
      if (vb) setViewBox(vb);
      return svgSource;
    }
    return lastValidRef.current;
  }, [svgSource]);

  // Inject SVG into the DOM. Skip re-injection while a drag is in flight so
  // the captured element doesn't get detached mid-drag.
  useLayoutEffect(() => {
    if (draggingRef.current) return;
    const host = hostRef.current;
    if (!host) return;
    host.innerHTML = renderSource;
    const svg = host.querySelector("svg");
    if (svg) {
      svg.setAttribute("width", "100%");
      svg.setAttribute("height", "100%");
      (svg as SVGSVGElement).style.display = "block";
      (svg as SVGSVGElement).style.maxHeight = "100%";
      (svg as SVGSVGElement).style.userSelect = "none";
      ensureIdsOnSvg(svg as SVGSVGElement);
    }
  }, [renderSource]);

  // Recompute the selection outline (user space) and the mini-toolbar anchor
  // (container pixels) whenever selection, source, or zoom/pan changes.
  const recomputeOverlays = () => {
    const host = hostRef.current;
    const container = containerRef.current;
    if (!selectedId || !host || !container) {
      setSelectionBox(null);
      setPopup(null);
      setHandles([]);
      return;
    }
    const svg = host.querySelector("svg") as SVGSVGElement | null;
    const el = host.querySelector(`#${cssEscape(selectedId)}`) as SVGGraphicsElement | null;
    if (!svg || !el || typeof el.getBBox !== "function") {
      setSelectionBox(null);
      setPopup(null);
      setHandles([]);
      return;
    }
    const cr = container.getBoundingClientRect();
    setSelectionBox(userSpaceBBox(svg, el));
    setHandles(computeHandles(el, cr));
    try {
      const r = el.getBoundingClientRect();
      const topY = r.top - cr.top;
      const bottomY = r.bottom - cr.top;
      const below = topY < 116; // not enough room above → drop the toolbar below
      setPopup({ x: r.left - cr.left + r.width / 2, y: below ? bottomY : topY, below });
    } catch {
      setPopup(null);
    }
  };

  useLayoutEffect(() => {
    recomputeOverlays();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, renderSource, transform]);

  // Attach pointer handlers to every [id] element for select + drag.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const svg = host.querySelector("svg") as SVGSVGElement | null;
    if (!svg) return;

    const draggables = Array.from(svg.querySelectorAll<SVGGraphicsElement>("[id]"));
    const cleanups: Array<() => void> = [];

    for (const el of draggables) {
      el.style.cursor = "grab";
      el.style.pointerEvents = "all";

      const onPointerDown = (e: PointerEvent) => {
        // Only the primary (left) button drags elements; middle button pans.
        if (e.button !== 0) return;
        e.stopPropagation();
        e.preventDefault();
        const id = el.getAttribute("id");
        if (!id) return;
        onSelect(id);

        const ctm = svg.getScreenCTM();
        if (!ctm) return;
        const inv = ctm.inverse();
        const toSvg = (clientX: number, clientY: number) => {
          const pt = svg.createSVGPoint();
          pt.x = clientX;
          pt.y = clientY;
          const p = pt.matrixTransform(inv);
          return { x: p.x, y: p.y };
        };

        const tag = el.tagName.toLowerCase();
        // Snapshot original attributes so drag is relative to drag-start.
        const origin = readPositionAttrs(el, tag);
        const start = toSvg(e.clientX, e.clientY);

        draggingRef.current = true;
        el.style.cursor = "grabbing";
        setPopup(null); // hide the mini-toolbar during a drag; it resyncs on drop
        setHandles([]); // endpoint handles resync on drop

        let rafId = 0;
        let pending: { dx: number; dy: number } | null = null;

        const apply = () => {
          rafId = 0;
          if (!pending) return;
          writePositionAttrs(el, tag, origin, pending.dx, pending.dy);
          // Update selection outline live.
          const box = userSpaceBBox(svg, el as SVGGraphicsElement);
          if (box) setSelectionBox(box);
        };

        const onMove = (ev: PointerEvent) => {
          const cur = toSvg(ev.clientX, ev.clientY);
          pending = { dx: cur.x - start.x, dy: cur.y - start.y };
          if (!rafId) rafId = requestAnimationFrame(apply);
        };

        const onUp = () => {
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
          window.removeEventListener("pointercancel", onUp);
          if (rafId) cancelAnimationFrame(rafId);
          el.style.cursor = "grab";
          draggingRef.current = false;
          // Serialize final DOM state once, propagate to parent/code editor.
          const serialized = new XMLSerializer().serializeToString(svg);
          onChange(serialized);
        };

        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        window.addEventListener("pointercancel", onUp);
      };

      el.addEventListener("pointerdown", onPointerDown);
      cleanups.push(() => el.removeEventListener("pointerdown", onPointerDown));
    }

    const onBgDown = (e: PointerEvent) => {
      // Ignore middle-button (panning) so a pan doesn't clear the selection.
      if (e.button !== 0) return;
      onSelect(null);
    };
    svg.addEventListener("pointerdown", onBgDown);
    cleanups.push(() => svg.removeEventListener("pointerdown", onBgDown));

    return () => cleanups.forEach((c) => c());
  }, [renderSource, onChange, onSelect]);

  const zoomPct = Math.round(transform.scale * 100);

  return (
    <div
      ref={containerRef}
      onPointerDown={onContainerPointerDown}
      onAuxClick={(e) => {
        if (e.button === 1) e.preventDefault();
      }}
      className="relative h-full w-full overflow-hidden bg-[color:var(--canvas-bg)]"
    >
      <div
        className="absolute inset-0"
        style={{
          transform: `translate(${transform.tx}px, ${transform.ty}px) scale(${transform.scale})`,
          transformOrigin: "0 0",
        }}
      >
        <div ref={hostRef} className="h-full w-full [&>svg]:h-full [&>svg]:w-full" />
        {selectionBox && (
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox={viewBox}
            preserveAspectRatio="xMidYMid meet"
          >
            <rect
              x={selectionBox.x - 4}
              y={selectionBox.y - 4}
              width={selectionBox.width + 8}
              height={selectionBox.height + 8}
              fill="none"
              stroke="var(--primary)"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        )}
        {draft && (
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox={viewBox}
            preserveAspectRatio="xMidYMid meet"
          >
            {tool === "line" && (
              <line
                x1={draft.x1}
                y1={draft.y1}
                x2={draft.x2}
                y2={draft.y2}
                stroke="var(--primary)"
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              />
            )}
            {tool === "rect" && (
              <rect
                x={Math.min(draft.x1, draft.x2)}
                y={Math.min(draft.y1, draft.y2)}
                width={Math.abs(draft.x2 - draft.x1)}
                height={Math.abs(draft.y2 - draft.y1)}
                fill="none"
                stroke="var(--primary)"
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              />
            )}
            {tool === "ellipse" && (
              <ellipse
                cx={(draft.x1 + draft.x2) / 2}
                cy={(draft.y1 + draft.y2) / 2}
                rx={Math.abs(draft.x2 - draft.x1) / 2}
                ry={Math.abs(draft.y2 - draft.y1) / 2}
                fill="none"
                stroke="var(--primary)"
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>
        )}
      </div>

      {/* Drawing surface — captures pointer only while a shape tool is active. */}
      {tool !== "select" && (
        <div className="absolute inset-0 z-10 cursor-crosshair" onPointerDown={onDrawPointerDown} />
      )}

      {/* Tool palette. */}
      <div className="absolute left-3 top-3 z-30 flex overflow-hidden rounded-lg border border-border bg-card/95 text-foreground shadow-sm backdrop-blur">
        {TOOLS.map(({ tool: tItem, icon: Icon, label }) => (
          <button
            key={tItem}
            type="button"
            title={label}
            aria-label={label}
            aria-pressed={tool === tItem}
            onClick={() => selectTool(tItem)}
            className={`flex h-8 w-8 items-center justify-center border-r border-border last:border-r-0 hover:bg-accent ${
              tool === tItem ? "bg-primary text-primary-foreground hover:bg-primary" : ""
            }`}
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}
      </div>

      {/* Zoom controls — outside the transformed layer so they stay fixed. */}
      <div className="absolute bottom-3 right-3 z-20 flex flex-col overflow-hidden rounded-lg border border-border bg-card/95 text-foreground shadow-sm backdrop-blur">
        <button
          type="button"
          title="Zoom in"
          aria-label="Zoom in"
          onClick={() => zoomByFactor(1.2)}
          className="flex h-8 w-8 items-center justify-center hover:bg-accent"
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          type="button"
          title="Zoom out"
          aria-label="Zoom out"
          onClick={() => zoomByFactor(1 / 1.2)}
          className="flex h-8 w-8 items-center justify-center border-t border-border hover:bg-accent"
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          type="button"
          title="Reset zoom to 100%"
          aria-label="Reset zoom"
          onClick={resetZoom}
          className="flex h-8 w-8 items-center justify-center border-t border-border hover:bg-accent"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="pointer-events-none absolute bottom-3 right-14 rounded bg-card/95 px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground shadow-sm backdrop-blur">
        {zoomPct}%
      </div>

      {/* Per-element mini-toolbar: nudge to translate, +/− to resize. */}
      {popup && (
        <div
          className="absolute z-10"
          style={{
            left: popup.x,
            top: popup.y,
            transform: popup.below
              ? "translate(-50%, 10px)"
              : "translate(-50%, calc(-100% - 10px))",
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-1 rounded-lg border border-border bg-card/95 p-1 text-foreground shadow-md backdrop-blur">
            <div className="grid grid-cols-[1.5rem_1.5rem_1.5rem] grid-rows-[1.5rem_1.5rem_1.5rem] place-items-center gap-0.5">
              <span />
              <ToolButton
                label="Move up (hold Shift for larger steps)"
                icon={ArrowUp}
                onClick={(e) => nudge(0, -step(e))}
              />
              <span />
              <ToolButton
                label="Move left (hold Shift for larger steps)"
                icon={ArrowLeft}
                onClick={(e) => nudge(-step(e), 0)}
              />
              <span />
              <ToolButton
                label="Move right (hold Shift for larger steps)"
                icon={ArrowRight}
                onClick={(e) => nudge(step(e), 0)}
              />
              <span />
              <ToolButton
                label="Move down (hold Shift for larger steps)"
                icon={ArrowDown}
                onClick={(e) => nudge(0, step(e))}
              />
              <span />
            </div>
            <div className="mx-0.5 h-9 w-px bg-border" />
            <ToolButton label="Shrink" icon={Minus} onClick={() => resizeBy(1 / RESIZE_STEP)} />
            <ToolButton label="Enlarge" icon={Plus} onClick={() => resizeBy(RESIZE_STEP)} />
          </div>
        </div>
      )}

      {/* Geometry handles for the selected shape — drag to reshape. */}
      {handles.map((h) => (
        <div
          key={h.id}
          onPointerDown={(e) => startHandleDrag(e, h)}
          title="Drag to reshape"
          className="absolute z-20 h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-primary bg-background shadow-sm"
          style={{ left: h.x, top: h.y }}
        />
      ))}
    </div>
  );
}

function ToolButton({
  label,
  icon: Icon,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="flex h-6 w-6 items-center justify-center rounded hover:bg-accent"
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

// --- helpers ---

type Origin = Record<string, number> & { __transform?: string };

function num(el: Element, name: string): number {
  return parseFloat(el.getAttribute(name) || "0") || 0;
}

function readPositionAttrs(el: Element, tag: string): Origin {
  switch (tag) {
    case "text":
    case "tspan":
    case "rect":
    case "image":
    case "use":
    case "foreignobject":
      return { x: num(el, "x"), y: num(el, "y") };
    case "circle":
    case "ellipse":
      return { cx: num(el, "cx"), cy: num(el, "cy") };
    case "line":
      return {
        x1: num(el, "x1"),
        y1: num(el, "y1"),
        x2: num(el, "x2"),
        y2: num(el, "y2"),
      };
    default:
      return { __transform: el.getAttribute("transform") || "" } as Origin;
  }
}

function writePositionAttrs(el: Element, tag: string, origin: Origin, dx: number, dy: number) {
  const s = (n: number) => (Math.round(n * 100) / 100).toString();
  switch (tag) {
    case "text":
    case "tspan":
    case "rect":
    case "image":
    case "use":
    case "foreignobject":
      el.setAttribute("x", s((origin.x ?? 0) + dx));
      el.setAttribute("y", s((origin.y ?? 0) + dy));
      break;
    case "circle":
    case "ellipse":
      el.setAttribute("cx", s((origin.cx ?? 0) + dx));
      el.setAttribute("cy", s((origin.cy ?? 0) + dy));
      break;
    case "line":
      el.setAttribute("x1", s((origin.x1 ?? 0) + dx));
      el.setAttribute("y1", s((origin.y1 ?? 0) + dy));
      el.setAttribute("x2", s((origin.x2 ?? 0) + dx));
      el.setAttribute("y2", s((origin.y2 ?? 0) + dy));
      break;
    default: {
      const existing = origin.__transform || "";
      const match = existing.match(/translate\(\s*(-?[\d.]+)[ ,]+(-?[\d.]+)\s*\)/);
      let tx = 0;
      let ty = 0;
      let rest = existing;
      if (match) {
        tx = parseFloat(match[1]);
        ty = parseFloat(match[2]);
        rest = existing.replace(match[0], "").trim();
      }
      const next = `translate(${s(tx + dx)}, ${s(ty + dy)})${rest ? " " + rest : ""}`;
      el.setAttribute("transform", next);
    }
  }
}

function cssEscape(id: string): string {
  if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(id);
  return id.replace(/([^a-zA-Z0-9_-])/g, "\\$1");
}
