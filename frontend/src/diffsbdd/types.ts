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
  payload: Record<string, unknown> & { mode: DiffMode | "identity" };
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
