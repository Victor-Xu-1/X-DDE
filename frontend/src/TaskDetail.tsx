import { useRef, useState } from "react";
import { api, artifactUrl } from "./api";
import { translator } from "./i18n";
import { terminal, type Detail, type Job, type Language } from "./types";

interface Props {
  job: Job | null;
  detail: Detail | null;
  failed: boolean;
  language: Language;
  onChange(job: Job): void;
}
export function TaskDetail({ job, detail, failed, language, onChange }: Props) {
  const t = translator(language);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const retryKeys = useRef(new Map<string, string>());
  async function action(kind: "cancel" | "retry") {
    if (!job) return;
    if (kind === "cancel" && !window.confirm(t("cancelConfirm"))) return;
    setBusy(true);
    setError("");
    try {
      const key = retryKeys.current.get(job.id) ?? crypto.randomUUID();
      retryKeys.current.set(job.id, key);
      const result =
        kind === "cancel"
          ? await api.cancel(job.id)
          : await api.retry(job.id, key);
      if (kind === "retry") retryKeys.current.delete(job.id);
      onChange(result);
    } catch (error) {
      setError(error instanceof Error ? error.message : t("error"));
    } finally {
      setBusy(false);
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
      <div className="panel-heading">
        <div>
          <span className="eyebrow">03 / INSPECT</span>
          <h2>{job.request.name}</h2>
        </div>
        <span className={`status ${job.status}`}>{t(job.status)}</span>
      </div>
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
      <details className="input-summary">
        <summary>
          {t("parameters")} · {job.request.parameters.dtype.toUpperCase()} ·{" "}
          {job.request.parameters.samples} {t("samples")}
        </summary>
        <p className="muted small">
          {t("taskId")}: {job.id}
        </p>
        <pre>{JSON.stringify(job.request, null, 2)}</pre>
      </details>
      <div className="task-actions">
        <a
          className="secondary-button"
          href={`/api/jobs/${job.id}/input`}
          download
        >
          {t("inputJson")} ↓
        </a>
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
            disabled={busy || job.status === "cancelling"}
          >
            {t("cancel")}
          </button>
        )}
      </div>
      {(error || job.error) && (
        <div className="error-box" role="alert">
          {error || job.error}
        </div>
      )}
      {failed && (
        <div role="alert" className="error-box">
          {t("connectionError")}
        </div>
      )}
      <div className="section-heading">
        <h3>{t("results")}</h3>
        <span className="count">{shown?.artifacts.length ?? 0}</span>
      </div>
      <div className="artifacts">
        {shown?.artifacts.length ? (
          shown.artifacts.map((file) => (
            <a key={file.name} href={artifactUrl(job.id, file.name)} download>
              <span className="file-icon">
                {file.name.split(".").pop()?.toUpperCase()}
              </span>
              <span className="file-name">{file.name}</span>
              <span className="muted">{(file.size / 1024).toFixed(1)} KB</span>
              <span aria-hidden="true">↓</span>
            </a>
          ))
        ) : (
          <p className="muted small">{t("noResults")}</p>
        )}
      </div>
      <div className="section-heading log-heading">
        <h3>{t("logs")}</h3>
        {job.status === "running" && (
          <span className="live-dot" aria-label={t("running")} />
        )}
      </div>
      {shown?.log.truncated && <p className="muted small">{t("logTail")}</p>}
      <pre className="terminal" tabIndex={0} aria-label={t("logs")}>
        {shown?.log.text || t("noLogs")}
      </pre>
    </section>
  );
}
