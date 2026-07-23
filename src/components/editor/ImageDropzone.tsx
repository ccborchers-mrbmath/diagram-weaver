import { useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Props = {
  file: File | null;
  onFileChange: (file: File | null) => void;
};

export function ImageDropzone({ file, onFileChange }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const accept = (f: File | null) => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (f && f.type.startsWith("image/")) {
      setPreviewUrl(URL.createObjectURL(f));
      onFileChange(f);
    } else {
      setPreviewUrl(null);
      onFileChange(null);
    }
  };

  if (file && previewUrl) {
    return (
      <Card className="relative overflow-hidden p-2">
        <div className="flex items-center gap-3">
          <img
            src={previewUrl}
            alt={file.name}
            className="h-14 w-14 rounded object-cover border border-border"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{file.name}</p>
            <p className="text-xs text-muted-foreground">
              {(file.size / 1024).toFixed(1)} KB
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => accept(null)}
            aria-label="Remove image"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const f = e.dataTransfer.files?.[0] ?? null;
        accept(f);
      }}
      onClick={() => inputRef.current?.click()}
      className={`cursor-pointer border-dashed p-6 text-center transition-colors ${
        dragOver ? "border-primary bg-primary/5" : "border-border bg-muted/30"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => accept(e.target.files?.[0] ?? null)}
      />
      <ImagePlus className="mx-auto h-6 w-6 text-muted-foreground" />
      <p className="mt-2 text-sm font-medium">Drop a screenshot</p>
      <p className="text-xs text-muted-foreground">or click to upload</p>
    </Card>
  );
}
