import { useEffect, useState } from "react";
import { taskAvailability } from "./task-availability";
export function useTaskReadiness(capabilityId: string) {
  // Undefined means checking, false means a confirmed unavailable runtime.
  const [state, setState] = useState<{
    capability: string;
    ready: boolean | undefined;
    error: string;
  }>({ capability: capabilityId, ready: undefined, error: "" });
  useEffect(() => {
    const controller = new AbortController();
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
  }, [capabilityId]);
  return {
    ready: state.capability === capabilityId ? state.ready : undefined,
    error: state.capability === capabilityId ? state.error : "",
  };
}
