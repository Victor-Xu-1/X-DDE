import type { MoleculeRef } from "../research/types";
export type ProximityMechanism =
  "protac" | "riptac" | "proximity" | "molecular_glue";
export interface TernaryPayload {
  kind: "deepternary";
  mechanism: ProximityMechanism;
  input_mode: "binary_poses" | "shared_complex";
  partner_a_name: string;
  partner_b_name: string;
  partner_a_chain: string;
  partner_b_chain: string;
  samples: 3 | 10 | 20;
  attempt_budget: number;
  wall_seconds: number;
  arm_a_map: number[];
  arm_b_map: number[];
  binding_region_a: number[];
  binding_region_b: number[];
  ligand_correction: boolean;
  [key: string]: unknown;
}
export interface AssemblyQuality {
  accepted: boolean;
  bond_violations: { a: number; b: number; length_angstrom: number }[];
  intramolecular_severe_pairs: number;
  ligand_partner_a_severe_pairs: number;
  ligand_partner_b_severe_pairs: number;
  partner_partner_severe_pairs: number;
  stereochemistry_preserved: boolean;
  arms: {
    rmsd_from_binary_angstrom: number | null;
    contacting_heavy_atoms: number;
  }[];
  relaxation: { status: string; difference_kcal_mol: number | null };
}
export interface AssemblyProposal {
  id: string;
  seed: number;
  complex_artifact: string;
  ligand_artifact: string;
  partner_artifacts: string[];
  ranking_surrogate: number | null;
  quality: AssemblyQuality;
}
export interface TernaryResult {
  mechanism: ProximityMechanism;
  source_ligand: MoleculeRef;
  ligand_atom_indices: number[];
  partner_mapping: {
    output_chain: string;
    source: MoleculeRef;
    atoms: unknown[];
  }[];
  arm_maps: number[][];
  attachment_geometry?: {
    method: "source_graph_region_boundary_direction_v1";
    scope: "observed_bond_direction_not_allowed_growth_or_clearance";
    assemblies: {
      id: string;
      ligand_artifact: string;
      sha256: string;
      bonds: AttachmentBond[];
    }[];
  };
  assemblies: AssemblyProposal[];
  search: {
    requested: number;
    attempted: number;
    returned: number;
    status: string;
  };
}
export interface AttachmentBond {
  id: string;
  region: "a" | "b";
  region_atom: number;
  outside_atom: number;
  region_element: string;
  outside_element: string;
  origin: [number, number, number];
  target: [number, number, number];
  bond_length_angstrom: number;
  direction: [number, number, number] | null;
}
export const mechanismLabels = {
  protac: ["PROTAC 降解剂", "PROTAC degrader"],
  riptac: ["RIPTAC", "RIPTAC"],
  molecular_glue: ["分子胶", "Molecular glue"],
  proximity: ["其他诱导邻近分子", "Other induced-proximity molecule"],
} as const;
export function partnerRoles(mechanism: ProximityMechanism, zh: boolean) {
  if (mechanism === "protac")
    return zh
      ? ["招募端 · E3 连接酶", "目标蛋白"]
      : ["Recruiting partner · E3 ligase", "Protein of interest"];
  if (mechanism === "riptac")
    return zh
      ? ["靶向蛋白", "效应蛋白"]
      : ["Targeting protein", "Effector protein"];
  return zh
    ? ["结合伙伴 1", "结合伙伴 2"]
    : ["Binding partner 1", "Binding partner 2"];
}
