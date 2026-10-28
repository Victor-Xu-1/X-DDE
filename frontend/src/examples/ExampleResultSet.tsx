import { useEffect, useState, type ReactNode } from "react";
import { request } from "../api";
import type { Job, Language } from "../types";
import { historyKindLabel, kindForJob } from "../studio/task-history-model";
import { ExampleJobResult } from "./ExampleJobResult";

type PrimaryResult =
  | { job: Job; primary?: never; primaryId?: never; primaryLabel?: never }
  | {
      job?: never;
      primary: ReactNode;
      primaryId: string;
      primaryLabel: string;
    };

/** Native job and record studies share one retained-stage controller. */
export function ExampleResultSet(
  props: PrimaryResult & {
    supporting: { job_id: string }[];
    stageNames?: Record<string, string>;
    language: Language;
    initialCandidateId?: string;
    stageSummary?(onSelect: (jobId: string) => void): ReactNode;
  },
) {
  const { supporting, language } = props;
  const root = props.job
    ? {
        id: props.job.id,
        content: (
          <ExampleJobResult
            job={props.job}
            language={language}
            initialCandidateId={props.initialCandidateId}
          />
        ),
      }
    : {
        id: props.primaryId,
        content: props.primary,
      };
  const [choice, setChoice] = useState({ root: root.id, id: root.id });
  const selected =
    choice.root === root.id &&
    supporting.some((entry) => entry.job_id === choice.id)
      ? choice.id
      : root.id;
  const [loaded, setLoaded] = useState<Record<string, Job>>({});
  const [failure, setFailure] = useState<{
    root: string;
    id: string;
    message: string;
  } | null>(null);
  const error =
    failure?.root === root.id && failure.id === selected ? failure.message : "";
  const zh = language === "zh";
  useEffect(() => {
    if (selected === root.id || loaded[selected]) return;
    const controller = new AbortController();
    setFailure(null);
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
        if (!controller.signal.aborted)
          setFailure({ root: root.id, id: selected, message: String(failure) });
      });
    return () => controller.abort();
  }, [selected, root.id, loaded]);
  const current = selected === root.id ? null : loaded[selected];
  function chooseStage(id: string) {
    if (id !== root.id && !supporting.some((entry) => entry.job_id === id))
      return;
    setFailure(null);
    setChoice({ root: root.id, id });
  }
  if (!supporting.length) return <>{root.content}</>;
  return (
    <>
      {props.stageSummary?.(chooseStage)}
      <label className="field">
        {zh ? "研究阶段结果" : "Study result stage"}
        <select
          aria-label={zh ? "研究阶段结果" : "Study result stage"}
          value={selected}
          onChange={(event) => chooseStage(event.target.value)}
        >
          <option value={root.id}>
            {props.job
              ? historyKindLabel(kindForJob(props.job), language)
              : props.primaryLabel}
          </option>
          {supporting.map((entry, index) => (
            <option key={entry.job_id} value={entry.job_id}>
              {props.stageNames?.[entry.job_id] ||
                (loaded[entry.job_id]
                  ? historyKindLabel(
                      kindForJob(loaded[entry.job_id]),
                      language,
                    ) +
                    (loaded[entry.job_id].request.name
                      ? ` · ${loaded[entry.job_id].request.name}`
                      : "")
                  : `${zh ? "后续结果" : "Follow-up result"} ${index + 1}`)}
            </option>
          ))}
        </select>
      </label>
      <div key={root.id} hidden={selected !== root.id}>
        {root.content}
      </div>
      {selected === root.id ? null : error ? (
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
