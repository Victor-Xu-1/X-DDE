import type { PredictionSample } from "../presentation/PredictionSamples";
import type { Job } from "../types";
import type { NativeResult } from "./types";

/** Native units remain native; 0–1 Boltz confidence is never relabeled as 0–100. */
export function nativePredictionSamples(
  job: Job,
  result: NativeResult,
): PredictionSample[] {
  const labels: Record<string, string> = {
    confidence_score: "Ranking score",
    "Model ranking score": "Ranking score",
    ptm: "pTM",
    iptm: "ipTM",
    complex_plddt: "pLDDT",
  };
  return result.candidates.map((row) => {
    const source = result.mol1?.samples.find(
      (sample) => sample.candidate_id === row.id,
    );
    return {
      id: row.id,
      artifact: row.artifact,
      seed:
        source?.seed ??
        (job.request?.operation === "boltz_predict" ||
        job.request?.operation === "mol1_predict"
          ? job.request.options.seed
          : null),
      sample: source?.rank ?? null,
      metrics: row.metrics
        .map((metric) => ({
          ...metric,
          name: labels[metric.name] ?? metric.name,
        }))
        .sort((a, b) => {
          const order = ["Ranking score", "pTM", "ipTM", "pLDDT"];
          const rank = (name: string) =>
            order.includes(name) ? order.indexOf(name) : order.length;
          return rank(a.name) - rank(b.name);
        }),
    };
  });
}
