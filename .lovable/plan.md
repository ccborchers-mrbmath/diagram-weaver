# Bidirectional SVG Math Diagram Editor — Plan

A frontend-only prototype. No backend, no real AI. One shared SVG string in state drives both the visual canvas and the code editor; edits in either direction propagate instantly.

## Layout

Replace `src/routes/index.tsx` (the placeholder) with the editor. Full-height, full-width, no scroll on the shell.

```text
┌───────────────────────────┬──────────────────────────────────────────┐
│  Diagram Generator        │  Visual Canvas                           │
│  (left sidebar, ~360px)   │  (top of right panel, flex-1)            │
│                           │                                          │
│  • Prompt textarea        │  Renders live SVG, drag any [id] node    │
│  • Mic button (Web Speech)│                                          │
│  • Image drop zone        ├──────────────────────────────────────────┤
│  • Generate Diagram btn   │  Code Editor (CodeMirror, XML, dark)     │
│                           │  Two-way bound to the same SVG string    │
└───────────────────────────┴──────────────────────────────────────────┘
```

Resizable split is out of scope — fixed sidebar width, 60/40 vertical split on the right.

## Component structure

- `src/routes/index.tsx` — page shell, owns the single `svgSource` state string plus `selectedId`. Adds route `head()` with app-specific title/description/OG.
- `src/components/editor/InputPanel.tsx` — left sidebar. Owns prompt text, recording state, uploaded image preview, loading state. Calls `onGenerate(mockSvg)` after a 2s timeout.
- `src/components/editor/VoiceButton.tsx` — wraps `window.SpeechRecognition || webkitSpeechRecognition`, appends transcript to prompt, pulsing red dot while recording. Gracefully disables with a tooltip if the API is missing.
- `src/components/editor/ImageDropzone.tsx` — dashed `Card`, drag-over highlight, accepts one image, shows thumbnail + filename + clear button. File kept in local state only.
- `src/components/editor/SvgCanvas.tsx` — renders the SVG, overlays a selection outline + drag layer. Receives `svgSource`, `selectedId`, `onChange(nextSvg)`, `onSelect(id)`.
- `src/components/editor/CodeEditor.tsx` — CodeMirror 6 with XML mode + dark theme. Two-way bound; debounced upward propagation (~150ms) to avoid thrash while typing.
- `src/lib/svg/parse.ts` — helpers: parse string → `Document`, serialize back, find element by id, update attributes, list draggable ids.

Central rule: `svgSource: string` is the single source of truth. Every edit produces a new string.

## Canvas interaction

- On mount / when `svgSource` changes, parse with `DOMParser` and collect every element with an `id` attribute — those are the draggable set (per your answer).
- Render the SVG by setting `dangerouslySetInnerHTML` on a wrapper `<div>`, then attach pointer handlers imperatively to each `[id]` node via a `ref` effect. This keeps rendering cheap and avoids re-implementing SVG.
- Click on an `[id]` node → `setSelectedId(id)`. Overlay draws a dashed rectangle around that node's `getBBox()` in SVG user-space coordinates (a sibling `<svg>` overlay positioned over the canvas with matching `viewBox`).
- Pointer-down + move on the selected node:
  - Convert client coords → SVG coords using `svg.getScreenCTM().inverse()`.
  - Compute delta from drag start.
  - For `<text>`: update `x`/`y` attributes. For shapes (`circle`: `cx`/`cy`; `rect`: `x`/`y`; `line`: shift both endpoints; `ellipse`: `cx`/`cy`; `polygon`/`path`: apply/merge a `transform="translate(dx,dy)"`) — one small dispatch table in `parse.ts`.
  - On pointer-up, serialize the DOM back to a string and call `onChange`.
- Selection outline updates live during drag by re-reading `getBBox()`.

## Code editor sync

- CodeMirror value is bound to `svgSource`. User keystrokes call `onChange` (debounced) which updates the state, which re-renders the canvas.
- To prevent cursor jumps when the canvas updates the source mid-drag, `CodeEditor` compares incoming prop vs current doc and only replaces when they differ and the editor isn't focused, or replaces via a transaction that preserves the selection.
- Invalid XML while typing: keep the last-valid parsed DOM for the canvas overlay; the raw string still shows in the editor. No error toast — just don't crash.

## Mock generate

`InputPanel` holds a hardcoded sample SVG string (a geometry rider: triangle with labeled vertices A/B/C, an altitude, angle marks, and a couple of `<text>` labels — every meaningful element has an `id`). "Generate Diagram" sets a 2s loading spinner on the button, then calls `onGenerate(sampleSvg)`.

## Image drop zone

Per the clarification above: accept one image, show thumbnail + filename + clear button, keep the `File` in local state only. Generate still returns the mock SVG. Nothing leaves the browser.

## Dependencies to add

- `@uiw/react-codemirror`
- `@codemirror/lang-xml`
- `@codemirror/theme-one-dark`

shadcn `Button`, `Textarea`, `Card`, `Tooltip` are already available in the template scaffold; I'll `npx shadcn` any that aren't.

## Styling

Monochrome surface using existing tokens (`background`, `card`, `border`, `muted-foreground`). Accent for active states uses `primary` (already a deep near-black; I'll tune `--primary` to a deep blue in `src/styles.css` so active/selected states pop as requested). Selection outline: 1.5px dashed `primary`. Recording indicator: `destructive` token with a `animate-pulse`.

## Out of scope (explicit)

- No Supabase, no AI gateway, no persistence.
- No resizable panels, no undo/redo, no multi-select, no keyboard nudging (easy follow-ups).
- No SVG validation UI beyond "canvas stops updating on unparseable input".

## Deliverables checklist

- [ ] `src/routes/index.tsx` replaced (placeholder removed) with editor + route `head()`.
- [ ] Six components under `src/components/editor/`.
- [ ] `src/lib/svg/parse.ts` helpers.
- [ ] CodeMirror deps installed.
- [ ] `--primary` retuned to deep blue in `src/styles.css`.
- [ ] Manual verification: type in code → canvas updates; drag a label → code updates; mic appends transcript; drop image → thumbnail shows; Generate loads sample after 2s.