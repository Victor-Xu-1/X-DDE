import type { MoleculeRef } from "../research/types";
import type { BaseTask } from "../operations/types";

export type QualityProfile = "mol" | "dock" | "redock";
export interface QualityOptions {
  profile: QualityProfile;
  cpu: number;
  memory_mib: number;
}
export interface PoseQualityTask extends BaseTask {
  operation: "pose_quality";
  molecule: MoleculeRef;
  protein: MoleculeRef | null;
  reference: MoleculeRef | null;
  coordinate_basis: "user_confirmed" | null;
  options: QualityOptions;
}
export interface PoseQualityResult {
  operation: "pose_quality";
  complete: true;
  schema_version: 1;
  inputs: Record<string, MoleculeRef>;
  options: QualityOptions;
  coordinate_basis: "user_confirmed" | null;
  classification: "passes" | "fails" | "incomplete";
  checks: { id: string; outcome: "pass" | "fail" | "unavailable" }[];
  metrics: Record<string, number>;
  previews_sha256: Record<string, string>;
  versions: Record<string, string>;
  native_config_sha256: string;
}
