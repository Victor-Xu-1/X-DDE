import type { MoleculeRef } from "../research/types";
import type { BaseTask } from "../operations/types";
import type { defaults } from "./generated";
export type EnsembleOptions = typeof defaults;
export interface Address {
  chain: string;
  number: number;
  insertion_code: string;
}
export interface Selection {
  model_index: number;
  chains: string[];
  profile: "unspecified" | "experimental" | "predicted";
  chain_pairs: { reference: string; moving: string }[];
  residue_pairs: { reference: Address; moving: Address }[];
}
export interface ReceptorInput {
  structure: MoleculeRef;
  selection: Selection;
}
export interface ReceptorTask extends BaseTask {
  operation: "receptor_ensemble";
  inputs: ReceptorInput[];
  options: EnsembleOptions;
}
export interface MemberEvidence {
  index: number;
  source: ReceptorInput;
  status: "reference" | "aligned" | "rejected";
  artifact: string | null;
  artifact_sha256: string | null;
  reason: string | null;
  correspondence: {
    method: string;
    pair_count: number;
    identity: number;
    coverage: number;
  } | null;
  transformation: {
    rotation: number[][];
    translation: number[];
    rmsd_angstrom: number;
    residue_pairs: { reference: Address; moving: Address }[];
  } | null;
  quality: {
    atom_count: number;
    selected_model_index: number;
    selected_chains: string[];
    backbone_complete: boolean;
    incomplete_backbone: { chain: string; number: number; missing: string[] }[];
    protein_chains: {
      chain: string;
      observed_ca_count: number;
      sequence: string;
    }[];
    parser_warnings: string[];
    source_profile: string;
  } | null;
}
export interface ReceptorResult {
  operation: "receptor_ensemble";
  members: MemberEvidence[];
  options: EnsembleOptions;
  qualified_count: number;
  collection_status: "aligned" | "partial";
  versions: Record<string, string>;
}
export interface ReceptorSet {
  id: string;
  source_job: string;
  members: { reference: MoleculeRef | null; evidence: MemberEvidence }[];
  options: EnsembleOptions;
  qualified_count: number;
  collection_status: "aligned" | "partial";
}
