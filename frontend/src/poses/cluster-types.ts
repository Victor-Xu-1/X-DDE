import type { MoleculeRef } from "../research/types";
import type { BaseTask } from "../operations/types";
export interface ClusterOptions {
  criterion: "geometry" | "contacts" | "both";
  maximum_rmsd_angstrom: number;
  minimum_contact_jaccard: number;
  contact_cutoff_angstrom: number;
  minimum_contact_mapping: number;
  maximum_symmetry_maps: number;
  cpu: number;
  memory_mib: number;
}
export interface PoseSelector {
  step_id: string;
  record: number;
}
export interface ResidueAddress {
  chain: string;
  number: number;
  insertion_code: string;
}
export interface ClusterPose {
  selection: PoseSelector;
  reference: MoleculeRef;
  member_index: number;
}
export interface PoseClusterTask extends BaseTask {
  operation: "pose_cluster";
  pose_set_id: string;
  pose_set_sha256: string;
  site_set_sha256: string;
  receptor_set_id: string;
  receptor_set_sha256: string;
  frame: MoleculeRef;
  receptors: {
    member_index: number;
    reference: MoleculeRef;
    residue_pairs: { reference: ResidueAddress; moving: ResidueAddress }[];
    expected_alignment_rmsd_angstrom: number;
  }[];
  poses: ClusterPose[];
  options: ClusterOptions;
}
export interface ClusterRow extends ClusterPose {
  index: number;
  receptor: MoleculeRef;
  identity_smiles: string;
  heavy_atom_count: number;
  contact_count: number;
  mapped_contact_count: number;
  contact_mapping_coverage: number | null;
  contacts: {
    residue: ResidueAddress;
    reference_residue: ResidueAddress | null;
    distance_angstrom: number;
  }[];
  contacts_truncated: boolean;
  pose_artifact: string;
  receptor_artifact: string;
}
export interface ClusterPair {
  left: number;
  right: number;
  same_chemical_graph: boolean;
  rmsd_angstrom: number | null;
  atom_mapping_status: string;
  symmetry_maps: number;
  contact_jaccard: number | null;
  contact_status: string;
}
export interface PoseClusterResult {
  operation: "pose_cluster";
  complete: true;
  frame: MoleculeRef;
  options: ClusterOptions;
  rows: ClusterRow[];
  pairs: ClusterPair[];
  clusters: {
    id: number;
    members: number[];
    representative: number;
    sample_count: number;
  }[];
  artifacts: Record<string, string>;
}
