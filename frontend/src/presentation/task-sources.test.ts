import { expect, it } from "vitest";
import type { Job } from "../types";
import { harnessCandidateSource, harnessSource } from "./task-sources";
it("binds a report by its declared unique candidate name, never by report ordering or a raw server path", () => {
  const a = "11111111-1111-4111-8111-111111111111",
    b = "22222222-2222-4222-8222-222222222222";
  const ref = { asset_id: b, record: 0, conformer: 0, sha256: "b".repeat(64) };
  const job = {
    request: {
      operation: "harness",
      payload: {
        candidate_names: ["skipped", "BRD4-MZ1"],
        structure_paths: ["asset:" + a, "asset:" + b],
        structure_path: "/srv/private/a.pdb",
      },
      scientific_inputs: [ref],
    },
  } as unknown as Job;
  expect(harnessCandidateSource(job, "BRD4-MZ1")).toBe(ref);
  expect(harnessCandidateSource(job, "skipped")).toBeNull();
  expect(harnessSource(job, "structure_path")).toBeNull();
});
