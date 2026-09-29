export interface Plan {
  id: string;
  digest: string;
  state: string;
  task_id: string | null;
  summary: Record<string, unknown> | null;
  config?: Record<string, unknown>;
}
export interface DesignDraft {
  targetName: string;
  targets: Record<string, string>;
  format: "VHH" | "scFv" | "VHVL";
  binders: Record<string, string>;
  cdr: Record<string, number[]>;
  fixed: Record<string, number[]>;
  budget: "small" | "standard" | "extended";
}
export function campaignConfig(d: DesignDraft): Record<string, unknown> {
  const policies = {
    small: { n_cycles: 1, num_sequences: 2, population_size: 4 },
    standard: { n_cycles: 3, num_sequences: 8, population_size: 20 },
    extended: { n_cycles: 10, num_sequences: 12, population_size: 30 },
  };
  return {
    seed: 42,
    target: { name: d.targetName, chains: d.targets },
    initial_binders: [
      {
        name: "initial-1",
        chains: Object.fromEntries(
          Object.entries(d.binders).map(([chain, sequence], i) => [
            chain,
            {
              sequence,
              chain_type:
                d.format === "VHVL" ? (i === 0 ? "VH" : "VL") : d.format,
              cdr_regions: d.cdr[chain] ?? [],
              fixed_residues: d.fixed[chain] ?? [],
            },
          ]),
        ),
      },
    ],
    design: {
      ...policies[d.budget],
      optimization_metric: "loss",
      enable_quality_check: true,
      router_selection_strategy: "agent",
    },
  };
}
