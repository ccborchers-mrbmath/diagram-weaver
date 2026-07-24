// Base figure ported from cie.py's Fig class.
// Works in MATH coordinates (y up); X() converts to SVG (y down) exactly once.
// An optional `id` on each primitive makes the drawn element selectable and
// draggable in the web canvas (the original Python had no ids).

import {
  add,
  mul,
  norm,
  pol,
  sub,
  DASH,
  DOT_R,
  FONT,
  FS,
  LW,
  LW_THIN,
  PUL_R,
  STROKE,
  type Pt,
} from "./geometry";

const f2 = (n: number): string => n.toFixed(2);
const idAttr = (id?: string): string => (id ? ` id="${id}"` : "");

/** Escape a plain-text string for safe insertion as SVG text content. */
export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export type TextOpts = {
  anchor?: "start" | "middle" | "end";
  italic?: boolean;
  size?: number;
  dx?: number;
  dy?: number;
  vcentre?: boolean;
  id?: string;
};

export class Fig {
  ox: number;
  oy: number;
  w: number;
  h: number;
  pad: number;
  protected s: string[] = [];

  constructor(xmin: number, xmax: number, ymin: number, ymax: number, pad = 16) {
    this.pad = pad;
    this.ox = -xmin + pad;
    this.oy = ymax + pad;
    this.w = xmax - xmin + 2 * pad;
    this.h = ymax - ymin + 2 * pad;
  }

  /** math -> svg */
  X(p: Pt): Pt {
    return [this.ox + p[0], this.oy - p[1]];
  }

  // --- primitives ---
  line(
    a: Pt,
    b: Pt,
    opts: { w?: number; dash?: string | null; color?: string; id?: string } = {},
  ): void {
    const { w = LW, dash = null, color = STROKE, id } = opts;
    const [x1, y1] = this.X(a);
    const [x2, y2] = this.X(b);
    const d = dash ? ` stroke-dasharray="${dash}"` : "";
    this.s.push(
      `<line${idAttr(id)} x1="${f2(x1)}" y1="${f2(y1)}" x2="${f2(x2)}" y2="${f2(y2)}" ` +
        `stroke="${color}" stroke-width="${w}"${d} stroke-linecap="round"/>`,
    );
  }

  arrow(a: Pt, b: Pt, opts: { w?: number; head?: number; halfw?: number; id?: string } = {}): void {
    const { w = LW, head = 14, halfw = 5.0 } = opts;
    const d = norm(sub(b, a));
    const back = sub(b, mul(d, head));
    this.line(a, back, { w });
    const n: Pt = [-d[1], d[0]];
    const p1 = add(back, mul(n, halfw));
    const p2 = sub(back, mul(n, halfw));
    const pts = [b, p1, p2]
      .map((p) => {
        const [x, y] = this.X(p);
        return `${f2(x)},${f2(y)}`;
      })
      .join(" ");
    this.s.push(`<polygon${idAttr(opts.id)} points="${pts}" fill="${STROKE}"/>`);
  }

  arc(
    v: Pt,
    a1: number,
    a2: number,
    opts: { label?: string; r?: number; lblR?: number; italic?: boolean } = {},
  ): void {
    const { label, r = 46, lblR, italic = false } = opts;
    const p1 = add(v, pol(r, a1));
    const p2 = add(v, pol(r, a2));
    const [x1, y1] = this.X(p1);
    const [x2, y2] = this.X(p2);
    const span = (((a2 - a1) % 360) + 360) % 360;
    const sweep = span <= 180 ? 0 : 1; // SVG y is flipped
    const large = span > 180 ? 1 : 0;
    this.s.push(
      `<path d="M ${f2(x1)} ${f2(y1)} A ${r} ${r} 0 ${large} ${sweep} ${f2(x2)} ${f2(y2)}" ` +
        `fill="none" stroke="${STROKE}" stroke-width="${LW_THIN}"/>`,
    );
    if (label) {
      const mid = (((a1 + span / 2) % 360) + 360) % 360;
      this.text(add(v, pol(r + (lblR ?? 20), mid)), label, {
        anchor: "middle",
        italic,
        vcentre: true,
      });
    }
  }

  rightAngle(v: Pt, a1: number, a2: number, size = 15, id?: string): void {
    const p1 = add(v, pol(size, a1));
    const p2 = add(v, pol(size, a2));
    const c = add(p1, sub(p2, v));
    const pts = [p1, c, p2]
      .map((p) => {
        const [x, y] = this.X(p);
        return `${f2(x)},${f2(y)}`;
      })
      .join(" ");
    this.s.push(
      `<polyline${idAttr(id)} points="${pts}" fill="none" stroke="${STROKE}" stroke-width="${LW_THIN}"/>`,
    );
  }

  dot(p: Pt, r = DOT_R, id?: string): void {
    const [x, y] = this.X(p);
    this.s.push(`<circle${idAttr(id)} cx="${f2(x)}" cy="${f2(y)}" r="${r}" fill="${STROKE}"/>`);
  }

  pulley(p: Pt, r = PUL_R, w = LW, id?: string): void {
    const [x, y] = this.X(p);
    this.s.push(
      `<circle${idAttr(id)} cx="${f2(x)}" cy="${f2(y)}" r="${r}" fill="#FFFFFF" ` +
        `stroke="${STROKE}" stroke-width="${w}"/>`,
    );
  }

  rect(a: Pt, b: Pt, fill = "none", id?: string): void {
    const [x1, y1] = this.X(a);
    const [x2, y2] = this.X(b);
    const x = Math.min(x1, x2);
    const y = Math.min(y1, y2);
    this.s.push(
      `<rect${idAttr(id)} x="${f2(x)}" y="${f2(y)}" width="${f2(Math.abs(x2 - x1))}" ` +
        `height="${f2(Math.abs(y2 - y1))}" fill="${fill}" stroke="${STROKE}" stroke-width="${LW}"/>`,
    );
  }

  ground(x1: number, x2: number, y = 0.0, depth = 13): void {
    const [sx1, sy] = this.X([x1, y]);
    const [sx2] = this.X([x2, y]);
    this.s.push(
      `<rect x="${f2(sx1)}" y="${f2(sy)}" width="${f2(sx2 - sx1)}" height="${depth}" ` +
        `fill="#BFBFBF" stroke="none"/>`,
    );
    this.line([x1, y], [x2, y], { w: 2.0 });
  }

  /** Text. `s` may contain <tspan> markup (e.g. from IT()); plain user text
   *  should be passed through esc() first by the caller. */
  text(p: Pt, s: string, opts: TextOpts = {}): void {
    const {
      anchor = "start",
      italic = false,
      size = FS,
      dx = 0,
      dy = 0,
      vcentre = false,
      id,
    } = opts;
    const [x, y0] = this.X(p);
    const y = y0 + (vcentre ? size * 0.35 : 0);
    const st = italic ? ' font-style="italic"' : "";
    this.s.push(
      `<text${idAttr(id)} x="${f2(x + dx)}" y="${f2(y + dy)}" font-family="${FONT}" font-size="${size}" ` +
        `text-anchor="${anchor}"${st} fill="${STROKE}">${s}</text>`,
    );
  }

  // exposed so subclasses / helpers can append raw markup
  protected push(markup: string): void {
    this.s.push(markup);
  }

  svg(): string {
    const body = this.s.join("\n  ");
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(this.w)}" height="${Math.round(this.h)}" ` +
      `viewBox="0 0 ${Math.round(this.w)} ${Math.round(this.h)}">\n  ` +
      `<rect width="100%" height="100%" fill="#ffffff"/>\n  ${body}\n</svg>\n`
    );
  }
}

export { DASH };
