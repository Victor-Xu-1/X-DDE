import { useEffect, useState } from "react";
import { request } from "../api";
import type { Job, Language } from "../types";
import { historyKindLabel, kindForJob } from "../studio/task-history-model";
import { ExampleJobResult } from "./ExampleJobResult";

/** A pinned study can retain original generation, refinement and independent QC. */
export function ExampleResultSet({
  job,
  supporting,
  language,
}: {
  job: Job;
  supporting: { job_id: string }[];
  language: Language;
}) {
  const [choice, setChoice] = useState({ root: job.id, id: job.id });
  const selected =
    choice.root === job.id &&
    supporting.some((entry) => entry.job_id === choice.id)
      ? choice.id
      : job.id;
  const [loaded, setLoaded] = useState<Record<string, Job>>({ [job.id]: job });
  const [error, setError] = useState("");
  const zh = language === "zh";
  useEffect(() => {
    if (selected === job.id || loaded[selected]) return;
    const controller = new AbortController();
    setError("");
    void request<Job>(`/jobs/${encodeURIComponent(selected)}`, {
      signal: controller.signal,
    })
      .then((value) => {
        if (value.id !== selected || value.status !== "succeeded")
          throw new Error("Reviewed follow-up result is unavailable.");
        if (!controller.signal.aborted)
          setLoaded((previous) => ({ ...previous, [selected]: value }));
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(String(failure));
      });
    return () => controller.abort();
  }, [selected, job.id, loaded]);
  const current = selected === job.id ? job : loaded[selected];
  if (!supporting.length)
    return <ExampleJobResult job={job} language={language} />;
  return (
    <>
      <label className="field">
        {zh ? "研究阶段结果" : "Study result stage"}
        <select
          value={selected}
          onChange={(event) => {
            setError("");
            setChoice({ root: job.id, id: event.target.value });
          }}
        >
          <option value={job.id}>
            {historyKindLabel(kindForJob(job), language)}
          </option>
          {supporting.map((entry, index) => (
            <option key={entry.job_id} value={entry.job_id}>
              {loaded[entry.job_id]
                ? historyKindLabel(kindForJob(loaded[entry.job_id]), language)
                : `${zh ? "后续结果" : "Follow-up result"} ${index + 1}`}
            </option>
          ))}
        </select>
      </label>
      {error ? (
        <p role="alert">{error}</p>
      ) : current ? (
        <ExampleJobResult key={current.id} job={current} language={language} />
      ) : (
        <p role="status">
          {zh ? "正在读取已核对的结果…" : "Loading reviewed result…"}
        </p>
      )}
    </>
  );
}
