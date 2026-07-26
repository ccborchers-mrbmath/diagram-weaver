import { useEffect, useRef, useState } from "react";
import { ClipboardPaste, ImagePlus, X } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Props = {
  file: File | null;
  onFileChange: (file: File | null) => void;
};

function blobToImageFile(blob: Blob): File {
  const ext = blob.type.split("/")[1] || "png";
  return new File([blob], `pasted-image.${ext}`, { type: blob.type });
}

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

  // Latest `accept` for the document-level paste listener without re-subscribing.
  const acceptRef = useRef(accept);
  acceptRef.current = accept;

  // Ctrl+V anywhere on the panel grabs an image from the clipboard. Text pastes
  // are ignored (no image item), so pasting into the prompt still works.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const it of Array.from(items)) {
        if (it.kind === "file" && it.type.startsWith("image/")) {
          const f = it.getAsFile();
          if (f) {
            e.preventDefault();
            acceptRef.current(f);
            toast.success("Image pasted from clipboard");
          }
          return;
        }
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, []);

  const pasteFromClipboard = async () => {
    if (!navigator.clipboard?.read) {
      toast.error(
        "This browser can't read the clipboard directly — copy the image, then press Ctrl+V here.",
      );
      return;
    }
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find((tp) => tp.startsWith("image/"));
        if (type) {
          accept(blobToImageFile(await item.getType(type)));
          toast.success("Image pasted from clipboard");
          return;
        }
      }
      toast.error("No image found on the clipboard. Copy an image first.");
    } catch {
      toast.error(
        "Couldn't read the clipboard. Embedded previews block it — open the app in its own tab, or press Ctrl+V.",
      );
    }
  };

  if (file && previewUrl) {
    return (
      <Card className="relative overflow-hidden p-2">
        <div className="flex items-center gap-3">
          <img
            src={previewUrl}
            alt={file.name}
            className="h-14 w-14 rounded border border-border object-cover"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{file.name}</p>
            <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
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
        accept(e.dataTransfer.files?.[0] ?? null);
      }}
      onClick={() => inputRef.current?.click()}
      className={`cursor-pointer border-dashed p-5 text-center transition-colors ${
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
      <p className="mt-2 text-sm font-medium">Drop or click to upload</p>
      <div className="mt-3 flex items-center justify-center">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="gap-1.5"
          onClick={(e) => {
            e.stopPropagation(); // don't also open the upload dialog
            void pasteFromClipboard();
          }}
        >
          <ClipboardPaste className="h-3.5 w-3.5" />
          Paste from clipboard
        </Button>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">or press Ctrl+V</p>
    </Card>
  );
}
