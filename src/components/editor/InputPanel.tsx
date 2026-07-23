import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { VoiceButton } from "./VoiceButton";
import { ImageDropzone } from "./ImageDropzone";
import { generateSvg } from "@/lib/generate-svg.functions";

type Props = {
  onGenerate: (svg: string) => void;
};

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export function InputPanel({ onGenerate }: Props) {
  const [prompt, setPrompt] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const callGenerate = useServerFn(generateSvg);

  const handleGenerate = async () => {
    const trimmed = prompt.trim();
    if (!trimmed) {
      toast.error("Enter a prompt describing the diagram.");
      return;
    }
    setLoading(true);
    try {
      const imageDataUrl = file ? await fileToDataUrl(file) : undefined;
      const { svg } = await callGenerate({ data: { prompt: trimmed, imageDataUrl } });
      onGenerate(svg);
      toast.success("Diagram generated");
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : "Failed to generate diagram";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const appendTranscript = (t: string) => {
    setPrompt((p) => (p ? `${p} ${t}` : t));
  };

  return (
    <aside className="flex h-full w-[360px] shrink-0 flex-col gap-4 border-r border-border bg-card p-5">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Diagram Generator</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Describe a diagram, then refine it visually or in code.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="prompt" className="text-xs font-medium text-muted-foreground">
          Prompt
        </label>
        <Textarea
          id="prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder='e.g. "Draw a Venn diagram with three overlapping circles."'
          className="min-h-[140px] resize-none"
        />
        <VoiceButton onTranscript={appendTranscript} />
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium text-muted-foreground">Reference image</label>
        <ImageDropzone file={file} onFileChange={setFile} />
      </div>

      <div className="mt-auto">
        <Button
          onClick={handleGenerate}
          disabled={loading}
          className="w-full gap-2"
          size="lg"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating…
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              Generate Diagram
            </>
          )}
        </Button>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          Powered by Lovable AI.
        </p>
      </div>
    </aside>
  );
}
