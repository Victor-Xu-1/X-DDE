import { useEffect, useState } from "react";
import { request } from "../api";
import type { Language } from "../types";
import type { PropertyModel, ScientificPayload } from "./types";
import { propertyModelEvidence } from "./property-model-evidence";
import "./property-model-evidence.css";

export function PropertyModelEvidence({
  model,
  language,
}: {
  model: PropertyModel;
  language: Language;
}) {
  const zh = language === "zh";
  const evidence = propertyModelEvidence(model.validation_metrics ?? []);
  return (
    <section
      className="property-model-context"
      aria-label={
        zh ? "所选模型的训练证据" : "Selected model training evidence"
      }
    >
      <p>
        <strong>{model.name}</strong> · {model.activity_property} (
        {model.activity_unit})
      </p>
      <p
        className={evidence.status === "insufficient" ? "notice" : "field-help"}
        role="status"
      >
        {evidence.status === "insufficient"
          ? zh
            ? "测试表现不足（R² ≤ 0）。该模型尚不能提供可靠预测，输出仅供探索性研究。"
            : "Insufficient held-out performance (R² ≤ 0). Reliable prediction is not established; outputs are exploratory."
          : evidence.status === "reported"
            ? zh
              ? "已报告保留测试集结果；用于当前分子前仍需核对模型适用范围。"
              : "Held-out results are reported; review applicability before using the model for these molecules."
            : zh
              ? "此模型没有可核对的保留测试集指标，预测可靠性尚未建立。"
              : "No verifiable held-out metrics are recorded for this model; prediction reliability is not established."}
      </p>
      <dl>
        {evidence.r2 && (
          <div>
            <dt>R²</dt>
            <dd>{evidence.r2.value.toPrecision(4)}</dd>
          </div>
        )}
        {evidence.rmse && (
          <div>
            <dt>RMSE</dt>
            <dd>
              {evidence.rmse.value.toPrecision(4)} {evidence.rmse.unit}
            </dd>
          </div>
        )}
        {model.validation_records !== undefined &&
          model.validation_records > 0 && (
            <div>
              <dt>{zh ? "测试分子" : "Test molecules"}</dt>
              <dd>{model.validation_records}</dd>
            </div>
          )}
      </dl>
      <a
        href={`#task=${encodeURIComponent(model.job_id)}`}
        target="_blank"
        rel="noopener noreferrer"
        title={
          zh
            ? "在新标签中打开，保留当前任务填写内容"
            : "Open in a new tab and keep this task's inputs"
        }
      >
        {zh ? "查看原始训练结果" : "Review original training results"}
      </a>
    </section>
  );
}

interface EvidenceState {
  key: string;
  model: PropertyModel | null;
  error: boolean;
}

/** Resolve the exact version even when its job is older than the bounded model list. */
export function BoundPropertyModelEvidence({
  payload,
  language,
}: {
  payload: ScientificPayload;
  language: Language;
}) {
  const zh = language === "zh";
  const job = typeof payload.model_job === "string" ? payload.model_job : "";
  const digest =
    typeof payload.model_sha256 === "string" ? payload.model_sha256 : "";
  const endpoint = payload.activity_property;
  const unit = payload.activity_unit;
  const key = JSON.stringify([job, digest, endpoint, unit]);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<EvidenceState>({
    key,
    model: null,
    error: false,
  });
  const visible =
    state.key === key ? state : { key, model: null, error: false };
  useEffect(() => {
    const controller = new AbortController();
    setState({ key, model: null, error: false });
    if (!job || !digest) return () => controller.abort();
    void request<PropertyModel>(
      `/scientific/property-models/${encodeURIComponent(job)}`,
      { signal: controller.signal },
    )
      .then((model) => {
        if (controller.signal.aborted) return;
        if (
          model.job_id !== job ||
          model.sha256 !== digest ||
          model.activity_property !== endpoint ||
          model.activity_unit !== unit
        ) {
          setState({ key, model: null, error: true });
          return;
        }
        setState({ key, model, error: false });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setState({ key, model: null, error: true });
      });
    return () => controller.abort();
  }, [key, job, digest, endpoint, unit, attempt]);
  if (!job || !digest)
    return (
      <p role="status" className="notice">
        {zh
          ? "尚未记录此任务所用研究模型的确切版本。"
          : "No exact research-model version is recorded for this task."}
      </p>
    );
  if (visible.error)
    return (
      <p role="alert" className="notice">
        {zh
          ? "暂时无法核对此模型的原始训练证据。"
          : "The original training evidence for this model could not be verified."}{" "}
        <button
          type="button"
          className="text-button"
          onClick={() => setAttempt((value) => value + 1)}
        >
          {zh ? "重新读取" : "Retry"}
        </button>
      </p>
    );
  return visible.model ? (
    <PropertyModelEvidence model={visible.model} language={language} />
  ) : (
    <p role="status">
      {zh ? "正在核对模型训练证据…" : "Checking model training evidence…"}
    </p>
  );
}
