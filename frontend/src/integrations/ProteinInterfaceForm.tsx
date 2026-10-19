import { useState } from "react";
import { ProteinInterfaceInputs } from "./ProteinInterfaceInputs";
import { Questionnaire } from "../guided/Questionnaire";
import { useTaskReadiness } from "../guided/useTaskReadiness";
import { useTaskSubmit } from "../operations/useTaskSubmit";
import { useExampleTask } from "../examples/context";
import { referenceKey } from "../research/input-catalog";
import type { MoleculeRef } from "../research/types";
import type { Job, Language } from "../types";
import type { ScientificTask } from "./types";
import {
  ProteinInterfaceChains,
  type InterfaceInput,
} from "./ProteinInterfaceChains";

export function ProteinInterfaceForm({
  language,
  onCreated,
}: {
  language: Language;
  onCreated(job: Job): void;
}) {
  const zh = language === "zh",
    preset = useExampleTask("protein_interface");
  const labels = preset?.payload.candidate_names as string[] | undefined;
  const fresh = (): InterfaceInput => ({
    id: crypto.randomUUID(),
    source: null,
    label: zh ? "复合物 1" : "Complex 1",
    fileName: "",
    chains: [],
  });
  const [inputs, setInputs] = useState<InterfaceInput[]>(
    () =>
      preset?.inputs.map((i, n) => ({
        id: crypto.randomUUID(),
        source: i.source,
        label: labels?.[n] ?? `Complex ${n + 1}`,
        fileName: "",
        chains: [],
      })) ?? [fresh()],
  );
  const [target, setTarget] = useState<string[]>(
    (preset?.payload.target_chains as string[]) ?? [],
  );
  const [binder, setBinder] = useState<string[]>(
    (preset?.payload.binder_chains as string[]) ?? [],
  );
  const [name, setName] = useState(
    preset?.name ??
      (zh ? "蛋白界面相互作用" : "Protein interface interactions"),
  );
  const availability = useTaskReadiness("structure"),
    run = useTaskSubmit(onCreated);
  const fileValid =
    inputs.every(
      (i) => i.source && i.label.trim().length > 0 && i.label.length <= 80,
    ) &&
    new Set(inputs.map((i) => i.source && referenceKey(i.source))).size ===
      inputs.length;
  const chainValid =
    target.length > 0 &&
    target.length <= 8 &&
    binder.length > 0 &&
    binder.length <= 8 &&
    target.every((c) => !binder.includes(c)) &&
    inputs.every((i) =>
      [...target, ...binder].every((c) => i.chains.includes(c)),
    );
  function source(id: string, value: MoleculeRef | null) {
    setInputs((current) =>
      current.map((i) =>
        i.id === id ? { ...i, source: value, chains: [], fileName: "" } : i,
      ),
    );
  }
  function verified(id: string, value: MoleculeRef, fileName: string) {
    setInputs((current) =>
      current.map((i) =>
        i.id === id &&
        i.source &&
        referenceKey(i.source) === referenceKey(value)
          ? { ...i, fileName }
          : i,
      ),
    );
  }
  return (
    <Questionnaire
      language={language}
      busy={run.busy}
      error={run.error || availability.error}
      ready={availability.ready}
      onCheckEnvironment={availability.recheck}
      submitLabel={zh ? "分析蛋白界面" : "Analyze protein interface"}
      onSubmit={() =>
        run.submit({
          operation: "protein_interface",
          name: name.trim(),
          inputs: inputs.map((i) => ({ role: "structure", source: i.source! })),
          scientific_inputs: inputs.map((i) => i.source!),
          payload: {
            kind: "plip",
            scope: "protein_interface",
            target_chains: target,
            binder_chains: binder,
            candidate_names: inputs.map((i) => i.label.trim()),
          },
          options: { device: "cpu", cpu: 2, memory_mib: 4096, seed: 101 },
        } satisfies ScientificTask)
      }
      steps={[
        {
          title: zh ? "选择复合物" : "Choose complexes",
          valid: fileValid,
          content: (
            <ProteinInterfaceInputs
              inputs={inputs}
              language={language}
              onSource={source}
              onVerified={verified}
              onLabel={(id, label) =>
                setInputs((current) =>
                  current.map((i) => (i.id === id ? { ...i, label } : i)),
                )
              }
              onRemove={(id) =>
                setInputs((current) => current.filter((i) => i.id !== id))
              }
              onAdd={() =>
                setInputs((current) => [
                  ...current,
                  {
                    ...fresh(),
                    label: zh
                      ? `复合物 ${current.length + 1}`
                      : `Complex ${current.length + 1}`,
                  },
                ])
              }
            />
          ),
        },
        {
          title: zh ? "选择蛋白链" : "Choose protein partners",
          valid: chainValid,
          content: (
            <ProteinInterfaceChains
              inputs={inputs}
              language={language}
              target={target}
              binder={binder}
              onTarget={setTarget}
              onBinder={setBinder}
              onChains={(id, value, chains) =>
                setInputs((current) =>
                  current.map((i) =>
                    i.id === id &&
                    i.source &&
                    referenceKey(i.source) === referenceKey(value)
                      ? {
                          ...i,
                          chains: chains.filter((c) => /^[A-Za-z0-9]$/.test(c)),
                        }
                      : i,
                  ),
                )
              }
            />
          ),
        },
        {
          title: zh ? "确认分析" : "Review analysis",
          valid:
            fileValid &&
            chainValid &&
            Boolean(name.trim()) &&
            name.length <= 80,
          content: (
            <>
              <label>
                {zh ? "任务名称" : "Task name"}
                <input
                  value={name}
                  maxLength={80}
                  required
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <table>
                <thead>
                  <tr>
                    <th>{zh ? "复合物" : "Complex"}</th>
                    <th>{zh ? "研究文件" : "Research file"}</th>
                  </tr>
                </thead>
                <tbody>
                  {inputs.map((i) => (
                    <tr key={i.id}>
                      <td>{i.label}</td>
                      <td>
                        {i.fileName ||
                          (zh ? "已选择原始结构" : "Selected source structure")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p>
                {zh ? "靶蛋白链" : "Target chains"}: {target.join(", ")} ·{" "}
                {zh ? "伙伴链" : "Partner chains"}: {binder.join(", ")}
              </p>
              <p className="field-help">
                {zh
                  ? "保留原始坐标和已记录的修饰残基，分析全部原生接触；距离与接触数量不是结合能或亲和力。"
                  : "Analyze native contacts in the original coordinate frame, retaining deposited residue modifications. Contact distances and counts are not binding energies or affinity."}
              </p>
            </>
          ),
        },
      ]}
    />
  );
}
