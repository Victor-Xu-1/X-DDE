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
  const method = methodChoices
    .find((choice) => choice.id === "complex_structure")
    ?.options.find((option) => option.id === predictionMethodId(job.request));
  return (
    <header className="prediction-result-heading">
      <div className="prediction-result-summary">
        {onHistory && (
          <button
            type="button"
            className="secondary-button prediction-result-back"
            onClick={onHistory}
          >
            <ArrowLeftOutlined aria-hidden="true" />
            {zh ? "预测记录" : "Predictions"}
          </button>
        )}
        <h2 className="result-task-name">{title}</h2>
        <div className="prediction-result-meta">
          <span className={`status ${job.status}`}>{t(job.status)}</span>
          {Number.isFinite(date.getTime()) && (
            <span>
              {zh ? "提交于" : "Submitted"}{" "}
              <time dateTime={job.created_at}>
                {date.toLocaleString(zh ? "zh-CN" : "en", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </time>
            </span>
          )}
        </div>
        {method && (
          <p className="prediction-result-method">
            {zh ? "预测模型" : "Prediction model"}{" "}
            <strong>{method.label}</strong>
          </p>
        )}
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
