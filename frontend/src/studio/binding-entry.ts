import type { ToolId } from "../operations/catalog";
export type BindingKnowledge =
  "reference" | "known-site" | "unknown-site" | "insufficient";
export type StructureMaterial = "sequence" | "structure";
export const bindingPaths = [
  {
    value: "reference",
    title: ["已有参考复合物", "I have a reference complex"],
    note: [
      "检查已对齐的受体与配体姿势，保留参考证据。",
      "Check an aligned receptor and ligand pose while retaining the reference evidence.",
    ],
  },
  {
    value: "known-site",
    title: ["结构和位点已知", "I know the structure and site"],
    note: [
      "使用参考配体或明确搜索区域开展对接。",
      "Dock using a reference ligand or an explicit search region.",
    ],
  },
  {
    value: "unknown-site",
    title: ["有结构，位点未知", "I have a structure, but no site"],
    note: [
      "先寻找候选口袋，查看结果后选择研究位点。",
      "Find candidate pockets, then review and choose a site.",
    ],
  },
  {
    value: "insufficient",
    title: ["结构资料不足", "My structural evidence is incomplete"],
    note: [
      "只有序列先预测；已有结构先检查和准备。",
      "Predict from a sequence, or inspect and prepare an existing structure.",
    ],
  },
] as const;
export function bindingEntryTool(
  mode: BindingKnowledge,
  material?: StructureMaterial,
): ToolId | null {
  if (mode === "reference") return "gnina.score";
  if (mode === "known-site") return "gnina.dock";
  if (mode === "unknown-site") return "p2rank.detect";
  if (material === "sequence") return "predict";
  if (material === "structure") return "biopython.prepare";
  return null;
}
