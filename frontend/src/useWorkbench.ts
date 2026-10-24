import { useCallback, useEffect, useRef, useState } from "react";
import { api, request } from "./api";
import type { Detail, Health, Job } from "./types";
import {
  freshestJob,
  pollWorkbench,
  type JobObservation,
} from "./workbench-polling";

export function taskIdFromHash(hash: string) {
  const params = new URLSearchParams(hash.slice(1));
  if (params.get("view") === "new") return "";
  const value = params.get("task") ?? "";
  return /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value)
    ? value.toLowerCase()
    : "";
}

/** Explicit module navigation pushes a location; task selections keep their existing filters. */
export type SelectionNavigation = boolean | { pushHash: string };

interface SelectedRead {
  id: string;
  loading: boolean;
  error: Error | null;
}

export function useWorkbench() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [selected, setSelected] = useState(() =>
    taskIdFromHash(window.location.hash),
  );
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [jobsError, setJobsError] = useState<Error | null>(null);
  const [healthError, setHealthError] = useState<Error | null>(null);
  const [statusRead, setStatusRead] = useState<SelectedRead>({
    id: "",
    loading: false,
    error: null,
  });
  const [artifactRead, setArtifactRead] = useState<SelectedRead>({
    id: "",
    loading: false,
    error: null,
  });
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const sequence = useRef(0);
  const observations = useRef(new Map<string, JobObservation>());
  const listIds = useRef(new Set<string>());
  const selectedId = useRef(selected);
  selectedId.current = selected;
  const record = useCallback((job: Job, order: number) => {
    const latest = freshestJob(observations.current.get(job.id), {
      job,
      sequence: order,
    });
    observations.current.set(job.id, latest);
    return latest.job;
  }, []);
  const prune = useCallback(() => {
    for (const id of observations.current.keys())
      if (!listIds.current.has(id) && id !== selectedId.current)
        observations.current.delete(id);
  }, []);
  const confirmJob = useCallback(
    (job: Job) => {
      const latest = record(job, ++sequence.current);
      if (job.id === selectedId.current) setSelectedJob(latest);
      setJobs((items) =>
        items.map((item) => (item.id === job.id ? latest : item)),
      );
    },
    [record],
  );
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  const select = useCallback(
    (id: string, navigation: SelectionNavigation = true) => {
      if (
        typeof navigation === "object" &&
        !navigation.pushHash.startsWith("#")
      )
        throw new Error("Task navigation requires a local hash route");
      setSelected(id);
      if (typeof navigation === "object") {
        window.history.pushState(null, "", navigation.pushHash);
        return;
      }
      const params = new URLSearchParams(window.location.hash.slice(1));
      if (
        navigation &&
        ["tasks", "results"].includes(params.get("view") ?? "")
      ) {
        if (id) params.set("task", id);
        else params.delete("task");
        window.history.replaceState(null, "", "#" + params);
      } else
        window.history.replaceState(
          null,
          "",
          `#task=${encodeURIComponent(id)}`,
        );
    },
    [],
  );
  useEffect(() => {
    function navigate() {
      setSelected(taskIdFromHash(window.location.hash));
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
    const stopJobs = pollWorkbench(
      controller.signal,
      3000,
      async (signal) => {
        const order = ++sequence.current;
        return { items: await api.jobs(signal), order };
      },
      ({ items, order }) => {
        const latest = items.map((job) => record(job, order));
        setJobs(latest);
        listIds.current = new Set(latest.map((job) => job.id));
        const current = latest.find((job) => job.id === selectedId.current);
        if (current) setSelectedJob(current);
        prune();
        setJobsError(null);
        setLoading(false);
      },
      (error) => {
        setJobsError(error);
        setLoading(false);
      },
    );
    const stopHealth = pollWorkbench(
      controller.signal,
      10000,
      api.health,
      (info) => {
        setHealth(info);
        setHealthError(null);
      },
      (error) => {
        setHealth(null);
        setHealthError(error);
      },
    );
    return () => {
      controller.abort();
      stopJobs();
      stopHealth();
    };
  }, [revision, record, prune]);
  useEffect(() => {
    setDetail((old) => (old?.id === selected ? old : null));
    setSelectedJob(observations.current.get(selected)?.job ?? null);
    prune();
    setStatusRead((old) => ({
      id: selected,
      loading: Boolean(selected),
      error: old.id === selected ? old.error : null,
    }));
    setArtifactRead((old) => ({
      id: selected,
      loading: Boolean(selected),
      error: old.id === selected ? old.error : null,
    }));
    if (!selected) return;
    const controller = new AbortController();
    const stopStatus = pollWorkbench(
      controller.signal,
      2000,
      async (signal) => {
        const order = ++sequence.current;
        const job = await request<Job>(`/jobs/${selected}`, { signal });
        if (job.id !== selected)
          throw new Error("Task response does not match selection");
        return { job, order };
      },
      ({ job, order }) => {
        const latest = record(job, order);
        setSelectedJob(latest);
        setJobs((items) =>
          items.map((item) => (item.id === selected ? latest : item)),
        );
        setStatusRead({ id: selected, loading: false, error: null });
      },
      (error) => setStatusRead({ id: selected, loading: false, error }),
    );
    const stopArtifacts = pollWorkbench(
      controller.signal,
      2000,
      (signal) => api.artifacts(selected, signal),
      (artifacts) => {
        setDetail({ id: selected, artifacts });
        setArtifactRead({ id: selected, loading: false, error: null });
      },
      (error) => setArtifactRead({ id: selected, loading: false, error }),
    );
    return () => {
      controller.abort();
      stopStatus();
      stopArtifacts();
    };
  }, [selected, revision, record, prune]);
  const selectedJobError = statusRead.id === selected ? statusRead.error : null;
  const artifactError =
    artifactRead.id === selected ? artifactRead.error : null;
  return {
    jobs,
    selectedJob: selectedJob?.id === selected ? selectedJob : null,
    health,
    selected,
    select,
    confirmJob,
    detail: detail?.id === selected ? detail : null,
    jobsError,
    healthError,
    selectedJobError,
    selectedJobLoading:
      Boolean(selected) && (statusRead.id !== selected || statusRead.loading),
    artifactError,
    artifactsLoading:
      Boolean(selected) &&
      (artifactRead.id !== selected || artifactRead.loading),
    connectionError: Boolean(jobsError || healthError),
    detailError: Boolean(selectedJobError || artifactError),
    loading,
    refresh,
  };
}
