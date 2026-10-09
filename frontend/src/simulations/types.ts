import type { ScientificPayload } from "../integrations/types";

export const simulationForms = {
  "openmm.dynamics": ["openmm", "molecular_dynamics"],
  "gromacs.dynamics": ["gromacs", "gromacs_dynamics"],
  "openfe.rbfe": ["openfe", "binding_free_energy"],
} as const;
export type SimulationFormId = keyof typeof simulationForms;
export const isSimulationForm = (
  value: string | null,
): value is SimulationFormId => value !== null && value in simulationForms;
export interface SimulationPayload extends ScientificPayload {
  production_ns: number;
  equilibration_ns: number;
  temperature_kelvin: number;
  repeats: number;
  stage?: "plan" | "calculate";
  records?: number[];
}
export interface DynamicsFrame {
  artifact: string;
  time_ns: number;
  backbone_rmsd_angstrom: number;
  ligand_rmsd_angstrom: number | null;
  radius_gyration_angstrom: number;
  potential_kj_mol: number;
}
export interface Residue {
  chain: string;
  number: string;
  insertion: string;
  name: string;
}
export interface DynamicsResult {
  method: string;
  reference: string;
  contact_definition: string;
  replicas: {
    repeat: number;
    seed: number;
    trajectory: string;
    checkpoint: string;
    frames: DynamicsFrame[];
    residues: (Residue & { rmsf_angstrom: number })[];
    contacts: (Residue & { occupancy: number })[];
  }[];
}
export interface FreeEnergyNode {
  id: string;
  record: number;
  artifact: string;
  smiles: string;
}
export interface FepConvergence {
  fractions: number[];
  forward: number[];
  reverse: number[];
  forward_error: number[];
  reverse_error: number[];
}
export interface FreeEnergyLeg {
  delta_g_kcal_mol: number;
  uncertainty_kcal_mol: number;
  repeat_spread_kcal_mol: number | null;
  individual: { delta_g: number; mbar_error: number }[];
  overlap: number[][][];
  convergence: (FepConvergence | null)[];
}
export interface FreeEnergyEdge {
  id: string;
  a: string;
  b: string;
  mapping_score: number;
  atom_map: [number, number][];
  delta_delta_g_kcal_mol?: number | null;
  uncertainty_kcal_mol?: number | null;
  minimum_adjacent_overlap?: number | null;
  quality?: "review_required" | "diagnostics_available" | null;
  legs?: { complex: FreeEnergyLeg; solvent: FreeEnergyLeg } | null;
}
export interface FreeEnergyResult {
  stage: "plan" | "calculate";
  method: string;
  unit: "kcal/mol";
  direction: string;
  acceptance: "not_scientifically_accepted";
  nodes: FreeEnergyNode[];
  edges: FreeEnergyEdge[];
}
