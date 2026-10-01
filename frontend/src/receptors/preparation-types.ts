import type { BaseTask } from "../operations/types";
import type { MoleculeRef } from "../research/types";
export interface PreparationOptions {
  model_index: number;
  chains: string[];
  format: "pdb" | "cif";
  waters: boolean;
  heterogens: "keep" | "remove";
  alternate: string;
  cpu: number;
  memory_mib: number;
}
export const preparationDefaults: PreparationOptions = {
  model_index: 0,
  chains: [],
  format: "pdb",
  waters: false,
  heterogens: "keep",
  alternate: "reject",
  cpu: 1,
  memory_mib: 2048,
};
export interface StructurePrepareTask extends BaseTask {
  operation: "structure_prepare";
  structure: MoleculeRef;
  options: PreparationOptions;
}
export interface StructurePrepareResult {
  operation: "structure_prepare";
  source: MoleculeRef;
  options: PreparationOptions;
  artifact: string;
  sha256: string;
  reference?: MoleculeRef;
  inspection: {
    model_count: number;
    selected_chains: string[];
    parser_warnings: string[];
    parser_warnings_truncated: boolean;
  };
  atom_count: number;
  removed_residues: {
    chain: string;
    number: number;
    insertion_code: string;
    resname: string;
    reason: string;
  }[];
  resolved_alternates: {
    chain: string;
    number: number;
    insertion_code: string;
    resname: string;
    atom: string;
    alternate: string;
  }[];
}
