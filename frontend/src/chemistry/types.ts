import type { MoleculeRef } from "../research/types";
import type { BaseTask } from "../operations/types";
import type { defaults } from "./generated";
export type StateOptions = Omit<typeof defaults, "force_field"> & {
  force_field: "MMFF94s" | "UFF" | "none";
};
export interface MolecularStatesTask extends BaseTask {
  operation: "molecular_states";
  molecule: MoleculeRef;
  options: StateOptions;
}
export interface PreparedState {
  index: number;
  smiles: string;
  charge: number;
  formula: string;
  source_to_state_atoms: number[];
  conformer_status: string;
}
export interface PreparedConformer {
  record: number;
  state_index: number;
  native_conformer: number;
  artifact: string;
  artifact_sha256: string;
  energy: number | null;
  converged: boolean | null;
  source_to_conformer_atoms: number[];
}
export interface StateResult {
  operation: "molecular_states";
  complete: true;
  states: PreparedState[];
  conformers: PreparedConformer[];
  state_artifact: string;
  conformer_artifact: string;
  artifact_sha256: Record<string, string>;
  coverage: {
    budget_limited: boolean;
    rejected: number;
    protonation_rejected: number;
  };
  versions: Record<string, string>;
}
export interface StateSet {
  id: string;
  source_job: string;
  source: MoleculeRef;
  members: {
    reference: MoleculeRef;
    evidence: PreparedState;
    conformers: { reference: MoleculeRef; evidence: PreparedConformer }[];
  }[];
}
