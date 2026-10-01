import type { BaseTask } from "../operations/types";
import type { MoleculeRef } from "../research/types";
import type { LibraryRef } from "../chemistry/screen-types";

export type SourceKind = "molecule" | "library";
export type AdmetView = "adme" | "safety" | "all";
export interface AdmetOptions {
  view: AdmetView;
  cpu: number;
  memory_mib: number;
}
export interface AdmetTask extends BaseTask {
  operation: "admet_predict";
  molecule: MoleculeRef | null;
  library: LibraryRef | null;
  options: AdmetOptions;
}
export interface Endpoint {
  id: string;
  name: string;
  category: string;
  task_type: "classification" | "regression";
  unit: string;
  species: string;
  source_url: string;
  source_dataset_size: number;
  reference_metrics: Record<string, number>;
}
export interface AdmetRow {
  record: number;
  name: string;
  smiles: string | null;
  duplicate_of_record: number | null;
  status: "predicted" | "failed";
  reason: string | null;
  predictions: Record<string, number>;
  reference?: MoleculeRef;
  preview: string | null;
}
export interface AdmetResult {
  operation: "admet_predict";
  complete: true;
  schema_version: 1;
  source: MoleculeRef | LibraryRef;
  source_kind: SourceKind;
  source_name: string;
  options: AdmetOptions;
  rows: AdmetRow[];
  predicted_count: number;
  classification: "complete" | "partial" | "empty";
  models_executed: boolean;
  versions: Record<string, string>;
  endpoints: Endpoint[];
  upstream_commit: string;
  csv_sha256: string;
  previews_sha256: Record<string, string>;
  endpoint_metadata_sha256: string;
  drugbank_reference: "disabled";
  applicability_domain: "not_established";
  uncertainty: "not_provided_by_native_api";
}
