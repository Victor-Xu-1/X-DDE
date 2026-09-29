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
  kind: "protein" | "ligand";
  value: string;
  count: number;
}
export interface Parameters {
  seed: number;
  samples: number;
  steps: number;
  cycles: number;
  dtype: "bf16" | "fp32";
  model?: "standard" | "abag";
}
export interface Prediction {
  name: string;
  components: Component[];
  parameters: Parameters;
  project_id?: string | null;
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
  request: Prediction;
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
  };
  worker_ready: boolean;
  worker_error: string | null;
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
