import { ChoiceCards } from "../guided/ChoiceCards";
import type { Language } from "../types";
import type { ComparisonOptions } from "./types";

export function ComparisonSettings({
  language,
  options,
  onChange,
}: {
  language: Language;
  options: ComparisonOptions;
  onChange(value: ComparisonOptions): void;
}) {
  const zh = language === "zh";
  return (
    <>
      <ChoiceCards
        label={zh ? "比较目的" : "Comparison purpose"}
        value={options.purpose}
        onChange={(purpose) => onChange({ ...options, purpose })}
        options={[
          {
            value: "conformational_comparison",
            title: zh ? "比较功能构象" : "Compare functional conformations",
            note: zh
              ? "比较同一蛋白在不同条件或状态下的结构。"
              : "Compare the protein across conditions or structural states.",
          },
          {
            value: "model_validation",
            title: zh
              ? "与参照结构比较模型"
              : "Compare a model with a reference",
            note: zh
              ? "核对预测或设计模型与指定参照的几何差异。"
              : "Evaluate a predicted or designed model against the chosen reference.",
          },
        ]}
      />
      <label className="field">
        {zh ? "残基如何对应？" : "How should residues be matched?"}
        <select
          value={options.correspondence}
          onChange={(event) =>
            onChange({
              ...options,
              correspondence: event.target
                .value as ComparisonOptions["correspondence"],
            })
          }
        >
          <option value="sequence">
            {zh
              ? "按序列对应（推荐）"
              : "Sequence correspondence (recommended)"}
          </option>
          <option value="author_numbering">
            {zh
              ? "按已核对的原作者残基编号"
              : "Reviewed author residue numbering"}
          </option>
        </select>
      </label>
      <details>
        <summary>
          {zh ? "比较范围与模型" : "Comparison scope and models"}
        </summary>
        <div className="comparison-settings-grid">
          {(["reference_model", "moving_model"] as const).map((key) => (
            <label className="field" key={key}>
              {key === "reference_model"
                ? zh
                  ? "参照模型序号（从 0 开始）"
                  : "Reference model index (from 0)"
                : zh
                  ? "比较模型序号（从 0 开始）"
                  : "Comparison model index (from 0)"}
              <input
                type="number"
                min={0}
                max={99}
                step={1}
                required
                value={options[key]}
                onChange={(event) =>
                  onChange({ ...options, [key]: event.target.valueAsNumber })
                }
              />
            </label>
          ))}
          <label className="field">
            {zh ? "最低序列一致性" : "Minimum sequence identity"}
            <input
              type="number"
              min={0.5}
              max={1}
              step={0.01}
              required
              value={options.minimum_identity}
              onChange={(event) =>
                onChange({
                  ...options,
                  minimum_identity: event.target.valueAsNumber,
                })
              }
            />
          </label>
          <label className="field">
            {zh ? "最低观测残基覆盖率" : "Minimum observed-residue coverage"}
            <input
              type="number"
              min={0.1}
              max={1}
              step={0.01}
              required
              value={options.minimum_coverage}
              onChange={(event) =>
                onChange({
                  ...options,
                  minimum_coverage: event.target.valueAsNumber,
                })
              }
            />
          </label>
        </div>
      </details>
      <p className="field-help">
        {zh
          ? "仅对齐靶蛋白，再在同一坐标系中比较伙伴；不生成缺失残基。"
          : "Fit the target, then compare the partner in that same frame. Missing residues are not generated."}
      </p>
    </>
  );
}
