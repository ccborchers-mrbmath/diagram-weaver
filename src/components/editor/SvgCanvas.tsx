import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { parseSvg, translateElementById } from "@/lib/svg/parse";

type Props = {
  svgSource: string;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (nextSvg: string) => void;
};

type BBox = { x: number; y: number; width: number; height: number };

export function SvgCanvas({ svgSource, selectedId, onSelect, onChange }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [viewBox, setViewBox] = useState<string>("0 0 400 300");
  const [selectionBox, setSelectionBox] = useState<BBox | null>(null);

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

  // Inject SVG into the DOM. We use innerHTML because we need real DOM nodes
  // to attach pointer handlers to and to read getBBox() from.
  useLayoutEffect(() => {
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
  useLayoutEffect(() => {
    if (!selectedId) {
      setSelectionBox(null);
      return;
    }
    const host = hostRef.current;
    if (!host) return;
    const el = host.querySelector(`#${cssEscape(selectedId)}`) as
      | SVGGraphicsElement
      | null;
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
      const onPointerDown = (e: PointerEvent) => {
        e.stopPropagation();
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

        const start = toSvg(e.clientX, e.clientY);
        let latest = svgSource;
        el.setPointerCapture(e.pointerId);
        el.style.cursor = "grabbing";

        const onMove = (ev: PointerEvent) => {
          const cur = toSvg(ev.clientX, ev.clientY);
          const dx = cur.x - start.x;
          const dy = cur.y - start.y;
          const next = translateElementById(latest, id, dx, dy);
          if (next) {
            latest = next;
            onChange(next);
            // update start so subsequent deltas are relative to last position
            start.x = cur.x;
            start.y = cur.y;
          }
        };
        const onUp = (ev: PointerEvent) => {
          try {
            el.releasePointerCapture(ev.pointerId);
          } catch {
            /* noop */
          }
          el.style.cursor = "grab";
          el.removeEventListener("pointermove", onMove);
          el.removeEventListener("pointerup", onUp);
          el.removeEventListener("pointercancel", onUp);
        };
        el.addEventListener("pointermove", onMove);
        el.addEventListener("pointerup", onUp);
        el.addEventListener("pointercancel", onUp);
      };
      el.addEventListener("pointerdown", onPointerDown);
      cleanups.push(() => el.removeEventListener("pointerdown", onPointerDown));
    }

    const onBgDown = () => onSelect(null);
    svg.addEventListener("pointerdown", onBgDown);
    cleanups.push(() => svg.removeEventListener("pointerdown", onBgDown));

    return () => cleanups.forEach((c) => c());
  }, [renderSource, svgSource, onChange, onSelect]);

  return (
    <div className="relative h-full w-full bg-[color:var(--canvas-bg)] overflow-hidden">
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
  );
}

function cssEscape(id: string): string {
  if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(id);
  return id.replace(/([^a-zA-Z0-9_-])/g, "\\$1");
}
