import { useState, useCallback } from "react";

export type DetailStackItem =
  | { type: "plant"; id: string; highlightBatchId?: string; label?: string }
  | { type: "platform"; id: string; highlightBatchId?: string; label?: string };

const MAX_DEPTH = 4;

export function useDetailStack(initial?: DetailStackItem[]) {
  const [stack, setStack] = useState<DetailStackItem[]>(initial ?? []);

  const open = useCallback((item: DetailStackItem) => {
    setStack([item]);
  }, []);

  const push = useCallback((item: DetailStackItem) => {
    setStack((prev) => (prev.length < MAX_DEPTH ? [...prev, item] : prev));
  }, []);

  const pop = useCallback(() => {
    setStack((prev) => prev.slice(0, -1));
  }, []);

  const clear = useCallback(() => setStack([]), []);

  return { stack, open, push, pop, clear };
}
