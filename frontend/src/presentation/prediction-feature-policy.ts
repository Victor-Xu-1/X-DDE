export type FeatureMode = "none" | "uploaded" | "search";
export interface FeaturePolicy {
  feature_mode: FeatureMode;
  use_template: boolean;
  use_rna_msa: boolean;
  allow_network: boolean;
}

/** A view projection only; native form owners retain parameter/file authority. */
export function featurePolicy(value: Partial<FeaturePolicy>): FeaturePolicy {
  return {
    feature_mode: value.feature_mode ?? "none",
    use_template: value.use_template ?? false,
    use_rna_msa: value.use_rna_msa ?? false,
    allow_network: value.allow_network ?? false,
  };
}

export function selectFeatureMode(
  value: FeaturePolicy,
  mode: FeatureMode,
): FeaturePolicy {
  return mode === "none"
    ? {
        feature_mode: mode,
        use_template: false,
        use_rna_msa: false,
        allow_network: false,
      }
    : { ...value, feature_mode: mode };
}
