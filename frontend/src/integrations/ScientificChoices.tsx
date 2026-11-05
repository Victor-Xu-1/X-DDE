import { Hint } from "../guided/Hint";
import { useId } from "react";
import { ScientificChoicesCount } from "./ScientificChoicesCount";
import "./ScientificChoices.css";
import { ExpertChoices } from "./ExpertChoices";
import { validScientificChoices } from "./validation";
import type { Language } from "../types";
import type {
  ScientificPayload,
  ScientificProgram,
  ScientificTask,
} from "./types";

export function ScientificChoices({
  program,
  language,
  payload,
  onChange,
  options,
  onOptions,
  expert,
  onExpert,
}: {
  program: ScientificProgram;
  language: Language;
  payload: ScientificPayload;
  onChange(value: Partial<ScientificPayload>): void;
  options: ScientificTask["options"];
  onOptions(value: ScientificTask["options"]): void;
  expert: boolean;
  onExpert(value: boolean): void;
}) {
  const zh = language === "zh";
  const settingsId = useId();
  const modelSettings =
    ["boltz", "ligandmpnn", "openmm", "apbs"].includes(program) ||
    (program === "boltzgen" &&
      !["antibody", "nanobody"].includes(String(payload.modality))) ||
    (program === "reinvent" && payload.mode === "optimize") ||
    (program === "chemprop" && payload.mode === "train");
  return (
    <div className="scientific-calculation-plan">
      <ScientificChoicesCount
        program={program}
        payload={payload}
        language={language}
        onChange={onChange}
      />
      {program === "apbs" && (
        <div className="inline-fields">
          <label className="field">
            pH
            <select
              value={Number(payload.ph)}
              onChange={(e) => onChange({ ph: Number(e.target.value) })}
            >
              {[6, 7, 7.4, 8].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            {zh ? "盐浓度" : "Salt concentration"}
            <select
              value={Number(payload.salt_molar)}
              onChange={(e) => onChange({ salt_molar: Number(e.target.value) })}
            >
              <option value={0}>0 mM</option>
              <option value={0.05}>50 mM</option>
              <option value={0.15}>150 mM</option>
              <option value={0.3}>300 mM</option>
            </select>
          </label>
        </div>
      )}
      {program === "openmm" && (
        <label className="field">
          {zh ? "优化程度" : "Refinement budget"}
          <select
            value={Number(payload.iterations)}
            onChange={(e) => onChange({ iterations: Number(e.target.value) })}
          >
            <option value={250}>{zh ? "快速检查" : "Quick check"}</option>
            <option value={500}>
              {zh ? "标准优化（推荐）" : "Standard (recommended)"}
            </option>
            <option value={2000}>
              {zh ? "更充分优化" : "Extended refinement"}
            </option>
          </select>
        </label>
      )}
      {program === "ligandmpnn" && (
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={Boolean(payload.pack_sidechains)}
            onChange={(e) => onChange({ pack_sidechains: e.target.checked })}
          />
          {zh
            ? "同时生成侧链三维结构"
            : "Generate packed side-chain structures"}
        </label>
      )}
      {program === "apbs" && (
        <label className="field">
          {zh ? "电势网格精度" : "Potential-grid detail"}
          <select
            value={Number(payload.grid)}
            onChange={(e) => onChange({ grid: Number(e.target.value) })}
          >
            <option value={65}>{zh ? "快速" : "Quick"}</option>
            <option value={97}>{zh ? "标准" : "Standard"}</option>
            <option value={129}>{zh ? "精细" : "Fine"}</option>
          </select>
        </label>
      )}
      <button
        type="button"
        className="text-button scientific-expert-toggle"
        aria-expanded={expert}
        aria-controls={settingsId}
        onClick={() => onExpert(!expert)}
      >
        {zh ? "高级设置" : "Advanced settings"}
        <span aria-hidden="true">{expert ? "−" : "+"}</span>
      </button>
      {expert && (
        <div className="scientific-plan-advanced" id={settingsId}>
          {modelSettings && (
            <section aria-label={zh ? "模型参数" : "Model parameters"}>
              <h3>{zh ? "模型参数" : "Model parameters"}</h3>
              <div className="scientific-plan-grid">
                <ExpertChoices
                  program={program}
                  payload={payload}
                  language={language}
                  onChange={onChange}
                />
              </div>
            </section>
          )}
          <section aria-label={zh ? "计算资源" : "Compute resources"}>
            <h3>{zh ? "计算资源" : "Compute resources"}</h3>
            <div className="scientific-plan-grid">
              <label className="field">
                {zh ? "CPU 核数" : "CPU cores"}
                <input
                  type="number"
                  min={1}
                  max={16}
                  value={options.cpu}
                  onChange={(e) =>
                    onOptions({ ...options, cpu: Number(e.target.value) })
                  }
                />
              </label>
              <label className="field">
                {zh ? "内存上限（MiB）" : "Memory budget (MiB)"}
                <input
                  type="number"
                  min={1024}
                  max={65536}
                  step={1024}
                  value={options.memory_mib}
                  onChange={(e) =>
                    onOptions({
                      ...options,
                      memory_mib: Number(e.target.value),
                    })
                  }
                />
              </label>
              {!["boltzgen", "apbs", "plip"].includes(program) && (
                <label className="field">
                  <span className="scientific-plan-seed-heading">
                    {zh ? "随机种子" : "Random seed"}
                    <Hint label={zh ? "随机种子说明" : "Random seed help"}>
                      {zh
                        ? "可控制的随机步骤使用此数值；不同软件的结果不能保证完全相同。"
                        : "Controls supported random steps; results are not identical across different software."}
                    </Hint>
                  </span>
                  <input
                    type="number"
                    aria-label={zh ? "随机种子" : "Random seed"}
                    min={0}
                    max={2147483647}
                    value={options.seed}
                    onChange={(e) =>
                      onOptions({ ...options, seed: Number(e.target.value) })
                    }
                  />
                </label>
              )}
            </div>
          </section>
        </div>
      )}
      {!validScientificChoices(payload) && (
        <p role="alert">
          {zh
            ? "请检查候选数量、长度范围或专家参数；保留数量不能大于生成数量。"
            : "Check candidate counts, length ranges and expert values. Retained designs cannot exceed generated designs."}
        </p>
      )}
    </div>
  );
}
