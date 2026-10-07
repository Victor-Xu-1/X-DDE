import { tools, type ToolId } from "../operations/catalog";
import type { Language } from "../types";
export type ModuleId =
  | "targets"
  | "structures"
  | "binding"
  | "screening"
  | "del"
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
    recommended: ["predict", "boltz.predict", "openmm.refine"],
    tools: [
      "predict",
      "boltz.predict",
      "openmm.refine",
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
      "plip.profile",
      "biopython.exposure",
      "apbs.potential",
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
    recommended: ["diffsbdd.generate", "reinvent.design", "chemistry.states"],
    tools: [
      "diffsbdd.generate",
      "reinvent.design",
      "diffsbdd.inpaint",
      "chemistry.states",
      "diffsbdd.diversify",
      "diffsbdd.optimize",
      "diffsbdd.export",
    ],
  },
  {
    id: "screening",
    label: ["高通量筛选", "High-throughput screening"],
    short: ["筛选", "Screening"],
    purpose: [
      "分子库、快速检索与候选批量对接",
      "Compound libraries, fast retrieval and shortlisted docking",
    ],
    defaultTool: "drugclip.screen",
    recommended: ["drugclip.screen", "screening.dock", "library.import"],
    tools: [
      "drugclip.screen",
      "screening.dock",
      "library.import",
      "drugclip.index",
      "library.select",
    ],
  },
  {
    id: "del",
    label: ["DEL 研究", "DEL research"],
    short: ["DEL", "DEL"],
    purpose: [
      "从测序计数到富集、系列和候选交接",
      "From sequence counts to enrichment, series and candidate handoff",
    ],
    defaultTool: "del.analyze",
    recommended: ["del.analyze", "del.decode", "del.library"],
    tools: [
      "del.analyze",
      "del.decode",
      "del.library",
      "del.count",
      "del.enumerate",
      "del.series",
      "del.candidates",
      "del.model",
      "del.followup",
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
    recommended: ["antibody.humanize", "boltzgen.design", "ligandmpnn.design"],
    tools: [
      "antibody.humanize",
      "boltzgen.design",
      "ligandmpnn.design",
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
      "experimental.evidence",
      "chemprop.train",
      "chemprop.predict",
    ],
  },
];
export function moduleForTool(id: ToolId | null | undefined) {
  return researchModules.find((module) => id && module.tools.includes(id));
}
export function toolLabel(id: ToolId, language: Language) {
  return tools.find((tool) => tool.id === id)!.label[language === "zh" ? 0 : 1];
}
