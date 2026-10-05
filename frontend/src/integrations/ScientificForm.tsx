import { useState } from "react";
import "./inputs.css";
import { Questionnaire } from "../guided/Questionnaire";
import { useTaskReadiness } from "../guided/useTaskReadiness";
import { useTaskSubmit } from "../operations/useTaskSubmit";
import type { Job, Language } from "../types";
import type { MoleculeRef } from "../research/types";
import { nativeDefaults } from "./generated";
import { ScientificInputs } from "./ScientificInputs";
import { ScientificChoices } from "./ScientificChoices";
import { ScientificSelection } from "./ScientificSelection";
import { ScaffoldSelection } from "./ScaffoldSelection";
import { validBoltzComponents, validScientificChoices } from "./validation";
import {
  useExample,
  useExampleReference,
  useExampleTask,
} from "../examples/context";
import {
  scientificForms,
  type ScientificForm as FormId,
  type ScientificPayload,
  type ScientificTask,
} from "./types";

export function ScientificForm({
  form,
  language,
  onCreated,
}: {
  form: FormId;
  language: Language;
  onCreated(job: Job): void;
}) {
  const zh = language === "zh",
    [program, operation] = scientificForms[form];
  const example = useExample(),
    preset = useExampleTask(operation);
  const initialStructure = useExampleReference(
    program === "boltzgen" ? "her2_domain_iv" : "receptor",
    "brd4",
    "her2",
  );
  const initialLigand = useExampleReference(
    program === "chemprop" ? "egfr_library" : "jq1",
    "imatinib",
  );
  const [structure, setStructure] = useState<MoleculeRef | null>(
    preset?.inputs.find((i) => i.role === "structure")?.source ??
      (["boltz", "reinvent", "chemprop"].includes(program)
        ? null
        : initialStructure),
  );
  const [ligand, setLigand] = useState<MoleculeRef | null>(
    preset?.inputs.find((i) => ["ligand", "library"].includes(i.role))
      ?.source ??
      (["reinvent", "chemprop"].includes(program) ? initialLigand : null),
  );
  const [scaffold, setScaffold] = useState<MoleculeRef | null>(null);
  const [payload, setPayload] = useState<ScientificPayload>(() => ({
    ...structuredClone(nativeDefaults[program]),
    kind: program,
    ...(program === "chemprop"
      ? { mode: operation === "chemprop_train" ? "train" : "predict" }
      : {}),
    ...(program === "boltz"
      ? {
          components: [
            {
              id: "A",
              kind: "protein",
              value: example?.sequences.protein ?? "",
            },
            { id: "B", kind: "ligand", value: "", source: initialLigand },
          ],
        }
      : {}),
    ...(program === "ligandmpnn" ? { redesigned_residues: [] } : {}),
    ...(program === "boltzgen" ? { target_chains: [] } : {}),
    ...(preset?.payload ?? {}),
  }));
  const [selectionValid, setSelectionValid] = useState(
    !["ligandmpnn", "boltzgen", "plip"].includes(program),
  );
  const [expert, setExpert] = useState(false);
  const [name, setName] = useState(
    preset?.name ?? example?.case.label[zh ? 0 : 1] ?? "",
  );
  const [options, setOptions] = useState<ScientificTask["options"]>({
    device: ["boltz", "boltzgen"].includes(program) ? "cuda" : "cpu",
    cpu: 2,
    memory_mib: ["boltz", "boltzgen"].includes(program) ? 24576 : 4096,
    seed: 101,
  });
  const readiness = useTaskReadiness(form),
    run = useTaskSubmit(onCreated);
  function update(patch: Partial<ScientificPayload>) {
    setPayload((value) => ({ ...value, ...patch }));
  }
  const inputs: ScientificTask["inputs"] = [];
  if (program === "boltz") {
    for (const c of payload.components as { source?: MoleculeRef | null }[])
      if (c.source) inputs.push({ role: "ligand", source: c.source });
  }
  if (structure) inputs.push({ role: "structure", source: structure });
  if (scaffold && ["antibody", "nanobody"].includes(String(payload.modality)))
    inputs.push({ role: "scaffold", source: scaffold });
  if (ligand)
    inputs.push({
      role: program === "chemprop" ? "library" : "ligand",
      source: ligand,
    });
  const inputValid =
    program === "boltz"
      ? validBoltzComponents(payload.components, payload.affinity)
      : ["reinvent", "chemprop"].includes(program)
        ? (program === "reinvent" &&
            !["analogues", "optimize"].includes(String(payload.mode))) ||
          Boolean(ligand)
        : Boolean(structure) &&
          (program !== "boltzgen" ||
            !["antibody", "nanobody"].includes(String(payload.modality)) ||
            Boolean(scaffold));
  const modeValid =
    (program !== "chemprop" ||
      operation === "chemprop_train" ||
      Boolean(payload.model_job && payload.model_sha256)) &&
    (program !== "boltzgen" ||
      !["antibody", "nanobody"].includes(String(payload.modality)) ||
      Boolean(
        payload.scaffold_chain &&
        (payload.scaffold_residues as string[] | undefined)?.length,
      ));
  const optionsValid =
    validScientificChoices(payload) &&
    Number.isInteger(options.cpu) &&
    options.cpu >= 1 &&
    options.cpu <= 16 &&
    Number.isInteger(options.memory_mib) &&
    options.memory_mib >= 1024 &&
    options.memory_mib <= 65536 &&
    Number.isInteger(options.seed) &&
    options.seed >= 0 &&
    options.seed <= 2147483647;
  return (
    <Questionnaire
      language={language}
      busy={run.busy}
      error={readiness.error || run.error}
      ready={readiness.ready}
      unavailable={
        zh
          ? "计算环境尚未就绪，可先填写材料，再到组件页完成部署。"
          : "Prepare the scientific environment in Components before submission."
      }
      submitLabel={zh ? "提交计算" : "Submit calculation"}
      onSubmit={() =>
        run.submit({
          operation,
          name: name.trim() || (zh ? "研究计算" : "Research calculation"),
          inputs,
          scientific_inputs: inputs.map((item) => item.source),
          payload,
          options,
        })
      }
      steps={[
        {
          title: zh ? "选择研究材料" : "Choose research inputs",
          valid: inputValid,
          content: (
            <ScientificInputs
              program={program}
              language={language}
              payload={payload}
              onChange={update}
              structure={structure}
              onStructure={(value) => {
                setStructure(value);
                update(
                  program === "ligandmpnn"
                    ? { redesigned_residues: [] }
                    : program === "boltzgen"
                      ? { target_chains: [] }
                      : program === "plip"
                        ? { ligand_chain: "", ligand_number: null }
                        : {},
                );
              }}
              ligand={ligand}
              onLigand={setLigand}
              scaffold={scaffold}
              onScaffold={(value) => {
                setScaffold(value);
                update({ scaffold_chain: null, scaffold_residues: [] });
              }}
            />
          ),
        },
        {
          title: zh ? "选择研究目标" : "Choose the research objective",
          valid: selectionValid && modeValid,
          content: (
            <>
              <ScientificSelection
                program={program}
                language={language}
                payload={payload}
                onChange={update}
                structure={structure}
                onValid={setSelectionValid}
              />
              {program === "boltzgen" &&
                scaffold &&
                ["antibody", "nanobody"].includes(String(payload.modality)) && (
                  <ScaffoldSelection
                    source={scaffold}
                    language={language}
                    payload={payload}
                    onChange={update}
                  />
                )}
            </>
          ),
        },
        {
          title: zh ? "选择计算方案" : "Choose a calculation plan",
          valid: optionsValid,
          content: (
            <ScientificChoices
              program={program}
              language={language}
              payload={payload}
              onChange={update}
              options={options}
              onOptions={setOptions}
              expert={expert}
              onExpert={setExpert}
            />
          ),
        },
        {
          title: zh ? "确认并提交" : "Review and submit",
          valid: inputValid && selectionValid && modeValid && optionsValid,
          content: (
            <>
              <label className="field">
                {zh ? "任务名称" : "Task name"}
                <input
                  maxLength={80}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={zh ? "为这次研究起个名字" : "Name this study"}
                />
              </label>
              <table className="compact-table">
                <tbody>
                  <tr>
                    <th>{zh ? "计算程序" : "Scientific program"}</th>
                    <td>{program === "boltz" ? "Boltz-2" : program}</td>
                  </tr>
                  <tr>
                    <th>{zh ? "材料" : "Inputs"}</th>
                    <td>
                      {inputs.length
                        ? `${inputs.length} ${zh ? "份已确认文件" : "confirmed files"}`
                        : zh
                          ? "本次填写的分子与序列"
                          : "Molecules and sequences entered for this task"}
                    </td>
                  </tr>
                  <tr>
                    <th>{zh ? "计算设备" : "Device"}</th>
                    <td>{options.device === "cuda" ? "GPU" : "CPU"}</td>
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
