import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { Detail, Health, Job } from "./types";

function hashId() {
  const value =
    new URLSearchParams(window.location.hash.slice(1)).get("task") ?? "";
  return /^[0-9a-f-]{36}$/.test(value) ? value : "";
}
export function useWorkbench() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [selected, setSelected] = useState(hashId);
  const explicitSelection = useRef(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [connectionError, setConnectionError] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  const select = useCallback((id: string) => {
    explicitSelection.current = true;
    setSelected(id);
    setDetail(null);
    setDetailError(false);
    window.history.replaceState(null, "", `#task=${encodeURIComponent(id)}`);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const [items, info] = await Promise.all([
          api.jobs(controller.signal),
          api.health(controller.signal),
        ]);
        if (controller.signal.aborted) return;
        setJobs(items);
        setHealth(info);
        setConnectionError(false);
        setLoading(false);
        setSelected(
          (previous) =>
            previous || (explicitSelection.current ? "" : items[0]?.id || ""),
        );
      } catch {
        if (!controller.signal.aborted) {
          setConnectionError(true);
          setLoading(false);
        }
      }
      if (!controller.signal.aborted) timer = setTimeout(poll, 3000);
    }
    void api.initialize().catch(() => {
      if (!controller.signal.aborted) setConnectionError(true);
    });
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [revision]);
  useEffect(() => {
    setDetail(null);
    setDetailError(false);
    if (!selected) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const [log, artifacts] = await Promise.all([
          api.logs(selected, controller.signal),
          api.artifacts(selected, controller.signal),
        ]);
        if (controller.signal.aborted) return;
        setDetail({ id: selected, log, artifacts });
        setDetailError(false);
      } catch {
        if (!controller.signal.aborted) setDetailError(true);
      }
      if (!controller.signal.aborted) timer = setTimeout(poll, 2000);
    }
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [selected, revision]);
  return {
    jobs,
    health,
    selected,
    select,
    detail,
    connectionError,
    detailError,
    loading,
    refresh,
  };
}
