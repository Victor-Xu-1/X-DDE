import type { BaseTask } from "../operations/types";
import type { MoleculeRef } from "../research/types";
export type ScreenMode =
  "inventory" | "similarity" | "substructure" | "diversity" | "filter";
export interface LibraryRef {
  asset_id: string;
  sha256: string;
}
export interface ScreenOptions {
  mode: ScreenMode;
  max_selected: number;
  minimum_similarity: number;
  deduplicate: boolean;
  minimum_mw: number;
  maximum_mw: number;
  minimum_logp: number;
  maximum_logp: number;
  seed: number;
  cpu: number;
  memory_mib: number;
}
export const screenDefaults: ScreenOptions = {
  mode: "inventory",
  max_selected: 20,
  minimum_similarity: 0.6,
  deduplicate: true,
  minimum_mw: 100,
  maximum_mw: 700,
  minimum_logp: -3,
  maximum_logp: 7,
  seed: 2026,
  cpu: 1,
  memory_mib: 2048,
};
export const screenLabels: Record<ScreenMode, [string, string]> = {
  inventory: ["整理分子库", "Organize the library"],
  similarity: ["找类似分子", "Find similar molecules"],
  substructure: ["寻找相同片段", "Find the same chemical substructure"],
  diversity: ["挑多样性代表", "Select diverse representatives"],
  filter: ["按性质范围筛选", "Filter by descriptor ranges"],
};
export interface LibraryScreenTask extends BaseTask {
  operation: "library_screen";
  library: LibraryRef;
  query: MoleculeRef | null;
  options: ScreenOptions;
}
export interface ScreenRow {
  record: number;
  available: boolean;
  eligible: boolean;
  selected: boolean;
  output_record: number | null;
  similarity: number | null;
  substructure_match: boolean | null;
  reason: string | null;
  reason_code:
    | "duplicate"
    | "similarity_threshold"
    | "substructure_mismatch"
    | "descriptor_range"
    | "count_budget"
    | "invalid_record"
    | null;
  duplicate_of: number | null;
  reference?: MoleculeRef;
  descriptors: null | {
    smiles: string;
    mw: number;
    logp: number;
    tpsa: number;
    qed: number;
    hbd: number;
    hba: number;
    rotatable_bonds: number;
    fragments: number;
  };
}
export interface LibraryScreenResult {
  operation: "library_screen";
  library: LibraryRef;
  query: MoleculeRef | null;
  options: ScreenOptions;
  rows: ScreenRow[];
  selected_records: number[];
  artifact: string;
  sha256: string;
}

export function screenReason(row: ScreenRow, zh: boolean) {
  if (!zh) return row.reason;
  if (row.reason_code === "duplicate")
    return row.duplicate_of === null
      ? "重复结构"
      : `重复结构，保留原始第 ${row.duplicate_of + 1} 条`;
  return row.reason_code
    ? {
        similarity_threshold: "相似度未达到本次选择的范围",
        substructure_mismatch: "不包含所选参照片段",
        descriptor_range: "性质超出本次选择的范围",
        count_budget: "符合条件，但超出本次保留数量",
        invalid_record: "记录无法解析或超出此方法的支持范围",
        duplicate: "重复结构",
      }[row.reason_code]
    : row.reason;
}
