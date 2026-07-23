import CodeMirror from "@uiw/react-codemirror";
import { xml } from "@codemirror/lang-xml";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView } from "@codemirror/view";

type Props = {
  value: string;
  onChange: (next: string) => void;
};

export function CodeEditor({ value, onChange }: Props) {
  return (
    <div className="h-full min-h-0 w-full overflow-hidden bg-[#282c34] [&_.cm-editor]:h-full [&_.cm-scroller]:overflow-auto">
      <CodeMirror
        value={value}
        theme={oneDark}
        extensions={[xml(), EditorView.lineWrapping]}
        basicSetup={{
          lineNumbers: true,
          highlightActiveLine: true,
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
