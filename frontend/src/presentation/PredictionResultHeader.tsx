import { ArrowLeftOutlined } from "@ant-design/icons";
import type { ReactNode } from "react";
import { translator } from "../i18n";
import { isPrediction, type TaskRequest } from "../operations/types";
import { methodChoices } from "../studio/method-choices";
import { terminal, type Job, type Language } from "../types";
import { HistoricalPredictionInput } from "./HistoricalPredictionInput";
import { PredictionArchiveDownload } from "./PredictionArchiveDownload";
import "./prediction-result-header.css";

export function predictionMethodId(request: TaskRequest) {
  if (isPrediction(request)) return "predict";
  if (request.operation === "boltz_predict") return "boltz.predict";
  if (request.operation === "mol1_predict") return "mol1.predict";
  return undefined;
}

/** Describe the recorded method, independent of the new-task model selection. */
export function predictionMethodLabel(request: TaskRequest) {
  if (isPrediction(request) && request.parameters.model === "abag")
    return "OpenDDE ABAG";
  return methodChoices
    .find((choice) => choice.id === "complex_structure")
    ?.options.find((option) => option.id === predictionMethodId(request))
    ?.label;
}

export function PredictionResultHeader({
  job,
  title,
  language,
  onHistory,
  children,
}: {
  job: Job;
  title: string;
  language: Language;
  onHistory?(): void;
  children?: ReactNode;
}) {
  const zh = language === "zh";
  const t = translator(language);
  const date = new Date(job.created_at);
  const submitted = Number.isFinite(date.getTime())
    ? date.toLocaleString(zh ? "zh-CN" : "en", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : null;
  const request = job.request;
  const model = predictionMethodLabel(request);
  return (
    <header className="prediction-result-heading">
      <div className="prediction-result-summary">
        <div className="prediction-result-title">
          {onHistory && (
            <button
              type="button"
              className="secondary-button prediction-result-back"
              aria-label={zh ? "预测记录" : "Predictions"}
              title={zh ? "预测记录" : "Predictions"}
              onClick={onHistory}
            >
              <ArrowLeftOutlined aria-hidden="true" />
              <span>{zh ? "预测记录" : "Predictions"}</span>
            </button>
          )}
          <h2 className="result-task-name">{title}</h2>
        </div>
        <div className="prediction-result-meta">
          <span
            className={`status ${job.status}`}
            title={submitted ? (zh ? "提交于 " : "Submitted ") + submitted : undefined}
          >
            {t(job.status)}
          </span>
          {submitted && (
            <span className="prediction-result-submission">
              {zh ? "提交于" : "Submitted"}{" "}
              <time dateTime={job.created_at}>{submitted}</time>
            </span>
          )}
          {model && (
            <span className="prediction-result-method">
              {zh ? "预测模型" : "Prediction model"} <strong>{model}</strong>
            </span>
          )}
        </div>
      </div>
      {(terminal(job.status) || children) && (
        <div className="prediction-result-actions" key={job.id}>
          {terminal(job.status) && (
            <HistoricalPredictionInput
              jobId={job.id}
              label={title}
              language={language}
            />
          )}
          {job.status === "succeeded" && (
            <PredictionArchiveDownload job={job.id} language={language} />
          )}
          {children}
        </div>
      )}
    </header>
  );
}
