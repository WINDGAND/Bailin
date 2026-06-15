import { createContext, useContext, useEffect } from "react";

export interface DirtyContextValue {
  setDirty(dirty: boolean): void;
}

export const DirtyContext = createContext<DirtyContextValue | null>(null);

/** Register whether the current settings tab has unsaved changes. */
export function useDirtyTracker(isDirty: boolean): void {
  const ctx = useContext(DirtyContext);
  useEffect(() => {
    ctx?.setDirty(isDirty);
    return () => {
      ctx?.setDirty(false);
    };
  }, [ctx, isDirty]);
}
