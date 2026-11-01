import type { BaseTask } from "../operations/types";
import type { MoleculeRef } from "../research/types";
export type DockingMode = "dock" | "score" | "minimize";
export interface FlexibleResidue {
  chain: string;
  number: number;
  insertion_code: string;
}
export interface FlexibleReceptor {
  residues: FlexibleResidue[];
}
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
  flexible_receptor?: FlexibleReceptor;
}
export interface PoseResult {
  record: number;
  valid: boolean;
  artifact?: string;
  diagnostic_artifact?: string;
  reason?: string;
  smiles?: string;
  mapping_status: string;
  qualified_record?: number | null;
  reference_rmsd?: { all_heavy: number; contact: number | null } | null;
  constraint_checks?: {
    condition_id: string;
    passed: boolean;
    strength: "hard" | "soft";
    selection: "heavy_atom_centroid" | "all_heavy_atoms";
    unit: "angstrom";
    maximum_excess: number;
    tolerance_angstrom: number;
    checked_points: number;
    violations: {
      output_atom_index: number | null;
      position: [number, number, number];
      excess: [number, number, number];
    }[];
  }[];
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
  options?: { scoring?: string };
  pose_artifact: string;
  raw_pose_artifact?: string | null;
  receptor_artifact: string;
  search?: DockingTask["search"];
  search_report?: {
    center: [number, number, number];
    size: [number, number, number];
    unit: "angstrom";
    precision: "engine_log_rounded";
    automatic_ligand_extension: false;
  };
  poses: PoseResult[];
  scientific_outcome: string;
  receptor_refinement?: FlexibleReceptor & {
    method: "gnina_local_sidechains_v1";
    input_receptor_artifact: "input-receptor.pdb";
    moved_sidechain_atoms: number;
    maximum_sidechain_displacement_angstrom: number;
    convergence: "not_reported";
  };
  reference_comparison?: {
    reference: MoleculeRef;
    role: "search_reference" | "input_pose";
    status: "ready" | "different_chemical_state" | "symmetry_limit";
    method: "symmetry_aware_heavy_atom_no_fit";
    unit: "angstrom";
    heavy_atom_count: number;
    contact_atom_count: number | null;
    contact_cutoff_angstrom: number;
    symmetry_mappings: number | null;
  } | null;
}
