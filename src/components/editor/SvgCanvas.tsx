import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Minus, Plus } from "lucide-react";
import { parseSvg } from "@/lib/svg/parse";

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

export function SvgCanvas({ svgSource, selectedId, onSelect, onChange }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewBox, setViewBox] = useState<string>("0 0 400 300");
  const [selectionBox, setSelectionBox] = useState<BBox | null>(null);
  const [transform, setTransform] = useState<Transform>(IDENTITY);
  const draggingRef = useRef(false);

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
    }
  }, [renderSource]);

  // Recompute selection bounding box whenever selection or source changes.
  const recomputeSelectionBox = () => {
    if (!selectedId) {
      setSelectionBox(null);
      return;
    }
    const host = hostRef.current;
    if (!host) return;
    const el = host.querySelector(`#${cssEscape(selectedId)}`) as SVGGraphicsElement | null;
    if (!el || typeof el.getBBox !== "function") {
      setSelectionBox(null);
      return;
    }
    try {
      const b = el.getBBox();
      setSelectionBox({ x: b.x, y: b.y, width: b.width, height: b.height });
    } catch {
      setSelectionBox(null);
    }
  };

  useLayoutEffect(() => {
    recomputeSelectionBox();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, renderSource]);

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

        let rafId = 0;
        let pending: { dx: number; dy: number } | null = null;

        const apply = () => {
          rafId = 0;
          if (!pending) return;
          writePositionAttrs(el, tag, origin, pending.dx, pending.dy);
          // Update selection outline live.
          try {
            const b = (el as SVGGraphicsElement).getBBox();
            setSelectionBox({ x: b.x, y: b.y, width: b.width, height: b.height });
          } catch {
            /* noop */
          }
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
      </div>

      {/* Zoom controls — outside the transformed layer so they stay fixed. */}
      <div className="absolute bottom-3 right-3 flex flex-col overflow-hidden rounded-lg border border-border bg-card/95 text-foreground shadow-sm backdrop-blur">
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
    </div>
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
