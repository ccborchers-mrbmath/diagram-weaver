import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";
import { Download, FolderOpen, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { InputPanel } from "@/components/editor/InputPanel";
import { SvgCanvas } from "@/components/editor/SvgCanvas";
import { CodeEditor } from "@/components/editor/CodeEditor";
import { SAMPLE_SVG } from "@/lib/svg/sample";
import { assignMissingIds } from "@/lib/svg/parse";
import { useFileSync, type SaveStatus } from "@/lib/useFileSync";
import { GitHubControls, type GithubFile } from "@/components/editor/GitHubControls";

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
          "Generate and refine mathematical SVG diagrams with a bidirectional visual canvas and code editor.",
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
  const [githubFile, setGithubFile] = useState<GithubFile | null>(null);

  // Inject ids for id-less shapes as soon as an SVG is loaded, so pasted /
  // imported / opened files are immediately tool-editable and the ids show in
  // the code — not only after the first drag.
  const loadSvg = useCallback((text: string) => {
    setSelectedId(null);
    setSvg(assignMissingIds(text));
  }, []);
  const notifyError = useCallback((msg: string) => toast.error(msg), []);
  const fileSync = useFileSync(svg, loadSvg, notifyError);

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
    setSvg(assignMissingIds(text.trim()));
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
            <div className="flex min-w-0 items-center gap-2">
              <h2 className="shrink-0 text-sm font-medium">SVG Code</h2>
              {githubFile && (
                <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="truncate font-mono text-foreground">{githubFile.path}</span>
                  <span className="shrink-0">
                    {githubFile.repo} · {githubFile.branch}
                  </span>
                  <span
                    className={
                      svg === githubFile.baseline
                        ? "shrink-0 text-green-600 dark:text-green-500"
                        : "shrink-0 text-amber-600 dark:text-amber-500"
                    }
                  >
                    {svg === githubFile.baseline ? "Committed" : "Uncommitted"}
                  </span>
                </span>
              )}
              {fileSync.fileName && (
                <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="truncate font-mono text-foreground">{fileSync.fileName}</span>
                  <span className={statusClass(fileSync.status)}>
                    {statusLabel(fileSync.status)}
                  </span>
                  <button
                    type="button"
                    title="Close file (stop autosaving)"
                    aria-label="Close file"
                    onClick={fileSync.close}
                    className="rounded p-0.5 hover:bg-accent"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="hidden text-xs text-muted-foreground lg:inline">
                {svg.length} chars
              </span>
              <GitHubControls
                svg={svg}
                file={githubFile}
                onFileChange={setGithubFile}
                onLoadSvg={loadSvg}
              />
              <input
                ref={fileInputRef}
                type="file"
                accept=".svg,image/svg+xml"
                className="hidden"
                onChange={handleImportFile}
              />
              {fileSync.supported && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 px-2 text-xs"
                  onClick={fileSync.open}
                  title="Open an SVG file and autosave edits back to it"
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                  Open file
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 px-2 text-xs"
                onClick={() => fileInputRef.current?.click()}
                title="Load an SVG into the editor (no autosave)"
              >
                <Upload className="h-3.5 w-3.5" />
                Import
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 px-2 text-xs"
                onClick={handleDownload}
                title="Download the current SVG"
              >
                <Download className="h-3.5 w-3.5" />
                Download
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

function statusLabel(status: SaveStatus): string {
  switch (status) {
    case "saving":
      return "Saving…";
    case "saved":
      return "Saved";
    case "error":
      return "Save failed";
    default:
      return "";
  }
}

function statusClass(status: SaveStatus): string {
  if (status === "error") return "text-destructive";
  if (status === "saving") return "text-muted-foreground";
  return "text-green-600 dark:text-green-500";
}
