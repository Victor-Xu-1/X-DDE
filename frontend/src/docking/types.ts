import type { BaseTask } from "../operations/types";
import type { MoleculeRef } from "../research/types";
export type DockingMode = "dock" | "score" | "minimize";
export interface SearchBox {
  center: [number, number, number];
  size: [number, number, number];
  unit: "angstrom";
}
export interface DockingTask extends BaseTask {
  operation: "docking";
  mode: DockingMode;
  receptor: MoleculeRef;
  ligand: MoleculeRef;
  search:
    | { kind: "box"; frame: MoleculeRef; box: SearchBox }
    | {
        kind: "reference_ligand";
        frame: MoleculeRef;
        reference: MoleculeRef;
        coordinate_basis: "user_confirmed";
      }
    | null;
  pose_frame: MoleculeRef | null;
  pose_coordinate_basis: "user_confirmed" | null;
  options: Record<string, unknown>;
}
export interface PoseResult {
  record: number;
  valid: boolean;
  artifact?: string;
  reason?: string;
  smiles?: string;
  mapping_status: string;
  scores: {
    name: string;
    value: number;
    unit: string;
    direction: "lower" | "higher";
  }[];
}
export interface DockingResult {
  operation: "docking";
  complete: true;
  mode: DockingMode;
  receptor: MoleculeRef;
  ligand: MoleculeRef;
  software_version: string;
  pose_artifact: string;
  receptor_artifact: string;
  poses: PoseResult[];
  scientific_outcome: string;
}
