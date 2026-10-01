import type { MoleculeRef } from "../research/types";
import type { PoseResult } from "../docking/types";
export interface PoseSelector {
  step_id: string;
  record: number;
}
export interface ScoreComparison {
  id: string;
  exploration_id: string;
  request: {
    pose_set_id: string;
    selections: PoseSelector[];
    metrics: string[];
  };
  pose_set_sha256: string;
  created_at: string;
  scientific_scope: "score_tradeoffs_not_binding_proof_or_pose_clustering";
  groups: {
    condition_sha256: string;
    conditions: Record<string, unknown>;
    poses: {
      selection: PoseSelector;
      reference: MoleculeRef;
      scores: PoseResult["scores"];
      front: number | null;
      missing_metrics: string[];
    }[];
  }[];
}
