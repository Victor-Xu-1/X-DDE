import { useCallback, useEffect, useState } from "react";
import { api, request } from "./api";
import type { Detail, Health, Job } from "./types";

export function taskIdFromHash(hash: string) {
  const value = new URLSearchParams(hash.slice(1)).get("task") ?? "";
  return /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value)
    ? value.toLowerCase()
    : "";
}
export function useWorkbench() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [selected, setSelected] = useState(() =>
    taskIdFromHash(window.location.hash),
  );
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [connectionError, setConnectionError] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  const select = useCallback((id: string) => {
    setSelected(id);
    setDetail(null);
    setDetailError(false);
    window.history.replaceState(null, "", `#task=${encodeURIComponent(id)}`);
  }, []);
  useEffect(() => {
    function navigate() {
      setSelected(taskIdFromHash(window.location.hash));
      setDetail(null);
      setDetailError(false);
    }
    window.addEventListener("hashchange", navigate);
    window.addEventListener("popstate", navigate);
    return () => {
      window.removeEventListener("hashchange", navigate);
      window.removeEventListener("popstate", navigate);
    };
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
    setSelectedJob(null);
    setDetailError(false);
    if (!selected) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const [log, artifacts, job] = await Promise.all([
          api.logs(selected, controller.signal),
          api.artifacts(selected, controller.signal),
          request<Job>(`/jobs/${selected}`, { signal: controller.signal }),
        ]);
        if (controller.signal.aborted) return;
        setDetail({ id: selected, log, artifacts });
        setSelectedJob(job);
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
    selectedJob,
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
