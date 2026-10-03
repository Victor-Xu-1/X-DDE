import type { Deployment } from "./client";

export type ComponentPackage = Deployment["packages"][number];
export type DeploymentOperation = Deployment["operations"][number];
export const pendingStates = new Set([
  "queued",
  "running",
  "pausing",
  "paused",
]);

interface GroupDefinition {
  id: string;
  title: [string, string];
  recommendation: [string, string];
  recommended: string[];
  matches(p: ComponentPackage): boolean;
}

const definitions: GroupDefinition[] = [
  {
    id: "foundation",
    title: ["基础与预览", "Preparation & viewers"],
    recommendation: [
      "绘图、三维预览、材料准备与公开案例",
      "Editors, preparation and public examples",
    ],
    recommended: [
      "ketcher",
      "molstar",
      "biopython",
      "chemistry",
      "public-examples",
    ],
    matches: (p) =>
      [
        "ketcher",
        "molstar",
        "biopython",
        "chemistry",
        "public-examples",
      ].includes(p.id),
  },
  {
    id: "screening",
    title: ["口袋、对接与性质", "Pockets, docking & properties"],
    recommendation: [
      "P2Rank + GNINA + PoseBusters + ADMET-AI；自动补齐 Java",
      "P2Rank, GNINA, PoseBusters and ADMET-AI, with Java dependencies",
    ],
    recommended: ["p2rank", "gnina", "posebusters", "admet"],
    matches: (p) =>
      ["p2rank", "p2rank-compute", "gnina", "posebusters", "admet"].includes(
        p.id,
      ),
  },
  {
    id: "prediction",
    title: ["结构预测 · OpenDDE", "Structure prediction · OpenDDE"],
    recommendation: [
      "计算环境 + 标准模型；抗体模型与大型搜索数据库按需选择",
      "Compute and standard model; antibody model and large search databases are optional",
    ],
    recommended: ["compute", "standard"],
    matches: (p) => p.engine === "opendde" || p.id === "harness",
  },
  {
    id: "generation",
    title: ["分子生成 · DiffSBDD", "Molecule generation · DiffSBDD"],
    recommendation: [
      "独立环境 + CrossDocked Cα 条件模型；其他模型按需选择",
      "Isolated runtime and CrossDocked Cα conditional model; other models are optional",
    ],
    recommended: ["diffsbdd", "diffsbdd-model-crossdocked_ca_cond"],
    matches: (p) => p.engine === "diffsbdd",
  },
  {
    id: "biologics",
    title: ["抗体与生物药", "Antibodies & biologics"],
    recommendation: [
      "ANARCII 编号 + Sapiens 人源参考评估",
      "ANARCII numbering and Sapiens human reference assessment",
    ],
    recommended: ["anarcii", "sapiens"],
    matches: (p) => ["anarcii", "sapiens"].includes(p.id),
  },
];

export function componentGroups(packages: ComponentPackage[]) {
  const remaining = new Map(packages.map((p) => [p.id, p]));
  const groups = definitions
    .map((definition) => {
      const items = [...remaining.values()].filter(definition.matches);
      items.forEach((p) => remaining.delete(p.id));
      items.sort(
        (a, b) => Number(a.kind === "model") - Number(b.kind === "model"),
      );
      return { ...definition, packages: items };
    })
    .filter((group) => group.packages.length);
  if (remaining.size)
    groups.push({
      id: "other",
      title: ["其他组件", "Other components"],
      recommendation: ["按需单独安装", "Install individually as needed"],
      recommended: [],
      matches: () => true,
      packages: [...remaining.values()],
    });
  return groups;
}

export function pendingOperation(data: Deployment, id: string) {
  return data.operations.find(
    (o) => o.package === id && pendingStates.has(o.state),
  );
}

export function missingComponents(
  data: Deployment,
  keys: string[],
  repair = false,
) {
  const catalogue = new Set(data.packages.map((p) => p.id));
  const unique = [...new Set(keys)];
  if (unique.some((id) => !catalogue.has(id)))
    throw new Error("Unknown component. Refresh the component catalogue.");
  return unique.filter(
    (id) => (repair || !data.installed[id]) && !pendingOperation(data, id),
  );
}
