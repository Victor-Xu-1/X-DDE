import { ChoiceCards } from "../guided/ChoiceCards";
import { Hint } from "../guided/Hint";
import type { Language } from "../types";

export interface ShortlistSettings {
  shortlist: "ranked" | "diversity" | "scaffold";
  candidate_policy: "all" | "lead_like";
  structural_alerts: "off" | "warn" | "exclude";
}
export function ShortlistChoices({
  value,
  onChange,
  language,
}: {
  value: ShortlistSettings;
  onChange(value: ShortlistSettings): void;
  language: Language;
}) {
  const zh = language === "zh";
  return (
    <>
      <ChoiceCards
        label={
          zh
            ? "怎样选择后续三维候选？"
            : "How should 3D candidates be shortlisted?"
        }
        value={value.shortlist}
        onChange={(shortlist) => onChange({ ...value, shortlist })}
        options={[
          {
            value: "ranked",
            title: zh ? "按检索排名" : "Retrieval rank",
            note: zh
              ? "优先选择分数最高的分子"
              : "Keep the highest-ranked molecules",
          },
          {
            value: "diversity",
            title: zh ? "兼顾结构多样性" : "Structural diversity",
            note: zh
              ? "从已检索候选中挑选不同结构"
              : "Select diverse structures among retrieved candidates",
          },
          {
            value: "scaffold",
            title: zh ? "每种骨架一个代表" : "One per scaffold",
            note: zh
              ? "避免被同系列分子占满"
              : "Avoid a shortlist dominated by one series",
          },
        ]}
      />
      <details className="dataset-expert">
        <summary>{zh ? "分子性质与警示" : "Properties and alerts"}</summary>
        <div className="dataset-field-grid">
          <label className="field">
            {zh ? "性质范围" : "Property range"}
            <select
              value={value.candidate_policy}
              onChange={(e) =>
                onChange({
                  ...value,
                  candidate_policy: e.target
                    .value as ShortlistSettings["candidate_policy"],
                })
              }
            >
              <option value="all">
                {zh ? "保留所有化学类型" : "Keep all chemical types"}
              </option>
              <option value="lead_like">
                {zh
                  ? "早期先导：MW 150–500，LogP −1–5"
                  : "Early leads: MW 150–500, LogP −1–5"}
              </option>
            </select>
          </label>
          <label className="field">
            {zh ? "PAINS / Brenk 结构规则" : "PAINS / Brenk rules"}
            <select
              value={value.structural_alerts}
              onChange={(e) =>
                onChange({
                  ...value,
                  structural_alerts: e.target
                    .value as ShortlistSettings["structural_alerts"],
                })
              }
            >
              <option value="off">{zh ? "不应用规则" : "Do not apply"}</option>
              <option value="warn">
                {zh ? "记录警示，仍保留" : "Record alerts and retain"}
              </option>
              <option value="exclude">
                {zh ? "排除匹配的候选" : "Exclude matching candidates"}
              </option>
            </select>
          </label>
        </div>
        <Hint label={zh ? "筛选依据" : "Selection scope"}>
          {zh
            ? "这些选项只整理本次检索前列的分子。原始排名与未选原因保留在下载表格中；结构规则不等于实测毒性或活性。"
            : "These rules curate the retrieved top-ranked set. The download preserves original ranks and selection reasons. Structural alerts are not measured toxicity or activity."}
        </Hint>
      </details>
    </>
  );
}
