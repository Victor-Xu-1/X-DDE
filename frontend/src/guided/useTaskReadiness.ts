import { useMemo, useSyncExternalStore } from "react";
import { taskReadinessState } from "./task-readiness-state";
export function useTaskReadiness(capabilityId: string) {
  const state = useMemo(() => taskReadinessState(capabilityId), [capabilityId]);
  const snapshot = useSyncExternalStore(state.subscribe, state.getSnapshot);
  return { ...snapshot, recheck: state.recheck };
}
