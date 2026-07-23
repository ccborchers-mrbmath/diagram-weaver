// Hardcoded sample SVG returned by the mock "Generate Diagram" action.
// Section heading comments group related elements so users can quickly
// jump to the part of the code they want to edit.

export const SAMPLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="100%" height="100%">

  <!-- Background -->
  <rect width="100%" height="100%" fill="#ffffff" />

  <!-- Triangle Sides AB, BC, CA -->
  <g id="triangle" fill="none" stroke="#0f172a" stroke-width="2">
    <line id="side-AB" x1="80" y1="240" x2="200" y2="40" />
    <line id="side-BC" x1="80" y1="240" x2="340" y2="240" />
    <line id="side-CA" x1="340" y1="240" x2="200" y2="40" />
  </g>

  <!-- Altitude from A to BC -->
  <line id="altitude" x1="200" y1="40" x2="200" y2="240" stroke="#2563eb" stroke-width="1.5" stroke-dasharray="4 3" />

  <!-- Right-Angle Mark at Foot D -->
  <path id="right-angle" d="M 190 240 L 190 230 L 200 230" fill="none" stroke="#2563eb" stroke-width="1.5" />

  <!-- Angle Arc at Vertex B -->
  <path id="angle-B" d="M 100 240 A 20 20 0 0 0 92 224" fill="none" stroke="#0f172a" stroke-width="1.5" />

  <!-- Vertex Labels -->
  <text id="label-A" x="200" y="30" font-family="serif" font-size="18" text-anchor="middle" font-style="italic">A</text>
  <text id="label-B" x="70" y="255" font-family="serif" font-size="18" text-anchor="middle" font-style="italic">B</text>
  <text id="label-C" x="350" y="255" font-family="serif" font-size="18" text-anchor="middle" font-style="italic">C</text>
  <text id="label-D" x="200" y="258" font-family="serif" font-size="14" text-anchor="middle" font-style="italic">D</text>

  <!-- Angle Label -->
  <text id="label-beta" x="115" y="232" font-family="serif" font-size="14" font-style="italic">β</text>

</svg>`;
