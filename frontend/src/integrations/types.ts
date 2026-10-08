import type { BaseTask } from "../operations/types";
import type { MoleculeRef } from "../research/types";
import type { TernaryResult } from "../proximity/types";
import type { DynamicsResult, FreeEnergyResult } from "../simulations/types";
import { nativeOperations, nativeOperationPrograms } from "./operations";

export type ScientificOperation = (typeof nativeOperations)[number];
export type ScientificProgram =
  (typeof nativeOperationPrograms)[ScientificOperation];
export interface ScientificPayload {
  kind: ScientificProgram;
  [key: string]: unknown;
}
export interface ScientificTask extends BaseTask {
  operation: ScientificOperation;
  inputs: {
    role:
      | "structure"
      | "ligand"
      | "library"
      | "scaffold"
      | "partner_a"
      | "partner_b"
      | "arm_a"
      | "arm_b";
    source: MoleculeRef;
  }[];
  payload: ScientificPayload;
  options: {
    device: "cpu" | "cuda";
    cpu: number;
    memory_mib: number;
    seed: number;
  };
}
export interface NativeMetric {
  name: string;
  value: number;
  unit: string;
  method: string;
  meaning: string;
}
export interface NativeCandidate {
  id: string;
  artifact?: string | null;
  smiles?: string | null;
  sequence?: string | null;
  metrics: NativeMetric[];
  geometry:
    "predicted_structure" | "unbound_conformer" | "source_frame" | "none";
}
export interface NativeInteraction {
  kind: string;
  chain: string;
  number: number;
  residue: string;
  protein_position: [number, number, number];
  ligand_position: [number, number, number];
  distance: number;
  bridge_position?: [number, number, number] | null;
}
export interface NativeResult {
  operation: ScientificOperation;
  program: ScientificProgram;
  version: string;
  candidates: NativeCandidate[];
  metrics: NativeMetric[];
  artifact_sha256: Record<string, string>;
  model_artifact?: string | null;
  potential_artifact?: string | null;
  structure_artifact?: string | null;
  potential_unit?: "kBT/e" | null;
  interactions: NativeInteraction[];
  validation_points: { smiles: string; observed: number; predicted: number }[];
  proximity?: TernaryResult | null;
  dynamics?: DynamicsResult | null;
  free_energy?: FreeEnergyResult | null;
}
export interface PropertyModel {
  job_id: string;
  name: string;
  activity_property: string;
  activity_unit: string;
  sha256: string;
}

export const scientificForms = {
  "boltz.predict": ["boltz", "boltz_predict"],
  "reinvent.design": ["reinvent", "reinvent_design"],
  "ligandmpnn.design": ["ligandmpnn", "ligandmpnn_design"],
  "boltzgen.design": ["boltzgen", "boltzgen_design"],
  "openmm.refine": ["openmm", "structure_refine"],
  "apbs.potential": ["apbs", "electrostatics"],
  "chemprop.train": ["chemprop", "chemprop_train"],
  "chemprop.predict": ["chemprop", "chemprop_predict"],
  "plip.profile": ["plip", "interaction_profile"],
} as const;
export type ScientificForm = keyof typeof scientificForms;
export function isScientificForm(
  value: string | null,
): value is ScientificForm {
  return value !== null && value in scientificForms;
}
