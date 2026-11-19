import type { Ref } from "react";
import type { Job, Language } from "../types";
import { translator } from "../i18n";
import { OperationResults } from "../operations/OperationResults";
import { researchError } from "../presentation/research-content";
import { TaskPresentationContext } from "../guided/TaskPresentation";

/** Observe the platform's job list; never create another task or polling loop. */
export function UtilityTaskResult({
  accepted,
  jobs,
  active,
  hidden = false,
  language,
  onCreated,
  headingRef,
  onEdit,
  onNewTask,
}: {
  accepted: Job;
  jobs: readonly Job[];
  active: boolean;
  hidden?: boolean;
  language: Language;
  onCreated(job: Job): void;
  headingRef?: Ref<HTMLHeadingElement>;
  onEdit?(): void;
  onNewTask?(): void;
}) {
  const job = jobs.find((item) => item.id === accepted.id) ?? accepted;
  const zh = language === "zh";
  return (
    <section
      className="utility-task-result"
      hidden={hidden}
      aria-label={zh ? "本次结果" : "Current results"}
    >
      <header>
        <h2 ref={headingRef} tabIndex={-1}>
          {zh ? "结果" : "Results"}
        </h2>
        <span role="status">{translator(language)(job.status)}</span>
        <div className="utility-result-actions">
          <a href={"/#task=" + encodeURIComponent(job.id)}>
            {zh ? "任务详情与下载" : "Task details & downloads"}
          </a>
          {onEdit && (
            <button type="button" className="secondary-button" onClick={onEdit}>
              {zh ? "编辑输入" : "Edit inputs"}
            </button>
          )}
          {onNewTask && (
            <button
              type="button"
              className="secondary-button"
              onClick={onNewTask}
            >
              {zh ? "新建任务" : "New task"}
            </button>
          )}
        </div>
      </header>
      {job.error && (
        <p role="alert" className="error-box">
          {researchError(job.error, zh)}
        </p>
      )}
      {active && job.status === "succeeded" && (
        <TaskPresentationContext.Provider
          value={{
            layout: "single",
            imageEntry: "workspace",
            active: !hidden,
            renderResult: (accepted) => (
              <UtilityTaskResult
                accepted={accepted}
                jobs={jobs}
                language={language}
                active={!hidden}
                onCreated={onCreated}
              />
            ),
          }}
        >
          <OperationResults
            job={job}
            language={language}
            onCreated={onCreated}
          />
        </TaskPresentationContext.Provider>
      )}
    </section>
  );
}
