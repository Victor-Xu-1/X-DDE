import type { ScientificPayload } from "./types";

export const reinventModes = [
  ["analogues", "从已有分子寻找类似物", "Find analogues of a molecule"],
  ["optimize", "围绕已有分子优化性质", "Optimize properties around a molecule"],
  ["de_novo", "从头生成", "De novo generation"],
  ["r_groups", "替换 R 基", "Replace R-groups"],
  ["linker", "连接两个片段", "Link two fragments"],
] as const;

export function usesStartingMolecule(payload: ScientificPayload) {
  return ["analogues", "optimize"].includes(String(payload.mode));
}
