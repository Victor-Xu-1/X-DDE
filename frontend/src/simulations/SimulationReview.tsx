import type { Language } from "../types";
import type { ScientificTask } from "../integrations/types";
import type { SimulationPayload } from "./types";
export function SimulationReview({
  fep,
  payload,
  inputs,
  name,
  setName,
  language,
}: {
  fep: boolean;
  payload: SimulationPayload;
  inputs: ScientificTask["inputs"];
  name: string;
  setName(value: string): void;
  language: Language;
}) {
  const zh = language === "zh";
  return (
    <>
      <label>
        {zh ? "任务名称（可选）" : "Task name (optional)"}
        <input
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <table className="compact-table">
        <tbody>
          <tr>
            <th>{zh ? "计算引擎" : "Backend"}</th>
            <td>{fep ? "OpenFE 1.12.0" : "OpenMM 8.6.1"}</td>
          </tr>
          <tr>
            <th>{zh ? "材料" : "Inputs"}</th>
            <td>
              {inputs.length} {zh ? "份文件" : "files"}
              {fep
                ? ` · ${payload.records?.length} ${zh ? "个分子" : "ligands"}`
                : ""}
            </td>
          </tr>
          <tr>
            <th>{zh ? "采样" : "Sampling"}</th>
            <td>
              {payload.production_ns} ns × {payload.repeats}{" "}
              {zh ? "次重复" : "repeats"}
              {fep
                ? ` × ${payload.lambda_windows} λ × 2 ${zh ? "环境 / 每条变化" : "legs / edge"}`
                : ""}
            </td>
          </tr>
          <tr>
            <th>{zh ? "结果" : "Output"}</th>
            <td>
              {fep && payload.stage === "plan"
                ? zh
                  ? "变化网络与原子映射"
                  : "Perturbation network and atom maps"
                : fep
                  ? "ΔΔG ± uncertainty · MBAR"
                  : "3D · RMSD · RMSF · contacts"}
            </td>
          </tr>
        </tbody>
      </table>
    </>
  );
}
