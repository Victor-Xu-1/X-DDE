import type { BaseTask } from "../operations/types";
import type { MoleculeRef, ScientificObject } from "../research/types";
import type { NativePoseScore } from "./PoseScore";

export type PoseSource =
  | { kind: "asset"; asset_id: string; record: number }
  | { kind: "artifact"; job_id: string; name: string; record: number }
  | {
      kind: "indexed";
      job_id: string;
      member_id: string;
      report_sha256: string;
    }
  | { kind: "version"; version_id: string };
export interface MoleculeMinimizeTask extends BaseTask {
  operation: "molecule_minimize";
  molecule: MoleculeRef;
  options: { force_field: "MMFF94s" | "UFF"; max_iterations: number };
}
export interface PoseEnergy {
  before: number;
  after: number;
  method: "MMFF94s" | "UFF";
  unit: "kcal/mol";
  converged: boolean;
}
export interface SavedPose {
  job_id: string;
  pose: ScientificObject;
  energy: PoseEnergy | null;
  native_score: NativePoseScore | null;
  receptor: MoleculeRef | null;
}
export interface PreviewPose {
  urls: string[];
  records?: number[];
  source: PoseSource | null;
  receptor: PoseSource | null;
  score?: NativePoseScore | null;
  energy?: PoseEnergy | null;
  versionId?: string;
}
