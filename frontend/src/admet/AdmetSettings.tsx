import { ChoiceCards } from "../guided/ChoiceCards";
import { Hint } from "../guided/Hint";
import type { Language } from "../types";
import type { AdmetOptions, AdmetView } from "./types";

export function AdmetSettings({
  language,
  options,
  configure,
  name,
  onName,
}: {
  language: Language;
  options: AdmetOptions;
  configure(value: Partial<AdmetOptions>): void;
  name: string;
  onName(value: string): void;
}) {
  const zh = language === "zh";
  return (
    <>
      <ChoiceCards<AdmetView>
        label={zh ? "先看哪些结果？" : "Which results should appear first?"}
        value={options.view}
        onChange={(view) => configure({ view })}
        options={[
          {
            value: "all",
            title: zh ? "全部性质（推荐）" : "All properties (recommended)",
            note: zh
              ? "吸收、分布、代谢、排泄与早期安全性。"
              : "Absorption, distribution, metabolism, excretion and early safety.",
          },
          {
            value: "adme",
            title: zh ? "吸收与体内过程" : "ADME properties",
            note: zh
              ? "先看溶解度、通透性、代谢与清除等性质。"
              : "Focus on solubility, permeability, metabolism and clearance.",
          },
          {
            value: "safety",
            title: zh ? "早期安全性" : "Early safety",
            note: zh
              ? "先看毒性相关模型终点。"
              : "Focus on toxicity-related model endpoints.",
          },
        ]}
      />
      <Hint
        label={
          zh
            ? "预测值和计算性质有什么区别？"
            : "How do predictions differ from descriptors?"
        }
      >
        {zh
          ? "本任务使用 ADMET-AI 2.0.1 的原始模型预测，始终计算全部 41 个终点；上方选项只改变结果分组。MW、QED 等描述符请用性质计算。预测不等于实测，也不提供新化合物的可靠性百分比。"
          : "ADMET-AI 2.0.1 predicts all 41 native endpoints; the choice only changes result grouping. Use descriptor calculation for MW/QED. Predictions are not measurements or reliability percentages for new molecules."}
      </Hint>
      <details>
        <summary>{zh ? "专家微调" : "Expert settings"}</summary>
        <label className="field">
          CPU
          <select
            value={options.cpu}
            onChange={(e) => configure({ cpu: Number(e.target.value) })}
          >
            <option value={1}>1</option>
            <option value={2}>2</option>
          </select>
        </label>
        <label className="field">
          {zh ? "内存上限" : "Memory limit"}
          <select
            value={options.memory_mib}
            onChange={(e) => configure({ memory_mib: Number(e.target.value) })}
          >
            {[2048, 4096, 8192].map((v) => (
              <option key={v} value={v}>
                {v / 1024} GiB
              </option>
            ))}
          </select>
        </label>
      </details>
      <label className="field">
        {zh ? "任务名称（可选）" : "Task name (optional)"}
        <input
          value={name}
          maxLength={80}
          onChange={(e) => onName(e.target.value)}
        />
      </label>
    </>
  );
}
