import type { Component, Parameters, Prediction } from "../types";

export type AssetKind =
  | "structure"
  | "ligand"
  | "msa"
  | "template"
  | "config"
  | "sequences"
  | "library"
  | "counts"
  | "reads";
export interface Asset {
  id: string;
  name: string;
  kind: AssetKind;
  suffix: string;
  size: number;
  sha256: string;
  created_at: string;
}
export interface BondAtom {
  entity: number;
  copy_index: number | null;
  position: number;
  atom: string;
}
export interface CovalentBond {
  left: BondAtom;
  right: BondAtom;
}
export interface BaseTask {
  constraints?: import("../constraints/types").ConstraintReference | null;
  name: string;
  project_id?: string | null;
  scientific_inputs?: import("../research/types").MoleculeRef[];
}
export interface FeatureTask extends BaseTask {
  operation: "msa" | "mt" | "prep" | "inspect";
  components: Component[];
  parameters: Parameters;
  covalent_bonds?: CovalentBond[];
}
export interface ConversionTask extends BaseTask {
  operation: "json";
  assets: string[];
  altloc: string;
  assembly_id?: string | null;
  include_discont_poly_poly_bonds: boolean;
}
export interface PropertyTask extends BaseTask {
  operation: "properties";
  smiles: string[];
  ligand_files: string[];
}
export interface ResourceTask extends BaseTask {
  operation: "resources";
  targets: ("standard" | "abag" | "common" | "search")[];
  allow_network: boolean;
}
export interface HarnessTask extends BaseTask {
  operation: "harness";
  tool: string;
  payload: Record<string, unknown>;
  allow_external: boolean;
}
export type TaskRequest =
  | import("../datasets/types").DatasetTask
  | import("../integrations/types").ScientificTask
  | Prediction
  | import("../humanization/types").HumanizationTask
  | import("../admet/types").AdmetTask
  | import("../quality/types").PoseQualityTask
  | import("../antibodies/types").AntibodyNumberTask
  | import("../chemistry/screen-types").LibraryScreenTask
  | import("../receptors/preparation-types").StructurePrepareTask
  | import("../discovery/reference-types").ReferenceImportTask
  | import("../discovery/types").TargetResearchTask
  | import("../chemistry/types").MolecularStatesTask
  | import("../viewer/pose-types").MoleculeMinimizeTask
  | import("../receptors/types").ReceptorTask
  | FeatureTask
  | ConversionTask
  | PropertyTask
  | ResourceTask
  | HarnessTask
  | import("../diffsbdd/types").DiffTask
  | import("../pockets/types").PocketSearch
  | import("../docking/types").DockingTask
  | (BaseTask & { operation: "doctor" });
export const isPrediction = (value: TaskRequest): value is Prediction =>
  !value.operation || value.operation === "predict";
export const componentsOf = (value: TaskRequest | undefined): Component[] =>
  value && "components" in value ? value.components : [];
export interface OperationResult {
  operation: string;
  complete: boolean;
  core_verification?: import("../diffsbdd/types").CoreVerificationData;
  molecules?: import("../types").LigandProperties[];
  atoms?: (BondAtom & { chain: string; residue: string; element: string })[];
  structure?: string;
  documents?: string[];
  notes?: string;
  [key: string]: unknown;
}
