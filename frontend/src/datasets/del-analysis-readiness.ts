import type { DELComparison, DELSample } from "./types";

export function targetSampleCapacity(
  samples: DELSample[],
  comparisons: DELComparison[],
) {
  return comparisons.length
    ? Math.min(
        ...comparisons.map(
          (comparison) =>
            samples.filter(
              (sample) =>
                sample.group === comparison.selection &&
                sample.role === "target",
            ).length,
        ),
      )
    : 1;
}

export function validCountAnalysis(
  imported: boolean,
  unit: string,
  support: number,
  samples: DELSample[],
  comparisons: DELComparison[],
) {
  return (
    !(unit === "reported_counts" && !imported) &&
    Number.isInteger(support) &&
    support >= 1 &&
    support <= targetSampleCapacity(samples, comparisons) &&
    (support === 1 || comparisons.length > 0)
  );
}
