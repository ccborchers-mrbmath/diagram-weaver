import { useCallback, useEffect, useRef, useState } from "react";

// Minimal typings for the File System Access API (not in the default lib.dom).
interface FSWritable {
  write: (data: string | Blob) => Promise<void>;
  close: () => Promise<void>;
}
interface FSFileHandle {
  name: string;
  getFile: () => Promise<File>;
  createWritable: () => Promise<FSWritable>;
  queryPermission?: (o: { mode: "read" | "readwrite" }) => Promise<PermissionState>;
  requestPermission?: (o: { mode: "read" | "readwrite" }) => Promise<PermissionState>;
}
interface OpenPickerOptions {
  multiple?: boolean;
  excludeAcceptAllOption?: boolean;
  types?: { description?: string; accept: Record<string, string[]> }[];
}
interface SavePickerOptions {
  suggestedName?: string;
  types?: { description?: string; accept: Record<string, string[]> }[];
}
type WindowWithFS = Window &
  typeof globalThis & {
    showOpenFilePicker?: (o?: OpenPickerOptions) => Promise<FSFileHandle[]>;
    showSaveFilePicker?: (o?: SavePickerOptions) => Promise<FSFileHandle>;
  };

const SVG_TYPES = [{ description: "SVG image", accept: { "image/svg+xml": [".svg"] } }];

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export type FileSync = {
  supported: boolean;
  fileName: string | null;
  status: SaveStatus;
  open: () => Promise<void>;
  saveAs: () => Promise<void>;
  saveNow: () => void;
  close: () => void;
};

/**
 * Sync editor content with a file on disk via the File System Access API.
 * Once a file is opened (or created with Save As), edits are written back to
 * that same file automatically, debounced. Falls back to unsupported=false on
 * browsers without the API (Firefox / Safari), where import/download is used.
 */
export function useFileSync(content: string, onLoad: (text: string) => void): FileSync {
  const win = typeof window !== "undefined" ? (window as WindowWithFS) : undefined;
  const supported = !!win?.showOpenFilePicker;

  const handleRef = useRef<FSFileHandle | null>(null);
  const lastWrittenRef = useRef<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [status, setStatus] = useState<SaveStatus>("idle");

  const ensureWritePermission = async (h: FSFileHandle): Promise<boolean> => {
    if (!h.queryPermission) return true;
    let perm = await h.queryPermission({ mode: "readwrite" });
    if (perm !== "granted" && h.requestPermission) {
      perm = await h.requestPermission({ mode: "readwrite" });
    }
    return perm === "granted";
  };

  const write = useCallback(async (text: string) => {
    const h = handleRef.current;
    if (!h) return;
    setStatus("saving");
    try {
      if (!(await ensureWritePermission(h))) {
        setStatus("error");
        return;
      }
      const writable = await h.createWritable();
      await writable.write(text);
      await writable.close();
      lastWrittenRef.current = text;
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }, []);

  const open = useCallback(async () => {
    if (!win?.showOpenFilePicker) return;
    try {
      const [h] = await win.showOpenFilePicker({
        multiple: false,
        types: SVG_TYPES,
        excludeAcceptAllOption: false,
      });
      const file = await h.getFile();
      const text = await file.text();
      handleRef.current = h;
      lastWrittenRef.current = text;
      setFileName(h.name);
      setStatus("saved");
      onLoad(text);
      await ensureWritePermission(h); // prompt up front so autosave is silent
    } catch {
      // user cancelled the picker — ignore
    }
  }, [win, onLoad]);

  const saveAs = useCallback(async () => {
    if (!win?.showSaveFilePicker) return;
    try {
      const h = await win.showSaveFilePicker({ suggestedName: "diagram.svg", types: SVG_TYPES });
      handleRef.current = h;
      setFileName(h.name);
      await write(content);
    } catch {
      // cancelled — ignore
    }
  }, [win, content, write]);

  const saveNow = useCallback(() => {
    if (handleRef.current) void write(content);
  }, [content, write]);

  const close = useCallback(() => {
    handleRef.current = null;
    lastWrittenRef.current = null;
    setFileName(null);
    setStatus("idle");
  }, []);

  // Debounced autosave whenever the content diverges from what's on disk.
  useEffect(() => {
    if (!handleRef.current || content === lastWrittenRef.current) return;
    setStatus("saving");
    const id = setTimeout(() => void write(content), 700);
    return () => clearTimeout(id);
  }, [content, write]);

  return { supported, fileName, status, open, saveAs, saveNow, close };
}
