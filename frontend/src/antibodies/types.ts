import type { BaseTask } from "../operations/types";
import type { MoleculeRef } from "../research/types";
export interface NumberingOptions {
  mode: "accuracy" | "speed";
  scfv: boolean;
  cpu: number;
  memory_mib: number;
}
export interface AntibodyNumberTask extends BaseTask {
  operation: "antibody_number";
  sequences: MoleculeRef;
  options: NumberingOptions;
}
export interface NumberedResidue {
  number: number;
  insertion: string;
  amino_acid: string;
  source_position: number;
  region: "CDR1" | "CDR2" | "CDR3" | "framework";
}
export interface Domain {
  id: string;
  source_id: string;
  available: boolean;
  chain_type: "H" | "K" | "L" | "F" | null;
  score: number | null;
  start: number | null;
  end: number | null;
  sequence: string | null;
  numbering: NumberedResidue[];
  artifact: string | null;
  sha256: string | null;
  reason: string | null;
  reference?: MoleculeRef;
}
export interface AntibodyNumberResult {
  operation: "antibody_number";
  source: MoleculeRef;
  options: NumberingOptions;
  domains: Domain[];
  scheme: "imgt";
  input_records: { id: string; sequence: string }[];
}
