import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { InputPanel } from "@/components/editor/InputPanel";
import { SvgCanvas } from "@/components/editor/SvgCanvas";
import { CodeEditor } from "@/components/editor/CodeEditor";
import { SAMPLE_SVG } from "@/lib/svg/sample";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SVG Math Diagram Editor" },
      {
        name: "description",
        content:
          "Generate and refine mathematical SVG diagrams with a bidirectional visual canvas and code editor.",
      },
      { property: "og:title", content: "SVG Math Diagram Editor" },
      {
        property: "og:description",
        content:
          "A split-screen workspace for math teachers to draft, drag, and hand-edit SVG diagrams.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EditorPage,
});

function EditorPage() {
  const [svg, setSvg] = useState<string>(SAMPLE_SVG);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDownload = () => {
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "diagram.svg";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-importing the same file
    if (!file) return;
    const text = await file.text();
    if (!/<svg[\s\S]*<\/svg>/i.test(text)) {
      toast.error("That file doesn't look like an SVG.");
      return;
    }
    setSelectedId(null);
    setSvg(text.trim());
    toast.success(`Imported ${file.name}`);
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <InputPanel onGenerate={setSvg} />

      <main className="flex min-w-0 flex-1 flex-col">
        <section className="flex min-h-0 flex-[3] flex-col border-b border-border">
          <header className="flex items-center justify-between border-b border-border bg-card px-4 py-2">
            <h2 className="text-sm font-medium">Visual Canvas</h2>
            <div className="text-xs text-muted-foreground">
              {selectedId ? (
                <>
                  Selected:{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                    #{selectedId}
                  </code>
                </>
              ) : (
                <>Click to select · drag to move · Ctrl+wheel to zoom · middle-drag to pan</>
              )}
            </div>
          </header>
          <div className="min-h-0 flex-1">
            <SvgCanvas
              svgSource={svg}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onChange={setSvg}
            />
          </div>
        </section>

        <section className="flex min-h-0 flex-[2] flex-col">
          <header className="flex items-center justify-between gap-2 border-b border-border bg-card px-4 py-2">
            <h2 className="text-sm font-medium">SVG Code</h2>
            <div className="flex items-center gap-2">
              <span className="hidden text-xs text-muted-foreground sm:inline">
                {svg.length.toLocaleString()} chars
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".svg,image/svg+xml"
                className="hidden"
                onChange={handleImportFile}
              />
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 px-2 text-xs"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-3.5 w-3.5" />
                Import
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 px-2 text-xs"
                onClick={handleDownload}
              >
                <Download className="h-3.5 w-3.5" />
                Download SVG
              </Button>
            </div>
          </header>
          <div className="min-h-0 flex-1">
            <CodeEditor value={svg} onChange={setSvg} highlightId={selectedId} />
          </div>
        </section>
      </main>
    </div>
  );
}
