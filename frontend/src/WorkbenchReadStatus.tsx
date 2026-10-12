import type { Language } from "./types";
import type { useWorkbench } from "./useWorkbench";

export function WorkbenchReadStatus({
  work,
  hasJob,
  showJobsError,
  language,
}: {
  work: Pick<
    ReturnType<typeof useWorkbench>,
    | "healthError"
    | "jobsError"
    | "selectedJobError"
    | "artifactError"
    | "selectedJobLoading"
    | "artifactsLoading"
    | "refresh"
  >;
  hasJob: boolean;
  showJobsError: boolean;
  language: Language;
}) {
  const zh = language === "zh";
  const failures = [
    {
      source: "jobs",
      error: showJobsError && work.jobsError,
      text: zh
        ? "暂时无法更新任务列表，当前显示最后确认的任务信息。"
        : "Task list could not be refreshed. Showing the last confirmed task information.",
    },
    {
      source: "health",
      error: work.healthError,
      text: zh
        ? "暂时无法更新服务健康状态，服务可用性尚未确认。"
        : "Service health could not be refreshed. Availability is unconfirmed.",
    },
    {
      source: "status",
      error: hasJob && work.selectedJobError,
      text: zh
        ? "暂时无法更新任务状态，当前显示最后确认的状态。"
        : "Task status could not be refreshed. Showing the last confirmed state.",
    },
    {
      source: "artifacts",
      error: hasJob && work.artifactError,
      text: zh
        ? "暂时无法更新任务文件，已显示的文件可能不是最新的。"
        : "Task files could not be refreshed. Displayed files may be out of date.",
    },
  ];
  return (
    <>
      {failures
        .filter(({ error }) => error)
        .map(({ source, text }) => (
          <div
            key={source}
            className="error-box"
            role="alert"
            data-read-error={source}
          >
            {text}{" "}
            <button type="button" onClick={work.refresh}>
              {zh ? "重试" : "Retry"}
            </button>
          </div>
        ))}
      {hasJob && work.selectedJobLoading && !work.selectedJobError && (
        <p className="notice" role="status">
          {zh ? "正在更新任务状态…" : "Refreshing task status…"}
        </p>
      )}
      {hasJob && work.artifactsLoading && !work.artifactError && (
        <p className="notice" role="status">
          {zh ? "正在读取任务文件…" : "Loading task files…"}
        </p>
      )}
    </>
  );
}
