import type { DELFormState } from "./useDELForm";

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
            {asset?.name ?? source[0]?.name ?? definitions[0]?.name}
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
      </div>
    </div>
  );
}
