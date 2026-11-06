/** Display-only annotations for one exact native prediction. No scientific atom edits. */
export interface NativeConfidence {
  protocol: "opendde-cif-row-v1" | "boltz-2.2.1-cif-row-v1";
  structure_sha256: string;
  confidence_sha256: string;
  atom_plddt: number[];
  atom_to_token_idx: number[];
  token_asym_id: number[];
  native_atom_identity?: [string, string, number, string][];
}
export interface ConfidenceBinding extends NativeConfidence {
  job: string;
  candidate: string;
  url: string;
}
export interface ConfidenceToken {
  index: number;
  chain: string;
  residue: string;
  label: string;
}
export interface ConfidenceInspection {
  key: string;
  residueScores: Record<string, number>;
  tokens: ConfidenceToken[];
}
export const confidenceIdentity = (binding: ConfidenceBinding) =>
  JSON.stringify([
    binding.protocol,
    binding.job,
    binding.candidate,
    binding.url,
    binding.structure_sha256,
    binding.confidence_sha256,
  ]);
export const confidenceColors = ["#ff7d45", "#ffdb13", "#65cbf3", "#0053d6"];
export const confidenceColor = (score: number) =>
  confidenceColors[score > 90 ? 3 : score >= 70 ? 2 : score >= 50 ? 1 : 0];
