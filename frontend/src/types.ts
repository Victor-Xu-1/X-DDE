import type { CovalentBond, TaskRequest } from "./operations/types";
export type Language = "zh" | "en";
export type Status =
  | "queued"
  | "running"
  | "cancelling"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "interrupted";
export interface Component {
  kind: "protein" | "ligand" | "dna" | "rna" | "ion";
  value: string;
  count: number;
  chain_ids?: string[];
  modifications?: { position: number; ccd: string }[];
  ligand_file?: string | null;
  paired_msa?: string | null;
  unpaired_msa?: string | null;
  template_hits?: string | null;
}
export interface Parameters {
  seed: number;
  samples: number;
  steps: number;
  cycles: number;
  dtype: "bf16" | "fp32";
  model?: "standard" | "abag";
  checkpoint_id?: string | null;
  additional_seeds?: number[];
  device?: "cuda" | "cpu";
  gpu_ids?: number[];
  distributed?: boolean;
  tfg?: boolean;
  atom_confidence?: boolean;
  triatt_kernel?: "auto" | "cuequivariance" | "torch";
  trimul_kernel?: "auto" | "cuequivariance" | "torch";
  enable_cache?: boolean;
  enable_fusion?: boolean;
  enable_tf32?: boolean;
  deterministic?: boolean;
  feature_mode?: "none" | "uploaded" | "search";
  use_template?: boolean;
  use_rna_msa?: boolean;
  allow_network?: boolean;
  search_cpus?: number;
}
export interface Prediction {
  scientific_inputs?: import("./research/types").MoleculeRef[];
  operation?: "predict";
  name: string;
  components: Component[];
  parameters: Parameters;
  project_id?: string | null;
  covalent_bonds?: CovalentBond[];
}
export interface Project {
  id: string;
  name: string;
  description: string;
  created_at: string;
}
export interface LigandProperties {
  input: string;
  available: boolean;
  reason?: string;
  smiles?: string;
  mw?: number;
  logp?: number;
  tpsa?: number;
  qed?: number;
  sa?: number;
  hbd?: number;
  hba?: number;
  rotatable_bonds?: number;
}
export interface Contact {
  residue: string;
  distance: number;
  protein_atom: string;
  ligand_atom: string;
}
export interface Candidate {
  id: string;
  artifact: string;
  aligned_artifact?: string | null;
  atom_count: number;
  chains: string[];
  ranking_score: number | null;
  plddt: number | null;
  ptm: number | null;
  iptm: number | null;
  has_clash: boolean | null;
  rmsd_to_first: number | null;
  contacts: Contact[];
}
export interface Analysis {
  schema_version: number;
  ligands: LigandProperties[];
  candidates: Candidate[];
  metric_notes: Record<string, string>;
}
export interface Job {
  id: string;
  request: TaskRequest;
  status: Status;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  error: string | null;
  parent_id: string | null;
}
export interface Health {
  version: string;
  engine: {
    ready: boolean;
    gpu: string | null;
    reason: string | null;
    models?: { standard: boolean; abag: boolean };
    gpu_count?: number;
    resources?: Record<string, boolean>;
  };
  worker_ready: boolean;
  worker_error: string | null;
  queue_wait_reason?: string | null;
  free_disk_gib: number;
  disk_total_gib: number;
  capabilities: {
    prediction: boolean;
    msa: boolean;
    templates: boolean;
    llm: boolean;
  };
}
export interface Artifact {
  name: string;
  size: number;
}
export interface Detail {
  id: string;
  log: { text: string; truncated: boolean };
  artifacts: Artifact[];
}
export const terminal = (status: Status) =>
  ["succeeded", "failed", "cancelled", "interrupted"].includes(status);
