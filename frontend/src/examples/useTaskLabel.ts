import { useEffect, useState } from "react";
import { request } from "../api";
import type { Job, Language } from "../types";
import type { TaskHistoryIdentity } from "../studio/task-history-model";
import { resultSourceTitle } from "../operations/result-source-labels";

function verifiedIdentity(data: TaskHistoryIdentity, id: string) {
  return (
    data?.job_id === id &&
    ["research", "fixed_example", "setup_validation"].includes(data.origin) &&
    Array.isArray(data.example_cases) &&
    data.example_cases.every(
      (entry) =>
        entry &&
        typeof entry.id === "string" &&
        Array.isArray(entry.label) &&
        entry.label.length === 2 &&
        entry.label.every(
          (text) => typeof text === "string" && text.length > 0,
        ),
    )
  );
}
/** History and details share one persisted origin/case projection; names are never guessed. */
export function useTaskLabel(job: Job | null, language: Language) {
  const [label, setLabel] = useState<{
    identity: TaskHistoryIdentity;
  } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setLabel(null);
    if (job)
      void request<TaskHistoryIdentity>(
        `/task-history/${encodeURIComponent(job.id)}/identity`,
        {
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(10000),
          ]),
        },
      )
        .then((data) => {
          if (verifiedIdentity(data, job.id) && !controller.signal.aborted)
            setLabel({ identity: data });
        })
        .catch(() => {
          /* An unverified origin cannot expose an internal example title. */
        });
    return () => controller.abort();
  }, [job?.id]);
  if (!job) return "";
  return label?.identity.job_id === job.id
    ? resultSourceTitle(
        { job, ...label.identity },
        label.identity.origin === "research" ? "research" : "examples",
        language,
      )
    : language === "zh"
      ? "研究结果"
      : "Research result";
}
