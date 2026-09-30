import type { BaseTask } from "../operations/types";
import type { MoleculeRef } from "../research/types";
import type { ResidueRef } from "../diffsbdd/types";
export interface PocketSearch extends BaseTask {
  operation: "pocket_search";
  protein: MoleculeRef;
  profile: "experimental" | "predicted";
  threads: number;
  memory_mib: number;
  point_threshold: number;
  minimum_cluster: number;
  review_limit: number;
}
export interface Site {
  rank: number;
  name: string;
  score: number;
  probability: number;
  center_x: number;
  center_y: number;
  center_z: number;
  residues: ResidueRef[];
}
export interface PocketResult {
  operation: "pocket_search";
  complete: true;
  protein: MoleculeRef;
  pockets: Site[];
  native_pocket_count: number;
  truncated: boolean;
  profile: string;
  software_version: string;
  protein_artifact: string;
}
