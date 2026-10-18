export interface SequenceDesignResult {
  original_sequence: string;
  selected_residues: {
    identity: string;
    amino_acid: string;
    minimum_ligand_distance_A: number | null;
  }[];
  native_ligand_scored_residues: number;
  native_ligand_score_cutoff_A: number;
  sample_count: number;
  unique_sequence_count: number;
  wild_type_samples: number;
  candidates: {
    candidate_id: string;
    first_identical_sample: string;
    mutations: { residue: string; original: string; designed: string }[];
    overall_likelihood: number;
    ligand_likelihood: number | null;
    sequence_recovery: number;
  }[];
  scope: "conditional_sequence_likelihood_not_binding_probability";
}
