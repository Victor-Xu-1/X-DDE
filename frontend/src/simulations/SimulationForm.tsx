import { useState } from "react";
import { ReferencePicker } from "../diffsbdd/ReferencePicker";
import { LibraryInput } from "../integrations/LibraryInput";
import { ChoiceCards } from "../guided/ChoiceCards";
import { SimulationConditions } from "./SimulationConditions";
import { SimulationReview } from "./SimulationReview";
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
  initialTask,
}: {
  form: SimulationFormId;
  language: Language;
  onCreated(job: Job): void;
  initialTask?: ScientificTask;
}) {
  const zh = language === "zh",
    fep = form === "openfe.rbfe",
    [program, operation] = simulationForms[form];
  const exampleTask = useExampleTask(operation),
    exampleProtein = useExampleReference("protein_only"),
    exampleLigand = useExampleReference("ligand", fep ? "tyk2_ligands" : "jq1");
  const preset = initialTask ?? exampleTask;
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
        kind: program,
      }) as SimulationPayload,
  );
  const [name, setName] = useState("");
  const [options, setOptions] = useState<ScientificTask["options"]>({
    device: fep ? "cpu" : "cuda",
    cpu: 2,
    memory_mib: 8192,
    seed: 101,
    ...initialTask?.options,
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
    payload.repeats <= (fep ? 6 : 3) &&
    (program !== "gromacs" ||
      Math.round(
        (payload.production_ns * 1_000_000) / Number(payload.timestep_fs),
      ) %
        Number(payload.frames) ===
        0);
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
                  selectRecords
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
            <SimulationConditions
              fep={fep}
              payload={payload}
              update={update}
              options={options}
              setOptions={setOptions}
              language={language}
            />
          ),
        },
        {
          title: zh ? "确认并提交" : "Review and submit",
          valid: inputValid && selectionValid && settingsValid,
          content: (
            <SimulationReview
              program={program}
              fep={fep}
              payload={payload}
              inputs={inputs}
              options={options}
              name={name}
              setName={setName}
              language={language}
            />
          ),
        },
      ]}
    />
  );
}
