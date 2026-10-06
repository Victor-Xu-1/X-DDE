import { useEffect, useState } from "react";
import { api, request } from "../api";
import { RunMonitor } from "../workflows/RunMonitor";
import type { WorkflowRun } from "../workflows/types";
import type { Job, Language } from "../types";
import type { DatasetExecution } from "./useDatasetRun";
import { DatasetResults } from "./DatasetResults";
import type { DatasetResult } from "./types";

export function ExecutionView({
  execution,
  language,
  onCreated,
}: {
  execution: DatasetExecution;
  language: Language;
  onCreated(job: Job): void;
}) {
  const zh = language === "zh",
    [run, setRun] = useState<WorkflowRun | null>(
      execution.kind === "workflow" ? execution.run : null,
    ),
    [job, setJob] = useState<Job | null>(
      execution.kind === "job" ? execution.job : null,
    ),
    [result, setResult] = useState<DatasetResult | null>(null),
    [error, setError] = useState("");
  const id =
    execution.kind === "job" ? execution.id : run?.attempts.at(-1)?.job_id;
  useEffect(() => {
    if (!id) return;
    const c = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const current = await request<Job>(`/jobs/${id}`, { signal: c.signal });
        if (c.signal.aborted) return;
        setJob(current);
        if (current.status === "succeeded")
          setResult(
            await request<DatasetResult>(`/jobs/${id}/result`, {
              signal: c.signal,
            }),
          );
        else if (
          !["failed", "cancelled", "interrupted"].includes(current.status)
        )
          timer = setTimeout(() => void poll(), 1500);
      } catch (e) {
        if (!c.signal.aborted) setError(String(e));
      }
    }
    setResult(null);
    setError("");
    void poll();
    return () => {
      c.abort();
      clearTimeout(timer);
    };
  }, [id]);
  return (
    <div className="dataset-execution">
      {execution.kind === "workflow" && run && (
        <RunMonitor initial={run} language={language} onChange={setRun} />
      )}
      {job && result && (
        <DatasetResults
          job={job}
          result={result}
          language={language}
          onCreated={onCreated}
        />
      )}
      {job && !result && (
        <div className="dataset-calculation-state">
          <strong>{job.request.name}</strong>
          <span>
            {job.status === "running"
              ? zh
                ? "正在计算"
                : "Computing"
              : job.status === "queued"
                ? zh
                  ? "等待计算"
                  : "Queued"
                : job.status}
          </span>
          {["queued", "running"].includes(job.status) && (
            <button
              type="button"
              onClick={() =>
                void api
                  .mutate(`/jobs/${job.id}/cancel`, crypto.randomUUID())
                  .then(setJob)
                  .catch((e) => setError(String(e)))
              }
            >
              {zh ? "取消计算" : "Cancel"}
            </button>
          )}
          {job.error && <p role="alert">{job.error}</p>}
        </div>
      )}
      {!job && execution.kind === "workflow" && (
        <p role="status">
          {zh ? "正在准备第一步计算…" : "Preparing the first calculation…"}
        </p>
      )}
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
    </div>
  );
}
