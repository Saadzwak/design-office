import { useEffect, useState } from "react";

import {
  loadProjectState,
  onProjectStateChange,
  type ProjectState,
} from "../lib/projectState";

/**
 * Subscribe the calling component to the unified project state. Re-renders
 * on any save (this tab OR another tab). Read-only — mutate via the
 * setters in `lib/projectState.ts` so everyone else stays in sync.
 */
export function useProjectState(): ProjectState {
  const [state, setState] = useState<ProjectState>(() => loadProjectState());

  useEffect(() => {
    const unsubscribe = onProjectStateChange(setState);
    return unsubscribe;
  }, []);

  return state;
}
