import { defaults } from "../form-model";
import type { Prediction } from "../types";
import type { PreparedExample } from "./types";

export function examplePrediction(example: PreparedExample): Prediction {
  if (example.request?.operation === "predict")
    return structuredClone(example.request);
  const molecule = example.objects.jq1?.reference;
  const sequence = example.sequences.protein;
  if (!molecule || !sequence)
    throw new Error("This example has no reviewed prediction inputs.");
  return {
    operation: "predict",
    name: "BRD4–JQ1 · public research example",
    components: [
      {
        kind: "protein",
        value: sequence,
        count: 1,
        chain_ids: ["A"],
        source_sequence: example.objects.protein_sequence?.reference.asset_id,
      },
      {
        kind: "ligand",
        value: "",
        ligand_file: molecule.asset_id,
        count: 1,
        chain_ids: ["B"],
      },
    ],
    parameters: {
      ...defaults,
      samples: 1,
      seed: 101,
      model: "standard",
      feature_mode: "none",
      allow_network: false,
    },
    scientific_inputs: [
      molecule,
      ...(example.objects.protein_sequence
        ? [example.objects.protein_sequence.reference]
        : []),
    ],
  };
}
