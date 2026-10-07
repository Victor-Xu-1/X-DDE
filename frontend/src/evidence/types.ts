import type { MoleculeRef } from "../research/types";
export type Endpoint =
  | "KD"
  | "Ki"
  | "IC50"
  | "EC50"
  | "DC50"
  | "Dmax"
  | "inhibition"
  | "expression"
  | "qualitative";
export interface Conditions {
  target: string;
  assay: string;
  species: string;
  construct: string;
  batch: string;
  temperature_c: number | null;
  ph: number | null;
  buffer: string;
  method: string;
}
export interface Columns {
  compound: string;
  value: string;
  relation: string;
  replicate: string;
  endpoint: string;
  unit: string;
  uncertainty: string;
  batch: string;
}
export interface EvidenceInput {
  name: string;
  source: MoleculeRef;
  conditions: Conditions;
  endpoint: Endpoint;
  unit: string;
  columns: Columns;
  delimiter: "," | "\t" | ";";
  uncertainty_kind: "sd" | "sem";
  citation: string;
  reported_by: string;
  compound_links: Record<string, MoleculeRef>;
  parent_id: string | null;
}
export interface Observation {
  id: string;
  source_row: number;
  compound: string;
  molecule: MoleculeRef | null;
  material_kind: "molecule" | "structure" | "sequence" | null;
  endpoint: Endpoint;
  reported_value: string;
  reported_unit: string;
  relation: "=" | "<" | "<=" | ">" | ">=" | "~";
  replicate: string;
  conditions: Conditions;
  value: number | null;
  normalized_value: number | null;
  normalized_unit: string;
  issues: string[];
  comparison_group: string;
  uncertainty: null | { kind: "sd" | "sem"; value: number; unit: string };
}
export interface EvidenceDocument {
  id: string;
  request: EvidenceInput;
  observations: Observation[];
  created_at: string;
  source_kind: "reported_experimental_observations";
  summaries: {
    comparison_group: string;
    compound: string;
    endpoint: Endpoint;
    unit: string;
    reported_count: number;
    exact_count: number;
    censored_count: number;
    median_if_exact: number | null;
    incompatible_reported_bounds: boolean;
    conditions: Conditions;
    molecule: MoleculeRef | null;
  }[];
}
export interface EvidencePreview {
  total: number;
  linked: number;
  observations: Observation[];
}
export const blankConditions: Conditions = {
  target: "",
  assay: "",
  species: "",
  construct: "",
  batch: "",
  temperature_c: null,
  ph: null,
  buffer: "",
  method: "",
};
export const blankColumns: Columns = {
  compound: "",
  value: "",
  relation: "",
  replicate: "",
  endpoint: "",
  unit: "",
  uncertainty: "",
  batch: "",
};
