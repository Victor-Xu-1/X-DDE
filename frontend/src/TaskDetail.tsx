import { ConstraintReceipt } from "./constraints/ConstraintReceipt";
import { useLayoutEffect, useRef, useState } from "react";
import { api, artifactUrl } from "./api";
import { translator } from "./i18n";
import {
  terminal,
  type Detail,
  type Job,
  type Language,
  type Prediction,
} from "./types";
import { OperationResults } from "./operations/OperationResults";
import { researchError } from "./presentation/research-content";
import { useTaskLabel } from "./examples/useTaskLabel";
import {
  isResearchFile,
  researchFileLabel,
} from "./presentation/research-files";

interface Props {
  job: Job | null;
  detail: Detail | null;
  failed: boolean;
  language: Language;
  onChange(job: Job): void;
  onDraft?(request: Prediction): void;
}
export function TaskDetail({
  job,
  detail,
  failed,
  language,
  onChange,
  onDraft,
}: Props) {
  const t = translator(language);
  const taskLabel = useTaskLabel(job, language);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set()),
    [actionErrors, setActionErrors] = useState<Record<string, string>>({});
  const error = job ? (actionErrors[job.id] ?? "") : "";
  const busy = Boolean(job && pendingIds.has(job.id));
  const retryKeys = useRef(new Map<string, string>());
  const actionPending = useRef(new Set<string>());
  const selectedId = useRef(job?.id);
  selectedId.current = job?.id;
  // Invalidate ownership during the commit that replaces this keyed result view.
  const actionView = useRef({ mounted: false, generation: 0 });
  useLayoutEffect(() => {
    actionView.current.mounted = true;
    actionView.current.generation += 1;
    return () => {
      actionView.current.mounted = false;
      actionView.current.generation += 1;
    };
  }, [job?.id]);
  async function action(kind: "cancel" | "retry") {
    if (!job || actionPending.current.has(job.id)) return;
    if (kind === "cancel" && !window.confirm(t("cancelConfirm"))) return;
    const generation = actionView.current.generation;
    const ownsView = () =>
      actionView.current.mounted &&
      actionView.current.generation === generation &&
      selectedId.current === job.id;
    actionPending.current.add(job.id);
    setPendingIds(new Set(actionPending.current));
    setActionErrors((previous) => ({ ...previous, [job.id]: "" }));
    try {
      let result: Job;
      if (kind === "cancel") result = await api.cancel(job.id);
      else {
        const key = retryKeys.current.get(job.id) ?? crypto.randomUUID();
        retryKeys.current.set(job.id, key);
        result = await api.retry(job.id, key);
      }
      if (ownsView()) {
        try {
          onChange(result);
          if (kind === "retry") retryKeys.current.delete(job.id);
        } catch (error) {
          console.warn(
            "Confirmed task action view could not be opened.",
            error,
          );
          setActionErrors((previous) => ({
            ...previous,
            [job.id]:
              "The task was updated, but its page could not be opened. Open it from Tasks and results.",
          }));
        }
      }
    } catch (error) {
      if (!ownsView()) return;
      setActionErrors((previous) => ({
        ...previous,
        [job.id]:
          error instanceof TypeError ||
          (error instanceof DOMException &&
            ["TimeoutError", "AbortError"].includes(error.name))
            ? "The task action could not be confirmed. Try again to continue the same action."
            : error instanceof Error
              ? error.message
              : t("error"),
      }));
    } finally {
      actionPending.current.delete(job.id);
      if (actionView.current.mounted)
        setPendingIds(new Set(actionPending.current));
    }
  }
  if (!job)
    return (
      <section className="panel detail-panel empty-detail">
        <div className="orb">⌬</div>
        <h3>{t("select")}</h3>
        <p className="muted">{t("queueNote")}</p>
      </section>
    );
  const shown = detail?.id === job.id ? detail : null;
  const files =
    shown?.artifacts.filter((file) => isResearchFile(file.name)) ?? [];
  const elapsed = job.started_at
    ? Math.max(
        0,
        Math.round(
          ((job.finished_at ? Date.parse(job.finished_at) : Date.now()) -
            Date.parse(job.started_at)) /
            1000,
        ),
      )
    : 0;
  return (
    <section className="panel detail-panel" aria-label={t("selected")}>
      <header className="task-detail-header">
        <div className="panel-heading">
          <div>
            <h2>{taskLabel}</h2>
          </div>
          <span className={`status ${job.status}`}>{t(job.status)}</span>
        </div>
        <div className="task-actions">
          {terminal(job.status) ? (
            <button
              className="secondary-button"
              onClick={() => void action("retry")}
              disabled={busy}
            >
              {t("retry")}
            </button>
          ) : (
            <button
              className="danger-button"
              onClick={() => void action("cancel")}
              disabled={
                busy ||
                job.status === "cancelling" ||
                (job.status === "running" &&
                  job.request.operation === "harness" &&
                  job.request.tool !== "fold")
              }
              title={
                job.status === "running" &&
                job.request.operation === "harness" &&
                job.request.tool !== "fold"
                  ? language === "zh"
                    ? "原生同步接口派发后不支持取消，请等待结果。"
                    : "This native synchronous tool cannot be cancelled after dispatch."
                  : undefined
              }
            >
              {t("cancel")}
            </button>
          )}
        </div>
      </header>
      {job.request.constraints && (
        <ConstraintReceipt key={job.id} job={job} language={language} />
      )}
      {(error || job.error) && (
        <div className="error-box" role="alert">
          {researchError(error || job.error || "", language === "zh")}
        </div>
      )}
      {failed && (
        <div role="alert" className="error-box">
          {t("connectionError")}
        </div>
      )}
      {job.status === "succeeded" &&
        job.request.operation &&
        job.request.operation !== "predict" && (
          <OperationResults
            key={job.id}
            job={job}
            language={language}
            onDraft={onDraft}
            onCreated={onChange}
          />
        )}
      <details
        className="task-files"
        open={
          !(
            job.status === "succeeded" &&
            job.request.operation &&
            job.request.operation !== "predict"
          )
        }
      >
        <summary>
          {t("results")} · {files.length}
        </summary>
        <div className="artifacts">
          {files.length ? (
            files.map((file) => (
              <a key={file.name} href={artifactUrl(job.id, file.name)} download>
                <span className="file-icon">
                  {file.name.split(".").pop()?.toUpperCase()}
                </span>
                <span className="file-name">
                  {researchFileLabel(file.name, language === "zh")}
                </span>
                <span className="muted">
                  {(file.size / 1024).toFixed(1)} KB
                </span>
                <span aria-hidden="true">↓</span>
              </a>
            ))
          ) : (
            <p className="muted small">
              {language === "zh"
                ? "暂无可下载的结构或表格文件。"
                : "No structure or table files to download yet."}
            </p>
          )}
        </div>
      </details>
      <details className="task-information">
        <summary>{language === "zh" ? "任务信息" : "Task information"}</summary>
        <div className="task-meta">
          <div>
            <span>{t("created")}</span>
            <strong>
              {new Date(job.created_at).toLocaleString(
                language === "zh" ? "zh-CN" : "en-US",
              )}
            </strong>
          </div>
          <div>
            <span>{t("elapsed")}</span>
            <strong>
              {elapsed} {t("seconds")}
            </strong>
          </div>
        </div>
      </details>
    </section>
  );
}
