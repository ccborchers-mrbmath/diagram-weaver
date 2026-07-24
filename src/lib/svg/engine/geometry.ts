// Geometry toolkit ported from cie.py.
// Everything works in MATH coordinates (y up); Fig.X() converts to SVG once.
// The guiding rule from the original library holds: no coordinate is typed by eye.

export type Pt = readonly [number, number];

export const D = (deg: number): number => (deg * Math.PI) / 180;

/** polar -> cartesian, math convention */
export function pol(r: number, deg: number): Pt {
  return [r * Math.cos(D(deg)), r * Math.sin(D(deg))];
}
export function add(a: Pt, b: Pt): Pt {
  return [a[0] + b[0], a[1] + b[1]];
}
export function sub(a: Pt, b: Pt): Pt {
  return [a[0] - b[0], a[1] - b[1]];
}
export function mul(a: Pt, k: number): Pt {
  return [a[0] * k, a[1] * k];
}
export function hypot(a: Pt): number {
  return Math.hypot(a[0], a[1]);
}
export function norm(a: Pt): Pt {
  const L = Math.hypot(a[0], a[1]);
  return [a[0] / L, a[1] / L];
}
/** angle of vector a->b, degrees, math convention, normalized to [0,360) */
export function ang(a: Pt, b: Pt): number {
  const d = sub(b, a);
  return ((Math.atan2(d[1], d[0]) * 180) / Math.PI + 360) % 360;
}
export function lerp(a: Pt, b: Pt, t: number): Pt {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}
/** unit perpendicular to d with positive y */
export function perpUp(d: Pt): Pt {
  const p: Pt = [-d[1], d[0]];
  return p[1] >= 0 ? p : [d[1], -d[0]];
}
export function rot(v: Pt, deg: number): Pt {
  const a = D(deg);
  return [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)];
}
export function dist(a: Pt, b: Pt): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}
export function dot(a: Pt, b: Pt): number {
  return a[0] * b[0] + a[1] * b[1];
}
export function cross(a: Pt, b: Pt): number {
  return a[0] * b[1] - a[1] * b[0];
}

/** The two tangent points on circle (C,R) from external point P. */
export function tangentPoints(P: Pt, C: Pt, R: number): [Pt, Pt] {
  const d = sub(P, C);
  const Lp = Math.hypot(d[0], d[1]);
  if (Lp <= R) throw new Error("point inside circle");
  const phi = (Math.acos(R / Lp) * 180) / Math.PI;
  const u = norm(d);
  return [add(C, mul(rot(u, phi), R)), add(C, mul(rot(u, -phi), R))];
}

/** Intersection of line through p1 at angle a1 with line through p2 at angle a2. */
export function lineIntersect(p1: Pt, a1: number, p2: Pt, a2: number): Pt {
  const d1 = pol(1, a1);
  const d2 = pol(1, a2);
  const den = d1[0] * d2[1] - d1[1] * d2[0];
  if (Math.abs(den) < 1e-12) throw new Error("parallel lines");
  const t = ((p2[0] - p1[0]) * d2[1] - (p2[1] - p1[1]) * d2[0]) / den;
  return add(p1, mul(d1, t));
}

// ---- house style (from cie.py) -------------------------------------------
export const STROKE = "#000000";
export const LW = 1.5; // main line weight
export const LW_THIN = 1.1; // arcs, string
export const DASH = "7,4";
// Times New Roman first (Word/Windows). 'Liberation Serif' is the metric-compatible
// clone so a machine without TNR still lays out identically.
export const FONT = "'Times New Roman', 'Liberation Serif', Times, serif";
export const FS = 19; // label size
export const ARC_R = 46; // default angle-arc radius
export const ARC_LBL = 20; // label offset beyond arc
export const DOT_R = 5.5; // particle
export const PUL_R = 10.0; // pulley
