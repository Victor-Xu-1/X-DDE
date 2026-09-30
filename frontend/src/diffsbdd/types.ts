import type { MoleculeRef } from "../research/types";
import type { BaseTask } from "../operations/types";
export type DesignMode = "generate" | "inpaint" | "diversify" | "optimize";
export type DiffMode =
  DesignMode | "pocket" | "prepare" | "interactions" | "properties" | "export";
export interface ResidueRef {
  structure: MoleculeRef;
  model: number;
  chain: string;
  number: number;
  insertion_code: string;
  alternate_location: string;
}
export type Pocket =
  | { kind: "residues"; residues: ResidueRef[] }
  | { kind: "bound_ligand"; residue: ResidueRef }
  | { kind: "ligand"; ligand: MoleculeRef };
export interface DiffTask extends BaseTask {
  operation: "diffsbdd";
  payload: Record<string, unknown> & { mode: DiffMode | "identity" | "edit" };
}
export interface IdentityResult {
  mode: "identity";
  complete: true;
  reference: MoleculeRef;
  molecule_artifact: string;
  identity_basis: "rdkit_removeHs_record_order";
  atoms: { index: number; element: string; selectable: boolean }[];
}
export const isDesign = (mode: string): mode is DesignMode =>
  ["generate", "inpaint", "diversify", "optimize"].includes(mode);

export interface CoreVerificationData {
  method: "rdkit_fixed_core_v1";
  preserve_bonds: boolean;
  qualified_count: number;
  qualified_sha256: string;
  candidates: {
    record: number;
    qualified_record: number | null;
    diagnostic_artifact: string | null;
    status: "passed" | "failed" | "indeterminate";
    reason: string | null;
    maximum_displacement: number | null;
    mapping: { source_atom: number; output_atom: number }[];
  }[];
}
