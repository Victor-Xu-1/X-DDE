import type { BaseTask } from "../operations/types";
import type { MoleculeRef } from "../research/types";
import type { DockingTask } from "../docking/types";

export type DatasetOperation =
  | "library_prepare"
  | "library_subset"
  | "drugclip_index"
  | "drugclip_retrieve"
  | "screening_dock"
  | "del_validate"
  | "del_enumerate"
  | "del_decode"
  | "del_count"
  | "del_analyze"
  | "del_series"
  | "del_model"
  | "del_candidates"
  | "del_followup";
export const datasetOperations: readonly DatasetOperation[] = [
  "library_prepare",
  "library_subset",
  "drugclip_index",
  "drugclip_retrieve",
  "screening_dock",
  "del_validate",
  "del_enumerate",
  "del_decode",
  "del_count",
  "del_analyze",
  "del_series",
  "del_model",
  "del_candidates",
  "del_followup",
];
export interface DatasetSource {
  job_id: string;
  report_sha256: string;
  role:
    | "library"
    | "index"
    | "definition"
    | "decoded"
    | "counts"
    | "analysis"
    | "screening"
    | "model";
}
export interface DatasetMaterial {
  role:
    | "data"
    | "structure"
    | "ligand"
    | "definition"
    | "building_blocks"
    | "counts"
    | "reads";
  source: MoleculeRef;
  label?: string;
}
export interface DatasetTask extends BaseTask {
  operation: DatasetOperation;
  inputs: DatasetMaterial[];
  sources: DatasetSource[];
  payload: {
    kind: "chemistry" | "drugclip" | "deli" | "gnina";
    mode: string;
    [key: string]: unknown;
  };
  options: {
    device: "cpu" | "cuda";
    cpu: number;
    memory_mib: number;
    seed: number;
  };
  output_bytes?: number;
  time_limit_seconds?: number;
}
export interface DatasetArtifact {
  name: string;
  sha256: string;
  size: number;
  format:
    | "sqlite"
    | "hdf5"
    | "csv"
    | "json"
    | "sdf"
    | "pdb"
    | "cif"
    | "ndjson"
    | "model";
  role: string;
}
export interface DatasetCandidate {
  id: string;
  display_name?: string;
  source_job: string | null;
  source_asset?: string | null;
  source_record: number;
  supplier: string;
  smiles: string;
  score: number | null;
  raw_score: number | null;
  docking_score: number | null;
  cnn_score: number | null;
  cnn_affinity: number | null;
  artifact: string | null;
  record: number;
  geometry: "none" | "unbound_conformer" | "binding_pose";
}
export interface DatasetResult {
  operation: DatasetOperation;
  program: string;
  version: string;
  schema_version: 1;
  complete: true;
  request_sha256: string;
  data_kind: DatasetSource["role"];
  artifacts: DatasetArtifact[];
  counts: Record<string, number>;
  candidates: DatasetCandidate[];
  metrics: Record<string, number>;
  metadata: Record<string, unknown>;
  warnings: string[];
  molecule_artifact: string | null;
  scope: "computed_data_not_experimental_affinity";
}
export interface AvailableDataset extends DatasetSource {
  name: string;
  counts: Record<string, number>;
  metadata: Record<string, unknown>;
}
export interface DELSample {
  column: string;
  group: string;
  role:
    | "target"
    | "input"
    | "ntc"
    | "matrix"
    | "competition"
    | "counter_target"
    | "reference";
  replicate: number;
  round: number;
  batch: string;
}
export interface DELComparison {
  id: string;
  selection: string;
  reference: string;
}
export interface Supplier {
  id: string;
  name: string;
  directory_group: string;
  catalogue_url: string | null;
  formats: string[];
  connection: string;
  availability_claim: string;
}
export type PocketSelection = NonNullable<DockingTask["search"]>;
