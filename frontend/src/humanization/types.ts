import type { NumberedResidue } from "../antibodies/types";
import type { BaseTask } from "../operations/types";
import type { MoleculeRef } from "../research/types";

export interface HumanizationOptions {
  mode: "evaluate" | "framework";
  format: "conventional" | "vhh_exploratory";
  iterations: number;
  max_mutations: number;
  cpu: number;
  memory_mib: number;
}
export interface HumanizationTask extends BaseTask {
  operation: "antibody_humanize";
  sequences: MoleculeRef;
  options: HumanizationOptions;
}
export interface SequenceEvaluation {
  mean_native_residue_probability: number;
  oas_peptide_fraction: number;
  matched_peptides: number;
  total_peptides: number;
  peptides: { source_position: number; sequence: string; matched: boolean }[];
}
export interface FrameworkChange {
  source_position: number;
  number: number;
  insertion: string;
  before: string;
  after: string;
  native_probability_gain: number;
}
export interface EvaluationRow {
  record: number;
  source_id: string;
  source_sequence: string;
  status: "evaluated" | "failed";
  reason: string | null;
  numbering: NumberedResidue[];
  chain_type: "H" | "K" | "L" | null;
  numbering_score: number | null;
  original_scores: Record<string, number>[] | null;
  original_evaluation: SequenceEvaluation | null;
  proposal: string | null;
  proposal_scores: Record<string, number>[] | null;
  proposal_evaluation: SequenceEvaluation | null;
  proposal_numbering: NumberedResidue[];
  proposal_chain_type: "H" | "K" | "L" | null;
  proposal_numbering_score: number | null;
  iterations: {
    iteration: number;
    input_sequence: string;
    native_scores: Record<string, number>[];
    proposal: string;
    changes: FrameworkChange[];
  }[];
  artifact: string | null;
  artifact_sha256: string | null;
  reference?: MoleculeRef;
}
export interface HumanizationResult {
  operation: "antibody_humanize";
  complete: true;
  source: MoleculeRef;
  options: HumanizationOptions;
  rows: EvaluationRow[];
  evaluated_count: number;
  proposal_count: number;
  classification: "complete" | "partial" | "empty";
  versions: Record<string, string>;
  metadata_sha256: string;
  scheme: "imgt";
  sapiens_executed: boolean;
  clinical_immunogenicity: "not_predicted";
  binding_retention: "not_established";
  paired_chain_compatibility: "not_evaluated";
  vhh_scope: "human_heavy_reference_exploration_only" | "conventional_vh_vl";
}
