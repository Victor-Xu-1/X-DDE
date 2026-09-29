import type { Component } from "../types";
export const entityInfo = {
  protein: {
    name: ["蛋白质", "Protein"],
    field: ["单字母氨基酸序列", "One-letter amino-acid sequence"],
    placeholder: "ACDEFGHIKLMNPQRSTVWY…",
    help: [
      "粘贴一条蛋白序列或一条 FASTA。名称行、空格和换行会自动处理；不同链分别填写。",
      "Paste one protein sequence or FASTA record. Headers and whitespace are handled automatically; enter different chains separately.",
    ],
  },
  ligand: {
    name: ["小分子 / 配体", "Small molecule / ligand"],
    field: ["SMILES 或 CCD_ 编号", "SMILES or CCD_ identifier"],
    placeholder: "CCO  /  CCD_ATP",
    help: [
      "从化学结构编辑器或化合物表复制 SMILES，例如乙醇 CCO；也可用 CCD_ATP 等 PDB 化学组分编号。不会由名称自动查询化合物。",
      "Copy SMILES from a chemical structure editor or compound table (ethanol: CCO), or use a PDB identifier such as CCD_ATP. Compound names are not automatically resolved.",
    ],
  },
  dna: {
    name: ["DNA 链", "DNA strand"],
    field: ["DNA 序列", "DNA sequence"],
    placeholder: "ATGC…",
    help: [
      "使用 A/T/G/C，可接受未知碱基 N/X。每个输入框是一条链；双链 DNA 请分别添加两条序列。",
      "Use A/T/G/C; unknown bases N/X are accepted. Each field is one strand. Enter two separate strands for double-stranded DNA.",
    ],
  },
  rna: {
    name: ["RNA 链", "RNA strand"],
    field: ["RNA 序列", "RNA sequence"],
    placeholder: "AUGC…",
    help: [
      "使用 A/U/G/C，可接受未知碱基 N/X；RNA 中使用 U 而不是 T。可粘贴单条 FASTA。",
      "Use A/U/G/C; unknown bases N/X are accepted. RNA uses U instead of T. A single FASTA record is accepted.",
    ],
  },
  ion: {
    name: ["金属 / 离子", "Metal / ion"],
    field: ["离子种类", "Ion type"],
    placeholder: "MG",
    help: [
      "只在已知体系中存在该离子时添加。引擎使用 CCD 组分代码；加入离子不会自动验证其配位状态。",
      "Add only ions known to belong to your system. The engine uses CCD component codes; adding an ion does not validate its coordination state.",
    ],
  },
} satisfies Record<
  Component["kind"],
  { name: string[]; field: string[]; placeholder: string; help: string[] }
>;
export const ions = [
  ["MG", "镁", "Magnesium"],
  ["ZN", "锌", "Zinc"],
  ["CA", "钙", "Calcium"],
  ["NA", "钠", "Sodium"],
  ["K", "钾", "Potassium"],
  ["CL", "氯", "Chloride"],
  ["MN", "锰", "Manganese"],
  ["FE", "铁", "Iron"],
  ["CU", "铜", "Copper"],
  ["CO", "钴", "Cobalt"],
] as const;
