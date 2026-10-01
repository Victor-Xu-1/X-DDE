import type { BaseTask } from "../operations/types";
export interface EvidenceHit {
  id: string;
  name: string;
  entity: "target" | "disease";
  description?: string | null;
}
export interface EvidenceLookup {
  hits: EvidenceHit[];
  total: number;
  source: string;
}
export interface TargetResearchTask extends BaseTask {
  operation: "target_research";
  entity: "target" | "disease";
  identifier: string;
  include_materials: boolean;
  limit: number;
  allow_external: true;
}
export interface Association {
  score: number;
  target?: { id: string; approvedSymbol: string; approvedName: string };
  disease?: { id: string; name: string };
}
export interface TargetResearchResult {
  operation: "target_research";
  analysis_reference?: import("../research/types").MoleculeRef;
  request: TargetResearchTask;
  retrieved_at: string;
  entity: {
    id: string;
    name?: string;
    approvedSymbol?: string;
    approvedName?: string;
    biotype?: string;
    tractability?: { label: string; modality: string; value: boolean }[];
    associatedTargets?: { count: number; rows: Association[] };
    associatedDiseases?: { count: number; rows: Association[] };
  };
  sources: {
    source: string;
    status: "ok" | "empty" | "ambiguous" | "unavailable";
    reason?: string;
  }[];
  materials: {
    reference?: import("../research/types").MoleculeRef;
    accession: string;
    sequence: string;
    artifact: string;
    sha256: string;
    structure_total: number;
    structures: { id: string; properties: { key: string; value: string }[] }[];
  }[];
  activities: null | {
    status: string;
    target?: string;
    total: number | null;
    rows: {
      activity_id: number;
      molecule_chembl_id: string;
      canonical_smiles?: string;
      standard_type: string;
      standard_relation: string;
      standard_value: string | null;
      standard_units: string | null;
      assay_chembl_id: string;
      assay_description: string;
      data_validity_comment?: string | null;
      potential_duplicate?: boolean;
    }[];
  };
}
