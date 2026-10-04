import type { BaseTask } from "../operations/types";
import type { MoleculeRef } from "../research/types";
import { screenDefaults as generatedDefaults } from "./generated";
export type ScreenMode =
  | "inventory"
  | "similarity"
  | "substructure"
  | "diversity"
  | "filter"
  | "alerts"
  | "scaffold";
export type AlertPolicy = "off" | "warn" | "exclude";
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
  alert_policy: AlertPolicy;
  alert_catalogue: "pains" | "pains_brenk";
  per_scaffold: number;
  seed: number;
  cpu: number;
  memory_mib: number;
}
export const screenDefaults: ScreenOptions = { ...generatedDefaults };
export const screenLabels: Record<ScreenMode, [string, string]> = {
  inventory: ["整理分子库", "Organize the library"],
  similarity: ["找类似分子", "Find similar molecules"],
  substructure: ["寻找相同片段", "Find the same chemical substructure"],
  diversity: ["挑多样性代表", "Select diverse representatives"],
  filter: ["按性质范围筛选", "Filter by descriptor ranges"],
  alerts: ["检查结构风险", "Review structural alerts"],
  scaffold: ["按骨架挑代表", "Select scaffold representatives"],
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
    | "structural_alert"
    | "scaffold_quota"
    | "multiple_fragments"
    | null;
  duplicate_of: number | null;
  reference?: MoleculeRef;
  structural_alerts?: { catalogue: "PAINS" | "BRENK"; rule: string }[] | null;
  scaffold_group?: number | null;
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
  schema_version?: 1 | 2;
  report_artifact?: string | null;
  scaffold_groups?:
    | {
        index: number;
        kind: "murcko" | "acyclic";
        smiles: string;
        records: number[];
      }[]
    | null;
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
        structural_alert: "命中结构规则，按本次选择暂时排除",
        scaffold_quota: "这个骨架已有足够代表分子",
        multiple_fragments: "含多个片段，请先明确需要比较的分子",
        duplicate: "重复结构",
      }[row.reason_code]
    : row.reason;
}
