import type { Language } from "../types";
import type { ScientificTask } from "../integrations/types";
import type { SimulationPayload } from "./types";
import { SimulationInputs } from "./SimulationInputs";
export function SimulationReview({
  fep,
  program,
  payload,
  inputs,
  options,
  name,
  setName,
  language,
}: {
  fep: boolean;
  program: string;
  payload: SimulationPayload;
  inputs: ScientificTask["inputs"];
  options: ScientificTask["options"];
  name: string;
  setName(value: string): void;
  language: Language;
}) {
  const zh = language === "zh";
  const planning = fep && payload.stage !== "calculate";
  const rows = [
    {
      label: zh ? "计算引擎" : "Backend",
      value:
        program === "gromacs"
          ? "GROMACS 2026.3"
          : fep
            ? "OpenFE 1.12.0"
            : "OpenMM 8.6.1",
    },
    {
      label: zh ? "研究对象" : "Study system",
      value: fep
        ? `${payload.records?.length ?? 0} ${zh ? "个分子" : (payload.records?.length ?? 0) === 1 ? "ligand" : "ligands"}`
        : inputs.some((input) => input.role === "ligand")
          ? zh
            ? "蛋白与结合小分子"
            : "Protein with a bound ligand"
          : zh
            ? "蛋白或生物药"
            : "Protein or biologic",
    },
    ...(planning
      ? [
          {
            label: zh ? "计算阶段" : "Calculation stage",
            value: zh
              ? "变化网络规划 · 不进行模拟"
              : "Network planning · No simulation",
          },
        ]
      : [
          {
            label: zh ? "生产采样" : "Production sampling",
            value: `${payload.production_ns} ns × ${payload.repeats} ${zh ? "次重复" : payload.repeats === 1 ? "repeat" : "repeats"}${fep ? ` × ${payload.lambda_windows} λ × 2 ${zh ? "环境 / 每条变化" : "legs / edge"}` : ""}`,
          },
          {
            label: zh ? "平衡与温度" : "Equilibration and temperature",
            value: `${payload.equilibration_ns} ns · ${payload.temperature_kelvin} K`,
          },
        ]),
    ...(fep
      ? [
          {
            label: zh ? "原子映射" : "Atom mapping",
            value: payload.atom_mapper === "kartograf" ? "Kartograf" : "LoMap",
          },
          {
            label: zh ? "变化网络" : "Perturbation network",
            value:
              payload.network === "minimal"
                ? zh
                  ? "最小连接网络"
                  : "Minimal connected network"
                : zh
                  ? "包含冗余连接"
                  : "Include redundant connections",
          },
        ]
      : []),
    {
      label: zh ? "计算设备" : "Compute device",
      value: options.device === "cuda" ? "GPU · CUDA" : "CPU",
    },
    {
      label: zh ? "结果" : "Output",
      value: planning
        ? zh
          ? "变化网络与原子映射 · 无自由能结果"
          : "Network and atom maps · No free-energy estimates"
        : fep
          ? "ΔΔG ± uncertainty · MBAR"
          : "3D · RMSD · RMSF · contacts",
    },
  ];
  return (
    <div className="simulation-review">
      <label className="simulation-review-name">
        <span>{zh ? "任务名称（可选）" : "Task name (optional)"}</span>
        <input
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <div className="simulation-review-grid">
        <dl
          className="simulation-review-details"
          aria-label={zh ? "研究设置" : "Study settings"}
        >
          {rows.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
        <SimulationInputs inputs={inputs} language={language} />
      </div>
    </div>
  );
}
