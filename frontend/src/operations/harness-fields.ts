export interface FieldSpec {
  key: string;
  label: [string, string];
  kind:
    | "text"
    | "sequence"
    | "lines"
    | "chains"
    | "positions"
    | "asset"
    | "assets"
    | "chain-list"
    | "number"
    | "json"
    | "cdr"
    | "choice";
  choices?: { value: string | boolean; label: [string, string] }[];
  required?: boolean;
  help?: [string, string];
  min?: number;
  max?: number;
  assetKind?: "structure" | "config";
}
const structure: FieldSpec = {
  key: "structure_path",
  label: ["结构文件", "Structure file"],
  kind: "asset",
  required: true,
};
const parent: FieldSpec = {
  key: "parent_chains",
  label: ["起始序列", "Parent chains"],
  kind: "chains",
  required: true,
};
const positions: FieldSpec = {
  key: "mutable_positions",
  label: ["可变位置", "Mutable positions"],
  kind: "positions",
  required: true,
};
const binder: FieldSpec = {
  key: "binder_chain_ids",
  label: ["结合链名称", "Binder chain IDs"],
  kind: "chain-list",
  required: true,
};
const target: FieldSpec = {
  key: "target_chain_ids",
  label: ["目标链名称", "Target chain IDs"],
  kind: "chain-list",
  required: true,
};
const count: FieldSpec = {
  key: "num_sequences",
  label: ["生成数量", "Number of proposals"],
  kind: "number",
  min: 1,
  max: 256,
};
export const harnessFields: Record<string, FieldSpec[]> = {
  compare: [
    {
      key: "maximize",
      label: ["目标分数方向", "Objective direction"],
      kind: "choice",
      choices: [
        {
          value: false,
          label: ["越低越好（例如 loss）", "Lower is better (e.g. loss)"],
        },
        {
          value: true,
          label: ["越高越好（例如 ipTM）", "Higher is better (e.g. ipTM)"],
        },
      ],
    },
    {
      key: "legacy_path",
      label: ["参考候选集 JSON", "Reference population JSON"],
      kind: "asset",
      assetKind: "config",
      required: true,
    },
    {
      key: "current_path",
      label: ["当前候选集 JSON", "Current population JSON"],
      kind: "asset",
      assetKind: "config",
      required: true,
    },
    {
      key: "top_k",
      label: ["比较前多少个候选", "Number of top candidates"],
      kind: "number",
      min: 1,
      max: 256,
    },
  ],
  esm: [
    {
      key: "sequences",
      label: ["待评分序列（一行一条）", "Sequences to score (one per line)"],
      kind: "lines",
      required: true,
      help: [
        "输入完整蛋白序列，不填写 FASTA 标题。",
        "Enter protein sequences without FASTA headers.",
      ],
    },
  ],
  esm2: [
    parent,
    positions,
    count,
    {
      key: "min_llr",
      label: ["最低对数似然比", "Minimum log-likelihood ratio"],
      kind: "number",
      help: [
        "提案的模型支持阈值，保留默认 0 可作为起点；不是实验活性。",
        "Model support threshold; zero is a starting value, not measured activity.",
      ],
    },
  ],
  mpnn: [structure, parent, positions, count],
  epitope: [
    structure,
    {
      key: "antibody_chains",
      label: ["抗体链", "Antibody chains"],
      kind: "chain-list",
      required: true,
    },
    {
      key: "antigen_chains",
      label: ["抗原链", "Antigen chains"],
      kind: "chain-list",
      required: true,
    },
    { key: "cdr_regions", label: ["CDR 区域", "CDR regions"], kind: "cdr" },
    {
      key: "cutoff",
      label: ["接触距离（Å）", "Contact cutoff (Å)"],
      kind: "number",
      min: 0.1,
      max: 20,
    },
  ],
  structure: [
    {
      key: "structure_paths",
      label: ["比较结构（最多三个）", "Structures to compare (up to three)"],
      kind: "assets",
      required: true,
    },
    binder,
    target,
  ],
  rmsd: [
    {
      ...structure,
      key: "reference_path",
      label: ["参考结构", "Reference structure"],
    },
    {
      ...structure,
      key: "mobile_path",
      label: ["待比较结构", "Mobile structure"],
    },
    binder,
    target,
  ],
  evolution: [
    {
      key: "objective_key",
      label: ["使用哪个目标分数？", "Which objective?"],
      kind: "choice",
      choices: [
        {
          value: "loss",
          label: ["综合损失（越低越好）", "Combined loss (lower is better)"],
        },
        {
          value: "iptm",
          label: ["ipTM（越高越好）", "ipTM (higher is better)"],
        },
      ],
    },
    {
      key: "candidates_json_path",
      label: ["候选历史 JSON", "Candidate history JSON"],
      kind: "asset",
      assetKind: "config",
      required: true,
    },
    {
      key: "current_parent_id",
      label: ["当前亲本 ID（可选）", "Current parent ID (optional)"],
      kind: "text",
    },
  ],
  "protrek-sequence": [
    {
      key: "sequence",
      label: ["查询蛋白序列", "Query protein sequence"],
      kind: "sequence",
      required: true,
    },
    {
      key: "topk",
      label: ["返回条数", "Number of hits"],
      kind: "number",
      min: 1,
      max: 5,
    },
  ],
  "protrek-structure": [
    structure,
    {
      key: "chain",
      label: ["查询链", "Query chain"],
      kind: "text",
      required: true,
    },
    {
      key: "topk",
      label: ["返回条数", "Number of hits"],
      kind: "number",
      min: 1,
      max: 5,
    },
  ],
  "target-msa": [
    {
      key: "target_name",
      label: ["目标名称", "Target name"],
      kind: "text",
      required: true,
    },
    {
      key: "chain_id",
      label: ["目标链", "Target chain"],
      kind: "text",
      required: true,
    },
    {
      key: "sequence",
      label: ["目标序列", "Target sequence"],
      kind: "sequence",
      required: true,
    },
  ],
};
export const harnessDefaults: Record<string, Record<string, unknown>> = {
  compare: { legacy_path: "", current_path: "", top_k: 20, maximize: false },
  esm: { sequences: [], options: { offline: true, batch_size: 16 } },
  esm2: {
    parent_id: "parent-1",
    parent_chains: { B: "" },
    mutable_positions: {},
    num_sequences: 8,
    min_llr: 0,
    options: { offline: true, batch_size: 16 },
  },
  mpnn: {
    structure_path: "",
    parent_chains: { B: "" },
    mutable_positions: {},
    num_sequences: 8,
    parameters: { temperature: 0.1, relax_radius: 3, wt_bias: 2 },
  },
  fold: {
    candidates: [
      { candidate_id: "candidate-1", sequence: "", chains: { B: "" } },
    ],
    options: {
      target_chains: { A: "" },
      target_chain_ids: ["A"],
      binder_chain_ids: ["B"],
    },
  },
  epitope: {
    structure_path: "",
    antibody_chains: ["B"],
    antigen_chains: ["A"],
    cdr_regions: {},
    cutoff: 4.5,
    hotspots: [],
  },
  structure: {
    structure_paths: [],
    candidate_names: [],
    binder_chain_ids: ["B"],
    target_chain_ids: ["A"],
  },
  rmsd: {
    reference_path: "",
    mobile_path: "",
    binder_chain_ids: ["B"],
    target_chain_ids: ["A"],
  },
  evolution: {
    candidates_json_path: "",
    objective_key: "loss",
    minimize: true,
  },
  "protrek-sequence": { sequence: "", topk: 5 },
  "protrek-structure": { structure_path: "", chain: "A", topk: 5 },
  "target-msa": {
    target_name: "",
    chain_id: "A",
    sequence: "",
    required: true,
  },
};
