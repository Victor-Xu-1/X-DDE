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
      "public-surface-examples",
      "public-pose-examples",
      "public-channel-examples",
      "public-proximity-examples",
      "public-experimental-examples",
    ],
    matches: (p) =>
      [
        "ketcher",
        "molstar",
        "biopython",
        "chemistry",
        "public-examples",
        "public-surface-examples",
        "public-pose-examples",
        "public-channel-examples",
        "public-proximity-examples",
        "public-experimental-examples",
      ].includes(p.id),
  },
  {
    id: "screening",
    title: ["口袋、对接与性质", "Pockets, docking & properties"],
    recommendation: [
      "P2Rank + GNINA + PoseBusters + ADMET-AI；自动补齐 Java",
      "P2Rank, GNINA, PoseBusters and ADMET-AI, with Java dependencies",
    ],
    recommended: [
      "p2rank",
      "caver",
      "gnina",
      "posebusters",
      "admet",
      "plip",
      "apbs",
      "chemprop",
    ],
    matches: (p) =>
      [
        "p2rank",
        "caver",
        "p2rank-compute",
        "gnina",
        "posebusters",
        "admet",
        "plip",
        "apbs",
        "chemprop",
      ].includes(p.id),
  },
  {
    id: "simulations",
    title: ["动力学与结合自由能", "Dynamics and binding free energy"],
    recommendation: [
      "OpenMM 动力学与结构优化；OpenFE 相对结合自由能",
      "OpenMM dynamics and refinement; OpenFE relative binding free energy",
    ],
    recommended: ["openmm", "openfe"],
    matches: (p) => ["openmm", "openfe"].includes(p.id),
  },
  {
    id: "prediction",
    title: ["结构与复合物预测", "Structure and complex prediction"],
    recommendation: [
      "计算环境 + 标准模型；抗体模型与大型搜索数据库按需选择",
      "Compute and standard model; antibody model and large search databases are optional",
    ],
    recommended: ["compute", "standard", "boltz", "boltz-models"],
    matches: (p) =>
      p.engine === "opendde" || p.engine === "boltz" || p.id === "harness",
  },
  {
    id: "generation",
    title: ["小分子生成与优化", "Molecule generation and optimization"],
    recommendation: [
      "独立环境 + CrossDocked Cα 条件模型；其他模型按需选择",
      "Isolated runtime and CrossDocked Cα conditional model; other models are optional",
    ],
    recommended: [
      "diffsbdd",
      "diffsbdd-model-crossdocked_ca_cond",
      "reinvent",
      "reinvent-models",
    ],
    matches: (p) => ["diffsbdd", "reinvent"].includes(p.engine ?? ""),
  },
  {
    id: "proximity",
    title: ["诱导邻近设计", "Induced proximity"],
    recommendation: [
      "一起准备三元建模环境和固定模型，再在模块中查看真实案例",
      "Prepare the ternary runtime and fixed models together, then explore the real module example",
    ],
    recommended: ["deepternary", "deepternary-models"],
    matches: (p) => p.engine === "deepternary",
  },
  {
    id: "large-libraries",
    title: ["高通量筛选与 DEL", "High-throughput screening & DEL"],
    recommendation: [
      "六模型联合检索用于非商业研究；DEL 支持解码、计数与富集分析",
      "Six-model retrieval for noncommercial research; DEL decoding, counts and enrichment",
    ],
    recommended: [
      "drugclip",
      "drugclip-models",
      "deli",
      "public-dataset-examples",
      "supplier-libraries",
    ],
    matches: (p) =>
      ["drugclip", "deli"].includes(p.engine ?? "") ||
      ["public-dataset-examples", "supplier-libraries"].includes(p.id),
  },
  {
    id: "biologics",
    title: ["抗体与生物药", "Antibodies & biologics"],
    recommendation: [
      "ANARCII 编号 + Sapiens 人源参考评估",
      "ANARCII numbering and Sapiens human reference assessment",
    ],
    recommended: [
      "anarcii",
      "sapiens",
      "ligandmpnn",
      "ligandmpnn-models",
      "boltzgen",
      "boltzgen-models",
    ],
    matches: (p) =>
      ["anarcii", "sapiens", "ligandmpnn", "boltzgen"].includes(
        p.engine ?? "",
      ) || ["anarcii", "sapiens"].includes(p.id),
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
export function visibleDeploymentActivity(data: Deployment) {
  const latest = new Set<string>();
  return data.operations.filter((operation) => {
    const first = !latest.has(operation.package);
    latest.add(operation.package);
    return (
      pendingStates.has(operation.state) ||
      (first && operation.state === "failed")
    );
  });
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
