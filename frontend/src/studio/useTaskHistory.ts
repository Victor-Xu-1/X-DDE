import { useEffect, useState } from "react";
import { api } from "../api";
import {
  historyUrl,
  type HistoryFilter,
  type TaskHistoryPage,
} from "./task-history-model";

export function useTaskHistory(filter: HistoryFilter) {
  const path = historyUrl(filter);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{
    path: string;
    project: string | null;
    data: TaskHistoryPage | null;
    error: boolean;
    counts: TaskHistoryPage["counts"];
  }>({ path: "", project: null, data: null, error: false, counts: {} });
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function read() {
      try {
        const data = await api.taskHistory(
          path,
          AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]),
        );
        if (
          !data ||
          !Array.isArray(data.items) ||
          !data.counts ||
          typeof data.total !== "number"
        )
          throw new Error("Invalid task history response");
        if (!controller.signal.aborted)
          setState({
            path,
            project: filter.project,
            data,
            error: false,
            counts: data.counts,
          });
      } catch {
        if (!controller.signal.aborted)
          setState((old) => ({
            path,
            project: filter.project,
            data: old.path === path ? old.data : null,
            error: true,
            counts: old.project === filter.project ? old.counts : {},
          }));
        return; // Failure waits for an explicit reconnection instead of repeated retries.
      }
      if (!controller.signal.aborted) timer = setTimeout(read, 3000);
    }
    void read();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [path, filter.project, revision]);
  return {
    data: state.path === path ? state.data : null,
    counts: state.project === filter.project ? state.counts : {},
    error: state.path === path && state.error,
    loading: state.path !== path || (!state.data && !state.error),
    refresh: () => setRevision((value) => value + 1),
  };
}
