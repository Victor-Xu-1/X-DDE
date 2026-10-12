import { useCallback, useEffect, useState } from "react";
import { api, request } from "./api";
import type { Detail, Health, Job } from "./types";

export function taskIdFromHash(hash: string) {
  const value = new URLSearchParams(hash.slice(1)).get("task") ?? "";
  return /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value)
    ? value.toLowerCase()
    : "";
}
const readSignal = (signal: AbortSignal) =>
  AbortSignal.any([signal, AbortSignal.timeout(30000)]);

export function useWorkbench() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [selected, setSelected] = useState(() =>
    taskIdFromHash(window.location.hash),
  );
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [jobsError, setJobsError] = useState(false);
  const [healthError, setHealthError] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  const select = useCallback((id: string, preserveHistory = true) => {
    setSelected(id);
    setDetail(null);
    setDetailError(false);
    const params = new URLSearchParams(window.location.hash.slice(1));
    if (preserveHistory && params.get("view") === "tasks") {
      if (id) params.set("task", id);
      else params.delete("task");
      window.history.replaceState(null, "", "#" + params);
    } else
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
    let jobsTimer: ReturnType<typeof setTimeout>;
    let healthTimer: ReturnType<typeof setTimeout>;
    async function pollJobs() {
      try {
        const items = await api.jobs(readSignal(controller.signal));
        if (controller.signal.aborted) return;
        setJobs(items);
        setJobsError(false);
        setLoading(false);
      } catch {
        if (!controller.signal.aborted) {
          setJobsError(true);
          setLoading(false);
        }
      }
      if (!controller.signal.aborted) jobsTimer = setTimeout(pollJobs, 3000);
    }
    async function pollHealth() {
      try {
        const info = await api.health(readSignal(controller.signal));
        if (controller.signal.aborted) return;
        setHealth(info);
        setHealthError(false);
      } catch {
        if (!controller.signal.aborted) {
          setHealth(null);
          setHealthError(true);
        }
      }
      if (!controller.signal.aborted)
        healthTimer = setTimeout(pollHealth, 10000);
    }
    void pollJobs();
    void pollHealth();
    return () => {
      controller.abort();
      clearTimeout(jobsTimer);
      clearTimeout(healthTimer);
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
      const read = new AbortController();
      const signal = readSignal(
        AbortSignal.any([controller.signal, read.signal]),
      );
      try {
        const [artifacts, job] = await Promise.all([
          api.artifacts(selected, signal),
          request<Job>(`/jobs/${selected}`, { signal }),
        ]);
        if (controller.signal.aborted) return;
        setDetail({ id: selected, artifacts });
        setSelectedJob(job);
        setDetailError(false);
      } catch {
        if (!controller.signal.aborted) setDetailError(true);
      } finally {
        read.abort();
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
    connectionError: jobsError || healthError,
    detailError,
    loading,
    refresh,
  };
}
