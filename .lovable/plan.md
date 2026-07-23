## Goal

Make labels click-and-draggable on the canvas, and make the code editor actually editable. Keep scope tight: labels first (the `<text id="label-*">` nodes), then the same mechanism trivially covers other `[id]` elements.

## Root causes

**Drag dies after one move.** In `SvgCanvas.tsx`, every `pointermove` calls `onChange(next)`, which updates React state in the parent. That re-renders `SvgCanvas`, and the `useLayoutEffect` that does `host.innerHTML = renderSource` throws away the exact DOM node we captured the pointer on. Once detached, `pointermove`/`pointerup` stop firing on it, so the drag freezes and pointer capture leaks.

**Code editor feels frozen.** Two contributing issues:
- Every keystroke round-trips through parent state and back into CodeMirror's `value` prop; combined with the drag re-injection path above, focus/selection can be disrupted.
- The CodeMirror host uses `height="100%"` inside a flex column — if the flex chain collapses, the editor renders 0px tall and looks read-only.

## Fix

### 1. Decouple live drag from React state (`src/components/editor/SvgCanvas.tsx`)

- During a drag, mutate the live DOM element's attributes directly (`el.setAttribute("x", …)` etc.) for immediate visual feedback. Do NOT call `onChange` on every `pointermove`.
- On `pointerup`, serialize the current SVG once (`new XMLSerializer().serializeToString(svg)`) and call `onChange(finalString)` exactly once. This is the only time the parent state and the code editor update.
- Add a `draggingRef` guard so the "source changed → re-inject innerHTML" effect skips re-injection while a drag is in flight (defensive; with the single-shot `onChange` it shouldn't fire mid-drag anyway).
- Attach `pointermove`/`pointerup` to `window` (not the element) so pointer capture loss on re-render can't kill the drag.
- Keep the selection outline in sync during drag by re-reading `getBBox()` on each move via a local rAF loop.

### 2. Make labels obviously interactive

- For every `[id]` node, set `cursor: grab` (already done) and also `pointer-events: all` so `<text>` hit-testing is reliable regardless of fill.
- Slightly enlarge text hit area by adding `paint-order: stroke` isn't needed; instead we just rely on `pointer-events: all`. Labels currently work by tag (`text` → update `x`/`y`) — that path in `parse.ts` is already correct.

### 3. Code editor reliability (`src/components/editor/CodeEditor.tsx` + `src/routes/index.tsx`)

- Ensure the editor container actually has height: give the `<div>` wrapping `CodeMirror` `h-full min-h-0` and set CodeMirror `height="100%"` with a flex parent that has `min-h-0`. Verify the code-panel `<section>` in `index.tsx` has `min-h-0` (it does) and that the inner `<div>` also does.
- Since drag no longer spams `onChange`, keystrokes in the editor won't be interrupted by canvas re-injections.
- No debouncing needed for correctness now, but keep `onChange` synchronous; @uiw/react-codemirror preserves cursor when the incoming `value` matches the current doc.

## Files touched

- `src/components/editor/SvgCanvas.tsx` — rewrite pointer handling: window-level listeners, direct DOM mutation during drag, single `onChange` on pointerup, drag guard.
- `src/components/editor/CodeEditor.tsx` — tighten height/min-h so the editor is always tall enough to focus and type into.
- (Possibly) `src/routes/index.tsx` — add `min-h-0` on the code-panel inner div if the editor still collapses.

## Out of scope

- Undo/redo, multi-select, keyboard nudging, resize handles, rotation.
- Snapping / grid.
- Any change to the sample SVG or its section-heading comments.

## Verification

- Drag `label-A`, `label-B`, `label-C`, `label-D`, `label-beta` around — motion is smooth, code updates once on release, selection outline follows.
- Click into the code panel, edit an `x=` on a label, tab out — canvas updates.
- Drag a label, then immediately edit its `y=` in code — no cursor jump, no lost focus.
