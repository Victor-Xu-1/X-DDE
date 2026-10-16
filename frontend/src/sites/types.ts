import type { MoleculeRef } from "../research/types";
import type { Site } from "../pockets/types";
import type { Address } from "../receptors/types";
import type { defaults } from "./generated";
import type { DockingTask } from "../docking/types";
export type SiteOptions = typeof defaults;
export interface SiteInput {
  name: string;
  ensemble_id: string;
  pocket_jobs: string[];
  options: SiteOptions;
}
export interface Observation {
  member_index: number;
  protein: MoleculeRef;
  source_job: string;
  method: string;
  profile: string;
  software_version: string;
  protein_artifact: string;
  native_pocket_count: number;
  truncated: boolean;
  pockets: Site[];
}
export interface SiteEvidence {
  id: string;
  member_index: number;
  native: Site;
  mapped_residues: Address[];
  mapping_coverage: number;
  mapping_status: "sufficient" | "insufficient";
  center: [number, number, number];
}
export interface SiteRelation {
  left: string;
  right: string;
  center_distance: number;
  shared_residues: number;
  residue_jaccard: number;
  status: "associated" | "not_associated" | "uncertain";
  reasons: string[];
}
export interface PredictedSiteSet {
  schema_version?: 1;
  id: string;
  request: SiteInput;
  observations: Observation[];
  sites: SiteEvidence[];
  relations: SiteRelation[];
  groups: {
    id: string;
    sites: string[];
    status: "associated" | "ambiguous" | "unmatched" | "uncertain";
    missing_observed_members: number[];
  }[];
  created_at: string;
}

export type DefinedSearch = NonNullable<DockingTask["search"]>;
export interface DefinedRegion {
  label: string;
  member_index: number;
  search: DefinedSearch;
}
export interface DefinedSiteInput {
  kind: "defined_regions";
  name: string;
  ensemble_id: string;
  regions: DefinedRegion[];
}
export interface DefinedSiteSet {
  schema_version: 2;
  id: string;
  request: DefinedSiteInput;
  reference: MoleculeRef;
  alignment_job: string;
  sites: {
    id: string;
    member_index: number;
    protein: MoleculeRef;
    label: string;
    search: DefinedSearch;
  }[];
  scientific_scope: "defined_search_conditions_not_predicted_or_observed_binding";
  created_at: string;
}
export type SiteSet = PredictedSiteSet | DefinedSiteSet;
