import { defaults } from "../form-model";
import type { Component, Parameters } from "../types";
export const taskKinds = [
  {
    id: "complex",
    label: ["蛋白–小分子", "Protein–ligand complex"],
    note: [
      "已有靶蛋白和化合物，预测复合物中的位置。",
      "Predict a complex from an existing target and compound.",
    ],
  },
  {
    id: "protein",
    label: ["蛋白结构", "Protein structure"],
    note: [
      "从一条蛋白序列预测三维结构。",
      "Predict a 3D structure from a protein sequence.",
    ],
  },
  {
    id: "protein-complex",
    label: ["蛋白–蛋白复合物", "Protein–protein complex"],
    note: [
      "提供两条或多条蛋白链，预测共同结构。",
      "Predict an assembly of two or more protein chains.",
    ],
  },
  {
    id: "antibody",
    label: ["抗体–抗原复合物", "Antibody–antigen complex"],
    note: [
      "输入已有抗体和抗原，自动使用 ABAG 专用模型。",
      "Use existing antibody and antigen sequences with the ABAG model.",
    ],
  },
  {
    id: "nucleic",
    label: ["DNA / RNA 结构", "DNA / RNA structure"],
    note: [
      "单链、双链 DNA 或 RNA，也可加入蛋白组分。",
      "Predict DNA or RNA alone or together with protein chains.",
    ],
  },
  {
    id: "ligand",
    label: ["小分子结构", "Small-molecule structure"],
    note: [
      "仅有化合物时，查看其预测的三维构象。",
      "Predict a 3D conformer when you only have a compound.",
    ],
  },
] as const;
export type TaskKind = (typeof taskKinds)[number]["id"];
export const profiles = [
  {
    id: "quick",
    label: ["快速试跑", "Quick check"],
    note: [
      "1 个构象，较少计算；用来检查输入和流程。",
      "One conformer with reduced computation; checks inputs and the workflow.",
    ],
    parameters: { ...defaults, steps: 50, cycles: 4 },
  },
  {
    id: "standard",
    label: ["标准预测 · 推荐", "Standard · recommended"],
    note: [
      "1 个构象，默认计算设置；首次研究任务选这个。",
      "One conformer with default settings; start here for a research task.",
    ],
    parameters: { ...defaults },
  },
  {
    id: "compare",
    label: ["多构象比较", "Compare conformers"],
    note: [
      "3 个构象，计算量更大；完成后可叠加查看。",
      "Three conformers with more computation; overlay them after completion.",
    ],
    parameters: { ...defaults, samples: 3 },
  },
] as const;
export type Profile = (typeof profiles)[number]["id"] | "custom";
export function profileFor(value: Parameters): Profile {
  return (
    profiles.find(
      (p) =>
        p.parameters.samples === value.samples &&
        p.parameters.steps === value.steps &&
        p.parameters.cycles === value.cycles &&
        value.dtype === "bf16",
    )?.id ?? "custom"
  );
}
export function kindFor(
  items: Component[],
  model?: Parameters["model"],
): TaskKind {
  if (items.some((x) => x.kind === "dna" || x.kind === "rna")) return "nucleic";
  if (model === "abag") return "antibody";
  const proteins = items.filter((x) => x.kind === "protein");
  if (proteins.length && items.some((x) => x.kind === "ligand"))
    return "complex";
  if (proteins.reduce((n, x) => n + x.count, 0) > 1) return "protein-complex";
  return proteins.length ? "protein" : "ligand";
}
export function componentsFor(
  kind: TaskKind,
  previous: Component[],
): Component[] {
  const types: Component["kind"][] =
    kind === "complex"
      ? ["protein", "ligand"]
      : kind === "protein-complex" || kind === "antibody"
        ? ["protein", "protein"]
        : [kind === "nucleic" ? "rna" : kind];
  const available = [...previous];
  return types.map((type) => {
    const index = available.findIndex((x) => x.kind === type);
    return index < 0
      ? { kind: type, value: "", count: 1 }
      : { ...available.splice(index, 1)[0] };
  });
}
export function requiredKinds(kind: TaskKind): Component["kind"][] {
  return componentsFor(kind, []).map((x) => x.kind);
}
export function completeWorkflow(
  kind: TaskKind,
  components: Component[],
): boolean {
  const kinds = components.map((x) => x.kind);
  if (kind === "nucleic") return kinds.includes("dna") || kinds.includes("rna");
  const available = [...kinds];
  return requiredKinds(kind).every((type) => {
    const index = available.indexOf(type);
    if (index < 0) return false;
    available.splice(index, 1);
    return true;
  });
}
