import { nativeDefaults } from "./generated";
import type { ScientificPayload } from "./types";

export interface Mol1Settings extends ScientificPayload {
  kind: "mol1";
  samples: number;
  cycles: number;
  steps: number;
  additional_seeds: number[];
  dtype: "bf16" | "fp32";
  feature_mode: "none" | "uploaded" | "search";
  allow_network: boolean;
  use_template: boolean;
  use_rna_msa: boolean;
  atom_confidence: boolean;
  enable_tf32: boolean;
  enable_fusion: boolean;
  diffusion_cache_mode: "full" | "shared" | "off";
  attention_chunk: number;
  msa_chunk: number;
  sample_chunk: number;
  msa_pair_as_unpair: boolean;
}
export const mol1Defaults = (): Mol1Settings => ({
  ...nativeDefaults.mol1,
  additional_seeds: [],
});
export function validMol1Settings(value: Mol1Settings) {
  return (
    [
      [value.samples, 1, 8],
      [value.cycles, 1, 50],
      [value.steps, 1, 1000],
      [value.attention_chunk, 1, 4096],
      [value.msa_chunk, 1, 4096],
      [value.sample_chunk, 1, value.samples],
    ].every(
      ([v, min, max]) => Number.isSafeInteger(v) && v >= min && v <= max,
    ) &&
    value.additional_seeds.length <= 7 &&
    value.additional_seeds.every(
      (seed) => Number.isSafeInteger(seed) && seed >= 0 && seed <= 2147483647,
    ) &&
    new Set(value.additional_seeds).size === value.additional_seeds.length &&
    (value.feature_mode !== "search" || value.allow_network) &&
    (value.feature_mode !== "none" ||
      (!value.use_template && !value.use_rna_msa))
  );
}
