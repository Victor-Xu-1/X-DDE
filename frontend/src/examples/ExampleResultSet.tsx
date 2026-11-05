import { useEffect, useState, type ReactNode } from "react";
import { request } from "../api";
import type { Job, Language } from "../types";
import { historyKindLabel, kindForJob } from "../studio/task-history-model";
import { ExampleJobResult } from "./ExampleJobResult";
import { ExampleStageNavigation } from "./ExampleStageNavigation";

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
  const [choice, setChoice] = useState({
    root: root.id,
    id: root.id,
    attempt: 0,
  });
  const selected =
    choice.root === root.id &&
    supporting.some((entry) => entry.job_id === choice.id)
      ? choice.id
      : root.id;
  const [loaded, setLoaded] = useState<Record<string, Job>>({});
  const [failure, setFailure] = useState<{
    root: string;
    id: string;
  } | null>(null);
  const error = failure?.root === root.id && failure.id === selected;
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
      .catch(() => {
        if (!controller.signal.aborted)
          setFailure({ root: root.id, id: selected });
      });
    return () => controller.abort();
  }, [selected, root.id, loaded, choice.attempt]);
  const current = selected === root.id ? null : loaded[selected];
  function chooseStage(id: string) {
    if (id !== root.id && !supporting.some((entry) => entry.job_id === id))
      return;
    setFailure(null);
    setChoice((previous) => ({
      root: root.id,
      id,
      attempt: previous.attempt + 1,
    }));
  }
  if (!supporting.length) return <>{root.content}</>;
  return (
    <>
      {props.stageSummary?.(chooseStage)}
      <ExampleStageNavigation
        language={language}
        selected={selected}
        onSelect={chooseStage}
        stages={[
          {
            id: root.id,
            label: props.job
              ? historyKindLabel(kindForJob(props.job), language)
              : props.primaryLabel,
          },
          ...supporting.map(({ job_id: id }, index) => {
            const job = loaded[id];
            return {
              id,
              label:
                props.stageNames?.[id] ||
                (job
                  ? historyKindLabel(kindForJob(job), language) +
                    (job.request.name ? ` · ${job.request.name}` : "")
                  : `${zh ? "后续结果" : "Follow-up result"} ${index + 1}`),
            };
          }),
        ]}
      />
      <div key={root.id} hidden={selected !== root.id}>
        {root.content}
      </div>
      {selected === root.id ? null : error ? (
        <div className="example-stage-error">
          <p role="alert">
            {zh
              ? "此阶段的已核对结果暂不可用。"
              : "This reviewed stage is unavailable."}
          </p>
          <button
            type="button"
            className="secondary-button"
            onClick={() => chooseStage(selected)}
          >
            {zh ? "重试此阶段" : "Retry this stage"}
          </button>
        </div>
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
