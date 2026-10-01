import type { MoleculeRef } from "../research/types";
import type { PoseResult } from "../docking/types";
import type { defaults } from "./generated";
export type Options = typeof defaults;
export interface LigandSelection {
  reference: MoleculeRef;
  state_set_id: string | null;
  state_index: number | null;
  conformer_index: number | null;
}
export interface ExplorationInput {
  name: string;
  site_set_id: string;
  site_ids: string[];
  ligands: LigandSelection[];
  options: Options;
}
export interface Combination {
  step_id: string;
  site_id: string;
  member_index: number;
  pocket_rank: number;
  receptor: MoleculeRef;
  ligand_index: number;
  ligand: LigandSelection;
  seed: number;
}
export interface Exploration {
  id: string;
  request: ExplorationInput;
  plan_id: string;
  plan_sha256: string;
  combinations: Combination[];
  created_at: string;
}
export interface PoseSet {
  id: string;
  exploration_id: string;
  run_id: string;
  workflow_state: string;
  collection_status: "complete" | "partial";
  qualified_pose_count: number;
  outcomes: {
    combination: Combination;
    job_id: string | null;
    status: string;
    reason: string | null;
    software_version: string | null;
    initial_conformer_generated: boolean | null;
    poses: { evidence: PoseResult; reference: MoleculeRef | null }[];
  }[];
}
