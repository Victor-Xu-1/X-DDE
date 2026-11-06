import type { NativeConfidence } from "../viewer/confidence-types";

export interface Confidence {
  metric: string;
  token_count: number;
  indices: number[];
  stride: number;
  matrix: number[][];
  atom_plddt: { index: number; value: number }[];
  atom_stride: number;
  atom_plddt_unit?: string;
  token_plddt?: { index: number; value: number }[];
  token_plddt_unit?: string;
  source_integrity?: "recorded" | "current_files";
  mapping_status?: "available" | "not_retained" | "unsupported";
  native_artifact: string;
  native_sha256?: string;
  structure_artifact?: string;
  binding?: NativeConfidence | null;
}
