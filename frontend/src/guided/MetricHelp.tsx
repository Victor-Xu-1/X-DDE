import { Hint } from "./Hint";
import type { Language } from "../types";
export const metrics = {
  ranking: [
    "综合排序",
    "Model ranking",
    "OpenDDE 的综合结构排序分数，越高通常越优；只比较同一任务的构象，不代表结合活性。",
    "OpenDDE's combined structural ranking. Higher usually ranks better within this task; it is not binding activity.",
  ],
  plddt: [
    "蛋白局部置信度",
    "Local protein confidence",
    "pLDDT：模型对局部结构的把握程度，通常为 0–100；高分不等于高亲和力。",
    "pLDDT measures local structural confidence, usually 0–100. High confidence does not mean high affinity.",
  ],
  iptm: [
    "界面置信度",
    "Interface confidence",
    "ipTM：模型对不同链相对位置的把握程度，范围 0–1。它不是实验结合强度。",
    "ipTM expresses confidence in relative chain placement, from 0–1. It is not measured binding strength.",
  ],
  rmsd: [
    "构象差异",
    "Conformer difference",
    "与第一个构象对齐后的全体原子 RMSD，单位 Å；数值小表示形状接近，不说明活性优劣。",
    "All-atom RMSD after alignment to the first conformer, in Å. Lower means more similar geometry, not better activity.",
  ],
  mw: [
    "分子量",
    "Molecular weight",
    "分子量，单位 g/mol；由输入的小分子结构计算。",
    "Molecular weight in g/mol, calculated from the ligand input.",
  ],
  logp: [
    "脂溶性",
    "Lipophilicity",
    "RDKit 估算的 LogP，描述油水分配倾向；不是实测溶解度。",
    "RDKit-estimated LogP describes partitioning tendency; it is not measured solubility.",
  ],
  tpsa: [
    "极性表面积",
    "Polar surface area",
    "拓扑极性表面积 tPSA，单位 Å²；用于描述分子的极性。",
    "Topological polar surface area (tPSA) in Å² describes molecular polarity.",
  ],
  qed: [
    "类药性指标",
    "Drug-likeness",
    "QED，范围 0–1，是基于分子性质的综合描述；高分不保证有效或安全。",
    "QED (0–1) summarizes molecular properties. A high score does not guarantee efficacy or safety.",
  ],
  sa: [
    "合成难度估计",
    "Synthesis difficulty",
    "SA score 通常为 1–10，越低估计越易合成；不提供合成路线，也不保证能合成。",
    "SA score is typically 1–10; lower suggests easier synthesis. It is not a synthesis route or guarantee.",
  ],
  contacts: [
    "配体附近的残基",
    "Nearby residues",
    "列出与配体任一重原子距离不超过 4 Å 的蛋白残基。这里只看空间接近，不判定氢键或结合能。",
    "Protein residues with a heavy atom within 4 Å of a ligand heavy atom. This is geometric proximity, not a hydrogen-bond or binding-energy assignment.",
  ],
} as const;
export function MetricHelp({
  metric,
  language,
}: {
  metric: keyof typeof metrics;
  language: Language;
}) {
  const data = metrics[metric],
    zh = language === "zh";
  return (
    <Hint label={data[zh ? 0 : 1] + (zh ? "说明" : " help")}>
      {data[zh ? 2 : 3]}
    </Hint>
  );
}
