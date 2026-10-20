import type { DELFormState } from "./useDELForm";
import { DELExecutionSettings } from "./DELExecutionSettings";

export function DELReviewQuestion({ model }: { model: DELFormState }) {
  const {
    zh,
    name,
    setName,
    definition,
    asset,
    source,
    definitions,
    mode,
    samples,
    comparisons,
    readLanes,
  } = model;
  return (
    <div className="dataset-question-content">
      <label className="field">
        {zh ? "任务名称" : "Study name"}
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={definition.label[zh ? 0 : 1]}
          maxLength={70}
        />
      </label>
      <div className="dataset-review-strip">
        <div>
          <span>{zh ? "研究材料" : "Study material"}</span>
          <strong>
            {mode === "decode"
              ? `${readLanes.length} ${zh ? "组测序文件" : "read groups"}`
              : (asset?.name ?? source[0]?.name ?? definitions[0]?.name)}
          </strong>
        </div>
        {mode === "analyze" && (
          <>
            <div>
              <span>{zh ? "样本" : "Samples"}</span>
              <strong>{samples.length}</strong>
            </div>
            <div>
              <span>{zh ? "比较" : "Comparisons"}</span>
              <strong>{comparisons.length}</strong>
            </div>
          </>
        )}
        {mode === "candidates" && (
          <>
            <div>
              <span>{zh ? "选择成员" : "Selected members"}</span>
              <strong>{model.selected.length}</strong>
            </div>
            <div>
              <span>{zh ? "结构处理" : "Structure treatment"}</span>
              <strong>
                {model.attachmentPolicy === "cap_hydrogen"
                  ? zh
                    ? "去除连接标记，以氢封端"
                    : "Cap terminal attachment with hydrogen"
                  : zh
                    ? "保留原始结构"
                    : "Retain supplied chemistry"}
              </strong>
            </div>
            <div>
              <span>{zh ? "比较" : "Comparison"}</span>
              <strong>
                {model.availableComparisons
                  .filter((item) => item.id === model.comparison)
                  .map((item) => `${item.selection} / ${item.reference}`)
                  .join("") || (zh ? "未选择" : "Not selected")}
              </strong>
            </div>
          </>
        )}
      </div>
      {mode === "candidates" && (
        <details className="dataset-method-note">
          <summary>{zh ? "查看所选成员" : "Review selected members"}</summary>
          <ul>
            {model.selected.map((id) => (
              <li key={id}>{id}</li>
            ))}
          </ul>
        </details>
      )}
      {mode === "analyze" && (
        <p className="field-help">
          {zh ? "优先条件：靶点计数 ≥ " : "Prioritization: target counts ≥ "}
          {model.minimum}
          {" · "}
          {zh ? "富集 ≥ " : "enrichment ≥ "}
          {model.enrichment}×{" · "}
          {zh ? "支持样本 ≥ " : "supporting samples ≥ "}
          {model.minimumSupport}
        </p>
      )}
      <DELExecutionSettings
        value={model.execution}
        onChange={model.setExecution}
        zh={zh}
      />
    </div>
  );
}
