import { useCallback, useEffect, useRef, useState } from "react";
import { taskAvailability } from "./task-availability";
export function useTaskReadiness(capabilityId: string) {
  // Undefined means checking, false means a confirmed unavailable runtime.
  const [state, setState] = useState<{
    capability: string;
    ready: boolean | undefined;
    error: string;
  }>({ capability: capabilityId, ready: undefined, error: "" });
  const [revision, setRevision] = useState(0);
  const active = useRef<AbortController | null>(null);
  const recheck = useCallback(() => {
    active.current?.abort();
    setState({ capability: capabilityId, ready: undefined, error: "" });
    setRevision((value) => value + 1);
  }, [capabilityId]);
  useEffect(() => {
    const controller = new AbortController();
    active.current = controller;
    setState({ capability: capabilityId, ready: undefined, error: "" });
    void taskAvailability(capabilityId, controller.signal)
      .then((ready) => {
        if (!controller.signal.aborted)
          setState({ capability: capabilityId, ready, error: "" });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setState({
            capability: capabilityId,
            ready: false,
            error: "The calculation environment could not be checked.",
          });
      });
    return () => controller.abort();
  }, [capabilityId, revision]);
  return {
    ready: state.capability === capabilityId ? state.ready : undefined,
    error: state.capability === capabilityId ? state.error : "",
    recheck,
  };
}
