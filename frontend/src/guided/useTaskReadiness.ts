import { useEffect, useState } from "react";
import { request } from "../api";
export function useTaskReadiness(capabilityId: string) {
  const [ready, setReady] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setReady(false);
    setError("");
    void request<{ availability: { configuration_present: boolean } }>(
      "/capabilities/" + encodeURIComponent(capabilityId),
      { signal: controller.signal },
    )
      .then((value) => {
        if (!controller.signal.aborted)
          setReady(value.availability.configuration_present);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(String(e));
      });
    return () => controller.abort();
  }, [capabilityId]);
  return { ready, error };
}
