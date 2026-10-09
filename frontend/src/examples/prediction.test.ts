import { expect, it } from "vitest";
import { examplePrediction } from "./prediction";
import type { PreparedExample } from "./types";

it("uses the reviewed STAT6 request without replacing its source sequence or molecule", () => {
  const example = {
    request: {
      operation: "predict",
      name: "STAT6 · defined-molecule complex prediction",
      components: [
        {
          kind: "protein",
          value: "ACTUAL_TARGET_SEQUENCE",
          source_sequence: "stat6-fasta",
        },
        { kind: "ligand", value: "", ligand_file: "user-warhead-sdf" },
      ],
      parameters: { seed: 20261009 },
      scientific_inputs: [{ asset_id: "user-warhead-sdf" }],
    },
    objects: { jq1: { reference: { asset_id: "archived-ligand" } } },
    sequences: { protein: "OLD_SEQUENCE" },
  } as unknown as PreparedExample;
  const value = examplePrediction(example);
  expect(value).toEqual(example.request);
  expect(value).not.toBe(example.request);
  value.components[0].value = "USER_EDIT";
  expect(example.request).toMatchObject({
    components: [{ value: "ACTUAL_TARGET_SEQUENCE" }, {}],
  });
});
