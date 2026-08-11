import { useCallback, useRef, useState } from "react";

type HistoryState = { past: string[]; present: string; future: string[] };

export type History = {
  value: string;
  /** Commit a new value. Pass a `coalesceKey` (e.g. "code") so a rapid burst of
   *  edits with the same key collapses into a single undo step. */
  set: (next: string, coalesceKey?: string | null) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
};

const COALESCE_MS = 600;

/** Undo/redo history over a single string (the SVG document). */
export function useHistory(initial: string, limit = 200): History {
  const [state, setState] = useState<HistoryState>({ past: [], present: initial, future: [] });
  const lastRef = useRef<{ time: number; key: string | null }>({ time: 0, key: null });

  const set = useCallback(
    (next: string, coalesceKey: string | null = null) => {
      setState((s) => {
        if (next === s.present) return s;
        const now = Date.now();
        const coalesce =
          coalesceKey !== null &&
          lastRef.current.key === coalesceKey &&
          now - lastRef.current.time < COALESCE_MS;
        lastRef.current = { time: now, key: coalesceKey };
        if (coalesce) {
          // Same editing burst → replace present without a new undo step.
          return { past: s.past, present: next, future: [] };
        }
        return { past: [...s.past, s.present].slice(-limit), present: next, future: [] };
      });
    },
    [limit],
  );

  const undo = useCallback(() => {
    lastRef.current = { time: 0, key: null }; // break coalescing across an undo
    setState((s) => {
      if (s.past.length === 0) return s;
      const prev = s.past[s.past.length - 1];
      return {
        past: s.past.slice(0, -1),
        present: prev,
        future: [s.present, ...s.future].slice(0, limit),
      };
    });
  }, [limit]);

  const redo = useCallback(() => {
    lastRef.current = { time: 0, key: null };
    setState((s) => {
      if (s.future.length === 0) return s;
      const next = s.future[0];
      return {
        past: [...s.past, s.present].slice(-limit),
        present: next,
        future: s.future.slice(1),
      };
    });
  }, [limit]);

  return {
    value: state.present,
    set,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}
