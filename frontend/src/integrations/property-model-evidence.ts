import type { NativeMetric } from "./types";

/** Recorded held-out evidence is not a claim of applicability or external validation. */
export function propertyModelEvidence(metrics: NativeMetric[]) {
  const find = (name: string) =>
    metrics.find(
      (metric) =>
        metric.name === name &&
        metric.meaning === "validation" &&
        typeof metric.value === "number" &&
        Number.isFinite(metric.value),
    );
  const r2 = find("Test R²");
  const rmse = find("Test RMSE");
  return {
    r2,
    rmse,
    status:
      r2 && r2.value <= 0
        ? ("insufficient" as const)
        : r2 || rmse
          ? ("reported" as const)
          : ("unassessed" as const),
  };
}
