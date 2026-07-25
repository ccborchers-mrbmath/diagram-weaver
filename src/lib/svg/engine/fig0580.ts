// IGCSE 0580 diagram primitives — ported from cie0580.py.
// Extends the base Fig. There is exactly ONE label-placement helper,
// point_label; direction always comes from local geometry, never hand-typed.

import { Fig, type TextOpts } from "./fig";
import {
  add,
  D,
  DASH,
  dot,
  lerp,
  LW,
  LW_THIN,
  mul,
  norm,
  pol,
  STROKE,
  sub,
  FS,
  type Pt,
} from "./geometry";

// ---- label geometry constants (one value per label TYPE, never per instance) ----
export const SIDE_GAP = 20.0;
export const VERT_GAP = 24.0;
export const RADIAL_GAP = 24.0;
export const ANGLE_LBL_R = 70.0; // uniform vertex -> angle-label distance
export const FS_ANGLE = 16; // angle numbers set smaller than point/length labels
export const TICK_LEN = 11.0;
export const TICK_SEP = 7.0;
export const PAR_LEN = 11.0;

/** Wrap a string so it renders italic (for math variables). */
export function IT(s: string): string {
  return `<tspan font-style="italic">${s}</tspan>`;
}

export function centroid(pts: Pt[]): Pt {
  const n = pts.length;
  return [pts.reduce((a, p) => a + p[0], 0) / n, pts.reduce((a, p) => a + p[1], 0) / n];
}

/** Unit normal to segment a->b pointing AWAY from `interior`. */
export function outwardNormal(a: Pt, b: Pt, interior: Pt): Pt {
  const d = norm(sub(b, a));
  const n: Pt = [-d[1], d[0]];
  const m = lerp(a, b, 0.5);
  return dot(sub(m, interior), n) > 0 ? n : [d[1], -d[0]];
}

/** Unit direction at vertex v bisecting angle p-v-q, pointing away from interior. */
export function outwardBisector(v: Pt, p: Pt, q: Pt, interior: Pt): Pt {
  const b = norm(add(norm(sub(p, v)), norm(sub(q, v))));
  return dot(sub(v, interior), b) < 0 ? mul(b, -1) : b;
}

export function radialDir(centre: Pt, p: Pt): Pt {
  return norm(sub(p, centre));
}

/** Direction bisecting the widest angular gap in a list of ray angles (deg). */
export function widestGapDir(angles: number[], tol = 1e-6): Pt {
  const a = angles.map((x) => ((x % 360) + 360) % 360).sort((m, n) => m - n);
  const gaps: Array<[number, number]> = [];
  for (let i = 0; i < a.length; i++) {
    const lo = a[i];
    const hi = a[(i + 1) % a.length] + (i === a.length - 1 ? 360 : 0);
    gaps.push([hi - lo, (((lo + (hi - lo) / 2) % 360) + 360) % 360]);
  }
  const widest = Math.max(...gaps.map(([g]) => g));
  const best = gaps.filter(([g]) => g >= widest - tol).map(([, b]) => b);
  const fromEast = (b: number) => Math.abs(((((b + 180) % 360) + 360) % 360) - 180);
  best.sort((m, n) => fromEast(m) - fromEast(n));
  return pol(1, best[0]);
}

function ellipsePts(c: Pt, a: number, b: number, t0: number, t1: number, n = 90): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = t0 + ((t1 - t0) * i) / n;
    out.push([c[0] + a * Math.cos(D(t)), c[1] + b * Math.sin(D(t))]);
  }
  return out;
}
function arcPts(c: Pt, r: number, t0: number, t1: number, n = 90): Pt[] {
  return ellipsePts(c, r, r, t0, t1, n);
}

export type AngleLabel = { v: Pt; pos: Pt; text: string; r: number };

export class Fig0580 extends Fig {
  angleLabels: AngleLabel[] = [];
  private arcSeq = 0;

  // ---------- angle arcs (overrides base) ----------
  arc(
    v: Pt,
    a1: number,
    a2: number,
    opts: { label?: string; r?: number; lblR?: number; italic?: boolean; id?: string } = {},
  ): void {
    const { label, r = 46, lblR, italic = false } = opts;
    // Auto-id the arc and its label so both are selectable/draggable on the
    // canvas even though templates don't name every angle explicitly.
    this.arcSeq += 1;
    const arcId = opts.id ?? `angle-arc-${this.arcSeq}`;
    const labelId = `angle-label-${this.arcSeq}`;
    const p1 = add(v, pol(r, a1));
    const p2 = add(v, pol(r, a2));
    const [x1, y1] = this.X(p1);
    const [x2, y2] = this.X(p2);
    const span = (((a2 - a1) % 360) + 360) % 360;
    const sweep = span <= 180 ? 0 : 1;
    const large = span > 180 ? 1 : 0;
    this.push(
      `<path id="${arcId}" d="M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} ${sweep} ${x2.toFixed(2)} ${y2.toFixed(2)}" ` +
        `fill="none" stroke="${STROKE}" stroke-width="${LW_THIN}"/>`,
    );
    if (label) {
      const bisector = (((a1 + span / 2) % 360) + 360) % 360;
      const d = lblR ?? ANGLE_LBL_R;
      const pos = add(v, pol(d, bisector));
      this.text(pos, label, {
        anchor: "middle",
        italic,
        size: FS_ANGLE,
        vcentre: true,
        id: labelId,
      });
      this.angleLabels.push({ v, pos, text: label, r: d });
    }
  }

  // ---------- generic drawing ----------
  curve(pts: Pt[], opts: { w?: number; dash?: string | null; id?: string } = {}): void {
    const { w = LW, dash = null, id } = opts;
    const d = pts
      .map((p, i) => {
        const [x, y] = this.X(p);
        return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(" ");
    const da = dash ? ` stroke-dasharray="${dash}"` : "";
    const idA = id ? ` id="${id}"` : "";
    this.push(
      `<path${idA} d="${d}" fill="none" stroke="${STROKE}" stroke-width="${w}"${da} ` +
        `stroke-linecap="round" stroke-linejoin="round"/>`,
    );
  }

  polygonOutline(pts: Pt[], opts: { w?: number; id?: string } = {}): void {
    this.curve([...pts, pts[0]], opts);
  }

  circleOutline(c: Pt, r: number, opts: { w?: number; id?: string } = {}): void {
    this.curve(arcPts(c, r, 0, 360), opts);
  }

  /** Ellipse in oblique view: FRONT (lower) half solid, BACK (upper) half dashed. */
  ellipse(c: Pt, a: number, b: number, w = LW, backDash = true): void {
    this.curve(ellipsePts(c, a, b, 180, 360), { w });
    this.curve(ellipsePts(c, a, b, 0, 180), { w, dash: backDash ? DASH : null });
  }

  arcCurve(c: Pt, r: number, t0: number, t1: number, w = LW_THIN): void {
    this.curve(arcPts(c, r, t0, t1), { w });
  }

  // ---------- exam mark-up ----------
  ticks(a: Pt, b: Pt, n = 1, size = TICK_LEN, sep = TICK_SEP, t = 0.5): void {
    const d = norm(sub(b, a));
    const nv: Pt = [-d[1], d[0]];
    const m = lerp(a, b, t);
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * sep;
      const cpt = add(m, mul(d, off));
      this.line(sub(cpt, mul(nv, size / 2)), add(cpt, mul(nv, size / 2)), { w: LW_THIN });
    }
  }

  parArrows(a: Pt, b: Pt, n = 1, size = PAR_LEN, sep = 9.0, t = 0.5): void {
    const d = norm(sub(b, a));
    const nv: Pt = [-d[1], d[0]];
    const m = lerp(a, b, t);
    for (let i = 0; i < n; i++) {
      const tip = add(m, mul(d, (i - (n - 1) / 2) * sep + size / 2));
      for (const sgn of [1, -1]) {
        this.line(tip, add(sub(tip, mul(d, size)), mul(nv, sgn * size * 0.62)), { w: LW_THIN });
      }
    }
  }

  // ---------- the single label placement helper ----------
  pointLabel(
    p: Pt,
    direction: Pt,
    text: string,
    gap: number,
    opts: { italic?: boolean; size?: number; id?: string } = {},
  ): void {
    const { italic = false, size = FS, id } = opts;
    const o: TextOpts = { anchor: "middle", italic, size, vcentre: true, id };
    this.text(add(p, mul(norm(direction), gap)), text, o);
  }

  sideLabel(
    a: Pt,
    b: Pt,
    text: string,
    interior: Pt,
    gap = SIDE_GAP,
    size = FS,
    id?: string,
  ): void {
    this.pointLabel(lerp(a, b, 0.5), outwardNormal(a, b, interior), text, gap, { size, id });
  }

  vertexLabel(v: Pt, p: Pt, q: Pt, text: string, interior: Pt, gap = VERT_GAP, id?: string): void {
    this.pointLabel(v, outwardBisector(v, p, q, interior), text, gap, { italic: true, id });
  }

  // ---------- composite objects ----------
  cone(cx: number, baseY: number, a: number, h: number, ryRatio = 0.28): Pt {
    const b = a * ryRatio;
    const c: Pt = [cx, baseY];
    const apex: Pt = [cx, baseY + h];
    this.ellipse(c, a, b);
    this.line([cx - a, baseY], apex);
    this.line([cx + a, baseY], apex);
    return apex;
  }

  cylinderWithDome(cx: number, baseY: number, r: number, h: number, ryRatio = 0.25): Pt {
    const b = r * ryRatio;
    this.ellipse([cx, baseY], r, b);
    this.line([cx - r, baseY], [cx - r, baseY + h]);
    this.line([cx + r, baseY], [cx + r, baseY + h]);
    this.ellipse([cx, baseY + h], r, b);
    this.curve(arcPts([cx, baseY + h], r, 0, 180));
    return [cx, baseY + h];
  }

  grid(xmin: number, xmax: number, ymin: number, ymax: number, u: number, w = 0.6): void {
    for (let i = xmin; i <= xmax; i++) this.line([i * u, ymin * u], [i * u, ymax * u], { w });
    for (let j = ymin; j <= ymax; j++) this.line([xmin * u, j * u], [xmax * u, j * u], { w });
  }

  axes(xmin: number, xmax: number, ymin: number, ymax: number, u: number, tickEvery = 1): void {
    this.arrow([xmin * u, 0], [(xmax + 0.55) * u, 0], { w: LW, head: 12, halfw: 4.5 });
    this.arrow([0, ymin * u], [0, (ymax + 0.55) * u], { w: LW, head: 12, halfw: 4.5 });
    for (let i = xmin; i <= xmax; i++) {
      if (i % tickEvery || i === 0) continue;
      this.text([i * u, -0.34 * u], String(i), { anchor: "middle", size: FS - 3, vcentre: true });
    }
    for (let j = ymin; j <= ymax; j++) {
      if (j % tickEvery || j === 0) continue;
      this.text([-0.3 * u, j * u], String(j), { anchor: "end", size: FS - 3, vcentre: true });
    }
    this.text([(xmax + 0.55) * u, -0.42 * u], IT("x"), {
      anchor: "middle",
      size: FS,
      vcentre: true,
    });
    this.text([-0.45 * u, (ymax + 0.55) * u], IT("y"), {
      anchor: "middle",
      size: FS,
      vcentre: true,
    });
  }

  numberLine(lo: number, hi: number, u: number, y = 0.0, tick = 9.0): void {
    this.arrow([(lo - 0.6) * u, y], [(hi + 0.6) * u, y], { w: LW, head: 13, halfw: 5.0 });
    this.arrow([(hi + 0.6) * u, y], [(lo - 0.6) * u, y], { w: LW, head: 13, halfw: 5.0 });
    for (let i = lo; i <= hi; i++) {
      this.line([i * u, y - tick / 2], [i * u, y + tick / 2], { w: LW_THIN });
      this.text([i * u, y - tick / 2 - 17], String(i), {
        anchor: "middle",
        size: FS - 3,
        vcentre: true,
      });
    }
  }

  fracLabel(
    p: Pt,
    num: number | string,
    den: number | string,
    size = FS - 3,
    bar = 17.0,
    id?: string,
  ): void {
    this.text([p[0], p[1] + 6.5], String(num), { anchor: "middle", size, vcentre: true, id });
    this.line([p[0] - bar / 2, p[1] + 1.5], [p[0] + bar / 2, p[1] + 1.5], { w: LW_THIN });
    this.text([p[0], p[1] - 13.5], String(den), { anchor: "middle", size, vcentre: true });
  }

  blankSlot(p: Pt, width = 34.0): void {
    this.line([p[0] - width / 2, p[1]], [p[0] + width / 2, p[1]], { w: LW_THIN, dash: "2,3" });
  }

  /** NOT TO SCALE, always top-right of the drawing area. */
  nts(): void {
    const xmax = this.w - this.pad - this.ox;
    const ymax = this.oy - this.pad;
    this.text([xmax - 4, ymax - 11], "NOT TO SCALE", {
      anchor: "end",
      size: FS - 3,
      vcentre: true,
    });
  }

  // ---- offsets derived from local geometry (never hand-typed per instance) ----
  static clearOfCone(a: number, t: number, label: string, pad = 12.0): number {
    return a * (1.0 - t) + Fig0580.textWidth(label) / 2.0 + pad;
  }
  static clearOfEllipse(b: number, pad = 15.0): number {
    return b + pad;
  }
  static textWidth(s: string, size = FS): number {
    return 0.5 * size * s.length;
  }
  static twoMarkParams(segLen: number, sep = 30.0): [number, number] {
    const d = sep / (2.0 * segLen);
    return [0.5 - d, 0.5 + d];
  }
}
