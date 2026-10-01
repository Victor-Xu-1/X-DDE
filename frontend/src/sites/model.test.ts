import { expect, it } from "vitest";
import { eligibleJobs, preset } from "./model";
import type { Job } from "../types";
const ref = {
  asset_id: "asset",
  sha256: "a".repeat(64),
  record: 0,
  conformer: 0,
  version_id: "v1",
};
it("requires the exact aligned version, selection and successful pocket operation", () => {
  const job = {
    id: "j",
    status: "succeeded",
    request: { operation: "pocket_search", protein: ref },
  } as Job;
  expect(eligibleJobs([job], ref)).toHaveLength(1);
  expect(eligibleJobs([job], { ...ref, version_id: "v2" })).toHaveLength(0);
  expect(eligibleJobs([job], { ...ref, record: 1 })).toHaveLength(0);
  expect(eligibleJobs([{ ...job, status: "failed" }], ref)).toHaveLength(0);
});
it("keeps independent guided threshold values within the backend bounds", () => {
  const strict = preset("strict"),
    balanced = preset("balanced"),
    exploratory = preset("exploratory");
  expect(strict.maximum_center_distance).toBeLessThan(
    balanced.maximum_center_distance,
  );
  expect(strict.minimum_jaccard).toBeGreaterThan(balanced.minimum_jaccard);
  expect(exploratory.minimum_mapping_coverage).toBeLessThan(
    balanced.minimum_mapping_coverage,
  );
  strict.maximum_center_distance = 30;
  expect(preset("strict").maximum_center_distance).toBe(5);
});
