import { tools, type ToolId } from "../operations/catalog";
import type { Language } from "../types";
export type ModuleId =
  | "targets"
  | "structures"
  | "binding"
  | "molecules"
  | "biologics"
  | "evaluation";
export interface ResearchModule {
  id: ModuleId;
  label: readonly [string, string];
  short: readonly [string, string];
  purpose: readonly [string, string];
  defaultTool: ToolId;
  recommended: readonly ToolId[];
  tools: readonly ToolId[];
}
/** Presentation groups share the generated backend catalogue; they never replace scientific contracts. */
export const researchModules: readonly ResearchModule[] = [
  {
    id: "targets",
    label: ["靶点研究", "Target research"],
    short: ["靶点", "Targets"],
    purpose: [
      "寻找靶点、查看证据、获取公开研究材料",
      "Find targets, inspect evidence and obtain public research inputs",
    ],
    defaultTool: "discovery.disease",
    recommended: ["discovery.disease", "discovery.target", "discovery.import"],
    tools: [
      "discovery.disease",
      "discovery.target",
      "discovery.import",
      "protrek-sequence",
      "protrek-structure",
    ],
  },
  {
    id: "structures",
    label: ["结构预测", "Structure prediction"],
    short: ["结构", "Structures"],
    purpose: [
      "预测复合物、准备结构、比较受体构象",
      "Predict complexes, prepare structures and compare receptor conformations",
    ],
    defaultTool: "predict",
    recommended: ["predict", "biopython.prepare", "biopython.ensemble"],
    tools: [
      "predict",
      "biopython.prepare",
      "biopython.ensemble",
      "features",
      "import",
      "diffsbdd.prepare",
    ],
  },
  {
    id: "binding",
    label: ["口袋与对接", "Pockets and docking"],
    short: ["口袋", "Docking"],
    purpose: [
      "寻找口袋、探索结合姿势、检查相互作用",
      "Discover pockets, explore poses and inspect interactions",
    ],
    defaultTool: "p2rank.detect",
    recommended: ["p2rank.detect", "gnina.dock", "pose_exploration"],
    tools: [
      "p2rank.detect",
      "gnina.dock",
      "pose_exploration",
      "gnina.score",
      "gnina.minimize",
      "posebusters.check",
      "structure",
      "regions",
      "rmsd",
      "workflows",
      "diffsbdd.pocket",
      "diffsbdd.interactions",
    ],
  },
  {
    id: "molecules",
    label: ["小分子设计", "Small-molecule design"],
    short: ["分子", "Molecules"],
    purpose: [
      "口袋条件生成、局部设计、准备分子状态",
      "Generate molecules for a pocket, redesign regions and prepare molecular states",
    ],
    defaultTool: "diffsbdd.generate",
    recommended: ["diffsbdd.generate", "diffsbdd.inpaint", "chemistry.states"],
    tools: [
      "diffsbdd.generate",
      "diffsbdd.inpaint",
      "chemistry.states",
      "diffsbdd.diversify",
      "diffsbdd.optimize",
      "diffsbdd.export",
    ],
  },
  {
    id: "biologics",
    label: ["生物药研究", "Biologics research"],
    short: ["生物药", "Biologics"],
    purpose: [
      "抗体框架优化、CDR 设计、蛋白序列与界面研究",
      "Refine antibody frameworks, design CDRs and study protein sequences and interfaces",
    ],
    defaultTool: "antibody.humanize",
    recommended: ["antibody.humanize", "campaign", "mpnn"],
    tools: [
      "antibody.humanize",
      "campaign",
      "mpnn",
      "antibody.number",
      "esm",
      "esm2",
      "fold",
      "epitope",
      "target-msa",
      "evolution",
      "compare",
    ],
  },
  {
    id: "evaluation",
    label: ["性质与安全性", "Properties and safety"],
    short: ["性质", "Properties"],
    purpose: [
      "预测早期安全性、计算基础性质、筛选分子库",
      "Predict early safety endpoints, calculate descriptors and select library molecules",
    ],
    defaultTool: "admet.predict",
    recommended: ["admet.predict", "properties", "chemistry.screen"],
    tools: [
      "admet.predict",
      "properties",
      "chemistry.screen",
      "diffsbdd.properties",
    ],
  },
];
export function moduleForTool(id: ToolId | null | undefined) {
  return researchModules.find((module) => id && module.tools.includes(id));
}
export function toolLabel(id: ToolId, language: Language) {
  return tools.find((tool) => tool.id === id)!.label[language === "zh" ? 0 : 1];
}
