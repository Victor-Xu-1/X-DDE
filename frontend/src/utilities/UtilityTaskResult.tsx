import type { Job, Language } from "../types";
import { translator } from "../i18n";
import { OperationResults } from "../operations/OperationResults";
import { researchError } from "../presentation/research-content";

/** Observe the platform's job list; never create another task or polling loop. */
export function UtilityTaskResult({
  accepted,
  jobs,
  active,
  language,
  onCreated,
}: {
  accepted: Job;
  jobs: readonly Job[];
  active: boolean;
  language: Language;
  onCreated(job: Job): void;
}) {
  const job = jobs.find((item) => item.id === accepted.id) ?? accepted;
  const zh = language === "zh";
  return (
    <section
      className="utility-task-result"
      aria-label={zh ? "本次结果" : "Current results"}
    >
      <header>
        <h2>{zh ? "结果" : "Results"}</h2>
        <span role="status">{translator(language)(job.status)}</span>
        <a href={"/#task=" + encodeURIComponent(job.id)}>
          {zh ? "任务详情与下载" : "Task details & downloads"}
        </a>
      </header>
      {job.error && (
        <p role="alert" className="error-box">
          {researchError(job.error, zh)}
        </p>
      )}
      {active && job.status === "succeeded" && (
        <OperationResults job={job} language={language} onCreated={onCreated} />
      )}
    </section>
  );
}
