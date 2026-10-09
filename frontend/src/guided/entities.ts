import type { Component } from "../types";
export const entityInfo = {
  protein: {
    name: ["蛋白质", "Protein"],
    field: ["单字母氨基酸序列", "One-letter amino-acid sequence"],
    placeholder: [
      "粘贴靶蛋白序列或单条 FASTA",
      "Paste the target protein sequence or one FASTA record",
    ],
    help: [
      "粘贴一条蛋白序列或一条 FASTA。名称行、空格和换行会自动处理；不同链分别填写。",
      "Paste one protein sequence or FASTA record. Headers and whitespace are handled automatically; enter different chains separately.",
    ],
  },
  ligand: {
    name: ["小分子 / 配体", "Small molecule / ligand"],
    field: ["SMILES 或 CCD_ 编号", "SMILES or CCD_ identifier"],
    placeholder: [
      "粘贴 SMILES 或 CCD_组分编号",
      "Paste SMILES or a CCD_ component identifier",
    ],
    help: [
      "从分子绘图工具或化合物表复制 SMILES，也可使用 CCD_ 开头的 PDB 化学组分编号。使用三维分子文件时，展开下方的文件选项。",
      "Copy SMILES from a molecule editor or compound table, or use a PDB component identifier beginning with CCD_. Expand the file option below to use a 3D molecule file.",
    ],
  },
  dna: {
    name: ["DNA 链", "DNA strand"],
    field: ["DNA 序列", "DNA sequence"],
    placeholder: [
      "粘贴本条 DNA 链的序列",
      "Paste the sequence of this DNA strand",
    ],
    help: [
      "使用 A/T/G/C，可接受未知碱基 N/X。每个输入框是一条链；双链 DNA 请分别添加两条序列。",
      "Use A/T/G/C; unknown bases N/X are accepted. Each field is one strand. Enter two separate strands for double-stranded DNA.",
    ],
  },
  rna: {
    name: ["RNA 链", "RNA strand"],
    field: ["RNA 序列", "RNA sequence"],
    placeholder: [
      "粘贴本条 RNA 链的序列",
      "Paste the sequence of this RNA strand",
    ],
    help: [
      "使用 A/U/G/C，可接受未知碱基 N/X；RNA 中使用 U 而不是 T。可粘贴单条 FASTA。",
      "Use A/U/G/C; unknown bases N/X are accepted. RNA uses U instead of T. A single FASTA record is accepted.",
    ],
  },
  ion: {
    name: ["金属 / 离子", "Metal / ion"],
    field: ["离子种类", "Ion type"],
    placeholder: [
      "选择体系中已知的离子",
      "Choose an ion known to be present in the system",
    ],
    help: [
      "只在已知体系中存在该离子时添加。引擎使用 CCD 组分代码；加入离子不会自动验证其配位状态。",
      "Add only ions known to belong to your system. The engine uses CCD component codes; adding an ion does not validate its coordination state.",
    ],
  },
} satisfies Record<
  Component["kind"],
  {
    name: string[];
    field: string[];
    placeholder: readonly [string, string];
    help: string[];
  }
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
