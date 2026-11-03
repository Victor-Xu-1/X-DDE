import { expect, it } from "vitest";
import { nativePredictionSamples } from "./prediction-presentation";
import type { Job } from "../types";
import type { NativeResult } from "./types";

it("preserves Boltz pLDDT units and does not invent native sample numbers", () => {
  const job = {
    request: { operation: "boltz_predict", options: { seed: 42 } },
  } as Job;
  const result = {
    candidates: [
      {
        id: "structure-017",
        artifact: "exact.cif",
        metrics: [
          {
            name: "complex_plddt",
            value: 0.82,
            unit: "0–1",
            method: "Boltz-2",
          },
        ],
      },
    ],
  } as NativeResult;
  expect(nativePredictionSamples(job, result)).toEqual([
    {
      id: "structure-017",
      artifact: "exact.cif",
      seed: 42,
      sample: null,
      metrics: [{ name: "pLDDT", value: 0.82, unit: "0–1", method: "Boltz-2" }],
    },
  ]);
});

it("takes Mol-1 seed and sample identity from its native result mapping", () => {
  const job = {
    request: { operation: "mol1_predict", options: { seed: 42 } },
  } as Job;
  const result = {
    mol1: {
      samples: [{ candidate_id: "seed-202-rank-4", seed: 202, rank: 4 }],
    },
    candidates: [
      { id: "seed-202-rank-4", artifact: "native.cif", metrics: [] },
    ],
  } as unknown as NativeResult;
  expect(nativePredictionSamples(job, result)[0]).toMatchObject({
    seed: 202,
    sample: 4,
    artifact: "native.cif",
  });
});
