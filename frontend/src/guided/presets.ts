import { defaults } from "../form-model";
import type { Component, Parameters } from "../types";
export const taskKinds = [
  {
    id: "ligand",
    label: ["小分子结构", "Small-molecule structure"],
    note: [
      "输入一个小分子，查看预测的三维构象。",
      "Predict a 3D conformer for a small molecule.",
    ],
  },
  {
    id: "complex",
    label: ["蛋白–小分子", "Protein–ligand complex"],
    note: [
      "输入靶蛋白和小分子，预测二者的相对位置。",
      "Predict the relative pose of a protein and ligand.",
    ],
  },
  {
    id: "protein",
    label: ["蛋白结构", "Protein structure"],
    note: [
      "输入蛋白序列，预测三维结构。",
      "Predict a structure from a protein sequence.",
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
export function kindFor(items: Component[]): TaskKind {
  return items.some((x) => x.kind === "protein")
    ? items.some((x) => x.kind === "ligand")
      ? "complex"
      : "protein"
    : "ligand";
}
export function componentsFor(
  kind: TaskKind,
  previous: Component[],
): Component[] {
  const component = (type: Component["kind"]): Component =>
    previous.find((x) => x.kind === type) ?? {
      kind: type,
      value: "",
      count: 1,
    };
  return kind === "complex"
    ? [component("protein"), component("ligand")]
    : [component(kind === "protein" ? "protein" : "ligand")];
}
