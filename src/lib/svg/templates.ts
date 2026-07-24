// Parameterized diagram templates, ported from build_0580_p2_diagrams.py.
// Every figure is computed by the engine — no coordinate is typed by eye — so
// the output matches the original Python library. Teachers edit the numeric /
// text parameters; the engine guarantees correct geometry and label placement.

import {
  Fig0580,
  IT,
  add,
  ang,
  centroid,
  dist,
  lerp,
  lineIntersect,
  mul,
  norm,
  outwardNormal,
  pol,
  radialDir,
  sub,
  widestGapDir,
  DASH,
  LW,
  LW_THIN,
  type Pt,
} from "./engine";

// ---------------------------------------------------------------------------
// Registry types
// ---------------------------------------------------------------------------

export type ParamSpec =
  | {
      key: string;
      label: string;
      type: "number" | "integer";
      default: number;
      min?: number;
      max?: number;
      step?: number;
    }
  | { key: string; label: string; type: "text"; default: string }
  | { key: string; label: string; type: "boolean"; default: boolean }
  | {
      key: string;
      label: string;
      type: "select";
      default: string;
      options: { value: string; label: string }[];
    };

export type ParamValues = Record<string, number | string | boolean>;

export type Template = {
  id: string;
  name: string;
  category: string;
  description: string;
  params: ParamSpec[];
  render: (p: ParamValues) => string;
};

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Round to 2dp and strip trailing zeros — for computed side lengths. */
function fmt(n: number): string {
  const r = Math.round(n * 100) / 100;
  return String(r);
}
function n(p: ParamValues, k: string): number {
  return typeof p[k] === "number" ? (p[k] as number) : Number(p[k]);
}
function t(p: ParamValues, k: string): string {
  return String(p[k]);
}
function b(p: ParamValues, k: string): boolean {
  return Boolean(p[k]);
}

/** Apply defaults + coerce/clamp raw params against a template's spec. */
export function coerceParams(tpl: Template, raw: ParamValues = {}): ParamValues {
  const out: ParamValues = {};
  for (const spec of tpl.params) {
    const v = raw[spec.key];
    if (spec.type === "number" || spec.type === "integer") {
      let num = v === undefined || v === null || v === "" ? spec.default : Number(v);
      if (!Number.isFinite(num)) num = spec.default;
      if (spec.type === "integer") num = Math.round(num);
      if (spec.min !== undefined) num = Math.max(spec.min, num);
      if (spec.max !== undefined) num = Math.min(spec.max, num);
      out[spec.key] = num;
    } else if (spec.type === "boolean") {
      out[spec.key] = v === undefined ? spec.default : Boolean(v);
    } else if (spec.type === "select") {
      const allowed = spec.options.map((o) => o.value);
      out[spec.key] = allowed.includes(String(v)) ? String(v) : spec.default;
    } else {
      out[spec.key] = v === undefined || v === null ? spec.default : String(v);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

// ---- number line -----------------------------------------------------------
const numberLine: Template = {
  id: "number-line",
  name: "Number line",
  category: "Number",
  description: "Integer number line with an axis variable — annotate for inequalities.",
  params: [
    { key: "lo", label: "Minimum", type: "integer", default: -6, min: -20, max: 0 },
    { key: "hi", label: "Maximum", type: "integer", default: 6, min: 0, max: 20 },
    { key: "variable", label: "Variable", type: "text", default: "x" },
  ],
  render: (p) => {
    const lo = n(p, "lo");
    const hi = Math.max(n(p, "hi"), lo + 1);
    const U = 34.0;
    const f = new Fig0580(lo * U - 40, hi * U + 40, -46, 34);
    f.numberLine(lo, hi, U, 0.0);
    f.text([(hi + 1.15) * U, 0.0], IT(t(p, "variable")), {
      anchor: "middle",
      vcentre: true,
      id: "label-var",
    });
    return f.svg();
  },
};

// ---- trapezium -------------------------------------------------------------
const trapezium: Template = {
  id: "trapezium",
  name: "Trapezium (right-angled)",
  category: "Mensuration",
  description: "Right-angled trapezium with parallel sides, height, and computed slant.",
  params: [
    { key: "top", label: "Top parallel", type: "number", default: 6, min: 1, max: 40 },
    { key: "bottom", label: "Bottom parallel", type: "number", default: 14, min: 1, max: 40 },
    { key: "height", label: "Height", type: "number", default: 6, min: 1, max: 40 },
    { key: "nts", label: "Show NOT TO SCALE", type: "boolean", default: true },
  ],
  render: (p) => {
    const top = n(p, "top");
    const bottom = n(p, "bottom");
    const height = n(p, "height");
    const S = 26.0;
    const BL: Pt = [0, 0];
    const BR: Pt = [bottom * S, 0];
    const TL: Pt = [0, height * S];
    const TR: Pt = [top * S, height * S];
    const P = [BL, BR, TR, TL];
    const I = centroid(P);
    const slant = Math.hypot((bottom - top) * S, height * S) / S;
    const f = new Fig0580(-70, bottom * S + 70, -52, height * S + 56);
    f.polygonOutline(P, { id: "trapezium" });
    f.rightAngle(BL, 0, 90);
    f.rightAngle(TL, 270, 0);
    f.sideLabel(TL, TR, `${fmt(top)} cm`, I, undefined, undefined, "label-top");
    f.sideLabel(BL, BR, `${fmt(bottom)} cm`, I, undefined, undefined, "label-bottom");
    f.sideLabel(BL, TL, `${fmt(height)} cm`, I, undefined, undefined, "label-left");
    f.sideLabel(TR, BR, `${fmt(slant)} cm`, I, undefined, undefined, "label-slant");
    if (b(p, "nts")) f.nts();
    return f.svg();
  },
};

// ---- sector ----------------------------------------------------------------
const sector: Template = {
  id: "sector",
  name: "Circular sector",
  category: "Mensuration",
  description: "Sector of a circle opening to the right, symmetric about the axis.",
  params: [
    { key: "angle", label: "Angle (°)", type: "number", default: 60, min: 5, max: 300 },
    { key: "radiusLabel", label: "Radius label", type: "text", default: "15 cm" },
    { key: "arcLabel", label: "Arc label", type: "text", default: "nπ cm" },
    { key: "nts", label: "Show NOT TO SCALE", type: "boolean", default: true },
  ],
  render: (p) => {
    const R = 190.0;
    const TH = n(p, "angle");
    const O: Pt = [0, 0];
    const P = pol(R, TH / 2);
    const Q = pol(R, -TH / 2);
    const f = new Fig0580(-96, R + 96, -R * 0.62 - 54, R * 0.62 + 54);
    f.line(O, P, { id: "radius-OP" });
    f.line(O, Q, { id: "radius-OQ" });
    f.arcCurve(O, R, -TH / 2, TH / 2, LW);
    f.arc(O, -TH / 2, TH / 2, { label: `${fmt(TH)}°` });
    f.sideLabel(
      O,
      P,
      t(p, "radiusLabel"),
      centroid([O, P, Q]),
      undefined,
      undefined,
      "label-radius",
    );
    f.pointLabel(pol(R, 0), radialDir(O, pol(R, 0)), t(p, "arcLabel"), 30, { id: "label-arc" });
    f.pointLabel(O, widestGapDir([TH / 2, -TH / 2]), IT("O"), 24, { id: "label-O" });
    if (b(p, "nts")) f.nts();
    return f.svg();
  },
};

// ---- similar cones ---------------------------------------------------------
const similarCones: Template = {
  id: "similar-cones",
  name: "Two similar cones",
  category: "Similarity",
  description: "Two mathematically similar cones drawn at a chosen (non-true) ratio.",
  params: [
    {
      key: "drawnScale",
      label: "Drawn size ratio B:A",
      type: "number",
      default: 1.8,
      min: 1.1,
      max: 3,
      step: 0.1,
    },
    { key: "labelA", label: "Solid A dimension", type: "text", default: "4 cm" },
    { key: "labelB", label: "Solid B dimension", type: "text", default: "H cm" },
    { key: "nameA", label: "Solid A name", type: "text", default: "A" },
    { key: "nameB", label: "Solid B name", type: "text", default: "B" },
  ],
  render: (p) => {
    const SCALE = n(p, "drawnScale");
    const aA = 52.0;
    const hA = 150.0;
    const aB = aA * SCALE;
    const hB = hA * SCALE;
    const cxA = 0.0;
    const cxB = 330.0;
    const labA = t(p, "labelA");
    const labB = t(p, "labelB");
    const f = new Fig0580(cxA - aA - 60, cxB + aB + 60, -76, hB + 54);
    const apexA = f.cone(cxA, 0.0, aA, hA);
    const apexB = f.cone(cxB, 0.0, aB, hB);
    f.line([cxA, 0.0], apexA, { w: LW_THIN, dash: DASH });
    f.line([cxB, 0.0], apexB, { w: LW_THIN, dash: DASH });
    f.pointLabel([cxA, hA / 2], [1, 0], labA, Fig0580.clearOfCone(aA, 0.5, labA), {
      id: "label-A",
    });
    f.pointLabel([cxB, hB / 2], [1, 0], labB, Fig0580.clearOfCone(aB, 0.5, labB), {
      id: "label-B",
    });
    f.text([cxA, -56], `Solid ${IT(t(p, "nameA"))}`, {
      anchor: "middle",
      vcentre: true,
      id: "name-A",
    });
    f.text([cxB, -56], `Solid ${IT(t(p, "nameB"))}`, {
      anchor: "middle",
      vcentre: true,
      id: "name-B",
    });
    f.nts();
    return f.svg();
  },
};

// ---- quadrilateral (angles) ------------------------------------------------
const quadrilateral: Template = {
  id: "quadrilateral",
  name: "Quadrilateral with parallel side",
  category: "Angles",
  description: "Quadrilateral ABCD with E on CD, AE ∥ BC and EA = ED; two given angles.",
  params: [
    { key: "bae", label: "Angle BAE (°)", type: "number", default: 70, min: 20, max: 120 },
    { key: "bcd", label: "Angle BCD (°)", type: "number", default: 76, min: 20, max: 120 },
  ],
  render: (p) => {
    const BAE = n(p, "bae");
    const BCD = n(p, "bcd");
    const Du: Pt = [0, 0];
    const Cu: Pt = [8, 0];
    const e = 5.0;
    const u = pol(1, 180 - BCD);
    const Eu: Pt = [e, 0];
    const Au = add(Eu, mul(u, e));
    const aAE = ang(Au, Eu);
    const Bu = lineIntersect(Au, aAE + BAE, Cu, 180 - BCD);
    const S = 42.0;
    const [A, B, C, Dp, E] = [Au, Bu, Cu, Du, Eu].map((q) => mul(q, S)) as [Pt, Pt, Pt, Pt, Pt];
    const I = centroid([A, B, C, Dp]);
    const f = new Fig0580(-64, C[0] + 70, -62, Math.max(A[1], B[1]) + 62);
    f.polygonOutline([A, B, C, Dp], { id: "quad" });
    f.line(A, E, { id: "line-AE" });
    const [tA, tB] = Fig0580.twoMarkParams(dist(A, E));
    f.ticks(A, E, 1, undefined, undefined, tA);
    f.parArrows(A, E, 1, undefined, undefined, tB);
    f.ticks(E, Dp, 1);
    f.parArrows(B, C, 1);
    f.arc(A, ang(A, E), ang(A, B), { label: `${fmt(BAE)}°` });
    f.arc(C, ang(C, B), ang(C, Dp), { label: `${fmt(BCD)}°` });
    f.vertexLabel(A, B, E, IT("A"), I, undefined, "label-A");
    f.vertexLabel(B, A, C, IT("B"), I, undefined, "label-B");
    f.vertexLabel(C, B, Dp, IT("C"), I, undefined, "label-C");
    f.vertexLabel(Dp, C, A, IT("D"), I, undefined, "label-D");
    f.pointLabel(E, outwardNormal(Dp, C, I), IT("E"), 24, { id: "label-E" });
    f.nts();
    return f.svg();
  },
};

// ---- circle with tangent ---------------------------------------------------
const circleTangent: Template = {
  id: "circle-tangent",
  name: "Circle with tangent",
  category: "Circle theorems",
  description: "Circle centre O with points A, B, C and tangent DE at A; two given angles.",
  params: [
    { key: "aco", label: "Angle ACO (°)", type: "number", default: 25, min: 5, max: 80 },
    { key: "bco", label: "Angle BCO (°)", type: "number", default: 40, min: 5, max: 80 },
  ],
  render: (p) => {
    const ACO = n(p, "aco");
    const BCO = n(p, "bco");
    const R = 118.0;
    const O: Pt = [0, 0];
    const A = pol(R, 90);
    const C = pol(R, 90 + (180 - 2 * ACO));
    const B = pol(R, ang(O, C) + (180 - 2 * BCO));
    const tt = 0.86 * R;
    const Dp = add(A, [-tt, 0]);
    const E = add(A, [tt, 0]);
    const f = new Fig0580(-R - 74, R + 74, -R - 76, R + 66);
    f.circleOutline(O, R, { id: "circle" });
    for (const [P, id] of [
      [A, "OA"],
      [B, "OB"],
      [C, "OC"],
    ] as [Pt, string][]) {
      f.line(O, P, { w: LW_THIN, id: `radius-${id}` });
    }
    f.line(C, A, { id: "chord-CA" });
    f.line(C, B, { id: "chord-CB" });
    f.line(Dp, E, { id: "tangent-DE" });
    f.arc(C, ang(C, O), ang(C, A), { label: `${fmt(ACO)}°` });
    f.arc(C, ang(C, B), ang(C, O), { label: `${fmt(BCO)}°` });
    for (const [P, L] of [
      [A, "A"],
      [B, "B"],
      [C, "C"],
    ] as [Pt, string][]) {
      f.pointLabel(P, radialDir(O, P), IT(L), 24, { id: `label-${L}` });
    }
    f.pointLabel(Dp, norm(sub(Dp, A)), IT("D"), 22, { id: "label-D" });
    f.pointLabel(E, norm(sub(E, A)), IT("E"), 22, { id: "label-E" });
    f.pointLabel(O, widestGapDir([ang(O, A), ang(O, B), ang(O, C)]), IT("O"), 24, {
      id: "label-O",
    });
    f.nts();
    return f.svg();
  },
};

// ---- grid transformation ---------------------------------------------------
type XForm = (x: number, y: number) => [number, number];
const XFORMS: Record<string, XForm> = {
  rot90cw: (x, y) => [y, -x],
  rot90ccw: (x, y) => [-y, x],
  rot180: (x, y) => [-x, -y],
  reflectX: (x, y) => [x, -y],
  reflectY: (x, y) => [-x, y],
  reflectYX: (x, y) => [y, x],
};

const gridTransformation: Template = {
  id: "grid-transformation",
  name: "Grid transformation",
  category: "Transformations",
  description: "Triangle T on a coordinate grid with its image under a chosen transformation.",
  params: [
    { key: "ax", label: "Vertex 1 x", type: "integer", default: 1, min: -5, max: 5 },
    { key: "ay", label: "Vertex 1 y", type: "integer", default: 1, min: -5, max: 5 },
    { key: "bx", label: "Vertex 2 x", type: "integer", default: 1, min: -5, max: 5 },
    { key: "by", label: "Vertex 2 y", type: "integer", default: 4, min: -5, max: 5 },
    { key: "cx", label: "Vertex 3 x", type: "integer", default: 3, min: -5, max: 5 },
    { key: "cy", label: "Vertex 3 y", type: "integer", default: 1, min: -5, max: 5 },
    {
      key: "transform",
      label: "Transformation",
      type: "select",
      default: "rot90cw",
      options: [
        { value: "rot90cw", label: "Rotate 90° clockwise about O" },
        { value: "rot90ccw", label: "Rotate 90° anticlockwise about O" },
        { value: "rot180", label: "Rotate 180° about O" },
        { value: "reflectX", label: "Reflect in the x-axis" },
        { value: "reflectY", label: "Reflect in the y-axis" },
        { value: "reflectYX", label: "Reflect in y = x" },
      ],
    },
  ],
  render: (p) => {
    const U = 34.0;
    const LO = -5;
    const HI = 5;
    const T: Pt[] = [
      [n(p, "ax"), n(p, "ay")],
      [n(p, "bx"), n(p, "by")],
      [n(p, "cx"), n(p, "cy")],
    ];
    const xform = XFORMS[t(p, "transform")] ?? XFORMS["rot90cw"];
    const Uv: Pt[] = T.map(([x, y]) => xform(x, y));
    const f = new Fig0580(LO * U - 40, HI * U + 46, LO * U - 40, HI * U + 46);
    f.grid(LO, HI, LO, HI, U);
    f.axes(LO, HI, LO, HI, U);
    const Tp = T.map((q) => mul(q, U));
    const Up = Uv.map((q) => mul(q, U));
    f.polygonOutline(Tp, { id: "triangle-T" });
    f.polygonOutline(Up, { id: "triangle-U" });
    f.text(centroid(Tp), IT("T"), { anchor: "middle", vcentre: true, id: "label-T" });
    f.text(centroid(Up), IT("U"), { anchor: "middle", vcentre: true, id: "label-U" });
    return f.svg();
  },
};

// ---- hemisphere on cylinder ------------------------------------------------
const hemisphereCylinder: Template = {
  id: "hemisphere-cylinder",
  name: "Hemisphere on a cylinder",
  category: "Mensuration",
  description: "A solid made by joining a hemisphere to a cylinder of equal radius.",
  params: [
    { key: "radiusLabel", label: "Radius label", type: "text", default: "3 cm" },
    { key: "heightLabel", label: "Cylinder height label", type: "text", default: "7 cm" },
  ],
  render: (p) => {
    const R = 64.0;
    const H = 150.0;
    const RY = 0.25;
    const f = new Fig0580(-R - 92, R + 78, -R * 0.25 - 48, H + R + 52);
    const top = f.cylinderWithDome(0.0, 0.0, R, H, RY);
    f.line([0.0, H], [R, H], { w: LW_THIN });
    f.pointLabel([R / 2, H], [0, 1], t(p, "radiusLabel"), Fig0580.clearOfEllipse(R * RY), {
      id: "label-radius",
    });
    f.sideLabel(
      [-R, 0.0],
      [-R, H],
      t(p, "heightLabel"),
      [0.0, H / 2],
      undefined,
      undefined,
      "label-height",
    );
    void top;
    f.nts();
    return f.svg();
  },
};

// ---- probability tree ------------------------------------------------------
const probabilityTree: Template = {
  id: "probability-tree",
  name: "Probability tree (2 stages)",
  category: "Probability",
  description: "Two-stage tree for two outcomes, with or without replacement.",
  params: [
    { key: "name1", label: "Outcome 1 name", type: "text", default: "Red" },
    { key: "name2", label: "Outcome 2 name", type: "text", default: "Yellow" },
    { key: "count1", label: "Count of outcome 1", type: "integer", default: 5, min: 1, max: 20 },
    { key: "count2", label: "Count of outcome 2", type: "integer", default: 3, min: 1, max: 20 },
    { key: "withReplacement", label: "With replacement", type: "boolean", default: false },
    { key: "showAll", label: "Fill all probabilities", type: "boolean", default: false },
  ],
  render: (p) => {
    const N1 = n(p, "count1");
    const N2 = n(p, "count2");
    const N = N1 + N2;
    const wr = b(p, "withReplacement");
    const showAll = b(p, "showAll");
    const nm1 = t(p, "name1");
    const nm2 = t(p, "name2");

    const X0 = 0.0;
    const X1 = 150.0;
    const X2 = 360.0;
    const GAPO = 10.0 + Math.max(Fig0580.textWidth(nm1), Fig0580.textWidth(nm2)) + 12.0;
    const root: Pt = [X0, 0];
    const O1: Pt = [X1, 95];
    const O2: Pt = [X1, -95];
    const S_1: Pt = [X1 + GAPO, 95];
    const S_2: Pt = [X1 + GAPO, -95];
    const B11: Pt = [X2, 152];
    const B12: Pt = [X2, 44];
    const B21: Pt = [X2, -44];
    const B22: Pt = [X2, -152];
    const f = new Fig0580(-30, X2 + 132, -232, 232);
    for (const [a, c] of [
      [root, O1],
      [root, O2],
      [S_1, B11],
      [S_1, B12],
      [S_2, B21],
      [S_2, B22],
    ] as [Pt, Pt][]) {
      f.line(a, c, { w: LW_THIN });
    }
    const blab = (a: Pt, c: Pt): Pt => {
      const d = norm(sub(c, a));
      let nv: Pt = [-d[1], d[0]];
      if (nv[1] < 0) nv = [d[1], -d[0]];
      return add(lerp(a, c, 0.5), mul(nv, 26));
    };
    // stage 1
    f.fracLabel(blab(root, O1), N1, N);
    f.fracLabel(blab(root, O2), N2, N);
    // stage 2 (denominator N or N-1)
    const d2 = wr ? N : N - 1;
    const a1 = wr ? N1 : N1 - 1; // outcome1 then outcome1
    const branches: Array<[Pt, Pt, number, number]> = [
      [S_1, B11, a1, d2],
      [S_1, B12, N2, d2],
      [S_2, B21, N1, d2],
      [S_2, B22, wr ? N2 : N2 - 1, d2],
    ];
    branches.forEach(([a, c, num, den], i) => {
      // Match the exam default: show only the first second-stage branch, blank
      // the rest — unless the teacher asks to fill them all.
      if (showAll || i === 0) f.fracLabel(blab(a, c), num, den);
      else f.blankSlot(blab(a, c));
    });
    for (const [pt, s, id] of [
      [O1, nm1, "node-1"],
      [O2, nm2, "node-2"],
    ] as [Pt, string, string][]) {
      f.text(add(pt, [10, 0]), s, { anchor: "start", vcentre: true, id });
    }
    for (const [pt, s, id] of [
      [B11, nm1, "leaf-11"],
      [B12, nm2, "leaf-12"],
      [B21, nm1, "leaf-21"],
      [B22, nm2, "leaf-22"],
    ] as [Pt, string, string][]) {
      f.text(add(pt, [12, 0]), s, { anchor: "start", vcentre: true, id });
    }
    f.text([X1 - 6, 208], "First", { anchor: "middle", vcentre: true });
    f.text([X2 + 10, 208], "Second", { anchor: "middle", vcentre: true });
    return f.svg();
  },
};

// ---- right-angled triangle (trig) ------------------------------------------
const rightTriangle: Template = {
  id: "right-triangle",
  name: "Right-angled triangle (trig)",
  category: "Trigonometry",
  description: "Right-angled triangle drawn true to scale from an angle and opposite side.",
  params: [
    { key: "angle", label: "Angle (°)", type: "number", default: 30, min: 5, max: 85 },
    { key: "opposite", label: "Opposite length", type: "number", default: 8, min: 1, max: 30 },
    { key: "oppLabel", label: "Opposite label", type: "text", default: "8 cm" },
    { key: "baseLabel", label: "Base label", type: "text", default: "x cm" },
  ],
  render: (p) => {
    const THETA = n(p, "angle");
    const OPP = n(p, "opposite");
    const base = OPP / Math.tan((THETA * Math.PI) / 180);
    const S = 22.0;
    const A: Pt = [0, 0];
    const C: Pt = [base * S, 0];
    const B: Pt = [base * S, OPP * S];
    const I = centroid([A, B, C]);
    const f = new Fig0580(-58, C[0] + 84, -60, B[1] + 54);
    f.polygonOutline([A, C, B], { id: "triangle" });
    f.rightAngle(C, 90, 180);
    f.arc(A, ang(A, C), ang(A, B), { label: `${fmt(THETA)}°` });
    f.sideLabel(C, B, t(p, "oppLabel"), I, undefined, undefined, "label-opp");
    f.sideLabel(A, C, t(p, "baseLabel"), I, undefined, undefined, "label-base");
    return f.svg();
  },
};

// ---------------------------------------------------------------------------
// registry
// ---------------------------------------------------------------------------

export const TEMPLATES: Template[] = [
  numberLine,
  trapezium,
  sector,
  similarCones,
  quadrilateral,
  circleTangent,
  gridTransformation,
  hemisphereCylinder,
  probabilityTree,
  rightTriangle,
];

export const TEMPLATES_BY_ID: Record<string, Template> = Object.fromEntries(
  TEMPLATES.map((tpl) => [tpl.id, tpl]),
);

/** Default parameter values for a template (for the UI + AI defaults). */
export function defaultParams(tpl: Template): ParamValues {
  return coerceParams(tpl, {});
}

/** Render a template to an SVG string. Throws if the id is unknown. */
export function renderTemplate(id: string, raw: ParamValues = {}): string {
  const tpl = TEMPLATES_BY_ID[id];
  if (!tpl) throw new Error(`Unknown template: ${id}`);
  return tpl.render(coerceParams(tpl, raw));
}

/** Compact catalogue string for prompting the AI router. */
export function templateCatalogue(): string {
  return TEMPLATES.map((tpl) => {
    const params = tpl.params
      .map((s) => {
        if (s.type === "select") {
          return `${s.key} (one of: ${s.options.map((o) => o.value).join(", ")})`;
        }
        return `${s.key} (${s.type}, default ${JSON.stringify(s.default)})`;
      })
      .join(", ");
    return `- "${tpl.id}": ${tpl.name}. ${tpl.description} Params: ${params}`;
  }).join("\n");
}
