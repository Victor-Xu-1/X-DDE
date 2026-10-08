import { useState, type Dispatch, type SetStateAction } from "react";
import { ChoiceCards } from "../guided/ChoiceCards";
import { Hint } from "../guided/Hint";
import type { Language } from "../types";
import type { ScientificTask } from "../integrations/types";
import type { SimulationPayload } from "./types";
export function SimulationConditions({
  fep,
  payload,
  update,
  options,
  setOptions,
  language,
}: {
  fep: boolean;
  payload: SimulationPayload;
  update(change: Partial<SimulationPayload>): void;
  options: ScientificTask["options"];
  setOptions: Dispatch<SetStateAction<ScientificTask["options"]>>;
  language: Language;
}) {
  const zh = language === "zh",
    [expert, setExpert] = useState(false);
  return (
    <>
      {fep && (
        <ChoiceCards
          label={zh ? "计算阶段" : "Calculation stage"}
          value={payload.stage ?? "plan"}
          onChange={(v) => {
            update({ stage: v as "plan" | "calculate" });
            setOptions((o) => ({
              ...o,
              device: v === "plan" ? "cpu" : "cuda",
            }));
          }}
          options={[
            {
              value: "plan",
              label: [
                "先检查变化网络 · 推荐",
                "Inspect the network first · Recommended",
              ],
              note: [
                "显示原子映射，不报告自由能",
                "Inspect atom maps without claiming free energies",
              ],
            },
            {
              value: "calculate",
              label: ["执行 FEP 计算", "Run FEP calculations"],
              note: [
                "两个环境、独立重复与误差分析",
                "Both thermodynamic legs, independent repeats and uncertainty",
              ],
            },
          ].map((c) => ({
            value: c.value,
            title: c.label[zh ? 0 : 1],
            note: c.note[zh ? 0 : 1],
          }))}
        />
      )}
      <div className="simulation-condition-row">
        <label>
          {zh ? "温度" : "Temperature"}
          <select
            value={payload.temperature_kelvin}
            onChange={(e) =>
              update({ temperature_kelvin: Number(e.target.value) })
            }
          >
            {[298.15, 300, 310].map((t) => (
              <option key={t} value={t}>
                {t} K
              </option>
            ))}
          </select>
        </label>
        <label>
          {zh ? "独立重复" : "Independent repeats"}
          <select
            value={payload.repeats}
            onChange={(e) => update({ repeats: Number(e.target.value) })}
          >
            {[1, 3].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <Hint label={zh ? "独立重复说明" : "About independent repeats"}>
            {zh
              ? "独立重复帮助判断结果是否稳健。单次短模拟不能证明收敛。"
              : "Independent repeats help assess robustness. One short simulation does not establish convergence."}
          </Hint>
        </label>
        <label>
          {zh ? "计算设备" : "Compute device"}
          <select
            value={options.device}
            onChange={(e) =>
              setOptions((o) => ({
                ...o,
                device: e.target.value as "cpu" | "cuda",
              }))
            }
          >
            <option value="cuda">GPU · CUDA</option>
            <option value="cpu">CPU</option>
          </select>
        </label>
      </div>
      <label className="check-row">
        <input
          type="checkbox"
          checked={expert}
          onChange={(e) => setExpert(e.target.checked)}
        />
        {zh ? "专家微调" : "Expert adjustments"}
      </label>
      {expert && (
        <div className="simulation-condition-row">
          <label>
            {zh ? "生产采样（ns）" : "Production sampling (ns)"}
            <input
              type="number"
              min={fep ? 0.02 : 0.002}
              max={fep ? 50 : 500}
              step="any"
              value={payload.production_ns}
              onChange={(e) =>
                update({ production_ns: Number(e.target.value) })
              }
            />
          </label>
          <label>
            {zh ? "平衡采样（ns）" : "Equilibration (ns)"}
            <input
              type="number"
              min={fep ? 0.02 : 0.002}
              max={5}
              step="any"
              value={payload.equilibration_ns}
              onChange={(e) =>
                update({ equilibration_ns: Number(e.target.value) })
              }
            />
          </label>
          {fep && (
            <label>
              {zh ? "变化网络" : "Perturbation network"}
              <select
                value={String(payload.network)}
                onChange={(e) => update({ network: e.target.value })}
              >
                <option value="redundant">
                  {zh ? "包含冗余连接" : "Include redundant connections"}
                </option>
                <option value="minimal">
                  {zh ? "最小连接网络" : "Minimal connected network"}
                </option>
              </select>
            </label>
          )}
        </div>
      )}
    </>
  );
}
