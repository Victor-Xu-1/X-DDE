import { useState } from "react";
import { ReferencePicker } from "../diffsbdd/ReferencePicker";
import { LibraryInput } from "../integrations/LibraryInput";
import { ChoiceCards } from "../guided/ChoiceCards";
import { Hint } from "../guided/Hint";
import { Questionnaire } from "../guided/Questionnaire";
import { useTaskReadiness } from "../guided/useTaskReadiness";
import { useTaskSubmit } from "../operations/useTaskSubmit";
import { useExampleReference, useExampleTask } from "../examples/context";
import type { MoleculeRef } from "../research/types";
import type { ScientificTask } from "../integrations/types";
import type { Job, Language } from "../types";
import { FepLigandSelection } from "./FepLigandSelection";
import { simulationDefaults } from "./generated";
import {
  simulationForms,
  type SimulationFormId,
  type SimulationPayload,
} from "./types";
import "./simulations.css";

export function SimulationForm({
  form,
  language,
  onCreated,
}: {
  form: SimulationFormId;
  language: Language;
  onCreated(job: Job): void;
}) {
  const zh = language === "zh",
    fep = form === "openfe.rbfe",
    [program, operation] = simulationForms[form];
  const preset = useExampleTask(operation),
    exampleProtein = useExampleReference("protein_only"),
    exampleLigand = useExampleReference(fep ? "tyk2_ligands" : "jq1");
  const [structure, setStructure] = useState<MoleculeRef | null>(
    preset?.inputs.find((i) => i.role === "structure")?.source ??
      exampleProtein,
  );
  const [ligand, setLigand] = useState<MoleculeRef | null>(
    preset?.inputs.find((i) => ["ligand", "library"].includes(i.role))
      ?.source ?? (fep ? exampleLigand : null),
  );
  const [bound, setBound] = useState(Boolean(!fep && ligand));
  const [payload, setPayload] = useState<SimulationPayload>(
    () =>
      ({
        ...structuredClone(
          fep ? simulationDefaults.freeEnergy : simulationDefaults.dynamics,
        ),
        ...(fep ? { records: [] } : {}),
        ...preset?.payload,
      }) as SimulationPayload,
  );
  const [expert, setExpert] = useState(false),
    [name, setName] = useState("");
  const [options, setOptions] = useState<ScientificTask["options"]>({
    device: fep ? "cpu" : "cuda",
    cpu: 2,
    memory_mib: 8192,
    seed: 101,
  });
  const availability = useTaskReadiness(form),
    run = useTaskSubmit(onCreated);
  const update = (change: Partial<SimulationPayload>) =>
    setPayload((p) => ({ ...p, ...change }));
  const inputs: ScientificTask["inputs"] = [
    ...(structure ? [{ role: "structure" as const, source: structure }] : []),
    ...(ligand && (fep || bound)
      ? [
          {
            role: fep ? ("library" as const) : ("ligand" as const),
            source: ligand,
          },
        ]
      : []),
  ];
  const inputValid = Boolean(structure && (!(fep || bound) || ligand));
  const selectionValid =
    !fep ||
    Boolean(
      payload.records &&
      payload.records.length >= 2 &&
      payload.records.length <= 12,
    );
  const settingsValid =
    [
      payload.production_ns,
      payload.equilibration_ns,
      payload.temperature_kelvin,
      payload.repeats,
    ].every(Number.isFinite) &&
    payload.production_ns >= (fep ? 0.02 : 0.002) &&
    payload.production_ns <= (fep ? 50 : 500) &&
    payload.equilibration_ns >= (fep ? 0.02 : 0.002) &&
    payload.equilibration_ns <= 5 &&
    payload.temperature_kelvin >= 273.15 &&
    payload.temperature_kelvin <= 330 &&
    Number.isInteger(payload.repeats) &&
    payload.repeats >= 1 &&
    payload.repeats <= (fep ? 6 : 3);
  return (
    <Questionnaire
      language={language}
      busy={run.busy}
      error={availability.error || run.error}
      ready={availability.ready}
      unavailable={
        zh
          ? "请在安装与运行中部署所选计算环境。"
          : "Install the selected environment in Installation and runtime."
      }
      submitLabel={
        fep && payload.stage === "plan"
          ? zh
            ? "创建分子变化网络"
            : "Plan molecular network"
          : zh
            ? "提交模拟"
            : "Submit simulation"
      }
      onSubmit={() =>
        run.submit({
          operation,
          name:
            name.trim() ||
            (fep ? "FEP binding free energy" : "Molecular dynamics"),
          inputs,
          scientific_inputs: inputs.map((i) => i.source),
          payload,
          options,
        })
      }
      steps={[
        {
          title: zh ? "选择研究材料" : "Choose research inputs",
          valid: inputValid,
          content: (
            <>
              <ReferencePicker
                kind="structure"
                value={structure}
                onChange={setStructure}
                language={language}
                label={zh ? "蛋白结构" : "Protein structure"}
                allowedSuffixes={[".pdb", ".cif"]}
              />
              {!fep && (
                <ChoiceCards
                  label={zh ? "研究对象" : "Study system"}
                  value={bound ? "complex" : "protein"}
                  onChange={(v) => setBound(v === "complex")}
                  options={[
                    {
                      value: "protein",
                      label: ["蛋白或生物药", "Protein or biologic"],
                      note: [
                        "研究结构的动态稳定性",
                        "Study structural stability over time",
                      ],
                    },
                    {
                      value: "complex",
                      label: [
                        "蛋白与结合小分子",
                        "Protein with a bound ligand",
                      ],
                      note: [
                        "保留对接或实验中的结合坐标",
                        "Retain an experimental or docked binding pose",
                      ],
                    },
                  ].map((c) => ({
                    value: c.value,
                    title: c.label[zh ? 0 : 1],
                    note: c.note[zh ? 0 : 1],
                  }))}
                />
              )}
              {fep ? (
                <LibraryInput
                  value={ligand}
                  onChange={(v) => {
                    setLigand(v);
                    update({ records: [] });
                  }}
                  language={language}
                />
              ) : (
                bound && (
                  <ReferencePicker
                    kind="ligand"
                    value={ligand}
                    onChange={setLigand}
                    language={language}
                    label={zh ? "结合小分子" : "Bound ligand"}
                    allowedSuffixes={[".sdf", ".mol"]}
                  />
                )
              )}
            </>
          ),
        },
        {
          title: fep
            ? zh
              ? "选择分子变化"
              : "Choose molecular changes"
            : zh
              ? "选择研究方案"
              : "Choose a study plan",
          valid: selectionValid,
          content: fep ? (
            <FepLigandSelection
              source={ligand}
              selected={payload.records ?? []}
              onChange={(records) => update({ records })}
              language={language}
            />
          ) : (
            <ChoiceCards
              label={zh ? "模拟长度" : "Simulation length"}
              value={String(payload.production_ns)}
              onChange={(v) => update({ production_ns: Number(v) })}
              options={[
                {
                  value: "2",
                  label: ["初步检查 · 2 ns", "Initial check · 2 ns"],
                  note: [
                    "查看体系能否稳定运行",
                    "Check the prepared system's initial behavior",
                  ],
                },
                {
                  value: "10",
                  label: ["标准探索 · 10 ns", "Standard exploration · 10 ns"],
                  note: [
                    "比较初步稳定性与接触",
                    "Explore initial stability and contacts",
                  ],
                },
                {
                  value: "100",
                  label: ["延长采样 · 100 ns", "Extended sampling · 100 ns"],
                  note: [
                    "需要服务器较长计算时间",
                    "Requires a longer server calculation",
                  ],
                },
              ].map((c) => ({
                value: c.value,
                title: c.label[zh ? 0 : 1],
                note: c.note[zh ? 0 : 1],
              }))}
            />
          ),
        },
        {
          title: zh ? "设置模拟条件" : "Choose simulation conditions",
          valid: settingsValid,
          content: (
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
                    onChange={(e) =>
                      update({ repeats: Number(e.target.value) })
                    }
                  >
                    {[1, 3].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  <Hint
                    label={zh ? "独立重复说明" : "About independent repeats"}
                  >
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
                          {zh
                            ? "包含冗余连接"
                            : "Include redundant connections"}
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
          ),
        },
        {
          title: zh ? "确认并提交" : "Review and submit",
          valid: inputValid && selectionValid && settingsValid,
          content: (
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
          ),
        },
      ]}
    />
  );
}
