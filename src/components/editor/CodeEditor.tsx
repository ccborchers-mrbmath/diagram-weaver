import { useEffect, useRef } from "react";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { xml } from "@codemirror/lang-xml";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView, Decoration, type DecorationSet } from "@codemirror/view";
import { StateField, StateEffect, EditorSelection } from "@codemirror/state";

type Props = {
  value: string;
  onChange: (next: string) => void;
  highlightId?: string | null;
};

// Effect + field for a full-line highlight.
const setHighlightLine = StateEffect.define<number | null>();

const lineHighlightField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setHighlightLine)) {
        if (e.value == null) {
          deco = Decoration.none;
        } else {
          const line = tr.state.doc.line(e.value);
          deco = Decoration.set([
            Decoration.line({
              attributes: {
                style:
                  "background-color: rgba(250, 204, 21, 0.18); box-shadow: inset 2px 0 0 rgb(250, 204, 21);",
              },
            }).range(line.from),
          ]);
        }
      }
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

export function CodeEditor({ value, onChange, highlightId }: Props) {
  const cmRef = useRef<ReactCodeMirrorRef>(null);

  useEffect(() => {
    const view = cmRef.current?.view;
    if (!view) return;
    if (!highlightId) {
      view.dispatch({ effects: setHighlightLine.of(null) });
      return;
    }
    const doc = view.state.doc.toString();
    const re = new RegExp(
      `id\\s*=\\s*["']${highlightId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`,
    );
    const m = re.exec(doc);
    if (!m) {
      view.dispatch({ effects: setHighlightLine.of(null) });
      return;
    }
    const pos = m.index;
    const line = view.state.doc.lineAt(pos);
    view.dispatch({
      effects: [
        setHighlightLine.of(line.number),
        EditorView.scrollIntoView(line.from, { y: "center" }),
      ],
    });
  }, [highlightId]);

  return (
    <div className="h-full min-h-0 w-full overflow-hidden bg-[#282c34] [&_.cm-editor]:h-full [&_.cm-scroller]:overflow-auto">
      <CodeMirror
        ref={cmRef}
        value={value}
        theme={oneDark}
        extensions={[xml(), EditorView.lineWrapping, lineHighlightField]}
        basicSetup={{
          lineNumbers: true,
          highlightActiveLine: false,
          foldGutter: false,
          autocompletion: false,
        }}
        onChange={(v) => onChange(v)}
        height="100%"
        style={{ height: "100%", fontSize: 13 }}
      />
    </div>
  );
}
