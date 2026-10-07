import { useEffect, useRef, useState } from "react";
import { request } from "../api";
import type { AvailableDataset, DatasetSource } from "./types";

export function useDatasetSources(role: DatasetSource["role"], search: string) {
  const [items, setItems] = useState<AvailableDataset[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  const known = useRef(new Map<string, AvailableDataset>()),
    previousRole = useRef(role);
  useEffect(() => {
    const controller = new AbortController();
    if (previousRole.current !== role) {
      known.current.clear();
      previousRole.current = role;
    }
    setLoading(true);
    setItems([]);
    setError("");
    const timer = setTimeout(() => {
      void request<AvailableDataset[]>(
        `/datasets/results?role=${role}&search=${encodeURIComponent(search)}`,
        { signal: controller.signal },
      )
        .then((records) => {
          if (controller.signal.aborted) return;
          records.forEach((item) => known.current.set(item.job_id, item));
          setItems(records);
        })
        .catch((failure) => {
          if (!controller.signal.aborted) setError(String(failure));
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [role, search, attempt]);
  return {
    items,
    loading,
    error,
    retry: () => setAttempt((value) => value + 1),
    resolve: (value: DatasetSource) =>
      known.current.get(value.job_id) ?? (value as AvailableDataset),
  };
}
