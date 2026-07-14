import { useEffect, useRef, useCallback } from "react";

export function useAutoSave(saveFn: () => Promise<void>, deps: any[], intervalMs = 30000) {
  const timerRef = useRef<any>(null);
  const isDirty = useRef(false);
  const markDirty = useCallback(() => { isDirty.current = true; }, []);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      if (isDirty.current) { saveFn(); isDirty.current = false; }
    }, intervalMs);
    return () => clearInterval(timerRef.current);
  }, deps);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty.current) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  return markDirty;
}
