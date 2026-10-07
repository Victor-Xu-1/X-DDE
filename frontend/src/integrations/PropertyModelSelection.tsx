import { useEffect, useState } from "react";
import { request } from "../api";
import { researchError } from "../presentation/research-content";
import type { Language } from "../types";
import type { PropertyModel, ScientificPayload } from "./types";

export function PropertyModelSelection({
  language,
  payload,
  onChange,
  onTrainModel,
}: {
  language: Language;
  payload: ScientificPayload;
  onChange(value: Partial<ScientificPayload>): void;
  onTrainModel?(): void;
}) {
  const zh = language === "zh",
    [models, setModels] = useState<PropertyModel[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setModels([]);
    setError("");
    void request<{ models: PropertyModel[] }>("/scientific/property-models", {
      signal: controller.signal,
    })
      .then((result) => {
        if (!controller.signal.aborted) setModels(result.models);
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(String(failure));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [attempt]);
  return (
    <>
      <label className="field">
        {zh ? "选择已训练的研究模型" : "Choose a trained research model"}
        <select
          disabled={loading || !models.length}
          value={String(payload.model_job ?? "")}
          onChange={(event) => {
            const model = models.find(
              (item) => item.job_id === event.target.value,
            );
            onChange({
              model_job: model?.job_id ?? null,
              model_sha256: model?.sha256 ?? null,
              ...(model
                ? {
                    activity_property: model.activity_property,
                    activity_unit: model.activity_unit,
                  }
                : {}),
            });
          }}
        >
          <option value="">{zh ? "选择模型" : "Choose model"}</option>
          {models.map((model) => (
            <option key={model.job_id} value={model.job_id}>
              {model.name} · {model.activity_property} ({model.activity_unit})
            </option>
          ))}
        </select>
      </label>
      {loading ? (
        <p role="status">
          {zh ? "正在读取研究模型…" : "Loading research models…"}
        </p>
      ) : error ? (
        <p role="alert" className="error-box">
          {researchError(error, zh)}{" "}
          <button
            type="button"
            onClick={() => setAttempt((value) => value + 1)}
          >
            {zh ? "重新读取" : "Retry"}
          </button>
        </p>
      ) : !models.length ? (
        <div className="research-prerequisite" role="status">
          <p>
            {zh
              ? "还没有完成训练的模型。请先用实验数据建立并验证模型。"
              : "No trained model is available. Train and validate one using experimental data first."}
          </p>
          {onTrainModel && (
            <button
              type="button"
              className="secondary-button"
              onClick={onTrainModel}
            >
              {zh ? "建立实验数据性质模型" : "Train a property model"}
            </button>
          )}
        </div>
      ) : null}
    </>
  );
}
